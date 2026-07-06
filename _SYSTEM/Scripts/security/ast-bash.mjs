#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
// security/ast-bash.mjs — hand-rolled shell-script analyzer for the skill-security SAST gate.
//
// CLEAN-ROOM: node builtins ONLY, no shellcheck, no tree-sitter-bash, no new dependency.
// A re-expression of a standard shell tokenizer: it strips `#` comments and single-quoted
// strings (which the shell does not expand), then matches dangerous command shapes on the
// remaining significant text. Single-quoted content is treated as inert data (so a help-text
// example like 'rm -rf' inside single quotes does NOT fire); unquoted and double-quoted
// command text is live and DOES fire.
//
// HARDENING item 5: tokenizer failure DEGRADES to a raw-source regex scan, never throws.
// HARDENING item 1: ZERO REPO_ROOT / fs-root computation. Pure function of (source, fileName);
// it performs no filesystem access — the orchestrator passes file text in.

// Dangerous shell command shapes, keyed into corpus-threat-taxonomy categories.
const BASH_SINKS = [
  // command substitution / dynamic exec (DYNAMIC_CODE_EXEC)
  { id: 'DYNAMIC_CODE_EXEC', re: /\beval\s+/, label: 'shell eval' },
  { id: 'DYNAMIC_CODE_EXEC', re: /\$\(\s*curl|\bcurl\b[^|]*\|\s*(?:bash|sh|zsh)\b/, label: 'curl|sh pipe-to-shell' },
  { id: 'DYNAMIC_CODE_EXEC', re: /\bwget\b[^|]*\|\s*(?:bash|sh|zsh)\b/, label: 'wget|sh pipe-to-shell' },

  // network egress (NETWORK_EXFILTRATION)
  { id: 'NETWORK_EXFILTRATION', re: /\bcurl\b/, label: 'curl' },
  { id: 'NETWORK_EXFILTRATION', re: /\bwget\b/, label: 'wget' },
  { id: 'NETWORK_EXFILTRATION', re: /\bnc\b\s+-|\bncat\b|\b\/dev\/tcp\//, label: 'netcat / /dev/tcp egress' },

  // credential access (CREDENTIAL_ACCESS)
  { id: 'CREDENTIAL_ACCESS', re: /\$\{?(?:[A-Z_]*(?:TOKEN|SECRET|KEY|PASSWORD|PASSWD)[A-Z_]*)\b/, label: 'secret env var read' },
  { id: 'CREDENTIAL_ACCESS', re: /\bcat\b[^\n]*(?:\.ssh\/|\.env\b|id_rsa|credentials)/, label: 'cat secret file' },

  // child-process spawn / shell (CHILD_PROCESS_SPAWN)
  { id: 'CHILD_PROCESS_SPAWN', re: /\b(?:bash|sh|zsh|ksh)\s+-c\b/, label: 'shell -c invocation' },

  // privilege escalation (PRIVILEGE_ESCALATION)
  { id: 'PRIVILEGE_ESCALATION', re: /\b(?:sudo|doas)\b/, label: 'sudo/doas' },
  { id: 'PRIVILEGE_ESCALATION', re: /\bchmod\b\s+(?:[ugoa]*\+s|4[0-7]{3})/, label: 'setuid chmod' },

  // destructive ops (DATA_DESTRUCTION)
  { id: 'DATA_DESTRUCTION', re: /\brm\s+(?:-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/, label: 'rm -rf' },
  { id: 'DATA_DESTRUCTION', re: /\b(?:mkfs|dd)\b\s+/, label: 'mkfs/dd' },
  { id: 'DATA_DESTRUCTION', re: /\bgit\b\s+(?:reset\s+--hard|clean\s+-[a-z]*f)/, label: 'destructive git' },

  // filesystem write/delete (FILESYSTEM_WRITE)
  { id: 'FILESYSTEM_WRITE', re: />\s*\/(?:etc|usr|bin|sbin|var)\//, label: 'redirect into system path' },

  // persistence (PERSISTENCE_MECHANISM)
  { id: 'PERSISTENCE_MECHANISM', re: /\bcrontab\b|\/etc\/cron|launchctl\b|systemctl\s+enable\b/, label: 'cron/launchd/systemd persistence' },
  { id: 'PERSISTENCE_MECHANISM', re: />>?\s*~?\/?(?:\.bashrc|\.zshrc|\.profile|\.bash_profile)\b/, label: 'shell-rc autostart edit' },
];

const BASH_FALLBACK = [
  { id: 'DYNAMIC_CODE_EXEC', re: /\beval\s+/, label: 'shell eval (regex-fallback)' },
  { id: 'NETWORK_EXFILTRATION', re: /\bcurl\b|\bwget\b/, label: 'curl/wget (regex-fallback)' },
  { id: 'PRIVILEGE_ESCALATION', re: /\bsudo\b/, label: 'sudo (regex-fallback)' },
  { id: 'DATA_DESTRUCTION', re: /\brm\s+-[a-z]*r[a-z]*f\b/, label: 'rm -rf (regex-fallback)' },
  { id: 'PERSISTENCE_MECHANISM', re: /\bcrontab\b/, label: 'crontab (regex-fallback)' },
];

// Strip `#` comments and single-quoted spans from one line, returning significant text.
// (Heredocs and multi-line single quotes are handled coarsely by the line walker; on any
// structural surprise we degrade.)
function significantText(line) {
  let out = '';
  let i = 0;
  const n = line.length;
  while (i < n) {
    const c = line[i];
    if (c === '#') {
      // comment to end of line (ignore the common `#!/bin/bash` shebang at col 0 too)
      break;
    }
    if (c === "'") {
      // single-quoted: inert, skip to closing quote
      i += 1;
      while (i < n && line[i] !== "'") i += 1;
      i += 1; // consume closing quote (if missing, loop ends at n)
      out += ' '; // placeholder so token boundaries survive
      continue;
    }
    if (c === '"') {
      // double-quoted: expansion happens, keep contents but drop the quote chars
      i += 1;
      while (i < n && line[i] !== '"') {
        if (line[i] === '\\') { out += line[i + 1] ?? ''; i += 2; continue; }
        out += line[i];
        i += 1;
      }
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function dedupeKey(f) {
  return `${f.id}|${f.line}|${f.label}`;
}

// True when the line is a pure text-emit command (echo/printf/:) with NO command separator that
// could re-enter command position (; | && || `...` $(...)). If a separator is present the line
// could chain a real command after the echo, so we keep scanning it.
const OUTPUT_CMD_RE = /^\s*(?:echo|printf|:)\b/;
const REENTERS_COMMAND_RE = /[;|&`]|\$\(/;
function isPureOutputCommand(sig) {
  if (!OUTPUT_CMD_RE.test(sig)) return false;
  return !REENTERS_COMMAND_RE.test(sig);
}

/**
 * analyze(source, fileName) -> { findings, degraded, error }. NEVER throws.
 */
export function analyze(source, fileName = '<bash>') {
  const src = typeof source === 'string' ? source : String(source ?? '');
  const findings = [];
  const seen = new Set();
  const push = (id, label, line, evidence, engine) => {
    const f = { id, label, line, evidence, engine };
    const key = dedupeKey(f);
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(f);
  };

  let lines;
  try {
    lines = src.split(/\r?\n/);
  } catch (err) {
    return regexFallback(src, fileName, err);
  }

  try {
    for (let idx = 0; idx < lines.length; idx += 1) {
      const raw = lines[idx];
      // preserve shebang line for shell -c detection? shebang is a comment, skip its sink test.
      const sig = significantText(raw);
      if (!sig.trim()) continue;
      // command-position guard: if the line is purely an echo/printf/: of text, the remaining
      // significant content is OUTPUT data, not a command. Drop it so a help-text example like
      // `echo "run rm -rf to clean"` does not fire a destructive-op finding. We still scan lines
      // where the dangerous token is in command position (the start of a pipeline segment).
      if (isPureOutputCommand(sig)) continue;
      for (const sink of BASH_SINKS) {
        if (sink.re.test(sig)) {
          push(sink.id, sink.label, idx + 1, compact(raw), 'ast');
        }
      }
    }
  } catch (err) {
    return regexFallback(src, fileName, err);
  }

  return { findings, degraded: false, error: null };
}

function regexFallback(src, fileName, err) {
  const findings = [];
  const seen = new Set();
  const lines = src.split(/\r?\n/);
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    for (const sink of BASH_FALLBACK) {
      if (sink.re.test(line)) {
        const f = { id: sink.id, label: sink.label, line: idx + 1, evidence: compact(line), engine: 'regex-fallback' };
        const key = dedupeKey(f);
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push(f);
      }
    }
  }
  return { findings, degraded: true, error: err ? String(err.message || err) : 'tokenizer-degraded' };
}

function compact(line) {
  const cleaned = String(line ?? '').replace(/\s+/g, ' ').trim();
  return cleaned.length <= 180 ? cleaned : `${cleaned.slice(0, 177)}...`;
}

// CLI self-check: node ast-bash.mjs <file>
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fs = await import('node:fs');
  const target = process.argv[2];
  if (!target) {
    process.stderr.write('usage: node ast-bash.mjs <file.sh>\n');
    process.exit(1);
  }
  const out = analyze(fs.readFileSync(target, 'utf8'), target);
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}
