#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classifyArtifactPath, loadArtifactRegistry } from './artifact-registry.mjs';
import { rickRoster } from './lane-persona-map.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');

export const REQUIRED_SKILLS = [
  'adversarial-verification',
  'claude-output-lane',
  'claude-codex-capability-bridge',
  'gitnexus-impact-analysis',
  'verification-before-completion',
  'systematic-debugging',
  'writing-plans',
];

const PROTECTED_PREFIXES = [
  'backend/data/',
  '.claude/state/',
  '.claude/history/',
  '.claude/file-history/',
  '.claude/projects/',
  '.env',
  'node_modules/',
  '.amp/',
];

const PERMISSION_TOOLS = ['Read', 'Write', 'Edit', 'MultiEdit'];
const ACCEPTED_EFFORT_LEVELS = new Set(['max', 'xhigh']);

export function runClaudePluginParityCheck(options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const failures = [];
  const warnings = [];

  checkClaudeImports(repoRoot, failures);
  checkFolderRegistry(repoRoot, failures);
  checkArtifactRegistry(repoRoot, failures);
  checkSettings(repoRoot, failures);
  checkLocalSettings(repoRoot, failures, warnings);
  checkSkillShims(repoRoot, failures);
  checkMcpWrappers(repoRoot, failures);
  checkRickRoster(repoRoot, failures);

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    checked: {
      requiredSkillCount: REQUIRED_SKILLS.length,
      protectedPrefixCount: PROTECTED_PREFIXES.length,
    },
  };
}

function checkClaudeImports(repoRoot, failures) {
  const rootClaude = readText(path.join(repoRoot, 'CLAUDE.md'), failures);
  const localClaude = readText(path.join(repoRoot, '.claude/CLAUDE.md'), failures);
  if (!rootClaude || !localClaude) return;

  if (!rootClaude.includes('@_SYSTEM/yuri-origin.md')) {
    failures.push('CLAUDE.md must import @_SYSTEM/yuri-origin.md');
  }
  if (!rootClaude.includes('@SOUL.md')) {
    failures.push('CLAUDE.md must import @SOUL.md');
  }
  if (/^INHERIT:/mu.test(rootClaude)) {
    failures.push('CLAUDE.md still uses non-Claude-native INHERIT directives');
  }
  if (/^INHERIT:/mu.test(localClaude)) {
    failures.push('.claude/CLAUDE.md still uses non-Claude-native INHERIT directives');
  }
  if (!localClaude.includes('@../CLAUDE.md')) {
    failures.push('.claude/CLAUDE.md must import @../CLAUDE.md for plugin parity');
  }
  if (!localClaude.includes('@../SOUL.md')) {
    failures.push('.claude/CLAUDE.md must import @../SOUL.md for persona continuity');
  }
}

function checkFolderRegistry(repoRoot, failures) {
  const registry = readJson(path.join(repoRoot, '_SYSTEM/config/folder-registry.json'), failures);
  if (!registry) return;
  const entry = registry.folders?.find((folder) => folder.path === '.claude');
  if (!entry) {
    failures.push('folder registry missing .claude entry');
    return;
  }
  if (entry.status !== 'active_adapter') failures.push('.claude folder registry status must be active_adapter');
  if (entry.owner !== 'Claude Code adapter') failures.push('.claude folder registry owner must be Claude Code adapter');
}

function checkArtifactRegistry(repoRoot, failures) {
  const registry = loadArtifactRegistry(path.join(repoRoot, '_SYSTEM/config/artifact-registry.json'));
  const claudeRule = registry.placementRules?.find((rule) => rule.id === 'claude-skill');
  if (!claudeRule || claudeRule.matchPrefix !== '.claude/skills/') {
    failures.push('artifact registry missing .claude/skills/ placement rule');
  }

  const expectedArtifacts = ['CLAUDE.md', '.claude/CLAUDE.md', '.claude/settings.json'];
  for (const artifactPath of expectedArtifacts) {
    const entry = registry.artifacts?.find((artifact) => artifact.path === artifactPath);
    if (!entry) failures.push(`artifact registry missing ${artifactPath}`);
  }

  for (const skill of REQUIRED_SKILLS) {
    const result = classifyArtifactPath(`.claude/skills/${skill}/SKILL.md`, registry, repoRoot);
    if (result.classification !== 'placement_rule' || result.ruleId !== 'claude-skill') {
      failures.push(`artifact registry does not classify .claude skill shim for ${skill}`);
    }
  }
}

