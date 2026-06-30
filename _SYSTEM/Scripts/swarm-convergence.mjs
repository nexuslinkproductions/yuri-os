#!/usr/bin/env node
// @capability: swarm-convergence
// @serves: swarm convergence | when is the swarm done | stop the nano-swarm loop | convergence gate | loop-until-converged | swarm damping | recursive swarm governor | did the fan-out finish | obligation floor | adversarial done-check
// @does: the 3-layer convergence GATE + damping for YURI nano-swarm round loops — transferred from irys-stateful-swarms (the GATE, not their LLM-as-controller; wraps YURI's native fan-out). Layer 1: deterministic obligation-ledger floor (every decomposition leaf has a conforming RESULT_LABEL via contract-conformance, passTypeNorm in {X,P}, non-empty). Layer 2: deterministic critical-signal block (any unresolved CRITICAL signal — e.g. a canonical-store contested claim). Layer 3: adversarial peer pass ("swarm says done — find what's missing: verification/edge-case/test/integration"), gaps re-injected as next-round work. Damping (circuit breaker): marginal-value cutoff + budget governor force-stop a blocked-but-not-progressing loop; seen-finding dedup + action cooldown stop oscillation. DISARMED by default (passthrough converged:true) until YURI_SWARM_CONVERGENCE=1.
// @use: const ledger = buildObligationLedger(decomposition) once; each round call converge({ledger, poolOutputs, signals, adversarialResult, damping, round}); if !converged dispatch nextRoundWork and loop. This is the GOVERNOR a recursive spawn_nano tool needs — depth/cost/oscillation bounds. Adversarial pass runs via runAdversarialPass({runner}) (runner injectable; default would dispatch a non-work peer lane via nano-external).
// @exports: buildObligationLedger, checkObligationFloor, checkCriticalSignalBlock, runAdversarialPass, defaultAdversarialRunner, finalizeGuard, checkDamping, dedupeWork, converge, isArmed, hashFinding, isConformingPass, ADVERSARIAL_PROMPT, CONVERGENCE_STATE_DIR, ARM_ENV
//
// Authority: ADVISORY gate. Converge verdicts never mutate source/commits/protected surfaces — a pure
// decision + ephemeral per-run damping state. DISARMED-default + reversible (delete this file + its test).
// Provenance: 02_RESOURCES/RESEARCH/irys-swarm-transfer-2026-06-14/04-MOVE1-PLAN.md (4-lane converged).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseResultLabel } from './contract-conformance.mjs';
import { defaultTimeoutMsForLane } from './glm-fleet.mjs';

export const CONVERGENCE_STATE_DIR = '_SYSTEM/state/swarm-convergence'; // ephemeral per-run damping state
export const ARM_ENV = 'YURI_SWARM_CONVERGENCE';
export const ARM_FLAG = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), '_SYSTEM', 'state', 'swarm-convergence.enabled');

/** Armed via the env flag OR a local (gitignored) flag file — mirrors glm-fleet's arm idiom (owner-gated to
 *  create; reversible by `rm`). DISARMED → converge() is a passthrough that never blocks a run. */
export function isArmed() {
  if (process.env[ARM_ENV] === '1') return true;
  try { return fs.existsSync(ARM_FLAG); } catch { return false; }
}

/** Stable short hash of a finding/gap string — dedup key so the same gap isn't re-chased every round. */
export function hashFinding(text) {
  return crypto.createHash('sha256').update(String(text == null ? '' : text)).digest('hex').slice(0, 16);
}

/**
 * Layer 1 input. Build the obligation ledger from a decomposition.
 * Accepts {leaves:[{id,role,expectedOutputType}]} OR {nodes:[{id,...}], edges:[{from,to}]}
 * (leaves = DAG nodes with no outgoing edge). The ledger is a HYPOTHESIS, not ground truth —
 * open-ended work can spawn scope the decomposition never anticipated (honest meta-break).
 */
export function buildObligationLedger(decomposition = {}) {
  let leafTasks = [];
  if (Array.isArray(decomposition.leaves)) {
    leafTasks = decomposition.leaves.map((l) => ({
      id: l.id, role: l.role ?? l.id, expectedOutputType: l.expectedOutputType ?? 'any',
    }));
  } else if (Array.isArray(decomposition.nodes)) {
    const hasOutgoing = new Set((decomposition.edges || []).map((e) => e.from));
    leafTasks = decomposition.nodes
      .filter((n) => !hasOutgoing.has(n.id))
      .map((n) => ({ id: n.id, role: n.role ?? n.id, expectedOutputType: n.expectedOutputType ?? 'any' }));
  }
  return { leafTasks, leafCount: leafTasks.length };
}

