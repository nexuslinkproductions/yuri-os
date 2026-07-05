#!/usr/bin/env node
// @capability: overnight-runner
// @serves: overnight runner | unattended task execution | yuri runtime overnight | task queue drain | retry-on-fail dispatch | yuri-runtime section 5 | mure task kind | overnight mure dispatch
// @does: DISARMED-FIRST runner around task-queue.mjs that pops tasks from an append-only overnight queue, builds a bounded lane-task prompt (task text + autonomous-work + RESULT_LABEL-required template), dispatches via glmFleet (or ollamaFleet) UNLESS --dry-run or the fleet is disarmed (then prints the plan, zero spend), verifies the result via extractResultLabel + classifyLaneOutcome, retries ONCE on outcome F or missing label with a sharper prompt, and appends the final result to overnight-results.jsonl. Fail-open per task: one bad task is recorded as failed, never killing the run. A second task KIND, "mure", carries a MURE company-task payload instead of a lane prompt: planCompany ALWAYS runs (zero-spend plan recorded in the result); runCompany (real dispatch) only runs when BOTH the runner itself is armed (not --dry-run) AND isMureArmed() — otherwise the result is an honest plan-only record, never a silent no-op. NO scheduling/launchd — the runner is INVOKED by owner/supervisor/beat; a plist TEMPLATE lives in the header comment, nothing is installed.
// @use:
//   node _SYSTEM/runtime/overnight-runner.mjs enqueue --task '<text>' [--lane glm|ollama] [--priority N]
//   node _SYSTEM/runtime/overnight-runner.mjs enqueue --kind mure --mure-task '<json>' [--priority N]
//   node _SYSTEM/runtime/overnight-runner.mjs enqueue --kind mure --mure-file <task.json> [--priority N]
//   node _SYSTEM/runtime/overnight-runner.mjs run --once [--dry-run]
//   node _SYSTEM/runtime/overnight-runner.mjs run --watch --max N [--dry-run]
//   node _SYSTEM/runtime/overnight-runner.mjs status --json
// @exports: enqueueTask, popNext, peekNext, sanitizeTaskText, buildLaneTask, validateMurePayload, runOnce, runWatch, getStatus, runnerDispatch (overrideable seam), __setDispatch (test hook), POP_LOCK_FILE (test-only)
//
// BUILD-ON (capability-first — NOT a reimplementation):
//   - _SYSTEM/Scripts/task-queue.mjs: FIFO-priority queue + single-task mutex + git-HEAD staleness.
//     Its `enqueue({prompt,lane,priority})` writes to .claude/state/task-queue.json (shared with the
//     pulse orchestrator). To keep OWNERSHIP CLEAN and avoid mutating a parallel session's shared queue,
//     this runner uses its OWN append-only queue (_SYSTEM/state/runtime/overnight-queue.jsonl) with the
//     SAME FIFO-within-priority semantics (higher priority first; same priority = insertion order). The
//     delegation path to task-queue.enqueue is preserved in `enqueueTask` (set opts.useTaskQueue=true).
//   - _SYSTEM/Scripts/glm-fleet.mjs: glmFleet(tasks,opts) — DISARMED by default (dry-run); YURI_GLM_FLEET=1 arms.
//     Returns {runId,runDir,armed,dryRun?,concurrency,plan[]|results[]} where each result is
//     {label,lane,text,exitCode,resultLabel,ok,degraded,outcomeReason,durationMs,...}.
//   - _SYSTEM/Scripts/ollama-fleet.mjs: ollamaFleet(tasks,opts) — identical shape/contract (YURI_OLLAMA_FLEET=1 arms).
//   - _SYSTEM/Scripts/contract-conformance.mjs: extractResultLabel(output)->{label,anchored},
//     classifyLaneOutcome({code,text})->{ok,degraded,reason}, parseResultLabel(label)->{ok,passTypeNorm,...}.
//   - _SYSTEM/mure/mure.mjs (re-exports _SYSTEM/mure/company.mjs): planCompany(task,opts) — PURE, DISARMED-safe
//     plan (casts/gates every subtask, zero spend); runCompany(task,opts) — plans THEN dispatches when
//     isMureArmed()===true and opts.armed!==false (armed is OWNER-gated inside company.mjs — a caller can only
//     force-DISARM, never self-arm). Both are used as-is; this runner adds NO parallel arming path.
//
// ============================================================================
// LAUNCHD PLIST TEMPLATE (NOT INSTALLED — copy to ~/Library/LaunchAgents/ to activate).
// The runner is INVOKED by this beat; it does not self-schedule. KeepAlive restarts the process
// if it dies; the --watch loop drains the queue then exits (re-launch picks up new tasks).
// ============================================================================
/*
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.yuri-os-musubi.overnight-runner</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/runtime/overnight-runner.mjs</string>
    <string>run</string>
    <string>--watch</string>
    <string>--max</string>
    <string>20</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/marcelspatz/YURI-OS-MUSUBI</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/state/runtime/overnight-runner.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/state/runtime/overnight-runner.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>YURI_GLM_FLEET</key>
    <string>1</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>23</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
</dict>
</plist>
*/
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { glmFleet, isArmed as glmIsArmed } from '../Scripts/glm-fleet.mjs';
import { ollamaFleet, isArmed as ollamaIsArmed } from '../Scripts/ollama-fleet.mjs';
import { extractResultLabel, classifyLaneOutcome, parseResultLabel } from '../Scripts/contract-conformance.mjs';
import { planCompany, runCompany, isMureArmed } from '../mure/mure.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const STATE_DIR = path.join(REPO_ROOT, '_SYSTEM', 'state', 'runtime');
const QUEUE_FILE = path.join(STATE_DIR, 'overnight-queue.jsonl');
const RESULTS_FILE = path.join(STATE_DIR, 'overnight-results.jsonl');
const EVENTS_FILE = path.join(STATE_DIR, 'events.jsonl');

