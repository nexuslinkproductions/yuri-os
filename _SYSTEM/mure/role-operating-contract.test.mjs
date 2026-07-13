import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildOmpProjection, renderOmpAgent } from '../Scripts/mure-omp-sync.mjs';
import { validateOperatingContracts } from '../Scripts/mure-fleet-validate.mjs';

const CATALOG_URL = new URL('./agent-catalog.json', import.meta.url);

// The seven high-value roles that must expose a provider-neutral operating contract.
const OPERATING_CONTRACT_ROLES = [
  'mure-helmsman', 'mure-architect', 'mure-deliberator', 'mure-kernelsmith',
  'mure-engineer', 'mure-adjudicator', 'mure-oracle',
];
const REQUIRED_KEYS = ['method', 'artifact', 'stop', 'handoff'];
// Provider/model tokens that must never leak into a provider-neutral contract.
const PROVIDER_TOKENS = ['gpt', 'claude', 'opus', 'sonnet', 'haiku', 'glm', 'gemini', 'grok', 'kimi', 'qwen', 'mimo', 'minimax', 'openai', 'anthropic', 'zai', 'ollama', 'cursor', 'deepseek', 'fable'];

async function loadCatalog() {
  return JSON.parse(await readFile(CATALOG_URL, 'utf8'));
}

/** Find the projected base card (variant == null) for a role name. */
function baseCard(projection, roleName) {
  return projection.cards.find((c) => c.cardName === roleName && c.variant == null);
}

test('live catalog passes validateOperatingContracts', async () => {
  const catalog = await loadCatalog();
  assert.deepEqual(validateOperatingContracts(catalog), []);
});

test('catalog: all seven roles carry a complete operating contract object', async () => {
  const catalog = await loadCatalog();
  for (const role of OPERATING_CONTRACT_ROLES) {
    const agent = catalog.agents.find((a) => a.name === role);
    assert.ok(agent, `${role}: missing from catalog`);
    const oc = agent.operatingContract;
    assert.ok(oc && typeof oc === 'object' && !Array.isArray(oc), `${role}: operatingContract is not an object`);
    for (const key of REQUIRED_KEYS) {
      assert.ok(typeof oc[key] === 'string' && oc[key].trim().length >= 12,
        `${role}: ${key} is missing or too short`);
    }
  }
});

test('projection: every role base card renders the Operating Contract block with all four fields', async () => {
  const projection = buildOmpProjection(await loadCatalog());
  for (const role of OPERATING_CONTRACT_ROLES) {
    const card = baseCard(projection, role);
    assert.ok(card, `${role}: missing projected base card`);
    const rendered = renderOmpAgent(card);
    assert.match(rendered, /\*\*Operating Contract:\*\*/, `${role}: no Operating Contract block`);
    for (const key of REQUIRED_KEYS) {
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      assert.ok(rendered.includes(`**${label}:**`), `${role}: ${key} field not projected`);
    }
  }
});

test('projection: the contract is role-level — variant cards of contracted roles carry it too', async () => {
  const projection = buildOmpProjection(await loadCatalog());
  for (const role of OPERATING_CONTRACT_ROLES) {
    const variants = projection.cards.filter((c) => c.agent?.name === role && c.variant != null);
    assert.ok(variants.length > 0, `${role}: expected at least one variant to verify role-level projection`);
    for (const card of variants) {
      assert.match(renderOmpAgent(card), /\*\*Operating Contract:\*\*/,
        `${card.cardName}: variant dropped the role-level operating contract`);
    }
  }
});

test('operating contracts are provider-neutral (no model/provider tokens)', async () => {
  const catalog = await loadCatalog();
  for (const role of OPERATING_CONTRACT_ROLES) {
    const oc = catalog.agents.find((a) => a.name === role).operatingContract;
    const lc = REQUIRED_KEYS.map((k) => String(oc[k] || '').toLowerCase()).join(' ');
    for (const token of PROVIDER_TOKENS) {
      assert.equal(lc.includes(token), false, `${role}: operating contract leaks provider token "${token}"`);
    }
  }
});

test('projection: a card without operatingContract renders no Operating Contract block', () => {
  const base = {
    cardName: 'x-role', description: 'd', catalogModel: 'm', variant: null,
    resolution: { status: 'OK', selector: 'p/m' }, tools: ['read'], role: 'verification',
    mission: 'm', capabilities: ['c'], skills: [], notes: null, systemSections: [], variantPurpose: null,
  };
  assert.equal(renderOmpAgent({ ...base, operatingContract: null }).includes('**Operating Contract:**'), false);
});

test('validator bites: a missing contract is rejected', async () => {
  const catalog = await loadCatalog();
  const missing = structuredClone(catalog);
  delete missing.agents.find((a) => a.name === 'mure-engineer').operatingContract;
  const problems = validateOperatingContracts(missing);
  assert.ok(problems.includes('operating-contract-missing:mure-engineer'),
    `expected operating-contract-missing, got: ${problems.join('; ')}`);
});

