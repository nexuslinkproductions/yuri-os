#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE_DIR = path.join(REPO_ROOT, '_SYSTEM/research-archive/yuri-prompt-engineering-2026-05');
const MANIFEST_PATH = path.join(ARCHIVE_DIR, '00_manifest.md');
const APPROVAL_PATH = path.join(ARCHIVE_DIR, '06_rag_ingestion_approval.md');
const INGEST_REPORT_PATH = path.join(ARCHIVE_DIR, '07_rag_ingested.md');
const NOTEBOOK_STABLE_KEY = 'yuri-os/prompt-engineering-research-2026-05';
const NOTEBOOK_TITLE = 'Yuri Prompt Engineering Research 2026-05';
const EXPECTED_SOURCE_COUNT = 8;
const RAW_DB_PATH = process.env.NUDIMMUD_DB_PATH;
const DB_PATH = RAW_DB_PATH && RAW_DB_PATH !== ':memory:'
  ? path.resolve(REPO_ROOT, RAW_DB_PATH)
  : path.join(REPO_ROOT, 'backend/data/nudimmud.db');

const require = createRequire(import.meta.url);
const Database = require(path.join(REPO_ROOT, 'backend/node_modules/better-sqlite3'));

function readText(absPath, issues) {
  try {
    return fs.readFileSync(absPath, 'utf8');
  } catch (error) {
    issues.push(`unable to read ${path.relative(REPO_ROOT, absPath)}: ${error.message}`);
    return '';
  }
}

