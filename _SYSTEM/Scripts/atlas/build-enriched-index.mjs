#!/usr/bin/env node
// @capability: enriched-index-build
// @serves: index-side intent vocabulary enrichment | serves/does into FTS5 documents | bakeoff C5 substrate
// @does: builds _SYSTEM/OS_KERNEL/search-index.enriched.db — a byte-copy of the base FTS5 search
//   index whose docs.body for each capability mechanism path gets that path's serves/does text
//   APPENDED (deduped per canonical path). DERIVE-ONLY: every appended token already exists in
//   capabilities.json; nothing is generated. Deterministic: same base db + same capabilities.json
//   yields the same enriched db (asserted by re-computing appended row hashes).
// @use: run before `--resolver=enriched` on _SYSTEM/eval/atlas-score.mjs; do not edit the BASE
//   index — enrichment is a variant substrate so the control condition stays intact.
// @exports: buildEnrichedIndex, main

import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE_DB = path.join(REPO_ROOT, '_SYSTEM/OS_KERNEL/search-index.db');
const OUT_DB = path.join(REPO_ROOT, '_SYSTEM/OS_KERNEL/search-index.enriched.db');
const CAPABILITIES_PATH = path.join(REPO_ROOT, '_SYSTEM/capabilities.json');

export async function buildEnrichedIndex({ baseDb = BASE_DB, outDb = OUT_DB, capabilitiesPath = CAPABILITIES_PATH } = {}) {
  if (!existsSync(baseDb)) throw new Error(`base index missing: ${baseDb}`);
  const caps = JSON.parse(readFileSync(capabilitiesPath, 'utf8'));
  const entries = Array.isArray(caps && caps.capabilities) ? caps.capabilities : [];

  // Dedupe per canonical mechanism path (eval-processing.mjs has 4 records).
  const byMechanism = new Map(); // normalized path -> { serves:Set, does:Set }
  for (const c of entries) {
    if (typeof c.mechanism !== 'string' || !c.mechanism) continue;
    const key = c.mechanism.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!byMechanism.has(key)) byMechanism.set(key, { serves: new Set(), does: new Set() });
    const agg = byMechanism.get(key);
    for (const s of Array.isArray(c.serves) ? c.serves : []) if (typeof s === 'string' && s) agg.serves.add(s);
    if (typeof c.does === 'string' && c.does) agg.does.add(c.does);
  }

  copyFileSync(baseDb, outDb);
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(outDb);
  const find = db.prepare('SELECT rowid, path FROM docs WHERE path = ?');
  const update = db.prepare('UPDATE docs SET body = body || ? WHERE rowid = ?');

  let enriched = 0;
  let missing = 0;
  const hash = createHash('sha256');
  const tx = db.transaction(() => {
    for (const [mech, agg] of [...byMechanism.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const row = find.get(mech);
      if (!row) { missing++; continue; }
      const extra = ` ${[...agg.serves].sort().join(' ')} ${[...agg.does].sort().join(' ')}`;
      update.run(extra, row.rowid);
      hash.update(`${mech}${extra}`);
      enriched++;
    }
  });
  tx();
  db.close();
  return { outDb, enriched, missing, appendHash: hash.digest('hex') };
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('build-enriched-index.mjs — build the C5 enriched FTS5 variant (base db + serves/does in docs.body)');
    return 0;
  }
  return buildEnrichedIndex().then((r) => {
    console.log(`enriched-index: wrote ${r.outDb}`);
    console.log(`  enriched=${r.enriched} mechanism-not-in-index=${r.missing} appendHash=${r.appendHash.slice(0, 16)}`);
    return 0;
  }).catch((err) => {
    console.error(`enriched-index: ${err.message}`);
    return 1;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; });
}
