#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const defaultDb = path.join(repoRoot, '_SYSTEM', 'OS_KERNEL', 'memory.db');
const usage = [
  'Usage:',
  '  node Scripts/yuri-canonical-memory-import.mjs import --run-root dir [--db file] [--dry-run]',
  '  node Scripts/yuri-canonical-memory-import.mjs rollback --run-root dir [--db file] [--dry-run]',
].join('\n');

const [command, ...argv] = process.argv.slice(2);

try {
  if (command === 'import') {
    const options = parseArgs(argv);
    writeJson(runImport(options));
  } else if (command === 'rollback') {
    const options = parseArgs(argv);
    writeJson(runRollback(options));
  } else {
    throw new Error(usage);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function parseArgs(args) {
  const options = { runRoot: '', db: defaultDb, dryRun: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--run-root') options.runRoot = path.resolve(requireValue(args, ++index, '--run-root'));
    else if (arg === '--db') options.db = path.resolve(requireValue(args, ++index, '--db'));
    else if (arg === '--dry-run') options.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}\n${usage}`);
  }
  if (!options.runRoot) throw new Error(`--run-root is required\n${usage}`);
  return options;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function runImport(options) {
  const runRoot = options.runRoot;
  const gatePath = path.join(runRoot, 'claim-promotion-gate.json');
  if (!fs.existsSync(gatePath)) throw new Error(`Missing promotion gate: ${gatePath}`);
  const gate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
  const records = buildImportRecords(gate, runRoot);
  const batchPath = path.join(runRoot, 'canonical-memory-gated-import-batch.json');
  const batch = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_gate: gatePath,
    db_path: options.db,
    dry_run: options.dryRun,
    record_count: records.length,
    records,
  };
  writeFileJson(batchPath, batch);

  if (options.dryRun) {
    return {
      mode: 'dry-run',
      run_root: runRoot,
      db_path: options.db,
      batch: batchPath,
      record_count: records.length,
      skipped_blocked_claims: blockedClaims(gate).length,
    };
  }

  fs.mkdirSync(path.dirname(options.db), { recursive: true });
  const backupPath = path.join(runRoot, `memory.db.before-canonical-gated-import.${timestampId()}.bak`);
  if (fs.existsSync(options.db)) fs.copyFileSync(options.db, backupPath);
  else fs.writeFileSync(backupPath, '');

  const result = runPythonImport({ runRoot, dbPath: options.db, batchPath, backupPath });
  writeFileJson(path.join(runRoot, 'canonical-memory-gated-import-result.json'), result);
  writeFileJson(path.join(runRoot, 'canonical-memory-write-audit.json'), {
    schema_version: 1,
    integrity_check: result.sqlite_integrity_check,
    canonical_memory_write_executed: true,
    source_result: path.join(runRoot, 'canonical-memory-gated-import-result.json'),
    source_event_map: path.join(runRoot, 'canonical-memory-gated-import-event-map.json'),
    claim_mappings: result.claim_mappings,
    active_memory_items: result.active_memory_items,
    event_mappings: result.event_mappings,
    backup: backupPath,
  });
  return result;
}

function runRollback(options) {
  const eventMapPath = path.join(options.runRoot, 'canonical-memory-gated-import-event-map.json');
  if (!fs.existsSync(eventMapPath)) throw new Error(`Missing event map: ${eventMapPath}`);
  const eventMap = JSON.parse(fs.readFileSync(eventMapPath, 'utf8'));
  const itemIds = [...new Set((eventMap.events || []).map((event) => event.active_memory_item_id).filter(Boolean))];
  const plan = buildRollbackPlan({ runRoot: options.runRoot, dbPath: options.db, eventMapPath, eventMap, itemIds });
  writeFileJson(path.join(options.runRoot, 'canonical-memory-rollback-plan.json'), plan);
  fs.writeFileSync(path.join(options.runRoot, 'canonical-memory-rollback-plan.md'), renderRollbackPlan(plan));
  if (options.dryRun) {
    return {
      mode: 'dry-run',
      run_root: options.runRoot,
      db_path: options.db,
      plan: path.join(options.runRoot, 'canonical-memory-rollback-plan.json'),
      items_to_tombstone: itemIds.length,
      events_to_mark: (eventMap.events || []).length,
      item_ids: itemIds,
    };
  }
  const rollback = runPythonRollback({ dbPath: options.db, runRoot: options.runRoot, itemIds, events: eventMap.events || [] });
  writeFileJson(path.join(options.runRoot, 'canonical-memory-rollback-result.json'), rollback);
  return rollback;
}

function buildImportRecords(gate, runRoot) {
  const eligible = (gate.claims || []).filter((claim) => claim.canonical_memory_gate === 'eligible_for_canonical_memory_candidate');
  return eligible.map((claim) => {
    const reference = claim.reference || {};
    const summary = canonicalSummary(claim.text || '');
    return {
      claim_id: claim.claim_id,
      content: summary,
      canonical_summary: summary.slice(0, 280),
      source_uri: reference.normalized_href || reference.href || '',
      source_kind: 'proving_run_claim_gate',
      tags: ['yuri-os', 'proving-run', 'canonical-memory-candidate', claim.classification || 'claim'],
      importance: 3,
      metadata: {
        run_root: runRoot,
        claim_id: claim.claim_id,
        classification: claim.classification || null,
        support_score: claim.support_score || null,
        matched_terms: claim.matched_terms || [],
        reference,
        content_sha256: claim.content_sha256 || null,
        verification_method: claim.verification_method || null,
        source_file: claim.source_file || null,
        source_line: claim.source_line || null,
        raw_source_imported: false,
        sanitized_summary: true,
      },
    };
  });
}

function buildRollbackPlan({ runRoot, dbPath, eventMapPath, eventMap, itemIds }) {
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    mode: 'rollback-plan',
    run_root: runRoot,
    db_path: dbPath,
    source_event_map: eventMapPath,
    rollback_strategy: 'non_destructive_tombstone',
    item_count: itemIds.length,
    event_count: (eventMap.events || []).length,
    item_ids: itemIds,
    invariants: [
      'Only memory_items with source_kind=proving_run_claim_gate are eligible.',
      'Rollback changes status to tombstoned and tier to Tombstone; rows are not deleted.',
      'Rollback appends a canonical_import_rollback memory_events audit row.',
      'SQLite integrity_check must return ok after rollback.',
    ],
  };
}

function renderRollbackPlan(plan) {
  return [
    '# Canonical Memory Rollback Plan',
    '',
    `- Run root: ${plan.run_root}`,
    `- DB path: ${plan.db_path}`,
    `- Strategy: ${plan.rollback_strategy}`,
    `- Items to tombstone: ${plan.item_count}`,
    `- Mapping events covered: ${plan.event_count}`,
    '',
    '## Invariants',
    '',
    ...plan.invariants.map((invariant) => `- ${invariant}`),
    '',
    '## Item IDs',
    '',
    plan.item_ids.length ? plan.item_ids.map((itemId) => `- ${itemId}`).join('\n') : '- none',
    '',
  ].join('\n');
}

function blockedClaims(gate) {
  return (gate.claims || []).filter((claim) => claim.canonical_memory_gate !== 'eligible_for_canonical_memory_candidate');
}

function canonicalSummary(text) {
  const cleaned = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^]+/g, ' ')
    .replace(/RAW_[A-Z0-9_]+/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\|/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const clipped = cleaned.length > 360 ? `${cleaned.slice(0, 357).trim()}...` : cleaned;
  return `Evidence-backed Yuri OS research claim: ${clipped}`;
}

function runPythonImport({ runRoot, dbPath, batchPath, backupPath }) {
  const python = String.raw`
import json, sqlite3, sys
from pathlib import Path
repo = Path(sys.argv[1])
run_root = Path(sys.argv[2])
db_path = sys.argv[3]
batch_path = Path(sys.argv[4])
backup_path = sys.argv[5]
sys.path.insert(0, str(repo / "_SYSTEM" / "OS_KERNEL"))
from memory_governor import append_event, get_conn, governed_write
batch = json.loads(batch_path.read_text())
results = []
for rec in batch["records"]:
    meta = dict(rec["metadata"])
    meta["canonical_import_batch"] = str(batch_path)
    meta["import_backup"] = backup_path
    meta["actor"] = "CODEX"
    item_id = governed_write(
        rec["content"],
        mem_type="research",
        source_agent=None,
        tags=rec["tags"],
        importance=int(rec["importance"]),
        source_uri=rec["source_uri"],
        source_kind=rec["source_kind"],
        metadata=meta,
        db_path=db_path,
    )
    results.append({"claim_id": rec["claim_id"], "active_memory_item_id": item_id, "source_uri": rec["source_uri"]})
events = []
with get_conn(db_path) as conn:
    for row in results:
        event_id = append_event(conn, row["active_memory_item_id"], "write", "canonical_import_mapping", "CODEX", "ok", {
            "run_root": str(run_root),
            "claim_id": row["claim_id"],
            "active_memory_item_id": row["active_memory_item_id"],
            "source_uri": row["source_uri"],
            "source_batch": str(batch_path),
        })
        events.append({"claim_id": row["claim_id"], "active_memory_item_id": row["active_memory_item_id"], "event_id": event_id})
    integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
    active_ids = sorted(set(event["active_memory_item_id"] for event in events))
    if active_ids:
        rows = conn.execute(f"SELECT status, COUNT(*) FROM memory_items WHERE id IN ({','.join('?' for _ in active_ids)}) GROUP BY status", active_ids).fetchall()
        status_counts = {row[0]: row[1] for row in rows}
    else:
        status_counts = {}
(run_root / "canonical-memory-gated-import-event-map.json").write_text(json.dumps({"schema_version": 1, "event_count": len(events), "events": events}, indent=2) + "\n")
print(json.dumps({
    "mode": "apply",
    "run_root": str(run_root),
    "db_path": db_path,
    "batch": str(batch_path),
    "backup": backup_path,
    "claim_mappings": len(results),
    "active_memory_items": status_counts.get("active", 0),
    "status_counts": status_counts,
    "event_mappings": len(events),
    "sqlite_integrity_check": integrity,
    "results": results,
}, indent=2))
`;
  return JSON.parse(execFileSync('python3', ['-c', python, repoRoot, runRoot, dbPath, batchPath, backupPath], { encoding: 'utf8' }));
}

function runPythonRollback({ dbPath, runRoot, itemIds, events }) {
  const payloadPath = path.join(os.tmpdir(), `yuri-rollback-${crypto.randomUUID()}.json`);
  fs.writeFileSync(payloadPath, JSON.stringify({ itemIds, events }, null, 2));
  const python = String.raw`
import json, sqlite3, sys
from pathlib import Path
repo = Path(sys.argv[1])
db_path = sys.argv[2]
run_root = Path(sys.argv[3])
payload = json.loads(Path(sys.argv[4]).read_text())
sys.path.insert(0, str(repo / "_SYSTEM" / "OS_KERNEL"))
from memory_governor import append_event, get_conn
item_ids = payload["itemIds"]
events = payload["events"]
with get_conn(db_path) as conn:
    for item_id in item_ids:
        conn.execute("UPDATE memory_items SET status='tombstoned', tier='Tombstone', updated_at=CURRENT_TIMESTAMP WHERE id=? AND source_kind='proving_run_claim_gate'", (item_id,))
    rollback_event_id = append_event(conn, None, "rollback", "canonical_import_rollback", "CODEX", "ok", {
        "run_root": str(run_root),
        "item_ids": item_ids,
        "event_count": len(events),
    })
    integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
print(json.dumps({
    "mode": "apply",
    "run_root": str(run_root),
    "db_path": db_path,
    "items_tombstoned": len(item_ids),
    "events_marked": len(events),
    "rollback_event_id": rollback_event_id,
    "sqlite_integrity_check": integrity,
}, indent=2))
`;
  try {
    return JSON.parse(execFileSync('python3', ['-c', python, repoRoot, dbPath, runRoot, payloadPath], { encoding: 'utf8' }));
  } finally {
    fs.rmSync(payloadPath, { force: true });
  }
}

function writeFileJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function timestampId() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
