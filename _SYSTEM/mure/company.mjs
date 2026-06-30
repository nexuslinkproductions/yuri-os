#!/usr/bin/env node
// @capability: mure-company-orchestrator
// @serves: agentic company | run mure | role based fleet run | task to roles | company orchestrator | self governing agent org | dispatch roles | mure run
// @does: the MURE top orchestrator — turns a task into a governed, role-cast fleet run. envoy decodes intake → helmsman decomposes → capability-match each subtask to a role → resolve its dispatch target (glm lane vs native Agent vs inline) → the steward gates every decision via the 6-gate charter → owner-gated subtasks are HELD, self-governable ones are cast into runSwarm leaves (GLM substrate) + native Agent specs (for the Opus session to spawn). DISARMED-safe: plan-only (zero spend) unless MURE is armed; finalize stays with Opus/owner.
// @use: import { runCompany, planCompany, MURE_NAME, isMureArmed } from mure/company.mjs. task = {summary, subtasks:[{id,need:[caps],prompt,blastRadius?,reversible?,...}], tags?}. CLI: node company.mjs --task-file t.json [--dry-run].
// @exports: runCompany, planCompany, castRole, buildLeaf, decisionFor, dispatchNative, isMureArmed, MURE_NAME, ARM_ENV, ARM_FLAG
//
// Authority: ADVISORY orchestration. The plan + governance rulings are produced here; the NATIVE substrate
// (Agent-tool spawns) and FINALIZE (commit/push/outward) are driven by the Opus session, never by this script.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRoster, validateRoster, matchRolesByCapability, resolveLane, getRole, GLM_LANES, NATIVE_LANES } from './role-registry.mjs';
import { evaluateGovernance, CLASS } from './governance.mjs';
import { runSwarm } from '../Scripts/runSwarm.mjs';
import { extractResultLabel, validatePacket, defaultTimeoutMsForLane } from '../Scripts/glm-fleet.mjs';
import { spawnNativeLoop } from './native-spawn-loop.mjs';
import { runMlpFeedbackLoop, recordMlpFeedbackStub } from '../Scripts/fleet-mlp-feedback.mjs';
import { loadHeldRulings, isSubtaskClearedByOwner } from './held-rulings.mjs';
import { isEvolverArmed } from './evolver-arm.mjs';

// MLP Router integration point (advisory only – never overrides governance)
let _router = null;
async function getRouter() {
  if (_router) return _router;
  try {
    _router = await import('../Scripts/fleet-router-mlp.mjs');
  } catch {
    _router = null;
  }
  return _router;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
export const ARM_ENV = 'YURI_MURE_ARMED';
export const ARM_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'mure.enabled');

/** MURE armed via env OR gitignored flag (owner-gated to create; `rm` to disarm). DISARMED = plan-only. */
export function isMureArmed() {
  if (process.env[ARM_ENV] === '1') return true;
  try { return fs.existsSync(ARM_FLAG); } catch { return false; }
}

let _roster = null;
export const MURE_NAME = (() => {
  try { _roster = loadRoster(); return _roster.meta?.name || 'MURE'; } catch { return 'MURE'; }
})();

/** Advisory execution substrates (catalog only — not live dispatch until wired + armed). Governance wins. */
export const ADVISORY_SUBSTRATES = Object.freeze({
  native: { label: 'Cursor / Claude Agent', dispatch: 'agent', armFlag: null },
  glm: { label: 'z.ai GLM Coding Plan', dispatch: 'glm-lane', armFlag: '_SYSTEM/state/glm-fleet.enabled' },
  ollama: { label: 'Ollama Cloud sidecar', dispatch: 'parallel-sidecar', armFlag: '_SYSTEM/state/ollama-fleet.enabled' },
  cline: {
    label: 'Cline Pass (IDE/CLI peer)',
    dispatch: 'cline-cli',
    status: 'DISARMED',
    install: 'npm i -g cline',
    auth: 'cline auth clinepass',
    provider: 'clinepass',
    armFlag: '_SYSTEM/state/cline-fleet.enabled',
    models: ['glm-5.2', 'kimi-k2.7-code', 'deepseek-v4-pro', 'mimo-v2.5', 'qwen3.7-max'],
    doc: '_SYSTEM/reports/CLINE_PASS_INTEGRATION_2026-06-29.md',
    budgetDoc: '_SYSTEM/reports/CLINE_CREDIT_BUDGET.md',
    note: 'Sidecar via cline-fleet.mjs; runFleet --cline-sidecar writes cline-tasks.json',
  },
});

