#!/usr/bin/env node
/**
 * Framework-disciplined Kimi K2.6 dispatch wrapper (THIN).
 *
 * DEV-ONLY. All logic lives in the neutral core; this wrapper binds the
 * models.json offload_lanes entry and re-exports pure functions for tests.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runCli as coreRunCli,
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
const KIMI_CFG = getOffloadLane('kimi-k2.6');

const KIMI_LANE = {
  model: KIMI_CFG.model,
  label: 'kimi',
  defaultReasoning: 'max',
};

export function buildDispatchPlan(composedPrompt, outPath, reasoning = 'max', model = KIMI_LANE.model) {
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
  return coreRunCli(KIMI_LANE, argv);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(runCli());
}
