// Unit coverage for the minimal llm-lane.mjs dispatch core (no live API calls).
// Guards: lane alias resolution, fetch SSRF-deny (isPrivateHost), protected-path deny,
// per-depth output budget, and the gated bash tool (block destructive / git-mutation / .env).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ALIAS, isPrivateHost, isProtectedPath, maxTokensFor, executeTool } from './llm-lane.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

test('ALIAS resolves every lane handle to its models.json key', () => {
  assert.equal(ALIAS.deepseek, 'deepseek-v4-pro');
  assert.equal(ALIAS.ds, 'deepseek-v4-pro');
  assert.equal(ALIAS.kimi, 'kimi-k2.6');
  assert.equal(ALIAS['moonshotai/kimi-k2.6'], 'kimi-k2.6');
  assert.equal(ALIAS.nemotron, 'nemotron-3-ultra-550b-a55b');
  assert.equal(ALIAS.nvidia, 'nemotron-3-ultra-550b-a55b');
  assert.equal(ALIAS['nvidia/nemotron-3-ultra-550b-a55b'], 'nemotron-3-ultra-550b-a55b');
});

test('isPrivateHost blocks every loopback/private/metadata encoding (fetch_url SSRF deny)', () => {
  for (const h of ['127.0.0.1', '[::1]', '::1', '[::ffff:127.0.0.1]', '169.254.169.254',
    'metadata.google.internal', '[fd00::1]', '[fe80::1]', '2130706433', '10.0.0.5',
    '192.168.1.1', '172.16.0.1', 'localhost', 'foo.internal', 'bar.local']) {
    assert.equal(isPrivateHost(h), true, `must block ${h}`);
  }
});

test('isPrivateHost allows public hosts', () => {
  for (const h of ['api.deepseek.com', 'integrate.api.nvidia.com', 'github.com', '1.1.1.1', '8.8.8.8']) {
    assert.equal(isPrivateHost(h), false, `must allow ${h}`);
  }
});

test('isProtectedPath refuses YURI protected surfaces, allows normal repo files', () => {
  for (const p of ['.env', 'backend/data/yuri.db', 'secrets/key.txt', '_SYSTEM/x/id.pem',
    '.claude/state/s.json', '.claude/projects/p/history/h.json', '../escape']) {
    assert.equal(isProtectedPath(path.resolve(REPO, p)), true, `must refuse ${p}`);
  }
  for (const p of ['SOUL.md', '_SYSTEM/Scripts/ai', '02_RESOURCES/CODE-BIBLE/README.md', '.claude/config/models.json']) {
    assert.equal(isProtectedPath(path.resolve(REPO, p)), false, `must allow ${p}`);
  }
});

test('maxTokensFor maps reasoning depth to the per-lane output cap', () => {
  const ds = { max_output: { off: 2048, low: 2048, medium: 4096, high: 16384, xhigh: 131072 } };
  assert.equal(maxTokensFor(ds, 'low'), 2048);
  assert.equal(maxTokensFor(ds, 'high'), 16384);
  assert.equal(maxTokensFor(ds, 'xhigh'), 131072);
  assert.equal(maxTokensFor(ds, 'max'), 131072); // 'max' -> xhigh
  assert.equal(maxTokensFor(ds, ''), 131072);    // default xhigh
});

test('bash tool gate: allows benign, blocks destructive / git-mutation / protected', async () => {
  assert.match(await executeTool('bash', JSON.stringify({ cmd: 'echo hi' })), /hi/);
  assert.match(await executeTool('bash', JSON.stringify({ cmd: 'rm -rf /tmp/zzz' })), /^BLOCKED/);
  assert.match(await executeTool('bash', JSON.stringify({ cmd: 'git push origin main' })), /^BLOCKED/);
  assert.match(await executeTool('bash', JSON.stringify({ cmd: 'git commit -m x' })), /^BLOCKED/);
  assert.match(await executeTool('bash', JSON.stringify({ cmd: 'cat .env' })), /^BLOCKED/);
});

test('read_file tool refuses protected surfaces', async () => {
  assert.match(await executeTool('read_file', JSON.stringify({ path: '.env' })), /^REFUSED/);
  assert.match(await executeTool('read_file', JSON.stringify({ path: 'backend/data/yuri.db' })), /^REFUSED/);
});
