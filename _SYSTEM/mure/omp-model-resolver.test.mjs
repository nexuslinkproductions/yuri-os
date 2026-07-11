import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  resolveOmpModel,
  OMP_REGISTRY_EVIDENCE,
  OMP_THINKING_LEVELS,
  FORBIDDEN_SELECTOR_PREFIXES,
  FAIL_CLASSES,
  buildRouteByModelIndex,
  _internals,
} from './omp-model-resolver.mjs';

const { clampThinking, ALL_SOURCE_ROUTES, findExclusion, isForbiddenSelector } = _internals;

// ── Independent catalog derivation ──────────────────────────────────────────
// Collect every model string from the live agent catalog so resolver omissions
// cannot shrink the test's own input set and pass vacuously.

const catalogRaw = await readFile(
  new URL('../../.openclaw/mure-agent-catalog.json', import.meta.url),
  'utf8',
);
const catalog = JSON.parse(catalogRaw);

const catalogInputs = new Set();

// Base models from providerMapping keys
for (const key of Object.keys(catalog.providerMapping)) {
  catalogInputs.add(key);
}

// All agent base models + variant models
for (const agent of catalog.agents) {
  if (agent.model) catalogInputs.add(agent.model);
  if (agent.variants) {
    for (const v of agent.variants) {
      if (v.model) catalogInputs.add(v.model);
    }
  }
}

const LIVE_CATALOG_INPUTS = [...catalogInputs].sort();

// ── Registry route map (exact-route authority) ──────────────────────────────
// Mirror the resolver's JSON5-tolerant parse so trailing commas don't break.

const registryRaw = await readFile(
  new URL('../config/provider-route-registry.json', import.meta.url),
  'utf8',
);
const registry = JSON.parse(registryRaw.replace(/,\s*([}\]])/g, '$1'));

// Collect every individual route row — no silent collapse on duplicate model names.
const FLAT_ROUTES = [];
const _modelLookup = Object.create(null);
for (const identity of Object.values(registry.modelIdentities)) {
  for (const route of identity.routes) {
    FLAT_ROUTES.push(route);
    _modelLookup[route.model] = route;
  }
}
// Freeze so accidental mutation corrupts the table assertions.
const ROUTE_BY_MODEL = Object.freeze(_modelLookup);

const liveInputSet = new Set(LIVE_CATALOG_INPUTS);
const CLINE_ROUTE_MODELS = new Set(FLAT_ROUTES.filter((r) => r.model.startsWith('cline-pass/')).map((r) => r.model));

// ── Fail-closed: blocked-schema Ollama route ────────────────────────────────

test('ollama-cloud/deepseek-v4-flash:cloud fails closed for blocked-schema', () => {
  const result = resolveOmpModel('ollama-cloud/deepseek-v4-flash:cloud');
  assert.equal(result.selector, null, 'blocked-schema route must not emit a selector');
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.failClass, FAIL_CLASSES.REGISTRY_BLOCKED, 'blocked-schema is a registry_blocked failure');
  assert.ok(result.reason, 'blocked-schema failure must carry a reason');
  assert.ok(
    result.reason.toLowerCase().includes('blocked') ||
    result.reason.toLowerCase().includes('schema'),
    'reason must mention blocked schema',
  );
});

// ── Fail-closed: excluded model ─────────────────────────────────────────────

test('anthropic/claude-fable-5 fails closed (owner-excluded)', () => {
  const result = resolveOmpModel('anthropic/claude-fable-5');
  assert.equal(result.selector, null, 'excluded model must not emit a selector');
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.failClass, FAIL_CLASSES.MODEL_EXCLUDED);
  assert.ok(result.reason, 'excluded model must carry a reason');
  assert.ok(result.reason.toLowerCase().includes('excluded'), 'reason must mention exclusion');
});

// ── Fail-closed: Cline-pass policy gate (before registry / known-input) ─────
// Cline-pass fails closed categorically and unconditionally: known catalog
// inputs and completely unrecognized "cline-pass/*" strings both resolve
// cline_unavailable, and neither ever consults the registry (routeStatus and
// evidenceAgentId must stay null — the point of gating before Step 1/2).

test('all cline-pass catalog inputs fail closed as cline_unavailable, registry never consulted', () => {
  const clineInputs = LIVE_CATALOG_INPUTS.filter((k) => k.startsWith('cline-pass/'));
  assert.ok(clineInputs.length >= 4, 'must have known cline-pass entries in catalog');

  for (const input of clineInputs) {
    const result = resolveOmpModel(input);
    assert.equal(result.selector, null, `cline-pass "${input}" must not emit a selector`);
    assert.equal(result.status, 'FAIL_CLOSED', `cline-pass "${input}" must be FAIL_CLOSED`);
    assert.equal(result.failClass, FAIL_CLASSES.CLINE_UNAVAILABLE, `cline-pass "${input}" failClass must be cline_unavailable`);
    assert.ok(result.reason, `cline-pass "${input}" must carry a reason`);
    assert.ok(result.reason.toLowerCase().includes('cline'), `cline-pass "${input}" reason must mention Cline`);
    // Cline-pass fails before the registry gate runs, even when the input
    // has canary-proven registry evidence (e.g. cline-pass/cline-pass/deepseek-v4-flash).
    assert.equal(result.routeStatus, null, `cline-pass "${input}" must never consult the registry`);
    assert.equal(result.evidenceAgentId, null, `cline-pass "${input}" must never surface registry evidence`);
  }
});

