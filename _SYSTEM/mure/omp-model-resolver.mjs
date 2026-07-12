#!/usr/bin/env node
// @capability: omp-model-resolver
// @serves: strict OMP model resolution — catalog input → canonical selector
// @does: translates 31 distinct model strings from the MURE agent catalog into
//   OMP-native selectors, clamps thinking levels per known provider support,
//   and FAIL_CLOSED for Cline (unavailable in OMP), registry-blocked, excluded,
//   forbidden-prefix, and unknown inputs.
// @doctrine: xref-first, context-router-retired, deterministic only
//
// Every translation is source-commented with its rule origin. No silent swaps.
// Route eligibility is governed by provider-route-registry.json. Only routes
// with status "canary-proven" may resolve OK; any other status (including
// blocked-schema, quota-blocked, unresolved, or future unknown status) fails
// closed. excludedModels fail closed. Cline-pass inputs fail closed
// categorically, before the registry is ever consulted.
//
// Bootstrap exception: a catalog-candidate route may resolve OK, with
// bootstrapOnly: true, when the caller passes the exact evidence-only
// canary-bootstrap variant (eligibilityFlags === ['canary-bootstrap']) for
// that route — see classifyBootstrapGate / isCanaryBootstrapVariant below.
// A normal (non-bootstrap) resolution of a catalog-candidate route fails
// closed as canary_pending, not registry_blocked. Once a bootstrapped
// route's registry status advances to canary-proven, the bootstrap variant
// itself tombstones (bootstrap_expired) — it must never resolve again; the
// normal variant is required going forward.

import { readFileSync } from 'node:fs';

// ── Registry-derived index (single source: provider-route-registry.json) ────
const _registryRaw = readFileSync(
  new URL('../config/provider-route-registry.json', import.meta.url), 'utf-8'
);
// Strip trailing commas (the registry uses JSON5-ish trailing commas)
const providerRouteRegistry = JSON.parse(_registryRaw.replace(/,\s*([}\]])/g, '$1'));

/**
 * `observed` must be a nonempty calendar-valid YYYY-MM-DD string for both
 * canary evidence schemas below. A UTC round-trip through `Date` rejects
 * impossible calendar dates (e.g. "2026-02-31" normalizes to March and no
 * longer round-trips), not just the shape.
 */
function isValidObservedDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === value;
}
// ── Immutable provider-level thinking caps ────────────────────────────────
// Must precede ROUTE_BY_MODEL: buildRouteByModelIndex → isAdmissibleCanaryEvidence
// may need LEVEL_RANK for thinkingLevel validation.
const LEVEL_RANK = Object.freeze({
  off: 0,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
  max: 5,
});

/**
 * OMP-native canary evidence schema (single source: omp-task-completion packets).
 *   { jobId, ompSessionId, model, agentId, taskResultStatus, observed,
 *     result: { canary, packageName, status: 'ok' },
 *     transcriptReadObserved, transcriptYieldObserved, thinkingLevel? }
 * — model === route.model, agentId === route.agentId, taskResultStatus exactly
 * 'completed', observed is a calendar-valid YYYY-MM-DD date, thinkingLevel if
 * present and non-null must be a valid vocabulary value.
 * Rejects legacy fields (runId, childSessionKey, resolvedModel) categorically.
 */
function isValidOmpCanaryEvidence(route) {
  const evidence = route && route.canaryEvidence;
  if (!evidence || typeof evidence !== 'object') return false;
  // Reject any legacy field — OMP-only contract.
  if ('runId' in evidence || 'childSessionKey' in evidence || 'resolvedModel' in evidence) return false;
  const { jobId, ompSessionId, model, agentId, taskResultStatus, observed, result,
    transcriptReadObserved, transcriptYieldObserved, thinkingLevel } = evidence;
  if (typeof jobId !== 'string' || !jobId) return false;
  if (typeof ompSessionId !== 'string' || !ompSessionId) return false;
  if (model !== route.model) return false;
  if (agentId !== route.agentId) return false;
  if (taskResultStatus !== 'completed') return false;
  if (!isValidObservedDate(observed)) return false;
  // Nested result object
  if (!result || typeof result !== 'object') return false;
  if (typeof result.canary !== 'string' || !result.canary) return false;
  if (typeof result.packageName !== 'string' || !result.packageName) return false;
  if (result.status !== 'ok') return false;
  // Transcript observation booleans
  if (transcriptReadObserved !== true || transcriptYieldObserved !== true) return false;
  // thinkingLevel: null or valid vocabulary value
  if (thinkingLevel !== null && thinkingLevel !== undefined) {
    if (typeof thinkingLevel !== 'string' || !Object.hasOwn(LEVEL_RANK, thinkingLevel)) return false;
  }
  // Model-specific minimum binding level: if the route declares a minimum,
  // the evidence thinkingLevel must meet or exceed it.
  const minBinding = route.minimumBindingThinkingLevel;
  if (minBinding) {
    if (typeof minBinding !== 'string' || !Object.hasOwn(LEVEL_RANK, minBinding)) return false;
    const evidenceLevel = (thinkingLevel !== null && thinkingLevel !== undefined) ? thinkingLevel : 'off';
    if (LEVEL_RANK[evidenceLevel] < LEVEL_RANK[minBinding]) return false;
  }
  return true;
}

