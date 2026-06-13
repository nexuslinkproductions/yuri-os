#!/usr/bin/env node
// @capability: alpha-factor-library-seeder
// @serves: seed alpha factors | factor corpus seed | bootstrap factor library | load factor seed data | afl seed
// @does: Idempotently seeds the 60-record alpha-factor corpus into alpha-factors.db via the store upsert API in one transaction; prints category + compatibility + total counts
// @use: Reach for this to bootstrap or re-sync the AFL corpus from factor-seed-data.json; safe to run repeatedly (upsert, not blind insert)
// @exports: seed
/**
 * seed-corpus.mjs — AFL corpus seeder (Phase 1).
 *
 * Loads factor-seed-data.json and upserts every record through the store API
 * (openDb + upsertFactor) inside a SINGLE better-sqlite3 transaction. Writes go
 * ONLY through upsertFactor — no raw INSERT SQL lives here.
 *
 * IDEMPOTENT by construction: upsertFactor is ON CONFLICT(id) DO UPDATE, so a
 * second run re-applies the same 60 records over their own ids and leaves exactly
 * 60 rows. The transaction is created from the same openDb() singleton handle that
 * upsertFactor reuses internally, so all upserts commit (or roll back) atomically.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDb, upsertFactor } from './alpha-factor-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.resolve(__dirname, 'factor-seed-data.json');

/**
 * Seed the corpus from factor-seed-data.json. Returns a summary object:
 *   { upserted, byCategory, cryptoCompatible, polymarketCompatible, totalRows }
 */
export function seed() {
  const raw = fs.readFileSync(SEED_PATH, 'utf8');
  const factors = JSON.parse(raw);
  if (!Array.isArray(factors)) {
    throw new TypeError(`seed-corpus: expected an array in ${SEED_PATH}`);
  }

  const db = openDb();

  // SINGLE transaction over all upserts. upsertFactor reuses this same openDb()
  // singleton handle internally, so the writes land inside this transaction.
  const seedAll = db.transaction((records) => {
    let n = 0;
    for (const factor of records) {
      upsertFactor(factor);
      n += 1;
    }
    return n;
  });

  const upserted = seedAll(factors);

  // Derive the seeded summary straight from the source records (deterministic).
  const byCategory = {};
  let cryptoCompatible = 0;
  let polymarketCompatible = 0;
  for (const factor of factors) {
    const cat = factor.category ?? '(uncategorized)';
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    if (factor.crypto_compatible) cryptoCompatible += 1;
    if (factor.polymarket_compatible) polymarketCompatible += 1;
  }

  // Final ground-truth row count from the DB itself.
  const { c: totalRows } = db.prepare('SELECT COUNT(*) AS c FROM alpha_factors').get();

  const summary = {
    upserted,
    byCategory,
    cryptoCompatible,
    polymarketCompatible,
    totalRows,
  };

  printSummary(summary);
  return summary;
}

function printSummary({ upserted, byCategory, cryptoCompatible, polymarketCompatible, totalRows }) {
  console.log('AFL seed-corpus — summary');
  console.log(`  total upserted:          ${upserted}`);
  console.log('  per-category counts:');
  for (const cat of Object.keys(byCategory).sort()) {
    console.log(`    ${cat.padEnd(18)} ${byCategory[cat]}`);
  }
  console.log(`  crypto_compatible:       ${cryptoCompatible}`);
  console.log(`  polymarket_compatible:   ${polymarketCompatible}`);
  console.log(`  SELECT COUNT(*):         ${totalRows}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
}
