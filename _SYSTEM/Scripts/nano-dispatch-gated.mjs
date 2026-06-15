// nano-dispatch-gated.mjs — artifact-gated DESIGN→EXECUTE dispatch for nano-swarm lanes.
//
// WHY (root cause, 2026-06-15 EDIT-COUNT evidence): ollama-cloud lanes reliably DESIGN but won't
// EXECUTE a task-class where a plan is a plausible terminal artifact (author-tests, thread-identity):
// the failing lanes made ZERO edits and stopped at 13-27 of the 200 cap — not a budget limit, a
// "describe-the-solution" prior firing before the read→edit transition. An execution-forcing PROMPT
// only makes them honest, not constructive. This module is the STRUCTURAL fix:
//   1. DESIGN lane — produce a precise spec, terminate there (the lane's strength).
//   2. EXECUTE lane — fed the spec as a CONSTRUCTION-ONLY brief + a context-pack of the seam.
//   3. ARTIFACT GATE — verify the expected file exists+fresh AND `node --test` passes; if not,
//      AUTO-RE-PROMPT the same lane up to K times. A gate, not a hint — the lane cannot "complete"
//      on a plan. Converts the failing task-class into the build-a-module class that already works.
//
// Composes nano-external.defaultLlmLaneRunner (llm-lane-routed — the standing dispatch contract).
// DISARMED: a new optional launcher; nothing existing is altered; the CLI fire is operator-gated.
//
// @capability: nano-dispatch-gated
// @serves: reliable lane dispatch | force a nano lane to EXECUTE not just plan | artifact-gated design-execute split | re-prompt a plan-stopping lane | author tests / thread integration via peers reliably
// @does: 2-stage (design->execute) ollama-cloud dispatch that GATES on a produced artifact (file exists+fresh + node --test green) and auto-re-prompts the execute lane until the artifact appears or K attempts exhaust.
// @use: dispatchGated({ task, designModel, executeModel, artifactPath, testCmd, contextFiles }) when a single lane keeps returning a plan instead of writing the file/tests. NOT for bounded build-a-module tasks (those already execute — dispatch them directly).
// @exports: dispatchGated, defaultCheckArtifact, buildDesignPrompt, buildExecutePrompt, OLLAMA_LANE

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { defaultLlmLaneRunner } from './nano-external.mjs';

const REPO_ROOT = process.env.YURI_REPO_ROOT
  || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
export const OLLAMA_LANE = 'ollama-cloud';

// ── prompts ──────────────────────────────────────────────────────────────────
export function buildDesignPrompt(task, { artifactPath, testCmd } = {}) {
  return [
    'DESIGN ONLY — do NOT write or edit any file. Read whatever you need, then produce a PRECISE,',
    'SELF-CONTAINED implementation spec the next lane can execute with NO other context:',
    `- the exact file to create/edit: ${artifactPath || '(state it)'}`,
    '- the exact content / exact edits (enough that the next lane only transcribes + adapts)',
    testCmd ? `- the exact test command that must pass: ${testCmd}` : '- the exact node --test command to run',
    '- any non-obvious contract/seam the executor must honor.',
    'Output ONLY the spec. The spec IS your deliverable; the next lane constructs from it.',
    '',
    `TASK: ${task}`,
  ].join('\n');
}

