import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildOmpProjection, renderOmpAgent } from '../Scripts/mure-omp-sync.mjs';
import { validateProjectedRoleAuthority } from '../Scripts/mure-fleet-validate.mjs';

const CATALOG_URL = new URL('./agent-catalog.json', import.meta.url);
const FLEET_ROLES_URL = new URL('../config/fleet-roles.json', import.meta.url);

const AUTHORITY_ROLES = ['mure-helmsman', 'mure-architect', 'mure-engineer', 'mure-adjudicator', 'mure-oracle'];
const VERIFIER_ROLES = ['mure-adjudicator', 'mure-oracle'];
// Provider/model tokens that must never leak into a provider-neutral authority boundary.
const PROVIDER_TOKENS = ['gpt', 'claude', 'opus', 'sonnet', 'haiku', 'glm', 'gemini', 'grok', 'kimi', 'qwen', 'mimo', 'minimax', 'openai', 'anthropic', 'zai', 'ollama', 'cursor', 'deepseek', 'fable'];

async function loadCatalog() {
  return JSON.parse(await readFile(CATALOG_URL, 'utf8'));
}

/** Extract the rendered `**Authority:**` line body for a base role card. */
function authorityLine(projection, roleName) {
  const card = projection.cards.find((c) => c.cardName === roleName && c.variant == null);
  if (!card) return null;
  const m = renderOmpAgent(card).match(/\*\*Authority:\*\*\s*(.+)/);
  return m ? m[1].trim() : undefined;
}

test('projector renders an Authority line iff the card carries an authorityBoundary', () => {
  const base = {
    cardName: 'x-role', description: 'd', catalogModel: 'm', variant: null,
    resolution: { status: 'OK', selector: 'p/m' }, tools: ['read'], role: 'verification',
    mission: 'm', capabilities: ['c'], skills: [], notes: null, systemSections: [], variantPurpose: null,
  };
  const withBoundary = renderOmpAgent({ ...base, authorityBoundary: 'boundary text here' });
  assert.match(withBoundary, /\*\*Authority:\*\* boundary text here/);
  const withoutBoundary = renderOmpAgent({ ...base, authorityBoundary: null });
  assert.equal(withoutBoundary.includes('**Authority:**'), false);
});

test('live catalog passes validateProjectedRoleAuthority', async () => {
  const catalog = await loadCatalog();
  assert.deepEqual(validateProjectedRoleAuthority(catalog), []);
});

test('every authority-bearing role projects a non-empty Authority line naming Control + final acceptance', async () => {
  const projection = buildOmpProjection(await loadCatalog());
  for (const role of AUTHORITY_ROLES) {
    const authority = authorityLine(projection, role);
    assert.ok(authority && authority.length > 0, `${role}: missing Authority line`);
    assert.match(authority, /\bretain(s|ed)?\b[^.]*\bfinal acceptance\b/i, `${role}: no upward final-acceptance`);
    assert.match(authority.toLowerCase(), /control/, `${role}: does not name Control`);
  }
});

test('verifier cards read as independent + advisory and deny self-acceptance', async () => {
  const projection = buildOmpProjection(await loadCatalog());
  for (const role of VERIFIER_ROLES) {
    const lc = authorityLine(projection, role).toLowerCase();
    assert.match(lc, /independent/, `${role}: not independent`);
    assert.match(lc, /advisory/, `${role}: not advisory`);
    assert.match(lc, /may not accept/, `${role}: does not deny acceptance`);
  }
});

test('authority projection matches the fleet-roles finalizeAuthority registry', async () => {
  const [catalog, registry] = await Promise.all([
    loadCatalog(),
    readFile(FLEET_ROLES_URL, 'utf8').then((s) => JSON.parse(s)),
  ]);
  const projection = buildOmpProjection(catalog);
  const finalizeById = new Map(registry.roles.map((r) => [`mure-${r.id}`, r.finalizeAuthority]));
  for (const role of AUTHORITY_ROLES) {
    const authority = authorityLine(projection, role);
    const holdsFinalize = /\bholds\b[^.]*\bfinalize\b/i.test(authority);
    if (finalizeById.get(role) === true) {
      assert.ok(holdsFinalize, `${role}: registry finalizeAuthority=true but projected authority does not hold finalize`);
    } else {
      assert.equal(holdsFinalize, false, `${role}: registry finalizeAuthority=false but projected authority claims finalize`);
    }
  }
  // Only Helmsman holds finalize among the five — the exclusivity guarantee.
  assert.equal(finalizeById.get('mure-helmsman'), true);
  for (const role of ['mure-architect', 'mure-engineer', 'mure-adjudicator', 'mure-oracle']) {
    assert.equal(finalizeById.get(role), false, `${role}: unexpected finalize authority in registry`);
  }
});

test('authority boundaries are provider-neutral (no model/provider tokens)', async () => {
  const catalog = await loadCatalog();
  for (const role of AUTHORITY_ROLES) {
    const agent = catalog.agents.find((a) => a.name === role);
    const lc = String(agent.authorityBoundary || '').toLowerCase();
    for (const token of PROVIDER_TOKENS) {
      assert.equal(lc.includes(token), false, `${role}: authorityBoundary leaks provider token "${token}"`);
    }
  }
});

