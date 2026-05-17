#!/usr/bin/env node

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'semantic-memory.db');
const EMBEDDING_DIMENSIONS = 384;
const CONSOLIDATE_DISTANCE_THRESHOLD = 0.35;

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

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'were',
  'with',
  'via',
  'into',
  'over',
  'under',
  'not',
  'no',
]);

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

function getMemoryColumns(db) {
  return new Set(
    db.prepare('PRAGMA table_info(memories)').all().map((column) => column.name)
  );
}

function buildRowProjection(columns) {
  return [
    'm.id',
    'm.file_path',
    'm.name',
    'm.type',
    'm.description',
    'm.body',
    'm.embedded_at',
    'm.file_mtime',
    columns.has('last_accessed') ? 'm.last_accessed' : 'NULL AS last_accessed',
    columns.has('access_count') ? 'COALESCE(m.access_count, 0) AS access_count' : '0 AS access_count',
    columns.has('synthesis_parent') ? 'm.synthesis_parent' : 'NULL AS synthesis_parent',
    columns.has('contradiction_flag') ? 'COALESCE(m.contradiction_flag, 0) AS contradiction_flag' : '0 AS contradiction_flag',
    columns.has('merged_into') ? 'm.merged_into' : 'NULL AS merged_into',
    'v.embedding AS embedding',
  ].join(',\n        ');
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .match(/[a-z0-9]+/g)
    ?.filter((token) => token.length > 2 && !STOPWORDS.has(token)) ?? [];
}

function tokenOverlap(left, right) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }

  return shared / Math.min(leftTokens.size, rightTokens.size);
}

function comparisonText(row) {
  return row.description || row.body || row.name || '';
}

function bodyDivergent(left, right) {
  const normalizedLeft = normalizeText(left.body);
  const normalizedRight = normalizeText(right.body);

  if (!normalizedLeft && !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return false;
  }

  return tokenOverlap(normalizedLeft, normalizedRight) < 0.35;
}

function parseEmbeddedAt(row) {
  const value = Date.parse(row.embedded_at || row.file_mtime || '');
  return Number.isFinite(value) ? value : 0;
}

function isOlder(left, right) {
  const leftTime = parseEmbeddedAt(left);
  const rightTime = parseEmbeddedAt(right);

  if (leftTime !== rightTime) {
    return leftTime < rightTime;
  }

  return Number(left.id) < Number(right.id);
}

function euclideanDistance(left, right) {
  let dot = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
  }
  return Math.sqrt(Math.max(0, 2 - 2 * dot));
}

function loadRows(db, columns) {
  return db.prepare(`
    SELECT
      ${buildRowProjection(columns)}
    FROM memories m
    JOIN mem_vss v ON m.id = v.rowid
  `).all().map((row) => ({
    ...row,
    vector: row.embedding instanceof Float32Array
      ? row.embedding
      : new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4),
  }));
}

function betterMergeCandidate(current, candidate) {
  if (!current) {
    return candidate;
  }

  const currentTime = parseEmbeddedAt(current.newerMeta);
  const candidateTime = parseEmbeddedAt(candidate.newerMeta);
  if (candidateTime > currentTime) {
    return candidate;
  }
  if (candidateTime < currentTime) {
    return current;
  }
  if (candidate.distance < current.distance) {
    return candidate;
  }
  return current;
}

function findMergeAndContradictionCandidates(rows) {
  const byType = new Map();
  for (const row of rows) {
    if (!row.type || row.type === 'synthesis') {
      continue;
    }
    if (row.merged_into != null || Number(row.contradiction_flag || 0) !== 0) {
      continue;
    }
    const list = byType.get(row.type) || [];
    list.push(row);
    byType.set(row.type, list);
  }

  const mergeCandidates = new Map();
  const contradictions = new Set();

  for (const list of byType.values()) {
    for (let leftIndex = 0; leftIndex < list.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < list.length; rightIndex += 1) {
        const left = list[leftIndex];
        const right = list[rightIndex];
        const distance = euclideanDistance(left.vector, right.vector);

        if (distance >= CONSOLIDATE_DISTANCE_THRESHOLD) {
          continue;
        }

        const older = isOlder(left, right) ? left : right;
        const newer = older === left ? right : left;
        const descriptionOverlap = tokenOverlap(comparisonText(left), comparisonText(right));

        if (bodyDivergent(left, right)) {
          contradictions.add([Number(older.id), Number(newer.id)].sort((a, b) => a - b).join(':'));
          continue;
        }

        if (descriptionOverlap > 0.6) {
          const current = mergeCandidates.get(Number(older.id));
          mergeCandidates.set(
            Number(older.id),
            betterMergeCandidate(current, {
              older: Number(older.id),
              newerId: Number(newer.id),
              distance,
              newerMeta: {
                embedded_at: newer.embedded_at,
                id: Number(newer.id),
              },
            })
          );
        }
      }
    }
  }

  return {
    mergeCandidates,
    contradictions,
  };
}

async function main() {
  const { dryRun } = parseArgs(process.argv);

  if (!existsSync(DB_PATH)) {
    throw new Error(`Semantic memory DB not found: ${DB_PATH}`);
  }

  const db = new Database(DB_PATH);
  sqliteVec.load(db);
  if (!dryRun) {
    ensureMemorySchema(db);
  }
  db.pragma('busy_timeout = 5000');
  try {
    const columns = getMemoryColumns(db);
    const rows = loadRows(db, columns);
    const { mergeCandidates, contradictions } = findMergeAndContradictionCandidates(rows);

    let consolidated = 0;
    let contradictionCount = 0;

    if (!dryRun) {
      const mergeStatement = db.prepare(`
        UPDATE memories
        SET merged_into = ?
        WHERE id = ? AND merged_into IS NULL AND COALESCE(contradiction_flag, 0) = 0
      `);
      const contradictionStatement = db.prepare(`
        UPDATE memories
        SET contradiction_flag = 1
        WHERE id = ?
      `);

      db.transaction(() => {
        for (const candidate of mergeCandidates.values()) {
          const result = mergeStatement.run(candidate.newerId, candidate.older);
          if (result.changes > 0) {
            consolidated += 1;
          }
        }

        for (const key of contradictions) {
          const [leftId, rightId] = key.split(':').map((value) => Number(value));
          const leftResult = contradictionStatement.run(leftId);
          const rightResult = contradictionStatement.run(rightId);
          if (leftResult.changes > 0 || rightResult.changes > 0) {
            contradictionCount += 1;
          }
        }
      })();
    } else {
      consolidated = mergeCandidates.size;
      contradictionCount = contradictions.size;
    }

    console.log(`[memory-consolidate] summary: ${consolidated} consolidated ${contradictionCount} contradictions`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(`[memory-consolidate] failed: ${error.message}`);
  process.exit(1);
});
