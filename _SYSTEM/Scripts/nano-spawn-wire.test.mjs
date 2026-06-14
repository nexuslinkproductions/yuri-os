// D4 live-wire verification: spawn_nano reachable through llm-lane's executeTool, DISARMED-degrades END TO
// END at the integration seam (not just at spawnNano's own arm check — the charter's mandated check). The
// Anthropic-shaped descriptor is wired verbatim; Node-1's normalizeTool is what makes that safe. node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTool } from './llm-lane.mjs';

// env hygiene: the swarm must be DISARMED for these (no env arm, no flag file by default in CI/dev).
delete process.env.YURI_NANOSWARM_SPAWN;

test('spawn_nano via executeTool: top-level (no tree ctx) → REFUSED, never throws', async () => {
  delete process.env.YURI_NANO_ROOT_RUN_ID; delete process.env.YURI_NANO_PATH;
  const out = await executeTool('spawn_nano', JSON.stringify({ task: 'x', lane: 'deepseek-v4-pro' }));
  assert.match(out, /REFUSED.*tree context/i);
});

test('spawn_nano via executeTool: with tree ctx but DISARMED → degrades to self-work (no crash)', async () => {
  process.env.YURI_NANO_ROOT_RUN_ID = 'wiretest';
  process.env.YURI_NANO_PATH = 'r';
  process.env.YURI_NANO_DEPTH = '0';
  delete process.env.YURI_NANOSWARM_SPAWN; // disarmed
  try {
    const out = await executeTool('spawn_nano', JSON.stringify({ task: 'x', lane: 'deepseek-v4-pro' }));
    assert.match(out, /spawn disabled \(DISARMED\)/i);
  } finally {
    delete process.env.YURI_NANO_ROOT_RUN_ID;
    delete process.env.YURI_NANO_PATH;
    delete process.env.YURI_NANO_DEPTH;
  }
});

test('spawn_nano via executeTool: bad args do not throw into the tool loop', async () => {
  process.env.YURI_NANO_ROOT_RUN_ID = 'wiretest'; process.env.YURI_NANO_PATH = 'r'; process.env.YURI_NANO_DEPTH = '0';
  try {
    const out = await executeTool('spawn_nano', '{bad json');
    assert.equal(typeof out, 'string'); // executeTool catches bad json → string, never throws
  } finally {
    delete process.env.YURI_NANO_ROOT_RUN_ID; delete process.env.YURI_NANO_PATH; delete process.env.YURI_NANO_DEPTH;
  }
});
