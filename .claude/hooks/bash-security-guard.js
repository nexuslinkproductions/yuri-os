#!/usr/bin/env node
'use strict';

const path = require('path');

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

// wave-3 G.1 (D-G1): settings.json is the hook REGISTRY — a bash write can delete
// every guard registration, so writes are blocked (single-operator machine, no role gate).
// WRITE-only: reads of the registry stay free — settings.json is config, not a secret,
// and the blanket BLOCKED_CLAUDE_FILES set also drives the sensitive-READ block.
const BLOCKED_CLAUDE_WRITE_FILES = new Set([
  ...BLOCKED_CLAUDE_FILES,
  '.claude/settings.json',
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

// Strip a leading ./ (or ././…) so a './.claude/...'-style token cannot dodge the literal/prefix
// protected checks below. This is the C3 ./-prefix bypass class (verified live at the bash gate by the
// protected-path consolidation lane, 2026-06-06): `'./.claude/state'.startsWith('.claude/')` is false.
function normTok(s) { return String(s).replace(/^(?:\.\/)+/, ''); }

function isEnvTarget(tok) {
  const s = unquote(tok);
  return s === '.env' || s === './.env';
}

// REPO_ROOT-anchored .env mirror exemption (owner-scoped).
// Allows `cp` / `mv` of a .env file from one location inside the repo to another,
// e.g. backend/.env → _SYSTEM/backend/.env after a folder restructure.
// Both source and destination MUST:
//   - end in `.env` (exact basename)
//   - resolve under <YURI_ROOT>/
// Read/write/mutate/remove of .env remain blocked outside this exemption.
const REPO_ROOT_PREFIX = (process.env.YURI_ROOT || path.resolve(__dirname, '..', '..')) + '/';
function isPathInsideRepo(p) {
  const s = unquote(p);
  return s.startsWith(REPO_ROOT_PREFIX) && !s.includes('/..');
}
function endsWithDotEnv(p) {
  const s = unquote(p);
  return s === '.env' || s.endsWith('/.env');
}
function isAllowedEnvMirror(cmd) {
  const parts = toks(cmd);
  if (parts.length !== 3) return false;
  const op = parts[0];
  if (op !== 'cp' && op !== 'mv') return false;
  const src = parts[1];
  const dst = parts[2];
  if (!endsWithDotEnv(src) || !endsWithDotEnv(dst)) return false;
  if (!isPathInsideRepo(src) || !isPathInsideRepo(dst)) return false;
  return true;
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
      if (!parts[i].startsWith('-') && BLOCKED_CLAUDE_WRITE_FILES.has(unquote(parts[i]))) return true;
    }
  }
  for (const f of BLOCKED_CLAUDE_WRITE_FILES) {
    const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`>\\s*${escaped}(\\s|$)`).test(cmd)) return true;
  }
  return false;
}

// A `.claude/...` rm target that is clearly a SCRATCH artifact, not live config:
//   - a recognized scratch suffix (.orig/.bak/.old/.tmp/.rej/.swp/trailing ~), OR
//   - a path that does NOT exist on disk AND does not realpath onto a protected role
//     file/dir (a superstring/typo of a real name, e.g. operator-guardian.js when the
//     real artifact is operator-guard / operator-write-guard.js).
// Removing one's own scratch copy is normal cleanup; destroying live .claude config is not.
// Dir-root removals (.claude, .claude/, ~/.claude) and real existing files stay blocked.
const SCRATCH_SUFFIX_RE = /(?:\.orig|\.bak|\.old|\.tmp|\.rej|\.swp|~)$/;
function isClaudeScratchArtifact(t) {
  if (t === '.claude' || t === '.claude/' || t === '~/.claude' || t === '$HOME/.claude') return false;
  if (t.endsWith('/')) return false; // a directory removal, not a single scratch file
  // A glob / brace can expand onto LIVE files at shell time (e.g. tirith-url-guard.*),
  // so the literal token's non-existence proves nothing -> never exempt a wildcard.
  if (/[*?\[\]{}]/.test(t)) return false;
  if (SCRATCH_SUFFIX_RE.test(t)) return true;
  // Non-existent + not a protected role file -> a typo/superstring artifact, safe to clean.
  const abs = path.isAbsolute(t) ? path.resolve(t) : path.resolve(REPO_ROOT_ABS, t);
  let exists = true;
  try { exists = require('fs').existsSync(abs); } catch { exists = true; }
  if (!exists && !absHitsProtected(abs)) return true;
  return false;
}

