#!/usr/bin/env node
/**
 * YURI Security Lens v0.
 *
 * Builds the first assessment/reporting surface from ThreatIntelKernel data.
 * This is not a SOC/SIEM/MDR claim and it does not scan external targets.
 * It turns source-backed threat rows into module queues, proof gaps, and
 * safe next actions for owned or explicitly authorized environments.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadThreatIntelMatrix } from './threat-intel-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_REPORT_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'reports',
  'YURI_SECURITY_LENS_V0_2026-05-22.md',
);

export const SECURITY_LENS_MODULES = Object.freeze([
  {
    id: 'agent-skill-mcp',
    title: 'Agent / Skill / MCP Scanner',
    domains: ['ai-attack', 'runtime'],
    keywords: [/mcp/u, /agent/u, /tool/u, /browser/u, /skill/u, /connector/u, /prompt/u],
    firstProof: 'Skill, MCP, browser-agent, and tool-route evidence review.',
  },
  {
    id: 'repo-supply-chain',
    title: 'Repo / Supply-Chain Scanner',
    domains: ['supply-chain', 'vulnerability', 'web', 'cloud', 'saas', 'infostealers'],
    keywords: [/repo/u, /package/u, /dependency/u, /ci\/cd/u, /github/u, /secret/u, /token/u, /api/u],
    firstProof: 'Repository, dependency, CI/CD, token, and web/API exposure review.',
  },
  {
    id: 'memory-rag',
    title: 'AI Memory / RAG Scanner',
    domains: ['memory'],
    keywords: [/memory/u, /rag/u, /retrieval/u, /corpus/u, /provenance/u],
    firstProof: 'Memory, retrieval, context, provenance, and poisoning-resistance review.',
  },
  {
    id: 'model-route-trust',
    title: 'Model Route / Trust Posture Inventory',
    domains: ['model-supply', 'regulation', 'business', 'identity', 'fraud'],
    keywords: [/model/u, /route/u, /provider/u, /jurisdiction/u, /regulation/u, /identity/u, /fraud/u, /oauth/u],
    firstProof: 'Model/provider routing, regional governance, identity, and SaaS trust review.',
  },
]);

export function buildSecurityLens(options = {}) {
  const threatIntel = options.threatIntel || loadThreatIntelMatrix(options);
  if (!threatIntel.ok) {
    throw new Error(`ThreatIntelKernel validation failed: ${threatIntel.validation.errors.join('; ')}`);
  }

  const modules = SECURITY_LENS_MODULES.map((module) => buildModule(module, threatIntel.rows));
  const crossModuleGaps = rankRows(threatIntel.rows)
    .filter((row) => row.decision === 'build' && row.missing_proof)
    .slice(0, 16)
    .map(toLensItem);

  return {
    schema: 'yuri.security-lens.v0',
    generatedAt: new Date().toISOString(),
    source: {
      threatIntelSchema: 'yuri.threat-intel-matrix.v1',
      rowCount: threatIntel.rows.length,
      buildRows: threatIntel.summary.buildRows,
      watchRows: threatIntel.summary.watchRows,
      sourceQualityCounts: threatIntel.summary.sourceQualityCounts,
    },
    modules,
    crossModuleGaps,
    boundaries: [
      'owned-local-synthetic-or-explicitly-authorized-only',
      'assessment-and-reporting-only-unless-authorized',
      'no SOC/SIEM/XDR/MDR/autonomous-pentest claim in v0',
      'no external target scanning from this report generator',
    ],
  };
}

export function renderSecurityLensMarkdown(lens = buildSecurityLens()) {
  const moduleSections = lens.modules.map(renderModule).join('\n\n');
  const gapLines = lens.crossModuleGaps
    .map((item) => `- ${item.threat_id} (${item.domain}): ${item.threat} - missing proof: ${item.missing_proof}`)
    .join('\n');
  const boundaryLines = lens.boundaries.map((entry) => `- ${entry}`).join('\n');

  return [
    '# YURI Security Lens v0',
    '',
    `Generated: ${lens.generatedAt}`,
    '',
    '## Scope',
    '',
    'Security Lens v0 translates the YURI cyber intelligence matrix into four assessment modules. It is a proof planner and report surface for owned or explicitly authorized systems; it is not a SOC, SIEM, XDR, MDR, malware operation, or autonomous pentest product.',
    '',
    '## Source',
    '',
    `- Threat rows: ${lens.source.rowCount}`,
    `- Build rows: ${lens.source.buildRows}`,
    `- Watch rows: ${lens.source.watchRows}`,
    `- Source quality counts: ${Object.entries(lens.source.sourceQualityCounts).map(([grade, count]) => `${grade}:${count}`).join(', ')}`,
    '',
    '## Modules',
    '',
    moduleSections,
    '',
    '## Highest Proof Gaps',
    '',
    gapLines || '- none',
    '',
    '## Boundaries',
    '',
    boundaryLines,
    '',
  ].join('\n');
}

export function writeSecurityLensReport(options = {}) {
  const reportPath = path.resolve(options.reportPath || DEFAULT_REPORT_PATH);
  const lens = buildSecurityLens(options);
  const markdown = renderSecurityLensMarkdown(lens);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, markdown);
  return { ok: true, reportPath, lens, markdown };
}

function buildModule(module, rows) {
  const matches = rankRows(rows.filter((row) => matchesModule(module, row)));
  const buildRows = matches.filter((row) => row.decision === 'build');
  const watchRows = matches.filter((row) => row.decision === 'watch');
  const priority = buildRows.slice(0, 8).map(toLensItem);
  const proofGaps = buildRows
    .filter((row) => row.missing_proof)
    .slice(0, 8)
    .map(toLensItem);

  return {
    id: module.id,
    title: module.title,
    firstProof: module.firstProof,
    totalRows: matches.length,
    buildRows: buildRows.length,
    watchRows: watchRows.length,
    priority,
    proofGaps,
    scannerRules: unique(buildRows.map((row) => row.scanner_rule).filter(Boolean)).slice(0, 12),
    guardrails: unique(buildRows.map((row) => row.guardrail).filter(Boolean)).slice(0, 12),
    labScenarios: unique(buildRows.map((row) => row.lab_scenario).filter(Boolean)).slice(0, 12),
    reportSections: unique(matches.map((row) => row.report_section).filter(Boolean)).slice(0, 12),
  };
}

function matchesModule(module, row) {
  if (module.domains.includes(row.domain_id)) return true;
  const text = [
    row.threat,
    row.customer_pain,
    row.yuri_capability,
    row.missing_proof,
    row.scanner_rule,
    row.guardrail,
    row.lab_scenario,
  ].join(' ').toLowerCase();
  return module.keywords.some((keyword) => keyword.test(text));
}

function rankRows(rows) {
  return [...rows].sort((left, right) => {
    const decisionDelta = decisionScore(right) - decisionScore(left);
    if (decisionDelta) return decisionDelta;
    const qualityDelta = right.source_quality.score - left.source_quality.score;
    if (qualityDelta) return qualityDelta;
    return left.number - right.number;
  });
}

function decisionScore(row) {
  if (row.decision === 'build') return 2;
  if (row.decision === 'watch') return 1;
  return 0;
}

function toLensItem(row) {
  return {
    threat_id: row.threat_id,
    domain: row.domain,
    threat: row.threat,
    regions: row.regions,
    evidence: row.evidence,
    source_score: row.source_quality.score,
    customer_pain: row.customer_pain,
    yuri_capability: row.yuri_capability,
    missing_proof: row.missing_proof,
    scanner_rule: row.scanner_rule,
    guardrail: row.guardrail,
    lab_scenario: row.lab_scenario,
    report_section: row.report_section,
    safety_boundary: row.safety_boundary,
  };
}

function renderModule(module) {
  const priorityLines = module.priority
    .map((item) => `- ${item.threat_id}: ${item.threat} (${item.report_section})`)
    .join('\n');
  return [
    `### ${module.title}`,
    '',
    `First proof: ${module.firstProof}`,
    '',
    `Rows: ${module.totalRows} total / ${module.buildRows} build / ${module.watchRows} watch`,
    '',
    `Scanner rules: ${module.scannerRules.join(', ') || 'none'}`,
    `Guardrails: ${module.guardrails.join(', ') || 'none'}`,
    `Labs: ${module.labScenarios.join(', ') || 'none'}`,
    '',
    'Priority queue:',
    priorityLines || '- none',
  ].join('\n');
}

function unique(values) {
  return [...new Set(values)];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const json = args.includes('--json');
  if (write) {
    const result = writeSecurityLensReport();
    process.stdout.write(`security_lens_report=${path.relative(REPO_ROOT, result.reportPath)}\n`);
  } else if (json) {
    process.stdout.write(`${JSON.stringify(buildSecurityLens(), null, 2)}\n`);
  } else {
    process.stdout.write(renderSecurityLensMarkdown());
  }
}
