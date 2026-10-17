/**
 * NontonKuy Anti-Scraper Shield (multi-layer, stateless-friendly)
 *
 * Layers (sequential):
 *  1) Turnstile (optional if TURNSTILE_SECRET set) OR math fallback
 *  2) Browser fingerprint score (client)
 *  3) Proof-of-Work
 *  4) Behavioral timing
 *
 * Env:
 *  SHIELD_ENABLED=1
 *  SHIELD_SECRET=random-long-string
 *  SHIELD_TOKEN_TTL_MS=180000          (3 min default)
 *  SHIELD_RATE_MAX=40
 *  SHIELD_RATE_WINDOW_MS=60000
 *  SHIELD_POW_DIFFICULTY=4            (hex leading zeros)
 *  TURNSTILE_SECRET=...               (optional Cloudflare)
 *  TURNSTILE_SITE_KEY=...             (public, for client)
 */
const crypto = require('crypto');
const https = require('https');

const ENABLED = String(process.env.SHIELD_ENABLED || '1') !== '0';
const SECRET = process.env.SHIELD_SECRET || 'nontonkuy-dev-secret-change-me';
const TOKEN_TTL = Math.max(60_000, parseInt(process.env.SHIELD_TOKEN_TTL_MS || '180000', 10));
const RATE_MAX = Math.max(10, parseInt(process.env.SHIELD_RATE_MAX || '40', 10));
const RATE_WINDOW = Math.max(5000, parseInt(process.env.SHIELD_RATE_WINDOW_MS || '60000', 10));
const POW_DIFF = Math.min(8, Math.max(3, parseInt(process.env.SHIELD_POW_DIFFICULTY || '4', 10)));
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || '';
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '';

const rateBuckets = new Map();
const suspicious = new Map(); // ip -> { score, banUntil }
const usedNonces = new Map(); // nonce -> exp

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
  const body = { k: kind, ...data, exp: Date.now() + ttlMs };
  const payload = b64url(JSON.stringify(body));
  return `${payload}.${sign(payload)}`;
}

function readToken(token, kind) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || sign(payload) !== sig) return null;
  try {
    const body = JSON.parse(fromB64url(payload));
    if (body.k !== kind) return null;
    if (!body.exp || Date.now() > body.exp) return null;
    return body;
  } catch (_) {
    return null;
  }
}

function hashUA(ua) {
  return crypto.createHmac('sha256', SECRET).update(String(ua || '')).digest('hex').slice(0, 16);
}

function hashIP(ip) {
  return crypto.createHmac('sha256', SECRET).update(String(ip || '')).digest('hex').slice(0, 16);
}

function getSuspicion(ip) {
  const now = Date.now();
  let row = suspicious.get(ip);
  if (!row) {
    row = { score: 0, banUntil: 0 };
    suspicious.set(ip, row);
  }
  if (row.banUntil && row.banUntil < now) {
    row.banUntil = 0;
    row.score = Math.max(0, row.score - 2);
  }
  return row;
}

function bumpSuspicion(ip, amount, banMs) {
  const row = getSuspicion(ip);
  row.score += amount;
  if (banMs && row.score >= 9) {
    row.banUntil = Date.now() + banMs;
  }
  return row;
}

function effectivePowDifficulty(ip) {
  const row = getSuspicion(ip);
  if (row.score >= 8) return Math.min(8, POW_DIFF + 3);
  if (row.score >= 5) return Math.min(7, POW_DIFF + 2);
  if (row.score >= 3) return Math.min(6, POW_DIFF + 1);
  return POW_DIFF;
}

function rateLimit(ip) {
  const now = Date.now();
  if (rateBuckets.size > 8000) {
    for (const [k, v] of rateBuckets) if (v.reset < now) rateBuckets.delete(k);
  }
  let b = rateBuckets.get(ip);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + RATE_WINDOW };
    rateBuckets.set(ip, b);
  }
  b.count += 1;
  const row = getSuspicion(ip);
  const max = row.score >= 5 ? Math.max(8, Math.floor(RATE_MAX / 2)) : RATE_MAX;
  return { ok: b.count <= max, remaining: Math.max(0, max - b.count), reset: b.reset };
}