/** Map a subtask + its cast role to a governance decision. Role autonomyClass is a FLOOR: an owner-gated
 * role (helmsman/steward/evolver) keeps its subtasks owner-gated even if the six gates would pass. */
export function decisionFor(subtask = {}, role = {}) {
  const base = {
    id: subtask.id || subtask.prompt?.slice(0, 40) || 'subtask',
    summary: subtask.summary || subtask.prompt?.slice(0, 80) || '',
    reversible: subtask.reversible !== false,            // build work defaults reversible
    // empty/unspecified work (no prompt or summary) is NOT evidence-decidable → owner-gated, never an
    // auto-self-governable empty subtask. (native red-team #5.)
    evidenceDecidable: subtask.evidenceDecidable !== false && !!(subtask.prompt || subtask.summary),
    inDoctrine: subtask.inDoctrine !== false,
    blastRadius: subtask.blastRadius || 'LOW',
    outwardFacing: subtask.outwardFacing === true,
    contended: subtask.contended === true,
    arming: subtask.arming === true,
    files: Array.isArray(subtask.files) ? subtask.files : [],
    touchesSensitive: subtask.touchesSensitive === true,
  };
  const ruling = evaluateGovernance(base);
  // finalize (commit/push/publish) is owner-only regardless of role or gates — there is NO finalize code path
  // in this module; finalizeAuthority on a role is advisory metadata the Opus layer consumes. A subtask that
  // REQUESTS finalize is force-held. (GLM-5.2 final-gate MED: give finalizeAuthority runtime teeth.)
  if (subtask.finalize === true) {
    return { ...ruling, class: CLASS.OWNER, failures: [...ruling.failures, 'finalize-owner-only'], ruling: 'OWNER-GATED — finalize (commit/push/publish) is reserved for the Opus/owner lane.' };
  }
  if (role.autonomyClass === 'owner-gated' && ruling.class === CLASS.SELF) {
    // Evolver: owner arm flag lifts the role floor for self-governable subtasks only (2026-06-30 owner auth).
    if (role.id === 'evolver' && isEvolverArmed()) return ruling;
    return { ...ruling, class: CLASS.OWNER, failures: [...ruling.failures, 'role-floor:owner-gated'], ruling: `OWNER-GATED — role '${role.id}' is owner-gated by posture (${role.archetype}).` };
  }
  return ruling;
}

/** Build a runSwarm/Agent prompt that frames the worker AS its role. */
export function buildRolePrompt(role, subtask) {
  return [
    `You are the ${role.name} of ${MURE_NAME} — archetype: ${role.archetype}.`,
    `Mission: ${role.mission}.`,
    `Capabilities you bring: ${(role.capabilities || []).join(', ')}.`,
    '',
    `TASK: ${subtask.prompt || subtask.summary || ''}`,
    '',
    'Work to local evidence; do not over-claim. End your output with an UPPERCASE RESULT_LABEL of the form NNXX_DESCRIPTION_(X|P|F)_PASS_COMMITTED.',
  ].join('\n');
}

/** Build a runSwarm leaf (GLM substrate) for a role-cast subtask. */
export function buildLeaf(role, subtask, target) {
  const leaf = {
    id: subtask.id || role.id,
    lane: target.lane,
    reasoning: 'high',
    prompt: buildRolePrompt(role, subtask),
    role: role.id,
    dispatch: target.dispatch || 'glm-lane',
    substrateHint: subtask.substrateHint || null,
    affinityApplied: target.affinityApplied || null,
  };
  if (subtask.timeoutMs != null) {
    leaf.timeoutMs = subtask.timeoutMs;
  } else if (target.lane === 'glm-max' || target.lane === 'glm-sub-orch') {
    leaf.timeoutMs = defaultTimeoutMsForLane(target.lane);
  }
  return leaf;
}

