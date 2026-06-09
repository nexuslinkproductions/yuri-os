#!/usr/bin/env node
/**
 * yuri-guide-project.mjs — project canonical organ guides into navigation-layer SKILLS.
 *
 * Pipeline stage 2 (Marcel decision 2026-06-09 — node is the single source of truth; the skill is a
 * GENERATED PROJECTION of node.mechanism.guide, so a skill never drifts from the graph):
 *
 *   _SYSTEM/organ-guides.json --(yuri-guide-seed.mjs)--> node.mechanism.guide in _SYSTEM/yuri-graph.json
 *                             --(THIS projector)-------> .claude/skills/organ-<id>/SKILL.md
 *
 * Every emitted SKILL.md carries a DO-NOT-EDIT header back-referencing its canonical node. Editing a
 * guide means editing organ-guides.json then re-running seed + project — never hand-editing the skill.
 *
 * The skills are MODEL-invocable navigation guides (an AI reads one to learn an organ's call surface +
 * security boundary fast, instead of reading 2000 lines). No `/slash-alias` → no commands/ file needed.
 *
 * Usage: node yuri-guide-project.mjs [--check]   (--check reports what would change, writes nothing)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const GRAPH = path.join(REPO, '_SYSTEM/yuri-graph.json');
const SKILLS = path.join(REPO, '.claude/skills');
const CHECK = process.argv.includes('--check');

export const oneLine = (s, max = 200) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > max ? t.slice(0, max - 1).replace(/[ ,.;:]+\S*$/, '') + '…' : t; };

export function render(node) {
  const g = node.mechanism.guide;
  const id = node.id;
  const label = node.mechanism.label || node.label || id;
  const file = (node.mechanism.files || node.flow?.files || [])[0] || '';
  const triggers = [`organ-${id}`, `how do I use ${id}`, `${id} usage`, `${id} guide`, label].filter(Boolean);
  const exportsBlock = (g.exports || []).map((e) =>
    `- \`${e.signature || e.name}\`\n  - in: ${e.inputs || '—'}\n  - out: ${e.outputs || '—'}`).join('\n');
  const cli = (g.cliSubcommands && g.cliSubcommands.length) ? g.cliSubcommands.map((c) => `\`${c}\``).join(', ') : 'none (import-only surface)';
  const gotchas = (g.gotchas || []).map((x) => `- ${x}`).join('\n');

  return `---
name: organ-${id}
description: "${oneLine(g.purpose).replace(/"/g, "'")}"
triggers:
${triggers.map((t) => `  - "${t.replace(/"/g, "'")}"`).join('\n')}
generated: true
source_node: "${id}"
source_file: "${file}"
---

<!-- GENERATED from the canonical graph node "${id}" (mechanism.guide) by _SYSTEM/Scripts/yuri-guide-project.mjs.
     DO NOT hand-edit — edit _SYSTEM/organ-guides.json, then run: node _SYSTEM/Scripts/yuri-guide-seed.mjs && node _SYSTEM/Scripts/yuri-guide-project.mjs -->

# Organ Guide — ${label}

**Module:** \`${file}\` · **Layer:** ${node.mechanism.layer || '—'} · **Invocation:** ${g.invocation || 'both'} · **CLI:** ${cli}

**Purpose.** ${g.purpose}

## Exports
${exportsBlock || '_(no exported surface)_'}

## Security boundary
${g.securityBoundary}

## When to use
${g.whenToUse}

## Gotchas
${gotchas || '_(none recorded)_'}

## Session Notes
- 2026-06-09 — generated from canonical node \`${id}\`.mechanism.guide (source-grounded; export list hard-gated against the live module by yuri-guide-seed.mjs). Authored source: _SYSTEM/organ-guides.json.
`;
}

function main() {
  const graph = JSON.parse(fs.readFileSync(GRAPH, 'utf8'));
  const nodes = graph.nodes.filter((n) => n.mechanism && n.mechanism.guide);
  const changes = [];
  for (const node of nodes) {
    const dir = path.join(SKILLS, `organ-${node.id}`);
    const out = path.join(dir, 'SKILL.md');
    const next = render(node);
    let prev = null;
    try { prev = fs.readFileSync(out, 'utf8'); } catch { /* new */ }
    const status = prev === null ? 'CREATE' : (prev === next ? 'unchanged' : 'UPDATE');
    if (status !== 'unchanged' && !CHECK) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(out, next); }
    changes.push(`${status.padEnd(9)} .claude/skills/organ-${node.id}/SKILL.md`);
  }
  process.stdout.write(changes.join('\n') + '\n');
  const n = changes.filter((c) => !c.startsWith('unchanged')).length;
  process.stdout.write(`\n${CHECK ? 'CHECK' : 'PROJECTED'}: ${nodes.length} organ skills (${n} ${CHECK ? 'would change' : 'written'})\n`);
}

// CLI-only — importing this module (tests/callers) must NOT trigger a projection write.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
