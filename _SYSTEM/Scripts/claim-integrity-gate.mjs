#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ARTIFACT_REGISTRY_PATH,
  isProtectedPath,
  loadArtifactRegistry,
  normalizeRepoPath,
} from './artifact-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');

export const CLAIM_REPORT_SCHEMA = 'yuri.claim-integrity-report.v0';

export const PROMOTION_STATES = Object.freeze([
  'draft',
  'research',
  'fixture_ready',
  'runtime_tested',
  'operator_validated',
  'trusted',
  'deprecated',
]);

export const LEGACY_PROMOTION_TERMS = Object.freeze([
  'verified-baseline',
  'stable',
  'fixture',
  'fixture-ready',
  'retest-proven',
  'local fixture',
  'deterministic fixture',
  'advisory hypothesis',
  'research-only',
]);

export const HIGH_RISK_TERMS = Object.freeze([
  { term: 'operating system', pattern: /\boperating system\b/iu },
  { term: 'OS', pattern: /\bOS\b/u },
  { term: 'production-ready', pattern: /\bproduction[- ]ready\b/iu },
  { term: 'proven', pattern: /\bproven\b/iu },
  { term: 'verified', pattern: /\bverified\b/iu },
  { term: 'trusted', pattern: /\btrusted\b/iu },
  { term: 'cybersecurity company', pattern: /\bcybersecurity company\b/iu },
  { term: 'SOC', pattern: /\bSOC\b/u },
  { term: 'SIEM', pattern: /\bSIEM\b/u },
  { term: 'XDR', pattern: /\bXDR\b/u },
  { term: 'runtime protection', pattern: /\bruntime protection\b/iu },
  { term: 'autonomous', pattern: /\bautonomous\b/iu },
]);

const DEFAULT_SCAN_EXTENSIONS = new Set(['.md', '.json', '.mjs', '.js']);
const EXTRA_PROTECTED_PREFIXES = Object.freeze([
  '_SYSTEM/backend/data/',
  '_SYSTEM/recovery/',
  '.claude/.credentials.json',
  '.claude/credentials.json',
  '.claude/lane-sessions/',
  '.claude/paste-cache/',
  '.claude/worktrees/',
  'needle/',
]);

const EVIDENCE_PATTERNS = Object.freeze([
  { label: 'promotion_ladder_context', pattern: /\b(?:promotion state|promotionStatus|canonical promotion|promotion ladder|ladder|state:|status:)\b/iu },
  { label: 'canonical_promotion_state', pattern: new RegExp(`\\b(?:${PROMOTION_STATES.join('|')})\\b`, 'iu') },
  { label: 'legacy_promotion_term', pattern: new RegExp(`\\b(?:${LEGACY_PROMOTION_TERMS.map(escapeRegex).join('|')})\\b`, 'iu') },
  { label: 'executable_test_reference', pattern: /\b(?:node\s+)?_SYSTEM\/Scripts\/[A-Za-z0-9_./-]+\.test\.(?:mjs|js)\b/u },
  { label: 'artifact_or_report_reference', pattern: /\b(?:_SYSTEM|skills|\.agents|\.Codex)\/[A-Za-z0-9_./-]+/u },
  { label: 'proof_state_qualified', pattern: /\b(?:proof_state|proof state|proof qualifier|local fixture proof|fixture proof|deterministic local fixture|runtime-tested|runtime tested)\b/iu },
  { label: 'explicit_advisory_qualifier', pattern: /\b(?:advisory|research|hypothesis|fixture-only|local-only|bounded local|operator validation|Codex arbitration)\b/iu },
]);