test('unrecognized Cline input fails closed as cline_unavailable, not unknown_model', () => {
  const unknownClineInputs = [
    'cline-pass/totally-unrecognized-model',
    'cline-pass/cline-pass/nonexistent-model',
    'cline-pass/unknown',
  ];
  for (const input of unknownClineInputs) {
    assert.equal(
      Object.hasOwn(ALL_SOURCE_ROUTES, input), false,
      `fixture assumption broken: "${input}" must not be a known route`,
    );
    const result = resolveOmpModel(input);
    assert.equal(result.selector, null);
    assert.equal(result.status, 'FAIL_CLOSED');
    assert.equal(result.failClass, FAIL_CLASSES.CLINE_UNAVAILABLE,
      `unrecognized cline-pass input "${input}" must fail as cline_unavailable, not unknown_model`);
    assert.equal(result.sourceRoute, input, 'unrecognized cline input carries itself as sourceRoute');
  }
});

test('malformed non-Cline model strings not in catalog fail closed as unknown_model', () => {
  const unknowns = [
    'garbage-input',
    'openai/gpt-7',
    'deepseek/deepseek-v5',
    'anthropic/claude-non-existent',
    '',
  ];
  for (const input of unknowns) {
    const result = resolveOmpModel(input);
    assert.equal(result.selector, null, `"${input}" must not emit a selector`);
    assert.equal(result.status, 'FAIL_CLOSED');
    assert.equal(result.failClass, FAIL_CLASSES.UNKNOWN_MODEL, `"${input}" must fail as unknown_model`);
    assert.ok(result.reason, `"${input}" must carry a reason`);
    assert.equal(result.normalizedRoute, null);
    assert.equal(result.thinkingLevel, null);
  }
});

// ── Live registry truth: openai/gpt-5.6-terra is quota-blocked ──────────────
// The live registry moved openai/gpt-5.6-terra from canary-proven to
// quota-blocked after two usage_limit_reached dispatch failures (2026-07-11).
// This is a fail-closed truth to preserve, not paper over: Terra must resolve
// FAIL_CLOSED/registry_blocked here. Terra OK/clamp/evidence behavior is
// regression-tested via the fixture-injectable clamp machinery below
// (clampThinking direct + MiniMax end-to-end), never by asserting a live OK
// result this registry snapshot cannot produce.

test('openai/gpt-5.6-terra fails closed (registry_blocked — live quota-blocked status)', () => {
  const result = resolveOmpModel('openai/gpt-5.6-terra');
  assert.equal(result.selector, null, 'quota-blocked route must not emit a selector');
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.failClass, FAIL_CLASSES.REGISTRY_BLOCKED);
  assert.equal(result.routeStatus, 'quota-blocked');
  assert.equal(result.sourceRoute, 'openai/gpt-5.6-terra');
  assert.ok(result.reason.toLowerCase().includes('quota') || result.reason.toLowerCase().includes('usage_limit'),
    'reason must reflect the live quota-blocked cause');
});

test('openai/gpt-5.6-sol fails closed (registry_blocked or unproven — no live canary-proven evidence)', () => {
  const result = resolveOmpModel('openai/gpt-5.6-sol');
  assert.equal(result.selector, null, 'unproven route must not emit a selector');
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.sourceRoute, 'openai/gpt-5.6-sol');
});

test('openai/gpt-5.6-luna fails closed (unproven — no registry row)', () => {
  const result = resolveOmpModel('openai/gpt-5.6-luna');
  assert.equal(result.selector, null, 'unproven route must not emit a selector');
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.failClass, FAIL_CLASSES.UNPROVEN_ROUTE);
  assert.equal(result.routeStatus, 'unregistered');
  assert.equal(result.sourceRoute, 'openai/gpt-5.6-luna');
  assert.ok(result.reason.toLowerCase().includes('canary-proven'), 'reason must mention missing canary evidence');
});

// ── MiniMax M3 (canary-proven) ─────────────────────────────────────────────
// MiniMax-M3 has canary-proven registry evidence (agentId: mure-synthesist-m3)
// and resolves OK via portal normalization. No agentId field on the result —
// registry evidence metadata lives in evidenceAgentId only.
test('minimax-portal/MiniMax-M3 normalizes to minimax-code/MiniMax-M3', () => {
  const result = resolveOmpModel('minimax-portal/MiniMax-M3');
  assert.equal(result.selector, 'minimax-code/MiniMax-M3');
  assert.equal(result.status, 'OK');
  assert.equal(result.normalizedRoute, 'minimax-code/MiniMax-M3');
  assert.equal(result.sourceRoute, 'minimax-portal/MiniMax-M3');
  assert.equal(result.routeStatus, 'canary-proven');
  assert.equal(result.evidenceAgentId, 'mure-synthesist-m3');
  assert.equal('agentId' in result, false, 'agentId must never leak into resolveOmpModel result');
  assert.ok(result.reason === null, 'OK resolution must not carry a reason');
});

// ── Cursor normalization (cursor-cli/* registry route → cursor/* selector) ──
// The catalog's cursor routes carry a cursor-cli/* alias in providerMapping,
// but the resolved selector must be cursor/* — cursor-cli/* is a forbidden
// prefix. gemini-3.5-flash has canary-proven registry evidence under its
// cursor-cli/* form, proving the normalization end-to-end through an OK path.

test('cursor/gemini-3.5-flash normalizes cursor-cli/* registry evidence to a cursor/* selector', () => {
  const result = resolveOmpModel('cursor/gemini-3.5-flash');
  assert.equal(result.status, 'OK');
  assert.equal(result.selector, 'cursor/gemini-3.5-flash', 'selector must use cursor/, never cursor-cli/');
  assert.equal(result.sourceRoute, 'cursor-cli/gemini-3.5-flash', 'sourceRoute carries the catalog cursor-cli/* alias');
  assert.equal(result.routeStatus, 'canary-proven');
  assert.equal(result.evidenceAgentId, 'mure-scout');
  assert.ok(!result.selector.startsWith('cursor-cli/'));
});

