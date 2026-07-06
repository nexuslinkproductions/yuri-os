#!/usr/bin/env node
/**
 * filing-mutator.mjs — the mutation half of the YURI filing system. Takes the assessor's placement +
 * the dependency scanner's reference map and produces a move plan with FULL reference propagation.
 *
 * Contract (safety is the whole point):
 *  - DRY-RUN BY DEFAULT. Execution is explicit opt-in ({dryRun:false} / --execute). The owner reviews first.
 *  - References are updated BEFORE the move, never after. If a reference can't be safely rewritten, the move ABORTS.
 *  - git mv preserves history (plain fs.rename fallback only for untracked sources). Target dir is created; an
 *    existing target is never clobbered.
 *  - HARD-refuse, defense-in-depth: pinned canonical anchors (the 3 @-includes etc.), protected sources, and
 *    protected/empty targets are refused even if a caller hands a malformed plan.
 *  - Rollback: each execution records the pre-move commit hash (rollbackFrom). In-process, a failure restores
 *    every edited host from its captured original; after commit, `git revert <rollbackFrom..HEAD>` reverses it.
 *  - Reference rewriting is a CONSERVATIVE path-token replace: srcRel is only rewritten where it stands alone
 *    (delimited by non-path characters), so it can never corrupt a longer sibling path (foo.md vs foo.md.bak).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizePath, isProtectedPath, REPO_ROOT } from './yuri-id-bridge.mjs';
import { assess, isPinned } from './filing-assessor.mjs';
import { scanDeps, exactPathRefs } from './filing-deps.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = REPO_ROOT || path.resolve(__dirname, '..', '..');

const RISK_W = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
export function riskWeight(r) { return RISK_W[r] ?? 3; }

// ── conservative path-token rewrite (pure) ───────────────────────────────────────────────────────
const PATH_CONT = 'A-Za-z0-9._/-';                       // chars that continue a path token
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function tokenRegex(p) { return new RegExp(`(^|[^${PATH_CONT}])(${escapeRe(p)})(?![${PATH_CONT}])`, 'g'); }
/** Replace srcRel with targetRel ONLY where srcRel is a standalone path token (safe against longer siblings). */
export function replaceToken(content, from, to) {
  return String(content).replace(tokenRegex(from), (m, pre) => pre + to);
}
/** Count standalone-token occurrences of p in content (used to verify zero stale refs remain). */
export function countToken(content, p) {
  const re = tokenRegex(p); let n = 0;
  while (re.exec(content) !== null) n++;
  return n;
}

// ── pure planning helpers ─────────────────────────────────────────────────────────────────────────
/** target path for a file given its canonical zone. null when there is no real relocation target. */
export function computeTargetPath(rel, zone) {
  if (!zone || zone === 'EPHEMERAL') return null;          // can't "file" into /tmp; no canonical home
  return `${zone}/${path.basename(normalizePath(rel))}`;
}
/** map each referencing host into a ref-update record. Pure. */
export function computeRefUpdates(rel, target, hostFiles) {
  return (hostFiles || []).map((h) => ({ file: h.file || h, layer: h.layer || 'unknown', oldPath: rel, newPath: target }));
}
/** sort plans LOW→CRITICAL so a batch can abort early on the safest possible footing. Pure. */
export function sortByRisk(plans) {
  return [...plans].sort((a, b) => riskWeight(a.risk) - riskWeight(b.risk) || String(a.source).localeCompare(String(b.source)));
}
/** ordered execution steps for a plan: update every ref FIRST, then move, then reindex. Pure. */
export function buildSteps(plan) {
  const steps = [];
  for (const r of plan.refsToUpdate || []) steps.push({ type: 'update-ref', file: r.file, layer: r.layer, old: plan.source, new: plan.target });
  steps.push({ type: 'git-mv', cmd: plan.gitCommand });
  if (plan.needsReindex?.fts5) steps.push({ type: 'reindex', target: 'fts5', cmd: 'ai reindex' });
  if (plan.needsReindex?.gitnexus) steps.push({ type: 'reindex', target: 'gitnexus', cmd: 'npx gitnexus analyze --skip-agents-md' });
  return steps;
}

// ── git helpers ─────────────────────────────────────────────────────────────────────────────────
function gitHead() { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(); } catch { return null; } }
function isTracked(rel) { try { execFileSync('git', ['ls-files', '--error-unmatch', rel], { cwd: REPO, stdio: 'ignore' }); return true; } catch { return false; } }

// ── plan ────────────────────────────────────────────────────────────────────────────────────────
/**
 * planMove(filePath, targetZone?) — build a fully reference-aware move plan. Defaults the target zone to the
 * assessor's recommendation. READ-ONLY (no disk mutation). Returns { blocked:true, reason } for anything that
 * must not move (pinned/protected/unclassified/already-canonical).
 */
