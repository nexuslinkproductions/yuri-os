#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const MEMORY_DIR = path.join(REPO_ROOT, '.claude', 'projects', '-Users-marcelspatz-NUDIMMUD', 'memory');
const DB_PATH = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'semantic-memory.db');

function countSourceFiles() {
  if (!existsSync(MEMORY_DIR)) return 0;
  return readdirSync(MEMORY_DIR)
    .filter((file) => file.endsWith('.md') && file !== 'MEMORY.md')
    .length;
}

function main() {
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'Scripts', 'memory-embed.mjs')], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });

  if (!existsSync(DB_PATH)) {
    throw new Error(`Semantic memory DB not found after embed run: ${DB_PATH}`);
  }

  const db = new Database(DB_PATH, { readonly: true });
  sqliteVec.load(db);

  try {
    const sourceFiles = countSourceFiles();
    const memoryRows = db.prepare('SELECT COUNT(*) AS count FROM memories').get().count;
    const vectorRows = db.prepare('SELECT COUNT(*) AS count FROM mem_vss').get().count;
    const vecVersion = db.prepare('SELECT vec_version() AS vec_version').get().vec_version;

    console.log(
      `[memory-migrate] summary: source_files=${sourceFiles} memory_rows=${memoryRows} vector_rows=${vectorRows} vec_version=${vecVersion}`
    );
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error(`[memory-migrate] failed: ${error.message}`);
  process.exit(1);
}
