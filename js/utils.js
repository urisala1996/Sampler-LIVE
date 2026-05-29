export function extractVideoId(url) {
  const patterns = [
    /[?&]v=([^&#]+)/,
    /youtu\.be\/([^?&#]+)/,
    /embed\/([^?&#]+)/,
    /shorts\/([^?&#]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function formatTime(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTimeMs(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m}:${parseFloat(s) < 10 ? '0' : ''}${s}`;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function showToast(msg, type = 'error') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type === 'success' ? ' success' : '');
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

export function setLoading(show, text = 'LOADING...') {
  document.getElementById('loaderText').textContent = text;
  document.getElementById('loadingOverlay').className = show ? 'loading-overlay show' : 'loading-overlay';
}
