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
// @exports: dispatchGated, defaultCheckArtifact, buildDesignPrompt, buildExecutePrompt, aiHydratedLlmRunner, defaultLlmLaneRunner, OLLAMA_LANE
// HYDRATION (FIXED 2026-06-16): the default runLane is now `aiHydratedLlmRunner`, which spawns
// `bash <repo>/_SYSTEM/Scripts/ai llm <lane> <prompt> --out <f> [--model --reasoning --max-iters --context]`.
// The `ai` wrapper hydrates the macOS-Keychain OLLAMA_API_KEY BEFORE exec-ing llm-lane.mjs, then forwards
// EVERY remaining arg verbatim (`exec node llm-lane.mjs "$@"`), so --out/--context/--model/--reasoning/--max-iters
// all pass through unchanged — the earlier "ai llm drops --out/--context" assumption was WRONG (disproven by a
// dry-run: hasKey:true + contextChars>0 with --context fed). This module NEVER reads the key itself; the wrapper
// owns hydration. The original `defaultLlmLaneRunner` (spawns `node llm-lane.mjs` directly, NO hydration) stays
// exported for an already-hydrated caller (the live nano-swarm tick). Control flow proven (10/10 hermetic).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// re-exported: the NON-hydrated runner (spawns `node llm-lane.mjs` directly), for callers already in a
// hydrated env (the live nano-swarm tick). dispatchGated defaults to aiHydratedLlmRunner instead.
export { defaultLlmLaneRunner } from './nano-external.mjs';

const REPO_ROOT = process.env.YURI_REPO_ROOT
  || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
export const OLLAMA_LANE = 'ollama-cloud';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const AI_WRAPPER = path.join(SCRIPT_DIR, 'ai');
let _runSeq = 0;

// ── hydrated runner ────────────────────────────────────────────────────────────
// Routes through the `ai` bash wrapper so the macOS-Keychain OLLAMA_API_KEY is hydrated before
// llm-lane.mjs runs. Same arg surface + same `--out` file capture as nano-external.defaultLlmLaneRunner;
// the wrapper forwards every flag verbatim. This module never reads the key — the wrapper owns hydration.
// `deps` (spawn/readFile/aiWrapper) exist ONLY for hermetic tests; dispatchGated calls it with one arg.
export function aiHydratedLlmRunner(opts = {}, deps = {}) {
  const { lane, prompt, reasoning, maxIters, contextFiles, timeoutMs, env = null, model = null } = opts;
  const { spawn = spawnSync, readFile = (p) => fs.readFileSync(p, 'utf8'), aiWrapper = AI_WRAPPER } = deps;
  const outFile = path.join(os.tmpdir(), `gated-lane-${process.pid}-${_runSeq += 1}.out`);
  try { fs.rmSync(outFile, { force: true }); } catch { /* ensure fresh */ }
  const args = ['llm', lane, prompt, '--out', outFile, '--max-iters', String(maxIters || 200)];
  if (reasoning) args.push('--reasoning', reasoning);
  if (model) args.push('--model', model);
  if (Array.isArray(contextFiles) && contextFiles.length) args.push('--context', contextFiles.join(','));
  const res = spawn('bash', [aiWrapper, ...args], {
    encoding: 'utf8', timeout: timeoutMs || 600000, maxBuffer: 32 * 1024 * 1024,
    env: env ? { ...process.env, ...env } : process.env,
  });
  let output = '';
  try { output = readFile(outFile); } catch { /* lane may have failed before writing */ }
  try { fs.rmSync(outFile, { force: true }); } catch { /* best-effort */ }
  return { exitCode: res?.status ?? null, output: output || (res?.stdout || ''), stderr: res?.stderr || '', signal: res?.signal || null };
}

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
    // Cost-routing (owner 2026-06-15): default to the cheaper peers; deepseek-v4-pro is high-usage, opt in explicitly.
    designLane = OLLAMA_LANE, designModel = 'nemotron-3-ultra:cloud',
    executeLane = OLLAMA_LANE, executeModel = 'minimax-m3:cloud',
    contextFiles = [], artifactPath, testCmd = null,
    maxExecuteAttempts = 3, reasoning = 'xhigh', maxIters = 200, timeoutMs = 600000,
    specDir = os.tmpdir(), cwd = REPO_ROOT,
  } = opts;
  const { runLane = aiHydratedLlmRunner, checkArtifact = defaultCheckArtifact, now = () => Date.now(), log = () => {} } = deps;

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
    designModel: get('--design') || 'nemotron-3-ultra:cloud', // cost-routing (owner 2026-06-15): cheap peers by default
    executeModel: get('--execute') || 'minimax-m3:cloud',
    contextFiles: ctx ? ctx.split(',') : [],
  }, { log: (m) => process.stderr.write(m + '\n') }).then((r) => {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    process.exit(r.ok ? 0 : 1);
  });
}
