#!/usr/bin/env node

import { pipeline } from '@xenova/transformers';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const MEMORY_DIR = path.join(REPO_ROOT, '.claude', 'projects', '-Users-marcelspatz-YURI', 'memory');
const DB_PATH = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'semantic-memory.db');
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
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
  let dryRun = false;

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { dryRun };
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { body: content };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) meta[key] = value;
  }

  return {
    ...meta,
    body: match[2].trim(),
  };
}

function buildEmbedText(parsed) {
  return [parsed.name, parsed.description, parsed.type, parsed.body]
    .filter(Boolean)
    .join(' | ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 512);
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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

function listMemoryFiles() {
  if (!existsSync(MEMORY_DIR)) return [];
  return readdirSync(MEMORY_DIR)
    .filter((file) => file.endsWith('.md') && file !== 'MEMORY.md')
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const { dryRun } = parseArgs(process.argv);
  mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);
  sqliteVec.load(db);
  if (!dryRun) ensureMemorySchema(db);
  db.pragma('busy_timeout = 5000');
  const canFlagContradiction = !dryRun;

  const extractor = await pipeline('feature-extraction', MODEL_NAME);
  const files = listMemoryFiles();

  const selectExisting = db.prepare('SELECT id, file_mtime FROM memories WHERE file_path = ?');
  const selectId = db.prepare('SELECT id FROM memories WHERE file_path = ?');
  const selectVector = db.prepare('SELECT 1 FROM mem_vss WHERE rowid = ?');
  const upsertMemory = db.prepare(`
    INSERT INTO memories (
      file_path,
      name,
      type,
      description,
      body,
      embedded_at,
      file_mtime
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      description = excluded.description,
      body = excluded.body,
      embedded_at = excluded.embedded_at,
      file_mtime = excluded.file_mtime
  `);
  const deleteVector = db.prepare(`
    DELETE FROM mem_vss WHERE rowid = ?
  `);
  const insertVector = db.prepare(`
    INSERT INTO mem_vss(rowid, embedding)
    VALUES (?, ?)
  `);
  const flagContradiction = canFlagContradiction
    ? db.prepare(`
      UPDATE memories
      SET contradiction_flag = 1
      WHERE id = ?
    `)
    : null;
  const findNearest = db.prepare(`
    SELECT
      m.id,
      m.file_path,
      m.body,
      v.distance
    FROM mem_vss v
    JOIN memories m ON m.id = v.rowid
    WHERE v.embedding MATCH ? AND k = ?
    ORDER BY v.distance
  `);

  let embedded = 0;
  let skipped = 0;
  let contradictions = 0;

  try {
    for (const file of files) {
      const filePath = path.join(MEMORY_DIR, file);
      const fileMtime = statSync(filePath).mtime.toISOString();
      const existing = selectExisting.get(filePath);

      if (existing?.file_mtime === fileMtime && existing.id != null) {
        const hasVector = selectVector.get(BigInt(existing.id));
        if (hasVector) {
          skipped += 1;
          continue;
        }
      }

      const content = readFileSync(filePath, 'utf8');
      const parsed = parseFrontmatter(content);
      const embedText = buildEmbedText(parsed);
      const output = await extractor(embedText, { pooling: 'mean', normalize: true });
      const embedding = new Float32Array(output.data);

      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Expected ${EMBEDDING_DIMENSIONS}-dimensional embedding for ${file}, got ${embedding.length}`);
      }

      const embeddedAt = new Date().toISOString();
      const embeddingBlob = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);

      if (!dryRun) {
        db.transaction(() => {
          upsertMemory.run(
            filePath,
            parsed.name || file,
            parsed.type || 'unknown',
            parsed.description || '',
            parsed.body || content,
            embeddedAt,
            fileMtime,
          );

          const row = selectId.get(filePath);
          if (!row?.id) {
            throw new Error(`Missing memory row id for ${filePath}`);
          }

          const memoryId = BigInt(row.id);
          if (memoryId <= 0n) {
            throw new Error(`Invalid memory row id for ${filePath}: ${row.id}`);
          }

          deleteVector.run(memoryId);
          insertVector.run(memoryId, embeddingBlob);

          const nearby = findNearest.all(embeddingBlob, 10);
          const contradictionsForFile = nearby
            .filter((candidate) => candidate.file_path !== filePath)
            .slice(0, 3)
            .filter((candidate) => candidate.distance < 0.3 && Math.abs((candidate.body || '').length - (parsed.body || content).length) / Math.max((candidate.body || '').length, 1) > 0.4);

          for (const candidate of contradictionsForFile) {
            flagContradiction?.run(Number(candidate.id));
            flagContradiction?.run(Number(memoryId));
          }

          if (contradictionsForFile.length > 0) {
            contradictions += contradictionsForFile.length;
            console.log(
              `[memory-embed] CONTRADICTION flagged: ${file} vs ${contradictionsForFile.length} nearby memory${contradictionsForFile.length === 1 ? '' : 's'}`
            );
          }
        })();
      } else {
        const nearby = findNearest.all(embeddingBlob, 10);
        const contradictionsForFile = nearby
          .filter((candidate) => candidate.file_path !== filePath)
          .slice(0, 3)
          .filter((candidate) => candidate.distance < 0.3 && normalizeText(candidate.body) !== normalizeText(parsed.body || content));

        if (contradictionsForFile.length > 0) {
          contradictions += contradictionsForFile.length;
          console.log(
            `[memory-embed] dry-run contradiction_flag would be set for ${file} against ${contradictionsForFile.length} nearby memory${contradictionsForFile.length === 1 ? '' : 's'}`
          );
        }
      }

      embedded += 1;
      console.log(`[memory-embed] embedded: ${file}`);
    }

    const summary = `[memory-embed] done: ${embedded} embedded, ${skipped} skipped (unchanged), ${contradictions} contradictions`;
    console.log(summary);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(`[memory-embed] failed: ${error.message}`);
  process.exit(1);
});
