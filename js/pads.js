import { state } from './state.js';
import { formatTime } from './utils.js';
import { icon } from './icons.js';
import { triggerSamplerPad, stopSamplerAudio } from './sampler-audio.js';
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
    const pad = document.createElement('div');
    pad.className = 'pad loaded';
    pad.dataset.index = i;
    pad.innerHTML = `
      <div class="pad-num">P${String(i + 1).padStart(2, '0')}</div>
      <div class="pad-edit-icon">${icon('pencil', 10)}</div>
      <div class="pad-time" id="padtime${i}">${formatTime(startSec)}</div>
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
  state.padCount     = points.length;
  state.pads         = points.map(p => p.start);
  state.padDurations = points.map(p => p.dur);
  document.getElementById('padCountVal').textContent = state.padCount;
  renderPads();
}

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

// remote = true when triggered by a room event — skips re-broadcast.
// fireAt: wall-clock ms (Date.now()-based) for scheduled sync in file+room mode.
export function triggerPad(index, padEl, remote = false, fireAt = null) {
  if (!state.songLoaded) return;
  if (state.samplerSource === 'youtube' && !state.player) return;
  if (state.samplerSource === 'file'    && !state.samplerAudioBuffer) return;
  clearPadState();

  state.currentPad = { index, el: padEl };
  padEl.classList.add('playing');

  const seekTo = state.pads[index];
  const dur    = state.padDurations[index] ?? state.padDuration;

  // Scheduled sync: only in file mode inside a room
  let resolvedFireAt = null;
  if (state.samplerSource === 'file' && state.roomActive) {
    resolvedFireAt = remote ? fireAt : _computeFireAt();
  }

  // padStartTime = when audio fires (for progress bar alignment)
  state.padStartTime = resolvedFireAt ?? Date.now();

  if (state.samplerSource === 'file') {
    triggerSamplerPad(seekTo, dur, resolvedFireAt);
  } else {
    state.player.seekTo(seekTo, true);
    state.player.playVideo();
  }

  document.getElementById('statusDot').className = 'status-dot playing';
  document.getElementById('playingPad').textContent = `PAD ${index + 1} · ${formatTime(seekTo)}`;
  const stopBtn = document.getElementById('stopBtn');
  stopBtn.className = 'stop-btn active';
  stopBtn.innerHTML = icon('stop', 14);

  const bar = document.getElementById('bar' + index);
  const totalMs  = dur * 1000;
  const audioDelay = resolvedFireAt ? Math.max(0, resolvedFireAt - Date.now()) : 0;
  state.padProgressInterval = setInterval(() => {
    const pct = Math.max(0, Math.min(100, ((Date.now() - state.padStartTime) / totalMs) * 100));
    if (bar) bar.style.width = pct + '%';
  }, 50);

  state.padTimer = setTimeout(() => stopAll(), totalMs + audioDelay);
  if (!remote && state.roomActive) broadcastEvent('pad_trigger', { index, fireAt: resolvedFireAt });
  if (navigator.vibrate) navigator.vibrate(30);
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

export function clearPadState() {
  if (state.padTimer) { clearTimeout(state.padTimer); state.padTimer = null; }
  if (state.padProgressInterval) { clearInterval(state.padProgressInterval); state.padProgressInterval = null; }
  document.querySelectorAll('.pad.playing').forEach(p => p.classList.remove('playing'));
  document.querySelectorAll('.pad-bar-fill').forEach(b => b.style.width = '0%');
  state.currentPad = null;
}

export function stopAll() {
  clearPadState();
  if (state.samplerSource === 'file') {
    stopSamplerAudio();
  } else if (state.player && state.player.pauseVideo) {
    state.player.pauseVideo();
  }
  document.getElementById('statusDot').className = state.songLoaded ? 'status-dot ready' : 'status-dot';
  document.getElementById('playingPad').textContent = '—';
  const stopBtn = document.getElementById('stopBtn');
  stopBtn.className = 'stop-btn';
  stopBtn.innerHTML = icon('stop', 14);
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
