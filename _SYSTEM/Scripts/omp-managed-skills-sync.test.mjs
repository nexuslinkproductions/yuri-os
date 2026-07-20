#!/usr/bin/env node
// Status-aware parity + negative guard for the OMP managed-skills projector.
// Ensures: active canonical skills are projectable with name==id; quarantined-stale
// and consult-only skills are DELIBERATELY excluded (never silently activated);
// dry-run mutates nothing.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  canonicalSkillEntries,
  isProjectable,
  projectFrontmatter,
  syncManagedSkills,
  PROJECTABLE_STATUS,
  REPO_ROOT,
} from './omp-managed-skills-sync.mjs';

const MANAGED_ROOT = path.join(os.homedir(), '.omp', 'agent', 'managed-skills');

function frontmatterName(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const nm = m[1].match(/^name:\s*(.+)$/m);
  return nm ? nm[1].trim().replace(/["']/g, '') : null;
}

test('canonical index is non-empty; every active skill has a SKILL.md at its declared path', () => {
  const entries = canonicalSkillEntries();
  assert.ok(entries.length >= 100, `expected >=100 canonical skills, got ${entries.length}`);
  const missing = entries
    .filter(isProjectable)
    .filter((e) => !fs.existsSync(path.join(REPO_ROOT, e.path)))
    .map((e) => e.id);
  assert.deepEqual(missing, [], `active canonical skills without a SKILL.md: ${missing.join(', ')}`);
});

test('projectFrontmatter forces name == id, preserving description/scope/body', () => {
  const raw = '---\nname: something-else\ndescription: "desc here"\nscope: harness\n---\n\n# Body\ntext';
  const out = projectFrontmatter(raw, 'my-id');
  assert.equal(frontmatterName(out), 'my-id');
  assert.ok(out.includes('description: "desc here"'));
  assert.ok(out.includes('scope: harness'));
  assert.ok(out.includes('# Body\ntext'));
});

test('projectFrontmatter synthesizes/injects name when absent', () => {
  assert.equal(frontmatterName(projectFrontmatter('# body only', 'bare-id')), 'bare-id');
  assert.equal(frontmatterName(projectFrontmatter('---\ndescription: "d"\n---\nbody', 'inject-id')), 'inject-id');
});

test('NEGATIVE: quarantined-stale and consult-only skills are excluded, never activated', () => {
  const byId = Object.fromEntries(canonicalSkillEntries().map((e) => [e.id, e]));
  // Ground-truth statuses from skill-index.json.
  assert.equal(byId['fleet-economy']?.operationalStatus, 'quarantined-stale');
  assert.equal(isProjectable(byId['fleet-economy']), false, 'fleet-economy must NOT be projectable (Fable-excluded)');
  assert.equal(byId['mure-advisor']?.operationalStatus, 'consult-only');
  assert.equal(isProjectable(byId['mure-advisor']), false, 'mure-advisor must NOT be projectable (consult-only)');
  assert.equal(byId['mure-role-variant-matrix']?.operationalStatus, 'quarantined-stale');
  assert.equal(isProjectable(byId['mure-role-variant-matrix']), false);
  // Active-by-default skills ARE projectable.
  assert.equal(isProjectable(byId['omp-moe-dispatch']), true);
  assert.equal(isProjectable(byId['prompt-engineering']), true);
  assert.ok(PROJECTABLE_STATUS.has('active'));
});

test('dry-run computes a manifest and mutates nothing; excluded set carries reasons', () => {
  const res = syncManagedSkills({ apply: false });
  assert.equal(res.apply, false);
  // Every projected entry is active; no quarantined/consult-only leaked in.
  const projectedIds = new Set(res.projected.map((p) => p.id));
  assert.equal(projectedIds.has('fleet-economy'), false);
  assert.equal(projectedIds.has('mure-advisor'), false);
  // Excluded entries carry a status + reason for the governed result.
  const excludedIds = new Set(res.excluded.map((e) => e.id));
  assert.ok(excludedIds.has('fleet-economy'));
  assert.ok(res.excluded.every((e) => e.status && typeof e.reason !== 'undefined'));
  // Provenance recorded on projected entries.
  assert.ok(res.projected.every((p) => typeof p.sourceSha256 === 'string' && p.sourceSha256.length === 64));
});
