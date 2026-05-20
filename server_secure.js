// NexMeet Token Server — SECURE v3
// Fixes: C1 (canPublish:false guests), C2 (CORS strict + rate limit + room auth)
//        H4 (hostProof one-time nonce), C2 (quota per IP)

const express = require('express');
const crypto  = require('crypto');
const { AccessToken } = require('livekit-server-sdk');
const app = express();
app.use(express.json());

// ── CONFIG ────────────────────────────────────────────────
const API_KEY        = 'APIQa3agXdawiqi';
const API_SECRET     = '7OIzgCQL8Mmsw4zZ77IB1Id1rFVHBEjeNZYYfmZ4TeDA';
const PORT           = 3001;
const ALLOWED_ORIGIN = 'https://malonpez.github.io'; // C2: strict origin

// ── ROOM STORE ─────────────────────────────────────────────
// roomId → { hostIdentity, createdAt, participantCount, usedNonces }
const rooms = new Map();

// ── RATE LIMITING ──────────────────────────────────────────
// C2: per-IP limits
const ipLimits = new Map();

function checkIPRate(ip, limit = 30, windowMs = 60000) {
  const now = Date.now();
  const e   = ipLimits.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > e.resetAt) { e.count = 0; e.resetAt = now + windowMs; }
  e.count++;
  ipLimits.set(ip, e);
  return e.count <= limit;
}

// C2: per-room token quota (max 50 tokens / room / hour)
const roomTokenCount = new Map();
function checkRoomQuota(roomId, limit = 50, windowMs = 3600000) {
  const now = Date.now();
  const e   = roomTokenCount.get(roomId) || { count: 0, resetAt: now + windowMs };
  if (now > e.resetAt) { e.count = 0; e.resetAt = now + windowMs; }
  e.count++;
  roomTokenCount.set(roomId, e);
  return e.count <= limit;
}

// ── NONCE STORE (H4: hostProof one-time) ──────────────────
const usedNonces = new Set();
function consumeNonce(nonce) {
  if (!nonce || usedNonces.has(nonce)) return false;
  usedNonces.add(nonce);
  // Cleanup after 1h
  setTimeout(() => usedNonces.delete(nonce), 3600000);
  return true;
}

// ── HMAC hostProof ─────────────────────────────────────────
const PROOF_SECRET = crypto.randomBytes(32).toString('hex');
function makeHostProof(room, username, nonce) {
  const payload = `${room}:${username}:${nonce}:${Math.floor(Date.now()/60000)}`;
  return crypto.createHmac('sha256', PROOF_SECRET).update(payload).digest('hex');
}
function verifyHostProof(proof, room, username, nonce) {
  const now   = Math.floor(Date.now() / 60000);
  // Accept current minute and previous (clock drift tolerance)
  for (const t of [now, now - 1]) {
    const payload  = `${room}:${username}:${nonce}:${t}`;
    const expected = crypto.createHmac('sha256', PROOF_SECRET).update(payload).digest('hex');
    if (crypto.timingSafeEqual(Buffer.from(proof, 'hex'), Buffer.from(expected, 'hex'))) {
      return true;
    }
  }
  return false;
}

// ── CORS MIDDLEWARE ─────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin',  ALLOWED_ORIGIN);
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('X-Content-Type-Options',       'nosniff');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  // C2: rate limit every request
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
             || req.socket.remoteAddress;
  if (!checkIPRate(ip)) return res.status(429).json({ error: 'Too many requests' });
  req._ip = ip;
  next();
});

// ── POST /api/room/create ───────────────────────────────────
// C2: creates room, returns hostProof — no unauthenticated escalation
app.post('/api/room/create', (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string' || username.length > 64) {
    return res.status(400).json({ error: 'Invalid username' });
  }
  // Generate room ID server-side — not client-controlled
  const roomId = 'room-' + crypto.randomBytes(12).toString('base64url').slice(0, 12);
  const nonce  = crypto.randomBytes(16).toString('hex');
  const proof  = makeHostProof(roomId, username, nonce);

  rooms.set(roomId, {
    hostIdentity:     username,
    createdAt:        Date.now(),
    participantCount: 0,
  });
  // Auto-cleanup after 24h
  setTimeout(() => rooms.delete(roomId), 86400000);

  res.json({ roomId, hostProof: proof, nonce });
});

// ── POST /api/token ─────────────────────────────────────────
app.post('/api/token', (req, res) => {
  const { room, username, hostProof, nonce, expiry } = req.body;

  // Validate inputs
  if (!room || !username) return res.status(400).json({ error: 'room and username required' });
  if (typeof room !== 'string' || room.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(room)) {
    return res.status(400).json({ error: 'Invalid room' });
  }
  if (typeof username !== 'string' || username.length > 64) {
    return res.status(400).json({ error: 'Invalid username' });
  }

  // C2: room quota
  if (!checkRoomQuota(room)) {
    return res.status(429).json({ error: 'Room token quota exceeded' });
  }

  // C1: determine host server-side — never from client flag
  let isHost = false;
  const roomData = rooms.get(room);

  if (hostProof && nonce && roomData) {
    // H4: verify proof AND consume nonce (one-time use)
    if (!verifyHostProof(hostProof, room, username, nonce)) {
      return res.status(403).json({ error: 'Invalid host proof' });
    }
    if (!consumeNonce(nonce)) {
      return res.status(403).json({ error: 'Proof already used' });
    }
    isHost = roomData.hostIdentity === username;
  }

  // C1: guest tokens get canPublish:false — waiting room is enforced by server
  const token = new AccessToken(API_KEY, API_SECRET, {
    identity: username,
    ttl:      '8h',
  });

  token.addGrant({
    roomJoin:        true,
    room,
    canPublish:      isHost,       // ← C1 FIX: guests cannot publish until upgraded
    canSubscribe:    true,
    canPublishData:  true,
    roomAdmin:       isHost,
  });

  // Track participant count
  if (roomData) {
    roomData.participantCount = (roomData.participantCount || 0) + 1;
    if (roomData.participantCount > 50) {
      return res.status(429).json({ error: 'Room full' });
    }
  }

  res.json({ token: token.toJwt(), isHost });
});

// ── POST /api/admit ─────────────────────────────────────────
// C1: host calls this to grant canPublish to a specific guest
app.post('/api/admit', (req, res) => {
  const { room, hostProof, nonce, guestIdentity } = req.body;

  if (!room || !hostProof || !nonce || !guestIdentity) {
    return res.status(400).json({ error: 'Missing params' });
  }
  const roomData = rooms.get(room);
  if (!roomData) return res.status(404).json({ error: 'Room not found' });

  // Verify host proof (consume nonce)
  if (!verifyHostProof(hostProof, room, roomData.hostIdentity, nonce)) {
    return res.status(403).json({ error: 'Invalid host proof' });
  }
  if (!consumeNonce(nonce)) {
    return res.status(403).json({ error: 'Proof already used' });
  }

  // Issue upgraded token for guest with canPublish:true
  const token = new AccessToken(API_KEY, API_SECRET, {
    identity: guestIdentity,
    ttl:      '8h',
  });
  token.addGrant({
    roomJoin:       true,
    room,
    canPublish:     true,   // C1 FIX: now allowed
    canSubscribe:   true,
    canPublishData: true,
    roomAdmin:      false,
  });

  res.json({ upgradeToken: token.toJwt() });
});

// ── Health ──────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size }));

app.listen(PORT, () => console.log(`NexMeet token server v3 on :${PORT}`));
