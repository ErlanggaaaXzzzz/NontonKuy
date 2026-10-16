const https = require('https');
const http = require('http');

const BASE = 'https://xanimu.com';
const API = `${BASE}/wp-json/wp/v2`;
const AJAX = `${BASE}/ajax-custom.php`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36';

function fetchBuffer(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: options.method || 'GET',
      headers: Object.assign({ 'User-Agent': UA, Accept: options.accept || 'application/json' }, options.headers || {}),
      timeout: options.timeout || 15000,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks),
        text: () => Buffer.concat(chunks).toString('utf8'),
        json: () => { try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; } },
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function fetchJSON(url, params = {}) {
  params.per_page = params.per_page || 100;
  const qs = new URLSearchParams(params).toString();
  return fetchBuffer(`${url}?${qs}`).then(r => r.status === 200 ? r.json() : null);
}

function fetchHTML(url) {
  return fetchBuffer(url, { accept: 'text/html' }).then(r => r.status === 200 ? r.text() : '');
}

function wpPosts(page, perPage) {
  return fetchJSON(`${API}/posts`, { page: page || 1, per_page: perPage || 20, _embed: 'true' });
}

function wpCategories(page, perPage) {
  return fetchJSON(`${API}/categories`, { page: page || 1, per_page: perPage || 100, orderby: 'count', order: 'desc' });
}

function wpTags(page, perPage) {
  return fetchJSON(`${API}/tags`, { page: page || 1, per_page: perPage || 100, orderby: 'count', order: 'desc' });
}

function postsByCategory(catId, page, perPage) {
  return fetchJSON(`${API}/posts`, { categories: catId, page: page || 1, per_page: perPage || 20, _embed: 'true' });
}

function postsByTag(tagId, page, perPage) {
  return fetchJSON(`${API}/posts`, { tags: tagId, page: page || 1, per_page: perPage || 20, _embed: 'true' });
}

function searchPosts(query, page, perPage) {
  return fetchJSON(`${API}/posts`, { search: query, page: page || 1, per_page: perPage || 20, _embed: 'true' });
}

async function trailer(postId) {
  const body = new URLSearchParams({ action: 'kot_load_video_preview', post_id: postId, nonce: '' }).toString();
  const r = await fetchBuffer(AJAX, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  });
  if (r.status === 200) {
    const d = r.json();
    return d && d.success ? d.url : null;
  }
  return null;
}

function parseDetail(html) {
  const data = { title: '', poster: '', duration: '', views: 0, likes: '', description: '', tags: [], actors: [], videos: [], trailer: '', postId: 0 };

  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) data.title = titleMatch[1].replace(' - XAnimu.com', '').trim();

  const toStoreMatch = html.match(/const\s+toStore\s*=\s*(\{[^}]+\})/);
  if (toStoreMatch) {
    try {
      const store = JSON.parse(toStoreMatch[1].replace(/new Date\(\)/g, '"2026-01-01"'));
      data.postId = store.postId || 0;
      data.title = data.title || store.title || '';
      data.duration = store.length || '';
      data.views = store.views || 0;
      data.likes = store.likes || '';
      data.trailer = store.preview || '';
    } catch (e) {}
  }

  const videoRegex = /<video[^>]*poster="([^"]*)"[^>]*>([\s\S]*?)<\/video>/g;
  let vm;
  while ((vm = videoRegex.exec(html)) !== null) {
    if (vm[1] && !data.poster) data.poster = vm[1];
    const srcRegex = /<source\s+src="([^"]+)"[^>]*>/g;
    let sm;
    while ((sm = srcRegex.exec(vm[2])) !== null) {
      if (sm[1] && data.videos.indexOf(sm[1]) === -1) data.videos.push(sm[1]);
    }
  }

  const ldJsonRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let ldm;
  while ((ldm = ldJsonRegex.exec(html)) !== null) {
    try {
      const ld = JSON.parse(ldm[1]);
      const obj = Array.isArray(ld) ? (ld[0] || {}) : ld;
      if (obj['@type'] === 'VideoObject') {
        data.title = obj.name || data.title;
        data.description = obj.description || '';
        const dur = (obj.duration || '').replace('P0DT', '').replace('H', ':').replace('M', ':').replace('S', '').trim();
        if (dur) data.duration = dur;
        for (let i = 0; i < (obj.interactionStatistic || []).length; i++) {
          const stat = obj.interactionStatistic[i];
          const t = JSON.stringify(stat.interactionType || '');
          if (t.indexOf('WatchAction') !== -1) data.views = stat.userInteractionCount || 0;
          if (t.indexOf('LikeAction') !== -1) data.likes = stat.userInteractionCount || '';
        }
      }
    } catch (e) {}
  }

  const mp4Regex = /"(https?:\/\/[^"]*nosofiles[^"]*\.mp4[^"]*)"/g;
  let mm;
  while ((mm = mp4Regex.exec(html)) !== null) {
    const url = mm[1];
    if (url.indexOf('trailer') !== -1 || url.indexOf('preview') !== -1) {
      if (!data.trailer) data.trailer = url;
    } else {
      if (data.videos.indexOf(url) === -1) data.videos.push(url);
    }
  }

  const tagRegex = /<a[^>]+href="(\/[^"]*(?:\/tag\/|\/video-tags\/)[^"]*)"[^>]*>([^<]+)<\/a>/g;
  let tm;
  while ((tm = tagRegex.exec(html)) !== null) {
    const name = tm[2].trim();
    if (name) data.tags.push({ name: name, url: tm[1].indexOf('http') === 0 ? tm[1] : `${BASE}${tm[1]}` });
  }

  const actorRegex = /<a[^>]+href="(\/actor\/[^"]*)"[^>]*>([^<]+)<\/a>/g;
  let am;
  while ((am = actorRegex.exec(html)) !== null) {
    const name = am[2].trim();
    if (name) data.actors.push({ name: name, url: `${BASE}${am[1]}` });
  }

  const seenTags = new Map();
  data.tags = data.tags.filter(t => seenTags.has(t.name) ? false : (seenTags.set(t.name, true), true));
  const seenActors = new Map();
  data.actors = data.actors.filter(a => seenActors.has(a.name) ? false : (seenActors.set(a.name, true), true));

  return data;
}

