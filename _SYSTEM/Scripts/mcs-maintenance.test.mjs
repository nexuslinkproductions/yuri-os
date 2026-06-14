// _SYSTEM/Scripts/mcs-maintenance.test.mjs
// Maintenance beat (sync -> drain -> optional sweep). drainOnce needs a lease -> isolated leases dir:
//   YURI_NANO_LEASES_DIR=$(mktemp -d) node --test _SYSTEM/Scripts/mcs-maintenance.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { maintenanceCycle } from './mcs-maintenance.mjs';
import { loadCanonical } from './memory-canonical-store.mjs';
import { resolveBackupDir } from './mcs-persistence-sweep.mjs';

const mk = () => mkdtempSync(path.join(tmpdir(), 'mcs-maint-'));
function writeLedger(dir) {
  const p = path.join(dir, 'ledger.jsonl');
  writeFileSync(p, [
    { timestamp: '2026-06-14T00:00:00.000Z', type: 'lane_output', lane: 'x', content: 'noise', contentSha256: 'n1' },
    { timestamp: '2026-06-14T00:00:00.000Z', type: 'rule', scope: 'project', content: 'a canonical rule', contentSha256: 'sha-r', originLane: 'codex' },
    { timestamp: '2026-06-14T00:00:00.000Z', type: 'feedback', scope: 'permanent', content: 'a canonical feedback', contentSha256: 'sha-f', originLane: 'codex' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  return p;
}

test('one beat: syncs Track-A + drains -> facts land canonical; never throws', () => {
  const dir = mk();
  const ledgerPath = writeLedger(dir);
  const r = maintenanceCycle('m1', { dir, ledgerPath });
  assert.equal(r.sync.emitted, 2);          // rule + feedback (noise skipped)
  assert.equal(r.drain.ok, true);
  assert.equal(r.drain.folded, 2);
  assert.equal(loadCanonical({ dir }).filter((c) => c.provenance?.lane === 'yuri-memory').length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('second beat is idempotent: emits 0, folds 0', () => {
  const dir = mk();
  const ledgerPath = writeLedger(dir);
  maintenanceCycle('m1', { dir, ledgerPath });
  const r2 = maintenanceCycle('m1', { dir, ledgerPath });
  assert.equal(r2.sync.emitted, 0);
  assert.equal(r2.drain.folded, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('sweep is OFF by default, ON when opts.sweep:true', () => {
  const dir = mk();
  const ledgerPath = writeLedger(dir);
  const off = maintenanceCycle('m1', { dir, ledgerPath });
  assert.equal(off.sweep, undefined);                 // not run
  const on = maintenanceCycle('m2', { dir, ledgerPath, sweep: true });
  assert.equal(on.sweep.wrote, true);                 // armed snapshot written
  assert.ok(existsSync(resolveBackupDir({ dir })));
  rmSync(dir, { recursive: true, force: true });
});
