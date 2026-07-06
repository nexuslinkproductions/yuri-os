#!/usr/bin/env node
// @capability: mure
// @serves: mure | agentic collective | run the agent company | yuri agent org | mure cli | self governing agent fleet entry
// @does: the unified entry point for MURE (群れ) — YURI's ~20-role self-governing agent collective on the runSwarm / dual-substrate foundation. Re-exports the registry, governance gate, goal engine, math bridge, and company orchestrator, and provides a CLI: --roster (list roles), --validate (schema check), --demo (DISARMED end-to-end plan of a sample task → roles → leaves, zero spend), --status (arm state).
// @use: node _SYSTEM/mure/mure.mjs --demo  |  --roster  |  --validate  |  --status. Programmatic: import { runCompany, loadRoster, evaluateGovernance, runGoalCycle, MATH_HOOKS } from mure/mure.mjs.
// @exports: runCompany, planCompany, loadRoster, validateRoster, matchRolesByCapability, resolveLane, evaluateGovernance, runGoalCycle, scoreGoal, MATH_HOOKS, isMureArmed, MURE_NAME
//
// Authority: ADVISORY. MURE plans + governs + (when armed) dispatches the GLM substrate; the native substrate
// and finalize are driven by the Opus session. Arming is owner-gated. DISARMED by default.

import { fileURLToPath } from 'node:url';
import { loadRoster, validateRoster, matchRolesByCapability, resolveLane, GROUPS } from './role-registry.mjs';
import { evaluateGovernance, CLASS } from './governance.mjs';
import { runGoalCycle, scoreGoal } from './goal-engine.mjs';
import { MATH_HOOKS } from './math-bridge.mjs';
import { runCompany, planCompany, isMureArmed, MURE_NAME, ARM_FLAG } from './company.mjs';
import { isEvolverArmed, EVOLVER_ARM_FLAG } from './evolver-arm.mjs';
import { isArmed as isClineFleetArmed, ARM_FLAG as CLINE_ARM_FLAG } from '../Scripts/cline-fleet.mjs';

export {
  runCompany, planCompany, loadRoster, validateRoster, matchRolesByCapability, resolveLane,
  evaluateGovernance, runGoalCycle, scoreGoal, MATH_HOOKS, isMureArmed, MURE_NAME, CLASS, GROUPS,
  isEvolverArmed,
};

// A representative sample task to demonstrate the end-to-end DISARMED plan (research → build → verify → doc).
const DEMO_TASK = {
  summary: 'Add a small feature module with tests and a doc.',
  tags: ['build', 'feature'],
  subtasks: [
    { id: 'research', need: ['local-first-search', 'online-research'], prompt: 'Research prior art for the feature.', blastRadius: 'LOW' },
    { id: 'design', need: ['architecture-design', 'interface-contracts'], prompt: 'Design the module interface.', blastRadius: 'LOW' },
    { id: 'build', need: ['code-generation', 'implementation'], prompt: 'Implement the module behind a disarmed flag.', blastRadius: 'MEDIUM' },
    { id: 'tests', need: ['test-execution', 'scaffolding'], prompt: 'Write red/grey/green tests and run them.', blastRadius: 'LOW' },
    { id: 'security', need: ['security-review', 'safety-audit'], prompt: 'Audit the module for protected-path / safety issues.', blastRadius: 'LOW' },
    { id: 'verify', need: ['adversarial-verify', 'gap-detection'], prompt: 'Adversarially verify the build; name failure modes.', blastRadius: 'LOW' },
    { id: 'doc', need: ['technical-writing', 'doc-generation'], prompt: 'Write the module README + owner summary.', blastRadius: 'LOW' },
    { id: 'ship', need: ['improvement-proposal'], prompt: 'Propose arming the feature flag in production.', arming: true, blastRadius: 'HIGH' },
  ],
};