export function planMove(filePath, targetZone) {
  const a = assess(filePath);
  const rel = a.path;
  if (a.kind === 'invalid') return { source: rel, blocked: true, reason: 'invalid path — cannot plan', risk: 'LOW' };
  if (a.protected) return { source: rel, blocked: true, reason: 'protected/secret path — never moved', risk: 'CRITICAL' };
  if (a.pinned) return { source: rel, blocked: true, blockMove: true, reason: 'pinned canonical anchor — never moved (e.g. an @-include)', risk: 'CRITICAL' };

  const zone = targetZone || a.recommendedZone;
  if (!zone) return { source: rel, blocked: true, reason: 'unclassified — needs owner placement decision', risk: 'LOW' };
  if (!targetZone && !a.misplaced) return { source: rel, blocked: true, reason: 'already in its canonical zone — no move needed', risk: 'LOW' };

  const target = computeTargetPath(rel, zone);
  if (!target) return { source: rel, blocked: true, reason: `zone "${zone}" has no canonical target path (ephemeral?)`, risk: 'LOW' };
  if (isProtectedPath(target)) return { source: rel, blocked: true, reason: `refused: target "${target}" is a protected path`, risk: 'CRITICAL' };

  const deps = scanDeps(rel);
  const exact = exactPathRefs(rel);
  const refsToUpdate = computeRefUpdates(rel, target, exact.files);
  return {
    source: rel,
    target,
    zone,
    misplaced: a.misplaced,
    risk: deps.riskLevel,
    blockMove: deps.blockMove,
    refsToUpdate,
    refCount: refsToUpdate.length,
    protectedRefHosts: exact.protectedHosts,                 // hosts we will NOT write (manual review)
    graphNodes: deps.graphNodes,                             // circuitry nodes whose files[] need updating
    basenameOnly: deps.basenameOnly,                         // relative-import refs needing MANUAL review
    basenameOnlyCount: deps.basenameOnlyCount,
    needsReindex: deps.needsReindex,
    gitCommand: `git mv "${rel}" "${target}"`,
    blocked: false,
  };
}

export function planBatch(filePaths, zoneOf) {
  return (Array.isArray(filePaths) ? filePaths : []).map((p) => planMove(p, typeof zoneOf === 'function' ? zoneOf(p) : undefined));
}

// ── execute ─────────────────────────────────────────────────────────────────────────────────────
function restore(backups) { for (const b of backups) { try { fs.writeFileSync(b.file, b.orig); } catch { /* best-effort */ } } }

/**
 * executeMove(plan, {dryRun}) — dry-run by default. On execute: update refs first (abort+restore on any
 * un-rewritable ref), then git mv. Records rollbackFrom. Never touches pinned/protected files.
 */
export function executeMove(plan, opts = {}) {
  const dryRun = opts.dryRun !== false;                     // default true
  if (!plan || plan.blocked) return { ok: false, blocked: true, reason: plan?.reason || 'blocked', source: plan?.source };

  // HARD GUARDS — defense-in-depth, independent of planMove's filtering.
  if (plan.blockMove || isPinned(plan.source)) return { ok: false, refused: true, reason: 'pinned canonical anchor — refused', source: plan.source };
  if (isProtectedPath(plan.source)) return { ok: false, refused: true, reason: 'protected source — refused', source: plan.source };
  if (!plan.target || isProtectedPath(plan.target)) return { ok: false, refused: true, reason: 'protected/empty target — refused', source: plan.source, target: plan.target };

  const steps = buildSteps(plan);
  if (dryRun) {
    return { ok: true, dryRun: true, source: plan.source, target: plan.target, risk: plan.risk, refCount: plan.refCount, basenameOnlyCount: plan.basenameOnlyCount, protectedRefHosts: plan.protectedRefHosts, needsReindex: plan.needsReindex, steps };
  }

  // ── EXECUTE ──
  const srcAbs = path.join(REPO, plan.source);
  const tgtAbs = path.join(REPO, plan.target);
  if (!fs.existsSync(srcAbs)) return { ok: false, error: 'source missing on disk', source: plan.source };
  if (fs.existsSync(tgtAbs)) return { ok: false, error: 'target already exists — will not clobber', source: plan.source, target: plan.target };

  const rollbackFrom = gitHead();
  const backups = [];

  // 1) UPDATE REFERENCES FIRST. Abort (and restore) if any host still holds a standalone stale token after rewrite.
  for (const r of plan.refsToUpdate) {
    if (isProtectedPath(r.file)) continue;                  // never write a protected host
    const hostAbs = path.join(REPO, r.file);
    let orig;
    try { orig = fs.readFileSync(hostAbs, 'utf8'); } catch (e) { restore(backups); return { ok: false, error: `read failed ${r.file}: ${e.message}`, source: plan.source }; }
    const updated = replaceToken(orig, plan.source, plan.target);
    if (countToken(updated, plan.source) > 0) {
      restore(backups);
      return { ok: false, aborted: true, error: `un-rewritable stale ref remains in ${r.file} — move aborted before touching disk`, source: plan.source };
    }
    if (updated !== orig) {
      try { fs.writeFileSync(hostAbs, updated); backups.push({ file: hostAbs, orig }); }
      catch (e) { restore(backups); return { ok: false, error: `write failed ${r.file}: ${e.message}`, source: plan.source }; }
    }
  }

  // 2) MOVE (git mv preserves history; fs.rename fallback only for untracked sources).
  try {
    fs.mkdirSync(path.dirname(tgtAbs), { recursive: true });
    if (isTracked(plan.source)) execFileSync('git', ['mv', plan.source, plan.target], { cwd: REPO });
    else fs.renameSync(srcAbs, tgtAbs);
  } catch (e) {
    restore(backups);
    return { ok: false, error: `move failed: ${e.message}`, source: plan.source, target: plan.target, hint: 'ref edits restored; no move performed' };
  }

  return {
    ok: true, moved: true, source: plan.source, target: plan.target, risk: plan.risk,
    rollbackFrom, updatedHosts: backups.map((b) => normalizePath(path.relative(REPO, b.file))),
    refCount: plan.refCount, needsReindex: plan.needsReindex,
    note: 'refs updated + file moved (staged). NEXT: run `ai reindex` + `npx gitnexus analyze`, verify zero stale refs, then owner commits.',
  };
}

