// mure-learn.mjs — OMP → MURE learn-loop bridge (the seam the ledger flagged as "no live consumer").
//
// Turns every OMP task() dispatch of a MURE role (agent name `mure-*`, or the worker lanes
// fable-synth / deepseek-flash / composer-fast) into a prediction→outcome tuple in the EXISTING
// MURE learning store (_SYSTEM/state/prediction-ledger.jsonl), so the fleet-router MLP + Brier
// calibration actually learn from the work the company does through OMP — not just from MURE's
// own company.mjs/runSwarm dispatch path.
//
// SAFETY POSTURE (deliberately conservative — this fires on EVERY task call):
//   • The hook is DISARMED by default: it no-ops unless _SYSTEM/state/mure-learn-hook.enabled
//     exists OR env YURI_MURE_LEARN_HOOK=1. Owner-gated to arm (touch the flag).
//   • Even when the hook is armed, WEIGHT PERSIST still obeys the existing MLP arm gate
//     (shouldPersistMlpLearn → _SYSTEM/state/mlp-learn.enabled). Ledger rows are advisory data;
//     weight mutation is double-gated.
//   • Fail-open ALWAYS: any error in capture is swallowed. This hook must never block, slow, or
//     break a task dispatch. It observes; it does not gate. (Governance gating is a separate hook.)
//   • Only `task` tool calls are touched; every other tool passes through untouched and instantly.
//
// Wiring: dropped at .omp/hooks/pre/ (project scope). OMP's extension runner loads the default
// factory and binds pi.on(...) to the runtime event bus. Mirror to ~/.omp/agent/agents-adjacent
// hook dirs if a user-scope install is wanted later.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const REPO_ROOT = process.env.YURI_REPO_ROOT || `${os.homedir()}/YURI-OS-MUSUBI`;
const SCRIPTS = path.join(REPO_ROOT, '_SYSTEM', 'Scripts');
const ARM_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'mure-learn-hook.enabled');
const LEDGER = path.join(REPO_ROOT, '_SYSTEM', 'state', 'prediction-ledger.jsonl');

function hookArmed() {
  if (process.env.YURI_MURE_LEARN_HOOK === '1') return true;
  try { return fs.existsSync(ARM_FLAG); } catch { return false; }
}

// agent name → { role, substrate-ish model } by reading the live agent def frontmatter.
// mure-<role> → role=<role>; worker agents map to their function. Cached per process.
const _agentCache = new Map();
function resolveAgentMeta(agentName) {
  if (!agentName) return null;
  if (_agentCache.has(agentName)) return _agentCache.get(agentName);
  let meta = null;
  try {
    const defPath = path.join(os.homedir(), '.omp', 'agent', 'agents', `${agentName}.md`);
    const fm = fs.readFileSync(defPath, 'utf8').slice(0, 800);
    const model = (fm.match(/^model:\s*(.+)$/m) || [])[1]?.trim() || 'unknown';
    const role = agentName.startsWith('mure-') ? agentName.slice(5) : agentName;
    meta = { role, model };
  } catch {
    // Unknown/bundled agent — still record with a best-effort role label, model unknown.
    meta = { role: agentName.startsWith('mure-') ? agentName.slice(5) : agentName, model: 'unknown' };
  }
  _agentCache.set(agentName, meta);
  return meta;
}

// substrate bucket from a provider/model string, for the router's option encoding.
function substrateOf(model) {
  const m = String(model || '').toLowerCase();
  if (m.startsWith('anthropic/')) return 'native';
  if (m.includes('glm-5.2')) return 'glm-heavy';
  if (m.includes('glm-5-turbo') || m.includes('glm-turbo')) return 'glm-fast';
  if (m.startsWith('zai/')) return 'glm-workhorse';
  if (m.includes('deepseek-v4-flash')) return 'ollama-flash';
  if (m.startsWith('ollama-cloud/')) return 'ollama-specialist';
  if (m.startsWith('cursor/')) return 'cursor';
  return 'native';
}

// Only these agents feed the MoE learn loop (mure roles + the three worker lanes).
function isMureAgent(name) {
  return typeof name === 'string' && (name.startsWith('mure-')
    || name === 'fable-synth' || name === 'deepseek-flash' || name === 'composer-fast');
}

// Map an agent id (from the task result) → predictionId, so tool_result can pair the outcome.
// In-memory per session; the ledger is the durable store.
const _pending = new Map();

async function lazyLedger() {
  try { return await import(path.join(SCRIPTS, 'prediction-ledger.mjs')); } catch { return null; }
}
async function lazyRouter() {
  try { return await import(path.join(SCRIPTS, 'fleet-router-mlp.mjs')); } catch { return null; }
}
async function lazyFeedback() {
  try { return await import(path.join(SCRIPTS, 'fleet-mlp-feedback.mjs')); } catch { return null; }
}

