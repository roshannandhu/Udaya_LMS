// Message queue for the Baileys transport.
//
// Responsibilities (all the "don't get banned" machinery lives here, not in the
// FastAPI side):
//   • one send at a time, with EXACTLY `delayMs` (4000ms) between sends
//   • warm-up daily cap that ramps by week since first connect (50→100→200→500)
//   • deduplication — the same dedupeKey is never sent twice (persisted to disk)
//   • retry a failed send once, after `retryMs` (60s)
//   • append every attempt to logs/messages.log
//
// State (sent counter, first-connect date) and the dedupe set persist to disk so
// a container restart / redeploy doesn't reset the warm-up or double-send.
import fs from 'fs';
import path from 'path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayStr = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
  } catch (e) {
    console.error('[queue] state write failed:', e.message);
  }
}

export class MessageQueue {
  /**
   * @param {(phone:string, text:string, media:object|null) => Promise<any>} sendFn
   * @param {object} opts
   */
  constructor(sendFn, opts = {}) {
    this.sendFn = sendFn;
    // Optional: called after each successful send with (item, sendResult) so the
    // service can report real delivery status back to the backend (the UI's
    // sent/delivered/read ticks depend on it — without this everything stays
    // "queued" forever).
    this.onSent = opts.onSent || null;
    this.onFailed = opts.onFailed || null;
    this.delayMs = opts.delayMs ?? 4000;
    this.retryMs = opts.retryMs ?? 60000;
    this.warmupEnabled = opts.warmupEnabled ?? true;
    this.dailyLimit = Number(opts.dailyLimit) || 50; // week-1 cap
    this.sessionDir = opts.sessionDir || './session';
    this.logFile = opts.logFile || './logs/messages.log';
    this.warmupLadder = [this.dailyLimit, 100, 200, 500];

    this.stateFile = path.join(this.sessionDir, 'state.json');
    this.dedupeFile = path.join(this.sessionDir, 'dedupe.json');

    this.state = readJson(this.stateFile, {
      firstConnectDate: null, sentDate: todayStr(), sentCount: 0,
    });
    // Dedupe is TIME-BOUNDED (24h): key -> enqueue timestamp. The old permanent
    // Set silently dropped every later send with identical content — a weekly
    // report whose text hadn't changed since last week was never delivered again.
    // Migrate the legacy array format (no timestamps) by expiring it outright.
    this.dedupeTtlMs = Number(opts.dedupeTtlMs) || 24 * 60 * 60 * 1000;
    const rawDedupe = readJson(this.dedupeFile, {});
    this.dedupe = new Map(Array.isArray(rawDedupe) ? [] : Object.entries(rawDedupe));

    this.q = [];
    this._running = false;
  }

  // ── warm-up / counters ──────────────────────────────────────────────────────
  markConnected() {
    if (!this.state.firstConnectDate) {
      this.state.firstConnectDate = todayStr();
      writeJson(this.stateFile, this.state);
    }
  }

  _rollover() {
    if (this.state.sentDate !== todayStr()) {
      this.state.sentDate = todayStr();
      this.state.sentCount = 0;
      writeJson(this.stateFile, this.state);
    }
  }

  warmupLimit() {
    if (!this.warmupEnabled) return this.dailyLimit;
    if (!this.state.firstConnectDate) return this.dailyLimit;
    const days = Math.floor(
      (Date.parse(todayStr()) - Date.parse(this.state.firstConnectDate)) / 86400000);
    const week = Math.max(0, Math.min(3, Math.floor(days / 7)));
    return this.warmupLadder[week];
  }

  todayCount() {
    this._rollover();
    return this.state.sentCount;
  }

  queueLength() {
    return this.q.length;
  }

  _countSent() {
    this._rollover();
    this.state.sentCount += 1;
    writeJson(this.stateFile, this.state);
  }

  // ── dedupe (24h sliding window) ──────────────────────────────────────────────
  _pruneDedupe() {
    const cutoff = Date.now() - this.dedupeTtlMs;
    for (const [k, ts] of this.dedupe) {
      if (ts < cutoff) this.dedupe.delete(k);
    }
  }
  _persistDedupe() {
    // Keep the file bounded (last ~5000 keys) so it can't grow forever.
    if (this.dedupe.size > 5000) {
      const arr = [...this.dedupe.entries()].slice(-5000);
      this.dedupe = new Map(arr);
    }
    writeJson(this.dedupeFile, Object.fromEntries(this.dedupe));
  }
  _seen(key) {
    if (!key) return false;
    this._pruneDedupe();
    return this.dedupe.has(key);
  }
  _remember(key) {
    if (!key) return;
    this.dedupe.set(key, Date.now());
    this._persistDedupe();
  }
  _forget(key) {
    // A permanently-failed send must not block a manual retry of the same message.
    if (!key || !this.dedupe.has(key)) return;
    this.dedupe.delete(key);
    this._persistDedupe();
  }

  // ── logging ─────────────────────────────────────────────────────────────────
  _log(phone, status, error = '') {
    const line = `${new Date().toISOString()}\t${phone}\t${status}\t${error}\n`;
    try {
      fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
      fs.appendFileSync(this.logFile, line);
    } catch (e) {
      console.error('[queue] log write failed:', e.message);
    }
  }

  // ── enqueue + worker ─────────────────────────────────────────────────────────
  enqueue({ phone, text, mediaUrl, mediaType, dedupeKey }) {
    if (this._seen(dedupeKey)) {
      this._log(phone, 'skipped-duplicate', dedupeKey);
      return { queued: false, duplicate: true };
    }
    this._remember(dedupeKey);
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    this.q.push({
      id, phone, text, dedupeKey,
      media: mediaUrl ? { url: mediaUrl, type: mediaType } : null,
      attempts: 0,
    });
    this._ensureRunning();
    return { queued: true, id };
  }

  _ensureRunning() {
    if (this._running) return;
    this._running = true;
    this._loop().catch((e) => {
      console.error('[queue] loop crashed:', e);
      this._running = false;
    });
  }

  async _loop() {
    while (true) {
      const item = this.q.shift();
      if (!item) { this._running = false; return; } // idle — restarts on next enqueue

      // Warm-up gate: hold the item (and the rest of the queue) until tomorrow.
      if (this.todayCount() >= this.warmupLimit()) {
        this.q.unshift(item);
        this._log(item.phone, 'held-daily-cap', String(this.warmupLimit()));
        await sleep(this.retryMs); // re-check after a minute
        continue;
      }

      await this._process(item);
      // Randomize the delay slightly to look more human (delayMs + random 0 to 2.5 seconds jitter)
      const jitter = Math.floor(Math.random() * 2500);
      await sleep(this.delayMs + jitter);
    }
  }

  async _process(item) {
    try {
      const res = await this.sendFn(item.phone, item.text, item.media);
      this._countSent();
      this._log(item.phone, 'sent', res?.key?.id || '');
      try { this.onSent?.(item, res); } catch (e) { console.warn('[queue] onSent failed:', e.message); }
    } catch (e) {
      const msg = e?.message || String(e);
      if (item.attempts < 1) {
        item.attempts += 1;
        this._log(item.phone, 'retry', msg);
        // Requeue once after retryMs without blocking the worker.
        setTimeout(() => { this.q.push(item); this._ensureRunning(); }, this.retryMs);
      } else {
        this._log(item.phone, 'failed', msg);
        this._forget(item.dedupeKey); // allow a manual re-send of the same content
        try { this.onFailed?.(item, msg); } catch (e2) { console.warn('[queue] onFailed failed:', e2.message); }
      }
    }
  }
}
