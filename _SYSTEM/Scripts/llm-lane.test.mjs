// Unit coverage for the minimal llm-lane.mjs dispatch core (no live API calls).
// Guards: lane alias resolution, fetch SSRF-deny (isPrivateHost), protected-path deny,
// per-depth output budget, and the gated bash tool (block destructive / git-mutation / .env).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ALIAS, ALLOWED_HOSTS, LANES, isPrivateHost, isProtectedPath, maxTokensFor, executeTool, postChatOllamaCloud } from './llm-lane.mjs';
import { coreOnDispatch, coreOnResult } from './lane-core-hooks.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

test('ALIAS resolves every lane handle to its models.json key', () => {
  assert.equal(ALIAS.deepseek, 'deepseek-v4-pro');
  assert.equal(ALIAS.ds, 'deepseek-v4-pro');
  assert.equal(ALIAS['ds-flash'], 'deepseek-v4-flash');
  assert.equal(ALIAS.flash, 'deepseek-v4-flash');
  // Mimo (Anthropic-protocol, token-plan endpoint) replaced the retired NVIDIA NIM kimi/nemotron lanes.
  assert.equal(ALIAS.mimo, 'mimo-v2.5-pro[1m]');
  assert.equal(ALIAS['mimo-v2.5-pro'], 'mimo-v2.5-pro[1m]');
  assert.equal(ALIAS['mimo-v2.5-pro[1m]'], 'mimo-v2.5-pro[1m]');
  assert.equal(ALIAS['mimo-v2.5'], 'mimo-v2.5[1m]');
  assert.equal(ALIAS['mimo-v2.5[1m]'], 'mimo-v2.5[1m]');
  assert.equal(ALIAS['mimo-flash'], 'mimo-v2-flash');
  assert.equal(ALIAS['mimo-v2-flash'], 'mimo-v2-flash');
  // Retired NIM handles must no longer resolve.
  assert.equal(ALIAS.kimi, undefined);
  assert.equal(ALIAS.nemotron, undefined);
  assert.equal(ALIAS.nvidia, undefined);
  // Ollama cloud peer lane — every handle resolves to the ollama-cloud models.json key.
  assert.equal(ALIAS.ollama, 'ollama-cloud');
  assert.equal(ALIAS['ollama-cloud'], 'ollama-cloud');
  assert.equal(ALIAS['ollama-pro'], 'ollama-cloud');
  assert.equal(ALIAS.oc, 'ollama-cloud');
  // GLM tier roster (opus-fleet): glm-max=5.2 workhorse lane `glm`=4.7 — intentional, not ZAI_MODEL default.
  assert.equal(ALIAS['glm-max'], 'glm-5.2');
  assert.equal(ALIAS.glm, 'glm-4.7');
  assert.equal(ALIAS['glm-5.2'], 'glm-5.2');
  assert.equal(ALIAS['glm-flash'], 'glm-5-turbo');
  assert.equal(LANES[ALIAS['glm-max']].model, 'glm-5.2');
  assert.equal(LANES[ALIAS.glm].model, 'glm-4.7');
});

test('ollama-cloud is a first-class peer lane: ollama.com allowlisted, cloud protocol, keyed, full toolset', () => {
  // Host must be on the lane-endpoint SSRF allowlist or dispatch fails closed.
  assert.ok(ALLOWED_HOSTS.has('ollama.com'));
  const cfg = LANES['ollama-cloud'];
  assert.ok(cfg, 'ollama-cloud lane present in models.json');
  assert.equal(cfg.protocol, 'ollama-cloud');
  assert.equal(cfg.provider, 'ollama-cloud');
  assert.equal(cfg.api_key_env, 'OLLAMA_API_KEY'); // peer = keyed, unlike loopback local lanes
  assert.notEqual(cfg.local, true);                // cloud, not loopback → full YURI loadout + tools
  assert.equal(typeof postChatOllamaCloud, 'function');
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

test('grep tool never returns protected-surface matches (no-path root grep)', async () => {
  // Pattern that exists across the repo incl. protected dirs; result must contain zero protected paths.
  const out = await executeTool('grep', JSON.stringify({ pattern: 'API_KEY' }));
  const leaked = out.split('\n').filter((l) => /(^|\/)\.env|\/secrets\/|\/backend\/data\/|\/\.claude\/(state|history|file-history)/.test(l));
  assert.equal(leaked.length, 0, `grep leaked protected paths: ${leaked.slice(0, 2).join(' | ')}`);
});

test('coreOnDispatch fires without throwing, returns stable runId + string recallBlock', async () => {
  const r = await coreOnDispatch({ lane: 'deepseek-v4-pro', prompt: 'energy gate', runId: 'test-run-1' });
  assert.equal(typeof r.recallBlock, 'string');
  assert.equal(r.runId, 'test-run-1');
});

test('coreOnResult writes lane_output + pulse records carrying the runId', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lane-hooks-'));
  process.env.YURI_MEMORY_LEDGER_PATH = path.join(dir, 'ledger.jsonl');
  process.env.YURI_LANE_PULSE_PATH = path.join(dir, 'pulse.jsonl');
  try {
    coreOnResult({ lane: 'deepseek-v4-pro', prompt: 'q', output: 'answer', exitCode: 0, runId: 'test-run-2' });
    const led = JSON.parse(fs.readFileSync(process.env.YURI_MEMORY_LEDGER_PATH, 'utf8').trim().split('\n').pop());
    const pul = JSON.parse(fs.readFileSync(process.env.YURI_LANE_PULSE_PATH, 'utf8').trim().split('\n').pop());
    assert.equal(led.type, 'lane_output'); assert.equal(led.runId, 'test-run-2');
    assert.equal(pul.type, 'pulse'); assert.equal(pul.source, 'docked-llm');
    assert.equal(pul.authority, 'advisory_only'); assert.equal(pul.runId, 'test-run-2');
  } finally {
    delete process.env.YURI_MEMORY_LEDGER_PATH;
    delete process.env.YURI_LANE_PULSE_PATH;
  }
});
