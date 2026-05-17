#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { postOllamaEmbedding } from './ollama-adapter.mjs';

const require = createRequire(import.meta.url);
const Database = require('../backend/node_modules/better-sqlite3');

const DEFAULT_MODEL = 'nomic-embed-text:latest';
const DEFAULT_OLLAMA_BASE = process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const PROGRESS_STEP = 25;
const SAMPLE_ID_LIMIT = 5;

const MARKERS = {
  dryRunPass: 'BACKFILL_DRY_RUN_PASS',
  applyPass: 'BACKFILL_APPLY_PASS',
  blockedModel: 'BACKFILL_BLOCKED_MODEL',
  refusedOriginalDb: 'BACKFILL_REFUSED_ORIGINAL_DB',
  verifyCountsPass: 'BACKFILL_VERIFY_COUNTS_PASS',
  formatUnclear: 'BACKFILL_BLOCKED_FORMAT_UNCLEAR',
  applyFailed: 'BACKFILL_APPLY_FAILED'
};

function usage() {
  console.error('Usage: node _SYSTEM/Scripts/embed-backfill.mjs --db <absolute-path> [--model <name>] [--limit <n>] [--dry-run] [--apply]');
}

function fail(marker, message, code = 1) {
  if (marker) console.error(marker);
  if (message) console.error(message);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    db: null,
    model: DEFAULT_MODEL,
    limit: null,
    apply: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--db') {
      args.db = argv[++i] ?? null;
      continue;
    }
    if (arg === '--model') {
      args.model = argv[++i] ?? DEFAULT_MODEL;
      continue;
    }
    if (arg === '--limit') {
      const value = Number.parseInt(argv[++i] ?? '', 10);
      if (!Number.isInteger(value) || value < 0) {
        fail(MARKERS.applyFailed, 'Invalid --limit value');
      }
      args.limit = value;
      continue;
    }
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }
    if (arg === '--dry-run') {
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    fail(MARKERS.applyFailed, `Unknown argument: ${arg}`);
  }

  return args;
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function resolveDbPath(dbPath) {
  if (!dbPath) {
    fail(MARKERS.applyFailed, 'Missing --db path');
  }
  if (!path.isAbsolute(dbPath)) {
    fail(MARKERS.refusedOriginalDb, 'Refusing relative DB path');
  }

  const resolved = path.resolve(dbPath);
  const backendDataDir = path.resolve(repoRoot(), 'backend', 'data');
  const backendDataPrefix = `${backendDataDir}${path.sep}`;

  if (resolved === backendDataDir || resolved.startsWith(backendDataPrefix)) {
    fail(MARKERS.refusedOriginalDb, 'Refusing original backend/data DB path');
  }

  return resolved;
}

function openDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('busy_timeout = 5000');
  return db;
}