/**
 * A pool output is a conforming PASS iff it has non-empty text AND a parseable RESULT_LABEL with
 * passTypeNorm in {X,P}. Hardened: P-class passes additionally require text.length >= 200 to filter
 * trivial stub outputs that technically parse but carry no real content. X-passes are unchanged.
 * Exported for testability.
 */
export function isConformingPass(output) {
  if (!output) return false;
  const text = String(output.text ?? output.output ?? '').trim();
  if (text.length === 0) return false;
  const p = parseResultLabel(output.label ?? '');
  if (!p || !p.ok) return false;
  if (p.passTypeNorm === 'X') return true;
  if (p.passTypeNorm === 'P') return text.length >= 200;
  return false;
}

/**
 * Finalize guard — the gate that prevents finalizing on a damping force-stop or with outstanding
 * blockers. Call with the verdict returned by converge(). Returns { ok, reason }.
 * ok is true iff verdict.converged===true AND verdict.forced!==true AND no blocking items.
 */
export function finalizeGuard(verdict = {}) {
  if (verdict.converged !== true) return { ok: false, reason: 'not-converged' };
  if (verdict.forced === true) return { ok: false, reason: 'forced-stop' };
  if ((verdict.blocking || []).length > 0) return { ok: false, reason: 'blockers-present' };
  return { ok: true, reason: 'finalize-allowed' };
}

/** Layer 1: deterministic obligation-ledger floor. poolOutputs = { [leafId]: { label, text } }. */
export function checkObligationFloor(ledger = { leafTasks: [] }, poolOutputs = {}) {
  const missing = [];
  const nonConforming = [];
  for (const leaf of ledger.leafTasks || []) {
    const out = poolOutputs[leaf.id];
    if (out == null) { missing.push(leaf.id); continue; }
    if (!isConformingPass(out)) nonConforming.push(leaf.id);
  }
  return { ok: missing.length === 0 && nonConforming.length === 0, missing, nonConforming };
}

/** Layer 2: deterministic critical-signal block. signals = [{id|hash, severity, resolved}]. */
export function checkCriticalSignalBlock(signals = []) {
  const blockers = (signals || [])
    .filter((s) => s && !s.resolved && String(s.severity).toUpperCase() === 'CRITICAL')
    .map((s) => s.id ?? s.hash ?? 'critical-signal');
  return { blocked: blockers.length > 0, blockers };
}

export const ADVERSARIAL_PROMPT = 'The swarm reports its work COMPLETE. Find what is MISSING: verification gaps, untested edge cases, integration breaks, incomplete evidence. Return only gaps that are material AND specific AND actionable.';

/**
 * Default production adversarial runner. Dispatches ONE glm-max non-work review lane via lane-dispatch.mjs,
 * reads the tmp output, and parses the model reply into { rejections: [{leafId, gap, actionable:true}] }.
 *
 * The model is instructed to reply ONLY with a JSON array of {leafId, gap} objects describing
 * material+specific+actionable gaps, or [] if none. Parsing is lenient (first [...] block wins).
 * Fail-soft: any dispatch or parse error returns { rejections: [] } — the gate must never hard-fail
 * on an LLM call.
 *
 * @param {object} opts — passed through to the runner closure; currently unused (reserved for overrides).
 * @returns {function({prompt, poolOutputs, lanes}): Promise<{rejections: Array}>}
 */
