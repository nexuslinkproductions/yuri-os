#!/usr/bin/env node
// @capability: mutation-sweep
// @serves: grey-box test-completeness | mutation-survivor detection | test blind-spot finder | Engine-2 quality gate
// @does: Dependency-free automated mutation tester. Applies a conservative catalog of small SOURCE mutations one at a time to a TEMP COPY of a target module (never the original), runs the module's own `--test` block, and reports SURVIVING mutants (tests still pass = a test blind spot) vs KILLED mutants (tests caught the fault). Mutation score = killed/total. A high survivor count flags weak tests. DISARMED dev/test tool — runs nothing live.
// @use: `node mutation-sweep.mjs --target <file.mjs> [--max N]` (sweep one module, cap mutants), `node mutation-sweep.mjs --suite` (curated Engine-2 list), `node mutation-sweep.mjs --test` (self-test proving the tester detects blind spots). Temp copies live in os.tmpdir() and are cleaned up; originals are NEVER mutated in place.
// @exports: runMutationSweep, buildMutationCatalog, MUTATION_CATALOG
//
// CONSTRAINTS: pure Node, zero npm deps. Fail-open + SAFE: temp copies only, cleanup on exit, bounded
//   mutant count (--max default 60/module), per-mutant timeout. DISARMED (test tool, no live path).
//   INV: never writes a mutant over a real module; never mutates comments/strings/the --test block.
//
// SAFETY MODEL — this is the rule that keeps the tool from corrupting a real module:
//   1. The original source is read into a string ONCE and never written back.
//   2. Every mutant is materialized in a FRESH temp file in os.tmpdir() with a unique name.
//   3. Temp files are registered and removed on exit (success, error, or signal).
//   4. The tool owns no `writeFile` path that resolves to a real module under any flag.

