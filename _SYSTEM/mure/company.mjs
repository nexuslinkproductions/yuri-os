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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRoster, validateRoster, matchRolesByCapability, resolveLane, getRole, GLM_LANES, NATIVE_LANES } from './role-registry.mjs';
import { evaluateGovernance, CLASS } from './governance.mjs';
import { runSwarm } from '../Scripts/runSwarm.mjs';
import { extractResultLabel, validatePacket, defaultTimeoutMsForLane } from '../Scripts/glm-fleet.mjs';
import { spawnNativeLoop } from './native-spawn-loop.mjs';
import { runMlpFeedbackLoop, recordMlpFeedbackStub, recordMlpCounterfactualShadow, enrichRunResultWithSidecarPools } from '../Scripts/fleet-mlp-feedback.mjs';
import { loadHeldRulings, isSubtaskClearedByOwner } from './held-rulings.mjs';
import { isEvolverArmed } from './evolver-arm.mjs';
import { runGoalCycle } from './goal-engine.mjs';
import { calibrate as _calibrate } from './math-bridge.mjs';

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
/** P8.4 default lane-call budget (~16 leaves × 3 rounds). Override: task.budgetCap, YURI_MURE_BUDGET, or YURI_MURE_BUDGET_UNLIMITED=1 */
export const DEFAULT_MURE_BUDGET_CAP = 48;

