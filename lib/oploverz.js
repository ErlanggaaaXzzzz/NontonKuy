const https = require('https');
const http = require('http');
const { URL } = require('url');

const API = 'https://backapi.oploverz.ac';
const SITE = 'https://oploverz.site';
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
        timeout: 15000
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 400) {
            reject(new Error(`Oploverz HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Respons Oploverz tidak valid'));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout Oploverz'));
    });
    req.end();
  });
}

function posterUrl(poster) {
  if (!poster) return '';
  if (/^https?:\/\//i.test(poster)) return poster;
  return `${API}/uploads/${String(poster).replace(/^\/+/, '')}`;
}

function cleanTitle(title) {
  return String(title || '').replace(/\s+/g, ' ').trim() || 'Untitled';
}

class OploverzScraper {
  constructor() {
    this.baseUrl = SITE;
  }

  formatSeries(item) {
    return {
      title: cleanTitle(item.title),
      link: item.slug || String(item.id),
      url: `${SITE}/series/${item.slug || item.id}`,
      image: posterUrl(item.poster),
      episode: item.totalEpisodes ? String(item.totalEpisodes) : '',
      status: item.status || item.releaseType || '',
      score: item.score || null,
      source: 'oploverz'
    };
  }

  formatEpisodeCard(ep) {
    const series = ep.series || {};
    const title = cleanTitle(series.title);
    const epNum = ep.episodeNumber || '';
    return {
      title: epNum ? `${title} — Eps ${epNum}` : title,
      link: series.slug || String(series.id || ''),
      url: series.slug ? `${SITE}/series/${series.slug}/episode/${epNum}` : '',
      image: posterUrl(series.poster),
      episode: epNum ? String(epNum) : '',
      status: ep.subbed || 'Sub',
      source: 'oploverz'
    };
  }

  async home(page = 1) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    // Episode terbaru = update paling fresh
    const data = await fetchJSON(`${API}/api/episodes?page=${p}`);
    const items = (data.data || []).map((ep) => this.formatEpisodeCard(ep));
    const meta = data.meta || {};
    return {
      page: meta.currentPage || p,
      hasNextPage: (meta.currentPage || p) < (meta.lastPage || 1),
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
      `${API}/api/series?q=${encodeURIComponent(String(query))}&page=${p}`
    );
    const items = (data.data || []).map((s) => this.formatSeries(s));
    const meta = data.meta || {};
    return {
      page: meta.currentPage || p,
      hasNextPage: (meta.currentPage || p) < (meta.lastPage || 1),
      items
    };
  }

  async detail(query) {
    let slug = String(query || '').trim();
    if (slug.startsWith('http')) {
      try {
        const path = new URL(slug).pathname;
        const m = path.match(/\/series\/([^/]+)/);
        slug = m ? m[1] : path.replace(/^\/+/, '');
      } catch (_) {}
    }
    slug = slug.replace(/^\/+/, '').split('/')[0];
    if (!slug) throw new Error('Slug anime tidak valid');

    const seriesRes = await fetchJSON(`${API}/api/series/${encodeURIComponent(slug)}`);
    const series = seriesRes.data || seriesRes;
    if (!series || !series.slug) throw new Error('Anime tidak ditemukan di Oploverz');

    let episodes = [];
    try {
      const epRes = await fetchJSON(
        `${API}/api/series/${encodeURIComponent(series.slug)}/episodes`
      );
      const list = epRes.data || [];
      // fetch all pages if needed
      const meta = epRes.meta || {};
      const all = [...list];
      for (let page = 2; page <= (meta.lastPage || 1) && page <= 20; page += 1) {
        const more = await fetchJSON(
          `${API}/api/series/${encodeURIComponent(series.slug)}/episodes?page=${page}`
        );
        (more.data || []).forEach((e) => all.push(e));
      }
      episodes = all
        .map((ep) => {
          const num = ep.episodeNumber || '';
          return {
            number: num,
            title: `Eps ${num}${ep.subbed ? ` (${ep.subbed})` : ''}`,
            url: `oplometa:${Buffer.from(
              JSON.stringify({
                id: ep.id,
                number: num,
                slug: series.slug,
                title: cleanTitle(series.title)
              })
            ).toString('base64url')}`,
            episodeId: ep.id
          };
        })
        .sort((a, b) => Number(a.number) - Number(b.number));
    } catch (_) {
      episodes = [];
    }

    const genres = Array.isArray(series.genres)
      ? series.genres.map((g) => g.name).filter(Boolean).join(', ')
      : '';
    const facts = [
      series.releaseType,
      series.status,
      series.totalEpisodes ? `${series.totalEpisodes} episode` : '',
      series.score ? `Skor ${series.score}` : '',
      series.studio && series.studio.name
    ]
      .filter(Boolean)
      .join(' | ');

    return {
      title: cleanTitle(series.title),
      poster: posterUrl(series.poster),
      description: [facts, genres, series.description || ''].filter(Boolean).join('\n\n'),
      episodes,
      url: `${SITE}/series/${series.slug}`,
      slug: series.slug
    };
  }

  async episode(url) {
    const raw = String(url || '').trim();
    if (!raw) throw new Error('URL episode tidak valid');

    let episodeId = null;
    let title = '';

    if (raw.startsWith('oplometa:')) {
      try {
        const meta = JSON.parse(Buffer.from(raw.slice('oplometa:'.length), 'base64url').toString('utf8'));
        episodeId = meta.id;
        title = meta.title
          ? `${meta.title} — Eps ${meta.number || ''}`
          : `Episode ${meta.number || ''}`;
      } catch (_) {
        throw new Error('Meta episode tidak valid');
      }
    } else if (/^\d+$/.test(raw)) {
      episodeId = raw;
    } else {
      // /series/slug/episode/N — resolve via series episodes
      try {
        const u = new URL(raw.startsWith('http') ? raw : SITE + raw);
        const m = u.pathname.match(/\/series\/([^/]+)\/episode\/([^/]+)/);
        if (m) {
          const slug = m[1];
          const num = m[2];
          const epRes = await fetchJSON(
            `${API}/api/series/${encodeURIComponent(slug)}/episodes`
          );
          const found = (epRes.data || []).find(
            (e) => String(e.episodeNumber) === String(num)
          );
          if (found) {
            episodeId = found.id;
            title = `Episode ${num}`;
          }
        }
      } catch (_) {}
    }

    if (!episodeId) throw new Error('Episode tidak ditemukan');

    const res = await fetchJSON(`${API}/api/episodes/${encodeURIComponent(episodeId)}`);
    const ep = res.data || res;
    if (!ep) throw new Error('Episode tidak ditemukan');

    const series = ep.series || {};
    if (!title) {
      title = cleanTitle(series.title);
      if (ep.episodeNumber) title += ` — Eps ${ep.episodeNumber}`;
    }

    const servers = [];
    const streams = Array.isArray(ep.streamUrl) ? ep.streamUrl : [];
    streams.forEach((s) => {
      if (s && s.url) {
        servers.push({
          label: s.source || 'Stream',
          iframe: s.url
        });
      }
    });

    const downloads = [];
    const dls = Array.isArray(ep.downloadUrl) ? ep.downloadUrl : [];
    dls.forEach((block) => {
      (block.resolutions || []).forEach((r) => {
        (r.download_links || []).forEach((link) => {
          if (link && link.url) {
            downloads.push({
              label: `${link.host || 'Download'} ${r.quality || ''}`.trim(),
              url: link.url
            });
          }
        });
      });
    });

    if (servers.length === 0 && downloads.length === 0) {
      throw new Error('Tidak ada server streaming untuk episode ini');
    }

    return {
      title,
      servers,
      downloads,
      watchLinks: series.slug
        ? [
            {
              label: 'Buka di Oploverz',
              url: `${SITE}/series/${series.slug}/episode/${ep.episodeNumber || '1'}`
            }
          ]
        : []
    };
  }
}

module.exports = OploverzScraper;
