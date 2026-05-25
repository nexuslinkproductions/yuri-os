#!/usr/bin/env node

import {
  ACTIVE_NIM_LANES,
  DEAD_NIM_LANES,
  PROTECTED_SURFACE_LABELS,
} from '../Scripts/lane-kernel.mjs';

export const YURI_RAILS_CONFIG_VERSION = 'yuri.rails.v1';

export const YURI_RAILS_CONFIG = deepFreeze({
  version: YURI_RAILS_CONFIG_VERSION,
  source: {
    upstream: 'NVIDIA-NeMo/Guardrails',
    localCheckout: '_SYSTEM/tools/nemo-guardrails',
    dependencyPolicy: 'taxonomy-and-schema-reference-only',
  },
  input: {
    enabled: true,
    userShellBlocks: 'text-only',
    assistantShellBlocks: 'guarded-auto-exec-when-enabled',
    slashCommands: ['help', 'goal', 'clear', 'noexec', 'health', 'browser'],
    laneMentions: [
      '@shintai',
      '@deepseek',
      '@codex',
      '@claude',
      '@nvidia',
      '@ds',
      '@flash',
      ...ACTIVE_NIM_LANES.map((lane) => `@${lane}`),
    ],
  },
  retrieval: {
    enabled: true,
    protectedSurfaces: PROTECTED_SURFACE_LABELS,
    memoryOwner: 'yuri',
    legacyClaudeMemory: 'import-only',
  },
  dialog: {
    enabled: true,
    codexAssemblesShintai: true,
    sparkForbiddenForCritical: true,
    tierMemberCaps: {
      trivial: 1,
      standard: 2,
      complex: 3,
      critical: 10,
    },
  },
  execution: {
    enabled: true,
    noAutoCommitOrPush: true,
    noexecDefaultForUserShell: true,
    transientHttpRetry: {
      statuses: [502, 503],
      attempts: 3,
      backoffMs: [1000, 2000, 4000],
      incidentLog: '_SYSTEM/state/nim-transient-incidents.jsonl',
    },
  },
  output: {
    enabled: true,
    maxChars: 64 * 1024,
    evidenceRequiredForRepoClaims: true,
    advisoryMarker: '[ADVISORY_HYPOTHESIS_ONLY]',
    evidenceMarker: '[EVIDENCE_MISSING]',
    truncationMarker: '[OUTPUT_TRUNCATED]',
  },
  health: {
    enabled: true,
    activeNimLanes: ACTIVE_NIM_LANES,
    deadNimLanes: DEAD_NIM_LANES,
  },
});

export function getRailConfig(kind) {
  return YURI_RAILS_CONFIG[kind] || null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
