const https = require('https');
const http = require('http');
const { URL } = require('url');

const SITE = 'https://komikcast.click';
const CDN = 'https://cdn.komikcast.space';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
          'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
          Referer: SITE + '/'
        },
        timeout: 18000
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 400) {
            reject(new Error(`Komikcast HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (_) {
            reject(new Error('Respons Komikcast tidak valid'));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout Komikcast'));
    });
    req.end();
  });
}

function headOk(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        method: 'HEAD',
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: { 'User-Agent': UA, Referer: SITE + '/' },
        timeout: 8000
      },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

class KomikcastScraper {
  constructor() {
    this.baseUrl = SITE;
  }

  formatItem(m) {
    const latest = m.latestChapter || {};
    return {
      title: String(m.title || 'Untitled').trim(),
      link: m.slug,
      url: `${SITE}/manga/${m.slug}`,
      image: m.coverUrl || m.bannerUrl || '',
      episode: latest.number != null ? `Ch ${latest.number}` : m.type || '',
      status: m.status || m.type || '',
      score: m.rating || null,
      source: 'komikcast',
      kind: 'manga'
    };
  }

  async home(page = 1) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const data = await fetchJSON(`${SITE}/api/manga?page=${p}&limit=24`);
    const items = (data.mangas || []).map((m) => this.formatItem(m));
    return {
      page: data.page || p,
      hasNextPage: (data.page || p) < (data.totalPages || 1),
      items
    };
  }

  async ongoing(page = 1) {
    return this.home(page);
  }

  async search(query, page = 1) {
    if (!query) throw new Error('Kata kunci pencarian wajib diisi');
    const p = Math.max(1, parseInt(page, 10) || 1);
    const data = await fetchJSON(
      `${SITE}/api/manga?q=${encodeURIComponent(String(query))}&page=${p}&limit=24`
    );
    const items = (data.mangas || []).map((m) => this.formatItem(m));
    return {
      page: data.page || p,
      hasNextPage: (data.page || p) < (data.totalPages || 1),
      items
    };
  }

  async detail(query) {
    let slug = String(query || '').trim();
    if (slug.startsWith('http')) {
      try {
        const path = new URL(slug).pathname;
        const m = path.match(/\/(?:manga|read)\/([^/]+)/);
        slug = m ? m[1] : path.replace(/^\/+/, '');
      } catch (_) {}
    }
    slug = slug.replace(/^\/+/, '').split('/')[0];
    if (!slug) throw new Error('Slug manga tidak valid');

    const data = await fetchJSON(`${SITE}/api/manga?slug=${encodeURIComponent(slug)}`);
    const manga = data.manga;
    if (!manga || !manga.slug) throw new Error('Manga tidak ditemukan');

    const chapters = Array.isArray(manga.chapters) ? manga.chapters : [];
    const episodes = chapters
      .map((ch) => {
        const num = ch.number;
        const chSlug = ch.slug || `chapter-${num}`;
        const meta = {
          mangaSlug: manga.slug,
          chapterSlug: chSlug,
          number: num,
          title: ch.title || `Chapter ${num}`,
          pagesCount: ch.pagesCount || (ch.pages ? ch.pages.length : 0)
        };
        return {
          number: num,
          title: ch.title || `Chapter ${num}`,
          url: `komikmeta:${Buffer.from(JSON.stringify(meta)).toString('base64url')}`
        };
      })
      .sort((a, b) => Number(a.number) - Number(b.number));

    const genres = Array.isArray(manga.genres) ? manga.genres.join(', ') : '';
    const facts = [
      manga.type,
      manga.status,
      manga.totalChapters ? `${manga.totalChapters} chapter` : '',
      manga.rating ? `Rating ${manga.rating}` : '',
      manga.author && manga.author !== '-' ? manga.author : ''
    ]
      .filter(Boolean)
      .join(' | ');

    return {
      title: manga.title,
      poster: manga.coverUrl || '',
      description: [facts, genres, manga.synopsis || ''].filter(Boolean).join('\n\n'),
      episodes,
      url: `${SITE}/manga/${manga.slug}`,
      kind: 'manga',
      slug: manga.slug
    };
  }

  async resolvePages(mangaSlug, chapterSlug, pagesCount) {
    // Prefer CDN sequential when pages missing from API
    const pages = [];
    const max = Math.min(Math.max(pagesCount || 60, 1), 120);
    for (let i = 1; i <= max; i += 1) {
      const n = String(i).padStart(3, '0');
      const url = `${CDN}/mangas/${mangaSlug}/chapters/${chapterSlug}/${n}.jpg`;
      // only HEAD first few freely; if first fails try webp
      if (i === 1) {
        const ok = await headOk(url);
        if (!ok) {
          const webp = `${CDN}/mangas/${mangaSlug}/chapters/${chapterSlug}/${n}.webp`;
          if (await headOk(webp)) {
            pages.push(webp);
            // continue with webp
            for (let j = 2; j <= max; j += 1) {
              const nn = String(j).padStart(3, '0');
              pages.push(`${CDN}/mangas/${mangaSlug}/chapters/${chapterSlug}/${nn}.webp`);
            }
            // trim trailing by probing last
            return pages;
          }
          break;
        }
      }
      pages.push(url);
    }
    return pages;
  }

  async episode(url) {
    // "episode" = chapter for manga
    const raw = String(url || '').trim();
    if (!raw) throw new Error('Chapter tidak valid');

    let mangaSlug = '';
    let chapterSlug = '';
    let number = '';
    let title = '';
    let pagesCount = 0;

    if (raw.startsWith('komikmeta:')) {
      const meta = JSON.parse(Buffer.from(raw.slice('komikmeta:'.length), 'base64url').toString('utf8'));
      mangaSlug = meta.mangaSlug;
      chapterSlug = meta.chapterSlug;
      number = meta.number;
      title = meta.title || `Chapter ${number}`;
      pagesCount = meta.pagesCount || 0;
    } else {
      try {
        const u = new URL(raw.startsWith('http') ? raw : SITE + raw);
        const m = u.pathname.match(/\/read\/([^/]+)\/([^/]+)/) || u.pathname.match(/\/manga\/([^/]+)\/([^/]+)/);
        if (m) {
          mangaSlug = m[1];
          chapterSlug = m[2];
        }
      } catch (_) {}
    }

    if (!mangaSlug || !chapterSlug) throw new Error('Chapter tidak valid');

    // Load detail to find chapter pages if available
    let pages = [];
    try {
      const data = await fetchJSON(`${SITE}/api/manga?slug=${encodeURIComponent(mangaSlug)}`);
      const manga = data.manga || {};
      if (!title) title = `${manga.title || mangaSlug} — ${chapterSlug}`;
      const chapters = manga.chapters || [];
      const found = chapters.find(
        (c) =>
          c.slug === chapterSlug ||
          String(c.number) === String(number) ||
          c.slug === `chapter-${number}`
      );
      if (found) {
        if (!title || title === chapterSlug) title = found.title || `Chapter ${found.number}`;
        number = found.number != null ? found.number : number;
        pagesCount = found.pagesCount || pagesCount;
        if (Array.isArray(found.pages) && found.pages.length) {
          pages = found.pages
            .sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0))
            .map((p) => p.imageUrl)
            .filter(Boolean);
        }
      }
      // latestChapter may hold pages for newest
      const latest = manga.latestChapter;
      if (!pages.length && latest && (latest.slug === chapterSlug || String(latest.number) === String(number))) {
        pages = (latest.pages || []).map((p) => p.imageUrl).filter(Boolean);
      }
    } catch (_) {}

    if (!pages.length) {
      pages = await this.resolvePages(mangaSlug, chapterSlug, pagesCount || 50);
    }

    if (!pages.length) throw new Error('Halaman chapter tidak ditemukan');

    return {
      title: title || `Chapter ${number || chapterSlug}`,
      kind: 'manga',
      pages,
      servers: [],
      downloads: [],
      watchLinks: [
        {
          label: 'Buka di Komikcast',
          url: `${SITE}/read/${mangaSlug}/${chapterSlug}`
        }
      ]
    };
  }
}

module.exports = KomikcastScraper;