const BOUNDARY_PATTERNS = Object.freeze([
  /\b(?:not|no|never|without)\b[\s\S]{0,120}\b(?:literal\s+)?(?:OS|operating system|SOC|SIEM|XDR|cybersecurity company|production[- ]ready|runtime protection|autonomous|trusted)\b/iu,
  /\b(?:not yet|not current|not ready|future|blocked|excluded)\b[\s\S]{0,120}\b(?:SOC|SIEM|XDR|cybersecurity company|production[- ]ready|runtime protection|autonomous)\b/iu,
  /\b(?:not|no|never|without)\s+(?:a\s+|an\s+|the\s+)?(?:literal\s+)?(?:OS|operating system|SOC|SIEM|XDR|cybersecurity company|production[- ]ready|runtime protection|autonomous)\b/iu,
  /\b(?:do not|don't|must not|should not)\s+(?:claim|describe|sell|position|treat|call)\b/iu,
  /\b(?:rejected|unsupported|false|aspirational|future|not current|downgrade|boundary|disclaimer)\b/iu,
]);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadProtectedPrefixes(registryPath = ARTIFACT_REGISTRY_PATH) {
  const registry = existsSync(registryPath) ? loadArtifactRegistry(registryPath) : {};
  return [...new Set([...(registry.protectedPrefixes || []), ...EXTRA_PROTECTED_PREFIXES])];
}

export function normalizeScanPath(inputPath, repoRoot = REPO_ROOT) {
  return normalizeRepoPath(inputPath, repoRoot);
}

export function isClaimGateProtectedPath(inputPath, options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const relPath = normalizeScanPath(inputPath, repoRoot);
  return isProtectedPath(relPath, options.protectedPrefixes || loadProtectedPrefixes(options.registryPath));
}

function collectScanFiles(inputPath, options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const protectedPrefixes = options.protectedPrefixes || loadProtectedPrefixes(options.registryPath);
  const relPath = normalizeScanPath(inputPath, repoRoot);
  const absPath = path.isAbsolute(inputPath) ? inputPath : path.join(repoRoot, inputPath);
  const blocked = [];
  const files = [];

  if (!relPath || relPath === '.') {
    blocked.push(blockedFinding(relPath, 'missing scan path'));
    return { files, blocked };
  }
  if (isProtectedPath(relPath, protectedPrefixes)) {
    blocked.push(blockedFinding(relPath, 'protected path refused before read'));
    return { files, blocked };
  }
  if (!existsSync(absPath)) {
    blocked.push(blockedFinding(relPath, 'path does not exist'));
    return { files, blocked };
  }

  const stat = statSync(absPath);
  if (stat.isFile()) {
    if (shouldScanFile(absPath, options.extensions)) files.push({ relPath, absPath });
    return { files, blocked };
  }
  if (!stat.isDirectory()) return { files, blocked };

  for (const entry of readdirSync(absPath, { withFileTypes: true })) {
    const childAbs = path.join(absPath, entry.name);
    const childRel = normalizeRepoPath(childAbs, repoRoot);
    if (isProtectedPath(childRel, protectedPrefixes)) continue;
    if (entry.isDirectory()) {
      const child = collectScanFiles(childAbs, { ...options, repoRoot, protectedPrefixes });
      files.push(...child.files);
      blocked.push(...child.blocked);
    } else if (entry.isFile() && shouldScanFile(childAbs, options.extensions)) {
      files.push({ relPath: childRel, absPath: childAbs });
    }
  }

  return { files, blocked };
}

function shouldScanFile(absPath, extensions = DEFAULT_SCAN_EXTENSIONS) {
  return (extensions || DEFAULT_SCAN_EXTENSIONS).has(path.extname(absPath));
}

function blockedFinding(relPath, reason) {
  return {
    path: relPath || '',
    line: 0,
    term: '',
    excerpt: '',
    severity: 'fail',
    supportStatus: 'blocked_protected_path',
    requiredSupport: ['unprotected readable source path'],
    detectedSupport: [],
    recommendation: reason,
  };
}

export function detectHighRiskTerms(line) {
  return HIGH_RISK_TERMS.filter(({ pattern }) => pattern.test(line)).map(({ term }) => term);
}

export function classifyClaimSupport({ term, line, context, path: relPath = '' }) {
  let detectedSupport = [];
  const text = String(context || line || '');
  const directLine = String(line || '');

  for (const support of EVIDENCE_PATTERNS) {
    if (support.pattern.test(text)) detectedSupport.push(support.label);
  }
  if (term === 'trusted' && !detectedSupport.includes('promotion_ladder_context')) {
    detectedSupport = detectedSupport.filter((label) => label !== 'canonical_promotion_state');
  }
  if (BOUNDARY_PATTERNS.some((pattern) => pattern.test(text))) {
    detectedSupport.push('explicit_boundary_or_negation');
  }
  if (isThirdPartyTrustedThreatDescription(term, directLine, relPath)) {
    detectedSupport.push('third_party_threat_description');
  }
  if (isInternalOsName(term, directLine, relPath)) {
    detectedSupport.push('internal_name_or_title');
  }

  const supportStatus = detectedSupport.length
    ? detectedSupport.includes('canonical_promotion_state') ||
      detectedSupport.includes('executable_test_reference') ||
      detectedSupport.includes('proof_state_qualified')
      ? 'supported'
      : 'qualified'
    : 'unsupported';

  return {
    supportStatus,
    severity: supportStatus === 'unsupported' ? 'fail' : 'info',
    detectedSupport,
    requiredSupport: [
      'canonical promotion state',
      'executable test reference',
      'artifact/report reference',
      'proof-state qualifier',
      'explicit advisory/research/fixture boundary',
    ],
  };
}

function isInternalOsName(term, line, relPath) {
  if (term !== 'OS') return false;
  const text = String(line || '');
  if (!/\bYURI[- ]OS\b/iu.test(text) && !/\bYURI OS\b/iu.test(relPath)) return false;
  return !/\b(?:literal|real|full|production|operating system|runs hardware|kernel)\b/iu.test(text);
}

function isThirdPartyTrustedThreatDescription(term, line, relPath) {
  if (term !== 'trusted') return false;
  const text = String(line || '');
  if (/\bYURI\b/iu.test(text)) return false;
  if (!String(relPath || '').includes('YURI_CYBER_INTELLIGENCE_MATRIX')) return false;
  return /\btrusted\s+(?:packages?|content|sources?|dependencies|workflows?|actions?|connectors?|tools?)\b/iu.test(text)
    && /\b(?:malicious|hijack|hijacks|compromise|poison|attacker|hostile|abuse)\b/iu.test(text);
}

function contextWindow(lines, index, radius = 3) {
  return lines.slice(Math.max(0, index - radius), Math.min(lines.length, index + radius + 1)).join('\n');
}

function scanFile(file, options = {}) {
  const text = readFileSync(file.absPath, 'utf8');
  const lines = text.split(/\r?\n/u);
  const findings = [];
  let supportedMatches = 0;
  let qualifiedMatches = 0;

  lines.forEach((line, index) => {
    for (const term of detectHighRiskTerms(line)) {
      const support = classifyClaimSupport({
        term,
        line,
        context: contextWindow(lines, index, options.contextRadius ?? 3),
        path: file.relPath,
      });
      if (support.supportStatus === 'supported') supportedMatches += 1;
      if (support.supportStatus === 'qualified') qualifiedMatches += 1;
      if (support.supportStatus !== 'unsupported' && !options.includeSupported) continue;
      findings.push({
        path: file.relPath,
        line: index + 1,
        term,
        excerpt: line.trim(),
        severity: support.severity,
        supportStatus: support.supportStatus,
        requiredSupport: support.requiredSupport,
        detectedSupport: support.detectedSupport,
        recommendation: support.supportStatus === 'unsupported'
          ? 'Add a promotion state, executable evidence, artifact reference, or explicit advisory/research/fixture boundary.'
          : 'No action required for this match.',
      });
    }
  });

  return { findings, supportedMatches, qualifiedMatches };
}

export function scanClaimIntegrity(paths, options = {}) {
  const inputPaths = Array.isArray(paths) ? paths : [paths].filter(Boolean);
  const scannedFiles = [];
  const blockedFindings = [];
  let supportedMatches = 0;
  let qualifiedMatches = 0;
  const findings = [];

  for (const inputPath of inputPaths) {
    const collected = collectScanFiles(inputPath, options);
    scannedFiles.push(...collected.files);
    blockedFindings.push(...collected.blocked);
  }

  for (const file of scannedFiles) {
    const result = scanFile(file, options);
    supportedMatches += result.supportedMatches;
    qualifiedMatches += result.qualifiedMatches;
    findings.push(...result.findings);
  }

  const allFindings = [...blockedFindings, ...findings];
  const failCount = allFindings.filter((finding) => finding.severity === 'fail').length;
  const warnCount = allFindings.filter((finding) => finding.severity === 'warn').length;

  return {
    schema: CLAIM_REPORT_SCHEMA,
    generatedAt: new Date().toISOString(),
    ok: failCount === 0,
    scannedPaths: scannedFiles.map((file) => file.relPath),
    terms: HIGH_RISK_TERMS.map((entry) => entry.term),
    summary: {
      filesScanned: scannedFiles.length,
      findings: allFindings.length,
      fail: failCount,
      warn: warnCount,
      supported: supportedMatches,
      qualified: qualifiedMatches,
      blocked: blockedFindings.length,
    },
    findings: allFindings,
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const paths = [];
  let json = false;
  let includeSupported = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') json = true;
    else if (arg === '--include-supported') includeSupported = true;
    else if (arg === '--path') paths.push(argv[++i]);
    else if (arg.startsWith('--path=')) paths.push(arg.slice('--path='.length));
    else if (arg === '--help' || arg === '-h') return { help: true, paths, json, includeSupported };
    else paths.push(arg);
  }
  return { paths: paths.filter(Boolean), json, includeSupported };
}

function renderTextReport(report) {
  const lines = [
    `${report.ok ? 'OK' : 'FAIL'} ${CLAIM_REPORT_SCHEMA}`,
    `files=${report.summary.filesScanned} findings=${report.summary.findings} fail=${report.summary.fail} supported=${report.summary.supported} qualified=${report.summary.qualified}`,
  ];
  for (const finding of report.findings) {
    lines.push(`${finding.severity.toUpperCase()} ${finding.path}:${finding.line} ${finding.term} ${finding.supportStatus}`);
    if (finding.excerpt) lines.push(`  ${finding.excerpt}`);
    lines.push(`  ${finding.recommendation}`);
  }
  return `${lines.join('\n')}\n`;
}

function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args.paths.length === 0) {
    process.stderr.write('Usage: node _SYSTEM/Scripts/claim-integrity-gate.mjs --path <file-or-dir> [--path <file-or-dir>] [--json]\n');
    process.exitCode = args.help ? 0 : 1;
    return;
  }
  const report = scanClaimIntegrity(args.paths, { includeSupported: args.includeSupported });
  process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : renderTextReport(report));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
