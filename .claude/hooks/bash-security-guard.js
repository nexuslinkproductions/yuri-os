#!/usr/bin/env node
'use strict';

const LIVE_BLOCK_SENTINEL = 'echo __bash_security_guard_live_block_test__';

function isSentinelCommand(cmd) {
  return cmd.trim() === LIVE_BLOCK_SENTINEL;
}

const BLOCKED_CLAUDE_FILES = new Set([
  '.claude/history.jsonl',
  '.claude/memory-bus.json',
  '.claude/settings.local.json',
  '.claude/state/session-state.json',
  '.claude/state/scout-bus.json',
  '.claude/state/scout-errors.log',
  '.claude/state/token-session.json',
]);

const READ_CMDS = new Set(['cat', 'head', 'tail', 'less', 'more', 'bat', 'nl', 'view']);

function toks(cmd) {
  return cmd.trim().split(/\s+/);
}

function unquote(s) {
  if (s.length >= 2 &&
      ((s[0] === '"' && s[s.length - 1] === '"') ||
       (s[0] === "'" && s[s.length - 1] === "'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function isEnvTarget(tok) {
  const s = unquote(tok);
  return s === '.env' || s === './.env';
}

function isBlockedEnvRead(cmd) {
  const parts = toks(cmd);
  const first = parts[0];
  if (READ_CMDS.has(first)) {
    for (let i = 1; i < parts.length; i++) {
      if (isEnvTarget(parts[i])) return true;
    }
    return false;
  }
  if (first === 'grep') {
    for (let i = 1; i < parts.length; i++) {
      if (!parts[i].startsWith('-') && isEnvTarget(parts[i])) return true;
    }
    return false;
  }
  return false;
}

function isBlockedSensitiveClaudeRead(cmd) {
  const parts = toks(cmd);
  const first = parts[0];
  if (READ_CMDS.has(first)) {
    for (let i = 1; i < parts.length; i++) {
      if (BLOCKED_CLAUDE_FILES.has(unquote(parts[i]))) return true;
    }
    return false;
  }
  if (first === 'grep') {
    for (let i = 1; i < parts.length; i++) {
      if (!parts[i].startsWith('-') && BLOCKED_CLAUDE_FILES.has(unquote(parts[i]))) return true;
    }
    return false;
  }
  return false;
}

function isBlockedEnvWrite(cmd) {
  return /(>)\s*(\.\/)?\.env(\s|$)/.test(cmd) && !/(>)\s*(\.\/)?\.env\./.test(cmd);
}

function isBlockedEnvMutate(cmd) {
  const parts = toks(cmd);
  const first = parts[0];
  if (first === 'tee') {
    for (let i = 1; i < parts.length; i++) {
      if (!parts[i].startsWith('-') && isEnvTarget(parts[i])) return true;
    }
  }
  if (first === 'sed') {
    const last = unquote(parts[parts.length - 1]);
    if (last === '.env' || last === './.env') return true;
  }
  return false;
}

function isBlockedEnvRemove(cmd) {
  const parts = toks(cmd);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'rm') {
      for (let j = i + 1; j < parts.length; j++) {
        if (isEnvTarget(parts[j])) return true;
      }
    }
  }
  return false;
}

function isBlockedClaudeFileWrite(cmd) {
  const parts = toks(cmd);
  if (parts[0] === 'tee') {
    for (let i = 1; i < parts.length; i++) {
      if (!parts[i].startsWith('-') && BLOCKED_CLAUDE_FILES.has(unquote(parts[i]))) return true;
    }
  }
  for (const f of BLOCKED_CLAUDE_FILES) {
    const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`>\\s*${escaped}(\\s|$)`).test(cmd)) return true;
  }
  return false;
}

function isBlockedClaudeRemove(cmd) {
  const parts = toks(cmd);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'rm') {
      for (let j = i + 1; j < parts.length; j++) {
        const t = unquote(parts[j]);
        if (t === '.claude' || t === '.claude/' || t.startsWith('.claude/') ||
            t === '~/.claude' || t === '$HOME/.claude') return true;
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
        const t = unquote(parts[j]);
        if (t === '.claude' || t === '.claude/') return true;
      }
    }
  }
  return false;
}

function isBlockedGitRm(cmd) {
  const parts = toks(cmd);
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'git' && parts[i + 1] === 'rm') {
      for (let j = i + 2; j < parts.length; j++) {
        const t = unquote(parts[j]);
        if (t === '.claude' || t === '.claude/' || t.startsWith('.claude/')) return true;
      }
    }
  }
  return false;
}