function formatPost(p) {
  const embedded = p._embedded || {};
  const mediaArr = embedded['wp:featuredmedia'] || [];
  const media = mediaArr.length > 0 ? mediaArr[0] : null;
  return {
    id: p.id,
    title: typeof p.title === 'object' ? p.title.rendered : (p.title || ''),
    slug: p.slug || '',
    link: p.link || '',
    date: p.date || '',
    thumbnail: media ? media.source_url || '' : '',
  };
}

function formatPosts(posts) {
  return (posts || []).map(formatPost);
}

async function handleAction(action, query, opts) {
  var page = (opts && opts.page) || 1;
  var perPage = (opts && opts.perPage) || 20;

  switch (action) {
    case 'posts':
    case 'home':
      return formatPosts(await wpPosts(page, perPage));
    case 'detail':
      if (!query) throw new Error('URL diperlukan');
      return parseDetail(await fetchHTML(query));
    case 'search':
      if (!query) throw new Error('Keyword diperlukan');
      return formatPosts(await searchPosts(query, page, perPage));
    case 'categories':
      return await wpCategories(page, perPage);
    case 'tags':
      return await wpTags(page, perPage);
    case 'category':
      if (!query) throw new Error('Category ID diperlukan');
      return formatPosts(await postsByCategory(query, page, perPage));
    case 'tag':
      if (!query) throw new Error('Tag ID diperlukan');
      return formatPosts(await postsByTag(query, page, perPage));
    case 'trailer':
      if (!query) throw new Error('Post ID diperlukan');
      return await trailer(parseInt(query, 10));
    case 'embed':
      if (!query) throw new Error('Post ID diperlukan');
      return parseDetail(await fetchHTML(`${BASE}/embed/${query}`));
    default:
      throw new Error('Unknown action');
  }
}

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const q = req.query || {};
  try {
    const data = await handleAction(q.action || 'home', q.query, { page: parseInt(q.page, 10) || 1, perPage: parseInt(q.n, 10) || 20 });
    res.status(200).json(data || []);
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
};

module.exports = { handleAction, handler };

if (require.main === module) {
  const args = process.argv.slice(2);
  const action = args[0];
  const query = args[1];
  const pageFlag = args.indexOf('-pg');
  const nFlag = args.indexOf('-n');
  const jsonFlag = args.indexOf('-j') !== -1;
  const page = pageFlag !== -1 ? parseInt(args[pageFlag + 1], 10) || 1 : 1;
  const perPage = nFlag !== -1 ? parseInt(args[nFlag + 1], 10) || 20 : 20;

  if (!action) {
    console.log('Usage: node xanimu.js <action> [query] [-n N] [-pg PAGE] [-j]');
    console.log('Actions: posts | detail | search | categories | tags | category | tag | trailer | embed | home');
    process.exit(0);
  }

  handleAction(action, query, { page: page, perPage: perPage }).then(data => {
    if (jsonFlag) {
      console.log(JSON.stringify(data, null, 2));
    } else if (Array.isArray(data)) {
      data.forEach((item, i) => {
        if (item.title) console.log(`${i + 1}. ${item.title.slice(0, 80)}\n   ${item.link || ''}`);
      });
    } else if (typeof data === 'object' && data.videos) {
      console.log(`Title: ${data.title}`);
      console.log(`Duration: ${data.duration} | Views: ${data.views} | Likes: ${data.likes}`);
      console.log(`Poster: ${data.poster}`);
      console.log(`Post ID: ${data.postId}`);
      if (data.trailer) console.log(`Trailer: ${data.trailer}`);
      console.log(`Videos (${data.videos.length}):`);
      data.videos.forEach(v => console.log(`  ${v}`));
    } else if (typeof data === 'string') {
      console.log(data);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }).catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });
}
