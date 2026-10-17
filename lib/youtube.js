const axios = require('axios');

const API = 'https://www.googleapis.com/youtube/v3';
const CHANNEL_HANDLES = (process.env.YOUTUBE_CHANNEL_HANDLES || 'MuseAsia,AniOneAsia')
  .split(',')
  .map((handle) => handle.trim().replace(/^@/, ''))
  .filter(Boolean);
const PAGE_SIZE = 24;
const CACHE_MS = 30 * 60 * 1000;
const MAX_PLAYLIST_PAGES = 3;
const HIDDEN_TITLES = new Set(['Private video', 'Deleted video']);

const channelCache = new Map();
let playlistCache = { at: 0, items: [] };

class YouTubeScraper {
  constructor() {
    this.baseUrl = 'https://www.youtube.com';
  }

  apiKey() {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) throw new Error('YOUTUBE_API_KEY belum diisi di Environment Variables');
    return key;
  }

  async api(path, params) {
    const response = await axios.get(`${API}/${path}`, {
      params: { key: this.apiKey(), ...params },
      timeout: 10000
    });
    return response.data;
  }

  async channelId(handle) {
    if (channelCache.has(handle)) return channelCache.get(handle);
    const data = await this.api('channels', { part: 'id', forHandle: handle });
    const id = data.items && data.items[0] ? data.items[0].id : null;
    if (id) channelCache.set(handle, id);
    return id;
  }

  async playlistsOfChannel(channelId) {
    const collected = [];
    let pageToken;
    for (let i = 0; i < MAX_PLAYLIST_PAGES; i += 1) {
      const data = await this.api('playlists', {
        part: 'snippet,contentDetails',
        channelId,
        maxResults: 50,
        pageToken
      });
      (data.items || []).forEach((playlist) => collected.push(playlist));
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return collected;
  }

  async allPlaylists() {
    if (Date.now() - playlistCache.at < CACHE_MS && playlistCache.items.length > 0) return playlistCache.items;
    const ids = (await Promise.all(CHANNEL_HANDLES.map((handle) => this.channelId(handle).catch(() => null)))).filter(Boolean);
    if (ids.length === 0) throw new Error('Channel resmi tidak ditemukan');
    const lists = await Promise.all(ids.map((id) => this.playlistsOfChannel(id)));
    const items = [];
    lists.forEach((list) => list.forEach((playlist) => {
      const count = playlist.contentDetails ? playlist.contentDetails.itemCount : 0;
      if (!count) return;
      const thumbs = playlist.snippet.thumbnails || {};
      const thumb = thumbs.high || thumbs.medium || thumbs.default || {};
      items.push({
        title: playlist.snippet.title,
        link: playlist.id,
        image: thumb.url || '',
        episode: count,
        status: 'Resmi',
        channel: playlist.snippet.channelTitle || ''
      });
    }));
    playlistCache = { at: Date.now(), items };
    return items;
  }

  paginate(items, page) {
    const current = Math.max(parseInt(page, 10) || 1, 1);
    const start = (current - 1) * PAGE_SIZE;
    return { page: current, hasNextPage: start + PAGE_SIZE < items.length, items: items.slice(start, start + PAGE_SIZE) };
  }

  async home(page = 1) {
    return this.paginate(await this.allPlaylists(), page);
  }

  async ongoing(page = 1) {
    return this.home(page);
  }

  async search(query, page = 1) {
    if (!query) throw new Error('Kata kunci pencarian wajib diisi');
    const needle = String(query).toLowerCase();
    const all = await this.allPlaylists();
    return this.paginate(all.filter((item) => item.title.toLowerCase().includes(needle)), page);
  }

  async detail(playlistId) {
    const id = String(playlistId || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!id) throw new Error('ID playlist tidak valid');
    const info = await this.api('playlists', { part: 'snippet', id });
    const playlist = info.items && info.items[0];
    if (!playlist) throw new Error('Playlist tidak ditemukan');

    const episodes = [];
    let pageToken;
    for (let i = 0; i < 2; i += 1) {
      const data = await this.api('playlistItems', { part: 'snippet', playlistId: id, maxResults: 50, pageToken });
      (data.items || []).forEach((entry) => {
        const snippet = entry.snippet;
        if (!snippet || HIDDEN_TITLES.has(snippet.title) || !snippet.resourceId) return;
        episodes.push({
          title: snippet.title,
          url: `https://www.youtube.com/watch?v=${snippet.resourceId.videoId}`
        });
      });
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    const thumbs = playlist.snippet.thumbnails || {};
    const thumb = thumbs.high || thumbs.medium || thumbs.default || {};
    return {
      title: playlist.snippet.title,
      poster: thumb.url || '',
      description: playlist.snippet.description || '',
      episodes
    };
  }

  async episode(url) {
    const parsed = new URL(String(url));
    const videoId = (parsed.searchParams.get('v') || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!videoId) throw new Error('Video tidak valid');
    const embedFor = (params) => `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&playsinline=1&${params}`;
    return {
      title: '',
      servers: [
        { label: 'Sub Indonesia', iframe: embedFor('cc_load_policy=1&cc_lang_pref=id&hl=id') },
        { label: 'Sub English', iframe: embedFor('cc_load_policy=1&cc_lang_pref=en&hl=en') },
        { label: 'Tanpa subtitle', iframe: embedFor('cc_load_policy=0') }
      ],
      watchLinks: [{ label: 'Buka di YouTube', url: `https://www.youtube.com/watch?v=${videoId}` }]
    };
  }
}

module.exports = YouTubeScraper;
