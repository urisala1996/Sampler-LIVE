import { state } from './state.js';
import { formatTime, clamp, showToast, setLoading } from './utils.js';

const SECONDS_PER_REV = 8;      // 1 full spin = 8 s of audio
const INERTIA_DECAY   = 0.88;   // velocity multiplier per frame
const INERTIA_STOP    = 0.0002; // rad/ms threshold to halt inertia

// ── AudioContext (lazy — must be created inside a user gesture) ───────────────

function getCtx() {
  if (!state.djAudioContext) state.djAudioContext = new AudioContext();
  if (state.djAudioContext.state === 'suspended') state.djAudioContext.resume();
  return state.djAudioContext;
}

// ── Reversed buffer (built on demand, cached) ─────────────────────────────────

function getReversedBuffer() {
  if (state.djAudioReversed) return state.djAudioReversed;
  const ctx = getCtx();
  const src = state.djAudioBuffer;
  const rev = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
  for (let i = 0; i < src.numberOfChannels; i++) {
    const fwd = src.getChannelData(i);
    const dst = rev.getChannelData(i);
    for (let j = 0; j < fwd.length; j++) dst[j] = fwd[fwd.length - 1 - j];
  }
  state.djAudioReversed = rev;
  return rev;
}

// ── File loading ──────────────────────────────────────────────────────────────

const AUDIO_EXTENSIONS = new Set(['mp3','wav','ogg','flac','m4a','aac','opus','weba','webm']);

function isAudioFile(file) {
  if (!file) return false;
  if (file.type.startsWith('audio/')) return true;
  if (file.type === 'video/mp4') return true; // m4a is an MPEG-4 container, browsers may report video/mp4
  return AUDIO_EXTENSIONS.has(file.name.split('.').pop().toLowerCase());
}

export async function loadDjFile(file) {
  if (!isAudioFile(file)) { showToast('Drop an audio file (MP3, WAV, M4A, OGG…)'); return; }
  setLoading(true, 'DECODING AUDIO…');
  try {
    const arrayBuffer = await file.arrayBuffer();
    const ctx         = getCtx();
    const buffer      = await ctx.decodeAudioData(arrayBuffer);

    stopAudioSource();
    state.djAudioBuffer   = buffer;
    state.djAudioReversed = null;    // invalidate cached reverse
    state.djPlaybackOffset = 0;
    state.djPlaybackStart  = 0;
    state.djCurrentRate    = 1;
    state.djIsPlaying      = false;
    state.djWheelAngle     = 0;
    state.djFileName       = file.name.replace(/\.[^.]+$/, '');
    state.songDuration     = buffer.duration; // reused by renderWheel for progress arc

    const durEl = document.getElementById('djTotalTime');
    if (durEl) durEl.textContent = formatTime(buffer.duration);
    updateTimeDisplay(0);
    updatePlayBtn();

    document.getElementById('djUpload').style.display    = 'none';
    document.getElementById('djWheelArea').style.display = '';
    resizeCanvas();
    renderWheel();
    showToast('Audio ready · spin the wheel', 'success');
  } catch {
    showToast('Could not decode this audio file');
  } finally {
    setLoading(false);
  }
}

// ── Source node lifecycle ─────────────────────────────────────────────────────

function stopAudioSource() {
  if (!state.djAudioSource) return;
  try { state.djAudioSource.stop(0); }      catch (_) {}
  try { state.djAudioSource.disconnect(); } catch (_) {}
  state.djAudioSource = null;
}

function startSource(offset, rate) {
  stopAudioSource();
  if (!state.djAudioBuffer) return;

  const ctx       = getCtx();
  const isReverse = rate < 0;
  const buf       = isReverse ? getReversedBuffer() : state.djAudioBuffer;
  const dur       = state.djAudioBuffer.duration;
  const absRate   = Math.max(0.01, Math.abs(rate));

  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.playbackRate.value = absRate;
  source.connect(ctx.destination);

  const bufStart = isReverse ? clamp(dur - offset, 0, dur) : clamp(offset, 0, dur);
  source.start(0, bufStart);

  source.onended = () => {
    // Auto-pause when buffer runs out (only during normal forward play)
    if (state.djIsPlaying && !state.djIsScrubbing && state.djCurrentRate > 0) {
      _djPause();
    }
  };

  state.djAudioSource    = source;
  state.djPlaybackStart  = ctx.currentTime;
  state.djPlaybackOffset = clamp(offset, 0, dur);
  state.djCurrentRate    = isReverse ? -absRate : absRate;
}