function rememberNonce(nonce, ttlMs) {
  const now = Date.now();
  if (usedNonces.size > 20000) {
    for (const [k, exp] of usedNonces) if (exp < now) usedNonces.delete(k);
  }
  if (usedNonces.has(nonce)) return false;
  usedNonces.set(nonce, now + ttlMs);
  return true;
}

function issuePow(ip) {
  const difficulty = effectivePowDifficulty(ip);
  const salt = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 120_000;
  const ticket = makeToken('pow', { salt, difficulty, expPow: expiresAt }, 120_000);
  return { salt, difficulty, expiresAt, ticket };
}

function verifyPow(ticket, nonce) {
  const body = readToken(ticket, 'pow');
  if (!body) return false;
  if (body.expPow && Date.now() > body.expPow) return false;
  const hex = crypto.createHash('sha256').update(String(body.salt) + String(nonce)).digest('hex');
  return hex.startsWith('0'.repeat(Number(body.difficulty) || POW_DIFF));
}

function verifyTurnstile(token, ip) {
  return new Promise((resolve) => {
    if (!TURNSTILE_SECRET) return resolve({ ok: true, skipped: true });
    if (!token) return resolve({ ok: false, error: 'Turnstile token kosong' });
    const post = new URLSearchParams({
      secret: TURNSTILE_SECRET,
      response: token,
      remoteip: ip
    }).toString();
    const req = https.request(
      {
        hostname: 'challenges.cloudflare.com',
        path: '/turnstile/v0/siteverify',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(post)
        },
        timeout: 8000
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            resolve({ ok: !!data.success, data });
          } catch (_) {
            resolve({ ok: false, error: 'Turnstile parse error' });
          }
        });
      }
    );
    req.on('error', () => resolve({ ok: false, error: 'Turnstile network error' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Turnstile timeout' });
    });
    req.write(post);
    req.end();
  });
}

function issueSession(req, fp) {
  const ip = clientIp(req);
  const ua = req.headers['user-agent'] || '';
  const row = getSuspicion(ip);
  const ttl = row.score >= 5 ? Math.min(TOKEN_TTL, 120_000) : TOKEN_TTL;
  const nonce = crypto.randomBytes(8).toString('hex');
  const token = makeToken(
    'sess',
    {
      v: 2,
      ip: hashIP(ip),
      ua: hashUA(ua),
      fp: String(fp || '').slice(0, 64),
      tier: row.score >= 5 ? 'hard' : row.score >= 3 ? 'soft' : 'clean',
      n: nonce
    },
    ttl
  );
  return { token, expiresIn: Math.floor(ttl / 1000), tier: row.score >= 5 ? 'hard' : 'clean' };
}

function isValidSession(req, token) {
  const body = readToken(token, 'sess');
  if (!body) return { ok: false, reason: 'invalid' };
  const ip = clientIp(req);
  const ua = req.headers['user-agent'] || '';
  const fp = req.headers['x-fp'] || req.headers['x-fingerprint'] || '';
  if (body.ip && body.ip !== hashIP(ip)) {
    // soft fail on IP change for mobile — bump score instead of hard fail once
    bumpSuspicion(ip, 1);
    if (getSuspicion(ip).score >= 4) return { ok: false, reason: 'ip_mismatch' };
  }
  if (body.ua && body.ua !== hashUA(ua)) return { ok: false, reason: 'ua_mismatch' };
  if (body.fp && fp && body.fp !== String(fp).slice(0, 64)) return { ok: false, reason: 'fp_mismatch' };
  return { ok: true, body };
}

function looksLikeBot(req) {
  const ua = String(req.headers['user-agent'] || '');
  if (!ua || ua.length < 12) return true;
  return [/curl\//i, /wget\//i, /python-requests/i, /scrapy/i, /httpclient/i, /go-http-client/i, /puppeteer/i, /playwright/i, /headless/i].some((re) =>
    re.test(ua)
  );
}

