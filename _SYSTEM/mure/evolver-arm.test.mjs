import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decisionFor } from './company.mjs';
import { getRole, loadRoster } from './role-registry.mjs';
import { CLASS } from './governance.mjs';
import { isEvolverArmed, EVOLVER_ARM_ENV, EVOLVER_ARM_FLAG } from './evolver-arm.mjs';

const roster = loadRoster();
const evolverRole = getRole(roster, 'evolver');
const SAFE_EVOLVER_SUBTASK = {
  id: 'evolver-proposal',
  prompt: 'Propose a reversible doc-only improvement.',
  reversible: true,
  evidenceDecidable: true,
  inDoctrine: true,
  blastRadius: 'LOW',
};

async function withEvolverArm(fn) {
  const savedEnv = process.env[EVOLVER_ARM_ENV];
  process.env[EVOLVER_ARM_ENV] = '1';
  let hadFlag = false;
  let flagContent = null;
  if (fs.existsSync(EVOLVER_ARM_FLAG)) {
    hadFlag = true;
    flagContent = fs.readFileSync(EVOLVER_ARM_FLAG);
    fs.unlinkSync(EVOLVER_ARM_FLAG);
  }
  try {
    return await fn();
  } finally {
    if (savedEnv != null) process.env[EVOLVER_ARM_ENV] = savedEnv;
    else delete process.env[EVOLVER_ARM_ENV];
    if (hadFlag && flagContent != null) fs.writeFileSync(EVOLVER_ARM_FLAG, flagContent);
  }
}

async function withEvolverDisarmed(fn) {
  const savedEnv = process.env[EVOLVER_ARM_ENV];
  delete process.env[EVOLVER_ARM_ENV];
  let hadFlag = false;
  let flagContent = null;
  if (fs.existsSync(EVOLVER_ARM_FLAG)) {
    hadFlag = true;
    flagContent = fs.readFileSync(EVOLVER_ARM_FLAG);
    fs.unlinkSync(EVOLVER_ARM_FLAG);
  }
  try {
    return await fn();
  } finally {
    if (savedEnv != null) process.env[EVOLVER_ARM_ENV] = savedEnv;
    if (hadFlag && flagContent != null) fs.writeFileSync(EVOLVER_ARM_FLAG, flagContent);
  }
}

test('RED: evolver role floor holds when disarmed', async () => {
  await withEvolverDisarmed(async () => {
    assert.equal(isEvolverArmed(), false);
    const d = decisionFor(SAFE_EVOLVER_SUBTASK, evolverRole);
    assert.equal(d.class, CLASS.OWNER);
    assert.ok(d.failures.includes('role-floor:owner-gated'));
  });
});

test('GREEN: evolver role floor lifts when armed', async () => {
  await withEvolverArm(async () => {
    assert.equal(isEvolverArmed(), true);
    const d = decisionFor(SAFE_EVOLVER_SUBTASK, evolverRole);
    assert.equal(d.class, CLASS.SELF);
  });
});

test('RED: evolver arming subtask still held even when evolver armed', async () => {
  await withEvolverArm(async () => {
    const d = decisionFor({ ...SAFE_EVOLVER_SUBTASK, id: 'ship', arming: true, blastRadius: 'HIGH' }, evolverRole);
    assert.equal(d.class, CLASS.OWNER);
  });
});
