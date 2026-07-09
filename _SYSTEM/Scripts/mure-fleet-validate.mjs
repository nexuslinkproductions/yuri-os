#!/usr/bin/env node
// @capability: mure-fleet-validate
// @serves: mure fleet integrity test | catalog dispatch-resolvability | cline roster check | armed-state gate | agents.list dangling-ref detector
// @does: TDD regression anchor for the MURE fleet — asserts (A) every projected agents.list model ref resolves to a registered openclaw provider model OR a known CLI-substrate resolver, (B) the 4 target ClinePass models are present in CLINE_ROSTER, (C) cline is armed. Exits non-zero on any failure.
// @use: node mure-fleet-validate.mjs  (CI/regression gate after any catalog/provider/roster change)
// @exports: validateFleet, registeredProviderModels, resolveRef
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildAgentsList, mapModel } from './mure-agents-sync.mjs';
import { CLINE_ROSTER, isArmed as clineArmed } from './cline-fleet.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CATALOG = path.join(REPO, '.openclaw/mure-agent-catalog.json');
const CONFIG = path.join(os.homedir(), '.openclaw/openclaw.json');

// providers OpenClaw resolves natively without an explicit models.providers block
const BUILTIN_PREFIXES = new Set(['anthropic', 'openai']);
const THINKING_LEVELS = new Set(['off', 'low', 'medium', 'high', 'xhigh']);
const COST_TIERS = new Set(['cheap', 'medium', 'heavy', 'apex']);

// The 4 models Marcel targets on ClinePass (cheap: dvf+mimo; heavy: qwen3.7-max+kimi).
const CLINE_TARGETS = [
  'cline-pass/deepseek-v4-flash',
  'cline-pass/mimo-v2.5',
  'cline-pass/qwen3.7-max',
  'cline-pass/kimi-k2.7-code',
];

/** Build the set of valid "provider/id" refs from the live openclaw config. */
export function registeredProviderModels(config) {
  const valid = new Set();
  const provs = (config.models && config.models.providers) || {};
  const passthrough = new Set(); // registered providers that declare NO models -> dynamic passthrough
  for (const [prov, def] of Object.entries(provs)) {
    const models = def.models || [];
    if (!models.length) passthrough.add(prov);
    for (const m of models) {
      if (m && m.id) valid.add(`${prov}/${m.id}`);
    }
  }
  return { valid, providerNames: new Set(Object.keys(provs)), passthrough };
}

/**
 * Classify one projected model ref.
 * @returns {{ref:string, ok:boolean, via:string}}
 */
export function resolveRef(ref, reg, clineModels) {
  const prov = ref.split('/')[0];
  if (BUILTIN_PREFIXES.has(prov)) return { ref, ok: true, via: 'builtin' };
  if (reg.valid.has(ref)) return { ref, ok: true, via: 'provider' };
  // cline-pass: resolvable via native provider OR the CLI substrate (CLINE_ROSTER)
  if (prov === 'cline-pass') {
    if (reg.providerNames.has('cline-pass') && !reg.passthrough.has('cline-pass')) return { ref, ok: true, via: 'provider' };
    if (clineModels.has(ref)) return { ref, ok: true, via: 'cli-substrate' };
    return { ref, ok: false, via: 'cline-unmapped' };
  }
  // provider registered with an empty models[] -> dynamic passthrough (can't verify id; WARN not FAIL)
  if (reg.passthrough.has(prov)) return { ref, ok: true, via: 'passthrough', warn: true };
  // provider registered with a model list but id absent, or provider missing entirely
  return { ref, ok: false, via: reg.providerNames.has(prov) ? 'id-missing' : 'provider-absent' };
}

/** Collect skill ids available from workspace and bundled OpenClaw registries. */
function knownSkillIds() {
  const roots = [
    path.join(REPO, 'skills'),
    path.join(REPO, '.claude', 'skills'),
    path.join(REPO, '.codex', 'skills'),
    '/opt/homebrew/lib/node_modules/openclaw/skills',
  ];
  const known = new Set();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const id of fs.readdirSync(root)) {
      if (fs.existsSync(path.join(root, id, 'SKILL.md'))) known.add(id);
    }
  }
  return known;
}

