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

function xref(query, extra = []) {
  const stdout = execFileSync(process.execPath, [
    '_SYSTEM/Scripts/xref-query.mjs',
    query,
    '--json',
    '--top',
    '200',
    ...extra,
  ], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
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

test('xref navigation packet is the active navigation manifest', () => {
  const registry = readRegistry();
  const packet = (registry.packets || []).find((entry) => entry.id === 'xref-navigation');

  assert.ok(packet, 'xref-navigation packet missing');
  assert.ok(packet.paths.includes('_SYSTEM/Scripts/xref-query.mjs'));
  assert.ok(packet.paths.includes('_SYSTEM/Scripts/propagation-scan.mjs'));
  assert.ok(packet.paths.includes('_SYSTEM/Scripts/xref-provenance.mjs'));
  assert.equal(JSON.stringify(registry).includes(`_SYSTEM/Scripts/${['rick', 'repl.mjs'].join('-')}`), false);
  assert.equal(JSON.stringify(registry).includes(`_SYSTEM/Scripts/${['context', 'router.mjs'].join('-')}`), false);
});

test('xref-query locates the Gemma/Ollama llm compat lane', () => {
  const result = xref('Gemma local llm compat Ollama lane');
  const paths = result.merged.map((entry) => entry.path);

  assert.equal(result.ok, true);
  assert.equal(result.requestedTop, 200);
  assert.ok(result.candidatePlan.fts5 >= 1000);
  assert.ok(result.candidatePlan.gitnexus >= 200);
  assert.equal(result.structuralLegAvailable, true);
  assert.ok(result.counts.merged > 0);
  assert.ok(Array.isArray(result.recall));
  assert.ok(result.recall.length >= result.counts.merged);
  assert.ok(paths.includes('_SYSTEM/Scripts/ollama-lane.mjs') || paths.includes('_SYSTEM/Scripts/ollama-adapter.mjs'));
  assert.ok(paths.includes('_SYSTEM/Scripts/llm-compat-contract.mjs'));
});

test('propagation law dry-run works for the xref node', () => {
  const stdout = execFileSync(process.execPath, [
    '_SYSTEM/Scripts/propagation-scan.mjs',
    'XREF_QUERY',
    '--dry-run',
  ], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });

  assert.match(stdout, /propagation-scan "XREF_QUERY"/);
  assert.match(stdout, /structural leg FRESH/);
  assert.match(stdout, /no backlog write: dry-run/);
});
