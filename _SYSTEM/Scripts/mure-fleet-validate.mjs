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

  return { ok: checks.every((c) => c.ok), checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok, checks } = validateFleet();
  for (const c of checks) process.stdout.write(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}\n      ${c.detail}\n`);
  process.stdout.write(`\n${ok ? 'GREEN — fleet integrity verified' : 'RED — fleet integrity failures above'}\n`);
  process.exit(ok ? 0 : 1);
}