/** Map task JSON substrateHint / lane override onto a resolveLane target. */
export function applySubstrateHint(subtask, target) {
  const hint = String(subtask?.substrateHint || '').trim().toLowerCase();
  const out = { ...target };
  if (subtask?.lane && (GLM_LANES.includes(subtask.lane) || NATIVE_LANES.includes(subtask.lane))) {
    out.lane = subtask.lane;
    out.model = subtask.lane;
    if (NATIVE_LANES.includes(subtask.lane)) {
      out.substrate = 'native';
      out.dispatch = subtask.lane === 'native' ? 'inline' : 'agent';
    } else {
      out.substrate = 'glm';
      out.dispatch = hint === 'tmux-zai' ? 'zai-tmux' : 'glm-lane';
    }
    return out;
  }
  if (hint === 'tmux-zai') {
    return { substrate: 'glm', lane: 'glm-max', model: 'glm-5.2', dispatch: 'zai-tmux' };
  }
  if (hint === 'native' || hint === 'cursor' || hint === 'opus') {
    const prefer = resolveLane({ substrate: 'either', lane: 'sonnet', fallbackLane: 'sonnet' }, { preferSubstrate: 'native' });
    return prefer;
  }
  if (hint === 'glm-max' && GLM_LANES.includes('glm-max')) {
    return { ...out, lane: 'glm-max', model: 'glm-max', dispatch: 'glm-lane' };
  }
  if (hint === 'glm' || hint === 'mix') {
    return { ...out, dispatch: out.dispatch || 'glm-lane' };
  }
  return out;
}

/**
 * Apply the LLM affinity matrix to override substrate routing for bulk/heavy roles.
 * Reads _SYSTEM/config/llm-affinity-matrix.json (cached after first load).
 * Skips override when the subtask explicitly set a substrateHint (forceSubstrateHint).
 */
let _affinityCache = null;
export function applyAffinityMatrix(role, target, opts = {}) {
  if (opts.forceSubstrateHint) return target;
  if (!_affinityCache) {
    try {
      const matrixPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'llm-affinity-matrix.json');
      _affinityCache = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    } catch {
      _affinityCache = { affinities: {} };
    }
  }
  const affinity = _affinityCache.affinities?.[role?.id];
  if (!affinity) return target;
  const preferred = affinity.preferred;
  const out = { ...target };
  if (preferred === 'ollama-flash') {
    out.substrate = 'ollama';
    out.lane = 'flash';
    out.dispatch = 'ollama-sidecar';
  } else if (preferred === 'ollama-minimax') {
    out.substrate = 'ollama';
    out.lane = 'minimax';
    out.dispatch = 'ollama-sidecar';
  } else if (preferred === 'tmux-zai') {
    out.substrate = 'glm';
    out.lane = 'glm-max';
    out.dispatch = 'zai-tmux';
  } else if (preferred === 'glm-max' && out.lane !== 'glm-max') {
    out.substrate = 'glm';
    out.lane = 'glm-max';
    out.dispatch = 'glm-lane';
  } else if (preferred === 'glm-turbo') {
    out.substrate = 'glm';
    out.lane = 'glm-turbo';
    out.dispatch = 'glm-lane';
  } else if (preferred === 'cline') {
    out.substrate = 'cline';
    out.lane = 'glm';
    out.dispatch = 'cline-sidecar';
  }
  out.affinityApplied = preferred;
  return out;
}

