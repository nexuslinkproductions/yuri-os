#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableSkillBody } from './yuri-skill-loader.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

export const PROJECTOR_SCHEMA_VERSION = 1;
export const PROJECTOR_ID = '_SYSTEM/Scripts/yuri-codex-skill-projector.mjs';
export const GENERATED_ADAPTER_MARKER = '<!-- GENERATED:YURI-CODEX-SKILL-ADAPTER:v1 -->';
export const GENERATED_NATIVE_POLICY_MARKER = '# GENERATED:YURI-CODEX-SKILL-POLICY:v1';
export const SKILL_INDEX_PATH = 'skills/skill-index.json';
export const CYBER_MANIFEST_PATH = '_SYSTEM/config/cyber-skill-registry.json';
export const INTEGRITY_REGISTRY_PATH = '_SYSTEM/skill-hash-registry.json';
export const COLLISION_REGISTRY_PATH = '_SYSTEM/config/codex-skill-collision-registry.json';
export const PROJECTION_ROOT = '.agents/skills';
export const PROJECTION_MANIFEST_PATH = '.agents/skills/.yuri-projection.json';
export const NATIVE_POLICY_RELATIVE_PATH = 'agents/openai.yaml';
export const NATIVE_IMPLICIT_SKILL_ID = 'activate-yuri-skills';

export const LABGATED_BANNER = '> AUTHORIZED-LAB ONLY. Offensive/dual-use capability. Use exclusively against systems you own or have explicit written authorization to test. Owner-authorized metadata discovery does not authorize runtime actions; use requires an explicit authorized-engagement decision.';

let tempSequence = 0;

export class ProjectionError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'ProjectionError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, message, detail) {
  throw new ProjectionError(code, message, detail);
}

function sha256(body) {
  return createHash('sha256').update(body).digest('hex');
}

function stableHash(body) {
  return sha256(stableSkillBody(body)).slice(0, 16);
}

function prospectiveGitOid(repoRoot, relativePath) {
  const absolute = absolutePath(repoRoot, relativePath);
  return git(repoRoot, ['hash-object', '--no-filters', absolute]).trim();
}

function posixPath(value, label = 'path') {
  if (typeof value !== 'string' || !value.length) fail('INVALID_PATH', `${label} must be a non-empty string`);
  if (/[\0\r\n]/.test(value) || value.includes('\\')) fail('PATH_TRAVERSAL', `${label} contains unsafe characters: ${JSON.stringify(value)}`);
  if (path.posix.isAbsolute(value)) fail('PATH_TRAVERSAL', `${label} must be repository-relative: ${value}`);
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) fail('PATH_TRAVERSAL', `${label} contains traversal: ${value}`);
  return value;
}

function absolutePath(repoRoot, relativePath) {
  const safe = posixPath(relativePath);
  const absolute = path.resolve(repoRoot, ...safe.split('/'));
  const root = path.resolve(repoRoot);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) fail('PATH_TRAVERSAL', `path escapes repository: ${relativePath}`);
  return absolute;
}

function assertNoSymlinkComponents(repoRoot, relativePath) {
  const parts = posixPath(relativePath).split('/');
  let cursor = path.resolve(repoRoot);
  for (const part of parts) {
    cursor = path.join(cursor, part);
    if (!existsSync(cursor)) continue;
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) fail('SYMLINK_REFUSED', `symlink component refused: ${path.relative(repoRoot, cursor)}`);
  }
}

function assertRegularFile(repoRoot, relativePath) {
  assertNoSymlinkComponents(repoRoot, relativePath);
  const absolute = absolutePath(repoRoot, relativePath);
  const stat = lstatSync(absolute);
  if (!stat.isFile()) fail('NON_FILE_REFUSED', `expected regular file: ${relativePath}`);
}

function git(repoRoot, args, options = {}) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: options.encoding ?? 'utf8',
      stdio: options.stdio,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    fail('GIT_READ_FAILED', `git ${args.join(' ')} failed`, { cause: error.message });
  }
}

export function readGitIndex(repoRoot = REPO_ROOT) {
  const raw = git(repoRoot, ['ls-files', '-s', '-z', '--', 'skills', '.claude/skills', '.claude/skills-labgated', '.codex/skills', SKILL_INDEX_PATH, CYBER_MANIFEST_PATH, INTEGRITY_REGISTRY_PATH, COLLISION_REGISTRY_PATH]);
  const entries = new Map();
  for (const record of raw.split('\0').filter(Boolean)) {
    const match = record.match(/^(\d{6}) ([a-f0-9]+) (\d)\t([\s\S]+)$/);
    if (!match) fail('INDEX_RECORD_INVALID', `cannot parse Git index record: ${record}`);
    const [, mode, objectId, stageText, sourcePath] = match;
    const stage = Number(stageText);
    if (stage !== 0) fail('INDEX_STAGE_REFUSED', `unmerged Git index entry refused: ${sourcePath}`);
    entries.set(sourcePath, { mode, objectId, stage, sourcePath });
  }
  return entries;
}

