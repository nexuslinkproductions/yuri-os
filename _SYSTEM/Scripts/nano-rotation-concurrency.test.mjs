#!/usr/bin/env node
// DURABLE multi-process regression for the event-log rotation BLOCK the red-team caught (I3): concurrent
// rotators must not silently destroy events via destination-name collision. Single-threaded Node cannot
// race, so this forks REAL OS processes — appenders + rotators hammering one log — and asserts ZERO loss.
// Slow (~seconds, real procs); kept separate from the fast unit suites. Mirrors /tmp/kg-redteam/run-I3.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUS = path.join(HERE, 'kagami-event-bus.mjs');
const { readKagamiEvents } = await import('./kagami-event-bus.mjs');

const waitExit = (cp) => new Promise((res) => cp.on('exit', (code) => res(code)));

test('I3 regression: concurrent rotators + appenders lose ZERO events (real OS processes)', { timeout: 90_000 }, async () => {
  const root = path.join(os.tmpdir(), `i3-reg-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(root, { recursive: true });
  const worker = path.join(root, 'worker.mjs');
  // role=append: append N events with globally-unique ids. role=rotate: force-rotate in a loop.
  fs.writeFileSync(worker, [
    `import { appendKagamiEvent, rotateEventLog } from ${JSON.stringify(BUS)};`,
    'const role = process.argv[2], n = Number(process.argv[3]), tag = process.argv[4], root = process.argv[5];',
    "if (role === 'append') { for (let i = 0; i < n; i++) appendKagamiEvent('LANE_OUTPUT_DELTA', { lane: tag }, { root, id: tag + '-' + i }); }",
    "else { for (let i = 0; i < n; i++) { try { rotateEventLog({ root, force: true }); } catch { /* lost-race/seq-reserved is fine */ } } }",
  ].join('\n'));

  const APPENDERS = 4; const PER = 300; const ROTATORS = 4; const ROTATE_TRIES = 120;
  const procs = [];
  for (let a = 0; a < APPENDERS; a += 1) procs.push(fork(worker, ['append', String(PER), `app${a}`, root], { stdio: 'ignore' }));
  for (let r = 0; r < ROTATORS; r += 1) procs.push(fork(worker, ['rotate', String(ROTATE_TRIES), `rot${r}`, root], { stdio: 'ignore' }));
  const codes = await Promise.all(procs.map(waitExit));

  assert.ok(codes.every((c) => c === 0), `all workers exit cleanly: ${codes}`);
  // readKagamiEvents spans every segment and THROWS on a torn line — so no throw also proves atomic appends.
  const events = readKagamiEvents({ root });
  const ids = new Set(events.map((e) => e.id));
  const expected = APPENDERS * PER;
  assert.equal(ids.size, expected, `ZERO loss: ${ids.size} distinct ids on disk must equal ${expected} appended`);
  // sealed segment seqs must be strictly increasing (gaps from reserved-then-rolled-back seqs are benign).
  const seqs = fs.readdirSync(root).map((n) => n.match(/^events\.(\d{6,})\.jsonl$/)).filter(Boolean).map((m) => Number(m[1]));
  assert.deepEqual(seqs, [...seqs].sort((x, y) => x - y), 'segment seqs monotonic');
  assert.equal(new Set(seqs).size, seqs.length, 'no duplicate segment seq (no double-seal)');
  fs.rmSync(root, { recursive: true, force: true });
});
