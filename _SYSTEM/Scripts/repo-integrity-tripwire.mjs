#!/usr/bin/env node
// @capability: repo-integrity-tripwire
// @serves: sparse-checkout eviction detection | skip-worktree bit audit | tracked-file eviction detection | history-truncation detection | post-incident regression guard
// @does: Read-only detection tripwire for the 2026-07-17 sparse-checkout incident class (see 02_RESOURCES/RESEARCH history for the incident writeup) — a tool wrote the protected-paths list into `git sparse-checkout set` (INCLUDE patterns, not excludes), which set the skip-worktree bit on every tracked file NOT in that list and silently evicted 4138 files from the worktree while `git status` stayed clean. This script checks core.sparseCheckout / core.sparseCheckoutCone config, counts skip-worktree ('S ') bits via `git ls-files -v`, checks for a stray `.git/info/sparse-checkout` file, counts tracked-but-missing-on-disk files, and checks `refs/heads/main` commit count against a floor (guards against history truncation). Never mutates the repo; every git call is wrapped and a failed call reports UNKNOWN, not a crash.
// @use: Run ad hoc or from a scheduled/health-check surface: `node _SYSTEM/Scripts/repo-integrity-tripwire.mjs`. Exit 0 = all clear, 1 = one or more ALERTs, 2 = script/usage error. `--json` for machine-readable output, `--quiet` for exit-code-only, `--threshold=N` / `--min-commits=N` to override defaults, `--test` to run the built-in self-test against synthetic inputs (does not touch the real repo). This script only detects; it does not wire into hooks or launchd itself (see report for how the owner would wire it).
//
// Usage: node _SYSTEM/Scripts/repo-integrity-tripwire.mjs [--json] [--quiet] [--threshold=N] [--min-commits=N]
//        node _SYSTEM/Scripts/repo-integrity-tripwire.mjs --test
//        node _SYSTEM/Scripts/repo-integrity-tripwire.mjs --help
//
// Exit codes: 0 = all clear, 1 = one or more ALERTs, 2 = script/usage error.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_DEFAULT = path.resolve(__dirname, '../..');

export const DEFAULTS = Object.freeze({
  threshold: 25,
  minCommits: 100,
});

// ---------------------------------------------------------------------------
// Safe git wrapper — never throws. Returns { ok, code, stdout, stderr }.
// ---------------------------------------------------------------------------
function runGit(args, cwd) {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      ok: false,
      code: typeof err?.status === 'number' ? err.status : -1,
      stdout: typeof err?.stdout === 'string' ? err.stdout : '',
      stderr: typeof err?.stderr === 'string' ? err.stderr : String(err?.message || err),
    };
  }
}

// `git config --get <key>` exits 1 when the key is simply unset — that is a
// normal "no value" outcome, not a script error. Only a non-1 failure (e.g.
// not a git repo, corrupt config) is treated as UNKNOWN.
function getGitConfigValue(key, cwd) {
  const res = runGit(['config', '--get', key], cwd);
  if (res.ok) return { known: true, value: res.stdout.trim() };
  if (res.code === 1) return { known: true, value: null };
  return { known: false, value: null, error: res.stderr.trim() || `git config --get ${key} failed` };
}

// ---------------------------------------------------------------------------
// Pure parsing/evaluation helpers — exported for --test, no filesystem/git use.
// ---------------------------------------------------------------------------

/** Count lines in `git ls-files -v` output that carry the skip-worktree tag ('S '). */
export function countSkipWorktreeLines(lsFilesVOutput) {
  if (typeof lsFilesVOutput !== 'string' || lsFilesVOutput.length === 0) return 0;
  const lines = lsFilesVOutput.split('\n');
  let count = 0;
  for (const line of lines) {
    if (line.startsWith('S ')) count += 1;
  }
  return count;
}

/** Evaluate the sparseCheckout config value → { status, alert }. */
export function evaluateSparseCheckoutConfig(value) {
  if (value === 'true') return { status: 'ALERT', enabled: true };
  return { status: 'OK', enabled: false };
}

/** Evaluate the sparseCheckoutCone config value → { status, alert }. */
export function evaluateSparseCheckoutCone(value) {
  if (value === 'true') return { status: 'ALERT', enabled: true };
  return { status: 'OK', enabled: false };
}

