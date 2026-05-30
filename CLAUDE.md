# AUX.fm — Claude Project Context

## What this is

Browser-based music sampler and DJ web app. Two modes:

- **SAMPLE:** YouTube URL or local audio file → 1–16 MPC-style pads auto-distributed across the song timeline. Tap to play, edit start/duration per pad, import/export JSON sessions. A `YOUTUBE | FILE` toggle switches audio source.
- **DJ:** Upload local audio file. Vinyl wheel with real scratch (Web Audio buffer restart per frame) and inertia playback.

Online jam rooms via Firebase Realtime Database — multiple participants share a room code and hear each other's pad presses in real time.

## Hard constraints

- **No build step, ever.** Native ES modules only. No webpack, vite, rollup, npm packages. Fonts from Google CDN are fine; JS libs should be avoided (prefer inline like `js/icons.js`).
- **Light theme only.** Palette: `#f7f5f0` bg, `#0f0e0c` near-black, `#e85d04` orange active. No dark backgrounds, no neon.
- **No emoji in UI.** Use SVG icons from `js/icons.js`. Add new icon paths there if needed.
- **Prefer real audio over synthesis.** Use actual `AudioBuffer` manipulation, not oscillators faking sound.
- **Don't over-engineer.** Fix the bug, implement the feature. No fallbacks or abstractions for hypothetical future needs.
- **Plan before non-trivial features.** Enter plan mode for anything touching 3+ files or requiring architectural decisions.

## File layout

```
index.html           Static shell, all markup
css/style.css        All styles, CSS custom properties
js/main.js           Init, event wiring, view/source switching, jam room UI
js/state.js          Single shared mutable state object
js/pads.js           Pad render, playback, distribution
js/editor.js         Bottom-sheet sample point editor
js/youtube.js        YouTube IFrame API management
js/sampler-audio.js  Web Audio engine for SAMPLE FILE mode
js/session.js        JSON import/export (supports youtube + file sources)
js/dj.js             Web Audio engine + canvas vinyl wheel (DJ mode)
js/room.js           Firebase Realtime Database jam room transport
js/keyboard.js       Keyboard shortcuts (1–8, S, E)
js/icons.js          Inline SVG icon helper
js/utils.js          formatTime, clamp, showToast, setLoading, extractVideoId
```

## Key architecture notes

**State:** `js/state.js` exports a single mutable object imported directly by all modules. No events, no proxy.

**Circular deps** are broken by callback injection from `main.js`:
- `pads.js` ↔ `editor.js` — `setOpenEditorCallback`
- `pads.js` ↔ `sampler-audio.js` — `setOnLoadedCallback`
- `session.js` ↔ `main.js` — `setSamplerSourceCallback`
- `room.js` ↔ `pads.js` / `main.js` — `setRoomHandlers`

**YouTube latency:** `seekTo()` is called on `pointerdown` (not `pointerup`) for ~100ms headstart before `playVideo()`.

**File audio:** `source.start(0, offset, dur)` — 3-arg form auto-stops after `dur` seconds, ~1ms latency.

**iOS zoom prevention:** `touch-action: pan-x pan-y` on `body` (disables pinch-zoom); `touch-action: manipulation` on `.pad` (disables double-tap zoom).

**Jam rooms:** Firebase Realtime Database. Room auto-deletes when last participant leaves (via `onDisconnect().remove()` on presence node + explicit delete in `leaveRoom()`). `markRemoteLoad()` prevents session_update broadcast loops when a remote event triggers a song reload.

**Session format:**
```json
{ "source": "youtube", "url": "https://youtube.com/watch?v=...", "pads": [{ "start": 12.3, "dur": 2.0 }] }
{ "source": "file", "filename": "my-track", "pads": [{ "start": 12.3, "dur": 2.0 }] }
```
Old sessions without `source` default to `'youtube'`.
