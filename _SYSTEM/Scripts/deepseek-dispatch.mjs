#!/usr/bin/env node
/**
 * Framework-disciplined DeepSeek V4 Pro dispatch wrapper (THIN).
 *
 * DEV-ONLY. All logic lives in the neutral core (reasoning-lane-dispatch.mjs);
 * this wrapper only binds the lane config and re-exports the pure functions so a
 * parallel test suite can import them from THIS module.
 *
 * It assembles a grounded advisory prompt and delegates the live call to
 * `ai offload --model deepseek-v4-pro`.
 *
 * Relationship to the direct lane: `@deepseek` / `ai @deepseek` routes to the
 * raw DeepSeek cloud lane with NO discipline wrapper. This adapter (`ai
 * ds-reason`) adds the framework preamble, symbol inventory, Track-A handle
 * injection, and falsifier extraction on top of the same lane.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runCli as coreRunCli,
  // Re-exported for the test suite (imported from THIS module).
  DISCIPLINE_PREAMBLE,
  buildDispatchPlan as coreBuildDispatchPlan,
  buildSymbolInventory,
  composePrompt,
  extractFalsifiers,
  extractNamedExportsFromSource,
  formatVerifyChecklist,
  isProtectedPath,
} from './reasoning-lane-dispatch.mjs';

const __filename = fileURLToPath(import.meta.url);

const DEEPSEEK_LANE = {
  // DeepSeek V4 Pro is a thinking/reasoning lane on the tools-enabled offload
  // runner. Owner policy 2026-06-05: DeepSeek pro + flash ALWAYS run at MAX
  // reasoning — they are reasoning models, use them at full depth. 'max' lifts
  // the runner's depth->maxTokens budget to the top tier (offload.sh + the
  // deepseek runtime normalize it). The offload-runner lane default is 'max' too,
  // so this matches the lane policy; override with --reasoning only for cheap runs.
  model: 'deepseek-v4-pro',
  label: 'deepseek',
  defaultReasoning: 'max',
};

// buildDispatchPlan keeps a deepseek-bound default so a parallel test can call it
// with no model arg and still get the deepseek model in the dispatch args.
export function buildDispatchPlan(composedPrompt, outPath, reasoning = 'max', model = DEEPSEEK_LANE.model) {
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
  return coreRunCli(DEEPSEEK_LANE, argv);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(runCli());
}
