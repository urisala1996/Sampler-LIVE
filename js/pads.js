import { state } from './state.js';
import { formatTime } from './utils.js';
import { icon } from './icons.js';
import { triggerSamplerPad, stopSamplerAudio, stopSamplerPad } from './sampler-audio.js';
import { broadcastEvent, LOOKAHEAD_MS } from './room.js';

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
      <div class="pad-icon">${icon('plus', 16)}</div>
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
    const cat = state.padCategories[i] || '';
    const pad = document.createElement('div');
    pad.className = 'pad loaded' + (cat ? ` cat-${cat}` : '');
    pad.dataset.index = i;
    pad.innerHTML = `
      <div class="pad-num">P${String(i + 1).padStart(2, '0')}</div>
      <div class="pad-edit-icon">${icon('pencil', 10)}</div>
      <div class="pad-time" id="padtime${i}">${formatTime(startSec)}</div>
      ${cat ? `<div class="pad-category">${cat.toUpperCase()}</div>` : ''}
      <div class="pad-bar"><div class="pad-bar-fill" id="bar${i}"></div></div>
    `;

    let pressTimer = null;
    let didLongPress = false;

    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      didLongPress = false;
      pad.classList.add('pressed');
      // Pre-seek: buffer the YouTube position on touch — reduces seek latency by ~100ms
      if (!state.editMode && state.samplerSource === 'youtube' && state.player && state.songLoaded) {
        state.player.seekTo(state.pads[i], true);
      }
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

export function smartDistributePads(points) {
  stopAll();
  state.padCount      = points.length;
  state.pads          = points.map(p => p.start);
  state.padDurations  = points.map(p => p.dur);
  state.padCategories = new Array(points.length).fill('');
  document.getElementById('padCountVal').textContent = state.padCount;
  renderPads();
}

export function distributePads() {
  if (!state.songLoaded) return;
  stopAll();
  const margin = state.songDuration * 0.05;
  const usable = state.songDuration - margin * 2;
  const step = usable / state.padCount;
  state.pads = [];
  state.padDurations = [];
  state.padCategories = new Array(state.padCount).fill('');
  for (let i = 0; i < state.padCount; i++) {
    state.pads.push(margin + step * i + step * 0.1);
    state.padDurations.push(state.padDuration);
  }
  renderPads();
}

// ── Playback ──────────────────────────────────────────────────────────────────

// remote = true when triggered by a room event — skips re-broadcast.
// fireAt: wall-clock ms (Date.now()-based) for scheduled sync in file+room mode.
export function triggerPad(index, padEl, remote = false, fireAt = null) {
  if (!state.songLoaded) return;
  if (state.samplerSource === 'youtube' && !state.player) return;
  if (state.samplerSource === 'file'    && !state.samplerAudioBuffer) return;

  // File mode: tap-to-toggle — tapping a playing pad stops just that pad
  if (state.samplerSource === 'file' && state.activePads.has(index) && !remote) {
    stopPad(index);
    if (state.roomActive) broadcastEvent('pad_stop', { index });
    return;
  }

  // YouTube mode is monophonic — clear all active pads before starting a new one
  if (state.samplerSource === 'youtube') _clearAllPads();

  padEl.classList.add('playing');

  const seekTo = state.pads[index];
  const dur    = state.padDurations[index] ?? state.padDuration;

  // Scheduled sync: only in file mode inside a room
  let resolvedFireAt = null;
  if (state.samplerSource === 'file' && state.roomActive) {
    resolvedFireAt = remote ? fireAt : _computeFireAt();
  }

  const startTime  = resolvedFireAt ?? Date.now();
  const totalMs    = dur * 1000;
  const audioDelay = resolvedFireAt ? Math.max(0, resolvedFireAt - Date.now()) : 0;

  let sourceNode = null;
  if (state.samplerSource === 'file') {
    sourceNode = triggerSamplerPad(seekTo, dur, resolvedFireAt);
  } else {
    state.player.seekTo(seekTo, true);
    state.player.playVideo();
  }

  const bar = document.getElementById('bar' + index);
  const interval = setInterval(() => {
    const pct = Math.max(0, Math.min(100, ((Date.now() - startTime) / totalMs) * 100));
    if (bar) bar.style.width = pct + '%';
  }, 50);

  const timer = setTimeout(() => stopPad(index), totalMs + audioDelay);

  state.activePads.set(index, { el: padEl, timer, interval, startTime, sourceNode });
  _updatePlayingUi();

  if (!remote && state.roomActive) broadcastEvent('pad_trigger', { index, fireAt: resolvedFireAt });
  if (navigator.vibrate) navigator.vibrate(30);
}

