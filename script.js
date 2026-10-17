const API_BASE = window.location.origin + '/api';

const API_ENDPOINTS = {
    hentaimama: `${API_BASE}/hentaimama.js`,
    rule34video: `${API_BASE}/rule34video.js`,
    rule34video_alt: `${API_BASE}/rule34video_alt.js`,
    xanimu: `${API_BASE}/xanimu.js`,
    otakudesu: `${API_BASE}/otakudesu.js`,
    anichin: `${API_BASE}/anichin.js`,
    anilist: `${API_BASE}/anilist.js`,
    youtube: `${API_BASE}/youtube.js`,
    zanix: `${API_BASE}/zanix.js`,
    oploverz: `${API_BASE}/oploverz.js`,
    komikcast: `${API_BASE}/komikcast.js`,
    nontonime: `${API_BASE}/nontonime.js`,
    ruangkomik: `${API_BASE}/ruangkomik.js`
};

const REQUEST_TIMEOUT_MS = 12000;
let currentTab = 'all';
let currentResults = [];
let cachedData = {};

const resultsEl = document.getElementById('results');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modalBody');
const modalClose = document.querySelector('.modal-close');

const clientCache = new Map();
const CLIENT_CACHE_TTL = 3 * 60 * 1000;

async function callAPI(endpoint, params = {}) {
    const startTime = performance.now();
    try {
        const url = new URL(endpoint);
        Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
        const cacheKey = url.toString();
        const hit = clientCache.get(cacheKey);
        if (hit && Date.now() < hit.exp) {
            return { success: true, data: hit.data, latency: 0, cached: true };
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let response;
        try {
            response = await fetch(url, { signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        clientCache.set(cacheKey, { data, exp: Date.now() + CLIENT_CACHE_TTL });
        if (clientCache.size > 80) {
            const k = clientCache.keys().next().value;
            clientCache.delete(k);
        }
        const latency = Math.round(performance.now() - startTime);
        return { success: true, data, latency };
    } catch (error) {
        const latency = Math.round(performance.now() - startTime);
        const msg = error.name === 'AbortError' ? 'Timeout — sumber lambat/tidak merespons' : error.message;
        return { success: false, error: msg, latency };
    }
}


async function fetchHentaiMama(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.hentaimama, { action, ...params });
    if (result.success && result.data.success) {
        return result.data.data;
    }
    return null;
}

async function fetchRule34Video(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.rule34video, { action, ...params });
    if (result.success) {
        return result.data;
    }
    return null;
}

async function fetchRule34VideoAlt(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.rule34video_alt, { action, ...params });
    if (result.success) {
        return result.data;
    }
    return null;
}

async function fetchXAnimu(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.xanimu, { action, ...params });
    if (result.success) {
        return result.data;
    }
    return null;
}

async function fetchAniList(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.anilist, { action, ...params });
    if (result.success) {
        return result.data;
    }
    return null;
}

async function fetchYouTube(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.youtube, { action, ...params });
    if (result.success) {
        return result.data;
    }
    return null;
}

async function fetchZanix(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.zanix, { action, ...params });
    if (result.success) {
        return result.data;
    }
    return null;
}

async function fetchOploverz(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.oploverz, { action, ...params });
    if (result.success) {
        return result.data;
    }
    return null;
}

async function fetchKomikcast(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.komikcast, { action, ...params });
    if (result.success) {
        return result.data;
    }
    return null;
}

async function fetchNontonime(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.nontonime, { action, ...params });
    if (result.success) return result.data;
    return null;
}

async function fetchRuangkomik(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.ruangkomik, { action, ...params });
    if (result.success) return result.data;
    return null;
}

async function fetchOtakuDesu(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.otakudesu, { action, ...params });
    if (result.success) {
        return result.data;
    }
    return null;
}

async function fetchAnichin(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.anichin, { action, ...params });
    if (result.success) {
        return result.data;
    }
    return null;
}


let renderedItems = [];
window.PLACEHOLDER_IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect fill="#2a3142" width="300" height="400"/><text x="50%" y="50%" text-anchor="middle" fill="#8a93a8" font-family="sans-serif" font-size="14">No Image</text></svg>');

