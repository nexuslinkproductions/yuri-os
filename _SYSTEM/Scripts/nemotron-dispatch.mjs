#!/usr/bin/env node
/**
 * Framework-disciplined Nemotron-3-Ultra dispatch wrapper (THIN).
 *
 * DEV-ONLY. All logic lives in the neutral core (reasoning-lane-dispatch.mjs);
 * this wrapper only binds the lane config and re-exports the pure functions so
 * the existing test imports stay unchanged.
 *
 * It assembles a grounded advisory prompt and delegates the live call to
 * `ai offload --model nvidia/nemotron-3-ultra-550b-a55b`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runCli as coreRunCli,
  // Re-exported for the test suite (imported from THIS module, unchanged).
  DISCIPLINE_PREAMBLE,
  buildDispatchPlan as coreBuildDispatchPlan,
  buildSymbolInventory,
  composePrompt,
  extractFalsifiers,
  extractNamedExportsFromSource,
  formatVerifyChecklist,
  isProtectedPath,
} from './reasoning-lane-dispatch.mjs';
import { getOffloadLane } from './offload-lane-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const NEMOTRON_CFG = getOffloadLane('nemotron-3-ultra-550b-a55b');

const NEMOTRON_LANE = {
  // Nemotron-3-Ultra is a 550B REASONING model on a tools-enabled lane; the nvidia
  // NIM lanes set no maxTokens so they inherit a small default that truncates a
  // reasoning+tool-call run mid-output. Owner policy 2026-06-05: every reasoning
  // lane we dispatch to defaults to MAX. defaultReasoning 'max' lifts the runner's
  // depth->maxTokens budget to the top tier (offload.sh forwards --reasoning;
  // --max-output-tokens is NOT forwarded). Override with --reasoning for cheap runs.
  model: NEMOTRON_CFG.model,
  label: 'nemotron',
  defaultReasoning: 'max',
};

// buildDispatchPlan keeps its historical nemotron-bound signature for the test
// (test calls it with no model arg and expects the nemotron model in args).
export function buildDispatchPlan(composedPrompt, outPath, reasoning = 'max', model = NEMOTRON_LANE.model) {
  return coreBuildDispatchPlan(composedPrompt, outPath, reasoning, model);
}

export {
  DISCIPLINE_PREAMBLE,
  buildSymbolInventory,
  composePrompt,
  extractFalsifiers,
  extractNamedExportsFromSource,
  formatVerifyChecklist,
  isProtectedPath,
};

export function runCli(argv = process.argv.slice(2)) {
  return coreRunCli(NEMOTRON_LANE, argv);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(runCli());
}
