#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inspectOpenDatabaseHealth, unavailableDatabaseHealth } from './lib/db-health.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE_DIR = path.join(REPO_ROOT, '_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05');
const MANIFEST_PATH = path.join(ARCHIVE_DIR, '00_manifest.md');
const INGEST_REPORT_PATH = path.join(ARCHIVE_DIR, '12_rag_ingested.md');
const NOTEBOOK_STABLE_KEY = 'yuri-os/enterprise-ai-os-research-2026-05';
const NOTEBOOK_TITLE = 'Yuri Enterprise AI OS Research 2026-05';
const EXPECTED_SOURCE_COUNT = 13;
const EXPECTED_CHUNK_COUNT = 22;
const EXPECTED_EMBEDDED_CHUNK_COUNT = 22;
const RAW_DB_PATH = process.env.YURI_DB_PATH;
const DB_PATH = RAW_DB_PATH && RAW_DB_PATH !== ':memory:'
  ? path.resolve(REPO_ROOT, RAW_DB_PATH)
  : path.join(REPO_ROOT, 'backend/data/yuri.db');

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

function extractManifestApprovedCount(text) {
  const match = text.match(/^- RAG-approved archive files:\s+(\d+)$/m);
  return match ? Number(match[1]) : null;
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

function pushMismatch(issues, label, actual, expected) {
  if (actual !== expected) {
    issues.push(`${label} is ${actual ?? 'missing'}, expected ${expected}`);
  }
}

function main() {
  const issues = [];
  const manifest = readText(MANIFEST_PATH, issues);
  const report = readText(INGEST_REPORT_PATH, issues);

  const manifestSourceCount = extractManifestApprovedCount(manifest);
  const manifestStableKey = extractField(manifest, 'rag_notebook_stable_key');
  const manifestNotebookId = extractNumberField(manifest, 'rag_notebook_id');
  const manifestAdvisoryOnly = extractField(manifest, 'advisory_only');
  const manifestLocalTruthClaim = extractField(manifest, 'local_truth_claim');

  const reportSourceCount = extractNumberField(report, 'source_count');
  const reportChunkCount = extractNumberField(report, 'chunk_count');
  const reportEmbeddedCount = extractNumberField(report, 'embedded_chunk_count');
  const reportNotebookId = extractNumberField(report, 'notebook_id');
  const reportStableKey = extractField(report, 'notebook_stable_key');
  const reportTitle = extractField(report, 'notebook_title');
  const reportAdvisoryOnly = extractField(report, 'advisory_only');
  const reportLocalTruthClaim = extractField(report, 'local_truth_claim');

  pushMismatch(issues, 'manifest RAG-approved archive file count', manifestSourceCount, EXPECTED_SOURCE_COUNT);
  pushMismatch(issues, 'manifest stable key', manifestStableKey, NOTEBOOK_STABLE_KEY);
  pushMismatch(issues, 'manifest advisory_only', manifestAdvisoryOnly, 'true');
  pushMismatch(issues, 'manifest local_truth_claim', manifestLocalTruthClaim, 'false');
  pushMismatch(issues, 'report source_count', reportSourceCount, EXPECTED_SOURCE_COUNT);
  pushMismatch(issues, 'report chunk_count', reportChunkCount, EXPECTED_CHUNK_COUNT);
  pushMismatch(issues, 'report embedded_chunk_count', reportEmbeddedCount, EXPECTED_EMBEDDED_CHUNK_COUNT);
  pushMismatch(issues, 'report stable key', reportStableKey, NOTEBOOK_STABLE_KEY);
  pushMismatch(issues, 'report title', reportTitle, NOTEBOOK_TITLE);
  pushMismatch(issues, 'report advisory_only', reportAdvisoryOnly, 'true');
  pushMismatch(issues, 'report local_truth_claim', reportLocalTruthClaim, 'false');

  let db = null;
  let liveNotebook = null;
  let counts = null;
  let database = unavailableDatabaseHealth(DB_PATH);
  if (!fs.existsSync(DB_PATH)) {
    issues.push(`live notebook database not found at ${DB_PATH}`);
  } else {
    try {
      db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
      database = inspectOpenDatabaseHealth(db, DB_PATH);
      if (database.integrityCheck !== 'ok') issues.push(`database integrity_check is ${database.integrityCheck}`);
      if (database.quickCheck !== 'ok') issues.push(`database quick_check is ${database.quickCheck}`);
      if (database.foreignKeyViolations !== 0) issues.push(`database foreign_key_check violations ${database.foreignKeyViolations}`);

      liveNotebook = db.prepare('SELECT id, title, stable_key FROM notebook_notebooks WHERE stable_key = ?').get(NOTEBOOK_STABLE_KEY) ?? null;
      if (!liveNotebook) {
        issues.push(`no notebook row found for stable key ${NOTEBOOK_STABLE_KEY}`);
      } else {
        if (liveNotebook.title !== NOTEBOOK_TITLE) {
          issues.push(`live notebook title is ${liveNotebook.title ?? 'missing'}, expected ${NOTEBOOK_TITLE}`);
        }
        if (manifestNotebookId != null && Number(liveNotebook.id) !== manifestNotebookId) {
          issues.push(`manifest notebook id ${manifestNotebookId} does not match live id ${liveNotebook.id}`);
        }
        if (reportNotebookId != null && Number(liveNotebook.id) !== reportNotebookId) {
          issues.push(`report notebook id ${reportNotebookId} does not match live id ${liveNotebook.id}`);
        }
        counts = liveCounts(db, liveNotebook.id);
        pushMismatch(issues, 'live source count', counts.sources, EXPECTED_SOURCE_COUNT);
        pushMismatch(issues, 'live ready source count', counts.readySources, EXPECTED_SOURCE_COUNT);
        pushMismatch(issues, 'live chunk count', counts.chunks, EXPECTED_CHUNK_COUNT);
        pushMismatch(issues, 'live embedded chunk count', counts.embedded, EXPECTED_EMBEDDED_CHUNK_COUNT);
        pushMismatch(issues, 'manifest source count vs live source count', manifestSourceCount, counts.sources);
        pushMismatch(issues, 'report source_count vs live source count', reportSourceCount, counts.sources);
        pushMismatch(issues, 'report chunk_count vs live chunk count', reportChunkCount, counts.chunks);
        pushMismatch(issues, 'report embedded_chunk_count vs live embedded chunk count', reportEmbeddedCount, counts.embedded);
      }
    } catch (error) {
      issues.push(`unable to open live notebook database read-only: ${error.message}`);
    } finally {
      if (db) db.close();
    }
  }

  const summary = {
    ok: issues.length === 0,
    notebook: {
      id: liveNotebook?.id ?? reportNotebookId ?? manifestNotebookId,
      title: liveNotebook?.title ?? reportTitle,
      stableKey: liveNotebook?.stable_key ?? reportStableKey ?? manifestStableKey,
      expectedTitle: NOTEBOOK_TITLE,
      expectedStableKey: NOTEBOOK_STABLE_KEY,
      dbPath: DB_PATH
    },
    counts: {
      expected: {
        sources: EXPECTED_SOURCE_COUNT,
        chunks: EXPECTED_CHUNK_COUNT,
        embedded: EXPECTED_EMBEDDED_CHUNK_COUNT
      },
      manifest: {
        sources: manifestSourceCount
      },
      report: {
        sources: reportSourceCount,
        chunks: reportChunkCount,
        embedded: reportEmbeddedCount
      },
      live: counts
    },
    database: {
      path: database.path,
      exists: database.exists,
      available: database.available,
      integrityCheck: database.integrityCheck,
      quickCheck: database.quickCheck,
      foreignKeyViolations: database.foreignKeyViolations,
      healthy: database.healthy,
      error: database.error
    },
    issues
  };

  console.log(JSON.stringify(summary, null, 2));
  if (issues.length > 0) {
    process.exit(1);
  }
}

main();