export function validateFleet() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  const reg = registeredProviderModels(config);
  const clineModels = new Set(Object.values(CLINE_ROSTER));
  const checks = [];

  // CHECK A — every projected agents.list ref resolves
  const list = buildAgentsList(catalog);
  const bad = [];
  const warns = new Set();
  for (const a of list) {
    const refs = [a.model.primary, ...((a.model && a.model.fallbacks) || [])].filter(Boolean);
    for (const r of refs) {
      const res = resolveRef(r, reg, clineModels);
      if (!res.ok) bad.push(`${a.id} -> ${r} (${res.via})`);
      else if (res.warn) warns.add(`${r} (${res.via})`);
    }
  }
  const warnNote = warns.size ? ` | WARN passthrough: ${[...warns].join(', ')}` : '';
  checks.push({ name: 'A: agents.list refs all resolve', ok: bad.length === 0, detail: (bad.length ? bad.join('; ') : `${list.length} agents, all refs resolve`) + warnNote });

  // CHECK B — the 4 ClinePass targets present in CLINE_ROSTER
  const missing = CLINE_TARGETS.filter((t) => !clineModels.has(t));
  checks.push({ name: 'B: 4 ClinePass targets in CLINE_ROSTER', ok: missing.length === 0, detail: missing.length ? `MISSING: ${missing.join(', ')}` : CLINE_TARGETS.join(', ') });

  // CHECK C — cline armed
  const armed = clineArmed();
  checks.push({ name: 'C: cline fleet armed', ok: armed, detail: armed ? 'armed' : 'DISARMED (arm via YURI_CLINE_FLEET=1 or touch _SYSTEM/state/cline-fleet.enabled)' });

  // CHECK D — every base role satisfies the bounded immaculate design schema
  const incomplete = [];
  const knownSkills = knownSkillIds();
  for (const a of catalog.agents) {
    const missing = [];
    if (!a.description || a.description.length < 20 || a.description.length > 320) missing.push(`description(${a.description?.length || 0})`);
    if (!Array.isArray(a.skills) || a.skills.length < 4 || a.skills.length > 9) missing.push(`skills(${a.skills?.length || 0})`);
    else {
      const unknown = a.skills.filter((id) => !knownSkills.has(id));
      if (unknown.length) missing.push(`unknown-skills:${unknown.join(',')}`);
    }
    if (!THINKING_LEVELS.has(a.thinkingLevel)) missing.push(`thinkingLevel:${a.thinkingLevel}`);
    const temperature = a.params?.temperature;
    if (temperature != null && (!Number.isFinite(temperature) || temperature < 0 || temperature > 1)) missing.push(`temperature:${temperature}`);
    if (missing.length) incomplete.push(`${a.name}: ${missing.join('+')}`);
  }
  checks.push({ name: 'D: base-role schema is bounded and resolvable', ok: incomplete.length === 0, detail: incomplete.length ? `${incomplete.length}/${catalog.agents.length} invalid: ${incomplete.slice(0, 6).join('; ')}${incomplete.length > 6 ? ' …' : ''}` : `${catalog.agents.length} roles complete` });

  // CHECK E — Sol pilot variants are complete before they can be selected.
  const solVariants = catalog.agents.flatMap((a) => (a.variants || [])
    .filter((v) => v.model === 'openai/gpt-5.6-sol')
    .map((v) => ({ role: a.name, ...v })));
  const solProblems = [];
  const solIds = new Set();
  for (const v of solVariants) {
    const bad = [];
    if (!v.id || solIds.has(v.id)) bad.push(v.id ? 'duplicate-id' : 'id');
    solIds.add(v.id);
    if (!THINKING_LEVELS.has(v.thinkingLevel)) bad.push(`thinkingLevel:${v.thinkingLevel}`);
    if (!Array.isArray(v.tools) || v.tools.length === 0) bad.push('tools');
    if (!Number.isInteger(v.max_tokens) || v.max_tokens < 1) bad.push(`max_tokens:${v.max_tokens}`);
    if (!Array.isArray(v.systemSections) || v.systemSections.length === 0) bad.push('systemSections');
    if (!COST_TIERS.has(v.costTier)) bad.push(`costTier:${v.costTier}`);
    if (!Array.isArray(v.eligibilityFlags) || !v.eligibilityFlags.includes('sol-pilot')) bad.push('sol-pilot-flag');
    if (bad.length) solProblems.push(`${v.role}/${v.id || '<missing>'}: ${bad.join('+')}`);
  }
  checks.push({ name: 'E: GPT-5.6 Sol pilot variants are complete', ok: solVariants.length > 0 && solProblems.length === 0, detail: solProblems.length ? solProblems.join('; ') : `${solVariants.length} complete Sol variants` });

  return { ok: checks.every((c) => c.ok), checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok, checks } = validateFleet();
  for (const c of checks) process.stdout.write(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}\n      ${c.detail}\n`);
  process.stdout.write(`\n${ok ? 'GREEN — fleet integrity verified' : 'RED — fleet integrity failures above'}\n`);
  process.exit(ok ? 0 : 1);
}