function proxiedImage(url) {
    if (!url) return '';
    if (url.startsWith('//')) url = 'https:' + url;
    if (/^https?:\/\//i.test(url)) return `${API_BASE}/img?u=${encodeURIComponent(url)}`;
    return url;
}

function escapeAttr(text) {
    return String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function skeletonGrid(count = 12) {
    return Array.from({ length: count }, (_, i) =>
        `<article class="card skeleton" style="animation-delay:${i * 40}ms">
            <div class="poster sk-shimmer"></div>
            <div class="meta"><div class="sk-line sk-shimmer"></div><div class="sk-line short sk-shimmer"></div></div>
        </article>`
    ).join('');
}

function stateHtml(title, text, withRetry, sources) {
    const extra = Array.isArray(sources) && sources.length
        ? `<ul class="error-sources">${sources.map(s => `<li><strong>${escapeHtml(s.name)}</strong>: ${escapeHtml(s.error || 'gagal')}</li>`).join('')}</ul>`
        : '';
    return `<div class="state state-error">
        <div class="state-icon">⚠️</div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(text)}</p>
        ${extra}
        ${withRetry ? '<button type="button" class="retry-btn" id="retryBtn">Coba lagi</button>' : ''}
    </div>`;
}

function renderResults(items, fallbackSource) {
    renderedItems = applyClientFilters(items || []);
    if (renderedItems.length === 0) {
        resultsEl.innerHTML = stateHtml('Tidak ada hasil', 'Coba ubah filter, kata kunci, atau kategori.');
        return;
    }

    resultsEl.innerHTML = renderedItems.map((item, index) => {
        const title = item.title || item.name || 'Untitled';
        const poster = item.poster || item.image || item.thumbnail || item.img || '';
        const sourceLabel = item.source || fallbackSource || 'Unknown';
        const sourceClass = String(sourceLabel).toLowerCase().replace(/[^a-z0-9]/g, '');
        const badgeText = item.episode ? `Eps ${item.episode}` : (item.status || item.duration || '');
        const key = storageKey(item);
        const starred = isInWatchlist(key);
        const imageHtml = poster
            ? `<img src="${escapeAttr(proxiedImage(poster))}" alt="${escapeAttr(title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=window.PLACEHOLDER_IMAGE">`
            : `<img src="${window.PLACEHOLDER_IMAGE}" alt="${escapeAttr(title)}">`;

        return `
            <div class="result-card" data-index="${index}" role="button" tabindex="0">
                <div class="poster">
                    ${imageHtml}
                    <span class="tag ${escapeAttr(sourceClass)}">${escapeHtml(sourceLabel)}</span>
                    ${badgeText ? `<span class="badge">${escapeHtml(badgeText)}</span>` : ''}
                    <button type="button" class="star-btn ${starred ? 'on' : ''}" data-star="${index}" title="Watchlist" aria-label="Watchlist">${starred ? '★' : '☆'}</button>
                </div>
                <div class="card-title">${escapeHtml(title)}</div>
            </div>
        `;
    }).join('');
}

resultsEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.result-card');
    if (!card) return;
    event.preventDefault();
    card.click();
});

