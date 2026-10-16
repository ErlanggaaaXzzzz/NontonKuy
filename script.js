const API_BASE = window.location.origin + '/api';

const API_ENDPOINTS = {
    hentaimama: `${API_BASE}/hentaimama.js`,
    rule34video: `${API_BASE}/rule34video.js`,
    rule34video_alt: `${API_BASE}/rule34video_alt.js`,
    xanimu: `${API_BASE}/xanimu.js`,
    otakudesu: `${API_BASE}/otakudesu.js`,
    anichin: `${API_BASE}/anichin.js`
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


function renderResults(items, source) {
    if (!items || items.length === 0) {
        resultsEl.innerHTML = `<div class="loading">No results found</div>`;
        return;
    }

    resultsEl.innerHTML = items.map(item => {
        const title = item.title || item.name || 'Untitled';
        const poster = item.poster || item.image || item.thumbnail || item.img || '';
        const link = item.link || item.url || '';
        const sourceLabel = source || item.source || 'Unknown';

        return `
            <div class="result-card" onclick="openDetail('${encodeURIComponent(link)}', '${encodeURIComponent(sourceLabel)}', '${encodeURIComponent(title)}', '${encodeURIComponent(poster)}')">
                ${poster ? `<img src="${poster}" alt="${title}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%2314141e%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%2364748b%22 font-family=%22Inter%22 font-size=%2214%22%3ENo Image%3C/text%3E%3C/svg%3E'">` : `<div style="height:280px;background:#14141e;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:14px;">No Image</div>`}
                <div class="card-body">
                    <div class="card-title">${escapeHtml(title)}</div>
                    <div class="card-meta">
                        <span class="card-source">${sourceLabel}</span>
                        <span class="status-badge">✓</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


window.openDetail = async function(encodedLink, source, title, poster) {
    const link = decodeURIComponent(encodedLink);
    modal.classList.add('active');

    modalBody.innerHTML = `
        <div class="loading">Loading details...</div>
    `;

    try {
        let detailData = null;

        switch(source.toLowerCase()) {
            case 'hentaimama':
                detailData = await fetchHentaiMama('episode', { url: link });
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
            case 'anichin':
                const anichinSlug = link.split('/').filter(Boolean).pop();
                detailData = await fetchAnichin('detail', { query: anichinSlug });
                break;
            default:
                detailData = { title, poster, description: 'No additional details available', links: [link] };
        }

        renderDetail(detailData, source, poster);
    } catch (error) {
        modalBody.innerHTML = `
            <h3 class="modal-title">${escapeHtml(title)}</h3>
            ${poster ? `<img src="${poster}" style="width:100%;border-radius:12px;max-height:400px;object-fit:cover;" />` : ''}
            <p style="color:#94a3b8;margin:12px 0;">Failed to load details: ${error.message}</p>
            <div class="modal-links"><a href="${escapeHtml(link)}" target="_blank">🔗 Open Original</a></div>
        `;
    }
};

function renderDetail(data, source, poster) {
    const title = data.title || data.name || 'Untitled';
    const description = data.description || data.synopsis || 'No description available';
    const posterUrl = data.poster || poster || '';
    const links = data.downloadLinks || data.videos || data.servers || data.download || [];
    const videoUrl = data.videoSources?.['720p'] || data.videoSources?.['1080p'] || data.videoSources?.['480p'] || data.defaultPlayer || '';

    let html = `
        <h3 class="modal-title">${escapeHtml(title)}</h3>
        ${posterUrl ? `<img src="${posterUrl}" style="width:100%;border-radius:12px;max-height:400px;object-fit:cover;" />` : ''}
        <p class="modal-description">${escapeHtml(description)}</p>
        <div class="modal-links">
    `;

    if (videoUrl && videoUrl.includes('.mp4')) {
        html += `
            <video controls style="width:100%;border-radius:12px;margin:12px 0;">
                <source src="${videoUrl}" type="video/mp4">
                Your browser does not support video.
            </video>
        `;
    }

    if (videoUrl && (videoUrl.includes('embed') || videoUrl.includes('player'))) {
        html += `
            <iframe src="${videoUrl}" style="width:100%;height:400px;border:none;border-radius:12px;margin:12px 0;" allowfullscreen></iframe>
        `;
    }

    if (links.length > 0) {
        html += `<p><strong>📥 Download Links:</strong></p>`;
        links.forEach(link => {
            const url = typeof link === 'string' ? link : (link.url || link.link || '');
            const label = typeof link === 'string' ? 'Download' : (link.server || link.quality || 'Download');
            if (url) {
                html += `<a href="${url}" target="_blank">⬇️ ${label}</a>`;
            }
        });
    }

    html += `
        <a href="${data.url || ''}" target="_blank">🔗 Open Original</a>
    </div>
    `;

    html += `<p style="margin-top:12px;font-size:12px;color:#64748b;">Source: ${source}</p>`;

    modalBody.innerHTML = html;
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
    anichin: { label: 'Anichin', home: () => fetchAnichin('home', { page: 1 }), search: (q) => fetchAnichin('search', { query: q, page: 1 }) },
    otakudesu: { label: 'OtakuDesu', home: () => fetchOtakuDesu('home', { page: 1 }), search: (q) => fetchOtakuDesu('search', { query: q, page: 1 }) },
    xanimu: { label: 'XAnimu', home: () => fetchXAnimu('home', { page: 1 }), search: (q) => fetchXAnimu('search', { query: q, page: 1 }) },
    hentaimama: { label: 'HentaiMama', home: () => fetchHentaiMama('hentai-list', { page: 1 }), search: (q) => fetchHentaiMama('search', { q, page: 1 }) },
    rule34video: { label: 'Rule34Video', home: () => fetchRule34Video('popular', { page: 1 }), search: (q) => fetchRule34Video('search', { query: q, page: 1 }) }
};

const TAB_SOURCES = {
    all: ['anichin', 'otakudesu', 'xanimu', 'hentaimama', 'rule34video'],
    anime: ['anichin'],
    hentai: ['hentaimama'],
    videos: ['rule34video'],
    otakudesu: ['otakudesu'],
    anichin: ['anichin'],
    xanimu: ['xanimu']
};

async function collectFromSources(keys, mode, query, onProgress) {
    const collected = [];
    const failed = [];
    await Promise.all(keys.map(async (key) => {
        const source = SOURCES[key];
        let items = [];
        try {
            const payload = await source[mode](query);
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
    return `<div class="loading" style="padding:8px;font-size:12px;">Tidak merespons: ${failed.join(', ')}</div>`;
}

async function performSearch(query) {
    resultsEl.innerHTML = `<div class="loading">Searching all sources...</div>`;
    const keys = TAB_SOURCES.all;
    const { items, failed } = await collectFromSources(keys, 'search', query, (partial) => {
        if (partial.length > 0) {
            renderResults(partial, 'All Sources');
            currentResults = partial;
        }
    });

    if (items.length === 0) {
        resultsEl.innerHTML = `<div class="loading">No results found for "${escapeHtml(query)}"</div>`;
        return;
    }

    renderResults(items, 'All Sources');
    resultsEl.insertAdjacentHTML('beforeend', failedNote(failed));
    currentResults = items;
}

async function loadTab(tab) {
    currentTab = tab;
    resultsEl.innerHTML = `<div class="loading">Loading ${tab}...</div>`;
    const keys = TAB_SOURCES[tab] || TAB_SOURCES.all;

    const { items, failed } = await collectFromSources(keys, 'home', null, (partial) => {
        if (currentTab === tab && partial.length > 0) {
            renderResults(partial, tab);
            currentResults = partial;
        }
    });

    if (currentTab !== tab) return;

    if (items.length === 0) {
        resultsEl.innerHTML = `<div class="loading">Tidak ada data dari ${failed.join(', ')}. Coba muat ulang.</div>`;
        return;
    }

    renderResults(items, tab);
    resultsEl.insertAdjacentHTML('beforeend', failedNote(failed));
    currentResults = items;
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
modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
});

loadTab('all');
