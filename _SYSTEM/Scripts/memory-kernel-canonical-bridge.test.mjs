// _SYSTEM/Scripts/memory-kernel-canonical-bridge.test.mjs
// Track-A -> canonical bridge. node:test + node:assert. drainOnce needs a lease, so run with an isolated leases dir:
//   YURI_NANO_LEASES_DIR=$(mktemp -d) node --test _SYSTEM/Scripts/memory-kernel-canonical-bridge.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { drainOnce, loadCanonical, shardPath } from './memory-canonical-store.mjs';
import { syncLedgerToCanonical, ledgerEntryToClaim, MEM_SUBJECT_PREFIX, BRIDGE_LANE } from './memory-kernel-canonical-bridge.mjs';

const mk = () => mkdtempSync(path.join(tmpdir(), 'mkcb-'));
const entry = (o) => ({ timestamp: '2026-06-14T00:00:00.000Z', originLane: 'codex', ...o });
function writeLedger(dir, entries) {
  const p = path.join(dir, 'ledger.jsonl');
  writeFileSync(p, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return p;
}

// realistic MIXED ledger: lane_output audit noise + real operator-approved promotions + non-canonical edge cases
const LEDGER = [
  entry({ type: 'lane_output', lane: 'qwen-local', content: 'lane qwen-local completed', contentSha256: 'noise1', via: 'llm-lane' }),
  entry({ type: 'lane_output', lane: 'mimo', content: 'lane mimo completed', contentSha256: 'noise2', via: 'llm-lane' }),
  entry({ type: 'rule', scope: 'project', content: 'Claude reset workflow: warm-start then choose model.', contentSha256: 'sha-rule-1' }),
  entry({ type: 'feedback', scope: 'permanent', content: 'YURI strategic thesis = governed autonomy substrate.', contentSha256: 'sha-fb-1' }),
  entry({ type: 'evidence', scope: 'permanent', content: 'Jan = Jan-Erich Meister, YURI collaborator.', contentSha256: 'sha-ev-1' }),
  entry({ type: 'feedback', scope: 'session', content: 'ephemeral session note', contentSha256: 'sha-sess-1' }), // session scope -> excluded
  entry({ type: 'rule', scope: 'project', content: '', contentSha256: 'sha-empty' }),                              // no content -> excluded
];
// canonical-worthy = exactly 3: rule(project) + feedback(permanent) + evidence(permanent)

test('ledgerEntryToClaim: selects promoted memory types, rejects audit noise / session / empty', () => {
  assert.ok(ledgerEntryToClaim(LEDGER[2]));            // rule/project
  assert.ok(ledgerEntryToClaim(LEDGER[3]));            // feedback/permanent
  assert.equal(ledgerEntryToClaim(LEDGER[0]), null);  // lane_output noise
  assert.equal(ledgerEntryToClaim(LEDGER[5]), null);  // session scope
  assert.equal(ledgerEntryToClaim(LEDGER[6]), null);  // empty content
  const c = ledgerEntryToClaim(LEDGER[2]);
  assert.equal(c.subject, MEM_SUBJECT_PREFIX + 'sha-rule-1');
  assert.equal(c.predicate, 'rule');
  assert.equal(c.object.content, LEDGER[2].content);
});

test('sync selects only the 3 canonical-worthy entries; dryRun emits nothing', () => {
  const dir = mk();
  const ledgerPath = writeLedger(dir, LEDGER);
  const plan = syncLedgerToCanonical({ dir, ledgerPath, dryRun: true });
  assert.equal(plan.scanned, 7);
  assert.equal(plan.selected, 3);
  assert.equal(plan.emitted, 0);
  assert.equal(plan.skipped, 4);                       // 2 lane_output + 1 session + 1 empty
  rmSync(dir, { recursive: true, force: true });
});

test('armed sync emits 3; drain surfaces them in canonical with correct triples', () => {
  const dir = mk();
  const ledgerPath = writeLedger(dir, LEDGER);
  const r = syncLedgerToCanonical({ dir, ledgerPath });
  assert.equal(r.emitted, 3);
  assert.equal(drainOnce('t', { dir }).ok, true);
  const mem = loadCanonical({ dir }).filter((c) => c.provenance?.lane === BRIDGE_LANE);
  assert.equal(mem.length, 3);
  const ev = mem.find((c) => c.subject === MEM_SUBJECT_PREFIX + 'sha-ev-1');
  assert.ok(ev && ev.object.content.includes('Jan-Erich Meister'), 'evidence claim present with full content');
  assert.equal(ev.predicate, 'evidence');
  rmSync(dir, { recursive: true, force: true });
});

test('idempotent: re-sync emits 0 (pending-guard AND canonical-guard), shard never bloats', () => {
  const dir = mk();
  const ledgerPath = writeLedger(dir, LEDGER);
  syncLedgerToCanonical({ dir, ledgerPath });
  const sp = shardPath(BRIDGE_LANE, 'track-a-bridge', { dir });
  const size1 = readFileSync(sp, 'utf8').length;
  // re-sync BEFORE drain — the shard-pending guard catches all 3
  const r2 = syncLedgerToCanonical({ dir, ledgerPath });
  assert.equal(r2.emitted, 0);
  assert.equal(r2.alreadyPresent, 3);
  assert.equal(readFileSync(sp, 'utf8').length, size1, 'no shard bloat pre-drain');
  // re-sync AFTER drain — the canonical guard catches all 3
  drainOnce('t', { dir });
  const r3 = syncLedgerToCanonical({ dir, ledgerPath });
  assert.equal(r3.emitted, 0);
  assert.equal(readFileSync(sp, 'utf8').length, size1, 'no shard bloat post-drain');
  rmSync(dir, { recursive: true, force: true });
});

test('oversized content counted tooLarge, never throws; normal entries still emit', () => {
  const dir = mk();
  const big = entry({ type: 'rule', scope: 'project', content: 'x'.repeat(5000), contentSha256: 'sha-big' });
  const ledgerPath = writeLedger(dir, [LEDGER[2], big]);
  const r = syncLedgerToCanonical({ dir, ledgerPath });
  assert.equal(r.emitted, 1);
  assert.equal(r.tooLarge, 1);
  rmSync(dir, { recursive: true, force: true });
});
