#!/usr/bin/env node
// gitnexus-block-normalize — pre-commit guard that GUARANTEES the leaned GitNexus
// block in CLAUDE.md/AGENTS.md survives, no matter how `gitnexus analyze` was run.
//
// Why this exists: `npx gitnexus analyze` (without --skip-agents-md) has an
// adapter-sync step that regenerates everything between <!-- gitnexus:start --> and
// <!-- gitnexus:end --> from its verbose template AND repoints the links at
// `.claude/skills/gitnexus/...` (which also fails root-architecture.test.mjs).
// The reminder hook + docs now default to --skip-agents-md, but that is a default,
// not a guarantee. This makes it a guarantee: if a clobbered block reaches a commit
// (any path — agent, raw terminal, cron), restore the lean canonical block and
// re-stage, so the repo can never commit the verbose/mispathed form.
//
// Idempotent: only acts on a CLOBBERED block (verbose/.claude-path signatures);
// leaves an already-lean block untouched (no churn, legitimate lean edits survive).
// Always exits 0 — it is a fixer, not a checker (root-architecture.test.mjs is the checker).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = execSync('git rev-parse --show-toplevel').toString().trim();
const ADAPTERS = ['CLAUDE.md', 'AGENTS.md'];
const START = '<!-- gitnexus:start -->';
const END = '<!-- gitnexus:end -->';

// Canonical LEAN block. Keeps the markers + all 6 canonical `skills/gitnexus-*`
// links required by root-architecture.test.mjs (canonicalGitNexusSkillPaths).
// If those required paths ever change, update this constant + that test together.
const LEAN = [
  START,
  '# GitNexus — Code Intelligence',
  '',
  'GitNexus-indexed (`yuri-os`). Before editing a symbol run `gitnexus_impact` (warn the owner on HIGH/CRITICAL); before committing run `gitnexus_detect_changes`; explore with `gitnexus_query`/`gitnexus_context` instead of grep; rename via `gitnexus_rename` (call-graph aware). Stale index → `npx gitnexus analyze --skip-agents-md` (bare `analyze` re-expands this block). Full dispatcher: `/gitnexus`.',
  '',
  'Deep-dives: `skills/gitnexus-exploring/SKILL.md` · `skills/gitnexus-impact-analysis/SKILL.md` · `skills/gitnexus-debugging/SKILL.md` · `skills/gitnexus-refactoring/SKILL.md` · `skills/gitnexus-guide/SKILL.md` · `skills/gitnexus-cli/SKILL.md`',
  END,
].join('\n');

const fixed = [];
for (const rel of ADAPTERS) {
  const fp = path.join(REPO_ROOT, rel);
  if (!existsSync(fp)) continue;
  const src = readFileSync(fp, 'utf8');
  const s = src.indexOf(START);
  const e = src.indexOf(END);
  if (s === -1 || e === -1 || e < s) continue; // no/!malformed block → root-architecture.test.mjs flags it
  const block = src.slice(s, e + END.length);
  // Act ONLY on the analyze-clobber signatures; an already-lean block is left alone.
  const clobbered = block.includes('## Always Do') || block.includes('.claude/skills/gitnexus');
  if (!clobbered) continue;
  const next = src.slice(0, s) + LEAN + src.slice(e + END.length);
  if (next !== src) {
    writeFileSync(fp, next);
    execSync(`git add ${JSON.stringify(rel)}`, { cwd: REPO_ROOT });
    fixed.push(rel);
  }
}

if (fixed.length) {
  process.stdout.write(`[gitnexus-block-normalize] re-leaned clobbered block(s): ${fixed.join(', ')}\n`);
}
process.exit(0);
