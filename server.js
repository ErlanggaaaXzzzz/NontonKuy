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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const hentaimama = require('./lib/hentaimama');
const xanimu = require('./lib/xanimu');
const otakudesu = require('./lib/anichin');
const anichin = require('./lib/otakudesu');
const AniListScraper = require('./lib/anilist');
const YouTubeScraper = require('./lib/youtube');
const ZanixScraper = require('./lib/zanix');
const OploverzScraper = require('./lib/oploverz');
const KomikcastScraper = require('./lib/komikcast');
const NontonimeScraper = require('./lib/nontonime');
const RuangkomikScraper = require('./lib/ruangkomik');

const parsePage = (value) => parseInt(value, 10) || 1;

const respondWith = (task) => async (req, res) => {
    try {
        res.json(await task(req));
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};

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

app.get('/api/img', async (req, res) => {
    try {
        const target = new URL(String(req.query.u || ''));
        if (target.protocol !== 'http:' && target.protocol !== 'https:') return res.status(400).end();
        const { address } = await dns.lookup(target.hostname);
        if (isPrivateAddress(address)) return res.status(400).end();
        const upstream = await axios.get(target.href, {
            responseType: 'arraybuffer',
            timeout: 8000,
            maxContentLength: 4 * 1024 * 1024,
            maxRedirects: 0,
            headers: {
                Referer: target.origin + '/',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
                Accept: 'image/avif,image/webp,image/*,*/*;q=0.8'
            }
        });
        const type = String(upstream.headers['content-type'] || '');
        if (!type.startsWith('image/')) return res.status(415).end();
        res.set('Content-Type', type);
        res.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        res.send(Buffer.from(upstream.data));
    } catch (e) {
        res.status(502).end();
    }
});

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

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
