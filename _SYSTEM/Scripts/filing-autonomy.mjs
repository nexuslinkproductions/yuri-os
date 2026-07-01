#!/usr/bin/env node
/**
 * filing-autonomy.mjs — the GOVERNED, DETERMINISTIC autonomy runner for the YURI filing system.
 *
 * The filing system (assessor → deps → mutator) decides WHERE every artifact belongs and HOW to move it with
 * full reference propagation. That machinery is dry-run-by-default and owner-gated ON PURPOSE. This runner is the
 * scheduling/autonomy layer on top — it lets a launchd timer (or a /schedule routine) fire the filing sweep on an
 * interval WITHOUT removing the owner gate, by splitting every plan into two tiers:
 *
 *   AUTO-EXECUTE (only when ARMED): risk==LOW AND refCount<=3 AND basenameOnlyCount==0 AND zero protected
 *     ref-hosts AND not pinned/protected AND target does not exist. Nothing else. Capped at K moves per run.
 *   QUEUE for owner (dry-run report only, NEVER auto-applied): MEDIUM/HIGH/CRITICAL, anything with manual /
 *     basename-only refs, every EPHEMERAL purge candidate (we NEVER auto-delete), and the auto-tier overflow
 *     past the per-run budget K.
 *
 * DETERMINISM CONTRACT (the whole point — no LLM anywhere in the move-decision or move-execution path):
 *   - The assessor + deps + mutator are deterministic (closed-set rules, sorted, fixed-string git grep, no RNG/
 *     clock). This runner adds only deterministic partitioning on top. Same repo state → byte-identical plan.
 *   - planHash = sha256 of the sorted source→target→refs list, logged each run. Same state ⇒ same hash.
 *   - Every executed move is reversible: rollbackFrom = git HEAD before the run; the mutator aborts+restores if
 *     any ref can't be safely rewritten; the run-ledger records the exact per-move inverse + the revert range.
 *   - After moves: reindex (ai reindex + npx gitnexus analyze --skip-agents-md) then HARD-verify zero stale refs
 *     (git grep -nF each old path) — the run FAILS LOUDLY if any standalone stale ref remains.
 *
 * GOVERNANCE / KILL-SWITCH (fail-safe, mirrors energy-enforce):
 *   - Armed only when BOTH the env flag YURI_FILING_AUTONOMY=1 AND the flag file _SYSTEM/state/filing-autonomy.enabled
 *     are present (stricter conjunction than the energy breaker's OR — moving files is higher-stakes than the
 *     observe-mostly energy gate). Absent EITHER ⇒ DRY-RUN ONLY. The committed default is DISARMED.
 *   - --execute is additionally required to mutate; armed-without-execute still only plans.
 *   - Per-run budget cap (default 10) bounds the blast radius of any single tick.
 *   - It STAGES each move (git mv) and records rollbackFrom; it does NOT commit and does NOT push. Owner commit/
 *     push authority is unchanged.
 *   - Run-ledger JSONL at _SYSTEM/state/filing-autonomy-ledger.jsonl (separate from filing-ledger.jsonl).
 *   - Borrows the YURI governed-autonomy CONTRACT (yuri-autonomy-runner.mjs, L5_SCHEDULED_AUTOMATION) as a
 *     best-effort governance record — that module is a pure manifest/validator with no execution path, so it is
 *     ridden for its baseline-anchor + decision shape, never as the executor. Its failure never breaks this run.
 *   - AI is ADVISORY ONLY and OUT of the deterministic path: there is none here. A future post-run governance
 *     pass (review the QUEUED MEDIUM+ plan, propose zones for the unclassified pile) must route through the lane
 *     contract and may only WRITE a recommendation, never mutate.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizePath, isProtectedPath, REPO_ROOT } from './yuri-id-bridge.mjs';
import { assess, isPinned } from './filing-assessor.mjs';
import { planBatch, executeMove, sortByRisk } from './filing-mutator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = REPO_ROOT || path.resolve(__dirname, '..', '..');

const STATE_DIR = process.env.YURI_STATE_DIR
  ? process.env.YURI_STATE_DIR
  : path.join(REPO, '_SYSTEM', 'state');
const FLAG_FILE = path.join(STATE_DIR, 'filing-autonomy.enabled');
const RUN_LEDGER = path.join(STATE_DIR, 'filing-autonomy-ledger.jsonl');
const QUEUE_REPORT = path.join(REPO, '_SYSTEM', 'reports', 'filing-autonomy-latest.md');

export const DEFAULT_BUDGET = 10;          // max auto-moves per run; the rest queue for the owner
const REQUIRED_BRANCH = 'main';

// ── arming (governance kill-switch) ───────────────────────────────────────────────────────────────
/**
 * armedState — pure. BOTH the env flag AND the flag file must be present to arm. Absent either ⇒ disarmed ⇒
 * dry-run only. Stricter than energy-enforce (which arms on env OR flag) because autonomous file relocation has
 * a larger blast radius than the mostly-observational energy breaker.
 */
