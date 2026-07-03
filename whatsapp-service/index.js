// Udaya LMS — Baileys WhatsApp transport (internal microservice).
//
// Logs into WhatsApp as a Web client (QR scan once; the session persists to
// SESSION_DIR so it never needs re-scanning), then exposes a tiny HTTP API the
// FastAPI backend calls to send parent messages. All pacing / warm-up / dedupe /
// retry lives in queue.js. NOTHING here is exposed publicly — it listens on an
// internal port only (docker network), guarded by a shared token.
import express from 'express';
import pino from 'pino';
import qrcode from 'qrcode';
import fs from 'fs';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';

import { MessageQueue } from './queue.js';

const PORT = Number(process.env.PORT) || 3100;
const SESSION_DIR = process.env.SESSION_DIR || './session';
const LOG_FILE = process.env.LOG_FILE || './logs/messages.log';
const SHARED_TOKEN = process.env.SHARED_TOKEN || '';
const DAILY_MESSAGE_LIMIT = Number(process.env.DAILY_MESSAGE_LIMIT) || 50;
const WARMUP_ENABLED = (process.env.WARMUP_ENABLED ?? 'true') !== 'false';
// Where incoming chat messages are forwarded (FastAPI webhook). The backend
// decides what to keep — only numbers matched to a student/parent are stored.
const BACKEND_WEBHOOK_URL = process.env.BACKEND_WEBHOOK_URL
  || 'http://localhost:8001/api/teacher/whatsapp/webhook';
const MAX_INBOUND_MEDIA_BYTES = 5 * 1024 * 1024; // 5 MB cap on forwarded media

const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

// ── Connection state (shared with the HTTP layer) ──────────────────────────────
let sock = null;
let connected = false;
let latestQrDataUrl = null; // set while pairing, cleared once open
let starting = false;
// Consecutive 'close' events without ever reaching 'open'. A dead/stale saved
// session can loop here forever, reconnecting with invalid creds and NEVER issuing
// a QR. Past a threshold we wipe the session so the next start emits a fresh QR.
let connectAttempts = 0;

// India format: strip +/spaces, drop a leading 0, prepend 91 for a bare 10-digit.
import https from 'https';
import http from 'http';

function normalizeIn(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  return d;
}
const jidFor = (phone) => `${normalizeIn(phone)}@s.whatsapp.net`;

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { rejectUnauthorized: false }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP status ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', (err) => reject(err));
    }).on('error', (err) => reject(err));
  });
}

// The actual Baileys send — throws on any failure so the queue can retry/log.
async function rawSend(phone, text, media) {
  if (!connected || !sock) throw new Error('WhatsApp not connected');
  const jid = jidFor(phone);
  if (!normalizeIn(phone)) throw new Error('Invalid phone number');

  // Simulate human composing status to drastically reduce ban risk
  try {
    await sock.sendPresenceUpdate('composing', jid);
    // Simulate typing delay: ~15ms per character (clamped between 1.0s and 2.5s)
    const delay = Math.min(2500, Math.max(1000, (text || '').length * 15));
    await new Promise((r) => setTimeout(r, delay));
    await sock.sendPresenceUpdate('paused', jid);
  } catch (e) {
    // Graceful degrade: continue sending if presence update fails
    console.warn('[wa] presence update failed:', e.message);
  }

  let content;
  if (media?.url) {
    let mediaData;
    if (media.url.startsWith('http')) {
      try {
        mediaData = await downloadFile(media.url);
      } catch (e) {
        console.error(`[wa] failed to pre-download media URL ${media.url}:`, e.message);
        // Fallback to let Baileys try resolving it directly
        mediaData = { url: media.url };
      }
    } else {
      mediaData = { url: media.url };
    }

    const isImage = String(media.type || '').startsWith('image');
    content = isImage
      ? { image: mediaData, caption: text || '' }
      : { document: mediaData, mimetype: media.type || 'application/pdf',
          fileName: 'report.pdf', caption: text || '' };
  } else {
    content = { text: text || '' };
  }
  return sock.sendMessage(jid, content);
}

