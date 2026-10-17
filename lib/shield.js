/**
 * Anti-scraper shield (STATELESS — aman di Vercel/serverless)
 * Challenge & token ditandatangani HMAC, tanpa memory store.
 *
 * Env:
 *   SHIELD_ENABLED=1
 *   SHIELD_RATE_MAX=60
 *   SHIELD_RATE_WINDOW_MS=60000
 *   SHIELD_TOKEN_TTL_MS=1800000
 *   SHIELD_SECRET=wajib-diisi-string-panjang-random
 */
const crypto = require('crypto');

const ENABLED = String(process.env.SHIELD_ENABLED || '1') !== '0';
const RATE_MAX = Math.max(10, parseInt(process.env.SHIELD_RATE_MAX || '60', 10));
const RATE_WINDOW = Math.max(5000, parseInt(process.env.SHIELD_RATE_WINDOW_MS || '60000', 10));
const TOKEN_TTL = Math.max(120000, parseInt(process.env.SHIELD_TOKEN_TTL_MS || String(30 * 60 * 1000), 10));
const SECRET = process.env.SHIELD_SECRET || 'nontonkuy-dev-secret-ganti-di-produksi';

// Rate limit: best-effort in-memory (per instance). Tidak memblokir captcha.
const rateBuckets = new Map();

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64').toString('utf8');
}

function sign(payload) {
  return b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
}

function makeToken(kind, data, ttlMs) {
  const body = {
    k: kind,
    ...data,
    exp: Date.now() + ttlMs
  };
  const payload = b64url(JSON.stringify(body));
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function readToken(token, kind) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  if (sign(payload) !== sig) return null;
  try {
    const body = JSON.parse(fromB64url(payload));
    if (body.k !== kind) return null;
    if (!body.exp || Date.now() > body.exp) return null;
    return body;
  } catch (_) {
    return null;
  }
}

function rateLimit(ip) {
  const now = Date.now();
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (v.reset < now) rateBuckets.delete(k);
    }
  }
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

function createChallenge() {
  const a = 3 + Math.floor(Math.random() * 9); // 3-11
  const b = 2 + Math.floor(Math.random() * 8); // 2-9
  const useMul = Math.random() < 0.25;
  const result = useMul ? a * b : a + b;
  const label = useMul ? `${a} x ${b}` : `${a} + ${b}`;
  // id is signed: contains answer hash, not plain answer
  const answerHash = crypto.createHmac('sha256', SECRET).update(String(result)).digest('hex').slice(0, 16);
  const id = makeToken('chal', { ah: answerHash }, 5 * 60 * 1000);
  return {
    id,
    question: `Berapa ${label}?`,
    expiresIn: 300
  };
}

function verifyChallenge(id, answer) {
  const body = readToken(id, 'chal');
  if (!body || !body.ah) return false;
  const answerHash = crypto
    .createHmac('sha256', SECRET)
    .update(String(Number(answer)))
    .digest('hex')
    .slice(0, 16);
  return answerHash === body.ah;
}

function issueToken() {
  const token = makeToken('sess', { v: 1 }, TOKEN_TTL);
  return { token, expiresIn: Math.floor(TOKEN_TTL / 1000) };
}

function isValidToken(token) {
  return !!readToken(token, 'sess');
}

function apiShield(req, res, next) {
  if (!ENABLED) return next();

  const path = req.path || '';
  if (path === '/api/captcha' || path === '/api/captcha/verify') return next();
  if (!path.startsWith('/api')) return next();

  const ip = clientIp(req);
  const rate = rateLimit(ip);
  res.set('X-RateLimit-Limit', String(RATE_MAX));
  res.set('X-RateLimit-Remaining', String(rate.remaining));
  if (!rate.ok) {
    return res.status(429).json({
      success: false,
      error: 'Terlalu banyak permintaan. Tunggu sebentar.',
      code: 'RATE_LIMIT'
    });
  }

  const token =
    req.headers['x-nk-token'] ||
    req.headers['x-access-token'] ||
    (req.query && req.query.token);

  if (!isValidToken(token)) {
    return res.status(403).json({
      success: false,
      error: 'Sesi tidak valid. Selesaikan verifikasi dulu.',
      code: 'CAPTCHA_REQUIRED'
    });
  }

  next();
}

function registerRoutes(app) {
  app.get('/api/captcha', (req, res) => {
    try {
      if (!ENABLED) {
        const t = issueToken();
        return res.json({ success: true, disabled: true, ...t });
      }
      const challenge = createChallenge();
      res.json({ success: true, challenge });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/captcha/verify', (req, res) => {
    try {
      if (!ENABLED) {
        const t = issueToken();
        return res.json({ success: true, disabled: true, ...t });
      }
      const { id, answer } = req.body || {};
      if (!id || answer === undefined || answer === null || String(answer).trim() === '') {
        return res.status(400).json({ success: false, error: 'Jawaban captcha wajib' });
      }
      // normalize: allow "12", 12, " 12 "
      const num = Number(String(answer).trim().replace(/,/g, ''));
      if (!Number.isFinite(num)) {
        return res.status(400).json({ success: false, error: 'Jawaban harus angka' });
      }
      if (!verifyChallenge(String(id), num)) {
        return res.status(403).json({
          success: false,
          error: 'Jawaban salah atau soal kedaluwarsa. Coba soal baru.',
          code: 'CAPTCHA_FAIL'
        });
      }
      const t = issueToken();
      res.json({ success: true, ...t });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });
}

module.exports = {
  apiShield,
  registerRoutes,
  ENABLED,
  // test helpers
  _createChallenge: createChallenge,
  _verifyChallenge: verifyChallenge,
  _issueToken: issueToken,
  _isValidToken: isValidToken
};
