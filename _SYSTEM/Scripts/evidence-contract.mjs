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
  'soul-persona',
  'neurodivergent-engine-handoff',
  'msa-readme',
  'memory-kernel-source',
  'skill-loader-source',
  'shintai-dispatch-source',
  'rails-source',
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
  if (/(memory|rag|retrieval|skill|neuro|self[- ]?improvement|msa|eot|neuron|persona|recall)/.test(text)) {
    return [...MEMORY_RAG_REQUIRED_EVIDENCE_IDS];
  }
  return [...SHINTAI_REQUIRED_EVIDENCE_IDS];
}
