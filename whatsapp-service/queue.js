// Message queue for the Baileys transport.
//
// Responsibilities (all the "don't get banned" machinery lives here, not in the
// FastAPI side):
//   • one send at a time, with EXACTLY `delayMs` (4000ms) between sends
//   • warm-up daily cap that ramps by week since first connect (50→100→200→500)
//   • deduplication — the same dedupeKey is never sent twice (persisted to disk)
//   • retry a failed send once, after `retryMs` (60s)
//   • pause (never fail) while the WhatsApp socket is down
//   • append every attempt to logs/messages.log
//
// State (sent counter, first-connect date), the dedupe set AND the pending queue
// all persist to disk so a container restart / redeploy doesn't reset the warm-up,
// double-send, or silently drop a half-delivered batch.
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
    // Live socket state. Without this the worker kept sending into a dead socket,
    // burning both attempts on every item during a reconnect and mass-failing a
    // batch. Defaults to "always connected" so existing callers behave as before.
    this.isConnected = opts.isConnected || (() => true);
    this.connWaitMs = opts.connWaitMs ?? 5000;
    this.delayMs = opts.delayMs ?? 4000;
    this.jitterMs = opts.jitterMs ?? 2500; // random 0..jitterMs on top of delayMs
    this.retryMs = opts.retryMs ?? 60000;
    this.warmupEnabled = opts.warmupEnabled ?? true;
    this.dailyLimit = Number(opts.dailyLimit) || 50; // week-1 cap
    this.sessionDir = opts.sessionDir || './session';
    this.logFile = opts.logFile || './logs/messages.log';
    // Monotonic by construction: a dailyLimit above a later rung used to make the
    // cap SHRINK in week 2 (e.g. 250 → 100), throttling an established number.
    this.warmupLadder = [100, 200, 500].reduce(
      (ladder, rung) => [...ladder, Math.max(rung, ladder[ladder.length - 1])],
      [this.dailyLimit]);

    this.stateFile = path.join(this.sessionDir, 'state.json');
    this.dedupeFile = path.join(this.sessionDir, 'dedupe.json');
    this.queueFile = path.join(this.sessionDir, 'queue.json');

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

    // The pending queue survives a restart. It used to live only in memory, so a
    // redeploy midway through a 100-parent batch dropped every message still
    // waiting — and because the dedupe key was already burned at enqueue time,
    // re-sending them was then silently swallowed as a "duplicate".
    const savedQueue = readJson(this.queueFile, []);
    this.q = Array.isArray(savedQueue) ? savedQueue : [];
    this._running = false;
    if (this.q.length) this._ensureRunning();
  }

  _persistQueue() {
    writeJson(this.queueFile, this.q);
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

  // True when the queue is parked on the warm-up cap — the teacher needs to see
  // "waiting for tomorrow" rather than an unexplained pile of "queued" rows.
  heldByCap() {
    return Boolean(this._heldByCap) && this.q.length > 0;
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
    // "Already delivered" (persisted) OR "already waiting in this queue" (in-flight).
    // The in-flight half is what stops a double-tap on Send from sending twice now
    // that the persisted key is only written AFTER a message actually goes out.
    return this.dedupe.has(key) || this.q.some((it) => it.dedupeKey === key);
  }
  _remember(key) {
    if (!key) return;
    this.dedupe.set(key, Date.now());
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
  enqueue({ phone, text, mediaUrl, mediaType, mediaName, dedupeKey }) {
    if (this._seen(dedupeKey)) {
      this._log(phone, 'skipped-duplicate', dedupeKey);
      return { queued: false, duplicate: true };
    }
    // NOTE: the dedupe key is deliberately NOT recorded here — only once the send
    // actually succeeds (_process). Recording at enqueue meant a message that never
    // left (restart, crash, cap) still blocked its own re-send for 24h, and the
    // blocked retry was reported back to the teacher as "sent".
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    this.q.push({
      id, phone, text, dedupeKey,
      media: mediaUrl ? { url: mediaUrl, type: mediaType, fileName: mediaName } : null,
      attempts: 0,
    });
    this._persistQueue();
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
      const item = this.q[0];
      if (!item) { this._running = false; this._heldByCap = false; return; } // idle — restarts on next enqueue

      // Warm-up gate: hold the item (and the rest of the queue) until tomorrow.
      if (this.todayCount() >= this.warmupLimit()) {
        if (!this._heldByCap) { // log the transition only — this re-checks every 60s
          this._heldByCap = true;
          this._log(item.phone, 'held-daily-cap', String(this.warmupLimit()));
        }
        await sleep(this.retryMs);
        continue;
      }
      this._heldByCap = false;

      // Connection gate: while the socket is down, WAIT — never spend the item's
      // retries on a send that cannot possibly work. The batch resumes by itself
      // once Baileys reconnects, instead of mass-failing mid-run.
      if (!this.isConnected()) {
        await sleep(this.connWaitMs);
        continue;
      }

      // Only now does the item leave the queue — so a crash between shift() and
      // send no longer loses it.
      this.q.shift();
      this._persistQueue();
      await this._process(item);
      // Randomize the delay slightly to look more human (delayMs + random jitter)
      const jitter = Math.floor(Math.random() * this.jitterMs);
      await sleep(this.delayMs + jitter);
    }
  }

  async _process(item) {
    try {
      const res = await this.sendFn(item.phone, item.text, item.media);
      this._countSent();
      this._remember(item.dedupeKey); // only a DELIVERED message blocks its repeat
      this._log(item.phone, 'sent', res?.key?.id || '');
      try { this.onSent?.(item, res); } catch (e) { console.warn('[queue] onSent failed:', e.message); }
    } catch (e) {
      const msg = e?.message || String(e);
      if (item.attempts < 1) {
        item.attempts += 1;
        this._log(item.phone, 'retry', msg);
        // Requeue once after retryMs without blocking the worker.
        setTimeout(() => { this.q.push(item); this._persistQueue(); this._ensureRunning(); }, this.retryMs);
      } else {
        this._log(item.phone, 'failed', msg);
        try { this.onFailed?.(item, msg); } catch (e2) { console.warn('[queue] onFailed failed:', e2.message); }
      }
    }
  }
}
