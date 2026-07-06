// MURE role-registry — red/grey/green over the live roster + validation + lane resolution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadRoster, validateRoster, matchRolesByCapability, resolveLane, roleMathHooks, getRole,
  GROUPS, NATIVE_LANES, GLM_LANES, SUBSTRATES,
} from './role-registry.mjs';

const roster = loadRoster();

// ── GREEN ───────────────────────────────────────────────────────────────────
test('GREEN: the live roster loads and validates (20 roles)', () => {
  const v = validateRoster(roster);
  assert.equal(v.ok, true, v.errors.join('; '));
  assert.equal(v.roleCount, 20);
});

test('GREEN: capability match finds the engineer for code-generation', () => {
  const m = matchRolesByCapability(roster, ['code-generation', 'implementation']);
  assert.ok(m.length > 0);
  assert.equal(m[0].role.id, 'engineer');
});

test('GREEN: resolveLane maps a native role to an Agent + a glm role to a glm-lane', () => {
  const sec = resolveLane(getRole(roster, 'sentinel'), { preferSubstrate: 'glm' });
  assert.equal(sec.substrate, 'native'); // sentinel is native-substrate; prefer is overridden
  assert.equal(sec.dispatch, 'agent');
  const ide = resolveLane(getRole(roster, 'ideator'));
  assert.equal(ide.substrate, 'glm');
  assert.equal(ide.dispatch, 'glm-lane');
  const stew = resolveLane(getRole(roster, 'steward'));
  assert.equal(stew.dispatch, 'inline'); // lane 'native' = deterministic/inline
});

test('GREEN: roleMathHooks resolves the steward hooks to live functions', () => {
  const hooks = roleMathHooks(getRole(roster, 'steward'));
  assert.equal(typeof hooks.governanceVeto, 'function');
  assert.equal(typeof hooks.salienceTier, 'function');
});

// ── PHASE 6: resolveLane either-substrate declared-lane honoring (D-12) ────────
test('GREEN (D-12): an either-role with NO explicit preference resolves to its DECLARED lane tier', () => {
  // artificer: substrate 'either', lane 'haiku' (native tier) → must resolve NATIVE/haiku, not blanket glm-turbo.
  const art = resolveLane(getRole(roster, 'artificer'));
  assert.equal(art.substrate, 'native', 'artificer declared a haiku (native) lane → native side');
  assert.equal(art.lane, 'haiku');
  assert.equal(art.dispatch, 'agent');
  // chronicler: substrate 'either', lane 'sonnet' (native tier) → must resolve NATIVE/sonnet, not glm.
  const chr = resolveLane(getRole(roster, 'chronicler'));
  assert.equal(chr.substrate, 'native');
  assert.equal(chr.lane, 'sonnet');
  // architect: substrate 'either', lane 'glm-max' (glm tier) → stays glm.
  const arch = resolveLane(getRole(roster, 'architect'));
  assert.equal(arch.substrate, 'glm');
  assert.equal(arch.lane, 'glm-max');
});

test('GREY (D-12): an EXPLICIT preferSubstrate still overrides the declared lane', () => {
  // explicit glm on a native-declared either-role → glm side (fallbackLane glm-turbo).
  const art = resolveLane(getRole(roster, 'artificer'), { preferSubstrate: 'glm' });
  assert.equal(art.substrate, 'glm');
  assert.ok(['glm-turbo', 'glm'].includes(art.lane), `explicit glm prefers a glm lane, got ${art.lane}`);
  // explicit native on a glm-declared either-role → native side (fallbackLane sonnet).
  const arch = resolveLane(getRole(roster, 'architect'), { preferSubstrate: 'native' });
  assert.equal(arch.substrate, 'native');
  assert.ok(['sonnet', 'opus', 'haiku'].includes(arch.lane), `explicit native prefers a native lane, got ${arch.lane}`);
});

// ── RED ───────────────────────────────────────────────────────────────────
test('RED: duplicate id is rejected', () => {
  const v = validateRoster({ roles: [{ id: 'x', name: 'X', group: 'research', archetype: 'a', mission: 'm', capabilities: ['c'], substrate: 'glm', lane: 'glm', autonomyClass: 'self-governable', mathHooks: [], goalScope: ['research'] }, { id: 'x', name: 'X2', group: 'research', archetype: 'a', mission: 'm', capabilities: ['c'], substrate: 'glm', lane: 'glm', autonomyClass: 'self-governable', mathHooks: [], goalScope: ['research'] }] });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('duplicate id')));
});

test('RED: unknown group / lane-substrate mismatch / bad mathHook / dangling ref are rejected', () => {
  const bad = validateRoster({ roles: [{ id: 'b', name: 'B', group: 'nope', archetype: 'a', mission: 'm', capabilities: ['c'], substrate: 'native', lane: 'glm-max', autonomyClass: 'self-governable', mathHooks: ['doesNotExist'], goalScope: ['x'], independentOf: ['ghost'] }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.includes("unknown group 'nope'")));
  assert.ok(bad.errors.some((e) => e.includes('native role has non-native lane')));
  assert.ok(bad.errors.some((e) => e.includes("mathHook 'doesNotExist'")));
  assert.ok(bad.errors.some((e) => e.includes("independentOf references unknown role 'ghost'")));
});

test('RED: missing required field is rejected', () => {
  const v = validateRoster({ roles: [{ id: 'm', name: 'M', group: 'research' }] });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('missing required field')));
});

// ── GREY ───────────────────────────────────────────────────────────────────
test('GREY (invariant): every role lane is valid for its substrate', () => {
  for (const r of roster.roles) {
    assert.ok(SUBSTRATES.includes(r.substrate), `${r.id} substrate`);
    if (r.substrate === 'native') assert.ok(NATIVE_LANES.includes(r.lane), `${r.id} native lane ${r.lane}`);
    if (r.substrate === 'glm') assert.ok(GLM_LANES.includes(r.lane), `${r.id} glm lane ${r.lane}`);
    if (r.substrate === 'either') assert.ok(NATIVE_LANES.includes(r.lane) || GLM_LANES.includes(r.lane), `${r.id} either lane`);
  }
});

test('GREY (invariant): every cross-reference (independentOf/gatedBehind) resolves to a real role', () => {
  const ids = new Set(roster.roles.map((r) => r.id));
  for (const r of roster.roles) {
    for (const ref of (r.independentOf || [])) assert.ok(ids.has(ref), `${r.id} → ${ref}`);
    if (r.gatedBehind) assert.ok(ids.has(r.gatedBehind), `${r.id} gatedBehind ${r.gatedBehind}`);
  }
});

test('GREY (invariant): the critic roles are structurally independent of producers (no echo chamber)', () => {
  const adj = getRole(roster, 'adjudicator');
  assert.ok(adj.independentOf.includes('engineer') && adj.independentOf.includes('ideator'));
  const oracle = getRole(roster, 'oracle');
  assert.ok(oracle.independentOf.includes('evolver')); // the self-modifier is gated by an independent oracle
});

test('GREY (index round-trip): every indexed capability maps back to a role that lists it', () => {
  for (const [cap, roles] of roster.byCapability.entries()) {
    for (const r of roles) assert.ok(r.capabilities.includes(cap), `${r.id} should list ${cap}`);
  }
});

test('GREY (coverage): all six groups are populated', () => {
  for (const g of GROUPS) assert.ok((roster.byGroup.get(g) || []).length > 0, `group ${g} populated`);
});
