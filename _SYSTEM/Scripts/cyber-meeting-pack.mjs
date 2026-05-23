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
  const cardById = new Map(proofCards.cards.map((card) => [card.id, card]));
  const demoOrder = DEMO_PRIORITY.map((id) => cardById.get(id)).filter(Boolean).map(toDemoStep);

  const packet = {
    schema: 'yuri.upgreat-meeting-packet.v0',
    generatedAt: new Date().toISOString(),
    objective: 'Position YURI as an evidence-first AI security assessment and hardening system for a bounded Upgreat pilot.',
    opener: [
      'YURI is not being sold as a finished SOC or autonomous pentest product.',
      'The first proof is narrower and stronger: AI-agent, MCP, browser, memory/RAG, model-route, and tool-use risk.',
      'Every claim shown here is tied to local fixture proof, source-backed threat rows, and a next proof step.',
    ],
    executiveVersion: buildExecutiveVersion(pilotPack, proofCards),
    technicalVersion: buildTechnicalVersion(proofCards),
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

function buildExecutiveVersion(pilotPack, proofCards) {
  return [
    `YURI currently has ${proofCards.cards.length} deterministic local proof cards across AI-agent, MCP/tool, browser, memory/RAG, API, and availability boundaries.`,
    `The cyber matrix tracks ${pilotPack.upgreat.proofStatus.threatRows} source-backed threat rows, with ${pilotPack.upgreat.proofStatus.buildRows} mapped to build actions.`,
    'The first commercial surface should be a bounded AI security assessment, not a broad managed-security claim.',
    'The strongest buyer promise is evidence: threats -> local proof -> reportable risk -> scoped next proof.',
  ];
}

function buildTechnicalVersion(proofCards) {
  const rails = [...new Set(proofCards.cards.map((card) => card.rail))];
  return [
    `The current proof surface covers ${rails.join(', ')}.`,
    'Each card links executable fixture tests, source IDs, related threat rows, Security Lens modules, demo steps, and next proof requirements.',
    'The local harness proves classification and boundary behavior only; production client proof requires scoped authorized replay.',
    'The next technical upgrade is live demo orchestration: run selected fixture tests, show generated reports, then map a client-safe pilot scope.',
  ];
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