// Extract the spawn list from a task tool_call input (batch or flat shape).
function spawnsFromInput(input = {}) {
  const agent = input.agent;
  if (Array.isArray(input.tasks) && input.tasks.length) {
    return input.tasks.map((t) => ({ agent, id: t.id, role: t.role, assignment: t.assignment || '' }));
  }
  if (input.assignment) return [{ agent, id: input.id, role: input.role, assignment: input.assignment }];
  return [];
}

async function onDispatch(input) {
  const spawns = spawnsFromInput(input).filter((s) => isMureAgent(s.agent));
  if (!spawns.length) return;
  const ledger = await lazyLedger();
  const router = await lazyRouter();
  if (!ledger) return;
  for (const s of spawns) {
    const meta = resolveAgentMeta(s.agent);
    const substrate = substrateOf(meta?.model);
    const taskShape = { role: meta?.role || s.role, prompt: s.assignment, recursionDepth: 0 };
    let features = null, suggestion = null, confidence = null;
    try {
      if (router?.extractFeatures) features = router.extractFeatures(taskShape, {});
      if (router?.predictRoute && features) {
        const pr = await router.predictRoute(features, [{ id: s.agent, substrate, role: meta?.role, lane: meta?.model }]);
        suggestion = pr?.best || null; confidence = pr?.confidence ?? null;
      }
    } catch { /* fail-open */ }
    const ts = new Date().toISOString();
    const sub = s.id || s.agent;
    const predictionId = `omp:${sub}:${ts}`;
    try {
      ledger.recordPrediction({
        id: predictionId,
        subject: `omp-task-route:${sub}`,
        change: `dispatch ${s.agent} → ${meta?.model || 'unknown'} (${substrate})`,
        predictedEffects: [{ target: 'substrate', effect: substrate, confidence: confidence ?? 0.5 }],
        features,
        source: 'mure-learn-hook',
        ts,
      }, { file: LEDGER });
      _pending.set(s.id || s.agent, { predictionId, features, suggestion: suggestion || { substrate, lane: meta?.model }, substrate });
    } catch { /* fail-open */ }
  }
}

async function onResult(details) {
  // task tool_result details carries results[] (SingleResult per spawn) with id/output/exitCode/etc.
  const results = Array.isArray(details?.results) ? details.results : [];
  if (!results.length) return;
  const ledger = await lazyLedger();
  const router = await lazyRouter();
  const feedback = await lazyFeedback();
  if (!ledger) return;
  const persist = feedback?.shouldPersistMlpLearn ? feedback.shouldPersistMlpLearn({}) : false;
  for (const r of results) {
    const key = r.id || r.agent;
    const pend = _pending.get(key);
    if (!pend) continue;
    _pending.delete(key);
    const text = String(r.output || '');
    const label = feedback?.extractResultLabel ? '' : ''; // label parsed below via router-agnostic regex
    const rl = (text.match(/\b\d{2}[A-Z]{2}_[A-Z0-9_]+_(?:X|P|F)_PASS_COMMITTED\b/) || [])[0]
      || (text.match(/\b[0-9A-Z]{2,}_[A-Z0-9_]+_(?:X|P|F)_PASS_COMMITTED\b/) || [])[0] || '';
    const ok = (r.exitCode === 0 || r.exitCode == null) && !r.error && !r.aborted;
    const pass = /_(X|P)_PASS_/.test(rl);
    const outcome = {
      success: ok && (pass || text.trim().length >= 16) ? 1 : 0,
      quality: pass ? 0.9 : ok ? 0.65 : 0.2,
      actualSubstrate: pend.substrate,
      resultLabel: rl,
    };
    try {
      ledger.recordOutcome({
        predictionId: pend.predictionId,
        observedEffects: [
          { target: 'substrate', effect: pend.substrate },
          { target: 'success', effect: outcome.success },
          { target: 'quality', effect: outcome.quality },
        ],
        ts: new Date().toISOString(),
      }, { file: LEDGER });
      if (persist && router?.updateFromOutcome && pend.features) {
        await router.updateFromOutcome(pend.features, pend.suggestion, outcome, { persist: true, learningRate: 0.02 });
      }
    } catch { /* fail-open */ }
  }
}

export default function hook(pi) {
  // Pre-dispatch: record a routing prediction for each mure-* task spawn.
  pi.on('tool_call', async (event) => {
    try {
      if (!hookArmed()) return;
      if (event?.toolName !== 'task') return;
      await onDispatch(event.input || {});
    } catch { /* fail-open — never block a dispatch */ }
    return; // never returns { block } — this hook only observes
  });

  // Post-completion: pair the outcome and (double-gated) update the router.
  pi.on('tool_result', async (event) => {
    try {
      if (!hookArmed()) return;
      if (event?.toolName !== 'task' || event?.isError) return;
      await onResult(event.details || {});
    } catch { /* fail-open */ }
    return;
  });
}
