#!/usr/bin/env node
// @capability: archetype-card-fleet-audit
// @serves: one-shot audit of every .openclaw/agents/*.md card against archetype contracts
// @does: reports card→archetype bindings, missing contracts, stale grammar, and coverage gaps
// @does-not: edit files, spawn, commit, or alter routing

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCard, detectArchetype } from '../mure/archetype-card-contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.resolve(HERE, '../../.openclaw/agents');

async function main() {
  const files = (await readdir(AGENTS_DIR)).filter((f) => f.endsWith('.md')).sort();
  const results = [];
  for (const file of files) {
    const filePath = path.join(AGENTS_DIR, file);
    const source = await readFile(filePath, 'utf8');
    const archetype = detectArchetype(source);
    if (!archetype) {
      results.push({ file, archetype: null, ok: false, errors: ['no archetype contract heading'] });
      continue;
    }
    const result = validateCard(source);
    results.push({ file, archetype: result.archetype, ok: result.ok, errors: result.errors });
  }

  const withContract = results.filter((r) => r.archetype !== null);
  const withoutContract = results.filter((r) => r.archetype === null);
  const failing = results.filter((r) => r.archetype !== null && !r.ok);

  process.stdout.write(JSON.stringify({
    totalCards: results.length,
    withArchetypeContract: withContract.length,
    withoutArchetypeContract: withoutContract.length,
    failingValidation: failing.length,
    coverage: `${((withContract.length / results.length) * 100).toFixed(1)}%`,
    archetypeDistribution: withContract.reduce((acc, r) => {
      acc[r.archetype] = (acc[r.archetype] || 0) + 1;
      return acc;
    }, {}),
    withoutContract: withoutContract.map((r) => r.file),
    failing: failing.map((r) => ({ file: r.file, errors: r.errors })),
  }, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write(`archetype-card-fleet-audit failed: ${err.message}\n`);
  process.exit(1);
});
