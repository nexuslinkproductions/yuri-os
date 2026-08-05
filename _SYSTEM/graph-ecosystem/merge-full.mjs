#!/usr/bin/env node
// merge-full.mjs — YURI full-ecosystem graph merge (promoted, repo-relative, deterministic).
// Reads: _SYSTEM/graph-ecosystem/layers/*.jsonl.
// Emits:
// - full-graph.jsonl
// - full-graph.sha256
// - full-graph.meta.json
// - full-graph.dedup-report.json
// Merge contract:
// - layer order: lexical across layer filenames
// - node-id dedup policy: keep-last (later duplicate removes earlier occurrence)
// - edges without id: all retained
// - edges and nodes remain canonical and deterministic across runs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LAYERS = path.join(DIR, 'layers');
const TARGET_REPORT_PATH = 'full-graph.dedup-report.json';
const TARGET_REPORT = path.join(DIR, TARGET_REPORT_PATH);

const readLines = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.split('\n').filter(Boolean);
};

const layerFiles = fs.readdirSync(LAYERS).filter((file) => file.endsWith('.jsonl')).sort();
const perLayerCounts = {};
const lines = [];
const keepLastById = new Map();

let totalRecords = 0;
const conflictState = new Map(); // id -> {first_src,last_src,count,first_record,last_record,differing}

for (const layerFile of layerFiles) {
  const filePath = path.join(LAYERS, layerFile);
  const rows = readLines(filePath);
  perLayerCounts[layerFile] = rows.length;

  for (const rawLine of rows) {
    totalRecords += 1;
    const parsed = JSON.parse(rawLine);
    const id = parsed.id;

    if (id === undefined) {
      lines.push({ rawLine, id: null });
      continue;
    }

    const existing = conflictState.get(id);
    if (!existing) {
      conflictState.set(id, {
        first_src: layerFile,
        last_src: layerFile,
        count: 1,
        first_record: rawLine,
        last_record: rawLine,
      });
    } else {
      existing.count += 1;
      existing.last_src = layerFile;
      existing.last_record = rawLine;
    }

    const priorIndex = keepLastById.get(id);
    if (priorIndex !== undefined) {
      lines[priorIndex].rawLine = null;
    }

    keepLastById.set(id, lines.length);
    lines.push({ rawLine, id });
  }
}

const dedupedLines = lines.filter((entry) => entry.rawLine !== null);
const dedupedBlob = dedupedLines.map((entry) => entry.rawLine).join('\n') + '\n';
const dedupedRecords = dedupedLines.length;
const dedupedSha = crypto.createHash('sha256').update(dedupedBlob).digest('hex');

const conflictEntries = {};
let duplicatesRemoved = 0;
for (const [id, state] of conflictState.entries()) {
  const extra = state.count - 1;
  if (extra <= 0) continue;
  duplicatesRemoved += extra;
  conflictEntries[id] = {
    count: extra,
    differing: state.first_record !== state.last_record,
    first_src: state.first_src.replace(/\.jsonl$/, ''),
    last_src: state.last_src.replace(/\.jsonl$/, ''),
  };
}

const dedupReport = {
  conflicting_ids: Object.keys(conflictEntries).length,
  conflicts: conflictEntries,
  duplicates_removed: duplicatesRemoved,
  policy: 'last',
  total_records: totalRecords,
  unique_ids: dedupedLines.filter((entry) => entry.id !== null).length,
};
const dedupedUniqueIds = dedupReport.unique_ids;

fs.writeFileSync(path.join(DIR, 'full-graph.jsonl'), dedupedBlob);
fs.writeFileSync(path.join(DIR, 'full-graph.sha256'), `${dedupedSha}\n`);
fs.writeFileSync(TARGET_REPORT, `${JSON.stringify(dedupReport, null, 2)}\n`);
fs.writeFileSync(
  path.join(DIR, 'full-graph.meta.json'),
  `${JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      layers: perLayerCounts,
      total: dedupedRecords,
      sha256: dedupedSha,
      duplicates_removed: duplicatesRemoved,
      dedup_policy: 'last',
      duplicate_report: TARGET_REPORT_PATH,
      edges_without_id: dedupedRecords - dedupedUniqueIds,
      unique_node_ids: dedupedUniqueIds,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `full graph: ${dedupedRecords} records | unique IDs: ${dedupedUniqueIds} |` +
    ` edges: ${dedupedRecords - dedupedUniqueIds} | duplicates removed: ${duplicatesRemoved}`,
);
console.log(`dedup report: ${TARGET_REPORT_PATH}`);
console.log(`sha256: ${dedupedSha}`);
console.log('layers:', layerFiles.length, '| sha256:', dedupedSha.slice(0, 16) + '...');