/** Cast a single subtask to its best-matching role + resolved dispatch target + governance ruling. */
export function castRole(roster, subtask, opts = {}) {
  const need = Array.isArray(subtask.need) ? subtask.need : [];
  let role = null;
  if (subtask.role) role = getRole(roster, subtask.role);             // explicit role override
  if (!role && need.length) role = matchRolesByCapability(roster, need)[0]?.role || null;
  if (!role) role = getRole(roster, 'engineer');                       // default executor
  const prefer = subtask.substrateHint === 'native' || subtask.substrateHint === 'cursor' ? 'native' : (opts.preferSubstrate || 'glm');
  let target = resolveLane(role, { preferSubstrate: prefer });
  target = applySubstrateHint(subtask, target);
  target = applyAffinityMatrix(role, target, { forceSubstrateHint: !!subtask.substrateHint });
  const ruling = decisionFor(subtask, role);
  return { subtaskId: subtask.id, role: role.id, roleName: role.name, group: role.group, target, ruling, substrateHint: subtask.substrateHint || null };
}

/**
 * Plan a company run — PURE, DISARMED-safe (no dispatch). Casts every subtask, gates it, and splits the
 * self-governable work into GLM leaves + native Agent specs + inline specs. Owner-gated subtasks are HELD.
 * @returns {{name, valid, casts, glmLeaves, nativeSpecs, inlineSpecs, held, summary}}
 */
