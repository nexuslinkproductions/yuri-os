#!/usr/bin/env node

export const SHINTAI_REQUIRED_EVIDENCE_IDS = Object.freeze([
  'shintai-roster',
  'yuri-memory-index',
  'extraction-sprint-template',
]);

export const MEMORY_RAG_REQUIRED_EVIDENCE_IDS = Object.freeze([
  ...SHINTAI_REQUIRED_EVIDENCE_IDS,
  'self-improvement-memory-rag-goal',
  'memory-rag-skill-research',
  'research-to-runtime-ledger',
  'soul-persona',
  'neurodivergent-engine-handoff',
  'msa-readme',
  'memory-kernel-source',
  'skill-loader-source',
  'shintai-dispatch-source',
  'rails-source',
]);

export const CYBER_REQUIRED_EVIDENCE_IDS = Object.freeze([
  ...SHINTAI_REQUIRED_EVIDENCE_IDS,
  'cyber-company-goal',
  'cyber-intel-matrix',
  'cyber-intel-ingestion-protocol',
  'research-to-runtime-ledger',
  'threat-intel-kernel-source',
  'security-lens-source',
  'cyber-lab-harness-source',
  'cyber-guardrail-proof-source',
  'cyber-pilot-pack-source',
  'cyber-capability-audit',
  'cyber-research-sprint',
]);

export const PROTECTED_SURFACE_EXCLUSIONS = Object.freeze([
  'backend/data/',
  '.claude/state/',
  '.claude/history/',
  '.env',
  'node_modules/',
  '.amp/',
]);

export function requiredEvidenceIdsForTask(task = '') {
  const text = String(task || '').toLowerCase();
  const required = [...SHINTAI_REQUIRED_EVIDENCE_IDS];
  if (/(memory|rag|retrieval|skill|neuro|self[- ]?improvement|msa|eot|neuron|persona|recall)/.test(text)) {
    required.push(...MEMORY_RAG_REQUIRED_EVIDENCE_IDS);
  }
  if (/(cyber|security|threat|intel|intelligence|upgreat|agent security|mcp|ransomware|identity|supply chain|fraud|ddos|phishing|infostealer|cloud|saas|ot\/ics|ics|lab harness|security lens|vulnerability|exploit|guardrail proof)/.test(text)) {
    required.push(...CYBER_REQUIRED_EVIDENCE_IDS);
  }
  return [...new Set(required)];
}
