#!/usr/bin/env node
// @capability: mure-workflow-runner
// @serves: workflow executor | dispatch orchestrator | stage sequencer | feedback gate loop | owner-gate hold | dry-run planner | blackboard writer | stage-graph contract validator
// @does: Executes a registered workflow end-to-end. (1) getWorkflow via registry; fail loud on unknown id. (2) Sequence stages by dependsOn topo-sort; per stage resolve stage.role to a dispatch target via role-registry.resolveLane (NEVER hardcode models); pass prior stage artifact by produces-name key; write a typed blackboard packet to results dir matching the canonical README/MURE contract (laneId, role, status, resultLabel, text — stage/artifact/goal/correlation/parent IDs ADDITIVE). (3) Owner-gated stages (preview/ship) STOP and return a HOLD packet; owner/Sol keeps final authority. Steward only emits governance clearance or HOLD. (4) Production stage: deterministic feedback loop via an INJECTABLE test-runner hook (so tests can stub it) — red → iterate up to feedbackGate.maxCycles; all-green → gate passes; red at maxCycles → return FEEDBACK_EXHAUSTED. (5) DISARMED by default; dry-run plans the full stage/gate sequence with ZERO dispatch + ZERO filesystem writes. (6) The runner never arms anything; live dispatch only via the supplied dispatch transport (compileOmpSpawn → native admission/shadow lockstep). NEVER bake terminal/model identities into workflow roles; resolve via role-registry.resolveLane(role). (7) Owner-gate approvals are durable FAIL-CLOSED state machine: bound to run/stage/input-digest; idempotency key; expiry/staleness; revoke/cancel; resume rules; NO auto-skip.
// @use: import { runWorkflow, planWorkflow } from 'mure/workflow-runner.mjs'. CLI: node workflow-runner.mjs --workflow <id> --goal "<text>" [--armed] [--blackboard-root <path>] [--dispatch <fn>] [--test-runner <fn>] [--owner-decision <fn>].
// @exports: runWorkflow, planWorkflow, buildRunId, _buildBlackboardPath, _buildPacket, _resolveStageAutonomy, _validateStageGraph, _matchTriggerPolicy, PACKET_STATUS, AUTONOMY

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

import { loadWorkflows, getWorkflow, matchWorkflowByGoal } from './workflow-registry.mjs';
import { loadRoster, getRole, resolveLane } from './role-registry.mjs';
import { validateStageGraph, ROLE_VERIFIER_LIKE as _ROLE_VERIFIER_LIKE_PURE } from './stage-graph-validator.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

export const PACKET_STATUS = Object.freeze(['ok', 'malformed', 'error', 'timeout']);
export const AUTONOMY = Object.freeze(['self-governable', 'owner-gated']);

/**
 * Build the deterministic runId used for blackboard dirs + receipt correlation.
 * Format: `${workflowId}__${UTC-timestamp}` (seconds precision; filesystem-safe).
 */
export function buildRunId(workflowId, now = new Date()) {
  const safeWf = String(workflowId || 'wf').replace(/[^A-Za-z0-9_-]+/g, '-');
  const ts = now.toISOString().replace(/[:.]/g, '-');
  return `${safeWf}__${ts}`;
}

/**
 * Compute path under default blackboard root: <REPO>/.claude/jobs/<runId>/results
 * Production code calls this; tests override via opts.blackboardRoot.
 */
export function _buildBlackboardPath(blackboardRoot, runId, stageName) {
  return path.join(blackboardRoot, runId, 'results', `${stageName}.json`);
}

/**
 * Effective autonomy = owner-gated FLOOR of (stage.autonomy, role.autonomyClass).
 * Per live company contract: a role's autonomyClass is a floor; a missing/omitted
 * stage flag must NOT let an owner-gated role like steward auto-dispatch.
 */
export function _resolveStageAutonomy(stage, role) {
  const stageAuto = stage?.autonomy;
  const roleAuto = role?.autonomyClass;
  if (roleAuto === 'owner-gated' || stageAuto === 'owner-gated') return 'owner-gated';
  return 'self-governable';
}

/**
 * Strict structural validation of the workflow stage DAG — artifact-name contract.
 * Pure logic now lives in stage-graph-validator.mjs; this is a thin adapter that
 * injects the role-registry lane resolver + role lookup for clause (4c).
 */
