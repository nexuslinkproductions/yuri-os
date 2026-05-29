'use strict';

// `deny: true` marks patterns that are catastrophic AND essentially never legitimate
// in this workspace — these hard-block at the PreToolUse layer. Everything else is
// surfaced as a visible advisory (verify-intent), since rm -rf / DROP TABLE / git
// force-push are common enough that a hard block would be friction, not safety, and
// Claude Code's own permission prompt already gates them. curl|bash is intentionally
// NOT denied here because bash-security-guard (earlier in the chain) already blocks it.
const PATTERNS = [
  // Destructive shell
  { re: /rm\s+-[rf]{1,2}\b/i,              severity: 'CRITICAL', msg: 'rm -rf detected' },
  { re: /rm\s+.*\*/,                        severity: 'HIGH',     msg: 'rm with glob wildcard' },
  { re: /git\s+push\s+.*--force/i,          severity: 'CRITICAL', msg: 'git force-push detected' },
  { re: /git\s+reset\s+--hard/i,            severity: 'HIGH',     msg: 'git reset --hard' },
  { re: /git\s+clean\s+-[fdxq]+f/i,         severity: 'HIGH',     msg: 'git clean -f' },
  { re: /git\s+branch\s+-D\b/i,             severity: 'HIGH',     msg: 'git branch -D (force delete)' },
  { re: /chmod\s+777/i,                     severity: 'WARN',     msg: 'chmod 777 detected' },
  { re: /chmod\s+a\+rwx/i,                  severity: 'WARN',     msg: 'chmod a+rwx detected' },
  { re: /\bdd\s+if=/i,                      severity: 'HIGH',     msg: 'dd if= (disk write)' },
  { re: /mkfs\./i,                          severity: 'CRITICAL', msg: 'filesystem format (mkfs)', deny: true },
  { re: /\btruncate\s+-s\s+0\b/i,           severity: 'HIGH',     msg: 'truncate to zero bytes' },
  { re: />\s*(\/dev\/sd[a-z]|\/dev\/nvme)/i, severity: 'CRITICAL', msg: 'raw disk write detected', deny: true },

  // SQL destructive
  { re: /DROP\s+TABLE\b/i,                  severity: 'CRITICAL', msg: 'DROP TABLE detected' },
  { re: /DROP\s+DATABASE\b/i,               severity: 'CRITICAL', msg: 'DROP DATABASE detected', deny: true },
  { re: /TRUNCATE\s+TABLE\b/i,              severity: 'HIGH',     msg: 'TRUNCATE TABLE detected' },
  { re: /DELETE\s+FROM\s+\w+\s*;/i,         severity: 'HIGH',     msg: 'DELETE without WHERE clause' },

  // Supply-chain / exec risk
  { re: /curl\s+.*\|\s*(?:bash|sh)\b/i,     severity: 'CRITICAL', msg: 'curl|bash pipe detected' },
  { re: /wget\s+.*\|\s*(?:bash|sh)\b/i,     severity: 'CRITICAL', msg: 'wget|sh pipe detected' },
  { re: /\beval\b.*\$\(/,                   severity: 'HIGH',     msg: 'eval with subshell expansion' },
  { re: /npx\s+--yes\b/i,                   severity: 'WARN',     msg: 'npx --yes (auto-install)' },

  // memory.db direct mutations (use kernel.py, not raw sqlite3)
  { re: /sqlite3.*memory\.db.*(DELETE|DROP|UPDATE|INSERT)/i, severity: 'HIGH', msg: 'direct sqlite3 memory.db mutation (use kernel.py)' },

  // Credential leak risk
  { re: /\bcat\b.*\/(\.env|id_rsa|\.ssh|credentials)/i, severity: 'HIGH', msg: 'potential credential file read' },
];

function check(toolName, toolInput) {
  let target = '';

  if (toolName === 'Bash') {
    target = toolInput.command || '';
  } else if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
    target = [
      toolInput.file_path || '',
      toolInput.path || '',
      toolInput.new_string || '',
      toolInput.content || '',
    ].join(' ');
  } else {
    target = JSON.stringify(toolInput || {});
  }

  for (const { re, severity, msg, deny } of PATTERNS) {
    if (re.test(target)) {
      return { hit: true, severity, msg, deny: Boolean(deny), target: target.slice(0, 120) };
    }
  }
  return { hit: false };
}

module.exports = { check, PATTERNS };

// ── PreToolUse executor ───────────────────────────────────────────────────
// As a hook (`node yuri-risk-lite.js`): read the tool event from stdin and, for
// Bash commands only, DENY the catastrophic-and-never-legitimate patterns
// (mkfs / raw-disk write / DROP DATABASE) and surface everything else as a
// visible advisory. Write CONTENT is intentionally not gated here (so legit SQL
// or file authoring is never blocked). When require()'d as a module by
// scout-orchestrator this block does not run (require.main !== module).
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    let input;
    try { input = JSON.parse(raw); } catch { process.exit(0); return; }
    if (!input || input.tool_name !== 'Bash') { process.exit(0); return; }
    const result = check('Bash', input.tool_input || {});
    if (!result.hit) { process.exit(0); return; }
    if (result.deny) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `YURI_RISK_LITE: ${result.severity} — ${result.msg}. Catastrophic and almost never legitimate; run it yourself if truly intended.`,
        },
      }) + '\n');
    } else {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: `⚠ yuri-risk-lite [${result.severity}]: ${result.msg} — verify intent before proceeding.`,
        },
      }) + '\n');
    }
    process.exit(0);
  });
}
