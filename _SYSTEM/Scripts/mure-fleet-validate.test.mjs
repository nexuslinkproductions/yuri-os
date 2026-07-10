import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateAgentCardAuthority } from './mure-fleet-validate.mjs';

function writeCard(dir, filename, name) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), `---\nname: ${name}\n---\n`, 'utf8');
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mure-card-authority-'));
  const openclawAgentDir = path.join(root, '.openclaw', 'agents');
  const retiredOmpRoot = path.join(root, '.omp');
  const catalog = {
    source: 'OpenClaw-native agent definitions from .openclaw/agents/',
    agentCardRoot: '.openclaw/agents',
    agents: [{ name: 'mure-alpha' }, { name: 'worker-beta' }],
  };
  writeCard(openclawAgentDir, 'mure-alpha.md', 'mure-alpha');
  writeCard(openclawAgentDir, 'worker-beta.md', 'worker-beta');
  return { root, openclawAgentDir, retiredOmpRoot, catalog };
}

test('OpenClaw-native card authority accepts a complete exact catalog', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  assert.deepEqual(validateAgentCardAuthority(f.catalog, f), []);
});

test('card authority fails closed on missing, mismatched, uncatalogued, and OMP MURE files', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  fs.rmSync(path.join(f.openclawAgentDir, 'worker-beta.md'));
  writeCard(f.openclawAgentDir, 'mure-alpha.md', 'wrong-name');
  writeCard(f.openclawAgentDir, 'extra.md', 'extra');
  writeCard(path.join(f.retiredOmpRoot, 'hooks', 'pre'), 'mure-learn.mjs', 'mure-learn');
  const problems = validateAgentCardAuthority(f.catalog, f);
  assert.ok(problems.includes('missing:worker-beta.md'));
  assert.ok(problems.includes('name-mismatch:mure-alpha.md:wrong-name'));
  assert.ok(problems.includes('uncatalogued:extra.md'));
  assert.ok(problems.some((problem) => problem.startsWith('retired-omp-mure-file:')));
});

test('card authority rejects OMP catalog provenance', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const stale = { ...f.catalog, source: 'OMP agent definitions from .omp/agents/' };
  assert.ok(validateAgentCardAuthority(stale, f).includes('catalog-source-still-omp'));
});
