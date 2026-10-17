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

    // Pattern A: aria-label + href
    const reA = /aria-label="([^"]+)"\s+href="\/komik\/([^"]+)"/g;
    let m;
    while ((m = reA.exec(html))) {
      const title = m[1].trim();
      const slug = decodeURIComponent(m[2]);
      if (seen.has(slug) || !title) continue;
      seen.add(slug);
      const block = html.slice(Math.max(0, m.index - 100), m.index + 800);
      const img = (block.match(/src="(https:\/\/thumbnail[^"\s]+)"/) || [])[1] || '';
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

    // Pattern B: href then alt
    const reB = /href="\/komik\/([^"]+)"[\s\S]{0,500}?alt="([^"]*)"/g;
    while ((m = reB.exec(html))) {
      const slug = decodeURIComponent(m[1]);
      if (seen.has(slug)) continue;
      seen.add(slug);
      const title = (m[2] || slug).trim();
      const block = html.slice(m.index, m.index + 600);
      const img = (block.match(/src="(https:\/\/thumbnail[^"\s]+)"/) || [])[1] || '';
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

    // Pattern C: any /komik/slug + nearest title text
    if (!items.length) {
      const reC = /href="\/komik\/([^"?#]+)"/g;
      while ((m = reC.exec(html))) {
        const slug = decodeURIComponent(m[1]);
        if (seen.has(slug)) continue;
        seen.add(slug);
        const block = html.slice(m.index, m.index + 400);
        const title =
          (block.match(/aria-label="([^"]+)"/) || [])[1] ||
          (block.match(/alt="([^"]+)"/) || [])[1] ||
          slug.replace(/-/g, ' ');
        const img = (block.match(/src="(https:\/\/thumbnail[^"\s]+)"/) || [])[1] || '';
        items.push({
          title: title.trim(),
          link: slug,
          url: `${SITE}/komik/${encodeURIComponent(slug)}`,
          image: img,
          episode: '',
          status: '',
          source: 'ruangkomik',
          kind: 'manga'
        });
      }
    }

    return items;
  }

  async home(page = 1) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    // Gabungkan beberapa halaman pustaka agar katalog lebih lengkap
    const pagesToFetch = p === 1 ? [1, 2, 3, 4, 5] : [p];
    const seen = new Set();
    const items = [];
    for (const pg of pagesToFetch) {
      const path = pg <= 1 ? '/pustaka' : `/pustaka?page=${pg}`;
      try {
        const { body } = await fetchText(SITE + path);
        for (const it of this.parseHomeCards(body)) {
          if (seen.has(it.link)) continue;
          seen.add(it.link);
          items.push(it);
        }
      } catch (_) {}
    }
    if (!items.length && p === 1) {
      try {
        const home = await fetchText(SITE + '/');
        for (const it of this.parseHomeCards(home.body)) {
          if (seen.has(it.link)) continue;
          seen.add(it.link);
          items.push(it);
        }
      } catch (_) {}
    }
    return { page: p, hasNextPage: true, items };
  }

  async ongoing(page = 1) {
    return this.home(page);
  }

  async search(query, page = 1) {
    if (!query) throw new Error('Kata kunci wajib');
    const p = Math.max(1, parseInt(page, 10) || 1);
    const q = encodeURIComponent(String(query));
    // Endpoint resmi: /search?q= (bukan /pustaka?q=)
    const { body } = await fetchText(`${SITE}/search?q=${q}${p > 1 ? `&page=${p}` : ''}`);
    let items = this.parseHomeCards(body);
    if (!items.length) {
      // parser alternatif: slug + title dari hasil search
      const seen = new Set();
      const re = /href="\/komik\/([^"]+)"[\s\S]{0,500}?alt="([^"]*)"/g;
      let m;
      while ((m = re.exec(body))) {
        const slug = decodeURIComponent(m[1]);
        if (seen.has(slug)) continue;
        seen.add(slug);
        const block = body.slice(m.index, m.index + 500);
        const img = (block.match(/src="(https:\/\/thumbnail[^"]+)"/) || [])[1] || '';
        items.push({
          title: m[2] || slug,
          link: slug,
          url: `${SITE}/komik/${encodeURIComponent(slug)}`,
          image: img,
          episode: '',
          status: '',
          source: 'ruangkomik',
          kind: 'manga'
        });
      }
    }
    return { page: p, hasNextPage: items.length >= 10, items };
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
