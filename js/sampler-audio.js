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

function startSource(offset, dur, when) {
  stopSource();
  const ctx = getCtx();
  const src = ctx.createBufferSource();
  src.buffer = state.samplerAudioBuffer;
  src.connect(ctx.destination);
  src.start(when ?? 0, offset, dur);
  state.samplerAudioSource = src;
}

// fireAt: optional wall-clock timestamp (Date.now() ms) for scheduled sync.
// When omitted the pad fires immediately.
export function triggerSamplerPad(offset, dur, fireAt) {
  const ctx  = getCtx();
  const when = (fireAt != null)
    ? ctx.currentTime + Math.max(0, (fireAt - Date.now()) / 1000)
    : 0;
  startSource(offset, dur, when);
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

// ── BPM auto-detection ────────────────────────────────────────────────────────
// Onset-energy approach: find local energy peaks, measure inter-onset intervals.
// Returns integer BPM (60–200) or null if the estimate is unreliable.
export function detectBpm(audioBuffer) {
  if (!audioBuffer) return null;
  const sr      = audioBuffer.sampleRate;
  const data    = audioBuffer.getChannelData(0);
  const winSamp = Math.floor(sr * 0.05);   // 50 ms window
  const hopSamp = Math.floor(sr * 0.025);  // 25 ms hop
  const count   = Math.floor((data.length - winSamp) / hopSamp);
  if (count < 20) return null;

  // RMS energy per window
  const energy = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    const s = i * hopSamp;
    for (let j = s; j < s + winSamp; j++) sum += data[j] * data[j];
    energy[i] = Math.sqrt(sum / winSamp);
  }

  // Local-maxima onset detection above a threshold
  const mean      = energy.reduce((a, b) => a + b, 0) / count;
  const threshold = mean * 1.5;
  const minGap    = Math.round(0.15 / (hopSamp / sr)); // min 150 ms between onsets
  const onsets    = [];
  for (let i = 2; i < count - 2; i++) {
    if (energy[i] < threshold) continue;
    if (energy[i] < energy[i - 1] || energy[i] < energy[i + 1]) continue;
    if (onsets.length && i - onsets[onsets.length - 1] < minGap) continue;
    onsets.push(i);
  }
  if (onsets.length < 4) return null;

  // Inter-onset intervals in ms → histogram (10 ms bins)
  const bins = {};
  for (let i = 1; i < onsets.length; i++) {
    const ms     = Math.round((onsets[i] - onsets[i - 1]) * hopSamp / sr * 1000);
    const bucket = Math.round(ms / 10) * 10;
    bins[bucket] = (bins[bucket] || 0) + 1;
  }
  const [bestMs] = Object.entries(bins).sort((a, b) => b[1] - a[1])[0];
  const rawBpm   = Math.round(60_000 / parseFloat(bestMs));

  // Fold into 60–200 BPM range by doubling / halving
  let bpm = rawBpm;
  while (bpm > 200) bpm = Math.round(bpm / 2);
  while (bpm < 60)  bpm = Math.round(bpm * 2);
  return (bpm >= 60 && bpm <= 200) ? bpm : null;
}

// ── Smart sample-point detection ──────────────────────────────────────────────
// Finds the most energetic moments in an AudioBuffer and returns padCount
// { start, dur } pairs sorted chronologically. Returns null if the audio
// doesn't have enough clear onsets (e.g. silence or a pure tone).
export function detectSamplePoints(audioBuffer, padCount) {
  if (!audioBuffer || padCount < 1) return null;
  const sr      = audioBuffer.sampleRate;
  const data    = audioBuffer.getChannelData(0);
  const winSamp = Math.floor(sr * 0.05);   // 50 ms window
  const hopSamp = Math.floor(sr * 0.025);  // 25 ms hop
  const count   = Math.floor((data.length - winSamp) / hopSamp);
  if (count < 20) return null;

  const energy = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    const s = i * hopSamp;
    for (let j = s; j < s + winSamp; j++) sum += data[j] * data[j];
    energy[i] = Math.sqrt(sum / winSamp);
  }

  // 500 ms minimum gap — want distinct musical moments, not every beat
  const mean      = energy.reduce((a, b) => a + b, 0) / count;
  const threshold = mean * 1.5;
  const minGap    = Math.round(0.5 / (hopSamp / sr));
  const onsets    = [];
  for (let i = 2; i < count - 2; i++) {
    if (energy[i] < threshold) continue;
    if (energy[i] < energy[i - 1] || energy[i] < energy[i + 1]) continue;
    if (onsets.length && i - onsets[onsets.length - 1].w < minGap) continue;
    onsets.push({ w: i, time: i * hopSamp / sr, strength: energy[i] });
  }
  if (onsets.length < 2) return null;

  // Take the strongest N, then re-sort by time
  const selected = [...onsets]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, padCount)
    .sort((a, b) => a.time - b.time);

  const maxDur = (state.padDuration || 2) * 2;
  return selected.map((onset, i) => {
    const nextTime = i < selected.length - 1 ? selected[i + 1].time : audioBuffer.duration;
    const gap = nextTime - onset.time;
    return {
      start: Math.round(onset.time * 100) / 100,
      dur:   Math.round(Math.min(Math.max(gap * 0.75, 0.5), maxDur) * 10) / 10,
    };
  });
}
