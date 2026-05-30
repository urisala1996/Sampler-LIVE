import { state } from './state.js';
import { extractVideoId, showToast, setLoading, formatTime } from './utils.js';
import { distributePads, restoreFromImport, stopAll } from './pads.js';
import { djSyncAfterLoad } from './dj.js';
import { broadcastEvent } from './room.js';

// Set to true before calling loadSong() for remote-triggered loads so finishLoad
// doesn't re-broadcast session_update back to the room (would cause an infinite reload loop)
let _remoteLoad = false;
export function markRemoteLoad() { _remoteLoad = true; }

export function loadYTScript() {
  if (location.protocol === 'file:') {
    setTimeout(() => showToast('⚠️ Open from a server, not file://'), 800);
  }

  window.onYouTubeIframeAPIReady = () => {
    state.ytReady = true;
    document.getElementById('statusDot').className = 'status-dot ready';
  };

  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.onerror = () => showToast('Could not load YouTube API. Check your connection.');
  document.head.appendChild(tag);

  // Polling fallback in case the callback races with the module init
  let attempts = 0;
  const check = setInterval(() => {
    attempts++;
    if (state.ytReady || attempts > 20) { clearInterval(check); return; }
    if (window.YT && window.YT.Player) {
      state.ytReady = true;
      document.getElementById('statusDot').className = 'status-dot ready';
      clearInterval(check);
    }
  }, 500);
}

export function loadSong() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) { showToast('Paste a YouTube URL'); return; }
  const videoId = extractVideoId(url);
  if (!videoId) { showToast('Invalid YouTube URL'); return; }

  if (!state.ytReady) {
    setLoading(true, 'WAITING FOR YOUTUBE API...');
    let waited = 0;
    const wait = setInterval(() => {
      waited += 500;
      if (state.ytReady) { clearInterval(wait); setLoading(false); loadSong(); }
      else if (waited >= 8000) {
        clearInterval(wait);
        setLoading(false);
        showToast('YouTube API not responding. Check your connection.');
      }
    }, 500);
    return;
  }

  setLoading(true, 'STARTING PLAYER...');
  document.getElementById('loadBtn').disabled = true;
  stopAll();
  if (state.player) { state.player.destroy(); state.player = null; }

  setTimeout(() => {
    try {
      state.player = new YT.Player('player', {
        height: '200', width: '320', videoId,
        playerVars: {
          autoplay: 0, controls: 0, disablekb: 1, fs: 0,
          iv_load_policy: 3, modestbranding: 1, rel: 0,
          origin: window.location.origin || 'https://localhost',
        },
        events: { onReady: onPlayerReady, onError: onPlayerError },
      });
    } catch (e) {
      setLoading(false);
      document.getElementById('loadBtn').disabled = false;
      showToast('Player error: ' + e.message);
    }
  }, 200);
}

function onPlayerReady(event) {
  setLoading(true, 'GETTING DURATION...');
  event.target.mute();
  event.target.playVideo();
  setTimeout(() => {
    const dur = event.target.getDuration();
    if (dur > 0) finishLoad(dur, event.target);
    else setTimeout(() => finishLoad(event.target.getDuration() || 180, event.target), 2000);
  }, 1500);
}

function finishLoad(dur, playerRef) {
  playerRef.pauseVideo();
  playerRef.seekTo(0);
  playerRef.unMute();
  state.songDuration = dur;
  state.songLoaded = true;

  const title = state.player.getVideoData ? state.player.getVideoData().title : 'Song loaded';
  const titleEl = document.getElementById('songTitle');
  titleEl.textContent = title || 'Song loaded';
  titleEl.className = 'song-title loaded';

  const durBadge = document.getElementById('totalDur');
  durBadge.style.display = '';
  durBadge.textContent = formatTime(dur);

  document.getElementById('statusDot').className = 'status-dot ready';
  setLoading(false);
  document.getElementById('loadBtn').disabled = false;

  if (state.pendingImport) {
    restoreFromImport();
    showToast('Session restored!', 'success');
  } else {
    distributePads();
    showToast('Song ready! Tap the pads', 'success');
  }

  djSyncAfterLoad();

  if (state.roomActive && !_remoteLoad) {
    broadcastEvent('session_update', {
      source:      'youtube',
      url:         document.getElementById('urlInput').value.trim(),
      padCount:    state.padCount,
      padDuration: state.padDuration,
      pads:        state.pads.map((s, i) => ({ start: s, dur: state.padDurations[i] ?? state.padDuration })),
      bpm:         state.roomBpm,
      beatZero:    state.roomBeatZero,
    });
  }
  _remoteLoad = false;
}

function onPlayerError(event) {
  setLoading(false);
  document.getElementById('loadBtn').disabled = false;
  const codes = {
    2: 'Bad URL',
    5: 'HTML5 error',
    100: 'Video not found',
    101: 'Playback not allowed',
    150: 'Playback not allowed',
  };
  showToast('Error: ' + (codes[event.data] || 'code ' + event.data));
  document.getElementById('statusDot').className = 'status-dot';
}
