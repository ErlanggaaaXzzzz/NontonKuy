const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.104 Mobile Safari/537.36'
];

const BASE_URL = 'https://otakudesu.news';
const EP_BASE = 'https://nontonanimex.com';

let _uaIndex = 0;

function getHeaders(referer) {
  const ua = userAgents[_uaIndex % userAgents.length];
  _uaIndex++;
  return {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': referer || 'https://nontonanimex.com/',
    'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="131", "Chromium";v="131"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Connection': 'keep-alive',
    'Cache-Control': 'max-age=0'
  };
}

async function fetchWithRetry(url, retries = 5, referer = null) {
  const headers = getHeaders(referer || url);
  const config = {
    url,
    method: 'GET',
    headers,
    timeout: 30000,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    maxRedirects: 0,
    decompress: true,
    validateStatus: status => status >= 200 && status < 400
  };
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios(config);
      return response;
    } catch (err) {
      if (err.response && err.response.status >= 300 && err.response.status < 400) {
        return err.response;
      }
      lastError = err;
      if (err.response && err.response.status === 403) {
        await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
        continue;
      }
      if (i < retries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastError || new Error('Fetch failed after retries');
}

function decodeDownloadUrl(encodedStr) {
  try {
    let reversed = encodedStr.split('').reverse().join('');
    let decoded = '';
    for (let i = 0; i < reversed.length; i += 2) {
      let charCode = parseInt(reversed.substr(i, 2), 36) - ((i / 2) % 7 + 5);
      decoded += String.fromCharCode(charCode);
    }
    return decodeURIComponent(decoded);
  } catch (error) {
    return null;
  }
}

async function resolveLStream(lstreamUrl) {
  try {
    const response = await fetchWithRetry(lstreamUrl, 3, lstreamUrl);
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      return response.headers.location;
    }
    if (response.headers['content-type'] && response.headers['content-type'].includes('application/json')) {
      const json = response.data;
      return json.url || json.stream || json.link || json.data || null;
    }
    const html = response.data;
    const iframeMatch = html.match(/<iframe[^>]*src=["']([^"']+)["']/i);
    if (iframeMatch) return iframeMatch[1];
    return response.data.trim() || null;
  } catch (e) {
    return null;
  }
}

function convertToEmbedUrl(rawUrl) {
  if (!rawUrl) return null;
  if (rawUrl.includes('mega.nz/file/')) return rawUrl.replace('mega.nz/file/', 'mega.nz/embed/');
  if (rawUrl.includes('mega.nz/#!')) return rawUrl.replace('mega.nz/#!', 'mega.nz/embed/#!');
  const aceMatch = rawUrl.match(/acefile\.co\/f\/(\d+)/);
  if (aceMatch) return 'https://acefile.co/player/' + aceMatch[1];
  const krakenMatch = rawUrl.match(/krakenfiles\.com\/view\/([^/]+)/);
  if (krakenMatch) return 'https://krakenfiles.com/embed-video/' + krakenMatch[1];
  return rawUrl;
}

function isEmbedServer(serverName) {
  const s = serverName.toLowerCase();
  return s === 'acefile' || s === 'mega' || s === 'kfiles';
}

class OtakuDesuScraper {
  constructor() {
    this.creator = 'rynaqrtz';
    this.baseUrl = BASE_URL;
    this.epBase = EP_BASE;
  }

  _clean(obj) {
    if (obj === null || obj === undefined) return undefined;
    if (Array.isArray(obj)) {
      const cleaned = obj.map(i => this._clean(i)).filter(i => i !== undefined);
      return cleaned.length ? cleaned : undefined;
    }
    if (typeof obj === 'object') {
      const result = {};
      for (const key of Object.keys(obj)) {
        const val = this._clean(obj[key]);
        if (val !== undefined) result[key] = val;
      }
      return Object.keys(result).length ? result : undefined;
    }
    return obj;
  }

  _parseList(html) {
    const $ = cheerio.load(html);
    const items = [];
    $('div.xrelated').each((i, el) => {
      const $el = $(el);
      const link = $el.find('a').attr('href');
      const img = $el.find('img').attr('src');
      const title = $el.find('div.titlelist').text().trim();
      const eps = $el.find('div.eplist').text().trim();
      const score = $el.find('div.starlist').text().replace('★', '').trim();
      if (title && link) {
        items.push({
          title,
          link: link.startsWith('http') ? link : this.baseUrl + link,
          img: img || null,
          eps,
          score
        });
      }
    });
    return items;
  }

