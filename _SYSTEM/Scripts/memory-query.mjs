#!/usr/bin/env node

import { pipeline } from '@xenova/transformers';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'semantic-memory.db');
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const DEFAULT_TOP_N = 8;
const EMBEDDING_DIMENSIONS = 384;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE NOT NULL,
  name TEXT,
  type TEXT,
  description TEXT,
  body TEXT,
  embedded_at TEXT,
  file_mtime TEXT,
  last_accessed TEXT,
  access_count INTEGER DEFAULT 0,
  synthesis_parent TEXT,
  contradiction_flag INTEGER DEFAULT 0,
  merged_into INTEGER
);
CREATE VIRTUAL TABLE IF NOT EXISTS mem_vss USING vec0(
  embedding float[${EMBEDDING_DIMENSIONS}]
);
`;

function parseArgs(argv) {
  let query = '';
  let top = DEFAULT_TOP_N;

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--top') {
      const value = Number.parseInt(argv[index + 1] || '', 10);
      top = Number.isInteger(value) && value > 0 ? value : DEFAULT_TOP_N;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    query = query ? `${query} ${arg}` : arg;
  }

  return {
    query: query.trim(),
    top,
  };
}

function usage() {
  console.error('Usage: node _SYSTEM/Scripts/memory-query.mjs "<query>" [--top N]');
}

function ensureMemorySchema(db) {
  db.exec(SCHEMA);

  const columns = new Set(
    db.prepare('PRAGMA table_info(memories)').all().map((column) => column.name)
  );

  const addColumn = (name, definition) => {
    if (!columns.has(name)) {
      db.exec(`ALTER TABLE memories ADD COLUMN ${name} ${definition}`);
      columns.add(name);
    }
  };

  addColumn('last_accessed', 'TEXT');
  addColumn('access_count', 'INTEGER DEFAULT 0');
  addColumn('synthesis_parent', 'TEXT');
  addColumn('contradiction_flag', 'INTEGER DEFAULT 0');
  addColumn('merged_into', 'INTEGER');
}

async function main() {
  const { query, top } = parseArgs(process.argv);

  if (!query) {
    usage();
    process.exit(1);
  }

  if (!existsSync(DB_PATH)) {
    throw new Error(`Semantic memory DB not found: ${DB_PATH}`);
  }

  const db = new Database(DB_PATH);
  sqliteVec.load(db);
  ensureMemorySchema(db);
  db.pragma('busy_timeout = 5000');

  try {
    const extractor = await pipeline('feature-extraction', MODEL_NAME);
    const output = await extractor(query, { pooling: 'mean', normalize: true });
    const embedding = new Float32Array(output.data);

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Expected ${EMBEDDING_DIMENSIONS}-dimensional embedding for query, got ${embedding.length}`);
    }

    const embeddingBlob = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
    const results = db.prepare(`
      WITH ranked AS (
        SELECT
          m.id,
          m.name,
          m.type,
          m.description,
          m.file_path,
          m.last_accessed,
          COALESCE(m.access_count, 0) AS access_count,
          v.distance,
          CASE
            WHEN COALESCE(m.last_accessed, m.embedded_at) IS NULL THEN 1.0
            ELSE MIN(
              MAX((julianday('now') - julianday(COALESCE(m.last_accessed, m.embedded_at))) / 90.0, 0.0),
              1.0
            )
          END AS recency_penalty
        FROM mem_vss v
        JOIN memories m ON m.id = v.rowid
        WHERE v.embedding MATCH ? AND k = ?
      )
      SELECT
        id,
        name,
        type,
        description,
        file_path,
        last_accessed,
        access_count,
        distance,
        recency_penalty,
        (distance * 0.7 + recency_penalty * 0.3) AS final_score
      FROM ranked
      ORDER BY final_score, distance
    `).all(embeddingBlob, top);

    const hitAt = new Date().toISOString();
    const updateAccess = db.prepare(`
      UPDATE memories
      SET last_accessed = ?, access_count = COALESCE(access_count, 0) + 1
      WHERE id = ?
    `);

    db.transaction(() => {
      for (const row of results) {
        updateAccess.run(hitAt, row.id);
      }
    })();

    const outputRows = results.map(({ id, access_count, ...row }) => ({
      ...row,
      last_accessed: hitAt,
      access_count: Number(access_count || 0) + 1,
    }));
    console.log(JSON.stringify(outputRows, null, 2));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(`[memory-query] failed: ${error.message}`);
  process.exit(1);
});
