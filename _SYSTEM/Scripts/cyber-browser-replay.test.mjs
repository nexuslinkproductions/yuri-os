import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildCyberBrowserReplay,
  validateCyberBrowserReplay,
  writeCyberBrowserReplay,
} from './cyber-browser-replay.mjs';

test('cyber browser replay builds local read-only replay proof', () => {
  const proof = buildCyberBrowserReplay();

  assert.equal(proof.schema, 'yuri.cyber-browser-replay.v0');
  assert.equal(proof.validation.ok, true, proof.validation.errors.join('\n'));
  assert.equal(proof.replay.external_targets_allowed, false);
  assert.equal(proof.replay.read_only, true);
  assert.equal(proof.browserLab.state, 'proven');
  assert.match(proof.fileUrl, /^file:/u);
  assert.match(proof.claim, /replay proof only/i);
});

test('cyber browser replay validation rejects external and mutating replay', () => {
  const proof = buildCyberBrowserReplay();
  const invalid = structuredClone(proof);
  invalid.replay.url = 'https://example.com/login';
  invalid.replay.external_targets_allowed = true;
  invalid.replay.forms[0].submitted = true;
  invalid.replay.text = 'ordinary page';
  invalid.browserLab.state = 'failed';
  invalid.claim = 'production browser-agent proof';

  const validation = validateCyberBrowserReplay(invalid);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /not file/);
  assert.match(validation.errors.join('\n'), /external targets/);
  assert.match(validation.errors.join('\n'), /submitted/);
  assert.match(validation.errors.join('\n'), /fixture text missing/);
  assert.match(validation.errors.join('\n'), /not proven/);
  assert.match(validation.errors.join('\n'), /overstates/);
});

test('cyber browser replay writes JSON and markdown artifacts', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-browser-replay-'));
  try {
    const jsonPath = path.join(dir, 'browser-replay.json');
    const reportPath = path.join(dir, 'browser-replay.md');
    const result = writeCyberBrowserReplay({ jsonPath, reportPath });
    const markdown = readFileSync(reportPath, 'utf8');
    const json = JSON.parse(readFileSync(jsonPath, 'utf8'));

    assert.equal(result.ok, true);
    assert.equal(existsSync(jsonPath), true);
    assert.equal(existsSync(reportPath), true);
    assert.equal(json.validation.ok, true);
    assert.match(markdown, /YURI Browser Replay Proof/);
    assert.match(markdown, /no external target activity/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
