#!/usr/bin/env node

import path from 'path';

const PROJECT_ROOT = '/Users/marcelspatz/YURI-OS-MUSUBI';

const PROTECTED_TARGETS = [
  { path: path.join(PROJECT_ROOT, '.env'), type: 'file', label: '.env' },
  { path: path.join(PROJECT_ROOT, '.claude/state'), type: 'dir', label: '.claude/state' },
  { path: path.join(PROJECT_ROOT, '.claude/history'), type: 'dir', label: '.claude/history' },
  { path: path.join(PROJECT_ROOT, 'backend/data'), type: 'dir', label: 'backend/data' },
  { path: '/Volumes/T7', type: 'dir', label: '/Volumes/T7' },
];

const PROTECTED_LITERAL_PATTERNS = [
  { re: /(^|[\s"'=;:])\.env($|[\s"';|&])/u, label: '.env' },
  { re: /(^|[\s"'=;:])\.claude\/state(\/|$|[\s"';|&])/u, label: '.claude/state' },
  { re: /(^|[\s"'=;:])\.claude\/history(\/|$|[\s"';|&])/u, label: '.claude/history' },
  { re: /(^|[\s"'=;:])backend\/data(\/|$|[\s"';|&])/u, label: 'backend/data' },
  { re: /\/Volumes\/T7(\/|$|[\s"';|&])/u, label: '/Volumes/T7' },
];

const MUTATING_COMMAND_RE =
  /\b(rm|mv|cp|rsync|install|touch|mkdir|rmdir|truncate|tee|dd|sed|perl|python3?|node|bash|sh|zsh|chmod|chown|git)\b|\s(?:>|>>|2>|&>)/u;

const DESTRUCTIVE_PATTERNS = [
  { re: /\brm\s+-[^;&|]*[rR][^;&|]*[fF]?/u, reason: 'destructive recursive rm is blocked' },
  { re: /\bgit\s+reset\s+--hard\b/u, reason: 'git reset --hard is blocked' },
  { re: /\bgit\s+clean\s+-[^;&|]*[dDxXfF]/u, reason: 'git clean destructive mode is blocked' },
  { re: /\bgit\s+checkout\s+--\s+/u, reason: 'git checkout -- path restore is blocked' },
  { re: /\bgit\s+restore\s+.*\s--source\b/u, reason: 'git restore from source is blocked' },
  { re: /\bgit\s+branch\s+-D\b/u, reason: 'force branch delete is blocked' },
  { re: /\b(?:curl|wget)\b[^|;&]*\|\s*(?:sudo\s+)?(?:bash|sh|zsh|python3?|node|ruby|perl)\b/u, reason: 'pipe-to-shell installer is blocked' },
  { re: /\b(?:bash|sh|zsh)\s+<\s*\(\s*(?:curl|wget)\b/u, reason: 'process-substitution installer is blocked' },
  { re: /\bdd\b[^;&|]*\bof=/u, reason: 'raw disk write via dd is blocked' },
  { re: /\bmkfs(?:\.[a-z0-9]+)?\b/u, reason: 'filesystem formatting is blocked' },
  { re: /\bdiskutil\b[^;&|]*(?:erase|partition|unmountDisk|apfs\s+delete)/iu, reason: 'destructive diskutil action is blocked' },
  { re: /\bchmod\s+-R\s+777\b/u, reason: 'recursive world-writable chmod is blocked' },
  { re: /\bchown\s+-R\b/u, reason: 'recursive ownership change is blocked' },
  { re: /\bsudo\s+rm\b/u, reason: 'sudo rm is blocked' },
];

export function evaluateToolCall(toolName, toolInput = {}, opts = {}) {
  const normalizedTool = normalizeToolName(toolName);
  const input = toolInput || {};
  const cwd = input.cwd || input.workdir || opts.cwd || PROJECT_ROOT;

  if (isShellTool(normalizedTool)) {
    const command = input.command || input.cmd || '';
    if (!command) return allow();
    return evaluateShellCommand(command, cwd);
  }

  if (isWriteTool(normalizedTool)) {
    const target = input.path || input.file_path || input.filePath || input.target_file || input.target || '';
    if (!target) return allow();
    const hit = protectedPathHit(target, cwd);
    if (hit) return block(`write to protected target blocked: ${hit.label}`);
  }

  if (normalizedTool === 'multiedit') {
    const target = input.path || input.file_path || input.filePath || '';
    const hit = target ? protectedPathHit(target, cwd) : null;
    if (hit) return block(`edit to protected target blocked: ${hit.label}`);
  }

  if (normalizedTool === 'apply_patch') {
    const patchText = String(input.patch || input.input || input.text || '');
    const hit = protectedLiteralHit(patchText);
    if (hit) return block(`patch touches protected target: ${hit.label}`);
  }

  return allow();
}

export function evaluateHookEvent(event = {}) {
  const toolName = event.tool_name || event.toolName || event.name || event.tool || '';
  const toolInput = event.tool_input || event.toolInput || event.input || event.arguments || {};
  return evaluateToolCall(toolName, toolInput);
}

export function codexHookBlock(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

export async function runHookFromStdin({ check = false } = {}) {
  const raw = await readStdin();
  let event;
  try {
    event = raw ? JSON.parse(raw) : {};
  } catch {
    if (check) {
      console.log(JSON.stringify(block('invalid hook JSON'), null, 2));
      process.exit(2);
    }
    process.exit(0);
  }

  const decision = evaluateHookEvent(event);
  if (check) {
    console.log(JSON.stringify(decision, null, 2));
    process.exit(decision.allowed ? 0 : 2);
  }

  if (!decision.allowed) {
    process.stdout.write(`${JSON.stringify(codexHookBlock(decision.reason))}\n`);
  }
}

function evaluateShellCommand(command, cwd) {
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.re.test(command)) return block(pattern.reason);
  }

  for (const targetPath of extractLikelyWriteTargets(command)) {
    const hit = protectedPathHit(targetPath, cwd);
    if (hit) return block(`write to protected target blocked: ${hit.label}`);
  }

  const protectedLiteral = protectedLiteralHit(command);
  if (protectedLiteral && MUTATING_COMMAND_RE.test(command)) {
    if (isAllowedProtectedReadForOffload(command, protectedLiteral.label)) return allow();
    return block(`mutation of protected target blocked: ${protectedLiteral.label}`);
  }

  return allow();
}

function isAllowedProtectedReadForOffload(command, protectedLabel) {
  if (protectedLabel !== '.env') return false;

  const readsEnv =
    /\b(?:source|\.)\s+\.env\b/u.test(command) ||
    /\bgrep\b[^;&|]*\bDEEPSEEK_API_KEY\b[^;&|]*\s\.env\b/u.test(command);
  if (!readsEnv) return false;

  const invokesOffload =
    /\b(?:node\s+)?Scripts\/offload-runner\.mjs\b[^;&|]*\bdeepseek-v4-(?:pro|flash)\b/u.test(command) ||
    /\bScripts\/offload\.sh\b[^;&|]*--model\s+deepseek-v4-(?:pro|flash)\b/u.test(command) ||
    /\b(?:bash\s+)?\.codex\/deepseek-offload\.sh\b/u.test(command);
  if (!invokesOffload) return false;

  return !/\s(?:>|>>|2>|&>)\s*['"]?\.env(?:['"]?|\s|$)/u.test(command);
}

function extractLikelyWriteTargets(command) {
  const targets = [];
  const redirectionRe = /(?:^|[\s])(?:>|>>|2>|&>)\s*(['"]?)([^'"|;&\s]+)\1/gu;
  const teeRe = /\btee\s+(?:-a\s+)?(['"]?)([^'"|;&\s]+)\1/gu;
  const outputFlagRe = /\b(?:--output|-o|--out|--file|--target|--dest|--destination)\s+(['"]?)([^'"|;&\s]+)\1/gu;

  for (const re of [redirectionRe, teeRe, outputFlagRe]) {
    for (const match of command.matchAll(re)) {
      if (match[2]) targets.push(match[2]);
    }
  }

  return targets;
}

function protectedLiteralHit(text) {
  for (const pattern of PROTECTED_LITERAL_PATTERNS) {
    if (pattern.re.test(text)) return pattern;
  }
  return null;
}

function protectedPathHit(inputPath, cwd) {
  const resolved = resolveTargetPath(inputPath, cwd);
  for (const target of PROTECTED_TARGETS) {
    if (target.type === 'file' && resolved === target.path) return target;
    if (target.type === 'dir' && (resolved === target.path || resolved.startsWith(`${target.path}${path.sep}`))) {
      return target;
    }
  }
  return null;
}

function resolveTargetPath(inputPath, cwd) {
  if (!inputPath) return '';
  const expanded = String(inputPath).replace(/^~(?=$|\/)/u, process.env.HOME || '~');
  if (path.isAbsolute(expanded)) return path.resolve(expanded);
  return path.resolve(cwd || PROJECT_ROOT, expanded);
}

function normalizeToolName(toolName) {
  return String(toolName || '')
    .split('.')
    .pop()
    .replace(/[^a-z0-9_-]/giu, '')
    .toLowerCase();
}

function isShellTool(toolName) {
  return ['bash', 'shell', 'exec_command', 'execcommand', 'terminal'].includes(toolName);
}

function isWriteTool(toolName) {
  return ['write', 'edit', 'write_file', 'writefile', 'create_file', 'createfile'].includes(toolName);
}

function allow() {
  return { allowed: true, decision: 'allow' };
}

function block(reason) {
  return { allowed: false, decision: 'deny', reason };
}

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { raw += chunk; });
    process.stdin.on('end', () => resolve(raw.trim()));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runHookFromStdin({ check: process.argv.includes('--check') });
}
