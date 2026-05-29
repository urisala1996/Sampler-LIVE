export const state = {
  // YouTube player
  player: null,
  ytReady: false,

  // Song
  songLoaded: false,
  songDuration: 0,

  // Pads config
  padCount: 8,
  padDuration: 2,
  pads: [],          // array of start times (seconds)
  padDurations: [],  // per-pad durations (seconds), parallel to pads[]

  // Playback
  currentPad: null,
  padTimer: null,
  padProgressInterval: null,
  padStartTime: 0,

  // UI
  editMode: false,

  // Editor / bottom sheet
  editorPadIndex: -1,
  editorCurrentTime: 0,
  editorConfirmedTime: 0,
  editorCurrentDuration: 2,
  previewTimer: null,
  isPreviewing: false,
  isDragging: false,

  // Set before loadSong() when restoring from an imported file
  pendingImport: null,

  // View toggle
  activeView: 'sampler',   // 'sampler' | 'dj'

  // DJ wheel — Web Audio engine (independent of YouTube)
  djIsPlaying: false,
  djIsScrubbing: false,
  djWheelAngle: 0,          // accumulated radians (visual)
  djAngularVelocity: 0,     // rad/ms, for inertia
  djLastPointerAngle: null,
  djLastPointerTime: null,
  djAnimFrame: null,        // rAF id — playback animation
  djInertiaFrame: null,     // rAF id — inertia decay

  // Web Audio
  djAudioContext: null,     // AudioContext (lazy init)
  djAudioBuffer: null,      // decoded AudioBuffer (forward)
  djAudioReversed: null,    // decoded AudioBuffer (reversed, built on demand)
  djAudioSource: null,      // current AudioBufferSourceNode
  djPlaybackOffset: 0,      // position (s) when current source started
  djPlaybackStart: 0,       // AudioContext.currentTime when source started
  djCurrentRate: 1,         // rate of current source (negative = reverse)
  djFileName: '',           // display name from uploaded file
};