export async function planCompany(task = {}, opts = {}) {
  const roster = _roster || loadRoster();
  const validation = validateRoster(roster);
  if (!validation.ok) throw new Error(`MURE roster invalid: ${validation.errors.join('; ')}`);
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const casts = subtasks.map((s) => castRole(roster, { ...s, tags: s.tags || task.tags }, opts));

  const glmLeaves = []; const nativeSpecs = []; const inlineSpecs = []; const held = []; const clearedHeld = [];
  const rulings = opts.rulings || loadHeldRulings();
  for (let i = 0; i < casts.length; i += 1) {
    const c = casts[i];
    const role = getRole(roster, c.role);
    const subtask = subtasks[i];
    if (c.ruling.class === CLASS.OWNER) {
      if (isSubtaskClearedByOwner(subtask.id, subtask, rulings)) {
        clearedHeld.push({ ...c, reason: c.ruling.ruling, clearedBy: rulings.source });
        if (c.target.dispatch === 'glm-lane' || c.target.dispatch === 'zai-tmux') glmLeaves.push(buildLeaf(role, subtask, c.target));
        else if (c.target.dispatch === 'agent') nativeSpecs.push({ id: subtask.id || role.id, role: role.id, model: c.target.model, prompt: buildRolePrompt(role, subtask) });
        else inlineSpecs.push({ id: subtask.id || role.id, role: role.id, prompt: buildRolePrompt(role, subtask) });
      } else {
        held.push({ ...c, reason: c.ruling.ruling });
      }
      continue;
    }
    if (c.target.dispatch === 'glm-lane' || c.target.dispatch === 'zai-tmux') glmLeaves.push(buildLeaf(role, subtask, c.target));
    else if (c.target.dispatch === 'agent') nativeSpecs.push({ id: subtask.id || role.id, role: role.id, model: c.target.model, prompt: buildRolePrompt(role, subtask) });
    else inlineSpecs.push({ id: subtask.id || role.id, role: role.id, prompt: buildRolePrompt(role, subtask) });
  }
  const summary = {
    subtasks: subtasks.length, cast: casts.length,
    glm: glmLeaves.length, native: nativeSpecs.length, inline: inlineSpecs.length,
    held: held.length, clearedHeld: clearedHeld.length,
  };

  // === MLP Router integration point (advisory) ===
  // Does not change dispatch. Attaches routerSuggestion + confidence to leaves/specs for logging & later training.
  // Real call to predictRoute lives here so every plan sees the learned policy.
  try {
    // dynamic so we don't hard-fail if the module is missing during early dev
    const routerMod = await import('../Scripts/fleet-router-mlp.mjs').catch(() => null);
    if (routerMod?.predictRoute && routerMod?.extractFeatures) {
      const ctx = { quotaPressure: opts.quotaPressure ?? 0.4 };
      const defaultCandidates = (leaf) => [
        { id: leaf.id, substrate: 'glm', lane: leaf.lane || 'glm', role: leaf.role },
        { id: `${leaf.id}-native`, substrate: 'native', lane: 'sonnet', role: leaf.role },
        { id: `${leaf.id}-ollama`, substrate: 'ollama', lane: 'ollama-flash', role: leaf.role },
        { id: `${leaf.id}-cline`, substrate: 'cline', lane: 'glm-5.2', role: leaf.role },
      ];
      for (const leaf of glmLeaves) {
        const feats = routerMod.extractFeatures({ ...leaf, role: leaf.role, prompt: leaf.prompt }, ctx);
        const suggestion = await routerMod.predictRoute(feats, defaultCandidates(leaf));
        leaf.routerSuggestion = suggestion.best;
        leaf.routerConfidence = suggestion.confidence;
      }
      for (const spec of nativeSpecs) {
        const feats = routerMod.extractFeatures({ ...spec, role: spec.role, prompt: spec.prompt }, ctx);
        const suggestion = await routerMod.predictRoute(feats, [
          { id: spec.id, substrate: 'native', lane: spec.model || 'sonnet', role: spec.role },
          { id: `${spec.id}-glm`, substrate: 'glm', lane: 'glm-max', role: spec.role },
          { id: `${spec.id}-ollama`, substrate: 'ollama', lane: 'ollama-flash', role: spec.role },
          { id: `${spec.id}-cline`, substrate: 'cline', lane: 'glm-5.2', role: spec.role },
        ]);
        spec.routerSuggestion = suggestion.best;
        spec.routerConfidence = suggestion.confidence;
      }
    }
  } catch (e) {
    // router is best-effort
  }

  const ollamaEligible = [...glmLeaves, ...nativeSpecs]
    .filter((l) => ['scout', 'artificer', 'archivist', 'chronicler', 'envoy'].includes(l.role)
      || l.dispatch === 'ollama-sidecar'
      || l.affinityApplied === 'ollama-flash'
      || l.affinityApplied === 'ollama-minimax'
      || l.routerSuggestion?.substrate === 'ollama')
    .map((l) => ({ id: l.id, role: l.role, lane: l.lane || l.model || 'ollama-flash' }));

  // Use shared buildOllamaSidecar from runFleet.mjs for consistent sidecar metadata
  const ollamaSidecar = {
    discoverable: true,
    eligibleCount: ollamaEligible.length,
    eligible: ollamaEligible,
    spawn: 'node _SYSTEM/Scripts/ollama-fleet.mjs --dry-run --tasks-file <ollama-tasks.json>',
    note: 'Parallel bulk sidecar — manual spawn; runFleet.mjs generates tasks when --ollama-sidecar',
    metadata: {
      bulkRoles: ['scout', 'artificer', 'archivist', 'chronicler', 'envoy'],
      disarmedByDefault: true,
      armEnv: 'YURI_OLLAMA_FLEET',
      armFlag: '_SYSTEM/state/ollama-fleet.enabled',
      tasksFileHint: '.claude/jobs/<runId>/ollama-tasks.json',
      fullImplementation: '_SYSTEM/Scripts/runFleet.mjs::buildOllamaSidecar',
    },
  };

  const clineEligible = [...glmLeaves, ...nativeSpecs]
    .filter((l) => ['scout', 'artificer', 'engineer', 'mechanic'].includes(l.role) || l.routerSuggestion?.substrate === 'cline')
    .map((l) => ({ id: l.id, role: l.role, lane: l.lane || 'glm-5.2', provider: 'clinepass' }));
  const clineSidecar = {
    discoverable: true,
    eligibleCount: clineEligible.length,
    eligible: clineEligible,
    spawn: 'node _SYSTEM/Scripts/cline-fleet.mjs --dry-run --tasks-file <cline-tasks.json>',
    note: 'ClinePass CLI sidecar — runFleet.mjs --cline-sidecar; arm via cline-fleet.enabled',
    budgetDoc: '_SYSTEM/reports/CLINE_CREDIT_BUDGET.md',
    metadata: {
      bulkRoles: ['scout', 'artificer', 'engineer', 'mechanic'],
      disarmedByDefault: true,
      armFlag: '_SYSTEM/state/cline-fleet.enabled',
      tasksFileHint: '.claude/jobs/<runId>/cline-tasks.json',
      fullImplementation: '_SYSTEM/Scripts/runFleet.mjs::buildClineSidecar',
    },
  };

  const zaiEligible = [...glmLeaves, ...nativeSpecs]
    .filter((l) => l.dispatch === 'zai-tmux'
      || l.substrateHint === 'tmux-zai'
      || ['architect', 'adjudicator', 'kernelsmith', 'deliberator', 'oracle'].includes(l.role)
      || ['glm-max', 'glm-sub-orch'].includes(l.lane)
      || l.routerSuggestion?.substrate === 'tmux-zai'
      || l.routerSuggestion?.substrate === 'zai-tmux')
    .map((l) => ({ id: l.id, role: l.role, lane: l.lane, dispatch: l.dispatch || 'glm-lane' }));
  const zaiSidecar = {
    discoverable: true,
    eligibleCount: zaiEligible.length,
    eligible: zaiEligible,
    spawn: 'node _SYSTEM/Scripts/zai-tmux-fleet.mjs --dry-run --tasks-file <zai-tasks.json>',
    note: 'GLM heavy tmux sidecar — runFleet.mjs --zai-sidecar; arm via zai-tmux-fleet.enabled',
    metadata: {
      heavyRoles: ['architect', 'adjudicator', 'kernelsmith', 'deliberator', 'oracle'],
      heavyLanes: ['glm-max', 'glm-sub-orch'],
      disarmedByDefault: true,
      armEnv: 'YURI_ZAI_TMUX_FLEET',
      armFlag: '_SYSTEM/state/zai-tmux-fleet.enabled',
      tasksFileHint: '.claude/jobs/<runId>/zai-tasks.json',
      fullImplementation: '_SYSTEM/Scripts/runFleet.mjs::buildZaiSidecar',
      limitation: 'claude-zai interactive — tmux send-keys + capture-pane poll',
    },
  };

  return { name: MURE_NAME, valid: validation.ok, roleCount: validation.roleCount, casts, glmLeaves, nativeSpecs, inlineSpecs, held, clearedHeld, summary, ollamaSidecar, clineSidecar, zaiSidecar, heldRulingsSource: rulings.source };
}