test('cursor/composer-2.5 normalizes to cursor/* selector but fails closed unproven (no registry row)', () => {
  const result = resolveOmpModel('cursor/composer-2.5');
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.failClass, FAIL_CLASSES.UNPROVEN_ROUTE);
  assert.equal(result.sourceRoute, 'cursor-cli/composer-2.5');
  assert.equal(result.selector, null);
});

// ── Non-canary-proven registry routes fail closed (table-driven) ────────────
// Every exact registry route with status != "canary-proven" must fail closed,
// including future statuses dynamically loaded from the registry at test time.
// For known catalog inputs the routeStatus and failClass must prove the
// registry boundary was consulted (not merely unknown_model) — EXCEPT
// cline-pass routes, which by design (Step 0) never reach the registry gate
// at all and so must show routeStatus: null instead of the registry's status.

test('every non-canary-proven registry route fails closed', () => {
  const nonCanaryRoutes = FLAT_ROUTES.filter((r) => r.status !== 'canary-proven');

  assert.ok(nonCanaryRoutes.length >= 3, 'must have known non-canary routes');

  for (const route of nonCanaryRoutes) {
    const result = resolveOmpModel(route.model);
    assert.equal(result.selector, null,
      `non-canary route "${route.model}" (status: ${route.status}) must not emit a selector`);
    assert.equal(result.status, 'FAIL_CLOSED',
      `non-canary route "${route.model}" (status: ${route.status}) must be FAIL_CLOSED`);
    assert.ok(result.reason,
      `non-canary route "${route.model}" must carry a reason`);

    if (CLINE_ROUTE_MODELS.has(route.model)) {
      // Cline-pass policy gate fires before the registry is consulted.
      assert.equal(result.failClass, FAIL_CLASSES.CLINE_UNAVAILABLE,
        `cline-pass route "${route.model}" must fail as cline_unavailable, registry status irrelevant`);
      assert.equal(result.routeStatus, null,
        `cline-pass route "${route.model}" must never surface a registry routeStatus`);
      continue;
    }

    // For known non-Cline catalog inputs, the registry boundary must be
    // visible: routeStatus must match the registry row and the failure must
    // not be a mere unknown_model (which would prove the registry was never
    // consulted).
    if (liveInputSet.has(route.model)) {
      assert.equal(result.routeStatus, route.status,
        `known input "${route.model}" must preserve registry status "${route.status}", got "${String(result.routeStatus)}"`);
      assert.notEqual(result.failClass, 'unknown_model',
        `known input "${route.model}" must not fail as unknown_model — registry boundary must be consulted`);
    }
  }
});

// ── Direct DeepSeek catalog-candidate / unregistered fail closed ────────────
// deepseek-v4-flash:direct → registry status catalog-candidate
// deepseek-v4-pro:direct  → no registry row (EXTRA_SOURCE_ROUTES only; routeStatus: unregistered)

test('deepseek-v4-flash:direct fails closed (catalog-candidate)', () => {
  const result = resolveOmpModel('deepseek-v4-flash:direct');
  assert.equal(result.selector, null, 'catalog-candidate must not emit a selector');
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.failClass, FAIL_CLASSES.REGISTRY_BLOCKED);
  assert.equal(result.routeStatus, 'catalog-candidate', 'registry status must be preserved');
  assert.equal(result.sourceRoute, 'deepseek-v4-flash:direct');
  assert.ok(result.reason, 'catalog-candidate must carry a reason');
});

test('deepseek-v4-pro:direct fails closed (unregistered — no canary evidence)', () => {
  const result = resolveOmpModel('deepseek-v4-pro:direct');
  assert.equal(result.selector, null, 'unregistered route must not emit a selector');
  assert.equal(result.status, 'FAIL_CLOSED');
  assert.equal(result.failClass, FAIL_CLASSES.UNPROVEN_ROUTE);
  assert.equal(result.routeStatus, 'unregistered', 'no canary evidence → routeStatus unregistered');
  assert.equal(result.sourceRoute, 'deepseek-v4-pro:direct');
  assert.ok(result.reason.toLowerCase().includes('canary-proven'), 'reason must mention missing canary evidence');
});

// ── Converse invariant: every OK resolution has canary-proven registry evidence ─
// The resolver's canary gate (Step 6) requires at least one of the exact source
// route or the normalized selector to have canary-proven registry evidence.
// This invariant independently confirms that rule: for every OK result, at least
// one of the two registry lookups returns canary-proven, and the resolution
// record itself reports routeStatus 'canary-proven'. No exception for absent
// source routes — proven evidence is mandatory for every OK resolution.
test('every OK resolution has canary-proven evidence on sourceRoute or selector', () => {
  for (const input of LIVE_CATALOG_INPUTS) {
    const result = resolveOmpModel(input);
    if (result.status === 'OK') {
      const sourceEntry = ROUTE_BY_MODEL[result.sourceRoute];
      const selectorEntry = ROUTE_BY_MODEL[result.selector];
      const sourceProven = sourceEntry?.status === 'canary-proven';
      const selectorProven = selectorEntry?.status === 'canary-proven';

      assert.ok(sourceProven || selectorProven,
        `OK "${input}": neither sourceRoute "${result.sourceRoute}" (${sourceEntry?.status ?? 'absent'}) ` +
        `nor selector "${result.selector}" (${selectorEntry?.status ?? 'absent'}) is canary-proven`);
      assert.equal(result.routeStatus, 'canary-proven',
        `OK "${input}" must have routeStatus "canary-proven", got "${String(result.routeStatus)}"`);
    }
  }
});

