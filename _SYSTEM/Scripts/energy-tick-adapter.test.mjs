import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ADAPTER = path.join(HERE, 'energy-tick-adapter.mjs');

function fixtureDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `yuri-energy-${label}-`));
}

function runAdapter(input, stateDir, extraEnv = {}) {
  return spawnSync(process.execPath, [ADAPTER], {
    cwd: path.resolve(HERE, '../..'),
    encoding: 'utf8',
    input,
    timeout: 10_000,
    env: {
      ...process.env,
      YURI_STATE_DIR: stateDir,
      YURI_USER: 'fixture-user',
      ...extraEnv,
    },
  });
}

test('disabled adapter exits 0 with zero filesystem output', () => {
  const stateDir = fixtureDir('disabled');
  const result = runAdapter(JSON.stringify({ tool_name: 'Edit' }), stateDir, {
    YURI_ENERGY_OBSERVABILITY: '0',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(stateDir), []);
});

test('malformed hook input fails soft and writes nothing', () => {
  const stateDir = fixtureDir('malformed');
  const result = runAdapter('{not-json', stateDir, {
    YURI_ENERGY_OBSERVABILITY: '1',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(stateDir), []);
});

test('enabled PostToolUse transition writes a sanitized atomic snapshot and one trace', () => {
  const stateDir = fixtureDir('enabled');
  const event = {
    session_id: '../session:one',
    tool_name: 'Edit',
    tool_input: { file_path: 'src/app.js' },
    tool_response: { is_error: false },
  };
  const result = runAdapter(JSON.stringify(event), stateDir, {
    YURI_ENERGY_OBSERVABILITY: '1',
  });
  assert.equal(result.status, 0, result.stderr);

  const snapshotPath = path.join(stateDir, 'energy-session', 'sessionone.json');
  assert.equal(fs.existsSync(snapshotPath), true, 'sanitized session snapshot must exist');
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  assert.equal(snapshot.sessionId, 'sessionone');
  assert.equal(snapshot.depth, 1);
  assert.equal(snapshot.state.verifiedEvidenceCount, 1);
  assert.equal(Array.isArray(snapshot.recentSigned), true);
  assert.equal(snapshot.recentSigned.length, 1);
  assert.equal(snapshot.breaker.state, 'CLOSED');

  const traceDir = path.join(stateDir, 'energy-trace');
  const traces = fs.readdirSync(traceDir).filter((name) => name.endsWith('.jsonl'));
  assert.equal(traces.length, 1);
  assert.equal(fs.readFileSync(path.join(traceDir, traces[0]), 'utf8').trim().split('\n').length, 1);
  assert.deepEqual(
    fs.readdirSync(path.join(stateDir, 'energy-session')).filter((name) => name.includes('.tmp-')),
    [],
    'atomic write must not strand a temporary snapshot',
  );
});

test('snapshot write failure is isolated and the adapter still exits 0', () => {
  const parent = fixtureDir('collision');
  const statePath = path.join(parent, 'not-a-directory');
  fs.writeFileSync(statePath, 'fixture');
  const result = runAdapter(JSON.stringify({
    session_id: 'collision',
    tool_name: 'Edit',
    tool_input: { file_path: 'src/app.js' },
    tool_response: { is_error: false },
  }), statePath, { YURI_ENERGY_OBSERVABILITY: '1' });
  assert.equal(result.status, 0, result.stderr);
});

test('a symlinked state root cannot redirect energy writes', () => {
  const parent = fixtureDir('state-root-link');
  const outside = fixtureDir('state-root-outside');
  const linkedState = path.join(parent, 'state');
  fs.symlinkSync(outside, linkedState, 'dir');
  const result = runAdapter(JSON.stringify({
    session_id: 'redirect',
    tool_name: 'Edit',
    tool_input: { file_path: 'src/app.js' },
    tool_response: { is_error: false },
  }), linkedState, { YURI_ENERGY_OBSERVABILITY: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('a symlinked snapshot is rejected without opening or replacing its target', () => {
  const stateDir = fixtureDir('snapshot-link');
  const outside = fixtureDir('snapshot-outside');
  const snapshotDir = path.join(stateDir, 'energy-session');
  fs.mkdirSync(snapshotDir, { recursive: true });
  const target = path.join(outside, 'target.json');
  const original = '{"depth":99,"state":{"verifiedEvidenceCount":99}}\n';
  fs.writeFileSync(target, original);
  const snapshot = path.join(snapshotDir, 'linked.json');
  fs.symlinkSync(target, snapshot);

  const result = runAdapter(JSON.stringify({
    session_id: 'linked',
    tool_name: 'Edit',
    tool_input: { file_path: 'src/app.js' },
    tool_response: { is_error: false },
  }), stateDir, { YURI_ENERGY_OBSERVABILITY: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.lstatSync(snapshot).isSymbolicLink(), true);
  assert.equal(fs.readFileSync(target, 'utf8'), original);
  const traceDir = path.join(stateDir, 'energy-trace');
  assert.equal(fs.existsSync(traceDir), false);
});
