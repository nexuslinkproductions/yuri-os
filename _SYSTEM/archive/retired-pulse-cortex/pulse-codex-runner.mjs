#!/usr/bin/env node
// PATCH 036 — Pulse Cortex two-phase Codex runner
//
// Phase A (`propose`): Codex produces a unified-diff proposal WITHOUT applying.
//                      Result stored at .claude/state/pulse-codex-pending.json
//                      with HEAD snapshot + expires_at + AWAITING_APPROVAL status.
// Phase B (`apply`):   Only fires if (a) .approved marker exists OR --approve flag,
//                      (b) pending not expired, (c) git HEAD matches snapshot from
//                      Phase A (per DeepSeek dogfood advisory — prevents stale apply).
//
// Authority model: Codex is the only impl authority in the cortex. Phase A is
// PROPOSE ONLY — the task spec explicitly prohibits writes. Phase B applies the
// already-reviewed diff. Marcel/main-thread holds the approval gate between.

import { spawn } from 'node:child_process';
import { promises as fsp, existsSync, mkdirSync, writeFileSync, renameSync, appendFileSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');  // Scripts/ → _SYSTEM/ → repo root
const STATE_DIR = path.join(REPO_ROOT, '.claude', 'state');
const PENDING_PATH = path.join(STATE_DIR, 'pulse-codex-pending.json');
const APPROVED_PATH = path.join(STATE_DIR, 'pulse-codex-pending.approved');
const ERROR_LOG = path.join(STATE_DIR, 'pulse-errors.log');
const OFFLOAD_SH = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'offload.sh');

const TIMEOUT_PROPOSE_MS = 120_000;
const TIMEOUT_APPLY_MS   = 180_000;
const PENDING_TTL_MS     = 10 * 60_000; // 10 min — per plan

function logError(msg) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(ERROR_LOG, `${new Date().toISOString()} [pulse-codex-runner] ${msg}\n`);
  } catch (_) {}
}

function exec(cmd, args, opts = {}, timeoutMs = 30_000, stdin = null) {
  return new Promise((resolve) => {
    let stdout = '', stderr = '', settled = false;
    const child = spawn(cmd, args, { cwd: REPO_ROOT, ...opts });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGTERM'); } catch (_) {}
      resolve({ code: -1, stdout, stderr, timedOut: true });
    }, timeoutMs);
    child.stdout?.on('data', d => stdout += d.toString());
    child.stderr?.on('data', d => stderr += d.toString());
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + e.message, error: true });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    if (stdin != null) { try { child.stdin.write(stdin); child.stdin.end(); } catch (_) {} }
  });
}

async function gitHead() {
  const r = await exec('git', ['rev-parse', 'HEAD'], {}, 3000);
  return (r.stdout || '').trim();
}

function writePending(payload) {
  mkdirSync(STATE_DIR, { recursive: true });
  const tmp = PENDING_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(payload, null, 2));
  renameSync(tmp, PENDING_PATH);
}