export function armedState({ envFlag, flagFileExists } = {}) {
  const env = envFlag === '1' || envFlag === 'true';
  const file = flagFileExists === true;
  return { env, file, armed: env && file };
}
export function isArmed() {
  let flagFileExists = false;
  try { flagFileExists = fs.existsSync(FLAG_FILE); } catch { flagFileExists = false; }
  return armedState({ envFlag: process.env.YURI_FILING_AUTONOMY, flagFileExists }).armed;
}

// ── the tier predicate (the heart — pure, byte-stable) ────────────────────────────────────────────
/**
 * isSafeTier(plan, targetExists) — TRUE only for the strictly-safe auto-execute tier. Pure: same (plan,
 * targetExists) in ⇒ same boolean out. Defense-in-depth re-checks pinned/protected independently of planMove's
 * own filtering, so a malformed plan can never sneak a pinned/protected file into the auto tier.
 */
export function isSafeTier(plan, targetExists) {
  if (!plan || plan.blocked) return false;                 // blocked = unclassified / already-placed / ephemeral
  if (plan.blockMove) return false;                        // pinned anchor flag from the deps scanner
  if (isPinned(plan.source)) return false;                 // defense-in-depth
  if (isProtectedPath(plan.source)) return false;          // never relocate a protected/secret source
  if (!plan.target || isProtectedPath(plan.target)) return false;
  if (plan.risk !== 'LOW') return false;                   // MEDIUM/HIGH/CRITICAL queue for the owner
  if (!(Number(plan.refCount) <= 3)) return false;         // few inbound refs only
  if (Number(plan.basenameOnlyCount) !== 0) return false;  // any manual/basename-only ref ⇒ owner review
  if ((plan.protectedRefHosts?.length || 0) !== 0) return false; // a protected ref-host ⇒ owner review
  if (targetExists === true) return false;                 // never clobber an existing target
  return true;
}

/** Human-readable reason a plan is NOT in the auto tier (for the queued report). Pure. */
export function queueReason(plan, targetExists) {
  if (!plan) return 'null plan';
  if (plan.blocked) return plan.reason || 'blocked';
  if (plan.blockMove || isPinned(plan.source)) return 'pinned canonical anchor';
  if (isProtectedPath(plan.source)) return 'protected source';
  if (!plan.target || isProtectedPath(plan.target)) return 'no safe target';
  if (plan.risk !== 'LOW') return `risk ${plan.risk} — owner review`;
  if (!(Number(plan.refCount) <= 3)) return `refCount ${plan.refCount} > 3`;
  if (Number(plan.basenameOnlyCount) !== 0) return `${plan.basenameOnlyCount} basename-only refs — manual import review`;
  if ((plan.protectedRefHosts?.length || 0) !== 0) return `${plan.protectedRefHosts.length} protected ref-host(s)`;
  if (targetExists === true) return 'target already exists';
  return 'queued';
}

/**
 * partitionPlans(plans, opts) — split the planned moves into { auto, queued }, applying the per-run budget K.
 * Pure given an injected existsFn (defaults to on-disk fs.existsSync). The auto tier is sorted LOW→… (all LOW)
 * then by source for stable order; the first K go to auto, the overflow is queued as budget-deferred. Every
 * non-safe plan is queued with a reason. EPHEMERAL/blocked plans arrive already blocked ⇒ queued, never auto.
 */
