#!/usr/bin/env node
// @capability: mure-role-swimlane
// @serves: mure swimlane visualizer | role lane visualization | substrate diagram
// @does: generates a visual HTML swimlane diagram of the MURE fleet architecture, showing roles grouped by functional areas (orchestration, research, engineering, verification, knowledge, operations) and their substrate assignments (native vs glm). DISARMED-safe: static HTML generation only.
// @use: node _SYSTEM/mure/role-swimlane.mjs > mure-swimlane.html  |  node _SYSTEM/mure/role-swimlane.mjs --json
// @exports: generateSwimlane, generateSwimlaneJson, getSwimlaneData

import { loadRoster, GROUPS } from './role-registry.mjs';

const SUBSTRATE_COLORS = {
  native: 'bg-blue-100 text-blue-800 border-blue-300',
  glm: 'bg-green-100 text-green-800 border-green-300',
  either: 'bg-purple-100 text-purple-800 border-purple-300',
};

const AUTONOMY_COLORS = {
  'self-governable': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'owner-gated': 'bg-amber-50 text-amber-700 border-amber-200',
};

/**
 * Extract swimlane-structured data from the roster.
 * @returns {{groups:Array<{id,roles:Array<{id,name,archetype,substrate,lane,autonomy,capabilities}>}>, meta}}
 */
export function getSwimlaneData() {
  const roster = loadRoster();
  const groups = [];

  for (const groupId of GROUPS) {
    const roles = (roster.byGroup.get(groupId) || []).map((r) => ({
      id: r.id,
      name: r.name,
      archetype: r.archetype,
      substrate: r.substrate,
      lane: r.lane,
      autonomyClass: r.autonomyClass,
      capabilities: r.capabilities || [],
    })).sort((a, b) => a.id.localeCompare(b.id));

    if (roles.length) {
      groups.push({ id: groupId, roles });
    }
  }

  return {
    groups,
    meta: {
      name: roster.meta?.name || 'MURE',
      kanji: roster.meta?.kanji || '',
      roleCount: roster.roles.length,
    },
  };
}

/**
 * Generate JSON swimlane data (for programmatic use).
 * @returns {string}
 */
export function generateSwimlaneJson() {
  const data = getSwimlaneData();
  return JSON.stringify(data, null, 2);
}

/**
 * Generate a styled HTML swimlane diagram.
 * @returns {string}
 */
export function generateSwimlane() {
  const data = getSwimlaneData();

  const rows = data.groups.map((g) => {
    const roleCells = g.roles.map((r) => {
      const subColor = SUBSTRATE_COLORS[r.substrate] || SUBSTRATE_COLORS.either;
      const autoColor = AUTONOMY_COLORS[r.autonomyClass] || AUTONOMY_COLORS['self-governable'];
      const capList = r.capabilities.slice(0, 3).map((c) => `<span class="text-xs text-gray-500">${c}</span>`).join(', ');
      const moreCaps = r.capabilities.length > 3 ? `<span class="text-xs text-gray-400">+${r.capabilities.length - 3}</span>` : '';

      return `
        <div class="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
          <div class="flex items-center justify-between mb-2">
            <span class="font-mono text-sm font-semibold text-gray-900">${r.id}</span>
            <span class="px-2 py-0.5 text-xs font-medium rounded border ${autoColor}">${r.autonomyClass}</span>
          </div>
          <div class="text-sm font-medium text-gray-800 mb-1">${r.name}</div>
          <div class="text-xs text-gray-600 mb-2">${r.archetype}</div>
          <div class="flex items-center gap-2 mb-2">
            <span class="px-2 py-0.5 text-xs font-medium rounded border ${subColor}">${r.substrate}/${r.lane}</span>
          </div>
          <div class="space-y-1">
            ${capList ? `<div>${capList} ${moreCaps}</div>` : ''}
          </div>
        </div>
      `;
    }).join('\n');

    return `
      <div class="mb-8">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-1 h-6 bg-gray-800 rounded"></div>
          <h2 class="text-lg font-bold text-gray-900 uppercase tracking-wide">${g.id}</h2>
          <span class="text-sm text-gray-500">${g.roles.length} role${g.roles.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          ${roleCells}
        </div>
      </div>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.meta.name} — Role Swimlane</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    body { font-family: 'Inter', sans-serif; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">
  <div class="max-w-7xl mx-auto px-4 py-8">
    <header class="mb-10 border-b border-gray-200 pb-6">
      <div class="flex items-center gap-4 mb-2">
        <h1 class="text-3xl font-bold text-gray-900">${data.meta.name} <span class="text-2xl text-gray-600">${data.meta.kanji}</span></h1>
        <span class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">${data.meta.roleCount} roles</span>
      </div>
      <p class="text-gray-600">Self-governing agent collective — role swimlane visualization</p>
      <div class="mt-4 flex flex-wrap gap-4 text-xs">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded bg-blue-200 border border-blue-300"></span>
          <span class="text-gray-600">native substrate</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded bg-green-200 border border-green-300"></span>
          <span class="text-gray-600">glm substrate</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded bg-purple-200 border border-purple-300"></span>
          <span class="text-gray-600">either substrate</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded bg-emerald-100 border border-emerald-200"></span>
          <span class="text-gray-600">self-governable</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded bg-amber-100 border border-amber-200"></span>
          <span class="text-gray-600">owner-gated</span>
        </div>
      </div>
    </header>

    <main>
      ${rows}
    </main>

    <footer class="mt-12 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
      Generated by MURE role-swimlane · DISARMED-safe visualization · <code>node _SYSTEM/mure/role-swimlane.mjs</code>
    </footer>
  </div>
</body>
</html>`;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes('--json')) {
    process.stdout.write(`${generateSwimlaneJson()}\n`);
    process.exit(0);
  }
  if (argv.includes('--validate')) {
    try {
      const data = getSwimlaneData();
      const errors = [];
      if (!data.groups.length) errors.push('no groups found');
      if (!data.meta.roleCount) errors.push('no roles found');
      for (const g of data.groups) {
        if (!g.roles.length) errors.push(`group '${g.id}' has no roles`);
        for (const r of g.roles) {
          if (!r.id) errors.push(`role in group '${g.id}' missing id`);
          if (!r.substrate) errors.push(`role '${r.id}' missing substrate`);
          if (!r.autonomyClass) errors.push(`role '${r.id}' missing autonomyClass`);
        }
      }
      if (errors.length) {
        process.stderr.write(`Validation errors:\n${errors.map((e) => `  - ${e}`).join('\n')}\n`);
        process.exit(1);
      }
      process.stdout.write(`✓ Swimlane data valid: ${data.meta.roleCount} roles across ${data.groups.length} groups\n`);
      process.exit(0);
    } catch (e) {
      process.stderr.write(`Validation failed: ${e.message}\n`);
      process.exit(1);
    }
  }
  // default: generate HTML
  process.stdout.write(generateSwimlane());
  process.exit(0);
}