/** Resolve cumulative runSwarm budgetCap — finite default unless owner opts out. */
export function resolveBudgetCap(opts = {}, task = {}) {
  if (opts.budgetCap === Infinity || task.budgetCap === Infinity) return Infinity;
  if (opts.budgetCap != null && Number.isFinite(Number(opts.budgetCap))) return Number(opts.budgetCap);
  if (task.budgetCap != null && Number.isFinite(Number(task.budgetCap))) return Number(task.budgetCap);
  const env = process.env.YURI_MURE_BUDGET;
  if (env === 'Infinity' || env === 'unlimited' || env === 'inf') return Infinity;
  if (env != null && env !== '') {
    const n = Number(env);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (process.env.YURI_MURE_BUDGET_UNLIMITED === '1') return Infinity;
  return DEFAULT_MURE_BUDGET_CAP;
}

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

/** Build a runSwarm/Agent prompt that frames the worker AS its role (+ optional fused co-roles). */
export function buildRolePrompt(role, subtask, coRoles = []) {
  const lines = [
    `You are the ${role.name} of ${MURE_NAME} — archetype: ${role.archetype}.`,
    `Mission: ${role.mission}.`,
    `Capabilities you bring: ${(role.capabilities || []).join(', ')}.`,
  ];
  for (const co of coRoles) {
    lines.push(
      '',
      `You ALSO carry the co-role of ${co.name} (${co.archetype}). Co-mission: ${co.mission}.`,
      `Additional capabilities: ${(co.capabilities || []).join(', ')}. Integrate both perspectives into ONE coherent deliverable — the co-role is a second hat, not a second report.`,
    );
  }
  lines.push(
    '',
    `TASK: ${subtask.prompt || subtask.summary || ''}`,
    '',
    'Work to local evidence; do not over-claim. End your output with an UPPERCASE RESULT_LABEL of the form NNXX_DESCRIPTION_(X|P|F)_PASS_COMMITTED.',
  );
  return lines.join('\n');
}

/** Build a runSwarm leaf (GLM substrate) for a role-cast subtask (+ optional fused co-roles). */
export function buildLeaf(role, subtask, target, coRoles = []) {
  const leaf = {
    id: subtask.id || role.id,
    lane: target.lane,
    reasoning: 'high',
    prompt: buildRolePrompt(role, subtask, coRoles),
    role: role.id,
    dispatch: target.dispatch || 'glm-lane',
    substrateHint: subtask.substrateHint || null,
    affinityApplied: target.affinityApplied || null,
  };
  if (coRoles.length) leaf.coRoles = coRoles.map((r) => r.id);
  if (subtask.tier) leaf.tier = subtask.tier;
  if (target.lane === 'minimax' || target.lane === 'flash' || target.lane === 'kimi') leaf.tier = target.lane;
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

/**
 * Intent-verb → roster capability-term map. Every RHS term is an EXACT capability string authored in
 * fleet-roles.json (84 unique terms) — this is what makes matchRolesByCapability cast the intended role
 * rather than silently collapsing to the engineer default (D-8). Keyed by the words an owner/job actually
 * writes ("research", "build", "audit", …); grouped by the role that owns the capability.
 * matchRolesByCapability does substring matching, so a phrase like "implement a parser" that contains
 * "implement" surfaces the engineer's implementation/code-generation caps. Order does not matter — the
 * matcher ranks by coverage. Keep the RHS terms verbatim from the roster; a typo here silently misroutes.
 */
export const NEED_KEYWORD_MAP = Object.freeze({
  // research / discovery → scout · ideator · synthesist · deliberator
  research: ['local-first-search', 'online-research', 'research-capture'],
  search: ['local-first-search', 'online-research'],
  investigate: ['local-first-search', 'online-research', 'mechanism-mapping'],
  explore: ['local-first-search', 'divergent-scan'],
  cite: ['citation', 'online-research'],
  ideate: ['hypothesis-generation', 'divergent-scan', 'remote-association'],
  brainstorm: ['hypothesis-generation', 'divergent-scan', 'novelty-scoring'],
  synthesize: ['lattice-synthesis', 'cross-domain-transfer', 'long-context-merge'],
  merge: ['long-context-merge', 'convergence-naming'],
  reason: ['deep-reasoning', 'mechanism-mapping', 'monotropic-depth'],
  analyze: ['deep-reasoning', 'mechanism-mapping'],
  analyse: ['deep-reasoning', 'mechanism-mapping'],
  // design / architecture → architect
  design: ['architecture-design', 'method-design', 'interface-contracts'],
  architecture: ['architecture-design', 'capability-composition'],
  architect: ['architecture-design', 'method-design'],
  spec: ['interface-contracts', 'method-design'],
  interface: ['interface-contracts'],
  compose: ['capability-composition'],
  // implement / build / code → engineer
  implement: ['implementation', 'code-generation', 'scoped-build'],
  build: ['code-generation', 'implementation', 'scoped-build'],
  code: ['code-generation', 'implementation'],
  develop: ['code-generation', 'implementation'],
  feature: ['implementation', 'scoped-build'],
  // refactor / wire / integrate → mechanic
  refactor: ['refactor', 'wiring', 'integration'],
  wire: ['wiring', 'integration'],
  integrate: ['integration', 'wiring'],
  integration: ['integration', 'wiring'],
  productize: ['productize', 'refactor'],
  // scaffold / mechanical / scan → artificer
  scaffold: ['scaffolding', 'mechanical-edit'],
  scan: ['census-scan', 'test-run'],
  census: ['census-scan'],
  // optimize / benchmark / perf → kernelsmith
  optimize: ['perf-optimization', 'hot-path-analysis'],
  optimise: ['perf-optimization', 'hot-path-analysis'],
  benchmark: ['benchmark', 'perf-optimization'],
  perf: ['perf-optimization', 'hot-path-analysis'],
  performance: ['perf-optimization', 'hot-path-analysis'],
  // test / verify / refute → oracle (test-execution) · adjudicator (adversarial)
  test: ['test-execution', 'acceptance-check', 'test-run'],
  verify: ['adversarial-verify', 'acceptance-check', 'test-execution'],
  validate: ['acceptance-check', 'test-execution'],
  refute: ['refutation', 'adversarial-verify', 'gap-detection'],
  redteam: ['adversarial-verify', 'failure-mode-naming', 'refutation'],
  critique: ['adversarial-verify', 'gap-detection'],
  // calibrate / honesty → calibrator
  calibrate: ['calibration', 'brier-scoring', 'honesty-audit'],
  // document / summarize → chronicler
  document: ['technical-writing', 'doc-generation'],
  documentation: ['technical-writing', 'doc-generation'],
  summarize: ['summary-distillation', 'technical-writing'],
  summarise: ['summary-distillation', 'technical-writing'],
  report: ['summary-distillation', 'result-labeling'],
  write: ['technical-writing', 'doc-generation'],
  // security / audit → sentinel
  security: ['security-review', 'vuln-redteam', 'protected-path-audit'],
  audit: ['safety-audit', 'security-review'],
  vuln: ['vuln-redteam', 'security-review'],
  vulnerability: ['vuln-redteam', 'security-review'],
  // governance / blast / contention → steward
  govern: ['governance-gate', 'doctrine-check'],
  governance: ['governance-gate', 'doctrine-check'],
  blast: ['blast-radius-calc', 'contention-check'],
  // budget / cost / quota → quartermaster
  budget: ['budget-cap', 'token-accounting', 'cost-governance'],
  cost: ['cost-governance', 'token-accounting'],
  token: ['token-accounting', 'quota-routing'],
  quota: ['quota-routing', 'token-accounting'],
  // curate / memory / archive → archivist
  curate: ['memory-curation', 'skill-library'],
  archive: ['memory-curation', 'lineage-tracking'],
  memory: ['memory-curation', 'skill-library'],
  // intake / decode / requirements → envoy
  intake: ['brain-dump-decode', 'requirement-spec', 'goal-tree'],
  decode: ['brain-dump-decode', 'intent-ranking'],
  requirement: ['requirement-spec', 'goal-tree'],
  requirements: ['requirement-spec', 'goal-tree'],
  // decompose / route / orchestrate → helmsman (owner-gated: held, but cast correctly)
  decompose: ['task-decomposition', 'dispatch-planning'],
  orchestrate: ['dispatch-planning', 'capability-routing'],
  route: ['capability-routing', 'dispatch-planning'],
  // improve / evolve → evolver (owner-gated)
  improve: ['improvement-proposal', 'evolutionary-search'],
  evolve: ['evolutionary-search', 'process-mutation'],
});

/**
 * Map free text (job title + detail + type) to a set of roster capability terms so castRole can pick the
 * right role instead of collapsing every job to `engineer` (D-8 — the live nexus-company path passed no
 * `need`). Tokenizes on non-word chars, matches each token against NEED_KEYWORD_MAP (keys are intent verbs
 * / nouns). Returns a de-duplicated array of exact roster capability strings, or [] when nothing matches.
 * @param {string} text  free text describing the work
 * @returns {string[]}   roster capability terms (subset of the 84), de-duplicated, order-stable
 */
export function deriveNeeds(text) {
  const s = String(text || '').toLowerCase();
  if (!s.trim()) return [];
  const tokens = s.split(/[^a-z0-9-]+/).filter(Boolean);
  const seenTokens = new Set(tokens);
  const out = [];
  const pushed = new Set();
  // Deterministic: iterate the token stream in order, then the map keys as substrings of the whole text so
  // multi-word intents ("brain dump", "hot path") still surface even if the exact key wasn't a bare token.
  const add = (caps) => { for (const c of caps) { if (!pushed.has(c)) { pushed.add(c); out.push(c); } } };
  for (const [key, caps] of Object.entries(NEED_KEYWORD_MAP)) {
    if (seenTokens.has(key) || s.includes(key)) add(caps);
  }
  return out;
}

/** Cast a single subtask to its best-matching role + resolved dispatch target + governance ruling. */
export function castRole(roster, subtask, opts = {}) {
  const need = Array.isArray(subtask.need) ? subtask.need : [];
  let role = null;
  let matched = false;
  if (subtask.role) { role = getRole(roster, subtask.role); if (role) matched = true; } // explicit role override
  if (!role && need.length) { role = matchRolesByCapability(roster, need)[0]?.role || null; if (role) matched = true; }
  // Multi-role fusion (owner feature 2026-07-02): one lane may carry CO-ROLES to raise capability
  // density — opt-in via opts.maxCoRoles (>1). Guardrails, all hard: a verification-group critic never
  // fuses (charter independence — a producer+critic lane is the echo chamber independentOf forbids);
  // any independentOf pair (either direction) never fuses; an owner-gated role never rides as a co-hat
  // (its autonomy floor would force-hold the whole fused leaf).
  const coRoles = [];
  const maxCo = Number(opts.maxCoRoles) > 1 ? Math.floor(Number(opts.maxCoRoles)) : 1;
  if (maxCo > 1 && role && matched && !subtask.role && need.length) {
    for (const m of matchRolesByCapability(roster, need)) {
      if (coRoles.length >= maxCo - 1) break;
      const cand = m?.role;
      if (!cand || cand.id === role.id || coRoles.some((c) => c.id === cand.id)) continue;
      if (cand.group === 'verification') continue;
      if (cand.autonomyClass === 'owner-gated') continue;
      const indep = new Set([...(cand.independentOf || []), ...(role.independentOf || [])]);
      if (indep.has(role.id) || indep.has(cand.id)) continue;
      coRoles.push(cand);
    }
  }
  if (!role) {
    role = getRole(roster, 'engineer');                                // default executor
    // D-8: make the silent collapse visible. A subtask that reached the default (no explicit role, no
    // capability match) is logged ONCE so a 20-role company that runs as a 1-role company is auditable.
    if (!opts.quiet) {
      process.stderr.write(`[MURE castRole WARN] subtask '${subtask.id || subtask.prompt?.slice(0, 32) || '?'}' matched no role (need=[${need.join(',')}]) → defaulted to 'engineer'\n`);
    }
  }
  // D-12: only FORCE a substrate when the subtask/opts explicitly ask for one. Otherwise pass no preference
  // so resolveLane honors the role's DECLARED lane tier (either-roles no longer blanket-collapse to glm).
  const forcedPrefer = (subtask.substrateHint === 'native' || subtask.substrateHint === 'cursor')
    ? 'native'
    : (opts.preferSubstrate || null);
  let target = resolveLane(role, forcedPrefer ? { preferSubstrate: forcedPrefer } : {});
  target = applySubstrateHint(subtask, target);
  target = applyAffinityMatrix(role, target, { forceSubstrateHint: !!subtask.substrateHint });
  const ruling = decisionFor(subtask, role);
  return {
    subtaskId: subtask.id, role: role.id, roleName: role.name, group: role.group, target, ruling, matched,
    substrateHint: subtask.substrateHint || null,
    coRoles: coRoles.map((r) => r.id), coRoleNames: coRoles.map((r) => r.name),
  };
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
    const coRoles = (c.coRoles || []).map((id) => getRole(roster, id)).filter(Boolean);
    if (c.ruling.class === CLASS.OWNER) {
      if (isSubtaskClearedByOwner(subtask.id, subtask, rulings)) {
        clearedHeld.push({ ...c, reason: c.ruling.ruling, clearedBy: rulings.source });
        if (c.target.dispatch === 'glm-lane' || c.target.dispatch === 'zai-tmux') glmLeaves.push(buildLeaf(role, subtask, c.target, coRoles));
        else if (c.target.dispatch === 'agent') nativeSpecs.push({ id: subtask.id || role.id, role: role.id, coRoles: c.coRoles || [], model: c.target.model, prompt: buildRolePrompt(role, subtask, coRoles) });
        else inlineSpecs.push({ id: subtask.id || role.id, role: role.id, prompt: buildRolePrompt(role, subtask, coRoles) });
      } else {
        held.push({ ...c, reason: c.ruling.ruling });
      }
      continue;
    }
    if (c.target.dispatch === 'glm-lane' || c.target.dispatch === 'zai-tmux') glmLeaves.push(buildLeaf(role, subtask, c.target, coRoles));
    else if (c.target.dispatch === 'agent') nativeSpecs.push({ id: subtask.id || role.id, role: role.id, coRoles: c.coRoles || [], model: c.target.model, prompt: buildRolePrompt(role, subtask, coRoles) });
    else inlineSpecs.push({ id: subtask.id || role.id, role: role.id, prompt: buildRolePrompt(role, subtask, coRoles) });
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
        leaf.routerRanked = suggestion.ranked;
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
        spec.routerRanked = suggestion.ranked;
      }
      plan.mlpCounterfactualShadow = recordMlpCounterfactualShadow(plan, ctx);
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

  // D-14: independentOf runtime teeth (FLAG-ONLY this wave — no re-casting). A critic role declares
  // independentOf:[producerId,…]; if the critic AND a producer it must stay independent of are BOTH cast in
  // this plan and resolve to the SAME lane (same substrate+lane), the structural-independence guarantee is
  // broken (an echo chamber). We surface it; runCompany logs a WARN. Re-casting is a future wave.
  const laneKey = (c) => `${c.target?.substrate || '?'}:${c.target?.lane || '?'}`;
  const castByRole = new Map();
  for (const c of casts) { if (!castByRole.has(c.role)) castByRole.set(c.role, []); castByRole.get(c.role).push(c); }
  const independenceViolations = [];
  for (const critic of casts) {
    const criticRole = getRole(roster, critic.role);
    const indep = Array.isArray(criticRole?.independentOf) ? criticRole.independentOf : [];
    if (!indep.length) continue;
    for (const producerId of indep) {
      const producerCasts = castByRole.get(producerId) || [];
      for (const producer of producerCasts) {
        if (laneKey(critic) === laneKey(producer)) {
          independenceViolations.push({
            critic: critic.role, criticSubtask: critic.subtaskId,
            producer: producer.role, producerSubtask: producer.subtaskId,
            lane: laneKey(critic),
            reason: `role '${critic.role}' declares independentOf '${producer.role}' but both resolved to lane ${laneKey(critic)}`,
          });
        }
      }
    }
  }

  return { name: MURE_NAME, valid: validation.ok, roleCount: validation.roleCount, casts, glmLeaves, nativeSpecs, inlineSpecs, held, clearedHeld, summary, independenceViolations, ollamaSidecar, clineSidecar, zaiSidecar, heldRulingsSource: rulings.source };
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
 * Execute inline specs (D-9) — the 5 LOCAL-CODE roles that need NO LLM call: steward (governance summary),
 * oracle (scoped `node --test`), calibrator (Brier/calibration read), archivist (work-ledger ingest),
 * quartermaster (token/budget snapshot). Each writes a substrate-agnostic packet into the SAME runDir schema
 * so the blackboard / convergence sees it (packet.role is a UNIQUE 'inline:<role>:<id>' key to avoid colliding
 * with glm-leaf / native packets keyed by role). EVERY branch is fail-open: a broken organ yields an honest
 * 'skipped'/'error' packet, never throws.
 *
 * @param {Array<{id,role,prompt}>} inlineSpecs  specs from planCompany
 * @param {object} ctx  { runDir, plan, swarm, testFiles?, ledgerFile? }
 * @returns {Promise<{ pool:{[key:string]:{label,text,status}}, packets:Array, skipped:Array }>}
 */
export async function runInlineSpecs(inlineSpecs = [], ctx = {}) {
  const pool = {}; const packets = []; const skipped = [];
  const runDir = ctx.runDir || '';
  if (!Array.isArray(inlineSpecs) || inlineSpecs.length === 0) {
    return { pool, packets, skipped: [{ file: '(none)', error: 'no inline specs' }] };
  }
  const runIdFromDir = runDir ? path.basename(path.dirname(runDir)) : (ctx.runId || 'inline');

  const writePacket = (role, id, { status, text, resultLabel = '', evidence = '' }) => {
    const key = `inline:${role}:${id}`;
    const packet = {
      laneId: `inline:${role}`, role: key, task: id, resultLabel: resultLabel || extractResultLabel(text) || '',
      evidence, status, text, durationMs: 0, runId: runIdFromDir, traceId: 'inline-executor', spanId: id,
    };
    packets.push(packet);
    if (runDir && fs.existsSync(runDir) && validatePacket(packet)) {
      try {
        fs.mkdirSync(runDir, { recursive: true });
        fs.writeFileSync(path.join(runDir, `inline-${role}-${id}.json`), JSON.stringify(packet, null, 2));
      } catch (e) { skipped.push({ file: `inline-${role}-${id}.json`, error: String(e?.message || e) }); }
    }
    pool[key] = { label: packet.resultLabel, text: packet.text, status: packet.status };
  };

  for (const spec of inlineSpecs) {
    const role = spec.role || 'inline';
    const id = spec.id || role;
    try {
      if (role === 'steward') {
        // Governance summary over the plan's rulings (the 6-gate charter, already computed at cast time).
        const casts = Array.isArray(ctx.plan?.casts) ? ctx.plan.casts : [];
        const self = casts.filter((c) => c.ruling?.class === CLASS.SELF).length;
        const owner = casts.filter((c) => c.ruling?.class === CLASS.OWNER).length;
        const heldN = Array.isArray(ctx.plan?.held) ? ctx.plan.held.length : 0;
        const text = `[STEWARD governance summary] casts=${casts.length} self-governable=${self} owner-gated=${owner} held=${heldN}. 6-gate charter applied deterministically at cast time.`;
        writePacket(role, id, { status: 'ok', text, resultLabel: `06MU_STEWARD_GOV_SUMMARY_X_PASS_COMMITTED`, evidence: `self=${self} owner=${owner} held=${heldN}` });
      } else if (role === 'oracle') {
        const res = await runOracleTests(ctx.testFiles);
        writePacket(role, id, {
          status: res.ran ? (res.ok ? 'ok' : 'fail') : 'skipped',
          text: `[ORACLE test run] ${res.summary}`,
          resultLabel: `06MU_ORACLE_TEST_${res.ok ? 'X' : 'F'}_PASS_COMMITTED`,
          evidence: res.evidence || '',
        });
      } else if (role === 'calibrator') {
        let report = null; let err = null;
        try { report = await _calibrate({}); } catch (e) { err = String(e?.message || e); }
        const brier = report && report.meanBrier != null ? report.meanBrier : null;
        writePacket(role, id, {
          status: err ? 'skipped' : 'ok',
          text: err ? `[CALIBRATOR] calibration unavailable: ${err}` : `[CALIBRATOR] meanBrier=${brier ?? 'n/a'} ${report?.error ? `(${report.error})` : ''}`,
          resultLabel: `06MU_CALIBRATOR_REPORT_X_PASS_COMMITTED`,
          evidence: brier != null ? `meanBrier=${brier}` : '',
        });
      } else if (role === 'archivist') {
        const res = await runArchivistIngest();
        writePacket(role, id, {
          status: res.ok ? 'ok' : 'skipped',
          text: `[ARCHIVIST ledger ingest] ${res.summary}`,
          resultLabel: `06MU_ARCHIVIST_INGEST_X_PASS_COMMITTED`,
          evidence: res.evidence || '',
        });
      } else if (role === 'quartermaster') {
        const res = await runQuartermasterSnapshot();
        writePacket(role, id, {
          status: res.ok ? 'ok' : 'skipped',
          text: `[QUARTERMASTER budget snapshot] ${res.summary}`,
          resultLabel: `06MU_QUARTERMASTER_BUDGET_X_PASS_COMMITTED`,
          evidence: res.evidence || '',
        });
      } else {
        // Unknown inline role — honest skip, never a stub masquerading as success.
        writePacket(role, id, { status: 'skipped', text: `[INLINE ${role}] no local-code executor wired for this role`, resultLabel: '' });
      }
    } catch (e) {
      // fail-open: even an unexpected throw becomes a packet, never a crash of the whole run.
      writePacket(role, id, { status: 'error', text: `[INLINE ${role}] executor error: ${String(e?.message || e)}`, resultLabel: '' });
    }
  }
  return { pool, packets, skipped };
}

/** oracle: run a scoped `node --test` over named files (default: the mure suite). Fail-open, bounded. */
async function runOracleTests(testFiles) {
  try {
    const { execFileSync } = await import('node:child_process');
    const files = Array.isArray(testFiles) && testFiles.length
      ? testFiles
      : [path.join(REPO_ROOT, '_SYSTEM', 'mure')].map((d) => `${d}/*.test.mjs`);
    // Guard against arming a huge run inside a dispatch: only run when explicitly given files, else report the
    // default target WITHOUT executing (running the whole mure suite inside a company run would be recursive).
    if (!Array.isArray(testFiles) || !testFiles.length) {
      return { ran: false, ok: true, summary: 'default target is the mure suite; not auto-run inside a company dispatch (pass ctx.testFiles to execute)', evidence: 'target=_SYSTEM/mure/*.test.mjs' };
    }
    let out = ''; let ok = true;
    try {
      out = execFileSync(process.execPath, ['--test', ...files], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { ok = false; out = String(e?.stdout || e?.message || e); }
    const passM = out.match(/# pass (\d+)/) || out.match(/pass (\d+)/);
    const failM = out.match(/# fail (\d+)/) || out.match(/fail (\d+)/);
    const pass = passM ? passM[1] : '?'; const fail = failM ? failM[1] : '?';
    return { ran: true, ok: ok && (fail === '0' || fail === '?'), summary: `pass=${pass} fail=${fail}`, evidence: `files=${files.length}` };
  } catch (e) {
    return { ran: false, ok: false, summary: `oracle unavailable: ${String(e?.message || e)}` };
  }
}

/** archivist: lazy-import work-ledger (another lane may be editing it) and ingest. Graceful skip on absence. */
async function runArchivistIngest() {
  try {
    const mod = await import('../Scripts/work-ledger.mjs').catch(() => null);
    if (!mod || typeof mod.openLedger !== 'function' || typeof mod.ingestAll !== 'function') {
      return { ok: false, summary: 'work-ledger.mjs unavailable (openLedger/ingestAll not exported) — skipped' };
    }
    const db = mod.openLedger();
    const res = mod.ingestAll(db);
    const runs = res?.runs?.length ?? res?.runs ?? 0;
    const arts = res?.artifacts?.length ?? res?.artifacts ?? 0;
    return { ok: true, summary: `ingested runs=${JSON.stringify(runs)} artifacts=${JSON.stringify(arts)}`, evidence: `pruned=${JSON.stringify(res?.pruned ?? 0)}` };
  } catch (e) {
    return { ok: false, summary: `ledger ingest skipped: ${String(e?.message || e)}` };
  }
}

/** quartermaster: token/budget snapshot from token-ledger if present, else an honest 'no budget source' note. */
async function runQuartermasterSnapshot() {
  try {
    const mod = await import('../Scripts/token-ledger.mjs').catch(() => null);
    if (!mod || typeof mod.getRollups !== 'function') {
      return { ok: false, summary: 'no budget source wired (token-ledger getRollups unavailable) — snapshot skipped' };
    }
    let rollups = null;
    try { rollups = mod.getRollups({}); } catch (e) { return { ok: false, summary: `token-ledger read failed: ${String(e?.message || e)}` }; }
    const n = Array.isArray(rollups) ? rollups.length : (rollups && typeof rollups === 'object' ? Object.keys(rollups).length : 0);
    return { ok: true, summary: `token-ledger rollups=${n} groups`, evidence: 'source=token-ledger.getRollups' };
  } catch (e) {
    return { ok: false, summary: `budget snapshot skipped: ${String(e?.message || e)}` };
  }
}

/**
 * Goal-engine LIVE seam (D-14, owner-approved). After dispatch + aggregation, run ONE goal cycle per
 * PARTICIPATING role, scoped to the run outcome (PROPOSE→SCORE→GATE, exactly as goal-engine implements).
 * The constitution hard-stop preFilter is absolute (protected-path / arming / outward / scope / gate-self-mod
 * are DISCARDED before scoring). Self-governable proposals are `selected`; owner-gated ones are `held` and
 * routed to the held-rulings FLOW: we surface them as `heldProposals` keyed the same way loadHeldRulings
 * consumes (subtaskId + approved:false pending), pointing at the current rulings source so an owner can
 * ratify later. We do NOT write held-rulings.json (that's the owner's governed pipeline; held-rulings.mjs
 * exposes no writer, by design).
 *
 * @param {object} plan  the plan from planCompany
 * @param {object} task  the original task (context tags / goal spine)
 * @param {object} runPayload  { swarm, nativeResults, inlineResults }
 * @returns {{ran, roles, cycles, selected, held, heldProposals, heldRulingsSource}}
 */
export function runGoalCycles(plan, task = {}, runPayload = {}) {
  const roster = _roster || loadRoster();
  const context = { tags: Array.isArray(task.tags) ? task.tags : [], goalSpine: task.summary || '' };
  // PARTICIPATING roles = every role actually cast into a dispatched/inline lane (not held-only, not owner-held).
  const dispatched = new Set([
    ...plan.glmLeaves.map((l) => l.role),
    ...plan.nativeSpecs.map((s) => s.role),
    ...plan.inlineSpecs.map((s) => s.role),
    ...plan.clearedHeld.map((c) => c.role),
  ]);
  const swarmOk = !!runPayload?.swarm?.converged;
  const cycles = []; const selected = []; const held = []; const heldProposals = [];
  const heldRulingsSource = plan.heldRulingsSource || null;

  for (const roleId of dispatched) {
    const role = getRole(roster, roleId);
    if (!role) continue;
    // PROPOSE: one outcome-scoped refinement candidate per participating role. Scope is pinned to the role's
    // FIRST declared goalScope (so scope-lock passes); tags inherit the task so intent-drift can't false-fire.
    const scope = Array.isArray(role.goalScope) && role.goalScope.length ? role.goalScope[0] : undefined;
    const candidate = {
      id: `goal:${roleId}`,
      role: roleId,
      summary: `${role.name}: refine the '${roleId}' outcome of this run`,
      scope,
      tags: context.tags,
      capabilityFit: swarmOk ? 0.85 : 0.6,
      reversible: true,
      blastRadius: 'LOW',
      evidenceDecidable: true,
      inDoctrine: true,
      outwardFacing: false,
      contended: false,
      arming: false,
    };
    const cyc = runGoalCycle([candidate], context, role, {});
    cycles.push({ role: roleId, halted: cyc.halted, selected: cyc.selected.length, held: cyc.held.length, parked: cyc.parked.length, discarded: cyc.discarded.length });
    for (const s of cyc.selected) selected.push({ role: roleId, goalId: s.goal.id, composite: s.score.composite });
    for (const h of cyc.held) {
      held.push({ role: roleId, goalId: h.goal.id, composite: h.score.composite, ruling: h.ruling?.ruling || '' });
      // route into the held-rulings flow: a PENDING proposal (approved:false) in the shape loadHeldRulings reads.
      heldProposals.push({ subtaskId: h.goal.id, role: roleId, approved: false, reason: h.ruling?.ruling || 'owner-gated goal', source: 'goal-engine' });
    }
  }
  return { ran: true, roles: [...dispatched], cycles, selected, held, heldProposals, heldRulingsSource };
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
  // D-14 independence teeth (flag-only): surface producer/critic same-lane collisions on EVERY run.
  if (Array.isArray(plan.independenceViolations) && plan.independenceViolations.length && !opts.quiet) {
    for (const v of plan.independenceViolations) process.stderr.write(`[MURE independence WARN] ${v.reason}\n`);
  }
  if (!armed) {
    const mlpFeedback = await recordMlpFeedbackStub(plan, { quotaPressure: opts.quotaPressure ?? 0.4 });
    // DISARMED-degrades: goal-engine is skipped with an explicit note (never silently absent).
    const goalCycle = { ran: false, skipped: true, reason: 'MURE disarmed — goal-engine skipped (arm via YURI_MURE_ARMED or _SYSTEM/state/mure.enabled)' };
    return { name: plan.name, armed: false, dryRun: true, plan, swarm: null, nativeResults: { pool: {}, skipped: [] }, inlineResults: { pool: {}, packets: [], skipped: [] }, nativeSpecs: plan.nativeSpecs, held: plan.held, mlpFeedback, goalCycle, independenceViolations: plan.independenceViolations || [] };
  }

  let swarm = null;
  let nativeResults = { pool: {}, skipped: [] };
  let inlineResults = { pool: {}, packets: [], skipped: [] };

  // H2 FIX: Skip leaves already handled by the zai-tmux sidecar (prevent double-dispatch via headless glm-fleet)
  const skipLeafIds = new Set(opts.skipLeafIds || []);
  const glmLeavesToDispatch = skipLeafIds.size > 0
    ? plan.glmLeaves.filter((l) => !skipLeafIds.has(l.id))
    : plan.glmLeaves;

  const budgetCap = resolveBudgetCap(opts, task);

  // Dispatch GLM substrate through runSwarm (governed loop)
  if (glmLeavesToDispatch.length) {
    // MURE-armed → runSwarm armed (couple the arm state; do NOT rely on runSwarm's separate flag — native
    // red-team #4). We only reach here when `armed===true` (owner flag set). Propagate the resolved armed state
    // to ensure tests can force disarm even when fleet flags exist.
    swarm = await runSwarm({ leaves: glmLeavesToDispatch }, {
      rounds: Number(opts.rounds || 2), concurrency: Number(opts.concurrency || 3), armed,
      budgetCap,
      quotaPressure: opts.quotaPressure ?? 0.4,
    });
  }

  // Dispatch native substrate to the same runDir (unified blackboard)
  if (plan.nativeSpecs.length && swarm?.runDir) {
    nativeResults = await dispatchNative(plan.nativeSpecs, swarm.runDir);
  }

  // Execute inline specs (D-9) into the same runDir so the blackboard/convergence sees the local-code roles.
  if (plan.inlineSpecs.length) {
    inlineResults = await runInlineSpecs(plan.inlineSpecs, {
      runDir: swarm?.runDir || '', plan, swarm, testFiles: opts.testFiles, ledgerFile: opts.ledgerFile,
    });
  }

  const runPayload = enrichRunResultWithSidecarPools({
    swarm,
    nativeResults,
    inlineResults,
    ollamaSidecarResults: opts.ollamaSidecarResults || null,
    zaiSidecarResults: opts.zaiSidecarResults || null,
  });

  // P9 shadow: counterfactual log at apply time (plan-time shadow already in planCompany).
  try {
    runPayload.mlpCounterfactualShadow = recordMlpCounterfactualShadow(plan, { quotaPressure: opts.quotaPressure ?? 0.4 });
  } catch { /* advisory */ }

  // Goal-engine LIVE (D-14): one PROPOSE→SCORE→GATE cycle per participating role, scoped to the run outcome.
  let goalCycle = { ran: false, skipped: true, reason: 'no participating roles' };
  if (opts.goalCycle !== false) {
    try { goalCycle = runGoalCycles(plan, task, runPayload); }
    catch (e) { goalCycle = { ran: false, error: String(e?.message || e) }; }
  }
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

  return { name: plan.name, armed: true, plan, swarm, nativeResults, inlineResults, nativeSpecs: plan.nativeSpecs, held: plan.held, mlpFeedback, goalCycle, independenceViolations: plan.independenceViolations || [], zaiSidecarResults: opts.zaiSidecarResults || null, ollamaSidecarResults: opts.ollamaSidecarResults || null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
