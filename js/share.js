import { state } from './state.js';
import { showToast } from './utils.js';

// ── Encode / Decode ───────────────────────────────────────────────────────────

function encodeSession(data) {
  const json    = JSON.stringify(data);
  const b64     = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decodeSession(hash) {
  try {
    const b64  = hash.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ── Share ─────────────────────────────────────────────────────────────────────

export function shareSession() {
  if (!state.songLoaded) {
    showToast('Load a song first');
    return;
  }
  if (state.samplerSource === 'file') {
    showToast('Sharing only works with YouTube source');
    return;
  }

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
  const url     = `${location.origin}${location.pathname}#${encoded}`;

  navigator.clipboard.writeText(url).then(() => {
    showToast('Link copied to clipboard!', 'success');
  }).catch(() => {
    // Fallback: show in a prompt so user can copy manually
    window.prompt('Copy this link:', url);
  });

  // Update the browser URL bar without a page reload
  history.replaceState(null, '', `#${encoded}`);
}

// ── Restore from URL hash on page load ───────────────────────────────────────

export function getSessionFromHash() {
  const raw = location.hash.slice(1);
  if (!raw) return null;
  return decodeSession(raw);
}

// Clear hash once session is restored so refresh doesn't re-trigger
export function clearHash() {
  history.replaceState(null, '', location.pathname + location.search);
}
