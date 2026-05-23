#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import path from 'node:path';

const REPO = process.cwd();
const REGISTRY_PATH = path.join(REPO, '_SYSTEM/context/context-registry.json');

function readRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
}

function route(task) {
  const stdout = execFileSync(process.execPath, ['_SYSTEM/Scripts/context-router.mjs', task], {
    cwd: REPO,
    encoding: 'utf8',
  });
  return JSON.parse(stdout);
}

test('context registry packet paths exist', () => {
  const registry = readRegistry();
  const missing = [];

  for (const packet of registry.packets || []) {
    for (const packetPath of packet.paths || []) {
      if (!existsSync(path.join(REPO, packetPath))) {
        missing.push(`${packet.id}:${packetPath}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});

test('cybersecurity packet routes to current cyber supercharge evidence', () => {
  const result = route('cybersecurity threat intelligence Upgreat guardrail lab');
  const paths = result.selectedPacket.paths.map((entry) => entry.path);

  assert.equal(result.selectedPacket.id, 'cybersecurity');
  assert.ok(paths.includes('_SYSTEM/docs/YURI_OS_CYBERSECURITY_COMPANY_SUPERCHARGE_GOAL_2026-05-22.md'));
  assert.ok(paths.includes('_SYSTEM/docs/YURI_CYBER_INTELLIGENCE_MATRIX_2026-05-22.md'));
  assert.ok(paths.includes('_SYSTEM/docs/YURI_GLOBAL_CYBER_THREAT_INTEL_INGESTION_PROTOCOL_2026-05-22.md'));
  assert.equal(result.selectedPacket.paths.every((entry) => entry.exists), true);
});

test('memory and automation packets do not point at removed scripts', () => {
  for (const task of ['memory rag recall wiki', 'automation launchd stale daemon health']) {
    const result = route(task);
    assert.equal(result.selectedPacket.paths.every((entry) => entry.exists), true);
  }
});