test('validator bites: missing boundary and a de-fanged verifier are rejected', async () => {
  const catalog = await loadCatalog();

  const missing = structuredClone(catalog);
  delete missing.agents.find((a) => a.name === 'mure-engineer').authorityBoundary;
  const p1 = validateProjectedRoleAuthority(missing);
  assert.ok(p1.some((p) => p.startsWith('authority-line-missing:mure-engineer')), `expected missing-boundary problem, got: ${p1.join('; ')}`);

  const defanged = structuredClone(catalog);
  defanged.agents.find((a) => a.name === 'mure-oracle').authorityBoundary =
    'Runs tests and returns a verdict. Control retains final acceptance.';
  const p2 = validateProjectedRoleAuthority(defanged);
  assert.ok(p2.includes('verifier-not-independent:mure-oracle'), `expected independence problem, got: ${p2.join('; ')}`);
  assert.ok(p2.includes('verifier-not-advisory:mure-oracle'), `expected advisory problem, got: ${p2.join('; ')}`);
  assert.ok(p2.includes('verifier-can-accept:mure-oracle'), `expected acceptance-denial problem, got: ${p2.join('; ')}`);
});

test('verifier cards project named producer independence equal to the catalog array', async () => {
  const catalog = await loadCatalog();
  const projection = buildOmpProjection(catalog);
  for (const role of VERIFIER_ROLES) {
    const card = projection.cards.find((c) => c.cardName === role && c.variant == null);
    const line = renderOmpAgent(card).split('\n').find((l) => l.startsWith('**Independent of:**'));
    assert.ok(line, `${role}: no **Independent of:** line projected`);
    const projected = new Set(line.replace('**Independent of:**', '').split(',').map((s) => s.trim()).filter(Boolean));
    const declared = new Set(catalog.agents.find((a) => a.name === role).independence);
    assert.deepEqual([...projected].sort(), [...declared].sort(), `${role}: projected independence != catalog array`);
    assert.ok(projected.has('mure-engineer'), `${role}: dropped shared producer mure-engineer`);
  }
});

test('scoped: Control (mure-yuri) and advisor cards do NOT project independence', async () => {
  const projection = buildOmpProjection(await loadCatalog());
  for (const role of ['mure-yuri', 'mure-advisor']) {
    const card = projection.cards.find((c) => c.cardName === role && c.variant == null);
    assert.ok(card, `${role}: expected projected base card`);
    assert.equal(renderOmpAgent(card).includes('**Independent of:**'), false, `${role}: independence leaked into an unrelated card`);
  }
});

test('catalog independence equals the fleet-roles registry independentOf (drift guard)', async () => {
  const [catalog, registry] = await Promise.all([
    loadCatalog(),
    readFile(FLEET_ROLES_URL, 'utf8').then((s) => JSON.parse(s)),
  ]);
  const roleById = new Map(registry.roles.map((r) => [`mure-${r.id}`, r]));
  for (const role of VERIFIER_ROLES) {
    const catalogSet = [...catalog.agents.find((a) => a.name === role).independence].sort();
    const registrySet = roleById.get(role).independentOf.map((id) => `mure-${id}`).sort();
    assert.deepEqual(catalogSet, registrySet, `${role}: catalog independence drifted from fleet-roles independentOf`);
  }
});

test('validator bites: emptied independence and a dropped shared producer are rejected', async () => {
  const catalog = await loadCatalog();

  const emptied = structuredClone(catalog);
  emptied.agents.find((a) => a.name === 'mure-adjudicator').independence = [];
  assert.ok(
    validateProjectedRoleAuthority(emptied).includes('independence-empty:mure-adjudicator'),
    'expected independence-empty when adjudicator independence is emptied',
  );

  const droppedShared = structuredClone(catalog);
  const oracle = droppedShared.agents.find((a) => a.name === 'mure-oracle');
  oracle.independence = oracle.independence.filter((r) => r !== 'mure-engineer');
  assert.ok(
    validateProjectedRoleAuthority(droppedShared).includes('independence-missing-shared-producer:mure-oracle:mure-engineer'),
    'expected independence-missing-shared-producer when engineer dropped from oracle',
  );
});

test('mure-helmsman-glm (goal-spine orchestrator twin) carries + projects an Authority boundary', async () => {
  const catalog = await loadCatalog();
  const projection = buildOmpProjection(catalog);
  const authority = authorityLine(projection, 'mure-helmsman-glm');
  assert.ok(authority && authority.length > 0, 'mure-helmsman-glm: missing Authority line');
  assert.match(authority, /\bretain(s|ed)?\b[^.]*\bfinal acceptance\b/i, 'mure-helmsman-glm: no upward final-acceptance');
  assert.match(authority.toLowerCase(), /control/, 'mure-helmsman-glm: does not name Control');
  const agent = catalog.agents.find((a) => a.name === 'mure-helmsman-glm');
  const lc = String(agent.authorityBoundary || '').toLowerCase();
  for (const token of PROVIDER_TOKENS) {
    assert.equal(lc.includes(token), false, `mure-helmsman-glm: authorityBoundary leaks provider token "${token}"`);
  }
});

test('mure-helmsman-glm variants carry the role-level Authority boundary', async () => {
  const projection = buildOmpProjection(await loadCatalog());
  const variants = projection.cards.filter((c) => c.agent?.name === 'mure-helmsman-glm' && c.variant != null);
  assert.ok(variants.length > 0, 'mure-helmsman-glm: expected at least one projected variant');
  for (const card of variants) {
    assert.match(renderOmpAgent(card), /\*\*Authority:\*\*/,
      `${card.cardName}: variant dropped the role-level Authority boundary`);
  }
});

test('validator covers mure-helmsman-glm: an intentional omission is rejected', async () => {
  const catalog = await loadCatalog();
  const stripped = structuredClone(catalog);
  delete stripped.agents.find((a) => a.name === 'mure-helmsman-glm').authorityBoundary;
  const problems = validateProjectedRoleAuthority(stripped);
  assert.ok(problems.some((p) => p.startsWith('authority-line-missing:mure-helmsman-glm')),
    `expected authority-line-missing for mure-helmsman-glm, got: ${problems.join('; ')}`);
});
