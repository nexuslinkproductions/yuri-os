#!/usr/bin/env node
'use strict';

const BLOCKED_CLAUDE_FILES = new Set([
  '.claude/history.jsonl',
  '.claude/memory-bus.json',
  '.claude/settings.local.json',
  '.claude/state/session-state.json',
  '.claude/state/scout-bus.json',
  '.claude/state/scout-errors.log',
  '.claude/state/token-session.json',
]);

function toks(cmd) {
  return cmd.trim().split(/\s+/);
}

function isBlockedEnvRead(cmd) {
  const parts = toks(cmd);
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'cat') {
      const arg = parts[i + 1];
      if (arg === '.env' || arg === './.env') return true;
    }
  }
  return false;
}

function isBlockedSensitiveClaudeRead(cmd) {
  const parts = toks(cmd);
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'cat' && BLOCKED_CLAUDE_FILES.has(parts[i + 1])) return true;
  }
  return false;
}

function isBlockedEnvWrite(cmd) {
  // match redirect > .env (exact), not > .env.something
  return /(>)\s*(\.\/)?\.env(\s|$)/.test(cmd) && !/(>)\s*(\.\/)?\.env\./.test(cmd);
}

function isBlockedDestructive(cmd) {
  const parts = toks(cmd);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'rm') {
      for (let j = i + 1; j < parts.length; j++) {
        if (parts[j] === '.claude') return true;
      }
    }
  }
  return false;
}

function isBlockedBroadGitAdd(cmd) {
  const parts = toks(cmd);
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'git' && parts[i + 1] === 'add') {
      for (let j = i + 2; j < parts.length; j++) {
        if (parts[j] === '.claude') return true;
      }
    }
  }
  return false;
}

function isBlockedBashCInner(cmd) {
  return isBlockedEnvRead(cmd) || isBlockedSensitiveClaudeRead(cmd) ||
    isBlockedEnvWrite(cmd) || isBlockedDestructive(cmd) || isBlockedBroadGitAdd(cmd);
}

function isBlockedBashCWrapper(cmd) {
  const m = cmd.match(/\bbash\s+-c\s+["']([^"']+)["']/);
  return m ? isBlockedBashCInner(m[1]) : false;
}

function inspectCommand(cmd) {
  if (isBlockedEnvRead(cmd))
    return { type: 'block', reason: 'Reading .env is blocked.' };
  if (isBlockedSensitiveClaudeRead(cmd))
    return { type: 'block', reason: 'Reading sensitive .claude file is blocked.' };
  if (isBlockedEnvWrite(cmd))
    return { type: 'block', reason: 'Writing to .env is blocked.' };
  if (isBlockedDestructive(cmd))
    return { type: 'block', reason: 'Destructive operation targeting .claude is blocked.' };
  if (isBlockedBroadGitAdd(cmd))
    return { type: 'block', reason: 'Broad git add targeting .claude is blocked.' };
  if (isBlockedBashCWrapper(cmd))
    return { type: 'block', reason: 'bash -c wraps a blocked command.' };

  const parts = toks(cmd);
  const first = parts[0];

  if (first === 'env' || first === 'printenv')
    return { type: 'advisory', message: 'Command exposes environment variables.' };
  if (/\bbash\s+-c\b/.test(cmd))
    return { type: 'advisory', message: 'bash -c inline execution; verify intent.' };
  if ((first === 'python3' || first === 'python') && parts.includes('-c'))
    return { type: 'advisory', message: 'Inline python -c execution detected.' };
  if (first === 'node' && parts.includes('-e'))
    return { type: 'advisory', message: 'Inline node -e execution detected.' };

  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'git' && parts[i + 1] === 'add') {
      for (let j = i + 2; j < parts.length; j++) {
        if (parts[j] === '.') return { type: 'advisory', message: 'git add . stages all changes; verify scope.' };
      }
    }
  }
  if (/\bgit\s+reset\s+--hard\b/.test(cmd))
    return { type: 'advisory', message: 'git reset --hard is destructive; verify intent.' };

  return null;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  if (!input || input.tool_name !== 'Bash') process.exit(0);

  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (!cmd) process.exit(0);

  const result = inspectCommand(cmd);
  if (result === null) {
    process.exit(0);
  } else if (result.type === 'block') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        permissionDecision: 'deny',
        permissionDecisionReason: result.reason,
      },
    }) + '\n');
    process.exit(0);
  } else if (result.type === 'advisory') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        additionalContext: result.message,
      },
    }) + '\n');
    process.exit(0);
  }
});
