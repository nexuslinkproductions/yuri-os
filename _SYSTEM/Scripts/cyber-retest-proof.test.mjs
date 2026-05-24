import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildCyberRetestProof,
  validateCyberRetestProof,
  writeCyberRetestProof,
} from './cyber-retest-proof.mjs';

test('cyber retest proof builds before/after local fixture rows', () => {
  const proof = buildCyberRetestProof();

  assert.equal(proof.schema, 'yuri.cyber-retest-proof.v0');
  assert.equal(proof.validation.ok, true);
  assert.equal(proof.retests.length, 7);
  assert.equal(proof.validation.proven, 7);
  assert.ok(proof.retests.every((retest) => retest.state === 'retest-proven'));
  assert.ok(proof.retests.every((retest) => retest.before.total > 0));
  assert.ok(proof.retests.every((retest) => retest.after.total > 0));
  assert.ok(proof.retests.every((retest) => /retest proof only/i.test(retest.claim)));
});

test('cyber retest proof validation rejects overclaims and missing after controls', () => {
  const proof = buildCyberRetestProof();
  proof.retests[0].claim = 'Production deployment proof is guaranteed.';
  proof.retests[1].after.cases = [];
  proof.retests[1].after.total = 0;
  proof.retests[2].external_targets_allowed = true;

  const validation = validateCyberRetestProof(proof);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /overclaims|forbidden maturity|missing after|allows external/);
});

test('cyber retest proof writes JSON and markdown artifacts', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-cyber-retest-proof-'));
  try {
    const jsonPath = path.join(dir, 'retest.json');
    const reportPath = path.join(dir, 'retest.md');
    const result = writeCyberRetestProof({ jsonPath, reportPath });
    const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const markdown = readFileSync(reportPath, 'utf8');

    assert.equal(result.ok, true);
    assert.equal(existsSync(jsonPath), true);
    assert.equal(json.validation.ok, true);
    assert.match(markdown, /YURI Cyber Retest Proof/);
    assert.match(markdown, /before\/after motion/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
