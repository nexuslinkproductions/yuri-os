'use strict';

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
  { re: /mkfs\./i,                          severity: 'CRITICAL', msg: 'filesystem format (mkfs)' },
  { re: /\btruncate\s+-s\s+0\b/i,           severity: 'HIGH',     msg: 'truncate to zero bytes' },
  { re: />(\/dev\/sda|\/dev\/nvme)/i,       severity: 'CRITICAL', msg: 'raw disk write detected' },

  // T7 path violations (from local_execution.md — T7 is read-only sync source)
  { re: /\/Volumes\/T7\//,                  severity: 'HIGH',     msg: 'T7 drive path accessed' },

  // SQL destructive
  { re: /DROP\s+TABLE\b/i,                  severity: 'CRITICAL', msg: 'DROP TABLE detected' },
  { re: /DROP\s+DATABASE\b/i,               severity: 'CRITICAL', msg: 'DROP DATABASE detected' },
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

  for (const { re, severity, msg } of PATTERNS) {
    if (re.test(target)) {
      return { hit: true, severity, msg, target: target.slice(0, 120) };
    }
  }
  return { hit: false };
}

module.exports = { check, PATTERNS };
