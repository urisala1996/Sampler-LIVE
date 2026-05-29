import { state } from './state.js';
import { formatTime, formatTimeMs, showToast, clamp } from './utils.js';
import { stopAll, updatePadTimeLabel } from './pads.js';
import { icon } from './icons.js';

// ── Open / close ──────────────────────────────────────────────────────────────

export function openEditor(padIndex) {
  stopAll();
  state.editorPadIndex = padIndex;
  state.editorCurrentTime = state.pads[padIndex];
  state.editorConfirmedTime = state.pads[padIndex];
  state.editorCurrentDuration = state.padDurations[padIndex] ?? state.padDuration;

  document.getElementById('sheetPadBadge').textContent = 'P' + String(padIndex + 1).padStart(2, '0');
  document.getElementById('sheetTotalTime').textContent = formatTime(state.songDuration);
  document.getElementById('sheetBackdrop').className = 'sheet-backdrop show';
  document.getElementById('editorSheet').className = 'sheet show';

  drawWaveform();
  renderOtherPadMarkers();
  updateScrubber(state.editorCurrentTime);
  updateEditorDurDisplay();
  stopPreview();
}

export function closeEditor() {
  document.getElementById('sheetBackdrop').className = 'sheet-backdrop';
  document.getElementById('editorSheet').className = 'sheet';
  stopPreview();
  state.editorPadIndex = -1;
}

export function confirmSamplePoint() {
  if (state.editorPadIndex < 0) return;
  state.pads[state.editorPadIndex] = state.editorCurrentTime;
  state.padDurations[state.editorPadIndex] = state.editorCurrentDuration;
  updatePadTimeLabel(state.editorPadIndex);
  showToast(`PAD ${state.editorPadIndex + 1} → ${formatTimeMs(state.editorCurrentTime)} / ${state.editorCurrentDuration}s`, 'success');
  closeEditor();
}

// ── Waveform (decorative) ─────────────────────────────────────────────────────

function drawWaveform() {
  const canvas = document.getElementById('waveCanvas');
  const wrap = document.getElementById('timelineWrap');
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  canvas.width = W * window.devicePixelRatio;
  canvas.height = H * window.devicePixelRatio;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  // Seeded pseudo-random — stable shape per song duration
  const seed = state.songDuration * 137.5;
  const rng = (n) => Math.sin(n * seed * 0.01 + n) * 0.5 + 0.5;

  const bars = Math.floor(W / 3);
  const barW = W / bars;

  ctx.fillStyle = '#f0ede8';
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < bars; i++) {
    const h = (0.15 + rng(i) * 0.7) * H;
    const y = (H - h) / 2;
    const alpha = 0.18 + rng(i + 1000) * 0.30;
    ctx.fillStyle = `rgba(15,14,12,${alpha})`;
    ctx.fillRect(i * barW + 1, y, barW - 1, h);
  }
}

function renderOtherPadMarkers() {
  document.querySelectorAll('.pad-marker').forEach(m => m.remove());
  const wrap = document.getElementById('timelineWrap');
  state.pads.forEach((t, i) => {
    if (i === state.editorPadIndex) return;
    const pct = t / state.songDuration;
    const marker = document.createElement('div');
    marker.className = 'pad-marker';
    marker.style.left = (pct * 100) + '%';
    marker.title = `P${i + 1}: ${formatTime(t)}`;
    wrap.appendChild(marker);
  });
}

// ── Scrubber ──────────────────────────────────────────────────────────────────

function updateScrubber(sec) {
  state.editorCurrentTime = clamp(sec, 0, state.songDuration);
  const pct = state.editorCurrentTime / state.songDuration;

  document.getElementById('scrubberThumb').style.left = (pct * 100) + '%';

  const regionEnd = clamp((state.editorCurrentTime + state.editorCurrentDuration) / state.songDuration, 0, 1);
  const region = document.getElementById('scrubberRegion');
  region.style.left = (pct * 100) + '%';
  region.style.width = ((regionEnd - pct) * 100) + '%';

  document.getElementById('scrubberTime').textContent = formatTimeMs(state.editorCurrentTime);
}