// ── Unproven-route invariant: every failClass 'unproven_route' has null selector ─
test('every unproven_route resolution has selector: null and routeStatus: unregistered', () => {
  for (const input of LIVE_CATALOG_INPUTS) {
    const result = resolveOmpModel(input);
    if (result.failClass === 'unproven_route') {
      assert.equal(result.selector, null,
        `unproven_route "${input}" must have selector: null`);
      assert.equal(result.status, 'FAIL_CLOSED',
        `unproven_route "${input}" must be FAIL_CLOSED`);
      assert.equal(result.routeStatus, 'unregistered',
        `unproven_route "${input}" must have routeStatus "unregistered", got "${String(result.routeStatus)}"`);
      assert.ok(result.reason.toLowerCase().includes('canary-proven'),
        `unproven_route "${input}" reason must mention missing canary evidence`);
    }
  }
});

// ── Thinking clamp tested directly via exported internals ───────────────────
// Non-canary routes fail closed, so thinking-level assertions on resolution
// results are no longer possible for deepseek:direct or Terra (now
// quota-blocked). Exercise the clamp machinery directly so the caps stay
// under test without depending on live registry canary status.

test('clampThinking: deepseek-v4-flash caps at high', () => {
  assert.equal(clampThinking('max', 'deepseek/deepseek-v4-flash'), 'high');
  assert.equal(clampThinking('xhigh', 'deepseek/deepseek-v4-flash'), 'high');
  assert.equal(clampThinking('high', 'deepseek/deepseek-v4-flash'), 'high');
  assert.equal(clampThinking('medium', 'deepseek/deepseek-v4-flash'), 'medium');
});

test('clampThinking: deepseek-v4-pro supports max', () => {
  assert.equal(clampThinking('max', 'deepseek/deepseek-v4-pro'), 'max');
  assert.equal(clampThinking('xhigh', 'deepseek/deepseek-v4-pro'), 'xhigh');
});

test('clampThinking defaults to off when no level provided', () => {
  assert.equal(clampThinking(null, 'deepseek/deepseek-v4-flash'), 'off');
  assert.equal(clampThinking('off', 'deepseek/deepseek-v4-flash'), 'off');
});

test('clampThinking unknown level defaults to off', () => {
  assert.equal(clampThinking('garbage', 'deepseek/deepseek-v4-flash'), 'off');
  assert.equal(clampThinking('super-max', 'deepseek/deepseek-v4-pro'), 'off');
});

test('clampThinking respects provider-level cap fallback', () => {
  // openai-codex provider cap is 'high'; Sol has model cap 'high'
  assert.equal(clampThinking('max', 'openai-codex/gpt-5.6-sol'), 'high');
  // anthropic provider cap is 'high'; Haiku model cap is 'medium'
  assert.equal(clampThinking('high', 'anthropic/claude-haiku-4-5'), 'medium');
  // zai provider cap is 'xhigh'; no model override for glm-5.1
  assert.equal(clampThinking('max', 'zai/glm-5.1'), 'xhigh');
  // unknown provider → pass-through
  assert.equal(clampThinking('medium', 'unknown/some-model'), 'medium');
});

// ── Terra thinking-clamp regression (fixture/direct — live route is fail-closed) ─
// openai/gpt-5.6-terra is live quota-blocked (see the registry_blocked test
// above), so it cannot produce an OK end-to-end result this snapshot. The
// clamp table itself (MODEL_THINKING_CAPS['openai-codex/gpt-5.6-terra']) is
// registry-independent, so exercise it directly against the selector Terra
// would normalize to if it were canary-proven again.

test('clampThinking: Terra selector clamps max -> high, leaves medium unchanged', () => {
  assert.equal(clampThinking('max', 'openai-codex/gpt-5.6-terra'), 'high');
  assert.equal(clampThinking('xhigh', 'openai-codex/gpt-5.6-terra'), 'high');
  assert.equal(clampThinking('medium', 'openai-codex/gpt-5.6-terra'), 'medium');
});

// ── MiniMax above-cap clamp — true end-to-end via resolveOmpModel ───────────
// MiniMax-M3 is still canary-proven in the live registry, so this exercises
// the full resolveOmpModel path (not just the clamp table) for the
// above-cap-clamp acceptance case.

test('resolveOmpModel end-to-end: MiniMax-M3 above-cap thinkingLevel clamps to high', () => {
  const result = resolveOmpModel('minimax-portal/MiniMax-M3', 'max');
  assert.equal(result.status, 'OK');
  assert.equal(result.selector, 'minimax-code/MiniMax-M3');
  assert.equal(result.thinkingLevel, 'high', 'minimax-code/MiniMax-M3 caps at high');
});

test('resolveOmpModel end-to-end: MiniMax-M3 medium thinkingLevel is unchanged', () => {
  const result = resolveOmpModel('minimax-portal/MiniMax-M3', 'medium');
  assert.equal(result.status, 'OK');
  assert.equal(result.thinkingLevel, 'medium');
});

// ── Immutable thinking vocabulary ────────────────────────────────────────────

