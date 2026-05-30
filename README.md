# ONIRIC.pads

A browser-based music sampler and DJ web app. No install, no build step — open in any modern browser and play.

---

## What it does

**SAMPLE mode** — Paste a YouTube URL, load the song, and eight pads are automatically distributed across its timeline. Tap a pad to play its sample. Hold a pad (or switch to edit mode) to fine-tune the sample start point and duration. Import/export your pad layout as a JSON session file to save and share sets.

**DJ mode** — Upload any local audio file (MP3, WAV, OGG, FLAC, M4A). A vinyl-style wheel renders on screen; drag to scrub and scratch. Let go and inertia carries the pitch back up. True audio scratch using Web Audio API — the source buffer restarts each pointer frame for real friction sound.

---

## Features

| Feature | Detail |
|---|---|
| YouTube sampler | Paste URL → auto-distribute pads across song timeline |
| MPC-style pads | 1–16 pads, tap to play, long-press to edit |
| Per-pad editor | Drag waveform scrubber, nudge start ±0.1/1/5s, set duration ±0.1/0.5/1s |
| Preview in editor | Hear the sample before confirming |
| Session import/export | JSON file with YouTube URL + all pad start/duration data |
| DJ wheel | Vinyl record with canvas 2D rendering, always circular |
| Scratch audio | Web Audio API — real buffer scrubbing, not synthesized |
| Inertia playback | Release wheel → pitch slides back to 1× without glitch |
| Backward playback | Pre-built reversed `AudioBuffer` for rate < 0 |
| Keyboard shortcuts | 1–8 trigger pads; S = stop; E = toggle edit mode |
| No-scroll layout | `100dvh` + `min-height: 0` on all flex children — feels like an app |
| No build step | Native ES modules, no bundler, works from any static file server |

---

## Running locally

ES modules require a server (file:// won't work). Use any static server:

```bash
npx serve .
# or
python -m http.server
# or the VSCode Live Server extension
```

Open `http://localhost:3000` (or whichever port).

---

## Project structure

```
index.html          Entry point — static HTML shell, no logic
css/
  style.css         All styles — CSS custom properties, single file
js/
  main.js           App init, event wiring, view switching
  state.js          Single shared mutable state object
  pads.js           Pad rendering, playback, distribution
  editor.js         Bottom-sheet editor — scrubber, preview, duration
  youtube.js        YouTube IFrame API loading and player management
  session.js        Import/export JSON session files
  dj.js             DJ wheel — Web Audio engine, canvas rendering, scratch
  keyboard.js       Keyboard shortcut bindings
  icons.js          Inline SVG icon helper — no CDN, works offline
  utils.js          formatTime, clamp, showToast
```

---

## Architecture

**No framework, no bundler.** The entire app is native ES modules loaded from `index.html` via `<script type="module">`.

**Shared state** lives in `js/state.js` as a single exported object. All modules import it and mutate it directly — no prop-drilling, no events for internal state.

**Circular dependency** between `pads.js` and `editor.js` is broken by callback injection: `main.js` calls `setOpenEditorCallback(openEditor)` after both modules are imported, so pads can open the editor without importing it.

**YouTube audio** uses the IFrame API for playback (`seekTo`, `playVideo`, `pauseVideo`). The API does not expose the audio stream, so the DJ wheel uses a separate local-file Web Audio pipeline instead.

**DJ audio engine** (`js/dj.js`):
- `decodeAudioData()` loads the file into an `AudioBuffer` in memory
- A reversed buffer is pre-built from PCM samples for backward playback
- Scratch: each `pointermove` frame stops and restarts `AudioBufferSourceNode` at the new position — this is what creates the friction sound
- Inertia: `playbackRate.value` is updated each RAF frame on the *existing* node (no stop/restart) for smooth pitch slide

**No-scroll layout:** `body { height: 100dvh; overflow: hidden }` + every flex child has `min-height: 0`. The pad grid uses `grid-auto-rows: 1fr` for equal-height rows. The DJ canvas stays circular via a wrapper div that owns the flex sizing while the canvas self-constrains with `height: 100%; width: auto; aspect-ratio: 1; max-width: 100%`.

---

## Design

Light theme. Warm off-white (`#f7f5f0`) background, near-black (`#0f0e0c`) accent, orange (`#e85d04`) for the playing/active state. Inter + Space Mono. All icons are inline SVG (Lucide geometry) via `js/icons.js` — no CDN dependency.

---

## Session file format

```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "pads": [
    { "start": 12.3, "dur": 2.0 },
    { "start": 45.1, "dur": 1.5 }
  ]
}
```

Exported as `aux-{videoId}.json`.

---

## Browser requirements

Modern browser with ES module support, Web Audio API, and YouTube IFrame API access. Tested on Chrome and Safari (desktop + mobile). No polyfills included.
