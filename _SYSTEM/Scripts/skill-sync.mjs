#!/usr/bin/env node
/**
 * skill-sync.mjs — single-source-of-truth skill consolidation + harness publish.
 *
 * THE PROBLEM (audited 2026-06-16): skills live in three drifting roots —
 *   - skills/            (99) canonical source per domain-index.json (canonicalRoot:skills)
 *   - .claude/skills/    (64) the ONLY root the harness loads (startup-offload.js SKILLS_DIR)
 *   - .agents/skills/    (55) untracked legacy, NOT in yuri-skill-loader discovery paths
 * 36 of 52 shared skills drifted bidirectionally; the good daily-driver skills (grill-me,
 * to-prd, to-issues, triage, zoom-out, caveman, ...) are STRANDED in skills/ and never
 * surfaced into .claude/skills/, so they are mechanically un-invokable. That is why skills
 * go unused.
 *
 * THE FIX (owner-approved: skills/ canonical + sync generator, newer-wins, never blind-overwrite):
 *   1. CANONICALIZE: every skill's NEWEST version (by git-commit mtime, fs-mtime fallback)
 *      ends up in skills/ — back-porting newer .claude/skills/ versions and the harness-only
 *      skills (organ-*, cross-reference-navigation, quantum-hypothesis-simulation, ...) into
 *      skills/. skills/ becomes the true superset source of truth.
 *   2. PUBLISH: mirror skills/<name>/ -> .claude/skills/<name>/ for the published set
 *      (domain-index ids + daily-drivers + whatever is already surfaced) so the harness sees them.
 *   3. Registry: callers run `yuri-skill-loader.mjs --write-manifest` afterward to refresh
 *      skill-hash-registry.json with the loader's OWN hash (we do not reimplement it).
 * Idempotent. --check is read-only (default). --sync writes. .agents/skills/ is OUT OF SCOPE.
 *
 * @capability: skill-sync
 * @serves: skill drift | consolidate skills | surface stranded skill | mirror skills to harness | skill single source of truth | why skill not invokable | publish skill to .claude/skills
 * @does: canonicalize the newest version of every skill into skills/ then publish the curated set into the harness root .claude/skills/, killing 3-root drift
 * @use: when skills exist but are not invokable (stranded in skills/), when .claude/skills drifted from skills/, or to keep the harness skill surface fresh from canonical source
 * @exports: listSkillDirs, gitMtime, planSync, runSync, publishedSet, DAILY_DRIVERS
 *
 * Usage:
 *   node _SYSTEM/Scripts/skill-sync.mjs --check       # report drift/stranded/harness-only (read-only, default)
 *   node _SYSTEM/Scripts/skill-sync.mjs --sync        # canonicalize + publish (writes; prints actions)
 *   node _SYSTEM/Scripts/skill-sync.mjs --sync --dry  # show what --sync would do, write nothing
 *   node _SYSTEM/Scripts/skill-sync.mjs --json        # machine-readable plan
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, lstatSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const SOURCE_ROOT = 'skills';
const HARNESS_ROOT = '.claude/skills';
const DOMAIN_INDEX = path.join(REPO_ROOT, 'skills', 'domain-index.json');

// Daily-driver skills that MUST be surfaced to the harness even if domain-index.json (stale)
// omits them — the Matt-Pocock + core engineering set the owner wants invokable.
export const DAILY_DRIVERS = [
  'grill-me', 'grill-with-docs', 'to-prd', 'to-issues', 'triage', 'zoom-out', 'caveman',
  'improve-codebase-architecture', 'diagnose', 'tdd', 'handoff', 'teach', 'prototype',
  'setup-matt-pocock-skills', 'skill-creator', 'skill-installer', 'write-a-skill',
  'finishing-a-development-branch', 'using-superpowers',
];

/** skill dir names (those containing a SKILL.md) under an absolute-or-repo-relative root. */
export function listSkillDirs(root, repoRoot = REPO_ROOT) {
  const abs = path.isAbsolute(root) ? root : path.join(repoRoot, root);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(abs, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort();
}

/** last-modified epoch-ms for a path: git commit time (authoritative) with fs-mtime fallback. */
export function gitMtime(relPath, repoRoot = REPO_ROOT) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', relPath], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) return parseInt(out, 10) * 1000;
  } catch { /* not tracked / no git — fall through */ }
  try { return statSync(path.join(repoRoot, relPath)).mtimeMs; } catch { return 0; }
}