function readIndexBlob(repoRoot, relativePath, index) {
  const safe = posixPath(relativePath);
  const entry = index.get(safe);
  if (!entry) fail('MISSING_SOURCE', `source missing from worktree and Git index: ${safe}`);
  if (entry.mode === '120000') fail('SYMLINK_REFUSED', `symlink skill source refused: ${safe}`);
  if (entry.mode !== '100644' && entry.mode !== '100755') {
    fail('NON_FILE_REFUSED', `unsupported Git-index mode ${entry.mode} for governed source: ${safe}`);
  }
  return git(repoRoot, ['cat-file', 'blob', entry.objectId]);
}

export function readSource(repoRoot, relativePath, index = readGitIndex(repoRoot)) {
  const safe = posixPath(relativePath, 'source path');
  const entry = index.get(safe) ?? null;
  if (entry?.mode === '120000') fail('SYMLINK_REFUSED', `symlink skill source refused: ${safe}`);
  const absolute = absolutePath(repoRoot, safe);
  if (existsSync(absolute)) {
    assertRegularFile(repoRoot, safe);
    return { content: readFileSync(absolute, 'utf8'), materialization: 'worktree' };
  }
  return { content: readIndexBlob(repoRoot, safe, index), materialization: 'git-index' };
}

export function extractFrontmatter(raw, sourcePath = 'SKILL.md') {
  const match = String(raw).match(/^(---(?:\r\n|\n)[\s\S]*?(?:\r\n|\n)---)(?:(?:\r\n|\n)|$)/);
  if (!match) fail('INVALID_FRONTMATTER', `frontmatter must start at byte zero: ${sourcePath}`);
  const block = match[1];
  if (!/^name:\s*\S+/m.test(block)) fail('INVALID_FRONTMATTER', `frontmatter lacks name: ${sourcePath}`);
  if (!/^description:[^\r\n]*$/m.test(block)) fail('INVALID_FRONTMATTER', `frontmatter lacks description: ${sourcePath}`);
  return block;
}

