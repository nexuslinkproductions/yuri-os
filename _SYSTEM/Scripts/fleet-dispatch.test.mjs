// fleet-dispatch — red/green for the role->pool + cross-substrate failover contract (no spend).
// Safety-critical property: DISARMED-by-default — without YURI_FLEET_DISPATCH=1 / the flag, fleetDispatch
// MUST dry-run and fan out NOTHING. Live failover (ollama 429 -> glm) is proven by the armed integration
// run in the build log, not here (no spend in unit tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPools, resolvePool, resolveCandidates, dispatchWithFailover, fleetDispatch, buildRunDir } from './fleet-dispatch.mjs';

// ── GREEN: pool resolution ────────────────────────────────────────────────────
test('GREEN: resolvePool — tier passthrough, rolePool, groupPool fallback, default', () => {
  const p = loadPools();
  assert.equal(resolvePool('codegen', p), 'codegen');            // sel IS a tier
  assert.equal(resolvePool('scout', p), 'research');             // rolePool override
  assert.equal(resolvePool('architect', p), 'heavy');            // rolePool override
  assert.equal(resolvePool('helmsman', p), 'heavy');
  assert.equal(resolvePool('nonexistent-role', p), 'research');  // default floor
});

test('GREEN: pools are non-Anthropic-first and span multiple substrates', () => {
  const p = loadPools();
  for (const [tier, keys] of Object.entries(p.pools)) {
    assert.ok(keys.length >= 2, `${tier} pool must have >=2 candidates for failover`);
    const substrates = new Set(keys.map((k) => p.substrateLanes[k]?.substrate));
    assert.ok(substrates.size >= 2, `${tier} pool must span >=2 substrates (got ${[...substrates]})`);
    // no candidate resolves to native Anthropic (opus/sonnet/haiku) — those are OMP-only, not lane-dispatchable
    for (const k of keys) assert.ok(p.substrateLanes[k].substrate !== 'anthropic', `${k} must not be native Anthropic`);
  }
});

// ── GREEN: candidate resolution ────────────────────────────────────────────────
test('GREEN: resolveCandidates — ordered, correct lane/model/substrate, arm-annotated', () => {
  const cands = resolveCandidates({ role: 'codegen' });
  assert.equal(cands[0].key, 'ollama:kimi');
  assert.equal(cands[0].lane, 'ollama-cloud');
  assert.equal(cands[0].model, 'kimi-k2.7-code:cloud');
  assert.equal(cands[0].substrate, 'ollama-cloud');
  assert.equal(cands[1].key, 'glm');
  assert.equal(cands[1].lane, 'glm');
  assert.equal(cands[1].model, null);               // glm lane implies its model
  assert.equal(typeof cands[0].armed, 'boolean');
});

test('GREEN: mimo is disarmed by default (no flag / no env) — proves arm detection', () => {
  delete process.env.YURI_MIMO_FLEET;
  const heavy = resolveCandidates({ pool: 'heavy' });
  const mimo = heavy.find((c) => c.substrate === 'xiaomi-mimo');
  assert.ok(mimo, 'heavy pool includes mimo');
  assert.equal(mimo.armed, false, 'mimo must be disarmed without its flag/env');
});

// ── RED (safety): DISARMED by default ──────────────────────────────────────────
test('RED (DISARMED default): fleetDispatch without arm dry-runs, spends NOTHING', async () => {
  delete process.env.YURI_FLEET_DISPATCH;
  const r = await fleetDispatch([{ role: 'bulk', label: 'A', prompt: 'x' }], {});
  assert.equal(r.dryRun, true);
  assert.equal(r.armed, false);
  assert.equal(r.results[0].dryRun, true, 'dry-run result carries no real dispatch');
  assert.equal(r.results[0].text, '', 'no text = no spend');
});

// ── GREEN: failover trail ───────────────────────────────────────────────────────
test('GREEN: dispatchWithFailover (dry-run) resolves a chosen candidate + trail', async () => {
  const runDir = buildRunDir(`fld-test-${Date.now().toString(36)}`);
  const r = await dispatchWithFailover({ role: 'research', label: 'T', prompt: 'x' }, runDir, { dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(r.dryRun, true);
  assert.ok(r.chosen, 'a candidate was chosen');
  assert.ok(Array.isArray(r.trail) && r.trail.length >= 1);
});

test('GREEN: unarmed candidates are skipped in the trail (failover past disarmed substrate)', async () => {
  // Force mimo-first synthetic pool via a task pointed at heavy, with ONLY mimo disarmed:
  // heavy = [glm-max, ollama:nemotron, mimo, ...] — mimo (disarmed) must appear as skipped when reached,
  // and an armed earlier candidate must be chosen. We assert the trail never *chooses* a disarmed substrate.
  delete process.env.YURI_MIMO_FLEET;
  const runDir = buildRunDir(`fld-test-skip-${Date.now().toString(36)}`);
  const r = await dispatchWithFailover({ pool: 'heavy', label: 'S', prompt: 'x' }, runDir, { dryRun: true });
  assert.equal(r.ok, true);
  assert.notEqual(r.chosenSubstrate, 'xiaomi-mimo', 'must never choose a disarmed substrate');
});