/**
 * Whether a route's canary evidence is admissible under the OMP-native schema.
 * Requires route.model and route.agentId to both be nonempty strings first —
 * without either, an evidence-side comparison against undefined could pass on
 * an equally modelless/agentless record.
 * Exported so the registry-index builder (below), the fleet validator, and
 * tests share one admissibility rule instead of three drifting copies.
 * Non-canary-proven routes are the caller's concern to skip: this predicate
 * only judges evidence shape, not route.status.
 */
export function isAdmissibleCanaryEvidence(route) {
  if (!route || typeof route.model !== 'string' || !route.model) return false;
  if (typeof route.agentId !== 'string' || !route.agentId) return false;
  return isValidOmpCanaryEvidence(route);
}

/**
 * Build the flat route.model → route-metadata index from a
 * provider-route-registry.json-shaped object (`{ modelIdentities: { ... } }`).
 * Throws if two routes — even across different modelIdentities — share the
 * same `route.model` key: a duplicate route.model is a registry authoring
 * bug (ambiguous resolution target), not a silent-collapse case. Also
 * throws if any `status: 'canary-proven'` route lacks admissible canary
 * evidence (see isAdmissibleCanaryEvidence) — this makes every consumer of
 * the registry (resolver, sync, generator) fail closed at load time even if
 * a separate validator pass (e.g. mure-fleet-validate's CHECK J) is skipped
 * or never runs. Non-canary-proven routes are never evidence-checked here:
 * historical evidence on a demoted/blocked route is not readmission.
 * Exported so both the module's own load-time index and tests (against the
 * live registry or fixture data) share one uniqueness + admissibility rule.
 * The index itself is built on a null-prototype object so a fixture (or,
 * theoretically, a compromised registry) with `model: "__proto__"` cannot
 * silently reassign the object's prototype instead of adding an own key —
 * that would both corrupt the index and bypass the duplicate-key check.
 */
export function buildRouteByModelIndex(registryData) {
  const idx = Object.create(null);
  for (const identity of Object.values(registryData.modelIdentities)) {
    for (const route of identity.routes) {
      if (Object.hasOwn(idx, route.model)) {
        throw new Error(
          `Duplicate registry route.model key "${route.model}" (route id "${route.id}"); ` +
          `route.model must be unique across every modelIdentity.`,
        );
      }
      if (route.status === 'canary-proven' && !isAdmissibleCanaryEvidence(route)) {
        throw new Error(
          `Registry route "${route.model}" (route id "${route.id}") is status "canary-proven" ` +
          `but lacks admissible OMP canary evidence; a canary-proven route must carry proof ` +
          `or it must not claim canary-proven status.`,
        );
      }
      idx[route.model] = {
        status: route.status,
        agentId: route.agentId,
        blockedReason: route.blockedReason ?? null,
      };
    }
  }
  return idx;
}

// Flat index: route.model → { status, agentId, blockedReason }
const ROUTE_BY_MODEL = Object.freeze(buildRouteByModelIndex(providerRouteRegistry));

// Normalized selector → exclusion reason
const EXCLUDED_BY_MODEL = Object.freeze(
  (() => {
    const map = {};
    for (const entry of providerRouteRegistry.excludedModels) {
      map[entry.model] = entry.reason;
    }
    return map;
  })(),
);

/**
 * Known FAIL_CLOSED fail classes. All others resolve ok.
 * Declared ahead of resolveOmpModel (rather than at file end) because the
 * resolver references these constants directly and several exports below
 * invoke resolveOmpModel at module-load time — the const must already be
 * initialized by then, not merely declared later in source order.
 */
export const FAIL_CLASSES = Object.freeze({
  CLINE_UNAVAILABLE: 'cline_unavailable',
  UNKNOWN_MODEL: 'unknown_model',
  REGISTRY_BLOCKED: 'registry_blocked',
  FORBIDDEN_SELECTOR: 'forbidden_selector',
  MODEL_EXCLUDED: 'model_excluded',
  UNPROVEN_ROUTE: 'unproven_route',
  CANARY_PENDING: 'canary_pending',
  BOOTSTRAP_EXPIRED: 'bootstrap_expired',
});

/**
 * Provider prefixes forbidden in any output selector.
 * Used by the generator and validator to reject stale routes, and enforced
 * inside resolveOmpModel itself (Step 4) before any OK can be returned.
 */
export const FORBIDDEN_SELECTOR_PREFIXES = Object.freeze([
  'openai/',
  'minimax-portal/',
  'cline-pass/',
  'cursor-cli/',
  'ollama/',
]);

