#!/usr/bin/env node
// corpus-security-scan.mjs — skill-security SAST gate (clean-room SAST-for-skills).
//
// Upgraded from a 7-category line-regex scanner to a real static-analysis gate for foreign
// skills. It is the ACQUISITION-TIME install gate: point it at a downloaded skill directory and
// it returns SAFE / CAUTION / DO_NOT_INSTALL plus a 0-100 install score and CI exit codes.
//
// ARCHITECTURE (this orchestrator) wires four clean-room analyzer modules under security/:
//   ast-js.mjs     — JS/TS token-aware dangerous-construct detector (degrades to regex)
//   ast-bash.mjs   — shell dangerous-command detector (degrades to regex)
//   taint-model.mjs— source→sink flow modeling (credential/file/input → network/exec/shell)
//   osv-lookup.mjs — known-vulnerable-dependency lookup (offline snapshot; --osv-online fail-soft)
//   sarif-emit.mjs — SARIF 2.1.0 output
// plus corpus-threat-taxonomy.mjs (the 16-category vocabulary).
//
// HARDENING CONTRACT honored here:
//  (1) All security/*.mjs are PURE node-builtin with ZERO REPO_ROOT computation. THIS orchestrator
//      owns REPO_ROOT and INJECTS the osv-snapshot path (dependency injection) into osv-lookup —
//      so root-architecture.test.mjs only ever sees the root computation in THIS file (which is in
//      _SYSTEM/Scripts, the canonical home), never in security/.
//  (2) Default + --json output emits a SINGLE JSON object to stdout; warnings/notes go to stderr.
//      The output is an ADDITIVE SUPERSET: ALL legacy keys (path, name, score, verdict, threats)
//      are preserved byte-for-byte-compatible for the corpus-absorb consumer; new keys are added.
//  (3) Tokenizer parse-failure degrades to regex, never throws (enforced inside the modules).
//  (4) --osv-online uses AbortController timeout and FAILS SOFT to the offline snapshot.
//  (5) DYNAMIC_CODE_EXEC is additive, not split from SUPPLY_CHAIN (legacy score unchanged).
//
// ARMED STATE: ADVISORY this phase. The gate computes verdicts and exit codes, but corpus-absorb
// still keys on the LEGACY `verdict` (PASS/WARN/FAIL) — the new install gate does NOT auto-block
// ingest. Auto-block is a later, owner-gated phase. See `phantomCodeFlags` in the build report.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  THREAT_TAXONOMY,
  TAXONOMY_BY_ID,
  SEVERITY_SCORE,
  isKnownCategory,
} from './corpus-threat-taxonomy.mjs';
import { analyze as analyzeJs } from './security/ast-js.mjs';
import { analyze as analyzeBash } from './security/ast-bash.mjs';
import { analyze as analyzeTaint } from './security/taint-model.mjs';
import { lookup as osvLookup } from './security/osv-lookup.mjs';
import { toSarif } from './security/sarif-emit.mjs';

// THIS file owns the repo-root computation (canonical _SYSTEM/Scripts home). The security/*
// modules never compute it — we inject the snapshot path below.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OSV_SNAPSHOT_PATH = path.join(REPO_ROOT, '_SYSTEM', 'data', 'osv-snapshot.json');

const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.sh', '.bash', '.zsh']);
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);
const BASH_EXTENSIONS = new Set(['.sh', '.bash', '.zsh']);

