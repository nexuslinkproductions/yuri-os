#!/usr/bin/env node
/**
 * YURI Upgreat Meeting Packet v0.
 *
 * Builds a meeting-ready packet from the cyber pilot pack and proof cards.
 * This is the bridge from internal proof artifacts to a sober client
 * conversation: what to show, what to say, what not to claim, and what pilot
 * scope to propose.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCyberPilotPack } from './cyber-pilot-pack.mjs';
import { buildCyberProofCards } from './cyber-proof-cards.mjs';
import { buildCyberRetestProof } from './cyber-retest-proof.mjs';
import { buildCyberProvenanceScore } from './cyber-provenance-score.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_MEETING_PACKET_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'reports',
  'YURI_UPGREAT_MEETING_PACKET_2026-05-23.md',
);

const DEMO_PRIORITY = Object.freeze([
  'proof-card-prompt-injection-replay',
  'proof-card-malicious-mcp-tool-schema',
  'proof-card-browser-agent-fake-portal',
  'proof-card-memory-poisoning-corpus',
  'proof-card-rag-poisoning-corpus',
  'proof-card-vulnerable-api-cases',
  'proof-card-local-load-test-plan',
]);

export function buildCyberMeetingPack(options = {}) {
  const pilotPack = options.pilotPack || buildCyberPilotPack(options);
  const proofCards = options.proofCards || buildCyberProofCards(options);
  const retestProof = options.retestProof || buildCyberRetestProof(options);
  const provenanceProof = options.provenanceProof || buildCyberProvenanceScore(options);
  const cardById = new Map(proofCards.cards.map((card) => [card.id, card]));
  const demoOrder = DEMO_PRIORITY.map((id) => cardById.get(id)).filter(Boolean).map(toDemoStep);
  const retestSummary = summarizeRetestProof(retestProof);
  const provenanceSummary = summarizeProvenanceProof(provenanceProof);

  const packet = {
    schema: 'yuri.upgreat-meeting-packet.v0',
    generatedAt: new Date().toISOString(),
    objective: 'Position YURI as an evidence-first AI security assessment and hardening system for a bounded Upgreat pilot.',
    opener: [
      'YURI is not being sold as a finished SOC or autonomous pentest product.',
      'The first proof is narrower and stronger: AI-agent, MCP, browser, memory/RAG, model-route, and tool-use risk.',
      'Every claim shown here is tied to local fixture proof, source-backed threat rows, and a next proof step.',
    ],
    executiveVersion: buildExecutiveVersion(pilotPack, proofCards, retestSummary),
    technicalVersion: buildTechnicalVersion(proofCards, retestSummary),
    retestProof: retestSummary,
    provenanceProof: provenanceSummary,
    liveDemoOrder: demoOrder,
    pilotScope: buildPilotScope(),
    questionsForUpgreat: [
      'Which AI-agent, automation, browser, or SaaS workflows are already being tested internally?',
      'Where do current agent experiments break down: tool safety, memory, browser actions, identity, reporting, or governance?',
      'What client environments would be safe for a bounded, read-only assessment first?',
      'Which compliance or buyer language matters most for their cybersecurity customers: NIS2, GDPR/revFADP, EU AI Act, baseline security, or operational resilience?',
      'Who owns remediation after a finding: Upgreat, client IT, or a joint pilot team?',
    ],
    hardBoundaries: [
      'No production penetration test claim.',
      'No malware execution.',
      'No DDoS or load testing outside local owned systems.',
      'No legal compliance guarantee.',
      'No SOC/SIEM/XDR/MDR maturity claim.',
      'No scanning client or third-party systems without explicit written authorization and scope.',
    ],
  };
  packet.validation = validateCyberMeetingPack(packet);
  return packet;
}

export function validateCyberMeetingPack(packet) {
  const errors = [];
  if (!packet.executiveVersion?.length) errors.push('missing executive version');
  if (!packet.technicalVersion?.length) errors.push('missing technical version');
  if ((packet.liveDemoOrder || []).length < 5) errors.push('expected at least 5 live demo steps');
  if ((packet.questionsForUpgreat || []).length < 5) errors.push('expected at least 5 Upgreat questions');
  if (!packet.pilotScope?.deliverables?.length) errors.push('missing pilot deliverables');
  if ((packet.retestProof?.provenRows || 0) < 7) errors.push('expected at least 7 retest proof rows');
  if (!/retest proof only/i.test(packet.retestProof?.claim || '')) errors.push('retest proof overclaims beyond fixture scope');
  if ((packet.provenanceProof?.rows || 0) < 4) errors.push('expected at least 4 provenance proof rows');
  if ((packet.provenanceProof?.quarantined || 0) < 2) errors.push('expected at least 2 quarantined provenance rows');
  if (!/provenance scoring proof only/i.test(packet.provenanceProof?.claim || '')) errors.push('provenance proof overclaims beyond fixture scope');
  if (containsForbiddenClaim(packet)) errors.push('packet contains forbidden platform maturity claim');
  for (const step of packet.liveDemoOrder || []) {
    if (!step.evidence || !step.executableTest || !step.boundary) errors.push(`demo step missing proof fields: ${step.id || 'unknown'}`);
    if (!/fixture proof only/i.test(step.boundary)) errors.push(`demo step overclaims beyond fixture proof: ${step.id}`);
  }
  return { ok: errors.length === 0, errors };
}

export function renderCyberMeetingPackMarkdown(packet = buildCyberMeetingPack()) {
  return [
    '# YURI Upgreat Meeting Packet',
    '',
    `Generated: ${packet.generatedAt}`,
    '',
    '## Objective',
    '',
    packet.objective,
    '',
    '## Opening Frame',
    '',
    list(packet.opener),
    '',
    '## Executive Version',
    '',
    list(packet.executiveVersion),
    '',
    '## Technical Version',
    '',
    list(packet.technicalVersion),
    '',
    '## Retest Proof',
    '',
    renderRetestProof(packet.retestProof),
    '',
    '## Provenance Proof',
    '',
    renderProvenanceProof(packet.provenanceProof),
    '',
    '## Live Demo Order',
    '',
    packet.liveDemoOrder.map(renderDemoStep).join('\n\n'),
    '',
    '## Pilot Scope',
    '',
    `Surface: ${packet.pilotScope.surface}`,
    '',
    'Deliverables:',
    list(packet.pilotScope.deliverables),
    '',
    'Out of scope:',
    list(packet.pilotScope.outOfScope),
    '',
    '## Questions For Upgreat',
    '',
    list(packet.questionsForUpgreat),
    '',
    '## Hard Boundaries',
    '',
    list(packet.hardBoundaries),
    '',
  ].join('\n');
}

export function writeCyberMeetingPack(options = {}) {
  const reportPath = path.resolve(options.reportPath || DEFAULT_MEETING_PACKET_PATH);
  const packet = buildCyberMeetingPack(options);
  if (!packet.validation.ok) {
    throw new Error(`Cyber meeting packet validation failed: ${packet.validation.errors.join('; ')}`);
  }
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderCyberMeetingPackMarkdown(packet));
  return { ok: true, reportPath, packet };
}

function buildExecutiveVersion(pilotPack, proofCards, retestSummary) {
  return [
    `YURI currently has ${proofCards.cards.length} deterministic local proof cards across AI-agent, MCP/tool, browser, memory/RAG, API, and availability boundaries.`,
    `YURI also has ${retestSummary.provenRows} before/after retest rows showing threat-shaped fixtures blocked before and benign/remediated controls passing after.`,
    `The cyber matrix tracks ${pilotPack.upgreat.proofStatus.threatRows} source-backed threat rows, with ${pilotPack.upgreat.proofStatus.buildRows} mapped to build actions.`,
    'The first commercial surface should be a bounded AI security assessment, not a broad managed-security claim.',
    'The strongest buyer promise is evidence: threats -> local proof -> reportable risk -> scoped next proof.',
  ];
}

function buildTechnicalVersion(proofCards, retestSummary) {
  const rails = [...new Set(proofCards.cards.map((card) => card.rail))];
  return [
    `The current proof surface covers ${rails.join(', ')}.`,
    'Each card links executable fixture tests, source IDs, related threat rows, Security Lens modules, demo steps, and next proof requirements.',
    `Retest proof adds ${retestSummary.beforeCases} before cases and ${retestSummary.afterCases} after controls across the same local lab harness.`,
    'The local harness proves classification and boundary behavior only; production client proof requires scoped authorized replay.',
    'The next technical upgrade is live demo orchestration: run selected fixture tests, show generated reports, then map a client-safe pilot scope.',
  ];
}

function summarizeRetestProof(retestProof) {
  const retests = retestProof.retests || [];
  return {
    provenRows: retests.filter((row) => row.state === 'retest-proven').length,
    totalRows: retests.length,
    beforeCases: retests.reduce((sum, row) => sum + (row.before?.total || 0), 0),
    afterCases: retests.reduce((sum, row) => sum + (row.after?.total || 0), 0),
    artifact: '_SYSTEM/reports/YURI_CYBER_RETEST_PROOF_2026-05-24.md',
    claim: 'Before/after deterministic local fixture retest proof only; not production remediation proof.',
    boundary: 'owned-local-synthetic-or-explicitly-authorized-only',
  };
}

function summarizeProvenanceProof(provenanceProof) {
  return {
    rows: provenanceProof.rows?.length || 0,
    quarantined: provenanceProof.validation?.quarantined || 0,
    allowed: provenanceProof.validation?.allowed || 0,
    artifact: '_SYSTEM/reports/YURI_PROVENANCE_SCORE_MATRIX_2026-05-24.md',
    claim: 'Deterministic local memory/RAG provenance scoring proof only; not production RAG security proof.',
    boundary: 'owned-local-synthetic-fixtures-only',
  };
}

function renderRetestProof(retestProof) {
  return [
    `- Rows: ${retestProof.provenRows}/${retestProof.totalRows} retest-proven`,
    `- Before cases: ${retestProof.beforeCases} threat-shaped fixtures detected safely`,
    `- After controls: ${retestProof.afterCases} benign/remediated controls passed`,
    `- Artifact: ${retestProof.artifact}`,
    `- Claim: ${retestProof.claim}`,
    `- Boundary: ${retestProof.boundary}`,
  ].join('\n');
}

function renderProvenanceProof(provenanceProof) {
  return [
    `- Rows: ${provenanceProof.rows} local memory/RAG provenance rows`,
    `- Quarantined: ${provenanceProof.quarantined} hostile authority/promotion candidates`,
    `- Allowed for audited review: ${provenanceProof.allowed} benign candidates`,
    `- Artifact: ${provenanceProof.artifact}`,
    `- Claim: ${provenanceProof.claim}`,
    `- Boundary: ${provenanceProof.boundary}`,
  ].join('\n');
}

function toDemoStep(card, index) {
  return {
    order: index + 1,
    id: card.id,
    title: card.title,
    claim: card.executive_claim,
    evidence: card.local_evidence.fixture,
    executableTest: card.local_evidence.executable_test,
    sourceEvidence: card.source_evidence,
    modules: card.security_lens_modules,
    show: card.client_demo_step,
    nextProof: card.next_proof,
    boundary: card.proof_boundary,
  };
}

function buildPilotScope() {
  return {
    surface: 'One owned or explicitly authorized AI-agent/workflow surface: tools, browser behavior, memory/RAG, model routing, and repo/supply-chain context.',
    deliverables: [
      'Executive risk summary with evidence-backed priorities.',
      'Technical findings with reproduction scope, boundary, and remediation proposal.',
      'Model/tool/memory route inventory.',
      'Client-safe retest plan for remediated findings.',
      'Clear distinction between proven local behavior, authorized client proof, and future roadmap.',
    ],
    outOfScope: [
      'Unscoped external scanning.',
      'Malware execution.',
      'Uncontrolled phishing or social engineering.',
      'DDoS or availability pressure outside local owned systems.',
      'Legal compliance certification.',
    ],
  };
}

function renderDemoStep(step) {
  return [
    `### ${step.order}. ${step.title}`,
    '',
    `Claim: ${step.claim}`,
    `Evidence: ${step.evidence}`,
    `Executable test: ${step.executableTest}`,
    `Sources: ${step.sourceEvidence.join(', ')}`,
    `Modules: ${step.modules.join(', ')}`,
    `Show: ${step.show}`,
    `Next proof: ${step.nextProof}`,
    `Boundary: ${step.boundary}`,
  ].join('\n');
}

function list(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

function containsForbiddenClaim(packet) {
  const claimSurface = [
    packet.objective,
    ...(packet.opener || []),
    ...(packet.executiveVersion || []),
    ...(packet.technicalVersion || []),
    packet.retestProof?.claim,
    ...(packet.pilotScope?.deliverables || []),
    ...(packet.liveDemoOrder || []).flatMap((step) => [
      step.claim,
      step.show,
      step.nextProof,
    ]),
  ].join('\n');
  return /\b(?:is|are|becomes|provides|replaces)\s+(?:a\s+)?mature\s+(?:SOC|SIEM|XDR|MDR)\b|autonomous pentest capability|external target exploitation|malware operation/iu.test(claimSurface);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--write')) {
    const result = writeCyberMeetingPack();
    process.stdout.write(`cyber_meeting_packet=${path.relative(REPO_ROOT, result.reportPath)}\n`);
  } else if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(buildCyberMeetingPack(), null, 2)}\n`);
  } else {
    process.stdout.write(renderCyberMeetingPackMarkdown());
  }
}