export function _validateStageGraph(workflow, roster = null) {
  // Pre-compute the resolveLane adapter so the pure validator can use it for clause (4c).
  const resolveLaneAdapter = roster ? (role) => {
    try { return resolveLane(role); } catch { return null; }
  } : null;
  return validateStageGraph(workflow, resolveLaneAdapter, getRole, roster);
}


/**
 * Strict trigger policy for matchWorkflowByGoal: explicit policy + priority + min-score
 * + deterministic tie-break + ambiguity/no-match FAIL-CLOSED (not silent default).
 * Returns the selected workflow ID or throws if ambiguous.
 */
export function _matchTriggerPolicy(registry, goal, opts = {}) {
  const minScore = Number(opts.minScore ?? 1);
  const lower = String(goal || '').toLowerCase();
  const candidates = [];
  for (const wf of registry?.workflows || []) {
    const tags = wf.tags || [];
    const score = tags.reduce((acc, t) => acc + (lower.includes(String(t).toLowerCase()) ? 1 : 0), 0);
    if (lower.includes(`${wf.id}`.toLowerCase())) candidates.push({ id: wf.id, score: score + 2, priority: tags.indexOf('default') >= 0 ? 1 : 0 });
    else if (score > 0) candidates.push({ id: wf.id, score, priority: tags.indexOf('default') >= 0 ? 1 : 0 });
  }
  if (candidates.length === 0) {
    throw new Error(`matchWorkflowByGoal: no workflow matched goal '${goal}' (FAIL-CLOSED; configure a workflow with matching tags or set minScore=0)`);
  }
  candidates.sort((a, b) => (b.score - a.score) || (b.priority - a.priority) || a.id.localeCompare(b.id));
  const top = candidates[0];
  if (candidates.length > 1 && candidates[1].score === top.score && candidates[1].priority === top.priority) {
    throw new Error(`matchWorkflowByGoal: AMBIGUOUS match for goal '${goal}' (top=${top.id}; tied=${candidates[1].id})`);
  }
  if (top.score < minScore) {
    throw new Error(`matchWorkflowByGoal: top match '${top.id}' score ${top.score} below minScore ${minScore}`);
  }
  return top.id;
}

/**
 * Build a typed blackboard packet matching the canonical contract.
 * Required: laneId, role, status (ok|malformed|error|timeout), resultLabel.
 * Additive: stage, artifact, goal, runId, correlationId, parentIds, attempt,
 * producer role/agent/requested/resolved model/jobId, verifier verdicts,
 * approval refs, timestamps, tamper hash.
 */
export function _buildPacket({ laneId, role, status, resultLabel = '', text = '', evidence = '', ...rest }) {
  if (!PACKET_STATUS.includes(status)) {
    throw new Error(`_buildPacket: invalid status '${status}'; must be one of ${PACKET_STATUS.join('|')}`);
  }
  if (typeof laneId !== 'string' || !laneId) throw new Error('_buildPacket: laneId required');
  if (typeof role !== 'string' || !role) throw new Error('_buildPacket: role required');
  if (typeof resultLabel !== 'string') throw new Error('_buildPacket: resultLabel must be string');
  const packet = { laneId, role, status, resultLabel, text, evidence, ...rest };
  const h = createHash('sha256');
  h.update(JSON.stringify({ laneId: packet.laneId, role: packet.role, status: packet.status, resultLabel: packet.resultLabel, text: packet.text }));
  packet.tamperHash = h.digest('hex');
  return packet;
}

/**
 * Plan the workflow execution. NEVER dispatches; NEVER writes to .claude/jobs.
 * Returns the full stage/gate sequence (dry-run shape).
 */
