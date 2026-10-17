const https = require('https');
const http = require('http');
const { URL } = require('url');

const SITE = 'https://nontonime.fadelsm.biz.id';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// TanStack serverFn hashes (dari network capture)
const FN = {
  home: '30b6926db383f0651370d0c1107cf7f401a57c6c1964b60c98026c93857020db',
  search: 'b30967fcfcc8b65ab62763aafbc51f7c7d9e782b21f7e94053a6a36e1dc72890',
  detail: '7b5e390f4d9032b89d85b4af2a2dc22c797794631bc1e589e9f6c2a83ab1df40'
};

const PROVIDER_MAP = {
  sh: 'samehadaku',
  ng: 'nimegami',
  aw: 'aniwatch',
  od: 'otakudesu'
};

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
          Accept: '*/*',
          Referer: SITE + '/',
          Origin: SITE
        },
        timeout: 18000
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout Nontonime'));
    });
    req.end();
  });
}

function encodePayload(obj) {
  return encodeURIComponent(JSON.stringify(obj));
}

function payloadData(fields) {
  // TanStack serialized form: { t: { t:10, i:0, p:{k:['data'], v:[inner]} }, f:127, m:[] }
  const keys = Object.keys(fields);
  const values = keys.map((k) => {
    const v = fields[k];
    if (typeof v === 'number') return { t: 0, s: v };
    return { t: 1, s: String(v) };
  });
  return {
    t: {
      t: 10,
      i: 0,
      p: {
        k: ['data'],
        v: [{ t: 10, i: 1, p: { k: keys, v: values }, o: 0 }]
      },
      o: 0
    },
    f: 127,
    m: []
  };
}

function extractStrings(raw) {
  // pull "s":"value" pairs and rebuild rough objects from repeated key order
  const items = [];
  // id / title / poster sequences in home response
  const re =
    /"s":"((?:sh|ng|aw|od)_[^"]+)"\s*\},?\s*\{"t":1,"s":"((?:\\.|[^"\\])*)"\s*\},?\s*\{"t":1,"s":"(https?:[^"]+|\/api\/[^"]*)"/g;
  let m;
  while ((m = re.exec(raw))) {
    items.push({
      id: m[1],
      title: m[2].replace(/\\"/g, '"'),
      poster: m[3].startsWith('http') ? m[3] : SITE + m[3]
    });
  }
  return items;
}

function providerFromId(id) {
  const prefix = String(id || '').split('_')[0];
  return PROVIDER_MAP[prefix] || 'samehadaku';
}

class NontonimeScraper {
  constructor() {
    this.baseUrl = SITE;
  }

  async serverFn(hash, fields) {
    const payload = encodePayload(payloadData(fields));
    const url = `${SITE}/_serverFn/${hash}?payload=${payload}`;
    const { status, body } = await fetchText(url);
    if (status >= 400) throw new Error(`Nontonime HTTP ${status}`);
    if (body === 'Forbidden' || body.startsWith('<!')) throw new Error('Nontonime menolak request');
    return body;
  }

  formatItem(it) {
    return {
      title: it.title,
      link: it.id,
      url: `${SITE}/anime/${it.id}`,
      image: it.poster || '',
      episode: '',
      status: '',
      source: 'nontonime'
    };
  }

  async home(page = 1) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    // try samehadaku then otakudesu provider
    let items = [];
    for (const provider of ['samehadaku', 'otakudesu', 'nimegami']) {
      try {
        const raw = await this.serverFn(FN.home, { page: p, provider });
        items = extractStrings(raw);
        if (items.length) break;
      } catch (_) {}
    }
    if (!items.length) {
      // fallback SSR home HTML
      const { body } = await fetchText(SITE + '/');
      items = extractStrings(body);
    }
    return {
      page: p,
      hasNextPage: items.length >= 10,
      items: items.map((i) => this.formatItem(i))
    };
  }

  async ongoing(page = 1) {
    return this.home(page);
  }

  async search(query, page = 1) {
    if (!query) throw new Error('Kata kunci wajib');
    const p = Math.max(1, parseInt(page, 10) || 1);
    let items = [];
    for (const provider of ['samehadaku', 'otakudesu']) {
      try {
        const raw = await this.serverFn(FN.search, {
          keyword: String(query),
          page: p,
          provider
        });
        items = extractStrings(raw);
        if (items.length) break;
      } catch (_) {}
    }
    return {
      page: p,
      hasNextPage: items.length >= 10,
      items: items.map((i) => this.formatItem(i))
    };
  }

  async detail(query) {
    let id = String(query || '').trim();
    if (id.startsWith('http')) {
      try {
        const path = new URL(id).pathname;
        const m = path.match(/\/anime\/([^/]+)/);
        id = m ? m[1] : id;
      } catch (_) {}
    }
    id = id.replace(/^\/+/, '').split('/')[0];
    if (!id) throw new Error('ID anime tidak valid');

    const provider = providerFromId(id);
    const raw = await this.serverFn(FN.detail, { id, provider });

    const titleM = raw.match(/"s":"((?:sh|ng|aw|od)_[^"]+)"\s*\},?\s*\{"t":1,"s":"((?:\\.|[^"\\])*)"/);
    const title = titleM ? titleM[2] : id;
    const synopsisM = raw.match(/"s":"((?:Second season|[^"]{20,200}))"/);
    const synopsis = synopsisM ? synopsisM[1] : '';

    // episodes: id like sh_ep_...
    const episodes = [];
    const epRe =
      /"s":"((?:sh|ng|aw|od)_ep_[^"]+)"\s*\},?\s*\{"t":0,"s":(\d+)\s*\},?\s*\{"t":1,"s":"((?:\\.|[^"\\])*)"/g;
    let em;
    while ((em = epRe.exec(raw))) {
      episodes.push({
        number: em[2],
        title: `Eps ${em[2]}`,
        url: `nimetameta:${Buffer.from(
          JSON.stringify({ animeId: id, episodeId: em[1], number: em[2], provider, title })
        ).toString('base64url')}`
      });
    }
    episodes.sort((a, b) => Number(a.number) - Number(b.number));

    const posterM = raw.match(/"s":"(https?:[^"]+|\/api\/image-proxy[^"]*)"/);
    let poster = posterM ? posterM[1] : '';
    if (poster.startsWith('/')) poster = SITE + poster;

    return {
      title,
      poster,
      description: synopsis,
      episodes,
      url: `${SITE}/anime/${id}`
    };
  }

  async episode(url) {
    const raw = String(url || '').trim();
    let meta = null;
    if (raw.startsWith('nimetameta:')) {
      meta = JSON.parse(Buffer.from(raw.slice('nimetameta:'.length), 'base64url').toString('utf8'));
    }
    if (!meta) throw new Error('Episode meta tidak valid');

    // Stream embeds are behind protected player; berikan link tonton di Nontonime + fallback info
    const watchUrl = `${SITE}/anime/${meta.animeId}`;
    return {
      title: `${meta.title || meta.animeId} — Eps ${meta.number}`,
      servers: [],
      downloads: [],
      watchLinks: [
        { label: `Nonton Eps ${meta.number} di Nontonime`, url: watchUrl },
        { label: 'Buka halaman anime', url: watchUrl }
      ]
    };
  }
}

module.exports = NontonimeScraper;