// ── Position tracking ─────────────────────────────────────────────────────────

function djCurrentTime() {
  if (!state.djAudioContext || !state.djAudioBuffer) return state.djPlaybackOffset;
  const elapsed = (state.djAudioContext.currentTime - state.djPlaybackStart) * Math.abs(state.djCurrentRate);
  const t = state.djCurrentRate < 0
    ? state.djPlaybackOffset - elapsed
    : state.djPlaybackOffset + elapsed;
  return clamp(t, 0, state.djAudioBuffer.duration);
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function getCanvas() { return document.getElementById('djCanvas'); }

function resizeCanvas() {
  const canvas = getCanvas();
  if (!canvas) return;
  const dpr  = window.devicePixelRatio || 1;
  const size = Math.min(canvas.clientWidth, canvas.clientHeight);
  if (size > 0 && canvas.width !== Math.round(size * dpr)) {
    canvas.width  = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  }
}

// ── Wheel rendering ───────────────────────────────────────────────────────────

export function renderWheel() {
  const canvas = getCanvas();
  if (!canvas || canvas.width === 0) return;

  const dpr    = window.devicePixelRatio || 1;
  const W      = canvas.width  / dpr;
  const H      = canvas.height / dpr;
  const cx     = W / 2;
  const cy     = H / 2;
  const outerR = Math.min(W, H) / 2 - 4;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const angle    = state.djWheelAngle;
  const t        = djCurrentTime();
  const dur      = state.djAudioBuffer?.duration || 1;
  const progress = t / dur;

  // ── Rotating vinyl ──────────────────────────────────────────────────────────
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, Math.PI * 2);
  ctx.fillStyle = '#111';
  ctx.fill();

  const sheenGrad = ctx.createRadialGradient(0, 0, outerR * 0.85, 0, 0, outerR);
  sheenGrad.addColorStop(0, 'rgba(255,255,255,0)');
  sheenGrad.addColorStop(1, 'rgba(255,255,255,0.04)');
  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, Math.PI * 2);
  ctx.fillStyle = sheenGrad;
  ctx.fill();

  for (let r = outerR * 0.30; r < outerR * 0.94; r += 2.8) {
    const alpha = 0.18 + 0.14 * Math.sin(r * 0.35);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(80,80,80,${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const labelR = outerR * 0.27;
  ctx.beginPath();
  ctx.arc(0, 0, labelR, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,255,0,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0a0a';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(outerR * 0.87, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#c8ff00';
  ctx.shadowBlur  = 10;
  ctx.shadowColor = 'rgba(200,255,0,0.7)';
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();

  // ── Static elements (don't rotate) ─────────────────────────────────────────

  const startAngle = -Math.PI / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR - 2, startAngle, startAngle + progress * Math.PI * 2);
  ctx.strokeStyle = '#c8ff00';
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';
  ctx.shadowBlur  = 8;
  ctx.shadowColor = 'rgba(200,255,0,0.5)';
  ctx.stroke();
  ctx.shadowBlur  = 0;

  const labelR2  = outerR * 0.27;
  const maxChars = Math.floor(labelR2 * 0.18);
  const raw      = state.djFileName || '';
  const hasAudio = !!state.djAudioBuffer;
  const label    = hasAudio
    ? (raw.length > maxChars ? raw.slice(0, maxChars - 1) + '…' : raw || '—')
    : 'DROP A FILE';
  ctx.fillStyle    = hasAudio ? '#c8ff00' : '#444';
  ctx.font         = `bold ${Math.max(9, Math.floor(labelR2 * 0.22))}px "Space Mono", monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);
}

// ── Display helpers ───────────────────────────────────────────────────────────

function updateTimeDisplay(t) {
  const el = document.getElementById('djCurrentTime');
  if (el) el.textContent = formatTime(t);
}

function updatePlayBtn() {
  const btn = document.getElementById('djPlayBtn');
  if (btn) btn.textContent = state.djIsPlaying ? '⏸' : '▶';
}

// ── Playback animation loop ───────────────────────────────────────────────────

function _animTick() {
  if (!state.djIsPlaying) return;
  const t = djCurrentTime();
  state.djWheelAngle = (t / SECONDS_PER_REV) * Math.PI * 2;
  renderWheel();
  updateTimeDisplay(t);
  if (t >= (state.djAudioBuffer?.duration || 0) - 0.05) { _djPause(); return; }
  state.djAnimFrame = requestAnimationFrame(_animTick);
}

function _startAnimLoop() {
  if (state.djAnimFrame) cancelAnimationFrame(state.djAnimFrame);
  state.djAnimFrame = requestAnimationFrame(_animTick);
}

function _stopAnimLoop() {
  if (state.djAnimFrame) { cancelAnimationFrame(state.djAnimFrame); state.djAnimFrame = null; }
}

// ── Inertia loop — pitch slides down as platter coasts to a stop ──────────────

function _inertiaFrame() {
  state.djAngularVelocity *= INERTIA_DECAY;

  if (Math.abs(state.djAngularVelocity) < INERTIA_STOP) {
    state.djAngularVelocity = 0;
    const pos = djCurrentTime();
    stopAudioSource();
    state.djPlaybackOffset = pos;
    if (state.djIsPlaying) { startSource(pos, 1); _startAnimLoop(); }
    else { state.djWheelAngle = (pos / SECONDS_PER_REV) * Math.PI * 2; renderWheel(); updateTimeDisplay(pos); }
    return;
  }

  // Continuously update the source's playbackRate so pitch slides naturally
  const rate    = state.djAngularVelocity * SECONDS_PER_REV * 1000 / (Math.PI * 2);
  const absRate = Math.max(0.01, Math.abs(rate));
  if (state.djAudioSource) state.djAudioSource.playbackRate.value = absRate;
  state.djCurrentRate = rate > 0 ? absRate : -absRate;

  const t = djCurrentTime();
  state.djWheelAngle += state.djAngularVelocity;
  renderWheel();
  updateTimeDisplay(t);

  state.djInertiaFrame = requestAnimationFrame(_inertiaFrame);
}

function _startInertia() {
  if (state.djInertiaFrame) cancelAnimationFrame(state.djInertiaFrame);
  state.djInertiaFrame = requestAnimationFrame(_inertiaFrame);
}

function _stopInertia() {
  if (state.djInertiaFrame) { cancelAnimationFrame(state.djInertiaFrame); state.djInertiaFrame = null; }
}

// ── Play / Pause ──────────────────────────────────────────────────────────────

function _djPlay() {
  if (!state.djAudioBuffer) return;
  state.djIsPlaying = true;
  startSource(state.djPlaybackOffset, 1);
  _startAnimLoop();
  updatePlayBtn();
  document.getElementById('statusDot').className = 'status-dot playing';
}

function _djPause() {
  const pos = djCurrentTime();
  state.djPlaybackOffset = pos;
  state.djIsPlaying = false;
  _stopAnimLoop();
  stopAudioSource();
  state.djWheelAngle = (pos / SECONDS_PER_REV) * Math.PI * 2;
  renderWheel();
  updateTimeDisplay(pos);
  updatePlayBtn();
  document.getElementById('statusDot').className = state.djAudioBuffer ? 'status-dot ready' : 'status-dot';
}

// ── Scrub interaction ─────────────────────────────────────────────────────────

function pointerAngle(e, rect) {
  return Math.atan2(e.clientY - rect.top - rect.height / 2, e.clientX - rect.left - rect.width / 2);
}

function normalizeAngleDelta(d) {
  while (d >  Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function _djStartScrub(e) {
  if (!state.djAudioBuffer) return;
  _stopInertia();
  _stopAnimLoop();
  state.djIsScrubbing     = true;
  state.djAngularVelocity = 0;
  state.djPlaybackOffset  = djCurrentTime();
  stopAudioSource();
  const rect = getCanvas().getBoundingClientRect();
  state.djLastPointerAngle = pointerAngle(e, rect);
  state.djLastPointerTime  = performance.now();
  getCanvas().setPointerCapture(e.pointerId);
  if (navigator.vibrate) navigator.vibrate(5);
}

function _djMoveScrub(e) {
  if (!state.djIsScrubbing) return;
  const rect  = getCanvas().getBoundingClientRect();
  const now   = performance.now();
  const angle = pointerAngle(e, rect);
  const delta = normalizeAngleDelta(angle - state.djLastPointerAngle);
  const dt    = Math.max(1, now - state.djLastPointerTime);

  const timeDelta = (delta / (Math.PI * 2)) * SECONDS_PER_REV;
  const newPos    = clamp(state.djPlaybackOffset + timeDelta, 0, state.djAudioBuffer.duration);
  state.djPlaybackOffset = newPos;

  const rawVel = delta / dt;
  state.djAngularVelocity = state.djAngularVelocity * 0.6 + rawVel * 0.4;

  state.djWheelAngle       += delta;
  state.djLastPointerAngle  = angle;
  state.djLastPointerTime   = now;

  // Play a burst of the actual audio at scrub speed — this IS the scratch sound
  if (Math.abs(state.djAngularVelocity) > INERTIA_STOP * 2) {
    const rate = state.djAngularVelocity * SECONDS_PER_REV * 1000 / (Math.PI * 2);
    startSource(newPos, rate);
  } else {
    stopAudioSource();
  }

  renderWheel();
  updateTimeDisplay(newPos);
}

function _djEndScrub() {
  if (!state.djIsScrubbing) return;
  state.djIsScrubbing = false;
  stopAudioSource();

  if (Math.abs(state.djAngularVelocity) > INERTIA_STOP) {
    // Kick off inertia with the audio playing at the release velocity
    const rate = state.djAngularVelocity * SECONDS_PER_REV * 1000 / (Math.PI * 2);
    startSource(state.djPlaybackOffset, rate);
    _startInertia();
  } else if (state.djIsPlaying) {
    startSource(state.djPlaybackOffset, 1);
    _startAnimLoop();
  } else {
    renderWheel();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function djSyncAfterLoad() {
  // DJ mode uses its own audio source — no YouTube sync needed.
  // Called by youtube.js after a song loads; just keep the wheel current.
  renderWheel();
}

export function activateDj() {
  const hasAudio = !!state.djAudioBuffer;
  document.getElementById('djUpload').style.display    = hasAudio ? 'none' : '';
  document.getElementById('djWheelArea').style.display = hasAudio ? ''     : 'none';
  if (hasAudio) {
    resizeCanvas();
    renderWheel();
    updateTimeDisplay(djCurrentTime());
    const durEl = document.getElementById('djTotalTime');
    if (durEl) durEl.textContent = formatTime(state.djAudioBuffer.duration);
  }
  updatePlayBtn();
  if (state.djIsPlaying) _startAnimLoop();
}

export function deactivateDj() {
  _stopAnimLoop();
  _stopInertia();
  if (state.djIsPlaying) {
    state.djIsPlaying = false;
    stopAudioSource();
    updatePlayBtn();
  }
  document.getElementById('statusDot').className = state.songLoaded ? 'status-dot ready' : 'status-dot';
}

export function initDjEvents() {
  const canvas = getCanvas();

  canvas.addEventListener('pointerdown',   _djStartScrub);
  canvas.addEventListener('pointermove',   _djMoveScrub);
  canvas.addEventListener('pointerup',     _djEndScrub);
  canvas.addEventListener('pointercancel', _djEndScrub);
  canvas.addEventListener('contextmenu',   (e) => e.preventDefault());

  document.getElementById('djPlayBtn').addEventListener('click', () => {
    if (state.djIsPlaying) _djPause(); else _djPlay();
  });

  // File picker
  const fileInput = document.getElementById('djFileInput');
  const browseBtn = document.getElementById('djBrowseBtn');
  browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) loadDjFile(e.target.files[0]);
    fileInput.value = '';
  });

  // Drag and drop
  const dropZone = document.getElementById('djDropZone');
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) loadDjFile(e.dataTransfer.files[0]);
  });

  // Redraw on resize
  new ResizeObserver(() => {
    if (state.activeView === 'dj' && state.djAudioBuffer) { resizeCanvas(); renderWheel(); }
  }).observe(canvas);
}
