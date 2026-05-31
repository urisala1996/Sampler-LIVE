import { state } from './state.js';
import { loadYTScript, loadSong, markRemoteLoad } from './youtube.js';
import { renderEmptyPads, updateDur, changePads, stopAll, stopPad, triggerPad, setOpenEditorCallback, distributePads, restoreFromImport, smartDistributePads } from './pads.js';
import { openEditor, initEditorEvents } from './editor.js';
import { initKeyboard } from './keyboard.js';
import { exportSession, triggerImportPicker, handleImportFile, setSamplerSourceCallback } from './session.js';
import { shareSession, getSessionFromHash, clearHash } from './share.js';
import { initDjEvents, activateDj, deactivateDj } from './dj.js';
import { loadSamplerFile, setOnLoadedCallback, detectBpm, detectSamplePoints } from './sampler-audio.js';
import { createRoom, joinRoom, leaveRoom, setRoomHandlers, isRoomConfigured, broadcastEvent } from './room.js';
import { icon } from './icons.js';
import { showToast } from './utils.js';

// ── Source toggle ─────────────────────────────────────────────────────────────

function setSamplerSource(src) {
  state.samplerSource = src;
  const isFile = src === 'file';

  document.getElementById('srcYoutubeBtn').classList.toggle('active', !isFile);
  document.getElementById('srcFileBtn').classList.toggle('active', isFile);
  document.getElementById('urlRow').style.display  = isFile ? 'none' : '';
  document.getElementById('fileRow').style.display = isFile ? ''     : 'none';

  // Reset shared song state on source switch
  state.songLoaded    = false;
  state.songDuration  = 0;
  state.pads          = [];
  state.padDurations  = [];
  state.padCategories = [];
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
    document.body.classList.remove('config-collapsed');
    stopAll();
    activateDj();
  } else {
    deactivateDj();
  }
}

// ── Jam room ──────────────────────────────────────────────────────────────────

function toggleJamPopup(e) {
  e.stopPropagation();
  const popup = document.getElementById('jamPopup');
  if (popup.classList.contains('open')) {
    closeJamPopup();
  } else {
    const inRoom = state.roomActive;
    document.getElementById('jamIdle').style.display   = inRoom ? 'none' : '';
    document.getElementById('jamActive').style.display = inRoom ? ''     : 'none';
    if (inRoom) document.getElementById('jamRoomCode').textContent = state.roomId;
    popup.classList.add('open');
    if (!inRoom) document.getElementById('jamCodeInput').focus();
  }
}

function closeJamPopup() {
  document.getElementById('jamPopup').classList.remove('open');
}

function updateRoomBadge() {
  document.getElementById('jamBtn').classList.toggle('active', state.roomActive);
}

async function handleCreateRoom() {
  if (!state.songLoaded) {
    showToast('Load a song first');
    return;
  }
  const btn = document.getElementById('jamCreateBtn');
  btn.disabled = true;
  btn.textContent = 'CREATING...';
  try {
    const isFile   = state.samplerSource === 'file';
    const beatZero = Date.now();
    state.roomBeatZero  = beatZero;
    state.roomIsCreator = true;
    const code = await createRoom({
      source:        state.samplerSource,
      url:           isFile ? '' : document.getElementById('urlInput').value.trim(),
      filename:      isFile ? state.samplerFileName : '',
      padCount:      state.padCount,
      padDuration:   state.padDuration,
      pads:          state.pads.map((s, i) => ({ start: s, dur: state.padDurations[i] ?? state.padDuration })),
      padCategories: state.padCategories,
      bpm:           state.roomBpm,
      beatZero,
    });
    document.getElementById('jamIdle').style.display   = 'none';
    document.getElementById('jamActive').style.display = '';
    document.getElementById('jamRoomCode').textContent = code;
    _applyBpmUi(true);
    updateRoomBadge();
    showToast(`Room ${code} created`, 'success');
  } catch {
    showToast('Could not create room — check Firebase config');
    state.roomIsCreator = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'CREATE ROOM';
  }
}

async function handleJoinRoom() {
  const code = document.getElementById('jamCodeInput').value.trim().toUpperCase();
  if (code.length < 4) { showToast('Enter a valid room code'); return; }
  const btn = document.getElementById('jamJoinBtn');
  btn.disabled = true;
  btn.textContent = 'JOINING...';
  try {
    await _joinAndLoad(code);
  } finally {
    btn.disabled = false;
    btn.textContent = 'JOIN';
  }
}

