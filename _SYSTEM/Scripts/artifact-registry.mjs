#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTruthPromotionRegistryRuntime } from './yuri-truth-promotion-enforcement.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const ARTIFACT_REGISTRY_PATH = path.join(REPO_ROOT, '_SYSTEM/config/artifact-registry.json');
export const FOLDER_REGISTRY_PATH = path.join(REPO_ROOT, '_SYSTEM/config/folder-registry.json');

const EXIT_COMMANDS = new Set(['--validate', 'validate', '']);

export function loadArtifactRegistry(registryPath = ARTIFACT_REGISTRY_PATH) {
  return JSON.parse(readFileSync(registryPath, 'utf8'));
}

export function loadFolderClasses(folderRegistryPath = FOLDER_REGISTRY_PATH) {
  if (!existsSync(folderRegistryPath)) return new Set();
  const registry = JSON.parse(readFileSync(folderRegistryPath, 'utf8'));
  return new Set(registry.classes || []);
}

export function normalizeRepoPath(inputPath, repoRoot = REPO_ROOT) {
  const raw = String(inputPath || '').trim();
  if (!raw) return '';
  const withoutFileProtocol = raw.startsWith('file://') ? new URL(raw).pathname : raw;
  const absolute = path.isAbsolute(withoutFileProtocol)
    ? withoutFileProtocol
    : path.join(repoRoot, withoutFileProtocol);
  const relative = path.relative(repoRoot, absolute).replaceAll(path.sep, '/');
  return relative === '' ? '.' : relative;
}

export function isProtectedPath(relPath, protectedPrefixes = []) {
  return protectedPrefixes.some((prefix) => {
    const clean = prefix.replace(/\/+$/, '');
    return relPath === clean || relPath.startsWith(`${clean}/`);
  });
}

export function classifyArtifactPath(inputPath, registry = loadArtifactRegistry(), repoRoot = REPO_ROOT) {
  const relPath = normalizeRepoPath(inputPath, repoRoot);
  if (!relPath || relPath === '.') {
    return {
      path: relPath,
      protected: false,
      classification: 'invalid',
      reason: 'missing_path',
    };
  }

  if (isProtectedPath(relPath, registry.protectedPrefixes || [])) {
    return {
      path: relPath,
      protected: true,
      classification: 'protected_surface',
      artifactType: 'runtime_state',
      class: 'protected_surface',
      storageRule: 'Do not read or write directly. Use an approved wrapper or migration plan.',
    };
  }

  const exact = (registry.artifacts || []).find((artifact) => artifact.path === relPath);
  if (exact) {
    return {
      path: relPath,
      protected: Boolean(exact.protected),
      classification: 'registered',
      artifactType: exact.type,
      class: exact.class,
      owner: exact.owner,
      status: exact.status,
      storageRule: exact.storageRule,
      rebuildRule: exact.rebuildRule,
    };
  }

  const rule = [...(registry.placementRules || [])]
    .sort((a, b) => String(b.matchPrefix || '').length - String(a.matchPrefix || '').length)
    .find((candidate) => relPath.startsWith(candidate.matchPrefix));

  if (rule) {
    return {
      path: relPath,
      protected: false,
      classification: 'placement_rule',
      ruleId: rule.id,
      artifactType: inferArtifactType(relPath, rule.artifactType),
      class: rule.class,
      storageRule: rule.storageRule,
    };
  }

  return {
    path: relPath,
    protected: false,
    classification: 'candidate_review',
    artifactType: inferArtifactType(relPath),
    class: 'candidate_review',
    storageRule: 'Add an artifact-registry entry or move this artifact into a canonical destination before treating it as durable.',
  };
}

export function validateArtifactRegistry(registry = loadArtifactRegistry(), options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const folderClasses = options.folderClasses || loadFolderClasses();
  const errors = [];
  const warnings = [];
  const seen = new Set();

  if (registry.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!Array.isArray(registry.artifacts)) errors.push('artifacts must be an array');
  if (!Array.isArray(registry.placementRules)) errors.push('placementRules must be an array');

  for (const artifact of registry.artifacts || []) {
    const label = artifact.path || '(missing path)';
    if (!artifact.path) errors.push('artifact missing path');
    if (seen.has(artifact.path)) errors.push(`duplicate artifact path: ${artifact.path}`);
    seen.add(artifact.path);

    for (const field of ['type', 'class', 'owner', 'status', 'storageRule', 'rebuildRule']) {
      if (!artifact[field]) errors.push(`${label} missing ${field}`);
    }

    if (!registry.artifactTypes?.includes(artifact.type)) errors.push(`${label} has unknown type: ${artifact.type}`);
    if (folderClasses.size && !folderClasses.has(artifact.class)) errors.push(`${label} has unknown class: ${artifact.class}`);
    if (artifact.protected && artifact.readByDefault) errors.push(`${label} cannot be protected and readByDefault`);
    if (isProtectedPath(artifact.path, registry.protectedPrefixes || []) && !artifact.protected) {
      errors.push(`${label} is under a protected prefix but is not marked protected`);
    }

    if (artifact.status !== 'planned' && artifact.status !== 'retired' && !existsSync(path.join(repoRoot, artifact.path))) {
      errors.push(`${label} does not exist`);
    }
  }

  for (const rule of registry.placementRules || []) {
    const label = rule.id || '(missing id)';
    for (const field of ['id', 'matchPrefix', 'artifactType', 'class', 'storageRule']) {
      if (!rule[field]) errors.push(`placement rule ${label} missing ${field}`);
    }
    if (rule.artifactType && !registry.artifactTypes?.includes(rule.artifactType)) {
      errors.push(`placement rule ${label} has unknown artifactType: ${rule.artifactType}`);
    }
    if (folderClasses.size && rule.class && !folderClasses.has(rule.class)) {
      errors.push(`placement rule ${label} has unknown class: ${rule.class}`);
    }
  }

  if ((registry.artifacts || []).length < 10) warnings.push('artifact registry seed has fewer than 10 artifacts');
  const truthPromotionRuntime = validateTruthPromotionRegistryRuntime(registry, { repoRoot });
  errors.push(...truthPromotionRuntime.errors.map((error) => `truth promotion runtime: ${error}`));
  warnings.push(...truthPromotionRuntime.warnings.map((warning) => `truth promotion runtime: ${warning}`));

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    artifactCount: (registry.artifacts || []).length,
    placementRuleCount: (registry.placementRules || []).length,
    truthPromotionRuntime,
  };
}

function inferArtifactType(relPath, fallback = '') {
  if (fallback) return fallback;
  if (relPath.endsWith('.test.mjs')) return 'test';
  if (relPath.endsWith('.mjs') || relPath.endsWith('.sh')) return 'script';
  if (relPath.endsWith('.json')) return 'config';
  if (relPath.endsWith('.md')) return 'doc';
  if (relPath.endsWith('.html')) return 'report';
  return 'folder';
}

function runCli(argv = process.argv.slice(2)) {
  const command = argv[0] || '--validate';
  const registry = loadArtifactRegistry();

  if (EXIT_COMMANDS.has(command)) {
    const result = validateArtifactRegistry(registry);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === '--classify' || command === 'classify') {
    const target = argv[1];
    const result = classifyArtifactPath(target, registry);
    console.log(JSON.stringify(result, null, 2));
    if (!target || result.classification === 'invalid') process.exitCode = 1;
    return;
  }

  if (command === '--list' || command === 'list') {
    console.log(JSON.stringify(registry, null, 2));
    return;
  }

  console.error('Usage: node _SYSTEM/Scripts/artifact-registry.mjs [--validate|--classify <path>|--list]');
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
