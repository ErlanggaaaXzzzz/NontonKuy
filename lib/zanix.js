const https = require('https');
const http = require('http');
const { URL } = require('url');

const BASE = 'https://zanix.tr';
const CDN = 'https://cdn.4animo.xyz';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const clean = (text) =>
  String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

function fetchText(url, options = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': UA,
      Accept: options.json
        ? 'application/json, text/javascript, */*; q=0.01'
        : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.headers || {})
    };
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        headers,
        timeout: 15000
      },
      (res) => {
        const code = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, url).href;
          const setCookie = res.headers['set-cookie'];
          // merge cookies into options for next hop
          const nextOpts = { ...options };
          if (setCookie) {
            // caller will merge; pass along raw for now via cookie string update outside
          }
          return fetchText(next, nextOpts, redirects + 1).then(resolve, reject);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: code,
            body: Buffer.concat(chunks).toString('utf8'),
            setCookie: res.headers['set-cookie'],
            headers: res.headers
          });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.end();
  });
}

class ZanixScraper {
  constructor() {
    this.baseUrl = BASE;
    this.cookies = '';
    this.token = null;
    this.tokenAt = 0;
  }

  mergeCookies(setCookie) {
    if (!setCookie) return;
    const list = Array.isArray(setCookie) ? setCookie : [setCookie];
    const map = {};
    String(this.cookies || '')
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .forEach((c) => {
        const i = c.indexOf('=');
        if (i > 0) map[c.slice(0, i)] = c.slice(i + 1);
      });
    list.forEach((raw) => {
      const part = String(raw).split(';')[0];
      const i = part.indexOf('=');
      if (i > 0) map[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    });
    this.cookies = Object.entries(map)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  async request(url, options = {}) {
    const res = await fetchText(url, {
      ...options,
      cookie: this.cookies,
      headers: options.headers
    });
    if (res.setCookie) this.mergeCookies(res.setCookie);
    return res;
  }

  async ensureToken() {
    if (this.token && Date.now() - this.tokenAt < 10 * 60 * 1000) return this.token;
    const res = await this.request(`${BASE}/most-popular`);
    const match = String(res.body).match(/AJAX_TOKEN\s*=\s*"([^"]+)"/);
    if (!match) throw new Error('Gagal mengambil token Zanix');
    this.token = match[1];
    this.tokenAt = Date.now();
    return this.token;
  }

  async ajax(path) {
    const token = await this.ensureToken();
    const res = await this.request(`${BASE}${path}`, {
      json: true,
      headers: {
        'X-Page-Token': token,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${BASE}/`
      }
    });
    try {
      return JSON.parse(res.body);
    } catch (_) {
      throw new Error('Respons AJAX Zanix tidak valid');
    }
  }

  parseList(html) {
    const items = [];
    const seen = new Set();
    const blocks = String(html).split('class="flw-item"');
    for (let i = 1; i < blocks.length; i += 1) {
      const block = blocks[i].slice(0, 4500);
      const hrefMatch = block.match(/href="(\/[a-z0-9-]+-\d+)"/i);
      if (!hrefMatch) continue;
      const path = hrefMatch[1];
      if (seen.has(path)) continue;
      seen.add(path);

      let title = '';
      const dataTitle = block.match(/data-title="([^"]+)"/i);
      if (dataTitle) title = clean(dataTitle[1]);
      if (!title) {
        const dyn = block.match(/class="dynamic-name"[^>]*>([^<]+)/i);
        if (dyn) title = clean(dyn[1]);
      }
      if (!title) {
        const fn = block.match(/class="film-name"[\s\S]*?<a[^>]*>([^<]+)/i);
        if (fn) title = clean(fn[1]);
      }
      if (!title) title = path.replace(/^\//, '').replace(/-\d+$/, '').replace(/-/g, ' ');

      const imgMatch =
        block.match(/data-src="(https:\/\/s4\.zanix\.tr\/poster\/[^"]+)"/i) ||
        block.match(/src="(https:\/\/s4\.zanix\.tr\/poster\/[^"]+)"/i);
      const image = imgMatch ? imgMatch[1] : '';

      const subMatch = block.match(/tick-sub[^>]*>[\s\S]*?(\d+)/i);
      const dubMatch = block.match(/tick-dub[^>]*>[\s\S]*?(\d+)/i);
      const epsMatch = block.match(/tick-eps[^>]*>[\s\S]*?(\d+)/i);
      const typeMatch = block.match(/class="fdi-item"[^>]*>([^<]+)/i);
      const eps = (epsMatch && epsMatch[1]) || (subMatch && subMatch[1]) || (dubMatch && dubMatch[1]) || '';

      items.push({
        title,
        link: path.replace(/^\//, ''),
        url: BASE + path,
        image,
        episode: eps,
        status: typeMatch ? clean(typeMatch[1]) : '',
        source: 'zanix'
      });
    }
    return items;
  }

  hasNextPage(html, page) {
    let max = page;
    const re = /class="page-link"[^>]*>(\d+)/gi;
    let m;
    while ((m = re.exec(html))) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
    return max > page;
  }

  async home(page = 1) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const url = p === 1 ? `${BASE}/most-popular` : `${BASE}/most-popular?page=${p}`;
    const res = await this.request(url);
    const items = this.parseList(res.body);
    return { page: p, hasNextPage: this.hasNextPage(res.body, p) || items.length >= 20, items };
  }

  async ongoing(page = 1) {
    return this.home(page);
  }

  async search(query, page = 1) {
    if (!query) throw new Error('Kata kunci pencarian wajib diisi');
    const p = Math.max(1, parseInt(page, 10) || 1);
    const url = p === 1
      ? `${BASE}/search?keyword=${encodeURIComponent(String(query))}`
      : `${BASE}/search?keyword=${encodeURIComponent(String(query))}&page=${p}`;
    const res = await this.request(url);
    const items = this.parseList(res.body);
    return { page: p, hasNextPage: this.hasNextPage(res.body, p) || items.length >= 20, items };
  }

  extractAnimeId(slug) {
    const m = String(slug || '').match(/-(\d+)$/);
    return m ? m[1] : null;
  }

  async detail(query) {
    let slug = String(query || '').trim();
    if (slug.startsWith('http')) {
      try {
        slug = new URL(slug).pathname.replace(/^\//, '');
      } catch (_) {}
    }
    slug = slug.replace(/^\/+/, '').split('?')[0];
    if (!slug) throw new Error('Slug anime tidak valid');

    const animeId = this.extractAnimeId(slug);
    if (!animeId) throw new Error('ID anime tidak ditemukan dari slug');

    const res = await this.request(`${BASE}/${slug}`);
    const html = res.body;

    const h1 = html.match(/<h1[^>]*>([^<]+)/i);
    const og = html.match(/property="og:title"\s+content="([^"]+)"/i);
    const title =
      clean(h1 ? h1[1] : '') ||
      clean(og ? og[1] : '').replace(/\s*-\s*Zanix$/i, '') ||
      slug;

    const posterMatch =
      html.match(/src="(https:\/\/s4\.zanix\.tr\/poster\/[^"]+)"/i) ||
      html.match(/property="og:image"\s+content="([^"]+)"/i);
    const poster = posterMatch ? posterMatch[1] : `https://s4.zanix.tr/poster/${animeId}.jpg`;

    let description = '';
    const descMatch = html.match(/class="film-description[^"]*"[\s\S]*?<div class="text">([\s\S]*?)<\/div>/i);
    if (descMatch) description = clean(descMatch[1]);
    if (!description) {
      const meta = html.match(/name="description"\s+content="([^"]+)"/i);
      if (meta) description = clean(meta[1]);
    }

    let episodes = [];
    try {
      const epData = await this.ajax(`/ajax/episodes?animeId=${encodeURIComponent(animeId)}`);
      if (epData && epData.success && Array.isArray(epData.episodes)) {
        episodes = epData.episodes.map((ep) => {
          const titles = ep.titles || {};
          const epTitle =
            titles.en || titles.romaji || titles.ja || ep.title || `Episode ${ep.number}`;
          const meta = {
            slug,
            number: ep.number,
            episodeId: String(ep.id),
            embedId: ep.embed_id ? String(ep.embed_id) : '',
            ani: ep.ani || '',
            mal: ep.mal || '',
            sub: !!ep.sub,
            dub: !!ep.dub,
            title: epTitle
          };
          return {
            number: ep.number,
            title: `Eps ${ep.number}: ${epTitle}`,
            url: `zanixmeta:${Buffer.from(JSON.stringify(meta)).toString('base64url')}`,
            episodeId: String(ep.id),
            slug
          };
        });
      }
    } catch (_) {
      episodes = [
        {
          number: 1,
          title: 'Episode 1',
          url: `${BASE}/watch/${slug}?ep=1`,
          episodeId: '',
          slug
        }
      ];
    }

    return {
      title,
      poster,
      description,
      episodes,
      url: `${BASE}/${slug}`,
      animeId,
      slug
    };
  }

  buildEmbeds(episodeId, ani, mal, serverType) {
    const type = serverType === 'dub' ? 'dub' : 'sub';
    const embeds = [];

    if (ani) {
      embeds.push({
        label: `FlixEra ${type.toUpperCase()}`,
        iframe: `https://flixera.co/embed/ani/${ani}/${type}?autoplay=0&skipintro=0&skipoutro=0`
      });
    } else if (mal) {
      embeds.push({
        label: `FlixEra ${type.toUpperCase()}`,
        iframe: `https://flixera.co/embed/mal/${mal}/${type}?autoplay=0&skipintro=0&skipoutro=0`
      });
    }

    if (episodeId) {
      embeds.push({
        label: `M-Cloud ${type.toUpperCase()}`,
        iframe: `${CDN}/embed/hd-1/${episodeId}/${type}?k=1&autoPlay=0&skipIntro=0&skipOutro=0`
      });
    }

    if (ani) {
      embeds.push({
        label: `R-Cloud ${type.toUpperCase()}`,
        iframe: `${CDN}/embed/hd-2/ani/${ani}/${type}?k=1&autoPlay=0&skipIntro=0&skipOutro=0`
      });
    } else if (mal) {
      embeds.push({
        label: `R-Cloud ${type.toUpperCase()}`,
        iframe: `${CDN}/embed/hd-2/mal/${mal}/${type}?k=1&autoPlay=0&skipIntro=0&skipOutro=0`
      });
    } else if (episodeId) {
      embeds.push({
        label: `R-Cloud ${type.toUpperCase()}`,
        iframe: `${CDN}/embed/hd-2/${episodeId}/${type}?k=1&autoPlay=0&skipIntro=0&skipOutro=0`
      });
    }

    return embeds;
  }

  async episode(url) {
    const raw = String(url || '').trim();
    if (!raw) throw new Error('URL episode tidak valid');

    let slug = '';
    let epNum = 1;
    let episodeId = '';
    let ani = '';
    let mal = '';
    let hasSub = true;
    let hasDub = false;
    let title = '';

    if (raw.startsWith('zanixmeta:')) {
      try {
        const meta = JSON.parse(Buffer.from(raw.slice('zanixmeta:'.length), 'base64url').toString('utf8'));
        slug = meta.slug || '';
        epNum = meta.number || 1;
        episodeId = meta.episodeId || '';
        ani = meta.ani || '';
        mal = meta.mal || '';
        hasSub = meta.sub !== false;
        hasDub = !!meta.dub;
        title = meta.title || `Episode ${epNum}`;
      } catch (_) {
        throw new Error('Meta episode tidak valid');
      }
    } else {
      let parsed;
      try {
        parsed = new URL(raw.startsWith('http') ? raw : `${BASE}${raw.startsWith('/') ? '' : '/'}${raw}`);
      } catch (_) {
        throw new Error('URL episode tidak valid');
      }
      const path = parsed.pathname.replace(/^\//, '');
      const watchMatch = path.match(/^watch\/(.+)$/);
      slug = watchMatch ? watchMatch[1] : path;
      epNum = parseInt(parsed.searchParams.get('ep') || '1', 10) || 1;
    }

    if (!episodeId) {
      const animeId = this.extractAnimeId(slug);
      if (!animeId) throw new Error('ID anime tidak valid');
      const epData = await this.ajax(`/ajax/episodes?animeId=${encodeURIComponent(animeId)}`);
      if (!epData || !epData.success || !Array.isArray(epData.episodes)) {
        throw new Error('Daftar episode tidak ditemukan');
      }
      const ep = epData.episodes.find((e) => Number(e.number) === Number(epNum)) || epData.episodes[0];
      if (!ep) throw new Error('Episode tidak ditemukan');
      episodeId = String(ep.id);
      ani = ep.ani || '';
      mal = ep.mal || '';
      hasSub = !!ep.sub;
      hasDub = !!ep.dub;
      const titles = ep.titles || {};
      title = titles.en || titles.romaji || `Episode ${ep.number}`;
    }

    const servers = [];
    if (hasSub) servers.push(...this.buildEmbeds(episodeId, ani, mal, 'sub'));
    if (hasDub) servers.push(...this.buildEmbeds(episodeId, ani, mal, 'dub'));

    const downloads = [];
    try {
      const qs = `/ajax/server?episodeId=${encodeURIComponent(episodeId)}&sub=${hasSub ? 1 : 0}&dub=${hasDub ? 1 : 0}&ani=${encodeURIComponent(ani)}&mal=${encodeURIComponent(mal)}&ep=${encodeURIComponent(epNum)}`;
      const serverData = await this.ajax(qs);
      if (serverData && serverData.downloads) {
        if (serverData.downloads.sub) downloads.push({ label: 'Download SUB', url: serverData.downloads.sub });
        if (serverData.downloads.dub) downloads.push({ label: 'Download DUB', url: serverData.downloads.dub });
      }
    } catch (_) {}

    if (servers.length === 0) throw new Error('Tidak ada server streaming untuk episode ini');

    return {
      title: title || `Episode ${epNum}`,
      servers,
      downloads,
      watchLinks: [{ label: 'Buka di Zanix', url: `${BASE}/watch/${slug}?ep=${epNum}` }]
    };
  }
}

module.exports = ZanixScraper;
