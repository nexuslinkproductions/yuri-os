#!/usr/bin/env node
// @capability: skill-recall
// @serves: which skill for this task | surface the right skill | find a skill for a query | skill discovery | recall a skill by need
// @does: BM25+IDF recall over the LIVE skill corpus (skills/ + .claude/skills/ frontmatter only); ranks the skill that fits a task query — ignores archive/backup roots
// @use: to find the live YURI skill that matches a task BEFORE building anything, or to fuse a "skill for this task" pass into navigation — direct file read, no FTS index / no embeddings / no reindex dependency
// @exports: scanLiveSkills, tokenize, rankSkills
//
// WHY (2026-06-16): xref/FTS surfaced ARCHIVED skill copies (_SYSTEM/archive/…,
// external-root-backups/…) for task queries while the live skill that fits never
// appeared — a discovery failure, not an authoring one. This reads the LIVE skill
// frontmatter at query time and ranks by BM25 over name+description, so the right
// live skill surfaces. No embedding model, no FTS index, no reindex needed.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, lstatSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const CYBER_REGISTRY_PATH = '_SYSTEM/config/cyber-skill-registry.json';
const SKILL_INDEX_PATH = 'skills/skill-index.json';
const PROJECTION_MANIFEST_PATH = '.agents/skills/.yuri-projection.json';

const STOP = new Set('a an the of to for and or in on with use when this that you your is are be it as at by from into use using uses skill skills'.split(' '));

export function tokenize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 2 && !STOP.has(t));
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!m) return null;
  const lines = m[1].split('\n');
  // capture a top-level key: inline scalar OR a YAML folded/literal block (>, |) whose
  // continuation lines are indented. mineru et al. put their rich description in `>` blocks.
  const grab = (k) => {
    const i = lines.findIndex((l) => new RegExp('^' + k + ':').test(l));
    if (i === -1) return null;
    const head = lines[i].slice(k.length + 1).trim();
    if (head && !/^[>|][+-]?$/.test(head)) return head.replace(/^["']/, '').replace(/["']$/, '');
    // block scalar: gather indented continuation lines until a non-indented / next-key line
    const out = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s+\S/.test(lines[j]) || lines[j].trim() === '') out.push(lines[j].trim());
      else break;
    }
    return out.join(' ').trim() || null;
  };
  return { name: grab('name'), description: grab('description') };
}

function sha256(body) {
  return createHash('sha256').update(body).digest('hex');
}

function safeGovernedId(value) {
  const id = String(value || '');
  if (!/^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(id)) throw new Error(`unsafe governed skill id: ${JSON.stringify(value)}`);
  return id;
}

