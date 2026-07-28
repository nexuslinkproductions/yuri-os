#!/usr/bin/env node
// @capability: repo-integrity-tripwire
// @serves: sparse-checkout eviction detection | skip-worktree bit audit | tracked-file eviction detection | history-truncation detection | post-incident regression guard
// @does: Read-only detection tripwire for the 2026-07-17 sparse-checkout incident class (see 02_RESOURCES/RESEARCH history for the incident writeup) — a tool wrote the protected-paths list into `git sparse-checkout set` (INCLUDE patterns, not excludes), which set the skip-worktree bit on every tracked file NOT in that list and silently evicted 4138 files from the worktree while `git status` stayed clean. This script checks core.sparseCheckout / core.sparseCheckoutCone config, counts skip-worktree ('S ') bits via `git ls-files -v`, checks for a stray `.git/info/sparse-checkout` file, counts tracked-but-missing-on-disk files, checks `refs/heads/main` commit count against a floor (guards against history truncation), and — for the 2026-07-28 atlas silent-fail-soft incident class — re-validates the atlas id-map's recorded substrate fingerprint against atlas-identity's integrity floors and measures every generated atlas input's staleness against HEAD per-input (generator-backed check for capabilities.json, indexed-commit marker for gitnexus, last-touch-commit for tracked artifacts, mtime estimate for gitignored ones). Never mutates the repo; every git call is wrapped and a failed call reports UNKNOWN, not a crash.
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
  staleInputCommits: 50,
  staleInputDays: 14,
});

// Atlas substrate checks reuse the identity builder's integrity floors (single
// source of truth) and the drift scanner's gitnexus staleness probe
// (capability-first: xref-drift-scan already reconciles indexed-commit vs HEAD).
import { SOURCE_INTEGRITY } from './atlas/atlas-identity.mjs';
import { gitnexusStaleness } from './xref-drift-scan.mjs';

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
// ATLAS SUBSTRATE — the 2026-07-28 silent fail-soft incident class: atlas's
// gitnexus probe died quietly for days and every corpus built in that window
// was degraded without any signal. atlas-identity.mjs now fails LOUD at build
// time (zero rows = error); these checks are the scheduled surface for the
// same contract: the on-disk id-map's recorded fingerprint is re-validated
// against the floors, and every generated input's staleness against HEAD is
// measured per-input (never a single generic timestamp).
// ---------------------------------------------------------------------------

