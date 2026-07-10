// MURE company orchestrator — red/grey/green over plan/cast/govern/split. Hermetic: force-disarm per test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCompany, runCompany, castRole, applySubstrateHint, buildRolePrompt, decisionFor, dispatchNative, deriveNeeds, runInlineSpecs, runGoalCycles, MURE_NAME, ARM_ENV, ARM_FLAG } from './company.mjs';
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
  const GLM = new Set(['glm-max', 'glm', 'glm-5.2', 'glm-flash', 'glm-flashx', 'glm-sub-orch', 'glm-turbo', 'glm-vision', 'glm-ocr']);
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
  const c = castRole(roster, { id: 'weird', need: ['nonexistent-capability-xyz'], prompt: 'x', quiet: true }, { quiet: true });
  assert.ok(c.role, 'must cast to a fallback role');
  assert.ok(getRole(roster, c.role), 'fallback role must exist in the roster');
});

test('RED: an unknown explicit role fails closed instead of silently becoming engineer', () => {
  for (const role of ['researcher', 'worker', 'verifier', 'typo-engineeer']) {
    assert.throws(
      () => castRole(roster, { id: `invalid-${role}`, role, prompt: 'bounded work' }, { quiet: true }),
      new RegExp(`unknown explicit MURE role: ${role}`),
    );
  }
});

test('GREEN: canonical explicit roster roles still bypass capability fallback exactly', () => {
  const cast = castRole(roster, {
    id: 'explicit-scout',
    role: 'scout',
    need: ['code-generation'],
    prompt: 'research evidence',
  }, { quiet: true });
  assert.equal(cast.role, 'scout');
  assert.equal(cast.matched, true);
});

// ── PHASE 6: deriveNeeds (D-8) ────────────────────────────────────────────────
test('GREEN (D-8): deriveNeeds maps intent verbs to EXACT roster capability terms', () => {
  const caps = new Set(roster.roles.flatMap((r) => r.capabilities));
  const cases = {
    'research the corpus and cite sources': 'local-first-search',
    'implement and build the module': 'code-generation',
    'design the architecture': 'architecture-design',
    'refactor and wire the modules': 'refactor',
    'security audit the endpoints': 'security-review',
    'optimize the hot path and benchmark': 'perf-optimization',
    'document and summarize': 'technical-writing',
    'verify and refute adversarially': 'adversarial-verify',
  };
  for (const [text, expectCap] of Object.entries(cases)) {
    const need = deriveNeeds(text);
    assert.ok(need.length > 0, `"${text}" must derive needs`);
    assert.ok(need.includes(expectCap), `"${text}" should include ${expectCap} (got ${need.join(',')})`);
    for (const n of need) assert.ok(caps.has(n), `derived cap '${n}' must be a REAL roster capability`);
  }
});

test('GREEN (D-8): deriveNeeds returns [] when nothing matches', () => {
  assert.deepEqual(deriveNeeds('zzz qwerty nothing here 12345'), []);
  assert.deepEqual(deriveNeeds(''), []);
  assert.deepEqual(deriveNeeds(null), []);
});

test('GREEN (D-8 acceptance): a realistic 6-subtask task casts >=5 DISTINCT roles (not a 1-role company)', () => {
  const jobs = [
    { id: 's1', text: 'research the auth landscape, survey local corpus then online' },
    { id: 's2', text: 'design the session interface with method design' },
    { id: 's3', text: 'implement the token refresh, build and code the module' },
    { id: 's4', text: 'refactor and wire the middleware, integrate the modules' },
    { id: 's5', text: 'security audit the endpoints, vuln redteam the protected paths' },
    { id: 's6', text: 'document the API and summarize the findings' },
  ];
  const rolesCast = new Set();
  for (const j of jobs) {
    const c = castRole(roster, { id: j.id, need: deriveNeeds(j.text), prompt: j.text }, { quiet: true });
    rolesCast.add(c.role);
  }
  assert.ok(rolesCast.size >= 5, `expected >=5 distinct roles, got ${rolesCast.size}: ${[...rolesCast].join(',')}`);
});

test('GREY (D-8): castRole flags matched=true on a capability hit, matched=false on the engineer default', () => {
  const hit = castRole(roster, { id: 'h', need: ['code-generation'], prompt: 'x' }, { quiet: true });
  assert.equal(hit.matched, true);
  const miss = castRole(roster, { id: 'm', need: ['nonexistent-cap-xyz'], prompt: 'x' }, { quiet: true });
  assert.equal(miss.matched, false);
  assert.equal(miss.role, 'engineer');
});

