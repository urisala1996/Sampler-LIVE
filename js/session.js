import { state } from './state.js';
import { extractVideoId, showToast } from './utils.js';
import { loadSong } from './youtube.js';

// ── Export ────────────────────────────────────────────────────────────────────

export function exportSession() {
  if (!state.songLoaded) {
    showToast('Load a song first');
    return;
  }

  const url = document.getElementById('urlInput').value.trim();
  const data = {
    url,
    pads: state.pads.map((start, i) => ({
      start: Math.round(start * 100) / 100,
      dur: Math.round((state.padDurations[i] ?? state.padDuration) * 10) / 10,
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `aux-${extractVideoId(url) ?? 'session'}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Session exported', 'success');
}

// ── Import ────────────────────────────────────────────────────────────────────

export function triggerImportPicker() {
  document.getElementById('importFile').click();
}

export function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (typeof data.url !== 'string' || !Array.isArray(data.pads) || data.pads.length === 0) {
        showToast('Invalid session file');
        return;
      }
      // Stash the pad data — youtube.js will pick it up after the song loads
      state.pendingImport = {
        padCount: data.pads.length,
        pads: data.pads.map(p => Number(p.start)),
        padDurations: data.pads.map(p => Number(p.dur)),
      };
      document.getElementById('urlInput').value = data.url;
      loadSong();
    } catch {
      showToast('Could not read session file');
    }
  };
  reader.readAsText(file);
  // Reset input so the same file can be re-imported
  document.getElementById('importFile').value = '';
}