function gitIndex(root) {
  try {
    const inside = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (inside !== 'true') return new Map();
  } catch {
    return new Map();
  }
  let raw;
  try {
    raw = execFileSync('git', ['ls-files', '-s', '-z', '--', 'skills', '.claude/skills', '.claude/skills-labgated', SKILL_INDEX_PATH, CYBER_REGISTRY_PATH], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    throw new Error(`governed Git index scan failed: ${error.message}`);
  }
  const index = new Map();
  for (const record of raw.split('\0').filter(Boolean)) {
    const match = record.match(/^(\d{6}) ([a-f0-9]+) (\d)\t([\s\S]+)$/);
    if (!match) throw new Error(`cannot parse governed Git index record: ${record}`);
    if (match[3] !== '0') throw new Error(`unmerged governed Git index entry refused: ${match[4]}`);
    index.set(match[4], { mode: match[1], objectId: match[2], path: match[4] });
  }
  return index;
}

function readIndexBlob(root, entry) {
  return execFileSync('git', ['cat-file', 'blob', entry.objectId], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function prospectiveGitOid(root, absolutePath) {
  return execFileSync('git', ['hash-object', '--no-filters', absolutePath], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function assertNoSymlinkPath(root, relativePath) {
  let cursor = path.resolve(root);
  for (const part of relativePath.split('/')) {
    cursor = path.join(cursor, part);
    if (!existsSync(cursor)) continue;
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`governed source symlink refused: ${relativePath}`);
  }
}

function readGoverned(root, relativePath, index) {
  const absolute = path.join(root, ...relativePath.split('/'));
  const entry = index.get(relativePath) || null;
  if (existsSync(absolute)) {
    assertNoSymlinkPath(root, relativePath);
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`governed skill source is not a regular file: ${relativePath}`);
    const raw = readFileSync(absolute, 'utf8');
    if (entry && readIndexBlob(root, entry) !== raw) throw new Error(`tracked governed source differs from its staged Git blob: ${relativePath}`);
    return {
      raw,
      materialization: 'worktree',
      entry,
      tracked: entry !== null,
      gitBlobOid: entry?.objectId || prospectiveGitOid(root, absolute),
      gitMode: entry?.mode || ((stat.mode & 0o111) ? '100755' : '100644'),
    };
  }
  if (!entry) throw new Error(`governed skill source is missing: ${relativePath}`);
  if (entry.mode === '120000') throw new Error(`governed skill source symlink refused: ${relativePath}`);
  return { raw: readIndexBlob(root, entry), materialization: 'git-index', entry, tracked: true, gitBlobOid: entry.objectId, gitMode: entry.mode };
}

function readRegistryJson(root, relativePath, index) {
  const absolute = path.join(root, ...relativePath.split('/'));
  let raw;
  if (existsSync(absolute)) {
    assertNoSymlinkPath(root, relativePath);
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`governed registry is not a regular file: ${relativePath}`);
    raw = readFileSync(absolute, 'utf8');
  } else {
    const entry = index.get(relativePath);
    if (!entry) throw new Error(`governed registry is missing: ${relativePath}`);
    if (entry.mode === '120000') throw new Error(`governed registry symlink refused: ${relativePath}`);
    if (entry.mode !== '100644' && entry.mode !== '100755') throw new Error(`unsupported governed registry mode ${entry.mode}: ${relativePath}`);
    raw = readIndexBlob(root, entry);
  }
  return { raw, value: JSON.parse(raw) };
}

function cyberRegistry(root, index) {
  let registry;
  try {
    registry = readRegistryJson(root, CYBER_REGISTRY_PATH, index).value;
  } catch (error) {
    if (!index.size && !existsSync(path.join(root, ...CYBER_REGISTRY_PATH.split('/')))) return { armed: [], gated: [], armedCount: 0, gatedCount: 0 };
    throw error;
  }
  if (registry.version !== 'cyber-v1' || typeof registry.source !== 'string' ||
      !Array.isArray(registry.armed) || !Array.isArray(registry.gated) ||
      registry.armedCount !== registry.armed.length || registry.gatedCount !== registry.gated.length) {
    throw new Error('invalid cyber skill registry counts');
  }
  for (const [sourceClass, entries] of [['armed', registry.armed], ['labgated', registry.gated]]) {
    for (const entry of entries) {
      const name = safeGovernedId(entry.name);
      if (entry.path !== `skills/${name}` || typeof entry.description !== 'string') throw new Error(`invalid ${sourceClass} cyber registry entry: ${name}`);
      if (sourceClass === 'labgated' && typeof entry.reason !== 'string') throw new Error(`lab-gated registry entry lacks risk reason: ${name}`);
    }
  }
  return registry;
}

function canonicalRegistry(root, index) {
  const registry = readRegistryJson(root, SKILL_INDEX_PATH, index).value;
  if (registry.schemaVersion !== 1 || registry.canonicalRoot !== 'skills' || !Array.isArray(registry.skills) || registry.count !== registry.skills.length) {
    throw new Error('invalid canonical skill index');
  }
  const seen = new Set();
  for (const entry of registry.skills) {
    const id = safeGovernedId(entry.id);
    if (entry.path !== `skills/${id}/SKILL.md` || seen.has(id)) throw new Error(`invalid or duplicate canonical skill: ${id}`);
    const operationalStatus = entry.operationalStatus ?? 'active';
    if (!['active', 'consult-only', 'quarantined-stale'].includes(operationalStatus)) throw new Error(`invalid operational status for canonical skill: ${id}`);
    if (operationalStatus !== 'active' && (typeof entry.statusReason !== 'string' || !entry.statusReason.trim())) {
      throw new Error(`non-active canonical skill lacks status reason: ${id}`);
    }
    seen.add(id);
  }
  return registry;
}

function governedRecord(root, candidate, index) {
  const { raw, materialization, tracked, gitBlobOid, gitMode } = readGoverned(root, candidate.path, index);
  const fm = parseFrontmatter(raw);
  if (!fm?.description) throw new Error(`governed skill has invalid frontmatter: ${candidate.path}`);
  const text = [candidate.id.replace(/-/g, ' '), fm.name || '', fm.description].join(' ');
  return {
    name: candidate.id,
    fm,
    path: candidate.path,
    tokens: tokenize(text),
    sourceClass: candidate.sourceClass,
    materialization,
    sourceSha256: sha256(raw),
    gitBlobOid,
    gitMode,
    tracked,
    durability: tracked ? 'git-index' : 'pending-commit',
    provenanceSource: tracked ? 'index' : 'worktree-prospective',
    raw,
    riskReason: candidate.riskReason || null,
    ownerAuthorizedDiscovery: candidate.sourceClass === 'labgated',
    runtimeAuthorization: candidate.sourceClass === 'labgated' ? false : null,
    operationalStatus: candidate.operationalStatus ?? 'active',
    statusReason: candidate.statusReason ?? null,
    priority: candidate.priority,
  };
}

export function scanLiveSkills(root = REPO_ROOT) {
  const index = gitIndex(root);
  const cyber = cyberRegistry(root, index);
  const candidates = [];
  const byId = new Map();
  const add = (candidate) => {
    safeGovernedId(candidate.id);
    if (byId.has(candidate.id)) throw new Error(`duplicate governed skill id: ${candidate.id}`);
    byId.set(candidate.id, candidate);
    candidates.push(candidate);
  };

  const skillIndexAbsolute = path.join(root, ...SKILL_INDEX_PATH.split('/'));
  const authoritative = index.size > 0 || existsSync(skillIndexAbsolute);
  if (authoritative) {
    const canonical = canonicalRegistry(root, index);
    for (const entry of canonical.skills) add({
      id: entry.id,
      path: entry.path,
      sourceClass: 'canonical',
      priority: 0,
      operationalStatus: entry.operationalStatus ?? 'active',
      statusReason: entry.statusReason ?? null,
    });
  } else {
    const canonicalRoot = path.join(root, 'skills');
    if (existsSync(canonicalRoot)) {
      for (const entry of readdirSync(canonicalRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory()) continue;
        const sourcePath = `skills/${entry.name}/SKILL.md`;
        if (existsSync(path.join(root, ...sourcePath.split('/')))) add({ id: entry.name, path: sourcePath, sourceClass: 'canonical', priority: 0 });
      }
    }
  }

  for (const entry of cyber.armed) {
    const id = `cyber-${safeGovernedId(entry.name)}`;
    add({ id, path: `.claude/skills/${id}/SKILL.md`, sourceClass: 'cyber-armed', priority: 1 });
  }
  for (const entry of cyber.gated) {
    const id = `cyber-${safeGovernedId(entry.name)}`;
    add({ id, path: `.claude/skills-labgated/${id}/SKILL.md`, sourceClass: 'labgated', riskReason: entry.reason, priority: 1 });
  }

  const providerRoot = path.join(root, '.claude', 'skills');
  if (!authoritative && existsSync(providerRoot)) {
    for (const entry of readdirSync(providerRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('cyber-')) continue;
      const sourcePath = `.claude/skills/${entry.name}/SKILL.md`;
      if (existsSync(path.join(root, ...sourcePath.split('/')))) add({ id: entry.name, path: sourcePath, sourceClass: entry.name.startsWith('cyber-') ? 'cyber-armed' : 'provider-reference', priority: entry.name.startsWith('cyber-') ? 1 : 2 });
    }
  }

  return candidates
    .sort((a, b) => a.id.localeCompare(b.id) || a.path.localeCompare(b.path))
    .map((candidate) => governedRecord(root, candidate, index));
}

function projectionRecord(root, id) {
  const manifestPath = path.join(root, ...PROJECTION_MANIFEST_PATH.split('/'));
  if (!existsSync(manifestPath)) return null;
  assertNoSymlinkPath(root, PROJECTION_MANIFEST_PATH);
  const stat = lstatSync(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('projection manifest is not a regular file');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.generatedBy !== '_SYSTEM/Scripts/yuri-codex-skill-projector.mjs' || !Array.isArray(manifest.skills)) {
    throw new Error('projection manifest schema or producer is invalid');
  }
  const matches = (manifest.skills || []).filter((entry) => entry.id === id);
  if (matches.length > 1) throw new Error(`ambiguous projection id: ${id}`);
  return matches[0] || null;
}

export function showSkill(governedId, { root = REPO_ROOT } = {}) {
  const id = safeGovernedId(governedId);
  const matches = scanLiveSkills(root).filter((skill) => skill.name === id);
  if (matches.length !== 1) throw new Error(matches.length ? `ambiguous governed skill id: ${id}` : `unknown governed skill id: ${id}`);
  const skill = matches[0];
  const projection = projectionRecord(root, id);
  if (projection) {
    if (projection.sourcePath !== skill.path || projection.sourceSha256 !== skill.sourceSha256 ||
        projection.gitBlobOid !== skill.gitBlobOid || projection.gitMode !== skill.gitMode ||
        projection.tracked !== skill.tracked || projection.durability !== skill.durability ||
        projection.provenanceSource !== skill.provenanceSource ||
        (projection.operationalStatus ?? 'active') !== skill.operationalStatus ||
        (projection.statusReason ?? null) !== skill.statusReason) {
      throw new Error(`projection provenance mismatch for ${id}`);
    }
  }
  return { content: skill.raw, skill };
}

// Compact BM25 over the live skill corpus + a small exact-name bonus.
export function rankSkills(query, { root = REPO_ROOT, top = 5, skills = null, includeQuarantined = false } = {}) {
  const discovered = skills || scanLiveSkills(root);
  const corpus = includeQuarantined
    ? discovered
    : discovered.filter((entry) => entry.operationalStatus !== 'quarantined-stale');
  const qTerms = [...new Set(tokenize(query))];
  if (!qTerms.length || !corpus.length) return [];
  const N = corpus.length;
  const avgdl = corpus.reduce((s, d) => s + d.tokens.length, 0) / N || 1;
  // document frequency per query term
  const df = new Map();
  for (const t of qTerms) {
    let c = 0;
    for (const d of corpus) if (d.tokens.includes(t)) c++;
    df.set(t, c);
  }
  const k1 = 1.5, b = 0.75;
  const qNorm = query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const scored = corpus.map((d) => {
    const dl = d.tokens.length || 1;
    const tf = new Map();
    for (const t of d.tokens) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    const matchedTerms = [];
    for (const t of qTerms) {
      const f = tf.get(t) || 0;
      if (!f) continue;
      matchedTerms.push(t);
      const n = df.get(t);
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5)); // BM25 idf, always > 0
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (dl / avgdl))));
    }
    // exact skill-name / phrase bonus (keyword channel the CSO descriptions sharpen)
    const skillPhrase = d.name.replace(/-/g, ' ');
    const exactNameMatch = skillPhrase === qNorm;
    const namePhraseMatch = exactNameMatch || qNorm.includes(skillPhrase);
    if (exactNameMatch) score += 3;
    else if (namePhraseMatch) score += 1.5;
    return {
      name: d.name,
      score,
      matchedTerms,
      matchedTermCount: matchedTerms.length,
      exactNameMatch,
      namePhraseMatch,
      description: (d.fm.description || '').slice(0, 160),
      path: d.path,
      sourceClass: d.sourceClass,
      sourceSha256: d.sourceSha256,
      gitBlobOid: d.gitBlobOid,
      gitMode: d.gitMode,
      tracked: d.tracked,
      durability: d.durability,
      provenanceSource: d.provenanceSource,
      ownerAuthorizedDiscovery: d.ownerAuthorizedDiscovery,
      runtimeAuthorization: d.runtimeAuthorization,
      riskReason: d.riskReason,
      operationalStatus: d.operationalStatus ?? 'active',
      statusReason: d.statusReason ?? null,
    };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b2) => b2.score - a.score || a.name.localeCompare(b2.name) || a.path.localeCompare(b2.path))
    .slice(0, top);
}