resultsEl.addEventListener('click', (event) => {
    const moreButton = event.target.closest('[data-more]');
    if (moreButton) {
        loadMore(moreButton);
        return;
    }
    if (event.target.closest('[data-retry]') || event.target.id === 'retryBtn') {
        loadTab(currentTab);
        return;
    }
    const star = event.target.closest('[data-star]');
    if (star) {
        event.preventDefault();
        event.stopPropagation();
        const item = renderedItems[Number(star.dataset.star)];
        if (item) toggleWatchlist(item);
        return;
    }
    const card = event.target.closest('.result-card');
    if (!card) return;
    const item = renderedItems[Number(card.dataset.index)];
    if (!item) return;
    const link = item.link || item.url || '';
    const title = item.title || item.name || 'Untitled';
    const poster = item.poster || item.image || item.thumbnail || item.img || '';
    addHistory({ title, link, url: link, image: poster, source: item.source || '', kind: item.kind || (currentMode === 'manga' ? 'manga' : 'anime') });
    window.openDetail(encodeURIComponent(link), item.source || '', title, poster);
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


window.openDetail = async function(encodedLink, source, title, poster) {
    const link = decodeURIComponent(encodedLink);
    modal.classList.add('active');

    modalBody.innerHTML = `<p class="modal-description">Memuat detail...</p>`;

    try {
        let detailData = null;

        switch(source.toLowerCase()) {
            case 'hentaimama':
                detailData = await fetchHentaiMama(link.includes('/tvshows/') ? 'tvshow' : 'episode', { url: link });
                break;
            case 'rule34video':
                detailData = await fetchRule34Video('detail', { url: link });
                break;
            case 'xanimu':
                detailData = await fetchXAnimu('detail', { query: link });
                break;
            case 'otakudesu':
                const slug = link.split('/').filter(Boolean).pop();
                detailData = await fetchOtakuDesu('detail', { query: slug });
                break;
            case 'youtube':
                detailData = await fetchYouTube('detail', { query: link });
                break;
            case 'zanix':
                detailData = await fetchZanix('detail', { query: link });
                break;
            case 'oploverz':
                detailData = await fetchOploverz('detail', { query: link });
                break;
            case 'komikcast':
                detailData = await fetchKomikcast('detail', { query: link });
                break;
            case 'ruangkomik':
                detailData = await fetchRuangkomik('detail', { query: link });
                break;
            case 'nontonime':
                detailData = await fetchNontonime('detail', { query: link });
                break;
            case 'anilist':
                detailData = await fetchAniList('detail', { query: link });
                break;
            case 'anichin':
                const anichinSlug = link.split('/').filter(Boolean).pop();
                detailData = await fetchAnichin('detail', { query: anichinSlug });
                break;
            default:
                detailData = { title, poster, description: 'No additional details available', url: link };
        }

        renderDetail(detailData, source, poster);
    } catch (error) {
        modalBody.innerHTML = `
            <h3 class="modal-title">${escapeHtml(title)}</h3>
            ${poster ? `<img src="${escapeAttr(proxiedImage(poster))}" referrerpolicy="no-referrer" />` : ''}
            <p class="modal-description">Detail gagal dimuat: ${escapeHtml(error.message)}</p>
            
        `;
    }
};

const VIDEO_FILE = /\.(mp4|m3u8|webm)(\?|$)/i;

function collectMedia(payload) {
    const direct = [];
    const embeds = [];
    const add = (list, url, label) => {
        if (typeof url === 'string' && /^https?:\/\//i.test(url) && !direct.concat(embeds).some(m => m.url === url)) {
            list.push({ url, label: label || 'Server' });
        }
    };
    const classify = (url, label) => add(VIDEO_FILE.test(url || '') ? direct : embeds, url, label);

    if (payload.videoSources && typeof payload.videoSources === 'object') {
        Object.entries(payload.videoSources).forEach(([quality, url]) => classify(url, quality));
    }
    if (Array.isArray(payload.videos)) {
        payload.videos.forEach((item, i) => classify(typeof item === 'string' ? item : item && item.url, `Video ${i + 1}`));
    }
    classify(payload.defaultPlayer, 'Utama');
    if (Array.isArray(payload.servers)) {
        payload.servers.forEach(server => server && classify(server.iframe, server.label));
    }
    if (Array.isArray(payload.embedPlayers)) {
        payload.embedPlayers.forEach(group => {
            (group.servers || []).forEach(server => classify(server.embedUrl, `${server.server || 'Server'} ${group.quality || ''}`.trim()));
        });
    }
    const rawDownloads = payload.downloadLinks || payload.download_links || payload.downloads || payload.download || [];
    const downloads = [];
    (Array.isArray(rawDownloads) ? rawDownloads : [rawDownloads]).forEach(entry => {
        if (!entry) return;
        if (typeof entry === 'string') {
            downloads.push({ url: entry, label: 'Unduh' });
            return;
        }
        if (Array.isArray(entry.servers)) {
            entry.servers.forEach(server => downloads.push({ url: server.url, label: `${server.server || 'Unduh'} ${entry.quality || ''}`.trim() }));
            return;
        }
        downloads.push({ url: entry.url || entry.link, label: entry.server || entry.quality || entry.text || entry.label || 'Unduh' });
    });
    downloads.filter(d => d.url && VIDEO_FILE.test(d.url)).forEach(d => add(direct, d.url, d.label));
    return { direct, embeds, downloads: downloads.filter(d => d.url) };
}

const YOUTUBE_EMBED = /^https:\/\/(www\.)?youtube(-nocookie)?\.com\//i;
const IFRAME_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
// Tanpa allow-top-navigation: tombol di dalam player tidak bisa mengalihkan halaman NontonKuy

function embedReferrerPolicy(url) {
    return YOUTUBE_EMBED.test(url) ? 'strict-origin-when-cross-origin' : 'no-referrer';
}

function playerHtml(media, posterUrl) {
    const options = media.direct.map(m => ({ ...m, kind: 'video' })).concat(media.embeds.map(m => ({ ...m, kind: 'embed' })));
    if (options.length === 0) return '';
    const first = options[0];
    let html = first.kind === 'video'
        ? `<video id="detailPlayer" controls playsinline preload="metadata" referrerpolicy="no-referrer" ${posterUrl ? `poster="${escapeAttr(proxiedImage(posterUrl))}"` : ''} src="${escapeAttr(first.url)}"></video>`
        : `<iframe id="detailEmbed" src="${escapeAttr(first.url)}" allow="${IFRAME_ALLOW}" allowfullscreen referrerpolicy="${embedReferrerPolicy(first.url)}"></iframe>`;
    if (options.length > 1) {
        html += `<div class="modal-links">${options.map((o, i) => `<a href="#" data-kind="${o.kind}" data-src="${escapeAttr(o.url)}" class="${i === 0 ? 'current' : ''}">${escapeHtml(o.label)}</a>`).join('')}</div>`;
    }
    return html;
}

function swapPlayer(container, kind, src) {
    const holder = container.querySelector('#detailPlayer, #detailEmbed');
    if (!holder) return;
    const element = document.createElement(kind === 'video' ? 'video' : 'iframe');
    element.id = kind === 'video' ? 'detailPlayer' : 'detailEmbed';
    element.setAttribute('referrerpolicy', kind === 'video' ? 'no-referrer' : embedReferrerPolicy(src));
    if (kind === 'video') {
        element.controls = true;
        element.setAttribute('playsinline', '');
        element.src = src;
    } else {
        element.setAttribute('allowfullscreen', '');
        element.setAttribute('allow', IFRAME_ALLOW);
        element.src = src;
    }
    holder.replaceWith(element);
    if (kind === 'video') element.play().catch(() => {});
}

function bindPlayerButtons(container) {
    container.querySelectorAll('a[data-src]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            container.querySelectorAll('a[data-src]').forEach(a => a.classList.remove('current'));
            anchor.classList.add('current');
            swapPlayer(container, anchor.dataset.kind, anchor.dataset.src);
        });
    });
}

