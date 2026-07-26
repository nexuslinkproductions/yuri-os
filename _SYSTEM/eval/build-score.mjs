#!/usr/bin/env node
/**
 * build-score.mjs — one scalar-plus-components health surface over YURI's
 * existing gates (tests, secret-leak scan, repo-integrity tripwire).
 *
 * WHY THIS EXISTS
 * YURI has gates (pass/fail) but no gradient (a number that moves). A gate
 * tells a climbing loop nothing about direction — every failure scores the
 * same. This aggregates the gates that ALREADY exist into one queryable
 * number so (a) a future improvement loop can climb it, and (b) an external
 * LLM docking into YURI as a runtime can ask "what is the health of this
 * subsystem right now?" and get a scalar instead of prose to trust.
 *
 * DESIGN CONSTRAINTS (deliberate, do not "improve" without re-reading this)
 * - JSON-first, stable schema, no interactive output, no ANSI colour in
 *   --json mode. This is a machine-consumed surface first, a human-readable
 *   one-liner second.
 * - The formula is BORING and FIXED. No adaptive thresholds, no self-tuning
 *   weights, nothing that changes its own scale — a scorer that moves its
 *   own goalposts makes historical scores incomparable. If the formula ever
 *   needs to change, that is a new version, not a silent drift.
 * - Every component is a ratio or a count, NEVER a boolean surfaced as pass/
 *   fail. `secrets: 1` not `secrets: FAIL`. That is the entire point.
 * - A missing/unavailable component is reported as `null` and EXCLUDED from
 *   the weighted score (weights renormalize over what's present). Missing
 *   is not the same claim as broken; scoring it 0 would conflate them.
 *
 * SCORING FORMULA (v1 — fixed, do not auto-tune)
 *   components (each raw value + a 0..1 sub-score):
 *     tests    : passed / total, across ALL *.test.mjs suites discovered
 *                under _SYSTEM/Scripts. weight 0.65
 *     secrets  : findings.length from secret-leak-scan.mjs --json.
 *                sub-score = 1 / (1 + findings.length). weight 0.20
 *     integrity: ok boolean from repo-integrity-tripwire.mjs --json.
 *                sub-score = ok ? 1 : 0. weight 0.15
 *   build_score = Σ(sub-score_i * weight_i) / Σ(weight_i for available i)
 *   Any component whose underlying tool is not present/executable on this
 *   checkout is reported `null` and its weight is dropped from the
 *   denominator (renormalization), never treated as a 0.
 *
 * NOISE HANDLING (adopted from trevin-creator/autoresearch-mlx's rigor.py
 * idea: build metrics are noisy — flaky tests, timing variance — so a
 * single run cannot tell a real regression from noise).
 *   --runs=N (default 1): execute the full suite discovery+run N times,
 *   report the MEDIAN build_score plus its VARIANCE, and identify suites
 *   whose pass/fail status differs across runs as n_flaky. A climbing loop
 *   must be able to tell signal from noise; that is not optional.
 *
 * SAFETY
 *   - git status --porcelain is snapshotted before and after the run. Any
 *     working-tree delta is reported loudly as tree_mutated + the paths.
 *     Nothing is reverted automatically — only reported.
 *   - Suites are spawned with an explicitly scrubbed env: YURI_ENERGY_ENFORCE,
 *     YURI_MLP_LEARN, YURI_SPRINT_MODE, and any *_UNFREEZE key are stripped
 *     before spawn, so scoring a build can never arm a gated feature.
 *   - Each suite gets a hard per-process timeout (default 60000ms,
 *     --timeout-ms=N). A timeout counts as a suite ERROR, never a silent
 *     skip.
 *   - --sample=N scores a random-but-seeded (fixed seed, deterministic)
 *     subset of N suites when the full run would be expensive, and the
 *     output is unambiguously marked `sampled: true` — a sampled score must
 *     never be presented as if it were a full one.
 *
 * SUITE CLASSIFICATION
 *   A suite (*.test.mjs file) is run as its own child process:
 *     `node <file>` with a scrubbed env and a hard timeout.
 *   - If stdout contains node:test TAP markers (`ℹ pass N` / `ℹ fail N`),
 *     those exact counts are used for the tests component.
 *   - Else if stdout contains bespoke `PASS `/`FAIL ` lines (the other
 *     common in-repo convention), those line counts are used.
 *   - Else the whole suite is one test: passed iff exit code 0.
 *   A suite is "erroring" (counted separately from ordinary assertion
 *   failure) when it produced NO parseable pass/fail signal at all AND
 *   exited non-zero — i.e. it threw before/outside any test ran (import
 *   error, uncaught exception, timeout). An erroring suite still counts as
 *   0 tests passed of its own N (or 1/1 failed if N could not be
 *   determined) toward the tests component; suites_erroring is reported
 *   as an additional diagnostic count, not a separate weighted component
 *   (folding it into `tests` avoids double-counting the same failure).
 *
 * CLI: --json --runs=N --sample=N --timeout-ms=N --verbose --help --test
 * Zero external deps. ESM. Node 20+.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const GATED_ENV_KEYS_EXACT = ['YURI_ENERGY_ENFORCE', 'YURI_MLP_LEARN', 'YURI_SPRINT_MODE'];
const DEFAULT_TIMEOUT_MS = 60_000;
const FIXED_SAMPLE_SEED = 0x5eed_1234; // fixed, deterministic — never randomized across runs

const WEIGHTS = Object.freeze({
  tests: 0.65,
  secrets: 0.20,
  integrity: 0.15,
});

// ── CLI parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    json: false,
    runs: 1,
    sample: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    verbose: false,
    help: false,
    selfTest: false,
  };
  for (const raw of argv) {
    if (raw === '--json') out.json = true;
    else if (raw === '--verbose') out.verbose = true;
    else if (raw === '--help' || raw === '-h') out.help = true;
    else if (raw === '--test') out.selfTest = true;
    else if (raw.startsWith('--runs=')) out.runs = Math.max(1, parseInt(raw.slice(7), 10) || 1);
    else if (raw.startsWith('--sample=')) out.sample = Math.max(1, parseInt(raw.slice(9), 10) || null);
    else if (raw.startsWith('--timeout-ms=')) out.timeoutMs = Math.max(1, parseInt(raw.slice(13), 10) || DEFAULT_TIMEOUT_MS);
  }
  return out;
}

const HELP_TEXT = `build-score.mjs — aggregate YURI's existing gates into one scalar

Usage: node _SYSTEM/eval/build-score.mjs [options]

Options:
  --json           emit machine-readable JSON (no ANSI, stable schema)
  --runs=N         run the full suite N times, report median + variance (default 1)
  --sample=N       score a random-but-seeded subset of N suites (marks sampled:true)
  --timeout-ms=N   per-suite hard timeout in ms (default ${DEFAULT_TIMEOUT_MS})
  --verbose        print per-suite detail to stderr as it runs
  --test           run the self-test of the scoring/aggregation math and exit
  --help           show this text
`;

// ── deterministic seeded PRNG (mulberry32) — for --sample only ─────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededSample(list, n, seed) {
  const rand = mulberry32(seed);
  const pool = list.slice();
  const picked = [];
  const take = Math.min(n, pool.length);
  for (let i = 0; i < take; i++) {
    const idx = Math.floor(rand() * pool.length);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  picked.sort(); // deterministic order regardless of pick order
  return picked;
}

// ── discovery ────────────────────────────────────────────────────────────────

function discoverSuites() {
  const scriptsDir = path.join(REPO_ROOT, '_SYSTEM', 'Scripts');
  const found = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.test.mjs')) found.push(full);
    }
  }
  walk(scriptsDir);
  found.sort();
  return found;
}

// ── env scrubbing ───────────────────────────────────────────────────────────

function scrubbedEnv(base = process.env) {
  const env = { ...base };
  for (const key of GATED_ENV_KEYS_EXACT) delete env[key];
  for (const key of Object.keys(env)) {
    if (key.endsWith('_UNFREEZE')) delete env[key];
  }
  return env;
}

// ── suite output parsing ────────────────────────────────────────────────────

function parseSuiteResult(stdout, exitCode, timedOut) {
  if (timedOut) {
    return { passed: 0, total: 1, erroring: true, reason: 'timeout' };
  }
  // node:test direct-run TAP summary lines: "ℹ pass N" / "ℹ fail N"
  const passMatch = stdout.match(/^ℹ pass (\d+)/m);
  const failMatch = stdout.match(/^ℹ fail (\d+)/m);
  if (passMatch && failMatch) {
    const passed = parseInt(passMatch[1], 10);
    const failed = parseInt(failMatch[1], 10);
    return { passed, total: passed + failed, erroring: false };
  }
  // bespoke convention: lines starting with "PASS " / "FAIL "
  const passLines = (stdout.match(/^PASS /gm) || []).length;
  const failLines = (stdout.match(/^FAIL /gm) || []).length;
  if (passLines + failLines > 0) {
    return { passed: passLines, total: passLines + failLines, erroring: false };
  }
  // no parseable per-test signal — whole suite is one test
  if (exitCode === 0) return { passed: 1, total: 1, erroring: false };
  return { passed: 0, total: 1, erroring: true, reason: 'no_parseable_result_nonzero_exit' };
}

function runSuite(file, timeoutMs, verbose) {
  const start = Date.now();
  const result = spawnSync(process.execPath, [file], {
    cwd: REPO_ROOT,
    env: scrubbedEnv(),
    encoding: 'utf8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: 16 * 1024 * 1024,
  });
  const durationMs = Date.now() - start;
  const timedOut = result.error && result.error.code === 'ETIMEDOUT';
  const stdout = result.stdout || '';
  const parsed = parseSuiteResult(stdout, result.status, timedOut);
  if (verbose) {
    const rel = path.relative(REPO_ROOT, file);
    process.stderr.write(
      `[build-score] ${parsed.erroring ? 'ERROR' : 'ok'} ${rel} ` +
      `(${parsed.passed}/${parsed.total}, ${durationMs}ms)${parsed.reason ? ' — ' + parsed.reason : ''}\n`
    );
  }
  return { file, ...parsed, durationMs };
}

// ── external gate wrappers ──────────────────────────────────────────────────

function runSecretScan() {
  const scriptPath = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'secret-leak-scan.mjs');
  if (!fs.existsSync(scriptPath)) return null;
  const result = spawnSync(process.execPath, [scriptPath, '--json'], {
    cwd: REPO_ROOT,
    env: scrubbedEnv(),
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (!result.stdout) return null;
  try {
    const parsed = JSON.parse(result.stdout);
    const findings = Array.isArray(parsed.findings) ? parsed.findings.length : null;
    if (findings === null) return null;
    return { findings, ok: parsed.ok === true, raw: parsed };
  } catch {
    return null;
  }
}

function runIntegrityTripwire() {
  const scriptPath = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'repo-integrity-tripwire.mjs');
  if (!fs.existsSync(scriptPath)) return null;
  const result = spawnSync(process.execPath, [scriptPath, '--json'], {
    cwd: REPO_ROOT,
    env: scrubbedEnv(),
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (!result.stdout) return null;
  try {
    const parsed = JSON.parse(result.stdout);
    if (typeof parsed.ok !== 'boolean') return null;
    return { ok: parsed.ok, raw: parsed };
  } catch {
    return null;
  }
}

// ── scoring math (pure — covered by --test) ─────────────────────────────────

function testsSubScore(passed, total) {
  if (total <= 0) return null;
  return passed / total;
}

function secretsSubScore(findingsCount) {
  if (findingsCount === null || findingsCount === undefined) return null;
  return 1 / (1 + findingsCount);
}

function integritySubScore(ok) {
  if (ok === null || ok === undefined) return null;
  return ok ? 1 : 0;
}

function weightedScore(subScores, weights) {
  // subScores: { tests: number|null, secrets: number|null, integrity: number|null }
  let sumW = 0;
  let sumWS = 0;
  for (const key of Object.keys(weights)) {
    const v = subScores[key];
    if (v === null || v === undefined) continue;
    sumW += weights[key];
    sumWS += weights[key] * v;
  }
  if (sumW === 0) return null;
  return sumWS / sumW;
}

function median(nums) {
  if (nums.length === 0) return null;
  const sorted = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function variance(nums) {
  if (nums.length === 0) return null;
  if (nums.length === 1) return 0;
  const m = nums.reduce((a, b) => a + b, 0) / nums.length;
  return nums.reduce((acc, x) => acc + (x - m) ** 2, 0) / nums.length;
}

// ── git tree-mutation check ──────────────────────────────────────────────────

function gitStatusPorcelain() {
  const result = spawnSync('git', ['status', '--porcelain'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null; // not fatal — report as unknown
  return result.stdout;
}

// ── one full scoring pass over the discovered suites ────────────────────────

function scoreOnce(suiteFiles, opts) {
  const suiteResults = suiteFiles.map((f) => runSuite(f, opts.timeoutMs, opts.verbose));
  const totalPassed = suiteResults.reduce((a, r) => a + r.passed, 0);
  const totalTests = suiteResults.reduce((a, r) => a + r.total, 0);
  const suitesErroring = suiteResults.filter((r) => r.erroring).length;

  const secrets = runSecretScan();
  const integrity = runIntegrityTripwire();

  const subScores = {
    tests: testsSubScore(totalPassed, totalTests),
    secrets: secretsSubScore(secrets ? secrets.findings : null),
    integrity: integritySubScore(integrity ? integrity.ok : null),
  };
  const build_score = weightedScore(subScores, WEIGHTS);

  return {
    build_score,
    subScores,
    totalPassed,
    totalTests,
    suitesErroring,
    suiteResults,
    secrets,
    integrity,
  };
}

// ── self-test (synthetic inputs — no repo state involved) ──────────────────

function selfTest() {
  const failures = [];
  function assertEq(label, actual, expected) {
    const ok = Math.abs(actual - expected) < 1e-9 || actual === expected;
    if (!ok) failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
  function assertNull(label, actual) {
    if (actual !== null) failures.push(`${label}: expected null, got ${actual}`);
  }

  assertEq('testsSubScore basic', testsSubScore(80, 100), 0.8);
  assertNull('testsSubScore zero-total', testsSubScore(0, 0));
  assertEq('secretsSubScore zero findings', secretsSubScore(0), 1);
  assertEq('secretsSubScore one finding', secretsSubScore(1), 0.5);
  assertEq('secretsSubScore two findings', secretsSubScore(2), 1 / 3);
  assertNull('secretsSubScore null', secretsSubScore(null));
  assertEq('integritySubScore ok', integritySubScore(true), 1);
  assertEq('integritySubScore not-ok', integritySubScore(false), 0);
  assertNull('integritySubScore null', integritySubScore(null));

  // all present, weights sum to 1 exactly
  assertEq(
    'weightedScore all present',
    weightedScore({ tests: 1, secrets: 1, integrity: 1 }, WEIGHTS),
    1
  );
  assertEq(
    'weightedScore all zero',
    weightedScore({ tests: 0, secrets: 0, integrity: 0 }, WEIGHTS),
    0
  );
  // renormalization: integrity missing → weight redistributed, not scored as 0
  {
    const withoutIntegrity = weightedScore({ tests: 1, secrets: 1, integrity: null }, WEIGHTS);
    assertEq('weightedScore renormalizes missing component', withoutIntegrity, 1);
  }
  {
    // missing component must NOT silently act like a 0 — construct a case where
    // treating null as 0 would give a different answer than renormalization
    const renorm = weightedScore({ tests: 0.5, secrets: null, integrity: 1 }, WEIGHTS);
    const expected = (WEIGHTS.tests * 0.5 + WEIGHTS.integrity * 1) / (WEIGHTS.tests + WEIGHTS.integrity);
    assertEq('weightedScore renorm matches manual calc', renorm, expected);
  }
  assertNull('weightedScore all missing', weightedScore({ tests: null, secrets: null, integrity: null }, WEIGHTS));

  assertEq('median odd', median([1, 2, 3]), 2);
  assertEq('median even', median([1, 2, 3, 4]), 2.5);
  assertNull('median empty', median([]));

  assertEq('variance constant', variance([5, 5, 5]), 0);
  assertEq('variance single', variance([5]), 0);
  {
    // variance of [1,2,3] = mean 2, sum sq dev = 1+0+1=2, /3 = 0.6667
    const v = variance([1, 2, 3]);
    assertEq('variance basic', v, 2 / 3);
  }
  assertNull('variance empty', variance([]));

  // parseSuiteResult synthetic TAP / bespoke / fallback paths
  {
    const r = parseSuiteResult('ℹ pass 4\nℹ fail 1\n', 1, false);
    assertEq('parseSuiteResult TAP passed', r.passed, 4);
    assertEq('parseSuiteResult TAP total', r.total, 5);
  }
  {
    const r = parseSuiteResult('PASS a\nPASS b\nFAIL c: nope\n', 1, false);
    assertEq('parseSuiteResult bespoke passed', r.passed, 2);
    assertEq('parseSuiteResult bespoke total', r.total, 3);
  }
  {
    const r = parseSuiteResult('', 0, false);
    assertEq('parseSuiteResult exit0 fallback passed', r.passed, 1);
    assertEq('parseSuiteResult exit0 fallback total', r.total, 1);
  }
  {
    const r = parseSuiteResult('', 1, false);
    assertEq('parseSuiteResult exit1 fallback passed', r.passed, 0);
    if (!r.erroring) failures.push('parseSuiteResult exit1 fallback should be erroring');
  }
  {
    const r = parseSuiteResult('', null, true);
    if (!r.erroring) failures.push('parseSuiteResult timeout should be erroring');
  }

  // seededSample determinism
  {
    const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const s1 = seededSample(list, 3, FIXED_SAMPLE_SEED);
    const s2 = seededSample(list, 3, FIXED_SAMPLE_SEED);
    if (JSON.stringify(s1) !== JSON.stringify(s2)) {
      failures.push(`seededSample not deterministic: ${JSON.stringify(s1)} vs ${JSON.stringify(s2)}`);
    }
    if (s1.length !== 3) failures.push(`seededSample wrong size: ${s1.length}`);
  }

  // env scrubbing removes exact + suffix-matched keys, leaves others intact
  {
    const env = scrubbedEnv({
      YURI_ENERGY_ENFORCE: '1',
      YURI_MLP_LEARN: '1',
      YURI_SPRINT_MODE: '1',
      SOMETHING_UNFREEZE: '1',
      KEEP_ME: 'yes',
    });
    for (const k of ['YURI_ENERGY_ENFORCE', 'YURI_MLP_LEARN', 'YURI_SPRINT_MODE', 'SOMETHING_UNFREEZE']) {
      if (k in env) failures.push(`scrubbedEnv failed to strip ${k}`);
    }
    if (env.KEEP_ME !== 'yes') failures.push('scrubbedEnv dropped an unrelated key');
  }

  if (failures.length > 0) {
    console.error('SELF-TEST FAILED:');
    for (const f of failures) console.error(' - ' + f);
    process.exit(1);
  }
  console.log('SELF-TEST PASSED: scoring/aggregation math verified on synthetic inputs.');
  process.exit(0);
}

// ── main ─────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }
  if (opts.selfTest) {
    selfTest();
    return;
  }

  const overallStart = Date.now();
  const statusBefore = gitStatusPorcelain();

  let suiteFiles = discoverSuites();
  let sampled = false;
  if (opts.sample && opts.sample < suiteFiles.length) {
    suiteFiles = seededSample(suiteFiles, opts.sample, FIXED_SAMPLE_SEED);
    sampled = true;
  }

  const runsData = [];
  for (let i = 0; i < opts.runs; i++) {
    if (opts.verbose) process.stderr.write(`[build-score] run ${i + 1}/${opts.runs}\n`);
    runsData.push(scoreOnce(suiteFiles, opts));
  }

  const statusAfter = gitStatusPorcelain();
  const durationS = (Date.now() - overallStart) / 1000;

  // flakiness: per-suite pass/fail status differing across runs
  const perSuiteStatusAcrossRuns = new Map(); // file -> array of booleans (passed-suite-wide)
  for (const run of runsData) {
    for (const r of run.suiteResults) {
      const suiteWidePass = !r.erroring && r.passed === r.total;
      if (!perSuiteStatusAcrossRuns.has(r.file)) perSuiteStatusAcrossRuns.set(r.file, []);
      perSuiteStatusAcrossRuns.get(r.file).push(suiteWidePass);
    }
  }
  let nFlaky = 0;
  for (const statuses of perSuiteStatusAcrossRuns.values()) {
    const allSame = statuses.every((s) => s === statuses[0]);
    if (!allSame) nFlaky++;
  }

  const scores = runsData.map((r) => r.build_score).filter((s) => s !== null);
  const build_score = scores.length > 0 ? median(scores) : null;
  const build_score_variance = scores.length > 0 ? variance(scores) : null;

  const lastRun = runsData[runsData.length - 1];

  // tree mutation detection
  let treeMutated = false;
  let mutatedPaths = [];
  if (statusBefore !== null && statusAfter !== null && statusBefore !== statusAfter) {
    treeMutated = true;
    const beforeLines = new Set(statusBefore.split('\n').filter(Boolean));
    const afterLines = statusAfter.split('\n').filter(Boolean);
    mutatedPaths = afterLines.filter((l) => !beforeLines.has(l));
    // also catch lines that disappeared (reverted/staged differently)
    const afterSet = new Set(afterLines);
    for (const l of beforeLines) if (!afterSet.has(l)) mutatedPaths.push(l);
  }

  const report = {
    build_score: build_score !== null ? Number(build_score.toFixed(4)) : null,
    build_score_variance: build_score_variance !== null ? Number(build_score_variance.toFixed(6)) : null,
    components: {
      tests: {
        sub_score: lastRun.subScores.tests !== null ? Number(lastRun.subScores.tests.toFixed(4)) : null,
        passed: lastRun.totalPassed,
        total: lastRun.totalTests,
        weight: WEIGHTS.tests,
      },
      secrets: {
        sub_score: lastRun.subScores.secrets !== null ? Number(lastRun.subScores.secrets.toFixed(4)) : null,
        findings: lastRun.secrets ? lastRun.secrets.findings : null,
        weight: WEIGHTS.secrets,
      },
      integrity: {
        sub_score: lastRun.subScores.integrity !== null ? Number(lastRun.subScores.integrity.toFixed(4)) : null,
        ok: lastRun.integrity ? lastRun.integrity.ok : null,
        weight: WEIGHTS.integrity,
      },
    },
    suites_total: suiteFiles.length,
    suites_erroring: lastRun.suitesErroring,
    n_flaky: nFlaky,
    runs: opts.runs,
    sampled,
    sample_size: sampled ? suiteFiles.length : null,
    duration_s: Number(durationS.toFixed(1)),
    tree_mutated: treeMutated,
    tree_mutated_paths: treeMutated ? mutatedPaths : [],
    generated_at: new Date().toISOString(),
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    const bs = report.build_score !== null ? report.build_score.toFixed(4) : 'null';
    const t = report.components.tests;
    const line =
      `build_score: ${bs}` +
      `   tests: ${t.passed}/${t.total} (${t.sub_score !== null ? t.sub_score.toFixed(3) : 'null'})` +
      `   suites_erroring: ${report.suites_erroring}` +
      `   duration_s: ${report.duration_s}` +
      `   secrets: ${report.components.secrets.findings === null ? 'null' : report.components.secrets.findings}` +
      `   integrity: ${report.components.integrity.ok === null ? 'null' : (report.components.integrity.ok ? 'ok' : 'FAIL')}` +
      `   n_flaky: ${report.n_flaky}` +
      (report.sampled ? `   sampled: true (${report.sample_size}/${report.suites_total})` : '') +
      (report.tree_mutated ? `   tree_mutated: true` : '');
    process.stdout.write(line + '\n');

    if (opts.verbose) {
      process.stderr.write('\n--- verbose detail ---\n');
      process.stderr.write(`suites discovered: ${report.suites_total}\n`);
      process.stderr.write(`runs: ${report.runs}` + (report.runs > 1 ? ` (variance: ${report.build_score_variance})\n` : '\n'));
      if (report.tree_mutated) {
        process.stderr.write(`TREE MUTATED — paths:\n`);
        for (const p of report.tree_mutated_paths) process.stderr.write(`  ${p}\n`);
      }
      const erroringFiles = lastRun.suiteResults.filter((r) => r.erroring);
      if (erroringFiles.length > 0) {
        process.stderr.write(`erroring suites (${erroringFiles.length}):\n`);
        for (const r of erroringFiles) {
          process.stderr.write(`  ${path.relative(REPO_ROOT, r.file)} — ${r.reason || 'unknown'}\n`);
        }
      }
    }
  }

  // exit code mirrors whether the score reflects a healthy build, but this
  // script's job is measurement, not gating — always exit 0 unless the
  // measurement itself failed to produce any signal at all.
  process.exit(build_score === null && !opts.selfTest ? 2 : 0);
}

main();
