#!/usr/bin/env node

import { PROTECTED_SURFACE_PREFIXES } from './lane-kernel.mjs';

export const SHINTAI_REQUIRED_EVIDENCE_IDS = Object.freeze([
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
  'cyber-lab-runner-source',
  'cyber-guardrail-proof-source',
  'cyber-pilot-pack-source',
  'cyber-capability-audit',
  'cyber-research-sprint',
]);

// Declared protected-surface exclusions reported into evidence bundles (memory-kernel
// surfaces them as `protectedSurfaceExclusions`; the validator only requires non-empty).
// Single-sourced from the canonical lane-kernel PROTECTED_SURFACE_PREFIXES so this manifest
// can never declare a narrower exclusion set than the real protected surface. Collapsing the
// former hardcoded 6-entry subset onto the canonical 16-entry list is purely additive
// (strictly MORE surfaces declared excluded) and keeps the list non-empty for validation.
export const PROTECTED_SURFACE_EXCLUSIONS = PROTECTED_SURFACE_PREFIXES;

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