function skillFiles(absDir) {
  if (!existsSync(absDir)) return [];
  return readdirSync(absDir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name);
}

// MULTI-SESSION SAFETY: a skill with uncommitted git changes in EITHER root may be a parallel
// session's work-in-progress. Overlay-writing it would clobber their on-disk edit. Skip such skills.
function isDirtySkill(name, repoRoot) {
  for (const root of [SOURCE_ROOT, HARNESS_ROOT]) {
    try {
      const out = execFileSync('git', ['status', '--porcelain', '--', `${root}/${name}`], {
        cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (out.trim()) return true;
    } catch { /* git unavailable in a tmp fixture → treat as clean */ }
  }
  return false;
}

/** the set of skills that should be visible in the harness root. */
export function publishedSet(repoRoot = REPO_ROOT) {
  const ids = new Set(DAILY_DRIVERS);
  try {
    const di = JSON.parse(readFileSync(path.join(repoRoot, 'skills', 'domain-index.json'), 'utf8'));
    for (const dom of di.domains || []) for (const id of dom.skillIds || []) ids.add(id);
  } catch { /* domain-index missing — daily-drivers + currently-surfaced still apply */ }
  // preserve whatever is already surfaced (never silently un-publish a live harness skill)
  for (const n of listSkillDirs(HARNESS_ROOT, repoRoot)) ids.add(n);
  return ids;
}

/**
 * Compute the sync plan WITHOUT writing.
 * canonicalize: skills whose newest version must be copied INTO skills/ (back-port).
 * publish:      skills to mirror skills/ -> .claude/skills/ (the published set).
 * stranded:     skills/-only (will be published if in the published set).
 * harnessOnly:  .claude/skills/-only (back-ported to skills/ to make skills/ the superset).
 */
export function planSync(repoRoot = REPO_ROOT) {
  const src = new Set(listSkillDirs(SOURCE_ROOT, repoRoot));
  const har = new Set(listSkillDirs(HARNESS_ROOT, repoRoot));
  const pub = publishedSet(repoRoot);
  const canonicalize = []; // {name, from: 'harness', reason}
  const drift = [];        // {name, srcMtime, harMtime, winner}
  const harnessOnly = [];
  const stranded = [];
  const skipped = [];      // dirty in either root → leave for the owning session

  for (const name of new Set([...src, ...har])) {
    if (isDirtySkill(name, repoRoot)) { skipped.push(name); continue; }
    const inSrc = src.has(name), inHar = har.has(name);
    const srcMd = `${SOURCE_ROOT}/${name}/SKILL.md`;
    const harMd = `${HARNESS_ROOT}/${name}/SKILL.md`;
    if (inSrc && inHar) {
      const a = readFileSync(path.join(repoRoot, srcMd), 'utf8');
      const b = readFileSync(path.join(repoRoot, harMd), 'utf8');
      if (a !== b) {
        const sm = gitMtime(srcMd, repoRoot), hm = gitMtime(harMd, repoRoot);
        const winner = hm > sm ? 'harness' : 'source';
        drift.push({ name, srcMtime: sm, harMtime: hm, winner });
        if (winner === 'harness') canonicalize.push({ name, from: 'harness', reason: 'harness newer' });
      }
    } else if (inHar && !inSrc) {
      harnessOnly.push(name);
      canonicalize.push({ name, from: 'harness', reason: 'harness-only (back-port to make skills/ superset)' });
    } else if (inSrc && !inHar) {
      stranded.push(name);
    }
  }
  // publish = published-set skills that exist in source after canonicalize (src ∪ harnessOnly),
  // excluding any dirty/skipped skill (left untouched for the owning session).
  const skippedSet = new Set(skipped);
  const willExistInSrc = new Set([...src, ...harnessOnly]);
  const publish = [...pub].filter((n) => willExistInSrc.has(n) && !skippedSet.has(n)).sort();
  const surfaceNow = publish.filter((n) => !har.has(n)).sort(); // newly invokable
  return {
    counts: { source: src.size, harness: har.size, drift: drift.length, harnessOnly: harnessOnly.length, stranded: stranded.length, publish: publish.length, surfaceNow: surfaceNow.length, skipped: skipped.length },
    canonicalize, drift, harnessOnly, stranded, publish, surfaceNow, skipped,
  };
}

const isSymlink = (p) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
const isNestedSkill = (dir) => existsSync(path.join(dir, 'SKILL.md')); // a dispatcher's sub-skill, not kit content

// OVERLAY copy (never deletes dest-only files) — copying the newer version's files over the
// destination, adding new ones, PRESERVING any reference/template/kit file that exists only in
// the destination. Avoids the rm+recopy data-loss footgun on multi-file kit skills. Two guards
// from the DeepSeek-flash red-team (2026-06-16): (a) NEVER overwrite a symlink dest — it is the
// live mirror link, copying through it would break .claude/skills mirror semantics; (b) NEVER
// recurse into a subdir that is itself a skill (has its own SKILL.md) — that is a nested
// dispatcher sub-skill (e.g. .claude/skills/gitnexus/gitnexus-cli/), not THIS dir's kit content.
function copyFiles(srcDir, dstDir) {
  mkdirSync(dstDir, { recursive: true });
  for (const f of skillFiles(srcDir)) {
    const dst = path.join(dstDir, f);
    if (isSymlink(dst)) continue; // preserve live mirror symlink — its target is already current
    copyFileSync(path.join(srcDir, f), dst);
  }
}
function mirrorDir(name, fromRoot, toRoot, repoRoot, dry) {
  const fromAbs = path.join(repoRoot, fromRoot, name);
  const toAbs = path.join(repoRoot, toRoot, name);
  if (dry) return;
  copyFiles(fromAbs, toAbs);
  // one level of NON-skill subdirs (e.g. scripts/, references/) — skip nested skills
  for (const d of readdirSync(fromAbs, { withFileTypes: true }).filter((x) => x.isDirectory())) {
    const sub = path.join(fromAbs, d.name);
    if (isNestedSkill(sub)) continue; // nested sub-skill → managed as its own top-level skill, not copied here
    copyFiles(sub, path.join(toAbs, d.name));
  }
}

export function runSync(repoRoot = REPO_ROOT, { dry = false } = {}) {
  const plan = planSync(repoRoot);
  const actions = [];
  // 1. canonicalize: back-port harness-winner / harness-only into skills/
  for (const c of plan.canonicalize) {
    mirrorDir(c.name, HARNESS_ROOT, SOURCE_ROOT, repoRoot, dry);
    actions.push(`canonicalize skills/${c.name} <= .claude/skills/${c.name} (${c.reason})`);
  }
  // 2. publish: mirror skills/ -> .claude/skills/ for the published set
  for (const name of plan.publish) {
    mirrorDir(name, SOURCE_ROOT, HARNESS_ROOT, repoRoot, dry);
    actions.push(`publish .claude/skills/${name} <= skills/${name}`);
  }
  return { plan, actions };
}

// ---- CLI ----
if (path.resolve(process.argv[1] || '') === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const dry = args.includes('--dry');
  const doSync = args.includes('--sync');
  const plan = planSync();
  if (json && !doSync) { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }
  if (!doSync) {
    const c = plan.counts;
    console.log(`SKILL-SYNC --check (read-only)`);
    console.log(`  source skills/        : ${c.source}`);
    console.log(`  harness .claude/skills: ${c.harness}`);
    console.log(`  DRIFTED (in both)     : ${c.drift}  (harness-newer: ${plan.drift.filter((d) => d.winner === 'harness').length}, source-newer: ${plan.drift.filter((d) => d.winner === 'source').length})`);
    console.log(`  harness-only          : ${c.harnessOnly}  -> back-port to skills/: ${plan.harnessOnly.join(', ')}`);
    console.log(`  stranded (skills/-only): ${c.stranded}`);
    console.log(`  SKIPPED (uncommitted) : ${c.skipped}  -> ${plan.skipped.join(', ') || '(none)'}`);
    console.log(`  published set         : ${c.publish}`);
    console.log(`  WOULD NEWLY SURFACE   : ${c.surfaceNow}  -> ${plan.surfaceNow.join(', ')}`);
    console.log(`\nrun --sync to apply (then: node _SYSTEM/Scripts/yuri-skill-loader.mjs --write-manifest)`);
    process.exit(0);
  }
  const { plan: p, actions } = runSync(REPO_ROOT, { dry });
  if (json) { console.log(JSON.stringify({ plan: p, actions }, null, 2)); process.exit(0); }
  console.log(`SKILL-SYNC --sync${dry ? ' --dry' : ''}: ${actions.length} actions`);
  for (const a of actions) console.log(`  ${a}`);
  console.log(`\n${dry ? 'DRY — nothing written.' : 'DONE. Next: node _SYSTEM/Scripts/yuri-skill-loader.mjs --write-manifest && node _SYSTEM/Scripts/yuri-health.mjs'}`);
}