async function readPending() {
  try {
    const raw = await fsp.readFile(PENDING_PATH, 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

function clearApprovalMarker() {
  try { require('node:fs').unlinkSync(APPROVED_PATH); } catch (_) {}
}

function extractDiff(stdout) {
  // Codex produces unified diff in fenced code block, or raw diff text.
  const fenceMatch = stdout.match(/```(?:diff|patch)?\s*\n([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const diffMatch = stdout.match(/(diff --git[\s\S]*?)(?:\n\n[A-Z][a-z]|\n\n##|\n*$)/);
  if (diffMatch) return diffMatch[1].trim();
  // Fallback — return last non-empty block
  return stdout.trim();
}

async function propose(taskSpec, turnId) {
  const snapshotHead = await gitHead();
  if (!snapshotHead) {
    logError('propose: cannot read git HEAD; aborting');
    return { ok: false, reason: 'no-git-head' };
  }

  const proposePrompt = `## CODEX TASK SPEC (DRY RUN — PROPOSE-ONLY)

**Goal:** ${taskSpec.goal}
**Target files:** ${taskSpec.targetFiles.join(', ')}
**Constraints:** ${taskSpec.constraints || 'as described'}
**Acceptance criteria:** ${taskSpec.acceptance || 'diff applies cleanly'}
**Test command:** ${taskSpec.testCommand || 'n/a'}
**Rollback boundary:** ${taskSpec.rollbackBoundary || 'git diff HEAD'}
**Prohibited:** This is PHASE A (propose-only). DO NOT WRITE OR EDIT ANY FILES. DO NOT RUN APPLY commands. Output ONLY a unified git diff that would accomplish the goal.

OUTPUT FORMAT: a single unified diff in a fenced code block:
\`\`\`diff
diff --git a/path b/path
...
\`\`\`

Turn: ${turnId}
HEAD snapshot: ${snapshotHead}`;

  const result = await exec('bash', [OFFLOAD_SH, '@codex', proposePrompt], {}, TIMEOUT_PROPOSE_MS);
  if (result.code !== 0 || result.timedOut) {
    logError(`propose: codex dispatch failed (code=${result.code} timeout=${!!result.timedOut})`);
    return { ok: false, reason: 'codex-failed' };
  }

  const diff = extractDiff(result.stdout);
  if (!diff || diff.length < 20) {
    logError('propose: extracted diff too short; aborting');
    return { ok: false, reason: 'empty-diff' };
  }

  const filesTouched = [...new Set((diff.match(/^diff --git a\/(\S+)/gm) || []).map(l => l.replace('diff --git a/', '')))];
  const stats = (() => {
    const adds = (diff.match(/^\+(?!\+\+)/gm) || []).length;
    const dels = (diff.match(/^-(?!--)/gm) || []).length;
    return { added: adds, deleted: dels };
  })();

  const pending = {
    turn_id: turnId,
    ts: new Date().toISOString(),
    expires_at: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
    snapshot_head: snapshotHead,
    task_spec: taskSpec,
    proposed_diff: diff,
    files_touched: filesTouched,
    stats,
    status: 'AWAITING_APPROVAL',
    approval_marker_path: APPROVED_PATH,
  };
  writePending(pending);
  clearApprovalMarker();
  return { ok: true, pending };
}

async function apply({ approve = false } = {}) {
  const pending = await readPending();
  if (!pending) return { ok: false, reason: 'no-pending' };
  if (pending.status !== 'AWAITING_APPROVAL') return { ok: false, reason: `status=${pending.status}` };
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    pending.status = 'EXPIRED';
    writePending(pending);
    return { ok: false, reason: 'expired' };
  }

  const approved = approve || existsSync(APPROVED_PATH);
  if (!approved) return { ok: false, reason: 'not-approved' };

  // DeepSeek dogfood guard: HEAD must match snapshot.
  const currentHead = await gitHead();
  if (currentHead !== pending.snapshot_head) {
    pending.status = 'STALE_HEAD';
    pending.stale_reason = `HEAD moved from ${pending.snapshot_head} to ${currentHead} after propose`;
    writePending(pending);
    logError(`apply: stale HEAD; rejecting. ${pending.stale_reason}`);
    return { ok: false, reason: 'stale-head', detail: pending.stale_reason };
  }

  const applyPrompt = `## CODEX TASK SPEC (APPLY APPROVED DIFF)

**Goal:** ${pending.task_spec.goal}
**Target files:** ${(pending.task_spec.targetFiles || pending.files_touched).join(', ')}
**Constraints:** Apply the diff EXACTLY as provided. No additional changes.
**Acceptance criteria:** ${pending.task_spec.acceptance || 'diff applies cleanly'}
**Test command:** ${pending.task_spec.testCommand || 'n/a'}
**Rollback boundary:** git diff HEAD
**Prohibited:** Adding scope beyond the provided diff.

APPROVED DIFF (apply now):
\`\`\`diff
${pending.proposed_diff}
\`\`\`

Turn: ${pending.turn_id}
Snapshot HEAD verified: ${pending.snapshot_head}`;

  const result = await exec('bash', [OFFLOAD_SH, '@codex', applyPrompt], {}, TIMEOUT_APPLY_MS);
  if (result.code !== 0 || result.timedOut) {
    logError(`apply: codex dispatch failed (code=${result.code} timeout=${!!result.timedOut})`);
    pending.status = 'APPLY_FAILED';
    pending.apply_error = result.stderr.slice(0, 400);
    writePending(pending);
    return { ok: false, reason: 'codex-apply-failed' };
  }

  pending.status = 'APPLIED';
  pending.applied_at = new Date().toISOString();
  pending.applied_head = await gitHead();
  writePending(pending);
  clearApprovalMarker();
  return { ok: true, pending };
}

async function status() {
  const pending = await readPending();
  if (!pending) return { exists: false };
  const expired = new Date(pending.expires_at).getTime() < Date.now();
  const approved = existsSync(APPROVED_PATH);
  return {
    exists: true,
    turn_id: pending.turn_id,
    status: pending.status,
    files_touched: pending.files_touched,
    stats: pending.stats,
    snapshot_head: pending.snapshot_head,
    expires_at: pending.expires_at,
    expired,
    approval_marker_present: approved,
  };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'propose') {
    // Expect a JSON task spec on stdin
    let raw = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) raw += chunk;
    let taskSpec;
    try { taskSpec = JSON.parse(raw); }
    catch (e) {
      console.error('propose: invalid task spec JSON:', e.message);
      process.exit(2);
    }
    const turnId = process.env.PULSE_TURN_ID || randomUUID().slice(0, 8);
    const out = await propose(taskSpec, turnId);
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.ok ? 0 : 1);
  }
  if (cmd === 'apply') {
    const approve = rest.includes('--approve');
    const out = await apply({ approve });
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.ok ? 0 : 1);
  }
  if (cmd === 'status') {
    const out = await status();
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }
  if (cmd === 'approve') {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(APPROVED_PATH, new Date().toISOString());
    console.log(`approved: ${APPROVED_PATH}`);
    process.exit(0);
  }
  console.log(`usage:
  pulse-codex-runner.mjs propose < taskSpec.json
  pulse-codex-runner.mjs status
  pulse-codex-runner.mjs approve            # touch approval marker
  pulse-codex-runner.mjs apply [--approve]  # apply approved diff (HEAD-checked)`);
  process.exit(1);
}

main().catch((e) => {
  logError(`fatal: ${e.message}`);
  process.exit(2);
});