function isBlockedInner(cmd) {
  return isBlockedEnvRead(cmd) || isBlockedSensitiveClaudeRead(cmd) ||
    isBlockedEnvWrite(cmd) || isBlockedEnvMutate(cmd) || isBlockedEnvRemove(cmd) ||
    isBlockedClaudeFileWrite(cmd) || isBlockedClaudeRemove(cmd) ||
    isBlockedBroadGitAdd(cmd) || isBlockedGitRm(cmd);
}

// Matches bash/sh/zsh/ksh/dash with -c or combined flags like -lc, -ic
function extractShellWrapper(cmd) {
  if (!/^(?:bash|sh|zsh|ksh|dash)\b/.test(cmd)) return null;
  const m = cmd.match(/-[a-zA-Z]*c\s+["']([^"']+)["']/);
  return m ? m[1] : null;
}

function isBlockedShellWrapper(cmd) {
  const inner = extractShellWrapper(cmd);
  return inner ? isBlockedInner(inner) : false;
}

function inspectCommand(cmd) {
  if (isSentinelCommand(cmd))
    return { type: 'block', reason: 'SECURITY_GUARD live block sentinel.' };
  if (isBlockedEnvRead(cmd))
    return { type: 'block', reason: 'Reading .env is blocked.' };
  if (isBlockedSensitiveClaudeRead(cmd))
    return { type: 'block', reason: 'Reading sensitive .claude file is blocked.' };
  if (isBlockedEnvWrite(cmd))
    return { type: 'block', reason: 'Writing to .env is blocked.' };
  if (isBlockedEnvMutate(cmd))
    return { type: 'block', reason: 'Mutating .env is blocked.' };
  if (isBlockedEnvRemove(cmd))
    return { type: 'block', reason: 'Removing .env is blocked.' };
  if (isBlockedClaudeFileWrite(cmd))
    return { type: 'block', reason: 'Writing to sensitive .claude file is blocked.' };
  if (isBlockedClaudeRemove(cmd))
    return { type: 'block', reason: 'Destructive operation targeting .claude is blocked.' };
  if (isBlockedBroadGitAdd(cmd))
    return { type: 'block', reason: 'Broad git add targeting .claude is blocked.' };
  if (isBlockedGitRm(cmd))
    return { type: 'block', reason: 'git rm targeting .claude is blocked.' };
  if (isBlockedShellWrapper(cmd))
    return { type: 'block', reason: 'Shell wrapper contains a blocked command.' };

  const parts = toks(cmd);
  const first = parts[0];

  if (first === 'env' || first === 'printenv')
    return { type: 'advisory', message: 'Command exposes environment variables.' };

  const inner = extractShellWrapper(cmd);
  if (inner !== null)
    return { type: 'advisory', message: 'Inline shell execution; verify intent.' };

  if ((first === 'python3' || first === 'python') && parts.includes('-c'))
    return { type: 'advisory', message: 'Inline python -c execution detected.' };
  if (first === 'node' && parts.includes('-e'))
    return { type: 'advisory', message: 'Inline node -e execution detected.' };

  if (first === 'curl' || first === 'wget')
    return { type: 'advisory', message: 'Network fetch command detected.' };

  if ((first === 'npm' && (parts[1] === 'install' || parts[1] === 'update')) ||
      (first === 'yarn' && parts[1] === 'add') ||
      (first === 'pnpm' && parts[1] === 'add') ||
      (first === 'pip' && parts[1] === 'install'))
    return { type: 'advisory', message: 'Package install command detected.' };

  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'git') {
      if (parts[i + 1] === 'add') {
        for (let j = i + 2; j < parts.length; j++) {
          if (parts[j] === '.' || parts[j] === '-A')
            return { type: 'advisory', message: 'git add . or git add -A stages all changes; verify scope.' };
        }
      }
      if (parts[i + 1] === 'clean')
        return { type: 'advisory', message: 'git clean is destructive; verify intent.' };
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

  function emitDeny(reason) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }) + '\n');
  }

  function emitAdvisory(message) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: message,
      },
    }) + '\n');
  }

  const result = inspectCommand(cmd);
  if (result === null) {
    process.exit(0);
  } else if (result.type === 'block') {
    emitDeny(result.reason);
    process.exit(0);
  } else if (result.type === 'advisory') {
    emitAdvisory(result.message);
    process.exit(0);
  }
});