function apiShield(req, res, next) {
  if (!ENABLED) return next();
  const path = req.path || '';

  // public challenge endpoints
  if (
    path === '/api/captcha' ||
    path === '/api/captcha/verify' ||
    path === '/api/challenge' ||
    path === '/api/challenge/start' ||
    path === '/api/challenge/complete' ||
    path === '/api/shield/config'
  ) {
    return next();
  }

  // honeypots
  if (
    path.startsWith('/api/v1/') ||
    path === '/api/anime-list' ||
    path === '/api/internal/dump' ||
    path === '/api/admin/export' ||
    path === '/api/graphql'
  ) {
    const ip = clientIp(req);
    bumpSuspicion(ip, 4, 30 * 60 * 1000);
    return res.status(404).json({ success: false, error: 'Not found' });
  }

  if (!path.startsWith('/api')) return next();

  const ip = clientIp(req);
  const row = getSuspicion(ip);
  if (row.banUntil && Date.now() < row.banUntil) {
    return res.status(429).json({
      success: false,
      error: 'Akses dibatasi sementara. Coba lagi nanti.',
      code: 'TEMP_BAN',
      retryAfter: Math.ceil((row.banUntil - Date.now()) / 1000)
    });
  }

  const rate = rateLimit(ip);
  res.set('X-RateLimit-Limit', String(RATE_MAX));
  res.set('X-RateLimit-Remaining', String(rate.remaining));
  if (!rate.ok) {
    bumpSuspicion(ip, 2, 15 * 60 * 1000);
    return res.status(429).json({ success: false, error: 'Terlalu banyak permintaan', code: 'RATE_LIMIT' });
  }

  if (looksLikeBot(req)) bumpSuspicion(ip, 2);

  const token = req.headers['x-nk-token'] || req.headers['x-access-token'] || (req.query && req.query.token);
  const check = isValidSession(req, token);
  if (!check.ok) {
    return res.status(403).json({
      success: false,
      error: 'Sesi tidak valid. Selesaikan verifikasi dulu.',
      code: 'CAPTCHA_REQUIRED',
      reason: check.reason
    });
  }

  // optional request nonce to prevent replay of identical signed calls
  const reqNonce = req.headers['x-nk-nonce'];
  if (reqNonce) {
    if (!rememberNonce(String(reqNonce), TOKEN_TTL)) {
      bumpSuspicion(ip, 2);
      return res.status(403).json({ success: false, error: 'Nonce ulang', code: 'NONCE_REPLAY' });
    }
  }

  next();
}

