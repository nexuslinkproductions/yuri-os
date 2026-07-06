// @capability: mure-evolver-arm
// @serves: evolver arm gate | self-modification arm | owner-gated evolver unlock
// @does: owner-gated arm surface for the evolver role. When armed, evolver subtasks that pass the 6-gate charter may cast (finalize/arming/governance.mjs edits still blocked).
// @exports: isEvolverArmed, EVOLVER_ARM_ENV, EVOLVER_ARM_FLAG

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isArmed } from '../lib/arming.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

export const EVOLVER_ARM_ENV = 'YURI_EVOLVER_ARMED';
export const EVOLVER_ARM_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'evolver.enabled');

export function isEvolverArmed() {
  return isArmed({ env: EVOLVER_ARM_ENV, flag: EVOLVER_ARM_FLAG });
}