// ── Immutable provider-level thinking caps ────────────────────────────────
/**
 * Per-provider maximum supported thinking level.
 * - Anthropic: model-specific (Opus→high, Sonnet→high, Haiku→medium, Fable→medium)
 * - Zai: all GLM → xhigh
 * - Ollama Cloud: → high
 * - Cursor: non-thinking → off
 * - OpenAI Codex: Sol→high, Terra/Luna→medium
 * - OpenCode-Go: → off
 * - DeepSeek direct: → max
 * - MiniMax Code: → medium
 */
const PROVIDER_THINKING_CAPS = Object.freeze({
  anthropic: { default: 'high' },
  zai: { default: 'xhigh' },
  'ollama-cloud': { default: 'high' },
  cursor: { default: 'off' },
  'openai-codex': { default: 'high' },
  'opencode-go': { default: 'off' },
  deepseek: { default: 'high' }, // Flash→high; Pro→max in model overrides below
  'minimax-code': { default: 'high' },
});

// Per-model overrides within a provider
const MODEL_THINKING_CAPS = Object.freeze({
  // Anthropic — model-specific
  'anthropic/claude-opus-4-8': 'high',
  'anthropic/claude-opus-4-7': 'high',
  'anthropic/claude-sonnet-4-6': 'high',
  'anthropic/claude-sonnet-5': 'high',
  'anthropic/claude-haiku-4-5': 'medium',
  'anthropic/claude-fable-5': 'high',
  // OpenAI Codex — model-specific (Terra/Luna support high per catalog evidence)
  'openai-codex/gpt-5.6-sol': 'high',
  'openai-codex/gpt-5.6-terra': 'high',
  'openai-codex/gpt-5.6-luna': 'high',
  // DeepSeek direct — variant-specific (Flash→high, Pro→max)
  'deepseek/deepseek-v4-flash': 'high',
  'deepseek/deepseek-v4-pro': 'max',
  // MiniMax Code — supports high per catalog evidence
  'minimax-code/MiniMax-M3': 'high',
});

/**
 * Clamp an input thinking level to a provider/model maximum.
 * Returns the lower of the two levels.
 */
function clampThinking(inputLevel, resolvedSelector) {
  if (inputLevel == null || inputLevel === 'off') return 'off';

  const inputRank = LEVEL_RANK[inputLevel];
  if (inputRank === undefined) return 'off'; // unknown level → safe default

  // Check per-model cap first, then per-provider fallback
  const modelCap = MODEL_THINKING_CAPS[resolvedSelector];
  if (modelCap) {
    const maxRank = LEVEL_RANK[modelCap] ?? 0;
    const clamped = Math.min(inputRank, maxRank);
    for (const [k, v] of Object.entries(LEVEL_RANK)) {
      if (v === clamped) return k;
    }
    return 'off';
  }

  // Provider-level fallback: extract provider from selector
  const provider = resolvedSelector.split('/')[0];
  const providerCap = PROVIDER_THINKING_CAPS[provider];
  if (providerCap) {
    const maxRank = LEVEL_RANK[providerCap.default] ?? 0;
    const clamped = Math.min(inputRank, maxRank);
    for (const [k, v] of Object.entries(LEVEL_RANK)) {
      if (v === clamped) return k;
    }
    return 'off';
  }

  return inputLevel; // unknown provider → pass through unchanged
}

// ── Translation table ─────────────────────────────────────────────────────
//
// Each entry:
//   input         — catalog model string (exact match)
//   selector      — resolved OMP-native selector (null if FAIL_CLOSED)
//   sourceRoute   — catalog providerMapping value (or input if unmapped)
//   failClass     — null | "cline_unavailable" | "unknown_model" | ...
//   reason        — human-readable reason for failClass

/**
 * Catalog providerMapping source routes.
 * Keys match `providerMapping` from `_SYSTEM/mure/agent-catalog.json`.
 * Cursor values are `cursor-cli/*` in the catalog but our output selectors
 * MUST be `cursor/*` per acceptance: no output starts `cursor-cli/`.
 */
