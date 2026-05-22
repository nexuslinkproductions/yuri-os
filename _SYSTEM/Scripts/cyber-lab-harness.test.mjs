import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  LAB_DEFINITIONS,
  buildCyberLabHarness,
  materializeCyberLabHarness,
  validateCyberLabHarness,
} from './cyber-lab-harness.mjs';

test('cyber lab harness builds disabled local fixture labs only', () => {
  const harness = buildCyberLabHarness();

  assert.equal(harness.schema, 'yuri.cyber-lab-harness.v0');
  assert.equal(harness.validation.ok, true);
  assert.equal(harness.labs.length, LAB_DEFINITIONS.length);

  for (const lab of harness.labs) {
    assert.equal(lab.enabled, false, `${lab.id} must be disabled by default`);
    assert.equal(lab.runMode, 'fixture-only');
    assert.equal(lab.externalTargetsAllowed, false);
    assert.match(lab.boundary, /owned-local-synthetic-or-explicitly-authorized-only/);
    assert.ok(lab.relatedThreats.length > 0, `${lab.id} should map threat rows`);
  }
});

test('cyber lab harness validation fails closed on unsafe execution settings', () => {
  const harness = buildCyberLabHarness();
  const unsafe = structuredClone(harness);
  unsafe.labs[0].enabled = true;
  unsafe.labs[1].externalTargetsAllowed = true;
  unsafe.labs[2].boundary = 'internet-wide';

  const validation = validateCyberLabHarness(unsafe);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /disabled by default/);
  assert.match(validation.errors.join('\n'), /external targets/);
  assert.match(validation.errors.join('\n'), /safe ownership boundary/);
});

test('cyber lab harness materializes manifest and safe fixtures', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-cyber-lab-'));
  try {
    const result = materializeCyberLabHarness({ labRoot: dir });
    const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8'));
    const browserFixture = path.join(dir, 'fixtures', 'browser-agent-fake-portal.html');
    const mcpFixture = path.join(dir, 'fixtures', 'malicious-mcp-tool-schema.json');

    assert.equal(result.ok, true);
    assert.equal(manifest.validation.ok, true);
    assert.equal(existsSync(browserFixture), true);
    assert.equal(existsSync(mcpFixture), true);
    assert.match(readFileSync(browserFixture, 'utf8'), /FAKE_TOKEN_DO_NOT_USE/);
    assert.match(readFileSync(mcpFixture, 'utf8'), /tool-description-sanitized/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