// ── PHASE 6: inline executor (D-9) ─────────────────────────────────────────────
test('GREEN (D-9): runInlineSpecs executes the 5 local-code roles into runDir packets', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mure-inline-')) + '/results';
  fs.mkdirSync(dir, { recursive: true });
  const inlineSpecs = ['steward', 'oracle', 'calibrator', 'archivist', 'quartermaster'].map((role, i) => ({ id: `x${i}`, role, prompt: role }));
  const plan = { casts: [{ role: 'engineer', ruling: { class: CLASS.SELF } }], held: [] };
  const r = await runInlineSpecs(inlineSpecs, { runDir: dir, plan });
  assert.equal(r.packets.length, 5);
  assert.equal(Object.keys(r.pool).length, 5);
  // every packet validates the shared schema (unique inline:<role> laneId, unique role key)
  for (const p of r.packets) {
    assert.ok(p.laneId.startsWith('inline:'), `laneId ${p.laneId}`);
    assert.ok(p.role.startsWith('inline:'), `role key ${p.role}`);
    assert.ok(['ok', 'skipped', 'fail', 'error'].includes(p.status), `status ${p.status}`);
    assert.equal(typeof p.resultLabel, 'string');
  }
  // files landed on the blackboard
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('inline-'));
  assert.equal(files.length, 5);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('GREY (D-9 fail-open): runInlineSpecs never throws, even with a bad runDir or unknown role', async () => {
  const r1 = await runInlineSpecs([{ id: 'u', role: 'nonexistent-role', prompt: 'x' }], { runDir: '/nonexistent/dir/xyz' });
  assert.equal(r1.packets.length, 1);
  assert.equal(r1.packets[0].status, 'skipped'); // unknown role → honest skip, never a stub 'ok'
  const r2 = await runInlineSpecs([], {});
  assert.equal(r2.packets.length, 0); // empty specs → no packets, no throw
});

// ── PHASE 6: goal-engine LIVE (D-14) ───────────────────────────────────────────
test('GREEN (D-14): runGoalCycles runs one PROPOSE->SCORE->GATE cycle per participating role', async () => {
  const task = { summary: 'demo', tags: ['build'], subtasks: [
    { id: 'b', need: ['code-generation'], prompt: 'build', blastRadius: 'LOW' },
    { id: 'v', need: ['adversarial-verify'], prompt: 'verify', blastRadius: 'LOW' },
  ] };
  const plan = await planCompany(task, { quiet: true });
  const gc = runGoalCycles(plan, task, { swarm: { converged: true } });
  assert.equal(gc.ran, true);
  // participating roles = the dispatched glm roles (engineer + adjudicator)
  assert.ok(gc.roles.includes('engineer'));
  assert.ok(gc.roles.includes('adjudicator'));
  assert.equal(gc.cycles.length, gc.roles.length);
  assert.ok(Array.isArray(gc.selected));
  assert.ok(Array.isArray(gc.heldProposals));
  // a strong LOW-blast reversible goal self-governs → selected, not held
  assert.ok(gc.selected.length >= 1, 'at least one goal advances');
});

test('GREY (D-14): the constitution hard-stop is inviolable inside the goal cycle', async () => {
  // even LIVE, a participating role cannot self-select an owner-gated/protected goal — proven by goal-engine.
  // Here we assert the seam preserves the discipline: heldProposals are pending (approved:false), never auto-cleared.
  const task = { summary: 't', tags: ['build'], subtasks: [{ id: 'b', need: ['code-generation'], prompt: 'build', blastRadius: 'LOW' }] };
  const plan = await planCompany(task, { quiet: true });
  const gc = runGoalCycles(plan, task, { swarm: { converged: false } });
  for (const hp of gc.heldProposals) assert.equal(hp.approved, false, 'held goal proposals are never auto-approved');
});

// ── PHASE 6: independenceOf teeth (D-14) ───────────────────────────────────────
test('GREEN (D-14): planCompany flags a producer/critic same-lane collision', async () => {
  const task = { subtasks: [
    { id: 'e', role: 'engineer', substrateHint: 'glm-max', prompt: 'build' },
    { id: 'a', role: 'adjudicator', substrateHint: 'glm-max', prompt: 'verify' },
  ] };
  const p = await planCompany(task, { quiet: true });
  assert.ok(p.independenceViolations.length >= 1);
  const v = p.independenceViolations.find((x) => x.critic === 'adjudicator' && x.producer === 'engineer');
  assert.ok(v, 'adjudicator/engineer same-lane collision must be flagged');
  assert.match(v.reason, /independentOf/);
});

