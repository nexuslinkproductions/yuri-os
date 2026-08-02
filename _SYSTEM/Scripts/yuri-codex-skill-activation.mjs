#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

export const ACTIVATION_REGISTRY_PATH = '_SYSTEM/config/codex-native-skill-activation.json';
export const COLLISION_REGISTRY_PATH = '_SYSTEM/config/codex-skill-collision-registry.json';
export const PROJECTION_MANIFEST_PATH = '.agents/skills/.yuri-projection.json';
export const PROJECTION_ROOT = '.agents/skills';
export const PROJECTOR_ID = '_SYSTEM/Scripts/yuri-codex-skill-projector.mjs';

const DEFAULT_FS_OPS = { existsSync, lstatSync };
const EXPECTED_GOVERNED_COUNTS = Object.freeze({ canonical: 169, armed: 300, labgated: 39, total: 508, implicit: 1, explicitOnly: 507 });
const EXPECTED_IMPLICIT_IDS = Object.freeze(['activate-yuri-skills']);
const EXPECTED_COLLISION_IDS = Object.freeze(['browser-harness', 'hatch-pet', 'humanizer', 'imagegen', 'openai-docs', 'plugin-creator', 'skill-creator', 'skill-installer']);
const EXPECTED_COLLISION_RULES = 14;
const OWNER_CONFIRMATION_TOKEN = 'YURI-CODEX-NATIVE-COLLISION-APPLY-V1';
const EXPECTED_COLLISION_CAPABILITIES = Object.freeze({
  imagegen: { expectedPathCount: 2, enabledRoot: 'global', enabledRelativePath: '.system/imagegen/SKILL.md' },
  'openai-docs': { expectedPathCount: 2, enabledRoot: 'global', enabledRelativePath: '.system/openai-docs/SKILL.md' },
  'plugin-creator': { expectedPathCount: 2, enabledRoot: 'global', enabledRelativePath: '.system/plugin-creator/SKILL.md' },
  'skill-creator': { expectedPathCount: 2, enabledRoot: 'global', enabledRelativePath: '.system/skill-creator/SKILL.md' },
  'skill-installer': { expectedPathCount: 2, enabledRoot: 'global', enabledRelativePath: '.system/skill-installer/SKILL.md' },
  humanizer: { expectedPathCount: 2, enabledRoot: 'repository', enabledRelativePath: 'humanizer/SKILL.md' },
  'hatch-pet': { expectedPathCount: 1, enabledRoot: null, enabledRelativePath: null },
  'browser-harness': { expectedPathCount: 1, enabledRoot: null, enabledRelativePath: null },
});

export class ActivationApplyError extends Error {
  constructor(message, receipt) {
    super(message);
    this.name = 'ActivationApplyError';
    this.receipt = receipt;
  }
}

function fail(message) {
  throw new Error(message);
}

function sha256(body) {
  return createHash('sha256').update(body).digest('hex');
}

function collisionPlanHash(rules) {
  return sha256(JSON.stringify(rules.map(({ id, path: rulePath, enabled }) => ({ id, path: rulePath, enabled }))));
}

function pathWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertNoSymlinkComponents(absolutePath, label, fsOps = DEFAULT_FS_OPS) {
  const absolute = path.resolve(absolutePath);
  const parsed = path.parse(absolute);
  let cursor = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (fsOps.existsSync(cursor) && fsOps.lstatSync(cursor).isSymbolicLink()) {
      fail(`${label} contains a symlink component: ${cursor}`);
    }
  }
}

function readRegularJson(repoRoot, relativePath) {
  const absolute = path.resolve(repoRoot, ...relativePath.split('/'));
  const root = path.resolve(repoRoot);
  if (!absolute.startsWith(`${root}${path.sep}`)) fail(`registry path escapes repository: ${relativePath}`);
  let cursor = root;
  for (const part of relativePath.split('/')) {
    cursor = path.join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) fail(`registry symlink refused: ${relativePath}`);
  }
  if (!existsSync(absolute) || !lstatSync(absolute).isFile()) fail(`registry is missing or not a regular file: ${relativePath}`);
  try {
    return JSON.parse(readFileSync(absolute, 'utf8'));
  } catch (error) {
    fail(`invalid JSON at ${relativePath}: ${error.message}`);
  }
}

function assertSafeId(id, label = 'skill id') {
  if (typeof id !== 'string' || !/^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(id)) {
    fail(`invalid ${label}: ${JSON.stringify(id)}`);
  }
}

function uniqueIds(values, label) {
  if (!Array.isArray(values)) fail(`${label} must be an array`);
  const result = [];
  const seen = new Set();
  for (const id of values) {
    assertSafeId(id, label);
    if (seen.has(id)) fail(`duplicate ${label}: ${id}`);
    seen.add(id);
    result.push(id);
  }
  return result;
}

function resolveRepositoryRelativeSkillPath(value, label, repoRoot) {
  if (repoRoot === null) fail(`invalid ${label}: ${JSON.stringify(value)}`);
  const root = path.resolve(repoRoot);
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    fail(`invalid ${label}: ${JSON.stringify(value)}`);
  }
  const absolute = path.resolve(root, ...parts);
  if (!pathWithin(root, absolute)) fail(`invalid ${label}: ${JSON.stringify(value)}`);
  return absolute;
}

