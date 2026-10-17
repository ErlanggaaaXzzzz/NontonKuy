const https = require('https');
const http = require('http');
const { URL } = require('url');

const SITE = 'https://ruangkomik.fadelsm.biz.id';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'id-ID,id;q=0.9',
          Referer: SITE + '/'
        },
        timeout: 20000
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).href;
          res.resume();
          fetchText(next).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), url });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout RuangKomik'));
    });
    req.end();
  });
}

class RuangkomikScraper {
  constructor() {
    this.baseUrl = SITE;
  }

  parseHomeCards(html) {
    const items = [];
    const seen = new Set();
    // href="/komik/slug" ... alt="Title"
    const re = /href="\/komik\/([^"]+)"[\s\S]{0,400}?alt="([^"]*)"/g;
    let m;
    while ((m = re.exec(html))) {
      const slug = decodeURIComponent(m[1]);
      if (seen.has(slug)) continue;
      seen.add(slug);
      const title = m[2] || slug;
      const block = html.slice(m.index, m.index + 600);
      const img = (block.match(/src="(https:\/\/thumbnail[^"]+)"/) || [])[1] || '';
      items.push({
        title,
        link: slug,
        url: `${SITE}/komik/${encodeURIComponent(slug)}`,
        image: img,
        episode: '',
        status: '',
        source: 'ruangkomik',
        kind: 'manga'
      });
    }
    return items;
  }

  async home(page = 1) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const path = p <= 1 ? '/' : `/pustaka?page=${p}`;
    const { body } = await fetchText(SITE + path);
    const items = this.parseHomeCards(body);
    return { page: p, hasNextPage: items.length >= 12, items };
  }

  async ongoing(page = 1) {
    return this.home(page);
  }

  async search(query, page = 1) {
    if (!query) throw new Error('Kata kunci wajib');
    const p = Math.max(1, parseInt(page, 10) || 1);
    const q = encodeURIComponent(String(query));
    const { body } = await fetchText(`${SITE}/pustaka?q=${q}&page=${p}`);
    let items = this.parseHomeCards(body);
    // fallback: filter home
    if (!items.length) {
      const home = await this.home(1);
      const qlow = String(query).toLowerCase();
      items = home.items.filter((i) => i.title.toLowerCase().includes(qlow));
    }
    return { page: p, hasNextPage: false, items };
  }

  async detail(query) {
    let slug = String(query || '').trim();
    if (slug.startsWith('http')) {
      try {
        const path = new URL(slug).pathname;
        const m = path.match(/\/(?:komik|baca)\/([^/]+)/);
        slug = m ? decodeURIComponent(m[1]) : slug;
      } catch (_) {}
    }
    slug = slug.replace(/^\/+/, '').split('/')[0];
    if (!slug) throw new Error('Slug tidak valid');

    const { body, status } = await fetchText(`${SITE}/komik/${encodeURIComponent(slug)}`);
    if (status >= 400 || /<title>Komik Tidak Ditemukan/i.test(body)) throw new Error('Komik tidak ditemukan');

    const title = (body.match(/<h1[^>]*>([^<]+)/) || [])[1] || slug;
    const poster =
      (body.match(/(https:\/\/thumbnail\.komiku\.to\/[^"'\s]+)/) || [])[1] || '';
    let synopsis = '';
    const syn = body.match(/SINOPSIS[\s\S]{0,40}?>([\s\S]{20,600}?)<\//i);
    if (syn) synopsis = syn[1].replace(/<[^>]+>/g, '').trim();

    const baca = [...body.matchAll(/href="(\/baca\/[^"]+)"/g)].map((x) => x[1]);
    const seen = new Set();
    const episodes = [];
    baca.forEach((href) => {
      if (seen.has(href)) return;
      seen.add(href);
      const parts = href.split('/');
      const chSlug = parts[parts.length - 1] || '';
      const numM = chSlug.match(/chapter-([\d.]+)/i) || chSlug.match(/([\d.]+)$/);
      const num = numM ? numM[1] : chSlug;
      episodes.push({
        number: num,
        title: `Chapter ${num}`,
        url: `rkmeta:${Buffer.from(
          JSON.stringify({ slug, chapterSlug: chSlug, path: href, number: num, title })
        ).toString('base64url')}`
      });
    });
    episodes.sort((a, b) => Number(a.number) - Number(b.number));

    return {
      title,
      poster,
      description: synopsis,
      episodes,
      url: `${SITE}/komik/${encodeURIComponent(slug)}`,
      kind: 'manga',
      slug
    };
  }

  async episode(url) {
    const raw = String(url || '').trim();
    let path = '';
    let title = 'Chapter';
    if (raw.startsWith('rkmeta:')) {
      const meta = JSON.parse(Buffer.from(raw.slice('rkmeta:'.length), 'base64url').toString('utf8'));
      path = meta.path || `/baca/${meta.slug}/${meta.chapterSlug}`;
      title = meta.title || `Chapter ${meta.number || ''}`;
    } else if (raw.startsWith('http') || raw.startsWith('/')) {
      path = raw.startsWith('http') ? new URL(raw).pathname : raw;
    } else {
      throw new Error('Chapter tidak valid');
    }

    const { body } = await fetchText(SITE + path);
    const pages = [];
    const seen = new Set();
    const re = /<img[^>]+src="(https:\/\/image\d*\.komiku\.to\/[^"]+)"/g;
    let m;
    while ((m = re.exec(body))) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      pages.push(m[1]);
    }
    // also generic komiku image hosts
    if (!pages.length) {
      const re2 = /src="(https:\/\/[^"]*komiku[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;
      while ((m = re2.exec(body))) {
        if (seen.has(m[1])) continue;
        if (/thumbnail|logo|icon/i.test(m[1])) continue;
        seen.add(m[1]);
        pages.push(m[1]);
      }
    }

    if (!pages.length) throw new Error('Halaman chapter tidak ditemukan');

    return {
      title,
      kind: 'manga',
      pages,
      servers: [],
      downloads: [],
      watchLinks: [{ label: 'Buka di RuangKomik', url: SITE + path }]
    };
  }
}

module.exports = RuangkomikScraper;