test('validator bites: an empty or malformed field is rejected', async () => {
  const catalog = await loadCatalog();
  const emptied = structuredClone(catalog);
  emptied.agents.find((a) => a.name === 'mure-helmsman').operatingContract.method = '';
  const p1 = validateOperatingContracts(emptied);
  assert.ok(p1.includes('operating-contract-field-invalid:mure-helmsman:method'),
    `expected field-invalid for empty method, got: ${p1.join('; ')}`);

  const shortField = structuredClone(catalog);
  shortField.agents.find((a) => a.name === 'mure-architect').operatingContract.stop = 'too short';
  const p2 = validateOperatingContracts(shortField);
  assert.ok(p2.includes('operating-contract-field-invalid:mure-architect:stop'),
    `expected field-invalid for short stop, got: ${p2.join('; ')}`);

  const wrongType = structuredClone(catalog);
  wrongType.agents.find((a) => a.name === 'mure-oracle').operatingContract.handoff = 42;
  const p3 = validateOperatingContracts(wrongType);
  assert.ok(p3.includes('operating-contract-field-invalid:mure-oracle:handoff'),
    `expected field-invalid for non-string handoff, got: ${p3.join('; ')}`);
});

test('validator bites: a duplicate (non-role-distinct) contract is rejected', async () => {
  const catalog = await loadCatalog();
  const duplicated = structuredClone(catalog);
  // Copy adjudicator's full contract onto oracle — a byte-identical duplicate.
  duplicated.agents.find((a) => a.name === 'mure-oracle').operatingContract =
    structuredClone(catalog.agents.find((a) => a.name === 'mure-adjudicator').operatingContract);
  const problems = validateOperatingContracts(duplicated);
  assert.ok(problems.some((p) => p.startsWith('operating-contract-duplicate:mure-oracle:')),
    `expected operating-contract-duplicate, got: ${problems.join('; ')}`);
});

test('validator bites: a non-object contract is rejected as missing', async () => {
  const catalog = await loadCatalog();
  const malformed = structuredClone(catalog);
  malformed.agents.find((a) => a.name === 'mure-deliberator').operatingContract = 'not an object';
  const problems = validateOperatingContracts(malformed);
  assert.ok(problems.includes('operating-contract-missing:mure-deliberator'),
    `expected operating-contract-missing for non-object, got: ${problems.join('; ')}`);
});

test('validator bites: an array contract is rejected as missing', async () => {
  const catalog = await loadCatalog();
  const malformed = structuredClone(catalog);
  malformed.agents.find((a) => a.name === 'mure-kernelsmith').operatingContract = ['method', 'artifact'];
  const problems = validateOperatingContracts(malformed);
  assert.ok(problems.includes('operating-contract-missing:mure-kernelsmith'),
    `expected operating-contract-missing for array, got: ${problems.join('; ')}`);
});

test('mure-helmsman-glm (goal-spine orchestrator twin) carries + projects an Operating Contract', async () => {
  const catalog = await loadCatalog();
  const agent = catalog.agents.find((a) => a.name === 'mure-helmsman-glm');
  assert.ok(agent.operatingContract && typeof agent.operatingContract === 'object' && !Array.isArray(agent.operatingContract),
    'mure-helmsman-glm: operatingContract is missing or not an object');
  for (const key of REQUIRED_KEYS) {
    assert.ok(typeof agent.operatingContract[key] === 'string' && agent.operatingContract[key].trim().length >= 12,
      `mure-helmsman-glm: ${key} missing or too short`);
  }
  const projection = buildOmpProjection(catalog);
  const card = baseCard(projection, 'mure-helmsman-glm');
  assert.ok(card, 'mure-helmsman-glm: missing projected base card');
  const rendered = renderOmpAgent(card);
  assert.match(rendered, /\*\*Operating Contract:\*\*/, 'mure-helmsman-glm: no Operating Contract block');
  for (const key of REQUIRED_KEYS) {
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    assert.ok(rendered.includes(`**${label}:**`), `mure-helmsman-glm: ${key} field not projected`);
  }
});

test('helmsman/glm twin contracts are intentionally shared (twin exemption holds; non-twin copy still bites)', async () => {
  const catalog = await loadCatalog();
  // The live twin pair shares one contract by design — must NOT trip role-distinct.
  assert.deepEqual(validateOperatingContracts(catalog), []);
  // A genuine cross-role duplicate (non-twin) still bites — the exemption is scoped to the helmsman family.
  const dup = structuredClone(catalog);
  dup.agents.find((a) => a.name === 'mure-oracle').operatingContract =
    structuredClone(catalog.agents.find((a) => a.name === 'mure-adjudicator').operatingContract);
  const problems = validateOperatingContracts(dup);
  assert.ok(problems.some((p) => p.startsWith('operating-contract-duplicate:mure-oracle:')),
    `expected operating-contract-duplicate for the non-twin copy, got: ${problems.join('; ')}`);
});

test('validator covers mure-helmsman-glm: an intentional omission is rejected', async () => {
  const catalog = await loadCatalog();
  const stripped = structuredClone(catalog);
  delete stripped.agents.find((a) => a.name === 'mure-helmsman-glm').operatingContract;
  const problems = validateOperatingContracts(stripped);
  assert.ok(problems.includes('operating-contract-missing:mure-helmsman-glm'),
    `expected operating-contract-missing for mure-helmsman-glm, got: ${problems.join('; ')}`);
});