function safeAbsoluteSkillPath(value, label, repoRoot = null) {
  if (typeof value !== 'string' || /[\0\r\n\\]/.test(value) || !value.endsWith('/SKILL.md')) {
    fail(`invalid ${label}: ${JSON.stringify(value)}`);
  }
  // Machine-global entries stay absolute; repository-local entries are
  // normalized repository-relative (.codex/...) and resolve against the
  // ACTIVE repoRoot so isolated worktrees see their own path.
  const absolute = path.isAbsolute(value) ? value : resolveRepositoryRelativeSkillPath(value, label, repoRoot);
  const resolved = path.resolve(absolute);
  if (resolved !== absolute) fail(`${label} must already be normalized: ${value}`);
  if (absolute.split(path.sep).includes('.agents')) fail(`${label} must never target .agents: ${value}`);
  return resolved;
}

export function extractDescription(body, sourcePath) {
  const match = String(body).match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
  if (!match) fail(`skill frontmatter missing: ${sourcePath}`);
  const lines = match[1].split('\n');
  const index = lines.findIndex((line) => line.startsWith('description:'));
  if (index === -1) fail(`skill description missing: ${sourcePath}`);
  const head = lines[index].slice('description:'.length).trim();
  if (head && !/^[>|][+-]?$/.test(head)) {
    if (head.startsWith('"')) {
      try { return JSON.parse(head); } catch { /* fall through to scalar */ }
    }
    return head.replace(/^['"]|['"]$/g, '').trim();
  }
  const values = [];
  for (let cursor = index + 1; cursor < lines.length; cursor++) {
    if (/^[A-Za-z0-9_-]+:/.test(lines[cursor])) break;
    if (lines[cursor].trim()) values.push(lines[cursor].trim());
  }
  const description = values.join(' ').replace(/\s+/g, ' ').trim();
  if (!description) fail(`skill description is empty: ${sourcePath}`);
  return description;
}

function assertManifest(manifest) {
  if (manifest.schemaVersion !== 1 || manifest.generatedBy !== '_SYSTEM/Scripts/yuri-codex-skill-projector.mjs' || !Array.isArray(manifest.skills)) {
    fail('Codex skill projection manifest schema is invalid');
  }
  if (manifest.projection?.count !== manifest.skills.length) fail('projection manifest count mismatch');
  const seen = new Set();
  for (const skill of manifest.skills) {
    assertSafeId(skill.id);
    if (seen.has(skill.id)) fail(`duplicate projection skill id: ${skill.id}`);
    if (!['canonical', 'cyber-armed', 'labgated'].includes(skill.sourceClass)) fail(`invalid source class for ${skill.id}`);
    seen.add(skill.id);
  }
}

function resolveApprovedRoots(repoRoot, policy, fsOps = DEFAULT_FS_OPS) {
  const configured = policy.nativeCollisionPolicy?.approvedRoots;
  if (!Array.isArray(configured) || configured.length !== 2) fail('native collision policy must declare exactly two approved roots');
  const expected = new Map([
    ['global', path.resolve(process.env.HOME ?? '', '.codex/skills')],
    ['repository', path.resolve(repoRoot, '.codex/skills')],
  ]);
  const roots = new Map();
  for (const entry of configured) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.path !== 'string') fail('invalid approved native skill root');
    if (roots.has(entry.id) || !expected.has(entry.id)) fail(`unexpected or duplicate approved native skill root: ${entry.id}`);
    const absolute = path.isAbsolute(entry.path) ? path.resolve(entry.path) : path.resolve(repoRoot, entry.path);
    if (absolute !== expected.get(entry.id)) fail(`approved ${entry.id} root does not match the fixed Codex skill root`);
    if (absolute.split(path.sep).includes('.agents')) fail(`approved ${entry.id} root must not target .agents`);
    assertNoSymlinkComponents(absolute, `approved ${entry.id} root`, fsOps);
    roots.set(entry.id, absolute);
  }
  if (roots.size !== expected.size) fail('approved native skill roots are incomplete');
  return roots;
}

