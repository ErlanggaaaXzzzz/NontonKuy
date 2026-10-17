const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.104 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.104 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.104 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.107 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.107 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; SM-G980F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.102 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.107 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.107 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-G990B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.102 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-G781B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.102 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.144 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.144 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 11; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.6533.108 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 OPR/109.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 OPR/108.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 OPR/109.0.0.0'
];

class AnichinScraper {
  constructor(options = {}) {
    this.baseUrl = 'https://anichin.cafe';
    this.proxy = options.proxy || null;
    this.timeout = options.timeout || 20000;
    this.uaList = userAgents;
    this._uaIndex = 0;
    this._lastUrl = '';
  }

  _randomDelay() {
    const min = 300;
    const max = 1200;
    return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
  }

  _getHeaders() {
    const ua = this.uaList[this._uaIndex % this.uaList.length];
    this._uaIndex++;
    return {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': this.baseUrl + '/',
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

  async _fetch(url, retries = 5) {
    const headers = this._getHeaders();
    const config = {
      url,
      method: 'GET',
      headers,
      timeout: this.timeout,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      maxRedirects: 5,
      decompress: true
    };
    if (this.proxy) config.proxy = this.proxy;
    let lastError;
    for (let i = 0; i < retries; i++) {
      try {
        const response = await axios(config);
        return response.data;
      } catch (err) {
        lastError = err;
        if (err.response && err.response.status === 403) {
          await this._randomDelay();
          continue;
        }
        if (i < retries - 1) await this._randomDelay();
      }
    }
    throw lastError || new Error('Fetch failed after retries');
  }

  _clean(obj) {
    if (obj === null || obj === undefined) return undefined;
    if (Array.isArray(obj)) {
      const cleaned = obj.map(item => this._clean(item)).filter(item => item !== undefined);
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

  _parseList($, containerSelector = '.listupd .bs', isSchedule = false) {
    const items = [];
    $(containerSelector).each((i, el) => {
      const $el = $(el);
      const seriesLink = $el.find('a[href*="/seri/"]').first();
      const episodeLink = $el.find('a[href*="-episode-"]').first();

      let link = null;
      let title = null;
      let image = null;
      let status = null;
      let episode = null;
      let time = null;
      let episodeCount = null;

      const ttRaw = $el.find('.tt').text().trim();
      const titleParts = ttRaw.split(/\s{2,}/).filter(s => s.length > 0);
      const cleanTitle = titleParts.length > 0 ? titleParts[0] : null;

      if (seriesLink.length) {
        link = seriesLink.attr('href');
        title = cleanTitle || seriesLink.attr('title') || seriesLink.text().trim();
        const text = $el.text();
        if (text.includes('Ongoing')) status = 'Ongoing';
        else if (text.includes('Completed')) status = 'Completed';
        else if (text.includes('Movie')) status = 'Movie';
        else if (text.includes('Upcoming')) status = 'Upcoming';
        episode = null;
        image = $el.find('img[src*="wp-content"]').attr('src') ||
                $el.find('img[data-src*="wp-content"]').attr('data-src') || null;
        if (isSchedule) {
          const linkText = seriesLink.text().trim();
          const timeMatch = linkText.match(/at (\d{2}:\d{2})/);
          if (timeMatch) time = timeMatch[1];
          episodeCount = null;
        }
      } else if (episodeLink.length) {
        link = episodeLink.attr('href');
        title = cleanTitle || episodeLink.attr('title') || episodeLink.text().trim();
        const epMatch = link.match(/episode-(\d+)/);
        if (epMatch) episode = parseInt(epMatch[1]);
        status = null;
        image = $el.find('img[src*="wp-content"]').attr('src') ||
                $el.find('img[data-src*="wp-content"]').attr('data-src') || null;
        time = null;
        episodeCount = null;
      } else {
        return;
      }

      if (!link || !title) return;

      items.push({
        title: title.replace(/\s+/g, ' ').trim(),
        link: link.startsWith('http') ? link : this.baseUrl + link,
        image,
        status,
        episode,
        time,
        episodeCount
      });
    });
    return items;
  }

  _extractPagination($) {
    const pagination = { current: 1, next: null, total: null, hasNext: false };
    const links = [];
    $('.pagination a, .page-numbers a, .nav-links a, a[href*="/page/"], a[href*="?page="]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href) links.push({ text, href });
    });

    const nextLink = links.find(l => l.text.toLowerCase().includes('next') || l.text === '»');
    if (nextLink) {
      pagination.next = nextLink.href.startsWith('http') ? nextLink.href : this.baseUrl + nextLink.href;
      pagination.hasNext = true;
    }

    const numbers = links.filter(l => /^\d+$/.test(l.text.trim()));
    if (numbers.length) {
      const maxPage = Math.max(...numbers.map(l => parseInt(l.text.trim())));
      pagination.total = maxPage;
    }

    const url = this._lastUrl || '';
    let pageMatch = url.match(/[?&]page=(\d+)/) || url.match(/\/page\/(\d+)/);
    if (pageMatch) pagination.current = parseInt(pageMatch[1]);
    else if (pagination.next) {
      const nextPageMatch = pagination.next.match(/[?&]page=(\d+)/) || pagination.next.match(/\/page\/(\d+)/);
      if (nextPageMatch) pagination.current = parseInt(nextPageMatch[1]) - 1 || 1;
    }
    return pagination;
  }

  async home(page = 1) {
    const url = page === 1 ? this.baseUrl + '/' : this.baseUrl + `/page/${page}/`;
    this._lastUrl = url;
    const html = await this._fetch(url);
    const $ = cheerio.load(html);
    const items = this._parseList($, '.listupd .bs', false);
    const pagination = this._extractPagination($);
    const result = { creator: 'rynaqrtz', page: 'home', url, pagination, items };
    return this._clean(result);
  }

  async ongoing(page = 1) {
    const url = page === 1 ? this.baseUrl + '/ongoing/' : this.baseUrl + `/ongoing/page/${page}/`;
    this._lastUrl = url;
    const html = await this._fetch(url);
    const $ = cheerio.load(html);
    const items = this._parseList($, '.listupd .bs', false);
    const pagination = this._extractPagination($);
    const result = { creator: 'rynaqrtz', page: 'ongoing', url, pagination, items };
    return this._clean(result);
  }

  async completed(page = 1) {
    const url = page === 1 ? this.baseUrl + '/completed/' : this.baseUrl + `/completed/page/${page}/`;
    this._lastUrl = url;
    const html = await this._fetch(url);
    const $ = cheerio.load(html);
    const items = this._parseList($, '.listupd .bs', false);
    const pagination = this._extractPagination($);
    const result = { creator: 'rynaqrtz', page: 'completed', url, pagination, items };
    return this._clean(result);
  }

  async schedule() {
    const url = this.baseUrl + '/schedule/';
    this._lastUrl = url;
    const html = await this._fetch(url);
    const $ = cheerio.load(html);
    const items = this._parseList($, '.listupd .bs', true);
    const result = { creator: 'rynaqrtz', page: 'schedule', url, items };
    return this._clean(result);
  }

  async seriesList({ status = '', type = '', sub = '', order = 'popular', page = 1 } = {}) {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (type) params.append('type', type);
    if (sub) params.append('sub', sub);
    if (order) params.append('order', order);
    if (page > 1) params.append('page', page);
    const url = this.baseUrl + '/seri/?' + params.toString();
    this._lastUrl = url;
    const html = await this._fetch(url);
    const $ = cheerio.load(html);
    const items = this._parseList($, '.listupd .bs', false);
    const pagination = this._extractPagination($);
    const result = { creator: 'rynaqrtz', page: 'series-list', url, pagination, items, filters: { status, type, sub, order } };
    return this._clean(result);
  }

  async search(query, page = 1) {
    const url = page === 1
      ? this.baseUrl + `/?s=${encodeURIComponent(query)}`
      : this.baseUrl + `/page/${page}/?s=${encodeURIComponent(query)}`;
    this._lastUrl = url;
    const html = await this._fetch(url);
    const $ = cheerio.load(html);
    const items = this._parseList($, '.listupd .bs', false);
    const pagination = this._extractPagination($);
    const result = { creator: 'rynaqrtz', page: 'search', url, pagination, query, items };
    return this._clean(result);
  }

  async detail(slug) {
    const url = this.baseUrl + `/seri/${slug}/`;
    this._lastUrl = url;
    const html = await this._fetch(url);
    const $ = cheerio.load(html);

    const title = $('.entry-title, h1.entry-title, h1.title').text().trim();
    const synopsis = $('.entry-content p, .sinopsis, .description').text().trim() || null;
    const poster = $('.entry-content img[src*="wp-content"]').first().attr('src') ||
                   $('img[src*="wp-content"][src*=".webp"]').first().attr('src') || null;

    const meta = {};
    $('.infox, .info-item, .meta-item, .info').each((i, el) => {
      const text = $(el).text().trim();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.includes(':'));
      lines.forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join(':').trim();
          if (key && val) meta[key] = val;
        }
      });
    });
    if (Object.keys(meta).length === 0) {
      const text = $('.entry-content').text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.includes(':'));
      lines.slice(0, 10).forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join(':').trim();
          if (key && val) meta[key] = val;
        }
      });
    }

    const episodeMap = new Map();
    $('a[href*="-episode-"]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href || !href.includes(slug)) return;
      const num = href.match(/episode-(\d+)/)?.[1];
      if (!num) return;
      const n = parseInt(num);
      const parentText = $(el).closest('li, div, td').text().trim();
      const dateMatch = parentText.match(/\b(\w+\s+\d{1,2},\s+\d{4})\b/);
      const releaseDate = dateMatch ? dateMatch[1] : null;
      if (!episodeMap.has(n) || releaseDate) {
        episodeMap.set(n, {
          number: n,
          title: `Episode ${n}`,
          link: href.startsWith('http') ? href : this.baseUrl + href,
          releaseDate
        });
      }
    });
    const episodes = Array.from(episodeMap.values()).sort((a, b) => b.number - a.number);

    const downloads = [];
    $('a[href*="mediafire.com"]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href) downloads.push({ text: text || 'Download', url: href });
    });

    const result = { creator: 'rynaqrtz', page: 'detail', url, slug, title, synopsis, poster, meta, episodes, downloads };
    return this._clean(result);
  }

  async episode(slug, episodeNum) {
    const url = /^https?:\/\//.test(slug) ? slug : this.baseUrl + `/${slug}-episode-${String(episodeNum).padStart(2, '0')}-subtitle-indonesia/`;
    this._lastUrl = url;
    const html = await this._fetch(url);
    const $ = cheerio.load(html);

    const title = $('h1.entry-title, .entry-title').text().trim();
    const seriesLink = $('a[href*="/seri/"]').first().attr('href');
    const seriesTitle = $('a[href*="/seri/"]').first().attr('title') || $('a[href*="/seri/"]').first().text().trim();

    const servers = [];
    $('select.mirror option').each((i, el) => {
      const val = $(el).val();
      const label = $(el).text().trim();
      if (val && label && label !== 'Select Video Server') {
        let iframe = null;
        try {
          const decoded = Buffer.from(val, 'base64').toString('utf-8');
          const match = decoded.match(/src="([^"]+)"/);
          if (match) iframe = match[1];
        } catch (e) {}
        servers.push({ label, iframe, raw: val });
      }
    });

    let downloadLink = null;
    $('a[href*="mediafire.com/download/"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) { downloadLink = href; return false; }
    });

    const currentNum = episodeNum;
    let nextEpisode = null, prevEpisode = null;
    $('a[href*="-episode-"]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const num = parseInt(href.match(/episode-(\d+)/)?.[1]);
      if (num === currentNum + 1) nextEpisode = href.startsWith('http') ? href : this.baseUrl + href;
      if (num === currentNum - 1) prevEpisode = href.startsWith('http') ? href : this.baseUrl + href;
    });

    const epMatch = url.match(/episode-(\d+)/);
    const epNumber = epMatch ? parseInt(epMatch[1]) : episodeNum;

    const result = {
      creator: 'rynaqrtz',
      page: 'episode',
      url,
      series: seriesTitle || null,
      seriesLink: seriesLink ? (seriesLink.startsWith('http') ? seriesLink : this.baseUrl + seriesLink) : null,
      episode: epNumber,
      title: title || `Episode ${epNumber}`,
      download: downloadLink,
      nextEpisode,
      prevEpisode,
      servers
    };
    return this._clean(result);
  }

  async servers(slug, episodeNum) {
    const url = this.baseUrl + `/${slug}-episode-${String(episodeNum).padStart(2, '0')}-subtitle-indonesia/`;
    const html = await this._fetch(url);
    const $ = cheerio.load(html);
    const servers = [];
    $('select.mirror option').each((i, el) => {
      const val = $(el).val();
      const label = $(el).text().trim();
      if (val && label && label !== 'Select Video Server') {
        let iframe = null;
        try {
          const decoded = Buffer.from(val, 'base64').toString('utf-8');
          const match = decoded.match(/src="([^"]+)"/);
          if (match) iframe = match[1];
        } catch (e) {}
        servers.push({ label, iframe, raw: val });
      }
    });
    return this._clean(servers);
  }
}

