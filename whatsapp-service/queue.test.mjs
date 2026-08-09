// Self-check for the send queue's delivery guarantees. Run: node queue.test.mjs
//
// Covers the four defects that stranded a 103-parent credentials batch:
//   1. a message that never went out must NOT block its own re-send
//   2. a message that DID go out must block an exact repeat (24h dedupe)
//   3. a down socket must pause the queue, not burn the item's retries
//   4. the pending queue must survive a restart
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MessageQueue } from './queue.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wa-queue-'));
const opts = (dir, extra = {}) => ({
  delayMs: 0, jitterMs: 1, retryMs: 20, connWaitMs: 5, warmupEnabled: false, dailyLimit: 1000,
  sessionDir: dir, logFile: path.join(dir, 'messages.log'), ...extra,
});

// ── 2. a delivered message blocks its exact repeat ────────────────────────────
{
  const dir = tmp();
  const sent = [];
  const q = new MessageQueue(async (phone) => { sent.push(phone); return { key: { id: 'x' } }; }, opts(dir));

  assert.strictEqual(q.enqueue({ phone: '919000000001', text: 'hi', dedupeKey: 'k1' }).queued, true,
    'the first enqueue is accepted');
  await sleep(60);
  assert.strictEqual(sent.length, 1, 'the message is delivered once');

  const repeat = q.enqueue({ phone: '919000000001', text: 'hi', dedupeKey: 'k1' });
  assert.strictEqual(repeat.duplicate, true, 'an exact repeat of a DELIVERED message is dropped');
  await sleep(30);
  assert.strictEqual(sent.length, 1, 'no double-send');
}

// ── in-flight double-tap is still deduped (key is no longer burned at enqueue) ─
{
  const dir = tmp();
  const q = new MessageQueue(async () => ({ key: { id: 'x' } }), opts(dir, { isConnected: () => false }));
  q.enqueue({ phone: '919000000002', text: 'hi', dedupeKey: 'k2' });
  const second = q.enqueue({ phone: '919000000002', text: 'hi', dedupeKey: 'k2' });
  assert.strictEqual(second.duplicate, true, 'a double-tap on Send does not queue twice');
  assert.strictEqual(q.queueLength(), 1, 'exactly one item waiting');
  q.q.length = 0;
}

// ── 1 + 3 + 4. down socket → pause, persist, then deliver on reconnect ────────
{
  const dir = tmp();
  const attempted = [];
  const down = new MessageQueue(async (phone) => { attempted.push(phone); return { key: { id: 'x' } }; },
    opts(dir, { isConnected: () => false }));

  down.enqueue({ phone: '919000000003', text: 'creds', dedupeKey: 'k3' });
  await sleep(60);
  assert.strictEqual(attempted.length, 0, 'a down socket never attempts the send');
  assert.strictEqual(down.queueLength(), 1, 'the item waits instead of failing');

  const queueFile = path.join(dir, 'queue.json');
  const persisted = fs.readFileSync(queueFile, 'utf-8');
  assert.ok(persisted.includes('k3'), 'the pending item is persisted to disk');
  assert.ok(!fs.existsSync(path.join(dir, 'dedupe.json'))
    || !fs.readFileSync(path.join(dir, 'dedupe.json'), 'utf-8').includes('k3'),
    'an UNDELIVERED message never burns its dedupe key');

  down.q.length = 0;            // let the paused worker exit
  await sleep(30);
  fs.writeFileSync(queueFile, persisted); // simulate the restart

  const delivered = [];
  new MessageQueue(async (phone) => { delivered.push(phone); return { key: { id: 'x' } }; }, opts(dir));
  await sleep(80);
  assert.deepStrictEqual(delivered, ['919000000003'],
    'the queue reloads after a restart and delivers what was stranded');
}

// ── a permanently failed send can still be re-sent by hand ────────────────────
{
  const dir = tmp();
  let fail = true;
  const seen = [];
  const q = new MessageQueue(async (phone) => {
    seen.push(phone);
    if (fail) throw new Error('WhatsApp not connected');
    return { key: { id: 'x' } };
  }, opts(dir, { retryMs: 10 }));

  q.enqueue({ phone: '919000000004', text: 'creds', dedupeKey: 'k4' });
  await sleep(120);
  assert.ok(seen.length >= 2, 'a failing send is retried once, then given up on');

  fail = false;
  const retry = q.enqueue({ phone: '919000000004', text: 'creds', dedupeKey: 'k4' });
  assert.ok(!retry.duplicate, 'a failed message is NOT reported as a duplicate on re-send');
  await sleep(60);
  assert.ok(seen.length >= 3, 'the manual re-send actually goes out');
}

console.log('queue.test.mjs — all delivery guarantees hold');