test('GREY (D-14): no violation when critic and producer resolve to DIFFERENT lanes', async () => {
  // engineer(glm) vs adjudicator(glm-max) — different lanes → no collision.
  const task = { subtasks: [
    { id: 'e', need: ['code-generation'], prompt: 'build' },
    { id: 'a', need: ['adversarial-verify'], prompt: 'verify' },
  ] };
  const p = await planCompany(task, { quiet: true });
  const collide = p.independenceViolations.find((x) => x.critic === 'adjudicator' && x.producer === 'engineer' && x.lane === 'glm:glm');
  assert.equal(collide, undefined, 'engineer(glm) and adjudicator(glm-max) are different lanes — no violation');
});

// ── PHASE 6: DISARMED goal-cycle degrade + budgetCap ───────────────────────────
test('GREEN (D-14 disarmed-degrades): runCompany DISARMED skips the goal cycle with an explicit note', async () => {
  const r = await runCompany(TASK, { armed: false, quiet: true });
  assert.equal(r.armed, false);
  assert.equal(r.goalCycle.ran, false);
  assert.equal(r.goalCycle.skipped, true);
  assert.match(r.goalCycle.reason, /disarmed/i);
  assert.ok('inlineResults' in r);
  assert.ok(Array.isArray(r.independenceViolations));
});

// ── Multi-role fusion (owner feature 2026-07-02): co-roles raise capability density per lane ──

test('GREEN: castRole fuses a compatible co-role when opts.maxCoRoles > 1', () => {
  const roster = loadRoster();
  const need = deriveNeeds('research prior art, cite sources and synthesize the findings across domains');
  const cast = castRole(roster, { id: 'r1', prompt: 'research + synthesize', need }, { maxCoRoles: 2, quiet: true });
  assert.equal(cast.coRoles.length, 1, `expected exactly one co-role, got ${JSON.stringify(cast.coRoles)}`);
  assert.notEqual(cast.coRoles[0], cast.role);
  const co = getRole(roster, cast.coRoles[0]);
  assert.notEqual(co.group, 'verification');
  assert.notEqual(co.autonomyClass, 'owner-gated');
});

test('RED: verification critics NEVER fuse — engineer+adjudicator stays two lanes', () => {
  const roster = loadRoster();
  const need = deriveNeeds('implement the module and adversarially verify refute redteam it');
  const cast = castRole(roster, { id: 'r2', prompt: 'build + verify', need }, { maxCoRoles: 3, quiet: true });
  for (const id of cast.coRoles) {
    assert.notEqual(getRole(roster, id).group, 'verification', `verification role '${id}' must not fuse`);
  }
});

test('RED: fusion is OFF by default — no coRoles without opts.maxCoRoles', () => {
  const roster = loadRoster();
  const need = deriveNeeds('research prior art and synthesize the findings');
  const cast = castRole(roster, { id: 'r3', prompt: 'x', need }, { quiet: true });
  assert.deepEqual(cast.coRoles, []);
});

test('GREEN: fused leaf carries coRoles metadata and a co-role prompt section', async () => {
  await withDisarmed(async () => {
    const need = deriveNeeds('research prior art, cite sources and synthesize the findings across domains');
    const plan = await planCompany({ summary: 'fusion', subtasks: [{ id: 'f1', prompt: 'research + synthesize', need }] }, { maxCoRoles: 2, quiet: true });
    const all = [...plan.glmLeaves, ...plan.nativeSpecs, ...plan.inlineSpecs];
    assert.equal(all.length, 1);
    const unit = all[0];
    assert.match(unit.prompt, /co-role of/i, 'prompt must carry the co-role section');
    if (unit.coRoles) assert.equal(unit.coRoles.length, 1);
  });
});

test('GREY: owner-gated roles never ride as co-hats', () => {
  const roster = loadRoster();
  const need = deriveNeeds('decompose and route the plan, then implement the module');
  const cast = castRole(roster, { id: 'r4', prompt: 'x', need }, { maxCoRoles: 4, quiet: true });
  for (const id of cast.coRoles) {
    assert.notEqual(getRole(roster, id).autonomyClass, 'owner-gated', `owner-gated '${id}' must not fuse`);
  }
});