const queue = new MessageQueue(rawSend, {
  delayMs: 4000,
  retryMs: 60000,
  warmupEnabled: WARMUP_ENABLED,
  dailyLimit: DAILY_MESSAGE_LIMIT,
  sessionDir: SESSION_DIR,
  logFile: LOG_FILE,
});

function clearSessionDir() {
  try {
    if (fs.existsSync(SESSION_DIR)) {
      const files = fs.readdirSync(SESSION_DIR);
      for (const file of files) {
        fs.rmSync(`${SESSION_DIR}/${file}`, { recursive: true, force: true });
      }
    }
  } catch (e) {
    console.warn('[wa] failed to clear session dir:', e.message);
  }
}

// ── Incoming chat messages → backend webhook ───────────────────────────────────
// The backend keeps a message only when the phone matches a student/parent, so
// the teacher's personal chats on this number never enter the LMS.

function unwrapMessage(m) {
  // Peel ephemeral / view-once wrappers to reach the real content node.
  let node = m;
  for (let i = 0; i < 3 && node; i++) {
    const inner = node.ephemeralMessage?.message
      || node.viewOnceMessage?.message
      || node.viewOnceMessageV2?.message
      || node.documentWithCaptionMessage?.message;
    if (!inner) break;
    node = inner;
  }
  return node || {};
}

function extractText(node) {
  return node.conversation
    || node.extendedTextMessage?.text
    || node.imageMessage?.caption
    || node.documentMessage?.caption
    || node.videoMessage?.caption
    || '';
}

function postToBackend(payload, attempt = 0) {
  try {
    const url = new URL(BACKEND_WEBHOOK_URL);
    const body = JSON.stringify(payload);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Service-Token': SHARED_TOKEN,
      },
      timeout: 15000,
      rejectUnauthorized: false,
    }, (res) => {
      res.resume(); // drain
      if (res.statusCode >= 400 && attempt === 0) {
        setTimeout(() => postToBackend(payload, 1), 5000);
      }
    });
    req.on('error', () => {
      if (attempt === 0) setTimeout(() => postToBackend(payload, 1), 5000);
    });
    req.on('timeout', () => req.destroy());
    req.write(body);
    req.end();
  } catch (e) {
    console.warn('[wa] webhook forward failed:', e.message);
  }
}

async function forwardChatMessage(msg) {
  const jid = msg.key?.remoteJid || '';
  // Private 1:1 chats only — never groups, broadcast lists or status updates.
  if (!jid.endsWith('@s.whatsapp.net')) return;
  const phone = jid.split('@')[0].replace(/\D/g, '');
  if (!phone) return;

  const node = unwrapMessage(msg.message || {});
  // Skip protocol/reaction/edit events — they carry no chat content.
  if (node.protocolMessage || node.reactionMessage || node.pollUpdateMessage) return;

  const text = extractText(node);
  let mediaB64 = null;
  let mediaType = null;
  let mediaName = null;
  const mediaNode = node.imageMessage || node.documentMessage;
  if (mediaNode) {
    mediaType = mediaNode.mimetype || (node.imageMessage ? 'image/jpeg' : 'application/octet-stream');
    mediaName = node.documentMessage?.fileName || null;
    const declared = Number(mediaNode.fileLength || 0);
    if (declared <= MAX_INBOUND_MEDIA_BYTES) {
      try {
        const buf = await downloadMediaMessage(msg, 'buffer', {}, { logger });
        if (buf && buf.length <= MAX_INBOUND_MEDIA_BYTES) mediaB64 = buf.toString('base64');
      } catch (e) {
        console.warn('[wa] media download failed:', e.message);
      }
    }
  }
  if (!text && !mediaB64 && !mediaType) return; // stickers/audio/etc — nothing to show

  postToBackend({
    direction: msg.key?.fromMe ? 'outbound-device' : 'inbound',
    phone,
    body: text || '',
    media_b64: mediaB64,
    media_type: mediaB64 ? mediaType : null,
    media_name: mediaB64 ? mediaName : null,
    id: msg.key?.id || null,
    at: Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000),
  });
}

