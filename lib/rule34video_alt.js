const axios = require('axios');
const { pickImg } = require('./imgutil');
const cheerio = require('cheerio');
const https = require('https');

const BASE_URL = 'https://rule34video.com';
let uaIndex = 0;

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1'
];

function getHeaders(referer) {
  const ua = userAgents[uaIndex % userAgents.length];
  uaIndex++;
  return {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': referer || BASE_URL + '/',
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

function clean(obj) {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) {
    const cleaned = obj.map(i => clean(i)).filter(i => i !== undefined);
    return cleaned.length ? cleaned : undefined;
  }
  if (typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      const val = clean(obj[key]);
      if (val !== undefined) result[key] = val;
    }
    return Object.keys(result).length ? result : undefined;
  }
  return obj;
}

async function fetchHTML(url, referer = null) {
  const response = await axios({
    url,
    method: 'GET',
    headers: getHeaders(referer || url),
    timeout: 30000,
    httpsAgent: new https.Agent({ rejectUnauthorized: false, keepAlive: true }),
    maxRedirects: 5,
    decompress: true,
    validateStatus: status => status >= 200 && status < 400
  });
  return response.data;
}

function extractPagination($) {
  let next = null;
  const nextEl = $('.pagination .next, .next a, a:contains("Next"), a[rel="next"]');
  if (nextEl.length) {
    const href = nextEl.attr('href');
    if (href) next = href;
  }
  if (!next) {
    const lastPage = $('.pagination .item:not(.active) a').last();
    if (lastPage.length) {
      const href = lastPage.attr('href');
      if (href) next = href;
    }
  }
  return next;
}

function extractVideoSources(html) {
  const sources = {};
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const scriptContent = match[1];
    const patterns = {
      '360p': /video_url\s*[:=]\s*["']([^"']+)["']/,
      '480p': /video_alt_url\s*[:=]\s*["']([^"']+)["']/,
      '720p': /video_alt_url2\s*[:=]\s*["']([^"']+)["']/,
      '1080p': /video_alt_url3\s*[:=]\s*["']([^"']+)["']/
    };
    for (const [quality, pattern] of Object.entries(patterns)) {
      const m = scriptContent.match(pattern);
      if (m && m[1]) {
        sources[quality] = decodeURIComponent(m[1]);
      }
    }
  }
  if (Object.keys(sources).length === 0) {
    const linkRegex = /href=["']([^"']*get_file[^"']*\.mp4[^"']*)["']/gi;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const url = linkMatch[1];
      let quality = 'unknown';
      if (url.includes('_1080p')) quality = '1080p';
      else if (url.includes('_720p')) quality = '720p';
      else if (url.includes('_480p')) quality = '480p';
      else if (url.includes('_360p') || url.includes('_360.mp4')) quality = '360p';
      if (!sources[quality]) {
        sources[quality] = url;
      }
    }
  }
  const thumbMatch = html.match(/preview_url\s*[:=]\s*["']([^"']+)["']/);
  if (thumbMatch) {
    sources['thumbnail'] = thumbMatch[1];
  } else {
    const jsonLdMatch = html.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
      try {
        const json = JSON.parse(jsonLdMatch[1]);
        if (json && json.thumbnailUrl) {
          sources['thumbnail'] = json.thumbnailUrl;
        }
      } catch(e) {}
    }
  }
  return sources;
}

function generateDownloadLinks(videoSources, title) {
  const links = [];
  const qualities = ['1080p', '720p', '480p', '360p'];
  const filename = title ? title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() : 'video';
  for (const quality of qualities) {
    if (videoSources[quality]) {
      let url = videoSources[quality];
      if (!url.includes('download=true')) {
        url = url.includes('?') ? url + '&download=true' : url + '?download=true';
      }
      if (!url.includes('download_filename=')) {
        const ext = quality === '360p' ? '360.mp4' : quality + '.mp4';
        url = url + `&download_filename=${filename}_${ext}`;
      }
      links.push({ quality, url });
    }
  }
  return links;
}

class Rule34VideoScraper {
  constructor() {
    this.creator = 'rynaqrtz';
    this.baseUrl = BASE_URL;
  }