// Stop a single pad by index (file or YouTube).
export function stopPad(index) {
  const pad = state.activePads.get(index);
  if (!pad) return;
  clearTimeout(pad.timer);
  clearInterval(pad.interval);
  if (pad.sourceNode) stopSamplerPad(pad.sourceNode);
  const bar = document.getElementById('bar' + index);
  if (bar) bar.style.width = '0%';
  pad.el.classList.remove('playing');
  state.activePads.delete(index);
  _updatePlayingUi();
}

// Compute the next scheduled fire time (wall-clock ms).
// Snaps to the beat grid when BPM is set; otherwise plain lookahead.
function _computeFireAt() {
  const now = Date.now();
  if (state.roomBpm > 0 && state.roomBeatZero > 0) {
    const beatMs = 60_000 / state.roomBpm;
    const elapsed = (now + LOOKAHEAD_MS) - state.roomBeatZero;
    // Use positive-safe modulo to get phase within current beat
    const phase  = ((elapsed % beatMs) + beatMs) % beatMs;
    const toNext = (beatMs - phase) % beatMs; // 0 if exactly on a beat
    return now + LOOKAHEAD_MS + toNext;
  }
  return now + LOOKAHEAD_MS;
}

// Clear all pad tracking state (timers, DOM classes) without stopping audio.
function _clearAllPads() {
  for (const [idx, pad] of state.activePads) {
    clearTimeout(pad.timer);
    clearInterval(pad.interval);
    pad.el.classList.remove('playing');
    const bar = document.getElementById('bar' + idx);
    if (bar) bar.style.width = '0%';
  }
  state.activePads.clear();
}

// Update transport UI to reflect how many pads are currently active.
function _updatePlayingUi() {
  const count   = state.activePads.size;
  const statusDot = document.getElementById('statusDot');
  const playingPad = document.getElementById('playingPad');
  const stopBtn = document.getElementById('stopBtn');
  stopBtn.innerHTML = icon('stop', 14);
  if (count === 0) {
    statusDot.className = state.songLoaded ? 'status-dot ready' : 'status-dot';
    playingPad.textContent = '—';
    stopBtn.className = 'stop-btn';
  } else {
    statusDot.className = 'status-dot playing';
    stopBtn.className = 'stop-btn active';
    if (count === 1) {
      const [idx] = state.activePads.keys();
      playingPad.textContent = `PAD ${idx + 1} · ${formatTime(state.pads[idx])}`;
    } else {
      playingPad.textContent = `${count} PLAYING`;
    }
  }
}

export function stopAll() {
  _clearAllPads();
  if (state.samplerSource === 'file') {
    stopSamplerAudio();
  } else if (state.player && state.player.pauseVideo) {
    state.player.pauseVideo();
  }
  _updatePlayingUi();
}

// ── Config controls ───────────────────────────────────────────────────────────

export function restoreFromImport() {
  const imp = state.pendingImport;
  state.pendingImport = null;
  state.padCount     = imp.padCount;
  state.pads         = imp.pads;
  state.padDurations = imp.padDurations;
  state.padCategories = imp.padCategories ?? new Array(imp.padCount).fill('');
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