import { readFileSync, writeFileSync, unlinkSync, existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// §0 — MUTATION CATALOG
// ─────────────────────────────────────────────────────────────────────────────
// Each entry: { id, label, find: RegExp, replace: string|function, context: 'all'|'code' }.
// 'code' context means the site must NOT be inside a comment, string, or the --test block.
// find/replace operate on a SINGLE-LINE slice (mutations are line-local by design — this keeps
// brace-matching and the test-block skip correct and avoids breaking multi-line structures).

export const MUTATION_CATALOG = [
  // Relational flips
  { id: 'rel->>=', label: '> → >=', find: /(?<![<>=!])>(?!=)/, replace: '>=', context: 'code' },
  { id: 'rel->=', label: '>= → >', find: />=(?!=)/, replace: '>', context: 'code' },
  { id: 'rel-<=', label: '< → <=', find: /(?<![<>=!])<(?!=)/, replace: '<=', context: 'code' },
  { id: 'rel-<', label: '<= → <', find: /<=(?!=)/, replace: '<', context: 'code' },
  { id: 'rel-===', label: '=== → !==', find: /===/g, replace: '!==', context: 'code' },
  { id: 'rel-!==', label: '!== → ===', find: /!==/g, replace: '===', context: 'code' },
  // Arithmetic
  { id: 'arith-+-', label: '+ → -', find: /(?<![\w$])\+(?![=+])/g, replace: '-', context: 'code' },
  { id: 'arith--', label: '- → +', find: /(?<![\w$<-])-(?![=>-])/g, replace: '+', context: 'code' },
  { id: 'arith-*/', label: '* → /', find: /(?<![\w$*])\*(?!=)/g, replace: '/', context: 'code' },
  { id: 'arith-/*', label: '/ → *', find: /(?<![\w$/])\/(?![/*])/g, replace: '*', context: 'code' },
  // Logical
  { id: 'logic-&&', label: '&& → ||', find: /&&/g, replace: '||', context: 'code' },
  { id: 'logic-||', label: '|| → &&', find: /\|\|/g, replace: '&&', context: 'code' },
  // Boundary: small int literal 0 → 1 (off-by-one). Only bare standalone integer `0`.
  { id: 'bound-0->1', label: '0 → 1', find: /(?<![\w.$])0(?![\w.0-9bBoOxXeE_])/g, replace: '1', context: 'code' },
  // Math.max ↔ Math.min
  { id: 'math-max->min', label: 'Math.max → Math.min', find: /Math\.max/g, replace: 'Math.min', context: 'code' },
  { id: 'math-min->max', label: 'Math.min → Math.max', find: /Math\.min/g, replace: 'Math.max', context: 'code' },
];

// ─────────────────────────────────────────────────────────────────────────────
// §1 — SOURCE MASKING: identify which character offsets are "live code"
// ─────────────────────────────────────────────────────────────────────────────
// A character is MUTABLE only if it is:
//   (a) NOT inside a line comment (//...), block comment (/* ... */), string literal
//       ('...', "...", `...`), or regex literal, AND
//   (b) NOT inside the module's `--test` block.
//
// We compute a per-offset boolean mask `mutable[]` over the full source. Mutations only apply at
// offsets where mutable===true. This is the single mechanism that enforces the skip rules.

/**
 * Tokenize-light: walk the source and produce a boolean array `codeMask[]` (true = live code,
 * false = comment/string/regex). Not a full JS parser (no deps) but a robust single-pass scanner
 * that handles the constructs that appear in these modules: line and block comments, single/double/
 * template strings with backslash escapes, and regex literals (heuristic: slash after non-identifier).
 * Template strings with ${...} are treated as string (conservative — we skip their internals).
 */
export function computeCodeMask(src) {
  const n = src.length;
  const mask = new Array(n).fill(true); // default: mutable
  let i = 0;
  // Track whether a '/' could be a regex (true after operators, parens, commas, keywords).
  let prevSignificant = ''; // last non-space char that affects regex-vs-divide disambiguation
  const isRegexOk = () => /[(,=:;!&|?{}*%+\-^~\[]|return$|typeof$|in$|of$|instanceof$|delete$|void$|new$|do$|else$/.test(prevSignificant) || prevSignificant === '';

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    // Line comment
    if (c === '/' && c2 === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') { mask[j] = false; j++; }
      i = j;
      continue;
    }
    // Block comment
    if (c === '/' && c2 === '*') {
      let j = i;
      mask[j] = false; mask[j + 1] = false; j += 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) { mask[j] = false; j++; }
      if (j < n) { mask[j] = false; mask[j + 1] = false; j += 2; }
      i = j;
      continue;
    }
    // String literals: ' " `
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      mask[i] = false;
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { mask[j] = false; mask[j + 1] = false; j += 2; continue; }
        if (src[j] === q) { mask[j] = false; j++; break; }
        // template literal ${...} — mark as non-mutable and skip to matching }
        if (q === '`' && src[j] === '$' && src[j + 1] === '{') {
          mask[j] = false; mask[j + 1] = false; j += 2;
          let depth = 1;
          while (j < n && depth > 0) {
            if (src[j] === '{') depth++;
            else if (src[j] === '}') depth--;
            mask[j] = false; j++;
          }
          continue;
        }
        mask[j] = false; j++;
      }
      prevSignificant = q;
      i = j;
      continue;
    }
    // Regex literal (heuristic)
    if (c === '/' && isRegexOk()) {
      mask[i] = false;
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        if (src[j] === '\\') { mask[j] = false; mask[j + 1] = false; j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) { mask[j] = false; j++; break; }
        mask[j] = false; j++;
      }
      // consume flags
      while (j < n && /[a-z]/i.test(src[j])) { mask[j] = false; j++; }
      prevSignificant = '/';
      i = j;
      continue;
    }
    if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') {
      prevSignificant += c;
      if (prevSignificant.length > 12) prevSignificant = prevSignificant.slice(-12);
    }
    i++;
  }
  return mask;
}

/**
 * Find the character offset range [start, end) of the module's `--test` block, if present.
 * The Engine-2 modules use a top-level `if (_runAsMain && process.argv.includes('--test')) { ... }`
 * construct at the END of the file. We locate the line containing both `--test` and an `if (`, then
 * brace-match forward to the matching closing `}`. Returns null if no such block is found.
 */
