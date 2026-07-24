#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'path';
import { fileURLToPath } from 'url';

import { repoIntegrityCommandHit } from './repo-integrity-guard.mjs';

const POLICY_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(POLICY_DIR, '../../..');
const HOME_DIR = os.homedir();
const CONTEXT_PREFLIGHT_STAMP_PATH = path.join(PROJECT_ROOT, '_SYSTEM/state/context-preflight-last.json');
const CONTEXT_PREFLIGHT_STAMP_TTL_MS = 30 * 60 * 1000;

const PROTECTED_TARGETS = [
  { path: path.join(PROJECT_ROOT, '.env'), type: 'file', label: '.env' },
  { path: path.join(PROJECT_ROOT, '.claude/state'), type: 'dir', label: '.claude/state' },
  { path: path.join(PROJECT_ROOT, '.claude/history'), type: 'dir', label: '.claude/history' },
  { path: path.join(PROJECT_ROOT, '.claude/file-history'), type: 'dir', label: '.claude/file-history' },
  { path: path.join(PROJECT_ROOT, '.claude/projects'), type: 'dir', label: '.claude/projects' },
  { path: path.join(PROJECT_ROOT, '.amp'), type: 'dir', label: '.amp' },
  { path: path.join(PROJECT_ROOT, 'backend/data'), type: 'dir', label: 'backend/data' },
  { path: path.join(PROJECT_ROOT, '_SYSTEM/backend/data'), type: 'dir', label: '_SYSTEM/backend/data' },
  { path: path.join(PROJECT_ROOT, 'node_modules'), type: 'dir', label: 'node_modules' },
  // SEC-4: .git/hooks + .git/config — a poisoned lane writing .git/hooks/pre-commit is a persistence
  // path that fires on the NEXT commit by any lane, including the owner's.
  { path: path.join(PROJECT_ROOT, '.git/hooks'), type: 'dir', label: '.git/hooks' },
  { path: path.join(PROJECT_ROOT, '.git/config'), type: 'file', label: '.git/config' },
  // SEC-4: HOME-relative credential stores + out-of-repo Claude settings. PROTECTED_TARGETS was
  // PROJECT_ROOT-relative only — these are absolute so resolveTargetPath's `path.isAbsolute` branch
  // matches them regardless of cwd.
  { path: path.join(HOME_DIR, '.aws'), type: 'dir', label: '~/.aws' },
  { path: path.join(HOME_DIR, '.npmrc'), type: 'file', label: '~/.npmrc' },
  { path: path.join(HOME_DIR, '.docker'), type: 'dir', label: '~/.docker' },
  { path: path.join(HOME_DIR, '.gitconfig'), type: 'file', label: '~/.gitconfig' },
  { path: path.join(HOME_DIR, '.ssh'), type: 'dir', label: '~/.ssh' },
  { path: path.join(HOME_DIR, '.zsh_history'), type: 'file', label: '~/.zsh_history' },
  { path: path.join(HOME_DIR, 'Library/Keychains'), type: 'dir', label: '~/Library/Keychains' },
  { path: path.join(HOME_DIR, '.claude/settings.json'), type: 'file', label: '~/.claude/settings.json' },
  { path: path.join(HOME_DIR, '.claude/settings.local.json'), type: 'file', label: '~/.claude/settings.local.json' },
  // Phase 6 (SEC-4 residual): additional cloud/vault/VCS credential stores named by the owner
  // packet — gcloud, Kubernetes, GPG, 1Password, gh CLI host tokens.
  { path: path.join(HOME_DIR, '.config/gcloud'), type: 'dir', label: '~/.config/gcloud' },
  { path: path.join(HOME_DIR, '.kube'), type: 'dir', label: '~/.kube' },
  { path: path.join(HOME_DIR, '.gnupg'), type: 'dir', label: '~/.gnupg' },
  { path: path.join(HOME_DIR, '.config/op'), type: 'dir', label: '~/.config/op' },
  { path: path.join(HOME_DIR, '.config/1Password'), type: 'dir', label: '~/.config/1Password' },
  { path: path.join(HOME_DIR, '.config/gh/hosts.yml'), type: 'file', label: '~/.config/gh/hosts.yml' },
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

// SEC-4: a HOME-relative literal must match THREE surface forms a shell command can carry: the
// literal `~/...` token, the literal `$HOME/...` token, AND the already-expanded absolute path (the
// shell expands `~`/`$HOME` before the string ever reaches this evaluator in most real invocations —
// e.g. `cat /Users/marcelspatz/.aws/credentials`). Matching only the unexpanded token forms silently
// misses every real shell invocation, which is the exact bypass a naive fix would leave open.
function homeRelativePattern(suffixRe, label) {
  const literalHome = escapeRegExp(HOME_DIR);
  return {
    re: new RegExp(`(^|[\\s"'=;:])(?:~|\\$HOME|${literalHome})\\/${suffixRe}`, 'u'),
    label,
  };
}

const PROTECTED_LITERAL_PATTERNS = [
  { re: /(^|[\s"'=;:])\.env($|[\s"';|&])/u, label: '.env' },
  { re: /(^|[\s"'=;:])\.claude\/state(\/|$|[\s"';|&])/u, label: '.claude/state' },
  { re: /(^|[\s"'=;:])\.claude\/history(\/|$|[\s"';|&])/u, label: '.claude/history' },
  { re: /(^|[\s"'=;:])\.claude\/file-history(\/|$|[\s"';|&])/u, label: '.claude/file-history' },
  { re: /(^|[\s"'=;:])\.claude\/projects(\/|$|[\s"';|&])/u, label: '.claude/projects' },
  { re: /(^|[\s"'=;:])\.amp(\/|$|[\s"';|&])/u, label: '.amp' },
  { re: /(^|[\s"'=;:])backend\/data(\/|$|[\s"';|&])/u, label: 'backend/data' },
  { re: /(^|[\s"'=;:])_SYSTEM\/backend\/data(\/|$|[\s"';|&])/u, label: '_SYSTEM/backend/data' },
  { re: /(^|[\s"'=;:])node_modules(\/|$|[\s"';|&])/u, label: 'node_modules' },
  { re: /(^|[\s"'=;:])\.git\/hooks(\/|$|[\s"';|&])/u, label: '.git/hooks' },
  { re: /(^|[\s"'=;:])\.git\/config($|[\s"';|&])/u, label: '.git/config' },
  // SEC-4: literal-pattern mirrors for the HOME-relative denylist so string-match paths (e.g.
  // `cat ~/.aws/credentials`, `cat $HOME/.ssh/id_rsa`, or the shell-expanded absolute form) are
  // caught even when extractLikelyWriteTargets doesn't fire (reads, not redirects/tee/output-flags).
  homeRelativePattern('\\.aws(\\/|$|[\\s"\';|&])', '~/.aws'),
  homeRelativePattern('\\.npmrc($|[\\s"\';|&])', '~/.npmrc'),
  homeRelativePattern('\\.docker(\\/|$|[\\s"\';|&])', '~/.docker'),
  homeRelativePattern('\\.gitconfig($|[\\s"\';|&])', '~/.gitconfig'),
  homeRelativePattern('\\.ssh(\\/|$|[\\s"\';|&])', '~/.ssh'),
  homeRelativePattern('\\.zsh_history($|[\\s"\';|&])', '~/.zsh_history'),
  homeRelativePattern('Library\\/Keychains(\\/|$|[\\s"\';|&])', '~/Library/Keychains'),
  homeRelativePattern('\\.claude\\/settings(?:\\.local)?\\.json($|[\\s"\';|&])', '~/.claude/settings.json'),
  // Phase 6 (SEC-4 residual): literal mirrors for the new HOME-relative stores above.
  homeRelativePattern('\\.config\\/gcloud(\\/|$|[\\s"\';|&])', '~/.config/gcloud'),
  homeRelativePattern('\\.kube(\\/|$|[\\s"\';|&])', '~/.kube'),
  homeRelativePattern('\\.gnupg(\\/|$|[\\s"\';|&])', '~/.gnupg'),
  homeRelativePattern('\\.config\\/op(\\/|$|[\\s"\';|&])', '~/.config/op'),
  homeRelativePattern('\\.config\\/1Password(\\/|$|[\\s"\';|&])', '~/.config/1Password'),
  homeRelativePattern('\\.config\\/gh\\/hosts\\.yml($|[\\s"\';|&])', '~/.config/gh/hosts.yml'),
  // Phase 6: private-key material ANYWHERE by name — not scoped to ~/.ssh, since a key can live in a
  // backup/download/repo-adjacent copy outside that directory. Matches the filename token itself.
  { re: /(^|[\s"'/=;:])id_(?:rsa|ed25519|ecdsa|dsa)(?:\.pub)?($|[\s"';|&])/u, label: 'private-key file (id_rsa/ed25519/ecdsa/dsa)' },
  { re: /(^|[\s"'/=;:])[\w.-]+\.(?:pem|p12)($|[\s"';|&])/u, label: 'private-key material (*.pem/*.p12)' },
];

const MUTATING_COMMAND_RE =
  /\b(rm|mv|cp|rsync|install|touch|mkdir|rmdir|truncate|tee|dd|sed|perl|python3?|node|bash|sh|zsh|chmod|chown|git)\b|\s(?:>|>>|2>|&>)/u;

// SEC-4: read-only commands over a protected literal must ALSO deny — the original gate only fired
// on MUTATING_COMMAND_RE, so `cat ~/.aws/credentials` (a pure read, no mutating verb) sailed through.
// This is a real gap on the ORIGINAL denylist too (e.g. `cat .env`), not just the newly-added HOME
// credential stores — fixed here rather than left silently unpatched, since the security matrix this
// finding is verified against requires these reads to DENY. Narrow and additive: only read/inspect
// commands, mirrors bash-security-guard.js's READ_CMDS set.
const READ_COMMAND_RE =
  /\b(cat|head|tail|less|more|bat|nl|view|strings|xxd|hexdump|od|grep|awk|sed|cut|sort|uniq|read|source|find|ls|stat|du|wc|file|readlink|realpath|shasum|sha256sum|md5|git|printf|echo|scp|rsync)\b/u;

const PROTECTED_READ_SEGMENT_RE =
  /^\s*(?:(?:command|builtin)\s+)?(?:cat|head|tail|less|more|bat|nl|view|strings|xxd|hexdump|od|grep|awk|sed|cut|sort|uniq|read|source|find|ls|stat|du|wc|file|readlink|realpath|shasum|sha256sum|md5|printf|echo|git\s+(?:status|log|diff|show|ls-files|rev-parse|check-ignore|branch|remote|describe|cat-file))\b/u;

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
  const rawToolName = String(toolName || '');
  const normalizedTool = normalizeToolName(toolName);
  const input = toolInput || {};
  const cwd = input.cwd || input.workdir || opts.cwd || PROJECT_ROOT;

  if (isCodexAppPluginTool(rawToolName) && !hasFreshContextPreflight(opts)) {
    return block('Codex app/plugin tool blocked until YURI xref/context preflight runs for this task');
  }

  if (isShellTool(normalizedTool)) {
    const command = input.command || input.cmd || '';
    if (!command) return allow();
    if (isYuriContextPreflightCommand(command)) markContextPreflight(cwd, opts);
    return evaluateShellCommand(command, cwd);
  }

  if (isReadTool(normalizedTool)) {
    const targets = toolTargetPaths(input);
    if (!targets.length && isImplicitCwdReadTool(normalizedTool)) targets.push('.');
    // Owner-authorized inspection may read protected surfaces. Write/edit tools and shell
    // mutation paths remain denied below; this branch is intentionally read-only.
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
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return block('invalid hook event: expected object');
  }
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
  const integrityHit = repoIntegrityCommandHit(command, {
    cwd,
    protectedPaths: PROTECTED_TARGETS.map((target) => target.path),
  });
  if (integrityHit) return block(integrityHit.reason);

  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.re.test(command)) return block(pattern.reason);
  }

  for (const targetPath of extractLikelyWriteTargets(command)) {
    const hit = protectedPathHit(targetPath, cwd);
    if (hit) return block(`write to protected target blocked: ${hit.label}`);
  }

  const protectedLiteral = protectedLiteralHit(command);
  if (protectedLiteral && isProtectedReadOnlyCommand(command)) return allow();
  if (protectedLiteral && MUTATING_COMMAND_RE.test(command)) {
    if (isAllowedProtectedReadForOffload(command, protectedLiteral.label)) return allow();
    return block(`mutation of protected target blocked: ${protectedLiteral.label}`);
  }
  // SEC-4: a protected literal under a plain READ command (cat/head/grep/etc, no mutating verb) must
  // ALSO deny — closes the read-only bypass (e.g. `cat ~/.aws/credentials`, `cat .env`) the original
  // gate left open by only checking MUTATING_COMMAND_RE. Same offload carve-out applies so the
  // existing `.env` DEEPSEEK_API_KEY hydration path (source/grep, no redirect) still degrades to allow.
  if (protectedLiteral && READ_COMMAND_RE.test(command)) {
    if (isAllowedProtectedReadForOffload(command, protectedLiteral.label)) return allow();
    return block(`read of protected target blocked: ${protectedLiteral.label}`);
  }

  return allow();
}

function isProtectedReadOnlyCommand(command) {
  const segments = String(command)
    .split(/&&|\|\||[;|]/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const protectedSegments = segments.filter((segment) => protectedLiteralHit(segment));
  if (!protectedSegments.length) return false;
  return protectedSegments.every((segment) => {
    if (/\s(?:>|>>|2>|&>)\s|\b(?:tee|rm|mv|cp|install|touch|mkdir|rmdir|truncate|dd|chmod|chown|xargs)\b|-(?:delete|exec|execdir|ok|okdir)\b/u.test(segment)) {
      return false;
    }
    return PROTECTED_READ_SEGMENT_RE.test(segment);
  });
}

function isAllowedProtectedReadForOffload(command, protectedLabel) {
  if (protectedLabel !== '.env') return false;

  const readsEnv =
    /\b(?:source|\.)\s+\.env\b/u.test(command) ||
    /\bgrep\b[^;&|]*\bDEEPSEEK_API_KEY\b[^;&|]*\s\.env\b/u.test(command);
  if (!readsEnv) return false;

  const invokesOffload =
    /\b(?:node\s+)?Scripts\/llm-lane\.mjs\b[^;&|]*\bdeepseek\b/u.test(command) ||
    /\b(?:node\s+)?Scripts\/offload-runner\.mjs\b[^;&|]*\bdeepseek-v4-(?:pro|flash)\b/u.test(command) ||
    /\bScripts\/llm-compat\.sh\b[^;&|]*--model\s+deepseek-v4-(?:pro|flash)\b/u.test(command) ||
    /\b(?:bash\s+)?\.codex\/deepseek-offload\.sh\b/u.test(command);
  if (!invokesOffload) return false;

  return !/\s(?:>|>>|2>|&>)\s*['"]?\.env(?:['"]?|\s|$)/u.test(command);
}

function isCodexAppPluginTool(toolName) {
  return String(toolName || '').startsWith('mcp__codex_apps__');
}

function isYuriContextPreflightCommand(command) {
  return /\bnode\s+_SYSTEM\/Scripts\/xref-query\.mjs\b/u.test(command) ||
    /\b_SYSTEM\/Scripts\/xref-query\.mjs\b/u.test(command) ||
    /\bnode\s+_SYSTEM\/Scripts\/propagation-scan\.mjs\b/u.test(command) ||
    /\b_SYSTEM\/Scripts\/propagation-scan\.mjs\b/u.test(command);
}

function hasFreshContextPreflight(opts = {}) {
  if (process.env.YURI_CODEX_CONTROL_PLANE_ROUTED === '1') return true;

  const stampPath = opts.routeStampPath || CONTEXT_PREFLIGHT_STAMP_PATH;
  if (!existsSync(stampPath)) return false;

  try {
    const stamp = JSON.parse(readFileSync(stampPath, 'utf8'));
    const routedAt = Date.parse(stamp.routedAt || '');
    if (!Number.isFinite(routedAt)) return false;
    const now = typeof opts.now === 'number' ? opts.now : Date.now();
    return now - routedAt <= CONTEXT_PREFLIGHT_STAMP_TTL_MS;
  } catch {
    return false;
  }
}

function markContextPreflight(cwd, opts = {}) {
  const stampPath = opts.routeStampPath || CONTEXT_PREFLIGHT_STAMP_PATH;
  mkdirSync(path.dirname(stampPath), { recursive: true });
  writeFileSync(stampPath, `${JSON.stringify({
    routedAt: new Date(typeof opts.now === 'number' ? opts.now : Date.now()).toISOString(),
    cwd: path.resolve(cwd || PROJECT_ROOT),
    source: 'codex-pre-tool-use:xref-context-preflight',
  }, null, 2)}\n`);
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

function isReadTool(toolName) {
  return [
    'read', 'read_file', 'readfile', 'read_text_file', 'readtextfile',
    'get_file', 'getfile', 'list_dir', 'listdir', 'list_directory', 'listdirectory',
    'grep', 'glob', 'search_files', 'searchfiles', 'view_image', 'viewimage',
  ].includes(toolName);
}

function isImplicitCwdReadTool(toolName) {
  return [
    'list_dir', 'listdir', 'list_directory', 'listdirectory',
    'grep', 'glob', 'search_files', 'searchfiles',
  ].includes(toolName);
}

function toolTargetPaths(input = {}) {
  const targets = [];
  for (const key of [
    'path', 'file_path', 'filePath', 'target_file', 'targetFile', 'target',
    'directory', 'dir', 'root', 'root_path', 'rootPath', 'notebook_path', 'notebookPath',
  ]) {
    if (typeof input[key] === 'string' && input[key]) targets.push(input[key]);
  }
  for (const key of ['paths', 'files', 'targets']) {
    if (!Array.isArray(input[key])) continue;
    for (const target of input[key]) if (typeof target === 'string' && target) targets.push(target);
  }
  return targets;
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

// SEC-1 (2026-07-06): minimal cross-language shim CLI so a non-Node caller (yuri-z-brain.py) can
// consult the SAME evaluateToolCall gate the fleet lanes use, instead of maintaining a separate
// inline denylist. Reads {toolName, toolInput, opts?} JSON from stdin (an explicit, narrow contract —
// deliberately NOT the hook-event alias shape runHookFromStdin expects, so the Python caller doesn't
// need to know Claude-Code/Codex hook-event field names). Exits 0 (allow) / 2 (deny), same convention
// as --check. Prints {allowed, decision, reason?} JSON on stdout for the caller to parse OR fall back
// to fail-closed-if-unparseable on the Python side. Additive: does not change any existing CLI path.
export async function runCheckToolFromStdin() {
  const raw = await readStdin();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    console.log(JSON.stringify(block('invalid --check-tool JSON on stdin')));
    process.exit(2);
    return;
  }
  const toolName = payload.toolName || payload.tool_name || '';
  const toolInput = payload.toolInput || payload.tool_input || {};
  const opts = payload.opts || {};
  let decision;
  try {
    decision = evaluateToolCall(toolName, toolInput, opts);
  } catch (e) {
    // Fail-closed: an evaluator crash must never be mistaken for an allow.
    console.log(JSON.stringify(block(`evaluator error: ${String(e && e.message || e)}`)));
    process.exit(2);
    return;
  }
  console.log(JSON.stringify(decision));
  process.exit(decision.allowed ? 0 : 2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--check-tool')) {
    runCheckToolFromStdin();
  } else {
    runHookFromStdin({ check: process.argv.includes('--check') });
  }
}
