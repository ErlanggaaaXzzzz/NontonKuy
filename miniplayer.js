/* NontonKuy mini player — video tetap diputar (kayak YouTube) saat modal ditutup / user cari anime lain.
 *
 * Cara kerja: player (<video>/<iframe>) tidak ditaruh di dalam modal, tapi di "dock" #nkMini
 * yang menempel di <body>. Di dalam modal hanya ada placeholder (.nk-slot); dock mengikuti posisi
 * placeholder. Kalau placeholder hilang (modal ditutup / ganti halaman), dock mengecil jadi
 * pojok kanan bawah. Elemen tidak pernah dipindah di DOM, jadi iframe tidak reload dan posisi
 * putar tidak hilang.
 */
(function () {
  'use strict';

  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modalBody');
  if (!modal || !modalBody) return;
  const sheet = modal.querySelector('.sheet');

  const LS_POS = 'nk_mini_pos_v1';
  const ENGAGE_AFTER_MS = 10000;
  const PLAYER_SELECTOR = '#detailPlayer, #detailEmbed';

  let dock = null;
  let stage = null;
  let titleEl = null;
  let state = null; // { el, slot, key, title, source, link, poster, engaged, mountedAt, mode }
  let raf = 0;
  let savedPos = readPos();

  function readPos() {
    try {
      return JSON.parse(localStorage.getItem(LS_POS) || 'null');
    } catch (_) {
      return null;
    }
  }
  function writePos(pos) {
    try {
      localStorage.setItem(LS_POS, JSON.stringify(pos));
    } catch (_) {}
  }

  function buildDock() {
    if (dock) return;
    dock = document.createElement('div');
    dock.id = 'nkMini';
    dock.className = 'nk-mini';
    dock.hidden = true;
    dock.innerHTML =
      '<div class="nk-mini-bar">' +
      '<button type="button" class="nk-mini-title" title="Buka lagi"></button>' +
      '<button type="button" class="nk-mini-btn" data-act="expand" aria-label="Buka lagi" title="Buka lagi">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>' +
      '</button>' +
      '<button type="button" class="nk-mini-btn" data-act="close" aria-label="Tutup pemutar" title="Tutup">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>' +
      '</button>' +
      '</div>' +
      '<div class="nk-mini-stage"></div>';
    document.body.appendChild(dock);
    stage = dock.querySelector('.nk-mini-stage');
    titleEl = dock.querySelector('.nk-mini-title');
    dock.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn && btn.dataset.act === 'close') return close();
      if (btn || e.target.closest('.nk-mini-title')) expand();
    });
    enableDrag(dock.querySelector('.nk-mini-bar'));
  }

  /* ——— lifecycle ——— */
  function destroyElement(el) {
    if (!el) return;
    try {
      if (el.tagName === 'VIDEO') {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } else if (el.tagName === 'IFRAME') {
        el.src = 'about:blank';
      }
    } catch (_) {}
    el.remove();
  }

  function markEngaged() {
    if (state) state.engaged = true;
  }

  function wire(el) {
    el.removeAttribute('id');
    if (el.tagName === 'VIDEO') {
      el.addEventListener('play', markEngaged);
    }
  }

  function mount(el, slot, meta) {
    buildDock();
    if (state) destroyElement(state.el);
    wire(el);
    stage.replaceChildren(el);
    state = Object.assign({ el, slot, engaged: false, mountedAt: Date.now(), mode: '' }, meta);
    titleEl.textContent = meta.title || 'Sedang diputar';
    dock.hidden = false;
    startLoop();
  }

  function close() {
    if (state) destroyElement(state.el);
    if (state && state.slot && state.slot.isConnected) state.slot.remove();
    state = null;
    if (dock) {
      dock.hidden = true;
      dock.dataset.mode = '';
    }
    stopLoop();
  }

  function expand() {
    if (!state) return;
    if (state.slot && state.slot.isConnected) {
      modal.classList.add('active');
      state.slot.scrollIntoView({ block: 'center' });
      return;
    }
    if (typeof window.openDetail === 'function' && state.link) {
      window.openDetail(encodeURIComponent(state.link), state.source || '', state.title || '', state.poster || '');
    }
  }

  /* ——— posisi ——— */
  function slotVisible() {
    return !!(state && state.slot && state.slot.isConnected && modal.classList.contains('active'));
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    dock.dataset.mode = mode;
    if (mode === 'full') {
      dock.style.left = dock.style.top = dock.style.right = dock.style.bottom = '';
    } else {
      dock.style.width = dock.style.height = dock.style.clipPath = '';
      dock.style.visibility = '';
      applyMiniPos();
    }
  }

  function applyMiniPos() {
    if (!savedPos) {
      dock.style.left = dock.style.top = '';
      dock.style.right = dock.style.bottom = '';
      return;
    }
    const w = dock.offsetWidth || 320;
    const h = dock.offsetHeight || 200;
    const left = Math.min(Math.max(0, savedPos.l), Math.max(0, window.innerWidth - w));
    const top = Math.min(Math.max(0, savedPos.t), Math.max(0, window.innerHeight - h));
    dock.style.left = left + 'px';
    dock.style.top = top + 'px';
    dock.style.right = dock.style.bottom = 'auto';
  }

  function tick() {
    raf = 0;
    if (!state) return;
    if (slotVisible()) {
      setMode('full');
      const r = state.slot.getBoundingClientRect();
      const s = (sheet || modal).getBoundingClientRect();
      const clipT = Math.max(0, s.top - r.top);
      const clipB = Math.max(0, r.bottom - s.bottom);
      const clipL = Math.max(0, s.left - r.left);
      const clipR = Math.max(0, r.right - s.right);
      dock.style.left = r.left + 'px';
      dock.style.top = r.top + 'px';
      dock.style.width = r.width + 'px';
      dock.style.height = r.height + 'px';
      dock.style.clipPath = clipT || clipB || clipL || clipR ? `inset(${clipT}px ${clipR}px ${clipB}px ${clipL}px)` : '';
      dock.style.visibility = clipT + clipB >= r.height || clipL + clipR >= r.width ? 'hidden' : '';
    } else {
      // Pengguna belum menonton apa pun? Jangan munculkan mini player.
      if (!state.engaged && Date.now() - state.mountedAt < ENGAGE_AFTER_MS && state.mode !== 'mini') {
        close();
        return;
      }
      state.engaged = true;
      setMode('mini');
    }
    raf = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  /* ——— drag mini player ——— */
  function enableDrag(handle) {
    let start = null;
    handle.addEventListener('pointerdown', (e) => {
      if (!state || state.mode !== 'mini' || e.target.closest('button.nk-mini-btn')) return;
      const rect = dock.getBoundingClientRect();
      start = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false, id: e.pointerId };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      start.moved = true;
      const w = dock.offsetWidth;
      const h = dock.offsetHeight;
      const l = Math.min(Math.max(0, e.clientX - start.dx), Math.max(0, window.innerWidth - w));
      const t = Math.min(Math.max(0, e.clientY - start.dy), Math.max(0, window.innerHeight - h));
      savedPos = { l, t };
      applyMiniPos();
      dock.classList.add('dragging');
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      if (start.moved && savedPos) writePos(savedPos);
      start = null;
      dock.classList.remove('dragging');
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  window.addEventListener('resize', () => {
    if (state && state.mode === 'mini') applyMiniPos();
  });

  // Klik ke dalam iframe cross-origin → window blur & activeElement = iframe
  window.addEventListener('blur', () => {
    setTimeout(() => {
      if (state && document.activeElement === state.el) state.engaged = true;
    }, 0);
  });

  /* ——— API untuk script.js ——— */
  function makeSlot() {
    const slot = document.createElement('div');
    slot.className = 'nk-slot';
    return slot;
  }

  function playButtonSlot(proto, meta, container) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nk-slot nk-slot-play';
    btn.innerHTML = '<span class="nk-slot-icon">&#9654;</span><span>Putar di sini<small>Akan menggantikan video mini yang sedang jalan</small></span>';
    btn.addEventListener('click', () => {
      const slot = makeSlot();
      btn.replaceWith(slot);
      mount(proto, slot, meta);
      if (proto.tagName === 'VIDEO') proto.play().catch(() => {});
    });
    return btn;
  }

  /**
   * Ambil player yang baru dirender di `container` dan pindahkan ke dock.
   * meta: { key, title, source, link, poster, force }
   */
  function adopt(container, meta) {
    const el = container && container.querySelector(PLAYER_SELECTOR);
    if (!el) return;
    meta = meta || {};

    // Detail yang sama dibuka lagi → sambungkan ke video yang sedang jalan
    if (state && !meta.force && meta.key && state.key === meta.key) {
      const slot = makeSlot();
      el.replaceWith(slot);
      state.slot = slot;
      state.mode = '';
      startLoop();
      return;
    }

    const busy = state && !slotVisible();
    if (busy && !meta.force) {
      const proto = el.cloneNode(false);
      const btn = playButtonSlot(proto, meta, container);
      el.replaceWith(btn);
      destroyElement(el);
      return;
    }

    // Slot lama (player utama) tidak dipakai lagi kalau kita ambil alih
    if (state && state.slot && state.slot.isConnected) {
      const holder = state.slot.closest('#mainPlayer');
      (holder || state.slot).remove();
    }
    const slot = makeSlot();
    el.replaceWith(slot);
    mount(el, slot, meta);
  }

  function owns(container) {
    return !!(state && container && state.slot && container.contains(state.slot));
  }

  function replaceElement(el) {
    if (!state) return false;
    wire(el);
    const old = state.el;
    stage.replaceChildren(el);
    destroyElement(old);
    state.el = el;
    state.engaged = true;
    return true;
  }

  // Dipanggil saat modal ditutup: hapus player "inline" yang tidak diadopsi supaya tidak bunyi diam-diam
  function onModalClose() {
    modalBody.querySelectorAll('video, iframe').forEach(destroyElement);
  }

  window.NKMini = { adopt, owns, replaceElement, onModalClose, close, expand, isActive: () => !!state };
})();
