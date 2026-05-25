#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { consolidateWeek } from './weekly-comp.mjs';

const root = mkdtempSync(join(tmpdir(), 'self-improvement-crossref-'));
const extractDir = resolve(root, '02_EXTRACT');
const entriesDir = resolve(extractDir, 'entries');
const experimentsDir = resolve(extractDir, 'experiments');
mkdirSync(resolve(entriesDir, 'operations'), { recursive: true });
mkdirSync(resolve(entriesDir, 'design'), { recursive: true });
mkdirSync(resolve(experimentsDir, 'legal'), { recursive: true });

writeFileSync(
  resolve(entriesDir, 'operations', 'framing.md'),
  '---\ntags: framing_failure\n---\n# Wrong Market Question\n\n- What question did I answer instead of the real one?\n',
  'utf-8'
);
writeFileSync(
  resolve(entriesDir, 'design', 'approval.md'),
  '---\ntags: missing_gate, framing_failure\n---\n# Missing Gate\n\n- Which approval or readiness check was skipped?\n',
  'utf-8'
);
writeFileSync(
  resolve(experimentsDir, 'legal', 'source.md'),
  '---\ntags: source_of_truth_mismatch\n---\n# Source of Truth Mismatch\n\n- Which resolution source was treated as authoritative?\n',
  'utf-8'
);

const result = consolidateWeek({ rootDir: root, week: '2026-W99', dryRun: true });
const tags = result.index.tags.map(bucket => bucket.tag);

assert.ok(tags.includes('framing_failure'));
assert.ok(tags.includes('missing_gate'));
assert.ok(tags.includes('source_of_truth_mismatch'));
assert.equal(result.index.bridges.some(bucket => bucket.tag === 'framing_failure'), true);
assert.equal(result.index.totalLessons, 3);

console.log('cross-reference.test: ok');
