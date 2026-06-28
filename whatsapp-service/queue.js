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
    this.dedupe = new Set(readJson(this.dedupeFile, []));

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

  // ── dedupe ──────────────────────────────────────────────────────────────────
  _seen(key) {
    return key && this.dedupe.has(key);
  }
  _remember(key) {
    if (!key) return;
    this.dedupe.add(key);
    // Keep the file bounded (last ~5000 keys) so it can't grow forever.
    const arr = [...this.dedupe];
    if (arr.length > 5000) this.dedupe = new Set(arr.slice(-5000));
    writeJson(this.dedupeFile, [...this.dedupe]);
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
      id, phone, text,
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
      await sleep(this.delayMs); // exactly 4s between sends
    }
  }

  async _process(item) {
    try {
      const res = await this.sendFn(item.phone, item.text, item.media);
      this._countSent();
      this._log(item.phone, 'sent', res?.key?.id || '');
    } catch (e) {
      const msg = e?.message || String(e);
      if (item.attempts < 1) {
        item.attempts += 1;
        this._log(item.phone, 'retry', msg);
        // Requeue once after retryMs without blocking the worker.
        setTimeout(() => { this.q.push(item); this._ensureRunning(); }, this.retryMs);
      } else {
        this._log(item.phone, 'failed', msg);
      }
    }
  }
}