const DEFAULT_LANE = 'glm';
const DEFAULT_KIND = 'lane'; // existing behavior: a queued task is a lane prompt unless kind:'mure'
const VALID_KINDS = new Set(['lane', 'mure']);
const MAX_RETRIES = 1; // one retry on F/missing-label (design §5 gap #1: bounded, not infinite)
const MAX_RESULTS = 5000; // bounded retention for overnight-results.jsonl (prevents unbounded growth)
const WATCH_LOCK_FILE = path.join(STATE_DIR, 'overnight-runner.watch.lock'); // concurrent-watch guard
// RT-06 FIX: pop-mutex guards the read-modify-write in popNext() itself. WATCH_LOCK_FILE only
// prevents two `run --watch` processes from racing each other; it does nothing for two concurrent
// `run --once` invocations (or a --once racing a --watch), which each call popNext() with no lock at
// all — both read the queue, both pick the same top task, and whichever writeFileSync lands last
// silently clobbers any task a third process enqueued in between (lost enqueue / double-pop).
// O_EXCL create is atomic at the POSIX FS level (FB:POSIX-FS-CONCURRENCY-FLOOR) — exactly the same
// primitive class as the existing watch-lock idiom above, scoped tighter (held only for the pop's
// own read+write, not a whole watch loop) so it never serializes unrelated runner work.
const POP_LOCK_FILE = path.join(STATE_DIR, 'overnight-runner.pop.lock');
const POP_LOCK_STALE_MS = 5_000; // a lock older than this is assumed abandoned (crashed holder)
const POP_LOCK_RETRY_MS = 2; // cross-process contention only; the holder's read+write is microseconds
const POP_LOCK_MAX_WAIT_MS = 500; // safety ceiling before fail-open (never hangs the CLI on a stuck holder)

// ── I/O helpers ──────────────────────────────────────────────────────────────

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Sanitize raw task text before it enters the lane prompt template.
 * RED-TEAM fix (prompt-injection): task text is operator/queue-controlled, not trusted. A task
 * containing newlines could inject fake instructions; one containing "RESULT_LABEL: 00XX_X_PASS_COMMITTED"
 * would self-certify a fake pass via extractResultLabel's marker-match OR its label-token fallback.
 * We collapse to a single line, neutralize RESULT_LABEL markers, AND defang label-token-shaped
 * substrings (anything matching the Lane Result Grammar token shape) so a task body cannot smuggle
 * a fake RESULT_LABEL into the verification layer.
 * @param {string} raw
 * @returns {string} sanitized, single-line, injection-neutralized task text
 */
export function sanitizeTaskText(raw) {
  let s = String(raw || '');
  // collapse all whitespace runs (incl. newlines) to single spaces → single-line
  s = s.replace(/\s+/g, ' ').trim();
  // neutralize any RESULT_LABEL marker inside the task body so it can't be picked up by extractResultLabel
  s = s.replace(/RESULT_LABEL\s*[:=]\s*/gi, 'RESULT_LABEL(marked) ');
  // defang label-token-shaped substrings: insert a hyphen before the terminal suffix so the
  // substring no longer matches the label-token regex (\b[A-Z0-9]..._(?:PASS_COMMITTED|...)\b)
  // — a hyphen breaks the [A-Z0-9_] token continuity required by LABEL_TOKEN_RE
  s = s.replace(/\b([A-Z0-9]{2,12}(?:_[A-Z0-9]{1,60})*?)_((?:PASS_)?COMMITTED|BLOCKED|REPAIR_REQUIRED)\b/g, '$1-_$2');
  return s;
}

/** Append a JSON line to a file (creates dir + file as needed). Fail-open: never throws. */
function appendJsonl(file, obj) {
  try {
    ensureStateDir();
    fs.appendFileSync(file, JSON.stringify(obj) + '\n');
  } catch (e) {
    // fail-open — logging must never break the runner
    process.stderr.write(`[overnight-runner] appendJsonl failed (${path.basename(file)}): ${String(e?.message || e)}\n`);
  }
}

/**
 * Read all JSONL lines from a file. Returns []. Skips unparseable lines.
 *
 * SILENT-CORRUPTION FIX: this used to swallow BOTH failure modes with no signal at all — an
 * unreadable file (permissions, transient FS error) and a file where every non-blank line fails to
 * parse (corruption) both silently degraded to "queue is empty", indistinguishable from a genuinely
 * empty/absent queue. An overnight run would then just look idle instead of surfacing a corrupted
 * queue, quietly abandoning every task it held. Behavior is UNCHANGED (still returns [] / still skips
 * unparseable lines, callers do not need to change) — this only adds an stderr warning on the two
 * failure paths so the condition is at least observable (matches this file's existing fail-open +
 * warn-to-stderr idiom already used by appendJsonl above).
 * @returns {object[]}
 */
function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    process.stderr.write(`[overnight-runner] readJsonl: cannot read ${path.basename(file)}: ${String(e?.message || e)}\n`);
    return [];
  }
  const out = [];
  let nonBlankLines = 0;
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    nonBlankLines++;
    try { out.push(JSON.parse(t)); } catch { /* skip malformed — counted below */ }
  }
  if (nonBlankLines > 0 && out.length === 0) {
    process.stderr.write(
      `[overnight-runner] readJsonl: ${path.basename(file)} has ${nonBlankLines} non-blank line(s) but NONE parsed as JSON — ` +
      `file may be corrupted; treating as empty (tasks may be silently abandoned)\n`
    );
  }
  return out;
}

/** Emit a runner event to events.jsonl: {t, comp:'runner', event, data}. Fail-open. */
function emit(event, data = {}) {
  appendJsonl(EVENTS_FILE, { t: nowIso(), comp: 'runner', event, data });
}

// ── Queue operations ─────────────────────────────────────────────────────────