/** Evaluate skip-worktree bit count against a zero-tolerance floor (any > 0 is an alert). */
export function evaluateSkipWorktreeCount(count) {
  const n = Number(count) || 0;
  return { status: n > 0 ? 'ALERT' : 'OK', count: n };
}

/** Evaluate the presence of .git/info/sparse-checkout against whether sparse is actually enabled. */
export function evaluateSparseFilePresence(fileExists, sparseEnabled) {
  if (!fileExists) return { status: 'OK', present: false };
  if (sparseEnabled) return { status: 'ALERT', present: true };
  return { status: 'WARN', present: true, note: 'INERT: sparse-checkout file exists but sparse-checkout is disabled' };
}

/** Evaluate tracked-but-missing-on-disk count against a threshold. */
export function evaluateMissingCount(count, threshold = DEFAULTS.threshold) {
  const n = Number(count) || 0;
  const t = Number(threshold);
  return { status: n > t ? 'ALERT' : 'OK', count: n, threshold: t };
}

/** Evaluate commit count on the primary branch against a minimum floor. */
export function evaluateCommitCount(count, minCommits = DEFAULTS.minCommits) {
  if (count === null || count === undefined) {
    return { status: 'UNKNOWN', count: null, minCommits };
  }
  const n = Number(count);
  if (!Number.isFinite(n)) return { status: 'UNKNOWN', count: null, minCommits };
  return { status: n < minCommits ? 'ALERT' : 'OK', count: n, minCommits };
}

