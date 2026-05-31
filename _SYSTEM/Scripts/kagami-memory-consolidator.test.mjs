import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSubconsciousPass, findRepromotionCandidates } from './kagami-memory-consolidator.mjs';
import { openColdStore, upsertCold, getCold, COLD_DB_PATH } from './memory-cold-store.mjs';

const DAY = 86400000;
const NOOP = () => {};

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'consol-'));
}
function writeMem(root, file, fm, body, mtimeMs) {
  const p = path.join(root, file);
  fs.writeFileSync(p, `---\n${fm}\n---\n${body}\n`);
  if (mtimeMs) { const s = new Date(mtimeMs); fs.utimesSync(p, s, s); }
  return p;
}

test('dry-run plans demotions but mutates nothing (scheduled-run safety)', () => {
  const now = 500 * DAY;
  const root = tmpRoot();
  writeMem(root, 'stale-note.md', 'name: stale-note\ntier: working', 'decayed content', now - 400 * DAY);
  writeMem(root, 'keep-note.md', 'name: keep-note\nforce_keep: true', 'pinned content', now - 400 * DAY);

  const res = runSubconsciousPass.constructor.name; // (sanity: it is a function)
  assert.equal(res, 'AsyncFunction');
  return runSubconsciousPass({ root, nowMs: now, execute: false, log: NOOP }).then((r) => {
    assert.equal(r.scanned, 2);
    assert.equal(r.demoteCandidates, 1, 'only the non-force-keep stale note is a candidate');
    assert.equal(r.relocation.dryRun, true);
    assert.equal(r.proposed.length, 0);
    // nothing moved, no relocated/ dir, no index written
    assert.ok(fs.existsSync(path.join(root, 'stale-note.md')), 'source file untouched');
    assert.ok(!fs.existsSync(path.join(root, 'relocated')), 'no relocated/ dir in dry-run');
    assert.ok(!fs.existsSync(path.join(root, 'relocation-index.json')), 'no index in dry-run');
    fs.rmSync(root, { recursive: true, force: true });
  });
});

test('execute demotes a decayed memory reversibly (cold body verbatim + relocated/ copy)', async () => {
  const now = 500 * DAY;
  const root = tmpRoot();
  writeMem(root, 'stale-note.md', 'name: stale-note\ntier: working', 'decayed content', now - 400 * DAY);
  const db = openColdStore(':memory:');

  const r = await runSubconsciousPass({ root, nowMs: now, execute: true, coldDb: db, log: NOOP, propose: () => ({ ok: true }), listProposals: () => ({ proposals: [] }) });
  assert.equal(r.relocation.demoted, 1);
  assert.ok(!fs.existsSync(path.join(root, 'stale-note.md')), 'source moved out of active root');
  assert.ok(fs.existsSync(path.join(root, 'relocated', 'stale-note.md')), 'reversible relocated/ copy exists');
  const cold = getCold(db, 'stale-note');
  assert.ok(cold && cold.body.includes('decayed content'), 'cold body preserved verbatim');
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('re-promotion: a recalled cold slug surfaces an operator-gated proposal', async () => {
  const now = 500 * DAY;
  const root = tmpRoot();
  const ledgerFile = path.join(root, 'ledger.jsonl');
  fs.writeFileSync(ledgerFile, [1, 2, 3].map((i) => JSON.stringify({ t: now - i * DAY, slug: 'hot-cold', event: 'recall' })).join('\n') + '\n');
  const db = openColdStore(':memory:');
  upsertCold(db, { slug: 'hot-cold', title: 'HC', body: 'dormant but queried', trig: 'hot cold' });

  // pure candidate finder
  const cands = findRepromotionCandidates(db, { ledgerFile, minUse: 3 });
  assert.deepEqual(cands.map((c) => c.slug), ['hot-cold']);

  const calls = [];
  const r = await runSubconsciousPass({
    root, ledgerFile, nowMs: now, execute: true, coldDb: db, repromotionMinUse: 3, log: NOOP,
    propose: (e, o) => { calls.push({ e, o }); return { ok: true }; },
    listProposals: () => ({ proposals: [] }),
  });
  assert.equal(calls.length, 1, 'exactly one re-promotion proposal');
  assert.ok(calls[0].e.tags.includes('hot-cold'), 'proposal tagged with the slug');
  assert.equal(calls[0].o.record, true, 'recorded as a pending proposal');
  assert.deepEqual(r.proposed.map((p) => p.slug), ['hot-cold']);
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('re-promotion dedups against an already-pending proposal (no daily spam)', async () => {
  const now = 500 * DAY;
  const root = tmpRoot();
  const ledgerFile = path.join(root, 'ledger.jsonl');
  fs.writeFileSync(ledgerFile, [1, 2, 3, 4].map((i) => JSON.stringify({ t: now - i * DAY, slug: 'hot-cold', event: 'recall' })).join('\n') + '\n');
  const db = openColdStore(':memory:');
  upsertCold(db, { slug: 'hot-cold', title: 'HC', body: 'dormant but queried', trig: 'hot cold' });

  const calls = [];
  await runSubconsciousPass({
    root, ledgerFile, nowMs: now, execute: true, coldDb: db, repromotionMinUse: 3, log: NOOP,
    propose: (e, o) => { calls.push({ e, o }); return { ok: true }; },
    listProposals: () => ({ proposals: [{ status: 'pending', tags: ['cold-repromotion', 'hot-cold'] }] }),
  });
  assert.equal(calls.length, 0, 'already-pending slug is skipped');
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('fsrs.rFloor is a LIVE knob — it steers the demote threshold (not a dead config key)', async () => {
  const now = 100 * DAY;
  const root = tmpRoot();
  writeMem(root, 'mid.md', 'name: mid\ntier: working', 'mid retrievability', now - 10 * DAY); // R≈0.75
  const hi = await runSubconsciousPass({ root, nowMs: now, execute: false, log: NOOP, fsrs: { rFloor: 0.99 } });
  const lo = await runSubconsciousPass({ root, nowMs: now, execute: false, log: NOOP, fsrs: { rFloor: 0.01 } });
  assert.equal(hi.demoteCandidates, 1, 'a high retrievability floor demotes the mid-retrievability memory');
  assert.equal(lo.demoteCandidates, 0, 'a low floor keeps it — the fsrs knob flows through to evaluateRetention');
  fs.rmSync(root, { recursive: true, force: true });
});

test('importing the consolidator never created the real cold store (inert guarantee)', () => {
  assert.ok(!fs.existsSync(COLD_DB_PATH), 'real memory-cold.db must not exist from tests');
});
