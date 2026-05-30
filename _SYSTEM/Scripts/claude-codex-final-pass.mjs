#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { traceDispatchEvent } from './math/yuri-energy-dispatch-bridge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const RUNNER = path.join(REPO_ROOT, '_SYSTEM/Scripts/codex-offload-runner.mjs');
const DEFAULT_MODEL = 'codex-spark';
// Operator reasoning vocab is `xhigh` (max depth), NEVER `max`. `codex` is the
// OpenAI *platform*; the model is a gpt-* id (substantive review: gpt-5.5). The
// runner translates `xhigh` to codex's internal reasoning_effort flag.
const DEFAULT_REASONING = 'xhigh';
const MAX_PACKET_CHARS = 120_000;

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

const options = parseArgs(process.argv.slice(2));
const packetPath = resolvePacketPath(options.packet);
const artifactDir = path.resolve(options.artifactDir || defaultArtifactDir(packetPath));
fs.mkdirSync(artifactDir, { recursive: true });

const packetText = fs.readFileSync(packetPath, 'utf8');
if (packetText.length > MAX_PACKET_CHARS) {
  fail(`Packet too large for bounded Codex final pass: ${packetText.length} chars`);
}

const prompt = buildPrompt({
  packetRelPath: path.relative(REPO_ROOT, packetPath),
  packetText,
  task: options.task,
  gitStatus: readGit(['status', '--short']),
  gitDiffStat: readGit(['diff', '--stat']),
});

fs.writeFileSync(path.join(artifactDir, 'prompt.md'), prompt);

const runnerArgs = [
  RUNNER,
  options.model,
  '--reasoning', options.reasoning,
  '--artifact-dir', artifactDir,
  '--cd', REPO_ROOT,
];
if (!options.execute) runnerArgs.push('--dry-run');
runnerArgs.push(prompt);

const preview = {
  status: options.execute ? 'EXECUTING_CODEX_FINAL_PASS' : 'DRY_RUN',
  packet: path.relative(REPO_ROOT, packetPath),
  artifactDir,
  model: options.model,
  reasoning: options.reasoning,
  command: [process.execPath, ...runnerArgs.slice(0, -1), '<prompt>'],
};
fs.writeFileSync(path.join(artifactDir, 'handoff.json'), `${JSON.stringify(preview, null, 2)}\n`);
// A.2.a observability hook — fire-and-forget, never throws into dispatch path.
traceDispatchEvent({ lane: 'codex-final-pass', runId: `codex-final-pass-${Date.now()}` });

const result = spawnSync(process.execPath, runnerArgs, {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
});

fs.writeFileSync(path.join(artifactDir, 'handoff-stdout.log'), result.stdout || '');
fs.writeFileSync(path.join(artifactDir, 'handoff-stderr.log'), result.stderr || '');

if (result.error) fail(result.error.message);
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status ?? 1);

export function buildPrompt({ packetRelPath, packetText, task = '', gitStatus = '', gitDiffStat = '' }) {
  return `## CODEX FINAL PASS PACKET

You are an external GPT-5.x reviewer on the OpenAI Codex platform giving the YURI
active session a second-opinion clarification check. You are NOT the final gate —
the active session is the finalizer. Your verdict is advisory.

Authority:
- Advisory verification only — clarify; do not arbitrate or gate.
- Do not edit files.
- Do not commit or push.
- Do not deploy or call live services.
- Do not read protected paths: ${PROTECTED_PREFIXES.join(', ')}.
- If required evidence is unavailable, report a bounded failure instead of guessing.

Required verification:
1. Check the packet against local repo evidence where possible.
2. Inspect git status/diff only as needed.
3. Confirm protected path and secret-surface boundaries were respected.
4. Confirm tests/checks are meaningful for the change.
5. Identify unsupported claims, missing tests, stale GitNexus, or residual risk.
6. Return one verdict: PASS, BLOCKED, or NEEDS_OWNER.

Task:
${task || '(not provided)'}

Packet path:
${packetRelPath}

Current git status:
\`\`\`text
${gitStatus.trim() || '(clean or unavailable)'}
\`\`\`

Current git diff stat:
\`\`\`text
${gitDiffStat.trim() || '(no diff stat or unavailable)'}
\`\`\`

Claude final-pass packet:
\`\`\`markdown
${packetText}
\`\`\`
`;
}