async function _joinAndLoad(code) {
  const sessionData = await joinRoom(code);
  if (!sessionData) { showToast('Room not found'); return; }
  closeJamPopup();
  updateRoomBadge();

  state.roomBpm       = sessionData.bpm      ?? 0;
  state.roomBeatZero  = sessionData.beatZero ?? 0;
  state.roomIsCreator = false;

  const joinCats = sessionData.padCategories ?? new Array(sessionData.padCount).fill('');
  state.padCategories = joinCats;
  state.pendingImport = {
    padCount:      sessionData.padCount,
    pads:          sessionData.pads.map(p => p.start),
    padDurations:  sessionData.pads.map(p => p.dur),
    padCategories: joinCats,
  };
  document.getElementById('jamIdle').style.display   = 'none';
  document.getElementById('jamActive').style.display = '';
  document.getElementById('jamRoomCode').textContent = code;
  _applyBpmUi(false);

  if ((sessionData.source ?? 'youtube') === 'file') {
    // File mode: user must load the matching file manually
    setSamplerSource('file');
    const hint = sessionData.filename ? `"${sessionData.filename}"` : 'the audio file';
    showToast(`Joined room ${code} — load ${hint} to play`, 'success');
  } else {
    document.getElementById('urlInput').value = sessionData.url;
    markRemoteLoad();
    loadSong();
    showToast(`Joined room ${code}`, 'success');
  }
}

function handleLeaveRoom() {
  leaveRoom();
  state.roomIsCreator = false;
  state.roomBpm       = 0;
  state.roomBeatZero  = 0;
  document.getElementById('jamBpmInput').value = '';
  closeJamPopup();
  updateRoomBadge();
  showToast('Left the room');
}

// Set BPM input/button editability based on whether we are the room creator
function _applyBpmUi(isCreator) {
  const input  = document.getElementById('jamBpmInput');
  const detect = document.getElementById('jamBpmDetectBtn');
  input.value    = state.roomBpm || '';
  input.readOnly = !isCreator;
  detect.disabled = !isCreator;
}

