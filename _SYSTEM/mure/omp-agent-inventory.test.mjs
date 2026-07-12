import assert from 'node:assert/strict';
import test from 'node:test';
import { listAgents, listVariants, listModelRefs, inventory } from './omp-agent-inventory.mjs';

test('listAgents returns non-empty array of strings', () => {
  const agents = listAgents();
  assert.ok(Array.isArray(agents), 'must be an array');
  assert.ok(agents.length > 0, 'must have at least one agent');
  for (const name of agents) {
    assert.equal(typeof name, 'string', `agent name must be string: ${name}`);
    assert.ok(name.startsWith('mure-') || name.includes('-'), `agent name should be kebab-prefixed: ${name}`);
  }
});

test('listModelRefs returns sorted unique model refs', () => {
  const refs = listModelRefs();
  assert.ok(Array.isArray(refs), 'must be an array');
  assert.ok(refs.length > 0, 'must have at least one model ref');
  for (let i = 1; i < refs.length; i++) {
    assert.ok(refs[i] > refs[i - 1], `must be sorted: ${refs[i - 1]} < ${refs[i]}`);
  }
  for (const ref of refs) {
    assert.ok(typeof ref === 'string' && ref.length > 0, `model ref must be non-empty string: ${ref}`);
  }
});

test('inventory returns consistent counts', () => {
  const inv = inventory();
  assert.equal(typeof inv.generated, 'string', 'generated must be a string');
  assert.ok(inv.agentCount > 0, 'must have at least one agent');
  assert.ok(inv.totalVariants >= 0, 'variant count must be non-negative');
  assert.ok(inv.modelRefs > 0, 'must have at least one model ref');
  assert.equal(inv.agents.length, inv.agentCount, 'agent array length must match agentCount');
  const computedVariants = inv.agents.reduce((sum, a) => sum + a.variantCount, 0);
  assert.equal(inv.totalVariants, computedVariants, 'totalVariants must equal sum of per-agent variantCounts');
  assert.ok(inv.agents.every((a) => typeof a.name === 'string'), 'every agent must have a name');
  assert.ok(inv.agents.every((a) => typeof a.model === 'string' && a.model.length > 0), 'every agent must have a model');
});

test('all agents in listAgents appear in inventory', () => {
  const agentNames = new Set(listAgents());
  const inv = inventory();
  for (const a of inv.agents) {
    assert.ok(agentNames.has(a.name), `inventory agent ${a.name} must be in listAgents`);
  }
  assert.equal(agentNames.size, inv.agentCount, 'unique agent names must match count');
});

test('listVariants returns valid variant objects across agents', () => {
  const variants = listVariants();
  assert.ok(Array.isArray(variants), 'must be an array');
  assert.ok(variants.length > 0, 'must have at least one variant');
  for (const v of variants) {
    assert.equal(typeof v.agent, 'string', 'variant must have agent name');
    assert.equal(typeof v.id, 'string', 'variant must have id');
    assert.ok(v.model === null || typeof v.model === 'string', 'variant model must be string or null');
  }
  for (let i = 1; i < variants.length; i++) {
    const prev = variants[i - 1];
    const curr = variants[i];
    const cmp = prev.agent.localeCompare(curr.agent) || prev.id.localeCompare(curr.id);
    assert.ok(cmp <= 0, `variants must be sorted: ${prev.agent}/${prev.id} before ${curr.agent}/${curr.id}`);
  }
  const inv = inventory();
  const totalFromInv = inv.agents.reduce((sum, a) => sum + a.variantCount, 0);
  assert.equal(variants.length, totalFromInv, 'variant count must match inventory totalVariants');
});