const EPISODE_FETCHERS = {
    otakudesu: (url) => fetchOtakuDesu('episode', { url }),
    anichin: (url) => fetchAnichin('episode', { url }),
    hentaimama: (url) => fetchHentaiMama('episode', { url }),
    youtube: (url) => fetchYouTube('episode', { url }),
    zanix: (url) => fetchZanix('episode', { url }),
    oploverz: (url) => fetchOploverz('episode', { url }),
    komikcast: (url) => fetchKomikcast('episode', { url }),
    ruangkomik: (url) => fetchRuangkomik('episode', { url }),
    nontonime: (url) => fetchNontonime('episode', { url })
};

async function openEpisode(source, url, label) {
    const area = document.getElementById('episodeArea');
    if (!area) return;
    area.innerHTML = `<p class="modal-description">Memuat ${escapeHtml(label)}...</p>`;
    const fetcher = EPISODE_FETCHERS[String(source).toLowerCase()];
    try {
        const result = fetcher ? await fetcher(url) : null;
        // riwayat episode/chapter
        try {
            addHistory({
                title: label,
                link: url,
                source: source,
                episode: label,
                kind: String(source).toLowerCase() === 'komikcast' || String(source).toLowerCase() === 'ruangkomik' ? 'manga' : 'anime'
            });
        } catch (_) {}
        const payload = result && result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data : result;
        if (!payload) throw new Error('Episode tidak ditemukan');

        // Manga reader: vertical page images
        if (payload.kind === 'manga' || (Array.isArray(payload.pages) && payload.pages.length > 0)) {
            const pages = payload.pages || [];
            let html = `<p class="modal-label">${escapeHtml(payload.title || label)}</p>`;
            html += `<div class="manga-reader">`;
            pages.forEach((src, i) => {
                html += `<img class="manga-page" src="${escapeAttr(src)}" alt="Halaman ${i + 1}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
            });
            html += `</div>`;
            if (Array.isArray(payload.watchLinks) && payload.watchLinks.length) {
                html += `<div class="modal-links">${payload.watchLinks.map(w => `<a href="${escapeAttr(w.url)}" target="_blank" rel="noopener">${escapeHtml(w.label)}</a>`).join('')}</div>`;
            }
            area.innerHTML = html;
            area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        const media = collectMedia(payload);
        let html = `<p class="modal-label">${escapeHtml(payload.title || label)}</p>`;
        const player = playerHtml(media, payload.poster || '');
        html += player || `<p class="modal-description">Belum ada pemutar yang bisa dimuat untuk episode ini.</p>`;
        if (media.downloads.length > 0) {
            html += `<p class="modal-label">Unduh</p><div class="modal-links">${media.downloads.map(d => `<a href="${escapeAttr(d.url)}" target="_blank" rel="noopener">${escapeHtml(d.label)}</a>`).join('')}</div>`;
        }
        area.innerHTML = html;
        bindPlayerButtons(area);
        area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
        area.innerHTML = `<p class="modal-description">Episode gagal dimuat: ${escapeHtml(e.message)}</p>`;
    }
}

function renderDetail(data, source, poster) {
    if (!data) {
        modalBody.innerHTML = `<p class="modal-description">Detail dari ${escapeHtml(source)} tidak bisa dimuat. Coba lagi nanti.</p>`;
        return;
    }
    const payload = data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data : data;
    const title = payload.title || payload.name || 'Untitled';
    const description = payload.description || payload.synopsis || '';
    const posterUrl = payload.poster || poster || '';
    const media = collectMedia(payload);
    const episodes = Array.isArray(payload.episodes) ? payload.episodes : [];
    const player = playerHtml(media, posterUrl);

    const isYoutubeSource = String(source).toLowerCase() === 'youtube';

    let html = `<h3 class="modal-title">${escapeHtml(title)}</h3>`;
    // Player embed (Zanix & sumber lain) diputar di website ini
    if (!isYoutubeSource && player) {
        html += `<div id="mainPlayer">${player}</div>`;
    } else if (posterUrl) {
        html += `<img src="${escapeAttr(proxiedImage(posterUrl))}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=window.PLACEHOLDER_IMAGE" />`;
    }
    if (description) html += `<p class="modal-description">${escapeHtml(description)}</p>`;

    if (!isYoutubeSource && episodes.length > 0) {
        html += `<p class="modal-label">Daftar episode</p><div class="modal-links">`;
        episodes.slice(0, 200).forEach(ep => {
            const epUrl = ep.url || ep.link || '';
            const epLabel = ep.title || ep.name || (ep.number ? `Episode ${ep.number}` : 'Episode');
            if (epUrl) html += `<a href="#" data-episode="${escapeAttr(epUrl)}" data-label="${escapeAttr(epLabel)}">${escapeHtml(epLabel)}</a>`;
        });
        html += `</div><div id="episodeArea"></div>`;
    }

    if (!isYoutubeSource && !player && episodes.length === 0 && !(Array.isArray(payload.watchLinks) && payload.watchLinks.length > 0)) {
        html += `<p class="modal-description">Belum ada video yang bisa diputar dari sumber ini.</p>`;
    }

    if (!isYoutubeSource && Array.isArray(payload.watchLinks) && payload.watchLinks.length > 0) {
        const links = payload.watchLinks.filter(w => !/youtube\.com|youtu\.be/i.test(w.url || ''));
        if (links.length > 0) {
            html += `<p class="modal-label">Link eksternal</p><div class="modal-links">${links.map(w => `<a href="${escapeAttr(w.url)}" target="_blank" rel="noopener">${escapeHtml(w.label)}</a>`).join('')}</div>`;
        }
    }

    if (media.downloads.length > 0) {
        html += `<p class="modal-label">Unduh</p><div class="modal-links">${media.downloads.map(d => `<a href="${escapeAttr(d.url)}" target="_blank" rel="noopener">${escapeHtml(d.label)}</a>`).join('')}</div>`;
    }
    html += `<p class="modal-source">Sumber: ${escapeHtml(source)}</p>`;

    modalBody.innerHTML = html;

    const main = modalBody.querySelector('#mainPlayer');
    if (main) bindPlayerButtons(main);
    modalBody.querySelectorAll('a[data-episode]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            modalBody.querySelectorAll('a[data-episode]').forEach(a => a.classList.remove('current'));
            anchor.classList.add('current');
            openEpisode(source, anchor.dataset.episode, anchor.dataset.label || 'episode');
        });
    });
}

function extractItems(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    const candidates = [payload.items, payload.results, payload.data, payload.data && payload.data.items, payload.data && payload.data.results];
    for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate;
    }
    return [];
}

const SOURCES = {
    zanix: { label: 'Zanix', home: (_, page = 1) => fetchZanix('home', { page }), search: (q, page = 1) => fetchZanix('search', { query: q, page }) },
    oploverz: { label: 'Oploverz', home: (_, page = 1) => fetchOploverz('home', { page }), search: (q, page = 1) => fetchOploverz('search', { query: q, page }) },
    komikcast: { label: 'Komikcast', home: (_, page = 1) => fetchKomikcast('home', { page }), search: (q, page = 1) => fetchKomikcast('search', { query: q, page }) },
    ruangkomik: { label: 'RuangKomik', home: (_, page = 1) => fetchRuangkomik('home', { page }), search: (q, page = 1) => fetchRuangkomik('search', { query: q, page }) },
    nontonime: { label: 'Nontonime', home: (_, page = 1) => fetchNontonime('home', { page }), search: (q, page = 1) => fetchNontonime('search', { query: q, page }) },
    youtube: { label: 'YouTube', home: (_, page = 1) => fetchYouTube('home', { page }), search: (q, page = 1) => fetchYouTube('search', { query: q, page }) },
    anilist: { label: 'AniList', home: (_, page = 1) => fetchAniList('home', { page }), search: (q, page = 1) => fetchAniList('search', { query: q, page }) },
    anichin: { label: 'Anichin', home: (_, page = 1) => fetchAnichin('home', { page }), search: (q, page = 1) => fetchAnichin('search', { query: q, page }) },
    otakudesu: { label: 'OtakuDesu', home: (_, page = 1) => fetchOtakuDesu('home', { page }), search: (q, page = 1) => fetchOtakuDesu('search', { query: q, page }) },
    xanimu: { label: 'XAnimu', home: (_, page = 1) => fetchXAnimu('home', { page }), search: (q, page = 1) => fetchXAnimu('search', { query: q, page }) },
    hentaimama: { label: 'HentaiMama', home: (_, page = 1) => fetchHentaiMama('hentai-list', { page }), search: (q, page = 1) => fetchHentaiMama('search', { q, page }) },
    rule34video: { label: 'Rule34Video', home: (_, page = 1) => fetchRule34Video('popular', { page }), search: (q, page = 1) => fetchRule34Video('search', { query: q, page }) }
};

const TAB_SOURCES = {
    all: ['nontonime', 'oploverz', 'zanix', 'anilist', 'anichin', 'otakudesu', 'xanimu', 'hentaimama', 'rule34video'],
    anilist: ['anilist'],
    youtube: ['youtube'],
    zanix: ['zanix'],
    oploverz: ['oploverz'],
    komikcast: ['komikcast'],
    manga_all: ['ruangkomik', 'komikcast'],
    ruangkomik: ['ruangkomik'],
    nontonime: ['nontonime'],
    anime: ['nontonime', 'oploverz', 'zanix', 'anichin', 'otakudesu'],
    hentai: ['hentaimama'],
    videos: ['rule34video'],
    otakudesu: ['otakudesu'],
    anichin: ['anichin'],
    xanimu: ['xanimu']
};

async function collectFromSources(keys, mode, query, onProgress, page = 1) {
    const collected = [];
    const failed = [];
    await Promise.all(keys.map(async (key) => {
        const source = SOURCES[key];
        let items = [];
        try {
            const payload = await source[mode](query, page);
            items = extractItems(payload);
        } catch (e) {
            items = [];
        }
        if (items.length === 0) {
            failed.push(source.label);
        } else {
            items.forEach(item => collected.push({ ...item, source: source.label }));
        }
        if (onProgress) onProgress(collected.slice(), failed.slice());
    }));
    return { items: collected, failed };
}

function failedNote(failed) {
    if (failed.length === 0) return '';
    return `<div class="note">Belum merespons: ${escapeHtml(failed.join(', '))}</div>`;
}

const TAB_LABELS = { all: 'Semua', anilist: 'Katalog', youtube: 'Resmi', zanix: 'Zanix', oploverz: 'Oploverz', komikcast: 'Komikcast', manga_all: 'Semua Manga', nontonime: 'Nontonime', ruangkomik: 'RuangKomik', anime: 'Anime', hentai: 'Hentai', videos: 'Video', otakudesu: 'OtakuDesu', anichin: 'Anichin', xanimu: 'XAnimu' };

function tabLabel(tab) {
    return TAB_LABELS[tab] || tab;
}

function updateSearchPlaceholder() {
    searchInput.placeholder = currentTab === 'all' ? 'Cari judul anime atau video' : `Cari langsung di ${tabLabel(currentTab)}`;
}

function setSectionTitle(text) {
    const el = document.getElementById('sectionTitle');
    if (el) el.textContent = text;
}

const listState = { keys: [], mode: 'home', query: null, page: 1, token: 0 };

function moreButtonHtml() {
    return '<button type="button" class="more" data-more="1">Muat lebih banyak</button>';
}

function mergeUnique(existing, incoming) {
    const seen = new Set(existing.map(item => `${item.source}|${item.link || item.url || item.title}`));
    const fresh = incoming.filter(item => !seen.has(`${item.source}|${item.link || item.url || item.title}`));
    return { merged: existing.concat(fresh), addedCount: fresh.length };
}

async function runList(keys, mode, query, title) {
    listState.keys = keys;
    listState.mode = mode;
    listState.query = query;
    listState.page = 1;
    const token = ++listState.token;
    setSectionTitle(title);
    resultsEl.innerHTML = skeletonGrid();

    const { items, failed } = await collectFromSources(keys, mode, query, (partial) => {
        if (listState.token === token && partial.length > 0) {
            renderResults(partial, 'All Sources');
            currentResults = partial;
        }
    }, 1);

    if (listState.token !== token) return;

    if (items.length === 0) {
        resultsEl.innerHTML = mode === 'search'
            ? stateHtml('Tidak ada hasil', `Tidak ada yang cocok dengan "${query}".`)
            : stateHtml('Data belum tersedia', 'Semua sumber gagal atau kosong. Cek koneksi atau coba lagi.', true, failed.map(f => ({ name: f, error: 'tidak merespons' })));
        return;
    }

    renderResults(items, 'All Sources');
    resultsEl.insertAdjacentHTML('beforeend', failedNote(failed) + moreButtonHtml());
    currentResults = items;
}

async function loadMore(button) {
    const token = listState.token;
    button.disabled = true;
    button.textContent = 'Memuat...';
    const nextPage = listState.page + 1;
    const { items } = await collectFromSources(listState.keys, listState.mode, listState.query, null, nextPage);
    if (listState.token !== token) return;
    const { merged, addedCount } = mergeUnique(currentResults, items);
    currentResults = merged;
    renderResults(merged, 'All Sources');
    if (addedCount > 0) {
        listState.page = nextPage;
        resultsEl.insertAdjacentHTML('beforeend', moreButtonHtml());
    } else {
        resultsEl.insertAdjacentHTML('beforeend', '<div class="note">Sudah sampai akhir daftar.</div>');
    }
}

async function performSearch(query) {
    const keys = TAB_SOURCES[currentTab] || TAB_SOURCES.all;
    await runList(keys, 'search', query, `Hasil "${query}" di ${tabLabel(currentTab)}`);
}

async function loadTab(tab) {
    currentTab = tab;
    updateSearchPlaceholder();
    const keys = TAB_SOURCES[tab] || TAB_SOURCES.all;
    await runList(keys, 'home', null, tab === 'all' ? 'Rilis terbaru' : 'Terbaru di ' + tabLabel(tab));
}


/* ========== Storage: riwayat & watchlist ========== */
const LS_HISTORY = 'nk_history_v1';
const LS_WATCH = 'nk_watchlist_v1';
const LS_THEME = 'nk_theme';

function readJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
        return fallback;
    }
}

function writeJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
}

function storageKey(item) {
    return `${item.source || ''}::${item.link || item.url || item.title || ''}`;
}

function getHistory() {
    return readJSON(LS_HISTORY, []);
}

function addHistory(entry) {
    const list = getHistory().filter((h) => storageKey(h) !== storageKey(entry));
    list.unshift({
        title: entry.title,
        link: entry.link || entry.url,
        url: entry.url || entry.link,
        image: entry.image || entry.poster || '',
        source: entry.source || '',
        episode: entry.episode || '',
        kind: entry.kind || 'anime',
        at: Date.now()
    });
    writeJSON(LS_HISTORY, list.slice(0, 60));
}

function getWatchlist() {
    return readJSON(LS_WATCH, []);
}

function isInWatchlist(key) {
    return getWatchlist().some((w) => storageKey(w) === key);
}

function toggleWatchlist(item) {
    const key = storageKey(item);
    let list = getWatchlist();
    if (isInWatchlist(key)) {
        list = list.filter((w) => storageKey(w) !== key);
        showToast('Dihapus dari watchlist');
    } else {
        list.unshift({
            title: item.title || item.name,
            link: item.link || item.url,
            url: item.url || item.link,
            image: item.image || item.poster || item.thumbnail || '',
            source: item.source || '',
            episode: item.episode || '',
            kind: item.kind || 'anime',
            at: Date.now()
        });
        showToast('Ditambah ke watchlist');
    }
    writeJSON(LS_WATCH, list.slice(0, 100));
    if (typeof renderResults === 'function' && currentResults.length) {
        renderResults(currentResults, 'All Sources');
    }
}

function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    el.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
        el.classList.remove('show');
        el.hidden = true;
    }, 2200);
}

function applyClientFilters(items) {
    const genreEl = document.getElementById('filterGenre');
    const statusEl = document.getElementById('filterStatus');
    const genre = genreEl ? genreEl.value : '';
    const status = statusEl ? statusEl.value : '';
    if (!genre && !status) return items;
    return items.filter((item) => {
        const blob = `${item.title || ''} ${item.status || ''} ${item.genres || ''} ${item.description || ''} ${item.episode || ''}`.toLowerCase();
        if (genre && !blob.includes(genre.toLowerCase())) return false;
        if (status === 'ongoing' && !/ongoing|airing|berlangsung|update/i.test(blob)) return false;
        if (status === 'completed' && !/complete|tamat|finished|end/i.test(blob)) return false;
        if (status === 'movie' && !/movie|film|ova/i.test(blob)) return false;
        return true;
    });
}

function setTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    writeJSON(LS_THEME, next);
    const btn = document.getElementById('btnTheme');
    if (btn) btn.textContent = next === 'light' ? '🌙' : '☀️';
    const meta = document.getElementById('metaTheme');
    if (meta) meta.setAttribute('content', next === 'light' ? '#F4F5F8' : '#0B0D12');
}

function initTheme() {
    const saved = readJSON(LS_THEME, null);
    const preferLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    setTheme(saved || (preferLight ? 'light' : 'dark'));
}

function renderLibrary(list, emptyTitle, emptyText) {
    setSectionTitle(emptyTitle);
    const sub = document.getElementById('sectionSub');
    if (sub) {
        sub.hidden = false;
        sub.textContent = `${list.length} item tersimpan di perangkat ini`;
    }
    if (!list.length) {
        resultsEl.innerHTML = stateHtml(emptyTitle, emptyText);
        currentResults = [];
        return;
    }
    currentResults = list.map((x) => ({ ...x }));
    renderResults(currentResults, 'Lokal');
}

async function loadSchedule() {
    setSectionTitle('Jadwal rilis');
    const sub = document.getElementById('sectionSub');
    if (sub) {
        sub.hidden = false;
        sub.textContent = 'Sumber: OtakuDesu / Nontonime';
    }
    resultsEl.innerHTML = skeletonGrid(10);
    try {
        let items = [];
        const od = await fetchOtakuDesu('schedule', {});
        if (od) {
            const days = od.schedule || od.days || od.data || od;
            if (Array.isArray(days)) {
                days.forEach((d) => {
                    const dayName = d.day || d.title || '';
                    (d.anime || d.items || []).forEach((a) => {
                        items.push({
                            title: `${a.title || a.name} (${dayName})`,
                            link: a.link || a.url || a.slug || '',
                            image: a.image || a.poster || '',
                            source: 'otakudesu',
                            episode: a.time || a.episode || dayName,
                            status: dayName
                        });
                    });
                });
            } else if (Array.isArray(od.items)) {
                items = od.items;
            }
        }
        if (!items.length) {
            const home = await fetchNontonime('home', { page: 1 });
            items = (home && home.items) || [];
            if (sub) sub.textContent = 'Fallback: update terbaru Nontonime';
        }
        currentResults = items;
        if (!items.length) {
            resultsEl.innerHTML = stateHtml('Jadwal kosong', 'Sumber jadwal sedang tidak tersedia.', true);
            return;
        }
        renderResults(items, 'Jadwal');
    } catch (e) {
        resultsEl.innerHTML = stateHtml('Gagal memuat jadwal', e.message || 'Coba lagi nanti', true);
    }
}

function registerPWA() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}


let currentMode = 'anime';
const animeTabs = document.getElementById('animeTabs');
const mangaTabs = document.getElementById('mangaTabs');

function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    if (animeTabs) animeTabs.classList.toggle('hidden', mode !== 'anime');
    if (mangaTabs) mangaTabs.classList.toggle('hidden', mode !== 'manga');
    searchInput.placeholder = mode === 'manga'
        ? 'Cari judul manga, manhwa, manhua…'
        : 'Cari judul anime atau video…';
    const tabsRoot = mode === 'manga' ? mangaTabs : animeTabs;
    if (tabsRoot) {
        tabsRoot.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const first = tabsRoot.querySelector('.tab-btn');
        if (first) {
            first.classList.add('active');
            loadTab(first.dataset.tab);
            return;
        }
    }
    loadTab(mode === 'manga' ? 'manga_all' : 'all');
}

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const parent = btn.closest('.tabs');
        if (parent) parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadTab(btn.dataset.tab);
    });
});

searchBtn.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (query) performSearch(query);
});

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchBtn.click();
});

modalClose.addEventListener('click', () => modal.classList.remove('active'));
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') modal.classList.remove('active');
});
modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
});

initTheme();
registerPWA();

const btnTheme = document.getElementById('btnTheme');
if (btnTheme) btnTheme.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    setTheme(cur === 'dark' ? 'light' : 'dark');
});
const btnHistory = document.getElementById('btnHistory');
if (btnHistory) btnHistory.addEventListener('click', () => renderLibrary(getHistory(), 'Riwayat', 'Belum ada riwayat tonton/baca.'));
const btnWatchlist = document.getElementById('btnWatchlist');
if (btnWatchlist) btnWatchlist.addEventListener('click', () => renderLibrary(getWatchlist(), 'Watchlist', 'Watchlist masih kosong. Ketuk ★ di poster.'));
const btnSchedule = document.getElementById('btnSchedule');
if (btnSchedule) btnSchedule.addEventListener('click', () => loadSchedule());

['filterGenre', 'filterStatus'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => {
        if (currentResults.length) renderResults(currentResults, 'All Sources');
    });
});
const filterClear = document.getElementById('filterClear');
if (filterClear) filterClear.addEventListener('click', () => {
    const g = document.getElementById('filterGenre');
    const s = document.getElementById('filterStatus');
    if (g) g.value = '';
    if (s) s.value = '';
    if (currentResults.length) renderResults(currentResults, 'All Sources');
});

loadTab('all');