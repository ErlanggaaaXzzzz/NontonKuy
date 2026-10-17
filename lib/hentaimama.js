const axios = require('axios');
const cheerio = require('cheerio');
const { pickImg } = require('./imgutil');
const { URLSearchParams } = require('url');

const UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36';
const BASE = 'https://hentaimama.io';

function createSession() {
  const instance = axios.create({
    headers: { 'User-Agent': UA },
    timeout: 15000,
    validateStatus: () => true,
    withCredentials: true,
  });
  instance.interceptors.response.use(res => {
    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
      const existing = instance.defaults.headers.Cookie || '';
      const newCookies = setCookie.map(c => c.split(';')[0]).join('; ');
      instance.defaults.headers.Cookie = existing ? existing + '; ' + newCookies : newCookies;
    }
    return res;
  });
  return instance;
}

function extractMeta($) {
  return {
    title: $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim() || '',
    poster: $('meta[property="og:image"]').attr('content') || '',
    description: $('meta[property="og:description"]').attr('content') || '',
  };
}

function extractArticles($) {
  const items = [];
  const seen = new Set();
  $('article').each((i, el) => {
    const link = $(el).find('a[href*="/tvshows/"], a[href*="/episodes/"]').attr('href');
    if (link && !seen.has(link)) {
      seen.add(link);
      items.push({
        url: link,
        title: $(el).find('h3').text().trim() || $(el).find('img').attr('alt') || '',
        poster: pickImg($(el).find('img').first(), 'https://hentaimama.io') || '',
      });
    }
  });
  if (items.length === 0) {
    $('a[href*="/tvshows/"], a[href*="/episodes/"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !seen.has(href) && href.includes('hentaimama.io')) {
        seen.add(href);
        const slug = href.split('/').filter(Boolean).pop();
        items.push({
          url: href,
          title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          poster: pickImg($(el).find('img').first(), 'https://hentaimama.io') || '',
        });
      }
    });
  }
  return items;
}