function parseArgs(args) {
  const out = {
    packet: '',
    artifactDir: '',
    task: '',
    execute: false,
    model: DEFAULT_MODEL,
    reasoning: DEFAULT_REASONING,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--packet' && args[i + 1]) out.packet = args[++i];
    else if (arg === '--artifact-dir' && args[i + 1]) out.artifactDir = args[++i];
    else if (arg === '--task' && args[i + 1]) out.task = args[++i];
    else if (arg === '--model' && args[i + 1]) out.model = args[++i];
    else if (arg === '--reasoning' && args[i + 1]) out.reasoning = args[++i];
    else if (arg === '--execute') out.execute = true;
    else if (arg === '--dry-run') out.execute = false;
    else if (arg === '--help' || arg === '-h') usage(0);
    else fail(`Unknown argument: ${arg}`);
  }
  if (!out.packet) usage(1);
  // Operator-vocab guard: `max` is not an operator reasoning level — the max
  // depth is `xhigh`. Coerce + warn rather than dispatch the wrong word.
  if (['max', 'maximum', 'highest'].includes(String(out.reasoning).toLowerCase())) {
    process.stderr.write(`[final-pass] reasoning "${out.reasoning}" -> "xhigh" (operator vocab; max depth is xhigh).\n`);
    out.reasoning = 'xhigh';
  }
  return out;
}

function resolvePacketPath(packet) {
  const resolved = path.resolve(REPO_ROOT, packet);
  const rel = path.relative(REPO_ROOT, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) fail(`Packet must be inside repo: ${packet}`);
  if (isProtectedRelPath(rel)) fail(`Refusing protected packet path: ${rel}`);
  if (!rel.startsWith('_SYSTEM/reports/')) fail(`Packet must live under _SYSTEM/reports/: ${rel}`);
  if (!fs.existsSync(resolved)) fail(`Packet not found: ${rel}`);
  if (!fs.statSync(resolved).isFile()) fail(`Packet is not a file: ${rel}`);
  return resolved;
}

function isProtectedRelPath(relPath) {
  const normalized = relPath.replace(/\\/gu, '/');
  return PROTECTED_PREFIXES.some((prefix) => {
    const p = prefix.replace(/\/$/u, '');
    return normalized === p || normalized.startsWith(`${p}/`) || (p === '.env' && normalized.startsWith('.env'));
  });
}

function defaultArtifactDir(packetPath) {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const slug = path.basename(packetPath, path.extname(packetPath)).replace(/[^a-z0-9._-]+/giu, '-').slice(0, 80);
  return path.join(REPO_ROOT, '_SYSTEM/reports/codex-final-pass', `${stamp}_${slug}`);
}

function readGit(args) {
  const result = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) return '';
  return result.stdout || '';
}

function usage(code) {
  const text = `Usage:
  node _SYSTEM/Scripts/claude-codex-final-pass.mjs --packet _SYSTEM/reports/<packet>.md [--execute]

Options:
  --packet <path>       Required. Final-pass packet under _SYSTEM/reports/.
  --artifact-dir <dir>  Optional output directory for prompt/result artifacts.
  --task <text>         Optional task label.
  --model <model>       Model on the OpenAI *codex* platform (codex is the platform,
                        not a model). Substantive review: gpt-5.5. Default: ${DEFAULT_MODEL}.
  --reasoning <level>   Operator depth: xhigh (max) | high | medium | low. Never "max".
                        Default: ${DEFAULT_REASONING}.
  --execute             Call Codex. Omit for dry-run preview.
  --dry-run             Force preview only.
`;
  (code === 0 ? process.stdout : process.stderr).write(text);
  process.exit(code);
}

function fail(message) {
  process.stderr.write(`CLAUDE_CODEX_FINAL_PASS_BLOCKED ${message}\n`);
  process.exit(1);
}