export function partitionPlans(plans, opts = {}) {
  const budget = Number.isFinite(opts.budget) ? opts.budget : DEFAULT_BUDGET;
  const existsFn = typeof opts.existsFn === 'function'
    ? opts.existsFn
    : (target) => { try { return fs.existsSync(path.join(REPO, target)); } catch { return false; } };

  const list = Array.isArray(plans) ? plans : [];
  const safe = [];
  const queued = [];
  for (const plan of list) {
    const targetExists = plan && plan.target ? existsFn(plan.target) : false;
    if (isSafeTier(plan, targetExists)) safe.push(plan);
    else queued.push({ source: plan?.source, target: plan?.target, risk: plan?.risk, reason: queueReason(plan, targetExists) });
  }
  const safeSorted = sortByRisk(safe);
  const auto = safeSorted.slice(0, Math.max(0, budget));
  for (const overflow of safeSorted.slice(Math.max(0, budget))) {
    queued.push({ source: overflow.source, target: overflow.target, risk: overflow.risk, reason: `deferred — per-run budget cap ${budget} reached` });
  }
  queued.sort((a, b) => String(a.source).localeCompare(String(b.source)));
  return { auto, queued, budget };
}

// ── deterministic plan hash ───────────────────────────────────────────────────────────────────────
/** Canonical, order-independent line for one plan. Pure. */
function planLine(plan) {
  const hosts = (plan.refsToUpdate || []).map((r) => normalizePath(r.file)).sort();
  return [
    normalizePath(plan.source || ''),
    normalizePath(plan.target || ''),
    plan.risk || '',
    Number(plan.refCount || 0),
    Number(plan.basenameOnlyCount || 0),
    hosts.join(','),
  ].join('\t');
}
/**
 * planHashOf(plans) — sha256 over the SORTED source→target→refs lines of the non-blocked plans. Order-independent
 * (sorted internally) so two enumerations of the same repo state hash identically. The timestamp/runId never
 * enters here — the hash is a pure function of the move plan, which is a pure function of repo state.
 */