function timelinePointerToSec(e) {
  const wrap = document.getElementById('timelineWrap');
  const rect = wrap.getBoundingClientRect();
  const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
  return x * state.songDuration;
}

export function nudge(delta) {
  updateScrubber(state.editorCurrentTime + delta);
  stopPreview();
}

// ── Preview ───────────────────────────────────────────────────────────────────

export function previewSample() {
  if (!state.player || !state.songLoaded) return;
  if (state.isPreviewing) { stopPreview(); return; }

  state.isPreviewing = true;
  const btn = document.getElementById('previewBtn');
  btn.innerHTML = `${icon('stop', 14)} STOP`;
  btn.classList.add('previewing');

  state.player.seekTo(state.editorCurrentTime, true);
  state.player.playVideo();
  state.previewTimer = setTimeout(() => stopPreview(), state.editorCurrentDuration * 1000);
}

export function stopPreview() {
  if (state.previewTimer) { clearTimeout(state.previewTimer); state.previewTimer = null; }
  state.isPreviewing = false;
  const btn = document.getElementById('previewBtn');
  if (btn) {
    btn.innerHTML = `${icon('play', 14)} PREVIEW`;
    btn.classList.remove('previewing');
  }
  if (state.player && state.player.pauseVideo) state.player.pauseVideo();
}

// ── Per-pad duration ──────────────────────────────────────────────────────────

function updateEditorDurDisplay() {
  document.getElementById('editorDurVal').textContent = state.editorCurrentDuration.toFixed(1) + 's';
}

export function adjustEditorDuration(delta) {
  state.editorCurrentDuration = Math.round(
    clamp(state.editorCurrentDuration + delta, 0.5, 16) * 10
  ) / 10;
  updateEditorDurDisplay();
  // Redraw the region highlight with the new duration
  updateScrubber(state.editorCurrentTime);
  stopPreview();
}

// ── Event wiring (called once from main.js) ───────────────────────────────────

export function initEditorEvents() {
  const timelineWrap = document.getElementById('timelineWrap');

  timelineWrap.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.isDragging = true;
    timelineWrap.setPointerCapture(e.pointerId);
    updateScrubber(timelinePointerToSec(e));
    stopPreview();
    if (navigator.vibrate) navigator.vibrate(10);
  });

  timelineWrap.addEventListener('pointermove', (e) => {
    if (!state.isDragging) return;
    updateScrubber(timelinePointerToSec(e));
  });

  timelineWrap.addEventListener('pointerup', () => { state.isDragging = false; });
  timelineWrap.addEventListener('pointercancel', () => { state.isDragging = false; });

  document.getElementById('sheetBackdrop').addEventListener('click', closeEditor);
  document.getElementById('sheetClose').addEventListener('click', closeEditor);
  document.getElementById('previewBtn').addEventListener('click', previewSample);
  document.getElementById('confirmBtn').addEventListener('click', confirmSamplePoint);

  document.getElementById('nudgeMinus5').addEventListener('click', () => nudge(-5));
  document.getElementById('nudgeMinus1').addEventListener('click', () => nudge(-1));
  document.getElementById('nudgeMinus01').addEventListener('click', () => nudge(-0.1));
  document.getElementById('nudgePlus01').addEventListener('click', () => nudge(0.1));
  document.getElementById('nudgePlus1').addEventListener('click', () => nudge(1));
  document.getElementById('nudgePlus5').addEventListener('click', () => nudge(5));

  document.getElementById('durMinus1').addEventListener('click', () => adjustEditorDuration(-1));
  document.getElementById('durMinus05').addEventListener('click', () => adjustEditorDuration(-0.5));
  document.getElementById('durMinus01').addEventListener('click', () => adjustEditorDuration(-0.1));
  document.getElementById('durPlus01').addEventListener('click', () => adjustEditorDuration(0.1));
  document.getElementById('durPlus05').addEventListener('click', () => adjustEditorDuration(0.5));
  document.getElementById('durPlus1').addEventListener('click', () => adjustEditorDuration(1));
}
