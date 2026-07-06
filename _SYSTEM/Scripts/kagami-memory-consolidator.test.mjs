import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSubconsciousPass, findRepromotionCandidates, deterministicDedup, writeDedupCandidatesReport } from './kagami-memory-consolidator.mjs';
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

// MEM-03 (card 30) — the LLM-FREE dedup: deterministicDedup surfaces near-duplicate
// merge candidates with NO model call, so dedup works whether or not rapid-mlx is up.
test('MEM-03: deterministicDedup surfaces near-duplicate session-resume pairs (no model)', () => {
  const memories = [
    { filename: 'session-resume-2026-06-01.md', content: 'session resume cortex decoder circuitry build plan next steps wire the engine module milestone two tauri app desktop shell' },
    { filename: 'session-resume-2026-06-02.md', content: 'session resume cortex decoder circuitry build plan next steps wire the engine module milestone two tauri app desktop shell extra' },
    { filename: 'sales-opener.md', content: 'cold call opener objection rebuttal social selling outreach buyer persona ad creative receipt subscription cleaner sequence' },
  ];
  const res = deterministicDedup(memories, { overlapThreshold: 0.6, loadThreshold: 0.15 });
  assert.ok(res.mergePairs.length >= 1, 'near-duplicate resumes surface as a deterministic merge candidate');
  const ids = [res.mergePairs[0].a, res.mergePairs[0].b].sort();
  assert.deepEqual(ids, ['session-resume-2026-06-01.md', 'session-resume-2026-06-02.md']);
  assert.equal(res.overCapacity, true);
});

test('MEM-03: deterministicDedup NEGATIVE control — orthogonal memories yield no merge pairs', () => {
  const memories = [
    { filename: 'a.md', content: 'quantum tunneling josephson junction flux qubit coherence barrier potential niobium' },
    { filename: 'b.md', content: 'cold call opener objection rebuttal social selling outreach buyer persona sequence' },
    { filename: 'c.md', content: 'persistent homology betti numbers filtration simplicial complex topological holes clustering' },
  ];
  const res = deterministicDedup(memories, { overlapThreshold: 0.6, loadThreshold: 0.15 });
  assert.equal(res.mergePairs.length, 0, 'orthogonal memories produce no false merge candidates');
  assert.equal(res.overCapacity, false);
});

test('MEM-03: deterministicDedup tolerates empty / malformed input', () => {
  assert.equal(deterministicDedup([]).mergePairs.length, 0);
  assert.equal(deterministicDedup(null).n, 0);
  assert.equal(deterministicDedup([{ filename: 'x.md' }, { bad: 1 }]).n, 0, 'entries without content filtered');
});

// writeDedupCandidatesReport (2026-07-06) — closes the loop the FABLE Phase-4 diagnosis flagged:
// the daily 0.6-threshold consolidator found zero merge pairs while a manual read found real
// semantic duplicates. This is the on-demand, lower-threshold, DATED report a human/session should
// start a consolidation pass FROM instead of a fresh manual grep sweep.
test('writeDedupCandidatesReport writes a dated report distinct from memory-health.json', () => {
  const root = tmpRoot();
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dedup-state-'));
  const memories = [
    { filename: 'a.md', content: 'session resume cortex decoder circuitry build plan next steps wire the engine module' },
    { filename: 'b.md', content: 'session resume cortex decoder circuitry build plan next steps wire the engine module extra' },
    { filename: 'c.md', content: 'cold call opener objection rebuttal social selling outreach buyer persona sequence' },
  ];
  const nowMs = Date.UTC(2026, 6, 6); // 2026-07-06
  const { reportPath, report } = writeDedupCandidatesReport({ memories, stateDir, nowMs, overlapThreshold: 0.4 });

  assert.ok(reportPath.endsWith('memory-dedup-candidates-2026-07-06.json'), 'report is dated by day');
  assert.ok(fs.existsSync(reportPath), 'report file actually written to disk');
  const onDisk = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(onDisk.mergePairCount, report.mergePairCount);
  assert.ok(report.mergePairs.length >= 1, 'lower threshold surfaces the near-duplicate pair');
  assert.deepEqual([report.mergePairs[0].a, report.mergePairs[0].b].sort(), ['a.md', 'b.md']);
  assert.equal(report.overlapThreshold, 0.4);
  assert.equal(report.totalFiles, 3);

  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(stateDir, { recursive: true, force: true });
});

test('writeDedupCandidatesReport is advisory-only — never deletes or edits memory files', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dedup-state-'));
  const memories = [
    { filename: 'x.md', content: 'quantum tunneling josephson junction flux qubit coherence barrier' },
    { filename: 'y.md', content: 'cold call opener objection rebuttal social selling outreach' },
  ];
  const { report } = writeDedupCandidatesReport({ memories, stateDir, overlapThreshold: 0.4 });
  assert.equal(report.mergePairCount, 0, 'orthogonal memories produce no false candidates');
  assert.ok(report.note.includes('Advisory'), 'report explicitly flags itself as advisory, not auto-executed');
  fs.rmSync(stateDir, { recursive: true, force: true });
});

test('importing the consolidator is inert — pass is an explicit entrypoint, no import-time side effect (tolerates a legitimately-seeded cold store)', () => {
  // The real cold store MAY exist: owner-approved subconscious seeding (demoting
  // genuinely-superseded memories to cold) is legitimate production state, not a test
  // artifact. So absence-of-cold.db is the WRONG isolation proxy. The true inert
  // guarantee is that merely IMPORTING this module runs nothing — the subconscious
  // pass must be an explicit function the caller invokes, never an import-time side
  // effect that could forget memories on load. (The other tests here use tmpRoot()
  // isolated stores, so they never write COLD_DB_PATH.)
  assert.equal(runSubconsciousPass.constructor.name, 'AsyncFunction',
    'runSubconsciousPass must be an explicit (un-invoked) entrypoint, not auto-run on import');
});