/**
 * Validate a MURE task payload shape before it enters the queue. This is the runner's OWN honest
 * validation gate — it does NOT duplicate or pre-empt anything planCompany/company.mjs checks
 * internally (roster validity, per-subtask governance, etc.); it only rejects a payload the runner
 * itself cannot even attempt to plan (not an object, or subtasks not an array of plain objects).
 * @param {object} payload
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateMurePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['murePayload must be a non-null object'] };
  }
  if (payload.summary != null && typeof payload.summary !== 'string') {
    errors.push('murePayload.summary must be a string when present');
  }
  if (payload.subtasks == null) {
    errors.push('murePayload.subtasks is required (array of subtask objects)');
  } else if (!Array.isArray(payload.subtasks)) {
    errors.push('murePayload.subtasks must be an array');
  } else if (payload.subtasks.length === 0) {
    errors.push('murePayload.subtasks must contain at least one subtask');
  } else {
    payload.subtasks.forEach((s, i) => {
      if (!s || typeof s !== 'object' || Array.isArray(s)) errors.push(`murePayload.subtasks[${i}] must be an object`);
    });
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Enqueue a task. Appends to overnight-queue.jsonl (FIFO-within-priority).
 * @param {object} opts
 * @param {string} [opts.task] - the task text (required for kind='lane', the default)
 * @param {string} [opts.lane='glm'] - 'glm' or 'ollama' (kind='lane' only)
 * @param {string} [opts.kind='lane'] - 'lane' (default lane-prompt task) or 'mure' (MURE company task)
 * @param {object} [opts.murePayload] - required when kind='mure': {summary, subtasks:[...], tags?}
 * @param {number} [opts.priority=5] - 1..10 (higher = sooner)
 * @param {boolean} [opts.useTaskQueue=false] - delegate to task-queue.mjs enqueue instead (kind='lane' only)
 * @returns {object} the enqueued task record
 */
export async function enqueueTask({ task, lane = DEFAULT_LANE, kind = DEFAULT_KIND, murePayload, priority = 5, useTaskQueue = false } = {}) {
  const normKind = VALID_KINDS.has(kind) ? kind : DEFAULT_KIND;
  const p = Math.max(1, Math.min(10, Number(priority) || 5));

  if (normKind === 'mure') {
    const validation = validateMurePayload(murePayload);
    if (!validation.ok) {
      throw new Error(`enqueueTask: invalid murePayload — ${validation.errors.join('; ')}`);
    }
    const rec = {
      id: crypto.randomUUID().slice(0, 12),
      ts: nowIso(),
      kind: 'mure',
      // a human-readable task label for status/logging parity with lane tasks — never re-parsed
      task: sanitizeTaskText(task || murePayload.summary || `mure company task (${murePayload.subtasks.length} subtasks)`),
      murePayload,
      lane: 'mure',
      priority: p,
      status: 'pending',
    };
    appendJsonl(QUEUE_FILE, rec);
    emit('enqueue', { id: rec.id, kind: 'mure', priority: rec.priority });
    return rec;
  }

  if (!task || typeof task !== 'string' || task.trim().length === 0) {
    throw new Error('enqueueTask: --task text is required');
  }
  const rec = {
    id: crypto.randomUUID().slice(0, 12),
    ts: nowIso(),
    kind: 'lane',
    task: sanitizeTaskText(task),
    lane: lane === 'ollama' ? 'ollama' : 'glm',
    priority: p,
    status: 'pending',
  };

  if (useTaskQueue) {
    // Delegation path: push into the shared task-queue.mjs store. Dynamic import to avoid a hard
    // dependency cycle if task-queue's state shape changes — this is the "if compatible" branch.
    // (task-queue.enqueue expects {prompt, lane, priority}; lane there is a model id like 'gpt-5.5',
    // so we pass the lane through as-is for forward compatibility.)
    try {
      // eslint-disable-next-line no-unsfw/no-unsfw
      const { enqueue } = await import('../Scripts/task-queue.mjs');
      enqueue({ prompt: rec.task, lane: rec.lane, priority: rec.priority, addedBy: 'overnight-runner' });
      emit('enqueue-delegated', { id: rec.id, lane: rec.lane, priority: rec.priority });
    } catch {
      // fall back to own queue if task-queue import/shape is incompatible
      appendJsonl(QUEUE_FILE, rec);
      emit('enqueue', { id: rec.id, lane: rec.lane, priority: rec.priority, fallback: true });
    }
  } else {
    appendJsonl(QUEUE_FILE, rec);
    emit('enqueue', { id: rec.id, lane: rec.lane, priority: rec.priority });
  }
  return rec;
}

/**
 * Acquire the pop-mutex (sync, blocking with bounded spin-wait). O_EXCL create is atomic — only one
 * caller can ever win the create when multiple processes race it. A lock file older than
 * POP_LOCK_STALE_MS is treated as abandoned (crashed holder) and force-reclaimed. Fail-open: if the
 * lock can never be acquired within POP_LOCK_MAX_WAIT_MS (e.g. FS error, pathological contention),
 * proceeds WITHOUT the lock rather than hanging the CLI forever — matches this file's existing
 * fail-open philosophy (a queue race is bad; a hung `run --once` is worse).
 * @returns {boolean} true if the lock was actually acquired (caller should release it)
 */
function acquirePopLock() {
  ensureStateDir();
  const deadline = Date.now() + POP_LOCK_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(POP_LOCK_FILE, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e && e.code === 'EEXIST') {
        // Someone else holds it — check staleness (crashed holder never cleaned up).
        try {
          const st = fs.statSync(POP_LOCK_FILE);
          if (Date.now() - st.mtimeMs > POP_LOCK_STALE_MS) {
            try { fs.unlinkSync(POP_LOCK_FILE); } catch { /* raced another reclaimer — loop and retry */ }
            continue;
          }
        } catch { /* lock vanished between EEXIST and stat — loop and retry the create */ }
        // Bounded busy-wait spin (sync — popNext()/main() call this synchronously, no event loop to yield to).
        const spinUntil = Date.now() + POP_LOCK_RETRY_MS;
        while (Date.now() < spinUntil) { /* spin */ }
        continue;
      }
      // Non-EEXIST FS error (permissions, disk full, etc.) — fail-open, proceed unlocked.
      return false;
    }
  }
  return false; // timed out waiting — fail-open, proceed unlocked rather than hang the CLI
}