function validateGovernedProjection(repoRoot, policy, manifest, fsOps = DEFAULT_FS_OPS) {
  if (policy.schemaVersion !== 2 || policy.promptAcceptance?.metadataContextPercent !== 2 || policy.promptAcceptance?.requireNoOmissions !== true || policy.promptAcceptance?.requireFullDescriptions !== true || policy.promptAcceptance?.sourceComparisonScope !== 'implicit-governed-and-enabled-native-exact-paths' || policy.governedProjection?.authority !== 'generated-agents-openai-yaml-sidecars') {
    fail('Codex native collision activation policy schema is invalid');
  }
  if (policy.runtime?.persistenceApi !== 'skills/config/write' || policy.runtime?.configReadProhibited !== true) {
    fail('activation policy must persist through skills/config/write without config reads');
  }
  if (policy.runtime?.ownerGate?.required !== true || policy.runtime.ownerGate.confirmationToken !== OWNER_CONFIRMATION_TOKEN) {
    fail('persistent native collision activation must require an explicit owner gate');
  }
  if (policy.governedProjection?.manifestPath !== PROJECTION_MANIFEST_PATH) fail('governed projection manifest path is invalid');
  const expected = policy.governedProjection.expected;
  if (JSON.stringify(expected) !== JSON.stringify(EXPECTED_GOVERNED_COUNTS)) fail('governed projection policy counts differ from the accepted recovery design');
  const actual = {
    canonical: manifest.skills.filter((skill) => skill.sourceClass === 'canonical').length,
    armed: manifest.skills.filter((skill) => skill.sourceClass === 'cyber-armed').length,
    labgated: manifest.skills.filter((skill) => skill.sourceClass === 'labgated').length,
    total: manifest.skills.length,
  };
  for (const key of ['canonical', 'armed', 'labgated', 'total']) {
    if (expected?.[key] !== actual[key]) fail(`governed projection ${key} count mismatch: expected ${expected?.[key]}, found ${actual[key]}`);
  }
  const implicitIds = uniqueIds(policy.governedProjection.implicitSkillIds, 'implicit governed skill id');
  if (JSON.stringify(implicitIds) !== JSON.stringify(EXPECTED_IMPLICIT_IDS)) fail('implicit governed skill ids differ from the accepted recovery design');
  if (implicitIds.length !== expected.implicit || actual.total - implicitIds.length !== expected.explicitOnly) {
    fail('governed projection implicit/explicit-only counts disagree with policy');
  }
  const implicitSet = new Set(implicitIds);
  let implicit = 0;
  for (const skill of manifest.skills) {
    const native = skill.nativeInvocation;
    const shouldImplicit = implicitSet.has(skill.id);
    const expectedSidecar = `${PROJECTION_ROOT}/${skill.id}/agents/openai.yaml`;
    if (!native || native.allowImplicitInvocation !== shouldImplicit || native.sidecarPath !== expectedSidecar) {
      fail(`governed native invocation sidecar state mismatch for ${skill.id}`);
    }
    const policyClass = shouldImplicit ? 'implicit-meta-router' : 'explicit-only';
    if (native.provenance?.generatedBy !== PROJECTOR_ID || native.provenance?.governedSkillId !== skill.id || native.provenance?.policyClass !== policyClass) {
      fail(`governed native invocation provenance mismatch for ${skill.id}`);
    }
    const sidecarAbsolute = path.resolve(repoRoot, ...expectedSidecar.split('/'));
    if (!pathWithin(path.resolve(repoRoot, PROJECTION_ROOT), sidecarAbsolute)) fail(`governed sidecar escapes projection root for ${skill.id}`);
    assertNoSymlinkComponents(sidecarAbsolute, `governed sidecar for ${skill.id}`, fsOps);
    if (!fsOps.existsSync(sidecarAbsolute) || !fsOps.lstatSync(sidecarAbsolute).isFile()) fail(`governed sidecar is missing for ${skill.id}`);
    const expectedBody = `# GENERATED:YURI-CODEX-SKILL-POLICY:v1\npolicy:\n  allow_implicit_invocation: ${shouldImplicit ? 'true' : 'false'}\n`;
    const body = readFileSync(sidecarAbsolute, 'utf8');
    if (body !== expectedBody || native.sidecarSha256 !== sha256(body)) fail(`governed sidecar content/hash mismatch for ${skill.id}`);
    if (shouldImplicit) implicit += 1;
  }
  const nativeProjection = manifest.projection?.nativeInvocation;
  if (implicit !== expected.implicit || nativeProjection?.implicit?.count !== implicit || nativeProjection?.explicitOnly?.count !== expected.explicitOnly) {
    fail('projection manifest native invocation totals disagree with sidecars');
  }
  if (JSON.stringify(nativeProjection?.implicit?.ids) !== JSON.stringify(implicitIds)) fail('projection manifest implicit skill ids disagree with policy');
  return { ...actual, implicit, explicitOnly: actual.total - implicit, implicitIds };
}

