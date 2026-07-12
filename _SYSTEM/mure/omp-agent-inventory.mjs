#!/usr/bin/env node
// @capability: omp-agent-inventory
// @serves: canonical MURE agent listing | "what agents exist" entry point |
//   catalog validation | model-ref enumeration
// @does: reads _SYSTEM/mure/agent-catalog.json and exports listing functions
//   for agents, variants, and model refs. Pure read-only; no projection or
//   mutation. This is the canonical "what agents exist?" surface.
// @use: node _SYSTEM/mure/omp-agent-inventory.mjs [--list | --models | --json]
// @exports: listAgents, listVariants, listModelRefs, inventory

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(HERE, 'agent-catalog.json');

/** Load the catalog once and cache. */
let _catalog;
function loadCatalog() {
  if (_catalog) return _catalog;
  _catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  return _catalog;
}

/** List all agent names (base roles only). */
export function listAgents() {
  const catalog = loadCatalog();
  return catalog.agents.map((a) => a.name);
}

/** List all variant ids across every agent, sorted by agent+id. */
export function listVariants() {
  const catalog = loadCatalog();
  const variants = [];
  for (const agent of catalog.agents) {
    for (const variant of agent.variants || []) {
      variants.push({ agent: agent.name, id: variant.id, model: variant.model });
    }
  }
  return variants.sort((a, b) => a.agent.localeCompare(b.agent) || a.id.localeCompare(b.id));
}

/** List every unique model ref across base agents and all variants. */
export function listModelRefs() {
  const catalog = loadCatalog();
  const refs = new Set();
  for (const agent of catalog.agents) {
    if (agent.model) refs.add(agent.model);
    for (const variant of agent.variants || []) {
      if (variant.model) refs.add(variant.model);
    }
  }
  return [...refs].sort();
}

/** Full inventory: agent names, variant counts, model refs, generated timestamp. */
export function inventory() {
  const catalog = loadCatalog();
  const agents = catalog.agents.map((a) => ({
    name: a.name,
    lane: a.lane,
    model: a.model,
    variantCount: (a.variants || []).length,
  }));
  return {
    generated: catalog.generated,
    agentCount: agents.length,
    totalVariants: agents.reduce((sum, a) => sum + a.variantCount, 0),
    modelRefs: listModelRefs().length,
    agents,
  };
}

// CLI entry point
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2];
  if (arg === '--list') {
    for (const name of listAgents()) process.stdout.write(`${name}\n`);
  } else if (arg === '--models') {
    for (const ref of listModelRefs()) process.stdout.write(`${ref}\n`);
  } else if (arg === '--json') {
    process.stdout.write(JSON.stringify(inventory(), null, 2) + '\n');
  } else {
    const inv = inventory();
    process.stdout.write(`MURE agent inventory: ${inv.agentCount} agents, ${inv.totalVariants} variants, ${inv.modelRefs} unique model refs\n`);
  }
}