/** Release the pop-mutex. Fail-open: a missing/already-removed lock file is not an error. */
function releasePopLock() {
  try { fs.unlinkSync(POP_LOCK_FILE); } catch { /* already gone / never held */ }
}

export { POP_LOCK_FILE }; // test-only visibility (deterministic lock-contention/staleness assertions)

/**
 * Pop the next pending task by FIFO-within-priority (higher priority first; same priority = insertion order).
 * Rewrites the queue file without the popped task. Returns null if empty.
 *
 * RT-06 FIX: the read (readJsonl) + write (writeFileSync) below are the queue's read-modify-write —
 * guarded by acquirePopLock()/releasePopLock() so two concurrent callers (e.g. two `run --once`
 * invocations, or a --once racing a --watch's internal popNext()) cannot both read the same snapshot
 * and clobber each other's write. See POP_LOCK_FILE comment above for the failure this closes.
 * @returns {object|null}
 */
export function popNext() {
  const locked = acquirePopLock();
  try {
    const all = readJsonl(QUEUE_FILE);
    const pending = all.filter((t) => t.status === 'pending');
    if (!pending.length) return null;
    // sort: higher priority first, then earlier ts (insertion order)
    pending.sort((a, b) => b.priority - a.priority || String(a.ts).localeCompare(String(b.ts)));
    const next = pending[0];
    // rewrite queue without the popped task (keep non-pending for audit? No — pop removes it;
    // results go to results file. Keep other records.)
    const remaining = all.filter((t) => t.id !== next.id);
    ensureStateDir();
    fs.writeFileSync(QUEUE_FILE, remaining.map((t) => JSON.stringify(t)).join('\n') + (remaining.length ? '\n' : ''));
    emit('pop', { id: next.id, lane: next.lane, priority: next.priority });
    return next;
  } finally {
    if (locked) releasePopLock();
  }
}

/**
 * Peek the next pending task by FIFO-within-priority WITHOUT removing it (non-destructive read).
 * Used by dry-run paths so a --dry-run is a pure PLAN: the task stays queued.
 * @returns {object|null}
 */
export function peekNext() {
  const all = readJsonl(QUEUE_FILE);
  const pending = all.filter((t) => t.status === 'pending');
  if (!pending.length) return null;
  pending.sort((a, b) => b.priority - a.priority || String(a.ts).localeCompare(String(b.ts)));
  return pending[0];
}

// ── Prompt template ──────────────────────────────────────────────────────────

/**
 * Build the bounded lane-task prompt from a raw task text.
 * Template: the task text + 'work autonomously, self-verify, RESULT_LABEL required'.
 * @param {string} taskText
 * @param {number} [attempt] - attempt number (1 = first, 2 = retry) — sharpens retry prompt
 * @returns {string}
 */
export function buildLaneTask(taskText, attempt = 1) {
  const base = [
    'TASK:',
    sanitizeTaskText(taskText),
    '',
    'Work autonomously to complete the task. Self-verify your output against the requirements before finishing.',
    'Your FINAL message MUST contain a build/code summary and end with an UPPERCASE RESULT_LABEL conforming to the Lane Result Grammar:',
    '  NNXX_DESCRIPTION_(X|P|F)_PASS_COMMITTED',
    'where X=full pass, P=partial, F=failed. No RESULT_LABEL = automatic failure.',
  ];
  if (attempt > 1) {
    base.push('');
    base.push(`(RETRY attempt ${attempt}: your previous attempt failed verification — either no RESULT_LABEL was found or it was an F. Be precise and ensure the final line is exactly the RESULT_LABEL token.)`);
  }
  return base.join('\n');
}

// ── Dispatch seam (overrideable for tests) ───────────────────────────────────

/**
 * Dispatch a kind='mure' task: plan ALWAYS runs (zero spend); runCompany (real dispatch) runs ONLY
 * when the OVERNIGHT RUNNER itself is armed (not opts.dryRun) AND isMureArmed() — mirroring the
 * lane path's "DISARMED = dry-run, zero spend" idiom one level up. This function never sets or
 * checks any arming flag itself — isMureArmed()/company.mjs's own `armed` resolution are the sole
 * arming authority; a --dry-run runner call always forces plan-only via opts.armed:false, which
 * company.mjs's runCompany treats as a force-DISARM (it can never self-arm from a caller boolean).
 *
 * Result normalization mirrors defaultDispatch's contract: {text, code, ok, label, dryRun, plan?}.
 * `ok`/`label` are derived honestly from the plan/run outcome shape:
 *   - plan-only (runner disarmed or --dry-run, or MURE itself disarmed): dryRun:true, ok:false,
 *     label:'' — an honest plan-only record, never a synthesized pass.
 *   - armed run: ok = (no thrown error) AND (no unresolved HELD subtasks blocking all work) AND
 *     (the GLM swarm, if any leaves were dispatched, converged); label is synthesized from the
 *     Lane Result Grammar so downstream verification (shouldRetry/classifyLaneOutcome-style checks)
 *     can grade it exactly like a lane result.
 *
 * @param {object} task - {task, kind:'mure', murePayload, lane:'mure', priority, id}
 * @param {object} [opts] - { dryRun:boolean, attempt:number }
 * @returns {Promise<{text:string, code:number, ok:boolean, label:string, dryRun:boolean, plan?:object}>}
 */
