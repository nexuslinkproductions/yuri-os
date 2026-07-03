#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
// @capability: mure-capability-scanner
// @serves: mure capability scanner | query capabilities by role | find roles for capability
// @does: scans the MURE role roster to find which roles support specific capabilities; supports CLI: --list-all, --find <cap>, --role <id>. DISARMED-safe: read-only introspection.
// @use: node _SYSTEM/mure/capability-scanner.mjs --list-all | --find "code-generation" | --role engineer
// @exports: scanCapabilities, findRolesByCapability, getRoleCapabilities, listAllCapabilities

import { loadRoster, getRole } from './role-registry.mjs';

/**
 * Extract all unique capabilities across all roles.
 * @returns {string[]} sorted capability names
 */
export function listAllCapabilities() {
  const roster = loadRoster();
  const caps = new Set();
  for (const r of roster.roles) {
    for (const c of (r.capabilities || [])) {
      caps.add(c);
    }
  }
  return Array.from(caps).sort();
}

/**
 * Find all roles that have a specific capability.
 * @param {string} capability - exact match or substring match
 * @param {{substring:boolean, fuzzy:boolean}} opts
 * @returns {Array<{id,name,group,archetype,capabilities}>}
 */
export function findRolesByCapability(capability, opts = {}) {
  const roster = loadRoster();
  const target = String(capability).toLowerCase();
  const results = [];
  for (const r of roster.roles) {
    for (const c of (r.capabilities || [])) {
      const cap = c.toLowerCase();
      let match = false;
      if (opts.fuzzy && cap.includes(target)) match = true;
      else if (opts.substring && (cap.includes(target) || target.includes(cap))) match = true;
      else if (cap === target) match = true;
      if (match) {
        results.push({
          id: r.id,
          name: r.name,
          group: r.group,
          archetype: r.archetype,
          capabilities: r.capabilities,
        });
        break; // each role once
      }
    }
  }
  return results;
}

/**
 * Get all capabilities for a specific role.
 * @param {string} roleId
 * @returns {{id,name,capabilities:string[]} | null}
 */
export function getRoleCapabilities(roleId) {
  const roster = loadRoster();
  const role = getRole(roster, roleId);
  if (!role) return null;
  return {
    id: role.id,
    name: role.name,
    capabilities: role.capabilities || [],
  };
}

/**
 * Scan and return a comprehensive capability map.
 * @returns {{capabilities:string[], byCapability:Map<string,Array<{id,name}>>}}
 */
export function scanCapabilities() {
  const all = listAllCapabilities();
  const byCapability = new Map();
  for (const c of all) {
    byCapability.set(c, findRolesByCapability(c, {}));
  }
  return { capabilities: all, byCapability };
}

// CLI interface
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  if (argv.includes('--list-all')) {
    const all = listAllCapabilities();
    process.stdout.write(`MURE capabilities (${all.length}):\n`);
    for (const c of all) process.stdout.write(`  ${c}\n`);
    process.exit(0);
  }
  const fi = argv.indexOf('--find');
  if (fi >= 0) {
    const cap = argv[fi + 1];
    if (!cap) { process.stderr.write('--find requires a capability name\n'); process.exit(1); }
    const roles = findRolesByCapability(cap, { substring: true });
    process.stdout.write(`Roles with capability matching "${cap}":\n`);
    if (!roles.length) process.stdout.write('  (none)\n');
    for (const r of roles) {
      process.stdout.write(`  ${r.id.padEnd(12)} ${r.name} [${r.group}, ${r.archetype}]\n`);
    }
    process.exit(0);
  }
  const ri = argv.indexOf('--role');
  if (ri >= 0) {
    const id = argv[ri + 1];
    if (!id) { process.stderr.write('--role requires a role id\n'); process.exit(1); }
    const info = getRoleCapabilities(id);
    if (!info) { process.stderr.write(`Role '${id}' not found\n`); process.exit(1); }
    process.stdout.write(`Role: ${info.id} (${info.name})\nCapabilities:\n`);
    for (const c of info.capabilities) process.stdout.write(`  ${c}\n`);
    process.exit(0);
  }
  // default: full scan
  const scan = scanCapabilities();
  process.stdout.write(`MURE capability scan (${scan.capabilities.length} capabilities):\n\n`);
  for (const c of scan.capabilities) {
    const roles = scan.byCapability.get(c) || [];
    process.stdout.write(`${c}\n`);
    for (const r of roles) process.stdout.write(`  → ${r.id} (${r.name})\n`);
  }
  process.exit(0);
}