function handleCopyRoomLink() {
  const url = `${location.origin}${location.pathname}?room=${state.roomId}`;
  navigator.clipboard.writeText(url)
    .then(() => showToast('Room link copied!', 'success'))
    .catch(() => showToast('Copy failed — share the code manually'));
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  // Break circular deps by injecting callbacks
  setOpenEditorCallback(openEditor);
  setOnLoadedCallback(() => {
    state.pendingImport ? restoreFromImport() : distributePads();
    document.body.classList.add('config-collapsed');
  });
  setSamplerSourceCallback(setSamplerSource);

  // Config panel
  document.getElementById('loadBtn').addEventListener('click', loadSong);
  document.getElementById('editModeBtn').addEventListener('click', toggleEditMode);
  document.getElementById('stopBtn').addEventListener('click', () => {
    stopAll();
    if (state.roomActive) broadcastEvent('pad_stop', {});
  });
  document.getElementById('padMinus4').addEventListener('click', () => changePads(-4));
  document.getElementById('padMinus1').addEventListener('click', () => changePads(-1));
  document.getElementById('padPlus1').addEventListener('click',  () => changePads(1));
  document.getElementById('padPlus4').addEventListener('click',  () => changePads(4));
  document.getElementById('durSlider').addEventListener('input', updateDur);
  document.getElementById('exportBtn').addEventListener('click', exportSession);
  document.getElementById('importBtn').addEventListener('click', triggerImportPicker);
  document.getElementById('importFile').addEventListener('change', (e) => handleImportFile(e.target.files[0]));
  document.getElementById('shareBtn').addEventListener('click', shareSession);

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

  // Config collapse toggle
  document.getElementById('configToggleBtn').addEventListener('click', () => {
    document.body.classList.toggle('config-collapsed');
  });

  // Auto sample-point detection
  document.getElementById('magicPadsBtn').addEventListener('click', () => {
    if (state.samplerSource !== 'file' || !state.samplerAudioBuffer) {
      showToast('Load an audio file first'); return;
    }
    const points = detectSamplePoints(state.samplerAudioBuffer, state.padCount);
    if (points) {
      smartDistributePads(points);
      showToast('Sample points detected!', 'success');
    } else {
      showToast('No clear patterns found — try adjusting pad count');
    }
  });

  // View toggle
  document.getElementById('sampleModeBtn').addEventListener('click', () => setView('sampler'));
  document.getElementById('djModeBtn').addEventListener('click',     () => setView('dj'));

  // Jam room
  if (isRoomConfigured()) {
    document.getElementById('jamWrapper').style.display = '';
    document.getElementById('jamBtn').addEventListener('click', toggleJamPopup);
    // Close popup when clicking anywhere outside the jam wrapper
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#jamWrapper')) closeJamPopup();
    });
    document.getElementById('jamCreateBtn').addEventListener('click', handleCreateRoom);
    document.getElementById('jamJoinBtn').addEventListener('click', handleJoinRoom);
    document.getElementById('jamCodeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleJoinRoom(); });
    document.getElementById('jamLeaveBtn').addEventListener('click', handleLeaveRoom);
    document.getElementById('jamCopyBtn').addEventListener('click', handleCopyRoomLink);
    document.getElementById('jamBpmInput').addEventListener('change', () => {
      if (!state.roomIsCreator) return;
      const bpm = parseInt(document.getElementById('jamBpmInput').value, 10) || 0;
      state.roomBpm = bpm;
      if (state.roomActive) broadcastEvent('bpm_update', { bpm, beatZero: state.roomBeatZero });
    });
    document.getElementById('jamBpmDetectBtn').addEventListener('click', () => {
      if (!state.roomIsCreator) return;
      if (!state.samplerAudioBuffer) { showToast('Load an audio file first'); return; }
      const bpm = detectBpm(state.samplerAudioBuffer);
      if (bpm) {
        document.getElementById('jamBpmInput').value = bpm;
        state.roomBpm = bpm;
        if (state.roomActive) broadcastEvent('bpm_update', { bpm, beatZero: state.roomBeatZero });
        showToast(`Detected: ${bpm} BPM`, 'success');
      } else {
        showToast('Could not detect BPM — set manually');
      }
    });

    setRoomHandlers({
      onPadTrigger: (index, fireAt) => {
        const padEl = document.querySelector(`.pad[data-index="${index}"]`);
        if (padEl) triggerPad(index, padEl, true, fireAt);
      },
      onPadStop: (payload = {}) => {
        if (payload.index !== undefined) stopPad(payload.index);
        else stopAll();
      },
      onSessionUpdate: (data) => {
        state.roomBpm       = data.bpm      ?? state.roomBpm;
        state.roomBeatZero  = data.beatZero ?? state.roomBeatZero;
        const cats = data.padCategories ?? new Array(data.padCount).fill('');
        state.padCategories = cats;
        _applyBpmUi(state.roomIsCreator);
        document.getElementById('urlInput').value = data.url;
        state.pendingImport = {
          padCount:      data.padCount,
          pads:          data.pads.map(p => p.start),
          padDurations:  data.pads.map(p => p.dur),
          padCategories: cats,
        };
        markRemoteLoad();
        loadSong();
      },
      onCategoryUpdate: ({ index, category }) => {
        if (index < 0 || index >= state.padCount) return;
        state.padCategories[index] = category;
        const padEl = document.querySelector(`.pad[data-index="${index}"]`);
        if (!padEl) return;
        padEl.className = 'pad loaded' + (category ? ` cat-${category}` : '');
        let catEl = padEl.querySelector('.pad-category');
        if (category) {
          if (!catEl) {
            catEl = document.createElement('div');
            catEl.className = 'pad-category';
            padEl.insertBefore(catEl, padEl.querySelector('.pad-bar'));
          }
          catEl.textContent = category.toUpperCase();
        } else if (catEl) {
          catEl.remove();
        }
      },
      onBpmUpdate: (data) => {
        state.roomBpm      = data.bpm      ?? 0;
        state.roomBeatZero = data.beatZero ?? state.roomBeatZero;
        _applyBpmUi(state.roomIsCreator);
        showToast(`BPM set to ${state.roomBpm || 'free play'}`);
      },
    });
  } else {
    document.getElementById('jamWrapper').style.display = 'none';
  }

  // Subsystems
  initEditorEvents();
  initDjEvents();
  initKeyboard();

  // Restore shared session from URL hash
  const sharedSession = getSessionFromHash();
  if (sharedSession && sharedSession.source === 'youtube' && sharedSession.url && Array.isArray(sharedSession.pads)) {
    state.pendingImport = {
      padCount:     sharedSession.pads.length,
      pads:         sharedSession.pads.map(p => Number(p.start)),
      padDurations: sharedSession.pads.map(p => Number(p.dur)),
    };
    document.getElementById('urlInput').value = sharedSession.url;
    clearHash();
  }

  loadYTScript();

  // Auto-load from URL hash share
  if (sharedSession && state.pendingImport) {
    loadSong();
  }

  // Auto-join room from ?room=CODE query param
  if (isRoomConfigured()) {
    const urlRoom = new URLSearchParams(location.search).get('room');
    if (urlRoom) {
      history.replaceState(null, '', location.pathname + location.hash);
      _joinAndLoad(urlRoom.toUpperCase());
    }
  }

  // Initial render
  renderEmptyPads();
  updateDur();
}

init();