async function dispatchMureTask(task, opts = {}) {
  const validation = validateMurePayload(task.murePayload);
  if (!validation.ok) {
    return {
      text: `[mure-payload-invalid] ${validation.errors.join('; ')}`,
      code: 1,
      ok: false,
      label: '',
      dryRun: false,
      error: 'invalid-mure-payload',
    };
  }

  const runnerArmed = !opts.dryRun; // the runner's own dry-run switch — independent of MURE's arm flag
  const mureArmedNow = isMureArmed();
  const willRunCompany = runnerArmed && mureArmedNow;
  const labelPrefix = `MURE_${String(task.id).slice(0, 8).toUpperCase()}`;

  if (!willRunCompany) {
    // Plan-only path (covers: runner --dry-run, OR runner armed but MURE itself disarmed).
    // planCompany is PURE/DISARMED-safe — zero spend, always safe to run for visibility.
    let plan;
    try {
      plan = await planCompany(task.murePayload, { quiet: true });
    } catch (e) {
      return { text: `[mure-plan-error] ${String(e?.message || e)}`, code: 1, ok: false, label: '', dryRun: false, error: 'plan-threw' };
    }
    const reason = !runnerArmed ? 'runner-dry-run' : 'mure-disarmed';
    // Deliberately NO "RESULT_LABEL:" line here (and no grammar-conforming label token) — a plan-only
    // record must never carry anything extractResultLabel() can pick up, exactly like the lane path's
    // dry-run branch (which returns text:''). finalizeResult() re-derives a label from res.text when
    // res.label is falsy, so a labeled plan summary would silently defeat the "dry-run has no label"
    // invariant every kind='lane' dry-run test already relies on.
    const summaryText = [
      `[MURE PLAN-ONLY] reason=${reason} (mureArmed=${mureArmedNow}) — no RESULT_LABEL: this is a plan, not a completed run.`,
      `subtasks=${plan.summary.subtasks} cast=${plan.summary.cast} glm=${plan.summary.glm} native=${plan.summary.native} inline=${plan.summary.inline} held=${plan.summary.held} clearedHeld=${plan.summary.clearedHeld}`,
    ].join('\n');
    return {
      text: summaryText,
      code: 0,
      ok: false, // plan-only never certifies a completed pass — honest, mirrors the lane dry-run contract
      label: '',
      dryRun: true,
      plan: { kind: 'mure', reason, mureArmed: mureArmedNow, labelPrefix, summary: plan.summary, taskId: task.id },
    };
  }

  // ARMED path: MURE is armed AND the runner is not in --dry-run. runCompany plans internally
  // (so we don't double-plan) then dispatches per its own governance (owner-gated subtasks stay
  // HELD regardless — company.mjs's decisionFor/evaluateGovernance is the sole gate; this runner
  // adds no bypass).
  let result;
  try {
    result = await runCompany(task.murePayload, {});
  } catch (e) {
    return { text: `[mure-run-error] ${String(e?.message || e)}`, code: 1, ok: false, label: '', dryRun: false, error: 'runCompany-threw' };
  }

  const plan = result.plan || {};
  const swarmConverged = result.swarm ? !!result.swarm.converged : true; // no GLM leaves dispatched = vacuously fine
  const swarmDispatched = !!(result.swarm && Array.isArray(plan.glmLeaves) && plan.glmLeaves.length);
  const heldCount = Array.isArray(result.held) ? result.held.length : 0;
  const castCount = Array.isArray(plan.casts) ? plan.casts.length : 0;
  // "fail" only when the run produced literally nothing actionable (every subtask held/nothing cast)
  // or the dispatched GLM swarm explicitly failed to converge — otherwise partial progress is honest P.
  const nothingActionable = castCount > 0 && heldCount === castCount;
  let passType = 'X';
  if (nothingActionable || (swarmDispatched && !swarmConverged)) passType = 'F';
  else if (heldCount > 0) passType = 'P';

  const summaryText = [
    `[MURE RUN] armed=true swarmDispatched=${swarmDispatched} swarmConverged=${swarmConverged}`,
    `cast=${castCount} glm=${plan.glmLeaves?.length || 0} native=${plan.nativeSpecs?.length || 0} inline=${plan.inlineSpecs?.length || 0} held=${heldCount}`,
    `RESULT_LABEL: ${labelPrefix}_COMPANY_RUN_${passType}_PASS_COMMITTED`,
  ].join('\n');

  const outcome = classifyLaneOutcome({ code: 0, text: summaryText });
  return {
    text: summaryText,
    code: 0,
    ok: !!outcome.ok && passType !== 'F',
    label: extractResultLabel(summaryText).label || '',
    dryRun: false,
  };
}

/**
 * Default dispatch implementation: calls glmFleet or ollamaFleet based on the task lane, OR routes
 * a kind='mure' task to dispatchMureTask (see above). Returns a NORMALIZED result: { text, code, ok, label }.
 *
 * DISARMED-FIRST: if the chosen fleet is not armed (no YURI_*_FLEET=1 env and no flag file),
 * returns a dry-run plan with zero spend — caller treats it as a plan-only result.
 *
 * @param {object} task - {task, lane, priority, id} (kind='lane') or {task, kind:'mure', murePayload, id}
 * @param {object} [opts] - { dryRun:boolean, attempt:number }
 * @returns {Promise<{text:string, code:number, ok:boolean, label:string, dryRun:boolean, plan?:object}>}
 */
