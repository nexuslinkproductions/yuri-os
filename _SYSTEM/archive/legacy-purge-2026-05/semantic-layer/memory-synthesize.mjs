#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { pipeline } from '@xenova/transformers';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');  // Scripts/ → _SYSTEM/ → repo root
const DB_PATH = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'semantic-memory.db');
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIMENSIONS = 384;
const CLUSTER_DISTANCE_THRESHOLD = 0.5;
const MIN_CLUSTER_SIZE = 3;

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

function euclideanDistance(left, right) {
  let dot = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
  }
  return Math.sqrt(Math.max(0, 2 - 2 * dot));
}

function parseEmbeddedAt(row) {
  const value = Date.parse(row.embedded_at || row.file_mtime || '');
  return Number.isFinite(value) ? value : 0;
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

function comparisonText(row) {
  return row.description || row.body || row.name || '';
}

function buildComponents(rows) {
  const parent = rows.map((_, index) => index);

  const find = (index) => {
    if (parent[index] !== index) {
      parent[index] = find(parent[index]);
    }
    return parent[index];
  };

  const union = (left, right) => {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) {
      parent[rootRight] = rootLeft;
    }
  };

  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      if (euclideanDistance(rows[leftIndex].vector, rows[rightIndex].vector) < CLUSTER_DISTANCE_THRESHOLD) {
        union(leftIndex, rightIndex);
      }
    }
  }

  const components = new Map();
  rows.forEach((row, index) => {
    const root = find(index);
    const list = components.get(root) || [];
    list.push(row);
    components.set(root, list);
  });

  return [...components.values()].map((component) =>
    component.sort((left, right) => Number(left.id) - Number(right.id))
  );
}

function buildSynthesisTerms(rows) {
  const counts = new Map();
  for (const row of rows) {
    for (const token of tokenize(`${comparisonText(row)} ${row.body || ''}`)) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([term]) => term);
}

function truncateText(value, maxLength = 140) {
  const text = normalizeText(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildSynthesisContent(type, rows, averageDistance) {
  const terms = buildSynthesisTerms(rows);
  const memberLines = rows.map((row) => {
    const summary = truncateText(comparisonText(row), 120);
    return `- ${row.id} ${row.name || '(unnamed)'}: ${summary}`;
  });

  const name = `Synthesis: ${type} (${rows.length})`;
  const description = terms.length > 0
    ? `Shared ${type} cluster across ${rows.length} memories. Terms: ${terms.join(', ')}`
    : `Shared ${type} cluster across ${rows.length} memories.`;
  const body = [
    `Cluster type: ${type}`,
    `Cluster size: ${rows.length}`,
    `Average pairwise distance: ${averageDistance.toFixed(3)}`,
    `Shared terms: ${terms.length > 0 ? terms.join(', ') : 'n/a'}`,
    '',
    'Members:',
    ...memberLines,
  ].join('\n');

  return {
    name,
    description,
    body,
  };
}

function hasRecentSynthesis(db, columns, synthesisParent) {
  if (!columns.has('synthesis_parent')) {
    return false;
  }

  const recent = db.prepare(`
    SELECT embedded_at
    FROM memories
    WHERE type = 'synthesis' AND synthesis_parent = ?
    ORDER BY embedded_at DESC
    LIMIT 1
  `).get(synthesisParent);

  if (!recent?.embedded_at) {
    return false;
  }

  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const embeddedAt = Date.parse(recent.embedded_at);
  return Number.isFinite(embeddedAt) && embeddedAt >= cutoff;
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

  const columns = getMemoryColumns(db);
  const rows = loadRows(db, columns).filter((row) =>
    row.type && row.type !== 'synthesis' && row.merged_into == null && Number(row.contradiction_flag || 0) === 0
  );

  const groupedByType = new Map();
  for (const row of rows) {
    const list = groupedByType.get(row.type) || [];
    list.push(row);
    groupedByType.set(row.type, list);
  }

  let created = 0;
  let skippedRecent = 0;
  const extractor = dryRun ? null : await pipeline('feature-extraction', MODEL_NAME);

  const insertMemory = dryRun ? null : db.prepare(`
    INSERT INTO memories (
      file_path,
      name,
      type,
      description,
      body,
      embedded_at,
      file_mtime,
      synthesis_parent,
      contradiction_flag,
      merged_into
    ) VALUES (?, ?, 'synthesis', ?, ?, ?, ?, ?, 0, NULL)
  `);
  const insertVector = dryRun ? null : db.prepare(`
    INSERT OR REPLACE INTO mem_vss(rowid, embedding)
    VALUES (?, ?)
  `);

  try {
    for (const [type, typeRows] of groupedByType.entries()) {
      const components = buildComponents(typeRows);

      for (const component of components) {
        if (component.length < MIN_CLUSTER_SIZE) {
          continue;
        }

        let pairDistanceSum = 0;
        let pairCount = 0;
        for (let leftIndex = 0; leftIndex < component.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < component.length; rightIndex += 1) {
            pairDistanceSum += euclideanDistance(component[leftIndex].vector, component[rightIndex].vector);
            pairCount += 1;
          }
        }

        const averageDistance = pairCount > 0 ? pairDistanceSum / pairCount : 0;
        if (averageDistance >= CLUSTER_DISTANCE_THRESHOLD) {
          continue;
        }

        const synthesisParent = component.map((row) => Number(row.id)).sort((left, right) => left - right).join(',');
        if (hasRecentSynthesis(db, columns, synthesisParent)) {
          skippedRecent += 1;
          continue;
        }

        const synthesis = buildSynthesisContent(type, component, averageDistance);
        const embeddedAt = new Date().toISOString();
        const clusterHash = createHash('sha1').update(synthesisParent).digest('hex').slice(0, 12);
        const filePath = `synthesis://${type}/${clusterHash}/${embeddedAt}`;
        const embedText = [synthesis.name, synthesis.description, 'synthesis', synthesis.body]
          .filter(Boolean)
          .join(' | ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 512);

        if (dryRun) {
          console.log(`[memory-synthesize] dry-run would create synthesis for type=${type} parents=${synthesisParent}`);
          created += 1;
          continue;
        }

        const output = await extractor(embedText, { pooling: 'mean', normalize: true });
        const embedding = new Float32Array(output.data);

        if (embedding.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(`Expected ${EMBEDDING_DIMENSIONS}-dimensional embedding for synthesis ${filePath}, got ${embedding.length}`);
        }

        const embeddingBlob = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);

        db.transaction(() => {
          const result = insertMemory.run(
            filePath,
            synthesis.name,
            synthesis.description,
            synthesis.body,
            embeddedAt,
            embeddedAt,
            synthesisParent,
          );

          const synthesisId = BigInt(result.lastInsertRowid);
          if (synthesisId <= 0n) {
            throw new Error(`Invalid synthesis row id for ${filePath}`);
          }

          insertVector.run(synthesisId, embeddingBlob);
        })();

        created += 1;
        console.log(`[memory-synthesize] created synthesis for type=${type} parents=${synthesisParent}`);
      }
    }

    console.log(`[memory-synthesize] summary: ${created} created, ${skippedRecent} skipped (recent synthesis)`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(`[memory-synthesize] failed: ${error.message}`);
  process.exit(1);
});