async function getDownloadLinks(session, url, videoId) {
  const links = [];
  try {
    const nonceMatch = (await session.get(url, { headers: { Referer: BASE } })).data.match(/"nonce":"([^"]+)"/);
    if (!nonceMatch) return links;
    const nonce = nonceMatch[1];

    const ajaxRes = await session.post(
      `${BASE}/wp-admin/admin-ajax.php`,
      new URLSearchParams({ action: 'get_player_contents', a: videoId, _wpnonce: nonce }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Referer: url } }
    );

    if (ajaxRes.status !== 200 || !ajaxRes.data) return links;

    const cleaned = typeof ajaxRes.data === 'string' ? ajaxRes.data.replace(/\\\//g, '/') : JSON.stringify(ajaxRes.data);
    const iframes = JSON.parse(cleaned);
    for (const iframe of iframes) {
      const srcMatch = iframe.match(/src="([^"]+)"/);
      if (!srcMatch) continue;
      const src = srcMatch[1];
      const paramMatch = src.match(/p=([^&]+)/);
      if (!paramMatch) continue;

      if (src.includes('new2.php')) {
        const new2Res = await session.get(`${BASE}/new2.php?p=${paramMatch[1]}`, { headers: { Referer: url } });
        const gdUrl = new2Res.data.match(/https?:\/\/gdvid\.info[^"'\s]+\.mp4[^"'\s]*/);
        if (gdUrl) links.push({ server: 'gdvid', url: gdUrl[0] });
      }
      if (src.includes('newjav.php')) {
        const newjavRes = await session.get(`${BASE}/newjav.php?p=${paramMatch[1]}`, { headers: { Referer: url } });
        const javUrl = newjavRes.data.match(/https?:\/\/na-\d+\.javprovider\.com[^"'\s]+\.mp4[^"'\s]*/);
        if (javUrl) links.push({ server: 'javprovider', url: javUrl[0] });
      }
    }
  } catch (e) {
    console.error('Download link error:', e.message);
  }
  return links;
}

async function scrapeEpisode(url) {
  const session = createSession();
  const { data: html } = await session.get(url, { headers: { Referer: BASE } });
  if (!html) return null;

  const $ = cheerio.load(html);
  const meta = extractMeta($);

  const data = {
    url,
    title: meta.title.replace(/&#8217;/g, "'").replace(/&amp;/g, '&').trim(),
    poster: meta.poster,
    duration: '',
    genres: [],
    series: '',
    series_url: '',
    episode_number: '',
    download_links: [],
  };

  data.duration = $('.custom_fields b:contains("Duration")').next('span').text().trim() ||
                  $('span:contains("min")').first().text().trim();

  const genreContainer = $('.sgeneros');
  if (genreContainer.length) {
    genreContainer.find('a[href*="/genre/"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text) data.genres.push(text.replace(/&amp;/g, '&'));
    });
  } else {
    const entryContent = $('.entry-content, .post-content');
    entryContent.find('a[href*="/genre/"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text) data.genres.push(text.replace(/&amp;/g, '&'));
    });
  }
  data.genres = [...new Set(data.genres)];

  const seriesLink = $('a[href*="/tvshows/"]').first();
  if (seriesLink.length) {
    data.series = seriesLink.text().trim();
    data.series_url = seriesLink.attr('href');
  }

  const epMatch = html.match(/Episode\s*(\d+)/i);
  if (epMatch) data.episode_number = epMatch[1];

  const videoIdMatch = html.match(/a:'(\d+)'/) || html.match(/data-id="(\d+)"/) || html.match(/post-(\d+)/);
  if (videoIdMatch) {
    data.download_links = await getDownloadLinks(session, url, videoIdMatch[1]);
  }

  return data;
}

async function scrapeTVShow(url) {
  const session = createSession();
  const { data: html } = await session.get(url);
  const $ = cheerio.load(html);
  const meta = extractMeta($);

  const data = {
    url,
    title: meta.title.replace(/&#8217;/g, "'").replace(/&amp;/g, '&').trim(),
    poster: meta.poster,
    description: meta.description,
    episodes: [],
  };

  const seen = new Set();
  $('a[href*="/episodes/"], a[href*="/episode/"]').each((i, el) => {
    const href = $(el).attr('href');
    if (href && !seen.has(href)) {
      seen.add(href);
      const slug = href.split('/').filter(Boolean).pop();
      data.episodes.push({
        url: href,
        title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      });
    }
  });

  return data;
}

async function scrapeGenre(url) {
  const session = createSession();
  const { data: html } = await session.get(url);
  const $ = cheerio.load(html);
  return extractArticles($);
}

async function scrapeSearch(query, page = 1) {
  const session = createSession();
  const url = page > 1
    ? `${BASE}/page/${page}/?s=${encodeURIComponent(query)}`
    : `${BASE}/?s=${encodeURIComponent(query)}`;
  const { data: html } = await session.get(url);
  const $ = cheerio.load(html);
  return extractArticles($);
}

async function scrapeHentaiList(page = 1) {
  const session = createSession();
  const url = page > 1
    ? `${BASE}/hentai-list/page/${page}/`
    : `${BASE}/hentai-list/`;
  const { data: html } = await session.get(url);
  const $ = cheerio.load(html);
  return extractArticles($);
}

async function scrapeList(url) {
  const session = createSession();
  const { data: html } = await session.get(url);
  const $ = cheerio.load(html);
  return extractArticles($);
}

async function scrapeTrending(page = 1) {
  const session = createSession();
  const url = page > 1
    ? `${BASE}/trending/page/${page}/`
    : `${BASE}/trending/`;
  const { data: html } = await session.get(url);
  const $ = cheerio.load(html);
  return extractArticles($);
}

async function scrapeAdvanceSearch(queryParams) {
  const session = createSession();
  const params = new URLSearchParams(queryParams);
  params.set('submit', 'Submit');
  const url = `${BASE}/advance-search/?${params.toString()}`;
  const { data: html } = await session.get(url);
  const $ = cheerio.load(html);
  return extractArticles($);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { action, url, q, page, ...rest } = req.query;
  const pg = parseInt(page) || 1;

  try {
    let result;
    if (action === 'episode') {
      if (!url) return res.status(400).json({ error: 'url diperlukan' });
      result = await scrapeEpisode(url);
    } else if (action === 'tvshow') {
      if (!url) return res.status(400).json({ error: 'url diperlukan' });
      result = await scrapeTVShow(url);
    } else if (action === 'genre') {
      if (!url) return res.status(400).json({ error: 'url diperlukan' });
      const genreUrl = pg > 1 ? url.replace(/\/$/, '') + `/page/${pg}/` : url;
      result = await scrapeGenre(genreUrl);
    } else if (action === 'search') {
      if (!q) return res.status(400).json({ error: 'q diperlukan' });
      result = await scrapeSearch(q, pg);
    } else if (action === 'hentai-list') {
      result = await scrapeHentaiList(pg);
    } else if (action === 'list') {
      if (!url) return res.status(400).json({ error: 'url diperlukan' });
      result = await scrapeList(url);
    } else if (action === 'trending') {
      result = await scrapeTrending(pg);
    } else if (action === 'advance-search') {
      result = await scrapeAdvanceSearch(rest);
    } else {
      return res.status(400).json({ error: 'Action tidak dikenal', available: ['episode', 'tvshow', 'genre', 'search', 'hentai-list', 'list', 'trending', 'advance-search'] });
    }
    return res.json({ success: true, data: result });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};
