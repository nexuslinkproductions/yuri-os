// _SYSTEM/Scripts/mcs-fold-mutation-sweep.test.mjs
// Grey-zone sweep gate for the canonical store fold. node:test + node:assert. The ANTI-DRIFT cross-check needs a
// real temp store (drainOnce acquires the drain lease):
//   YURI_NANO_LEASES_DIR=$(mktemp -d) node --test _SYSTEM/Scripts/mcs-fold-mutation-sweep.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendClaim, drainOnce, loadCanonical, readView, keyOf } from './memory-canonical-store.mjs';
import { fold, runSweep, PROBES } from './mcs-fold-mutation-sweep.mjs';

const mk = () => mkdtempSync(path.join(tmpdir(), 'mcs-ms-'));

test('reference fold passes EVERY invariant — the oracle gate is non-vacuous', () => {
  assert.equal(runSweep().referencePasses, true, 'a faithful fold must satisfy all invariant oracles');
});

test('every planted mutant is KILLED — the invariants are not vacuous (100% mutation score, zero grey survivors)', () => {
  const r = runSweep();
  assert.equal(r.survivors.length, 0, `no grey survivors (got: ${r.survivors.map((s) => s.mutation).join(', ')})`);
  assert.equal(r.killed, r.total, `all ${r.total} mutants killed (score ${(r.score * 100).toFixed(0)}%)`);
});

// THE ANTI-DRIFT GUARD: the sweep's reference fold is a mirror of the closed foldCanonical. If it drifts (e.g. a
// separator or rule mismatch — exactly the space-vs-NUL keyOf bug), the whole sweep is invalid. So pin it to the
// REAL store: append each probe's events, drain, and assert the real winners + contested keys equal the reference.
test('anti-drift: reference fold == the REAL store (appendClaim+drainOnce) on every probe', () => {
  for (const probe of PROBES) {
    const dir = mk();
    for (const e of probe.events) {
      appendClaim(e.provenance.lane, e.provenance.lane,
        { kind: e.kind, subject: e.subject, predicate: e.predicate, object: e.object, supersedes: e.supersedes }, { dir });
    }
    drainOnce('d', { dir });
    const realWinners = new Map(loadCanonical({ dir }).map((c) => [keyOf(c), c.object]));
    const realContested = Object.keys(readView({ dir }).contested).sort();
    const ref = fold(probe.events);
    const refWinners = new Map([...ref.byKey].map(([k, e]) => [k, e.object]));
    const refContested = [...ref.contested.keys()].sort();
    assert.deepEqual([...realWinners].sort(), [...refWinners].sort(), `winners match real store on probe '${probe.name}'`);
    assert.deepEqual(realContested, refContested, `contested keys match real store on probe '${probe.name}'`);
    rmSync(dir, { recursive: true, force: true });
  }
});
