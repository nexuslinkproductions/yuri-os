// MURE company orchestrator — red/grey/green over plan/cast/govern/split. Hermetic: force-disarm per test.
import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCompany, runCompany, castRole, applySubstrateHint, buildRolePrompt, decisionFor, dispatchNative, MURE_NAME, ARM_ENV, ARM_FLAG } from './company.mjs';
import { loadRoster, getRole } from './role-registry.mjs';
import { CLASS } from './governance.mjs';

/** Temporarily clear owner arm signals so governance tests stay hermetic while fleet stays armed globally. */
async function withDisarmed(fn) {
  const savedEnv = process.env[ARM_ENV];
  delete process.env[ARM_ENV];
  let hadFlag = false;
  let flagContent = null;
  if (fs.existsSync(ARM_FLAG)) {
    hadFlag = true;
    flagContent = fs.readFileSync(ARM_FLAG);
    fs.unlinkSync(ARM_FLAG);
  }
  try {
    return await fn();
  } finally {
    if (savedEnv != null) process.env[ARM_ENV] = savedEnv;
    else delete process.env[ARM_ENV];
    if (hadFlag && flagContent != null) fs.writeFileSync(ARM_FLAG, flagContent);
  }
}

const roster = loadRoster();
const TASK = {
  summary: 'demo', tags: ['build'],
  subtasks: [
    { id: 'r', need: ['local-first-search', 'online-research'], prompt: 'research', blastRadius: 'LOW' },
    { id: 'b', need: ['code-generation'], prompt: 'build', blastRadius: 'MEDIUM' },
    { id: 'v', need: ['adversarial-verify'], prompt: 'verify', blastRadius: 'LOW' },
    { id: 'ship', need: ['improvement-proposal'], prompt: 'arm the flag', arming: true, blastRadius: 'HIGH' },
  ],
};

// ── GREEN ───────────────────────────────────────────────────────────────────
test('GREEN: planCompany casts every subtask to a role and splits across substrates', async () => {
  const p = await planCompany(TASK);
  assert.equal(p.casts.length, 4);
  assert.equal(p.summary.cast, 4);
  // research → scout (native), build → engineer (glm), verify → adjudicator (glm), ship → evolver (held)
  assert.equal(castRole(roster, TASK.subtasks[0]).role, 'scout');
  assert.equal(castRole(roster, TASK.subtasks[1]).role, 'engineer');
  assert.equal(castRole(roster, TASK.subtasks[2]).role, 'adjudicator');
});

test('GREEN: an arming subtask is HELD owner-gated, never dispatched', async () => {
  const p = await planCompany(TASK);
  assert.equal(p.held.length, 1);
  assert.equal(p.held[0].subtaskId, 'ship');
});

test('GREEN: runCompany DISARMED is a dry-run plan — no swarm, zero spend', async () => {
  const r = await runCompany(TASK, { armed: false });
  assert.equal(r.armed, false);
  assert.equal(r.dryRun, true);
  assert.equal(r.swarm, null);
  assert.ok(r.plan.summary.glm >= 1);
});

// ── RED ───────────────────────────────────────────────────────────────────
test('RED: an explicit owner-gated role floor holds the subtask even if gates would pass', () => {
  // helmsman is owner-gated by posture → its subtask is held even when all six gates would pass
  const d = decisionFor({ id: 'x', prompt: 'a real task', reversible: true, evidenceDecidable: true, inDoctrine: true, blastRadius: 'LOW' }, getRole(roster, 'helmsman'));
  assert.equal(d.class, CLASS.OWNER);
  assert.ok(d.failures.includes('role-floor:owner-gated'));
});

test('RED: a protected-path subtask is held (not cast into a leaf)', async () => {
  const p = await planCompany({ subtasks: [{ id: 'p', need: ['implementation'], prompt: 'edit', files: ['.env'] }] });
  assert.equal(p.held.length, 1);
  assert.equal(p.glmLeaves.length + p.nativeSpecs.length, 0);
});

// ── RED (regression — adversarial-verification round, 2026-06-22) ──────────────
test('RED regression (GLM#2): runCompany({armed:true}) does NOT self-arm while DISARMED (owner flag is the authority)', async () => {
  await withDisarmed(async () => {
    const r = await runCompany(TASK, { armed: true });
    assert.equal(r.armed, false, 'opts.armed:true must not arm without the owner flag');
    assert.equal(r.swarm, null, 'no live GLM dispatch while disarmed');
  });
});

