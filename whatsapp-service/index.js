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
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';

import { MessageQueue } from './queue.js';

const PORT = Number(process.env.PORT) || 3100;
const SESSION_DIR = process.env.SESSION_DIR || './session';
const LOG_FILE = process.env.LOG_FILE || './logs/messages.log';
const SHARED_TOKEN = process.env.SHARED_TOKEN || '';
const DAILY_MESSAGE_LIMIT = Number(process.env.DAILY_MESSAGE_LIMIT) || 50;
const WARMUP_ENABLED = (process.env.WARMUP_ENABLED ?? 'true') !== 'false';

const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

// ── Connection state (shared with the HTTP layer) ──────────────────────────────
let sock = null;
let connected = false;
let latestQrDataUrl = null; // set while pairing, cleared once open
let starting = false;

// India format: strip +/spaces, drop a leading 0, prepend 91 for a bare 10-digit.
function normalizeIn(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  return d;
}
const jidFor = (phone) => `${normalizeIn(phone)}@s.whatsapp.net`;

// The actual Baileys send — throws on any failure so the queue can retry/log.
async function rawSend(phone, text, media) {
  if (!connected || !sock) throw new Error('WhatsApp not connected');
  const jid = jidFor(phone);
  if (!normalizeIn(phone)) throw new Error('Invalid phone number');

  let content;
  if (media?.url) {
    const isImage = String(media.type || '').startsWith('image');
    content = isImage
      ? { image: { url: media.url }, caption: text || '' }
      : { document: { url: media.url }, mimetype: media.type || 'application/pdf',
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

// ── Baileys socket lifecycle ───────────────────────────────────────────────────
async function startSock() {
  if (starting) return;
  starting = true;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({ version, auth: state, printQRInTerminal: false, logger });

    sock.ev.on('creds.update', saveCreds);

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
        queue.markConnected();
        console.log('[wa] connection open — ready to send');
      }

      if (connection === 'close') {
        connected = false;
        starting = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        console.warn(`[wa] connection closed (code=${code}); ` +
          (loggedOut ? 'logged out — a fresh QR will be issued' : 'reconnecting…'));
        // Reconnect either way: a logged-out session reconnects to get a new QR.
        const delay = loggedOut ? 1000 : 3000;
        setTimeout(() => startSock().catch((e) => console.error(e)), delay);
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

app.listen(PORT, () => {
  console.log(`[wa] service listening on :${PORT}`);
  if (!SHARED_TOKEN) console.warn('[wa] SHARED_TOKEN not set — /send and /status are unauthenticated');
  startSock().catch((e) => console.error('[wa] initial start failed:', e));
});