const CATALOG_SOURCE_ROUTES = Object.freeze({
  // Anthropic — exact (6)
  'anthropic/claude-opus-4-8': 'anthropic/claude-opus-4-8',
  'anthropic/claude-opus-4-7': 'anthropic/claude-opus-4-7',
  'anthropic/claude-sonnet-4-6': 'anthropic/claude-sonnet-4-6',
  'anthropic/claude-sonnet-5': 'anthropic/claude-sonnet-5',
  'anthropic/claude-haiku-4-5': 'anthropic/claude-haiku-4-5',
  'anthropic/claude-fable-5': 'anthropic/claude-fable-5',
  // Zai — exact (4)
  'zai/glm-5.2': 'zai/glm-5.2',
  'zai/glm-5.1': 'zai/glm-5.1',
  'zai/glm-5': 'zai/glm-5',
  'zai/glm-5-turbo': 'zai/glm-5-turbo',
  // Ollama Cloud — normalize (6)
  'ollama-cloud/deepseek-v4-flash:cloud': 'ollama-cloud/deepseek-v4-flash:cloud',
  'ollama-cloud/deepseek-v4-pro:cloud': 'ollama-cloud/deepseek-v4-pro:cloud',
  'ollama-cloud/kimi-k2.7-code:cloud': 'ollama-cloud/kimi-k2.7-code:cloud',
  'ollama-cloud/nemotron-3-ultra:cloud': 'ollama-cloud/nemotron-3-ultra:cloud',
  'ollama-cloud/qwen3.5:cloud': 'ollama-cloud/qwen3.5:cloud',
  'ollama-cloud/gemma4:31b-cloud': 'ollama-cloud/gemma4:31b-cloud',
  // Cline-pass — FAIL_CLOSED (4)
  'cline-pass/cline-pass/deepseek-v4-flash': 'cline-pass/cline-pass/deepseek-v4-flash',
  'cline-pass/cline-pass/mimo-v2.5': 'cline-pass/cline-pass/mimo-v2.5',
  'cline-pass/cline-pass/qwen3.7-max': 'cline-pass/cline-pass/qwen3.7-max',
  'cline-pass/cline-pass/kimi-k2.7-code': 'cline-pass/cline-pass/kimi-k2.7-code',
  // Cursor — exact (3 base; keep cursor/* not cursor-cli/*)
  'cursor/composer-2.5': 'cursor-cli/composer-2.5', // catalog source is cursor-cli
  'cursor/gemini-3.5-flash': 'cursor-cli/gemini-3.5-flash',
  'cursor/kimi-k2.7-code': 'cursor-cli/kimi-k2.7-code',
  // OpenAI — translate to openai-codex (3)
  'openai/gpt-5.6-sol': 'openai/gpt-5.6-sol',
  'openai/gpt-5.6-terra': 'openai/gpt-5.6-terra',
  'openai/gpt-5.6-luna': 'openai/gpt-5.6-luna',
  // OpenCode-Go — exact (1)
  'opencode-go/mimo-v2.5': 'opencode-go/mimo-v2.5',
});

// Entries not in catalog providerMapping but present in agent definitions
const EXTRA_SOURCE_ROUTES = Object.freeze({
  'cursor/composer-2.5-fast': 'cursor/composer-2.5-fast',
  'deepseek-v4-flash:direct': 'deepseek-v4-flash:direct',
  'deepseek-v4-pro:direct': 'deepseek-v4-pro:direct',
  'minimax-portal/MiniMax-M3': 'minimax-portal/MiniMax-M3',
});

const ALL_SOURCE_ROUTES = Object.freeze({
  ...CATALOG_SOURCE_ROUTES,
  ...EXTRA_SOURCE_ROUTES,
});

/**
 * Normalize a catalog model string into its canonical OMP-native selector
 * (the same rules resolveOmpModel's Step 3 applies), independent of any
 * registry lookup, canary gate, exclusion, or forbidden-prefix check —
 * those remain resolveOmpModel's job. Pure string transform: given any
 * catalogModel it always returns SOME selector and never throws, even for
 * an input resolveOmpModel would separately reject upstream (unknown_model
 * at Step 1, cline-pass/* at Step 0).
 *
 * Exported so any consumer that needs "what selector would this catalog
 * model normalize to" — without running the full canary/exclusion
 * pipeline — shares this exact rule instead of a second, driftable copy.
 * resolveOmpModel itself calls this function for its own Step 3.
 */
export function normalizeSelector(catalogModel) {
  // 3a: :direct suffix → strip into deepseek/*
  const directMatch = catalogModel.match(/^(deepseek-v4-(?:flash|pro)):direct$/);
  // 3b: openai/gpt-5.6-* → openai-codex/gpt-5.6-*
  const openaiMatch = catalogModel.match(/^openai\/gpt-5\.6-(sol|terra|luna)$/);

  if (directMatch) return `deepseek/${directMatch[1]}`;
  if (openaiMatch) return `openai-codex/gpt-5.6-${openaiMatch[1]}`;
  if (catalogModel === 'minimax-portal/MiniMax-M3') return 'minimax-code/MiniMax-M3';
  // 3c: ollama-cloud/qwen3.5:cloud → ollama-cloud/qwen3.5:397b
  if (catalogModel === 'ollama-cloud/qwen3.5:cloud') return 'ollama-cloud/qwen3.5:397b';
  // 3d: ollama-cloud/gemma4:31b-cloud → normalize tag
  if (catalogModel === 'ollama-cloud/gemma4:31b-cloud') return 'ollama-cloud/gemma4:31b';
  // 3e: ollama-cloud/*:cloud → pass-through
  if (catalogModel.startsWith('ollama-cloud/') && catalogModel.endsWith(':cloud')) return catalogModel;
  // 3f: Cursor → exact (cursor/* not cursor-cli/*; sourceRoute carries the
  // catalog's cursor-cli/* alias, the output selector never does)
  if (catalogModel.startsWith('cursor/')) return catalogModel;
  // 3g: Anthropic, Zai, OpenCode-Go → exact pass-through
  return catalogModel;
}

