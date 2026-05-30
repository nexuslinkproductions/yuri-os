#!/usr/bin/env node
'use strict';

/**
 * operator-write-guard.js — tool-agnostic PreToolUse guard on the YURI
 * role/credential/guard trust surface.
 *
 * WHY (hardening 2026-05-30, finding #2 / CRIT):
 *   bash-security-guard.js only inspects `Bash` commands. The Write / Edit /
 *   NotebookEdit tools bypass it entirely, so a `coworker`-role operator could
 *   `Write '{}'` over dev-credential.json (or Edit a guard file to neuter it).
 *   Finding #1 already made resolveRole() fail CLOSED on a tampered cred, so the
 *   one-write self-escalation is closed — this guard is defense-in-depth: deny
 *   the mutation outright, for every file-mutating tool, before it lands.
 *
 * MODEL: coworker-only, mirroring bash-security-guard.js. The `dev` role (owner
 *   holding the passphrase) is never restricted — fail CLOSED means a broken or
 *   tampered role system resolves to `coworker` (more restricted), never `dev`.
 *
 * CommonJS so it composes with the other .js PreToolUse hooks. Registered under
 * the all-tools ("") PreToolUse matcher in .claude/settings.json; it filters to
 * the file-mutating tools internally and exits silently for everything else.
 */

const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OPERATOR_MODULE = path.resolve(REPO_ROOT, '_SYSTEM', 'Scripts', 'yuri-operator.cjs');
const CRED_FILE_PATH = path.resolve(REPO_ROOT, '_SYSTEM', 'SELF', 'dev-credential.json');

// File-mutating tools this guard is responsible for (tool-agnostic by design).
const MUTATING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// Protected surface (owner-approved scope 2026-05-30: FULL security-hook surface).
//   Trust roots — role resolver + credential hash.
//   Enforcement guards — every PreToolUse hook whose job is enforcement, so a
//     coworker cannot Edit one guard to neuter it (mirrors+supersets the
//     bash-security-guard.js PROTECTED_ROLE_PATHS list; parity asserted by the
//     test). Includes this guard itself (else it could be edited away).
// Operational hooks that legitimately get iterated (token-budget, risk-lite,
// pre-tool-use, energy-tick, …) are intentionally NOT listed.
const PROTECTED_ROLE_FILES = [
  // trust roots
  '_SYSTEM/Scripts/yuri-operator.cjs',
  '_SYSTEM/SELF/dev-credential.json',
  // enforcement guards
  '.claude/hooks/bash-security-guard.js',
  '.claude/hooks/operator-write-guard.js',
  '.claude/hooks/claude-protocol-guard.js',
  '.claude/hooks/claude-protocol-guard.mjs',
  '.claude/hooks/agent-spawn-guard.js',
  '.claude/hooks/pre-tool-gate.js',
  '.claude/hooks/musubi-protocol-enforce.js',
  '.claude/hooks/tirith-url-guard.js',
].map((p) => path.resolve(REPO_ROOT, p));

// Directory-prefix protections (forward-looking; entry may not exist yet).
const PROTECTED_ROLE_DIRS = [
  '.claude/hooks/operator-guard',
].map((p) => path.resolve(REPO_ROOT, p));

// ── role resolution (fail-closed, mirrors bash-security-guard.js) ─────────────
let _roleCache = null;
function activeRole() {
  if (_roleCache) return _roleCache;
  try {
    _roleCache = require(OPERATOR_MODULE).resolveRole();
  } catch {
    // Module broken but a cred file exists -> the system WAS installed -> treat
    // as coworker (tamper). No module and no cred -> not installed -> dev.
    try { _roleCache = fs.existsSync(CRED_FILE_PATH) ? 'coworker' : 'dev'; }
    catch { _roleCache = 'dev'; }
  }
  return _roleCache;
}

// ── pure inspection (role injected, so it is unit-testable without env setup) ─
function resolveTargetPath(toolName, toolInput) {
  if (!toolInput) return null;
  if (toolName === 'NotebookEdit') return toolInput.notebook_path || null;
  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
    return toolInput.file_path || null;
  }
  return null;
}

function toAbs(rawPath) {
  if (typeof rawPath !== 'string' || rawPath === '') return null;
  return path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(REPO_ROOT, rawPath);
}

function isProtectedTarget(absPath) {
  if (!absPath) return false;
  // Case-INSENSITIVE compare: on macOS/APFS (and other case-insensitive volumes)
  // `Dev-Credential.json` and `dev-credential.json` are the SAME file, so a
  // case-sensitive `===` is a trivial bypass. Fail closed -> normalize case.
  const cand = absPath.toLowerCase();
  if (PROTECTED_ROLE_FILES.some((p) => p.toLowerCase() === cand)) return true;
  for (const dir of PROTECTED_ROLE_DIRS) {
    const d = dir.toLowerCase();
    if (cand === d || cand.startsWith(d + path.sep)) return true;
  }
  return false;
}

// Returns a deny reason string, or null to allow.
function inspectMutation(toolName, toolInput, role) {
  if (role !== 'coworker') return null;        // dev (owner) unrestricted
  if (!MUTATING_TOOLS.has(toolName)) return null;
  const abs = toAbs(resolveTargetPath(toolName, toolInput));
  if (!isProtectedTarget(abs)) return null;
  return 'Read-only operator (coworker): modifying the YURI guard/role/credential system is blocked.';
}

// ── hook driver ──────────────────────────────────────────────────────────────
function appendAuditLog(entry) {
  try {
    const os = require('os');
    fs.appendFileSync(os.homedir() + '/.yuri-audit.log', JSON.stringify(entry) + '\n');
  } catch (_) {}
}

function emitDeny(reason, toolName) {
  appendAuditLog({
    ts: new Date().toISOString(),
    entry_point: 'claude',
    guard: 'operator-write-guard',
    tool: toolName,
    violation: String(reason).slice(0, 80),
    blocked: true,
  });
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }) + '\n');
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    let input;
    try { input = JSON.parse(raw); } catch { process.exit(0); }
    if (!input || !input.tool_name) process.exit(0);
    const reason = inspectMutation(input.tool_name, input.tool_input || {}, activeRole());
    if (reason) emitDeny(reason, input.tool_name);
    process.exit(0);
  });
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    REPO_ROOT,
    PROTECTED_ROLE_FILES,
    PROTECTED_ROLE_DIRS,
    MUTATING_TOOLS,
    resolveTargetPath,
    toAbs,
    isProtectedTarget,
    inspectMutation,
  };
}
