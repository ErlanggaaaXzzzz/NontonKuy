// ============ CONFIG ============
const API_BASE = window.location.origin + '/api';

const API_ENDPOINTS = {
    hentaimama: `${API_BASE}/hentaimama.js`,
    rule34video: `${API_BASE}/rule34video.js`,
    rule34video_alt: `${API_BASE}/rule34video_alt.js`,
    xanimu: `${API_BASE}/xanimu.js`,
    otakudesu: `${API_BASE}/otakudesu.js`,
    anichin: `${API_BASE}/anichin.js`
};

// ============ STATE ============
let currentTab = 'all';
let currentResults = [];
let cachedData = {};

// ============ DOM REFS ============
const resultsEl = document.getElementById('results');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modalBody');
const modalClose = document.querySelector('.modal-close');

// ============ API CALLER ============
async function callAPI(endpoint, params = {}) {
    const startTime = performance.now();
    try {
        const url = new URL(endpoint);
        Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
        const response = await fetch(url);
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

// ============ API WRAPPERS ============

// 1. HentaiMama
async function fetchHentaiMama(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.hentaimama, { action, ...params });
    if (result.success && result.data.success) {
        return result.data.data;
    }
    return null;
}

// 2. Rule34Video
async function fetchRule34Video(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.rule34video, { action, ...params });
    if (result.success) {
        return result.data;
    }
    return null;
}

// 3. Rule34Video Alt
async function fetchRule34VideoAlt(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.rule34video_alt, { action, ...params });
    if (result.success) {
        return result.data;
    }
    return null;
}

// 4. XAnimu
async function fetchXAnimu(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.xanimu, { action, ...params });
    if (result.success) {
        return result.data;
    }
    return null;
}

// 5. OtakuDesu
async function fetchOtakuDesu(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.otakudesu, { action, ...params });
    if (result.success) {
        return result.data;
    }
    return null;
}

// 6. Anichin
async function fetchAnichin(action, params = {}) {
    const result = await callAPI(API_ENDPOINTS.anichin, { action, ...params });
    if (result.success) {
        return result.data;
    }
    return null;
}

// ============ RENDER FUNCTIONS ============

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

// ============ DETAIL MODAL ============

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

    // Video player
    if (videoUrl && videoUrl.includes('.mp4')) {
        html += `
            <video controls style="width:100%;border-radius:12px;margin:12px 0;">
                <source src="${videoUrl}" type="video/mp4">
                Your browser does not support video.
            </video>
        `;
    }

    // Iframe player
    if (videoUrl && (videoUrl.includes('embed') || videoUrl.includes('player'))) {
        html += `
            <iframe src="${videoUrl}" style="width:100%;height:400px;border:none;border-radius:12px;margin:12px 0;" allowfullscreen></iframe>
        `;
    }

    // Download links
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

    // Add source label
    html += `<p style="margin-top:12px;font-size:12px;color:#64748b;">Source: ${source}</p>`;

    modalBody.innerHTML = html;
}

// ============ SEARCH & FETCH ============

async function performSearch(query) {
    resultsEl.innerHTML = `<div class="loading">Searching all sources...</div>`;

    const allResults = [];
    const sources = ['otakudesu', 'anichin', 'xanimu', 'rule34video', 'hentaimama'];

    for (const source of sources) {
        try {
            let result = null;
            if (source === 'otakudesu') {
                result = await fetchOtakuDesu('search', { q: query, page: 1 });
            } else if (source === 'anichin') {
                result = await fetchAnichin('search', { query, page: 1 });
            } else if (source === 'xanimu') {
                result = await fetchXAnimu('search', { query, page: 1 });
            } else if (source === 'rule34video') {
                result = await fetchRule34Video('search', { query, page: 1 });
            } else if (source === 'hentaimama') {
                result = await fetchHentaiMama('search', { q: query, page: 1 });
            }

            if (result && result.data && result.data.items) {
                result.data.items.forEach(item => {
                    item.source = source;
                    allResults.push(item);
                });
            } else if (result && Array.isArray(result)) {
                result.forEach(item => {
                    item.source = source;
                    allResults.push(item);
                });
            }
        } catch (e) {
            console.warn(`[${source}] Search error:`, e.message);
        }
    }

    if (allResults.length === 0) {
        resultsEl.innerHTML = `<div class="loading">No results found for "${query}"</div>`;
        return;
    }

    renderResults(allResults, 'All Sources');
    currentResults = allResults;
}

async function loadTab(tab) {
    currentTab = tab;
    resultsEl.innerHTML = `<div class="loading">Loading ${tab}...</div>`;

    let allItems = [];
    let sourceLabel = tab;

    try {
        switch(tab) {
            case 'all':
                allItems = await fetchAllSources();
                break;
            case 'anime':
                const animeData = await fetchAnichin('home', { page: 1 });
                if (animeData?.data?.items) allItems = animeData.data.items.map(i => ({ ...i, source: 'Anichin' }));
                break;
            case 'hentai':
                const hentaiData = await fetchHentaiMama('list', { page: 1 });
                if (hentaiData?.data?.items) allItems = hentaiData.data.items.map(i => ({ ...i, source: 'HentaiMama' }));
                break;
            case 'videos':
                const videoData = await fetchRule34Video('popular', { page: 1 });
                if (videoData?.data?.items) allItems = videoData.data.items.map(i => ({ ...i, source: 'Rule34Video' }));
                break;
            case 'otakudesu':
                const odData = await fetchOtakuDesu('home', { page: 1 });
                if (odData?.data?.items) allItems = odData.data.items.map(i => ({ ...i, source: 'OtakuDesu' }));
                sourceLabel = 'OtakuDesu';
                break;
            case 'anichin':
                const acData = await fetchAnichin('home', { page: 1 });
                if (acData?.data?.items) allItems = acData.data.items.map(i => ({ ...i, source: 'Anichin' }));
                sourceLabel = 'Anichin';
                break;
            case 'xanimu':
                const xaData = await fetchXAnimu('home', { page: 1 });
                if (xaData?.data?.items) allItems = xaData.data.items.map(i => ({ ...i, source: 'XAnimu' }));
                sourceLabel = 'XAnimu';
                break;
        }
    } catch (error) {
        resultsEl.innerHTML = `<div class="loading">❌ Error loading ${tab}: ${error.message}</div>`;
        return;
    }

    if (allItems.length === 0) {
        resultsEl.innerHTML = `<div class="loading">No items found in ${tab}</div>`;
        return;
    }

    renderResults(allItems, sourceLabel);
    currentResults = allItems;
}

async function fetchAllSources() {
    const all = [];
    const sources = [
        { name: 'Anichin', fn: fetchAnichin('home', { page: 1 }) },
        { name: 'OtakuDesu', fn: fetchOtakuDesu('home', { page: 1 }) },
        { name: 'XAnimu', fn: fetchXAnimu('home', { page: 1 }) },
        { name: 'HentaiMama', fn: fetchHentaiMama('list', { page: 1 }) },
        { name: 'Rule34Video', fn: fetchRule34Video('popular', { page: 1 }) }
    ];

    const results = await Promise.allSettled(sources.map(s => s.fn));

    results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value) {
            const data = result.value;
            let items = data?.data?.items || data?.data || [];
            if (!Array.isArray(items) && items.items) items = items.items;
            if (Array.isArray(items)) {
                items.forEach(item => {
                    item.source = sources[idx].name;
                    all.push(item);
                });
            }
        }
    });

    return all;
}

// ============ EVENT LISTENERS ============

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

// ============ INIT ============
loadTab('all');