/**
 * Resolve the exact source-route key AND the normalized-selector key a
 * catalog model would be evaluated under — WITHOUT consulting any registry,
 * canary evidence, exclusion, or forbidden-prefix gate. `sourceRoute` falls
 * back to `catalogModel` itself when the model has no known alias in
 * ALL_SOURCE_ROUTES (mirrors "sourceRoute carries the alias, or the input
 * itself if unmapped").
 *
 * Exported specifically so a registry-INJECTABLE consumer (e.g. the fleet
 * validator's bootstrap-route-eligibility check, which takes its own
 * fixture or live registry rather than the frozen live singleton this
 * module loads at import time) can look a catalog model up under BOTH
 * keys — mirroring the exact dual-key philosophy resolveOmpModel's Step 2/
 * Step 6 gates use against ROUTE_BY_MODEL — without re-deriving or
 * drifting from the resolver's own alias/normalization rules.
 */
export function resolveCatalogRoute(catalogModel) {
  const sourceRoute = Object.hasOwn(ALL_SOURCE_ROUTES, catalogModel)
    ? ALL_SOURCE_ROUTES[catalogModel]
    : catalogModel;
  return { sourceRoute, selector: normalizeSelector(catalogModel) };
}

// Registry evidence is now sourced from provider-route-registry.json at module
// load time (ROUTE_BY_MODEL + EXCLUDED_BY_MODEL above). A convenience export is
// rebuilt below for downstream consumers.

// ── Resolution helpers ──────────────────────────────────────────────────────

/**
 * Determine whether a model is owner-excluded, checking the raw catalog
 * input, its catalog source route, and its normalized (resolved) selector —
 * exclusions must not be bypassable merely because a raw alias differs from
 * its normalized form. Accepts an injectable exclusion map (default: the
 * live registry-derived EXCLUDED_BY_MODEL) so tests can exercise raw-form /
 * source-route exclusion matching against fixture data without editing the
 * live registry.
 */
function findExclusion(rawInput, normalizedSelector, sourceRoute, exclusionMap = EXCLUDED_BY_MODEL) {
  if (Object.hasOwn(exclusionMap, rawInput)) return exclusionMap[rawInput];
  if (sourceRoute != null && Object.hasOwn(exclusionMap, sourceRoute)) return exclusionMap[sourceRoute];
  if (Object.hasOwn(exclusionMap, normalizedSelector)) return exclusionMap[normalizedSelector];
  return null;
}

/**
 * Check whether a resolved selector begins with any forbidden provider
 * prefix. Accepts an injectable prefix list (default: the live
 * FORBIDDEN_SELECTOR_PREFIXES) so tests can exercise the gate against
 * fixture selectors without needing a forbidden prefix to appear in the
 * live translation table.
 */
function isForbiddenSelector(selector, prefixes = FORBIDDEN_SELECTOR_PREFIXES) {
  return prefixes.some((prefix) => selector.startsWith(prefix));
}

/**
 * Whether `variant` carries the exact evidence-only canary-bootstrap
 * identity: `eligibilityFlags` is an array containing exactly the single
 * flag `'canary-bootstrap'`. This is the resolver's own admission test —
 * it is deliberately narrow (identity only). Deeper catalog hygiene (tools
 * restricted to read-only, a variant note containing "evidence-only") is
 * validated separately by `validateCanaryBootstrapVariants`
 * (mure-fleet-validate.mjs) and enforced structurally by
 * `buildOmpProjection`, which always forces tools/spawns/task for a
 * bootstrap-admitted card regardless of what the catalog variant declares.
 * A near-miss (extra flags, wrong flag) is never treated as a bootstrap
 * variant here — it simply resolves as an ordinary (non-bootstrap) variant,
 * so a malformed "almost bootstrap" variant fails closed the same way any
 * other catalog-candidate resolution does (canary_pending), never silently
 * granted bootstrap admission.
 */
export function isCanaryBootstrapVariant(variant) {
  if (!variant || typeof variant !== 'object') return false;
  const flags = variant.eligibilityFlags;
  return Array.isArray(flags) && flags.length === 1 && flags[0] === 'canary-bootstrap';
}

/**
 * Pure, registry-independent decision table for the catalog-candidate /
 * canary-proven bootstrap gate. Given a route's registry `status` (or
 * `null` for an unregistered route) and whether the resolving variant
 * carries the exact canary-bootstrap identity, returns exactly one verdict:
 *
 *   - `admit-bootstrap` — catalog-candidate route + bootstrap variant:
 *     resolves OK with bootstrapOnly: true.
 *   - `pending`          — catalog-candidate route, no bootstrap variant:
 *     fails closed as canary_pending.
 *   - `tombstone`        — canary-proven route + bootstrap variant: the
 *     bootstrap has served its purpose and must never resolve again; fails
 *     closed as bootstrap_expired.
 *   - `proceed`          — canary-proven route, no bootstrap variant: the
 *     resolver's normal OK path applies unchanged.
 *   - `blocked`          — any other status (blocked-schema, quota-blocked,
 *     unresolved, a future/unknown status, or no registry row at all):
 *     bootstrap identity never rescues a non-candidate, non-proven route.
 *
 * Deliberately independent of ROUTE_BY_MODEL/the live registry so every
 * status — live, hypothetical, or introduced after this code was written —
 * is exhaustively regression-tested without registry fixture injection or
 * mutating the frozen live singleton.
 */