function checkSettings(repoRoot, failures) {
  const settings = readJson(path.join(repoRoot, '.claude/settings.json'), failures);
  if (!settings) return;

  if (Object.hasOwn(settings, 'model')) {
    if (settings.model === 'user-selected') {
      failures.push('.claude/settings.json must not use broken model sentinel: user-selected');
    } else if (typeof settings.model !== 'string' || settings.model.trim() === '') {
      failures.push('.claude/settings.json model must be a non-empty plugin-selected model name when present');
    }
  }
  if (!ACCEPTED_EFFORT_LEVELS.has(settings.effortLevel)) {
    failures.push('.claude/settings.json must set effortLevel to max or xhigh');
  }

  const deny = settings.permissions?.deny || [];
  for (const prefix of PROTECTED_PREFIXES) {
    for (const tool of PERMISSION_TOOLS) {
      if (!hasProtectedDeny(deny, tool, prefix)) {
        failures.push(`missing ${tool} deny for protected prefix ${prefix}`);
      }
    }
  }
}

function checkLocalSettings(repoRoot, failures, warnings) {
  const localPath = path.join(repoRoot, '.claude/settings.local.json');
  if (!fs.existsSync(localPath)) {
    warnings.push('.claude/settings.local.json missing; local cleanup check skipped');
    return;
  }
  const localText = readText(localPath, failures);
  if (!localText) return;

  const forbiddenSnippets = [
    'NUDIMMUD',
    'Read(//Users/marcelspatz/**)',
    'backend/.env',
    'Bash(cat > *)',
  ];
  for (const snippet of forbiddenSnippets) {
    if (localText.includes(snippet)) {
      failures.push(`.claude/settings.local.json still contains stale or broad allowance: ${snippet}`);
    }
  }
}

function checkSkillShims(repoRoot, failures) {
  for (const skill of REQUIRED_SKILLS) {
    const rootSkill = path.join(repoRoot, 'skills', skill, 'SKILL.md');
    const shim = path.join(repoRoot, '.claude/skills', skill, 'SKILL.md');
    if (!fs.existsSync(rootSkill)) {
      failures.push(`canonical root skill missing: ${skill}`);
      continue;
    }
    let stat;
    try {
      stat = fs.lstatSync(shim);
    } catch {
      failures.push(`Claude skill shim missing: ${skill}`);
      continue;
    }
    if (!stat.isSymbolicLink()) {
      failures.push(`Claude skill shim must be symlink, not copy: ${skill}`);
      continue;
    }
    const target = fs.readlinkSync(shim);
    const resolved = path.resolve(path.dirname(shim), target);
    if (path.normalize(resolved) !== path.normalize(rootSkill)) {
      failures.push(`Claude skill shim points to wrong target for ${skill}: ${target}`);
    }
  }
}

function checkMcpWrappers(repoRoot, failures) {
  const requiredFiles = [
    '_SYSTEM/Scripts/gitnexus-mcp.mjs',
    '_SYSTEM/Scripts/gitnexus-mcp-check.mjs',
    '.claude/mcp-servers/ollama-bridge/index.js',
    '_SYSTEM/Scripts/ollama-bridge-mcp-check.mjs',
  ];
  for (const relPath of requiredFiles) {
    if (!fs.existsSync(path.join(repoRoot, relPath))) failures.push(`MCP wrapper/check missing: ${relPath}`);
  }
}

function checkRickRoster(repoRoot, failures) {
  const rootClaude = readText(path.join(repoRoot, 'CLAUDE.md'), failures);
  if (!rootClaude) return;
  const requiredPhrases = [
    '_SYSTEM/Scripts/lane-persona-map.mjs roster',
    'Quantum Rick',
    'Rick Prime',
    'Simple Rick',
  ];
  for (const phrase of requiredPhrases) {
    if (!rootClaude.includes(phrase)) failures.push(`CLAUDE.md missing Rick roster phrase: ${phrase}`);
  }

  const roster = rickRoster({ env: {} });
  const aliases = new Set(roster.map((entry) => entry.privateAlias));
  for (const alias of ['Rick C-137', 'Quantum Rick', 'Memory Rick', 'Rick Prime', 'Simple Rick', 'Council of Ricks', 'Robot Rick']) {
    if (!aliases.has(alias)) failures.push(`Rick roster missing alias: ${alias}`);
  }
}

function hasProtectedDeny(deny, tool, prefix) {
  const normalized = prefix.replace(/\/$/u, '');
  const candidates = [
    `${tool}(${normalized})`,
    `${tool}(${normalized}/**)`,
    `${tool}(${normalized}*)`,
  ];
  return candidates.some((candidate) => deny.includes(candidate));
}

function readText(filePath, failures) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    failures.push(`failed to read ${path.relative(REPO_ROOT, filePath)}: ${error.message}`);
    return '';
  }
}

function readJson(filePath, failures) {
  const text = readText(filePath, failures);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`invalid JSON in ${path.relative(REPO_ROOT, filePath)}: ${error.message}`);
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runClaudePluginParityCheck();
  if (result.warnings.length) {
    for (const warning of result.warnings) console.warn(`WARN ${warning}`);
  }
  if (!result.ok) {
    console.error(result.failures.map((failure) => `- ${failure}`).join('\n'));
    process.exit(1);
  }
  console.log(`CLAUDE_PLUGIN_PARITY_CHECK_PASS skills=${result.checked.requiredSkillCount} protected=${result.checked.protectedPrefixCount}`);
}