export function validateNativeCollisions(repoRoot, policy, collisions, { fsOps = DEFAULT_FS_OPS } = {}) {
  const root = path.resolve(repoRoot);
  if (collisions.schemaVersion !== 1 || collisions.resolution !== 'native-collision-only-exact-path-state' || !Array.isArray(collisions.collisions)) {
    fail('Codex skill collision registry schema is invalid');
  }
  if (collisions.rules?.reconciliationScope !== 'native-collision-only' || collisions.rules?.governedAdapterWrites !== 0 || collisions.rules?.projectionAuthority !== 'generated-agents-openai-yaml-sidecars') {
    fail('collision registry must be native-only and sidecar-authoritative');
  }
  const expectedRuleCount = policy.nativeCollisionPolicy?.expectedRuleCount;
  if (expectedRuleCount !== EXPECTED_COLLISION_RULES) fail('native collision rule count differs from the accepted recovery design');
  if (collisions.collisions.length !== expectedRuleCount) fail(`native collision rule count mismatch: expected ${expectedRuleCount}, found ${collisions.collisions.length}`);
  const capabilities = policy.nativeCollisionPolicy?.capabilities;
  if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) fail('native collision capabilities are missing');
  if (JSON.stringify(Object.keys(capabilities).sort()) !== JSON.stringify(EXPECTED_COLLISION_IDS)) fail('native collision capability ids differ from the accepted recovery design');
  for (const id of EXPECTED_COLLISION_IDS) {
    if (JSON.stringify(capabilities[id]) !== JSON.stringify(EXPECTED_COLLISION_CAPABILITIES[id])) {
      fail(`${id} collision policy differs from the accepted recovery design`);
    }
  }
  const roots = resolveApprovedRoots(root, policy, fsOps);
  const seenPaths = new Map();
  const rules = [];
  for (const collision of collisions.collisions) {
    assertSafeId(collision.adapterId, 'collision adapter id');
    if (!Object.hasOwn(capabilities, collision.adapterId)) fail(`collision capability is not declared by policy: ${collision.adapterId}`);
    const absolute = safeAbsoluteSkillPath(collision.legacyPath, `collision path for ${collision.adapterId}`, root);
    if (typeof collision.requiredEnabled !== 'boolean') fail(`collision state must be boolean for ${collision.adapterId}`);
    const matchedRoots = [...roots].filter(([, approvedRoot]) => pathWithin(approvedRoot, absolute));
    if (matchedRoots.length !== 1) fail(`collision path is outside the single approved native skill root: ${absolute}`);
    const [rootId, approvedRoot] = matchedRoots[0];
    const relativePath = path.relative(approvedRoot, absolute).split(path.sep).join('/');
    if (!relativePath || relativePath.startsWith('../') || relativePath.split('/').includes('.agents')) fail(`invalid native collision relative path: ${relativePath}`);
    assertNoSymlinkComponents(absolute, `collision path for ${collision.adapterId}`, fsOps);
    if (collision.requiredEnabled && (!fsOps.existsSync(absolute) || !fsOps.lstatSync(absolute).isFile())) {
      fail(`enabled native collision path is missing or not a regular file: ${absolute}`);
    }
    const prior = seenPaths.get(absolute);
    if (prior) fail(`duplicate native skill rule path: ${prior} and ${collision.adapterId}`);
    seenPaths.set(absolute, collision.adapterId);
    rules.push({ id: collision.adapterId, path: absolute, enabled: collision.requiredEnabled, kind: 'native-collision', sourceClass: null, rootId, relativePath });
  }
  for (const [id, capability] of Object.entries(capabilities)) {
    assertSafeId(id, 'native collision capability id');
    const matches = rules.filter((rule) => rule.id === id);
    if (matches.length !== capability.expectedPathCount) fail(`${id} collision path count mismatch`);
    const expectedEnabled = capability.enabledRoot === null ? 0 : 1;
    const enabled = matches.filter((rule) => rule.enabled);
    if (enabled.length !== expectedEnabled) fail(`${id} must have exactly ${expectedEnabled} enabled native path${expectedEnabled === 1 ? '' : 's'}`);
    if (capability.expectedPathCount === 2) {
      const rootIds = [...new Set(matches.map((rule) => rule.rootId))].sort();
      if (JSON.stringify(rootIds) !== JSON.stringify(['global', 'repository'])) fail(`${id} must cover global and repository native roots exactly once`);
      if (matches.some((rule) => rule.relativePath !== capability.enabledRelativePath)) fail(`${id} native collision relative paths disagree with policy`);
    } else if (capability.expectedPathCount === 1) {
      if (matches[0]?.rootId !== 'repository' || matches[0]?.relativePath !== `${id}/SKILL.md`) fail(`${id} singleton native collision path is invalid`);
    } else {
      fail(`${id} has unsupported collision path cardinality`);
    }
    if (enabled.length === 1 && (enabled[0].rootId !== capability.enabledRoot || enabled[0].relativePath !== capability.enabledRelativePath)) {
      fail(`${id} enabled native path is not the policy-preferred path`);
    }
  }
  return rules.sort((left, right) => left.path.localeCompare(right.path));
}

export function buildActivationPlanFromDocuments(repoRoot, policy, manifest, collisions, options = {}) {
  const root = path.resolve(repoRoot);
  assertManifest(manifest);
  const governed = validateGovernedProjection(root, policy, manifest, options.fsOps ?? DEFAULT_FS_OPS);
  const rules = validateNativeCollisions(root, policy, collisions, options);
  const ledger = manifest.externalNativeCollisionLedger;
  if (!Array.isArray(ledger) || ledger.length !== collisions.collisions.length) fail('projection manifest collision ledger count is stale');
  for (let index = 0; index < collisions.collisions.length; index++) {
    const collision = collisions.collisions[index];
    const projected = ledger[index];
    if (projected?.id !== collision.adapterId || projected?.legacyPath !== collision.legacyPath || projected?.state !== collision.state || projected?.requiredEnabled !== collision.requiredEnabled || projected?.registryResolution !== collisions.resolution || projected?.runtimeProofRequired !== collisions.rules.runtimeProof) {
      fail(`projection manifest collision ledger is stale at rule ${index}`);
    }
  }
  const enabledNativeSkillIds = rules.filter((rule) => rule.enabled).map((rule) => rule.id).sort();
  const planHash = collisionPlanHash(rules);
  return {
    repoRoot: root,
    policy,
    manifest,
    collisions,
    implicitGovernedSkillIds: governed.implicitIds,
    enabledNativeSkillIds,
    adapterRules: [],
    rules,
    planHash,
    counts: {
      governed: governed.total,
      implicitGoverned: governed.implicit,
      explicitOnlyGoverned: governed.explicitOnly,
      canonical: governed.canonical,
      armed: governed.armed,
      labgated: governed.labgated,
      adapterRules: 0,
      collisionRules: rules.length,
      enabledCollisionRules: rules.filter((rule) => rule.enabled).length,
      disabledCollisionRules: rules.filter((rule) => !rule.enabled).length,
      totalRules: rules.length,
    },
  };
}

export function buildActivationPlan(repoRoot = REPO_ROOT) {
  const root = path.resolve(repoRoot);
  return buildActivationPlanFromDocuments(
    root,
    readRegularJson(root, ACTIVATION_REGISTRY_PATH),
    readRegularJson(root, PROJECTION_MANIFEST_PATH),
    readRegularJson(root, COLLISION_REGISTRY_PATH),
  );
}