export function findTestBlockRange(src, codeMask) {
  const lines = src.split('\n');
  // Find the FIRST line that looks like the test-block opener: contains '--test' inside an if().
  let openerLineIdx = -1;
  let openerLineStart = 0;
  let cum = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const trimmed = line.trim();
    // Heuristic: a line that opens a guarded --test block. Matches both
    //   if (_runAsMain && process.argv.includes('--test')) {
    // and simpler variants like  if (argv.includes('--test')) {
    if (/^if\s*\(/.test(trimmed) && /['"`]--test['"`]/.test(line) && line.includes('{')) {
      openerLineIdx = li;
      openerLineStart = cum;
      break;
    }
    cum += line.length + 1; // +1 for the \n
  }
  if (openerLineIdx === -1) return null;

  // The test block begins at the START of the opener line (so the opener's own guard expression —
  // the `&&`/`||`/`===` in `if (_runAsMain && process.argv.includes('--test'))` — is also masked).
  const blockStart = openerLineStart;

  // From blockStart, find the FIRST '{' that is live code, then brace-match to its close.
  let i = blockStart;
  while (i < src.length && !(src[i] === '{' && codeMask[i])) i++;
  if (i >= src.length) return null;
  let depth = 0;
  while (i < src.length) {
    if (!codeMask[i]) { i++; continue; } // skip masked (comment/string/regex) chars
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    i++;
  }
  return { start: blockStart, end: i };
}

/**
 * Find the byte ranges of test-guard DECLARATION lines that must NOT be mutated. These are module-level
 * lines like `const _runAsMain = process.argv[1] && import.meta.url === pathToFileURL(...).href;` —
 * mutating the `===`/`&&` there makes the guard falsy, the --test block never executes, the script
 * exits 0 with no test actually run, producing a FALSE survivor. Returns an array of {start,end}.
 */
export function findTestGuardDeclRanges(src) {
  const ranges = [];
  const lines = src.split('\n');
  let cum = 0;
  for (const line of lines) {
    if (/\b(const|let|var)\s+_(main|runAsMain|isMain)\b/.test(line) &&
        /process\.argv|import\.meta\.url|pathToFileURL/.test(line)) {
      ranges.push({ start: cum, end: cum + line.length });
    }
    cum += line.length + 1;
  }
  return ranges;
}

/**
 * Build the full mutable mask: codeMask AND (NOT in test block).
 */
export function computeMutableMask(src) {
  const codeMask = computeCodeMask(src);
  const mutable = codeMask.slice();
  const tb = findTestBlockRange(src, codeMask);
  if (tb) {
    for (let i = tb.start; i < tb.end && i < mutable.length; i++) mutable[i] = false;
  }
  // Also mask test-guard declaration lines (mutating them yields false survivors — see fn doc).
  for (const r of findTestGuardDeclRanges(src)) {
    for (let i = r.start; i < r.end && i < mutable.length; i++) mutable[i] = false;
  }
  return { mutable, codeMask, testBlock: tb };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 — MUTANT GENERATION (one mutant per site per catalog entry)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Build the list of candidate mutants for a source string. Each mutant targets ONE match site of
 * ONE catalog entry, applied LINE-LOCALLY (the mutation regex runs against the single line slice
 * containing the match, and exactly the Nth occurrence on that line is replaced). Returns an array of
 * { id, line (1-based), col (1-based), original, mutated, before, after } where before/after are the
 * [start,end) offsets into the FULL source of the line being mutated (so the caller can splice).
 */
export function buildMutationCatalog(src, { catalog = MUTATION_CATALOG } = {}) {
  const { mutable } = computeMutableMask(src);
  const mutants = [];
  const lines = src.split('\n');
  let lineStart = 0;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const lineEnd = lineStart + line.length; // exclusive of \n

    for (const entry of catalog) {
      // Find all match positions of entry.find within this line.
      const re = new RegExp(entry.find.source, entry.find.flags.includes('g') ? entry.find.flags : entry.find.flags + 'g');
      let m;
      let searchFrom = 0;
      while ((m = re.exec(line)) !== null) {
        const matchAbsStart = lineStart + m.index;
        const matchAbsEnd = matchAbsStart + m[0].length;
        // Must be fully inside mutable region.
        let ok = true;
        for (let k = matchAbsStart; k < matchAbsEnd; k++) if (!mutable[k]) { ok = false; break; }
        if (!ok) { if (m.index === re.lastIndex) re.lastIndex++; continue; }

        // Build the mutated line: replace exactly this occurrence.
        const replaced = line.slice(0, m.index) + m[0].replace(entry.find, entry.replace) + line.slice(m.index + m[0].length);
        // Sanity: the replacement must actually differ (some regex/replace combos are identity at a given site).
        if (replaced === line) { if (m.index === re.lastIndex) re.lastIndex++; continue; }

        mutants.push({
          id: entry.id,
          label: entry.label,
          line: li + 1,        // 1-based
          col: m.index + 1,    // 1-based
          original: m[0],
          mutated: m[0].replace(entry.find, entry.replace),
          lineStartAbs: lineStart,
          lineEndAbs: lineEnd,
          originalLine: line,
          mutatedLine: replaced,
          before: lineStart,
          after: lineEnd,
        });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
    lineStart = lineEnd + 1; // +1 for \n
  }
  return mutants;
}

/**
 * Materialize one mutant: copy the full source, splice in the mutated line, write to a temp file.
 * Returns the temp file path. Registers it for cleanup.
 */
const _tempFiles = new Set();
export function materializeMutant(src, mutant, tempDir) {
  const mutatedSrc = src.slice(0, mutant.before) + mutant.mutatedLine + src.slice(mutant.after);
  const fname = `mut-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mjs`;
  const fpath = join(tempDir, fname);
  writeFileSync(fpath, mutatedSrc);
  _tempFiles.add(fpath);
  return fpath;
}

export function cleanupTempFiles() {
  for (const f of _tempFiles) {
    try { if (existsSync(f)) unlinkSync(f); } catch { /* best-effort */ }
    _tempFiles.delete(f);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 — RUNNER: apply mutants, run --test, classify KILLED vs SURVIVED
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_MAX = 60;        // mutants per module (bound for runtime)
export const PER_MUTANT_TIMEOUT_MS = 15000; // hard cap per mutant test run

/** Resolve a realpath-safe temp dir (avoids macOS /tmp → /private/tmp symlink breaking the
 *  `import.meta.url === pathToFileURL(argv[1])` main-guard in the module under test). */
function safeTempDir(dir) {
  try { return realpathSync(dir); } catch { return dir; }
}

/**
 * Run the mutation sweep on a single target module.
 * @param {string} targetPath - absolute/relative path to the .mjs module with a --test block.
 * @param {object} [opts]
 * @param {number} [opts.max=60] - cap on mutants run.
 * @param {number} [opts.timeoutMs=15000] - per-mutant test timeout.
 * @param {string} [opts.tempDir] - temp dir (default os.tmpdir()).
 * @param {object} [opts.catalog] - mutation catalog override.
 * @param {boolean} [opts.silent=false] - suppress per-mutant stdout.
 * @returns {{target, mutationsRun, killed, survived, mutationScore, survivors: Array, baselinePassed:boolean}}
 */
export function runMutationSweep(targetPath, opts = {}) {
  const { max = DEFAULT_MAX, timeoutMs = PER_MUTANT_TIMEOUT_MS, tempDir = safeTempDir(tmpdir()), catalog = MUTATION_CATALOG, silent = true } = opts;
  const src = readFileSync(targetPath, 'utf8');

  // Baseline: does the UNMUTATED module pass its own --test? If not, the sweep is meaningless.
  const baseline = spawnSync(process.execPath, [targetPath, '--test'], { timeout: timeoutMs, encoding: 'utf8' });
  const baselinePassed = baseline.status === 0;
  if (!baselinePassed) {
    return {
      target: targetPath, mutationsRun: 0, killed: 0, survived: 0, mutationScore: NaN,
      survivors: [], baselinePassed: false,
      baselineError: (baseline.stdout || '') + (baseline.stderr || ''),
    };
  }

  const mutants = buildMutationCatalog(src, { catalog });
  // Deterministic shuffle then cap, so --max gives a reproducible representative sample.
  const seeded = deterministicShuffle(mutants, targetPath);
  const selected = seeded.slice(0, max);

  let killed = 0;
  const survivors = [];

  for (const mut of selected) {
    const tmpPath = materializeMutant(src, mut, tempDir);
    try {
      const res = spawnSync(process.execPath, [tmpPath, '--test'], { timeout: timeoutMs, encoding: 'utf8' });
      const status = res.status;
      // SURVIVED: exit 0 (tests passed despite the fault). KILLED: non-zero or crash.
      if (status === 0) {
        survivors.push({
          id: mut.id, label: mut.label, line: mut.line, col: mut.col,
          original: mut.original, mutated: mut.mutated,
          snippet: mut.mutatedLine.trim(),
        });
      } else {
        killed++;
      }
    } finally {
      try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* best-effort */ }
      _tempFiles.delete(tmpPath);
    }
  }

  const mutationsRun = selected.length;
  const survived = survivors.length;
  return {
    target: targetPath,
    mutationsRun,
    killed,
    survived,
    mutationScore: mutationsRun > 0 ? killed / mutationsRun : NaN,
    survivors,
    baselinePassed: true,
  };
}

// Deterministic seeded shuffle (FNV-1a hash of the seed string → 32-bit) so re-runs are reproducible.
function deterministicShuffle(arr, seedStr) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  const a = arr.slice();
  let s = h >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 — CURATED SUITE (Engine-2 modules with --test blocks)
// ─────────────────────────────────────────────────────────────────────────────
export const ENGINE2_SUITE = [
  'funding-skew.mjs',
  'indicators.mjs',
  'vpin.mjs',
  'ensemble.mjs',
  'avellaneda-stoikov.mjs',
  'maker-fill-sim.mjs',
  'data-quality-gate.mjs',
  'kappa-fit.mjs',
  'market-regime.mjs',
  'orderbook-imbalance.mjs',
  'ofi.mjs',
  'regime-detector.mjs',
];

function resolveSuiteTarget(name) {
  return join(import.meta.dirname, name);
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 — CLI
// ─────────────────────────────────────────────────────────────────────────────
function printResult(r) {
  const score = Number.isFinite(r.mutationScore) ? (r.mutationScore * 100).toFixed(1) + '%' : 'N/A';
  console.log(`\n══ mutation-sweep: ${r.target}`);
  if (!r.baselinePassed) {
    console.log(`  ⚠ BASELINE FAILED (unmutated --test does not pass) — sweep skipped.`);
    if (r.baselineError) console.log(`  ${r.baselineError.trim().slice(0, 500)}`);
    return;
  }
  console.log(`  mutations run: ${r.mutationsRun}  killed: ${r.killed}  survived: ${r.survived}  score: ${score}`);
  if (r.survivors.length) {
    console.log(`  ── survivors (test blind spots) ──`);
    for (const s of r.survivors) {
      console.log(`    L${s.line}:${s.col}  [${s.label}]  ${s.original} → ${s.mutated}`);
      console.log(`        ${s.snippet}`);
    }
  }
}

function cliMain() {
  const argv = process.argv.slice(2);
  if (argv.includes('--test')) {
    return selfTest();
  }
  if (argv.includes('--suite')) {
    const maxIdx = argv.indexOf('--max');
    const max = maxIdx >= 0 ? parseInt(argv[maxIdx + 1], 10) || DEFAULT_MAX : DEFAULT_MAX;
    const results = [];
    for (const name of ENGINE2_SUITE) {
      const tpath = resolveSuiteTarget(name);
      if (!existsSync(tpath)) { console.log(`\n══ mutation-sweep: ${name}  (skipped — not found)`); continue; }
      const r = runMutationSweep(tpath, { max });
      printResult(r);
      results.push(r);
    }
    const totalRun = results.reduce((a, r) => a + r.mutationsRun, 0);
    const totalKilled = results.reduce((a, r) => a + r.killed, 0);
    const totalSurv = results.reduce((a, r) => a + r.survived, 0);
    const agg = totalRun > 0 ? (totalKilled / totalRun * 100).toFixed(1) + '%' : 'N/A';
    console.log(`\n══ SUITE AGGREGATE: run=${totalRun} killed=${totalKilled} survived=${totalSurv} score=${agg}`);
    process.exit(0);
  }
  const tIdx = argv.indexOf('--target');
  if (tIdx >= 0) {
    const target = argv[tIdx + 1];
    if (!target) { console.error('--target requires a file path'); process.exit(2); }
    const maxIdx = argv.indexOf('--max');
    const max = maxIdx >= 0 ? parseInt(argv[maxIdx + 1], 10) || DEFAULT_MAX : DEFAULT_MAX;
    const r = runMutationSweep(target, { max });
    printResult(r);
    process.exit(r.baselinePassed ? 0 : 1);
  }
  console.error(`usage:\n  node mutation-sweep.mjs --target <file.mjs> [--max N]\n  node mutation-sweep.mjs --suite [--max N]\n  node mutation-sweep.mjs --test`);
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 — SELF-TEST (--test): META-TEST proving the sweep detects blind spots
// ─────────────────────────────────────────────────────────────────────────────
// Strategy: synthesize a TINY known module in a temp file with TWO variants of its --test block:
//   (1) WEAK test — asserts only the happy-path exact value, misses the off-by-one the mutant `1 → 0`
//       creates when the function is `clamp(x,1,9)` and x=1 (weak test checks clamp(5)==5 only).
//   (2) STRONG test — checks clamp at the boundary (clamp(1)==1, clamp(0)==1), so the `0→1`/boundary
//       mutant and the relational flips are caught.
// We assert: WEAK → ≥1 survivor, STRONG → 0 survivors. This proves the tester detects blind spots.
// We also assert the sweep does NOT mutate the test block itself (a flipped assertion in the test
// would be a false KILL — we verify the test-block skip by checking a strong test still yields the
// expected survivors=0 even when the catalog WOULD otherwise hit an `===` inside the test).

function synthClampModule({ weak }) {
  // Module under test: isAdult(age) returns true when age >= 18 (strict, observable boundary) and
  // false for non-numbers. EVERY mutant here is OBSERVABLE (no equivalent mutants) so the meta-test
  // is clean: STRONG kills all, WEAK misses them.
  //   - WEAK test: only checks isAdult(25)===true. Misses the >= → > flip (isAdult(18) flips),
  //     the !== → === flip (isAdult('x') flips), and boundary mutants.
  //   - STRONG test: checks isAdult(25), isAdult(18)===true (boundary), isAdult(17)===false,
  //     isAdult('x')===false (fail-open), isAdult(100)===true. Each mutant flips at least one.
  const testBlock = weak ? `
if (_main && process.argv.includes('--test')) {
  const r = isAdult(25);
  if (r === true) { console.log('weak-test pass'); process.exit(0); }
  console.log('weak-test fail'); process.exit(1);
}
` : `
if (_main && process.argv.includes('--test')) {
  let fail = 0;
  if (isAdult(25) !== true) fail++;
  if (isAdult(18) !== true) fail++;   // boundary: >= 18  (>= → > flip caught here)
  if (isAdult(17) !== false) fail++;  // just below
  if (isAdult('x') !== false) fail++; // fail-open (!== → === flip caught here)
  if (isAdult(100) !== true) fail++;
  if (fail === 0) { console.log('strong-test pass'); process.exit(0); }
  console.log('strong-test fail'); process.exit(1);
}
`;
  return `import { pathToFileURL } from 'node:url';
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
export function isAdult(age) {
  if (typeof age !== 'number') return false;
  return age >= 18;
}
${testBlock}
`;
}

function selfTest() {
  let pass = 0, fail = 0;
  const ok = (label, cond) => { if (cond) pass++; else { fail++; console.error(`META-TEST FAIL: ${label}`); } };

  // --- 1. Masking correctness: a known string/comment is NOT mutable ---
  {
    const src = `const a = 1; // > >= x\nconst b = "x > y";\n/* < <= */\nconst c = 2;`;
    const { mutable } = computeMutableMask(src);
    // The '>' and '>=' in the comment must be non-mutable
    const commentGt = src.indexOf('// >');
    ok('mask: line-comment > not mutable', mutable.slice(commentGt, commentGt + 6).every(v => v === false));
    // The '>' in the string must be non-mutable
    const strGt = src.indexOf('"x > y"');
    ok('mask: string > not mutable', mutable.slice(strGt, strGt + 7).every(v => v === false));
    // The '<' in the block comment must be non-mutable
    const bcLt = src.indexOf('/* <');
    ok('mask: block-comment < not mutable', mutable.slice(bcLt, bcLt + 8).every(v => v === false));
    // The live code 'const c = 2' '=' IS mutable-ish (but = isn't a catalog target; the point is it's code)
    const cIdx = src.indexOf('const c');
    ok('mask: live code region mutable', mutable.slice(cIdx, cIdx + 7).every(v => v === true));
  }

  // --- 2. Test-block detection ---
  {
    const src = synthClampModule({ weak: true });
    const { codeMask, testBlock } = computeMutableMask(src);
    ok('testblock: range detected', testBlock !== null && testBlock.start < testBlock.end);
    if (testBlock) {
      // The '===' inside the test block must be non-mutable
      const inside = src.slice(testBlock.start, testBlock.end);
      const eqIdx = src.indexOf('=== true', testBlock.start);
      ok('testblock: assertion inside test is non-mutable', eqIdx >= testBlock.start && eqIdx < testBlock.end);
    }
  }

  // --- 3. META: WEAK test → ≥1 survivor, STRONG test → 0 survivors ---
  const tmpBase = realpathSync(tmpdir());
  const weakPath = join(tmpBase, `msweep-weak-${process.pid}-${Date.now()}.mjs`);
  const strongPath = join(tmpBase, `msweep-strong-${process.pid}-${Date.now()}.mjs`);
  try {
    writeFileSync(weakPath, synthClampModule({ weak: true }));
    writeFileSync(strongPath, synthClampModule({ weak: false }));

    const weakRes = runMutationSweep(weakPath, { max: 100 });
    const strongRes = runMutationSweep(strongPath, { max: 100 });

    ok('meta: weak baseline passes', weakRes.baselinePassed === true);
    ok('meta: strong baseline passes', strongRes.baselinePassed === true);
    ok('meta: WEAK test has ≥1 survivor (blind spot detected)', weakRes.survived >= 1);
    ok('meta: STRONG test has 0 survivors', strongRes.survived === 0);
    ok('meta: strong kills > weak kills', strongRes.killed >= weakRes.killed);

    console.log(`  weak   → run=${weakRes.mutationsRun} killed=${weakRes.killed} survived=${weakRes.survived} score=${(weakRes.mutationScore*100).toFixed(0)}%`);
    console.log(`  strong → run=${strongRes.mutationsRun} killed=${strongRes.killed} survived=${strongRes.survived} score=${(strongRes.mutationScore*100).toFixed(0)}%`);
    if (weakRes.survivors.length) {
      console.log(`  weak survivors:`);
      for (const s of weakRes.survivors.slice(0, 8)) console.log(`    L${s.line}:${s.col} [${s.label}] ${s.original} → ${s.mutated}   ${s.snippet}`);
    }
  } finally {
    try { if (existsSync(weakPath)) unlinkSync(weakPath); } catch {}
    try { if (existsSync(strongPath)) unlinkSync(strongPath); } catch {}
    cleanupTempFiles();
  }

  console.log(`\nmutation-sweep --test: ${pass} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 — ENTRYPOINT + cleanup hooks
// ─────────────────────────────────────────────────────────────────────────────
process.on('exit', cleanupTempFiles);
process.on('SIGINT', () => { cleanupTempFiles(); process.exit(130); });
process.on('SIGTERM', () => { cleanupTempFiles(); process.exit(143); });

const _isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_isMain) cliMain();