async function defaultDispatch(task, opts = {}) {
  if (task.kind === 'mure') {
    return dispatchMureTask(task, opts);
  }
  const attempt = opts.attempt || 1;
  const lane = task.lane === 'ollama' ? 'ollama' : 'glm';
  const prompt = buildLaneTask(task.task, attempt);
  const label = `overnight-${String(task.id).slice(0, 8)}`;

  if (opts.dryRun) {
    return {
      text: '',
      code: 0,
      ok: false,
      label: '',
      dryRun: true,
      plan: { lane, label, promptChars: prompt.length, taskId: task.id },
    };
  }

  // Fleet selection + disarm check
  let fleetArmed;
  let fleetFn;
  let fleetTask;
  if (lane === 'ollama') {
    fleetArmed = ollamaIsArmed();
    fleetFn = ollamaFleet;
    fleetTask = [{ tier: 'flash', label, prompt }];
  } else {
    fleetArmed = glmIsArmed();
    fleetFn = glmFleet;
    fleetTask = [{ lane: 'glm', label, prompt }];
  }

  if (!fleetArmed) {
    // DISARMED = dry-run, zero spend (the YURI arming idiom — do NOT fire without explicit arm)
    const plan = await fleetFn(fleetTask, { armed: false });
    return {
      text: '',
      code: 0,
      ok: false,
      label: '',
      dryRun: true,
      plan: { lane, label, runId: plan.runId, promptChars: prompt.length, taskId: task.id },
    };
  }

  // ARMED: fire the real fleet. opts._forceArmed is an internal test affordance.
  const res = await fleetFn(fleetTask, { armed: true });
  const r = res.results && res.results[0];
  if (!r) {
    return { text: '', code: 1, ok: false, label: '', dryRun: false, error: 'fleet returned no results' };
  }
  const outcome = classifyLaneOutcome({ code: r.exitCode, text: r.text });
  return {
    text: r.text || '',
    code: r.exitCode ?? 0,
    ok: !!outcome.ok,
    label: extractResultLabel(r.text || '').label || r.resultLabel || '',
    dryRun: false,
  };
}

/**
 * The active dispatch function. Tests override via __setDispatch(fn) to inject a fake dispatcher
 * without hitting live lanes. Internal code MUST call activeDispatch(), NOT defaultDispatch directly.
 */
let activeDispatch = defaultDispatch;

/** Test hook: override the dispatch seam. Pass null/undefined to restore the default. */
export function __setDispatch(fn) {
  if (typeof fn === 'function' || fn == null) {
    activeDispatch = fn || defaultDispatch;
  }
}

/** Resolve the current dispatch function (always reads the active binding). */
function activeDispatchFn() {
  return activeDispatch;
}

// ── Core runner: run one task ────────────────────────────────────────────────

/**
 * Run a single task: dispatch → verify → retry-once-on-F → record result. Fail-open.
 * @param {object} task - a queue record {id, task, lane, priority}
 * @param {object} [opts] - { dryRun:boolean }
 * @returns {Promise<object>} result record {task, lane, ok, label, retries, ms, summary}
 */
export async function runOnce(task, opts = {}) {
  const t0 = Date.now();
  const dispatch = activeDispatchFn();
  let retries = 0;
  let lastResult = null;

  try {
    // Attempt 1
    let res = await dispatch(task, { ...opts, attempt: 1 });
    emit('dispatch', { taskId: task.id, attempt: 1, dryRun: res.dryRun, ok: res.ok, label: res.label });

    if (res.dryRun) {
      // dry-run: print plan, zero spend, no retry, NO results append (pure PLAN — task stays queued).
      // The caller is responsible for NOT popping the task on dry-run (uses peekNext, not popNext).
      lastResult = finalizeResult(task, res, 0, t0);
      printPlan(task, res);
      emit('result', { taskId: task.id, ok: false, dryRun: true, label: '', retries: 0, appended: false });
      return lastResult;
    }

    // Verify: need a non-F label and ok=true
    const needsRetry = shouldRetry(res);

    if (needsRetry && !opts.dryRun) {
      retries = 1;
      emit('retry', { taskId: task.id, reason: retryReason(res) });
      const res2 = await dispatch(task, { ...opts, attempt: 2 });
      emit('dispatch', { taskId: task.id, attempt: 2, ok: res2.ok, label: res2.label });
      res = res2;
    }

    lastResult = finalizeResult(task, res, retries, t0);
  } catch (e) {
    // FAIL-OPEN: one bad task never kills the run — record as failed
    const errMsg = String(e?.message || e);
    emit('error', { taskId: task.id, error: errMsg });
    lastResult = {
      task: task.task,
      lane: task.lane,
      ok: false,
      label: '',
      retries,
      ms: Date.now() - t0,
      summary: `[dispatch-threw] ${errMsg.slice(0, 280)}`,
      taskId: task.id,
      ts: nowIso(),
    };
  }

  appendJsonl(RESULTS_FILE, lastResult);
  trimResults(); // bounded retention — prevents unbounded results-file growth (red-team #5)
  emit('result', { taskId: task.id, ok: lastResult.ok, label: lastResult.label, retries: lastResult.retries });
  return lastResult;
}

/**
 * Trim overnight-results.jsonl to the last MAX_RESULTS records (bounded retention).
 * Runs O(1) amortized: only rewrites when the file exceeds 2× the cap. Fail-open (never throws).
 * This prevents unbounded growth over long unattended overnight runs (red-team finding).
 */
function trimResults() {
  try {
    if (!fs.existsSync(RESULTS_FILE)) return;
    const all = readJsonl(RESULTS_FILE);
    if (all.length <= MAX_RESULTS * 2) return; // only trim when 2× over cap (amortized)
    const kept = all.slice(-MAX_RESULTS);
    ensureStateDir();
    fs.writeFileSync(RESULTS_FILE, kept.map((r) => JSON.stringify(r)).join('\n') + '\n');
    emit('results-trimmed', { from: all.length, to: kept.length, cap: MAX_RESULTS });
  } catch {
    // fail-open — trimming must never break the run
  }
}

/** Determine whether a result warrants the single retry (F label or missing label or !ok). */
function shouldRetry(res) {
  if (!res || res.dryRun) return false;
  if (!res.ok) return true;
  if (!res.label || res.label.length === 0) return true;
  const parsed = parseResultLabel(res.label);
  if (!parsed.ok) return true;
  if (parsed.passTypeNorm === 'F') return true;
  return false;
}