/**
 * Dispatch native-lane specs to the shared results directory via the Opus-top native spawn loop.
 *
 * Native Claude Agents are ONLY spawnable via the Agent tool from an Opus session, NOT via
 * lane-dispatch/llm-lane (which only supports cloud lanes). This function delegates to
 * native-spawn-loop.mjs, which defines the Opus-side execution seam.
 *
 * In a GLM-side run (no Opus session), native agents are stubbed/disarmed — the run completes
 * with dry-run packets and a 'disarmed' status. In an Opus-side run, the stub is replaced with
 * actual Agent tool calls.
 *
 * DISARMED-safe: only spawns when MURE is armed; otherwise returns dry-run packets.
 * @param {Array<{id,role,model,prompt}>} nativeSpecs - specs from planCompany
 * @param {string} runDir - absolute path to the results directory (shared with GLM leaves)
 * @returns {Promise<{ pool: { [leafId: string]: {...} }, skipped: Array<{file,error}> }>}
 */
export async function dispatchNative(nativeSpecs = [], runDir = '') {
  return spawnNativeLoop(nativeSpecs, runDir);
}

/**
 * Run a company task. DISARMED (default): returns the plan only (zero spend). ARMED: dispatches the GLM
 * leaves through runSwarm (governed loop), and returns nativeSpecs for the Opus session to spawn via the
 * Agent tool. Finalize stays with Opus/owner.
 * @returns {{name, armed, plan, swarm, nativeSpecs, held}}
 */