  _parsePagination($) {
    const pagination = { current: 1, next: null, total: null, hasNext: false };
    const links = [];
    $('.pagination a, .pagination span').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href) links.push({ text, href });
    });
    const nextLink = links.find(l => l.text === '»' || l.text.toLowerCase().includes('next'));
    if (nextLink) {
      pagination.next = nextLink.href.startsWith('http') ? nextLink.href : this.baseUrl + nextLink.href;
      pagination.hasNext = true;
    }
    const numbers = links.filter(l => /^\d+$/.test(l.text));
    if (numbers.length) {
      pagination.total = Math.max(...numbers.map(l => parseInt(l.text)));
    }
    const url = this._lastUrl || '';
    const pageMatch = url.match(/\/page\/(\d+)/);
    if (pageMatch) pagination.current = parseInt(pageMatch[1]);
    return pagination;
  }

  async home(page = 1) {
    const url = page === 1 ? this.baseUrl + '/' : this.baseUrl + `/page/${page}/`;
    this._lastUrl = url;
    const html = (await fetchWithRetry(url)).data;
    const $ = cheerio.load(html);
    const items = this._parseList(html);
    const pagination = this._parsePagination($);
    return this._clean({
      creator: this.creator,
      page: 'home',
      data: { url, pagination, items }
    });
  }

  async terbaru(page = 1) {
    const url = page === 1 ? this.baseUrl + '/terbaru/' : this.baseUrl + `/terbaru/page/${page}`;
    this._lastUrl = url;
    const html = (await fetchWithRetry(url)).data;
    const items = this._parseList(html);
    const $ = cheerio.load(html);
    const pagination = this._parsePagination($);
    return this._clean({
      creator: this.creator,
      page: 'terbaru',
      data: { url, pagination, items }
    });
  }

  async jadwalRilis() {
    const url = this.baseUrl + '/jadwal-rilis';
    this._lastUrl = url;
    const html = (await fetchWithRetry(url)).data;
    const $ = cheerio.load(html);
    const schedule = {};
    $('.jdlist div').each((i, el) => {
      const day = $(el).find('h2').text().trim();
      const items = [];
      $(el).find('ul li a').each((j, a) => {
        const title = $(a).text().trim();
        const link = $(a).attr('href');
        if (title && link) items.push({ title, link: link.startsWith('http') ? link : this.baseUrl + link });
      });
      if (day && items.length) schedule[day] = items;
    });
    return this._clean({
      creator: this.creator,
      page: 'jadwal-rilis',
      data: { url, schedule }
    });
  }

  async ongoing(page = 1) {
    const url = page === 1 ? this.baseUrl + '/ongoing' : this.baseUrl + `/ongoing/page/${page}`;
    this._lastUrl = url;
    const html = (await fetchWithRetry(url)).data;
    const items = this._parseList(html);
    const $ = cheerio.load(html);
    const pagination = this._parsePagination($);
    return this._clean({
      creator: this.creator,
      page: 'ongoing',
      data: { url, pagination, items }
    });
  }

  async complete(page = 1) {
    const url = page === 1 ? this.baseUrl + '/complete' : this.baseUrl + `/complete/page/${page}`;
    this._lastUrl = url;
    const html = (await fetchWithRetry(url)).data;
    const items = this._parseList(html);
    const $ = cheerio.load(html);
    const pagination = this._parsePagination($);
    return this._clean({
      creator: this.creator,
      page: 'complete',
      data: { url, pagination, items }
    });
  }

  async genre(slug, page = 1) {
    const url = page === 1 ? this.baseUrl + `/genre/${slug}/` : this.baseUrl + `/genre/${slug}/page/${page}`;
    this._lastUrl = url;
    const html = (await fetchWithRetry(url)).data;
    const items = this._parseList(html);
    const $ = cheerio.load(html);
    const pagination = this._parsePagination($);
    return this._clean({
      creator: this.creator,
      page: 'genre',
      data: { url, slug, pagination, items }
    });
  }

  async search(query, page = 1) {
    const url = page === 1 ? this.baseUrl + `/search/?q=${encodeURIComponent(query)}` : this.baseUrl + `/search/page/${page}/?q=${encodeURIComponent(query)}`;
    this._lastUrl = url;
    const html = (await fetchWithRetry(url)).data;
    const items = this._parseList(html);
    const $ = cheerio.load(html);
    const pagination = this._parsePagination($);
    return this._clean({
      creator: this.creator,
      page: 'search',
      data: { url, query, pagination, items }
    });
  }

  async detail(slug) {
    const url = this.baseUrl + `/${slug}/`;
    this._lastUrl = url;
    const html = (await fetchWithRetry(url)).data;
    const $ = cheerio.load(html);

    const title = $('div.htitle h1').text().trim() || $('h1').first().text().trim();
    const score = $('div.htitle span').text().trim() || null;

    const info = {};
    $('ul.infol li').each((i, el) => {
      const text = $(el).text().trim();
      const parts = text.split(':');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join(':').trim();
        if (key && val) info[key] = val;
      }
    });

    const episodes = [];
    $('#ctlist li').each((i, el) => {
      const $el = $(el);
      const link = $el.find('a').attr('href');
      const title = $el.find('a').text().trim();
      const date = $el.find('span').last().text().trim();
      if (link) {
        episodes.push({
          title,
          url: link.startsWith('http') ? link : this.baseUrl + link,
          releaseDate: date || null
        });
      }
    });

    return this._clean({
      creator: this.creator,
      page: 'detail',
      data: { url, slug, title, score, info, episodes }
    });
  }

  async episode(slug, episodeNum) {
    const url = this.epBase + `/episode/${slug}-episode-${episodeNum}-sub-indo/`;
    this._lastUrl = url;
    const html = (await fetchWithRetry(url)).data;
    const $ = cheerio.load(html);

    const title = $('.tlpost').text().trim() || $('h1').first().text().trim();
    const poster = $('.imgrpv').attr('src') || null;
    const defaultPlayer = $('#mediaplayer').attr('src') || null;

    const embedPlayers = [];
    const downloadLinks = [];

    const promises = [];

    $('.dlist ul li').each((_, el) => {
      const $li = $(el);
      const quality = $li.find('strong').text().trim();
      if (!quality) return;

      const embedServers = [];
      const downloadServers = [];

      $li.find('a').each((__, aEl) => {
        const serverName = $(aEl).text().trim();
        const href = $(aEl).attr('href') || '';
        const token = href.split('/go/')[1];

        if (token) {
          const realUrl = decodeDownloadUrl(token);
          if (realUrl) {
            if (isEmbedServer(serverName)) {
              embedServers.push({ server: serverName, raw: realUrl });
            } else {
              downloadServers.push({ server: serverName, url: realUrl });
            }
          }
        }
      });

      if (embedServers.length > 0) {
        const resolvePromises = embedServers.map(async (s) => {
          let finalUrl = s.raw;
          if (s.raw.includes('desustream') || s.raw.includes('link.desustream.com')) {
            const resolved = await resolveLStream(s.raw);
            if (resolved) finalUrl = resolved;
          }
          const embed = convertToEmbedUrl(finalUrl);
          return { server: s.server, embedUrl: embed || finalUrl };
        });
        promises.push(
          Promise.all(resolvePromises).then(resolvedServers => {
            embedPlayers.push({
              quality,
              servers: resolvedServers.filter(s => s.embedUrl && s.embedUrl.length > 0)
            });
          })
        );
      }

      if (downloadServers.length > 0) {
        downloadLinks.push({
          quality,
          servers: downloadServers.map(s => ({ server: s.server, url: s.url }))
        });
      }
    });

    await Promise.all(promises);

    let nextEpisode = null, prevEpisode = null;
    $('.othereps').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const num = parseInt(href.match(/episode-(\d+)-/)?.[1]);
      if (num === episodeNum + 1) nextEpisode = href.startsWith('http') ? href : this.epBase + href;
      if (num === episodeNum - 1) prevEpisode = href.startsWith('http') ? href : this.epBase + href;
    });

    return this._clean({
      creator: this.creator,
      page: 'episode',
      data: {
        url,
        slug,
        episode: episodeNum,
        title,
        poster,
        defaultPlayer,
        embedPlayers,
        downloadLinks,
        nextEpisode,
        prevEpisode
      }
    });
  }

  async all() {
    const [home, terbaru, jadwal, ongoing, complete, genreComedy, searchDrStone, detail, episode] = await Promise.all([
      this.home(1),
      this.terbaru(1),
      this.jadwalRilis(),
      this.ongoing(1),
      this.complete(1),
      this.genre('comedy', 1),
      this.search('Dr. Stone', 1),
      this.detail('ds-future-part3-sub-indo'),
      this.episode('drstn-s4-p3', 1)
    ]);
    return this._clean({
      creator: this.creator,
      page: 'all',
      data: {
        home: home.data,
        terbaru: terbaru.data,
        jadwal: jadwal.data,
        ongoing: ongoing.data,
        complete: complete.data,
        genreComedy: genreComedy.data,
        searchDrStone: searchDrStone.data,
        detail: detail.data,
        episode: episode.data
      }
    });
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const params = args.slice(1);
  const scraper = new OtakuDesuScraper();

  (async () => {
    let result;
    try {
      switch (command) {
        case 'home':
          result = await scraper.home(parseInt(params[0]) || 1);
          break;
        case 'terbaru':
          result = await scraper.terbaru(parseInt(params[0]) || 1);
          break;
        case 'jadwal':
          result = await scraper.jadwalRilis();
          break;
        case 'ongoing':
          result = await scraper.ongoing(parseInt(params[0]) || 1);
          break;
        case 'complete':
          result = await scraper.complete(parseInt(params[0]) || 1);
          break;
        case 'genre':
          if (!params[0]) throw new Error('Genre slug required');
          result = await scraper.genre(params[0], parseInt(params[1]) || 1);
          break;
        case 'search':
          if (!params[0]) throw new Error('Query required');
          result = await scraper.search(params[0], parseInt(params[1]) || 1);
          break;
        case 'detail':
          if (!params[0]) throw new Error('Slug required');
          result = await scraper.detail(params[0]);
          break;
        case 'episode':
          if (!params[0]) throw new Error('Slug required');
          result = await scraper.episode(params[0], parseInt(params[1]));
          break;
        case 'all':
          result = await scraper.all();
          break;
        default:
          console.error('Unknown command');
          console.log('Commands: home, terbaru, jadwal, ongoing, complete, genre <slug>, search <query>, detail <slug>, episode <slug> <epNum>, all');
          process.exit(1);
      }
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error(JSON.stringify({ error: err.message }));
      process.exit(1);
    }
  })();
}

module.exports = OtakuDesuScraper;
