#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import Database from '../backend/node_modules/better-sqlite3/lib/index.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'yuri-canonical-memory-import.mjs');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-canonical-memory-import-test-'));

try {
  const runRoot = path.join(tempRoot, 'run');
  fs.mkdirSync(runRoot, { recursive: true });
  const dbPath = path.join(tempRoot, 'memory.db');
  const gatePath = path.join(runRoot, 'claim-promotion-gate.json');
  fs.writeFileSync(gatePath, JSON.stringify({
    schema_version: 1,
    advisory_only: true,
    local_truth_claim: true,
    policy: 'Only claims passing this gate may be considered canonical memory candidates. Raw source prose remains tainted.',
    claims: [
      {
        claim_id: 'claim-eligible-a',
        text: 'Codex non-interactive execution supports schema-constrained output for repeatable pipelines. RAW_SHOULD_NOT_APPEAR',
        classification: 'verified_fact_candidate',
        support_score: 0.82,
        matched_terms: ['codex', 'schema', 'output'],
        canonical_memory_gate: 'eligible_for_canonical_memory_candidate',
        blockers: [],
        content_sha256: 'a'.repeat(64),
        verification_method: 'test_fixture',
        source_file: '/tmp/source.md',
        source_line: 10,
        promotion_requirements: ['human approve claim text', 'write sanitized canonical summary, not raw source prose'],
        reference: {
          id: 'ref-a',
          normalized_href: 'https://developers.openai.com/codex/noninteractive',
          href: 'https://developers.openai.com/codex/noninteractive',
          tier: 'P0',
          resolution_precision: 'exact',
        },
      },
      {
        claim_id: 'claim-eligible-b',
        text: 'Codex non-interactive execution supports schema-constrained output for repeatable pipelines. RAW_SHOULD_NOT_APPEAR',
        classification: 'verified_fact_candidate',
        support_score: 0.82,
        matched_terms: ['codex', 'schema', 'output'],
        canonical_memory_gate: 'eligible_for_canonical_memory_candidate',
        blockers: [],
        content_sha256: 'b'.repeat(64),
        verification_method: 'test_fixture',
        source_file: '/tmp/source.md',
        source_line: 11,
        promotion_requirements: ['human approve claim text', 'write sanitized canonical summary, not raw source prose'],
        reference: {
          id: 'ref-b',
          normalized_href: 'https://developers.openai.com/codex/noninteractive',
          href: 'https://developers.openai.com/codex/noninteractive',
          tier: 'P0',
          resolution_precision: 'exact',
        },
      },
      {
        claim_id: 'claim-blocked',
        text: 'Blocked claim must not be imported.',
        classification: 'risk',
        canonical_memory_gate: 'blocked_from_canonical_memory',
        blockers: ['support_score_below_0_35'],
        promotion_requirements: ['resolve blockers before promotion'],
        reference: {
          normalized_href: 'https://example.com/blocked',
          tier: 'P0',
        },
      },
    ],
  }, null, 2));

  const dryRun = JSON.parse(execFileSync(
    process.execPath,
    [script, 'import', '--run-root', runRoot, '--db', dbPath, '--dry-run'],
    { encoding: 'utf8' },
  ));
  assert.equal(dryRun.mode, 'dry-run', 'dry-run mode mismatch');
  assert.equal(dryRun.enforcement_ok, true, 'dry-run must pass truth-promotion enforcement');
  assert.equal(dryRun.operator_approved, false, 'dry-run must not imply operator approval');
  assert(fs.existsSync(dryRun.truth_promotion_enforcement), 'truth-promotion enforcement report missing');
  assert.equal(dryRun.record_count, 2, 'dry-run should include eligible records only');
  assert.equal(fs.existsSync(dbPath), false, 'dry-run should not create the memory db');

  const blockedApply = spawnSync(
    process.execPath,
    [script, 'import', '--run-root', runRoot, '--db', dbPath],
    { encoding: 'utf8' },
  );
  assert.notEqual(blockedApply.status, 0, 'live import without operator approval must be blocked');
  assert.match(blockedApply.stderr, /canonical_memory_write_requires_operator_approved_flag/, 'operator approval blocker missing');
  assert.equal(fs.existsSync(dbPath), false, 'blocked live import should not create the memory db');

  const protectedRunRoot = spawnSync(
    process.execPath,
    [script, 'import', '--run-root', path.join(tempRoot, '.env'), '--db', dbPath, '--dry-run'],
    { encoding: 'utf8' },
  );
  assert.notEqual(protectedRunRoot.status, 0, 'protected run root must be refused');
  assert.match(protectedRunRoot.stderr, /PROTECTED_SURFACE_ACCESS_DENIED/, 'protected run root error missing');

  const protectedDb = spawnSync(
    process.execPath,
    [script, 'import', '--run-root', runRoot, '--db', path.join(tempRoot, '.env'), '--dry-run'],
    { encoding: 'utf8' },
  );
  assert.notEqual(protectedDb.status, 0, 'protected db path must be refused');
  assert.match(protectedDb.stderr, /PROTECTED_SURFACE_ACCESS_DENIED/, 'protected db error missing');

  const applied = JSON.parse(execFileSync(
    process.execPath,
    [script, 'import', '--run-root', runRoot, '--db', dbPath, '--operator-approved'],
    { encoding: 'utf8' },
  ));
  assert.equal(applied.mode, 'apply', 'apply mode mismatch');
  assert.equal(applied.enforcement_ok, true, 'apply must pass truth-promotion enforcement');
  assert.equal(applied.operator_approved, true, 'apply must record explicit operator approval');
  assert.equal(applied.claim_mappings, 2, 'apply should map both eligible claims');
  assert.equal(applied.active_memory_items, 1, 'duplicate sanitized content should share one memory item');
  assert.equal(applied.event_mappings, 2, 'duplicate claims should still create mapping events');
  assert.equal(applied.sqlite_integrity_check, 'ok', 'sqlite integrity should pass');
  assert(fs.existsSync(applied.backup), 'pre-write backup missing');

  const db = new Database(dbPath);
  const itemCount = db.prepare("SELECT COUNT(*) AS c FROM memory_items WHERE source_kind='proving_run_claim_gate'").get().c;
  assert.equal(itemCount, 1, 'only one deduped governed item should exist');
  const eventCount = db.prepare("SELECT COUNT(*) AS c FROM memory_events WHERE operation='canonical_import_mapping'").get().c;
  assert.equal(eventCount, 2, 'claim-to-item event mapping count mismatch');
  const stored = db.prepare("SELECT content, status, sensitivity FROM memory_items WHERE source_kind='proving_run_claim_gate'").get();
  assert.equal(stored.status, 'active', 'stored item should be active');
  assert.equal(stored.sensitivity, 'internal', 'stored item should not be secret');
  assert.equal(stored.content.includes('RAW_SHOULD_NOT_APPEAR'), false, 'raw source marker leaked into memory content');
  const nonCanonicalItemId = db.prepare(`
    INSERT INTO memory_items (
      content,
      canonical_summary,
      memory_type,
      source_kind,
      tags,
      content_hash
    ) VALUES (?, ?, 'research', 'manual_note', '[]', ?)
  `).run(
    'Manual memory item must survive canonical rollback.',
    'Manual memory item must survive canonical rollback.',
    'c'.repeat(64),
  ).lastInsertRowid;
  db.close();

  const eventMapPath = path.join(runRoot, 'canonical-memory-gated-import-event-map.json');
  const eventMap = JSON.parse(fs.readFileSync(eventMapPath, 'utf8'));
  eventMap.events.push({
    claim_id: 'claim-rogue-non-canonical',
    active_memory_item_id: nonCanonicalItemId,
    event_id: 999999,
  });
  eventMap.event_count = eventMap.events.length;
  fs.writeFileSync(eventMapPath, `${JSON.stringify(eventMap, null, 2)}\n`);

  const rollbackDryRun = JSON.parse(execFileSync(
    process.execPath,
    [script, 'rollback', '--run-root', runRoot, '--db', dbPath, '--dry-run'],
    { encoding: 'utf8' },
  ));
  assert.equal(rollbackDryRun.mode, 'dry-run', 'rollback dry-run mode mismatch');
  assert.equal(rollbackDryRun.items_to_tombstone, 1, 'rollback dry-run should target imported item');
  assert.equal(rollbackDryRun.skipped_items.length, 1, 'rollback dry-run should skip non-canonical item');
  assert.equal(rollbackDryRun.skipped_items[0].reason, 'source_kind_not_eligible:manual_note', 'non-canonical skip reason mismatch');
  assert.equal(rollbackDryRun.events_to_mark, 3, 'rollback dry-run should record all mapping events');
  assert(fs.existsSync(path.join(runRoot, 'canonical-memory-rollback-plan.json')), 'rollback plan json missing');
  assert(fs.existsSync(path.join(runRoot, 'canonical-memory-rollback-plan.md')), 'rollback plan markdown missing');

  const rollback = JSON.parse(execFileSync(
    process.execPath,
    [script, 'rollback', '--run-root', runRoot, '--db', dbPath],
    { encoding: 'utf8' },
  ));
  assert.equal(rollback.mode, 'apply', 'rollback mode mismatch');
  assert.equal(rollback.items_tombstoned, 1, 'rollback should tombstone imported item');
  assert.equal(rollback.skipped_items.length, 1, 'rollback should report skipped non-canonical item');
  const dbAfterRollback = new Database(dbPath);
  const activeAfterRollback = dbAfterRollback.prepare("SELECT COUNT(*) AS c FROM memory_items WHERE source_kind='proving_run_claim_gate' AND status='active'").get().c;
  assert.equal(activeAfterRollback, 0, 'rollback should leave no active imported items');
  const nonCanonicalStatus = dbAfterRollback.prepare('SELECT status FROM memory_items WHERE id=?').get(nonCanonicalItemId).status;
  assert.equal(nonCanonicalStatus, 'active', 'rollback must not tombstone non-proving_run_claim_gate memory');
  const rollbackEvents = dbAfterRollback.prepare("SELECT COUNT(*) AS c FROM memory_events WHERE operation='canonical_import_rollback'").get().c;
  assert.equal(rollbackEvents, 1, 'rollback event missing');
  dbAfterRollback.close();

  process.stdout.write('yuri-canonical-memory-import: pass\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