function retryReason(res) {
  if (!res.ok) return 'outcome-not-ok';
  if (!res.label) return 'missing-label';
  const parsed = parseResultLabel(res.label);
  if (!parsed.ok) return `invalid-label:${res.label}`;
  if (parsed.passTypeNorm === 'F') return 'label-is-F';
  return 'unknown';
}

/** Assemble the canonical result record. summary = first 300 chars of output text. */
function finalizeResult(task, res, retries, t0) {
  const text = String(res.text || '');
  const label = res.label || extractResultLabel(text).label || '';
  return {
    task: task.task,
    lane: task.lane,
    ok: !!res.ok && !res.dryRun,
    label,
    retries,
    ms: Date.now() - t0,
    summary: text.slice(0, 300),
    taskId: task.id,
    ts: nowIso(),
  };
}

/** Print the dry-run plan to stdout (zero spend confirmation). */
function printPlan(task, res) {
  const plan = res.plan || {};
  process.stdout.write(`[DRY-RUN] zero spend — fleet disarmed or --dry-run\n`);
  process.stdout.write(`  task:   ${String(task.task).slice(0, 80)}\n`);
  process.stdout.write(`  lane:   ${plan.lane || task.lane}\n`);
  process.stdout.write(`  label:  ${plan.label || '-'}\n`);
  process.stdout.write(`  prompt: ${plan.promptChars || 0} chars\n`);
  if (plan.runId) process.stdout.write(`  runId:  ${plan.runId}\n`);
  process.stdout.write(`  → no lane fired; arm via YURI_GLM_FLEET=1 (or YURI_OLLAMA_FLEET=1) to dispatch live\n`);
}

// ── Watch loop ───────────────────────────────────────────────────────────────

/**
 * Loop: pop + run tasks until the queue is empty or max tasks reached.
 * RED-TEAM hardening:
 *   - Concurrent-watch guard: a PID-file lock (WATCH_LOCK_FILE) prevents two `run --watch`
 *     processes from racing on popNext/writeFileSync (double-processing / task loss). If the
 *     lock is held by a live process, this watch exits with an honest message (no silent race).
 *   - Dry-run is a pure PLAN: tasks are PEEKED (not popped), so the queue is untouched.
 * @param {object} opts - { max:number, dryRun:boolean }
 * @returns {Promise<object[]>} array of result records
 */
