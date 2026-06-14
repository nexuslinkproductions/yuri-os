#!/usr/bin/env node
// @capability: nano-spawn-governance
// @serves: spawn nano | recursive nanoswarm | lane spawns sub-lane | spawn tool | depth cap | fan-out cap | node budget enforcement | spawn governance | exoskeleton sub-agent | spawn_nano
// @does: the GOVERNED spawn handler for the recursive exoskeleton nanoswarm (Move 1b, 07-ARCHITECTURE.md §9)
//   — the SINGLE choke point every lane (native or external peer) routes a spawn through. Enforces, in order:
//   (0) DISARMED gate (YURI_NANOSWARM_SPAWN=1 + flag file; off → lane degrades to doing the work itself),
//   (1) depth cap by tier (heavy>200B→5 / light→10), (2) decaying fan-out F_eff(d)=⌈F0·decay^d⌉ minus existing
//   direct children, (3) node budget B via nano-tree's ATOMIC lease-serialized reserve (no sibling TOCTOU),
//   (4) per-child cost admission (cost-reservation-pool; advisory-pass when its own enforce is off). Each
//   granted child: acquire its in-flight lease UNDER THE CHILD's nanoId BEFORE dispatch (INV-1 atomic
//   registration → no in-flight-but-unregistered window), then dispatch externalNanoWork via nano-tick.
//   Refusals are tool ERRORS (lane reads "cap reached, do it yourself"), never exceptions. DISARMED-default +
//   reversible. The deny of a direct bash bypass (node nano-external.mjs) is a separate guard (INC-5).
// @use: spawnNano({ ctx:{rootRunId,myPath,depth}, args:{task,lane,count,reasoning} }) from the tool handler.
//   Deps (arm/tier/reserve/lease/dispatch/admit) injectable via opts.deps for hermetic tests.
// @exports: spawnNano, spawnArmed, tierForLane, SPAWN_NANO_TOOL, SPAWN_ARM_ENV, SPAWN_FLAG_PATH, LANE_PARAMS_B
// @depends: nano-tree (reserveSpawnSlots/treeConfig/fanoutAt/depthCapFor/tierForParamsB/inflightLeaseId/
//   nanoIdOf/depthOf/readManifest/parentOf), nano-lease (acquireLease), nano-external (assertLlmLaneRouted),
//   cost-reservation-pool (admit). Real dispatch (externalNanoWork+nano-tick) is injected at the wiring seam.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  reserveSpawnSlots, treeConfig, fanoutAt, depthCapFor, tierForParamsB,
  inflightLeaseId, nanoIdOf, depthOf, readManifest, parentOf, recordVoid,
} from './nano-tree.mjs';
import { acquireLease } from './nano-lease.mjs';
import { assertLlmLaneRouted } from './nano-external.mjs';
import { admit } from './cost-reservation-pool.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SPAWN_ARM_ENV = 'YURI_NANOSWARM_SPAWN';
export const SPAWN_FLAG_PATH = process.env.YURI_NANOSWARM_SPAWN_FLAG || path.join(REPO_ROOT, '_SYSTEM/state/nanoswarm-spawn.enabled');

/** Two-factor arm (energy-enforce pattern): env flag AND a flag file. Either missing → DISARMED. */
export function spawnArmed() {
  if (process.env[SPAWN_ARM_ENV] !== '1') return false;
  try { return fs.existsSync(SPAWN_FLAG_PATH); } catch { return false; }
}

// Trained-param counts (BILLIONS) for tier routing. >200B → heavy (depth 5), else light (10).
// Only EVIDENCED counts live here. minimax-m3 + mimo-v2.5-pro are deliberately ABSENT: their trained-param
// counts are unverified (local corpus has none), so they route via the unknown→heavy default in tierForLane
// — the dominated-safe tier (mislabel-light-as-heavy only restricts depth; the reverse loosens the
// sim-validated bound). Add a real number ONLY with evidence, and only after confirming it doesn't flip the
// tier across the 200B line. Pinned by a by-name regression test in nano-spawn.test.mjs.
export const LANE_PARAMS_B = {
  'nemotron-3-ultra': 550, 'glm-5.1': 744, 'kimi-k2.7-code': 1000, 'deepseek-v4-pro': 671,
  'gemma4:31b': 31, 'nemotron-3-nano': 30, 'qwen-local': 9, 'gemma-local': 12,
};
/** tier for an llm-lane key; frontier/unknown lanes default HEAVY (conservative: lower depth cap). */
export function tierForLane(lane, cfg = {}) {
  const key = String(lane || '').replace(/:cloud$/i, '').toLowerCase();
  if (/claude|opus|sonnet|codex|gpt-|frontier/.test(key)) return 'heavy';
  if (/flash|nano|:9b|:12b|local/.test(key)) return 'light';
  const p = LANE_PARAMS_B[key];
  if (p == null) return 'heavy';                 // unknown → conservative
  return tierForParamsB(p, cfg);
}

/**
 * The governed spawn. Returns { spawned:[{path,lane,depth,leaseOwner,reservationId}], rejected:{...counts},
 * degrade?, reason }. NEVER throws on a governance refusal (returns reason); only bad input throws-as-result.
 */