/** Count tracked files (relative paths from `git ls-files`) missing on disk under repoRoot. */
export function countMissingTrackedFiles(trackedPaths, repoRoot, existsFn = fs.existsSync) {
  let missing = 0;
  for (const rel of trackedPaths) {
    if (!rel) continue;
    const abs = path.join(repoRoot, rel);
    if (!existsFn(abs)) missing += 1;
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Live checks — each wraps git/fs calls and never throws.
// ---------------------------------------------------------------------------

function checkSparseCheckoutFlag(cwd) {
  const cfg = getGitConfigValue('core.sparseCheckout', cwd);
  if (!cfg.known) {
    return { name: 'core.sparseCheckout', status: 'UNKNOWN', detail: cfg.error };
  }
  const evald = evaluateSparseCheckoutConfig(cfg.value);
  return {
    name: 'core.sparseCheckout',
    status: evald.status,
    detail: `value=${cfg.value === null ? '(unset)' : cfg.value}`,
    enabled: evald.enabled,
  };
}

function checkSparseCheckoutCone(cwd) {
  const cfg = getGitConfigValue('core.sparseCheckoutCone', cwd);
  if (!cfg.known) {
    return { name: 'core.sparseCheckoutCone', status: 'UNKNOWN', detail: cfg.error };
  }
  const evald = evaluateSparseCheckoutCone(cfg.value);
  return {
    name: 'core.sparseCheckoutCone',
    status: evald.status,
    detail: `value=${cfg.value === null ? '(unset)' : cfg.value}`,
  };
}

function checkSkipWorktreeBits(cwd) {
  const res = runGit(['ls-files', '-v'], cwd);
  if (!res.ok) {
    return { name: 'skip-worktree-bits', status: 'UNKNOWN', detail: res.stderr.trim() || 'git ls-files -v failed' };
  }
  const evald = evaluateSkipWorktreeCount(countSkipWorktreeLines(res.stdout));
  return {
    name: 'skip-worktree-bits',
    status: evald.status,
    detail: `count=${evald.count}`,
    count: evald.count,
  };
}

function checkSparseCheckoutFile(cwd, gitDirOverride, sparseFlagResult) {
  const gitDirRes = gitDirOverride ? { ok: true, stdout: gitDirOverride } : runGit(['rev-parse', '--git-dir'], cwd);
  if (!gitDirRes.ok) {
    return { name: 'sparse-checkout-file', status: 'UNKNOWN', detail: gitDirRes.stderr?.trim() || 'git rev-parse --git-dir failed' };
  }
  const gitDir = gitDirRes.stdout.trim();
  const absGitDir = path.isAbsolute(gitDir) ? gitDir : path.join(cwd, gitDir);
  const sparseFilePath = path.join(absGitDir, 'info', 'sparse-checkout');
  let fileExists = false;
  try {
    fileExists = fs.existsSync(sparseFilePath);
  } catch {
    return { name: 'sparse-checkout-file', status: 'UNKNOWN', detail: `stat failed for ${sparseFilePath}` };
  }
  const sparseEnabled = sparseFlagResult?.enabled === true;
  const evald = evaluateSparseFilePresence(fileExists, sparseEnabled);
  return {
    name: 'sparse-checkout-file',
    status: evald.status,
    detail: fileExists ? `present at ${sparseFilePath}${evald.note ? ` (${evald.note})` : ''}` : 'not present',
  };
}

function checkTrackedMissingFiles(cwd, threshold) {
  const topRes = runGit(['rev-parse', '--show-toplevel'], cwd);
  if (!topRes.ok) {
    return { name: 'tracked-missing-files', status: 'UNKNOWN', detail: topRes.stderr.trim() || 'git rev-parse --show-toplevel failed' };
  }
  const repoRoot = topRes.stdout.trim();

  const lsRes = runGit(['ls-files'], cwd);
  if (!lsRes.ok) {
    return { name: 'tracked-missing-files', status: 'UNKNOWN', detail: lsRes.stderr.trim() || 'git ls-files failed' };
  }
  const tracked = lsRes.stdout.split('\n').filter(Boolean);
  const missing = countMissingTrackedFiles(tracked, repoRoot);
  const evald = evaluateMissingCount(missing, threshold);
  return {
    name: 'tracked-missing-files',
    status: evald.status,
    detail: `missing=${evald.count} tracked=${tracked.length} threshold=${evald.threshold}`,
    count: evald.count,
  };
}

// GOTCHA (verified): this repo has a directory literally named `main` at its
// root. A bare `main` argument to git commands (e.g. `git rev-list --count main`)
// is ambiguous between the ref refs/heads/main and the path `main/`, and git
// silently resolves it as a PATH in that situation rather than erroring — so
// always use the fully-qualified ref `refs/heads/main` here, never bare `main`.
function checkMainCommitCount(cwd, minCommits) {
  const res = runGit(['rev-list', '--count', 'refs/heads/main'], cwd);
  if (!res.ok) {
    return { name: 'main-commit-count', status: 'UNKNOWN', detail: res.stderr.trim() || 'git rev-list --count refs/heads/main failed' };
  }
  const raw = res.stdout.trim();
  const count = Number(raw);
  const evald = evaluateCommitCount(Number.isFinite(count) ? count : null, minCommits);
  return {
    name: 'main-commit-count',
    status: evald.status,
    detail: `count=${evald.count === null ? 'unknown' : evald.count} min_commits=${minCommits}`,
    count: evald.count,
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export function runChecks({ cwd = REPO_ROOT_DEFAULT, threshold = DEFAULTS.threshold, minCommits = DEFAULTS.minCommits } = {}) {
  const sparseFlag = checkSparseCheckoutFlag(cwd);
  const sparseCone = checkSparseCheckoutCone(cwd);
  const skipWorktree = checkSkipWorktreeBits(cwd);
  const sparseFile = checkSparseCheckoutFile(cwd, null, sparseFlag);
  const trackedMissing = checkTrackedMissingFiles(cwd, threshold);
  const mainCommits = checkMainCommitCount(cwd, minCommits);

  const checks = [sparseFlag, sparseCone, skipWorktree, sparseFile, trackedMissing, mainCommits];
  const alertCount = checks.filter((c) => c.status === 'ALERT').length;
  const unknownCount = checks.filter((c) => c.status === 'UNKNOWN').length;
  const warnCount = checks.filter((c) => c.status === 'WARN').length;

  return {
    ok: alertCount === 0,
    checks,
    summary: {
      total: checks.length,
      alert: alertCount,
      warn: warnCount,
      unknown: unknownCount,
      ok: checks.length - alertCount - warnCount - unknownCount,
    },
    params: { threshold, minCommits },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {
    json: false,
    quiet: false,
    help: false,
    test: false,
    threshold: DEFAULTS.threshold,
    minCommits: DEFAULTS.minCommits,
  };
  for (const arg of argv) {
    if (arg === '--json') out.json = true;
    else if (arg === '--quiet') out.quiet = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--test') out.test = true;
    else if (arg.startsWith('--threshold=')) out.threshold = Number(arg.slice('--threshold='.length));
    else if (arg.startsWith('--min-commits=')) out.minCommits = Number(arg.slice('--min-commits='.length));
    else {
      throw new Error(`unrecognized argument: ${arg}`);
    }
  }
  if (!Number.isFinite(out.threshold) || out.threshold < 0) {
    throw new Error('--threshold=N must be a non-negative number');
  }
  if (!Number.isFinite(out.minCommits) || out.minCommits < 0) {
    throw new Error('--min-commits=N must be a non-negative number');
  }
  return out;
}

const HELP_TEXT = `repo-integrity-tripwire.mjs — read-only sparse-checkout / eviction detection tripwire

Usage:
  node _SYSTEM/Scripts/repo-integrity-tripwire.mjs [options]

Options:
  --json              emit machine-readable JSON instead of human-readable lines
  --quiet             suppress all output; rely on exit code only
  --threshold=N       tracked-but-missing-file alert threshold (default ${DEFAULTS.threshold})
  --min-commits=N     minimum expected commit count on refs/heads/main (default ${DEFAULTS.minCommits})
  --test              run the built-in self-test against synthetic inputs (no repo access)
  --help              show this help text

Exit codes: 0 = all clear, 1 = one or more ALERTs, 2 = script/usage error.

Checks performed:
  core.sparseCheckout          ALERT if anything other than false/unset
  core.sparseCheckoutCone      ALERT if true
  skip-worktree bits           ALERT if any 'git ls-files -v' entry is skip-worktree ('S ')
  .git/info/sparse-checkout    ALERT if present AND sparse-checkout enabled; WARN (inert) if present but disabled
  tracked-but-missing files    ALERT if count exceeds --threshold
  refs/heads/main commit count ALERT if below --min-commits
`;

function formatHuman(report) {
  const lines = [];
  for (const c of report.checks) {
    lines.push(`${c.status.padEnd(7)} ${c.name} — ${c.detail}`);
  }
  lines.push('');
  lines.push(
    `SUMMARY: ${report.summary.ok} OK, ${report.summary.warn} WARN, ${report.summary.alert} ALERT, ${report.summary.unknown} UNKNOWN (of ${report.summary.total})`,
  );
  lines.push(report.ok ? 'RESULT: ALL CLEAR' : 'RESULT: ALERT — see above');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Self-test (synthetic inputs only — never touches the real repo)
// ---------------------------------------------------------------------------
export function selfTest() {
  const cases = [];
  const assertEq = (name, actual, expected) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    cases.push({ name, pass, actual, expected });
  };

  // countSkipWorktreeLines
  assertEq('skip-worktree: none', countSkipWorktreeLines('H 1234 0\tfile.txt\n'), 0);
  assertEq(
    'skip-worktree: mixed tags counts only S',
    countSkipWorktreeLines('H 1234 0\tfile.txt\nS 1234 0\tevicted.txt\nh 1234 0\tassume.txt\n'),
    1,
  );
  assertEq(
    'skip-worktree: many',
    countSkipWorktreeLines(Array.from({ length: 4138 }, (_, i) => `S 1234 0\tfile${i}.txt`).join('\n')),
    4138,
  );
  assertEq('skip-worktree: empty input', countSkipWorktreeLines(''), 0);
  assertEq('skip-worktree: non-string input', countSkipWorktreeLines(undefined), 0);

  // evaluateSparseCheckoutConfig
  assertEq('sparseCheckout: unset -> OK', evaluateSparseCheckoutConfig(null).status, 'OK');
  assertEq('sparseCheckout: false -> OK', evaluateSparseCheckoutConfig('false').status, 'OK');
  assertEq('sparseCheckout: true -> ALERT', evaluateSparseCheckoutConfig('true').status, 'ALERT');

  // evaluateSparseCheckoutCone
  assertEq('sparseCheckoutCone: unset -> OK', evaluateSparseCheckoutCone(null).status, 'OK');
  assertEq('sparseCheckoutCone: true -> ALERT', evaluateSparseCheckoutCone('true').status, 'ALERT');

  // evaluateSkipWorktreeCount
  assertEq('skipWorktreeCount: 0 -> OK', evaluateSkipWorktreeCount(0).status, 'OK');
  assertEq('skipWorktreeCount: 1 -> ALERT', evaluateSkipWorktreeCount(1).status, 'ALERT');
  assertEq('skipWorktreeCount: 4138 -> ALERT', evaluateSkipWorktreeCount(4138).status, 'ALERT');

  // evaluateSparseFilePresence
  assertEq('sparseFile: absent -> OK', evaluateSparseFilePresence(false, false).status, 'OK');
  assertEq('sparseFile: present + disabled -> WARN', evaluateSparseFilePresence(true, false).status, 'WARN');
  assertEq('sparseFile: present + enabled -> ALERT', evaluateSparseFilePresence(true, true).status, 'ALERT');

  // evaluateMissingCount
  assertEq('missingCount: below threshold -> OK', evaluateMissingCount(10, 25).status, 'OK');
  assertEq('missingCount: at threshold -> OK', evaluateMissingCount(25, 25).status, 'OK');
  assertEq('missingCount: above threshold -> ALERT', evaluateMissingCount(26, 25).status, 'ALERT');
  assertEq('missingCount: incident-scale (4138) -> ALERT', evaluateMissingCount(4138, 25).status, 'ALERT');
  assertEq('missingCount: custom threshold', evaluateMissingCount(50, 100).status, 'OK');

  // evaluateCommitCount
  assertEq('commitCount: above floor -> OK', evaluateCommitCount(1460, 100).status, 'OK');
  assertEq('commitCount: below floor -> ALERT', evaluateCommitCount(50, 100).status, 'ALERT');
  assertEq('commitCount: exactly at floor -> OK', evaluateCommitCount(100, 100).status, 'OK');
  assertEq('commitCount: null -> UNKNOWN', evaluateCommitCount(null, 100).status, 'UNKNOWN');
  assertEq('commitCount: NaN -> UNKNOWN', evaluateCommitCount(Number.NaN, 100).status, 'UNKNOWN');

  // countMissingTrackedFiles (synthetic exists function, no real fs/git touched)
  const fakeExists = (abs) => !abs.includes('missing');
  assertEq(
    'countMissingTrackedFiles: mixed',
    countMissingTrackedFiles(['a.txt', 'missing1.txt', 'b.txt', 'missing2.txt'], '/fake/root', fakeExists),
    2,
  );
  assertEq(
    'countMissingTrackedFiles: none missing',
    countMissingTrackedFiles(['a.txt', 'b.txt'], '/fake/root', fakeExists),
    0,
  );
  assertEq(
    'countMissingTrackedFiles: empty list',
    countMissingTrackedFiles([], '/fake/root', fakeExists),
    0,
  );
  assertEq(
    'countMissingTrackedFiles: skips falsy entries',
    countMissingTrackedFiles(['a.txt', '', null, undefined, 'missing1.txt'], '/fake/root', fakeExists),
    1,
  );

  // parseArgs
  assertEq('parseArgs: defaults', (() => {
    const a = parseArgs([]);
    return { threshold: a.threshold, minCommits: a.minCommits, json: a.json, quiet: a.quiet };
  })(), { threshold: DEFAULTS.threshold, minCommits: DEFAULTS.minCommits, json: false, quiet: false });
  assertEq('parseArgs: overrides', (() => {
    const a = parseArgs(['--json', '--threshold=5', '--min-commits=10']);
    return { threshold: a.threshold, minCommits: a.minCommits, json: a.json };
  })(), { threshold: 5, minCommits: 10, json: true });
  assertEq('parseArgs: rejects unknown flag', (() => {
    try {
      parseArgs(['--bogus']);
      return 'no-throw';
    } catch {
      return 'threw';
    }
  })(), 'threw');

  const failed = cases.filter((c) => !c.pass);
  for (const c of cases) {
    process.stdout.write(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}${c.pass ? '' : ` — expected ${JSON.stringify(c.expected)} got ${JSON.stringify(c.actual)}`}\n`);
  }
  process.stdout.write(`\nSELF-TEST: ${cases.length - failed.length}/${cases.length} passed\n`);
  return failed.length === 0;
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`usage error: ${err.message}\n\n${HELP_TEXT}`);
    return 2;
  }

  if (args.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  if (args.test) {
    const passed = selfTest();
    return passed ? 0 : 1;
  }

  let report;
  try {
    report = runChecks({ cwd: REPO_ROOT_DEFAULT, threshold: args.threshold, minCommits: args.minCommits });
  } catch (err) {
    process.stderr.write(`script error: ${err?.message || err}\n`);
    return 2;
  }

  if (!args.quiet) {
    if (args.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatHuman(report)}\n`);
    }
  }

  return report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