export function classifyBootstrapGate(routeStatus, isBootstrapVariant) {
  if (routeStatus === 'catalog-candidate') {
    return { verdict: isBootstrapVariant ? 'admit-bootstrap' : 'pending' };
  }
  if (routeStatus === 'canary-proven') {
    return { verdict: isBootstrapVariant ? 'tombstone' : 'proceed' };
  }
  return { verdict: 'blocked' };
}

/**
 * Build a FAIL_CLOSED result with consistent shape.
 */
function makeFailClosed(input, failClass, reason, sourceRoute, routeStatus, evidenceAgentId) {
  return {
    input,
    selector: null,
    status: 'FAIL_CLOSED',
    failClass,
    reason,
    sourceRoute,
    normalizedRoute: null,
    thinkingLevel: null,
    routeStatus,
    evidenceAgentId,
    bootstrapOnly: false,
  };
}

/**
 * Build an OK result with consistent shape.
 */
function makeOk(input, selector, sourceRoute, thinkingLevel, routeStatus, evidenceAgentId, bootstrapOnly = false) {
  return {
    input,
    selector,
    status: 'OK',
    failClass: null,
    reason: null,
    sourceRoute,
    normalizedRoute: selector,
    thinkingLevel: clampThinking(thinkingLevel, selector),
    routeStatus,
    evidenceAgentId,
    bootstrapOnly,
  };
}

// ── Core resolution ───────────────────────────────────────────────────────

/**
 * Resolve a catalog model string into a canonical OMP selector.
 *
 * @param {string} catalogModel  — exact model string from the MURE agent catalog
 * @param {string|null} thinkingLevel — requested thinking level (off/low/medium/high/xhigh/max)
 * @param {object|null} variant — the catalog variant object being resolved, or
 *   null for a base-role (non-variant) resolution. Only its identity
 *   matters here (see isCanaryBootstrapVariant) — an exact evidence-only
 *   canary-bootstrap variant is the sole way a catalog-candidate route may
 *   resolve OK, and the sole way a canary-proven route can be tombstoned.
 * @returns {{
 *   input: string,
 *   selector: string|null,
 *   status: 'OK' | 'FAIL_CLOSED',
 *   failClass: string|null,
 *   reason: string|null,
 *   sourceRoute: string,
 *   normalizedRoute: string|null,
 *   thinkingLevel: string|null,
 *   routeStatus: string|null,
 *   evidenceAgentId: string|null,
 *   bootstrapOnly: boolean,
 * }}
 */
