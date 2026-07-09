#!/usr/bin/env node
// @capability: sol-moe-company-planner
// @serves: Sol-first OpenClaw MoE planning | governed sessions_spawn manifests | deterministic model dispatch
// @does: composes the existing governed MURE company planner with the pure Sol MoE router. Produces explicit producer, verifier, availability-fallback, quality-escalation, and optional evidence queues without calling live agents.
// @use: node _SYSTEM/mure/sol-moe-company.mjs --task-file <task.json> [--include-evidence]
// @exports: planSolMoeCompany, buildSpawnEntry

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planCompany } from './company.mjs';
import { NoEligibleFrontierError, createLedgerRow, routeTask } from './sol-moe-router.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

/**
 * Convert one pure-router candidate into an OpenClaw sessions_spawn manifest entry.
 * This is data only. The live Yuri/OpenClaw session remains the authority that executes it.
 */
export function buildSpawnEntry(candidate, context = {}) {
  if (!candidate?.dispatch?.agentId || !candidate?.dispatch?.model) {
    throw new TypeError('buildSpawnEntry requires a routed candidate with a dispatch spec');
  }
  const purpose = context.purpose || 'producer';
  const taskId = String(context.taskId || 'task');
  const prompt = String(context.prompt || context.summary || '').trim();
  return Object.freeze({
    id: `${taskId}:${purpose}:${candidate.id}`,
    taskId,
    purpose,
    role: context.role || null,
    agentId: candidate.dispatch.agentId,
    model: candidate.dispatch.model,
    thinking: candidate.dispatch.thinking,
    prompt,
    execution: 'sessions_spawn',
  });
}

/**
 * Plan a governed Sol-first company run.
 *
 * Safety properties:
 * - Calls the existing planCompany() for role casting + governance.
 * - Disables legacy MLP steering (threshold 1.01) so hard policy is authoritative.
 * - Never calls sessions_spawn and never writes runtime state.
 * - Owner-held subtasks never enter an executable queue.
 * - Availability and quality paths remain dormant, separate queues.
 */
export async function planSolMoeCompany(task = {}, opts = {}) {
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const governed = await planCompany(task, {
    ...opts,
    // Router confidence is clamped to [0,1]. A 1.01 threshold keeps the legacy
    // advisory MLP in shadow while deterministic hard masks own this manifest.
    steerThreshold: 1.01,
  });
  const heldIds = new Set((governed.held || []).map((entry) => entry.subtaskId));
  const routes = [];
  const blocked = [];
  const producerQueue = [];
  const verifierQueue = [];
  const evidenceQueue = [];
  const availabilityQueue = [];
  const qualityQueue = [];
  const ledgerSeed = [];

  for (let index = 0; index < subtasks.length; index += 1) {
    const subtask = subtasks[index] || {};
    const cast = governed.casts[index];
    const taskId = String(subtask.id || `subtask-${index + 1}`);
    const prompt = String(subtask.prompt || subtask.summary || '').trim();
    let route;
    try {
      route = routeTask({
        ...subtask,
        id: taskId,
        summary: prompt,
        role: cast?.role || subtask.role,
      }, {
        policy: opts.policy,
        availability: opts.availability,
      });
    } catch (error) {
      if (!(error instanceof NoEligibleFrontierError)) throw error;
      blocked.push(Object.freeze({
        taskId,
        role: cast?.role || null,
        status: 'fail-loud',
        code: error.code,
        reason: error.message,
        details: error.details,
      }));
      continue;
    }

    const held = heldIds.has(taskId);
    const routeRecord = Object.freeze({ taskId, role: cast?.role || null, held, route });
    routes.push(routeRecord);
    ledgerSeed.push(createLedgerRow(route, {
      timestamp: opts.timestamp || 'PLANNED',
      outcome: held ? 'owner-held' : 'planned',
      routeKind: route.selection,
    }));

    if (held) continue;

    const context = { taskId, role: cast?.role || null, prompt };
    producerQueue.push(buildSpawnEntry(route.producer, { ...context, purpose: 'producer' }));
    if (route.verifier) {
      verifierQueue.push(buildSpawnEntry(route.verifier, { ...context, purpose: 'verifier' }));
    }
    for (const candidate of route.availabilityFallbacks) {
      availabilityQueue.push(buildSpawnEntry(candidate, { ...context, purpose: 'availability-fallback' }));
    }
    for (const candidate of route.qualityEscalations) {
      qualityQueue.push(buildSpawnEntry(candidate, { ...context, purpose: 'quality-escalation' }));
    }
    const includeEvidence = opts.includeEvidence === true
      || route.classification.riskClass === 'R0'
      || subtask.parallelEvidence === true;
    if (includeEvidence) {
      for (const candidate of route.evidenceGatherers) {
        if (candidate.id === route.producer.id) continue;
        evidenceQueue.push(buildSpawnEntry(candidate, { ...context, purpose: 'evidence' }));
      }
    }
  }

  return Object.freeze({
    schemaVersion: 'sol-moe-company-v1',
    mode: 'manifest-only-disarmed',
    seat: routes[0]?.route?.seat || null,
    governed,
    routes: Object.freeze(routes),
    queues: Object.freeze({
      producers: Object.freeze(producerQueue),
      verifiers: Object.freeze(verifierQueue),
      evidence: Object.freeze(evidenceQueue),
      availabilityFallbacks: Object.freeze(availabilityQueue),
      qualityEscalations: Object.freeze(qualityQueue),
    }),
    blocked: Object.freeze(blocked),
    ledgerSeed: Object.freeze(ledgerSeed),
    summary: Object.freeze({
      subtasks: subtasks.length,
      routed: routes.length,
      held: routes.filter((entry) => entry.held).length,
      blocked: blocked.length,
      immediateSpawns: producerQueue.length + verifierQueue.length + evidenceQueue.length,
      dormantAvailabilityFallbacks: availabilityQueue.length,
      dormantQualityEscalations: qualityQueue.length,
    }),
  });
}

function parseArgs(argv) {
  const fileIndex = argv.indexOf('--task-file');
  return {
    taskFile: fileIndex >= 0 ? argv[fileIndex + 1] : null,
    includeEvidence: argv.includes('--include-evidence'),
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.taskFile) {
    process.stderr.write('Usage: node _SYSTEM/mure/sol-moe-company.mjs --task-file <task.json> [--include-evidence]\n');
    process.exit(2);
  }
  const taskPath = path.resolve(REPO_ROOT, args.taskFile);
  const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
  planSolMoeCompany(task, { includeEvidence: args.includeEvidence })
    .then((plan) => process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error?.stack || error}\n`);
      process.exitCode = 1;
    });
}