  async search(query, page = 1, limit = 20) {
    const url = page === 1
      ? this.baseUrl + `/search/${encodeURIComponent(query)}/`
      : this.baseUrl + `/search/${encodeURIComponent(query)}/${page}/`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const items = [];
    $('.thumb, .thumb-block, .video-thumb').each((i, el) => {
      if (limit && i >= limit) return false;
      const $el = $(el);
      const linkEl = $el.find('a[href*="/video/"]').first();
      const link = linkEl.attr('href');
      const title = linkEl.attr('title') || linkEl.find('img').attr('alt') || '';
      const poster = pickImg($el.find('img').first(), this.baseUrl);
      if (link) {
        items.push({ title, url: link.startsWith('http') ? link : this.baseUrl + link, poster });
      }
    });
    const next = extractPagination($);
    return clean({
      creator: this.creator,
      page: 'search',
      data: { query, url, count: items.length, currentPage: page, items, next: next ? (next.startsWith('http') ? next : this.baseUrl + next) : null }
    });
  }

  async popular(page = 1, limit = 20) {
    const url = page === 1 ? this.baseUrl + '/most-popular/' : this.baseUrl + `/most-popular/${page}/`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const items = [];
    $('.thumb, .thumb-block, .video-thumb').each((i, el) => {
      if (limit && i >= limit) return false;
      const $el = $(el);
      const linkEl = $el.find('a[href*="/video/"]').first();
      const link = linkEl.attr('href');
      const title = linkEl.attr('title') || linkEl.find('img').attr('alt') || '';
      const poster = pickImg($el.find('img').first(), this.baseUrl);
      if (link) {
        items.push({ title, url: link.startsWith('http') ? link : this.baseUrl + link, poster });
      }
    });
    const next = extractPagination($);
    return clean({
      creator: this.creator,
      page: 'popular',
      data: { url, count: items.length, currentPage: page, items, next: next ? (next.startsWith('http') ? next : this.baseUrl + next) : null }
    });
  }