function parseSeriesArgs(args) {
  let status = '';
  let type = '';
  let sub = '';
  let order = 'popular';
  let page = 1;
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === 'ongoing' || arg === 'completed' || arg === 'movie') {
      status = arg;
    } else if (arg === 'dub' || arg === 'sub') {
      sub = arg;
    } else if (arg === 'donghua' || arg === 'movie') {
      type = arg;
    } else if (['popular', 'rating', 'title', 'titlereverse', 'update', 'latest'].includes(arg)) {
      order = arg;
    } else if (/^\d+$/.test(arg)) {
      page = parseInt(arg);
    } else {
      status = arg;
    }
    i++;
  }
  return { status, type, sub, order, page };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const rest = args.slice(1);

  const scraper = new AnichinScraper();

  (async () => {
    let result;
    try {
      switch (command) {
        case 'home': {
          const page = parseInt(rest[0]) || 1;
          result = await scraper.home(page);
          break;
        }
        case 'ongoing': {
          const page = parseInt(rest[0]) || 1;
          result = await scraper.ongoing(page);
          break;
        }
        case 'completed': {
          const page = parseInt(rest[0]) || 1;
          result = await scraper.completed(page);
          break;
        }
        case 'schedule': {
          result = await scraper.schedule();
          break;
        }
        case 'series': {
          const parsed = parseSeriesArgs(rest);
          result = await scraper.seriesList(parsed);
          break;
        }
        case 'search': {
          if (!rest[0]) throw new Error('Query required');
          const page = parseInt(rest[1]) || 1;
          result = await scraper.search(rest[0], page);
          break;
        }
        case 'detail': {
          if (!rest[0]) throw new Error('Slug required');
          result = await scraper.detail(rest[0]);
          break;
        }
        case 'episode': {
          if (!rest[0]) throw new Error('Slug required');
          const epNum = parseInt(rest[1]);
          if (isNaN(epNum)) throw new Error('Episode number required');
          result = await scraper.episode(rest[0], epNum);
          break;
        }
        case 'servers': {
          if (!rest[0]) throw new Error('Slug required');
          const ep = parseInt(rest[1]);
          if (isNaN(ep)) throw new Error('Episode number required');
          result = await scraper.servers(rest[0], ep);
          break;
        }
        default:
          console.error('Unknown command');
          console.log('Commands:');
          console.log('  home [page]');
          console.log('  ongoing [page]');
          console.log('  completed [page]');
          console.log('  schedule');
          console.log('  series [status] [type] [sub] [order] [page]');
          console.log('  search <query> [page]');
          console.log('  detail <slug>');
          console.log('  episode <slug> <epNum>');
          console.log('  servers <slug> <epNum>');
          console.log('');
          console.log('Series examples:');
          console.log('  node anichin.js series popular 2');
          console.log('  node anichin.js series rating');
          console.log('  node anichin.js series ongoing popular');
          console.log('  node anichin.js series completed rating 3');
          process.exit(1);
      }
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = AnichinScraper;
