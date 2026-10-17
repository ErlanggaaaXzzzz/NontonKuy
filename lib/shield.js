/**
 * Anti-scraper shield: rate limit + math captcha + session token
 * Env:
 *   SHIELD_ENABLED=1 (default on)
 *   SHIELD_RATE_MAX=40          requests / window per IP for /api
 *   SHIELD_RATE_WINDOW_MS=60000
 *   SHIELD_TOKEN_TTL_MS=1800000 session token lifetime (30m)
 *   SHIELD_SECRET=random-string  optional signing secret
 */
const crypto = require('crypto');

const ENABLED = String(process.env.SHIELD_ENABLED || '1') !== '0';
const RATE_MAX = Math.max(5, parseInt(process.env.SHIELD_RATE_MAX || '40', 10));
const RATE_WINDOW = Math.max(5000, parseInt(process.env.SHIELD_RATE_WINDOW_MS || '60000', 10));
const TOKEN_TTL = Math.max(60000, parseInt(process.env.SHIELD_TOKEN_TTL_MS || String(30 * 60 * 1000), 10));
const SECRET = process.env.SHIELD_SECRET || crypto.randomBytes(16).toString('hex');

const rateBuckets = new Map();
const challengeStore = new Map(); // id -> { answerHash, exp }
const tokenStore = new Map(); // token -> exp

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function pruneMap(map, now) {
  if (map.size < 2000) return;
  for (const [k, v] of map) {
    const exp = typeof v === 'object' && v && v.exp ? v.exp : v;
    if (exp < now) map.delete(k);
  }
}

function rateLimit(ip) {
  const now = Date.now();
  pruneMap(rateBuckets, now);
  let b = rateBuckets.get(ip);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + RATE_WINDOW };
    rateBuckets.set(ip, b);
  }
  b.count += 1;
  return {
    ok: b.count <= RATE_MAX,
    remaining: Math.max(0, RATE_MAX - b.count),
    reset: b.reset
  };
}

function hashAnswer(id, answer) {
  return crypto.createHmac('sha256', SECRET).update(`${id}:${String(answer).trim()}`).digest('hex');
}

function createChallenge() {
  const a = 2 + Math.floor(Math.random() * 12);
  const b = 2 + Math.floor(Math.random() * 12);
  const ops = [
    { op: '+', result: a + b, label: `${a} + ${b}` },
    { op: '×', result: a * b, label: `${a} × ${b}` }
  ];
  // prefer addition more often (easier UX)
  const pick = Math.random() < 0.7 ? ops[0] : ops[1];
  const id = crypto.randomBytes(12).toString('hex');
  const exp = Date.now() + 5 * 60 * 1000;
  challengeStore.set(id, { answerHash: hashAnswer(id, pick.result), exp });
  pruneMap(challengeStore, Date.now());
  return {
    id,
    question: `Berapa hasil dari ${pick.label} ?`,
    expiresIn: 300
  };
}

function verifyChallenge(id, answer) {
  const row = challengeStore.get(id);
  if (!row) return false;
  challengeStore.delete(id);
  if (Date.now() > row.exp) return false;
  return hashAnswer(id, answer) === row.answerHash;
}

function issueToken() {
  const token = crypto.randomBytes(24).toString('hex');
  const exp = Date.now() + TOKEN_TTL;
  tokenStore.set(token, exp);
  pruneMap(tokenStore, Date.now());
  return { token, expiresIn: Math.floor(TOKEN_TTL / 1000) };
}

function isValidToken(token) {
  if (!token) return false;
  const exp = tokenStore.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    tokenStore.delete(token);
    return false;
  }
  return true;
}

function looksLikeBot(req) {
  const ua = String(req.headers['user-agent'] || '');
  if (!ua || ua.length < 12) return true;
  const bad = [/curl\//i, /wget\//i, /python-requests/i, /scrapy/i, /httpclient/i, /go-http-client/i, /libwww/i, /node-fetch/i, /axios\//i];
  // only flag obvious CLI bots; browsers ok
  if (bad.some((re) => re.test(ua))) return true;
  return false;
}

/** Middleware: protect /api/* except captcha routes */
function apiShield(req, res, next) {
  if (!ENABLED) return next();

  const path = req.path || '';
  // public captcha endpoints
  if (path === '/api/captcha' || path === '/api/captcha/verify') return next();
  // static not under /api
  if (!path.startsWith('/api/')) return next();

  const ip = clientIp(req);
  const rate = rateLimit(ip);
  res.set('X-RateLimit-Limit', String(RATE_MAX));
  res.set('X-RateLimit-Remaining', String(rate.remaining));
  if (!rate.ok) {
    return res.status(429).json({
      success: false,
      error: 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.',
      code: 'RATE_LIMIT'
    });
  }

  const token =
    req.headers['x-nk-token'] ||
    req.headers['x-access-token'] ||
    req.query.token;

  if (!isValidToken(token)) {
    return res.status(403).json({
      success: false,
      error: 'Sesi tidak valid. Selesaikan verifikasi dulu.',
      code: 'CAPTCHA_REQUIRED'
    });
  }

  // soft bot signal — still require valid token (already checked)
  if (looksLikeBot(req)) {
    res.set('X-Bot-Hint', '1');
  }

  next();
}

function registerRoutes(app) {
  app.get('/api/captcha', (req, res) => {
    if (!ENABLED) {
      const t = issueToken();
      return res.json({ success: true, disabled: true, ...t });
    }
    const ip = clientIp(req);
    const rate = rateLimit(ip);
    if (!rate.ok) {
      return res.status(429).json({ success: false, error: 'Terlalu banyak permintaan captcha' });
    }
    const challenge = createChallenge();
    res.json({ success: true, challenge });
  });

  app.post('/api/captcha/verify', expressJsonSafe, (req, res) => {
    if (!ENABLED) {
      const t = issueToken();
      return res.json({ success: true, disabled: true, ...t });
    }
    const { id, answer } = req.body || {};
    if (!id || answer === undefined || answer === null || answer === '') {
      return res.status(400).json({ success: false, error: 'Jawaban captcha wajib' });
    }
    if (!verifyChallenge(String(id), answer)) {
      return res.status(403).json({ success: false, error: 'Jawaban salah atau kedaluwarsa', code: 'CAPTCHA_FAIL' });
    }
    const t = issueToken();
    res.json({ success: true, ...t });
  });
}

function expressJsonSafe(req, res, next) {
  // body may already be parsed
  next();
}

module.exports = {
  apiShield,
  registerRoutes,
  ENABLED
};