export async function spawnNano({ ctx = {}, args = {}, opts = {} } = {}) {
  const { rootRunId, myPath, depth } = ctx;
  const D = {
    armed: undefined, reserveSpawnSlots, acquireLease, admit, fanoutAt, depthCapFor, treeConfig, readManifest, recordVoid,
    dispatch: async () => ({ ok: true, dispatched: false, note: 'no dispatch wired (INC-6 seam)' }),
    ...(opts.deps || {}),
  };
  const armed = (D.armed !== undefined) ? D.armed : spawnArmed();

  // (0) DISARMED → degrade: the lane does the work itself, no recursion.
  if (!armed) return { spawned: [], rejected: {}, degrade: true, reason: 'spawn-disabled-DISARMED' };

  // input validation
  if (!rootRunId || !myPath || !Number.isInteger(depth)) return { spawned: [], rejected: {}, reason: 'bad-ctx', detail: 'rootRunId, myPath, integer depth required' };
  const task = String(args.task || '').trim();
  if (!task) return { spawned: [], rejected: {}, reason: 'task-required' };
  let laneKey;
  try { laneKey = assertLlmLaneRouted(args.lane); } catch (e) { return { spawned: [], rejected: {}, reason: 'bad-lane', detail: String(e?.message || e) }; }
  const want = Math.max(1, Math.floor(Number(args.count) || 1));
  const cfg = D.treeConfig(rootRunId);

  // (1) DEPTH cap by the CHILD lane's tier.
  const tier = tierForLane(laneKey, cfg);
  const cap = D.depthCapFor(tier, cfg);
  const childDepth = depth + 1;
  if (childDepth > cap) return { spawned: [], rejected: { depth: want }, reason: 'depth-cap-reached', cap, tier, depth };

  // (2) FAN-OUT cap: F_eff(depth) minus this node's existing direct children.
  const fEff = D.fanoutAt(depth, cfg);
  const existingKids = D.readManifest(rootRunId).filter((e) => e.type === 'spawn' && parentOf(e.path) === myPath).length;
  const fanoutRoom = Math.max(0, fEff - existingKids);
  if (fanoutRoom === 0) return { spawned: [], rejected: { fanout: want }, reason: 'fanout-cap-reached', fEff, existingKids };
  const afterFanout = Math.min(want, fanoutRoom);

  // (3) NODE BUDGET (atomic): reserve up to afterFanout slots; returns granted (budget-capped) with paths.
  const spawnerId = nanoIdOf(rootRunId, myPath);
  const specs = Array.from({ length: afterFanout }, () => ({ lane: laneKey, task, reasoning: args.reasoning || 'xhigh' }));
  const res = await D.reserveSpawnSlots(rootRunId, specs, spawnerId, { parentPath: myPath });
  const budgetRejected = (want - res.granted.length);

  // (4) COST admit + DISPATCH per granted child (lease registration BEFORE dispatch — INV-1).
  const spawned = [];
  let costRejected = 0;
  for (const g of res.granted) {
    const childNanoId = nanoIdOf(rootRunId, g.path);
    const adm = D.admit({ lane: laneKey, model: laneKey, steps: 24, reasoning: g.reasoning });
    if (adm && adm.admitted === false) {
      // unfunded → never runs. VOID the reserved slot so the barrier doesn't later flag it as a false orphan.
      costRejected += 1; try { D.recordVoid(rootRunId, g.path, 'cost-rejected'); } catch { /* best-effort */ }
      continue;
    }
    // INV-1 atomic registration: acquire the in-flight lease UNDER THE CHILD's id, BEFORE the child boots.
    const lease = D.acquireLease(inflightLeaseId(rootRunId, g.path), childNanoId);
    if (!lease.ok) { try { D.recordVoid(rootRunId, g.path, 'lease-conflict'); } catch { /* */ } continue; } // path already registered — void this reservation
    const childCtx = { rootRunId, myPath: g.path, depth: g.depth, treeReservationId: ctx.treeReservationId || null, reservationId: (adm && adm.reservationId) || null };
    let disp;
    try { disp = await D.dispatch({ lane: laneKey, task, reasoning: g.reasoning }, childCtx); }
    catch (e) { disp = { ok: false, error: String(e?.message || e) }; }
    spawned.push({ path: g.path, lane: laneKey, depth: g.depth, leaseOwner: childNanoId, reservationId: childCtx.reservationId, dispatched: Boolean(disp && disp.ok !== false) });
  }

  return {
    spawned,
    rejected: { depth: 0, fanout: Math.max(0, want - afterFanout), budget: Math.max(0, budgetRejected - Math.max(0, want - afterFanout)), cost: costRejected },
    reason: spawned.length ? 'spawned' : 'all-rejected',
    tier, cap, fEff,
  };
}

/** The tool descriptor wired into the llm-lane TOOLS array (INC-6). */
export const SPAWN_NANO_TOOL = {
  name: 'spawn_nano',
  description: 'Spawn a YURI-exoskeleton sub-lane (nano) to handle a scoped sub-task, governed by depth/fan-out/node-budget/cost caps. Returns the spawned children or a refusal reason (do the work yourself if refused). DISARMED unless the swarm is armed.',
  input_schema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'the scoped sub-task for the child nano' },
      lane: { type: 'string', description: 'llm-lane lane key for the child (e.g. deepseek-v4-pro, gemma4:31b:cloud)' },
      count: { type: 'integer', description: 'how many children to request (clamped to fan-out + budget)', default: 1 },
      reasoning: { type: 'string', description: 'reasoning depth (default xhigh)' },
    },
    required: ['task', 'lane'],
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify({ module: 'nano-spawn', armed: spawnArmed(), armEnv: SPAWN_ARM_ENV, flag: SPAWN_FLAG_PATH,
    sampleTiers: { 'nemotron-3-ultra': tierForLane('nemotron-3-ultra'), 'gemma4:31b': tierForLane('gemma4:31b'), unknown: tierForLane('mystery-lane') } }, null, 2)}\n`);
}