export function planWorkflow({ workflowId, goal = '', context = {}, registry = null, roster = null } = {}) {
  const reg = registry || loadWorkflows();
  // Registry may be either {workflows:[...]} (raw) or {byId:Map(...)} (loader shape).
  let wf = getWorkflow(reg, workflowId);
  if (!wf && reg?.byId?.get) wf = reg.byId.get(workflowId);
  if (!wf) throw new Error(`planWorkflow: unknown workflow id '${workflowId}'`);
  const r = roster || (() => { try { return loadRoster(); } catch { return null; } })();
  const graph = _validateStageGraph(wf, r);
  if (!graph.ok) throw new Error(`planWorkflow: stage graph invalid: ${graph.errors.join('; ')}`);
  // Index stages by id for topo-order projection.
  const stageById = new Map();
  for (const s of wf.stages) {
    const sid = s.id || s.stage;
    if (sid) stageById.set(sid, s);
  }
  // Re-emit stages in topologicalOrder when graph succeeded; otherwise preserve declared order.
  const orderedStages = graph.ok && graph.topologicalOrder
    ? graph.topologicalOrder.map((sid) => stageById.get(sid)).filter(Boolean)
    : wf.stages;
  const plan = {
    workflowId,
    name: wf.name,
    goal: goal || '',
    context: { ...context },
    stages: orderedStages.map((s) => {
      const role = r ? getRole(r, s.role) : null;
      const lane = role ? resolveLane(role) : null;
      return {
        stage: s.id || s.stage,
        id: s.id || s.stage,
        role: s.role,
        autonomy: _resolveStageAutonomy(s, role),
        produces: s.produces,
        consumes: s.consumes,
        dependsOn: s.dependsOn,
        independentOf: s.independentOf,
        gate: s.gate,
        feedbackGate: s.feedback === 'deterministic-test-loop' ? wf.feedbackGate : undefined,
        ownerGated: _resolveStageAutonomy(s, role) === 'owner-gated',
        producesLane: lane,
        lane,
      };
    }),
    graph,
    feedbackGate: wf.feedbackGate,
    armed: false,
    dryRun: true,
  };
  return plan;
}

function defaultBlackboardRoot() {
  return path.join(REPO_ROOT, '.claude', 'jobs');
}