test('OMP_THINKING_LEVELS is an immutable vocabulary including max', () => {
  assert.ok(Object.isFrozen(OMP_THINKING_LEVELS), 'OMP_THINKING_LEVELS must be frozen');
  assert.deepEqual(OMP_THINKING_LEVELS, ['off', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.ok(OMP_THINKING_LEVELS.includes('max'), 'vocabulary must include the max ceiling level');
  assert.throws(() => { OMP_THINKING_LEVELS.push('ultra'); }, TypeError,
    'mutating a frozen array must throw in strict mode');
});

// ── Forbidden prefix enforcement ────────────────────────────────────────────

test('no successful selector uses a forbidden prefix', () => {
  for (const input of LIVE_CATALOG_INPUTS) {
    const result = resolveOmpModel(input);
    if (result.selector !== null) {
      for (const prefix of FORBIDDEN_SELECTOR_PREFIXES) {
        assert.ok(
          !result.selector.startsWith(prefix),
          `resolved "${input}" → "${result.selector}" must not start with forbidden prefix "${prefix}"`,
        );
      }
    }
  }
});

// forbidden_selector fail class + injectable regression: no live translation
// currently produces a forbidden-prefix selector (proven by the test above),
// so the gate itself is exercised directly against fixture data via the
// exported isForbiddenSelector helper — this is the "injectable regression"
// the resolver's Step 4 gate needs without polluting the live translation
// table with a synthetic forbidden route.

test('isForbiddenSelector: fixture-injectable regression for the forbidden-prefix gate', () => {
  assert.equal(isForbiddenSelector('cline-pass/cline-pass/foo'), true);
  assert.equal(isForbiddenSelector('cursor-cli/composer-2.5'), true);
  assert.equal(isForbiddenSelector('openai/gpt-5.6-terra'), true);
  assert.equal(isForbiddenSelector('minimax-portal/MiniMax-M3'), true);
  assert.equal(isForbiddenSelector('ollama/some-model'), true);
  assert.equal(isForbiddenSelector('anthropic/claude-sonnet-5'), false);
  assert.equal(isForbiddenSelector('minimax-code/MiniMax-M3'), false);

  // Fully injectable: an arbitrary fixture prefix list, independent of the
  // live FORBIDDEN_SELECTOR_PREFIXES export.
  const fixturePrefixes = ['fixture-blocked/'];
  assert.equal(isForbiddenSelector('fixture-blocked/anything', fixturePrefixes), true);
  assert.equal(isForbiddenSelector('anthropic/claude-sonnet-5', fixturePrefixes), false);
});

test('FAIL_CLASSES exposes forbidden_selector', () => {
  assert.equal(FAIL_CLASSES.FORBIDDEN_SELECTOR, 'forbidden_selector');
});

// ── Owner-exclusion enforcement: raw, source-route, and normalized forms ────
// EXCLUDED_BY_MODEL in the live registry only has one entry
// (anthropic/claude-fable-5, whose raw/normalized forms are identical), so
// raw-form and source-route-form matching can't be proven end-to-end against
// the live registry without editing it. findExclusion is exported via
// _internals precisely so this can be regression-tested with fixture data.

test('findExclusion: fixture-injectable regression across raw, sourceRoute, and normalized forms', () => {
  const fixtureMap = {
    'raw/alias-excluded': 'raw-form exclusion reason',
    'source/route-excluded': 'source-route-form exclusion reason',
    'normalized/selector-excluded': 'normalized-form exclusion reason',
  };

  // Raw input matches even though sourceRoute/selector differ.
  assert.equal(
    findExclusion('raw/alias-excluded', 'normalized/unrelated', 'source/unrelated', fixtureMap),
    'raw-form exclusion reason',
  );
  // sourceRoute matches even though raw input/selector differ.
  assert.equal(
    findExclusion('raw/unrelated', 'normalized/unrelated', 'source/route-excluded', fixtureMap),
    'source-route-form exclusion reason',
  );
  // Normalized selector matches even though raw input/sourceRoute differ.
  assert.equal(
    findExclusion('raw/unrelated', 'normalized/selector-excluded', 'source/unrelated', fixtureMap),
    'normalized-form exclusion reason',
  );
  // No match on any of the three forms → null.
  assert.equal(
    findExclusion('raw/nope', 'normalized/nope', 'source/nope', fixtureMap),
    null,
  );
  // Live default map still resolves the real exclusion without a fixture.
  assert.equal(
    findExclusion('anthropic/claude-fable-5', 'anthropic/claude-fable-5', 'anthropic/claude-fable-5'),
    'Explicitly excluded by owner; replace with an available advisor or verifier route.',
  );
});

// ── Registry-index builder: rejects duplicate route.model keys ──────────────

test('buildRouteByModelIndex: the live registry has no duplicate route.model keys', () => {
  const index = buildRouteByModelIndex(registry);
  assert.equal(Object.keys(index).length, FLAT_ROUTES.length,
    'live registry route.model keys must all be unique across modelIdentities');
  for (const route of FLAT_ROUTES) {
    assert.equal(index[route.model]?.status, route.status);
    assert.equal(index[route.model]?.agentId, route.agentId);
  }
});

test('buildRouteByModelIndex: rejects a fixture registry with a duplicate route.model key', () => {
  // Neither route claims canary-proven — this fixture isolates duplicate-key
  // detection from the (separately tested) evidence-admissibility gate.
  const duplicateFixture = {
    modelIdentities: {
      'identity-a': {
        routes: [
          { id: 'a.route', provider: 'x', surface: 'y', model: 'shared/model-key', agentId: 'agent-a', status: 'catalog-candidate' },
        ],
      },
      'identity-b': {
        routes: [
          { id: 'b.route', provider: 'x', surface: 'y', model: 'shared/model-key', agentId: 'agent-b', status: 'catalog-candidate' },
        ],
      },
    },
  };
  assert.throws(
    () => buildRouteByModelIndex(duplicateFixture),
    /Duplicate registry route\.model key "shared\/model-key"/,
  );
});

test('buildRouteByModelIndex: rejects prototype-pollution via a "__proto__" route.model key', () => {
  const protoFixture = {
    modelIdentities: {
      'identity-a': { routes: [{ id: 'a.route', model: '__proto__', agentId: 'agent-a', status: 'catalog-candidate' }] },
      'identity-b': { routes: [{ id: 'b.route', model: '__proto__', agentId: 'agent-b', status: 'catalog-candidate' }] },
    },
  };
  // If the index were a plain {} object, assigning idx['__proto__'] would
  // set the prototype instead of an own key, silently bypassing the
  // Object.hasOwn duplicate check on the second route. Object.create(null)
  // makes '__proto__' an ordinary own key, so the duplicate is still caught.
  assert.throws(
    () => buildRouteByModelIndex(protoFixture),
    /Duplicate registry route\.model key "__proto__"/,
  );
});

test('buildRouteByModelIndex: distinct route.model keys across identities do not throw', () => {
  const distinctFixture = {
    modelIdentities: {
      'identity-a': { routes: [{ id: 'a.route', model: 'fixture/model-a', agentId: 'agent-a', status: 'catalog-candidate' }] },
      'identity-b': { routes: [{ id: 'b.route', model: 'fixture/model-b', agentId: 'agent-b', status: 'catalog-candidate' }] },
    },
  };
  const index = buildRouteByModelIndex(distinctFixture);
  assert.deepEqual(Object.keys(index).sort(), ['fixture/model-a', 'fixture/model-b']);
});

// ── Canary evidence admissibility gate ───────────────────────────────────────
// A canary-proven route must carry admissible evidence under exactly one of
// two schemas (standard: single run bound via childSessionKey; corroborated:
// two independent runs bound via agentId+ompSessionId). buildRouteByModelIndex
// enforces this at registry-load time so every consumer (resolver, sync,
// generator) fails closed even if a separate validator pass is skipped.
// Non-canary-proven routes are never evidence-checked — historical evidence
// on a demoted/blocked route is not readmission.

function standardRoute(overrides = {}) {
  return {
    id: 'fixture.standard',
    provider: 'fixture',
    surface: 'fixture',
    model: 'fixture/standard-model',
    agentId: 'fixture-agent',
    status: 'canary-proven',
    canaryEvidence: {
      runId: 'run-1',
      childSessionKey: 'agent:fixture-agent:subagent:abc123',
      resolvedModel: 'fixture/standard-model',
      result: 'completed',
      observed: '2026-07-10',
    },
    ...overrides,
  };
}

function corroboratedRoute(overrides = {}) {
  return {
    id: 'fixture.corroborated',
    provider: 'fixture',
    surface: 'fixture',
    model: 'fixture/corroborated-model',
    agentId: 'fixture-agent',
    status: 'canary-proven',
    canaryEvidence: {
      primaryRun: {
        runId: 'run-a',
        agentId: 'fixture-agent',
        resolvedModel: 'fixture/corroborated-model',
        result: 'completed',
        ompSessionId: 'session-a',
      },
      corroboratingRun: {
        runId: 'run-b',
        agentId: 'fixture-agent',
        resolvedModel: 'fixture/corroborated-model',
        result: 'completed',
        ompSessionId: 'session-b',
      },
      observed: '2026-07-11',
    },
    ...overrides,
  };
}

function registryWithRoute(route) {
  return { modelIdentities: { fixture: { routes: [route] } } };
}

test('isAdmissibleCanaryEvidence: valid standard evidence is admissible', () => {
  assert.equal(_internals.isAdmissibleCanaryEvidence(standardRoute()), true);
});

test('isAdmissibleCanaryEvidence: valid corroborated evidence is admissible', () => {
  assert.equal(_internals.isAdmissibleCanaryEvidence(corroboratedRoute()), true);
});

test('isAdmissibleCanaryEvidence: standard evidence is rejected when malformed or missing', () => {
  assert.equal(_internals.isAdmissibleCanaryEvidence(standardRoute({ canaryEvidence: undefined })), false, 'missing evidence');
  assert.equal(_internals.isAdmissibleCanaryEvidence(standardRoute({
    canaryEvidence: { ...standardRoute().canaryEvidence, childSessionKey: undefined },
  })), false, 'missing childSessionKey');
  assert.equal(_internals.isAdmissibleCanaryEvidence(standardRoute({
    canaryEvidence: { ...standardRoute().canaryEvidence, childSessionKey: 'agent:someone-else:subagent:abc123' },
  })), false, 'childSessionKey not bound to route.agentId');
  assert.equal(_internals.isAdmissibleCanaryEvidence(standardRoute({
    canaryEvidence: { ...standardRoute().canaryEvidence, resolvedModel: 'fixture/different-model' },
  })), false, 'resolvedModel mismatch');
  assert.equal(_internals.isAdmissibleCanaryEvidence(standardRoute({
    canaryEvidence: { ...standardRoute().canaryEvidence, result: 'in-progress' },
  })), false, 'result not completed');
  assert.equal(_internals.isAdmissibleCanaryEvidence(standardRoute({
    canaryEvidence: { ...standardRoute().canaryEvidence, observed: '2026-02-31' },
  })), false, 'calendar-invalid observed date');
  assert.equal(_internals.isAdmissibleCanaryEvidence(standardRoute({
    canaryEvidence: { ...standardRoute().canaryEvidence, observed: '' },
  })), false, 'empty observed date');
});

test('isAdmissibleCanaryEvidence: corroborated evidence is rejected when malformed or missing', () => {
  assert.equal(_internals.isAdmissibleCanaryEvidence(corroboratedRoute({ canaryEvidence: undefined })), false, 'missing evidence');
  assert.equal(_internals.isAdmissibleCanaryEvidence(corroboratedRoute({
    canaryEvidence: { ...corroboratedRoute().canaryEvidence, corroboratingRun: undefined },
  })), false, 'missing corroboratingRun');
  assert.equal(_internals.isAdmissibleCanaryEvidence(corroboratedRoute({
    canaryEvidence: {
      ...corroboratedRoute().canaryEvidence,
      primaryRun: { ...corroboratedRoute().canaryEvidence.primaryRun, ompSessionId: undefined },
    },
  })), false, 'missing ompSessionId on primaryRun');
  assert.equal(_internals.isAdmissibleCanaryEvidence(corroboratedRoute({
    canaryEvidence: {
      ...corroboratedRoute().canaryEvidence,
      primaryRun: { ...corroboratedRoute().canaryEvidence.primaryRun, agentId: 'a-different-agent' },
    },
  })), false, 'agentId mismatch on primaryRun');
  // Same runId on both runs: not a genuine independent second observation.
  assert.equal(_internals.isAdmissibleCanaryEvidence(corroboratedRoute({
    canaryEvidence: {
      ...corroboratedRoute().canaryEvidence,
      corroboratingRun: { ...corroboratedRoute().canaryEvidence.corroboratingRun, runId: 'run-a' },
    },
  })), false, 'duplicate runId across primary/corroborating runs');
  // Same ompSessionId on both runs: the same underlying OMP session replayed
  // under a different runId proves nothing either.
  assert.equal(_internals.isAdmissibleCanaryEvidence(corroboratedRoute({
    canaryEvidence: {
      ...corroboratedRoute().canaryEvidence,
      corroboratingRun: { ...corroboratedRoute().canaryEvidence.corroboratingRun, ompSessionId: 'session-a' },
    },
  })), false, 'duplicate ompSessionId across primary/corroborating runs');
  assert.equal(_internals.isAdmissibleCanaryEvidence(corroboratedRoute({
    canaryEvidence: { ...corroboratedRoute().canaryEvidence, observed: 'not-a-date' },
  })), false, 'malformed observed date');
});

test('isAdmissibleCanaryEvidence: requires nonempty route.model and route.agentId regardless of evidence', () => {
  assert.equal(_internals.isAdmissibleCanaryEvidence(standardRoute({ model: '' })), false);
  assert.equal(_internals.isAdmissibleCanaryEvidence(standardRoute({ agentId: undefined })), false);
  assert.equal(_internals.isAdmissibleCanaryEvidence(null), false);
});

test('buildRouteByModelIndex: throws when a canary-proven route has missing/invalid standard evidence', () => {
  assert.throws(
    () => buildRouteByModelIndex(registryWithRoute(standardRoute({ canaryEvidence: undefined }))),
    /lacks admissible canary evidence/,
  );
  assert.throws(
    () => buildRouteByModelIndex(registryWithRoute(standardRoute({
      canaryEvidence: { ...standardRoute().canaryEvidence, childSessionKey: 'agent:wrong-agent:subagent:x' },
    }))),
    /lacks admissible canary evidence/,
  );
});

test('buildRouteByModelIndex: throws when a canary-proven route has missing/invalid corroborated evidence', () => {
  assert.throws(
    () => buildRouteByModelIndex(registryWithRoute(corroboratedRoute({
      canaryEvidence: {
        ...corroboratedRoute().canaryEvidence,
        corroboratingRun: { ...corroboratedRoute().canaryEvidence.corroboratingRun, ompSessionId: undefined },
      },
    }))),
    /lacks admissible canary evidence/,
  );
  assert.throws(
    () => buildRouteByModelIndex(registryWithRoute(corroboratedRoute({
      canaryEvidence: {
        ...corroboratedRoute().canaryEvidence,
        corroboratingRun: { ...corroboratedRoute().canaryEvidence.corroboratingRun, runId: 'run-a' },
      },
    }))),
    /lacks admissible canary evidence/,
  );
});

test('buildRouteByModelIndex: a canary-proven route with a valid distinct corroborated fixture builds cleanly', () => {
  const index = buildRouteByModelIndex(registryWithRoute(corroboratedRoute()));
  assert.equal(index['fixture/corroborated-model'].status, 'canary-proven');
  assert.equal(index['fixture/corroborated-model'].agentId, 'fixture-agent');
});

test('buildRouteByModelIndex: a canary-proven route with valid standard evidence builds cleanly', () => {
  const index = buildRouteByModelIndex(registryWithRoute(standardRoute()));
  assert.equal(index['fixture/standard-model'].status, 'canary-proven');
});

test('buildRouteByModelIndex: non-canary-proven routes are never evidence-checked (historical evidence is irrelevant)', () => {
  const noEvidenceCatalogCandidate = standardRoute({ status: 'catalog-candidate', canaryEvidence: undefined });
  const staleEvidenceBlocked = standardRoute({
    status: 'blocked-schema',
    canaryEvidence: { runId: 'old-run', result: 'provider-rejected-request-schema', observed: '2026-01-01' },
  });
  assert.doesNotThrow(() => buildRouteByModelIndex(registryWithRoute(noEvidenceCatalogCandidate)));
  assert.doesNotThrow(() => buildRouteByModelIndex(registryWithRoute(staleEvidenceBlocked)));
});

test('buildRouteByModelIndex: the live registry index passes the admissibility gate', () => {
  // Every canary-proven route in the live registry must already satisfy
  // isAdmissibleCanaryEvidence; buildRouteByModelIndex(registry) not
  // throwing is exactly that proof, re-asserted explicitly here rather than
  // only incidentally via the uniqueness test above.
  assert.doesNotThrow(() => buildRouteByModelIndex(registry));
  for (const route of FLAT_ROUTES) {
    if (route.status === 'canary-proven') {
      assert.equal(_internals.isAdmissibleCanaryEvidence(route), true,
        `live canary-proven route "${route.model}" must carry admissible evidence`);
    }
  }
});

// ── Registry evidence is advisory metadata only ──────────────────────────────

test('OMP_REGISTRY_EVIDENCE maps resolved selectors to advisory agentIds', () => {
  assert.equal(OMP_REGISTRY_EVIDENCE['deepseek/deepseek-v4-flash'], 'deepseek-flash');
  assert.equal(OMP_REGISTRY_EVIDENCE['anthropic/claude-haiku-4-5'], 'mure-scout');
  assert.equal(OMP_REGISTRY_EVIDENCE['anthropic/claude-sonnet-5'], 'mure-scout');
  assert.equal(OMP_REGISTRY_EVIDENCE['anthropic/claude-opus-4-8'], 'mure-scout');
  assert.equal(OMP_REGISTRY_EVIDENCE['zai/glm-5.2'], 'mure-scout');
  assert.equal(OMP_REGISTRY_EVIDENCE['opencode-go/mimo-v2.5'], 'mure-artificer');
  assert.equal(OMP_REGISTRY_EVIDENCE['minimax-code/MiniMax-M3'], 'mure-synthesist-m3');
  assert.equal(OMP_REGISTRY_EVIDENCE['cursor/gemini-3.5-flash'], 'mure-scout');
  // Terra is live quota-blocked — it must NOT appear as canary-proven evidence.
  assert.equal(OMP_REGISTRY_EVIDENCE['openai-codex/gpt-5.6-terra'], undefined,
    'quota-blocked Terra must not surface advisory canary evidence');
});

test('registry agentId never leaks into resolveOmpModel result', () => {
  for (const input of LIVE_CATALOG_INPUTS) {
    const result = resolveOmpModel(input);
    assert.equal(
      'agentId' in result, false,
      `resolveOmpModel("${input}") must not include agentId — registry evidence is separate`,
    );
  }
});

// ── Fail-closed records have no selector ────────────────────────────────────

test('every fail-closed record has selector: null', () => {
  for (const input of LIVE_CATALOG_INPUTS) {
    const result = resolveOmpModel(input);
    if (result.status === 'FAIL_CLOSED') {
      assert.equal(result.selector, null, `FAIL_CLOSED "${input}" must have selector: null`);
      assert.equal(result.normalizedRoute, null);
      assert.equal(result.thinkingLevel, null);
      assert.ok(result.failClass, `FAIL_CLOSED "${input}" must have a failClass`);
      assert.ok(result.reason, `FAIL_CLOSED "${input}" must have a reason`);
    }
  }
});

test('every OK record has a non-null selector', () => {
  for (const input of LIVE_CATALOG_INPUTS) {
    const result = resolveOmpModel(input);
    if (result.status === 'OK') {
      assert.ok(result.selector !== null && result.selector.length > 0,
        `OK "${input}" must have a non-empty selector`);
      assert.equal(result.failClass, null, `OK "${input}" must have failClass: null`);
      assert.equal(result.reason, null, `OK "${input}" must have reason: null`);
    }
  }
});

// ── Deterministic: every live catalog input resolves repeatably ─────────────

test('every model in the live catalog resolves deterministically', () => {
  assert.ok(LIVE_CATALOG_INPUTS.length > 0, 'must have at least one known catalog input');

  for (const input of LIVE_CATALOG_INPUTS) {
    const first = resolveOmpModel(input);
    const second = resolveOmpModel(input);
    assert.deepEqual(second, first, `"${input}" must produce identical results across calls`);
    assert.ok(
      first.status === 'OK' || first.status === 'FAIL_CLOSED',
      `"${input}" status must be OK or FAIL_CLOSED, got "${first.status}"`,
    );
    assert.equal(first.input, input, `"${input}" input field must round-trip`);
  }
});

// ── Two-way set equality: live catalog inputs <-> ALL_SOURCE_ROUTES ─────────
// The resolver's translation table must neither omit a live catalog input
// (which would silently unknown_model it) nor carry stale entries no longer
// present in the catalog (which would resolve inputs the catalog no longer
// emits). Report missing and stale sets separately so a failure names which
// side drifted.

test('live catalog inputs and ALL_SOURCE_ROUTES are exactly set-equal', () => {
  const catalogSet = new Set(LIVE_CATALOG_INPUTS);
  const routeSet = new Set(Object.keys(ALL_SOURCE_ROUTES));

  const missingFromRoutes = LIVE_CATALOG_INPUTS.filter((k) => !routeSet.has(k));
  const staleInRoutes = [...routeSet].filter((k) => !catalogSet.has(k));

  assert.deepEqual(
    missingFromRoutes, [],
    `catalog inputs missing from ALL_SOURCE_ROUTES (would unknown_model): ${JSON.stringify(missingFromRoutes)}`,
  );
  assert.deepEqual(
    staleInRoutes, [],
    `ALL_SOURCE_ROUTES entries no longer in the live catalog (stale): ${JSON.stringify(staleInRoutes)}`,
  );
  assert.equal(catalogSet.size, routeSet.size, 'set sizes must match once missing/stale are both empty');
});
