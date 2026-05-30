import { state } from './state.js';

// ── Encode / Decode ───────────────────────────────────────────────────────────

function encodeSession(data) {
  const json = JSON.stringify(data);
  const b64  = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decodeSession(raw) {
  try {
    const b64  = raw.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ── Build share URL ───────────────────────────────────────────────────────────

function buildShareUrl() {
  const pads = state.pads.map((start, i) => ({
    start: Math.round(start * 100) / 100,
    dur:   Math.round((state.padDurations[i] ?? state.padDuration) * 10) / 10,
  }));
  const data = {
    source: 'youtube',
    url:    document.getElementById('urlInput').value.trim(),
    pads,
  };
  const encoded = encodeSession(data);
  return `${location.origin}${location.pathname}#${encoded}`;
}

// ── QR code (lazy-loaded from CDN) ───────────────────────────────────────────

function loadQRLib() {
  return new Promise((resolve, reject) => {
    if (window.QRCode) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload  = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

function closeModal() {
  const el = document.getElementById('shareBackdrop');
  if (el) el.remove();
}

function createModal() {
  const backdrop = document.createElement('div');
  backdrop.id = 'shareBackdrop';
  backdrop.className = 'share-backdrop';

  const panel = document.createElement('div');
  panel.className = 'share-panel';
  panel.innerHTML = `
    <div class="share-header">
      <span class="share-title">SHARE SESSION</span>
      <button class="share-close" id="shareClose">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="1.75"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
      </button>
    </div>
    <div class="share-body" id="shareBody"></div>
  `;

  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  panel.querySelector('#shareClose').addEventListener('click', closeModal);

  return panel.querySelector('#shareBody');
}

// ── Main entry ────────────────────────────────────────────────────────────────

export async function shareSession() {
  closeModal();
  const body = createModal();

  if (!state.songLoaded || state.samplerSource === 'file') {
    body.innerHTML = `
      <div class="share-empty">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="1.5"
          stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/>
          <circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        <p>${state.samplerSource === 'file'
          ? 'Sharing only works with YouTube source. Switch to YouTube, load a song, then share.'
          : 'Load a YouTube song first, then share your session.'
        }</p>
      </div>`;
    return;
  }

  const url = buildShareUrl();
  history.replaceState(null, '', url);

  body.innerHTML = `
    <div class="share-url-row">
      <input class="share-url-input" id="shareUrlInput" type="text" readonly value="${url}">
      <button class="share-copy-btn" id="shareCopyBtn">COPY</button>
    </div>
    <div class="share-qr-wrap">
      <div class="share-qr-loading" id="shareQrLoading">Generating QR...</div>
      <div id="shareQrTarget" style="display:none"></div>
    </div>
  `;

  const copyBtn  = body.querySelector('#shareCopyBtn');
  const urlInput = body.querySelector('#shareUrlInput');

  urlInput.addEventListener('click', () => { urlInput.select(); urlInput.setSelectionRange(0, 99999); });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      copyBtn.textContent = 'COPIED!';
      copyBtn.classList.add('copied');
    } catch {
      urlInput.select();
      urlInput.setSelectionRange(0, 99999);
      copyBtn.textContent = 'SELECT + COPY';
    }
    setTimeout(() => { copyBtn.textContent = 'COPY'; copyBtn.classList.remove('copied'); }, 2000);
  });

  try {
    await loadQRLib();
    const loadingEl = body.querySelector('#shareQrLoading');
    const qrTarget  = body.querySelector('#shareQrTarget');
    loadingEl.style.display = 'none';
    qrTarget.style.display  = '';
    new QRCode(qrTarget, {
      text:         url,
      width:        180,
      height:       180,
      colorDark:    '#0f0e0c',
      colorLight:   '#f7f5f0',
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch {
    const loadingEl = body.querySelector('#shareQrLoading');
    if (loadingEl) loadingEl.textContent = 'QR unavailable (no network)';
  }
}

// ── Restore from URL hash on page load ───────────────────────────────────────

export function getSessionFromHash() {
  const raw = location.hash.slice(1);
  if (!raw) return null;
  return decodeSession(raw);
}

export function clearHash() {
  history.replaceState(null, '', location.pathname + location.search);
}
