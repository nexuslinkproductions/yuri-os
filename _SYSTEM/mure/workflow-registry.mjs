#!/usr/bin/env node
// @capability: mure-workflow-registry
// @serves: agentic workflow registry | prepared production workflows | recon plan production preview ship pipeline | register workflow | index workflows | match workflow to goal | compounding workflow framework
// @does: loads + validates the MURE agentic workflow registry (_SYSTEM/config/agentic-workflows.json), indexes workflows by id/tag, validates each workflow's stages against the live MURE role roster (role-registry), and matches a workflow to an owner goal. The registry of prepared, compounding agentic production pipelines that ceo.mjs/company.mjs invoke by name.
// @use: import { loadWorkflows, validateWorkflows, getWorkflow, matchWorkflowByGoal, indexWorkflows } from mure/workflow-registry.mjs. CLI: node workflow-registry.mjs --validate | --list | --match "<goal>".
// @exports: loadWorkflows, validateWorkflows, getWorkflow, matchWorkflowByGoal, indexWorkflows, WORKFLOWS_PATH, REQUIRED_WF, REQUIRED_STAGE
//
// Authority: descriptive registry mirroring role-registry.mjs. Stage roles are validated against the live
// roster and fail loud when a stage references a role id absent from _SYSTEM/config/fleet-roles.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRoster, getRole, resolveLane } from './role-registry.mjs';
import { validateStageGraph } from './stage-graph-validator.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
export const WORKFLOWS_PATH = path.join(REPO_ROOT, '_SYSTEM', 'config', 'agentic-workflows.json');
export const REQUIRED_STAGE = Object.freeze(['id', 'role', 'gate', 'consumes', 'produces', 'dependsOn']);
export const REQUIRED_WF = Object.freeze(['id', 'name', 'description', 'trigger', 'stages', 'feedbackGate']);
const AUTONOMY = Object.freeze(['self-governable', 'owner-gated']);

/** Load + shape the workflow registry. Returns { schemaVersion, workflows[], byId }. */
export function loadWorkflows(workflowsPath = WORKFLOWS_PATH) {
  const raw = JSON.parse(fs.readFileSync(workflowsPath, 'utf8'));
  const workflows = Array.isArray(raw.workflows) ? raw.workflows : [];
  const byId = new Map(workflows.map((w) => [w.id, w]));
  return { schemaVersion: raw.schemaVersion ?? 1, workflows, byId };
}

function safeRoster() {
  try { return loadRoster(); } catch { return null; }
}

/**
 * Strict structural validation. Returns { ok, errors[], workflowCount }.
 * Checks: required workflow + stage fields; unique ids; >=1 stage; autonomy enum;
 * feedbackGate deterministic; every stage.role resolves in the live MURE roster.
 */
export function validateWorkflows(registry, roster = null) {
  const errors = [];
  const seen = new Set();
  const rr = roster || safeRoster();
  for (const wf of registry?.workflows || []) {
    for (const f of REQUIRED_WF) if (!(f in wf)) errors.push(`workflow ${wf.id || '?'} missing field: ${f}`);
    if (seen.has(wf.id)) errors.push(`duplicate workflow id: ${wf.id}`);
    seen.add(wf.id);
    if (!Array.isArray(wf.stages) || wf.stages.length === 0) {
      errors.push(`workflow ${wf.id} has no stages`);
    } else {
      // Stage-id uniqueness within a workflow (registry-level: _validateStageGraph also checks but only after byId is built).
      const stageIdsSeen = new Set();
      let dupes = 0;
      for (const st of wf.stages) {
        const sid = st.id || st.stage;
        if (sid) {
          if (stageIdsSeen.has(sid)) {
            errors.push(`workflow ${wf.id} duplicate stage id: ${sid}`);
            dupes++;
          } else {
            stageIdsSeen.add(sid);
          }
        }
      }
      // Schema-shape checks
      for (const st of wf.stages) {
        for (const f of REQUIRED_STAGE) if (!(f in st)) errors.push(`workflow ${wf.id} stage ${st.id || st.stage || '?'} missing field: ${f}`);
        if (st.autonomy && !AUTONOMY.includes(st.autonomy)) errors.push(`workflow ${wf.id} stage ${st.id || st.stage} invalid autonomy: ${st.autonomy}`);
        if (!Array.isArray(st.consumes)) errors.push(`workflow ${wf.id} stage ${st.id || st.stage} consumes must be array (got ${typeof st.consumes})`);
        if (!Array.isArray(st.produces)) errors.push(`workflow ${wf.id} stage ${st.id || st.stage} produces must be array (got ${typeof st.produces})`);
        if (!Array.isArray(st.dependsOn)) errors.push(`workflow ${wf.id} stage ${st.id || st.stage} dependsOn must be array (got ${typeof st.dependsOn})`);
        // Verifier-like roles MUST declare non-empty independentOf array.
        const ROLE_VERIFIER_LIKE = new Set(['adjudicator','oracle','sentinel','calibrator']);
        if (st.role && ROLE_VERIFIER_LIKE.has(st.role)) {
          if (!Array.isArray(st.independentOf) || st.independentOf.length === 0) {
            errors.push(`workflow ${wf.id} stage ${st.id || st.stage} (role=${st.role}) must declare non-empty independentOf[]`);
          }
        } else if (Array.isArray(st.independentOf) && st.independentOf.length > 0) {
          errors.push(`workflow ${wf.id} stage ${st.id || st.stage} (role=${st.role}) is NOT a verifier-like role; independentOf must not be set`);
        }
        if (rr && st.role && !getRole(rr, st.role)) errors.push(`workflow ${wf.id} stage ${st.id || st.stage} references unknown role: ${st.role}`);
      }
    }
    if (wf.feedbackGate && wf.feedbackGate.type && wf.feedbackGate.type !== 'deterministic') {
      errors.push(`workflow ${wf.id} feedbackGate.type must be deterministic (got ${wf.feedbackGate.type})`);
    }
  }
  return { ok: errors.length === 0, errors, workflowCount: (registry?.workflows || []).length };
}

