const axios = require('axios');

const ENDPOINT = 'https://graphql.anilist.co';

const LIST_QUERY = `
query ($page: Int, $perPage: Int, $search: String, $sort: [MediaSort], $status: MediaStatus) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage currentPage }
    media(type: ANIME, search: $search, sort: $sort, status: $status, isAdult: false) {
      id
      title { romaji english }
      coverImage { large }
      episodes
      status
      averageScore
      format
      nextAiringEpisode { episode }
    }
  }
}`;

const DETAIL_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english native }
    description(asHtml: false)
    coverImage { extraLarge large }
    bannerImage
    episodes
    status
    season
    seasonYear
    genres
    averageScore
    format
    studios(isMain: true) { nodes { name } }
    trailer { id site }
    streamingEpisodes { title url site }
    externalLinks { site url type }
    nextAiringEpisode { episode }
  }
}`;

const STATUS_LABELS = {
  FINISHED: 'Tamat',
  RELEASING: 'Ongoing',
  NOT_YET_RELEASED: 'Segera',
  CANCELLED: 'Batal',
  HIATUS: 'Hiatus'
};

const cleanText = (text) => String(text || '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const pickTitle = (title) => (title && (title.english || title.romaji || title.native)) || 'Untitled';

class AniListScraper {
  constructor() {
    this.baseUrl = 'https://anilist.co';
  }

  async request(query, variables) {
    const response = await axios.post(
      ENDPOINT,
      { query, variables },
      { timeout: 12000, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
    );
    if (response.data && response.data.errors) {
      throw new Error(response.data.errors[0].message || 'AniList error');
    }
    return response.data.data;
  }

  formatItem(media) {
    const airedCount = media.nextAiringEpisode ? media.nextAiringEpisode.episode - 1 : media.episodes;
    return {
      title: pickTitle(media.title),
      link: String(media.id),
      image: media.coverImage ? media.coverImage.large : '',
      episode: airedCount || '',
      status: STATUS_LABELS[media.status] || '',
      score: media.averageScore || null
    };
  }

  async list(variables) {
    const data = await this.request(LIST_QUERY, { perPage: 24, ...variables });
    return {
      page: data.Page.pageInfo.currentPage,
      hasNextPage: data.Page.pageInfo.hasNextPage,
      items: data.Page.media.map((media) => this.formatItem(media))
    };
  }

  home(page = 1) {
    return this.list({ page, sort: ['TRENDING_DESC'] });
  }

  ongoing(page = 1) {
    return this.list({ page, sort: ['POPULARITY_DESC'], status: 'RELEASING' });
  }

  search(query, page = 1) {
    if (!query) throw new Error('Kata kunci pencarian wajib diisi');
    return this.list({ page, search: String(query), sort: ['SEARCH_MATCH'] });
  }

  async detail(id) {
    const numericId = parseInt(id, 10);
    if (!numericId) throw new Error('ID anime tidak valid');
    const { Media: media } = await this.request(DETAIL_QUERY, { id: numericId });
    if (!media) throw new Error('Anime tidak ditemukan');

    const servers = [];
    if (media.trailer && media.trailer.site === 'youtube' && media.trailer.id) {
      servers.push({ label: 'Trailer', iframe: `https://www.youtube.com/embed/${encodeURIComponent(media.trailer.id)}` });
    }

    const watchLinks = [];
    const seen = new Set();
    const addWatchLink = (site, url) => {
      if (!site || !url || seen.has(site)) return;
      seen.add(site);
      watchLinks.push({ label: site, url });
    };
    (media.streamingEpisodes || []).forEach((episode) => addWatchLink(episode.site, episode.url));
    (media.externalLinks || []).filter((link) => link.type === 'STREAMING').forEach((link) => addWatchLink(link.site, link.url));

    const studio = media.studios && media.studios.nodes[0] ? media.studios.nodes[0].name : '';
    const facts = [
      media.format,
      STATUS_LABELS[media.status],
      media.episodes ? `${media.episodes} episode` : '',
      media.seasonYear ? `${media.season || ''} ${media.seasonYear}`.trim() : '',
      media.averageScore ? `Skor ${media.averageScore}/100` : '',
      studio
    ].filter(Boolean).join(' | ');
    const genres = (media.genres || []).join(', ');
    const description = [facts, genres, cleanText(media.description)].filter(Boolean).join('\n\n');

    return {
      title: pickTitle(media.title),
      poster: media.coverImage ? media.coverImage.extraLarge || media.coverImage.large : '',
      description,
      servers,
      watchLinks,
      url: `https://anilist.co/anime/${media.id}`
    };
  }
}

module.exports = AniListScraper;
