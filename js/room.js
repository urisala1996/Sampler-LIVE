// ── Firebase setup ────────────────────────────────────────────────────────────
// 1. Go to https://console.firebase.google.com → create a new project
// 2. Add Realtime Database → Start in test mode
//    (test mode rules allow public read/write — fine for a jam app)
// 3. Go to Project Settings → General → Your apps → copy firebaseConfig
// 4. Paste the values below, replacing the placeholder strings
const FIREBASE_CONFIG = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT.firebaseapp.com',
  databaseURL:       'https://YOUR_PROJECT-default-rtdb.firebaseio.com',
  projectId:         'YOUR_PROJECT',
  storageBucket:     'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID',
};

const CONFIGURED = FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';

import { initializeApp }  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, push, set, get, remove, onChildAdded, onValue, query, orderByChild, startAt }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { state } from './state.js';

// ── Module state ──────────────────────────────────────────────────────────────

let _db              = null;
let _eventsRef       = null;
let _unsubEvents     = null;
let _unsubPresence   = null;
let _presenceNodeRef = null;
let _handlers = { onPadTrigger: () => {}, onPadStop: () => {}, onSessionUpdate: () => {} };

// ── Public API ────────────────────────────────────────────────────────────────

export function isRoomConfigured() { return CONFIGURED; }

export function setRoomHandlers(handlers) { Object.assign(_handlers, handlers); }

export async function createRoom(sessionData) {
  const db   = _getDb();
  const code = _generateCode();

  await set(ref(db, `rooms/${code}/session`), sessionData);

  state.roomActive = true;
  state.roomId     = code;

  _subscribeEvents(code);
  _writePresence(code);
  _subscribePresence(code);

  return code;
}

export async function joinRoom(code) {
  const db   = _getDb();
  const snap = await get(ref(db, `rooms/${code}/session`));
  if (!snap.exists()) return null;

  state.roomActive = true;
  state.roomId     = code;

  _subscribeEvents(code);
  _writePresence(code);
  _subscribePresence(code);

  return snap.val();
}

export function leaveRoom() {
  if (_unsubEvents)    { _unsubEvents();    _unsubEvents   = null; }
  if (_unsubPresence)  { _unsubPresence();  _unsubPresence = null; }
  if (_presenceNodeRef){ remove(_presenceNodeRef); _presenceNodeRef = null; }
  _eventsRef = null;
  state.roomActive = false;
  state.roomId     = null;
}

export function broadcastEvent(type, payload) {
  if (!state.roomActive || !_eventsRef) return;
  push(_eventsRef, {
    type,
    payload: payload ?? {},
    clientId: state.roomClientId,
    ts: Date.now(),
  });
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _getDb() {
  if (!_db) { const app = initializeApp(FIREBASE_CONFIG); _db = getDatabase(app); }
  return _db;
}

function _generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I
  return Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(b => chars[b % chars.length])
    .join('');
}

function _subscribeEvents(code) {
  const joinTs = Date.now() - 500; // small buffer for clock skew
  const db = _getDb();
  _eventsRef = ref(db, `rooms/${code}/events`);
  const q = query(_eventsRef, orderByChild('ts'), startAt(joinTs));
  _unsubEvents = onChildAdded(q, (snap) => {
    const ev = snap.val();
    if (!ev || ev.clientId === state.roomClientId) return;
    switch (ev.type) {
      case 'pad_trigger':    _handlers.onPadTrigger(ev.payload.index); break;
      case 'pad_stop':       _handlers.onPadStop(); break;
      case 'session_update': _handlers.onSessionUpdate(ev.payload); break;
    }
  });
}

function _writePresence(code) {
  const db = _getDb();
  _presenceNodeRef = ref(db, `rooms/${code}/presence/${state.roomClientId}`);
  set(_presenceNodeRef, { joinedAt: Date.now() });
}

function _subscribePresence(code) {
  const db = _getDb();
  _unsubPresence = onValue(ref(db, `rooms/${code}/presence`), (snap) => {
    const count = snap.exists() ? Object.keys(snap.val()).length : 0;
    const el = document.getElementById('jamParticipants');
    if (el) el.textContent = count === 1 ? '1 PARTICIPANT' : `${count} PARTICIPANTS`;
  });
}
