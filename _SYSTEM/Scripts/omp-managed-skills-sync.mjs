#!/usr/bin/env node
// @capability: omp-managed-skills-sync
// @serves: skills coming in as unknown | skill:// unknown skill | sync canonical skills into OMP | project skills to managed-skills | fix OMP skill catalog
// @does: STATUS-AWARE projection of the canonical skills/ corpus (skill-index.json source of truth) into the OMP native skill root ~/.omp/agent/managed-skills/. Projects ONLY active skills, EXCLUDES quarantined-stale / consult-only / any non-active status. Normalizes frontmatter name==id so `skill://<id>` resolves. Records source sha256 provenance. Additive+update, never deletes. DRY-RUN by default — pass --apply to materialize.
// @use: run --dry-run to see the projection manifest; run --apply (owner-authorized) to materialize. OMP catalogs skills at LAUNCH — relaunch the session after applying.
// @exports: syncManagedSkills, projectFrontmatter, canonicalSkillEntries, isProjectable, PROJECTABLE_STATUS
//
// WHY (2026-07-20): the OMP `skill://` resolver reads ONLY from ~/.omp/agent/managed-skills/
// (+ OMP-bundled), NOT from the repo's canonical skills/ / .claude/skills / .agents projections.
// 124/125 canonical skills were invisible to agents ("unknown skill"). This projects the ACTIVE
// canonical set into the OMP root. Quarantined-stale (e.g. fleet-economy — Fable-mandatory
// doctrine, owner-excluded) and consult-only (mure-advisor, opus-fleet) skills are DELIBERATELY
// NOT activated: turning a resolver bug into a catalog bypass of the quarantine would be unsafe.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_MANAGED_ROOT = path.join(os.homedir(), '.omp', 'agent', 'managed-skills');

// Only these operationalStatus values (or an absent status) are safe to activate
// in the live OMP catalog. Everything else is preserved for read-only archaeology.
export const PROJECTABLE_STATUS = new Set(['active']);

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

/** Full canonical entries from the source-of-truth index (id, path, status, reason, family). */
export function canonicalSkillEntries(repoRoot = REPO_ROOT) {
  const idx = JSON.parse(fs.readFileSync(path.join(repoRoot, 'skills', 'skill-index.json'), 'utf8'));
  return idx.skills
    .map((s) => (typeof s === 'string' ? { id: s } : s))
    .filter((s) => s && s.id)
    .map((s) => ({
      id: s.id,
      path: s.path || `skills/${s.id}/SKILL.md`,
      sourceFamily: s.sourceFamily || null,
      operationalStatus: s.operationalStatus || 'active',
      statusReason: s.statusReason || null,
    }));
}

/** A skill is projectable into the live catalog only if its status is active/absent. */
export function isProjectable(entry) {
  return PROJECTABLE_STATUS.has(entry.operationalStatus || 'active');
}

/** Reject any path whose components (up to what exists) contain a symlink. */
function assertNoSymlink(absPath) {
  let cur = absPath;
  const seen = [];
  while (cur && cur !== path.dirname(cur)) {
    if (fs.existsSync(cur)) {
      const st = fs.lstatSync(cur);
      if (st.isSymbolicLink()) throw new Error(`refusing to write through symlink: ${cur}`);
      break; // first existing ancestor is real; deeper components don't exist yet
    }
    seen.push(cur);
    cur = path.dirname(cur);
  }
}

/**
 * Return the SKILL.md body with its frontmatter `name:` forced to `id`.
 * Preserves description, scope, invocation, and the markdown body verbatim.
 */
export function projectFrontmatter(raw, id) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) {
    return `---\nname: ${id}\ndescription: "Canonical YURI skill ${id}."\n---\n\n${raw.replace(/^\s+/, '')}`;
  }
  const [, front, body] = m;
  const lines = front.split('\n');
  let sawName = false;
  const rewritten = lines.map((line) => {
    if (/^name:\s*/.test(line)) {
      sawName = true;
      return `name: ${id}`;
    }
    return line;
  });
  if (!sawName) rewritten.unshift(`name: ${id}`);
  return `---\n${rewritten.join('\n')}\n---\n${body.startsWith('\n') ? '' : '\n'}${body}`;
}

/**
 * Project the ACTIVE canonical skills into the OMP managed-skills root.
 * DRY-RUN by default (apply=false): computes the manifest, mutates nothing.
 * Additive + update only; never deletes non-canonical managed-skills entries.
 */
export function syncManagedSkills({ repoRoot = REPO_ROOT, managedRoot = DEFAULT_MANAGED_ROOT, apply = false } = {}) {
  const entries = canonicalSkillEntries(repoRoot);
  const projected = [];
  const excluded = [];
  const skipped = [];
  const created = [];
  const updated = [];
  const unchanged = [];

  for (const entry of entries) {
    if (!isProjectable(entry)) {
      excluded.push({ id: entry.id, status: entry.operationalStatus, reason: entry.statusReason });
      continue;
    }
    const src = path.join(repoRoot, entry.path);
    if (!fs.existsSync(src)) {
      skipped.push({ id: entry.id, reason: `no SKILL.md at declared path ${entry.path}` });
      continue;
    }
    const raw = fs.readFileSync(src, 'utf8');
    const sourceSha256 = sha256(raw);
    const content = projectFrontmatter(raw, entry.id);
    const destDir = path.join(managedRoot, entry.id);
    const dest = path.join(destDir, 'SKILL.md');
    assertNoSymlink(destDir);
    const exists = fs.existsSync(dest);
    const prior = exists ? fs.readFileSync(dest, 'utf8') : null;

    if (exists && prior === content) {
      unchanged.push(entry.id);
      projected.push({ id: entry.id, sourceSha256, action: 'unchanged' });
      continue;
    }
    if (apply) {
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(dest, content);
    }
    (exists ? updated : created).push(entry.id);
    projected.push({ id: entry.id, sourceSha256, action: exists ? 'update' : 'create' });
  }
  return {
    apply,
    managedRoot,
    canonicalCount: entries.length,
    projectedCount: projected.length,
    excluded,
    skipped,
    created,
    updated,
    unchanged,
    projected,
  };
}

// --- CLI --------------------------------------------------------------------
function isMain() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const apply = process.argv.includes('--apply');
  const res = syncManagedSkills({ apply });
  console.log(`OMP managed-skills sync ${apply ? '(APPLY)' : '(DRY RUN — pass --apply to materialize)'} -> ${res.managedRoot}`);
  console.log(`  canonical:        ${res.canonicalCount}`);
  console.log(`  projectable:      ${res.projectedCount} (active only)`);
  console.log(`    create:         ${res.created.length}`);
  console.log(`    update:         ${res.updated.length}`);
  console.log(`    unchanged:      ${res.unchanged.length}`);
  console.log(`  EXCLUDED (status): ${res.excluded.length}`);
  res.excluded.forEach((e) => console.log(`    EXCLUDE ${e.id} [${e.status}]: ${e.reason || ''}`));
  if (res.skipped.length) {
    console.log(`  skipped (no file): ${res.skipped.length}`);
    res.skipped.forEach((s) => console.log(`    SKIP ${s.id}: ${s.reason}`));
  }
  if (res.created.length) console.log(`  would-create sample: ${res.created.slice(0, 10).join(', ')}${res.created.length > 10 ? ' …' : ''}`);
  console.log('NOTE: OMP catalogs skills at LAUNCH — relaunch the session for skill:// to resolve newly-applied ids.');
}
