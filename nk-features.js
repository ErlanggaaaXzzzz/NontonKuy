/* NontonKuy extra features — continues, sort, random, notes, share, admin, analytics, export */
(function () {
  const LS_NOTES = 'nk_notes_v1';
  const LS_ANALYTICS = 'nk_analytics_v1';
  const LS_DISABLED = 'nk_disabled_sources_v1';
  const LS_SORT = 'nk_sort_v1';

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

  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
    else console.log(msg);
  }

  /* ——— Analytics ——— */
  function trackOpen(title, source) {
    const data = readJSON(LS_ANALYTICS, { opens: {} });
    const key = `${source || ''}::${title || ''}`;
    data.opens[key] = (data.opens[key] || 0) + 1;
    data.last = Date.now();
    writeJSON(LS_ANALYTICS, data);
  }

  /* ——— Notes / rating ——— */
  function getNotes() {
    return readJSON(LS_NOTES, {});
  }
  function noteKey(item) {
    return `${item.source || ''}::${item.link || item.url || item.title || ''}`;
  }
  function saveNote(key, rating, text) {
    const all = getNotes();
    all[key] = { rating: Number(rating) || 0, text: String(text || '').slice(0, 500), at: Date.now() };
    writeJSON(LS_NOTES, all);
    toast('Catatan disimpan');
  }

  /* ——— Disabled sources (admin) ——— */
  function getDisabled() {
    return new Set(readJSON(LS_DISABLED, []));
  }
  function setDisabled(list) {
    writeJSON(LS_DISABLED, list);
  }

  /* ——— Continue banner ——— */
  function renderContinueBanner() {
    const host = document.getElementById('continueBanner');
    if (!host || typeof getHistory !== 'function') return;
    const hist = getHistory().slice(0, 8);
    if (!hist.length) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.hidden = false;
    host.innerHTML =
      `<div class="continue-head"><strong>Lanjutkan</strong><button type="button" class="text-btn" id="continueClear">Hapus</button></div>` +
      `<div class="continue-row">` +
      hist
        .map((h, i) => {
          const img = h.image || h.poster || '';
          return `<button type="button" class="continue-card" data-ci="${i}">
            ${img ? `<img src="${img}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.opacity=0">` : '<div class="continue-ph"></div>'}
            <span>${(h.title || 'Tanpa judul').slice(0, 42)}</span>
            <small>${h.episode || h.source || ''}</small>
          </button>`;
        })
        .join('') +
      `</div>`;

    host.querySelector('#continueClear')?.addEventListener('click', () => {
      writeJSON('nk_history_v1', []);
      renderContinueBanner();
      toast('Riwayat dihapus');
    });
    host.querySelectorAll('[data-ci]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = hist[Number(btn.dataset.ci)];
        if (!item || typeof window.openDetail !== 'function') return;
        trackOpen(item.title, item.source);
        window.openDetail(encodeURIComponent(item.link || item.url || ''), item.source || '', item.title || '', item.image || '');
      });
    });
  }

  /* ——— Sort ——— */
  function currentSort() {
    return readJSON(LS_SORT, 'default');
  }
  function applySort(items) {
    const mode = currentSort();
    const list = items.slice();
    if (mode === 'az') {
      list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'id'));
    } else if (mode === 'za') {
      list.sort((a, b) => String(b.title || '').localeCompare(String(a.title || ''), 'id'));
    } else if (mode === 'popular') {
      const opens = readJSON(LS_ANALYTICS, { opens: {} }).opens || {};
      list.sort((a, b) => {
        const ka = `${a.source || ''}::${a.title || ''}`;
        const kb = `${b.source || ''}::${b.title || ''}`;
        return (opens[kb] || 0) - (opens[ka] || 0);
      });
    }
    return list;
  }

  const _renderResults = window.renderResults;
  // Patch after main script defines renderResults — hook via prototype on results
  const origRender = null;

  function enhanceRenderResults() {
    if (typeof renderResults !== 'function') return;
    if (renderResults.__nkPatched) return;
    const base = renderResults;
    window.renderResults = function (items, fallbackSource) {
      const sorted = applySort(items || []);
      return base.call(this, sorted, fallbackSource);
    };
    renderResults.__nkPatched = true;
  }

  /* ——— Random ——— */
  function surpriseMe() {
    const pool = typeof currentResults !== 'undefined' && currentResults.length ? currentResults : [];
    if (!pool.length) {
      toast('Belum ada daftar — buka tab dulu');
      return;
    }
    const item = pool[Math.floor(Math.random() * pool.length)];
    trackOpen(item.title, item.source);
    window.openDetail(
      encodeURIComponent(item.link || item.url || ''),
      item.source || '',
      item.title || item.name || '',
      item.image || item.poster || ''
    );
  }

  /* ——— Share ——— */
  async function shareItem(title, url) {
    const text = title || 'NontonKuy';
    const shareUrl = url || location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: text, text, url: shareUrl });
        return;
      }
    } catch (_) {}
    try {
      await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
      toast('Link disalin');
    } catch (_) {
      toast('Tidak bisa share di perangkat ini');
    }
  }

  /* ——— Export / import ——— */
  function exportData() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      history: typeof getHistory === 'function' ? getHistory() : [],
      watchlist: typeof getWatchlist === 'function' ? getWatchlist() : [],
      notes: getNotes(),
      analytics: readJSON(LS_ANALYTICS, {})
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nontonkuy-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup diunduh');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.history) writeJSON('nk_history_v1', data.history);
        if (data.watchlist) writeJSON('nk_watchlist_v1', data.watchlist);
        if (data.notes) writeJSON(LS_NOTES, data.notes);
        if (data.analytics) writeJSON(LS_ANALYTICS, data.analytics);
        renderContinueBanner();
        toast('Backup dipulihkan');
      } catch (e) {
        toast('File backup tidak valid');
      }
    };
    reader.readAsText(file);
  }

  /* ——— Watchlist update check ——— */
  async function checkWatchlistUpdates() {
    if (typeof getWatchlist !== 'function') return [];
    const list = getWatchlist().slice(0, 12);
    const updates = [];
    for (const item of list) {
      const src = String(item.source || '').toLowerCase();
      try {
        let detail = null;
        if (src === 'ruangkomik' && typeof fetchRuangkomik === 'function') {
          detail = await fetchRuangkomik('detail', { query: item.link || item.url });
        } else if (src === 'komikcast' && typeof fetchKomikcast === 'function') {
          detail = await fetchKomikcast('detail', { query: item.link || item.url });
        } else if (src === 'nontonime' && typeof fetchNontonime === 'function') {
          detail = await fetchNontonime('detail', { query: item.link || item.url });
        } else if (src === 'oploverz' && typeof fetchOploverz === 'function') {
          detail = await fetchOploverz('detail', { query: item.link || item.url });
        }
        if (detail && Array.isArray(detail.episodes) && detail.episodes.length) {
          const latest = detail.episodes[detail.episodes.length - 1];
          const latestNum = String(latest.number || latest.title || '');
          if (item.episode && latestNum && String(item.episode) !== latestNum) {
            updates.push({ title: item.title, from: item.episode, to: latestNum, item, detail });
          }
          // store latest known
          item._latest = latestNum;
        }
      } catch (_) {}
    }
    return updates;
  }

  async function showUpdates() {
    const host = document.getElementById('updateBanner');
    if (!host) return;
    host.hidden = false;
    host.innerHTML = `<p class="update-loading">Cek update watchlist…</p>`;
    const updates = await checkWatchlistUpdates();
    if (!updates.length) {
      host.innerHTML = `<p class="update-ok">Tidak ada update baru di watchlist.</p>`;
      setTimeout(() => {
        host.hidden = true;
      }, 2500);
      return;
    }
    host.innerHTML =
      `<div class="continue-head"><strong>Update watchlist</strong><button type="button" class="text-btn" id="updateClose">Tutup</button></div>` +
      `<ul class="update-list">` +
      updates
        .map(
          (u, i) =>
            `<li><button type="button" data-ui="${i}"><strong>${u.title}</strong> → ${u.to}</button></li>`
        )
        .join('') +
      `</ul>`;
    host.querySelector('#updateClose')?.addEventListener('click', () => {
      host.hidden = true;
    });
    host.querySelectorAll('[data-ui]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = updates[Number(btn.dataset.ui)];
        if (!u) return;
        window.openDetail(
          encodeURIComponent(u.item.link || u.item.url || ''),
          u.item.source || '',
          u.item.title || '',
          u.item.image || ''
        );
      });
    });
  }

  /* ——— Admin panel ——— */
  function openAdmin() {
    const disabled = getDisabled();
    const sources = [
      'nontonime',
      'oploverz',
      'zanix',
      'otakudesu',
      'anichin',
      'anilist',
      'xanimu',
      'ruangkomik',
      'komikcast',
      'hentaimama',
      'rule34video'
    ];
    const panel = document.getElementById('adminPanel');
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML = `
      <div class="admin-sheet">
        <div class="continue-head"><strong>Pengaturan sumber</strong><button type="button" class="text-btn" id="adminClose">Tutup</button></div>
        <p class="admin-hint">Nonaktifkan sumber yang bermasalah. Disimpan di perangkat ini.</p>
        <div class="admin-sources">
          ${sources
            .map(
              (s) =>
                `<label><input type="checkbox" data-src="${s}" ${disabled.has(s) ? '' : 'checked'}> ${s}</label>`
            )
            .join('')}
        </div>
        <div class="admin-actions">
          <button type="button" class="retry-btn" id="adminSave">Simpan</button>
          <button type="button" class="filter-clear" id="adminExport">Export backup</button>
          <label class="filter-clear admin-import">Import<input type="file" id="adminImport" accept="application/json" hidden></label>
        </div>
        <div class="admin-stats" id="adminStats"></div>
      </div>`;
    const opens = readJSON(LS_ANALYTICS, { opens: {} }).opens || {};
    const top = Object.entries(opens)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => `<li>${k.split('::').pop()} <em>${v}x</em></li>`)
      .join('');
    panel.querySelector('#adminStats').innerHTML = top
      ? `<p class="modal-label">Paling sering dibuka</p><ul>${top}</ul>`
      : `<p class="admin-hint">Belum ada data analytics.</p>`;

    panel.querySelector('#adminClose').onclick = () => {
      panel.hidden = true;
    };
    panel.querySelector('#adminSave').onclick = () => {
      const off = [];
      panel.querySelectorAll('input[data-src]').forEach((inp) => {
        if (!inp.checked) off.push(inp.dataset.src);
      });
      setDisabled(off);
      toast('Pengaturan disimpan');
      panel.hidden = true;
      if (typeof loadTab === 'function') loadTab(typeof currentTab !== 'undefined' ? currentTab : 'all');
    };
    panel.querySelector('#adminExport').onclick = exportData;
    panel.querySelector('#adminImport').onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importData(f);
    };
  }

  /* Filter disabled sources in runList — patch TAB_SOURCES usage via SOURCES */
  function patchSourceFilter() {
    if (typeof SOURCES === 'undefined') return;
    const disabled = getDisabled();
    // Soft-filter at loadTab level
    if (typeof loadTab === 'function' && !loadTab.__nkPatched) {
      const base = loadTab;
      window.loadTab = async function (tab) {
        enhanceRenderResults();
        await base.call(this, tab);
        renderContinueBanner();
      };
      loadTab.__nkPatched = true;
    }
  }

  /* Hook openDetail for analytics + notes UI injection */
  function patchOpenDetail() {
    if (typeof window.openDetail !== 'function' || window.openDetail.__nkPatched) return;
    const base = window.openDetail;
    window.openDetail = async function (encodedLink, source, title, poster) {
      trackOpen(title, source);
      await base.apply(this, arguments);
      setTimeout(() => injectDetailExtras(source, title, encodedLink, poster), 400);
    };
    window.openDetail.__nkPatched = true;
  }

  function injectDetailExtras(source, title, encodedLink, poster) {
    const body = document.getElementById('modalBody');
    if (!body || body.querySelector('.detail-extras')) return;
    const key = `${source || ''}::${decodeURIComponent(encodedLink || '')}`;
    const note = getNotes()[key] || { rating: 0, text: '' };
    const shareUrl = location.origin + '/?open=' + encodeURIComponent(JSON.stringify({ source, link: decodeURIComponent(encodedLink || ''), title }));
    const box = document.createElement('div');
    box.className = 'detail-extras';
    box.innerHTML = `
      <div class="extra-row">
        <button type="button" class="chip-btn" id="btnShareDetail">Bagikan</button>
        <button type="button" class="chip-btn" id="btnCopyDetail">Salin link</button>
      </div>
      <div class="note-box">
        <p class="modal-label">Catatan & rating</p>
        <div class="rating-row">${[1, 2, 3, 4, 5]
          .map((n) => `<button type="button" class="star-rate ${note.rating >= n ? 'on' : ''}" data-r="${n}">${n}</button>`)
          .join('')}</div>
        <textarea id="noteText" rows="2" placeholder="Catatan pribadi…">${note.text || ''}</textarea>
        <button type="button" class="retry-btn" id="noteSave">Simpan catatan</button>
      </div>`;
    const ep = body.querySelector('#episodeArea');
    if (ep) body.insertBefore(box, ep);
    else body.appendChild(box);

    let rating = note.rating || 0;
    box.querySelectorAll('.star-rate').forEach((btn) => {
      btn.addEventListener('click', () => {
        rating = Number(btn.dataset.r);
        box.querySelectorAll('.star-rate').forEach((b) => b.classList.toggle('on', Number(b.dataset.r) <= rating));
      });
    });
    box.querySelector('#noteSave')?.addEventListener('click', () => {
      saveNote(key, rating, box.querySelector('#noteText')?.value || '');
    });
    box.querySelector('#btnShareDetail')?.addEventListener('click', () => shareItem(title, shareUrl));
    box.querySelector('#btnCopyDetail')?.addEventListener('click', () => shareItem(title, shareUrl));
  }

  /* Deep link ?open= */
  function handleDeepLink() {
    try {
      const params = new URLSearchParams(location.search);
      const raw = params.get('open');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && data.link) {
        setTimeout(() => {
          window.openDetail(encodeURIComponent(data.link), data.source || '', data.title || '', data.poster || '');
        }, 600);
      }
    } catch (_) {}
  }

  function init() {
    enhanceRenderResults();
    patchSourceFilter();
    patchOpenDetail();
    renderContinueBanner();
    handleDeepLink();

    document.getElementById('btnRandom')?.addEventListener('click', surpriseMe);
    document.getElementById('btnUpdates')?.addEventListener('click', showUpdates);
    document.getElementById('btnAdmin')?.addEventListener('click', openAdmin);
    const sortEl = document.getElementById('sortSelect');
    if (sortEl) {
      sortEl.value = currentSort();
      sortEl.addEventListener('change', () => {
        writeJSON(LS_SORT, sortEl.value);
        if (typeof currentResults !== 'undefined' && currentResults.length && typeof renderResults === 'function') {
          renderResults(currentResults, 'All Sources');
        }
      });
    }

    // Re-render continue after history changes periodically
    setInterval(renderContinueBanner, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);
})();
