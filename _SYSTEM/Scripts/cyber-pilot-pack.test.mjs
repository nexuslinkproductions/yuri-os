import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildCyberPilotPack,
  validatePilotInputs,
  writeCyberPilotPack,
} from './cyber-pilot-pack.mjs';

test('cyber pilot pack builds Upgreat, regional, and managed-ops artifacts from evidence', () => {
  const pack = buildCyberPilotPack();

  assert.equal(pack.schema, 'yuri.cyber-pilot-pack.v0');
  assert.equal(pack.validation.ok, true);
  assert.equal(pack.upgreat.proofStatus.threatRows, 90);
  assert.ok(pack.upgreat.proofStatus.provenRails >= 7);
  assert.equal(pack.regional.length, 3);
  assert.deepEqual(pack.regional.map((region) => region.region), ['europe', 'west', 'asia']);
  assert.equal(pack.managedOps.currentState, 'Not ready to claim managed security operations.');
});

test('cyber pilot pack validation rejects missing regions and unsupported proven rails', () => {
  const pack = buildCyberPilotPack();
  const invalidThreatIntel = structuredClone({
    ok: true,
    rows: pack.regional[0].topThreats,
    summary: { regionCounts: { europe: 1 }, buildRows: 1, watchRows: 0 },
  });
  const invalidProofMatrix = {
    validation: { proven: 2 },
    proofs: [
      { lab_id: 'missing-executable', proof_state: 'proven', executable_test: null },
      { lab_id: 'overclaim', proof_state: 'proven', executable_test: '_SYSTEM/Scripts/cyber-lab-runner.test.mjs', claim: 'Production rail proven.' },
    ],
  };
  const validation = validatePilotInputs({
    threatIntel: invalidThreatIntel,
    securityLens: { modules: [1, 2, 3, 4] },
    proofMatrix: invalidProofMatrix,
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /at least 80 threat rows/);
  assert.match(validation.errors.join('\n'), /missing regional coverage: asia/);
  assert.match(validation.errors.join('\n'), /proven rail without executable test/);
  assert.match(validation.errors.join('\n'), /overclaims beyond local fixture proof/);
});

test('cyber pilot pack writes all C6-C8 markdown artifacts', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-cyber-pilot-pack-'));
  try {
    const result = writeCyberPilotPack({
      upgreatPath: path.join(dir, 'upgreat.md'),
      regionalPath: path.join(dir, 'regional.md'),
      managedOpsPath: path.join(dir, 'managed-ops.md'),
    });

    assert.equal(result.ok, true);
    assert.equal(existsSync(result.upgreatPath), true);
    assert.equal(existsSync(result.regionalPath), true);
    assert.equal(existsSync(result.managedOpsPath), true);
    assert.match(readFileSync(result.upgreatPath, 'utf8'), /YURI Upgreat Pilot Readiness/);
    assert.match(readFileSync(result.regionalPath, 'utf8'), /Asia \/ APAC/);
    assert.match(readFileSync(result.managedOpsPath, 'utf8'), /Not ready to claim managed security operations/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
