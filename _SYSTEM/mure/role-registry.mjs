#!/usr/bin/env node
// @capability: mure-role-registry
// @serves: agent role registry | fleet roles | load roles | role roster | capability match role | resolve lane for role | mure roles | named agent roles
// @does: loads + validates the MURE role roster (_SYSTEM/config/fleet-roles.json), indexes roles by id / group / capability, matches roles to a needed capability set, resolves each role to a concrete dispatch target (native Agent model vs glm lane vs inline deterministic), and resolves a role's mathHooks to live math-bridge functions. The single source of truth for "what roles exist and how to run them."
// @use: import { loadRoster, validateRoster, matchRolesByCapability, resolveLane, roleMathHooks } from mure/role-registry.mjs. CLI: node role-registry.mjs --validate | --list | --match "cap1,cap2".
// @exports: loadRoster, validateRoster, matchRolesByCapability, resolveLane, roleMathHooks, getRole, GROUPS, SUBSTRATES, NATIVE_LANES, GLM_LANES, ROSTER_PATH
//
// Authority: descriptive registry. Lane pins are DEFAULTS the orchestrator may override by quota/context;
// they are not authority. Validation is advisory-strict: a malformed roster fails loud rather than silently
// dispatching to a non-existent lane.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATH_HOOKS, resolveMathHook } from './math-bridge.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
export const ROSTER_PATH = path.join(REPO_ROOT, '_SYSTEM', 'config', 'fleet-roles.json');

export const GROUPS = Object.freeze(['orchestration', 'research', 'engineering', 'verification', 'knowledge', 'operations']);
export const SUBSTRATES = Object.freeze(['native', 'glm', 'either']);
export const NATIVE_LANES = Object.freeze(['opus', 'sonnet', 'haiku', 'native']);
export const GLM_LANES = Object.freeze(['glm-max', 'glm', 'glm-flash', 'glm-flashx', 'glm-sub-orch', 'glm-turbo', 'glm-vision', 'glm-ocr']);
export const AUTONOMY = Object.freeze(['self-governable', 'owner-gated']);
const REQUIRED = Object.freeze(['id', 'name', 'group', 'archetype', 'mission', 'capabilities', 'substrate', 'lane', 'autonomyClass', 'mathHooks', 'goalScope']);

export function loadRoster(rosterPath = ROSTER_PATH) {
  const raw = fs.readFileSync(rosterPath, 'utf8');
  const data = JSON.parse(raw);
  const roles = Array.isArray(data.roles) ? data.roles : [];
  const byId = new Map();
  const byGroup = new Map();
  const byCapability = new Map();
  for (const r of roles) {
    if (r && r.id) byId.set(r.id, r);
    if (r && r.group) { if (!byGroup.has(r.group)) byGroup.set(r.group, []); byGroup.get(r.group).push(r); }
    for (const c of (Array.isArray(r?.capabilities) ? r.capabilities : [])) {
      if (!byCapability.has(c)) byCapability.set(c, []);
      byCapability.get(c).push(r);
    }
  }
  return { meta: data.meta || {}, roles, byId, byGroup, byCapability, path: rosterPath };
}

/**
 * Strict structural validation. Returns { ok, errors[], roleCount }.
 * Checks: required fields present; unique ids; enums (group/substrate/autonomyClass/lane); mathHooks resolve
 * in the math-bridge; independentOf / gatedBehind reference existing role ids; capabilities non-empty.
 */
export function validateRoster(roster) {
  const errors = [];
  const roles = roster?.roles || [];
  if (!roles.length) errors.push('roster has zero roles');
  const ids = new Set();
  for (const r of roles) {
    const tag = r?.id ? `role:${r.id}` : `role[idx ${roles.indexOf(r)}]`;
    for (const f of REQUIRED) {
      if (r[f] === undefined || r[f] === null) errors.push(`${tag}: missing required field '${f}'`);
    }
    if (r.id) { if (ids.has(r.id)) errors.push(`${tag}: duplicate id`); ids.add(r.id); }
    if (r.group && !GROUPS.includes(r.group)) errors.push(`${tag}: unknown group '${r.group}'`);
    if (r.substrate && !SUBSTRATES.includes(r.substrate)) errors.push(`${tag}: unknown substrate '${r.substrate}'`);
    if (r.autonomyClass && !AUTONOMY.includes(r.autonomyClass)) errors.push(`${tag}: unknown autonomyClass '${r.autonomyClass}'`);
    if (Array.isArray(r.capabilities) && r.capabilities.length === 0) errors.push(`${tag}: empty capabilities`);
    // lane must be valid for its substrate (either → may use a native OR glm lane).
    if (r.lane) {
      const okNative = NATIVE_LANES.includes(r.lane);
      const okGlm = GLM_LANES.includes(r.lane);
      if (r.substrate === 'native' && !okNative) errors.push(`${tag}: native role has non-native lane '${r.lane}'`);
      if (r.substrate === 'glm' && !okGlm) errors.push(`${tag}: glm role has non-glm lane '${r.lane}'`);
      if (r.substrate === 'either' && !okNative && !okGlm) errors.push(`${tag}: 'either' role has unknown lane '${r.lane}'`);
    }
    for (const h of (Array.isArray(r.mathHooks) ? r.mathHooks : [])) {
      if (!resolveMathHook(h)) errors.push(`${tag}: mathHook '${h}' does not resolve in math-bridge`);
    }
  }
  // cross-references resolve
  for (const r of roles) {
    for (const ref of (Array.isArray(r?.independentOf) ? r.independentOf : [])) {
      if (!ids.has(ref)) errors.push(`role:${r.id}: independentOf references unknown role '${ref}'`);
    }
    if (r?.gatedBehind && !ids.has(r.gatedBehind)) errors.push(`role:${r.id}: gatedBehind references unknown role '${r.gatedBehind}'`);
  }
  return { ok: errors.length === 0, errors, roleCount: roles.length };
}