export function resolveOmpModel(catalogModel, thinkingLevel = null, variant = null) {
  // ── Step 0: Cline-pass policy gate — evaluated before the known-input and
  // registry gates. Any input beginning with 'cline-pass/' fails closed
  // whether or not it is a recognized catalog route: Cline is categorically
  // unavailable in OMP, so there is nothing to look up in the registry or
  // the translation table. routeStatus/evidenceAgentId stay null — the
  // registry is never consulted for Cline. A non-Cline input that isn't
  // recognized still falls through to the unknown_model gate below.
  if (catalogModel.startsWith('cline-pass/')) {
    return makeFailClosed(
      catalogModel, FAIL_CLASSES.CLINE_UNAVAILABLE,
      'Cline provider is unavailable in OMP. No fallback or substitute.',
      catalogModel, null, null
    );
  }

  // ── Step 1: Match against known inputs (own-key safe) ────────────────
  if (!Object.hasOwn(ALL_SOURCE_ROUTES, catalogModel)) {
    return makeFailClosed(
      catalogModel, FAIL_CLASSES.UNKNOWN_MODEL,
      `Model "${catalogModel}" is not in the OMP live roster and has no deterministic translation.`,
      catalogModel, null, null
    );
  }
  const sourceRoute = ALL_SOURCE_ROUTES[catalogModel];

  // ── Step 2: Registry gate (before any normalization) ──────────────────
  const registryEntry = Object.hasOwn(ROUTE_BY_MODEL, sourceRoute)
    ? ROUTE_BY_MODEL[sourceRoute]
    : null;
  const routeStatus = registryEntry?.status ?? null;
  const evidenceAgentId = registryEntry?.agentId ?? null;
  const isBootstrapVariant = isCanaryBootstrapVariant(variant);
  // Only canary-proven routes may resolve OK (with a single evidence-only
  // exception: an exact canary-bootstrap variant admits a catalog-candidate
  // route). Any other status — blocked-schema, quota-blocked, unresolved,
  // or future unknown statuses — fails closed regardless of bootstrap
  // identity. This is an allow-only gate, not an enumerated deny-list; it
  // protects against statuses added after this code was written (e.g.
  // openai/gpt-5.6-terra moving canary-proven → quota-blocked after a live
  // usage_limit_reached failure).
  //
  // The catalog-candidate/bootstrap admission decision is made HERE, keyed
  // only on the exact source route (bootstrap variants exist precisely to
  // bootstrap a route that has no proof anywhere yet). The canary-proven
  // tombstone decision, by contrast, is made below at Step 6 — a route can
  // become canary-proven under EITHER its exact source-route key or its
  // normalized-selector key (e.g. minimax-portal/MiniMax-M3's registry row
  // is keyed at the normalized "minimax-code/MiniMax-M3", not the source
  // route), so only Step 6 — which already checks both keys — has enough
  // visibility to tombstone correctly in every case.
  let bootstrapAdmittedAtSource = false;
  if (registryEntry) {
    if (registryEntry.status === 'catalog-candidate') {
      const gate = classifyBootstrapGate('catalog-candidate', isBootstrapVariant);
      if (gate.verdict === 'pending') {
        return makeFailClosed(
          catalogModel, FAIL_CLASSES.CANARY_PENDING,
          `Registry route "${sourceRoute}" has status "catalog-candidate" — canary proof is pending; ` +
            `only the exact evidence-only canary-bootstrap variant (eligibilityFlags: ["canary-bootstrap"]) may resolve while pending.`,
          sourceRoute, routeStatus, evidenceAgentId
        );
      }
      // gate.verdict === 'admit-bootstrap' — continue to normalize; final
      // admission is confirmed at Step 6 once we know the route is not
      // ALSO already canary-proven under its normalized selector key.
      bootstrapAdmittedAtSource = true;
    } else if (registryEntry.status !== 'canary-proven') {
      // blocked-schema, quota-blocked, unresolved, or any other
      // non-candidate, non-proven status — fails closed unconditionally;
      // bootstrap identity never rescues a non-candidate route.
      return makeFailClosed(
        catalogModel, FAIL_CLASSES.REGISTRY_BLOCKED,
        registryEntry.blockedReason ||
          `Registry route "${sourceRoute}" has status "${registryEntry.status}" — only canary-proven routes may resolve.`,
        sourceRoute, routeStatus, evidenceAgentId
      );
    }
    // else: status === 'canary-proven' at the source key — fall through
    // unchanged; Step 6 decides OK vs bootstrap_expired tombstone.
  }

  // ── Step 3: Normalize selector (shared rule — see normalizeSelector) ──
  const selector = normalizeSelector(catalogModel);

  // ── Step 4: Forbidden-prefix gate — reject before any OK can be returned ─
  if (isForbiddenSelector(selector)) {
    return makeFailClosed(
      catalogModel, FAIL_CLASSES.FORBIDDEN_SELECTOR,
      `Normalized selector "${selector}" uses a forbidden provider prefix and must not resolve.`,
      sourceRoute, routeStatus, evidenceAgentId
    );
  }

  // ── Step 5: Excluded-models gate (raw input, source route, or normalized
  // selector — see findExclusion) ───────────────────────────────────────
  const exclusionReason = findExclusion(catalogModel, selector, sourceRoute);
  if (exclusionReason) {
    return makeFailClosed(
      catalogModel, FAIL_CLASSES.MODEL_EXCLUDED,
      exclusionReason,
      sourceRoute, routeStatus, evidenceAgentId
    );
  }

  // ── Step 6: Canary gate — require canary-proven evidence for either ───
  // exact source route or canonical (normalized) selector. A route may
  // resolve OK only when at least one of the two has canary-proven
  // registry evidence. Provider catalog availability never substitutes.
  const sourceCanary = ROUTE_BY_MODEL[sourceRoute];
  const selectorCanary = ROUTE_BY_MODEL[selector];
  const sourceProven = sourceCanary?.status === 'canary-proven';
  const selectorProven = selectorCanary?.status === 'canary-proven';
  const provenSomewhere = sourceProven || selectorProven;

  // Tombstone: the route this variant targets is now proven under EITHER
  // key — a canary-bootstrap variant must never resolve past that point,
  // proven-anywhere or not; the normal (non-bootstrap) variant is required.
  if (provenSomewhere && isBootstrapVariant) {
    const provenEntry = sourceProven ? sourceCanary : selectorCanary;
    return makeFailClosed(
      catalogModel, FAIL_CLASSES.BOOTSTRAP_EXPIRED,
      `Route "${sourceProven ? sourceRoute : selector}" is now canary-proven; the canary-bootstrap variant is a ` +
        `tombstone and must never resolve again — dispatch the normal (non-bootstrap) variant instead.`,
      sourceRoute, provenEntry.status, provenEntry.agentId
    );
  }

  if (!provenSomewhere) {
    // Evidence-only bootstrap admission: the source route was confirmed
    // catalog-candidate above and no proof exists anywhere yet — the exact
    // bootstrap variant may resolve OK with bootstrapOnly: true.
    if (bootstrapAdmittedAtSource) {
      return makeOk(catalogModel, selector, sourceRoute, thinkingLevel, routeStatus, evidenceAgentId, true);
    }
    return makeFailClosed(
      catalogModel, FAIL_CLASSES.UNPROVEN_ROUTE,
      sourceCanary
        ? `Registry route "${sourceRoute}" has status "${sourceCanary.status}" and normalized "${selector}" is not canary-proven.`
        : selectorCanary
          ? `Registry route "${selector}" has status "${selectorCanary.status}" (not canary-proven).`
          : `Neither "${sourceRoute}" nor "${selector}" has canary-proven registry evidence.`,
      sourceRoute, 'unregistered', null
    );
  }

  // provenSomewhere && !isBootstrapVariant — the normal OK path, unchanged.
  // Use the winning canary entry's metadata for the resolution record.
  const finalRouteStatus = selectorProven ? selectorCanary.status : routeStatus;
  const finalEvidenceAgentId = selectorProven ? selectorCanary.agentId : evidenceAgentId;

  return makeOk(catalogModel, selector, sourceRoute, thinkingLevel, finalRouteStatus, finalEvidenceAgentId);
}