// ── Baileys socket lifecycle ───────────────────────────────────────────────────
async function startSock() {
  if (starting) return;
  starting = true;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({ version, auth: state, printQRInTerminal: false, logger });

    sock.ev.on('creds.update', saveCreds);

    // Incoming + phone-sent chat messages → backend (only 'notify' = genuinely new
    // messages; 'append'/history syncs would flood the webhook with old chats).
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages || []) {
        forwardChatMessage(msg).catch((e) => console.warn('[wa] inbound forward error:', e.message));
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try { latestQrDataUrl = await qrcode.toDataURL(qr); }
        catch (e) { console.error('[wa] qr render failed:', e.message); }
      }

      if (connection === 'open') {
        connected = true;
        starting = false;
        latestQrDataUrl = null;
        connectAttempts = 0; // healthy link — reset the dead-session guard
        queue.markConnected();
        console.log('[wa] connection open — ready to send');
      }

      if (connection === 'close') {
        connected = false;
        starting = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        connectAttempts++;
        // Self-heal a dead session: if WhatsApp logged us out, OR we've closed many
        // times in a row without ever opening (stale creds that can't pair), delete
        // the saved session so the next start has NO creds → Baileys emits a fresh QR.
        // A genuinely linked phone reaches 'open' first and resets the counter, so a
        // working session is never wiped.
        if (loggedOut || connectAttempts >= 5) {
          console.warn(`[wa] connection closed (code=${code}, attempt=${connectAttempts}) — ` +
            'clearing stale session to force a fresh QR');
          clearSessionDir();
          connectAttempts = 0;
          setTimeout(() => startSock().catch((e) => console.error(e)), 1000);
        } else {
          console.warn(`[wa] connection closed (code=${code}, attempt=${connectAttempts}); reconnecting…`);
          setTimeout(() => startSock().catch((e) => console.error(e)), 3000);
        }
      }
    });
  } catch (e) {
    console.error('[wa] startSock failed:', e.message);
    starting = false;
    setTimeout(() => startSock().catch(() => {}), 5000);
  }
}

// ── HTTP API (internal only) ────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '256kb' }));

function requireToken(req, res, next) {
  if (!SHARED_TOKEN) return next(); // dev: no token configured
  if (req.header('X-Service-Token') === SHARED_TOKEN) return next();
  return res.status(401).json({ error: 'bad service token' });
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/status', requireToken, (_req, res) => {
  res.json({
    connected,
    qr: connected ? null : latestQrDataUrl,
    today_count: queue.todayCount(),
    queue_length: queue.queueLength(),
    warmup_limit: queue.warmupLimit(),
  });
});

app.post('/send', requireToken, (req, res) => {
  const { phone, text, mediaUrl, mediaType, dedupeKey } = req.body || {};
  if (!phone || (!text && !mediaUrl)) {
    return res.status(400).json({ error: 'phone and text (or media) required' });
  }
  const result = queue.enqueue({ phone, text, mediaUrl, mediaType, dedupeKey });
  res.json(result);
});

app.post('/disconnect', requireToken, async (_req, res) => {
  try {
    connected = false;
    latestQrDataUrl = null;
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {
        console.warn('[wa] sock.logout failed, force ending:', e.message);
      }
      try {
        sock.end();
      } catch (e) {}
      sock = null;
    }
    // Delete session files
    clearSessionDir();
    res.json({ success: true });
    // Restart socket to get a fresh QR code
    setTimeout(() => startSock().catch((e) => console.error(e)), 2000);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`[wa] service listening on :${PORT}`);
  if (!SHARED_TOKEN) console.warn('[wa] SHARED_TOKEN not set — /send and /status are unauthenticated');
  startSock().catch((e) => console.error('[wa] initial start failed:', e));
});
