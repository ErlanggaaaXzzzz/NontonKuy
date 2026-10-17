const API_BASE = window.location.origin + '/api';

const API_ENDPOINTS = {
    hentaimama: `${API_BASE}/hentaimama.js`,
    rule34video: `${API_BASE}/rule34video.js`,
    rule34video_alt: `${API_BASE}/rule34video_alt.js`,
    xanimu: `${API_BASE}/xanimu.js`,
    otakudesu: `${API_BASE}/otakudesu.js`,
    anichin: `${API_BASE}/anichin.js`,
    anilist: `${API_BASE}/anilist.js`,
    youtube: `${API_BASE}/youtube.js`
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

async function callAPI(endpoint, params = {}) {
    const startTime = performance.now();
    try {
        const url = new URL(endpoint);
        Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
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
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);
        return { success: true, data, latency };
    } catch (error) {
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);
        return { success: false, error: error.message, latency };
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
    return Array.from({ length: count }, () => '<div class="skeleton"></div>').join('');
}

function stateHtml(title, text, withRetry) {
    return `<div class="state"><strong>${escapeHtml(title)}</strong>${escapeHtml(text || '')}${withRetry ? '<br><button type="button" data-retry="1">Muat ulang</button>' : ''}</div>`;
}

function renderResults(items, fallbackSource) {
    renderedItems = items || [];
    if (renderedItems.length === 0) {
        resultsEl.innerHTML = stateHtml('Tidak ada hasil', 'Coba kata kunci lain atau pilih kategori berbeda.');
        return;
    }

    resultsEl.innerHTML = renderedItems.map((item, index) => {
        const title = item.title || item.name || 'Untitled';
        const poster = item.poster || item.image || item.thumbnail || item.img || '';
        const sourceLabel = item.source || fallbackSource || 'Unknown';
        const sourceClass = String(sourceLabel).toLowerCase().replace(/[^a-z0-9]/g, '');
        const badgeText = item.episode ? `Eps ${item.episode}` : (item.status || item.duration || '');
        const imageHtml = poster
            ? `<img src="${escapeAttr(proxiedImage(poster))}" alt="${escapeAttr(title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=window.PLACEHOLDER_IMAGE">`
            : `<img src="${window.PLACEHOLDER_IMAGE}" alt="${escapeAttr(title)}">`;

        return `
            <div class="result-card" data-index="${index}" role="button" tabindex="0">
                <div class="poster">
                    ${imageHtml}
                    <span class="tag ${escapeAttr(sourceClass)}">${escapeHtml(sourceLabel)}</span>
                    ${badgeText ? `<span class="badge">${escapeHtml(badgeText)}</span>` : ''}
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
    if (event.target.closest('[data-retry]')) {
        loadTab(currentTab);
        return;
    }
    const card = event.target.closest('.result-card');
    if (!card) return;
    const item = renderedItems[Number(card.dataset.index)];
    if (!item) return;
    const link = item.link || item.url || '';
    const title = item.title || item.name || 'Untitled';
    const poster = item.poster || item.image || item.thumbnail || item.img || '';
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

function playerHtml(media, posterUrl) {
    const options = media.direct.map(m => ({ ...m, kind: 'video' })).concat(media.embeds.map(m => ({ ...m, kind: 'embed' })));
    if (options.length === 0) return '';
    const first = options[0];
    let html = first.kind === 'video'
        ? `<video id="detailPlayer" controls playsinline preload="metadata" referrerpolicy="no-referrer" ${posterUrl ? `poster="${escapeAttr(proxiedImage(posterUrl))}"` : ''} src="${escapeAttr(first.url)}"></video>`
        : `<iframe id="detailEmbed" src="${escapeAttr(first.url)}" allowfullscreen referrerpolicy="no-referrer"></iframe>`;
    if (options.length > 1) {
        html += `<div class="modal-links">${options.map(o => `<a href="#" data-kind="${o.kind}" data-src="${escapeAttr(o.url)}">${escapeHtml(o.label)}</a>`).join('')}</div>`;
    }
    return html;
}

function swapPlayer(container, kind, src) {
    const holder = container.querySelector('#detailPlayer, #detailEmbed');
    if (!holder) return;
    const element = document.createElement(kind === 'video' ? 'video' : 'iframe');
    element.id = kind === 'video' ? 'detailPlayer' : 'detailEmbed';
    element.setAttribute('referrerpolicy', 'no-referrer');
    if (kind === 'video') {
        element.controls = true;
        element.setAttribute('playsinline', '');
        element.src = src;
    } else {
        element.setAttribute('allowfullscreen', '');
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
    youtube: (url) => fetchYouTube('episode', { url })
};

async function openEpisode(source, url, label) {
    const area = document.getElementById('episodeArea');
    if (!area) return;
    area.innerHTML = `<p class="modal-description">Memuat ${escapeHtml(label)}...</p>`;
    const fetcher = EPISODE_FETCHERS[String(source).toLowerCase()];
    try {
        const result = fetcher ? await fetcher(url) : null;
        const payload = result && result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data : result;
        if (!payload) throw new Error('Episode tidak ditemukan');
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

    let html = `<h3 class="modal-title">${escapeHtml(title)}</h3>`;
    if (player) {
        html += `<div id="mainPlayer">${player}</div>`;
    } else if (posterUrl) {
        html += `<img src="${escapeAttr(proxiedImage(posterUrl))}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=window.PLACEHOLDER_IMAGE" />`;
    }
    if (description) html += `<p class="modal-description">${escapeHtml(description)}</p>`;

    if (episodes.length > 0) {
        html += `<p class="modal-label">Daftar episode</p><div class="modal-links">`;
        episodes.slice(0, 80).forEach(ep => {
            const epUrl = ep.url || ep.link || '';
            const epLabel = ep.title || ep.name || (ep.number ? `Episode ${ep.number}` : 'Episode');
            if (epUrl) html += `<a href="#" data-episode="${escapeAttr(epUrl)}" data-label="${escapeAttr(epLabel)}">${escapeHtml(epLabel)}</a>`;
        });
        html += `</div><div id="episodeArea"></div>`;
    }

    if (!player && episodes.length === 0 && !(Array.isArray(payload.watchLinks) && payload.watchLinks.length > 0)) {
        html += `<p class="modal-description">Belum ada video yang bisa diputar dari sumber ini.</p>`;
    }

    if (Array.isArray(payload.watchLinks) && payload.watchLinks.length > 0) {
        html += `<p class="modal-label">Tonton resmi</p><div class="modal-links">${payload.watchLinks.map(w => `<a href="${escapeAttr(w.url)}" target="_blank" rel="noopener">${escapeHtml(w.label)}</a>`).join('')}</div>`;
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
    youtube: { label: 'YouTube', home: (_, page = 1) => fetchYouTube('home', { page }), search: (q, page = 1) => fetchYouTube('search', { query: q, page }) },
    anilist: { label: 'AniList', home: (_, page = 1) => fetchAniList('home', { page }), search: (q, page = 1) => fetchAniList('search', { query: q, page }) },
    anichin: { label: 'Anichin', home: (_, page = 1) => fetchAnichin('home', { page }), search: (q, page = 1) => fetchAnichin('search', { query: q, page }) },
    otakudesu: { label: 'OtakuDesu', home: (_, page = 1) => fetchOtakuDesu('home', { page }), search: (q, page = 1) => fetchOtakuDesu('search', { query: q, page }) },
    xanimu: { label: 'XAnimu', home: (_, page = 1) => fetchXAnimu('home', { page }), search: (q, page = 1) => fetchXAnimu('search', { query: q, page }) },
    hentaimama: { label: 'HentaiMama', home: (_, page = 1) => fetchHentaiMama('hentai-list', { page }), search: (q, page = 1) => fetchHentaiMama('search', { q, page }) },
    rule34video: { label: 'Rule34Video', home: (_, page = 1) => fetchRule34Video('popular', { page }), search: (q, page = 1) => fetchRule34Video('search', { query: q, page }) }
};

const TAB_SOURCES = {
    all: ['youtube', 'anilist', 'anichin', 'otakudesu', 'xanimu', 'hentaimama', 'rule34video'],
    anilist: ['anilist'],
    youtube: ['youtube'],
    anime: ['anichin'],
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

const TAB_LABELS = { all: 'Semua', anilist: 'Katalog', youtube: 'Resmi', anime: 'Anime', hentai: 'Hentai', videos: 'Video', otakudesu: 'OtakuDesu', anichin: 'Anichin', xanimu: 'XAnimu' };

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
            : stateHtml('Data belum tersedia', `Tidak ada respons dari ${failed.join(', ')}.`, true);
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

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
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

loadTab('all');