export function defaultAdversarialRunner(opts = {}) {
  return async function runner({ prompt = ADVERSARIAL_PROMPT, poolOutputs = {}, lanes = [] } = {}) {
    const { execFileSync, mkdtempSync, readFileSync, unlinkSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const { execSync } = await import('node:child_process');
    const { spawnSync } = await import('node:child_process');

    // Serialize pool outputs — bounded to ≤~6k chars total to keep the prompt in range.
    const POOL_CHAR_CAP = 6000;
    const EXCERPT_LEN = 400;
    let serialized;
    try {
      const entries = Object.entries(poolOutputs).map(([id, out]) => ({
        leafId: id,
        label: out?.label ?? '',
        text: String(out?.text ?? out?.output ?? '').slice(0, EXCERPT_LEN),
      }));
      const raw = JSON.stringify(entries);
      serialized = raw.length > POOL_CHAR_CAP ? raw.slice(0, POOL_CHAR_CAP) + '...(truncated)' : raw;
    } catch (_) {
      serialized = '[]';
    }

    const lanesLabel = Array.isArray(lanes) && lanes.length
      ? `Active lanes: ${lanes.map((l) => l?.id ?? l).join(', ')}.`
      : '';

    const fullPrompt = [
      prompt,
      lanesLabel,
      `Pool outputs (leafId + first ${EXCERPT_LEN} chars): ${serialized}`,
      'Reply with ONLY a JSON array: [{\"leafId\":\"<id or null>\",\"gap\":\"<one-line gap>\"}] or [] if none. No prose, no markdown fences.',
    ].filter(Boolean).join('\n\n');

    let tmpFile;
    try {
      const dir = mkdtempSync(join(tmpdir(), 'yuri-adv-'));
      tmpFile = join(dir, 'out.json');
    } catch (e) {
      return { rejections: [] };
    }

    try {
      // Dispatch glm-max review lane — non-work (review only, no mutations).
      // Outer timeout must match glm-max tier (was 120s — SIGKILL'd lane-dispatch before --out; GLM wiring audit 2026-06-30).
      const advTimeoutMs = Number(process.env.LANE_DISPATCH_TIMEOUT_MS || defaultTimeoutMsForLane('glm-max'));
      const result = spawnSync(
        'node',
        [
          '_SYSTEM/Scripts/lane-dispatch.mjs',
          'glm-max',
          fullPrompt,
          '--out', tmpFile,
          '--reasoning', 'high',
        ],
        {
          encoding: 'utf8',
          timeout: advTimeoutMs,
          cwd: process.cwd(),
          env: { ...process.env, LANE_DISPATCH_TIMEOUT_MS: String(advTimeoutMs) },
        },
      );
      if (result.error) return { rejections: [] };
    } catch (_) {
      return { rejections: [] };
    }

    let rawText;
    try { rawText = readFileSync(tmpFile, 'utf8'); }
    catch (_) { return { rejections: [] }; }
    try { unlinkSync(tmpFile); } catch (_) { /* best-effort cleanup */ }

    // Parse leniently: find the first JSON array in the response text.
    let parsed;
    try {
      const match = rawText.match(/\[[\s\S]*?\]/);
      parsed = match ? JSON.parse(match[0]) : [];
    } catch (_) {
      return { rejections: [] };
    }

    if (!Array.isArray(parsed)) return { rejections: [] };

    const rejections = parsed
      .filter((r) => r && typeof r.gap === 'string' && r.gap.trim())
      .map((r) => ({ leafId: r.leafId ?? null, gap: r.gap.trim(), actionable: true }));

    return { rejections };
  };
}

/**
 * Layer 3: adversarial peer pass. `runner` is injectable (default production runner dispatches a
 * non-work peer lane via nano-external; tests inject a fake). Fail-soft: a runner error never blocks
 * (returns ok:true) — the gate must not become a single point of failure on an LLM call.
 * Only material∧specific∧actionable gaps (r.actionable===true && r.gap) count.
 */
export async function runAdversarialPass({ poolOutputs = {}, lanes = [], runner, opts = {} } = {}) {
  if (typeof runner !== 'function') return { ok: true, rejections: [], skipped: 'no-runner' };
  let raw;
  try { raw = await runner({ prompt: ADVERSARIAL_PROMPT, poolOutputs, lanes, opts }); }
  catch (e) { return { ok: true, rejections: [], failSoft: true, error: String(e?.message || e).slice(0, 200) }; }
  const rejections = (Array.isArray(raw?.rejections) ? raw.rejections : [])
    .filter((r) => r && r.actionable === true && r.gap)
    .map((r) => ({ leafId: r.leafId ?? null, gap: String(r.gap), actionable: true }));
  return { ok: rejections.length === 0, rejections };
}

/**
 * Damping circuit breaker — the STOP decision when the loop is blocked. Forces termination on
 * marginal-value cutoff (last K round-yields all below threshold) or budget exhaustion, so a
 * blocked-but-not-progressing loop can't oscillate forever. Pure: state in, decision + state out.
 */
export function checkDamping(state = {}, opts = {}) {
  const yields = Array.isArray(state.roundYields) ? state.roundYields : [];
  const window = opts.marginalWindow ?? 2;
  const threshold = opts.marginalThreshold ?? 1;
  const budgetCap = opts.budgetCap ?? Infinity;
  const budgetUsed = state.budgetUsed ?? 0;
  if (budgetUsed >= budgetCap) return { continue: false, reason: 'budget-exhausted', updatedState: state };
  if (yields.length >= window && yields.slice(-window).every((y) => y < threshold)) {
    return { continue: false, reason: 'marginal-value-cutoff', updatedState: state };
  }
  return { continue: true, reason: 'progressing', updatedState: state };
}

/**
 * Dedup next-round work: drop gaps already seen and actions still under cooldown, so the swarm doesn't
 * re-chase the same finding round after round (the find-gap→fill→re-find oscillation). Updates state.
 */
export function dedupeWork(work = [], state = {}, round = 0, opts = {}) {
  const seen = new Set(state.seenFindingHashes || []);
  const cooldown = { ...(state.actionCooldown || {}) };
  const coolRounds = opts.cooldownRounds ?? 2;
  const fresh = [];
  for (const w of work) {
    const h = hashFinding(w.gap ?? w.description ?? JSON.stringify(w));
    const key = `${w.action ?? 'work'}:${w.leafId ?? w.target ?? ''}`;
    if (seen.has(h)) continue;
    if (typeof cooldown[key] === 'number' && round < cooldown[key]) continue;
    seen.add(h);
    cooldown[key] = round + coolRounds;
    fresh.push(w);
  }
  return { fresh, updatedState: { ...state, seenFindingHashes: [...seen], actionCooldown: cooldown } };
}

/**
 * Single entry point — call once per fan-out round. Runs the 3 layers, short-circuit-free (collects all
 * blocking reasons), then lets damping force-stop if blocked-but-stalled. Returns
 * { converged, reason, blocking[], nextRoundWork[], damping, forced? }.
 * DISARMED (or opts.armed===false) → passthrough { converged:true, reason:'gate-disarmed' }.
 * `adversarialResult` is precomputed by the caller (runAdversarialPass) so this stays pure + sync.
 */
export function converge({ ledger, poolOutputs = {}, signals = [], adversarialResult = null, damping = {}, round = 0, opts = {} } = {}) {
  const armed = (opts.armed !== undefined) ? opts.armed : isArmed();
  if (!armed) return { converged: true, reason: 'gate-disarmed', blocking: [], nextRoundWork: [], damping };

  const blocking = [];
  const nextRoundWork = [];

  const floor = checkObligationFloor(ledger || { leafTasks: [] }, poolOutputs);
  if (!floor.ok) {
    for (const id of floor.missing) blocking.push({ layer: 'obligation-floor', leafId: id, kind: 'missing' });
    for (const id of floor.nonConforming) blocking.push({ layer: 'obligation-floor', leafId: id, kind: 'non-conforming' });
  }

  const block = checkCriticalSignalBlock(signals);
  if (block.blocked) for (const id of block.blockers) blocking.push({ layer: 'critical-signal', signalId: id });

  if (adversarialResult && adversarialResult.ok === false) {
    for (const r of adversarialResult.rejections || []) {
      blocking.push({ layer: 'adversarial', leafId: r.leafId, gap: r.gap });
      nextRoundWork.push({ action: 're-extract', leafId: r.leafId, gap: r.gap });
    }
  }

  if (blocking.length === 0) {
    return { converged: true, reason: 'all-layers-satisfied', blocking: [], nextRoundWork: [], damping };
  }

  const damp = checkDamping(damping, opts);
  if (!damp.continue) {
    // Fail-closed honesty: forced-stop is NOT convergence — finalizeGuard blocks on forced:true.
    return { converged: false, reason: `forced-stop:${damp.reason}`, forced: true, blocking, nextRoundWork: [], damping: damp.updatedState };
  }

  const dd = dedupeWork(nextRoundWork, damping, round, opts);
  return { converged: false, reason: 'blocked', blocking, nextRoundWork: dd.fresh, damping: dd.updatedState };
}

// CLI: quick self-describe (no live dispatch). `node swarm-convergence.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify({
    module: 'swarm-convergence', armed: isArmed(), armEnv: ARM_ENV,
    exports: ['buildObligationLedger', 'checkObligationFloor', 'checkCriticalSignalBlock', 'runAdversarialPass', 'defaultAdversarialRunner', 'finalizeGuard', 'isConformingPass', 'checkDamping', 'dedupeWork', 'converge'],
    note: 'DISARMED-default 3-layer nano-swarm convergence gate + damping. Set YURI_SWARM_CONVERGENCE=1 to arm.',
  }, null, 2)}\n`);
}