// ---- legacy 7-category line-regex specs (UNCHANGED — preserves the corpus-absorb score) ----
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
  return [
    'Usage: node _SYSTEM/Scripts/corpus-security-scan.mjs <skill-dir-path> [options]',
    '  --json          emit the single JSON result object to stdout (default also does)',
    '  --sarif         include a SARIF 2.1.0 log under result.sarif',
    '  --osv-online    refresh CVE data from OSV.dev (AbortController timeout, fail-soft to snapshot)',
    '  --install-gate  exit non-zero on CAUTION (2) / DO_NOT_INSTALL (1) for CI use',
    '  -h, --help      show this help',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    skillPath: '',
    json: false,
    sarif: false,
    osvOnline: false,
    installGate: false,
    help: false,
  };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--sarif') args.sarif = true;
    else if (arg === '--osv-online') args.osvOnline = true;
    else if (arg === '--install-gate') args.installGate = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else if (!args.skillPath) args.skillPath = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return args;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[corpus-security-scan] ${error.message}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exit(1);
  }

  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (!args.skillPath) {
    process.stderr.write('[corpus-security-scan] missing skill directory path\n');
    process.stderr.write(`${usage()}\n`);
    process.exit(1);
  }

  let result;
  try {
    result = await scanSkill(args.skillPath, {
      osvOnline: args.osvOnline,
      includeSarif: args.sarif,
    });
  } catch (error) {
    process.stderr.write(`[corpus-security-scan] failed: ${error.message}\n`);
    process.exit(1);
  }

  // (2) warnings to STDERR, the single JSON object to STDOUT.
  if (result.warnings?.length) {
    for (const w of result.warnings) process.stderr.write(`[corpus-security-scan][warn] ${w}\n`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  // (advisory) install-gate CI exit codes — only when explicitly requested; default exits 0.
  if (args.installGate) {
    if (result.installVerdict === 'DO_NOT_INSTALL') process.exit(1);
    if (result.installVerdict === 'CAUTION') process.exit(2);
    process.exit(0);
  }
}

async function scanSkill(inputPath, options = {}) {
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

  const warnings = [];

  // ---- LEGACY layer (unchanged): line-regex over SKILL.md + sibling code + package.json ----
  const threatsByKey = new Map();
  const skillName = scanSkillMarkdown(skillMdPath, threatsByKey) || path.basename(skillDir);

  const siblingFiles = collectSiblingFiles(skillDir, skillMdPath);
  let pkgJson = null;
  for (const filePath of siblingFiles) {
    if (path.basename(filePath) === 'package.json') {
      pkgJson = scanPackageJson(filePath, threatsByKey);
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
  const verdict = verdictForScore(score);

  // ---- NEW SAST layer (additive): AST + taint + OSV ----
  const astFindings = [];
  const taintFindings = [];
  for (const filePath of siblingFiles) {
    const ext = path.extname(filePath).toLowerCase();
    let src;
    try {
      src = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const relName = path.relative(skillDir, filePath) || path.basename(filePath);
    let astResult = null;
    if (JS_EXTENSIONS.has(ext)) astResult = analyzeJs(src, relName);
    else if (BASH_EXTENSIONS.has(ext)) astResult = analyzeBash(src, relName);

    if (astResult) {
      if (astResult.degraded) warnings.push(`${relName}: analyzer degraded to regex (${astResult.error})`);
      for (const f of astResult.findings) {
        astFindings.push({ ...f, file: relName, severity: severityFor(f.id) });
      }
      const taint = analyzeTaint({ findings: astResult.findings, source: src, fileName: relName });
      for (const f of taint.findings) {
        taintFindings.push({ ...f, file: relName, severity: severityFor(f.id) });
      }
    }
  }

  // ---- OSV: parse package.json deps; INJECT the snapshot path (DI) ----
  let osv = { findings: [], mode: 'offline', online: false, degraded: false };
  if (pkgJson) {
    osv = await osvLookup({
      pkg: pkgJson,
      snapshotPath: OSV_SNAPSHOT_PATH,
      online: options.osvOnline === true,
    });
    if (osv.degraded) warnings.push(`osv lookup degraded/fail-soft (mode=${osv.mode})`);
  }
  const osvFindings = osv.findings.map((f) => ({ ...f, file: 'package.json' }));

  // ---- compose the full category set + the install score/verdict ----
  const allFindings = [
    ...threats.map((t) => ({ id: t.type, severity: t.severity, evidence: t.evidence, line: t.line, file: relativeOf(skillDir, t.filePath), engine: 'legacy-regex' })),
    ...astFindings,
    ...taintFindings,
    ...osvFindings,
  ];
  const categories = summarizeCategories(allFindings);
  const { installScore, installVerdict } = computeInstallGate(categories);

  const result = {
    // ---- LEGACY KEYS (consumer contract: corpus-absorb reads these) ----
    path: skillDir,
    name: skillName || path.basename(skillDir),
    score,
    verdict,
    threats: threats.map(({ type, severity, evidence, line }) => ({ type, severity, evidence, line })),

    // ---- ADDITIVE SAST KEYS ----
    schemaVersion: 2,
    taxonomyCategories: THREAT_TAXONOMY.length,
    installScore, // 0-100, higher = safer
    installVerdict, // SAFE | CAUTION | DO_NOT_INSTALL
    armedState: 'advisory', // gate does NOT auto-block ingest this phase
    categories, // per-category roll-up (count + severity + top evidence)
    astFindings,
    taintFindings,
    osv: {
      mode: osv.mode,
      online: osv.online,
      degraded: osv.degraded,
      findings: osvFindings,
    },
    warnings,
  };

  if (options.includeSarif) {
    result.sarif = toSarif({
      findings: allFindings.map((f) => ({
        id: f.id,
        severity: f.severity,
        message: f.evidence,
        uri: f.file || 'SKILL.md',
        line: f.line,
      })),
      taxonomy: THREAT_TAXONOMY,
    });
  }

  return result;
}

function severityFor(id) {
  if (isKnownCategory(id)) return TAXONOMY_BY_ID[id].severity;
  return 'MEDIUM';
}

function relativeOf(skillDir, filePath) {
  if (!filePath) return 'SKILL.md';
  const rel = path.relative(skillDir, filePath);
  return rel && !rel.startsWith('..') ? rel : path.basename(filePath);
}

// Roll up findings per taxonomy category: count, severity, representative evidence.
function summarizeCategories(findings) {
  const map = new Map();
  for (const f of findings) {
    if (!f || !f.id) continue;
    const existing = map.get(f.id) || {
      id: f.id,
      name: TAXONOMY_BY_ID[f.id]?.name || f.id,
      severity: f.severity || severityFor(f.id),
      count: 0,
      evidence: f.evidence || f.label || '',
    };
    existing.count += 1;
    map.set(f.id, existing);
  }
  return Array.from(map.values()).sort((a, b) => (SEVERITY_SCORE[b.severity] || 0) - (SEVERITY_SCORE[a.severity] || 0));
}

// Install gate: 100 = pristine. Subtract weighted penalties; clamp to [0,100].
// Verdict bands: a single CRITICAL category => DO_NOT_INSTALL; HIGH-only with low count =>
// CAUTION; clean or trivial => SAFE. Score and verdict are reported together (effect-size +
// rank, not a single opaque threshold — FB:EFFECT-SIZE-OVER-BINARY-THRESHOLD).
function computeInstallGate(categories) {
  let penalty = 0;
  let hasCritical = false;
  let highCount = 0;
  let mediumCount = 0;
  for (const cat of categories) {
    const w = SEVERITY_SCORE[cat.severity] || 0;
    // diminishing weight on repeat hits of the same category (cap contribution)
    const effective = w * Math.min(cat.count, 3);
    penalty += effective;
    if (cat.severity === 'CRITICAL') hasCritical = true;
    if (cat.severity === 'HIGH') highCount += cat.count;
    if (cat.severity === 'MEDIUM') mediumCount += cat.count;
  }
  const installScore = Math.max(0, Math.min(100, 100 - penalty));

  let installVerdict;
  if (hasCritical || installScore < 40) {
    installVerdict = 'DO_NOT_INSTALL';
  } else if (highCount > 0 || mediumCount > 1 || installScore < 80) {
    installVerdict = 'CAUTION';
  } else {
    installVerdict = 'SAFE';
  }
  return { installScore, installVerdict };
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
  let currentBlock = null;
  let inBodyCodeFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (lineNumber === 1 && trimmed === '---') {
      inFrontmatter = true;
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
    return null;
  }

  const postinstall = parsed?.scripts?.postinstall;
  if (postinstall && typeof postinstall === 'string' && postinstall.trim()) {
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

  return parsed;
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

// @capability: skill-security-gate
// @serves: scan a foreign skill for malware before install | SAST for agent skills | static analysis of a downloaded skill | is this skill safe to install | skill security scan | detect dangerous code in a skill | install-time security gate | SARIF for a skill | known-vulnerable dependency in a skill
// @does: SAST-for-skills install gate — 16-category threat taxonomy, hand-rolled JS/bash AST analyzers (degrade-to-regex, never throw), source-to-sink taint modeling, offline OSV/CVE dependency lookup (--osv-online fail-soft), SARIF 2.1.0; emits SAFE/CAUTION/DO_NOT_INSTALL + 0-100 install score + CI exit codes. ADVISORY (does not auto-block ingest).
// @use: when acquiring/vetting a foreign or downloaded agent skill before installing it, or in CI to gate skill ingest; the deeper static-analysis upgrade of the legacy 7-category regex scanner (preserves the corpus-absorb consumer contract)
// @exports: scanSkill
export { scanSkill };

await main();
