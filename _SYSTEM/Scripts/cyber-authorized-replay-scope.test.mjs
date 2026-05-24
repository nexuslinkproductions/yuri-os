import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildAuthorizedReplayScope,
  validateAuthorizedReplayScope,
  writeAuthorizedReplayScope,
} from './cyber-authorized-replay-scope.mjs';

test('authorized replay scope fails closed without written authorization', () => {
  const scope = buildAuthorizedReplayScope();

  assert.equal(scope.schema, 'yuri.cyber-authorized-replay-scope.v0');
  assert.equal(scope.validation.ok, true, scope.validation.errors.join('\n'));
  assert.equal(scope.releaseAllowed, false);
  assert.match(scope.validation.blockers.join('\n'), /written authorization missing/);
  assert.ok(scope.forbiddenActions.some((action) => /external scanning/i.test(action)));
});

test('authorized replay scope can become ready with complete authorization metadata', () => {
  const scope = buildAuthorizedReplayScope({
    authorization: {
      writtenAuthorization: true,
      authorizedBy: 'client-owner',
      authorizationReference: 'signed-scope-001',
      timeWindow: '2026-05-24T10:00:00Z/2026-05-24T12:00:00Z',
      emergencyStopContact: 'client-security-owner',
    },
    allowedSurfaces: ['client-owned staging AI-agent workflow'],
    allowedActions: ['read-only DOM/CDP inspection', 'report-only finding documentation'],
  });

  assert.equal(scope.validation.ok, true, scope.validation.errors.join('\n'));
  assert.deepEqual(scope.validation.blockers, []);
  assert.equal(scope.releaseAllowed, true);
});

test('authorized replay scope rejects offensive actions in allowed scope', () => {
  const scope = buildAuthorizedReplayScope({
    authorization: {
      writtenAuthorization: true,
      authorizedBy: 'client-owner',
      authorizationReference: 'signed-scope-001',
      timeWindow: 'window',
      emergencyStopContact: 'contact',
    },
    allowedActions: ['credential capture and exfiltration'],
  });

  const validation = validateAuthorizedReplayScope(scope);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /forbidden offensive action/);
});

test('authorized replay scope writes blocked report by default', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-authorized-scope-'));
  try {
    const jsonPath = path.join(dir, 'scope.json');
    const reportPath = path.join(dir, 'scope.md');
    const result = writeAuthorizedReplayScope({ jsonPath, reportPath });
    const markdown = readFileSync(reportPath, 'utf8');
    const json = JSON.parse(readFileSync(jsonPath, 'utf8'));

    assert.equal(result.ok, true);
    assert.equal(existsSync(jsonPath), true);
    assert.equal(existsSync(reportPath), true);
    assert.equal(json.releaseAllowed, false);
    assert.match(markdown, /YURI Authorized Replay Scope/);
    assert.match(markdown, /written authorization missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
