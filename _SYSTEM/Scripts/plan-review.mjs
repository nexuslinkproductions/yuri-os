#!/usr/bin/env node
/**
 * plan-review.mjs — OPTIONAL human-in-the-loop (HITL) plan/diff review sublane.
 *
 * WHY THIS EXISTS (github-adoption 2026-06-13, item: human-review-sublane,
 * clean-room re-imagining of backnotprop/plannotator's plan-annotation idea — NO code copied):
 *   YURI's autonomous path arms `plan_dispatch_gate` on ExitPlanMode and (advisory) nudges
 *   the next mutation toward `ai route-plan` dispatch. plannotator's genuine delta is a
 *   HUMAN review surface: capture a plan, let a human annotate it, ship structured feedback
 *   back, and DIFF successive plan revisions so reviewer + author see what actually changed.
 *   This module is that surface, YURI-native + deterministic.
 *
 * POSTURE: ADVISORY (this phase). When plan_review_mode is ON, the PreToolUse guard emits a
 *   PACING WARNING (emitWarnings) on the first post-ExitPlanMode mutation — it does NOT hard
 *   block. Whether the changes-requested (F) verdict becomes a real R4 hard gate is an OWNER
 *   decision (see 03-SIM-REDTEAM.md owner-decisions) and is deliberately NOT implemented here.
 *
 * LOAD-BEARING SAFETY INVARIANT — MUTUAL EXCLUSION:
 *   plan_review_mode and the autonomous plan_dispatch_gate must NEVER both fire on the same
 *   ExitPlanMode / PermissionRequest event. The toggle here is the single source of truth;
 *   the two PreToolUse gate-eval sites + the PostToolUse arm site all read `isPlanReviewMode()`
 *   and exclude. This module owns the read; the hooks own the exclusion wiring.
 *
 * SESSION-STATE DISCIPLINE: session-state.json is a deny-listed path. ALL reads/writes go
 *   through the .claude/hooks/session-state.js wrapper (atomic tmp+rename). This module NEVER
 *   touches the file directly.
 *
 * REVISION STORE: plan revisions are written to a non-protected scratch dir
 *   (`_SYSTEM/state/plan-review/`), atomic tmp+rename. NOT session-state.
 *
 * RESULT_LABEL: emits a BARE, valid Lane Result Grammar label (parseResultLabel-conformant):
 *   `09PR_PLAN_REVIEW_<verb>_<X|P|F>_<PASS_COMMITTED|BLOCKED>`.
 */
// @capability: plan-review-hitl
// @serves: human review plan | plan annotation | HITL plan gate | plan diff revisions | review feedback to agent | human-in-the-loop
// @does: optional human-in-the-loop plan/diff review sublane — capture/annotate a plan, diff revisions (LCS + scale cap, atomic write), toggle a session mode mutually-exclusive with the autonomous plan_dispatch_gate
// @use: when a human needs to review/annotate an agent plan before dispatch, or to toggle HITL plan-review mode (mutually exclusive with the autonomous route-plan dispatch gate)
// @exports: isPlanReviewMode, setPlanReviewMode, capturePlan, annotatePlan, computePlanDiff, buildResultLabel, PLAN_REVIEW_DIFF_SCALE_CAP
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// session-state.js is the ONLY sanctioned writer of the deny-listed session-state.json.
const ss = require(path.join(REPO_ROOT, '.claude', 'hooks', 'session-state.js'));

// Revision store — non-protected scratch (NOT .claude/state, NOT session-state).
const REVISION_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'plan-review');

// LCS is O(n*m). Cap the token budget so a pathological huge-plan pair can't wedge the diff.
// Above the cap we degrade to a deterministic line-set summary (still useful, never hangs).
export const PLAN_REVIEW_DIFF_SCALE_CAP = 4000; // lines per side

// ── mutual-exclusion source of truth ────────────────────────────────────────
// isPlanReviewMode reads the session-state via the wrapper. It is the ONE read the hooks
// share so the toggle and the gate wiring can never drift. Fail-SAFE on unreadable state:
// returns false (mode OFF) so a corrupt state never silently parks the session in HITL mode.
export function isPlanReviewMode(state) {
  try {
    const s = state || ss.read();
    return !!(s && s.plan_review_mode && s.plan_review_mode.enabled === true);
  } catch (_) {
    return false;
  }
}

/**
 * setPlanReviewMode(enabled) — TOGGLE. MUST FAIL LOUD.
 * The live session-state has NO `plan_review_mode` key. A silent no-op toggle (the failure
 * mode this build explicitly guards against) would leave the operator believing HITL is on
 * while the autonomous gate keeps firing — a mutual-exclusion violation. So:
 *   - null/corrupt/missing state  → throw (caller exits nonzero + stderr).
 *   - write, then READ BACK and VERIFY the flag actually landed → throw on mismatch.
 * ss.update is a silent no-op when read() returns null (see session-state.js), so we MUST
 * pre-check read() and post-verify the read-back — update() alone is not trustworthy here.
 */
