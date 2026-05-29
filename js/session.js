import { state } from './state.js';
import { extractVideoId, showToast } from './utils.js';
import { loadSong } from './youtube.js';

// Injected by main.js — lets import handler switch the source toggle
let _setSamplerSource = () => {};
export function setSamplerSourceCallback(fn) { _setSamplerSource = fn; }

// ── Export ────────────────────────────────────────────────────────────────────

export function exportSession() {
  if (!state.songLoaded) {
    showToast('Load a song first');
    return;
  }

  const isFile = state.samplerSource === 'file';
  const pads   = state.pads.map((start, i) => ({
    start: Math.round(start * 100) / 100,
    dur:   Math.round((state.padDurations[i] ?? state.padDuration) * 10) / 10,
  }));

  const data = isFile
    ? { source: 'file', filename: state.samplerFileName, pads }
    : { source: 'youtube', url: document.getElementById('urlInput').value.trim(), pads };

  const slug = isFile
    ? state.samplerFileName
    : (extractVideoId(data.url) ?? 'session');

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `aux-${slug}.json`;
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
      if (!Array.isArray(data.pads) || data.pads.length === 0) {
        showToast('Invalid session file');
        return;
      }

      state.pendingImport = {
        padCount:     data.pads.length,
        pads:         data.pads.map(p => Number(p.start)),
        padDurations: data.pads.map(p => Number(p.dur)),
      };

      const source = data.source ?? 'youtube';  // backwards compat with old sessions

      if (source === 'file') {
        _setSamplerSource('file');
        showToast(`Load "${data.filename ?? 'audio file'}" to restore playback`);
      } else {
        if (!data.url) { showToast('Invalid session file'); return; }
        document.getElementById('urlInput').value = data.url;
        loadSong();
      }
    } catch {
      showToast('Could not read session file');
    }
  };
  reader.readAsText(file);
  document.getElementById('importFile').value = '';
}