export async function runWatch(opts = {}) {
  const max = Math.max(0, Number(opts.max) || 0);
  const results = [];

  // ── Concurrent-watch guard (red-team #6) ──
  if (!acquireWatchLock()) {
    process.stdout.write(`[watch] another watch is already running (${WATCH_LOCK_FILE}) — exiting to avoid a pop race\n`);
    emit('watch-skipped', { reason: 'lock-held', lockFile: WATCH_LOCK_FILE });
    return results;
  }

  try {
    if (opts.dryRun) {
      // DRY-RUN watch: peek every pending task (non-destructive), plan each, never consume.
      const all = readJsonl(QUEUE_FILE).filter((t) => t.status === 'pending');
      const sorted = [...all].sort((a, b) => b.priority - a.priority || String(a.ts).localeCompare(String(b.ts)));
      const limit = max > 0 ? Math.min(max, sorted.length) : sorted.length;
      let count = 0;
      for (let i = 0; i < limit; i++) {
        count++;
        const task = sorted[i];
        process.stdout.write(`[watch] (dry-run) task ${count}/${limit} → [${task.lane}] p=${task.priority} ${String(task.task).slice(0, 60)}\n`);
        // eslint-disable-next-line no-await-in-loop
        const result = await runOnce(task, opts);
        results.push(result);
        process.stdout.write(`        [DRY-RUN] planned, not dispatched — task remains queued\n`);
      }
      process.stdout.write(count === 0 ? `[watch] (dry-run) queue empty — no pending tasks\n` : `[watch] (dry-run) planned ${count} task(s), queue untouched\n`);
      emit('watch-complete', { count, dryRun: true, ok: 0, failed: 0 });
      return results;
    }

    // LIVE watch: pop + run (original path)
    let count = 0;
    while (true) {
      if (max > 0 && count >= max) break;
      const task = popNext();
      if (!task) {
        process.stdout.write(count === 0 ? `[watch] queue empty — no pending tasks\n` : `[watch] drained ${count} task(s)\n`);
        break;
      }
      count++;
      process.stdout.write(`[watch] task ${count}${max > 0 ? `/${max}` : ''} → [${task.lane}] p=${task.priority} ${String(task.task).slice(0, 60)}\n`);
      // eslint-disable-next-line no-await-in-loop
      const result = await runOnce(task, opts);
      results.push(result);
      process.stdout.write(`        ${result.ok ? '✓' : '✗'} ${result.label || '(no label)'} retries=${result.retries} ms=${result.ms}\n`);
    }
    emit('watch-complete', { count, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
    return results;
  } finally {
    releaseWatchLock();
  }
}

/**
 * Acquire a PID-file watch lock. Returns true if acquired (no live holder), false if held.
 * A stale lock (dead PID) is reclaimed. Fail-open: on any FS error, returns true (proceeds).
 */
function acquireWatchLock() {
  try {
    ensureStateDir();
    if (fs.existsSync(WATCH_LOCK_FILE)) {
      const raw = fs.readFileSync(WATCH_LOCK_FILE, 'utf8').trim();
      const holderPid = Number(raw);
      if (holderPid && process.pid !== holderPid) {
        // check if the holder is still alive
        try { process.kill(holderPid, 0); return false; } catch { /* stale — reclaim */ }
      }
    }
    fs.writeFileSync(WATCH_LOCK_FILE, String(process.pid));
    return true;
  } catch {
    return true; // fail-open — FS error should not block the run
  }
}

/** Release the watch lock (only if we hold it). Fail-open. */
function releaseWatchLock() {
  try {
    if (fs.existsSync(WATCH_LOCK_FILE)) {
      const raw = fs.readFileSync(WATCH_LOCK_FILE, 'utf8').trim();
      if (Number(raw) === process.pid) fs.unlinkSync(WATCH_LOCK_FILE);
    }
  } catch {
    // fail-open
  }
}

// ── Status ───────────────────────────────────────────────────────────────────

/**
 * Return status: queue depth, last result records.
 * @param {number} [lastN=5] - how many recent results to include
 * @returns {object} { queueDepth, pendingByLane, lastResults }
 */
export function getStatus(lastN = 5) {
  const all = readJsonl(QUEUE_FILE);
  const pending = all.filter((t) => t.status === 'pending');
  const byLane = {};
  for (const t of pending) byLane[t.lane] = (byLane[t.lane] || 0) + 1;
  const results = readJsonl(RESULTS_FILE);
  const lastResults = results.slice(-Math.max(1, lastN));
  return {
    queueDepth: pending.length,
    pendingByLane: byLane,
    lastResults,
    lastRun: lastResults.length ? lastResults[lastResults.length - 1].ts : null,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

async function main() {
  const [, , cmd = 'status', ...rest] = process.argv;
  const flags = parseFlags(rest);
  ensureStateDir();

  switch (cmd) {
    case 'enqueue': {
      const kind = VALID_KINDS.has(flags.kind) ? flags.kind : DEFAULT_KIND;
      if (kind === 'mure') {
        let murePayload;
        if (flags['mure-file']) {
          try { murePayload = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, String(flags['mure-file'])), 'utf8')); }
          catch (e) { process.stderr.write(`overnight-runner: bad --mure-file: ${String(e?.message || e)}\n`); process.exit(2); }
        } else if (flags['mure-task']) {
          try { murePayload = JSON.parse(String(flags['mure-task'])); }
          catch (e) { process.stderr.write(`overnight-runner: --mure-task is not valid JSON: ${String(e?.message || e)}\n`); process.exit(2); }
        } else {
          process.stderr.write('overnight-runner: --kind mure requires --mure-task \'<json>\' or --mure-file <path>\n');
          process.exit(2);
        }
        try {
          const rec = await enqueueTask({ kind: 'mure', murePayload, priority: Number(flags.priority) || 5 });
          process.stdout.write(`✓ enqueued mure task ${rec.id} priority=${rec.priority}\n`);
        } catch (e) {
          process.stderr.write(`overnight-runner: ${String(e?.message || e)}\n`);
          process.exit(2);
        }
        break;
      }
      if (!flags.task) {
        process.stderr.write('overnight-runner: --task <text> is required\n');
        process.exit(2);
      }
      const rec = await enqueueTask({
        task: flags.task,
        lane: flags.lane || DEFAULT_LANE,
        priority: Number(flags.priority) || 5,
        useTaskQueue: flags.useTaskQueue === true,
      });
      process.stdout.write(`✓ enqueued task ${rec.id} [${rec.lane}] priority=${rec.priority}\n`);
      break;
    }
    case 'run': {
      const dryRun = flags['dry-run'] === true || flags.dryRun === true;
      if (flags.watch) {
        await runWatch({ max: Number(flags.max) || 0, dryRun });
      } else {
        // --once (default when just `run`)
        // DRY-RUN uses peekNext (non-destructive) so the task stays queued — pure PLAN.
        const task = dryRun ? peekNext() : popNext();
        if (!task) {
          process.stdout.write('✓ queue empty — no pending tasks\n');
          process.exit(0);
        }
        const result = await runOnce(task, { dryRun });
        if (dryRun) {
          process.stdout.write(`[DRY-RUN] task ${task.id} [${task.lane}] planned — task remains queued, nothing recorded\n`);
        } else {
          process.stdout.write(`${result.ok ? '✓' : '✗'} task ${task.id} [${task.lane}] ${result.label || '(no label)'} retries=${result.retries} ms=${result.ms}\n`);
        }
      }
      break;
    }
    case 'status': {
      const s = getStatus();
      if (flags.json === true || process.argv.includes('--json')) {
        process.stdout.write(JSON.stringify(s, null, 2) + '\n');
      } else {
        process.stdout.write('⬡ Overnight Runner Status\n');
        process.stdout.write(`  queue depth: ${s.queueDepth}\n`);
        for (const [lane, n] of Object.entries(s.pendingByLane)) {
          process.stdout.write(`    ${lane}: ${n} pending\n`);
        }
        process.stdout.write(`  last run:    ${s.lastRun || '(none)'}\n`);
        if (s.lastResults.length) {
          process.stdout.write(`  last results:\n`);
          for (const r of s.lastResults) {
            process.stdout.write(`    [${r.ok ? '✓' : '✗'}] ${r.label || '(no label)'} retries=${r.retries} — ${String(r.task).slice(0, 50)}\n`);
          }
        }
      }
      process.exit(0);
    }
    default:
      process.stderr.write(`overnight-runner: unknown command "${cmd}". Use: enqueue | run | status\n`);
      process.exit(2);
  }
}

// Run CLI only when invoked directly (not when imported by tests).
// Guard against process.argv[1] being a bare path (node --test passes the test file path,
// which is not a file:// URL and would throw in fileURLToPath).
if (process.argv[1] && import.meta.url === pathToFileURLSafe(process.argv[1])) {
  main().catch((e) => {
    process.stderr.write(`overnight-runner fatal: ${String(e?.message || e)}\n`);
    process.exit(1);
  });
}

// Safe pathToFileURL that tolerates bare paths and non-URL inputs (node --test compatibility).
function pathToFileURLSafe(p) {
  try {
    return pathToFileURL(p).href;
  } catch {
    return '';
  }
}
