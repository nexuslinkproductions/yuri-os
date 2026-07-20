#!/usr/bin/env node
// @capability: mure-stage-graph-validator
// @serves: pure DAG validator for workflow stage graphs | cycle/dependency/ancestor/lane/artifact-intersection contract
// @does: Pure structural validation of a workflow stage graph. Dependency-free (no fs/path/registry imports)
// so both workflow-registry.mjs and workflow-runner.mjs can import this without circular references.
// Contract clauses:
//   (1) every dependsOn entry is a declared stage id
//   (2) no cycles (Kahn topological sort)
//   (3) every consumed artifact is produced by a dependsOn-ancestor stage
//   (4a) every verification stage declares non-empty independentOf[] of declared ids
//   (4b) each independentOf target is a transitive dependsOn-ancestor
//   (4c) verifier resolved lane MUST differ from each named producer's resolved lane (when roster provided)
//   (4d) each independentOf target must produce at least one artifact the verifier consumes
//   cardinality: at most ONE finalizeAuthority=true stage (legacy)
//   duplicate stage id (loop-scoped Set)
// @use: import { validateStageGraph, ROLE_VERIFIER_LIKE } from 'mure/stage-graph-validator.mjs';
// @exports: validateStageGraph, ROLE_VERIFIER_LIKE

export const ROLE_VERIFIER_LIKE = Object.freeze(['adjudicator', 'oracle', 'sentinel', 'calibrator']);

/**
 * Pure DAG validator for a workflow stage graph.
 * @param {Object} workflow - workflow object with .stages[]
 * @param {Object|null} [resolveLane] - optional (role) => {lane} resolver for clause (4c); if absent, 4c is skipped
 * @param {Object|null} [getRole] - optional (roster, roleId) => role resolver for clause (4c) and unknown-role guard
 * @param {Object|null} [roster] - optional roster passed to getRole
 * @returns {{ok: boolean, errors: string[], topologicalOrder: string[]}}
 */