function scalarField(frontmatter, key) {
  const lines = frontmatter.replace(/\r\n?/g, '\n').split('\n');
  const index = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (index === -1) return null;
  const head = lines[index].slice(key.length + 1).trim();
  if (head && !/^[>|][+-]?$/.test(head)) {
    if (head.startsWith('"')) {
      try { return JSON.parse(head); } catch { /* use the scalar as written */ }
    }
    return head.replace(/^['"]|['"]$/g, '');
  }
  const values = [];
  for (let cursor = index + 1; cursor < lines.length; cursor++) {
    if (/^[A-Za-z0-9_-]+:/.test(lines[cursor]) || lines[cursor] === '---') break;
    if (lines[cursor].trim()) values.push(lines[cursor].trim());
  }
  return values.join(' ').replace(/\s+/g, ' ').trim();
}

export function normalizeAdapterFrontmatter(frontmatter, governedId, {
  sourceClass = 'canonical',
  riskReason = '',
  operationalStatus = 'active',
  statusReason = '',
} = {}) {
  assertSafeId(governedId);
  const description = scalarField(frontmatter, 'description');
  if (!description) fail('INVALID_FRONTMATTER', `frontmatter lacks a usable description for ${governedId}`);
  const safeRiskReason = String(riskReason)
    .replace(/[\0\r\n]+/g, ' ')
    .replace(/[`<>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const riskPrefix = sourceClass === 'labgated'
    ? `[LAB-GATED; discovery is not runtime authorization; ${safeRiskReason}] `
    : '';
  const safeStatusReason = String(statusReason)
    .replace(/[\0\r\n]+/g, ' ')
    .replace(/[`<>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const statusPrefix = operationalStatus === 'quarantined-stale'
    ? `[QUARANTINED STALE DOCTRINE; model auto-selection prohibited; ${safeStatusReason}] `
    : operationalStatus === 'consult-only'
      ? `[CONSULT-ONLY; not operational or dispatch authority; ${safeStatusReason}] `
      : '';
  const compactDescription = Array.from(`${statusPrefix}${riskPrefix}${description.replace(/[\0\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()}`).slice(0, 1024).join('');
  return `---\nname: ${governedId}\ndescription: ${JSON.stringify(compactDescription)}\n---`;
}

function normalizeCollisionId(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function assertSafeId(id) {
  if (typeof id !== 'string' || !/^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(id)) {
    fail('INVALID_SKILL_ID', `unsafe skill id: ${JSON.stringify(id)}`);
  }
}

export function assertUniqueSourceIds(records) {
  const maps = {
    exact: new Map(),
    casefold: new Map(),
    unicode: new Map(),
    normalized: new Map(),
  };
  for (const record of records) {
    const id = String(record?.id ?? '');
    const keys = {
      exact: id,
      casefold: id.toLocaleLowerCase('en-US'),
      unicode: id.normalize('NFC').toLocaleLowerCase('en-US'),
      normalized: normalizeCollisionId(id),
    };
    for (const [kind, key] of Object.entries(keys)) {
      const prior = maps[kind].get(key);
      if (prior) fail('SOURCE_ID_COLLISION', `${kind} skill-id collision: ${prior.id} <> ${id}`, { kind, first: prior, second: record });
      maps[kind].set(key, record);
    }
  }
  for (const record of records) assertSafeId(record.id);
}

export function sanitizeCyberName(value) {
  if (typeof value !== 'string' || !value.trim()) fail('INVALID_CYBER_NAME', 'cyber skill name must be non-empty');
  if (/[\0\r\n/\\]/.test(value) || value.split('.').includes('')) fail('PATH_TRAVERSAL', `unsafe cyber skill name: ${JSON.stringify(value)}`);
  const sanitized = normalizeCollisionId(value);
  assertSafeId(sanitized);
  return sanitized;
}

function parseJsonSource(repoRoot, relativePath, index) {
  const { content } = readSource(repoRoot, relativePath, index);
  try {
    return { content, value: JSON.parse(content) };
  } catch (error) {
    fail('INVALID_JSON', `invalid JSON at ${relativePath}`, { cause: error.message });
  }
}

function adapterBody(source) {
  const safeRiskReason = String(source.riskReason || '')
    .replace(/[\0\r\n]+/g, ' ')
    .replace(/[`<>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const risk = source.sourceClass === 'labgated'
    ? [
        'Source class: `labgated`',
        'Owner-authorized discovery: `true`',
        'Runtime/action authorization: `false`',
        `Risk gate (registry metadata): ${JSON.stringify(safeRiskReason)}`,
        '',
        'Discovery does not authorize execution. Obtain explicit current-task authorization before any offensive or dual-use action.',
      ]
    : [
        `Source class: \`${source.sourceClass}\``,
      ];
  const status = source.operationalStatus === 'quarantined-stale'
    ? [
        'Operational status: `quarantined-stale`',
        `Status reason: ${source.statusReason}`,
        '',
        'Do not use the source as current operational doctrine, routing authority, or dispatch guidance. It remains preserved only for explicit read-only archaeology and repair. Current `_SYSTEM/mure/agents/`, `_SYSTEM/mure/ROLE-TOPOLOGY.md`, and `_SYSTEM/config/provider-route-registry.json` authority wins.',
      ]
    : source.operationalStatus === 'consult-only'
      ? [
          'Operational status: `consult-only`',
          `Status reason: ${source.statusReason}`,
          '',
          `Read the authoritative source completely before consulting it. If absent, run \`node _SYSTEM/Scripts/skill-recall.mjs --show ${source.id}\`. Treat it as advisory only; it cannot authorize dispatch, role topology, or provider/model bindings.`,
        ]
      : [
          `Before acting, read the authoritative source file above completely from beginning to end. If the governed source is absent, run \`node _SYSTEM/Scripts/skill-recall.mjs --show ${source.id}\` and read its complete verified output. Follow that source as the skill body; this adapter is a non-authoritative metadata-and-pointer projection.`,
        ];
  return `${source.adapterFrontmatter}\n\n${GENERATED_ADAPTER_MARKER}\n\n# YURI skill adapter\n\nAuthoritative source: \`${source.sourcePath}\`\n\nAuthoritative source SHA-256: \`${source.sourceSha256}\`\n\n${risk.join('\n')}\n\n${status.join('\n')}\n`;
}

function nativePolicyBody(allowImplicitInvocation) {
  return `${GENERATED_NATIVE_POLICY_MARKER}\npolicy:\n  allow_implicit_invocation: ${allowImplicitInvocation ? 'true' : 'false'}\n`;
}

function buildSource({
  repoRoot,
  index,
  id,
  sourcePath,
  sourceClass,
  riskReason = null,
  requireTracked = false,
  operationalStatus = 'active',
  statusReason = null,
}) {
  assertSafeId(id);
  const safeSourcePath = posixPath(sourcePath, 'skill source path');
  if (requireTracked && !index.has(safeSourcePath)) fail('UNTRACKED_SOURCE', `governed cyber source is not tracked: ${safeSourcePath}`);
  const read = readSource(repoRoot, safeSourcePath, index);
  const desiredContent = read.content;
  const frontmatter = extractFrontmatter(desiredContent, safeSourcePath);
  const adapterFrontmatter = normalizeAdapterFrontmatter(frontmatter, id, {
    sourceClass,
    riskReason,
    operationalStatus,
    statusReason,
  });
  const gitEntry = index.get(safeSourcePath) ?? null;
  const indexedContent = gitEntry ? readIndexBlob(repoRoot, safeSourcePath, index) : null;
  if (indexedContent !== null && indexedContent !== desiredContent) fail('TRACKED_SOURCE_DRIFT', `tracked governed source differs from its staged Git blob: ${safeSourcePath}`);
  const worktreeMode = read.materialization === 'worktree' && (lstatSync(absolutePath(repoRoot, safeSourcePath)).mode & 0o111) ? '100755' : '100644';
  const tracked = gitEntry !== null;
  return {
    id,
    sourcePath: safeSourcePath,
    sourceClass,
    riskReason,
    operationalStatus,
    statusReason,
    content: desiredContent,
    frontmatter,
    adapterFrontmatter,
    sourceFrontmatterSha256: sha256(frontmatter),
    adapterFrontmatterSha256: sha256(adapterFrontmatter),
    sourceSha256: sha256(desiredContent),
    stableHash: stableHash(desiredContent),
    materialization: read.materialization,
    trackedFiles: [],
    gitBlobOid: gitEntry?.objectId ?? prospectiveGitOid(repoRoot, safeSourcePath),
    gitMode: gitEntry?.mode ?? worktreeMode,
    tracked,
    durability: tracked ? 'git-index' : 'pending-commit',
    provenanceSource: tracked ? 'index' : 'worktree-prospective',
    sourceMatchesGitIndex: tracked ? true : null,
    labgatedBannerDrift: sourceClass === 'labgated' && !desiredContent.includes(LABGATED_BANNER),
  };
}

function validateCyberManifest(manifest, expectedArmedCount, expectedGatedCount) {
  if (manifest.version !== 'cyber-v1' || typeof manifest.source !== 'string' || typeof manifest.license !== 'string' || typeof manifest.generated !== 'string') {
    fail('INVALID_CYBER_MANIFEST', 'cyber registry provenance fields are invalid');
  }
  if (!Array.isArray(manifest.armed) || !Array.isArray(manifest.gated)) fail('INVALID_CYBER_MANIFEST', 'cyber manifest requires armed and gated arrays');
  if (manifest.armedCount !== manifest.armed.length || manifest.gatedCount !== manifest.gated.length) fail('INVALID_CYBER_MANIFEST', 'declared cyber counts do not match entries');
  if (expectedArmedCount !== undefined && manifest.armed.length !== expectedArmedCount) fail('CYBER_COUNT_MISMATCH', `expected ${expectedArmedCount} armed skills, found ${manifest.armed.length}`);
  if (expectedGatedCount !== undefined && manifest.gated.length !== expectedGatedCount) fail('CYBER_COUNT_MISMATCH', `expected ${expectedGatedCount} lab-gated skills, found ${manifest.gated.length}`);
  for (const [sourceClass, entries] of [['armed', manifest.armed], ['labgated', manifest.gated]]) {
    for (const entry of entries) {
      const name = sanitizeCyberName(entry.name);
      if (entry.name !== name || entry.path !== `skills/${name}` || typeof entry.description !== 'string') {
        fail('INVALID_CYBER_MANIFEST', `invalid or non-canonical ${sourceClass} cyber entry: ${name}`);
      }
      if (sourceClass === 'labgated' && typeof entry.reason !== 'string') fail('INVALID_CYBER_MANIFEST', `lab-gated entry lacks risk reason: ${name}`);
    }
  }
}

function resolveCollisionLegacyPath(repoRoot, legacyPath) {
  if (typeof legacyPath !== 'string' || legacyPath.length === 0) {
    fail('INVALID_COLLISION_REGISTRY', `collision legacyPath must be a non-empty string: ${JSON.stringify(legacyPath)}`);
  }
  if (/[\0\r\n\\]/.test(legacyPath)) {
    fail('PATH_TRAVERSAL', `collision legacyPath contains unsafe characters: ${JSON.stringify(legacyPath)}`);
  }
  const absolute = path.posix.isAbsolute(legacyPath);
  const parts = legacyPath.split('/');
  if (parts.some((part, index) => (!part && !(absolute && index === 0)) || part === '.' || part === '..')) {
    fail('PATH_TRAVERSAL', `collision legacyPath contains empty or traversal segments: ${legacyPath}`);
  }
  // Machine-global ledger entries stay absolute; repository-local entries are
  // normalized repository-relative (e.g. .codex/skills/...) and resolve against
  // the ACTIVE repoRoot so isolated worktrees see their own path, never a
  // hard-coded canonical checkout path.
  if (absolute) return legacyPath;
  return absolutePath(repoRoot, legacyPath);
}

function discoverLegacyConflicts(repoRoot, index, projectedIds) {
  const candidates = new Set();
  for (const sourcePath of index.keys()) {
    const match = sourcePath.match(/^\.codex\/skills\/(?:\.system\/)?([^/.][^/]*)\/SKILL\.md$/);
    if (match) candidates.add(sourcePath);
  }
  const localRoot = path.join(repoRoot, '.codex', 'skills');
  if (existsSync(localRoot)) {
    for (const entry of readdirSync(localRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || entry.name === '.system') continue;
      const sourcePath = `.codex/skills/${entry.name}/SKILL.md`;
      if (existsSync(absolutePath(repoRoot, sourcePath))) candidates.add(sourcePath);
    }
    const systemRoot = path.join(localRoot, '.system');
    if (existsSync(systemRoot)) {
      for (const entry of readdirSync(systemRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory()) continue;
        const sourcePath = `.codex/skills/.system/${entry.name}/SKILL.md`;
        if (existsSync(absolutePath(repoRoot, sourcePath))) candidates.add(sourcePath);
      }
    }
  }
  const { value: registry } = parseJsonSource(repoRoot, COLLISION_REGISTRY_PATH, index);
  if (registry.schemaVersion !== 1 || !Array.isArray(registry.collisions)) fail('INVALID_COLLISION_REGISTRY', 'collision registry schema is invalid');
  const validatedCollisions = registry.collisions.map((entry) => {
    assertSafeId(entry.adapterId);
    if (typeof entry.requiredEnabled !== 'boolean' || typeof entry.legacyPath !== 'string') {
      fail('INVALID_COLLISION_REGISTRY', `invalid collision entry for ${entry.adapterId}`);
    }
    const ledger = {
      id: entry.adapterId,
      legacyPath: entry.legacyPath,
      state: entry.state,
      requiredEnabled: entry.requiredEnabled,
      registryResolution: registry.resolution,
      runtimeProofRequired: registry.rules?.runtimeProof ?? null,
    };
    return {
      ledger,
      resolvedLegacyPath: resolveCollisionLegacyPath(repoRoot, entry.legacyPath),
    };
  });
  const selectedCollisions = validatedCollisions.filter(({ ledger }) => projectedIds.has(ledger.id));
  const conflicts = selectedCollisions.map(({ ledger }) => ledger);
  // Coverage compares the RESOLVED effective path against local candidates; the
  // ledger itself keeps the raw registry value so the projection-manifest
  // collision ledger stays byte-for-byte comparable (yuri-codex-skill-activation.mjs).
  const covered = new Set(selectedCollisions.map(({ ledger, resolvedLegacyPath }) => `${ledger.id}\0${resolvedLegacyPath}`));
  const uncovered = [];
  for (const sourcePath of [...candidates].sort()) {
    const id = sourcePath.split('/').at(-2);
    if (!projectedIds.has(id)) continue;
    const legacyPath = path.resolve(repoRoot, ...sourcePath.split('/'));
    if (!covered.has(`${id}\0${legacyPath}`)) uncovered.push({ id, legacyPath, sourcePath });
  }
  return { ledger: conflicts, uncovered };
}

function validateIntegrityRegistry(repoRoot, index, sources) {
  const { value: registry } = parseJsonSource(repoRoot, INTEGRITY_REGISTRY_PATH, index);
  const mismatches = [];
  for (const source of sources) {
    const entry = registry[source.id];
    if (!entry || entry.source_path !== source.sourcePath || entry.hash !== source.stableHash) {
      mismatches.push({ id: source.id, expectedPath: source.sourcePath, expectedHash: source.stableHash, actual: entry ?? null });
    }
  }
  return mismatches;
}

function projectionManifest({ skillIndexRaw, cyberManifestRaw, sources, legacyConflicts, armedCount, gatedCount }) {
  const skills = sources.map((source) => ({
    id: source.id,
    sourcePath: source.sourcePath,
    sourceClass: source.sourceClass,
    sourceSha256: source.sourceSha256,
    sourceFrontmatterSha256: source.sourceFrontmatterSha256,
    adapterFrontmatterSha256: source.adapterFrontmatterSha256,
    adapterSha256: sha256(source.adapter),
    materialization: source.materialization,
    gitBlobOid: source.gitBlobOid,
    gitMode: source.gitMode,
    tracked: source.tracked,
    durability: source.durability,
    provenanceSource: source.provenanceSource,
    sourceMatchesGitIndex: source.sourceMatchesGitIndex,
    operationalStatus: source.operationalStatus,
    statusReason: source.statusReason,
    nativeInvocation: {
      allowImplicitInvocation: source.allowImplicitInvocation,
      sidecarPath: source.nativePolicyPath,
      sidecarSha256: sha256(source.nativePolicy),
      provenance: {
        generatedBy: PROJECTOR_ID,
        governedSkillId: source.id,
        policyClass: source.allowImplicitInvocation ? 'implicit-meta-router' : 'explicit-only',
      },
    },
    ...(source.sourceClass === 'labgated' ? {
      ownerAuthorizedDiscovery: true,
      runtimeAuthorization: false,
      riskReason: source.riskReason,
    } : {}),
  }));
  return {
    schemaVersion: PROJECTOR_SCHEMA_VERSION,
    generatedBy: PROJECTOR_ID,
    canonical: {
      indexPath: SKILL_INDEX_PATH,
      indexSha256: sha256(skillIndexRaw),
      count: sources.filter((source) => source.sourceClass === 'canonical').length,
    },
    cyber: {
      manifestPath: CYBER_MANIFEST_PATH,
      manifestSha256: sha256(cyberManifestRaw),
      authority: 'workspace-canonical-snapshot',
      upstreamRevisionPinned: false,
      armed: { policy: 'owner-authorized-discovery', count: armedCount },
      labgated: {
        policy: 'owner-authorized-metadata-discovery-only',
        count: gatedCount,
        ownerAuthorizedDiscovery: true,
        runtimeAuthorization: false,
        bannerDrift: sources.filter((source) => source.labgatedBannerDrift).map((source) => source.sourcePath),
      },
    },
    projection: {
      root: PROJECTION_ROOT,
      count: sources.length,
      aggregateSha256: sha256(JSON.stringify(skills)),
      nativeInvocation: {
        sidecarRelativePath: NATIVE_POLICY_RELATIVE_PATH,
        provenance: PROJECTOR_ID,
        implicit: {
          count: sources.filter((source) => source.allowImplicitInvocation).length,
          ids: sources.filter((source) => source.allowImplicitInvocation).map((source) => source.id),
        },
        explicitOnly: {
          count: sources.filter((source) => !source.allowImplicitInvocation).length,
        },
      },
    },
    externalNativeCollisionLedger: legacyConflicts,
    skills,
  };
}

function listStaleAdapters(repoRoot, expectedIds) {
  const root = absolutePath(repoRoot, PROJECTION_ROOT);
  if (!existsSync(root)) return [];
  assertNoSymlinkComponents(repoRoot, PROJECTION_ROOT);
  const stale = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || expectedIds.has(entry.name)) continue;
    const relativePath = `${PROJECTION_ROOT}/${entry.name}/SKILL.md`;
    if (!existsSync(absolutePath(repoRoot, relativePath))) continue;
    assertRegularFile(repoRoot, relativePath);
    const body = readFileSync(absolutePath(repoRoot, relativePath), 'utf8');
    stale.push({ id: entry.name, path: relativePath, managed: body.includes(GENERATED_ADAPTER_MARKER) });
  }
  return stale;
}

function classifyDestination(repoRoot, relativePath, desired, { isManifest = false, managedMarker = GENERATED_ADAPTER_MARKER } = {}) {
  const absolute = absolutePath(repoRoot, relativePath);
  assertNoSymlinkComponents(repoRoot, relativePath);
  if (!existsSync(absolute)) return 'missing';
  assertRegularFile(repoRoot, relativePath);
  const current = readFileSync(absolute, 'utf8');
  if (current === desired) return 'clean';
  const managed = isManifest
    ? (() => { try { return JSON.parse(current).generatedBy === PROJECTOR_ID; } catch { return false; } })()
    : current.includes(managedMarker);
  if (!managed) fail('UNMANAGED_OVERWRITE_REFUSED', `refusing to overwrite unmanaged file: ${relativePath}`);
  return 'drift';
}

export function buildProjectionPlan(repoRoot = REPO_ROOT, options = {}) {
  const expectedArmedCount = options.expectedArmedCount ?? 300;
  const expectedGatedCount = options.expectedGatedCount ?? 39;
  const index = readGitIndex(repoRoot);
  const skillIndexSource = parseJsonSource(repoRoot, SKILL_INDEX_PATH, index);
  const cyberSource = parseJsonSource(repoRoot, CYBER_MANIFEST_PATH, index);
  const skillIndex = skillIndexSource.value;
  const cyberManifest = cyberSource.value;
  if (!Array.isArray(skillIndex.skills) || skillIndex.count !== skillIndex.skills.length) fail('INVALID_SKILL_INDEX', 'skill-index count does not match entries');
  validateCyberManifest(cyberManifest, expectedArmedCount, expectedGatedCount);

  const descriptors = skillIndex.skills.map((entry) => {
    if (!entry || entry.path !== `skills/${entry.id}/SKILL.md`) fail('INVALID_SKILL_INDEX', `canonical source path mismatch for ${entry?.id}`);
    const operationalStatus = entry.operationalStatus ?? 'active';
    if (!['active', 'consult-only', 'quarantined-stale'].includes(operationalStatus)) {
      fail('INVALID_SKILL_INDEX', `invalid operational status for ${entry.id}: ${operationalStatus}`);
    }
    const statusReason = entry.statusReason ?? null;
    if (operationalStatus !== 'active' && (typeof statusReason !== 'string' || !statusReason.trim())) {
      fail('INVALID_SKILL_INDEX', `non-active canonical skill lacks status reason: ${entry.id}`);
    }
    return { id: entry.id, sourcePath: entry.path, sourceClass: 'canonical', operationalStatus, statusReason };
  });
  for (const entry of cyberManifest.armed) {
    const id = `cyber-${sanitizeCyberName(entry.name)}`;
    descriptors.push({ id, sourcePath: `.claude/skills/${id}/SKILL.md`, sourceClass: 'cyber-armed', requireTracked: true });
  }
  for (const entry of cyberManifest.gated) {
    const id = `cyber-${sanitizeCyberName(entry.name)}`;
    descriptors.push({ id, sourcePath: `.claude/skills-labgated/${id}/SKILL.md`, sourceClass: 'labgated', riskReason: entry.reason, requireTracked: true });
  }
  assertUniqueSourceIds(descriptors);
  descriptors.sort((a, b) => a.id.localeCompare(b.id));

  const sources = descriptors.map((descriptor) => buildSource({ repoRoot, index, ...descriptor }));
  for (const source of sources) {
    source.adapterPath = `${PROJECTION_ROOT}/${source.id}/SKILL.md`;
    source.adapter = adapterBody(source);
    source.allowImplicitInvocation = source.id === NATIVE_IMPLICIT_SKILL_ID;
    source.nativePolicyPath = `${PROJECTION_ROOT}/${source.id}/${NATIVE_POLICY_RELATIVE_PATH}`;
    source.nativePolicy = nativePolicyBody(source.allowImplicitInvocation);
  }
  const expectedIds = new Set(sources.map((source) => source.id));
  const legacyCoverage = discoverLegacyConflicts(repoRoot, index, expectedIds);
  const legacyConflicts = legacyCoverage.ledger;
  const unresolvedLegacyConflicts = legacyCoverage.uncovered;
  const integrityMismatches = validateIntegrityRegistry(repoRoot, index, sources);
  const manifestValue = projectionManifest({
    skillIndexRaw: skillIndexSource.content,
    cyberManifestRaw: cyberSource.content,
    sources,
    legacyConflicts,
    armedCount: cyberManifest.armed.length,
    gatedCount: cyberManifest.gated.length,
  });
  const manifest = `${JSON.stringify(manifestValue, null, 2)}\n`;

  const adapters = sources.map((source) => ({
    id: source.id,
    path: source.adapterPath,
    status: classifyDestination(repoRoot, source.adapterPath, source.adapter),
  }));
  const nativePolicies = sources.map((source) => ({
    id: source.id,
    path: source.nativePolicyPath,
    allowImplicitInvocation: source.allowImplicitInvocation,
    status: classifyDestination(repoRoot, source.nativePolicyPath, source.nativePolicy, {
      managedMarker: GENERATED_NATIVE_POLICY_MARKER,
    }),
  }));
  const manifestStatus = classifyDestination(repoRoot, PROJECTION_MANIFEST_PATH, manifest, { isManifest: true });
  const staleAdapters = listStaleAdapters(repoRoot, expectedIds);
  const labgatedBannerDrift = sources
    .filter((source) => source.labgatedBannerDrift)
    .map((source) => source.sourcePath);
  return {
    repoRoot,
    index,
    sources,
    manifest,
    manifestValue,
    adapters,
    nativePolicies,
    manifestStatus,
    materialization: [],
    labgatedBannerDrift,
    staleAdapters,
    legacyConflicts,
    unresolvedLegacyConflicts,
    integrityMismatches,
    counts: {
      canonical: sources.filter((source) => source.sourceClass === 'canonical').length,
      armed: sources.filter((source) => source.sourceClass === 'cyber-armed').length,
      labgated: sources.filter((source) => source.sourceClass === 'labgated').length,
      total: sources.length,
      nativeImplicit: sources.filter((source) => source.allowImplicitInvocation).length,
      nativeExplicitOnly: sources.filter((source) => !source.allowImplicitInvocation).length,
    },
  };
}

function atomicWrite(repoRoot, relativePath, content, mode = '100644') {
  const safe = posixPath(relativePath);
  const absolute = absolutePath(repoRoot, safe);
  assertNoSymlinkComponents(repoRoot, safe);
  mkdirSync(path.dirname(absolute), { recursive: true });
  assertNoSymlinkComponents(repoRoot, path.posix.dirname(safe));
  const temporary = path.join(path.dirname(absolute), `.${path.basename(absolute)}.tmp-${process.pid}-${tempSequence++}`);
  writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode: mode === '100755' ? 0o755 : 0o644 });
  chmodSync(temporary, mode === '100755' ? 0o755 : 0o644);
  renameSync(temporary, absolute);
}

function reportFor(plan, mode, written = []) {
  const missingAdapters = plan.adapters.filter((entry) => entry.status === 'missing').map((entry) => entry.path);
  const driftedAdapters = plan.adapters.filter((entry) => entry.status === 'drift').map((entry) => entry.path);
  const missingNativePolicySidecars = plan.nativePolicies.filter((entry) => entry.status === 'missing').map((entry) => entry.path);
  const driftedNativePolicySidecars = plan.nativePolicies.filter((entry) => entry.status === 'drift').map((entry) => entry.path);
  const ok = !missingAdapters.length && !driftedAdapters.length && plan.manifestStatus === 'clean' &&
    !missingNativePolicySidecars.length && !driftedNativePolicySidecars.length &&
    !plan.staleAdapters.length && !plan.unresolvedLegacyConflicts.length && !plan.integrityMismatches.length;
  return {
    ok,
    mode,
    scope: 'workspace-projection-only',
    runtimeCollisionProof: 'external-root-acceptance-required',
    counts: plan.counts,
    drift: {
      missingAdapters,
      driftedAdapters,
      missingNativePolicySidecars,
      driftedNativePolicySidecars,
      manifest: plan.manifestStatus,
      missingOrRewrittenSources: plan.materialization.map((entry) => entry.sourcePath),
      sourceSnapshotWarnings: {
        labgatedBannerDrift: plan.labgatedBannerDrift,
      },
      staleAdapters: plan.staleAdapters,
      legacyConflicts: plan.legacyConflicts,
      unresolvedLegacyConflicts: plan.unresolvedLegacyConflicts,
      integrityMismatches: plan.integrityMismatches,
    },
    written,
  };
}

export function checkProjection(repoRoot = REPO_ROOT, options = {}) {
  return reportFor(buildProjectionPlan(repoRoot, options), 'check');
}

export function syncProjection(repoRoot = REPO_ROOT, options = {}) {
  const initial = buildProjectionPlan(repoRoot, options);
  if (initial.integrityMismatches.length) fail('INTEGRITY_MISMATCH', 'integrity registry does not cover the complete projection source set', { mismatches: initial.integrityMismatches });
  if (initial.unresolvedLegacyConflicts.length) fail('COLLISION_REGISTRY_COVERAGE_MISSING', 'a local legacy collision is absent from the canonical collision registry', { conflicts: initial.unresolvedLegacyConflicts });
  const written = [];
  for (const source of initial.sources) {
    const status = initial.adapters.find((entry) => entry.id === source.id)?.status;
    if (status !== 'clean') {
      atomicWrite(repoRoot, source.adapterPath, source.adapter);
      written.push(source.adapterPath);
    }
    const nativePolicyStatus = initial.nativePolicies.find((entry) => entry.id === source.id)?.status;
    if (nativePolicyStatus !== 'clean') {
      atomicWrite(repoRoot, source.nativePolicyPath, source.nativePolicy);
      written.push(source.nativePolicyPath);
    }
  }
  if (initial.manifestStatus !== 'clean') {
    atomicWrite(repoRoot, PROJECTION_MANIFEST_PATH, initial.manifest);
    written.push(PROJECTION_MANIFEST_PATH);
  }
  const finalPlan = buildProjectionPlan(repoRoot, options);
  return reportFor(finalPlan, 'sync', written);
}

function isMain() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || (!args.includes('--check') && !args.includes('--sync'))) {
    process.stdout.write('yuri-codex-skill-projector.mjs --check|--sync [--json]\n');
    process.exit(0);
  }
  try {
    const report = args.includes('--sync') ? syncProjection() : checkProjection();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    const payload = { ok: false, error: error.code ?? 'PROJECTOR_FAILED', message: error.message, detail: error.detail ?? null };
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = 1;
  }
}
