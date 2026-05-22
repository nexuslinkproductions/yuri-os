#!/usr/bin/env node
/**
 * YURI ThreatIntelKernel.
 *
 * Converts the cyber intelligence matrix from Markdown into structured,
 * source-scored threat rows that later scanners, lab harnesses, guardrails,
 * and client reports can consume.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

export const DEFAULT_MATRIX_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'docs',
  'YURI_CYBER_INTELLIGENCE_MATRIX_2026-05-22.md',
);

export const DEFAULT_PROTOCOL_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'docs',
  'YURI_GLOBAL_CYBER_THREAT_INTEL_INGESTION_PROTOCOL_2026-05-22.md',
);

export const DEFAULT_EXPORT_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'data',
  'cyber-intel',
  'threat-intel-matrix.json',
);

const SOURCE_QUALITY = {
  S1: 'B',
  S2: 'B',
  S3: 'B',
  S4: 'B',
  S5: 'B',
  S6: 'A',
  S7: 'A',
  S8: 'A',
  S9: 'B',
  S10: 'B',
  S11: 'A',
  S12: 'A',
  S13: 'A',
  S14: 'A',
  S15: 'A',
  S16: 'C',
  S17: 'C',
  S18: 'A',
  S19: 'A',
  S20: 'A',
  S21: 'A',
  S22: 'A',
  S23: 'B',
  S24: 'B',
  S25: 'D',
  S26: 'A',
  S27: 'B',
};

const SOURCE_QUALITY_SCORE = {
  A: 1.0,
  B: 0.85,
  C: 0.7,
  D: 0.5,
  E: 0,
};

const DOMAIN_REPORT_SECTIONS = new Map([
  ['ransomware', 'resilience-and-extortion-risk'],
  ['infostealers', 'credential-and-session-risk'],
  ['identity', 'identity-and-access-risk'],
  ['fraud', 'fraud-and-social-engineering-risk'],
  ['cloud', 'cloud-and-iam-risk'],
  ['saas', 'saas-and-connector-risk'],
  ['supply-chain', 'supply-chain-and-ci-risk'],
  ['vulnerability', 'vulnerability-and-exposure-risk'],
  ['web', 'web-and-api-risk'],
  ['ddos', 'availability-and-resilience-risk'],
  ['ot-ics', 'industrial-and-ot-risk'],
  ['ai-attack', 'ai-agent-and-tool-risk'],
  ['memory', 'memory-and-rag-risk'],
  ['model-supply', 'model-route-and-provenance-risk'],
  ['regulation', 'regional-governance-risk'],
  ['business', 'business-readiness-and-buyer-risk'],
  ['runtime', 'runtime-monitoring-and-agent-ops-risk'],
]);

export function loadThreatIntelMatrix(options = {}) {
  const matrixPath = options.matrixPath || DEFAULT_MATRIX_PATH;
  const protocolPath = options.protocolPath || DEFAULT_PROTOCOL_PATH;
  if (!existsSync(matrixPath)) throw new Error(`matrix file missing: ${matrixPath}`);
  if (!existsSync(protocolPath)) throw new Error(`protocol file missing: ${protocolPath}`);

  const matrixMarkdown = readFileSync(matrixPath, 'utf8');
  const protocolMarkdown = readFileSync(protocolPath, 'utf8');
  const sources = parseSourceRegistry(matrixMarkdown);
  const rawRows = parseThreatRows(matrixMarkdown);
  const rows = rawRows.map((row) => normalizeThreatRow(row, sources));
  const validation = validateThreatIntel({ rows, sources, protocolMarkdown });

  return {
    ok: validation.ok,
    matrixPath,
    protocolPath,
    generatedAt: new Date().toISOString(),
    sources,
    rows,
    validation,
    summary: summarizeThreatIntel(rows),
  };
}

export function parseSourceRegistry(markdown) {
  const rows = parseMarkdownTable(markdown, ['ID', 'Source']);
  const sources = {};
  for (const row of rows) {
    const id = row.ID;
    if (!/^S\d+$/u.test(id)) continue;
    const source = row.Source;
    sources[id] = {
      id,
      source,
      url: extractFirstUrl(source),
      quality: SOURCE_QUALITY[id] || inferSourceQuality(source),
      local: /_SYSTEM\//u.test(source),
    };
    sources[id].score = SOURCE_QUALITY_SCORE[sources[id].quality] ?? 0;
  }
  return sources;
}

export function parseThreatRows(markdown) {
  return parseMarkdownTable(markdown, [
    '#',
    'Domain',
    'Threat',
    'Regions',
    'Evidence',
    'Customer Pain',
    'YURI Capability',
    'Missing Proof',
    'Action',
  ]).map((row) => ({
    number: Number(row['#']),
    domain: row.Domain,
    threat: row.Threat,
    regions: row.Regions,
    evidence: row.Evidence,
    customerPain: row['Customer Pain'],
    yuriCapability: row['YURI Capability'],
    missingProof: row['Missing Proof'],
    action: row.Action,
  })).filter((row) => Number.isInteger(row.number));
}

export function normalizeThreatRow(row, sources = {}) {
  const evidenceIds = parseEvidenceIds(row.evidence);
  const sourceQualities = evidenceIds.map((id) => sources[id]?.quality || 'E');
  const sourceScore = evidenceIds.length
    ? evidenceIds.reduce((sum, id) => sum + (sources[id]?.score ?? 0), 0) / evidenceIds.length
    : 0;
  const domainId = slug(row.domain);
  const decision = inferDecision(row.action);
  const mappings = inferYuriMappings({
    ...row,
    domainId,
    decision,
    regions: parseRegions(row.regions),
  });

  return {
    threat_id: `CY-${String(row.number).padStart(3, '0')}`,
    number: row.number,
    domain: row.domain,
    domain_id: domainId,
    threat: row.threat,
    regions: parseRegions(row.regions),
    evidence: evidenceIds,
    source_quality: {
      grades: sourceQualities,
      score: Number(sourceScore.toFixed(3)),
      minimum: weakestQuality(sourceQualities),
    },
    customer_pain: row.customerPain,
    yuri_capability: row.yuriCapability,
    missing_proof: row.missingProof,
    lab_scenario: mappings.labScenario,
    scanner_rule: mappings.scannerRule,
    guardrail: mappings.guardrail,
    report_section: mappings.reportSection,
    decision,
    action: row.action,
    safety_boundary: mappings.safetyBoundary,
  };
}

export function validateThreatIntel(model, options = {}) {
  const minRows = options.minRows || 80;
  const rows = model.rows || [];
  const sources = model.sources || {};
  const errors = [];
  const warnings = [];

  if (rows.length < minRows) errors.push(`expected at least ${minRows} threat rows, found ${rows.length}`);

  for (const row of rows) {
    if (!row.threat_id) errors.push(`row ${row.number} missing threat_id`);
    if (!['build', 'watch', 'reject'].includes(row.decision)) {
      errors.push(`${row.threat_id} has invalid decision ${row.decision}`);
    }
    if (!row.report_section) errors.push(`${row.threat_id} missing report_section`);
    if (!row.evidence.length) errors.push(`${row.threat_id} missing evidence`);
    for (const sourceId of row.evidence) {
      if (!sources[sourceId]) errors.push(`${row.threat_id} references unknown source ${sourceId}`);
    }
    if (row.decision === 'build' && !row.lab_scenario && !row.scanner_rule && !row.guardrail) {
      errors.push(`${row.threat_id} is build-scoped but has no lab/scanner/guardrail mapping`);
    }
    if (isOffensiveDomain(row) && !/owned|authorized|synthetic|local|toy|consent/u.test(row.safety_boundary || '')) {
      errors.push(`${row.threat_id} offensive-relevant row missing safe lab boundary`);
    }
    if (row.decision === 'watch' && /build now|build$/iu.test(row.action)) {
      warnings.push(`${row.threat_id} is watch-scoped but action text may imply build`);
    }
  }

  const summary = summarizeThreatIntel(rows);
  for (const requiredRegion of ['europe', 'west', 'asia']) {
    if (!summary.regionCounts[requiredRegion]) errors.push(`missing first-class region coverage: ${requiredRegion}`);
  }
  for (const requiredDomain of ['ai-attack', 'memory', 'supply-chain', 'identity', 'ransomware']) {
    if (!summary.domainCounts[requiredDomain]) errors.push(`missing required domain: ${requiredDomain}`);
  }

  const forbiddenClaims = /mature\s+(SOC|SIEM|XDR|MDR)|autonomous pentest|legal compliance guarantee/iu;
  const claimText = rows.map((row) => [row.yuri_capability, row.action, row.report_section].join(' ')).join('\n');
  if (forbiddenClaims.test(claimText)) {
    errors.push('matrix contains premature mature-platform claim');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    rowCount: rows.length,
    checkedAt: new Date().toISOString(),
  };
}

export function summarizeThreatIntel(rows) {
  const decisionCounts = countBy(rows, (row) => row.decision);
  const domainCounts = countBy(rows, (row) => row.domain_id);
  const regionCounts = {};
  for (const row of rows) {
    for (const region of row.regions) {
      regionCounts[region] = (regionCounts[region] || 0) + 1;
    }
  }
  const sourceQualityCounts = {};
  for (const row of rows) {
    for (const grade of row.source_quality.grades) {
      sourceQualityCounts[grade] = (sourceQualityCounts[grade] || 0) + 1;
    }
  }

  return {
    totalRows: rows.length,
    buildRows: decisionCounts.build || 0,
    watchRows: decisionCounts.watch || 0,
    rejectRows: decisionCounts.reject || 0,
    decisionCounts,
    domainCounts,
    regionCounts,
    sourceQualityCounts,
    topBuildRows: rows
      .filter((row) => row.decision === 'build')
      .sort((a, b) => b.source_quality.score - a.source_quality.score)
      .slice(0, 12)
      .map((row) => ({
        threat_id: row.threat_id,
        domain: row.domain,
        threat: row.threat,
        source_score: row.source_quality.score,
        report_section: row.report_section,
      })),
  };
}

export function exportThreatIntelJson(model, exportPath = DEFAULT_EXPORT_PATH) {
  mkdirSync(path.dirname(exportPath), { recursive: true });
  const payload = {
    schema: 'yuri.threat-intel-matrix.v1',
    generatedAt: model.generatedAt,
    matrixPath: path.relative(REPO_ROOT, model.matrixPath),
    protocolPath: path.relative(REPO_ROOT, model.protocolPath),
    validation: model.validation,
    summary: model.summary,
    sources: model.sources,
    threats: model.rows,
  };
  writeFileSync(exportPath, `${JSON.stringify(payload, null, 2)}\n`);
  return exportPath;
}

function parseMarkdownTable(markdown, expectedHeaders) {
  const lines = markdown.split(/\r?\n/u);
  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    const headers = splitMarkdownRow(lines[i]);
    if (!sameHeaders(headers, expectedHeaders)) continue;
    i += 2;
    for (; i < lines.length; i += 1) {
      const cells = splitMarkdownRow(lines[i]);
      if (!cells.length || cells.length < expectedHeaders.length) break;
      const row = {};
      expectedHeaders.forEach((header, index) => {
        row[header] = cells[index] || '';
      });
      rows.push(row);
    }
  }
  return rows;
}

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return [];
  const body = trimmed.slice(1, -1);
  return body.split('|').map((cell) => cell.trim());
}

function sameHeaders(actual, expected) {
  if (actual.length < expected.length) return false;
  return expected.every((header, index) => actual[index] === header);
}

function parseEvidenceIds(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseRegions(value) {
  const text = String(value || '').toLowerCase();
  const regions = new Set();
  if (/global/u.test(text)) regions.add('global');
  if (/europe|dach|switzerland|swiss|eu\b/u.test(text)) regions.add('europe');
  if (/west|us\b|u\.s\.|uk\b|canada|hyperscaler/u.test(text)) regions.add('west');
  if (/asia|apac|china|japan|korea|singapore|india|taiwan|sea|china-linked/u.test(text)) regions.add('asia');
  if (/yuri|internal/u.test(text)) regions.add('internal');
  if (!regions.size) regions.add('unknown');
  return [...regions];
}

function inferDecision(action) {
  const text = String(action || '').toLowerCase();
  if (/reject/u.test(text)) return 'reject';
  if (/watch-only|^watch\b|watch then/u.test(text)) return 'watch';
  if (/build|add|expand|map/u.test(text)) return 'build';
  return 'watch';
}

function inferYuriMappings(row) {
  const text = [
    row.domain,
    row.threat,
    row.yuriCapability,
    row.missingProof,
    row.action,
  ].join(' ').toLowerCase();
  const reportSection = DOMAIN_REPORT_SECTIONS.get(row.domainId) || `${row.domainId}-risk`;
  const labScenario = inferLabScenario(text, row.domainId);
  const scannerRule = inferScannerRule(text, row.domainId);
  const guardrail = inferGuardrail(text, row.domainId);
  const safetyBoundary = inferSafetyBoundary(row.domainId, text);

  return {
    reportSection,
    labScenario,
    scannerRule,
    guardrail,
    safetyBoundary,
  };
}

function inferLabScenario(text, domainId) {
  if (/mcp|tool poisoning|capability attestation/u.test(text)) return 'local-mcp-tool-poisoning-lab';
  if (/prompt injection|jailbreak|indirect prompt/u.test(text)) return 'synthetic-prompt-injection-replay-lab';
  if (/browser|form exfiltration|session token/u.test(text)) return 'owned-browser-agent-compromise-lab';
  if (/memory poisoning/u.test(text)) return 'synthetic-memory-poisoning-lab';
  if (/rag|retrieval/u.test(text)) return 'synthetic-rag-poisoning-lab';
  if (/ci\/cd|github action|package|dependency|supply/u.test(text)) return 'local-supply-chain-ci-lab';
  if (/vulnerability research|benchmark|exploit/u.test(text)) return 'owned-vulnerability-research-benchmark-lab';
  if (/api authorization|vulnerable api|sqli|xss|ssrf|path traversal|web bug/u.test(text)) return 'owned-vulnerable-web-api-lab';
  if (/ddos|load test|availability/u.test(text)) return 'local-only-load-test-lab';
  if (/ot|ics|industrial|manufacturing/u.test(text)) return 'toy-ot-ics-simulation-lab';
  if (/phishing|deepfake|mfa fatigue/u.test(text)) return 'consent-only-social-engineering-simulation';
  if (/malware|infostealer|stealer/u.test(text)) return 'isolated-malware-behavior-lab';
  if (['ai-attack', 'memory', 'runtime'].includes(domainId)) return 'synthetic-agent-security-lab';
  return null;
}

function inferScannerRule(text, domainId) {
  if (/secret|api key|token|credential/u.test(text)) return 'secret-and-token-exposure-rule';
  if (/mcp|tool|connector|oauth|saas/u.test(text)) return 'agent-tool-connector-manifest-rule';
  if (/package|dependency|github action|workflow|ci\/cd|repo/u.test(text)) return 'repo-supply-chain-rule';
  if (/memory|rag|retrieval|corpus/u.test(text)) return 'memory-rag-provenance-rule';
  if (/model route|provider|jurisdiction|sovereignty|shadow ai/u.test(text)) return 'model-route-trust-posture-rule';
  if (/gdpr|revfadp|data handling|data-classifier|personal data/u.test(text)) return 'data-flow-classification-rule';
  if (/ai verify|assurance|regulation|tc260|nis2|dora|eu ai act|procurement|zero trust/u.test(text)) return 'regional-governance-mapping-rule';
  if (/browser|session/u.test(text)) return 'browser-session-isolation-rule';
  if (['supply-chain', 'saas', 'model-supply', 'runtime'].includes(domainId)) return `${domainId}-inventory-rule`;
  return null;
}

function inferGuardrail(text, domainId) {
  if (/command|terminal|shell/u.test(text)) return 'execution-output-trust-rail';
  if (/tool output|tool invocation|cross-tool|mcp|connector/u.test(text)) return 'tool-input-output-rail';
  if (/prompt|jailbreak|instruction/u.test(text)) return 'input-dialog-rail';
  if (/memory|rag|retrieval|corpus|context/u.test(text)) return 'retrieval-memory-provenance-rail';
  if (/browser|form|session/u.test(text)) return 'browser-action-boundary-rail';
  if (/model route|provider|jurisdiction/u.test(text)) return 'model-route-rail';
  if (/gdpr|revfadp|data handling|personal data/u.test(text)) return 'privacy-and-data-route-rail';
  if (/ai verify|assurance|regulation|tc260|nis2|dora|eu ai act|procurement|zero trust/u.test(text)) return 'regional-governance-evidence-rail';
  if (/vulnerability research|benchmark|exploit/u.test(text)) return 'owned-lab-research-boundary-rail';
  if (/telemetry|stale|health|retry|autonomous/u.test(text)) return 'runtime-health-rail';
  if (['ai-attack', 'memory', 'runtime', 'model-supply'].includes(domainId)) return `${domainId}-guardrail`;
  return null;
}

function inferSafetyBoundary(domainId, text) {
  if (isOffensiveDomain({ domain_id: domainId }) || /lab|exploit|malware|ddos|phishing|exfiltration/u.test(text)) {
    return 'owned-local-synthetic-or-explicitly-authorized-only';
  }
  return 'assessment-and-reporting-only-unless-authorized';
}

function isOffensiveDomain(row) {
  return ['ai-attack', 'memory', 'web', 'cloud', 'supply-chain', 'ddos', 'ot-ics', 'infostealers', 'fraud', 'runtime'].includes(row.domain_id);
}

function inferSourceQuality(source) {
  const text = String(source || '').toLowerCase();
  if (/cisa|nist|enisa|cert|fbi|regulator|meti|imda|tc260/u.test(text)) return 'A';
  if (/microsoft|google|crowdstrike|fortinet|cloudflare|ibm|verizon|anthropic|openai/u.test(text)) return 'B';
  if (/arxiv|paper/u.test(text)) return 'C';
  return 'D';
}

function extractFirstUrl(value) {
  const match = String(value || '').match(/https?:\/\/\S+/u);
  return match ? match[0] : null;
}

function weakestQuality(grades) {
  const order = ['A', 'B', 'C', 'D', 'E'];
  return grades.reduce((weakest, grade) => (order.indexOf(grade) > order.indexOf(weakest) ? grade : weakest), 'A');
}

function countBy(rows, fn) {
  return rows.reduce((counts, row) => {
    const key = fn(row);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

function printSummary(model) {
  process.stdout.write(`${JSON.stringify(model.summary, null, 2)}\n`);
}

function printValidation(model) {
  if (!model.validation.ok) {
    process.stderr.write(`${model.validation.errors.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`THREAT_INTEL_KERNEL_PASS rows=${model.rows.length} build=${model.summary.buildRows} watch=${model.summary.watchRows}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const model = loadThreatIntelMatrix();
  if (args.includes('--export-json')) {
    const index = args.indexOf('--export-json');
    const exportPath = args[index + 1] && !args[index + 1].startsWith('--')
      ? path.resolve(args[index + 1])
      : DEFAULT_EXPORT_PATH;
    const written = exportThreatIntelJson(model, exportPath);
    process.stdout.write(`threat_intel_export=${path.relative(REPO_ROOT, written)}\n`);
  }
  if (args.includes('--summary') || args.length === 0) printSummary(model);
  if (args.includes('--validate')) printValidation(model);
}
