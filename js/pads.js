import { state } from './state.js';
import { formatTime } from './utils.js';

// Injected by main.js to avoid circular dep with editor.js
let _openEditor = () => {};
export function setOpenEditorCallback(fn) { _openEditor = fn; }

// ── Grid helpers ──────────────────────────────────────────────────────────────

function getGridCols(count) {
  if (count <= 2) return 'grid-2';
  if (count <= 6) return 'grid-3';
  return 'grid-4';
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderEmptyPads() {
  const grid = document.getElementById('padGrid');
  grid.className = 'pad-grid ' + getGridCols(state.padCount);
  grid.innerHTML = '';
  for (let i = 0; i < state.padCount; i++) {
    const pad = document.createElement('div');
    pad.className = 'pad';
    pad.innerHTML = `
      <div class="pad-num">P${String(i + 1).padStart(2, '0')}</div>
      <div class="pad-icon">+</div>
      <div class="pad-time">—:——</div>
      <div class="pad-bar"><div class="pad-bar-fill" id="bar${i}"></div></div>
    `;
    grid.appendChild(pad);
  }
}

export function renderPads() {
  const grid = document.getElementById('padGrid');
  grid.className = 'pad-grid ' + getGridCols(state.padCount);
  grid.innerHTML = '';

  state.pads.forEach((startSec, i) => {
    const pad = document.createElement('div');
    pad.className = 'pad loaded';
    pad.dataset.index = i;
    pad.innerHTML = `
      <div class="pad-num">P${String(i + 1).padStart(2, '0')}</div>
      <div class="pad-edit-icon">✏️</div>
      <div class="pad-time" id="padtime${i}">${formatTime(startSec)}</div>
      <div class="pad-bar"><div class="pad-bar-fill" id="bar${i}"></div></div>
    `;

    let pressTimer = null;
    let didLongPress = false;

    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      didLongPress = false;
      pad.classList.add('pressed');
      if (!state.editMode) {
        pressTimer = setTimeout(() => {
          didLongPress = true;
          pad.classList.remove('pressed');
          if (navigator.vibrate) navigator.vibrate([10, 20, 30]);
          _openEditor(i);
        }, 500);
      }
    });

    pad.addEventListener('pointerup', () => {
      clearTimeout(pressTimer);
      pad.classList.remove('pressed');
      if (!didLongPress) {
        if (state.editMode) _openEditor(i);
        else triggerPad(i, pad);
      }
      didLongPress = false;
    });

    pad.addEventListener('pointerleave', () => {
      clearTimeout(pressTimer);
      pad.classList.remove('pressed');
    });

    pad.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.appendChild(pad);
  });
}

export function updatePadTimeLabel(index) {
  const el = document.getElementById('padtime' + index);
  if (el) el.textContent = formatTime(state.pads[index]);
}

// ── Distribution ──────────────────────────────────────────────────────────────

export function distributePads() {
  if (!state.songLoaded) return;
  const margin = state.songDuration * 0.05;
  const usable = state.songDuration - margin * 2;
  const step = usable / state.padCount;
  state.pads = [];
  state.padDurations = [];
  for (let i = 0; i < state.padCount; i++) {
    state.pads.push(margin + step * i + step * 0.1);
    state.padDurations.push(state.padDuration);
  }
  renderPads();
}

// ── Playback ──────────────────────────────────────────────────────────────────

export function triggerPad(index, padEl) {
  if (!state.songLoaded || !state.player) return;
  clearPadState();

  state.currentPad = { index, el: padEl };
  padEl.classList.add('playing');
  state.padStartTime = Date.now();

  const seekTo = state.pads[index];
  state.player.seekTo(seekTo, true);
  state.player.playVideo();

  document.getElementById('statusDot').className = 'status-dot playing';
  document.getElementById('playingPad').textContent = `PAD ${index + 1} · ${formatTime(seekTo)}`;
  document.getElementById('stopBtn').className = 'stop-btn active';

  const bar = document.getElementById('bar' + index);
  const dur = state.padDurations[index] ?? state.padDuration;
  const totalMs = dur * 1000;
  state.padProgressInterval = setInterval(() => {
    const pct = Math.min(100, ((Date.now() - state.padStartTime) / totalMs) * 100);
    if (bar) bar.style.width = pct + '%';
  }, 50);

  state.padTimer = setTimeout(() => stopAll(), totalMs);
  if (navigator.vibrate) navigator.vibrate(30);
}

export function clearPadState() {
  if (state.padTimer) { clearTimeout(state.padTimer); state.padTimer = null; }
  if (state.padProgressInterval) { clearInterval(state.padProgressInterval); state.padProgressInterval = null; }
  document.querySelectorAll('.pad.playing').forEach(p => p.classList.remove('playing'));
  document.querySelectorAll('.pad-bar-fill').forEach(b => b.style.width = '0%');
  state.currentPad = null;
}

export function stopAll() {
  clearPadState();
  if (state.player && state.player.pauseVideo) state.player.pauseVideo();
  document.getElementById('statusDot').className = state.songLoaded ? 'status-dot ready' : 'status-dot';
  document.getElementById('playingPad').textContent = '—';
  document.getElementById('stopBtn').className = 'stop-btn';
}

// ── Config controls ───────────────────────────────────────────────────────────

export function restoreFromImport() {
  const imp = state.pendingImport;
  state.pendingImport = null;
  state.padCount = imp.padCount;
  state.pads = imp.pads;
  state.padDurations = imp.padDurations;
  document.getElementById('padCountVal').textContent = state.padCount;
  renderPads();
}

export function changePads(delta) {
  state.padCount = Math.max(1, Math.min(16, state.padCount + delta));
  document.getElementById('padCountVal').textContent = state.padCount;
  if (state.songLoaded) distributePads(); else renderEmptyPads();
}

export function updateDur() {
  state.padDuration = parseFloat(document.getElementById('durSlider').value);
  document.getElementById('durVal').textContent = state.padDuration + 's';
  // Reset all per-pad durations to the new global value
  state.padDurations = state.padDurations.map(() => state.padDuration);
}