/** Generic never-throws command wrapper (same contract as runGit). */
function runCmd(cmd, args, cwd) {
  try {
    const stdout = execFileSync(cmd, args, {
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

/**
 * Evaluate the id-map's recorded substrate fingerprint against the integrity
 * floors. `substrate` is null when the id-map is missing or predates the
 * fingerprint — that is a WARN (regenerate), never an OK: an unverifiable
 * corpus is not a healthy one.
 */
export function evaluateAtlasSubstrate(substrate, floors = SOURCE_INTEGRITY) {
  if (!substrate || typeof substrate !== 'object') {
    return { status: 'WARN', violations: [], detail: 'no substrate fingerprint — id-map missing or pre-fingerprint; regenerate via atlas-identity.mjs' };
  }
  const violations = [];
  if (substrate.gitnexus !== 'probed') {
    violations.push(`gitnexus=${substrate.gitnexus || 'unknown'} (a non-probed map means the corpus was built with half the repo invisible)`);
  }
  const perSource = substrate.per_source || {};
  for (const [name, floor] of Object.entries(floors)) {
    const got = perSource[name] && typeof perSource[name].total === 'number' ? perSource[name].total : null;
    if (got === null) {
      violations.push(`${name}: no count recorded`);
    } else if (got < floor.minRecords) {
      violations.push(`${name}: ${got} rows < floor ${floor.minRecords}`);
    }
  }
  if (violations.length > 0) {
    return { status: 'ALERT', violations, detail: violations.join('; ') };
  }
  const fp = typeof substrate.corpus_fingerprint === 'string' ? substrate.corpus_fingerprint.slice(0, 12) : 'none';
  return { status: 'OK', violations, detail: `all sources above floor; corpus_fingerprint=${fp}` };
}

/**
 * Evaluate per-input staleness entries. Each entry:
 *   { input, tier: 'precise'|'dependency-mtime'|'estimated', stale: boolean|null,
 *     behind: number|null, escalation: 'alert'|'warn', reason? }
 * tier = how the measurement was made (generator/indexer/embedded-commit
 * marker = precise; artifact-declared source mtime = dependency-mtime;
 * artifact date or file mtime vs HEAD date = estimated). escalation = what
 * staleness MEANS for that input (a generator-contradicting registry is an
 * ALERT; an index or artifact behind HEAD is normal drift = WARN).
 * stale null = measurement unavailable — NEVER reads as fresh.
 * `behind` carries the raw measurement (commits or days) so the detail string
 * is exact even when the classification is thresholded.
 */
export function evaluateInputStaleness(entries, warnCommits = DEFAULTS.staleInputCommits) {
  let worst = 'OK';
  const parts = [];
  let unavailable = 0;
  for (const e of entries) {
    if (e.stale === null || e.stale === undefined) {
      unavailable++;
      parts.push(`${e.input}: unavailable (${e.reason || 'measurement failed'})`);
      continue;
    }
    if (e.stale) {
      const level = e.escalation === 'alert' ? 'ALERT' : 'WARN';
      if (level === 'ALERT') worst = 'ALERT';
      else if (worst !== 'ALERT') worst = 'WARN';
      const behindTxt = typeof e.behind === 'number' ? ` behind=${e.behind}` : '';
      parts.push(`${e.input}: STALE [${e.tier}]${behindTxt}`);
    } else {
      parts.push(`${e.input}: fresh [${e.tier}]`);
    }
  }
  if (worst === 'OK' && unavailable === entries.length && entries.length > 0) worst = 'UNKNOWN';
  return { status: worst, detail: parts.join(' | ') };
}

function checkAtlasSubstrate(cwd) {
  const topRes = runGit(['rev-parse', '--show-toplevel'], cwd);
  if (!topRes.ok) {
    return { name: 'atlas-substrate-fingerprint', status: 'UNKNOWN', detail: topRes.stderr.trim() || 'git rev-parse --show-toplevel failed' };
  }
  const repoRoot = topRes.stdout.trim();
  const idMapPath = path.join(repoRoot, '_SYSTEM/state/atlas/id-map.json');
  let substrate = null;
  try {
    if (fs.existsSync(idMapPath)) {
      substrate = JSON.parse(fs.readFileSync(idMapPath, 'utf8')).substrate || null;
    }
  } catch {
    substrate = null;
  }
  const evald = evaluateAtlasSubstrate(substrate);
  return { name: 'atlas-substrate-fingerprint', status: evald.status, detail: evald.detail };
}

function checkAtlasInputStaleness(cwd, warnCommits, staleDays) {
  const topRes = runGit(['rev-parse', '--show-toplevel'], cwd);
  if (!topRes.ok) {
    return { name: 'atlas-input-staleness', status: 'UNKNOWN', detail: topRes.stderr.trim() || 'git rev-parse --show-toplevel failed' };
  }
  const repoRoot = topRes.stdout.trim();
  const entries = [];

  // capabilities.json — PRECISE: its own generator (capability-scan --check)
  // exits 1 when the registry drifts from the @capability tags in source.
  const capRes = runCmd(process.execPath, [path.join(repoRoot, '_SYSTEM/Scripts/capability-scan.mjs'), '--check'], repoRoot);
  entries.push({
    input: 'capabilities.json',
    tier: 'precise',
    stale: capRes.ok ? false : (capRes.code === 1 ? true : null),
    behind: null,
    escalation: 'alert',
    reason: capRes.ok ? undefined : (capRes.stderr || capRes.stdout || 'capability-scan --check failed').trim().slice(0, 120),
  });

  // gitnexus index — PRECISE marker (indexed commit recorded by the indexer
  // itself) vs HEAD. Behind-HEAD is normal drift, so WARN-tier.
  const gx = gitnexusStaleness({ repoRoot });
  entries.push({
    input: '.gitnexus index',
    tier: 'precise',
    stale: gx.available ? (gx.stale && (typeof gx.behind !== 'number' || gx.behind > warnCommits)) : null,
    behind: typeof gx.behind === 'number' ? gx.behind : null,
    escalation: 'warn',
    reason: gx.reason,
  });

  // yuri-graph-state.json — PRECISE: the artifact embeds the commit it was
  // built from (`commit` field), a true source-vs-artifact marker.
  const gsPath = path.join(repoRoot, '_SYSTEM/yuri-graph-state.json');
  let gsEntry = { input: '_SYSTEM/yuri-graph-state.json', tier: 'precise', stale: null, behind: null, escalation: 'warn', reason: 'artifact or embedded commit unavailable' };
  try {
    const embedded = JSON.parse(fs.readFileSync(gsPath, 'utf8')).commit;
    if (embedded) {
      const behindRes = runGit(['rev-list', '--count', `${embedded}..refs/heads/main`], repoRoot);
      const behind = behindRes.ok ? parseInt(behindRes.stdout.trim(), 10) : null;
      gsEntry = {
        input: '_SYSTEM/yuri-graph-state.json',
        tier: 'precise',
        stale: typeof behind === 'number' ? behind > warnCommits : true,
        behind,
        escalation: 'warn',
        reason: behindRes.ok ? undefined : 'embedded commit unknown to repo',
      };
    }
  } catch { /* keep default unavailable entry */ }
  entries.push(gsEntry);

  // arch-graph-metrics.json — DEPENDENCY tier: the artifact declares its own
  // source (`source: "_SYSTEM/yuri-graph-state.json"`); stale when the declared
  // source is newer than the derived artifact.
  const agmPath = path.join(repoRoot, '_SYSTEM/state/arch-graph-metrics.json');
  let agmEntry = { input: '_SYSTEM/state/arch-graph-metrics.json', tier: 'dependency-mtime', stale: null, behind: null, escalation: 'warn', reason: 'artifact or declared source unavailable' };
  try {
    const declared = JSON.parse(fs.readFileSync(agmPath, 'utf8')).source;
    const srcAbs = declared ? path.join(repoRoot, declared) : null;
    if (srcAbs && fs.existsSync(srcAbs) && fs.existsSync(agmPath)) {
      agmEntry = {
        input: '_SYSTEM/state/arch-graph-metrics.json',
        tier: 'dependency-mtime',
        stale: fs.statSync(srcAbs).mtimeMs > fs.statSync(agmPath).mtimeMs,
        behind: null,
        escalation: 'warn',
      };
    }
  } catch { /* keep default unavailable entry */ }
  entries.push(agmEntry);

  // circuitry-graph.json — ESTIMATED: the artifact embeds only a `generatedAt`
  // DATE (no commit, unknown upstream set), so the strongest honest check is
  // artifact-declared date vs HEAD commit date. TRUE dependency comparison for
  // this input is UNMET (generator/upstream set unknown) — stated, not hidden.
  const headDateRes2 = runGit(['log', '-1', '--format=%cI', 'refs/heads/main'], repoRoot);
  const headDate2 = headDateRes2.ok ? Date.parse(headDateRes2.stdout.trim()) : null;
  const cgPath = path.join(repoRoot, '02_RESOURCES/RESEARCH/yuri-circuitry-graph.json');
  let cgEntry = { input: 'yuri-circuitry-graph.json', tier: 'estimated', stale: null, behind: null, escalation: 'warn', reason: 'artifact date or HEAD date unavailable' };
  try {
    const genAt = Date.parse(JSON.parse(fs.readFileSync(cgPath, 'utf8')).generatedAt);
    if (genAt && headDate2) {
      const ageDays = (headDate2 - genAt) / 86400000;
      cgEntry = {
        input: 'yuri-circuitry-graph.json (true dependency check UNMET: generator unknown)',
        tier: 'estimated',
        stale: ageDays > staleDays,
        behind: Math.round(ageDays),
        escalation: 'warn',
      };
    }
  } catch { /* keep default unavailable entry */ }
  entries.push(cgEntry);

  // Gitignored generated inputs — ESTIMATED tier: mtime vs HEAD commit date.
  // yuri-knowledge-graph.json embeds no build marker; true dependency check UNMET.
  for (const rel of ['_SYSTEM/state/yuri-knowledge-graph.json']) {
    const abs = path.join(repoRoot, rel);
    if (!headDate2 || !fs.existsSync(abs)) {
      entries.push({ input: rel, tier: 'estimated', stale: null, behind: null, escalation: 'warn', reason: 'HEAD date or input unavailable' });
      continue;
    }
    const ageDays = (headDate2 - fs.statSync(abs).mtimeMs) / 86400000;
    entries.push({
      input: `${rel} (true dependency check UNMET: no build marker)`,
      tier: 'estimated',
      stale: ageDays > staleDays,
      behind: Math.round(ageDays),
      escalation: 'warn',
    });
  }

  const evald = evaluateInputStaleness(entries, warnCommits);
  return { name: 'atlas-input-staleness', status: evald.status, detail: evald.detail };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export function runChecks({ cwd = REPO_ROOT_DEFAULT, threshold = DEFAULTS.threshold, minCommits = DEFAULTS.minCommits, staleInputCommits = DEFAULTS.staleInputCommits, staleInputDays = DEFAULTS.staleInputDays } = {}) {
  const sparseFlag = checkSparseCheckoutFlag(cwd);
  const sparseCone = checkSparseCheckoutCone(cwd);
  const skipWorktree = checkSkipWorktreeBits(cwd);
  const sparseFile = checkSparseCheckoutFile(cwd, null, sparseFlag);
  const trackedMissing = checkTrackedMissingFiles(cwd, threshold);
  const mainCommits = checkMainCommitCount(cwd, minCommits);

  const checks = [sparseFlag, sparseCone, skipWorktree, sparseFile, trackedMissing, mainCommits, checkAtlasSubstrate(cwd), checkAtlasInputStaleness(cwd, staleInputCommits, staleInputDays)];
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
    params: { threshold, minCommits, staleInputCommits, staleInputDays },
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
    staleInputCommits: DEFAULTS.staleInputCommits,
    staleInputDays: DEFAULTS.staleInputDays,
  };
  for (const arg of argv) {
    if (arg === '--json') out.json = true;
    else if (arg === '--quiet') out.quiet = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--test') out.test = true;
    else if (arg.startsWith('--threshold=')) out.threshold = Number(arg.slice('--threshold='.length));
    else if (arg.startsWith('--min-commits=')) out.minCommits = Number(arg.slice('--min-commits='.length));
    else if (arg.startsWith('--stale-input-commits=')) out.staleInputCommits = Number(arg.slice('--stale-input-commits='.length));
    else if (arg.startsWith('--stale-input-days=')) out.staleInputDays = Number(arg.slice('--stale-input-days='.length));
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
  if (!Number.isFinite(out.staleInputCommits) || out.staleInputCommits < 0) {
    throw new Error('--stale-input-commits=N must be a non-negative number');
  }
  if (!Number.isFinite(out.staleInputDays) || out.staleInputDays < 0) {
    throw new Error('--stale-input-days=N must be a non-negative number');
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
  --stale-input-commits=N  commits-behind-HEAD WARN threshold for commit-marker atlas inputs (default ${DEFAULTS.staleInputCommits})
  --stale-input-days=N     days-behind-HEAD WARN threshold for date-estimated atlas inputs (default ${DEFAULTS.staleInputDays})
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
  atlas substrate fingerprint  ALERT if the id-map's recorded per-source counts violate atlas-identity's
                               integrity floors, or gitnexus was not probed; WARN if no fingerprint exists
  atlas input staleness        per-input, tiered by strongest available evidence: capabilities.json
                               via capability-scan --check (ALERT if generator-contradicted), gitnexus +
                               yuri-graph-state via embedded/indexed commit vs HEAD (WARN if behind >
                               --stale-input-commits), arch-graph-metrics vs its declared source mtime
                               (WARN), circuitry + knowledge-graph via date estimates (WARN if older
                               than --stale-input-days; true dependency checks for these two are UNMET
                               and reported as such)
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

  // evaluateAtlasSubstrate
  const healthySubstrate = {
    gitnexus: 'probed',
    per_source: Object.fromEntries(Object.entries(SOURCE_INTEGRITY).map(([k, v]) => [k, { total: v.minRecords }])),
    corpus_fingerprint: 'abcdef0123456789',
  };
  assertEq('atlasSubstrate: healthy -> OK', evaluateAtlasSubstrate(healthySubstrate).status, 'OK');
  assertEq('atlasSubstrate: missing fingerprint -> WARN', evaluateAtlasSubstrate(null).status, 'WARN');
  assertEq('atlasSubstrate: excluded gitnexus -> ALERT',
    evaluateAtlasSubstrate({ ...healthySubstrate, gitnexus: 'excluded-by-flag' }).status, 'ALERT');
  assertEq('atlasSubstrate: below-floor source -> ALERT', (() => {
    const s = JSON.parse(JSON.stringify(healthySubstrate));
    s.per_source.gitnexus.total = 12;
    return evaluateAtlasSubstrate(s).status;
  })(), 'ALERT');
  assertEq('atlasSubstrate: unrecorded source -> ALERT', (() => {
    const s = JSON.parse(JSON.stringify(healthySubstrate));
    delete s.per_source.capabilities;
    return evaluateAtlasSubstrate(s).status;
  })(), 'ALERT');

  // evaluateInputStaleness
  assertEq('inputStaleness: all fresh -> OK', evaluateInputStaleness([
    { input: 'a', tier: 'precise', stale: false, behind: null, escalation: 'alert' },
    { input: 'b', tier: 'dependency-mtime', stale: false, behind: 3, escalation: 'warn' },
  ]).status, 'OK');
  assertEq('inputStaleness: generator-contradicted registry -> ALERT', evaluateInputStaleness([
    { input: 'capabilities.json', tier: 'precise', stale: true, behind: null, escalation: 'alert' },
  ]).status, 'ALERT');
  assertEq('inputStaleness: warn-tier stale -> WARN not ALERT', evaluateInputStaleness([
    { input: 'graph.json', tier: 'precise', stale: true, behind: 120, escalation: 'warn' },
  ]).status, 'WARN');
  assertEq('inputStaleness: unavailable measurement does not read as fresh', evaluateInputStaleness([
    { input: 'a', tier: 'precise', stale: null, behind: null, escalation: 'alert', reason: 'x' },
  ]).status, 'UNKNOWN');
  assertEq('inputStaleness: stale + fresh mix -> worst wins', evaluateInputStaleness([
    { input: 'a', tier: 'estimated', stale: true, behind: 40, escalation: 'warn' },
    { input: 'b', tier: 'precise', stale: true, behind: null, escalation: 'alert' },
  ]).status, 'ALERT');
  assertEq('inputStaleness: raw measurement carried in detail', (() => {
    const r = evaluateInputStaleness([{ input: 'g', tier: 'precise', stale: true, behind: 87, escalation: 'warn' }]);
    return r.detail.includes('behind=87');
  })(), true);

  // parseArgs
  assertEq('parseArgs: defaults', (() => {
    const a = parseArgs([]);
    return { threshold: a.threshold, minCommits: a.minCommits, json: a.json, quiet: a.quiet };
  })(), { threshold: DEFAULTS.threshold, minCommits: DEFAULTS.minCommits, json: false, quiet: false });
  assertEq('parseArgs: overrides', (() => {
    const a = parseArgs(['--json', '--threshold=5', '--min-commits=10', '--stale-input-commits=75', '--stale-input-days=30']);
    return { threshold: a.threshold, minCommits: a.minCommits, json: a.json, staleInputCommits: a.staleInputCommits, staleInputDays: a.staleInputDays };
  })(), { threshold: 5, minCommits: 10, json: true, staleInputCommits: 75, staleInputDays: 30 });
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
    report = runChecks({ cwd: REPO_ROOT_DEFAULT, threshold: args.threshold, minCommits: args.minCommits, staleInputCommits: args.staleInputCommits, staleInputDays: args.staleInputDays });
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