export async function runCompany(task = {}, opts = {}) {
  const plan = await planCompany(task, opts);
  // Arming requires the OWNER gate (env YURI_MURE_ARMED or flag _SYSTEM/state/mure.enabled). A caller may
  // only force-DISARM (opts.armed:false, for tests/dry-run); opts.armed:true alone can NOT self-arm — the
  // owner flag is the sole arming authority. (GLM-5.2 final-gate HIGH-2: monetary/irreversible GLM spend
  // must never be gated by a caller-supplied boolean.)
  const armed = isMureArmed() && opts.armed !== false;
  if (!armed) {
    const mlpFeedback = await recordMlpFeedbackStub(plan, { quotaPressure: opts.quotaPressure ?? 0.4 });
    return { name: plan.name, armed: false, dryRun: true, plan, swarm: null, nativeResults: { pool: {}, skipped: [] }, nativeSpecs: plan.nativeSpecs, held: plan.held, mlpFeedback };
  }

  let swarm = null;
  let nativeResults = { pool: {}, skipped: [] };

  // H2 FIX: Skip leaves already handled by the zai-tmux sidecar (prevent double-dispatch via headless glm-fleet)
  const skipLeafIds = new Set(opts.skipLeafIds || []);
  const glmLeavesToDispatch = skipLeafIds.size > 0
    ? plan.glmLeaves.filter((l) => !skipLeafIds.has(l.id))
    : plan.glmLeaves;

  // Dispatch GLM substrate through runSwarm (governed loop)
  if (glmLeavesToDispatch.length) {
    // MURE-armed → runSwarm armed (couple the arm state; do NOT rely on runSwarm's separate flag — native
    // red-team #4). We only reach here when `armed===true` (owner flag set). Propagate the resolved armed state
    // to ensure tests can force disarm even when fleet flags exist.
    swarm = await runSwarm({ leaves: glmLeavesToDispatch }, {
      rounds: Number(opts.rounds || 2), concurrency: Number(opts.concurrency || 3), armed,
    });
  }

  // Dispatch native substrate to the same runDir (unified blackboard)
  if (plan.nativeSpecs.length && swarm?.runDir) {
    nativeResults = await dispatchNative(plan.nativeSpecs, swarm.runDir);
  }

  const runPayload = { swarm, nativeResults };
  let mlpFeedback = null;
  if (opts.mlpFeedback !== false) {
    mlpFeedback = await runMlpFeedbackLoop(plan, runPayload, {
      dryRun: false,
      mlpLearn: opts.mlpLearn,
      quotaPressure: opts.quotaPressure ?? 0.4,
      ledgerFile: opts.ledgerFile,
      trainEpochs: opts.trainEpochs,
      predictionIds: opts.predictionIds,
    });
  }

  return { name: plan.name, armed: true, plan, swarm, nativeResults, nativeSpecs: plan.nativeSpecs, held: plan.held, mlpFeedback, zaiSidecarResults: opts.zaiSidecarResults || null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  let task = {};
  if (val('--task-file')) { try { task = JSON.parse(fs.readFileSync(val('--task-file'), 'utf8')); } catch (e) { process.stderr.write(`bad --task-file: ${e.message}\n`); process.exit(2); } }
  else if (val('--task')) { try { task = JSON.parse(val('--task')); } catch { /* */ } }
  const forceDry = argv.includes('--dry-run');
  const opts = forceDry ? { armed: false } : {};
  runCompany(task, opts).then((r) => {
    process.stdout.write(`${JSON.stringify({
      name: r.name, armed: r.armed, dryRun: !!r.dryRun, summary: r.plan.summary,
      held: r.held.map((h) => ({ subtask: h.subtaskId, role: h.role, reason: h.reason })),
      glmLeaves: r.plan.glmLeaves.map((l) => ({ id: l.id, role: l.role, lane: l.lane })),
      nativeSpecs: r.nativeSpecs.map((n) => ({ id: n.id, role: n.role, model: n.model })),
      nativeResults: {
        dispatched: Object.keys(r.nativeResults?.pool || {}).length,
        skipped: r.nativeResults?.skipped?.length || 0,
      },
      swarm: r.swarm ? { runId: r.swarm.runId, converged: r.swarm.converged, finalizeOk: r.swarm.finalizeOk } : null,
    }, null, 2)}\n`);
    process.exit(0);
  }).catch((e) => { process.stderr.write(`runCompany error: ${String(e?.message || e)}\n`); process.exit(1); });
}