test('RED regression (native#5): an empty subtask (no prompt) is owner-gated, not auto-self-governable', () => {
  assert.equal(decisionFor({}, getRole(roster, 'engineer')).class, CLASS.OWNER);
  assert.equal(decisionFor({ id: 'x' }, getRole(roster, 'engineer')).class, CLASS.OWNER);
});

test('RED regression (GLM-MED): a finalize subtask is held (finalize is owner-only)', async () => {
  const p = await planCompany({ subtasks: [{ id: 'fin', need: ['implementation'], prompt: 'commit and push', finalize: true }] });
  assert.equal(p.held.length, 1);
  assert.ok(p.held[0].reason.includes('finalize'));
});

// ── GREY ───────────────────────────────────────────────────────────────────
test('GREY (substrate invariant): every glm leaf has a glm lane; every native spec a native model', async () => {
  const p = await planCompany(TASK);
  const GLM = new Set(['glm-max', 'glm', 'glm-flash', 'glm-flashx', 'glm-sub-orch', 'glm-turbo', 'glm-vision', 'glm-ocr']);
  const NAT = new Set(['opus', 'sonnet', 'haiku']);
  for (const l of p.glmLeaves) assert.ok(GLM.has(l.lane), `glm leaf lane ${l.lane}`);
  for (const n of p.nativeSpecs) assert.ok(NAT.has(n.model), `native spec model ${n.model}`);
});

test('GREY (conservation): held + glm + native + inline == cast count', async () => {
  const p = await planCompany(TASK);
  assert.equal(p.summary.held + p.summary.glm + p.summary.native + p.summary.inline, p.summary.cast);
});

test('GREY (sidecar metadata): planCompany exposes ollama + cline sidecar blocks', async () => {
  const p = await planCompany(TASK);
  assert.ok(p.ollamaSidecar?.discoverable);
  assert.ok(p.clineSidecar?.discoverable);
  assert.equal(typeof p.ollamaSidecar.eligibleCount, 'number');
  assert.equal(typeof p.clineSidecar.eligibleCount, 'number');
  assert.ok(p.clineSidecar.spawn.includes('cline-fleet.mjs'));
});

test('GREY (determinism): the same task plans identically', async () => {
  const a = await planCompany(TASK);
  const b = await planCompany(TASK);
  assert.deepEqual(a.casts.map((c) => [c.subtaskId, c.role, c.ruling.class]), b.casts.map((c) => [c.subtaskId, c.role, c.ruling.class]));
});

test('GREY (prompt contract): every role prompt frames the role and demands a RESULT_LABEL', () => {
  const p = buildRolePrompt(getRole(roster, 'engineer'), { prompt: 'do the thing' });
  assert.ok(p.includes('Engineer'));
  assert.ok(p.includes(MURE_NAME));
  assert.ok(/RESULT_LABEL/.test(p));
  assert.ok(p.includes('do the thing'));
});

test('GREEN: substrateHint tmux-zai routes to zai-tmux dispatch', () => {
  const c = castRole(roster, { id: 'k1', role: 'kernelsmith', substrateHint: 'tmux-zai', prompt: 'build kernel' });
  assert.equal(c.target.dispatch, 'zai-tmux');
  assert.equal(c.target.lane, 'glm-max');
  assert.equal(c.target.model, 'glm-5.2');
});

test('GREEN: applySubstrateHint glm-max lane override', () => {
  const base = { substrate: 'glm', lane: 'glm', model: 'glm', dispatch: 'glm-lane' };
  const t = applySubstrateHint({ substrateHint: 'glm-max' }, base);
  assert.equal(t.lane, 'glm-max');
});

test('GREY (no silent drop): a subtask with no capability match falls back to a real role, never null', () => {
  const c = castRole(roster, { id: 'weird', need: ['nonexistent-capability-xyz'], prompt: 'x' });
  assert.ok(c.role, 'must cast to a fallback role');
  assert.ok(getRole(roster, c.role), 'fallback role must exist in the roster');
});
