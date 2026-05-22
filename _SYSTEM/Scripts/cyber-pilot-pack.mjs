#!/usr/bin/env node
/**
 * YURI Cyber Pilot Pack v0.
 *
 * Generates the C6-C8 decision artifacts:
 * - Upgreat pilot readiness
 * - Europe/West/Asia regional intelligence packs
 * - Managed operations pre-study
 *
 * This is a planning/reporting layer, not a claim of mature managed security
 * operations.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSecurityLens } from './security-lens.mjs';
import { loadThreatIntelMatrix } from './threat-intel-kernel.mjs';
import { buildGuardrailProofMatrix } from './cyber-guardrail-proof.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_UPGREAT_PATH = path.join(REPO_ROOT, '_SYSTEM', 'reports', 'YURI_UPGREAT_PILOT_READINESS_2026-05-22.md');
export const DEFAULT_REGIONAL_PATH = path.join(REPO_ROOT, '_SYSTEM', 'reports', 'YURI_REGIONAL_INTELLIGENCE_PACKS_2026-05-22.md');
export const DEFAULT_MANAGED_OPS_PATH = path.join(REPO_ROOT, '_SYSTEM', 'docs', 'YURI_MANAGED_OPERATIONS_PRE_STUDY_2026-05-22.md');

const REGION_COPY = Object.freeze({
  europe: {
    title: 'Europe / DACH / Switzerland',
    buyerLanguage: 'Evidence, data handling, sober scope, partner augmentation, NIS2/DORA/GDPR/revFADP alignment.',
  },
  west: {
    title: 'West / US / UK / Canada',
    buyerLanguage: 'Identity, SaaS, cloud, incident economics, AI governance fatigue, provider trust posture.',
  },
  asia: {
    title: 'Asia / APAC',
    buyerLanguage: 'Model diversity, data routing, AI assurance, Japan/Korea industrial security, Singapore testing, China regulatory divergence.',
  },
});

export function buildCyberPilotPack(options = {}) {
  const threatIntel = options.threatIntel || loadThreatIntelMatrix(options);
  const securityLens = options.securityLens || buildSecurityLens({ threatIntel });
  const proofMatrix = options.proofMatrix || buildGuardrailProofMatrix();
  const validation = validatePilotInputs({ threatIntel, securityLens, proofMatrix });

  return {
    schema: 'yuri.cyber-pilot-pack.v0',
    generatedAt: new Date().toISOString(),
    validation,
    upgreat: buildUpgreatPilot({ threatIntel, securityLens, proofMatrix }),
    regional: buildRegionalPacks(threatIntel),
    managedOps: buildManagedOpsPreStudy({ threatIntel, securityLens, proofMatrix }),
  };
}

export function validatePilotInputs({ threatIntel, securityLens, proofMatrix }) {
  const errors = [];
  if (!threatIntel?.ok) errors.push('ThreatIntelKernel must validate before pilot pack generation');
  if (threatIntel?.rows?.length < 80) errors.push('pilot pack requires at least 80 threat rows');
  if ((securityLens?.modules || []).length !== 4) errors.push('Security Lens must expose four modules');
  for (const proof of proofMatrix?.proofs || []) {
    if (proof.proof_state === 'proven' && !proof.executable_test) {
      errors.push(`proven rail without executable test: ${proof.lab_id || 'unknown'}`);
    }
    if (proof.proof_state === 'proven' && !/fixture proof only/i.test(proof.claim || '')) {
      errors.push(`proven rail overclaims beyond local fixture proof: ${proof.lab_id || 'unknown'}`);
    }
  }
  for (const region of ['europe', 'west', 'asia']) {
    if (!threatIntel?.summary?.regionCounts?.[region]) errors.push(`missing regional coverage: ${region}`);
  }
  return { ok: errors.length === 0, errors };
}

export function writeCyberPilotPack(options = {}) {
  const pack = buildCyberPilotPack(options);
  if (!pack.validation.ok) {
    throw new Error(`Cyber pilot pack validation failed: ${pack.validation.errors.join('; ')}`);
  }
  const upgreatPath = path.resolve(options.upgreatPath || DEFAULT_UPGREAT_PATH);
  const regionalPath = path.resolve(options.regionalPath || DEFAULT_REGIONAL_PATH);
  const managedOpsPath = path.resolve(options.managedOpsPath || DEFAULT_MANAGED_OPS_PATH);
  writeMarkdown(upgreatPath, renderUpgreatPilot(pack.upgreat, pack));
  writeMarkdown(regionalPath, renderRegionalPacks(pack.regional, pack));
  writeMarkdown(managedOpsPath, renderManagedOps(pack.managedOps, pack));
  return { ok: true, pack, upgreatPath, regionalPath, managedOpsPath };
}

function buildUpgreatPilot({ threatIntel, securityLens, proofMatrix }) {
  const moduleSummaries = securityLens.modules.map((module) => ({
    id: module.id,
    title: module.title,
    firstProof: module.firstProof,
    priority: module.priority.slice(0, 5).map((item) => `${item.threat_id} ${item.threat}`),
    rules: module.scannerRules.slice(0, 6),
    guardrails: module.guardrails.slice(0, 6),
  }));
  return {
    objective: 'Show YURI as an AI-agent security assessment and hardening system for owned or explicitly authorized environments.',
    buyerFit: [
      'Upgreat gets a concrete AI security assessment surface without buying a fake black-box SOC story.',
      'The first pilot narrows to agent/tool/browser/memory/model-route risk because that is where YURI already has substrate.',
      'Cyber company direction remains larger, but the meeting should sell the first proof, not the entire future.',
    ],
    demoFlow: [
      'Start with the threat matrix: why AI-agent, identity, SaaS, and memory/RAG risk are converging now.',
      'Show Security Lens modules and priority queues.',
      'Show lab harness fixtures and proof matrix, explicitly noting proven local fixture behavior versus production proof.',
      'Close with a pilot proposal: assess a bounded owned AI-agent/workflow surface and produce executive plus technical findings.',
    ],
    moduleSummaries,
    proofStatus: {
      threatRows: threatIntel.rows.length,
      buildRows: threatIntel.summary.buildRows,
      fixtureReadyRails: proofMatrix.validation.fixtureReady,
      provenRails: proofMatrix.validation.proven,
    },
    hardBoundaries: [
      'No production penetration test claim yet.',
      'No malware execution.',
      'No DDoS beyond local owned load tests.',
      'No legal compliance guarantee.',
      'No SOC/SIEM/XDR/MDR maturity claim.',
    ],
  };
}

function buildRegionalPacks(threatIntel) {
  return Object.entries(REGION_COPY).map(([region, meta]) => {
    const rows = threatIntel.rows
      .filter((row) => row.regions.includes(region))
      .sort((left, right) => {
        const qualityDelta = right.source_quality.score - left.source_quality.score;
        return qualityDelta || left.number - right.number;
      })
      .slice(0, 12);
    return {
      region,
      ...meta,
      rowCount: threatIntel.summary.regionCounts[region] || 0,
      topThreats: rows.map((row) => ({
        threat_id: row.threat_id,
        domain: row.domain,
        threat: row.threat,
        customer_pain: row.customer_pain,
        report_section: row.report_section,
      })),
    };
  });
}

function buildManagedOpsPreStudy({ threatIntel, securityLens, proofMatrix }) {
  return {
    currentState: 'Not ready to claim managed security operations.',
    prerequisites: [
      'Client telemetry schema and consent model.',
      'Incident intake and escalation runbooks.',
      'Legal/compliance partner boundaries.',
      'Continuous evidence ingestion and source refresh.',
      'Broader executable guardrail tests beyond local fixture proof, including client-safe replay and retest proof.',
      'Operational health metrics for stale jobs, lane failures, and report freshness.',
    ],
    futureOperatingLoops: [
      'Intelligence refresh -> Security Lens reprioritization.',
      'Lab fixture -> deterministic rail test -> client-safe finding.',
      'Client report -> remediation task -> retest proof.',
      'Telemetry event -> triage -> escalation or watch-only.',
    ],
    notYet: [
      '24/7 SOC claim',
      'SIEM replacement',
      'MDR/XDR replacement',
      'Autonomous offensive operations',
      'Regulatory compliance guarantee',
    ],
    evidenceCounts: {
      threatRows: threatIntel.rows.length,
      modules: securityLens.modules.length,
      fixtureReadyRails: proofMatrix.validation.fixtureReady,
      provenRails: proofMatrix.validation.proven,
    },
  };
}

function renderUpgreatPilot(upgreat, pack) {
  return [
    '# YURI Upgreat Pilot Readiness',
    '',
    `Generated: ${pack.generatedAt}`,
    '',
    '## Objective',
    '',
    upgreat.objective,
    '',
    '## Buyer Fit',
    '',
    list(upgreat.buyerFit),
    '',
    '## Demo Flow',
    '',
    list(upgreat.demoFlow),
    '',
    '## Module Story',
    '',
    upgreat.moduleSummaries.map((module) => [
      `### ${module.title}`,
      '',
      `First proof: ${module.firstProof}`,
      '',
      `Priority: ${module.priority.join('; ')}`,
      '',
      `Rules: ${module.rules.join(', ')}`,
      `Guardrails: ${module.guardrails.join(', ')}`,
    ].join('\n')).join('\n\n'),
    '',
    '## Proof Status',
    '',
    `- Threat rows: ${upgreat.proofStatus.threatRows}`,
    `- Build rows: ${upgreat.proofStatus.buildRows}`,
    `- Fixture-ready rails: ${upgreat.proofStatus.fixtureReadyRails}`,
    `- Proven rails: ${upgreat.proofStatus.provenRails}`,
    '',
    '## Hard Boundaries',
    '',
    list(upgreat.hardBoundaries),
    '',
  ].join('\n');
}

function renderRegionalPacks(regional, pack) {
  return [
    '# YURI Regional Intelligence Packs',
    '',
    `Generated: ${pack.generatedAt}`,
    '',
    regional.map((region) => [
      `## ${region.title}`,
      '',
      `Buyer language: ${region.buyerLanguage}`,
      '',
      `Matrix rows: ${region.rowCount}`,
      '',
      'Top threats:',
      region.topThreats.map((row) => `- ${row.threat_id} (${row.domain}): ${row.threat} - ${row.customer_pain}`).join('\n'),
    ].join('\n')).join('\n\n'),
    '',
  ].join('\n');
}

function renderManagedOps(managedOps, pack) {
  return [
    '# YURI Managed Operations Pre-Study',
    '',
    `Generated: ${pack.generatedAt}`,
    '',
    '## Current State',
    '',
    managedOps.currentState,
    '',
    '## Prerequisites',
    '',
    list(managedOps.prerequisites),
    '',
    '## Future Operating Loops',
    '',
    list(managedOps.futureOperatingLoops),
    '',
    '## Not Yet',
    '',
    list(managedOps.notYet),
    '',
    '## Evidence Counts',
    '',
    Object.entries(managedOps.evidenceCounts).map(([key, value]) => `- ${key}: ${value}`).join('\n'),
    '',
  ].join('\n');
}

function writeMarkdown(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function list(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) {
    const result = writeCyberPilotPack();
    process.stdout.write(`upgreat_pilot=${path.relative(REPO_ROOT, result.upgreatPath)}\n`);
    process.stdout.write(`regional_pack=${path.relative(REPO_ROOT, result.regionalPath)}\n`);
    process.stdout.write(`managed_ops=${path.relative(REPO_ROOT, result.managedOpsPath)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(buildCyberPilotPack(), null, 2)}\n`);
  }
}