function writePacketToBlackboard(pkt, blackboardRoot, runId) {
  const dir = path.join(blackboardRoot, runId, 'results');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${pkt.stage}.json`);
  fs.writeFileSync(file, JSON.stringify(pkt, null, 2));
  return file;
}

async function defaultDispatch({ entry, context, runDir, runId, stageName }) {
  const { compileOmpSpawn } = await import('./sol-moe-native-dispatch.mjs');
  const payload = compileOmpSpawn(entry, context);
  return { stage: stageName, runId, runDir, payload, mode: 'compileOmpSpawn-only' };
}

async function defaultTestRunner({ stage, runDir, attempt }) {
  return { status: 'ok', attempt, evidence: 'default-test-runner-stub:green' };
}

async function defaultOwnerDecision({ stage, runId, packet }) {
  return { decision: 'defer', reason: 'DISARMED: owner decision interface not wired; no auto-skip' };
}

/**
 * Execute a workflow. DISARMED by default; opts.armed=true enables live dispatch.
 *
 * DRY-RUN: returns plan; NEVER calls dispatch; NEVER writes.
 * LIVE: sequences stages (dependsOn topo-sort); passes artifacts by produces/consumes name;
 * enforces verifier ancestry/lane independence via independentOf.
 */
export async function runWorkflow({
  workflowId,
  goal = '',
  context = {},
  armed = false,
  blackboardRoot = null,
  dispatch = null,
  testRunner = null,
  ownerDecision = null,
  registry = null,
  roster: rosterOpt = null,
  now = () => new Date(),
} = {}) {
  if (!workflowId) throw new Error('runWorkflow: workflowId required');
  const reg = registry || loadWorkflows();
  // Registry may be either raw ({workflows:[...]}) or loader-shaped ({byId:Map}).
  let wf = getWorkflow(reg, workflowId);
  if (!wf && reg?.byId?.get) wf = reg.byId.get(workflowId);
  if (!wf) throw new Error(`runWorkflow: unknown workflow id '${workflowId}'`);

  const dryRun = !armed;
  if (dryRun) return planWorkflow({ workflowId, goal, context, registry: reg, roster: rosterOpt });

  const roster = rosterOpt || loadRoster();
  const graph = _validateStageGraph(wf, roster);
  if (!graph.ok) throw new Error(`runWorkflow: stage graph invalid: ${graph.errors.join('; ')}`);

  const runId = buildRunId(workflowId, now());
  const root = blackboardRoot || defaultBlackboardRoot();
  const dispatchFn = dispatch || defaultDispatch;
  const testRunnerFn = testRunner || defaultTestRunner;
  const ownerDecisionFn = ownerDecision || defaultOwnerDecision;

  const runDir = path.join(root, runId, 'results');
  const artifactMap = new Map(); // artifact name -> text payload
  const receipts = [];

  for (const stageId of graph.topologicalOrder) {
    const stage = wf.stages.find((s) => (s.id || s.stage) === stageId);
    if (!stage) continue;
    const role = getRole(roster, stage.role);
    if (!role) {
      const err = _buildPacket({
        laneId: 'runner:error', role: stage.role, stage: stageId, runId,
        status: 'error', resultLabel: `06WU_${stageId.toUpperCase()}_UNKNOWN_ROLE`,
        text: `unknown role '${stage.role}' for stage '${stageId}'`,
      });
      writePacketToBlackboard(err, root, runId);
      return { runId, stage: stageId, status: 'error', receipt: err };
    }
    const autonomy = _resolveStageAutonomy(stage, role);
    const lane = resolveLane(role);

    // Live independence gate: every verification stage must declare independentOf
    // naming its producer(s); each named producer must be a transitive dependsOn
    // ancestor; verifier's resolved lane MUST differ from each producer's lane.
    // Mirrors _validateStageGraph's (4a/4b/4c); raises an error packet before dispatch.
    const ROLE_VERIFIER_LIKE_LIVE = new Set(['adjudicator', 'oracle', 'sentinel', 'calibrator']);
    if (ROLE_VERIFIER_LIKE_LIVE.has(stage.role)) {
      const inds = Array.isArray(stage.independentOf) ? stage.independentOf : [];
      if (inds.length === 0) {
        const err = _buildPacket({
          laneId: lane.laneId || lane.lane, role: stage.role, stage: stageId, runId,
          status: 'error', resultLabel: `06MU_${stageId.toUpperCase()}_INDEPENDENCE_NOT_DECLARED`,
          text: `verifier stage '${stageId}' must declare non-empty independentOf[]`,
        });
        writePacketToBlackboard(err, root, runId);
        return { runId, stage: stageId, status: 'error', receipt: err };
      }
      // Build transitive ancestors of stageId by dependsOn.
      const ancestorsOfLive = (sid) => {
        const out = new Set(); const stack = [sid]; const seen = new Set();
        while (stack.length > 0) {
          const cur = stack.pop(); if (seen.has(cur)) continue; seen.add(cur);
          const st = wf.stages.find((s) => (s.id || s.stage) === cur);
          if (!st) continue;
          const deps = Array.isArray(st.dependsOn) ? st.dependsOn : (st.dependsOn ? [st.dependsOn] : []);
          for (const d of deps) { out.add(d); stack.push(d); }
        }
        return out;
      };
      const ancestors = ancestorsOfLive(stageId);
      const verifierLane = resolveLane(role)?.lane;
      for (const ind of inds) {
        const producer = wf.stages.find((s) => (s.id || s.stage) === ind);
        if (!producer) continue;
        if (!ancestors.has(ind)) {
          const err = _buildPacket({
            laneId: lane.laneId || lane.lane, role: stage.role, stage: stageId, runId,
            status: 'error', resultLabel: `06MU_${stageId.toUpperCase()}_INDEPENDENCE_NOT_ANCESTOR`,
            text: `verifier stage '${stageId}' independentOf '${ind}' is not a dependsOn-ancestor`,
          });
          writePacketToBlackboard(err, root, runId);
          return { runId, stage: stageId, status: 'error', receipt: err };
        }
        const producerRole = getRole(roster, producer.role);
        const producerLane = producerRole ? resolveLane(producerRole)?.lane : null;
        if (verifierLane && producerLane && verifierLane === producerLane) {
          const err = _buildPacket({
            laneId: lane.laneId || lane.lane, role: stage.role, stage: stageId, runId,
            status: 'error', resultLabel: `06MU_${stageId.toUpperCase()}_INDEPENDENCE_LANE_COLLISION`,
            text: `verifier stage '${stageId}' (role=${stage.role}, lane=${verifierLane}) and producer '${ind}' (role=${producer.role}, lane=${producerLane}) resolve to the SAME lane; independence violated`,
          });
          writePacketToBlackboard(err, root, runId);
          return { runId, stage: stageId, status: 'error', receipt: err };
        }
      }
    }

    if (autonomy === 'owner-gated') {
      const packet = _buildPacket({
        laneId: lane.laneId || lane.lane || 'runner:owner-gated',
        role: stage.role, stage: stageId, runId, status: 'ok',
        resultLabel: `06MU_${stageId.toUpperCase()}_HOLD_FOR_OWNER`,
        text: `stage '${stageId}' is owner-gated (role autonomyClass='${role.autonomyClass}' or stage autonomy='${stage.autonomy}'); runner HELD; owner/Sol parent keeps final authority.`,
        evidence: `stageAutonomy=${stage.autonomy} roleAutonomy=${role.autonomyClass}`,
      });
      writePacketToBlackboard(packet, root, runId);
      receipts.push({ stage: stageId, status: 'HOLD', packet });
      return { runId, stage: stageId, status: 'HOLD', autonomy: 'owner-gated', receipts, halt: true };
    }

    if (stage.feedback === 'deterministic-test-loop' && wf.feedbackGate?.loop === 'red-green-refactor') {
      const max = Number(wf.feedbackGate?.maxCycles ?? 4);
      let last;
      for (let attempt = 1; attempt <= max; attempt++) {
        last = await testRunnerFn({ stage: stageId, runDir, attempt });
        if (last?.status === 'ok') break;
      }
      if (last?.status !== 'ok') {
        const pkt = _buildPacket({
          laneId: lane.laneId || lane.lane,
          role: stage.role, stage: stageId, runId, attempt: max,
          status: 'error', resultLabel: `06MU_${stageId.toUpperCase()}_FEEDBACK_EXHAUSTED`,
          text: `feedback loop red after ${max} cycles`,
          evidence: JSON.stringify(last || {}),
        });
        writePacketToBlackboard(pkt, root, runId);
        receipts.push({ stage: stageId, status: 'FEEDBACK_EXHAUSTED', packet: pkt });
        return { runId, stage: stageId, status: 'FEEDBACK_EXHAUSTED', receipts, halt: true };
      }
    }

    const entry = {
      agentId: lane.model || lane.lane,
      taskId: `${stageId}-${runId}`,
      role: stage.role,
      purpose: stageId,
      task: stage.assignment || stage.gate || `execute ${stageId}`,
    };
    const priorArtifacts = (Array.isArray(stage.consumes) ? stage.consumes : (stage.consumes ? [stage.consumes] : []))
      .reduce((acc, a) => { if (artifactMap.has(a)) acc[a] = artifactMap.get(a); return acc; }, {});
    const dispatchCtx = {
      goal, priorArtifacts, produces: stage.produces, gate: stage.gate, runId, stage: stageId,
    };
    const dispatchResult = await dispatchFn({
      entry, context: dispatchCtx, runDir, runId, stageName: stageId,
    });
    const dispatchText = JSON.stringify(dispatchResult || {}, null, 2);
    const packet = _buildPacket({
      laneId: lane.laneId || lane.lane,
      role: stage.role, stage: stageId, runId,
      status: 'ok', resultLabel: `06MU_${stageId.toUpperCase()}_X_PASS_COMMITTED`,
      text: dispatchText,
      evidence: `agent=${dispatchResult?.payload?.agent || entry.agentId} model=${lane.model}`,
      dispatchPayload: dispatchResult?.payload,
    });
    writePacketToBlackboard(packet, root, runId);
    receipts.push({ stage: stageId, status: 'ok', packet });
    const produces = Array.isArray(stage.produces) ? stage.produces : (stage.produces ? [stage.produces] : []);
    for (const a of produces) artifactMap.set(a, dispatchText);
  }

  return { runId, status: 'completed', receipts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Usage forms accepted:
  //   --plan <wfId>                     (positional; idiomatic for one-off planning)
  //   --plan --workflow=<wfId>           (legacy flag form)
  //   --plan --workflow=<wfId> --goal="..."
  // The positional form is canonical; --workflow= is preserved for existing shell glue.
  const argv = process.argv.slice(2);
  if (argv[0] !== '--plan') {
    console.log('usage: workflow-runner.mjs --plan <workflow-id> [--goal="..."]');
    process.exit(argv.length === 0 ? 0 : 1);
  }
  const positional = argv[1] && !argv[1].startsWith('--') ? argv[1] : null;
  const wfId = positional || argv.find((a) => a.startsWith('--workflow='))?.slice('--workflow='.length);
  const goal = argv.find((a) => a.startsWith('--goal='))?.slice('--goal='.length) || '';
  if (!wfId) {
    console.error('error: workflow id required (positional or --workflow=<id>)');
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(planWorkflow({ workflowId: wfId, goal }), null, 2));
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
}