export function assertNativeCollisionPlan(plan, options = {}) {
  if (!plan || !Array.isArray(plan.rules) || !Array.isArray(plan.adapterRules) || plan.adapterRules.length !== 0 || plan.rules.length !== EXPECTED_COLLISION_RULES) {
    fail('activation plan must contain 14 native collision rules and zero governed adapter rules');
  }
  const validated = validateNativeCollisions(plan.repoRoot, plan.policy, plan.collisions, options);
  const shape = (rules) => rules.map((rule) => ({ id: rule.id, path: rule.path, enabled: rule.enabled, kind: rule.kind }));
  if (JSON.stringify(shape(plan.rules)) !== JSON.stringify(shape(validated))) fail('activation plan rules differ from the validated native collision registry');
  if (plan.planHash !== collisionPlanHash(validated)) fail('activation plan hash differs from its validated native collision rules');
  if (plan.rules.some((rule) => rule.kind !== 'native-collision' || rule.path.split(path.sep).includes('.agents'))) {
    fail('activation plan contains a governed or .agents skill write');
  }
  return validated;
}

export function renderSkillsConfigOverride(plan) {
  assertNativeCollisionPlan(plan);
  return `[${plan.rules.map((rule) => `{path=${JSON.stringify(rule.path)},enabled=${rule.enabled ? 'true' : 'false'}}`).join(',')}]`;
}

export function buildAppServerRequests(plan) {
  assertNativeCollisionPlan(plan);
  return [{
    method: 'initialize',
    id: 1,
    params: {
      clientInfo: { name: 'yuri-skill-activation', title: 'YURI skill activation', version: '1' },
      capabilities: { experimentalApi: true, requestAttestation: false },
    },
  }, ...plan.rules.map((rule, index) => ({
    method: 'skills/config/write',
    id: index + 2,
    params: { path: rule.path, name: null, enabled: rule.enabled },
  }))];
}

function inputText(items) {
  return items
    .filter((item) => item?.role === 'developer')
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .filter((content) => content?.type === 'input_text' && typeof content.text === 'string')
    .map((content) => content.text)
    .join('\n');
}

export function analyzePromptItems(items, plan) {
  const text = inputText(items);
  const block = text.match(/<skills_instructions>[\s\S]*?<\/skills_instructions>/)?.[0] ?? '';
  const entries = [];
  const invalidEntryPaths = [];
  for (const line of block.split('\n')) {
    const full = line.match(/^- (.*?): (.+) \(file: (.+\/SKILL\.md)\)$/);
    const blank = line.match(/^- (.*?): \(file: (.+\/SKILL\.md)\)$/);
    const match = full ?? blank;
    if (!match) continue;
    const rawPath = match[match.length - 1];
    if (!path.isAbsolute(rawPath) || path.resolve(rawPath) !== rawPath || /[\0\r\n]/.test(rawPath)) {
      invalidEntryPaths.push({ id: match[1], path: rawPath });
      continue;
    }
    entries.push({ id: match[1], description: full ? full[2].trim() : '', path: rawPath });
  }
  const blankDescriptions = entries.filter((entry) => !entry.description);
  const governedRoot = path.resolve(plan.repoRoot, PROJECTION_ROOT);
  const requiredPaths = new Map();
  for (const id of plan.implicitGovernedSkillIds) {
    requiredPaths.set(path.resolve(governedRoot, id, 'SKILL.md'), id);
  }
  for (const rule of plan.rules.filter((rule) => rule.enabled)) requiredPaths.set(rule.path, rule.id);
  const entryPaths = new Set(entries.map((entry) => entry.path));
  const missingRequiredPaths = [...requiredPaths]
    .filter(([requiredPath]) => !entryPaths.has(requiredPath))
    .map(([requiredPath, id]) => ({ id, path: requiredPath }));
  const duplicateVisibleIds = [...new Set(entries.map((entry) => entry.id))]
    .map((id) => ({ id, entries: entries.filter((entry) => entry.id === id) }))
    .filter((group) => group.entries.length > 1);
  const duplicateVisiblePaths = [...new Set(entries.map((entry) => entry.path))]
    .map((entryPath) => ({ path: entryPath, entries: entries.filter((entry) => entry.path === entryPath) }))
    .filter((group) => group.entries.length > 1);
  const allowedGovernedPaths = new Set(plan.implicitGovernedSkillIds.map((id) => path.resolve(governedRoot, id, 'SKILL.md')));
  const forbiddenGovernedEntries = entries.filter((entry) => pathWithin(governedRoot, entry.path) && !allowedGovernedPaths.has(entry.path));
  const disabledCollisionPaths = new Map(plan.rules.filter((rule) => !rule.enabled).map((rule) => [rule.path, rule.id]));
  const forbiddenDisabledCollisionEntries = entries.filter((entry) => disabledCollisionPaths.has(entry.path));
  const collisionIds = new Set(plan.rules.map((rule) => rule.id));
  const managedIds = new Set([...plan.implicitGovernedSkillIds, ...collisionIds]);
  const managedDuplicateVisibleIds = duplicateVisibleIds.filter((group) => managedIds.has(group.id));
  const unmanagedDuplicateVisibleIds = duplicateVisibleIds.filter((group) => !managedIds.has(group.id));
  const preferredPathById = new Map(plan.rules.filter((rule) => rule.enabled).map((rule) => [rule.id, rule.path]));
  const wrongPreferredCollisionEntries = entries.filter((entry) => collisionIds.has(entry.id) && preferredPathById.get(entry.id) !== entry.path);
  const truncatedDescriptions = [];
  for (const [requiredPath, id] of requiredPaths) {
    const entry = entries.find((candidate) => candidate.path === requiredPath);
    if (!entry) continue;
    assertNoSymlinkComponents(requiredPath, `required prompt skill ${id}`);
    if (!existsSync(requiredPath) || !lstatSync(requiredPath).isFile()) fail(`required prompt skill is missing or not a regular file: ${requiredPath}`);
    const expected = extractDescription(readFileSync(requiredPath, 'utf8'), requiredPath);
    if (entry.description !== expected) truncatedDescriptions.push({ id: entry.id, expected, actual: entry.description });
  }
  return {
    blockPresent: Boolean(block),
    entries,
    invalidEntryPaths,
    blankDescriptions,
    missingRequiredPaths,
    duplicateVisibleIds,
    managedDuplicateVisibleIds,
    unmanagedDuplicateVisibleIds,
    duplicateVisiblePaths,
    forbiddenGovernedEntries,
    forbiddenDisabledCollisionEntries,
    wrongPreferredCollisionEntries,
    truncatedDescriptions,
    omissionWarning: /additional skills? (?:was|were) not included in the model-visible skills list/i.test(text),
    shorteningWarning: /Skill descriptions were shortened to fit/i.test(text),
    skillInstructionChars: block.length,
  };
}