  async detail(url) {
    const fullUrl = url.startsWith('http') ? url : this.baseUrl + url;
    const html = await fetchHTML(fullUrl);
    const $ = cheerio.load(html);
    const videoIdMatch = fullUrl.match(/\/video\/(\d+)/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;
    const title = $('h1.title_video, h1, .title, .video-title').first().text().trim() ||
                  $('meta[property="og:title"]').attr('content') ||
                  $('title').text().replace(' - Rule34Video', '').trim() || '';
    const poster = $('meta[property="og:image"]').attr('content') ||
                   $('.poster img, .video-poster img').first().attr('src') || null;
    const description = $('meta[name="description"]').attr('content') ||
                        $('.desc, .description, .video-desc').first().text().trim() || null;
    let views = null;
    const viewsEl = $('.item_info svg.custom-eye ~ span, .views, .view-count, .video-views').first();
    if (viewsEl.length) {
      const viewsText = viewsEl.text().trim();
      const match = viewsText.match(/([\d,.]+)/);
      if (match) views = parseInt(match[1].replace(/,/g, ''));
    }
    let likes = null;
    let likePercent = null;
    const likesEl = $('.voters.count, .likes, .rating').first();
    if (likesEl.length) {
      const likesText = likesEl.text().trim();
      const percentMatch = likesText.match(/(\d+)%/);
      if (percentMatch) likePercent = parseInt(percentMatch[1]);
      const countMatch = likesText.match(/(\d+[\d,]*)/);
      if (countMatch) likes = parseInt(countMatch[1].replace(/,/g, ''));
    }
    let duration = null;
    const durationEl = $('.item_info svg.custom-time ~ span, .duration, .video-duration').first();
    if (durationEl.length) duration = durationEl.text().trim();
    let uploadDate = null;
    const dateEl = $('.item_info svg.custom-calendar ~ span, .upload-date, .date').first();
    if (dateEl.length) uploadDate = dateEl.text().trim();
    const categories = [];
    $('.col[data-suggest-type="category"] .video_meta_pill .name, .category-item a, .video-category').each((i, el) => {
      const cat = $(el).text().trim();
      if (cat) categories.push(cat);
    });
    const artists = [];
    $('.col[data-suggest-type="model"] .video_meta_pill .name, .artist-item a, .video-artist').each((i, el) => {
      const artist = $(el).text().trim();
      if (artist) artists.push(artist);
    });
    let uploader = null;
    const uploaderEl = $('.uploader, .user, .username, .member-link').first();
    if (uploaderEl.length) uploader = uploaderEl.text().trim();
    const tags = [];
    $('.wrap[data-suggest-type="tag"] .tag_item, .tag-item a, a[href*="/tags/"]').each((i, el) => {
      const tag = $(el).text().trim();
      if (tag && tag.length > 1 && !tag.includes('#')) {
        tags.push(tag);
      }
    });
    const videoSources = extractVideoSources(html);
    const downloadLinks = generateDownloadLinks(videoSources, title);
    return clean({
      creator: this.creator,
      page: 'detail',
      data: {
        url: fullUrl,
        videoId,
        title,
        poster,
        description,
        views,
        likes,
        likePercent,
        duration,
        uploadDate,
        categories,
        artists,
        uploader,
        tags,
        videoSources,
        downloadLinks,
        hasVideo: Object.keys(videoSources).length > 0
      }
    });
  }

  async models(page = 1, limit = 50) {
    const url = page === 1 ? this.baseUrl + '/models/' : this.baseUrl + `/models/${page}/`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const items = [];
    $('.list_items .item, .model-item, .model-block').each((i, el) => {
      if (limit && i >= limit) return false;
      const $el = $(el);
      const linkEl = $el.find('a[href*="/models/"]').first();
      const link = linkEl.attr('href');
      const name = linkEl.find('.name').text().trim() || linkEl.attr('title') || '';
      const poster = pickImg($el.find('img').first(), this.baseUrl);
      const rating = $el.find('.count span').text().trim() || null;
      if (link && name) {
        items.push({ name, url: link.startsWith('http') ? link : this.baseUrl + link, poster, rating });
      }
    });
    const next = extractPagination($);
    return clean({
      creator: this.creator,
      page: 'models',
      data: { url, count: items.length, currentPage: page, items, next: next ? (next.startsWith('http') ? next : this.baseUrl + next) : null }
    });
  }

  async modelDetail(slug, page = 1, limit = 20) {
    const url = page === 1 ? this.baseUrl + `/models/${slug}/` : this.baseUrl + `/models/${slug}/${page}/`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const items = [];
    $('.thumb, .thumb-block, .video-thumb').each((i, el) => {
      if (limit && i >= limit) return false;
      const $el = $(el);
      const linkEl = $el.find('a[href*="/video/"]').first();
      const link = linkEl.attr('href');
      const title = linkEl.attr('title') || linkEl.find('img').attr('alt') || '';
      const poster = pickImg($el.find('img').first(), this.baseUrl);
      if (link) {
        items.push({ title, url: link.startsWith('http') ? link : this.baseUrl + link, poster });
      }
    });
    const next = extractPagination($);
    return clean({
      creator: this.creator,
      page: 'model_detail',
      data: { slug, url, count: items.length, currentPage: page, items, next: next ? (next.startsWith('http') ? next : this.baseUrl + next) : null }
    });
  }

  async tags(page = 1, limit = 50) {
    const url = page === 1 ? this.baseUrl + '/tags/' : this.baseUrl + `/tags/${page}/`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const items = [];
    $('.tags-holder .column .item, .tag-item, .tag-block').each((i, el) => {
      if (limit && i >= limit) return false;
      const $el = $(el);
      const linkEl = $el.find('a').first();
      const link = linkEl.attr('href');
      const name = linkEl.contents().filter((_, node) => node.type === 'text').text().trim() || linkEl.attr('title') || '';
      const countText = linkEl.find('span').text().trim() || '';
      const count = countText.replace(/,/g, '').trim();
      if (link && name) {
        items.push({ name, count: count ? parseInt(count) : null, url: link.startsWith('http') ? link : this.baseUrl + link });
      }
    });
    const next = extractPagination($);
    return clean({
      creator: this.creator,
      page: 'tags',
      data: { url, count: items.length, currentPage: page, items, next: next ? (next.startsWith('http') ? next : this.baseUrl + next) : null }
    });
  }

  async tagDetail(slug, page = 1, limit = 20) {
    const url = page === 1 ? this.baseUrl + `/tags/${slug}/` : this.baseUrl + `/tags/${slug}/${page}/`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const items = [];
    $('.thumb, .thumb-block, .video-thumb').each((i, el) => {
      if (limit && i >= limit) return false;
      const $el = $(el);
      const linkEl = $el.find('a[href*="/video/"]').first();
      const link = linkEl.attr('href');
      const title = linkEl.attr('title') || linkEl.find('img').attr('alt') || '';
      const poster = pickImg($el.find('img').first(), this.baseUrl);
      if (link) {
        items.push({ title, url: link.startsWith('http') ? link : this.baseUrl + link, poster });
      }
    });
    const next = extractPagination($);
    return clean({
      creator: this.creator,
      page: 'tag_detail',
      data: { slug, url, count: items.length, currentPage: page, items, next: next ? (next.startsWith('http') ? next : this.baseUrl + next) : null }
    });
  }

  async categories(limit = 50) {
    const url = this.baseUrl + '/categories/';
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const items = [];
    $('.thumb.item, .category-item, .cat-item').each((i, el) => {
      if (limit && i >= limit) return false;
      const $el = $(el);
      const linkEl = $el.find('a.th, a[href*="/categories/"]').first();
      const link = linkEl.attr('href');
      const name = linkEl.find('.thumb_title').text().trim() || linkEl.attr('title') || '';
      const poster = pickImg($el.find('img').first(), this.baseUrl);
      if (link && name) {
        items.push({ name, url: link.startsWith('http') ? link : this.baseUrl + link, poster });
      }
    });
    return clean({
      creator: this.creator,
      page: 'categories',
      data: { url, count: items.length, items }
    });
  }

  async categoryDetail(slug, page = 1, limit = 20) {
    const url = page === 1 ? this.baseUrl + `/categories/${slug}/` : this.baseUrl + `/categories/${slug}/${page}/`;
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const items = [];
    $('.thumb, .thumb-block, .video-thumb').each((i, el) => {
      if (limit && i >= limit) return false;
      const $el = $(el);
      const linkEl = $el.find('a[href*="/video/"]').first();
      const link = linkEl.attr('href');
      const title = linkEl.attr('title') || linkEl.find('img').attr('alt') || '';
      const poster = pickImg($el.find('img').first(), this.baseUrl);
      if (link) {
        items.push({ title, url: link.startsWith('http') ? link : this.baseUrl + link, poster });
      }
    });
    const next = extractPagination($);
    return clean({
      creator: this.creator,
      page: 'category_detail',
      data: { slug, url, count: items.length, currentPage: page, items, next: next ? (next.startsWith('http') ? next : this.baseUrl + next) : null }
    });
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const params = args.slice(1);
  const scraper = new Rule34VideoScraper();

  (async () => {
    let result;
    try {
      switch (command) {
        case 'search':
          if (!params[0]) throw new Error('Query required');
          result = await scraper.search(params[0], parseInt(params[1]) || 1, parseInt(params[2]) || 20);
          break;
        case 'popular':
          result = await scraper.popular(parseInt(params[0]) || 1, parseInt(params[1]) || 20);
          break;
        case 'detail':
          if (!params[0]) throw new Error('URL required');
          result = await scraper.detail(params[0]);
          break;
        case 'models':
          result = await scraper.models(parseInt(params[0]) || 1, parseInt(params[1]) || 50);
          break;
        case 'model':
          if (!params[0]) throw new Error('Model slug required');
          result = await scraper.modelDetail(params[0], parseInt(params[1]) || 1, parseInt(params[2]) || 20);
          break;
        case 'tags':
          result = await scraper.tags(parseInt(params[0]) || 1, parseInt(params[1]) || 50);
          break;
        case 'tag':
          if (!params[0]) throw new Error('Tag slug required');
          result = await scraper.tagDetail(params[0], parseInt(params[1]) || 1, parseInt(params[2]) || 20);
          break;
        case 'categories':
          result = await scraper.categories(parseInt(params[0]) || 50);
          break;
        case 'category':
          if (!params[0]) throw new Error('Category slug required');
          result = await scraper.categoryDetail(params[0], parseInt(params[1]) || 1, parseInt(params[2]) || 20);
          break;
        default:
          console.error(`Unknown command: ${command}`);
          console.log(`
Commands:
  search <query> [page] [limit]      - Search videos
  popular [page] [limit]             - Most popular videos
  detail <url>                       - Get video detail + download links
  models [page] [limit]              - List models
  model <slug> [page] [limit]        - Videos by model
  tags [page] [limit]                - List tags
  tag <slug> [page] [limit]          - Videos by tag
  categories [limit]                 - List categories
  category <slug> [page] [limit]     - Videos in category
          `);
          process.exit(1);
      }
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error(JSON.stringify({ error: err.message }));
      process.exit(1);
    }
  })();
}

module.exports = Rule34VideoScraper;
