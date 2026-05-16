#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, 'lane-capability-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const rank = { free: 0, low: 1, small: 0, medium: 2, large: 3, high: 3, extended: 4 };

function tier(value) {
  return rank[value] ?? -1;
}

function candidates(requirements = {}) {
  const caps = requirements.capabilities || [];
  return Object.entries(manifest.lanes).filter(([, lane]) => {
    if (!lane.available) return false;
    if (requirements.privacy && lane.privacy !== requirements.privacy) return false;
    if (requirements.maxCost && tier(lane.cost_tier) > tier(requirements.maxCost)) return false;
    if (requirements.maxLatency && tier(lane.latency_tier) > tier(requirements.maxLatency)) return false;
    if (requirements.minCtx && tier(lane.ctx_window) < tier(requirements.minCtx)) return false;
    return caps.every(capability => lane.capabilities.includes(capability));
  });
}

function scoreLane(lane, requirements = {}) {
  const requested = requirements.capabilities || [];
  const matching = requested.filter(capability => lane.capabilities.includes(capability)).length;
  let score = matching * 100 + tier(lane.ctx_window) * 12;
  if (requirements.preferLocal && lane.privacy === 'local') score += 80;
  if (lane.tools) score += 8;
  score += (4 - tier(lane.latency_tier)) * 3;
  score += (4 - tier(lane.cost_tier));
  return score;
}

export function selectLane(requirements = {}) {
  const matches = candidates(requirements);
  if (matches.length === 0) return null;
  matches.sort((a, b) => scoreLane(b[1], requirements) - scoreLane(a[1], requirements));
  return matches[0][0];
}

export function getLane(laneId) {
  return manifest.lanes[laneId] || null;
}

export function listLanes(filter) {
  return Object.entries(manifest.lanes).filter(([, lane]) => {
    if (!lane.available) return false;
    return filter ? lane.capabilities.includes(filter) : true;
  });
}

function assertCase(name, condition) {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
}

function selfCheck() {
  assertCase('privacy local', getLane(selectLane({ privacy: 'local' })).privacy === 'local');
  assertCase('deep reasoning', selectLane({ capabilities: ['deep-reasoning'] }) === 'deepseek-v4-pro');
  assertCase('free cost', getLane(selectLane({ maxCost: 'free' })).cost_tier === 'free');
  assertCase('claude unavailable', !listLanes().some(([id]) => id === 'claude'));
  const before = selectLane({ capabilities: ['implementation'] });
  manifest.lanes[before].available = false;
  const after = selectLane({ capabilities: ['implementation'] });
  assertCase('availability toggle', before && after && before !== after);
  console.log('5/5 PASS');
}

if (process.argv.includes('--self-check')) selfCheck();
if (process.argv.includes('--list')) console.log(JSON.stringify(listLanes(), null, 2));
