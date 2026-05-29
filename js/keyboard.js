import { state } from './state.js';
import { triggerPad, stopAll } from './pads.js';
import { openEditor, closeEditor, confirmSamplePoint, nudge, previewSample } from './editor.js';

const PAD_KEYS = ['q','w','e','r','a','s','d','f','z','x','c','v','1','2','3','4'];

export function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    const editorOpen = document.getElementById('editorSheet').classList.contains('show');

    if (editorOpen) {
      if (e.key === 'Escape') { closeEditor(); return; }
      if (e.key === 'Enter') { confirmSamplePoint(); return; }
      if (e.key === ' ') { e.preventDefault(); previewSample(); return; }
      if (e.key === 'ArrowLeft') { nudge(e.shiftKey ? -5 : e.altKey ? -0.1 : -1); return; }
      if (e.key === 'ArrowRight') { nudge(e.shiftKey ? 5 : e.altKey ? 0.1 : 1); return; }
      return;
    }

    const idx = PAD_KEYS.indexOf(e.key.toLowerCase());
    if (idx >= 0 && idx < state.pads.length) {
      const padEls = document.querySelectorAll('.pad.loaded');
      const padEl = padEls[idx];
      if (!padEl) return;
      if (state.editMode) { openEditor(idx); return; }
      padEl.classList.add('pressed');
      triggerPad(idx, padEl);
      setTimeout(() => padEl.classList.remove('pressed'), 150);
      return;
    }

    if (e.key === ' ' || e.key === 'Escape') { e.preventDefault(); stopAll(); }
  });
}