async function main(argv) {
  const roster = loadRoster();
  if (argv.includes('--validate')) {
    const v = validateRoster(roster);
    process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);
    return v.ok ? 0 : 1;
  }
  if (argv.includes('--status')) {
    const mure = isMureArmed() ? `ARMED (${process.env.YURI_MURE_ARMED === '1' ? 'env' : 'flag'})` : `DISARMED (touch ${ARM_FLAG.replace(/.*YURI-OS-MUSUBI\//, '')})`;
    const cline = isClineFleetArmed() ? `ARMED (${process.env.YURI_CLINE_FLEET === '1' ? 'env' : 'flag'})` : `DISARMED (touch ${CLINE_ARM_FLAG.replace(/.*YURI-OS-MUSUBI\//, '')})`;
    const evolver = isEvolverArmed() ? `ARMED (${process.env.YURI_EVOLVER_ARMED === '1' ? 'env' : 'flag'})` : `DISARMED (touch ${EVOLVER_ARM_FLAG.replace(/.*YURI-OS-MUSUBI\//, '')})`;
    process.stdout.write(`${MURE_NAME} ${roster.meta.kanji || ''} — ${roster.roles.length} roles\n`);
    process.stdout.write(`  MURE:    ${mure}\n`);
    process.stdout.write(`  Cline:   ${cline}\n`);
    process.stdout.write(`  Evolver: ${evolver}\n`);
    return 0;
  }
  if (argv.includes('--roster')) {
    process.stdout.write(`${MURE_NAME} (群れ) — ${roster.roles.length} roles\n`);
    for (const g of GROUPS) {
      const rs = roster.byGroup.get(g) || [];
      if (!rs.length) continue;
      process.stdout.write(`\n${g.toUpperCase()}\n`);
      for (const r of rs) process.stdout.write(`  ${r.id.padEnd(14)} ${r.archetype}  [${r.substrate}/${r.lane}, ${r.autonomyClass}]\n`);
    }
    return 0;
  }
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes('--run')) {
    const taskFile = val('--task-file');
    if (!taskFile) {
      process.stderr.write('Usage: mure.mjs --run --task-file <task.json> [--dry-run]\n');
      return 2;
    }
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    let task = {};
    try { task = JSON.parse(fs.readFileSync(path.join(repoRoot, taskFile), 'utf8')); } catch (e) {
      process.stderr.write(`bad --task-file: ${e.message}\n`);
      return 2;
    }
    const dryRun = argv.includes('--dry-run');
    const { runFleet } = await import('../Scripts/runFleet.mjs');
    const result = dryRun
      ? await runCompany(task, { armed: false })
      : await runFleet(task, { apply: true, dryRun: false, armed: isMureArmed() });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  // default / --demo: DISARMED end-to-end plan (zero spend)
  const r = await runCompany(DEMO_TASK, { armed: false });
  process.stdout.write(`${MURE_NAME} (群れ) — DISARMED plan of a sample task (zero spend)\n\n`);
  process.stdout.write(`summary: ${JSON.stringify(r.plan.summary)}\n\n`);
  process.stdout.write('CAST (subtask → role → substrate/lane → governance):\n');
  for (const c of r.plan.casts) {
    process.stdout.write(`  ${String(c.subtaskId).padEnd(10)} → ${c.role.padEnd(13)} ${c.target.substrate}/${c.target.lane.padEnd(9)} ${c.ruling.class}\n`);
  }
  process.stdout.write(`\nGLM leaves: ${r.plan.glmLeaves.map((l) => `${l.id}:${l.lane}`).join(', ') || '(none)'}\n`);
  process.stdout.write(`Native specs (for Opus to spawn): ${r.nativeSpecs.map((n) => `${n.id}:${n.model}`).join(', ') || '(none)'}\n`);
  process.stdout.write(`HELD (owner-gated): ${r.held.map((h) => `${h.subtaskId} (${h.role})`).join(', ') || '(none)'}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => process.exit(code)).catch((e) => { process.stderr.write(`mure error: ${String(e?.message || e)}\n`); process.exit(1); });
}