/**
 * executeBatch(plans, {dryRun}) — execute LOW→CRITICAL so the safest moves go first. In execute mode, ABORT
 * the whole batch on the first error/abort (leaving already-done moves staged for owner review or revert).
 */
export function executeBatch(plans, opts = {}) {
  const dryRun = opts.dryRun !== false;
  const valid = (Array.isArray(plans) ? plans : []).filter((p) => p && !p.blocked);
  const blocked = (Array.isArray(plans) ? plans : []).filter((p) => p && p.blocked)
    .map((p) => ({ source: p.source, reason: p.reason, risk: p.risk }));
  const sorted = sortByRisk(valid);
  const results = [];
  for (const plan of sorted) {
    const r = executeMove(plan, opts);
    results.push(r);
    if (!dryRun && (r.error || r.aborted)) {
      return { dryRun, results, blocked, aborted: true, failedAt: plan.source, error: r.error };
    }
  }
  const moved = results.filter((r) => r.moved).length;
  return { dryRun, results, blocked, aborted: false, planned: sorted.length, moved, blockedCount: blocked.length };
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const execute = argv.includes('--execute');              // explicit opt-in; default is dry-run
  const zoneIdx = argv.indexOf('--zone');
  const forcedZone = zoneIdx >= 0 ? argv[zoneIdx + 1] : undefined;
  const paths = argv.filter((a, i) => !a.startsWith('--') && !(zoneIdx >= 0 && i === zoneIdx + 1));

  if (!paths.length) {
    process.stdout.write('usage: filing-mutator.mjs <path...> [--zone <ZONE>] [--execute] [--json]\n  (dry-run by default; --execute performs git mv + ref updates)\n');
    process.exitCode = 1;
  } else {
    const plans = paths.map((p) => planMove(p, forcedZone));
    const out = executeBatch(plans, { dryRun: !execute });
    if (json) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    else {
      process.stdout.write(`\nfiling-mutator ${out.dryRun ? 'DRY-RUN' : 'EXECUTE'} · planned ${out.planned ?? out.results.length} · blocked ${out.blockedCount ?? out.blocked.length}${out.aborted ? ' · ABORTED at ' + out.failedAt : ''}\n`);
      for (const b of out.blocked) process.stdout.write(`  ⊘ ${String(b.source).padEnd(52)} BLOCKED: ${b.reason}\n`);
      for (const r of out.results) {
        if (r.dryRun) process.stdout.write(`  → ${String(r.source).padEnd(52)} [${r.risk}] → ${r.target}  (${r.refCount} refs${r.basenameOnlyCount ? ', ' + r.basenameOnlyCount + ' manual' : ''})\n`);
        else if (r.moved) process.stdout.write(`  ✓ ${String(r.source).padEnd(52)} → ${r.target}  (${r.refCount} refs updated)\n`);
        else process.stdout.write(`  ✗ ${String(r.source).padEnd(52)} ${r.error || r.reason}\n`);
      }
      if (out.dryRun) process.stdout.write('\n  (dry-run — nothing moved. Re-run with --execute after owner review.)\n');
    }
  }
}
