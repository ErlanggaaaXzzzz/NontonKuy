const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const hentaimama = require('./lib/hentaimama');
const xanimu = require('./lib/xanimu');
const otakudesu = require('./lib/otakudesu');
const anichin = require('./lib/anichin');

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
        case 'detail': return scraper.detail(query);
        default: return scraper.popular(1, 20);
    }
});

const animeRoute = (Scraper) => respondWith(async (req) => {
    const scraper = new Scraper();
    const { action, query, page } = req.query;
    switch (action) {
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

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.get('/script.js', (req, res) => res.sendFile(path.join(__dirname, 'script.js')));

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
