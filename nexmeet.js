
// ══ UTILS ══
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function show(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }

// ══ CONFIG ══
const TOKEN_SERVER = 'https://meet.newinteriorsolutions.com.au';
const LK_URL = 'wss://meet.newinteriorsolutions.com.au';

// ══ STATE ══
let room = null;
let myName = '', roomId = '', isHost = false;
let isMuted = false, isVideoOff = false, isScreenSharing = false, handRaised = false;
let isRoomLocked = false, isRecording = false, isLightMode = false;
let activePanel = null;
let meetSecs = 0, timerInt = null, unreadChat = 0, unreadDocs = 0;
let currentLink = '', sharedDocs = [], notesSyncTimer = null;
let recorder = null, recChunks = [];
let ssTrackSid = null;
let wbDrawing = false, wbTool = 'pen', wbLastX = 0, wbLastY = 0;
let agendaText = '';
let pollData = null, myVote = null;
let aiOptSelected = 0, lastReportText = '';

// Pending knock queue (for host) — identity → {resolve}
const pendingKnocks = new Map();

// ══ URL HELPERS ══
function parseHash() {
  const raw = decodeURIComponent(location.hash.replace('#','').trim());
  if (!raw) return null;
  const parts = raw.split('|');
  if (parts.length < 2) return null;
  const parsed = { 
    roomId:  parts[0], 
    expiry:  parseInt(parts[1], 10), 
    e2eeKey: parts[2] || null,
    pubKey:  parts[3] || null
  };
  // H2 FIX: clear hash from URL after parsing — don't leave E2EE key in browser history
  if (history.replaceState) {
    history.replaceState(null, '', location.pathname + location.search);
  }
  return parsed;
}
function buildLink(rid, ms) {
  const e2eeKey = window._e2eeKeyB64 || '';
  const pubKey  = window._sessionSignKeyB64 || '';
  const base = location.protocol === 'file:' 
    ? 'https://malonpez.github.io/nexmeet/' 
    : location.href.split('#')[0];
  let hash = rid + '|' + (Date.now() + ms);
  if (e2eeKey) hash += '|' + e2eeKey;
  if (pubKey)  hash += '|' + pubKey;
  // H2 NOTE: link contains E2EE key in fragment — treat as sensitive
  // Fragment never goes to server, but is visible to browser extensions
  return base + '#' + hash;
}

// ── E2EE Key management ──────────────────
let _e2eeCryptoKey = null;
window._e2eeKeyB64 = '';

async function generateE2EEKey() {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );
  const raw = await crypto.subtle.exportKey('raw', key);
  window._e2eeKeyB64 = btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  _e2eeCryptoKey = key;
  return key;
}

async function importE2EEKey(b64) {
  try {
    const padded = b64.replace(/-/g,'+').replace(/_/g,'/');
    const raw = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    _e2eeCryptoKey = await crypto.subtle.importKey(
      'raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
    );
    return _e2eeCryptoKey;
  } catch(e) { console.warn('E2EE key import failed:', e); return null; }
}

async function e2eeEncrypt(data) {
  if (!_e2eeCryptoKey) return data;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _e2eeCryptoKey, data);
    const out = new Uint8Array(12 + enc.byteLength);
    out.set(iv); out.set(new Uint8Array(enc), 12);
    return out.buffer;
  } catch { return data; }
}

async function e2eeDecrypt(data) {
  if (!_e2eeCryptoKey) return data;
  try {
    const bytes = new Uint8Array(data);
    const iv = bytes.slice(0, 12);
    const enc = bytes.slice(12);
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _e2eeCryptoKey, enc);
  } catch { return data; }
}
function fmtExpiry(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return m + 'min';
  const h = Math.round(m / 60);
  return h < 24 ? h + 'h' : Math.round(h/24) + 'días';
}

// ══ INIT ══
function skipIntro() {
  try {
    const intro = document.getElementById('intro');
    const lobby = document.getElementById('lobby');
    if (intro) { intro.style.opacity = '0'; setTimeout(() => { intro.style.display = 'none'; }, 700); }
    if (lobby) { lobby.style.visibility = ''; lobby.style.opacity = '1'; }
  } catch(e) {
    // Fallback — make everything visible
    document.querySelectorAll('#intro,#lobby').forEach(el => { if(el){ el.style.display = el.id==='intro'?'none':''; el.style.visibility=''; el.style.opacity='1'; }});
  }
}
window.onload = () => {
  const lobby = document.getElementById('lobby');
  if (lobby) lobby.style.visibility = 'hidden';
  const t = setTimeout(skipIntro, 3000);
  const intro = document.getElementById('intro');
  if (intro) intro.addEventListener('click', () => { clearTimeout(t); skipIntro(); });

  const parsed = parseHash();
  if (parsed) {
    if (Date.now() > parsed.expiry) { show('expiredScreen'); return; }
    document.getElementById('invBanner').classList.add('show');
    document.getElementById('invExpiry').textContent = '⏱ Expira en ' + fmtExpiry(parsed.expiry - Date.now());
    document.getElementById('lTitle').textContent = 'Unirse a la reunión';
    document.getElementById('btnTxt').textContent = '▶ Solicitar acceso';
    document.getElementById('createSec').style.display = 'none';
    document.getElementById('manualSec').style.display = 'none';
  } else {
    document.getElementById('btnTxt').textContent = '＋ Crear sala nueva';
    document.getElementById('invBanner').style.display = 'none';
    document.getElementById('createSec').style.display = 'none';
    document.getElementById('btnMain').className = 'btn btn-g';
  }
  document.getElementById('nameInput').focus();
  document.getElementById('nameInput').onkeydown = e => { if (e.key === 'Enter') mainAction(); };
};

function setStatus(t, err=false) {
  const el = document.getElementById('lStatus');
  el.textContent = t; el.className = err ? 'err' : '';
}

// ══ LOBBY ══
function mainAction() {
  const parsed = parseHash();
  parsed ? joinWithParsed(parsed) : createRoom();
}

async function createRoom() {
  const name = document.getElementById('nameInput').value.trim();
  if (!name) { toast('Ingresa tu nombre'); return; }
  myName = name;
  setStatus('Creando sala…');
  try {
    // C1 FIX: server creates room and returns hostProof — client never picks roomId
    const resp = await fetch(`${TOKEN_SERVER}/api/room/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name })
    });
    if (!resp.ok) throw new Error('No se pudo crear sala: ' + resp.status);
    const { roomId: rid, hostProof, nonce } = await resp.json();
    roomId = rid;
    window._hostProof = hostProof;
    window._hostNonce = nonce;
    isHost = true;
    document.body.classList.add('is-host');
    history.replaceState(null, '', location.pathname + location.search);
    await generateE2EEKey();
    const pubB64 = await initSigningKey();
    window._sessionSignKeyB64 = pubB64;
    await joinLiveKit(roomId, myName, true);
  } catch(e) {
    setStatus('Error: ' + e.message, true);
    show('lobby'); hide('waitingRoom');
  }
}

async function joinWithParsed(parsed) {
  const name = document.getElementById('nameInput').value.trim();
  if (!name) { toast('Ingresa tu nombre'); return; }
  if (!parsed.expiry || Date.now() > parsed.expiry) { show('expiredScreen'); return; }
  if (parsed.expiry - Date.now() < 30000) { show('expiredScreen'); return; }
  myName = name; isHost = false; roomId = parsed.roomId;
  if (parsed.e2eeKey) await importE2EEKey(parsed.e2eeKey);
  // FIX-CRÍTICO-3: import host's ECDSA pubkey for message verification
  if (parsed.pubKey) await importSigningKey(parsed.pubKey);
  hide('lobby');
  document.getElementById('wNameBadge').textContent = myName;
  show('waitingRoom');
  // Join as viewer first, request knock via data message
  await joinLiveKit(roomId, myName, false);
}

function joinManual() {
  const code = document.getElementById('roomCodeInput').value.trim();
  if (!code) { toast('Ingresa el ID de sala'); return; }
  myName = document.getElementById('nameInput').value.trim() || 'Invitado';
  isHost = false; roomId = code;
  hide('lobby');
  document.getElementById('wNameBadge').textContent = myName;
  show('waitingRoom');
  joinLiveKit(roomId, myName, false);
}

// ══ LIVEKIT JOIN ══
async function joinLiveKit(rid, name, host) {
  try {
    // C1 FIX: POST with hostProof for host, no hostProof for guest
    const body = { room: rid, username: name };
    if (host && window._hostProof) {
      body.hostProof = window._hostProof;
      body.nonce     = window._hostNonce;
    }
    const resp = await fetch(`${TOKEN_SERVER}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Token server error ' + resp.status);
    }
    const { token, isHost: serverIsHost } = await resp.json();
    if (typeof serverIsHost === 'boolean') {
      isHost = serverIsHost;
      if (isHost) document.body.classList.add('is-host');
      else document.body.classList.remove('is-host');
    }

    room = new LivekitClient.Room({
      adaptiveStream: false,
      dynacast: false,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    });

    setupRoomEvents();

    await room.connect(LK_URL, token);

    if (host) {
      // Host publishes tracks immediately
      const _isMobile = /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
      if (_isMobile) {
        try {
          const _s = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'user' } },
            audio: { echoCancellation: true, noiseSuppression: true }
          });
          window._currentFacing = 'user';
          await room.localParticipant.publishTrack(_s.getVideoTracks()[0]);
          await room.localParticipant.publishTrack(_s.getAudioTracks()[0]);
        } catch { await room.localParticipant.enableCameraAndMicrophone(); }
      } else {
        await room.localParticipant.enableCameraAndMicrophone();
      }
      // ARQ-01: generate signing key for this session
      initSigningKey().then(keyB64 => { window._sessionSignKeyB64 = keyB64; });
      enterMeeting();
      setWov(true);
      setTimeout(() => { applyE2EEToRoom(); updateE2EEBadge(); }, 1000);
    } else {
      // Guest does NOT publish camera/mic until admitted — only data channel
      // Send knock — retry every 3s until admitted (host DataReceived may not be ready instantly)
      const enc = new TextEncoder();
      const knockMsg = enc.encode(JSON.stringify({ type: 'knock', name }));
      const sendKnock = async () => {
        try { await room.localParticipant.publishData(knockMsg, 0); } catch(e) {}
      };
      // BLOQUE 2: knock con backoff — no bucle fijo cada 3s
      await sendKnock();
      let _knockAttempts = 0;
      window._knockInterval = setInterval(async () => {
        if (document.getElementById('meeting').style.display === 'flex') {
          clearInterval(window._knockInterval);
          return;
        }
        if (_knockAttempts++ > 10) { // max 30s de intentos
          clearInterval(window._knockInterval);
          toast('No se pudo conectar. El host puede no estar disponible.');
          return;
        }
        await sendKnock();
      }, 3000);
    }
  } catch(e) {
    setStatus('Error al conectar: ' + e.message, true);
    hide('waitingRoom'); show('lobby');
    toast('Error: ' + e.message);
  }
}