export function planHashOf(plans) {
  const lines = (Array.isArray(plans) ? plans : [])
    .filter((p) => p && !p.blocked && p.target)
    .map(planLine)
    .sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

// ── git helpers ─────────────────────────────────────────────────────────────────────────────────
function git(args, opts = {}) {
  try { return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], ...opts }); }
  catch (e) { if (opts.allowFail) return ''; throw e; }
}
function gitHead() { try { return git(['rev-parse', 'HEAD'], { allowFail: true }).trim() || null; } catch { return null; } }
function currentBranch() { try { return git(['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true }).trim() || null; } catch { return null; } }

/**
 * enumerateMisplaced(opts) — tracked + untracked-non-ignored files that the assessor calls genuinely misplaced
 * (protected/pinned/settled are already excluded by assess()). Deterministic: sorted. `lsFiles` is injectable
 * for hermetic tests; default reads `git ls-files -c -o --exclude-standard`.
 */
export function enumerateMisplaced(opts = {}) {
  let files;
  if (Array.isArray(opts.files)) files = opts.files;
  else {
    const out = typeof opts.lsFiles === 'function'
      ? opts.lsFiles()
      : git(['ls-files', '-c', '-o', '--exclude-standard'], { allowFail: true });
    files = String(out || '').split('\n').filter(Boolean);
  }
  const misplaced = [];
  for (const f of files) {
    const a = assess(f);
    if (a.misplaced === true) misplaced.push(a.path);
  }
  return [...new Set(misplaced)].sort();
}

// ── reindex + stale-ref verification ───────────────────────────────────────────────────────────────
function runReindex({ skipGitnexus = false } = {}) {
  const result = { fts5: null, gitnexus: null };
  const ai = path.join(REPO, '_SYSTEM', 'Scripts', 'ai');
  try {
    const r = spawnSync(ai, ['reindex'], { cwd: REPO, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
    result.fts5 = r.status === 0 ? 'ok' : `exit ${r.status}${r.stderr ? ': ' + String(r.stderr).slice(0, 120) : ''}`;
  } catch (e) { result.fts5 = `error: ${e.message}`; }
  if (skipGitnexus) { result.gitnexus = 'skipped'; return result; }
  try {
    const r = spawnSync('npx', ['gitnexus', 'analyze', '--skip-agents-md'], { cwd: REPO, encoding: 'utf8', timeout: 480000, maxBuffer: 32 * 1024 * 1024 });
    result.gitnexus = r.status === 0 ? 'ok' : `exit ${r.status}`;
  } catch (e) { result.gitnexus = `error: ${e.message}`; }
  return result;
}

/**
 * verifyNoStaleRefs(oldPaths) — git grep -nF each moved source path across tracked + untracked-non-ignored
 * files. Any standalone hit means a reference was NOT rewritten — the run must fail loudly. Returns
 * { clean, stale:[{path, hits}] }.
 */
export function verifyNoStaleRefs(oldPaths) {
  const stale = [];
  for (const p of (oldPaths || [])) {
    let out = '';
    try { out = git(['grep', '-n', '-I', '-F', '--untracked', '--no-color', '-e', p], { allowFail: true }); }
    catch { out = ''; }
    const hits = String(out || '').split('\n').filter(Boolean);
    if (hits.length) stale.push({ path: p, hits: hits.slice(0, 8) });
  }
  return { clean: stale.length === 0, stale };
}

// ── governance record (borrowed contract — best-effort, never in the decision path) ────────────────
// Borrows the YURI governed-autonomy contract (yuri-autonomy-runner.mjs, an L5_SCHEDULED_AUTOMATION manifest +
// validator). The FULL manifest runs an xref preflight subprocess (slow + writes a search cache), so it only
// fires on a real armed execute (`full`). Routine dry-run ticks record the lightweight, side-effect-free shape
// of the contract — same level/decision semantics, no subprocess. Either way it is OUT of the move-decision path.
async function governanceManifest({ willMutate, full }) {
  if (!full) {
    return { level: 'L5_SCHEDULED_AUTOMATION', decision: willMutate ? 'scheduled_run_manifest' : 'dry_run_manifest', validationOk: null, mode: 'lightweight' };
  }
  try {
    const mod = await import('./yuri-autonomy-runner.mjs');
    const manifest = mod.buildAutonomyRunManifest({
      goal: 'YURI filing system: scheduled deterministic relocation of misplaced loose artifacts into canonical zones (safe LOW tier only; MEDIUM+ queued for owner).',
      requestedMode: 'scheduled-automation',
      approvalBoundary: willMutate ? 'scheduled-run' : 'dry-run-only',
    });
    const validation = mod.validateAutonomyRunManifest(manifest);
    return { level: manifest.autonomy?.level || null, decision: manifest.decision || null, validationOk: validation.ok, gitHead: manifest.baselineAnchor?.git?.head || null, mode: 'full' };
  } catch (e) {
    return { level: null, decision: null, validationOk: null, unavailable: String(e?.message || e).slice(0, 160), mode: 'full-failed' };
  }
}

// ── ledger + queued report ────────────────────────────────────────────────────────────────────────
function appendLedger(entry) {
  try {
    fs.mkdirSync(path.dirname(RUN_LEDGER), { recursive: true });
    fs.appendFileSync(RUN_LEDGER, JSON.stringify(entry) + '\n');
    return true;
  } catch { return false; }
}

function writeQueueReport(run) {
  const lines = [];
  lines.push('# YURI Filing Autonomy — Latest Run');
  lines.push('');
  lines.push(`- Run id: \`${run.runId}\``);
  lines.push(`- Timestamp: ${run.ts}`);
  lines.push(`- Branch: ${run.branch} · Mode: ${run.dryRun ? 'DRY-RUN' : 'EXECUTE'} · Armed: ${run.armed ? 'yes' : 'no'}`);
  lines.push(`- Plan hash: \`${run.planHash}\``);
  lines.push(`- Misplaced candidates: ${run.tierCounts.candidates} · auto-tier eligible: ${run.tierCounts.auto} · executed: ${run.movesExecuted} · queued for owner: ${run.tierCounts.queued}`);
  lines.push(`- Rollback from (pre-run HEAD): \`${run.rollbackFrom || 'n/a'}\``);
  if (run.staleRefVerification) lines.push(`- Stale-ref verification: ${run.staleRefVerification.clean ? 'CLEAN' : 'STALE REFS REMAIN — run FAILED'}`);
  lines.push('');
  if (run.executed?.length) {
    lines.push('## Auto-executed this run (safe tier — staged, not committed)');
    lines.push('');
    lines.push('| source | → target | refs updated |');
    lines.push('|---|---|---|');
    for (const m of run.executed) lines.push(`| \`${m.source}\` | \`${m.target}\` | ${m.refCount ?? 0} |`);
    lines.push('');
    lines.push('Rollback (before any owner commit, reverse order):');
    lines.push('```bash');
    for (const m of [...run.executed].reverse()) lines.push(`git mv "${m.target}" "${m.source}"${(m.updatedHosts || []).map((h) => ` && git checkout -- "${h}"`).join('')}`);
    lines.push('```');
    lines.push('');
  }
  lines.push(`## Queued for owner (${run.queued.length}) — NEVER auto-applied`);
  lines.push('');
  lines.push('Review with the dry-run mutator before executing any of these:');
  lines.push('```bash');
  lines.push('node _SYSTEM/Scripts/filing-mutator.mjs <path>            # dry-run');
  lines.push('node _SYSTEM/Scripts/filing-mutator.mjs <path> --execute  # after review');
  lines.push('```');
  lines.push('');
  lines.push('| source | → target | risk | reason |');
  lines.push('|---|---|---|---|');
  for (const q of run.queued) lines.push(`| \`${q.source}\` | ${q.target ? '`' + q.target + '`' : '—'} | ${q.risk || '—'} | ${q.reason} |`);
  lines.push('');
  lines.push('*Generated by `filing-autonomy.mjs`. Every count from live `git ls-files` + the deterministic assessor/deps/mutator. No model inference.*');
  try {
    fs.mkdirSync(path.dirname(QUEUE_REPORT), { recursive: true });
    fs.writeFileSync(QUEUE_REPORT, lines.join('\n') + '\n');
    return QUEUE_REPORT;
  } catch { return null; }
}

// ── the orchestrator ────────────────────────────────────────────────────────────────────────────
/**
 * runFiling(opts) — enumerate → planBatch → partition → (execute safe tier iff armed+execute) → reindex →
 * verify zero stale → write run-ledger + queued report. Dry-run by default; execute requires opts.execute AND
 * the dual arming flags. Returns a structured run record (also appended to the ledger).
 *
 *   opts.execute     — request mutation (still requires arming)
 *   opts.budget      — per-run auto-move cap (default DEFAULT_BUDGET)
 *   opts.files       — inject an explicit candidate list (tests / scoped runs); else enumerate the repo
 *   opts.skipReindex — skip the post-move reindex (the stale-ref git-grep verify still runs)
 *   opts.now         — ISO timestamp override (tests)
 */
export async function runFiling(opts = {}) {
  const ts = opts.now || new Date().toISOString();
  const branch = currentBranch();
  const armed = opts.armed !== undefined ? opts.armed : isArmed();
  const wantExecute = opts.execute === true;
  const budget = Number.isFinite(opts.budget) ? opts.budget : DEFAULT_BUDGET;

  // Enumerate + plan (READ-ONLY, deterministic).
  const candidates = enumerateMisplaced(opts);
  const plans = planBatch(candidates);
  const planHash = planHashOf(plans);
  const { auto, queued } = partitionPlans(plans, { budget, existsFn: opts.existsFn });

  const runId = `fa_${String(ts).replace(/[^0-9T]/g, '').slice(0, 15)}_${planHash.slice(0, 8)}`;
  const rollbackFrom = gitHead();

  // Fail-safe gate: mutate ONLY when execute requested AND armed AND on the canonical branch.
  const willMutate = wantExecute && armed && branch === REQUIRED_BRANCH;
  const gateReason = !wantExecute ? 'dry-run (no --execute)'
    : !armed ? 'DISARMED — needs YURI_FILING_AUTONOMY=1 AND the flag file'
    : branch !== REQUIRED_BRANCH ? `refused — branch is "${branch}", not "${REQUIRED_BRANCH}"`
    : 'armed + execute';

  const executed = [];
  let staleRefVerification = null;
  let reindex = null;

  if (willMutate && auto.length) {
    for (const plan of auto) {
      const r = executeMove(plan, { dryRun: false });
      if (r.moved) executed.push({ source: r.source, target: r.target, refCount: r.refCount, updatedHosts: r.updatedHosts || [] });
      else { executed.push({ source: plan.source, target: plan.target, error: r.error || r.reason, aborted: !!r.aborted }); break; } // abort batch on first failure
    }
    const movedOld = executed.filter((m) => !m.error).map((m) => m.source);
    if (movedOld.length) {
      reindex = opts.skipReindex ? { fts5: 'skipped', gitnexus: 'skipped' } : runReindex({ skipGitnexus: opts.skipGitnexus });
      staleRefVerification = verifyNoStaleRefs(movedOld);
    }
  }

  // Full governed-autonomy manifest only on a real armed execute (the xref preflight is heavyweight + has a
  // cache side-effect); routine dry-run ticks record the lightweight contract shape. Opt in via opts.governanceFull.
  const governance = await governanceManifest({ willMutate, full: opts.governanceFull === true || (willMutate && opts.skipGovernanceFull !== true) });

  const tierCounts = { candidates: candidates.length, auto: auto.length, queued: queued.length, executed: executed.filter((m) => !m.error).length };
  const movesExecuted = tierCounts.executed;
  const run = {
    runId, ts, branch, armed, dryRun: !willMutate, gateReason,
    planHash, tierCounts, movesExecuted,
    rollbackFrom,
    revertRange: rollbackFrom ? `${rollbackFrom}..HEAD` : null,
    revertNote: 'staged-only (runner never commits). Use the per-move inverse in the queued report, or `git revert <range>` after the owner commits the batch.',
    reindex, staleRefVerification,
    queuedForOwnerCount: queued.length,
    governance,
    executed, queued,
    schema: 'filing-autonomy-run.v0',
  };

  // HARD failure: a real execute that left stale refs is a broken run — surface it loudly.
  run.failed = !!(willMutate && staleRefVerification && staleRefVerification.clean === false);

  if (!opts.noWrite) {
    appendLedger({
      runId, ts, branch, armed, dryRun: run.dryRun, gateReason, planHash, tierCounts, movesExecuted, rollbackFrom,
      revertRange: run.revertRange, reindex, staleRefVerification, queuedForOwnerCount: queued.length, governance, failed: run.failed,
    });
    run.queueReport = writeQueueReport(run);
  }
  return run;
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────
function fmt(run) {
  const lines = [];
  lines.push(`filing-autonomy ${run.dryRun ? 'DRY-RUN' : 'EXECUTE'} · ${run.gateReason}`);
  lines.push(`  runId ${run.runId} · branch ${run.branch} · planHash ${run.planHash.slice(0, 12)}…`);
  lines.push(`  candidates ${run.tierCounts.candidates} · auto-tier ${run.tierCounts.auto} · executed ${run.movesExecuted} · queued ${run.tierCounts.queued}`);
  if (run.rollbackFrom) lines.push(`  rollbackFrom ${run.rollbackFrom.slice(0, 12)} · range ${run.revertRange}`);
  if (run.staleRefVerification) lines.push(`  stale-ref verify: ${run.staleRefVerification.clean ? 'CLEAN' : 'STALE — FAILED'}`);
  if (run.reindex) lines.push(`  reindex: fts5=${run.reindex.fts5} gitnexus=${run.reindex.gitnexus}`);
  if (run.governance) lines.push(`  governance: ${run.governance.level || 'n/a'} / ${run.governance.decision || run.governance.unavailable || 'n/a'}`);
  if (run.queueReport) lines.push(`  queued report → ${normalizePath(path.relative(REPO, run.queueReport))}`);
  if (run.failed) lines.push('  ⚠ RUN FAILED — stale references remain after execution.');
  if (run.dryRun) lines.push('  (dry-run — nothing moved. Arm + --execute to mutate the safe tier.)');
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const execute = argv.includes('--execute');
  const json = argv.includes('--json');
  const skipReindex = argv.includes('--no-reindex');
  const skipGitnexus = argv.includes('--no-gitnexus');
  const bIdx = argv.indexOf('--budget');
  const budget = bIdx >= 0 ? Number(argv[bIdx + 1]) : undefined;
  runFiling({ execute, budget, skipReindex, skipGitnexus }).then((run) => {
    process.stdout.write((json ? JSON.stringify(run, null, 2) : fmt(run)) + '\n');
    process.exitCode = run.failed ? 1 : 0;
  }).catch((e) => { process.stderr.write(`[filing-autonomy] ${e.message || e}\n`); process.exitCode = 2; });
}