export function buildExecutePrompt(spec, { artifactPath, testCmd, attempt = 1 } = {}) {
  const head = attempt > 1
    ? [
        `RE-ATTEMPT ${attempt}. The previous attempt did NOT produce ${artifactPath}${testCmd ? ' (or the tests did not pass)' : ''}.`,
        'You wrote a plan, not the file. There is NO design left to do. Use your write/edit tool to',
        'CREATE THE FILE NOW, then run the tests. A reply without the file on disk does not count.',
        '',
      ].join('\n')
    : '';
  return [
    head,
    'CONSTRUCTION ONLY — the design below is DONE and correct. Do NOT re-design, re-analyze, or describe.',
    'APPLY it: use your write/edit tool to create/edit the file(s), then RUN the tests with bash.',
    `REQUIRED DELIVERABLE: the file ${artifactPath} must exist on disk${testCmd ? ` AND \`${testCmd}\` must exit 0` : ''}.`,
    'Report the real test output. Anything without the file written is a FAIL.',
    '',
    '===== SPEC =====',
    String(spec || '').trim(),
  ].join('\n');
}

// ── artifact gate ────────────────────────────────────────────────────────────
// ok ⇔ the file exists, was written/modified during THIS run (mtime ≥ sinceMs), and (if a test
// command is given) `node --test` exits 0. FAIL-CLOSED: a missing file or a non-zero test => not ok.
export function defaultCheckArtifact({ artifactPath, testCmd = null, sinceMs = 0, cwd = REPO_ROOT } = {}) {
  let exists = false; let fresh = false; let mtimeMs = 0;
  try { const st = fs.statSync(path.resolve(cwd, artifactPath)); exists = true; mtimeMs = st.mtimeMs; fresh = mtimeMs >= sinceMs; }
  catch { exists = false; }
  let testPass = true; let testOut = '';
  if (exists && fresh && testCmd) {
    const parts = Array.isArray(testCmd) ? testCmd : String(testCmd).split(/\s+/).filter(Boolean);
    const res = spawnSync(parts[0], parts.slice(1), { cwd, encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
    testPass = res.status === 0;
    testOut = (res.stdout || '').split('\n').filter((l) => /^. (tests|pass|fail) /.test(l)).join(' | ') || (res.stderr || '').slice(-300);
  }
  return { ok: exists && fresh && testPass, exists, fresh, mtimeMs, testPass, testOut };
}

// ── the orchestrator ─────────────────────────────────────────────────────────
export async function dispatchGated(opts = {}, deps = {}) {
  const {
    task,
    designLane = OLLAMA_LANE, designModel = 'deepseek-v4-pro:cloud',
    executeLane = OLLAMA_LANE, executeModel = 'minimax-m3:cloud',
    contextFiles = [], artifactPath, testCmd = null,
    maxExecuteAttempts = 3, reasoning = 'xhigh', maxIters = 200, timeoutMs = 600000,
    specDir = os.tmpdir(), cwd = REPO_ROOT,
  } = opts;
  const { runLane = defaultLlmLaneRunner, checkArtifact = defaultCheckArtifact, now = () => Date.now(), log = () => {} } = deps;

  if (!task) return { ok: false, stage: 'precondition', error: 'task required' };
  if (!artifactPath) return { ok: false, stage: 'precondition', error: 'artifactPath required (the gate)' };

  const startMs = now();

  // STAGE 1 — DESIGN (terminate at the spec; that is what the lanes do well).
  log(`[design] lane=${designLane} model=${designModel}`);
  const dPrompt = buildDesignPrompt(task, { artifactPath, testCmd });
  let dRes;
  try { dRes = await runLane({ lane: designLane, model: designModel, prompt: dPrompt, reasoning, maxIters, contextFiles, timeoutMs }); }
  catch (e) { return { ok: false, stage: 'design', error: String(e?.message || e) }; }
  const spec = String(dRes?.output || '').trim();
  if (!spec) return { ok: false, stage: 'design', error: 'design lane produced no spec', exitCode: dRes?.exitCode ?? null };

  let specPath = null;
  try { specPath = path.join(specDir, `gated-spec-${startMs}.md`); fs.writeFileSync(specPath, spec); } catch { /* spec capture best-effort */ }

  // STAGE 2 — EXECUTE with the artifact gate + re-prompt.
  let lastCheck = null;
  for (let attempt = 1; attempt <= Math.max(1, maxExecuteAttempts); attempt += 1) {
    log(`[execute] attempt=${attempt}/${maxExecuteAttempts} lane=${executeLane} model=${executeModel}`);
    const xPrompt = buildExecutePrompt(spec, { artifactPath, testCmd, attempt });
    try { await runLane({ lane: executeLane, model: executeModel, prompt: xPrompt, reasoning, maxIters, contextFiles, timeoutMs }); }
    catch (e) { lastCheck = { ok: false, error: String(e?.message || e) }; continue; }
    lastCheck = checkArtifact({ artifactPath, testCmd, sinceMs: startMs, cwd });
    log(`[gate] attempt=${attempt} ok=${lastCheck.ok} exists=${lastCheck.exists} fresh=${lastCheck.fresh} testPass=${lastCheck.testPass}`);
    if (lastCheck.ok) {
      return { ok: true, stage: 'execute', attempts: attempt, specPath, artifactPath, check: lastCheck };
    }
  }
  return { ok: false, stage: 'execute', attempts: maxExecuteAttempts, specPath, artifactPath, check: lastCheck,
    hint: 'execute lane never produced the gated artifact; inspect specPath + run the execute brief manually' };
}

// ── CLI (operator-gated, mirrors nano-external: spawns lanes, so not an ungoverned fan-out vector) ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry');
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const task = get('--task'); const artifactPath = get('--artifact');
  if (!task || !artifactPath) { process.stdout.write('usage: nano-dispatch-gated.mjs --task "<t>" --artifact <path> [--test "node --test <p>"] [--design <model:cloud>] [--execute <model:cloud>] [--context a,b] [--dry]\n'); process.exit(2); }
  if (dry) {
    process.stdout.write(JSON.stringify({ dry: true, plan: { stage1: 'design', stage2: 'execute+gate', artifactPath, task } }, null, 2) + '\n');
    process.exit(0);
  }
  if (process.env.YURI_NANO_CLI_FIRE !== '1') {
    process.stderr.write('refused: gated dispatch spawns lanes — operator override required (YURI_NANO_CLI_FIRE=1), or call dispatchGated() programmatically.\n');
    process.exit(3);
  }
  const ctx = get('--context');
  dispatchGated({
    task, artifactPath, testCmd: get('--test'),
    designModel: get('--design') || 'deepseek-v4-pro:cloud',
    executeModel: get('--execute') || 'minimax-m3:cloud',
    contextFiles: ctx ? ctx.split(',') : [],
  }, { log: (m) => process.stderr.write(m + '\n') }).then((r) => {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    process.exit(r.ok ? 0 : 1);
  });
}
