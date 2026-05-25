#!/usr/bin/env node
/**
 * YURI Cyber Proof Cards v0.
 *
 * Converts local fixture proof, threat rows, and Security Lens module context
 * into client-facing proof cards. The cards are deliberately scoped: they
 * explain what YURI can prove in owned/local fixtures now, what that means for
 * a buyer conversation, and what remains unproven.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadThreatIntelMatrix } from './threat-intel-kernel.mjs';
import { SECURITY_LENS_MODULES, buildSecurityLens } from './security-lens.mjs';
import { buildGuardrailProofMatrix } from './cyber-guardrail-proof.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_PROOF_CARDS_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'reports',
  'YURI_CYBER_PROOF_CARDS_2026-05-23.md',
);

const CLIENT_LENS_BY_RAIL = Object.freeze({
  'input-dialog-rail': {
    buyerClaim: 'YURI can detect prompt-injection-shaped instructions before they become execution authority.',
    demoStep: 'Replay direct and tool-output injection fixtures, then show the rail preserving non-executable user text.',
    nextProof: 'Expand the corpus with indirect web/doc injection and per-model regression history.',
  },
  'tool-input-output-rail': {
    buyerClaim: 'YURI can separate tool descriptions and tool output from trusted operator instructions.',
    demoStep: 'Show a malicious MCP tool schema and the benign control case side by side.',
    nextProof: 'Add real MCP connector manifests and capability-attestation checks from authorized stacks.',
  },
  'browser-action-boundary-rail': {
    buyerClaim: 'YURI can treat hostile DOM content as page content, not instructions for the browser agent.',
    demoStep: 'Open the owned fake portal fixture through browser-harness and show read-only DOM/CDP inspection blocking form-exfiltration authority.',
    nextProof: 'Expand browser-harness replay over richer fake SaaS flows with isolated profiles and provenance scoring.',
  },
  'retrieval-memory-provenance-rail': {
    buyerClaim: 'YURI can flag memory and retrieval poisoning before unsafe content is promoted into durable context.',
    demoStep: 'Run memory/RAG poisoning fixtures and show benign notes passing while hostile authority claims are quarantined.',
    nextProof: 'Provenance scores and multi-hop RAG conflict proof now exist; synthetic memory rollback proof now exists; next expand corpus coverage without touching live memory stores.',
  },
  'owned-lab-research-boundary-rail': {
    buyerClaim: 'YURI can document vulnerable owned lab patterns without crossing into unauthorized target activity.',
    demoStep: 'Show toy API authorization cases proving report-only behavior and no network execution.',
    nextProof: 'Attach a running local vulnerable API server and retest remediation evidence.',
  },
  'runtime-health-rail': {
    buyerClaim: 'YURI can distinguish safe local availability-pressure proof from external DDoS-like behavior.',
    demoStep: 'Show local-only pressure fixtures and the external-target denial case.',
    nextProof: 'Wire bounded localhost load checks into AutomationKernel health reports.',
  },
});

export function buildCyberProofCards(options = {}) {
  const threatIntel = options.threatIntel || loadThreatIntelMatrix(options);
  const securityLens = options.securityLens || buildSecurityLens({ threatIntel });
  const proofMatrix = options.proofMatrix || buildGuardrailProofMatrix(options);

  const threatById = new Map(threatIntel.rows.map((row) => [row.threat_id, row]));
  const moduleByThreat = mapSecurityLensModules(securityLens, threatIntel.rows);
  const cards = proofMatrix.proofs.map((proof) => buildProofCard(proof, threatById, moduleByThreat));
  const validation = validateCyberProofCards({ cards, threatIntel, securityLens, proofMatrix });

  return {
    schema: 'yuri.cyber-proof-cards.v0',
    generatedAt: new Date().toISOString(),
    source: {
      threatRows: threatIntel.rows.length,
      securityLensModules: securityLens.modules.length,
      proofRows: proofMatrix.proofs.length,
    },
    cards,
    validation,
    boundaries: [
      'owned-local-synthetic-or-explicitly-authorized-only',
      'fixture-proof-not-production-proof',
      'no SOC/SIEM/XDR/MDR/autonomous-pentest claim',
      'no external target scanning or exploitation claim',
    ],
  };
}

export function validateCyberProofCards(model) {
  const errors = [];
  const cards = model.cards || [];
  if (cards.length < 7) errors.push(`expected at least 7 proof cards, found ${cards.length}`);

  for (const card of cards) {
    if (!card.id) errors.push('card missing id');
    if (!card.title) errors.push(`${card.id} missing title`);
    if (!card.executive_claim) errors.push(`${card.id} missing executive_claim`);
    if (!card.technical_proof) errors.push(`${card.id} missing technical_proof`);
    if (!card.local_evidence?.executable_test) errors.push(`${card.id} missing executable_test`);
    if (!card.local_evidence?.fixture) errors.push(`${card.id} missing fixture`);
    if (!card.local_evidence?.passed_cases) errors.push(`${card.id} missing passed_cases`);
    if (!card.related_threats?.length) errors.push(`${card.id} missing related threats`);
    if (!card.source_evidence?.length) errors.push(`${card.id} missing source evidence`);
    if (!card.security_lens_modules?.length) errors.push(`${card.id} missing Security Lens module mapping`);
    if (!/fixture proof only/i.test(card.proof_boundary || '')) {
      errors.push(`${card.id} overclaims beyond fixture proof`);
    }
    if (containsForbiddenClaim(card)) {
      errors.push(`${card.id} contains forbidden platform maturity claim`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function renderCyberProofCardsMarkdown(model = buildCyberProofCards()) {
  const boundaryLines = model.boundaries.map((boundary) => `- ${boundary}`).join('\n');
  const cardSections = model.cards.map(renderProofCard).join('\n\n');
  return [
    '# YURI Cyber Proof Cards',
    '',
    `Generated: ${model.generatedAt}`,
    '',
    '## Purpose',
    '',
    'These cards translate YURI cyber fixture proof into buyer-readable evidence. They are for practical security review conversations: concrete enough to inspect, scoped enough to avoid overclaiming.',
    '',
    '## Boundaries',
    '',
    boundaryLines,
    '',
    '## Cards',
    '',
    cardSections,
    '',
  ].join('\n');
}

export function writeCyberProofCards(options = {}) {
  const reportPath = path.resolve(options.reportPath || DEFAULT_PROOF_CARDS_PATH);
  const model = buildCyberProofCards(options);
  if (!model.validation.ok) {
    throw new Error(`Cyber proof cards validation failed: ${model.validation.errors.join('; ')}`);
  }
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderCyberProofCardsMarkdown(model));
  return { ok: true, reportPath, model };
}

function buildProofCard(proof, threatById, moduleByThreat) {
  const clientLens = CLIENT_LENS_BY_RAIL[proof.proof_target] || {
    buyerClaim: 'YURI has local fixture proof for this rail.',
    demoStep: 'Show deterministic fixture results and the related threat rows.',
    nextProof: 'Promote the fixture into a broader authorized evaluation.',
  };
  const relatedThreats = proof.related_threats
    .map((id) => threatById.get(id))
    .filter(Boolean);
  const sourceEvidence = [...new Set(relatedThreats.flatMap((row) => row.evidence))];
  const modules = [...new Set(proof.related_threats.flatMap((id) => moduleByThreat.get(id) || []))];

  return {
    id: `proof-card-${proof.lab_id}`,
    title: proof.title,
    rail: proof.proof_target,
    status: proof.proof_state,
    executive_claim: clientLens.buyerClaim,
    technical_proof: `${proof.proof_results.filter((result) => result.ok).length}/${proof.proof_results.length} deterministic local fixture cases passed through ${proof.executable_test}.`,
    local_evidence: {
      fixture: proof.fixture,
      executable_test: proof.executable_test,
      passed_cases: proof.proof_results.filter((result) => result.ok).length,
      total_cases: proof.proof_results.length,
      sample_cases: proof.proof_results.slice(0, 3).map((result) => ({
        id: result.case_id,
        reason: result.reason,
      })),
    },
    related_threats: relatedThreats.map((row) => ({
      id: row.threat_id,
      threat: row.threat,
      domain: row.domain,
      customer_pain: row.customer_pain,
      report_section: row.report_section,
    })),
    source_evidence: sourceEvidence,
    security_lens_modules: modules,
    client_demo_step: clientLens.demoStep,
    next_proof: clientLens.nextProof,
    proof_boundary: proof.claim,
    safety_boundary: proof.safety_boundary,
  };
}

function mapSecurityLensModules(securityLens, threatRows = []) {
  const moduleByThreat = new Map();
  for (const module of securityLens.modules || []) {
    const items = [...(module.priority || []), ...(module.proofGaps || [])];
    for (const item of items) {
      const existing = moduleByThreat.get(item.threat_id) || [];
      moduleByThreat.set(item.threat_id, [...new Set([...existing, module.title])]);
    }
  }

  for (const row of threatRows) {
    for (const module of SECURITY_LENS_MODULES) {
      if (!matchesModuleDefinition(module, row)) continue;
      const existing = moduleByThreat.get(row.threat_id) || [];
      moduleByThreat.set(row.threat_id, [...new Set([...existing, module.title])]);
    }
  }

  return moduleByThreat;
}

function matchesModuleDefinition(module, row) {
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

function renderProofCard(card) {
  const threats = card.related_threats
    .map((threat) => `- ${threat.id} (${threat.domain}): ${threat.threat} - ${threat.customer_pain}`)
    .join('\n');
  const cases = card.local_evidence.sample_cases
    .map((testCase) => `- ${testCase.id}: ${testCase.reason}`)
    .join('\n');
  return [
    `### ${card.title}`,
    '',
    `Executive claim: ${card.executive_claim}`,
    '',
    `Technical proof: ${card.technical_proof}`,
    '',
    `Evidence: ${card.local_evidence.fixture}; ${card.local_evidence.executable_test}`,
    `Sources: ${card.source_evidence.join(', ')}`,
    `Security Lens modules: ${card.security_lens_modules.join(', ')}`,
    '',
    'Related threats:',
    threats || '- none',
    '',
    'Local case evidence:',
    cases || '- none',
    '',
    `Demo step: ${card.client_demo_step}`,
    '',
    `Next proof: ${card.next_proof}`,
    '',
    `Boundary: ${card.proof_boundary}`,
  ].join('\n');
}

function containsForbiddenClaim(card) {
  const text = JSON.stringify(card);
  return /mature\s+(SOC|SIEM|XDR|MDR)|autonomous pentest|production proof|external target exploitation|malware operation/iu.test(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--write')) {
    const result = writeCyberProofCards();
    process.stdout.write(`cyber_proof_cards=${path.relative(REPO_ROOT, result.reportPath)}\n`);
  } else if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(buildCyberProofCards(), null, 2)}\n`);
  } else {
    process.stdout.write(renderCyberProofCardsMarkdown());
  }
}