function registerRoutes(app) {
  // config for client
  app.get('/api/shield/config', (req, res) => {
    res.json({
      success: true,
      enabled: ENABLED,
      turnstileSiteKey: TURNSTILE_SITE_KEY || null,
      powDefault: POW_DIFF,
      tokenTtlSec: Math.floor(TOKEN_TTL / 1000)
    });
  });

  // start challenge: issue PoW ticket
  app.get('/api/challenge/start', (req, res) => {
    if (!ENABLED) {
      const t = issueSession(req, '');
      return res.json({ success: true, disabled: true, ...t });
    }
    const ip = clientIp(req);
    const row = getSuspicion(ip);
    if (row.banUntil && Date.now() < row.banUntil) {
      return res.status(429).json({ success: false, code: 'TEMP_BAN', error: 'Dibatasi sementara' });
    }
    const pow = issuePow(ip);
    res.json({
      success: true,
      pow,
      turnstileSiteKey: TURNSTILE_SITE_KEY || null,
      requireTurnstile: !!TURNSTILE_SECRET,
      minWaitMs: row.score >= 3 ? 2500 : 1200
    });
  });

  // complete multi-layer challenge
  app.post('/api/challenge/complete', async (req, res) => {
    try {
      if (!ENABLED) {
        const t = issueSession(req, '');
        return res.json({ success: true, disabled: true, ...t });
      }
      const ip = clientIp(req);
      const body = req.body || {};
      const {
        turnstileToken,
        powTicket,
        powNonce,
        fingerprint,
        behavior,
        // legacy math captcha fields still accepted as weak layer if no turnstile
        mathId,
        mathAnswer
      } = body;

      // Layer: behavior timing
      const waited = Number(behavior && behavior.waitedMs) || 0;
      const minWait = getSuspicion(ip).score >= 3 ? 2000 : 1000;
      if (waited < minWait) {
        bumpSuspicion(ip, 1);
        return res.status(403).json({
          success: false,
          code: 'BEHAVIOR_FAIL',
          error: 'Selesaikan tantangan dengan sabar (tunggu sebentar).'
        });
      }

      // Layer: Turnstile (if configured)
      if (TURNSTILE_SECRET) {
        const ts = await verifyTurnstile(turnstileToken, ip);
        if (!ts.ok) {
          bumpSuspicion(ip, 2);
          return res.status(403).json({ success: false, code: 'TURNSTILE_FAIL', error: 'Verifikasi Turnstile gagal' });
        }
      }

      // Layer: PoW
      if (!powTicket || powNonce === undefined || powNonce === null) {
        return res.status(400).json({ success: false, error: 'Proof-of-Work wajib' });
      }
      if (!verifyPow(String(powTicket), String(powNonce))) {
        bumpSuspicion(ip, 2);
        return res.status(403).json({ success: false, code: 'POW_FAIL', error: 'Proof-of-Work tidak valid' });
      }

      // Layer: fingerprint presence
      const fp = String(fingerprint || '').slice(0, 64);
      if (!fp || fp.length < 8) {
        bumpSuspicion(ip, 1);
        return res.status(403).json({ success: false, code: 'FP_FAIL', error: 'Fingerprint tidak valid' });
      }

      // Bot UA after all layers still suspicious
      if (looksLikeBot(req)) bumpSuspicion(ip, 3, 20 * 60 * 1000);

      const session = issueSession(req, fp);
      res.json({ success: true, ...session });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // backward-compatible captcha endpoints (redirect flow to challenge)
  app.get('/api/captcha', (req, res) => {
    if (!ENABLED) {
      const t = issueSession(req, '');
      return res.json({ success: true, disabled: true, ...t });
    }
    const pow = issuePow(clientIp(req));
    // simple math as optional extra when no turnstile
    const a = 3 + Math.floor(Math.random() * 9);
    const b = 2 + Math.floor(Math.random() * 8);
    const result = a + b;
    const ah = crypto.createHmac('sha256', SECRET).update(String(result)).digest('hex').slice(0, 16);
    const id = makeToken('chal', { ah }, 5 * 60 * 1000);
    res.json({
      success: true,
      challenge: { id, question: `Berapa ${a} + ${b}?`, expiresIn: 300 },
      pow,
      turnstileSiteKey: TURNSTILE_SITE_KEY || null,
      requireTurnstile: !!TURNSTILE_SECRET
    });
  });

  app.post('/api/captcha/verify', async (req, res) => {
    try {
      if (!ENABLED) {
        const t = issueSession(req, '');
        return res.json({ success: true, disabled: true, ...t });
      }
      const ip = clientIp(req);
      const { id, answer, powTicket, powNonce, fingerprint, turnstileToken, waitedMs } = req.body || {};

      if (Number(waitedMs || 0) < 800) {
        bumpSuspicion(ip, 1);
      }

      if (TURNSTILE_SECRET) {
        const ts = await verifyTurnstile(turnstileToken, ip);
        if (!ts.ok) {
          return res.status(403).json({ success: false, code: 'TURNSTILE_FAIL', error: 'Turnstile gagal' });
        }
      }

      // math (always verify if id provided)
      if (id) {
        const chal = readToken(String(id), 'chal');
        if (!chal) {
          return res.status(403).json({ success: false, error: 'Soal kedaluwarsa', code: 'CAPTCHA_FAIL' });
        }
        const num = Number(String(answer).trim());
        const ah = crypto.createHmac('sha256', SECRET).update(String(num)).digest('hex').slice(0, 16);
        if (ah !== chal.ah) {
          bumpSuspicion(ip, 1);
          return res.status(403).json({ success: false, error: 'Jawaban salah', code: 'CAPTCHA_FAIL' });
        }
      }

      if (powTicket) {
        if (!verifyPow(String(powTicket), String(powNonce))) {
          bumpSuspicion(ip, 2);
          return res.status(403).json({ success: false, code: 'POW_FAIL', error: 'PoW gagal' });
        }
      } else if (!TURNSTILE_SECRET) {
        // if no turnstile and no pow, require at least math
        if (!id) return res.status(400).json({ success: false, error: 'Challenge tidak lengkap' });
      }

      const fp = String(fingerprint || 'legacy').slice(0, 64);
      const session = issueSession(req, fp);
      res.json({ success: true, ...session });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });
}

module.exports = {
  apiShield,
  registerRoutes,
  ENABLED
};