export function validatePromptReport(report, plan) {
  if (!report.blockPresent) fail('fresh prompt lacks skill instructions');
  if (report.omissionWarning) fail('skill metadata budget overflow omitted model-visible skills');
  if (report.shorteningWarning) fail('skill metadata budget shortened descriptions');
  if (report.invalidEntryPaths.length) fail(`invalid model-visible skill paths: ${report.invalidEntryPaths.map((entry) => entry.path).join(', ')}`);
  if (report.blankDescriptions.length) fail(`blank skill descriptions: ${report.blankDescriptions.map((entry) => entry.id).join(', ')}`);
  if (report.missingRequiredPaths.length) fail(`required skill paths are missing: ${report.missingRequiredPaths.map((entry) => entry.id).join(', ')}`);
  if (report.managedDuplicateVisibleIds.length) fail(`duplicate managed model-visible skill ids: ${report.managedDuplicateVisibleIds.map((entry) => entry.id).join(', ')}`);
  if (report.duplicateVisiblePaths.length) fail(`duplicate model-visible skill paths: ${report.duplicateVisiblePaths.map((entry) => entry.path).join(', ')}`);
  if (report.forbiddenGovernedEntries.length) fail(`explicit-only governed adapters leaked into native prompt: ${report.forbiddenGovernedEntries.map((entry) => entry.id).join(', ')}`);
  if (report.forbiddenDisabledCollisionEntries.length) fail(`disabled native collision paths leaked into prompt: ${report.forbiddenDisabledCollisionEntries.map((entry) => entry.id).join(', ')}`);
  if (report.wrongPreferredCollisionEntries.length) fail(`native collision skills resolved to non-preferred paths: ${report.wrongPreferredCollisionEntries.map((entry) => entry.id).join(', ')}`);
  if (report.truncatedDescriptions.length) fail(`native descriptions differ from source frontmatter: ${report.truncatedDescriptions.map((entry) => entry.id).join(', ')}`);
  return {
    ok: true,
    visible: report.entries.length,
    implicitGoverned: plan.counts.implicitGoverned,
    explicitOnlyGoverned: plan.counts.explicitOnlyGoverned,
    collisionRules: plan.counts.collisionRules,
    unmanagedDuplicateVisibleIds: report.unmanagedDuplicateVisibleIds.map((entry) => entry.id),
    blankDescriptions: 0,
    omitted: 0,
    shortened: 0,
    skillInstructionChars: report.skillInstructionChars,
  };
}

