#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

function read(relPath) {
  return readFileSync(resolve(repoRoot, relPath), 'utf8');
}

function assertIncludes(file, needle) {
  assert.ok(read(file).includes(needle), `${file} missing: ${needle}`);
}

function runNode(relPath, input = '') {
  return execFileSync(process.execPath, [resolve(repoRoot, relPath)], {
    input,
    encoding: 'utf8',
    cwd: repoRoot,
  }).trim();
}

const requiredSoulRules = [
  '**Be an adversarial ally.**',
  '**Use contextual edge without corrupting the work.**',
  '**Treat rules as testable machinery.**',
  '**Think with a cognitive workflow, not a costume.**',
  '**Run divergent scan before convergence when the task benefits.**',
  '**Use monotropic depth with exit checks.**',
  '**Switch salience deliberately.**',
  '**Use polymathic transfer with verification.**',
  '**Compress into lattice maps.**',
];

for (const rule of requiredSoulRules) {
  assertIncludes('SOUL.md', rule);
}

assertIncludes('OPERATOR_PROTOCOL.md', '## PERSONA_AUTHORITY');
assertIncludes('OPERATOR_PROTOCOL.md', './SOUL.md');
assertIncludes('OPERATOR_PROTOCOL.md', 'Research citations and rationale live outside SOUL');

const directInheritFiles = [
  'AGENTS.md',
  'CLAUDE.md',
  'CODEX_PROTOCOL.md',
  'GEMINI.md',
  'AEONIC_PROTOCOL.md',
  'LOCAL_EXECUTION_POLICY.md',
  '.claude/CLAUDE.md',
  '.clauderules',
  '.cursorrules',
  '.windsurfrules',
];

for (const file of directInheritFiles) {
  assertIncludes(file, 'SOUL.md');
}

assertIncludes('YURI.md', 'INHERIT: SOUL.md');
assertIncludes('.clinerules', 'INHERIT: SOUL.md');
assertIncludes('.cursor/rules/sync.mdc', 'SOUL.md');
assertIncludes('.claude/rules/yuri_operating_dna.md', '../../SOUL.md');

const settings = JSON.parse(read('.claude/settings.json'));
const sessionHooks = settings.hooks?.SessionStart?.flatMap((group) => group.hooks || []) || [];
const subagentHooks = settings.hooks?.SubagentStart?.flatMap((group) => group.hooks || []) || [];
assert.ok(
  sessionHooks.some((hook) => hook.command === 'node .claude/hooks/soul-persona-inject.js'),
  'SessionStart missing soul-persona-inject hook',
);
assert.ok(
  subagentHooks.some((hook) => hook.command === 'node .claude/hooks/soul-persona-inject.js'),
  'SubagentStart missing soul-persona-inject hook',
);

const hookOutput = JSON.parse(runNode('.claude/hooks/soul-persona-inject.js'));
const startupContext = hookOutput.hookSpecificOutput?.additionalContext || '';
for (const term of ['<soul-persona', 'adversarial ally', 'contextual edge', 'polymathic transfer', 'monotropic depth']) {
  assert.ok(startupContext.includes(term), `startup persona context missing: ${term}`);
}

const subagentOutput = JSON.parse(runNode(
  '.claude/hooks/soul-persona-inject.js',
  JSON.stringify({ event_type: 'SubagentStart', agent_type: 'reviewer' }),
));
assert.equal(subagentOutput.hookSpecificOutput?.hookEventName, 'SubagentStart', 'subagent hook event name should pass through');
assert.ok(
  subagentOutput.hookSpecificOutput?.additionalContext?.includes('<soul-persona'),
  'subagent persona context missing',
);

const activePromptFiles = [
  'SOUL.md',
  'OPERATOR_PROTOCOL.md',
  'CLAUDE.md',
  'AGENTS.md',
  'YURI.md',
  '.clinerules',
  '.windsurfrules',
  '.cursorrules',
  '.clauderules',
  '.cursor/rules/sync.mdc',
  '.claude/rules/yuri_operating_dna.md',
];

for (const file of activePromptFiles) {
  assert.equal(/https?:\/\//.test(read(file)), false, `${file} should not contain research URLs`);
}

assertIncludes('CLAUDE.md', '## CLAUDE_ULTRA_CONTROL_PLANE');
assertIncludes('CLAUDE.md', 'CODEX_PROTOCOL.md');
assertIncludes('CLAUDE.md', 'GitNexus impact');
assertIncludes('CLAUDE.md', 'Protected Paths');
assertIncludes('CLAUDE.md', 'CLAUDE CONTROL PACKET');

const rationale = read('_SYSTEM/yuri-cognitive-persona-rationale.md');
for (const url of [
  'https://pmc.ncbi.nlm.nih.gov/articles/PMC4724474/',
  'https://pmc.ncbi.nlm.nih.gov/articles/PMC4459939/',
  'https://pmc.ncbi.nlm.nih.gov/articles/PMC7709632/',
  'https://pmc.ncbi.nlm.nih.gov/articles/PMC7851038/',
  'https://pmc.ncbi.nlm.nih.gov/articles/PMC8117104/',
  'https://www.tandfonline.com/doi/abs/10.1080/10400419.2020.1751545',
]) {
  assert.ok(rationale.includes(url), `rationale missing source URL: ${url}`);
}

process.stdout.write('YURI_PERSONA_CHECK_PASS\n');
