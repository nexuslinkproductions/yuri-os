#!/usr/bin/env node
// @capability: ablation-descriptions-check
// @serves: ablation answer-echo gate | description contamination check | pre-audit gate
// @does: FAIL-CLOSED gate over _SYSTEM/Scripts/atlas/ablation-descriptions.json (Hermes
//   2026-07-28): no description may contain any find-40 expect path, expect basename, or a
//   near-paraphrase of any find-40 question. A description written with knowledge of the
//   question set measures marketing-copy alignment with the benchmark, not tool utility.
//   Near-paraphrase bar: token Jaccard >= 0.5 between a description's full text and any
//   question text (descriptions are short generic prose; 0.5 is deliberately conservative).
// @use: node _SYSTEM/Scripts/atlas/ablation-descriptions-check.mjs  -> exit 0 clean, 1 violation
// @exports: checkDescriptions

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DESCRIPTIONS = path.join(REPO_ROOT, '_SYSTEM/Scripts/atlas/ablation-descriptions.json');
const BENCHMARK = path.join(REPO_ROOT, '_SYSTEM/eval/atlas-benchmark.jsonl');
const NEAR_PARAPHRASE_JACCARD = 0.5;

function toks(s) {
  return new Set(String(s || '').toLowerCase().match(/[a-z0-9_.-]{3,}/g) || []);
}

export function checkDescriptions({ descriptionsPath = DESCRIPTIONS, benchmarkPath = BENCHMARK } = {}) {
  const doc = JSON.parse(readFileSync(descriptionsPath, 'utf8'));
  const items = readFileSync(benchmarkPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const violations = [];

  // FAIL CLOSED ON SHAPE: an empty or malformed input must never read as PASS.
  const REQUIRED_LABELS = ['tool_a', 'tool_b', 'tool_c', 'tool_d', 'tool_e'];
  if (!doc.descriptions || typeof doc.descriptions !== 'object') violations.push('descriptions object missing');
  const labels = Object.keys(doc.descriptions || {});
  for (const req of REQUIRED_LABELS) if (!labels.includes(req)) violations.push(`required label ${req} missing`);
  for (const l of labels) if (!REQUIRED_LABELS.includes(l)) violations.push(`unexpected label ${l}`);
  if (!Array.isArray(items) || items.length === 0) violations.push('benchmark is empty — gate has nothing to check against (fail closed)');
  if (violations.length > 0) return { violations, checked: labels.length };

  const expectPaths = new Set();
  const expectBasenames = new Set();
  for (const it of items) {
    for (const e of it.expect || []) {
      const norm = String(e).replace(/^\.\//, '').replace(/\/+$/, '');
      expectPaths.add(norm.toLowerCase());
      expectBasenames.add(path.basename(norm).toLowerCase());
      expectBasenames.add(path.basename(norm).replace(/\.[a-z0-9]+$/i, '').toLowerCase());
    }
  }

  for (const [label, desc] of Object.entries(doc.descriptions || {})) {
    const full = [desc.purpose, desc.inputs, desc.outputs, desc.failure_behaviour].join(' ').toLowerCase();
    // 1. literal expect path or basename in the description text
    for (const p of expectPaths) {
      if (p.length >= 8 && full.includes(p)) violations.push(`${label}: contains expect path "${p}"`);
    }
    for (const b of expectBasenames) {
      if (b.length >= 5 && full.includes(b)) violations.push(`${label}: contains expect basename "${b}"`);
    }
    // 2. near-paraphrase of any question
    const dt = toks(full);
    for (const it of items) {
      const qt = toks(it.q);
      if (qt.size === 0) continue;
      let inter = 0;
      for (const t of dt) if (qt.has(t)) inter++;
      const union = dt.size + qt.size - inter;
      const jac = union > 0 ? inter / union : 0;
      if (jac >= NEAR_PARAPHRASE_JACCARD) {
        violations.push(`${label}: near-paraphrase of ${it.id} (Jaccard ${jac.toFixed(2)} >= ${NEAR_PARAPHRASE_JACCARD}): "${String(it.q).slice(0, 60)}"`);
      }
    }
    // 3. template parity: identical section set, no examples, word budget
    const keys = Object.keys(desc).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...doc.template].sort())) {
      violations.push(`${label}: section set ${JSON.stringify(keys)} != template ${JSON.stringify(doc.template)}`);
    }
    const words = full.split(/\s+/).filter(Boolean).length;
    if (words > doc.byte_budget_words) violations.push(`${label}: ${words} words exceeds budget ${doc.byte_budget_words}`);
  }
  return { violations, checked: Object.keys(doc.descriptions || {}).length };
}

export function main() {
  const { violations, checked } = checkDescriptions();
  if (violations.length > 0) {
    console.error(`ablation-descriptions-check: FAIL (${violations.length} violations across ${checked} descriptions)`);
    for (const v of violations) console.error(`  ${v}`);
    return 1;
  }
  console.log(`ablation-descriptions-check: PASS (${checked} descriptions, no expect path/basename, no near-paraphrase >= ${NEAR_PARAPHRASE_JACCARD}, template parity)`);
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) process.exitCode = main();