export function probeCodexPrompt(plan, { useSessionOverride = true, codexCommand = 'codex' } = {}) {
  const args = [];
  if (useSessionOverride) args.push('-c', `skills.config=${renderSkillsConfigOverride(plan)}`);
  args.push('debug', 'prompt-input', 'YURI skill activation acceptance probe');
  const result = spawnSync(codexCommand, args, {
    cwd: plan.repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  if (result.status !== 0) fail(`codex prompt probe failed with exit ${result.status}: ${(result.stderr || '').trim().slice(-1000)}`);
  let items;
  try { items = JSON.parse(result.stdout); } catch (error) { fail(`codex prompt probe returned invalid JSON: ${error.message}`); }
  const report = analyzePromptItems(items, plan);
  return { mode: useSessionOverride ? 'session-override' : 'live-user-config', ...validatePromptReport(report, plan) };
}

function assertApplyGate(plan, ownerApproved, ownerToken) {
  if (plan.policy.runtime?.ownerGate?.required !== true || plan.policy.runtime.ownerGate.confirmationToken !== OWNER_CONFIRMATION_TOKEN || ownerApproved !== true || ownerToken !== OWNER_CONFIRMATION_TOKEN) {
    fail('persistent native collision activation requires ownerApproved=true and the exact confirmation token');
  }
  assertNativeCollisionPlan(plan);
}

function startAppServer(plan, { codexCommand, appServerArgs, timeoutMs, cleanupTimeoutMs }) {
  const child = spawn(codexCommand, appServerArgs, {
    cwd: plan.repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
  const pending = new Map();
  let closed = false;
  let closeInfo = null;
  const lines = readline.createInterface({ input: child.stdout });

  function rejectPending(message) {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(`${message}: ${request.method}`));
    }
    pending.clear();
  }

  lines.on('line', (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id === undefined || message.id === null) return;
    const key = String(message.id);
    const request = pending.get(key);
    if (!request) return;
    pending.delete(key);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(`Codex app-server ${request.method} failed: ${JSON.stringify(message.error)}`));
    else request.resolve(message.result);
  });
  let resolveClosed;
  const closedPromise = new Promise((resolve) => { resolveClosed = resolve; });
  const settleClosed = (info) => {
    if (closed) return;
    closed = true;
    closeInfo = info;
    rejectPending('Codex app-server closed during');
    resolveClosed(info);
  };
  child.once('error', (error) => {
    if (!child.pid) settleClosed({ code: null, signal: null, spawnError: error.code ?? error.name });
  });
  child.once('close', (code, signal) => {
    if (!closed) {
      closed = true;
      closeInfo = { code, signal, spawnError: null };
      rejectPending('Codex app-server closed during');
      resolveClosed(closeInfo);
    }
  });
  const send = (message) => new Promise((resolve, reject) => {
    if (closed) return reject(new Error('Codex app-server is closed'));
    const key = String(message.id);
    const request = { method: message.method, resolve, reject, timer: null };
    request.timer = setTimeout(() => {
      if (pending.delete(key)) reject(new Error(`Codex app-server request timed out: ${message.method}`));
    }, timeoutMs);
    pending.set(key, request);
    try {
      child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
        if (!error || !pending.delete(key)) return;
        clearTimeout(request.timer);
        reject(new Error(`Codex app-server write failed during ${message.method}`));
      });
    } catch {
      pending.delete(key);
      clearTimeout(request.timer);
      reject(new Error(`Codex app-server write failed during ${message.method}`));
    }
  });
  const cleanup = async () => {
    lines.close();
    rejectPending('Codex app-server cleanup interrupted');
    let stdinEnded = false;
    if (!child.stdin.destroyed && !child.stdin.writableEnded) {
      child.stdin.end();
      stdinEnded = true;
    }
    let terminationRequested = false;
    let forcedTerminationRequested = false;
    const waitClosed = (waitMs) => new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), waitMs);
      timer.unref?.();
      closedPromise.then((info) => {
        clearTimeout(timer);
        resolve(info);
      });
    });
    let info = closeInfo ?? await waitClosed(cleanupTimeoutMs);
    if (!info && child.pid) {
      terminationRequested = child.kill('SIGTERM');
      info = await waitClosed(cleanupTimeoutMs);
    }
    if (!info && child.pid) {
      forcedTerminationRequested = child.kill('SIGKILL');
      info = await waitClosed(cleanupTimeoutMs);
    }
    return {
      readlineClosed: true,
      stdinEnded,
      pendingRequests: pending.size,
      terminationRequested,
      forcedTerminationRequested,
      exited: Boolean(info),
      code: info?.code ?? null,
      signal: info?.signal ?? null,
      spawnError: info?.spawnError ?? null,
    };
  };
  return { send, cleanup, stderr: () => stderr };
}

function receiptCounts(outcomes) {
  return {
    planned: outcomes.length,
    attempted: outcomes.filter((outcome) => ['attempted-unconfirmed', 'confirmed-mismatch', 'confirmed'].includes(outcome.status)).length,
    confirmed: outcomes.filter((outcome) => outcome.status === 'confirmed').length,
    failed: outcomes.filter((outcome) => ['attempted-unconfirmed', 'confirmed-mismatch', 'validation-failed-before-write'].includes(outcome.status)).length,
    notAttempted: outcomes.filter((outcome) => ['not-attempted', 'validation-failed-before-write'].includes(outcome.status)).length,
    validationFailedBeforeWrite: outcomes.filter((outcome) => outcome.status === 'validation-failed-before-write').length,
    desiredEnabled: outcomes.filter((outcome) => outcome.desiredEnabled).length,
    desiredDisabled: outcomes.filter((outcome) => !outcome.desiredEnabled).length,
    changed: null,
    alreadyEffective: null,
    confirmedDesiredStateChangeUnknown: outcomes.filter((outcome) => outcome.status === 'confirmed').length,
    unconfirmedState: outcomes.filter((outcome) => outcome.stateKnown === false).length,
  };
}

