if (typeof process.loadEnvFile === 'function') {
    try {
        process.loadEnvFile();
    } catch (e) {
    }
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const axios = require('axios');


const imageHits = new Map();
function imageRateLimit(req, res, next) {
    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    const now = Date.now();
    const recent = (imageHits.get(ip) || []).filter((t) => now - t < 60000);
    if (recent.length >= 400) return res.status(429).end();
    recent.push(now);
    imageHits.set(ip, recent);
    if (imageHits.size > 5000) imageHits.clear();
    next();
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Proxy gambar dipasang SEBELUM shield: tag <img> tidak bisa kirim token,
// dan tiap thumbnail tidak boleh menghabiskan jatah rate-limit API.
app.get('/api/img', imageRateLimit, (req, res) => imageProxy(req, res));

const shield = require('./lib/shield');
shield.registerRoutes(app);
app.use(shield.apiShield);

const hentaimama = require('./lib/hentaimama');
const xanimu = require('./lib/xanimu');
const otakudesu = require('./lib/otakudesu');
const anichin = require('./lib/anichin');
const AniListScraper = require('./lib/anilist');
const YouTubeScraper = require('./lib/youtube');
const ZanixScraper = require('./lib/zanix');
const OploverzScraper = require('./lib/oploverz');
const KomikcastScraper = require('./lib/komikcast');
const NontonimeScraper = require('./lib/nontonime');
const RuangkomikScraper = require('./lib/ruangkomik');

const { normalizeImages } = require('./lib/imgutil');

const parsePage = (value) => parseInt(value, 10) || 1;


const apiCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;

function cacheKey(req) {
    return req.originalUrl || req.url;
}

function getCached(key) {
    const hit = apiCache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expires) {
        apiCache.delete(key);
        return null;
    }
    return hit.data;
}

function setCache(key, data) {
    if (apiCache.size >= CACHE_MAX) {
        const first = apiCache.keys().next().value;
        apiCache.delete(first);
    }
    apiCache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

const respondWithCached = (task) => async (req, res) => {
    const key = cacheKey(req);
    const skip = req.query && String(req.query.nocache || '') === '1';
    if (!skip) {
        const hit = getCached(key);
        if (hit) {
            res.set('X-Cache', 'HIT');
            return res.json(hit);
        }
    }
    try {
        const data = normalizeImages(await task(req));
        if (!skip) setCache(key, data);
        res.set('X-Cache', 'MISS');
        res.json(data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

const respondWith = respondWithCached;

const rule34Route = (modulePath) => respondWith(async (req) => {
    const Scraper = require(modulePath);
    const scraper = new Scraper();
    const { action, query, page } = req.query;
    switch (action) {
        case 'search': return scraper.search(query, parsePage(page), 20);
        case 'popular': return scraper.popular(parsePage(page), 20);
        case 'detail': return scraper.detail(query || req.query.url);
        default: return scraper.popular(1, 20);
    }
});

const isAllowedHost = (scraper, rawUrl) => {
    const allowed = [scraper.baseUrl, scraper.epBase].filter(Boolean).map((base) => new URL(base).hostname);
    const target = new URL(rawUrl);
    return (target.protocol === 'https:' || target.protocol === 'http:') && allowed.some((host) => target.hostname === host || target.hostname.endsWith('.' + host));
};

const animeRoute = (Scraper) => respondWith(async (req) => {
    const scraper = new Scraper();
    const { action, query, page, url } = req.query;
    switch (action) {
        case 'episode':
            if (!url || !isAllowedHost(scraper, String(url))) throw new Error('URL episode tidak valid');
            return scraper.episode(String(url));
        case 'search': return scraper.search(query, parsePage(page));
        case 'detail': return scraper.detail(query);
        case 'ongoing': return scraper.ongoing(parsePage(page));
        case 'schedule':
            if (typeof scraper.schedule === 'function') return scraper.schedule();
            return scraper.home(1);
        default: return scraper.home(parsePage(page));
    }
});

app.get('/api/hentaimama.js', (req, res) => hentaimama(req, res));
app.get('/api/rule34video.js', rule34Route('./lib/rule34video'));
app.get('/api/rule34video_alt.js', rule34Route('./lib/rule34video_alt'));
app.get('/api/xanimu.js', (req, res) => xanimu.handler(req, res));
app.get('/api/otakudesu.js', animeRoute(otakudesu));
app.get('/api/anichin.js', animeRoute(anichin));
app.get('/api/anilist.js', animeRoute(AniListScraper));
app.get('/api/youtube.js', animeRoute(YouTubeScraper));
app.get('/api/nontonime.js', respondWith(async (req) => {
    const scraper = new NontonimeScraper();
    const { action, query, page, url } = req.query;
    switch (action) {
        case 'episode':
            if (!url) throw new Error('URL episode tidak valid');
            return scraper.episode(String(url));
        case 'search': return scraper.search(query, parsePage(page));
        case 'detail': return scraper.detail(query);
        case 'ongoing': return scraper.ongoing(parsePage(page));
        default: return scraper.home(parsePage(page));
    }
}));
app.get('/api/ruangkomik.js', respondWith(async (req) => {
    const scraper = new RuangkomikScraper();
    const { action, query, page, url } = req.query;
    switch (action) {
        case 'episode':
            if (!url) throw new Error('Chapter tidak valid');
            return scraper.episode(String(url));
        case 'search': return scraper.search(query, parsePage(page));
        case 'detail': return scraper.detail(query);
        case 'ongoing': return scraper.ongoing(parsePage(page));
        default: return scraper.home(parsePage(page));
    }
}));
app.get('/api/komikcast.js', respondWith(async (req) => {
    const scraper = new KomikcastScraper();
    const { action, query, page, url } = req.query;
    switch (action) {
        case 'episode':
            if (!url) throw new Error('Chapter tidak valid');
            return scraper.episode(String(url));
        case 'search': return scraper.search(query, parsePage(page));
        case 'detail': return scraper.detail(query);
        case 'ongoing': return scraper.ongoing(parsePage(page));
        default: return scraper.home(parsePage(page));
    }
}));
app.get('/api/oploverz.js', respondWith(async (req) => {
    const scraper = new OploverzScraper();
    const { action, query, page, url } = req.query;
    switch (action) {
        case 'episode':
            if (!url) throw new Error('URL episode tidak valid');
            return scraper.episode(String(url));
        case 'search': return scraper.search(query, parsePage(page));
        case 'detail': return scraper.detail(query);
        case 'ongoing': return scraper.ongoing(parsePage(page));
        default: return scraper.home(parsePage(page));
    }
}));
app.get('/api/zanix.js', respondWith(async (req) => {
    const scraper = new ZanixScraper();
    const { action, query, page, url } = req.query;
    switch (action) {
        case 'episode':
            if (!url) throw new Error('URL episode tidak valid');
            return scraper.episode(String(url));
        case 'search': return scraper.search(query, parsePage(page));
        case 'detail': return scraper.detail(query);
        case 'ongoing': return scraper.ongoing(parsePage(page));
        default: return scraper.home(parsePage(page));
    }
}));

const isPrivateAddress = (address) => {
    if (net.isIPv4(address)) {
        const [a, b] = address.split('.').map(Number);
        return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    }
    const lower = address.toLowerCase();
    return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
};

const IMG_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

const sniffImageType = (buf) => {
    if (!buf || buf.length < 12) return '';
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'image/png';
    if (buf.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    if (buf.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(buf.toString('ascii', 8, 16))) return 'image/avif';
    if (/^\s*(<\?xml|<svg)/i.test(buf.toString('utf8', 0, 64))) return 'image/svg+xml';
    return '';
};

const refererCandidates = (target) => {
    const list = [target.origin + '/'];
    const parts = target.hostname.split('.');
    if (parts.length > 2) {
        const root = parts.slice(-2).join('.');
        list.push(`${target.protocol}//${root}/`, `${target.protocol}//www.${root}/`);
    }
    list.push('');
    return list;
};

const fetchImage = async (href, hop = 0, deadline = Date.now() + 9000) => {
    const target = new URL(href);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('protocol');
    const { address } = await dns.lookup(target.hostname);
    if (isPrivateAddress(address)) throw new Error('private');
    let lastError = new Error('gagal');
    let networkFails = 0;
    for (const referer of refererCandidates(target)) {
        const left = deadline - Date.now();
        if (left < 800) break;
        const headers = {
            'User-Agent': IMG_UA,
            Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
        };
        if (referer) headers.Referer = referer;
        let upstream;
        try {
            upstream = await axios.get(target.href, {
                responseType: 'arraybuffer',
                timeout: Math.min(6000, left),
                maxContentLength: 8 * 1024 * 1024,
                maxRedirects: 0,
                validateStatus: () => true,
                headers
            });
        } catch (e) {
            lastError = e;
            if (++networkFails >= 2) break;
            continue;
        }
        if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.location && hop < 4) {
            return fetchImage(new URL(upstream.headers.location, target).href, hop + 1, deadline);
        }
        if (upstream.status >= 400) {
            lastError = new Error('upstream ' + upstream.status);
            if ([401, 403, 404, 406, 429].includes(upstream.status) || upstream.status >= 500) continue;
            break;
        }
        const buf = Buffer.from(upstream.data);
        let type = String(upstream.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!type.startsWith('image/')) type = sniffImageType(buf);
        if (!type) {
            lastError = new Error('bukan gambar');
            continue;
        }
        return { buf, type };
    }
    throw lastError;
};

async function imageProxy(req, res) {
    try {
        const { buf, type } = await fetchImage(String(req.query.u || ''));
        res.set('Content-Type', type);
        res.set('Cache-Control', 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400');
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.set('X-Content-Type-Options', 'nosniff');
        if (type === 'image/svg+xml') res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
        res.send(buf);
    } catch (e) {
        res.set('Cache-Control', 'no-store');
        res.status(502).end();
    }
}

const translateRequests = new Map();

const allowTranslate = (ip) => {
    const now = Date.now();
    const recent = (translateRequests.get(ip) || []).filter((time) => now - time < 60000);
    if (recent.length >= 40) return false;
    recent.push(now);
    translateRequests.set(ip, recent);
    return true;
};

const SOURCE_LANGUAGES = new Set(['auto', 'en', 'ja']);

const translateText = async (text, source) => {
    const response = await axios.post(
        'https://translate.googleapis.com/translate_a/single',
        new URLSearchParams({ q: text }).toString(),
        {
            params: { client: 'gtx', sl: source, tl: 'id', dt: 't' },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 8000
        }
    );
    const segments = (response.data && response.data[0]) || [];
    return segments.map((segment) => segment[0] || '').join('');
};

const translateBatch = async (texts, source) => {
    const flat = texts.map((text) => text.replace(/\s*\n\s*/g, ' ').trim());
    try {
        const merged = await translateText(flat.join('\n'), source);
        const lines = merged.split('\n');
        if (lines.length === flat.length) return lines.map((line) => line.trim());
    } catch (e) {
    }
    return Promise.all(flat.map((text) => (text ? translateText(text, source).catch(() => text) : '')));
};

app.post('/api/translate', async (req, res) => {
    try {
        if (!allowTranslate(req.ip)) return res.status(429).json({ success: false, error: 'Terlalu banyak permintaan, coba lagi sebentar' });
        const { texts, source } = req.body || {};
        const language = SOURCE_LANGUAGES.has(source) ? source : 'auto';
        if (!Array.isArray(texts) || texts.length === 0 || texts.length > 60) {
            return res.status(400).json({ success: false, error: 'texts harus berisi 1 sampai 60 baris' });
        }
        const clean = texts.map((text) => String(text || '').slice(0, 500));
        const total = clean.reduce((sum, text) => sum + text.length, 0);
        if (total > 20000) return res.status(413).json({ success: false, error: 'Teks terlalu panjang' });
        res.json({ success: true, data: await translateBatch(clean, language) });
    } catch (e) {
        res.status(502).json({ success: false, error: 'Layanan terjemahan tidak merespons' });
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.get('/script.js', (req, res) => res.sendFile(path.join(__dirname, 'script.js')));
app.get('/subtitle.html', (req, res) => res.sendFile(path.join(__dirname, 'subtitle.html')));
app.get('/subtitle.js', (req, res) => res.sendFile(path.join(__dirname, 'subtitle.js')));
app.get('/manifest.webmanifest', (req, res) => {
    res.type('application/manifest+json');
    res.sendFile(path.join(__dirname, 'manifest.webmanifest'));
});
app.get('/sw.js', (req, res) => {
    res.type('application/javascript');
    res.set('Service-Worker-Allowed', '/');
    res.sendFile(path.join(__dirname, 'sw.js'));
});
app.get('/icon.svg', (req, res) => res.sendFile(path.join(__dirname, 'icon.svg')));
app.get('/miniplayer.js', (req, res) => res.sendFile(path.join(__dirname, 'miniplayer.js')));
app.get('/nk-features.js', (req, res) => res.sendFile(path.join(__dirname, 'nk-features.js')));

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
