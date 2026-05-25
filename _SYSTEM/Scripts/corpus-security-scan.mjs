#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.py', '.sh']);
const SEVERITY_SCORE = {
  CRITICAL: 40,
  HIGH: 20,
  MEDIUM: 10,
  LOW: 5,
};
const THREAT_SPECS = {
  CREDENTIAL_ACCESS: {
    severity: 'HIGH',
    matches: [
      /process\.env\b/i,
      /os\.environ\b/i,
      /~\/\.ssh\//i,
      /\.env\b/i,
      /\bAPI_KEY\b/i,
      /\bSECRET_[A-Z0-9]|\bSECRET\s*=/i,
      /\btoken\s*=\s*/i,
      /\bkeychain\b/i,
    ],
  },
  NETWORK_EXFILTRATION: {
    severity: 'HIGH',
    matches: [
      /\bfetch\s*\(/i,
      /\bXMLHttpRequest\b/i,
      /\bcurl\b/i,
      /\bwget\b/i,
      /\bbtoa\s*\(/i,
      /Buffer\.from\s*\([\s\S]*?\)\.toString\s*\(\s*['"]base64['"]\s*\)/i,
    ],
  },
  PATH_TRAVERSAL: {
    severity: 'HIGH',
    matches: [
      /\.\.\//,
      /\/etc\/passwd/i,
      /\/etc\/shadow/i,
      /~\/\.claude\//i,
    ],
  },
  PROMPT_INJECTION: {
    severity: 'HIGH',
    matches: [
      /ignore previous instructions/i,
      /disregard/i,
      /you are now/i,
      /override/i,
      /system prompt/i,
    ],
  },
  OBFUSCATION: {
    severity: 'MEDIUM',
    matches: [
      /\\x[0-9a-f]{2}/i,
      /\\u[0-9a-f]{4,}/i,
    ],
  },
  SUPPLY_CHAIN: {
    severity: 'CRITICAL',
    matches: [
      /\bpostinstall\b/i,
      /\beval\s*\(/i,
      /\bnew\s+Function\s*\(/i,
      /\bFunction\s*\(/i,
      /\bexec\s*\(/i,
    ],
  },
  HARDCODED_SECRETS: {
    severity: 'CRITICAL',
    matches: [
      /(?=[A-Za-z0-9]{40,}\b)(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{40,}\b/,
      /-----BEGIN [A-Z ]+PRIVATE KEY-----/i,
    ],
  },
};
const USER_INPUT_RE = /\b(?:input|user|argv|args|payload|query|body|stdin|request|message|data|token)\b|process\.argv|\$\{|\$[0-9]/i;
const LOCALHOST_RE = /localhost|127\.0\.0\.1|0\.0\.0\.0|::1/i;

function usage() {
  return `Usage: node _SYSTEM/Scripts/corpus-security-scan.mjs <skill-dir-path> [--json]`;
}

function parseArgs(argv) {
  const args = { skillPath: '', json: false, help: false };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (!args.skillPath) args.skillPath = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return args;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[corpus-security-scan] ${error.message}`);
    console.error(usage());
    process.exit(1);
  }

  if (args.help) {
    console.log(usage());
    return;
  }

  if (!args.skillPath) {
    console.error('[corpus-security-scan] missing skill directory path');
    console.error(usage());
    process.exit(1);
  }

  try {
    const result = scanSkill(args.skillPath);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    console.error(`[corpus-security-scan] failed: ${error.message}`);
    process.exit(1);
  }
}

function scanSkill(inputPath) {
  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    throw new Error(`skill path not found: ${resolvedInput}`);
  }

  const stat = fs.statSync(resolvedInput);
  const skillDir = stat.isDirectory() ? resolvedInput : path.dirname(resolvedInput);
  const skillMdPath = stat.isFile() ? resolvedInput : path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(skillMdPath) || !fs.statSync(skillMdPath).isFile()) {
    throw new Error(`SKILL.md not found in: ${skillDir}`);
  }

  const threatsByKey = new Map();
  const skillName = scanSkillMarkdown(skillMdPath, threatsByKey) || path.basename(skillDir);

  for (const filePath of collectSiblingFiles(skillDir, skillMdPath)) {
    if (path.basename(filePath) === 'package.json') {
      scanPackageJson(filePath, threatsByKey);
      continue;
    }
    scanTextFile(filePath, {
      threatsByKey,
      codeFile: isCodeFile(filePath),
      allowPromptInjection: false,
      fileKind: 'code',
    });
  }

  const threats = Array.from(threatsByKey.values()).sort(compareThreats);
  const score = threats.reduce((sum, threat) => sum + SEVERITY_SCORE[threat.severity], 0);

  return {
    path: skillDir,
    name: skillName || path.basename(skillDir),
    score,
    verdict: verdictForScore(score),
    threats: threats.map(({ type, severity, evidence, line }) => ({ type, severity, evidence, line })),
  };
}

function collectSiblingFiles(skillDir, skillMdPath) {
  const entries = fs.readdirSync(skillDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(skillDir, entry.name);
    if (path.resolve(filePath) === path.resolve(skillMdPath)) continue;
    if (entry.name === 'package.json' || isCodeFile(filePath)) {
      files.push(filePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function isCodeFile(filePath) {
  return CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function verdictForScore(score) {
  if (score >= 40) return 'FAIL';
  if (score >= 20) return 'WARN';
  return 'PASS';
}

function compareThreats(left, right) {
  const severityDelta = SEVERITY_SCORE[right.severity] - SEVERITY_SCORE[left.severity];
  if (severityDelta !== 0) return severityDelta;
  if (left.type !== right.type) return left.type.localeCompare(right.type);
  if (left.filePath !== right.filePath) return left.filePath.localeCompare(right.filePath);
  return left.line - right.line;
}

function scanSkillMarkdown(filePath, threatsByKey) {
  const lines = readLines(filePath);
  let name = '';
  let inFrontmatter = false;
  let frontmatterSeen = false;
  let currentBlock = null;
  let inBodyCodeFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (lineNumber === 1 && trimmed === '---') {
      inFrontmatter = true;
      frontmatterSeen = true;
      continue;
    }

    if (inFrontmatter && trimmed === '---') {
      inFrontmatter = false;
      currentBlock = null;
      continue;
    }

    if (!inFrontmatter && /^```/.test(trimmed)) {
      inBodyCodeFence = !inBodyCodeFence;
    }

    let allowPromptInjection = false;
    const scanAsCode = inBodyCodeFence;

    if (inFrontmatter) {
      if (currentBlock && trimmed && countLeadingSpaces(line) <= currentBlock.indent) {
        currentBlock = null;
      }

      if (currentBlock) {
        allowPromptInjection = currentBlock.type === 'description' || currentBlock.type === 'triggers';
        scanLine({
          filePath,
          line,
          lineNumber,
          threatsByKey,
          allowPromptInjection,
          codeLine: false,
          lineKind: 'skill-md',
        });
        continue;
      }

      const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
      if (match) {
        const key = match[1].toLowerCase();
        const rawValue = match[2] ?? '';

        if (key === 'name') {
          name = parseScalar(rawValue) || name;
        }

        if (key === 'description') {
          if (isBlockScalar(rawValue)) {
            currentBlock = { type: 'description', indent: countLeadingSpaces(line) };
          } else {
            allowPromptInjection = true;
          }
        } else if (key === 'triggers') {
          if (isInlineArray(rawValue)) {
            allowPromptInjection = true;
          } else {
            currentBlock = { type: 'triggers', indent: countLeadingSpaces(line) };
          }
        }
      }

      scanLine({
        filePath,
        line,
        lineNumber,
        threatsByKey,
        allowPromptInjection,
        codeLine: false,
        lineKind: 'skill-md',
      });
      continue;
    }

    scanLine({
      filePath,
      line,
      lineNumber,
      threatsByKey,
      allowPromptInjection: false,
      codeLine: scanAsCode,
      lineKind: 'skill-md-body',
    });
  }

  return name;
}

function scanTextFile(filePath, options) {
  const lines = readLines(filePath);
  let inCodeFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (options.codeFile && /^```/.test(trimmed)) {
      inCodeFence = !inCodeFence;
    }

    scanLine({
      filePath,
      line,
      lineNumber,
      threatsByKey: options.threatsByKey,
      allowPromptInjection: options.allowPromptInjection === true,
      codeLine: options.codeFile ? true : inCodeFence,
      lineKind: options.fileKind,
    });
  }
}

function scanPackageJson(filePath, threatsByKey) {
  const text = fs.readFileSync(filePath, 'utf8');
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    return;
  }

  const postinstall = parsed?.scripts?.postinstall;
  if (!postinstall || typeof postinstall !== 'string' || !postinstall.trim()) return;

  const lines = readLines(filePath);
  const lineNumber = findLineNumber(lines, /^\s*"postinstall"\s*:/) || 1;
  addThreat({
    threatsByKey,
    type: 'SUPPLY_CHAIN',
    severity: THREAT_SPECS.SUPPLY_CHAIN.severity,
    filePath,
    lineNumber,
    line: lines[lineNumber - 1] || `"postinstall": ${postinstall}`,
  });
}

function scanLine({
  filePath,
  line,
  lineNumber,
  threatsByKey,
  allowPromptInjection,
  codeLine,
  lineKind,
}) {
  if (!line && line !== '') return;

  if (codeLine && line.length > 500) {
    addThreat({
      threatsByKey,
      type: 'OBFUSCATION',
      severity: THREAT_SPECS.OBFUSCATION.severity,
      filePath,
      lineNumber,
      line,
    });
  }

  for (const [type, spec] of Object.entries(THREAT_SPECS)) {
    if (type === 'OBFUSCATION' || type === 'SUPPLY_CHAIN') continue;
    if (type === 'PROMPT_INJECTION' && !allowPromptInjection) continue;

    if (type === 'CREDENTIAL_ACCESS' && matchAny(line, spec.matches)) {
      addThreat({ threatsByKey, type, severity: spec.severity, filePath, lineNumber, line });
      continue;
    }

    if (type === 'NETWORK_EXFILTRATION') {
      if (matchAny(line, spec.matches)) {
        if (/axios\.post\s*\(/i.test(line) && LOCALHOST_RE.test(line)) continue;
        addThreat({ threatsByKey, type, severity: spec.severity, filePath, lineNumber, line });
      }
      continue;
    }

    if (type === 'PATH_TRAVERSAL') {
      if (matchAny(line, spec.matches)) {
        // ../  in non-code markdown prose = relative link, not path traversal
        if (!codeLine && /\.\.\//.test(line) && !/\/etc\/passwd|\/etc\/shadow|~\/\.claude\//i.test(line)) {
          continue;
        }
        if (/\/Users\//.test(line) && !/\b(?:write|append|copy|rename|mkdir|save|writeFile|writeTextFile|open)\b/i.test(line)) {
          continue;
        }
        addThreat({ threatsByKey, type, severity: spec.severity, filePath, lineNumber, line });
      }
      continue;
    }

    if (type === 'PROMPT_INJECTION') {
      if (matchAny(line, spec.matches)) {
        addThreat({ threatsByKey, type, severity: spec.severity, filePath, lineNumber, line });
      }
      continue;
    }

    if (type === 'HARDCODED_SECRETS') {
      if (matchAny(line, spec.matches)) {
        addThreat({ threatsByKey, type, severity: spec.severity, filePath, lineNumber, line });
      }
      continue;
    }
  }

  if (codeLine) {
    if (THREAT_SPECS.OBFUSCATION.matches.some((regex) => regex.test(line))) {
      addThreat({
        threatsByKey,
        type: 'OBFUSCATION',
        severity: THREAT_SPECS.OBFUSCATION.severity,
        filePath,
        lineNumber,
        line,
      });
    }

    if (THREAT_SPECS.SUPPLY_CHAIN.matches.some((regex) => regex.test(line))) {
      if (/\bexec\s*\(/i.test(line)) {
        if (!USER_INPUT_RE.test(line)) {
          return;
        }
      }
      addThreat({
        threatsByKey,
        type: 'SUPPLY_CHAIN',
        severity: THREAT_SPECS.SUPPLY_CHAIN.severity,
        filePath,
        lineNumber,
        line,
      });
    }
  }
}

function matchAny(line, regexes) {
  return regexes.some((regex) => regex.test(line));
}

function addThreat({ threatsByKey, type, severity, filePath, lineNumber, line }) {
  const key = `${type}|${filePath}|${lineNumber}`;
  if (threatsByKey.has(key)) return;
  threatsByKey.set(key, {
    type,
    severity,
    evidence: formatEvidence(filePath, lineNumber, line),
    line: lineNumber,
    filePath,
  });
}

function formatEvidence(filePath, lineNumber, line) {
  const excerpt = compactLine(line);
  return `${filePath}:${lineNumber}: ${excerpt}`;
}

function compactLine(line) {
  const cleaned = String(line ?? '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 180) return cleaned;
  return `${cleaned.slice(0, 177)}...`;
}

function readLines(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return normalized.split(/\r?\n/);
}

function parseScalar(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === 'null' || trimmed === '~') return '';
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  if (!quoted) return trimmed;
  return trimmed.slice(1, -1);
}

function isInlineArray(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.startsWith('[') && trimmed.endsWith(']');
}

function isBlockScalar(value) {
  const trimmed = String(value ?? '').trim();
  return !trimmed || trimmed.startsWith('|') || trimmed.startsWith('>');
}

function countLeadingSpaces(line) {
  const match = String(line ?? '').match(/^ */);
  return match ? match[0].length : 0;
}

function findLineNumber(lines, regex) {
  for (let index = 0; index < lines.length; index += 1) {
    if (regex.test(lines[index])) return index + 1;
  }
  return 0;
}

main();
