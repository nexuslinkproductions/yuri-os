// End-to-end integration for the subconscious memory loop (L5b–L8 composed).
// Proves the full cycle on SEEDED TEMP data — never touches the real stores:
//   demote (consolidator/relocator) → cold store → recall (cue surfaces it + bumps ledger)
//   → re-promotion candidate (recall pressure) → promoteHot (byte-identical restore).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSubconsciousPass, findRepromotionCandidates } from './kagami-memory-consolidator.mjs';
import { recall } from './yuri-recall.mjs';
import { promoteHot } from './memory-relocator.mjs';
import { openColdStore, getCold } from './memory-cold-store.mjs';
import { buildUsageIndex } from './memory-usage.mjs';

const DAY = 86400000;

test('demote → recall → re-promote: the full subconscious loop, reversible', async () => {
  const now = 500 * DAY;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
  const ledgerFile = path.join(root, 'ledger.jsonl');
  const db = openColdStore(':memory:');

  // Seed: one fresh memory (must survive) + one decayed memory (must demote). Bodies carry
  // distinctive cue terms so BM25 recall can find the demoted one, AND enough lexical mass to
  // clear the Wave-0 quality floor (MIN_QUALITY_BYTES=80 — a sub-floor body is pinned
  // fully-decayed regardless of mtime, so a too-short "fresh" seed would false-demote).
  const freshBody = '---\nname: fresh-note\ntier: semantic\n---\nActive recent guidance still in use across the current sprint: routing heuristics, lane health, and the live operating model that the operator relies on right now.\n';
  const oldBody = '---\nname: quantum-note\ntier: working\n---\nQuantum entanglement teleportation protocol notes covering Bell-state measurement, classical channel correction, and the no-cloning constraints that bound the fidelity of the transferred qubit state.\n';
  fs.writeFileSync(path.join(root, 'fresh-note.md'), freshBody);
  const oldPath = path.join(root, 'quantum-note.md');
  fs.writeFileSync(oldPath, oldBody);
  const oldStamp = new Date(now - 400 * DAY);
  fs.utimesSync(oldPath, oldStamp, oldStamp);            // 400 days idle → R well below floor

  // 1) DEMOTE — consolidator execute pass relocates the decayed memory into cold (reversible move).
  // fsrs.redundancyFloor:0 = the pure-FSRS A/B baseline switch (MEM-02). This e2e proves the
  // reversible I/O LOOP (demote→cold→recall→promote), not the redundancy policy: a single unique
  // stale memory is IRREDUCIBLE-given-rest and the two-axis path would (correctly) PROTECT it, so
  // the baseline switch isolates the R-axis to exercise the round-trip machinery deterministically.
  const pass = await runSubconsciousPass({
    root, ledgerFile, nowMs: now, execute: true, coldDb: db, log: () => {},
    fsrs: { redundancyFloor: 0, supersessionPenaltyDays: 0 },
    propose: () => ({ ok: true }), listProposals: () => ({ proposals: [] }),
  });
  assert.equal(pass.relocation.demoted, 1, 'exactly the decayed memory demoted');
  assert.ok(fs.existsSync(path.join(root, 'fresh-note.md')), 'fresh memory stays active');
  assert.ok(!fs.existsSync(oldPath), 'decayed memory moved out of active root');
  assert.ok(fs.existsSync(path.join(root, 'relocated', 'quantum-note.md')), 'reversible relocated/ copy');
  assert.ok(getCold(db, 'quantum-note'), 'decayed memory now lives in the cold store');

  // 2) RECALL — a cue surfaces the dormant trace from cold AND bumps the ledger (testing effect).
  let surfaced;
  for (let i = 0; i < 3; i++) {
    surfaced = recall('quantum entanglement teleportation', { coldDb: db, ledgerFile, nowMs: now + i });
  }
  assert.ok(surfaced.some((r) => r.slug === 'quantum-note'), 'cue recalls the demoted memory');
  assert.equal(buildUsageIndex({ ledgerFile })['quantum-note'].useCount, 3, 'each recall bumped the ledger');

  // 3) RE-PROMOTION CANDIDATE — recall pressure (useCount ≥ minUse) on a cold slug surfaces it.
  const cands = findRepromotionCandidates(db, { ledgerFile, minUse: 3 });
  assert.deepEqual(cands.map((c) => c.slug), ['quantum-note'], 'recalled cold slug is a re-promotion candidate');

  // 4) PROMOTE — restore byte-identical to the active root, clear from cold (reversibility proven).
  const res = promoteHot('quantum-note', { coldDb: db, root, nowMs: now });
  assert.ok(res.ok, 'promoteHot succeeded');
  const restored = fs.readFileSync(path.join(root, 'quantum-note.md'), 'utf8');
  assert.equal(restored, oldBody, 'restored body is byte-identical to the original');
  assert.equal(getCold(db, 'quantum-note'), null, 'cleared from cold after promotion');

  db.close();
  fs.rmSync(root, { recursive: true, force: true });
});