// ── Immutable translation metadata ────────────────────────────────────────

/**
 * Complete translation map: every known catalog input → its canonical OMP
 * selector (or null for FAIL_CLOSED). Use for bulk lookups and generator
 * pre-validation without calling resolveOmpModel per entry.
 */
export const OMP_TRANSLATION_MAP = deepFreeze(
  (() => {
    const map = {};
    for (const input of Object.keys(ALL_SOURCE_ROUTES)) {
      const { selector } = resolveOmpModel(input);
      map[input] = selector;
    }
    return map;
  })(),
);

/**
 * Per-provider OMP thinking support metadata.
 * Keyed by provider prefix (the part before `/` in a resolved selector).
 */
export const OMP_THINKING_CAPS = deepFreeze({
  ...PROVIDER_THINKING_CAPS,
  // Model-level caps for models that differ from their provider default
  modelOverrides: deepFreeze({ ...MODEL_THINKING_CAPS }),
});

/**
 * Registry evidence map: raw registry source routes + resolved-selector
 * projections → canary-proven agent binding.
 * Built from provider-route-registry.json at module load. Advisory only;
 * never use to override a card's requested role.
 */
export const OMP_REGISTRY_EVIDENCE = deepFreeze(
  (() => {
    const map = {};
    // Base: raw registry model keys → agentId for canary-proven routes
    for (const [model, entry] of Object.entries(ROUTE_BY_MODEL)) {
      if (entry.status === 'canary-proven') {
        map[model] = entry.agentId;
      }
    }
    // Additive projection: for every known catalog input that resolves OK,
    // map its normalized selector to the sourceRoute's canary agentId.
    // This lets consumers look up evidence by resolved selector without
    // re-deriving the registry key, while keeping evidence advisory-only.
    for (const input of Object.keys(ALL_SOURCE_ROUTES)) {
      const result = resolveOmpModel(input);
      if (result.failClass === null && result.sourceRoute) {
        const registryEntry = ROUTE_BY_MODEL[result.sourceRoute];
        if (registryEntry?.status === 'canary-proven' && registryEntry.agentId) {
          map[result.selector] = registryEntry.agentId;
        }
      }
    }
    return map;
  })(),
);

/**
 * Immutable thinking-level vocabulary, ordered lowest → highest rank.
 * Mirrors LEVEL_RANK's key order (includes 'max', the ceiling level).
 * Downstream consumers should validate a requested thinkingLevel against
 * this list rather than hardcoding the level set.
 */
export const OMP_THINKING_LEVELS = Object.freeze(Object.keys(LEVEL_RANK));

/**
 * Provider prefixes forbidden in any output selector, and known FAIL_CLOSED
 * fail classes, are exported above (before resolveOmpModel) — see
 * FORBIDDEN_SELECTOR_PREFIXES and FAIL_CLASSES.
 */

// ── Utility ────────────────────────────────────────────────────────────────

/**
 * Deep-freeze an object tree (immutable, in-place).
 */
function deepFreeze(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const val = obj[key];
    if (val != null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

export const _internals = {
  clampThinking,
  LEVEL_RANK,
  CATALOG_SOURCE_ROUTES,
  EXTRA_SOURCE_ROUTES,
  ALL_SOURCE_ROUTES,
  ROUTE_BY_MODEL,
  EXCLUDED_BY_MODEL,
  findExclusion,
  isForbiddenSelector,
  isAdmissibleCanaryEvidence,
  makeFailClosed,
  makeOk,
};