function isBlockedClaudeRemove(cmd) {
  const parts = toks(cmd);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'rm') {
      for (let j = i + 1; j < parts.length; j++) {
        const t = normTok(unquote(parts[j]));
        if (t === '.claude' || t === '.claude/' || t.startsWith('.claude/') ||
            t === '~/.claude' || t === '$HOME/.claude') {
          if (isClaudeScratchArtifact(t)) continue; // scratch cleanup, not destruction
          return true;
        }
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
        const t = normTok(unquote(parts[j]));
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
        const t = normTok(unquote(parts[j]));
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

function isDownloadExecuteChain(cmd) {
  return /\b(curl|wget)\b[^|]*\|\s*(sudo\s+|env\s+)?(bash|sh|zsh|ksh|dash|python3?|node)\b/.test(cmd);
}

// A pipeline ending in a BARE shell interpreter (`| sh` / `| bash` / `| zsh` /
// `| ksh` / `| dash`, optionally via `sudo`/`env`, with trailing flags like `-s --`)
// where an UPSTREAM stage is an OPAQUE decoder or fetcher. Same risk class as the
// already-blocked curl|wget|sh: the bytes the shell runs are not auditable from the
// command line, so decode-then-exec is treated as a blocked chain regardless of the
// obfuscation layer (base64 -d / xxd -r / openssl enc -d / printf-of-hex / curl / wget).
//
// Deliberately NOT triggered by a transparent local source: `cat script.sh | bash`
// and `printf "echo ok" | bash` stay allowed — `cat` and plain-text `printf` are not
// opaque. Only the obfuscation/fetch decoders below arm the block.
function isDecodeExecuteChain(cmd) {
  // Terminal stage must be a bare shell interpreter (NOT python/node here — that is
  // the curl|wget download-exec surface; this is specifically the decode-pipe-to-shell
  // class). Allow optional sudo/env prefix and trailing interpreter flags.
  // NOTE: decode-pipe to a NON-shell interpreter (python/perl/node/ruby) is handled by
  // the coworker role gate (isDecodeExecToInterpreter), not globally — so a benign
  // non-role `echo data | base64 -d | python3` is NOT over-blocked, while the same
  // chain feeding a role-file mutation DENIES (H2). Keeping shells global preserves the
  // existing HI-12 contract + matrix/smoke expectations.
  const endsInShell = /\|\s*(?:sudo\s+|env\s+(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*)*(?:bash|sh|zsh|ksh|dash)\b[^|]*$/.test(cmd);
  if (!endsInShell) return false;
  // An upstream stage is an opaque decoder/fetcher.
  const hasOpaqueSource =
    /\bbase64\b[^|]*(?:\s-d\b|\s-D\b|\s--decode\b)/.test(cmd) ||      // base64 decode (GNU -d, BSD -D, --decode)
    /\bbase32\b[^|]*(?:\s-d\b|\s--decode\b)/.test(cmd) ||             // base32 decode
    /\bxxd\b[^|]*\s-r\b/.test(cmd) ||                                 // xxd reverse (hex -> bytes)
    /\bopenssl\b[^|]*\benc\b[^|]*\s-d\b/.test(cmd) ||                 // openssl enc -d (decrypt/decode)
    /\bopenssl\b[^|]*\bbase64\b[^|]*\s-d\b/.test(cmd) ||              // openssl base64 -d
    /\bprintf\b[^|]*(?:\\x[0-9a-fA-F]|\\[0-7]{1,3}|%b)/.test(cmd) ||  // printf of hex/octal/%b escapes (obfuscated)
    /\b(?:gzip|gunzip|zcat|bzip2|bunzip2|xz|unxz|zstd)\b[^|]*\s-d?c?\b/.test(cmd) || // decompress-to-stdout
    /\b(?:gunzip|zcat|bunzip2|unxz)\b/.test(cmd) ||                   // bare decompressors (stdout by default in a pipe)
    /\b(?:tr|rev|uudecode)\b/.test(cmd) ||                            // byte-transform / uudecode obfuscators
    /\b(?:curl|wget)\b/.test(cmd);                                    // fetch-then-decode-then-exec
  return hasOpaqueSource;
}

// Matches bash/sh/zsh/ksh/dash with -c or combined flags like -lc, -ic
function extractShellWrapper(cmd) {
  if (!/^(?:bash|sh|zsh|ksh|dash)\b/.test(cmd)) return null;
  const m = cmd.match(/-[a-zA-Z]*c\s+["']([^"']+)["']/);
  return m ? m[1] : null;
}

function isBlockedShellWrapper(cmd) {
  const inner = extractShellWrapper(cmd);
  if (!inner) return false;
  return isBlockedInner(inner) || isDownloadExecuteChain(inner) ||
    isDecodeExecuteChain(inner);
}

// ROLES REMOVED (owner directive 2026-06-20, cleanup completed): the dev/coworker
// role system and its enforcement machinery (activeRole, isBlockedForCoworker,
// isRolePathMutation, the ROLE_TRUST_SURFACES-derived path/basename tables) were
// deleted as confirmed-dead code — this is a single-operator machine and the role
// gate could never fire (see commit 54f7fd54 + the follow-up cleanup that removed
// this block). Enforcement now lives solely in the .env hard-block below, plus the
// deterministic PreToolUse hooks and settings.json deny-list described in the
// IRREDUCIBLE RESIDUAL note that used to live here.

// Ungoverned nano-swarm spawn bypass (Move-1b D3). A lane must spawn ONLY through the governed spawn_nano
// tool (depth/fan-out/budget/cost caps). Running nano-external / nano-tick as a RAW process from a lane's
// bash skips all governance, so deny it. --dry (routing proof) is allowed. Matches the `bash -c "..."`
// wrapped form too — the node...nano-external substring survives the wrapper. The soft mechanism guard
// (governedFireDecision in nano-external.mjs) is the cooperative layer; this is the lane-proof hard stop.
function isBlockedUngovernedNanoSpawn(cmd) {
  const c = String(cmd || '');
  if (!/\bnode\b[^|;&]*\bnano-(?:external|tick)\.mjs\b/.test(c)) return false;
  if (/\s--dry(?:\s|$)/.test(c)) return false; // routing proof, no fire
  return true;
}
function inspectCommand(cmd) {
  if (isSentinelCommand(cmd))
    return { type: 'block', reason: 'SECURITY_GUARD live block sentinel.' };
  // ROLES REMOVED (owner directive 2026-06-20): no dev/coworker gate. Flat policy —
  // HARD BLOCK only .env secret access; the .claude-config + download/decode-exec rules
  // the owner found too strict are now ADVISORY (warn, never block). isBlockedForCoworker /
  // isRolePathMutation / activeRole are no longer called (dead code, safe to delete later).
  if (isBlockedUngovernedNanoSpawn(cmd))
    return { type: 'block', reason: 'Ungoverned nano spawn — route through the governed spawn_nano tool (depth/fan-out/budget/cost caps), not raw nano-external/nano-tick.' };
  // Intra-repo .env mirror exemption (cp/mv between repo paths).
  if (isAllowedEnvMirror(cmd))
    return { type: 'advisory', message: 'Intra-repo .env mirror allowed.' };
  // ── HARD BLOCK: .env secret read / write / mutate / remove (the one rail kept) ──
  if (isBlockedEnvRead(cmd))
    return { type: 'block', reason: 'Reading .env (secrets) is blocked.' };
  if (isBlockedEnvWrite(cmd))
    return { type: 'block', reason: 'Writing to .env is blocked.' };
  if (isBlockedEnvMutate(cmd))
    return { type: 'block', reason: 'Mutating .env is blocked.' };
  if (isBlockedEnvRemove(cmd))
    return { type: 'block', reason: 'Removing .env is blocked.' };
  // .env hidden inside a shell wrapper (bash -c "cat .env") still hard-blocks.
  {
    const innerEnv = extractShellWrapper(cmd);
    if (innerEnv && (isBlockedEnvRead(innerEnv) || isBlockedEnvWrite(innerEnv) ||
        isBlockedEnvMutate(innerEnv) || isBlockedEnvRemove(innerEnv)))
      return { type: 'block', reason: '.env (secrets) access inside a shell wrapper is blocked.' };
  }
  // ── WARN-ONLY (owner relaxed): .claude config ops + download/decode-exec chains ──
  if (isBlockedSensitiveClaudeRead(cmd))
    return { type: 'advisory', message: 'Heads-up: reading a sensitive .claude file.' };
  if (isBlockedClaudeFileWrite(cmd))
    return { type: 'advisory', message: 'Heads-up: writing a .claude config file (use the Edit tool for hook-safety).' };
  if (isBlockedClaudeRemove(cmd))
    return { type: 'advisory', message: 'Heads-up: removing .claude config (git-recoverable).' };
  if (isBlockedBroadGitAdd(cmd))
    return { type: 'advisory', message: 'Heads-up: broad git add of .claude — verify scope.' };
  if (isBlockedGitRm(cmd))
    return { type: 'advisory', message: 'Heads-up: git rm of .claude.' };
  if (isDownloadExecuteChain(cmd))
    return { type: 'advisory', message: 'Heads-up: download-and-execute (curl|bash) chain — verify the source.' };
  if (isDecodeExecuteChain(cmd))
    return { type: 'advisory', message: 'Heads-up: decode-and-execute pipe chain — verify the payload.' };

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


function appendAuditLog(entry) {
  try {
    const os = require('os');
    require('fs').appendFileSync(os.homedir() + '/.yuri-audit.log', JSON.stringify(entry) + '\n');
  } catch (_) {}
}
  function emitDeny(reason) {
    try {
      const sid = process.env.CLAUDE_SESSION_ID || '';
      if (sid && require('fs').existsSync('/tmp/yuri-session-packet-' + sid + '.json')) {
        const plan = JSON.parse(require('fs').readFileSync('/tmp/yuri-session-packet-' + sid + '.json','utf8')).pulse_plan || {};
        appendAuditLog({ ts: new Date().toISOString(), session_id: sid, entry_point: 'claude',
          tool: 'Bash', violation: String(reason).slice(0,80), blocked: true, tier: plan.complexityTier || 'unknown' });
      }
    } catch (_) {}
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