function getCounts(db) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN embedding IS NOT NULL AND TRIM(embedding) <> '' THEN 1 ELSE 0 END) AS embedded,
      SUM(CASE WHEN embedding IS NULL OR TRIM(embedding) = '' THEN 1 ELSE 0 END) AS unembedded
    FROM notebook_chunks
  `).get();

  return {
    total: Number(row?.total ?? 0),
    embedded: Number(row?.embedded ?? 0),
    unembedded: Number(row?.unembedded ?? 0)
  };
}

function getMissingChunkIds(db, limit) {
  const sql = `
    SELECT id
    FROM notebook_chunks
    WHERE embedding IS NULL OR TRIM(embedding) = ''
    ORDER BY id ASC
  `;
  const rows = limit === null
    ? db.prepare(sql).all()
    : db.prepare(`${sql} LIMIT ?`).all(limit);
  return rows.map((row) => Number(row.id));
}

async function postEmbedding(text, model, baseUrl) {
  const embedding = await postOllamaEmbedding({
    text,
    model,
    baseUrl,
    sourcePath: '_SYSTEM/Scripts/embed-backfill.mjs',
    operationType: 'embed_backfill_embedding'
  });
  if (!Array.isArray(embedding) || embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    return null;
  }
  return embedding;
}

async function probeModel(model, baseUrl) {
  const embedding = await postEmbedding('BACKFILL_MODEL_PROBE', model, baseUrl);
  return Array.isArray(embedding);
}

function verifyCounts(before, after, updatedRows) {
  const expectedEmbedded = before.embedded + updatedRows;
  const expectedUnembedded = before.unembedded - updatedRows;
  return after.total === before.total
    && after.embedded === expectedEmbedded
    && after.unembedded === expectedUnembedded;
}

async function main() {
  const args = parseArgs(process.argv);
  const dbPath = resolveDbPath(args.db);
  const applyMode = args.apply === true;
  const baseUrl = DEFAULT_OLLAMA_BASE;
  const db = openDb(dbPath);

  try {
    const before = getCounts(db);
    const candidateIds = getMissingChunkIds(db, args.limit);

    if (!applyMode) {
      console.log(MARKERS.dryRunPass);
      console.log(`candidate_count=${candidateIds.length} total=${before.total} embedded=${before.embedded} unembedded=${before.unembedded}`);
      if (candidateIds.length > 0) {
        console.log(`sample_ids=${candidateIds.slice(0, SAMPLE_ID_LIMIT).join(',')}`);
      }
      console.log(MARKERS.verifyCountsPass);
      return;
    }

    if (candidateIds.length === 0) {
      console.log(MARKERS.applyPass);
      console.log(`before=${before.total}/${before.embedded}/${before.unembedded} after=${before.total}/${before.embedded}/${before.unembedded}`);
      console.log(MARKERS.verifyCountsPass);
      return;
    }

    const modelReady = await probeModel(args.model, baseUrl);
    if (!modelReady) {
      fail(MARKERS.blockedModel, `Model unavailable: ${args.model}`);
    }

    const selectChunk = db.prepare(`
      SELECT id, content
      FROM notebook_chunks
      WHERE id = ?
        AND (embedding IS NULL OR TRIM(embedding) = '')
    `);
    const updateChunk = db.prepare(`
      UPDATE notebook_chunks
      SET embedding = ?
      WHERE id = ?
    `);

    let updatedRows = 0;

    for (const id of candidateIds) {
      const row = selectChunk.get(id);
      if (!row) {
        fail(MARKERS.applyFailed, `Missing chunk row: ${id}`);
      }

      const embedding = await postEmbedding(row.content, args.model, baseUrl);
      if (!embedding) {
        fail(MARKERS.blockedModel, `Embedding failed for chunk id=${id}`);
      }

      updateChunk.run(JSON.stringify(embedding), id);
      updatedRows += 1;

      if (updatedRows % PROGRESS_STEP === 0 || updatedRows === candidateIds.length) {
        console.log(`BACKFILL_PROGRESS ${updatedRows}/${candidateIds.length} last_id=${id}`);
      }
    }

    const after = getCounts(db);
    if (!verifyCounts(before, after, updatedRows)) {
      fail(MARKERS.applyFailed, `Count mismatch before=${before.total}/${before.embedded}/${before.unembedded} after=${after.total}/${after.embedded}/${after.unembedded} updated=${updatedRows}`);
    }

    console.log(MARKERS.applyPass);
    console.log(`before=${before.total}/${before.embedded}/${before.unembedded} after=${after.total}/${after.embedded}/${after.unembedded}`);
    console.log(MARKERS.verifyCountsPass);
  } catch (error) {
    if (error?.message) {
      fail(MARKERS.applyFailed, error.message);
    }
    fail(MARKERS.applyFailed, 'Unknown failure');
  } finally {
    db.close();
  }
}

main().catch((error) => {
  fail(MARKERS.applyFailed, error?.message || 'Unknown failure');
});