export function getRole(roster, id) { return roster?.byId?.get(id) || null; }

/**
 * Rank roles by how well their capabilities cover the needed set. Returns [{role, covered, score}] desc.
 */
export function matchRolesByCapability(roster, neededCaps = []) {
  const need = (Array.isArray(neededCaps) ? neededCaps : []).map(String);
  if (!need.length) return [];
  const scored = (roster?.roles || []).map((r) => {
    const caps = new Set(Array.isArray(r.capabilities) ? r.capabilities : []);
    const covered = need.filter((n) => caps.has(n) || [...caps].some((c) => c.includes(n) || n.includes(c)));
    return { role: r, covered, score: +(covered.length / need.length).toFixed(3) };
  }).filter((x) => x.covered.length > 0)
    .sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Resolve a role to a concrete dispatch target.
 * @returns {{substrate:'native'|'glm', lane:string, model:string, dispatch:'agent'|'glm-lane'|'inline'}}
 */
export function resolveLane(role, opts = {}) {
  if (!role) throw new Error('resolveLane: role required');
  // D-12 FIX: an EXPLICIT opts.preferSubstrate keeps its authority (caller forced the substrate). When NO
  // preference is passed, an 'either' role must honor its DECLARED lane tier instead of being blanket-forced
  // to glm — else artificer(haiku)→glm-turbo and chronicler(sonnet)→glm silently discard the roster intent.
  const explicitPrefer = typeof opts.preferSubstrate === 'string' && opts.preferSubstrate.length > 0;
  let substrate = role.substrate;
  let lane = role.lane;
  if (substrate === 'either') {
    // derive the side from the DECLARED lane when the caller did not force a preference.
    const declaredSide = NATIVE_LANES.includes(role.lane) ? 'native' : (GLM_LANES.includes(role.lane) ? 'glm' : 'glm');
    const prefer = explicitPrefer ? opts.preferSubstrate : declaredSide;
    if (prefer === 'native') {
      substrate = 'native';
      lane = NATIVE_LANES.includes(role.lane) ? role.lane : (role.fallbackLane && NATIVE_LANES.includes(role.fallbackLane) ? role.fallbackLane : 'sonnet');
    } else {
      substrate = 'glm';
      lane = GLM_LANES.includes(role.lane) ? role.lane : (role.fallbackLane && GLM_LANES.includes(role.fallbackLane) ? role.fallbackLane : 'glm');
    }
  }
  if (substrate === 'native') {
    const dispatch = lane === 'native' ? 'inline' : 'agent';
    return { substrate: 'native', lane, model: lane, dispatch };
  }
  return { substrate: 'glm', lane, model: lane, dispatch: 'glm-lane' };
}

/** Resolve a role's declared mathHooks[] to live math-bridge functions. */
export function roleMathHooks(role) {
  const out = {};
  for (const h of (Array.isArray(role?.mathHooks) ? role.mathHooks : [])) {
    const fn = resolveMathHook(h);
    if (fn) out[h] = fn;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const roster = loadRoster();
  if (argv.includes('--validate')) {
    const v = validateRoster(roster);
    process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);
    process.exit(v.ok ? 0 : 1);
  }
  const mi = argv.indexOf('--match');
  if (mi >= 0) {
    const need = String(argv[mi + 1] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const m = matchRolesByCapability(roster, need).map((x) => ({ id: x.role.id, score: x.score, covered: x.covered }));
    process.stdout.write(`${JSON.stringify(m, null, 2)}\n`);
    process.exit(0);
  }
  // default: list
  process.stdout.write(`MURE roster (${roster.roles.length} roles) — ${roster.meta.name} ${roster.meta.kanji || ''}\n`);
  for (const g of GROUPS) {
    const rs = roster.byGroup.get(g) || [];
    if (rs.length) process.stdout.write(`  ${g}: ${rs.map((r) => r.id).join(', ')}\n`);
  }
}
