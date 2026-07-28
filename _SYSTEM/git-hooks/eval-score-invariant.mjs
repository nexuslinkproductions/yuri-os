#!/usr/bin/env node
// eval-score-invariant.mjs — pre-commit score-invariant gate (owner-approved 2026-07-28, Hermes spec).
//
// WHAT: when a commit touches _SYSTEM/eval under YURI_EVAL_UNFREEZE=1, re-measure the find-series
// score (fastlex, frozen scorer, equals form) and REFUSE the commit if it moved off the pin —
// unless YURI_EVAL_SERIES_BREAK=1 is also set (deliberate series break, printed loudly).
//
// WHY: "no scoring math changed" was a SENTENCE IN A COMMIT MESSAGE, verified only when someone
// remembered. This converts the asserted claim into a checked fact at the point of temptation.
// The gate does not make eval work harder; it makes a moved score a deliberate act with a name.
//
// PIN POLICY — read before loosening anything:
//   * Pinned on the FIND series (n=40) ONLY. locate/enter are contaminated-exploratory; pinning
//     the composite would bind the gate to numbers already disowned.
//   * THE n>=100 SET WILL TRIP THIS GATE BY DESIGN. When the owner lands the new find set, the
//     find score WILL move and the gate WILL refuse. That is CORRECT — a changed benchmark IS a
//     series break. The right response is YURI_EVAL_SERIES_BREAK=1 plus re-baselining every arm
//     and re-pinning, never loosening this gate. Do not "fix" the false alarm; it is not false.
//   * COULD-NOT-MEASURE (missing/locked/rebuilding search index, scorer error, malformed output)
//     also rejects, but says so PLAINLY and names the path — a gate that silently passes on a
//     measurement failure is inert, which is worse than absent.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCORER = path.join(ROOT, '_SYSTEM/eval/atlas-score.mjs');
// TEST-ONLY override for the could-not-measure branch (verification (e)). It can only make the
// gate FAIL CLOSED harder (a nonexistent path -> could-not-measure -> reject), never pass.
const INDEX_DB = process.env.EVAL_INVARIANT_INDEX_OVERRIDE
  ? path.resolve(ROOT, process.env.EVAL_INVARIANT_INDEX_OVERRIDE)
  : path.join(ROOT, '_SYSTEM/OS_KERNEL/search-index.db');
const PINNED_FIND = 0.3450;
const EXPECTED_FIND_N = 40;

const seriesBreak = process.env.YURI_EVAL_SERIES_BREAK === '1';

function rejectCouldNotMeasure(reason) {
  console.error(`[pre-commit] REJECTED — score-invariant gate COULD NOT MEASURE (fail-closed): ${reason}`);
  console.error('    The gate refuses eval commits it cannot verify, rather than passing silently.');
  console.error('    Fix the measurement substrate (search index, scorer) and retry.');
  process.exit(1);
}

if (!existsSync(INDEX_DB)) rejectCouldNotMeasure(`search index missing at ${INDEX_DB}`);

let stdout;
try {
  stdout = execFileSync(process.execPath, [SCORER, '--resolver=fastlex', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
    timeout: 120000,
  });
} catch (err) {
  rejectCouldNotMeasure(`scorer failed: ${String(err?.stderr || err?.message || err).slice(0, 300)}`);
}

let parsed;
try {
  parsed = JSON.parse(stdout);
} catch (err) {
  rejectCouldNotMeasure(`scorer emitted non-JSON output: ${err.message}`);
}

if (!Array.isArray(parsed.per_question)) rejectCouldNotMeasure('scorer output has no per_question array');
const findRows = parsed.per_question.filter((q) => (q.type || 'find') === 'find');
if (findRows.length === 0) rejectCouldNotMeasure('scorer output contains zero find questions');
if (findRows.length !== EXPECTED_FIND_N) {
  rejectCouldNotMeasure(`find series has n=${findRows.length}, expected ${EXPECTED_FIND_N} — the pin covers the 40-question series only`);
}
// Every find row must carry a FINITE value — coercing malformed/missing values to zero could
// accidentally reproduce the pin and pass a broken scorer.
const malformed = findRows.find((q) => typeof q.value !== 'number' || !Number.isFinite(q.value));
if (malformed) rejectCouldNotMeasure(`find row ${malformed.id || '?'} has non-finite value (${JSON.stringify(malformed.value)})`);
const findMean = findRows.reduce((a, q) => a + q.value, 0) / findRows.length;
if (!Number.isFinite(findMean)) rejectCouldNotMeasure('find mean is not finite');

if (Math.abs(findMean - PINNED_FIND) < 1e-9) {
  console.log(`[pre-commit]   score-invariant: find=${findMean.toFixed(4)} == pin ${PINNED_FIND.toFixed(4)} — scoring math unchanged, verified not asserted`);
  process.exit(0);
}

if (seriesBreak) {
  console.log(`[pre-commit]   SERIES BREAK DECLARED (YURI_EVAL_SERIES_BREAK=1): find ${PINNED_FIND.toFixed(4)} -> ${findMean.toFixed(4)}`);
  console.log('    Every prior arm score is INCOMPARABLE across this break. Re-baseline every arm,');
  console.log('    re-pin eval-score-invariant.mjs, and record the break in the results log.');
  process.exit(0);
}

console.error(`[pre-commit] REJECTED — score-invariant gate: find series MOVED ${PINNED_FIND.toFixed(4)} -> ${findMean.toFixed(4)}`);
console.error('    "No scoring math changed" is now a CHECKED FACT, and it failed. The scorer, the');
console.error('    questions, the hit rules, or the corpus substrate changed what the number means.');
console.error('');
console.error('    If this movement is a deliberate construct-validity repair or a new benchmark:');
console.error('        YURI_EVAL_SERIES_BREAK=1 YURI_EVAL_UNFREEZE=1 git commit ...');
console.error('    A construct-validity repair TERMINATES the score series: re-baseline every arm,');
console.error('    record the version break, and treat all prior scores as incomparable across it.');
console.error('');
console.error('    NOTE: the n>=100 area-spread set will move this number BY DESIGN. That is a real');
console.error('    series break, not a false alarm — do not loosen this gate to silence it.');
process.exit(1);