export async function applyUserActivation(plan, {
  codexCommand = 'codex',
  appServerArgs = ['app-server', '--listen', 'stdio://'],
  timeoutMs = 15000,
  cleanupTimeoutMs = 3000,
  ownerApproved = false,
  ownerToken = null,
} = {}) {
  assertApplyGate(plan, ownerApproved, ownerToken);
  const requests = buildAppServerRequests(plan);
  const receipt = {
    schemaVersion: 1,
    operation: 'codex-native-collision-apply',
    api: 'skills/config/write',
    configReads: 0,
    planSha256: plan.planHash,
    ownerGate: { approved: true, tokenMatched: true },
    initialized: false,
    replayIdempotent: true,
    priorStateKnown: false,
    changeEvidence: 'unknown-response-reports-only-effectiveEnabled',
    outcomes: plan.rules.map((rule) => ({
      id: rule.id,
      path: rule.path,
      desiredEnabled: rule.enabled,
      status: 'not-attempted',
      effectiveEnabled: null,
      change: 'unknown',
      stateKnown: false,
      desiredPostState: 'unconfirmed',
    })),
    counts: null,
    complete: false,
    partial: false,
    failure: null,
    cleanup: null,
  };
  let client = null;
  let failure = null;
  try {
    client = startAppServer(plan, { codexCommand, appServerArgs, timeoutMs, cleanupTimeoutMs });
    try {
      await client.send(requests[0]);
      receipt.initialized = true;
    } catch (error) {
      failure = { stage: 'initialize', message: String(error.message).slice(0, 500) };
    }
    if (!failure) {
      for (let index = 1; index < requests.length; index++) {
        const request = requests[index];
        const outcome = receipt.outcomes[index - 1];
        try {
          const currentRules = assertNativeCollisionPlan(plan);
          const currentRule = currentRules[index - 1];
          if (currentRule.path !== request.params.path || currentRule.enabled !== request.params.enabled) {
            throw new Error(`native collision plan changed before write ${index - 1}`);
          }
          outcome.status = 'attempted-unconfirmed';
          const result = await client.send(request);
          if (typeof result?.effectiveEnabled === 'boolean') {
            outcome.effectiveEnabled = result.effectiveEnabled;
            outcome.stateKnown = true;
          }
          if (result?.effectiveEnabled !== request.params.enabled) {
            outcome.status = 'confirmed-mismatch';
            outcome.desiredPostState = 'mismatch';
            throw new Error(`Codex reported an unexpected effective skill state for ${request.params.path}`);
          }
          outcome.status = 'confirmed';
          outcome.desiredPostState = 'confirmed';
        } catch (error) {
          if (!['attempted-unconfirmed', 'confirmed-mismatch'].includes(outcome.status)) outcome.status = 'validation-failed-before-write';
          failure = { stage: 'skills/config/write', ruleIndex: index - 1, id: outcome.id, path: outcome.path, message: String(error.message).slice(0, 500) };
          break;
        }
      }
    }
  } catch (error) {
    failure = failure ?? { stage: 'spawn', message: String(error.message).slice(0, 500) };
  } finally {
    if (client) {
      try {
        receipt.cleanup = await client.cleanup();
        if (!receipt.cleanup.exited) {
          failure = failure ?? { stage: 'cleanup', message: 'Codex app-server did not exit during bounded cleanup' };
        } else if (receipt.cleanup.code !== 0 && !receipt.cleanup.terminationRequested && !receipt.cleanup.forcedTerminationRequested && !receipt.cleanup.spawnError) {
          failure = failure ?? { stage: 'cleanup', message: `Codex app-server exited with code ${receipt.cleanup.code}` };
        }
      } catch (error) {
        receipt.cleanup = { exited: false, cleanupError: String(error.message).slice(0, 500) };
        failure = failure ?? { stage: 'cleanup', message: String(error.message).slice(0, 500) };
      }
    }
  }
  receipt.counts = receiptCounts(receipt.outcomes);
  receipt.complete = receipt.initialized && !failure && receipt.counts.confirmed === receipt.counts.planned && receipt.cleanup?.exited === true;
  receipt.partial = !receipt.complete && receipt.counts.attempted > 0;
  receipt.failure = failure;
  if (!receipt.complete) throw new ActivationApplyError(failure?.message ?? 'native collision activation did not complete', receipt);
  return receipt;
}

function safeSummary(plan) {
  return {
    ok: true,
    counts: plan.counts,
    implicitGovernedSkillIds: plan.implicitGovernedSkillIds,
    enabledNativeSkillIds: plan.enabledNativeSkillIds,
    planSha256: plan.planHash,
    governedProjection: plan.policy.governedProjection,
    freshSessionRequired: plan.policy.runtime.freshSessionRequired,
  };
}

function isMain() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const actionFlags = ['--check', '--print-session-override', '--probe', '--probe-live', '--apply-user-config'];
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] ?? null : null;
  };
  let appliedReceipt = null;
  if (args.has('--help') || !actionFlags.some((flag) => args.has(flag))) {
    process.stdout.write('yuri-codex-skill-activation.mjs --check|--print-session-override|--probe|--probe-live|--apply-user-config --owner-approved --owner-token <token>\n');
    process.exit(0);
  }
  try {
    const actionOccurrences = argv.filter((value) => actionFlags.includes(value));
    if (actionOccurrences.length !== 1) fail('exactly one activation action flag is required');
    const ownerApprovedCount = argv.filter((value) => value === '--owner-approved').length;
    const ownerTokenCount = argv.filter((value) => value === '--owner-token').length;
    const ownerToken = valueAfter('--owner-token');
    if (args.has('--apply-user-config')) {
      if (argv.length !== 4 || ownerApprovedCount !== 1 || ownerTokenCount !== 1 || !ownerToken || ownerToken.startsWith('--')) {
        fail('persistent apply requires exactly one --owner-approved and one --owner-token <token>');
      }
      const allowed = new Set(['--apply-user-config', '--owner-approved', '--owner-token', ownerToken]);
      if (argv.some((value) => !allowed.has(value))) fail('unexpected persistent-apply argument');
    } else if (ownerApprovedCount || ownerTokenCount) {
      fail('owner approval flags are valid only with --apply-user-config');
    } else if (argv.length !== 1) {
      fail('unexpected activation action argument');
    }
    const plan = buildActivationPlan();
    if (args.has('--print-session-override')) {
      process.stdout.write(`${renderSkillsConfigOverride(plan)}\n`);
    } else if (args.has('--probe')) {
      process.stdout.write(`${JSON.stringify({ ok: true, probe: probeCodexPrompt(plan, { useSessionOverride: true }), summary: safeSummary(plan) }, null, 2)}\n`);
    } else if (args.has('--probe-live')) {
      process.stdout.write(`${JSON.stringify({ ok: true, probe: probeCodexPrompt(plan, { useSessionOverride: false }), summary: safeSummary(plan) }, null, 2)}\n`);
    } else if (args.has('--apply-user-config')) {
      appliedReceipt = await applyUserActivation(plan, {
        ownerApproved: true,
        ownerToken,
      });
      const probe = probeCodexPrompt(plan, { useSessionOverride: false });
      process.stdout.write(`${JSON.stringify({ ok: true, applied: appliedReceipt, probe, summary: safeSummary(plan) }, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(safeSummary(plan), null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, receipt: error.receipt ?? appliedReceipt }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