export function validateStageGraph(workflow, resolveLane = null, getRole = null, roster = null) {
  const errors = [];
  const stages = Array.isArray(workflow?.stages) ? workflow.stages : [];
  if (stages.length === 0) errors.push('workflow has no stages');

  // Index by stage id (support `id` or alias `stage`).
  const byId = new Map();
  for (const s of stages) {
    const id = s.id || s.stage;
    if (!id) { errors.push('stage missing id field'); continue; }
    if (byId.has(id)) { errors.push(`duplicate stage id: ${id}`); continue; }
    byId.set(id, s);
  }

  // (1) every dependsOn entry is a declared stage id.
  // (4a) every verification stage declares non-empty independentOf[] of declared ids.
  for (const s of stages) {
    const id = s.id || s.stage;
    if (Array.isArray(s.dependsOn)) {
      for (const dep of s.dependsOn) {
        if (!byId.has(dep)) errors.push(`stage ${id} dependsOn unknown stage: ${dep}`);
      }
    } else if (s.dependsOn) {
      // scalar dependsOn: normalize to array of one
      if (!byId.has(s.dependsOn)) errors.push(`stage ${id} dependsOn unknown stage: ${s.dependsOn}`);
    }
    const role = s.role;
    const isVerifierLike = role && ROLE_VERIFIER_LIKE.includes(role);
    if (isVerifierLike) {
      if (!Array.isArray(s.independentOf) || s.independentOf.length === 0) {
        errors.push(`stage ${id} (role=${role}) must declare non-empty independentOf[]`);
      } else {
        for (const ind of s.independentOf) {
          if (!byId.has(ind)) errors.push(`stage ${id} independentOf references unknown stage: ${ind}`);
        }
      }
    } else if (Array.isArray(s.independentOf) && s.independentOf.length > 0) {
      // Schema rule: independentOf is permitted ONLY on verifier-like roles.
      errors.push(`stage ${id} (role=${role || '?'}) is NOT a verifier-like role; independentOf must not be set`);
    }
    // Unknown-role guard: when caller provided a roster + getRole resolver, every stage.role must resolve.
    if (getRole && roster && role && !getRole(roster, role)) {
      errors.push(`stage ${id} references unknown role: ${role}`);
    }
  }

  // DAG cycle detection (Kahn topological sort) — edges from dependsOn (dependee -> dependent).
  const indeg = new Map();
  for (const id of byId.keys()) indeg.set(id, 0);
  for (const s of stages) {
    const id = s.id || s.stage;
    const deps = Array.isArray(s.dependsOn) ? s.dependsOn : (s.dependsOn ? [s.dependsOn] : []);
    for (const dep of deps) if (byId.has(dep)) indeg.set(id, (indeg.get(id) || 0) + 1);
  }
  const queue = [...byId.keys()].filter((id) => (indeg.get(id) || 0) === 0);
  const order = [];
  const remaining = new Map(indeg);
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    for (const s of stages) {
      const sid = s.id || s.stage;
      const deps = Array.isArray(s.dependsOn) ? s.dependsOn : (s.dependsOn ? [s.dependsOn] : []);
      if (deps.includes(id)) {
        const d = (remaining.get(sid) || 0) - 1;
        remaining.set(sid, d);
        if (d === 0) queue.push(sid);
      }
    }
  }
  if (order.length !== byId.size) {
    // Cycle members are the nodes still carrying a positive remaining indegree
    // after Kahn's queue drained. Surface them so the validator reports WHICH
    // stages form the cycle, not just the word cycle.
    const cycleMembers = [...remaining.entries()].filter(([, d]) => d > 0).map(([id]) => id).sort();
    errors.push(`workflow stages contain a cycle (members=[${cycleMembers.join(',')}])`);
  }

  // (3) every consumed artifact is produced by a dependsOn-ancestor stage.
  const producesByStage = new Map();
  for (const s of stages) {
    const id = s.id || s.stage;
    const prods = Array.isArray(s.produces) ? s.produces : (s.produces ? [s.produces] : []);
    producesByStage.set(id, new Set(prods));
  }
  for (const s of stages) {
    const id = s.id || s.stage;
    const deps = Array.isArray(s.dependsOn) ? s.dependsOn : (s.dependsOn ? [s.dependsOn] : []);
    const reachable = new Set();
    for (const dep of deps) {
      const stack = [dep];
      const seen = new Set();
      while (stack.length > 0) {
        const cur = stack.pop();
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const a of producesByStage.get(cur) || []) reachable.add(a);
        const depStage = byId.get(cur);
        if (depStage) {
          const depDeps = Array.isArray(depStage.dependsOn) ? depStage.dependsOn : (depStage.dependsOn ? [depStage.dependsOn] : []);
          for (const d of depDeps) stack.push(d);
        }
      }
    }
    const consumes = Array.isArray(s.consumes) ? s.consumes : (s.consumes ? [s.consumes] : []);
    for (const a of consumes) {
      if (!reachable.has(a)) errors.push(`stage ${id} consumes artifact '${a}' but no reachable dependsOn-ancestor produces it`);
    }
  }

  // (4b/4c/4d) verifier independence: ancestor-reachability + lane-collision + artifact-intersection.
  const ancestorsOf = (stageId) => {
    const out = new Set();
    const stack = [stageId];
    const seen = new Set();
    while (stack.length > 0) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      const s = byId.get(cur);
      if (!s) continue;
      const deps = Array.isArray(s.dependsOn) ? s.dependsOn : (s.dependsOn ? [s.dependsOn] : []);
      for (const d of deps) { out.add(d); stack.push(d); }
    }
    return out;
  };
  for (const s of stages) {
    const id = s.id || s.stage;
    const role = s.role;
    if (!role || !ROLE_VERIFIER_LIKE.includes(role)) continue;
    const inds = Array.isArray(s.independentOf) ? s.independentOf : [];
    const ancestors = ancestorsOf(id);
    for (const ind of inds) {
      // (4b) ind must be a transitive dependsOn-ancestor of this verifier.
      if (byId.has(ind) && !ancestors.has(ind)) {
        errors.push(`stage ${id} independentOf '${ind}' is not a dependsOn-ancestor of '${id}'`);
      }
      // (4c) lane-collision: verifier resolved lane MUST differ from each named producer's resolved lane.
      if (resolveLane && getRole && roster && byId.has(ind)) {
        const verifierRole = getRole(roster, role);
        const producerRole = getRole(roster, byId.get(ind).role);
        if (verifierRole && producerRole) {
          const verifierLane = resolveLane(verifierRole)?.lane;
          const producerLane = resolveLane(producerRole)?.lane;
          if (verifierLane && producerLane && verifierLane === producerLane) {
            errors.push(`stage ${id} (role=${role}, lane=${verifierLane}) independentOf '${ind}' (role=${byId.get(ind).role}, lane=${producerLane}) — verifier and producer resolve to the SAME lane; independence violated`);
          }
        }
      }
      // (4d) artifact-intersection: each named producer must produce at least one artifact the verifier consumes.
      if (byId.has(ind)) {
        const producerStage = byId.get(ind);
        const producerProds = new Set(
          Array.isArray(producerStage.produces) ? producerStage.produces : (producerStage.produces ? [producerStage.produces] : [])
        );
        const verifierConsumes = Array.isArray(s.consumes) ? s.consumes : (s.consumes ? [s.consumes] : []);
        const intersects = verifierConsumes.some((a) => producerProds.has(a));
        if (!intersects) {
          errors.push(`stage ${id} independentOf '${ind}' but producer '${ind}' produces [${[...producerProds].join(',')}] which does NOT intersect verifier consumes [${verifierConsumes.join(',')}]`);
        }
      }
    }
  }

  // Cardinality: at most ONE finalizeAuthority=true stage (legacy support).
  const finalizeStages = stages.filter((s) => s.role === 'helmsman' || s.finalizeAuthority === true);
  if (finalizeStages.length > 1) errors.push(`multiple finalizeAuthority stages: ${finalizeStages.map((s) => s.id || s.stage).join(',')}`);

  return { ok: errors.length === 0, errors, topologicalOrder: order };
}
