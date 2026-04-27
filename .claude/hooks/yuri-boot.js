#!/usr/bin/env node
// yuri-boot.js — SessionStart hook: inject Yuri OS context + roadmap state
'use strict';
const fs = require('fs');
const path = require('path');

const PROJECT = path.join(process.env.HOME || '', 'NUDIMMUD');
const SPECS_DIR = path.join(PROJECT, '.claude', 'specs');
const STATE_DIR = path.join(PROJECT, '.claude', 'state');

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8'); }
  catch { return null; }
}

function buildRoadmapSummary() {
  const state = readJSON(path.join(STATE_DIR, 'roadmap-state.json'));
  if (!state) return 'roadmap-state.json not found';

  const score = state.realistic_score || {};
  const phases = state.phases || [];

  const phaseLines = phases.map(p => {
    const ms = p.milestones || [];
    const passed = ms.filter(m => m.status === 'passed').length;
    const icon = p.status === 'passed' ? '✅' : p.status === 'in_progress' ? '🔄' : '🔲';
    return `  ${icon} ${p.id} ${p.title} [${passed}/${ms.length}]`;
  }).join('\n');

  const nextPhase = phases.find(p => p.status !== 'passed');
  const nextMilestones = nextPhase
    ? (nextPhase.milestones || [])
        .filter(m => m.status !== 'passed')
        .slice(0, 3)
        .map(m => `    - ${m.id}: ${m.title}`)
        .join('\n')
    : '(all phases complete)';

  return `## Yuri OS Roadmap State (auto-loaded)
Stage: ${state.program_stage} | Blueprint: ${score.blueprint_maturity}% | Runtime: ${score.runtime_operating_system}% | Weighted: ${score.current_weighted}%

Phases:
${phaseLines}

Next milestones (${nextPhase ? nextPhase.id + ' ' + nextPhase.title : 'N/A'}):
${nextMilestones}

Full tracker: .claude/specs/YURI_PROGRESS.md
Audit pack entry: .claude/specs/yuri_os_audit_pack/docs/02_CLAUDE_CODE_MASTER_AUDIT_PROMPT.md
Master rollout: .claude/specs/yuri_os_roadmap/Yuri_OS_33_Architect_Conclave_Absolute_Master_Rollout_Plan_Claude_Code.md`;
}

function buildBootPacket() {
  const progress = readFile(path.join(SPECS_DIR, 'YURI_PROGRESS.md'));
  const progressBlock = progress
    ? progress.split('\n').slice(0, 60).join('\n')  // first 60 lines as context
    : buildRoadmapSummary();

  return `### YURI_OS_SESSION_BOOT

You are operating in NUDIMMUD — the Yuri OS implementation environment.
Yuri OS is a symbiotic AI control plane. Build it incrementally, spec-driven, evidence-backed.

${buildRoadmapSummary()}

## 33 Architect Conclave — Always-On Lenses
1. Prime Systems — coherence across planes
2. Repository Truth — code/files beat assumptions
3. Metric Truth — no invented metrics or claims
4. Security — no silent privilege escalation
5. Backend Data — data-source accuracy
6. Observability — trace IDs + structured logs
7. Conclave Symbiote — EOT learning + improvement proposals

## Working Posture
- Audit first, mutate with authority
- Evidence mark all claims: Observed / Inferred / Assumed / Unknown
- Sandbox before production
- Rollback on every patch
- Enterprise gates before any deployment or self-improvement loop

## How to use roadmap
Guide + reference only. Track progress in YURI_PROGRESS.md. Update after each session.
Do not treat roadmap as hard sequencing — adapt to context while keeping arc in view.
`;
}

try {
  // Only inject if we're in the NUDIMMUD project context
  const cwd = process.cwd();
  const isNudimmud = cwd.includes('NUDIMMUD') || cwd === process.env.HOME;

  const output = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: buildBootPacket()
    }
  };

  process.stdout.write(JSON.stringify(output) + '\n');
} catch (err) {
  // Silent fail — boot injection is non-critical
  process.exit(0);
}