export function setPlanReviewMode(enabled, opts = {}) {
  const want = enabled === true;
  const reader = opts.read || ss.read;
  const updater = opts.update || ss.update;

  const before = reader();
  if (!before || typeof before !== 'object') {
    throw new Error(
      'plan-review: session-state is null/corrupt/missing — cannot toggle plan_review_mode. ' +
      'session-state must be initialized (SessionStart) before toggling HITL review. NOT a silent no-op.'
    );
  }

  updater((s) => {
    s.plan_review_mode = {
      enabled: want,
      changed_at: Date.now(),
    };
  });

  // READ-BACK VERIFY — the load-bearing fail-loud step.
  const after = reader();
  const landed = !!(after && after.plan_review_mode && after.plan_review_mode.enabled === want);
  if (!landed) {
    throw new Error(
      `plan-review: toggle did NOT persist (wanted enabled=${want}). ` +
      'Read-back verification failed — refusing to report success on an unverified write.'
    );
  }
  return { ok: true, enabled: want, verified: true };
}

// ── plan capture + annotation + revision store ──────────────────────────────
function ensureRevisionDir() {
  fs.mkdirSync(REVISION_DIR, { recursive: true });
}

function atomicWriteJson(filePath, obj) {
  ensureRevisionDir();
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, filePath); // atomic on same filesystem
}

function safeId(s) {
  // Closed-set sanitize — no path traversal, no separators in a revision id.
  return String(s || 'plan').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'plan';
}

function revisionPath(planId, rev) {
  return path.join(REVISION_DIR, `${safeId(planId)}.rev${Number(rev) || 0}.json`);
}

function latestRevisionNumber(planId) {
  ensureRevisionDir();
  const prefix = `${safeId(planId)}.rev`;
  let max = -1;
  for (const f of fs.readdirSync(REVISION_DIR)) {
    if (!f.startsWith(prefix) || !f.endsWith('.json')) continue;
    const m = f.match(/\.rev(\d+)\.json$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/**
 * capturePlan({ planId, planText, source }) — store a plan revision atomically.
 * Auto-increments the revision number off the existing store. Returns the stored record.
 */
export function capturePlan({ planId, planText, source = 'unknown' } = {}) {
  if (typeof planText !== 'string' || planText.length === 0) {
    throw new Error('plan-review.capturePlan: planText must be a non-empty string');
  }
  const id = safeId(planId);
  const rev = latestRevisionNumber(id) + 1;
  const record = {
    planId: id,
    revision: rev,
    source,
    capturedAt: new Date().toISOString(),
    planText,
    annotations: [],
  };
  atomicWriteJson(revisionPath(id, rev), record);
  return record;
}

/**
 * annotatePlan({ planId, revision, note, lineRef, verdict }) — append a structured
 * annotation (the human's feedback) onto a stored revision. Atomic rewrite.
 * verdict ∈ {approve, changes-requested, comment}; defaults to comment.
 */
export function annotatePlan({ planId, revision, note, lineRef = null, verdict = 'comment' } = {}) {
  const id = safeId(planId);
  const rev = Number(revision);
  const p = revisionPath(id, rev);
  if (!fs.existsSync(p)) {
    throw new Error(`plan-review.annotatePlan: no stored revision ${rev} for plan "${id}"`);
  }
  if (typeof note !== 'string' || note.length === 0) {
    throw new Error('plan-review.annotatePlan: note must be a non-empty string');
  }
  const allowed = new Set(['approve', 'changes-requested', 'comment']);
  const v = allowed.has(verdict) ? verdict : 'comment';
  const record = JSON.parse(fs.readFileSync(p, 'utf8'));
  record.annotations.push({
    note,
    lineRef: lineRef == null ? null : Number(lineRef),
    verdict: v,
    at: new Date().toISOString(),
  });
  atomicWriteJson(p, record);
  return record;
}

// ── Plan-Diff (LCS line diff with a SCALE CAP) ──────────────────────────────
function tokenizeLines(text) {
  return String(text || '').split('\n');
}

/**
 * lcsDiff(a, b) — classic LCS over line arrays, folded into a unified diff op list:
 * {op: 'eq'|'add'|'del', line}. Bounded by the scale cap upstream (computePlanDiff) so the
 * O(n*m) table never explodes.
 */
function lcsDiff(aLines, bLines) {
  const n = aLines.length;
  const m = bLines.length;
  // DP table (n+1)x(m+1)
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = aLines[i] === bLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      ops.push({ op: 'eq', line: aLines[i] });
      i += 1; j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ op: 'del', line: aLines[i] });
      i += 1;
    } else {
      ops.push({ op: 'add', line: bLines[j] });
      j += 1;
    }
  }
  while (i < n) { ops.push({ op: 'del', line: aLines[i] }); i += 1; }
  while (j < m) { ops.push({ op: 'add', line: bLines[j] }); j += 1; }
  return ops;
}

/**
 * computePlanDiff(prevText, nextText) — Plan-Diff across resubmissions.
 * Below the scale cap: full LCS line diff. Above it: a deterministic line-set summary
 * (added/removed counts via multiset difference) so a pathological pair never wedges the
 * session. Returns { mode, added, removed, unchanged, ops?, capped }.
 */
