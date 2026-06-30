// @capability: mure-evolver-arm
// @serves: evolver arm gate | self-modification arm | owner-gated evolver unlock
// @does: owner-gated arm surface for the evolver role. When armed, evolver subtasks that pass the 6-gate charter may cast (finalize/arming/governance.mjs edits still blocked).
// @exports: isEvolverArmed, EVOLVER_ARM_ENV, EVOLVER_ARM_FLAG

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

export const EVOLVER_ARM_ENV = 'YURI_EVOLVER_ARMED';
export const EVOLVER_ARM_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'evolver.enabled');

export function isEvolverArmed() {
  if (process.env[EVOLVER_ARM_ENV] === '1') return true;
  try { return fs.existsSync(EVOLVER_ARM_FLAG); } catch { return false; }
}
