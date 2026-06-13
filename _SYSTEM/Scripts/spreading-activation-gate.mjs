#!/usr/bin/env node
/**
 * spreading-activation-gate.mjs — promotion gate for roadmap organ 1.
 *
 * Question: does HYBRID recall (FTS5 entry-point → spreading activation over the
 * memory graph) beat FTS5-ONLY recall on hand-judged queries over .claude/memory?
 * Metric: recall@5 against a hand-judged relevant set per query. The judged sets
 * were fixed by the operator lane BEFORE running either system (no peeking).
 *
 * Honest framing: FTS5 is lexical (finds words), activation is associative (finds
 * neighbors of what was found). The hybrid should win precisely on queries whose
 * relevant memories are LINKED to, but don't SHARE WORDS with, the query.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestMemoryDir, recall } from './spreading-activation-memory.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// hand-judged BEFORE running (operator-lane judgment, 2026-06-11):
const JUDGED = [
  { query: 'wave 2 refactor memory fixes', relevant: ['wave2-fix-wave-2026-06-10', 'math-base-audit-2026-06-10', 'wave3-fix-wave-2026-06-11'] },
  { query: 'mimo lane dispatch', relevant: ['ref-mimo-integration', 'feedback-research-via-mimo-lane'] },
  { query: 'yeganeh formula canvas parked', relevant: ['parked-yeganeh-canvas-2026-06-11', 'wave3-fix-wave-2026-06-11'] },
  { query: 'design layout japanese aesthetics', relevant: ['feedback-layout-ma-not-slidedeck', 'feedback_motion_design_manifesto', 'feedback-design-iteration-marcel'] },
  { query: 'codex retired second opinion', relevant: ['feedback-codex-dispatch-discipline', 'ref-mimo-integration'] },
];

function fts5Top(query, k) {
  const out = execFileSync('node', ['_SYSTEM/Scripts/yuri-search.mjs', query, '--json', '--top', '40'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60000 });
  const j = JSON.parse(out);
  return (j.results || [])
    .filter((r) => r.path.startsWith('.claude/memory/'))
    .map((r) => path.basename(r.path, '.md'))
    .slice(0, k);
}

function recallAtK(hits, relevant, k) {
  const top = new Set(hits.slice(0, k));
  return relevant.filter((r) => top.has(r)).length / relevant.length;
}

const graph = ingestMemoryDir(path.join(REPO_ROOT, '.claude/memory'));
const K = 5;
let fSum = 0, hSum = 0;
const rows = [];
for (const { query, relevant } of JUDGED) {
  const fts = fts5Top(query, K);
  // hybrid: FTS5's best memory hit seeds activation; fall back to FTS5 if no seed
  const seeds = fts.filter((id) => graph.nodes.has(id)).slice(0, 2);
  const hybrid = seeds.length
    ? recall(graph, seeds).map((r) => r.id).slice(0, K)
    : fts;
  const f = recallAtK(fts, relevant, K);
  const h = recallAtK(hybrid, relevant, K);
  fSum += f; hSum += h;
  rows.push({ query, fts5: f.toFixed(2), hybrid: h.toFixed(2), seeds });
}
const fMean = fSum / JUDGED.length, hMean = hSum / JUDGED.length;
for (const r of rows) console.log(`${r.fts5}  ${r.hybrid}  ${r.query}  (seeds: ${r.seeds.join(', ') || 'none'})`);
console.log(`\nmean recall@${K}:  FTS5-only=${fMean.toFixed(3)}  hybrid=${hMean.toFixed(3)}`);
const verdict = hMean > fMean ? 'PASS' : hMean === fMean ? 'TIE' : 'FAIL';
console.log(`GATE: ${verdict}`);
process.exitCode = hMean >= fMean ? 0 : 1;