export function computePlanDiff(prevText, nextText, opts = {}) {
  const cap = Number(opts.scaleCap) || PLAN_REVIEW_DIFF_SCALE_CAP;
  const a = tokenizeLines(prevText);
  const b = tokenizeLines(nextText);

  if (a.length > cap || b.length > cap) {
    // Degrade: multiset-difference summary (order-insensitive, O(n+m)).
    const aSet = new Map();
    for (const l of a) aSet.set(l, (aSet.get(l) || 0) + 1);
    let removed = 0;
    let unchanged = 0;
    for (const l of b) {
      const c = aSet.get(l) || 0;
      if (c > 0) { unchanged += 1; aSet.set(l, c - 1); }
    }
    const added = b.length - unchanged;
    for (const c of aSet.values()) removed += c;
    return { mode: 'summary', capped: true, added, removed, unchanged, scaleCap: cap };
  }

  const ops = lcsDiff(a, b);
  const added = ops.filter((o) => o.op === 'add').length;
  const removed = ops.filter((o) => o.op === 'del').length;
  const unchanged = ops.filter((o) => o.op === 'eq').length;
  return { mode: 'lcs', capped: false, added, removed, unchanged, ops };
}

// ── RESULT_LABEL builder (Lane Result Grammar; parseResultLabel-conformant) ──
const VERDICT_TO_PASS = { approve: 'X', partial: 'P', 'changes-requested': 'F', blocked: 'F' };

/**
 * buildResultLabel(verb, verdict) — BARE Lane Result Grammar label.
 * X/P → _PASS_COMMITTED terminal; F → _BLOCKED terminal (F cannot use PASS_COMMITTED).
 * e.g. buildResultLabel('CAPTURE', 'approve') → '09PR_PLAN_REVIEW_CAPTURE_X_PASS_COMMITTED'.
 */
export function buildResultLabel(verb, verdict) {
  const pass = VERDICT_TO_PASS[verdict] || 'P';
  const terminal = pass === 'F' ? 'BLOCKED' : 'PASS_COMMITTED';
  const desc = `PLAN_REVIEW_${String(verb || 'OP').toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  return `09PR_${desc}_${pass}_${terminal}`;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function printResult(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'on':
    case 'off': {
      // Toggle MUST FAIL LOUD — setPlanReviewMode throws on null/corrupt state + read-back fail.
      try {
        const res = setPlanReviewMode(cmd === 'on');
        printResult({ ...res, resultLabel: buildResultLabel(`TOGGLE_${cmd.toUpperCase()}`, 'approve') });
        return 0;
      } catch (e) {
        process.stderr.write(`[plan-review] TOGGLE FAILED: ${e.message}\n`);
        printResult({ ok: false, error: e.message, resultLabel: buildResultLabel('TOGGLE', 'blocked') });
        return 1;
      }
    }
    case 'status': {
      const on = isPlanReviewMode();
      printResult({ ok: true, planReviewMode: on, resultLabel: buildResultLabel('STATUS', 'approve') });
      return 0;
    }
    case 'capture': {
      try {
        const planId = rest[0] || 'plan';
        const planText = rest.slice(1).join(' ') || fs.readFileSync(0, 'utf8');
        const rec = capturePlan({ planId, planText, source: 'cli' });
        printResult({ ok: true, planId: rec.planId, revision: rec.revision, resultLabel: buildResultLabel('CAPTURE', 'approve') });
        return 0;
      } catch (e) {
        process.stderr.write(`[plan-review] CAPTURE FAILED: ${e.message}\n`);
        printResult({ ok: false, error: e.message, resultLabel: buildResultLabel('CAPTURE', 'blocked') });
        return 1;
      }
    }
    case 'diff': {
      try {
        const planId = safeId(rest[0] || 'plan');
        const a = Number(rest[1]);
        const b = Number(rest[2]);
        const pa = JSON.parse(fs.readFileSync(revisionPath(planId, a), 'utf8'));
        const pb = JSON.parse(fs.readFileSync(revisionPath(planId, b), 'utf8'));
        const d = computePlanDiff(pa.planText, pb.planText);
        printResult({ ok: true, planId, from: a, to: b, diff: { mode: d.mode, added: d.added, removed: d.removed, unchanged: d.unchanged, capped: d.capped }, resultLabel: buildResultLabel('DIFF', 'approve') });
        return 0;
      } catch (e) {
        process.stderr.write(`[plan-review] DIFF FAILED: ${e.message}\n`);
        printResult({ ok: false, error: e.message, resultLabel: buildResultLabel('DIFF', 'blocked') });
        return 1;
      }
    }
    default:
      process.stderr.write('usage: plan-review.mjs <on|off|status|capture <id> [text]|diff <id> <revA> <revB>>\n');
      return 2;
  }
}

if (import.meta.url === url.pathToFileURL(process.argv[1] || '').href) {
  process.exit(main(process.argv.slice(2)));
}
