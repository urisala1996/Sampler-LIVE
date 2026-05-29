import { state } from './state.js';
import { loadYTScript, loadSong } from './youtube.js';
import { renderEmptyPads, updateDur, changePads, stopAll, setOpenEditorCallback } from './pads.js';
import { openEditor, initEditorEvents } from './editor.js';
import { initKeyboard } from './keyboard.js';
import { exportSession, triggerImportPicker, handleImportFile } from './session.js';
import { initDjEvents, activateDj, deactivateDj } from './dj.js';
import { icon } from './icons.js';

function toggleEditMode() {
  state.editMode = !state.editMode;
  document.body.classList.toggle('edit-mode', state.editMode);
  const btn = document.getElementById('editModeBtn');
  btn.classList.toggle('active', state.editMode);
  btn.innerHTML = state.editMode
    ? `${icon('check', 11)} DONE`
    : `${icon('pencil', 11)} EDIT`;
  document.getElementById('editHint').classList.toggle('show', state.editMode);
  document.getElementById('tapHint').textContent = state.editMode ? 'TAP PAD TO EDIT' : 'TAP TO PLAY';
}

function setView(view) {
  state.activeView = view;
  document.body.classList.toggle('dj-active', view === 'dj');
  document.getElementById('padZone').style.display = view === 'sampler' ? '' : 'none';
  document.getElementById('djZone').style.display  = view === 'dj'      ? '' : 'none';
  document.getElementById('sampleModeBtn').classList.toggle('active', view === 'sampler');
  document.getElementById('djModeBtn').classList.toggle('active', view === 'dj');
  if (view === 'dj') {
    stopAll();
    activateDj();
  } else {
    deactivateDj();
  }
}

function init() {
  // Break the pads ↔ editor circular dep by injecting the callback here
  setOpenEditorCallback(openEditor);

  // Config panel
  document.getElementById('loadBtn').addEventListener('click', loadSong);
  document.getElementById('editModeBtn').addEventListener('click', toggleEditMode);
  document.getElementById('stopBtn').addEventListener('click', stopAll);
  document.getElementById('padMinus4').addEventListener('click', () => changePads(-4));
  document.getElementById('padMinus1').addEventListener('click', () => changePads(-1));
  document.getElementById('padPlus1').addEventListener('click', () => changePads(1));
  document.getElementById('padPlus4').addEventListener('click', () => changePads(4));
  document.getElementById('durSlider').addEventListener('input', updateDur);
  document.getElementById('exportBtn').addEventListener('click', exportSession);
  document.getElementById('importBtn').addEventListener('click', triggerImportPicker);
  document.getElementById('importFile').addEventListener('change', (e) => handleImportFile(e.target.files[0]));

  document.getElementById('sampleModeBtn').addEventListener('click', () => setView('sampler'));
  document.getElementById('djModeBtn').addEventListener('click', () => setView('dj'));

  // Subsystems
  initEditorEvents();
  initDjEvents();
  initKeyboard();
  loadYTScript();

  // Initial render
  renderEmptyPads();
  updateDur();
}

init();