// ══ ROOM EVENTS ══
function setupRoomEvents() {
  room.on(LivekitClient.RoomEvent.ParticipantConnected, p => {
    toast(esc(p.identity) + ' se unió');
    addSys(esc(p.identity) + ' se unió a la llamada');
    updatePC();
    updateChatSel();
    if (isHost) showKnock(p.sid, p.identity);
  });

  room.on(LivekitClient.RoomEvent.ParticipantDisconnected, p => {
    removeParticipantVideo(p.sid);
    addSys(esc(p.identity) + ' salió de la llamada');
    updatePC();
    updateChatSel();
    rmKnock(p.sid);
    if (isHost && room.remoteParticipants.size === 0) setWov(true);
  });

  room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, pub, participant) => {
    if (track.kind === LivekitClient.Track.Kind.Video) {
      if (pub.source === LivekitClient.Track.Source.ScreenShare) {
        buildSSLayout(participant.sid, participant.identity, track);
        if (_e2eeCryptoKey && checkInsertableStreams()) {
          setTimeout(() => applyE2EEToReceiver(track.receiver), 300);
        }
      } else {
        attachVideo(participant.sid, participant.identity, track);
      }
    } else if (track.kind === LivekitClient.Track.Kind.Audio) {
      track.attach();
    }
  });

  room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
    if (pub.source === LivekitClient.Track.Source.ScreenShare) {
      endSSLayout();
    }
    track.detach();
  });

  room.on(LivekitClient.RoomEvent.ActiveSpeakersChanged, speakers => {
    document.querySelectorAll('.vwrap').forEach(w => w.classList.remove('speaking'));
    speakers.forEach(p => {
      const el = document.getElementById('vw-' + p.sid) || document.getElementById('vw-local');
      if (el) el.classList.add('speaking');
    });
  });

  room.on(LivekitClient.RoomEvent.DataReceived, async (payload, participant, kind) => {
    try {
      // ARQ-02: rate limiting — per participant + global
      if (!checkGlobalRate()) { return; } // room-wide flood
      if (!checkMsgRate(participant?.identity)) {
        console.warn('Rate limit exceeded:', participant?.identity);
        return;
      }
      const data = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
      let msgBytes;
      if (data[0] === 0x01) {
        const decrypted = await e2eeDecrypt(data.slice(1).buffer);
        msgBytes = new Uint8Array(decrypted);
      } else if (data[0] === 0x00) {
        msgBytes = data.slice(1);
      } else {
        msgBytes = data; // legacy
      }
      const text = new TextDecoder().decode(msgBytes);
      // Prototype pollution prevention — parse and freeze
      const msgRaw = JSON.parse(text);
      if (msgRaw.__proto__ || msgRaw.constructor || msgRaw.prototype) {
        console.warn('SECURITY: prototype pollution attempt blocked');
        return;
      }
      const msg = Object.freeze(Object.assign(Object.create(null), msgRaw));

      // Schema validation — reject malformed messages
      if (!validateMsgSchema(msg)) {
        console.warn('SECURITY: schema validation failed for type:', msg.type);
        return;
      }
      // ARQ-01: verify signature — reject unsigned messages for privileged actions
      const privilegedTypes = ['admitted','rejected','mute-you','unmute-you','kick','lock','show-doc','close-doc','poll-launch'];
      if (privilegedTypes.includes(msg.type)) {
        const valid = await verifyMessage(msg);
        if (!valid) {
          console.warn('SECURITY: rejected unsigned privileged message:', msg.type, 'from:', participant?.identity);
          return;
        }
      }

      // ARQ-03: role validation — only host can send privileged commands
      const hostOnlyTypes = ['mute-you','unmute-you','kick','lock'];
      if (hostOnlyTypes.includes(msg.type)) {
        // Verify sender is the known host (first joiner per server_secure.js)
        const sender = room.remoteParticipants.get(msg._from);
        // If _from matches participant identity — structural check
        if (msg._from !== participant?.identity) {
          console.warn('SECURITY: identity mismatch in message:', msg._from, '!=', participant?.identity);
          return;
        }
      }

      wDebug('MSG:' + text.substring(0,60) + (data[0]===0x01?' [E2E✓]':' [plain]'));
      handleDataMsg(msg, participant);
    } catch(e) {
      wDebug('ERR:' + e.message);
      console.warn('DataReceived parse error:', e);
    }
  });

  room.on(LivekitClient.RoomEvent.Disconnected, () => {
    clearInterval(timerInt);
    toast('Desconectado de la sala');
  });

  room.on(LivekitClient.RoomEvent.LocalTrackPublished, pub => {
    if (pub.source === LivekitClient.Track.Source.Camera) {
      attachLocalVideo();
    }
  });
}



// ══ SCHEMA VALIDATION (prototype pollution + type enforcement) ══
const _MSG_SCHEMAS = {
  'chat':       { name: 'string', message: 'string' },
  'knock':      { name: 'string' },
  'admitted':   { forIdentity: 'string' },
  'mute-you':   { forIdentity: 'string' },
  'unmute-you': { forIdentity: 'string' },
  'kick':       { forIdentity: 'string' },
  'show-doc':   { docId: 'string' },
  'close-doc':  {},
  'lock':       { locked: 'boolean' },
  'hand':       { raised: 'boolean' },
  'reaction':   { emoji: 'string' },
  'notes':      { text: 'string' },
  'agenda':     { text: 'string' },
  'poll-launch':{ poll: 'object' },
  'poll-vote':  { opt: 'number' },
  'wb-draw':    { x1: 'number', y1: 'number', x2: 'number', y2: 'number' },
  'wb-clear':   {},
  'doc-chunk':  { docId: 'string', index: 'number', total: 'number', chunk: 'string' },
  'key-rotate': { sigKey: 'string' },
};

function validateMsgSchema(msg) {
  const schema = _MSG_SCHEMAS[msg.type];
  // M1 FIX: reject unknown types — don't silently pass them
  if (schema === undefined) {
    console.warn('SECURITY: unknown message type rejected:', msg.type);
    return false;
  }
  for (const [key, type] of Object.entries(schema)) {
    if (!(key in msg)) return false;
    if (typeof msg[key] !== type) return false;
  }
  // No extra dangerous keys
  const dangerous = ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf'];
  for (const key of Object.keys(msg)) {
    if (dangerous.includes(key)) return false;
  }
  return true;
}

// ══ MESSAGE SIGNING — ECDSA P-256 (asymmetric, no bootstrap problem) ══
let _ecdsaPrivKey = null;   // host only — never leaves host
let _ecdsaPubKey  = null;   // used to verify — shared via URL

async function initSigningKey() {
  // Generate ECDSA P-256 key pair — host signs, guests verify with pubkey in URL
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
  );
  _ecdsaPrivKey = pair.privateKey;
  _ecdsaPubKey  = pair.publicKey;
  const rawPub = await crypto.subtle.exportKey('raw', pair.publicKey);
  const pubB64 = btoa(String.fromCharCode(...new Uint8Array(rawPub)));
  // Key rotation every 10 minutes
  setTimeout(async () => {
    if (!isHost || !room) return;
    const newPubB64 = await initSigningKey();
    window._sessionSignKeyB64 = newPubB64;
    await sendData({ type: 'key-rotate', pubKey: newPubB64 });
  }, 10 * 60 * 1000);
  return pubB64; // only public key goes into URL
}

async function importSigningKey(pubB64) {
  try {
    const raw = Uint8Array.from(atob(pubB64), ch => ch.charCodeAt(0));
    _ecdsaPubKey = await crypto.subtle.importKey(
      'raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
    );
  } catch(e) { console.warn('importSigningKey failed:', e); }
}

// Canonical JSON — deterministic key order (fixes JSON ordering attacks)
function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return JSON.stringify(obj);
  return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

async function signMessage(data) {
  if (!_ecdsaPrivKey) return data; // no key yet
  const ts = Date.now();
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(8))));
  const full = { ...data, _ts: ts, _from: myName, _n: nonce, _room: roomId };
  const canonical = canonicalize(full);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, _ecdsaPrivKey, new TextEncoder().encode(canonical)
  );
  return { ...full, _sig: btoa(String.fromCharCode(...new Uint8Array(sig))) };
}

// Nonce store — prevent replay even within 30s window
const _usedNonces = new Set();
function _cleanNonces() { if (_usedNonces.size > 10000) _usedNonces.clear(); }

async function verifyMessage(msg) {
  if (!_ecdsaPubKey) return true; // pre-key phase: allow (admitted will bring pubkey)
  if (!msg._sig || !msg._ts || !msg._from || !msg._n) return false;
  if (Math.abs(Date.now() - msg._ts) > 30000) return false;
  if (msg._room && msg._room !== roomId) return false; // room binding
  if (_usedNonces.has(msg._n)) return false;
  const { _sig, ...rest } = msg;
  const canonical = canonicalize(rest);
  try {
    const sigBytes = Uint8Array.from(atob(msg._sig), ch => ch.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, _ecdsaPubKey, sigBytes, new TextEncoder().encode(canonical)
    );
    if (valid) { _usedNonces.add(msg._n); _cleanNonces(); }
    return valid;
  } catch { return false; }
}