// --- CLI --------------------------------------------------------------------
function isMain() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
if (isMain()) {
  const argv = process.argv.slice(2);
  const showIndex = argv.indexOf('--show');
  if (showIndex !== -1) {
    const id = argv[showIndex + 1];
    if (!id || argv.length !== 2) {
      process.stderr.write('skill-recall --show requires exactly one governed skill id\n');
      process.exit(2);
    }
    try {
      const shown = showSkill(id);
      process.stdout.write(shown.content);
      if (!shown.content.endsWith('\n')) process.stdout.write('\n');
      process.exit(0);
    } catch (error) {
      process.stderr.write(`skill-recall --show failed: ${error.message}\n`);
      process.exit(1);
    }
  }
  if (argv.includes('--help') || argv.includes('-h') || !argv.length) {
    process.stdout.write('skill-recall — find and read governed YURI skills\n\n  skill-recall.mjs "<query>" [--top N] [--json]\n  skill-recall.mjs --show <governed-id>\n');
    process.exit(0);
  }
  const json = argv.includes('--json');
  const includeQuarantined = argv.includes('--include-quarantined');
  const topIdx = argv.indexOf('--top');
  const parsedTop = topIdx !== -1 ? Number.parseInt(argv[topIdx + 1], 10) : 5;
  const top = Number.isInteger(parsedTop) ? Math.min(100, Math.max(1, parsedTop)) : 5;
  const query = argv.filter((a, i) => !a.startsWith('--') && !(topIdx !== -1 && i === topIdx + 1)).join(' ');
  const hits = rankSkills(query, { top, includeQuarantined });
  if (json) { process.stdout.write(JSON.stringify(hits, null, 2) + '\n'); process.exit(0); }
  if (!hits.length) { process.stdout.write(`no live skill matched "${query}"\n`); process.exit(0); }
  process.stdout.write(`🎯 SKILL FOR THIS TASK — "${query}":\n\n`);
  for (const h of hits) process.stdout.write(`  ${h.score.toFixed(2)}  /${h.name}\n        ${h.description}\n`);
}