/**
 * Full-contract validation: registry shape + stage-graph contract
 * (dependsOn DAG, consumes/produces artifact-intersection, independentOf ancestry
 * + lane-distinct + artifact-intersection, duplicate stage id, finalizeAuthority cap).
 * Synchronous: uses the pure stage-graph-validator.mjs (no runner dependency, no circular import).
 */
export function validateWorkflowsGraph(registry, roster = null) {
  const rr = roster || safeRoster();
  const errors = [];
  for (const wf of registry?.workflows || []) {
    // Adapter for clause (4c): resolver takes a role object and returns {lane}.
    const resolveLaneAdapter = rr ? (role) => {
      try { return resolveLane(role); } catch { return null; }
    } : null;
    const graph = validateStageGraph(wf, resolveLaneAdapter, getRole, rr);
    if (!graph.ok) {
      for (const e of graph.errors) errors.push(`workflow ${wf.id} graph: ${e}`);
    }
  }
  return { ok: errors.length === 0, errors, workflowCount: (registry?.workflows || []).length };
}

/** Fetch a workflow by id. */
export function getWorkflow(registry, id) {
  return registry?.byId?.get(id) || null;
}

/** Build discovery indexes: ids[] and byTag Map. */
export function indexWorkflows(registry) {
  const byTag = new Map();
  for (const wf of registry?.workflows || []) {
    for (const t of wf.tags || []) {
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t).push(wf.id);
    }
  }
  return { ids: [...(registry?.byId?.keys() || [])], byTag };
}

/**
 * Match a workflow to a free-text owner goal. Build/ship/fix/functional goals route to the
 * `default`-tagged pipeline; otherwise best tag-overlap; else the default; else null.
 */
export function matchWorkflowByGoal(registry, goal = '') {
  const g = String(goal).toLowerCase();
  const isBuild = /\b(build|implement|feature|fix|ship|code|refactor|functional|restore|test)\b/.test(g);
  const def = (registry?.workflows || []).find((w) => (w.tags || []).includes('default'));
  if (isBuild && def) return def;
  let best = null, bestScore = 0;
  for (const wf of registry?.workflows || []) {
    const s = (wf.tags || []).filter((t) => g.includes(t)).length;
    if (s > bestScore) { bestScore = s; best = wf; }
  }
  return best || def || null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2];
  const reg = loadWorkflows();
  if (arg === '--validate') {
    const v = validateWorkflows(reg);
    console.log(JSON.stringify(v, null, 2));
    process.exit(v.ok ? 0 : 1);
  } else if (arg === '--list') {
    // Prefer canonical `id`; fall back to legacy `stage` alias so older configs remain readable.
    for (const w of reg.workflows) console.log(`${w.id}  [${(w.tags || []).join(',')}]  ${w.stages.length} stages: ${w.stages.map((s) => s.id || s.stage).join(' -> ')}`);
  } else if (arg === '--match') {
    console.log(JSON.stringify(matchWorkflowByGoal(reg, process.argv[3] || ''), null, 2));
  } else {
    console.log('usage: workflow-registry.mjs --validate | --list | --match "<goal>"');
  }
}
