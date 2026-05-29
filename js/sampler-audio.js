import { state } from './state.js';
import { formatTime, showToast, setLoading } from './utils.js';

// Injected by main.js to break the circular dep with pads.js
let _onLoaded = () => {};
export function setOnLoadedCallback(fn) { _onLoaded = fn; }

// ── AudioContext ──────────────────────────────────────────────────────────────

function getCtx() {
  if (!state.samplerAudioContext) state.samplerAudioContext = new AudioContext();
  if (state.samplerAudioContext.state === 'suspended') state.samplerAudioContext.resume();
  return state.samplerAudioContext;
}

function stopSource() {
  if (!state.samplerAudioSource) return;
  try { state.samplerAudioSource.stop(0); } catch (_) {}
  try { state.samplerAudioSource.disconnect(); } catch (_) {}
  state.samplerAudioSource = null;
}

// ── File loading ──────────────────────────────────────────────────────────────

export async function loadSamplerFile(file) {
  setLoading(true, 'DECODING AUDIO…');
  try {
    const ctx = getCtx();
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());

    stopSource();
    state.samplerAudioBuffer = buf;
    state.samplerFileName    = file.name.replace(/\.[^.]+$/, '');
    state.songDuration       = buf.duration;
    state.songLoaded         = true;

    // Update filename display in file-row
    const nameEl = document.getElementById('samplerFileName');
    if (nameEl) { nameEl.textContent = state.samplerFileName; nameEl.classList.add('loaded'); }

    // Update info bar
    document.getElementById('songTitle').textContent = state.samplerFileName;
    document.getElementById('songTitle').className   = 'song-title loaded';
    const durBadge = document.getElementById('totalDur');
    durBadge.textContent = formatTime(buf.duration);
    durBadge.style.display = '';
    document.getElementById('statusDot').className = 'status-dot ready';

    _onLoaded();
    showToast('Audio ready — tap the pads', 'success');
  } catch {
    showToast('Could not decode this audio file');
  } finally {
    setLoading(false);
  }
}

// ── Playback ──────────────────────────────────────────────────────────────────

function startSource(offset, dur) {
  stopSource();
  const ctx = getCtx();
  const src = ctx.createBufferSource();
  src.buffer = state.samplerAudioBuffer;
  src.connect(ctx.destination);
  // 3-arg start(): begin at offset, play for dur seconds (audio auto-stops)
  src.start(0, offset, dur);
  state.samplerAudioSource = src;
}

export function triggerSamplerPad(offset, dur) {
  startSource(offset, dur);
}

export function stopSamplerAudio() {
  stopSource();
}

// ── Editor preview ────────────────────────────────────────────────────────────

export function previewSamplerSample(offset, dur) {
  startSource(offset, dur);
}

export function stopSamplerPreview() {
  stopSource();
}
