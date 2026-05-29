import { state } from './state.js';
import { loadYTScript, loadSong } from './youtube.js';
import { renderEmptyPads, updateDur, changePads, stopAll, setOpenEditorCallback, distributePads, restoreFromImport } from './pads.js';
import { openEditor, initEditorEvents } from './editor.js';
import { initKeyboard } from './keyboard.js';
import { exportSession, triggerImportPicker, handleImportFile, setSamplerSourceCallback } from './session.js';
import { initDjEvents, activateDj, deactivateDj } from './dj.js';
import { loadSamplerFile, setOnLoadedCallback } from './sampler-audio.js';
import { icon } from './icons.js';

// ── Source toggle ─────────────────────────────────────────────────────────────

function setSamplerSource(src) {
  state.samplerSource = src;
  const isFile = src === 'file';

  document.getElementById('srcYoutubeBtn').classList.toggle('active', !isFile);
  document.getElementById('srcFileBtn').classList.toggle('active', isFile);
  document.getElementById('urlRow').style.display  = isFile ? 'none' : '';
  document.getElementById('fileRow').style.display = isFile ? ''     : 'none';

  // Reset shared song state on source switch
  state.songLoaded   = false;
  state.songDuration = 0;
  state.pads         = [];
  state.padDurations = [];
  state.pendingImport = null;

  if (isFile) {
    state.samplerAudioBuffer = null;
    state.samplerFileName    = '';
    const nameEl = document.getElementById('samplerFileName');
    if (nameEl) { nameEl.textContent = 'Drop audio or browse'; nameEl.classList.remove('loaded'); }
    document.getElementById('songTitle').textContent = 'Drop an audio file below';
  } else {
    document.getElementById('songTitle').textContent = 'Paste a YouTube URL and hit LOAD';
  }

  document.getElementById('songTitle').className  = 'song-title';
  document.getElementById('totalDur').style.display = 'none';
  document.getElementById('statusDot').className  = 'status-dot';
  renderEmptyPads();
}

// ── View toggle ───────────────────────────────────────────────────────────────

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

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  // Break circular deps by injecting callbacks
  setOpenEditorCallback(openEditor);
  setOnLoadedCallback(() => state.pendingImport ? restoreFromImport() : distributePads());
  setSamplerSourceCallback(setSamplerSource);

  // Config panel
  document.getElementById('loadBtn').addEventListener('click', loadSong);
  document.getElementById('editModeBtn').addEventListener('click', toggleEditMode);
  document.getElementById('stopBtn').addEventListener('click', stopAll);
  document.getElementById('padMinus4').addEventListener('click', () => changePads(-4));
  document.getElementById('padMinus1').addEventListener('click', () => changePads(-1));
  document.getElementById('padPlus1').addEventListener('click',  () => changePads(1));
  document.getElementById('padPlus4').addEventListener('click',  () => changePads(4));
  document.getElementById('durSlider').addEventListener('input', updateDur);
  document.getElementById('exportBtn').addEventListener('click', exportSession);
  document.getElementById('importBtn').addEventListener('click', triggerImportPicker);
  document.getElementById('importFile').addEventListener('change', (e) => handleImportFile(e.target.files[0]));

  // Source toggle
  document.getElementById('srcYoutubeBtn').addEventListener('click', () => setSamplerSource('youtube'));
  document.getElementById('srcFileBtn').addEventListener('click',    () => setSamplerSource('file'));

  // Sampler file input + drag-drop
  const samplerInput = document.getElementById('samplerFileInput');
  document.getElementById('samplerBrowseBtn').addEventListener('click', () => samplerInput.click());
  samplerInput.addEventListener('change', (e) => {
    if (e.target.files[0]) loadSamplerFile(e.target.files[0]);
    samplerInput.value = '';
  });
  const fileRow = document.getElementById('fileRow');
  fileRow.addEventListener('dragover',  (e) => { e.preventDefault(); fileRow.querySelector('.file-drop-target').classList.add('drag-over'); });
  fileRow.addEventListener('dragleave', ()  => fileRow.querySelector('.file-drop-target').classList.remove('drag-over'));
  fileRow.addEventListener('drop', (e) => {
    e.preventDefault();
    fileRow.querySelector('.file-drop-target').classList.remove('drag-over');
    if (e.dataTransfer.files[0]) loadSamplerFile(e.dataTransfer.files[0]);
  });

  // View toggle
  document.getElementById('sampleModeBtn').addEventListener('click', () => setView('sampler'));
  document.getElementById('djModeBtn').addEventListener('click',     () => setView('dj'));

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