function extractField(text, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`^\\*\\*${escaped}\\*\\*:\\s+\`?([^\`\\n]+?)\`?\\s*$`, 'm'),
    new RegExp(`^${escaped}:\\s+\`?([^\`\\n]+?)\`?\\s*$`, 'm')
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function extractNumberField(text, field) {
  const raw = extractField(text, field);
  if (raw == null) return null;
  const match = raw.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function liveCounts(db, notebookId) {
  const sources = db.prepare('SELECT COUNT(*) AS count FROM notebook_sources WHERE notebook_id = ?').get(notebookId);
  const readySources = db.prepare("SELECT COUNT(*) AS count FROM notebook_sources WHERE notebook_id = ? AND status = 'ready'").get(notebookId);
  const chunks = db.prepare(`
    SELECT COUNT(*) AS count
    FROM notebook_chunks nc
    JOIN notebook_sources ns ON ns.id = nc.source_id
    WHERE ns.notebook_id = ?
  `).get(notebookId);
  const embedded = db.prepare(`
    SELECT COUNT(*) AS count
    FROM notebook_chunks nc
    JOIN notebook_sources ns ON ns.id = nc.source_id
    WHERE ns.notebook_id = ?
      AND ns.status = 'ready'
      AND nc.embedding IS NOT NULL
      AND trim(nc.embedding) <> ''
  `).get(notebookId);
  return {
    sources: Number(sources.count),
    readySources: Number(readySources.count),
    chunks: Number(chunks.count),
    embedded: Number(embedded.count)
  };
}

function checkDatabaseHealth(db) {
  return {
    integrityCheck: String(db.pragma('integrity_check', { simple: true }) || 'unknown'),
    quickCheck: String(db.pragma('quick_check', { simple: true }) || 'unknown'),
    foreignKeyViolations: (db.pragma('foreign_key_check') || []).length,
  };
}

function main() {
  const issues = [];
  const manifest = readText(MANIFEST_PATH, issues);
  const approval = readText(APPROVAL_PATH, issues);
  const reportExists = fs.existsSync(INGEST_REPORT_PATH);
  const report = reportExists ? readText(INGEST_REPORT_PATH, issues) : '';

  const manifestAdvisoryOnly = extractField(manifest, 'advisory_only');
  const manifestLocalTruthClaim = extractField(manifest, 'local_truth_claim');
  const approvalStatus = extractField(approval, 'status');
  const approvalStableKey = extractField(approval, 'notebook_stable_key');
  const approvalAdvisoryOnly = extractField(approval, 'advisory_only');
  const approvalLocalTruthClaim = extractField(approval, 'local_truth_claim');

  if (manifestAdvisoryOnly !== 'true') issues.push(`manifest advisory_only is ${manifestAdvisoryOnly ?? 'missing'}, expected true`);
  if (manifestLocalTruthClaim !== 'false') issues.push(`manifest local_truth_claim is ${manifestLocalTruthClaim ?? 'missing'}, expected false`);
  if (approvalStatus !== 'READY_FOR_RAG_AFTER_APPROVAL') issues.push(`approval status is ${approvalStatus ?? 'missing'}, expected READY_FOR_RAG_AFTER_APPROVAL`);
  if (approvalStableKey !== NOTEBOOK_STABLE_KEY) issues.push(`approval stable key is ${approvalStableKey ?? 'missing'}, expected ${NOTEBOOK_STABLE_KEY}`);
  if (approvalAdvisoryOnly !== 'true') issues.push(`approval advisory_only is ${approvalAdvisoryOnly ?? 'missing'}, expected true`);
  if (approvalLocalTruthClaim !== 'false') issues.push(`approval local_truth_claim is ${approvalLocalTruthClaim ?? 'missing'}, expected false`);

  let liveNotebook = null;
  let counts = null;
  let status = 'READY_NOT_INGESTED';
  let database = {
    path: DB_PATH,
    available: false,
    integrityCheck: 'unavailable',
    quickCheck: 'unavailable',
    foreignKeyViolations: -1
  };

  if (reportExists) {
    const reportSourceCount = extractNumberField(report, 'source_count');
    const reportChunkCount = extractNumberField(report, 'chunk_count');
    const reportEmbeddedCount = extractNumberField(report, 'embedded_chunk_count');
    const reportStableKey = extractField(report, 'notebook_stable_key');
    const reportTitle = extractField(report, 'notebook_title');
    if (reportSourceCount !== EXPECTED_SOURCE_COUNT) issues.push(`report source_count is ${reportSourceCount ?? 'missing'}, expected ${EXPECTED_SOURCE_COUNT}`);
    if (reportStableKey !== NOTEBOOK_STABLE_KEY) issues.push(`report stable key is ${reportStableKey ?? 'missing'}, expected ${NOTEBOOK_STABLE_KEY}`);
    if (reportTitle !== NOTEBOOK_TITLE) issues.push(`report title is ${reportTitle ?? 'missing'}, expected ${NOTEBOOK_TITLE}`);

    if (!fs.existsSync(DB_PATH)) {
      issues.push(`live notebook database not found at ${DB_PATH}`);
    } else {
      let db = null;
      try {
        db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
        database = {
          ...database,
          available: true,
          ...checkDatabaseHealth(db)
        };
        if (database.integrityCheck !== 'ok') issues.push(`database integrity_check is ${database.integrityCheck}`);
        if (database.quickCheck !== 'ok') issues.push(`database quick_check is ${database.quickCheck}`);
        if (database.foreignKeyViolations !== 0) issues.push(`database foreign_key_check violations ${database.foreignKeyViolations}`);

        liveNotebook = db.prepare('SELECT id, title, stable_key FROM notebook_notebooks WHERE stable_key = ?').get(NOTEBOOK_STABLE_KEY) ?? null;
        if (!liveNotebook) {
          issues.push(`no notebook row found for stable key ${NOTEBOOK_STABLE_KEY}`);
        } else {
          counts = liveCounts(db, liveNotebook.id);
          if (counts.sources !== EXPECTED_SOURCE_COUNT) issues.push(`live source count is ${counts.sources}, expected ${EXPECTED_SOURCE_COUNT}`);
          if (counts.readySources !== EXPECTED_SOURCE_COUNT) issues.push(`live ready source count is ${counts.readySources}, expected ${EXPECTED_SOURCE_COUNT}`);
          if (counts.chunks < EXPECTED_SOURCE_COUNT) issues.push(`live chunk count is ${counts.chunks}, expected at least ${EXPECTED_SOURCE_COUNT}`);
          if (counts.embedded !== counts.chunks) issues.push(`live embedded chunk count is ${counts.embedded}, expected ${counts.chunks}`);
          if (reportChunkCount !== counts.chunks) issues.push(`report chunk_count is ${reportChunkCount ?? 'missing'}, expected live chunk count ${counts.chunks}`);
          if (reportEmbeddedCount !== counts.embedded) issues.push(`report embedded_chunk_count is ${reportEmbeddedCount ?? 'missing'}, expected live embedded count ${counts.embedded}`);
        }
      } catch (error) {
        issues.push(`unable to open live notebook database read-only: ${error.message}`);
      } finally {
        if (db) db.close();
      }
    }
    status = issues.length === 0 ? 'RAG_INGESTED_VERIFIED' : 'RAG_INGESTION_DRIFT';
  }

  const summary = {
    ok: issues.length === 0,
    status,
    notebook: {
      id: liveNotebook?.id,
      title: liveNotebook?.title ?? NOTEBOOK_TITLE,
      stableKey: liveNotebook?.stable_key ?? NOTEBOOK_STABLE_KEY,
      dbPath: DB_PATH
    },
    counts: {
      expected: {
        sources: EXPECTED_SOURCE_COUNT
      },
      live: counts
    },
    database: {
      path: database.path,
      available: database.available,
      integrityCheck: database.integrityCheck,
      quickCheck: database.quickCheck,
      foreignKeyViolations: database.foreignKeyViolations
    },
    reportExists,
    issues
  };

  console.log(JSON.stringify(summary, null, 2));
  if (issues.length > 0) {
    process.exit(1);
  }
}

main();