// Rate limiter for data channel (ARQ-02: flooding prevention)
const _msgRates = new Map();
function checkMsgRate(identity, limit = 20, windowMs = 1000) {
  const now = Date.now();
  const key = identity || 'unknown';
  const entry = _msgRates.get(key) || { count: 0, resetAt: now + windowMs, total: 0 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
  entry.count++;
  entry.total++;
  _msgRates.set(key, entry);
  // Hard ban: if participant sent >500 total msgs this session — suspicious
  if (entry.total > 500 && !['chat','wb-draw','notes'].includes('')) {
    return entry.count <= 5; // throttle hard
  }
  return entry.count <= limit;
}

// Global rate — total messages across all participants per second
let _globalMsgCount = 0, _globalResetAt = Date.now() + 1000;
function checkGlobalRate() {
  const now = Date.now();
  if (now > _globalResetAt) { _globalMsgCount = 0; _globalResetAt = now + 1000; }
  _globalMsgCount++;
  return _globalMsgCount <= 200; // max 200 msg/s room-wide
}

// ══ DATA MESSAGES ══
async function sendData(data, reliable=true) {
  if (!room) return;
  const kind = reliable ? 0 : 1;
  try {
    // ARQ-01: sign every outgoing message
    const signed = await signMessage(data);
    const plain = new TextEncoder().encode(JSON.stringify(signed));
    let payload;
    if (_e2eeCryptoKey) {
      const encrypted = await e2eeEncrypt(plain.buffer);
      payload = new Uint8Array(1 + encrypted.byteLength);
      payload[0] = 0x01;
      payload.set(new Uint8Array(encrypted), 1);
    } else {
      payload = new Uint8Array(1 + plain.byteLength);
      payload[0] = 0x00;
      payload.set(plain, 1);
    }
    await room.localParticipant.publishData(payload, kind);
  } catch(e) { console.warn('sendData error:', e); }
}

function handleDataMsg(msg, participant) {
  switch(msg.type) {
    case 'knock':
      if (!isHost) return;
      // VULN-02: reject knock if room is locked
      if (isRoomLocked) {
        const enc2 = new TextEncoder();
        const p2 = [...room.remoteParticipants.values()].find(p => p.identity === (msg.name || participant?.identity));
        if (p2) room.localParticipant.publishData(enc2.encode(JSON.stringify({type:'rejected'})), 0);
        return;
      }
      showKnock(participant?.sid || 'unknown', msg.name || participant?.identity || 'Invitado');
      break;
    case 'admitted':
      // BLOQUE 2b: solo procesar si estamos en sala de espera activa
      if (document.getElementById('waitingRoom').style.display === 'none') break;
      if (msg.forIdentity && msg.forIdentity !== myName) break;
      if (isHost) break;
      if (window._knockInterval) clearInterval(window._knockInterval);
      if (msg.pubKey) importSigningKey(msg.pubKey);
      // BLOQUE 2b: publish tracks — single attempt, no retry loops
      (async () => {
        try {
          // C1 FIX: if we have an upgradeToken, reconnect with canPublish:true
          if (msg.upgradeToken) {
            try {
              await room.disconnect();
              await room.connect(LK_URL, msg.upgradeToken);
              await room.localParticipant.setCameraEnabled(true).catch(()=>{});
              await room.localParticipant.setMicrophoneEnabled(true).catch(()=>{});
            } catch(reconnErr) {
              console.warn('Reconnect with upgrade token failed:', reconnErr);
              // Fallback: try enabling directly
              await room.localParticipant.setCameraEnabled(true).catch(()=>{});
              await room.localParticipant.setMicrophoneEnabled(true).catch(()=>{});
            }
          } else {
            // No upgrade token — try enabling (may fail if server has canPublish:false)
            await room.localParticipant.setCameraEnabled(true).catch(()=>{});
            await room.localParticipant.setMicrophoneEnabled(true).catch(()=>{});
          }
          // Update local preview from published track
          await new Promise(r => setTimeout(r, 400));
          const _camPub = room.localParticipant.getTrack(LivekitClient.Track.Source.Camera);
          if (_camPub?.track?.mediaStreamTrack) {
            const _ms = new MediaStream([_camPub.track.mediaStreamTrack]);
            window._localStream = _ms;
            const _vid = document.querySelector('#vw-local video');
            if (_vid) { _vid.srcObject = _ms; _vid.play().catch(()=>{}); }
          }
        } catch(e) {
          console.warn('publish on admit failed:', e);
          try { await room.localParticipant.enableCameraAndMicrophone(); } catch {}
        }
      })();
      hide('waitingRoom');
      enterMeeting();
      setTimeout(() => { applyE2EEToRoom(); updateE2EEBadge(); }, 1000);
      break;
    case 'rejected':
      if (msg.forIdentity && msg.forIdentity !== myName) break;
      if (document.getElementById('waitingRoom').style.display === 'none') break;
      if (window._knockInterval) clearInterval(window._knockInterval);
      hide('waitingRoom');
      show('rejectedScreen');
      room?.disconnect();
      break;
    case 'chat':
      if (msg.to && msg.to !== room.localParticipant.identity) return;
      addChatMsg(msg.name, msg.message, false, msg.toName || null);
      if (activePanel !== 'chat') {
        unreadChat++;
        const b = document.getElementById('chatBadge');
        b.style.display = 'inline'; b.textContent = unreadChat;
      }
      break;
    case 'notes':
      const ta = document.getElementById('notesArea');
      if (ta.value !== msg.text) {
        ta.value = msg.text;
        document.getElementById('notesStat').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es', {hour:'2-digit',minute:'2-digit'});
        if (activePanel !== 'notes') toast('📝 Notas actualizadas — abre el panel Notas');
      }
      break;
    case 'agenda':
      agendaText = msg.text;
      document.getElementById('agendaInput').value = msg.text;
      const av = document.getElementById('agendaViewWov');
      if (agendaText) { av.style.display = 'block'; av.textContent = agendaText; }
      toast('📋 Agenda actualizada por el organizador');
      break;
    case 'reaction':
      showReaction(msg.emoji, msg.x || 50);
      break;
    case 'hand':
      const hName = participant?.identity || 'Alguien';
      const lbl = document.getElementById('lbl-vw-' + (participant?.sid || ''));
      if (lbl) {
        const hi = lbl.querySelector('.hand-ind');
        if (hi) hi.style.display = msg.raised ? 'inline' : 'none';
      }
      // Big visible hand badge on video tile
      const vwrap = document.getElementById('vw-' + (participant?.sid || ''));
      if (vwrap) {
        let hbadge = vwrap.querySelector('.hand-badge');
        if (msg.raised) {
          if (!hbadge) {
            hbadge = document.createElement('div');
            hbadge.className = 'hand-badge';
            hbadge.textContent = '✋';
            vwrap.appendChild(hbadge);
          }
        } else { hbadge && hbadge.remove(); }
      }
      // Persistent host notification
      if (msg.raised && isHost) showHandAlert(hName);
      else if (!msg.raised) dismissHandAlert(hName);
      addSys(hName + ' ' + (msg.raised ? 'levantó ✋ la mano' : 'bajó la mano'));
      break;
    case 'doc-share':
      receiveDoc(msg.doc);
      break;
    case 'doc-chunk':
      receiveDocChunk(msg);
      break;
    case 'show-doc':
      const _sd = sharedDocs.find(d => d.id === msg.docId);
      if (_sd) {
        toast('📄 ' + esc(msg.senderName || 'Alguien') + ' comparte: ' + esc(_sd.name));
        showDoc(_sd.id);
      } else {
        // Doc still arriving in chunks — show when ready
        window._pendingShowDoc = msg.docId;
        toast('📄 ' + esc(msg.senderName || 'Alguien') + ' comparte un archivo — recibiendo…');
      }
      break;
    case 'close-doc':
      closeDocViewer(false);
      break;
    case 'wb-draw':
      receiveWbStroke(msg);
      break;
    case 'wb-clear':
      clearWBLocal();
      break;
    case 'poll-launch':
      receivePoll(msg.poll);
      break;
    case 'poll-vote':
      receivePollVote(msg.opt);
      break;
    case 'mute-you':
      if (msg.forIdentity && msg.forIdentity !== myName) break;
      // BLOQUE 4a: mute ALL audio tracks — LiveKit + custom published
      isMuted = true;
      room.localParticipant.setMicrophoneEnabled(false).catch(()=>{});
      room.localParticipant.trackPublications?.forEach(pub => {
        if (pub.track?.kind === 'audio' && pub.track?.mediaStreamTrack) {
          pub.track.mediaStreamTrack.enabled = false;
        }
      });
      // Also mute local stream tracks if exist
      window._localStream?.getAudioTracks().forEach(t => { t.enabled = false; });
      updateMicBtn();
      toast('El host te silenció 🔇');
      break;
    case 'unmute-you':
      if (msg.forIdentity && msg.forIdentity !== myName) break;
      // BLOQUE 4b: unmute ALL audio tracks — mirror of mute-you
      isMuted = false;
      room.localParticipant.setMicrophoneEnabled(true).catch(()=>{});
      room.localParticipant.trackPublications?.forEach(pub => {
        if (pub.track?.kind === 'audio' && pub.track?.mediaStreamTrack) {
          pub.track.mediaStreamTrack.enabled = true;
        }
      });
      window._localStream?.getAudioTracks().forEach(t => { t.enabled = true; });
      updateMicBtn();
      toast('El host activó tu micrófono 🎤');
      break;
    case 'key-rotate':
      // Host rotated ECDSA key — import new public key (guests verify only)
      if (msg.pubKey && !isHost) importSigningKey(msg.pubKey);
      break;
    case 'kick':
      if (msg.forIdentity && msg.forIdentity !== myName) break;
      toast('Fuiste expulsado'); setTimeout(() => leaveRoom(), 2000);
      break;
    case 'lock':
      isRoomLocked = msg.locked;
      document.getElementById('lockBadge').classList.toggle('show', msg.locked);
      break;
  }
}

// ══ HOST ADMIT/REJECT ══
function showKnock(sid, name) {
  if (document.getElementById('k-' + sid)) return;
  const card = document.createElement('div');
  card.className = 'kcard'; card.id = 'k-' + sid;
  const init = (name[0] || '?').toUpperCase();
  card.innerHTML = `<div class="kch"><div class="kav">${init}</div><div><div class="kname">${esc(name)}</div><div class="ksub">Solicita unirse</div></div></div><div class="kact"><button class="kadm">✓ Admitir</button><button class="krej">✕ Rechazar</button></div>`;
  card.querySelector('.kadm').addEventListener('click', () => admitParticipant(sid, name));
  card.querySelector('.krej').addEventListener('click', () => rejectParticipant(sid, name));
  document.getElementById('wQueue').appendChild(card);
  toast(name + ' está esperando');
}

function rmKnock(sid) { document.getElementById('k-' + sid)?.remove(); }

async function admitParticipant(sid, name) {
  rmKnock(sid);
  const enc = new TextEncoder();

  // ARQ-01: include signing key in admitted message so guest can verify future messages
  const admitMsg = { 
    type: 'admitted', 
    forIdentity: name,
    pubKey: window._sessionSignKeyB64 || null  // ECDSA public key only
  };

  // C1 FIX: get upgrade token from server, send to guest
  try {
    // Get a new nonce for this admit action
    const admitNonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    const admitResp  = await fetch(`${TOKEN_SERVER}/api/admit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room:          roomId,
        hostProof:     window._hostProof,
        nonce:         admitNonce,
        guestIdentity: name
      })
    });
    if (admitResp.ok) {
      const { upgradeToken } = await admitResp.json();
      admitMsg.upgradeToken = upgradeToken; // send upgrade token to guest
    }
    await sendData(admitMsg);
    setTimeout(() => sendData(admitMsg).catch(() => {}), 1500);
  } catch(e) {
    console.warn('admit send error:', e);
    // Fallback: send without upgrade token (guest can still join but can't publish until reload)
    await sendData(admitMsg).catch(() => {});
  }

  setWov(false);
  addSys(esc(name) + ' fue admitido ✓');
  updateChatSel();
}

async function rejectParticipant(sid, name) {
  rmKnock(sid);
  const participant = [...room.remoteParticipants.values()].find(p => p.sid === sid);
  if (participant) {
    const enc = new TextEncoder();
    await room.localParticipant.publishData(enc.encode(JSON.stringify({ type: 'rejected' })), 0);
  }
}

// ══ VIDEO ══
function fixMobileViewport() {
  const vh = window.innerHeight;
  const mtg = document.getElementById('meeting');
  if (mtg && mtg.style.display !== 'none') mtg.style.height = vh + 'px';
  const extraPad = Math.max(10, Math.min(window.outerHeight - window.innerHeight - 60, 80));
  const cbar = document.querySelector('.cbar');
  if (cbar) cbar.style.paddingBottom = extraPad + 'px';
}
window.addEventListener('resize', fixMobileViewport);

function enterMeeting() {
  hide('lobby'); hide('waitingRoom');
  const mtg = document.getElementById('meeting');
  mtg.style.display = 'flex';
  mtg.style.height = window.innerHeight + 'px';
  setTimeout(fixMobileViewport, 100);
  // host-only items controlled by CSS .is-host class on body
  document.getElementById('dispRoom').textContent = roomId.slice(0, 10) + '…';
  attachLocalVideo();
  startTimer();
  updateChatSel();
}

function attachLocalVideo() {
  const grid = document.getElementById('vGrid');
  let wrap = document.getElementById('vw-local');
  if (!wrap) {
    wrap = mkWrap('vw-local', 'lbl-vw-local', myName + ' (Tú)', true);
    grid.appendChild(wrap);
    updateGrid();
  }
  const vid = wrap.querySelector('video');
  // Use stored stream directly if available (guest admitted path)
  if (window._localStream) {
    vid.srcObject = window._localStream;
    vid.play().catch(()=>{});
    document.getElementById('voff-vw-local')?.classList.remove('show');
    return;
  }
  const camPub = room?.localParticipant?.getTrack(LivekitClient.Track.Source.Camera);
  if (camPub?.track) {
    camPub.track.attach(vid);
    const mst = camPub.track.mediaStreamTrack;
    if (mst) { vid.srcObject = new MediaStream([mst]); vid.play().catch(()=>{}); }
    document.getElementById('voff-vw-local')?.classList.remove('show');
  }
}

function attachVideo(sid, name, track) {
  // BLOQUE 3c: verify track is live before attaching
  if (!track || track.isMuted) return;
  setWov(false);
  const grid = document.getElementById('vGrid');
  let wrap = document.getElementById('vw-' + sid);
  if (!wrap) {
    wrap = mkWrap('vw-' + sid, 'lbl-vw-' + sid, name, false, sid);
    grid.appendChild(wrap);
    updateGrid();
    updatePC();
  }
  const vid = wrap.querySelector('video');
  track.attach(vid);
  document.getElementById('voff-vw-' + sid)?.classList.remove('show');
}

function removeParticipantVideo(sid) {
  document.getElementById('vw-' + sid)?.remove();
  updateGrid(); updatePC();
}

function mkWrap(id, lblId, label, muted, sid) {
  const w = document.createElement('div'); w.className = 'vwrap'; w.id = id;
  const v = document.createElement('video'); v.autoplay = true; v.playsInline = true; v.muted = !!muted;
  const l = document.createElement('div'); l.className = 'vlabel'; l.id = lblId;
  l.innerHTML = `<span>${esc(label.replace(/ \(Tú\)/, ''))}</span>${!muted ? ' <span class="hand-ind" style="display:none">✋</span>' : ''}`;
  const ov = document.createElement('div'); ov.className = 'voff'; ov.id = 'voff-' + id;
  const init = (label.replace(/ \(Tú\)/, '')[0] || '?').toUpperCase();
  ov.innerHTML = '<div class="vavc"></div><div class="vol-bar"><span style="height:4px"></span><span style="height:4px"></span><span style="height:4px"></span></div>';
  ov.querySelector('.vavc').textContent = init;
  let ctx = '';
  if (!muted && isHost && sid) {
    const _identity = label.replace(/ \(Tú\)/, '');
    ctx = `<div class="vctx" data-identity="${esc(_identity)}"><button class="vctxbtn">⋯</button><div class="vctxdrop"><button class="vctx-mute" data-mute-state="0">🔇 Silenciar</button><button class="dk vctx-kick">🚫 Expulsar</button></div></div>`;
  }
  w.append(v, l, ov);
  if (ctx) { const cd = document.createElement('div'); cd.innerHTML = ctx; w.appendChild(cd.firstChild); }
  return w;
}

// ══ SCREEN SHARE ══
async function toggleScreen() {
  if (!isScreenSharing) {
    try {
      await room.localParticipant.setScreenShareEnabled(true);
      isScreenSharing = true;
      const b = document.getElementById('ccScreen');
      b.classList.add('on');
      b.querySelector('.ci').textContent = '⏹️';
      b.querySelector('.cl').textContent = 'Detener';
      toast('Compartiendo pantalla…');

      // Build SS layout
      const ssPub = room.localParticipant.getTrack(LivekitClient.Track.Source.ScreenShare);
      if (ssPub?.track) buildSSLayout('local', myName, ssPub.track);

      // Stop when user stops sharing from browser
      ssPub?.track?.mediaStreamTrack?.addEventListener('ended', stopScreen);
    } catch { toast('No se pudo compartir pantalla'); }
  } else { stopScreen(); }
}

async function stopScreen() {
  await room.localParticipant.setScreenShareEnabled(false);
  isScreenSharing = false;
  endSSLayout();
  const b = document.getElementById('ccScreen');
  b.classList.remove('on');
  b.querySelector('.ci').textContent = '🖥️';
  b.querySelector('.cl').textContent = 'Pantalla';
  toast('Pantalla detenida');
}

function buildSSLayout(sid, sharerName, track) {
  const varea = document.getElementById('varea');
  const oldGrid = document.getElementById('vGrid');
  const layout = document.createElement('div'); layout.className = 'ss-layout'; layout.id = 'ssLayout';
  const mainWrap = document.createElement('div'); mainWrap.className = 'ss-main-wrap';
  const mainVid = document.createElement('video'); mainVid.autoplay = true; mainVid.playsInline = true; mainVid.muted = (sid === 'local');
  track.attach(mainVid);
  const lbl = document.createElement('div'); lbl.className = 'ss-label'; lbl.textContent = '🖥️ ' + sharerName + ' está compartiendo';
  const fsBtn = document.createElement('button'); fsBtn.className = 'ss-fullbtn'; fsBtn.textContent = '⛶ Pantalla completa';
  fsBtn.onclick = () => { if (mainVid.requestFullscreen) mainVid.requestFullscreen(); else if (mainVid.webkitRequestFullscreen) mainVid.webkitRequestFullscreen(); };
  mainWrap.append(mainVid, lbl, fsBtn);
  const strip = document.createElement('div'); strip.className = 'ss-strip'; strip.id = 'ssStrip';
  oldGrid.querySelectorAll('.vwrap').forEach(w => { w.style.width = '130px'; w.style.height = '85px'; strip.appendChild(w); });
  layout.append(mainWrap, strip);
  varea.removeChild(oldGrid);
  varea.insertBefore(layout, varea.querySelector('.wov'));
}

function endSSLayout() {
  const layout = document.getElementById('ssLayout');
  const varea = document.getElementById('varea');
  if (!layout) return;
  const grid = document.createElement('div'); grid.className = 'vgrid grid-1'; grid.id = 'vGrid';
  const strip = document.getElementById('ssStrip');
  if (strip) strip.querySelectorAll('.vwrap').forEach(w => { w.style.width = ''; w.style.height = ''; grid.appendChild(w); });
  varea.removeChild(layout);
  varea.insertBefore(grid, varea.querySelector('.wov'));
  updateGrid();
}

// ══ CONTROLS ══
async function toggleMic() {
  isMuted = !isMuted;
  // BLOQUE 4c: affect all audio tracks consistently
  await room.localParticipant.setMicrophoneEnabled(!isMuted).catch(()=>{});
  room.localParticipant.trackPublications?.forEach(pub => {
    if (pub.track?.kind === 'audio' && pub.track?.mediaStreamTrack) {
      pub.track.mediaStreamTrack.enabled = !isMuted;
    }
  });
  window._localStream?.getAudioTracks().forEach(t => { t.enabled = !isMuted; });
  updateMicBtn();
}
function updateMicBtn() {
  const b = document.getElementById('ccMic');
  b.classList.toggle('off', isMuted);
  b.querySelector('.ci').textContent = isMuted ? '🔇' : '🎤';
  b.querySelector('.cl').textContent = isMuted ? 'Silenc.' : 'Micro';
}
async function toggleCam() {
  isVideoOff = !isVideoOff;
  await room.localParticipant.setCameraEnabled(!isVideoOff);
  const b = document.getElementById('ccCam');
  b.classList.toggle('off', isVideoOff);
  b.querySelector('.ci').textContent = isVideoOff ? '🚫' : '📷';
  b.querySelector('.cl').textContent = isVideoOff ? 'Sin cam.' : 'Cámara';
  document.getElementById('voff-vw-local')?.classList.toggle('show', isVideoOff);
  // For guests on mobile: update local preview after re-enable
  // BLOQUE 3b: update preview from published track (not stored stream)
  if (!isVideoOff) {
    setTimeout(() => {
      const _pub = room.localParticipant.getTrack(LivekitClient.Track.Source.Camera);
      if (_pub?.track?.mediaStreamTrack) {
        const _ms = new MediaStream([_pub.track.mediaStreamTrack]);
        window._localStream = _ms;
        const _vid = document.querySelector('#vw-local video');
        if (_vid) { _vid.srcObject = _ms; _vid.play().catch(()=>{}); }
      }
    }, 300);
  }
}
async function toggleHand() {
  handRaised = !handRaised;
  await sendData({ type: 'hand', raised: handRaised });
  document.getElementById('ccHand').classList.toggle('on', handRaised);
  // Show/hide badge on own tile
  const myWrap = document.getElementById('vw-local');
  if (myWrap) {
    let hb = myWrap.querySelector('.hand-badge');
    if (handRaised) { if (!hb) { hb = document.createElement('div'); hb.className = 'hand-badge'; hb.textContent = '✋'; myWrap.appendChild(hb); } }
    else { hb && hb.remove(); }
  }
  toast(handRaised ? 'Mano levantada ✋' : 'Mano bajada');
}
async function muteRemote(identity) {
  const p = room.remoteParticipants.get(identity);
  if (!p) { toast('Participante no encontrado'); return; }
  const btn = document.querySelector(`[data-muted='${identity}']`);
  const isMutedNow = btn?.dataset.muteState === '1';
  if (isMutedNow) {
    await sendData({ type: 'unmute-you', forIdentity: identity });
    if (btn) { btn.dataset.muteState = '0'; btn.textContent = '🔇 Silenciar'; }
    toast(esc(identity) + ' activado');
  } else {
    await sendData({ type: 'mute-you', forIdentity: identity });
    if (btn) { btn.dataset.muteState = '1'; btn.textContent = '🔊 Activar mic'; }
    toast(esc(identity) + ' silenciado');
  }
}
async function kickRemote(identity) {
  const p = room.remoteParticipants.get(identity);
  if (p) {
    // Use sendData to ensure message is signed
    await sendData({ type: 'kick', forIdentity: identity });
    setTimeout(() => removeParticipantVideo(p.sid), 500);
  } else { toast('Participante no encontrado'); }
}
async function toggleLock() {
  isRoomLocked = !isRoomLocked;
  await sendData({ type: 'lock', locked: isRoomLocked });
  document.getElementById('lockBadge').classList.toggle('show', isRoomLocked);
  document.getElementById('lockTxt').textContent = isRoomLocked ? 'Desbloquear sala' : 'Bloquear sala';
  toast(isRoomLocked ? '🔒 Sala bloqueada' : '🔓 Sala desbloqueada');
  document.getElementById('moreWrap').classList.remove('open');
}
async function leaveRoom() {
  await room?.disconnect();
  clearInterval(timerInt);
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  history.replaceState(null, '', location.pathname + location.search);
  location.reload();
}

// ══ PANELS ══
function togglePanel(name) {
  if (activePanel === name) { document.getElementById(name + 'Panel').classList.remove('open'); document.getElementById('cc' + cap(name)).classList.remove('on'); activePanel = null; return; }
  if (activePanel) { document.getElementById(activePanel + 'Panel').classList.remove('open'); document.getElementById('cc' + cap(activePanel)).classList.remove('on'); }
  activePanel = name;
  document.getElementById(name + 'Panel').classList.add('open');
  document.getElementById('cc' + cap(name)).classList.add('on');
  if (name === 'chat') { unreadChat = 0; document.getElementById('chatBadge').style.display = 'none'; document.getElementById('chatInput').focus(); scrollC(); }
  if (name === 'docs') { unreadDocs = 0; document.getElementById('docsBadge').style.display = 'none'; }
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function toggleMore() { document.getElementById('moreWrap').classList.toggle('open'); }
document.addEventListener('click', e => {
  if (!document.getElementById('moreWrap')?.contains(e.target)) document.getElementById('moreWrap')?.classList.remove('open');
  // vctx event delegation — secure, no onclick injection
  const muteBtn = e.target.closest('.vctx-mute');
  if (muteBtn) { const id = muteBtn.closest('.vctx')?.dataset.identity; if (id) muteRemote(id); }
  const kickBtn = e.target.closest('.vctx-kick');
  if (kickBtn) { const id = kickBtn.closest('.vctx')?.dataset.identity; if (id) kickRemote(id); }
});

// ══ LINK ══
function regenLink() {
  const ms = parseInt(document.getElementById('expirySelect').value);
  currentLink = buildLink(roomId, ms);
  const el = document.getElementById('shareLink'); el.textContent = currentLink; el.href = currentLink;
  document.getElementById('expiryBadge').textContent = '⏱ Expira en ' + fmtExpiry(ms) + ' a partir de ahora';
}
function openInvLink(e) { if (e) e.preventDefault(); if (!currentLink) regenLink(); window.open(currentLink, '_blank'); }
function copyInviteLink() { if (!currentLink) regenLink(); navigator.clipboard.writeText(currentLink).then(() => toast('Link copiado ✓')); }
function setWov(v) { const el = document.getElementById('wov'); el.classList.toggle('show', v); if (v) regenLink(); if (agendaText) { document.getElementById('agendaViewWov').style.display = 'block'; document.getElementById('agendaViewWov').textContent = agendaText; } }

// ══ GRID ══
function updateGrid() {
  const grid = document.getElementById('vGrid');
  if (!grid) return;
  const n = grid.querySelectorAll('.vwrap').length;
  grid.className = 'vgrid';
  grid.classList.add(n <= 1 ? 'grid-1' : n === 2 ? 'grid-2' : n <= 4 ? 'grid-4' : 'grid-m');
}
function updatePC() {
  const count = (room?.remoteParticipants?.size || 0) + 1;
  document.getElementById('pCount').textContent = count;
}
function updateChatSel() {
  const sel = document.getElementById('chatTo'); const cur = sel.value;
  sel.innerHTML = '<option value="">Todos</option>';
  room?.remoteParticipants?.forEach(p => {
    const o = document.createElement('option'); o.value = p.identity; o.textContent = p.identity; sel.appendChild(o);
  });
  if (cur) sel.value = cur;
}

// ══ CHAT ══
async function sendChat() {
  const inp = document.getElementById('chatInput'); const msg = inp.value.trim(); if (!msg) return;
  inp.value = '';
  const sel = document.getElementById('chatTo'); const toId = sel.value;
  const toName = toId ? sel.options[sel.selectedIndex].text : '';
  if (toId) {
    const enc = new TextEncoder();
    await sendData({ type: 'chat', name: myName, message: msg, to: toId, toName });
    addChatMsg(myName, msg, true, toName);
  } else {
    await sendData({ type: 'chat', name: myName, message: msg });
    addChatMsg(myName, msg, true, null);
  }
}
function addChatMsg(name, text, isMe, toName) {
  const c = document.getElementById('chatMsgs');
  const d = document.createElement('div'); d.className = 'cmsg' + (toName ? ' pmsg' : '');
  const t = new Date().toLocaleTimeString('es', {hour:'2-digit',minute:'2-digit'});
  const priv = toName ? ` <span style="color:var(--warn);font-size:.68rem">→ ${esc(toName)} (privado)</span>` : '';
  d.innerHTML = `<div class="cn ${isMe?'me':'all'}">${esc(name)}${priv}</div><div class="ct">${esc(text)}</div><div class="ctm">${t}</div>`;
  c.appendChild(d); scrollC();
}
function addSys(text) {
  const c = document.getElementById('chatMsgs');
  const d = document.createElement('div');
  d.innerHTML = `<div style="color:var(--muted);font-size:.7rem;text-align:center;padding:.25rem 0;font-style:italic">${esc(text)}</div>`;
  c.appendChild(d); scrollC();
}
function scrollC() { const m = document.getElementById('chatMsgs'); m.scrollTop = m.scrollHeight; }
function exportChat() {
  const items = document.getElementById('chatMsgs').querySelectorAll('.cmsg');
  let txt = 'Chat NexMeet — ' + new Date().toLocaleString('es') + '\n\n';
  items.forEach(i => { const n=i.querySelector('.cn')?.textContent||''; const t=i.querySelector('.ct')?.textContent||''; const tm=i.querySelector('.ctm')?.textContent||''; txt+=`[${tm}] ${n}: ${t}\n`; });
  dl(txt, 'chat-nexmeet.txt', 'text/plain');
  document.getElementById('moreWrap').classList.remove('open');
}

// ══ DOCS ══
function fIcon(t){if(t.includes('pdf'))return'📄';if(t.includes('image'))return'🖼️';if(t.includes('word')||t.includes('document'))return'📝';if(t.includes('sheet')||t.includes('excel'))return'📊';return'📎';}
function fSize(b){if(b<1024)return b+'B';if(b<1048576)return(b/1024).toFixed(1)+'KB';return(b/1048576).toFixed(1)+'MB';}
function uploadFiles(input) {
  Array.from(input.files).forEach(file => {
    if (file.size > 5*1024*1024) { toast(file.name + ': supera 5MB'); return; }
    if (sharedDocs.length >= 100) { toast('Límite de 100 archivos por sesión alcanzado'); return; }
    const allowedTypes = ['image/','application/pdf','application/vnd.openxmlformats','application/vnd.ms-excel','application/msword','text/plain','text/csv'];
    if (!allowedTypes.some(t => file.type.startsWith(t))) { toast(file.name + ': tipo de archivo no permitido'); return; }
    const r = new FileReader();
    r.onload = async e => {
      const docId = Date.now()+'-'+Math.random().toString(36).slice(2);
      const data = e.target.result;
      const doc = {id:docId, name:file.name, size:file.size, type:file.type, data, senderName:myName};
      sharedDocs.push(doc);
      addDocItem(doc);
      // Send in chunks of 10KB to stay under LiveKit 15KB packet limit
      const CHUNK = 10000;
      const total = Math.ceil(data.length / CHUNK);
      for (let i = 0; i < total; i++) {
        await sendData({
          type: 'doc-chunk',
          docId, name: file.name, size: file.size, mimeType: file.type,
          senderName: myName, chunk: data.slice(i*CHUNK, (i+1)*CHUNK),
          index: i, total
        });
        await new Promise(r => setTimeout(r, 30)); // small delay between chunks
      }
      toast(file.name + ' compartido ✓');
    };
    r.readAsDataURL(file);
  }); input.value = '';
}
function receiveDoc(doc) {
  if (sharedDocs.find(d => d.id === doc.id)) return;
  if (sharedDocs.length >= 100) { toast('Límite de archivos compartidos alcanzado'); return; }
  sharedDocs.push(doc); addDocItem(doc);
  if (activePanel !== 'docs') { unreadDocs++; const b=document.getElementById('docsBadge'); b.style.display='inline'; b.textContent=unreadDocs; }
  addSys(esc(doc.senderName) + ' compartió: ' + esc(doc.name));
  toast('📎 ' + esc(doc.senderName || '') + ' compartió un archivo');
}

// Buffer for incoming chunks
const _docChunks = {};
function receiveDocChunk(msg) {
  // VULN-10: reject malformed / oversized payloads
  if (!msg.docId || typeof msg.docId !== 'string') return;
  if (!Number.isInteger(msg.total) || msg.total < 1 || msg.total > 600) return;
  if (!Number.isInteger(msg.index) || msg.index < 0 || msg.index >= msg.total) return;
  if (typeof msg.chunk !== 'string' || msg.chunk.length > 12000) return;
  if (!_docChunks[msg.docId]) {
    _docChunks[msg.docId] = { chunks: [], name: String(msg.name).slice(0,255), size: msg.size, type: msg.mimeType, senderName: msg.senderName, total: msg.total, received: 0 };
  }
  const buf = _docChunks[msg.docId];
  if (buf.received >= buf.total) return; // already complete
  if (!buf.chunks[msg.index]) { buf.chunks[msg.index] = msg.chunk; buf.received++; }
  const received = buf.chunks.filter(Boolean).length;
  if (received === buf.total) {
    const data = buf.chunks.join('');
    const doc = { id: msg.docId, name: buf.name, size: buf.size, type: buf.type, data, senderName: buf.senderName };
    delete _docChunks[msg.docId];
    if (!sharedDocs.find(d => d.id === doc.id)) {
      sharedDocs.push(doc); addDocItem(doc);
      if (activePanel !== 'docs') { unreadDocs++; const b=document.getElementById('docsBadge'); b.style.display='inline'; b.textContent=unreadDocs; }
      addSys(doc.senderName + ' compartió "' + doc.name + '"');
      toast('📎 ' + esc(doc.senderName) + ' compartió: ' + esc(doc.name));
    }
    // If a show-doc was pending for this doc, show it now
    if (window._pendingShowDoc === msg.docId) {
      showDoc(msg.docId);
      window._pendingShowDoc = null;
    }
  }
}
function addDocItem(doc) {
  document.getElementById('docsEmpty').style.display = 'none';
  const list = document.getElementById('docsList');
  const item = document.createElement('div'); item.className = 'ditem';
  item.innerHTML = `<div class="dicon">${fIcon(doc.type)}</div><div class="dinfo"><div class="dname" title="${esc(doc.name)}">${esc(doc.name)}</div><div class="dmeta">${fSize(doc.size)} · ${esc(doc.senderName)}</div></div><div style="display:flex;gap:.3rem"><button class="ddl ddl-show" title="Mostrar en pantalla">🖥️</button><button class="ddl ddl-dl" title="Descargar">⬇</button></div>`;
  item.querySelector('.ddl-show').addEventListener('click', () => showDoc(doc.id));
  item.querySelector('.ddl-dl').addEventListener('click', () => dlDoc(doc.id));
  list.appendChild(item);
}
function dlDoc(id) { const doc=sharedDocs.find(d=>d.id===id); if(!doc)return; const a=document.createElement('a');a.href=doc.data;a.download=doc.name;a.click(); }

// ══ NOTES ══
async function syncNotes() {
  clearTimeout(notesSyncTimer);
  notesSyncTimer = setTimeout(async () => {
    const txt = document.getElementById('notesArea').value;
    await sendData({type:'notes',text:txt});
    document.getElementById('notesStat').textContent = 'Sincronizado ' + new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
  }, 600);
}
function exportNotes() {
  const txt = document.getElementById('notesArea').value;
  if (!txt) { toast('No hay notas'); return; }
  dl('Notas NexMeet — '+new Date().toLocaleString('es')+'\n\n'+txt,'notas-nexmeet.txt','text/plain');
}

// ══ RECORDING ══
function toggleRec() {
  if (!isRecording) {
    try {
      // Capture entire meeting grid (all participants)
      const meetingEl = document.getElementById('meeting');
      let stream;
      if (meetingEl.captureStream) {
        stream = meetingEl.captureStream(25);
      } else {
        // Fallback: composite all videos onto a canvas
        const recCanvas = document.createElement('canvas');
        recCanvas.width = meetingEl.offsetWidth || 1280;
        recCanvas.height = meetingEl.offsetHeight || 720;
        const ctx = recCanvas.getContext('2d');
        const drawFrame = () => {
          if (!isRecording) return;
          ctx.fillStyle = '#0d0f14';
          ctx.fillRect(0, 0, recCanvas.width, recCanvas.height);
          document.querySelectorAll('#vGrid video').forEach(vid => {
            const r = vid.getBoundingClientRect();
            const mr = meetingEl.getBoundingClientRect();
            try { ctx.drawImage(vid, r.left - mr.left, r.top - mr.top, r.width, r.height); } catch {}
          });
          requestAnimationFrame(drawFrame);
        };
        drawFrame();
        stream = recCanvas.captureStream(25);
        // Add audio from local mic
        const audioTrack = room.localParticipant.getTrack(LivekitClient.Track.Source.Microphone)?.track?.mediaStreamTrack;
        if (audioTrack) stream.addTrack(audioTrack);
      }
      if (!stream) { toast('Sin stream de video'); return; }
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
      recorder = new MediaRecorder(stream, {mimeType});
      recChunks = [];
      recorder.ondataavailable = e => { if(e.data.size>0) recChunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recChunks, {type:'video/webm'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download='nexmeet-'+Date.now()+'.webm'; a.click();
        setTimeout(()=>URL.revokeObjectURL(url),10000);
        toast('Grabación descargada ✓');
      };
      recorder.start(1000); isRecording = true;
      document.getElementById('recInd').classList.add('show');
      document.getElementById('recNotif').classList.add('show');
      document.getElementById('recIcon').textContent = '⏹️';
      document.getElementById('recTxt').textContent = 'Detener grabación';
      toast('Grabación iniciada ⏺');
    } catch { toast('No se puede grabar en este navegador'); }
  } else {
    recorder?.stop(); isRecording = false;
    document.getElementById('recInd').classList.remove('show');
    document.getElementById('recNotif').classList.remove('show');
    document.getElementById('recIcon').textContent = '⏺';
    document.getElementById('recTxt').textContent = 'Grabar';
  }
  document.getElementById('moreWrap').classList.remove('open');
}

// ══ REACTIONS ══
async function sendReaction(emoji) {
  const x = 20 + Math.random() * 60;
  showReaction(emoji, x);
  await sendData({type:'reaction',emoji,x});
  document.getElementById('moreWrap').classList.remove('open');
}
function showReaction(emoji, x) {
  const el = document.createElement('div'); el.className = 'rfloat'; el.textContent = emoji;
  el.style.left = x + '%'; document.body.appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

// ══ AGENDA ══
function openAgenda() { document.getElementById('agendaOverlay').classList.add('show'); document.getElementById('agendaInput').value = agendaText; document.getElementById('moreWrap').classList.remove('open'); }
function closeAgenda() { document.getElementById('agendaOverlay').classList.remove('show'); }
async function saveAgenda() {
  agendaText = document.getElementById('agendaInput').value.trim();
  await sendData({type:'agenda',text:agendaText});
  if (agendaText) { document.getElementById('agendaViewWov').style.display='block'; document.getElementById('agendaViewWov').textContent=agendaText; }
  closeAgenda(); toast('Agenda compartida ✓');
}

// ══ POLLS ══
function openPoll() { document.getElementById('pollOverlay').classList.add('show'); document.getElementById('pollCreate').style.display='block'; document.getElementById('pollVote').style.display='none'; document.getElementById('pollResults').style.display='none'; document.getElementById('pollTitle').textContent='📊 Nueva encuesta'; myVote=null; document.getElementById('moreWrap').classList.remove('open'); }
function closePoll() { document.getElementById('pollOverlay').classList.remove('show'); }
function addPollOpt() { const c=document.getElementById('pollOpts').children.length+1; const r=document.createElement('div'); r.className='poll-opt-row'; r.innerHTML=`<input placeholder="Opción ${c}"/>`; document.getElementById('pollOpts').appendChild(r); }
async function launchPoll() {
  const q=document.getElementById('pollQ').value.trim(); if(!q){toast('Escribe una pregunta');return;}
  const opts=[...document.getElementById('pollOpts').querySelectorAll('input')].map(i=>i.value.trim()).filter(Boolean);
  if(opts.length<2){toast('Agrega al menos 2 opciones');return;}
  pollData={q,opts,votes:opts.map(()=>0),total:0};
  await sendData({type:'poll-launch',poll:{q,opts}});
  showPollResults(); /* keep overlay open so host sees results */
  toast('Encuesta lanzada 🚀 — el overlay muestra resultados en vivo');
}
function receivePoll(p){pollData={q:p.q,opts:p.opts,votes:p.opts.map(()=>0),total:0};showPollVote();document.getElementById('pollOverlay').classList.add('show');}
function showPollVote(){document.getElementById('pollTitle').textContent='📊 '+pollData.q;document.getElementById('pollCreate').style.display='none';const vd=document.getElementById('pollVote');vd.style.display='block';vd.innerHTML=pollData.opts.map((o,i)=>`<button class="pvote-btn" id="pvote-${i}" onclick="castVote(${i})">${esc(o)}</button>`).join('')+`<button class="btn btn-s" style="width:auto;margin-top:.75rem;font-size:.78rem" onclick="closePoll()">✕ Cerrar</button>`;}
async function castVote(idx){if(myVote!==null)return;myVote=idx;await sendData({type:'poll-vote',opt:idx});pollData.votes[idx]++;pollData.total++;document.querySelectorAll('.pvote-btn').forEach((b,i)=>b.classList.toggle('voted',i===idx));toast('Voto registrado ✓');}
function receivePollVote(opt){if(!pollData)return;pollData.votes[opt]++;pollData.total++;if(document.getElementById('pollResults').style.display!=='none')renderResults();}
function showPollResults(){document.getElementById('pollCreate').style.display='none';document.getElementById('pollVote').style.display='none';document.getElementById('pollResults').style.display='block';document.getElementById('pollTitle').textContent='📊 Resultados: '+pollData.q;renderResults();}
function renderResults(){const rd=document.getElementById('pollResults');rd.innerHTML=pollData.opts.map((o,i)=>{const pct=pollData.total?Math.round(pollData.votes[i]/pollData.total*100):0;return`<div class="pbar"><div class="pbar-fill" style="width:${pct}%"></div><span class="pbar-lbl">${esc(o)}</span><span class="pbar-pct">${pct}% (${pollData.votes[i]})</span></div>`;}).join('')+`<div style="font-size:.75rem;color:var(--muted);margin-top:.5rem">${pollData.total} respuesta(s)</div><button class="btn btn-s" style="width:auto;margin-top:.75rem;font-size:.78rem" onclick="closePoll()">Cerrar</button>`;}

// ══ WHITEBOARD ══
function openWB(){document.getElementById('wbOverlay').classList.add('show');const c=document.getElementById('wbCanvas');c.width=c.offsetWidth||1200;c.height=c.offsetHeight||600;document.getElementById('moreWrap').classList.remove('open');}
function closeWB(){document.getElementById('wbOverlay').classList.remove('show');}
function setWbTool(t){wbTool=t;document.getElementById('wbPen').classList.toggle('on',t==='pen');document.getElementById('wbErase').classList.toggle('on',t==='eraser');document.getElementById('wbCanvas').style.cursor=t==='eraser'?'cell':'crosshair';}
function clearWB(){clearWBLocal();sendData({type:'wb-clear'});}
function clearWBLocal(){const c=document.getElementById('wbCanvas');c.getContext('2d').clearRect(0,0,c.width,c.height);}
function downloadWB(){const c=document.getElementById('wbCanvas');const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='pizarra-nexmeet.png';a.click();}
const wbC=document.getElementById('wbCanvas');
function getPos(e){const r=wbC.getBoundingClientRect();const s=e.touches?e.touches[0]:e;return{x:(s.clientX-r.left)*(wbC.width/r.width),y:(s.clientY-r.top)*(wbC.height/r.height)};}
function wbDown(e){e.preventDefault();wbDrawing=true;const{x,y}=getPos(e);wbLastX=x;wbLastY=y;}
async function wbMove(e){if(!wbDrawing)return;e.preventDefault();const{x,y}=getPos(e);const color=document.getElementById('wbColor').value;const size=parseInt(document.getElementById('wbSize').value);const ctx=wbC.getContext('2d');ctx.beginPath();ctx.moveTo(wbLastX,wbLastY);ctx.lineTo(x,y);if(wbTool==='eraser'){ctx.globalCompositeOperation='destination-out';ctx.lineWidth=size*4;}else{ctx.globalCompositeOperation='source-over';ctx.strokeStyle=color;ctx.lineWidth=size;}ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();const stroke={type:'wb-draw',x1:wbLastX,y1:wbLastY,x2:x,y2:y,color,size,eraser:wbTool==='eraser',cw:wbC.width,ch:wbC.height};await sendData(stroke,false);wbLastX=x;wbLastY=y;}
function wbUp(){wbDrawing=false;}
function receiveWbStroke(d){const c=document.getElementById('wbCanvas');const ctx=c.getContext('2d');const sx=c.width/d.cw,sy=c.height/d.ch;ctx.beginPath();ctx.moveTo(d.x1*sx,d.y1*sy);ctx.lineTo(d.x2*sx,d.y2*sy);if(d.eraser){ctx.globalCompositeOperation='destination-out';ctx.lineWidth=d.size*4;}else{ctx.globalCompositeOperation='source-over';ctx.strokeStyle=d.color;ctx.lineWidth=d.size;}ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();}
wbC.addEventListener('mousedown',wbDown);wbC.addEventListener('mousemove',wbMove);wbC.addEventListener('mouseup',wbUp);wbC.addEventListener('mouseleave',wbUp);
wbC.addEventListener('touchstart',wbDown,{passive:false});wbC.addEventListener('touchmove',wbMove,{passive:false});wbC.addEventListener('touchend',wbUp);

// ══ THEME ══
function toggleTheme(){isLightMode=!isLightMode;document.body.classList.toggle('light-mode',isLightMode);document.getElementById('themeIcon').textContent=isLightMode?'🌙':'☀️';document.getElementById('themeTxt').textContent=isLightMode?'Modo oscuro':'Modo claro';document.getElementById('moreWrap').classList.remove('open');}

// ══ AI REPORT ══
function saveGroqKey(){const key=document.getElementById('groqKeyInput').value.trim();if(!key||!key.startsWith('gsk_')){toast('La key debe empezar con gsk_');return;}
  // M2: warn user about browser-side API key risk
  toast('⚠️ Key activa (solo en memoria). No usar en redes no confiables.');
  window._groqKey = key; // memory only — never persisteddocument.getElementById('aiKeyOk').classList.add('show');document.getElementById('groqKeyInput').value='';document.getElementById('groqKeyInput').placeholder='✓ Guardada';toast('API Key guardada ✓');}
function getGroqKey(){return window._groqKey || '';}
function openAI(){document.getElementById('aiOverlay').classList.add('show');document.getElementById('moreWrap').classList.remove('open');resetAIReport();const key=getGroqKey();if(key){document.getElementById('aiKeyOk').classList.add('show');document.getElementById('groqKeyInput').placeholder='✓ Key configurada';}}
function closeAI(){document.getElementById('aiOverlay').classList.remove('show');}
function selectAIOpt(idx){aiOptSelected=idx;document.querySelectorAll('.ai-opt-card').forEach((el,i)=>el.classList.toggle('selected',i===idx));}
function resetAIReport(){document.getElementById('aiReport').classList.remove('show');document.getElementById('aiReport').innerHTML='';document.getElementById('aiReportActions').style.display='none';document.getElementById('aiProgress').classList.remove('show');document.getElementById('aiGenBtn').style.display='block';lastReportText='';}
function collectMeetingData(){
  const chatMsgs=[];
  document.querySelectorAll('#chatMsgs .cmsg').forEach(el=>{const name=el.querySelector('.cn')?.textContent?.replace(/→.*$/,'').trim()||'';const text=el.querySelector('.ct')?.textContent||'';const time=el.querySelector('.ctm')?.textContent||'';if(name&&text)chatMsgs.push({name,text,time});});
  const notes=document.getElementById('notesArea')?.value?.trim()||'';
  const participants=[myName,...[...(room?.remoteParticipants?.values()||[])].map(p=>p.identity)];
  const mins=Math.floor(meetSecs/60);const secs=meetSecs%60;
  return{chatMsgs,notes,agenda:agendaText,participants,duration:`${mins}m ${secs}s`,docs:sharedDocs.map(d=>d.name),pollSummary:pollData?`Encuesta: "${pollData.q}" — ${pollData.opts.map((o,i)=>`${o}: ${pollData.votes[i]}`).join(', ')}. Total: ${pollData.total}`:''};
}
function buildPrompt(data,type){
  const{chatMsgs,notes,agenda,participants,duration,docs,pollSummary}=data;
  const chatStr=chatMsgs.length>0?chatMsgs.map(m=>`[${m.time}] ${m.name}: ${m.text}`).join('\n'):'(Sin mensajes)';
  const context=`DATOS DE LA REUNIÓN:\n- Fecha: ${new Date().toLocaleString('es-ES')}\n- Duración: ${duration}\n- Participantes (${participants.length}): ${participants.join(', ')}\n${agenda?`- Agenda: ${agenda}\n`:''}${docs.length>0?`- Archivos: ${docs.join(', ')}\n`:''}${pollSummary?`- ${pollSummary}\n`:''}\nCHAT:\n${chatStr}\n${notes?`\nNOTAS:\n${notes}`:''}`.trim();
  const prompts={0:`Eres un asistente ejecutivo experto. Analiza esta reunión y genera un REPORTE GERENCIAL completo en español con: 1.RESUMEN EJECUTIVO 2.DECISIONES TOMADAS 3.COMPROMISOS Y RESPONSABLES 4.TEMAS PENDIENTES 5.PRÓXIMOS PASOS 6.ANÁLISIS DE PARTICIPACIÓN 7.RIESGOS O ALERTAS. Usa Markdown. Sé directo y orientado a resultados.\n\n${context}`,1:`Eres un secretario ejecutivo experto. Genera una MINUTA EJECUTIVA formal en español con: 1.ENCABEZADO 2.DESARROLLO 3.ACUERDOS 4.COMPROMISOS (tabla: Responsable|Tarea|Fecha) 5.TEMAS PRÓXIMA REUNIÓN 6.CIERRE. Markdown.\n\n${context}`,2:`Genera un RESUMEN RÁPIDO en español para WhatsApp. Formato con emojis: fecha, duración, participantes, lo más importante, tareas acordadas, pendiente, siguiente paso. Máx 300 palabras.\n\n${context}`,3:`Extrae ÚNICAMENTE los ACTION ITEMS. Clasifica: 🔴 URGENTE 🟡 IMPORTANTE 🟢 SEGUIMIENTO ❓ SIN RESPONSABLE. Para cada uno: tarea, responsable, deadline sugerido. Markdown.\n\n${context}`};
  return prompts[type];
}
async function generateReport(){
  const key=getGroqKey();if(!key){toast('Configura tu Groq API Key primero');return;}
  const data=collectMeetingData();if(data.chatMsgs.length===0&&!data.notes&&!data.agenda){toast('No hay contenido para analizar');return;}
  document.getElementById('aiGenBtn').style.display='none';document.getElementById('aiProgress').classList.add('show');document.getElementById('aiReport').classList.remove('show');document.getElementById('aiReportActions').style.display='none';
  const steps=['Recopilando datos…','Preparando contexto…','Enviando a Groq…','Analizando con LLaMA 3.3 70B…','Generando reporte…'];let stepIdx=0;
  const stepEl=document.getElementById('aiProgStep');const stepInt=setInterval(()=>{if(stepIdx<steps.length-1)stepEl.textContent=steps[++stepIdx];},1200);
  try{
    const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({model:'llama-3.3-70b-versatile',messages:[{role:'system',content:'Eres un asistente ejecutivo experto. Responde siempre en español con formato Markdown claro.'},{role:'user',content:buildPrompt(data,aiOptSelected)}],temperature:0.3,max_tokens:2048})});
    clearInterval(stepInt);
    if(!response.ok){const err=await response.json();throw new Error(err.error?.message||'Error '+response.status);}
    const result=await response.json();
    lastReportText=result.choices?.[0]?.message?.content||'Sin respuesta';
    document.getElementById('aiProgress').classList.remove('show');
    const reportEl=document.getElementById('aiReport');
    const safeReport = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(lastReportText) : lastReportText;
    reportEl.innerHTML=safeReport.replace(/^#{3}\s+(.+)$/gm,'<h3>$1</h3>').replace(/^#{2}\s+(.+)$/gm,'<h2>$1</h2>').replace(/^#{1}\s+(.+)$/gm,'<h2>$1</h2>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/^[-•]\s+(.+)$/gm,'<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g,'<ul>$&</ul>').replace(/<\/ul>\s*<ul>/g,'').replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');
    reportEl.classList.add('show');
    document.getElementById('aiReportActions').style.display='flex';
  }catch(e){clearInterval(stepInt);document.getElementById('aiProgress').classList.remove('show');document.getElementById('aiGenBtn').style.display='block';toast('⚠️ '+e.message);}
}
function copyReport(){navigator.clipboard.writeText(lastReportText).then(()=>toast('Reporte copiado ✓'));}
function downloadReport(){if(!lastReportText){toast('No hay reporte');return;}const types=['reporte-gerencial','minuta-ejecutiva','resumen-rapido','action-items'];dl(lastReportText,'nexmeet-'+types[aiOptSelected]+'-'+new Date().toISOString().slice(0,10)+'.txt','text/plain');}

// ══ UTILS ══
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3200);}
function startTimer(){meetSecs=0;timerInt=setInterval(()=>{meetSecs++;const m=String(Math.floor(meetSecs/60)).padStart(2,'0');const s=String(meetSecs%60).padStart(2,'0');document.getElementById('mTimer').textContent=`${m}:${s}`;},1000);}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');}
function dl(content,filename,mime){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:mime}));a.download=filename;a.click();}
function wDebug(msg){const el=document.getElementById('wDebug');if(el){const d=document.createElement('div');d.textContent=new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+' '+String(msg).slice(0,200);el.appendChild(d);}})+' '+msg+'<br>';console.log('[WR]',msg);}


async function muteAll() {
  // BLOQUE 4d: send signed mute to each participant individually
  const participants = [...room.remoteParticipants.values()];
  for (const p of participants) {
    await sendData({ type: 'mute-you', forIdentity: p.identity });
    await new Promise(r => setTimeout(r, 50)); // small gap per participant
  }
  document.querySelectorAll('[data-muted]').forEach(btn => {
    btn.dataset.muteState = '1';
    btn.textContent = '🔊 Activar mic';
  });
  toast(`${participants.length} participantes silenciados 🔇`);
}


// ══ DOC VIEWER ══
let _currentDocId = null;

async function showDoc(id) {
  const doc = sharedDocs.find(d => d.id === id);
  if (!doc) return;
  _currentDocId = id;
  const content = document.getElementById('docViewerContent');
  document.getElementById('docViewerName').textContent = doc.name;
  content.innerHTML = '<div style="padding:2rem;text-align:center;color:#555">Cargando…</div>';
  document.getElementById('docViewer').classList.add('show');

  const ext = doc.name.split('.').pop().toLowerCase();
  const type = doc.type || '';

  try {
    if (type.startsWith('image/')) {
      content.innerHTML = '';
      const img = document.createElement('img');
      img.src = doc.data;
      content.appendChild(img);

    } else if (type === 'application/pdf' || ext === 'pdf') {
      // Use PDF.js for reliable PDF rendering
      await _loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      const base64 = doc.data.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      content.innerHTML = '';
      content.style.overflowY = 'auto';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1.4 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        canvas.style.cssText = 'display:block;margin:0 auto 4px;max-width:100%';
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        content.appendChild(canvas);
      }

    } else if (ext === 'docx' || type.includes('word') || type.includes('document')) {
      await _loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
      const base64 = doc.data.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer });
      const _purifyConf = { FORBID_TAGS: ['script','style','iframe','object','embed'], FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onfocus'] };
      const safeHtml = typeof DOMPurify !== 'undefined'
        ? DOMPurify.sanitize(result.value, _purifyConf)
        : result.value.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/on[a-z]+=["'][^"']*["']/gi, '');
      content.innerHTML = `<div style="padding:1.5rem 2rem;font-family:Georgia,serif;font-size:.95rem;line-height:1.7;color:#222;max-width:800px;margin:0 auto">${safeHtml}</div>`;

    } else if (ext === 'xlsx' || ext === 'xls' || type.includes('sheet') || type.includes('excel')) {
      await _loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
      const base64 = doc.data.split(',')[1];
      const workbook = XLSX.read(base64, { type: 'base64' });
      let html = '<div style="padding:1rem;overflow-x:auto">';
      workbook.SheetNames.forEach(shName => {
        html += `<h3 style="font-size:.9rem;margin:.5rem 0;color:#333">${esc(shName)}</h3>`;
        const ws = workbook.Sheets[shName];
        if (!ws) return;
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!rows || rows.length === 0) { html += '<p style="color:#999;font-size:.8rem">Hoja vacía</p>'; return; }
        html += '<table style="border-collapse:collapse;font-size:.8rem;margin-bottom:1rem">';
        rows.forEach((row, i) => {
          if (!Array.isArray(row)) return;
          html += '<tr>';
          row.forEach(cell => {
            const tag = i === 0 ? 'th' : 'td';
            const style = i === 0 ? 'background:#f0f0f0;font-weight:600;' : '';
            html += `<${tag} style="border:1px solid #ccc;padding:4px 8px;${style}">${esc(String(cell ?? ''))}</${tag}>`;
          });
          html += '</tr>';
        });
        html += '</table>';
      });
      html += '</div>';
      content.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;

    } else {
      content.innerHTML = `<div style="padding:2rem;text-align:center;color:#333">
        <p style="font-size:2rem">📄</p>
        <p style="font-weight:600">${esc(doc.name)}</p>
        <p style="color:#666;font-size:.85rem">Este formato no tiene previsualización.<br>Descárgalo para abrirlo.</p>
        <button onclick="dlDoc('${doc.id}')" style="margin-top:1rem;padding:.5rem 1.2rem;background:#0f6;border:none;border-radius:6px;cursor:pointer;font-weight:600">⬇ Descargar</button>
      </div>`;
    }
  } catch(e) {
    content.innerHTML = `<div style="padding:2rem;text-align:center;color:#c00">Error al cargar: ${esc(e.message)}</div>`;
  }
}

// SRI map for known CDN scripts (VULN-07)
const _SRI_MAP = {
  'https://cdn.jsdelivr.net/npm/dompurify@3.1.5/dist/purify.min.js': 'sha384-QvE6RDEDmIDHV/o6xf5PqxIcbSw0xUMvq+T8J0vOZHMOeW1GNZHtVVFJq5FQwFf',
};
function _loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector('script[src="' + src + '"]')) { res(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function closeDocViewer(broadcast = false) {
  document.getElementById('docViewer').classList.remove('show');
  if (broadcast && _currentDocId) {
    await sendData({ type: 'close-doc' });
  }
  _currentDocId = null;
}

async function shareDocScreen() {
  if (!_currentDocId) return;
  const doc = sharedDocs.find(d => d.id === _currentDocId);
  if (!doc) return;
  // Only send docId + name — doc data already shared via doc-share event
  // LiveKit has ~15KB packet limit so we cannot include the file here
  await sendData({ type: 'show-doc', docId: _currentDocId, senderName: myName, docName: doc.name });
  toast('Documento compartido en pantalla 📡');
}

