// zai-tmux-fleet — red/grey/green hermetic tests (no live tmux unless smoke flag).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  resolveModel, DEFAULT_MODEL, WORKER_PREFIX, isArmed, zaiTmuxFleet, ARM_FLAG,
  stripInjectedPrompt, hasSubstantiveEvidence, classifyPollResult,
  DEFAULT_MIN_DURATION_MS, SMOKE_MIN_DURATION_MS, FALSE_GREEN_REASON,
} from './zai-tmux-fleet.mjs';
import { extractResultLabel, validatePacket } from './ollama-fleet.mjs';

const LABEL = '01LT_ZAI_TMUX_FLEET_SMOKE_X_PASS_COMMITTED';
const PROMPT_WITH_LABEL = `Do the work and emit RESULT_LABEL: ${LABEL}`;

test('GREEN: default model glm-5.2; worker prefix zai-worker; min duration defaults', () => {
  assert.equal(DEFAULT_MODEL, 'glm-5.2');
  assert.equal(WORKER_PREFIX, 'zai-worker');
  assert.equal(DEFAULT_MIN_DURATION_MS, 60000);
  assert.equal(SMOKE_MIN_DURATION_MS, 5000);
  assert.equal(resolveModel({}), DEFAULT_MODEL);
  assert.equal(resolveModel({ model: 'glm-4.7' }), 'glm-4.7');
});

test('GREEN: extractResultLabel finds conforming label in pane fixture', () => {
  const pane = 'working...\nRESULT_LABEL: 01LT_ZAI_TMUX_FLEET_SMOKE_X_PASS_COMMITTED\n';
  assert.equal(extractResultLabel(pane), '01LT_ZAI_TMUX_FLEET_SMOKE_X_PASS_COMMITTED');
  assert.equal(
    extractResultLabel('ok\n01LT_L1_ZAI_TMUX_ADAPTER_X_PASS_COMMITTED'),
    '01LT_L1_ZAI_TMUX_ADAPTER_X_PASS_COMMITTED',
  );
});

test('RED: stripInjectedPrompt removes echoed prompt before label scan', () => {
  const echoed = `${PROMPT_WITH_LABEL}\n$ ${PROMPT_WITH_LABEL}\nclaude thinking...`;
  const stripped = stripInjectedPrompt(echoed, PROMPT_WITH_LABEL);
  assert.equal(extractResultLabel(stripped), '');
  assert.ok(!stripped.includes(LABEL));
});

test('RED: label embedded only in injected prompt is false-green after strip', () => {
  const pane = `${PROMPT_WITH_LABEL}\n$ ${PROMPT_WITH_LABEL}`;
  const stripped = stripInjectedPrompt(pane, PROMPT_WITH_LABEL);
  const label = extractResultLabel(stripped);
  assert.equal(label, '');
  const rawLabel = extractResultLabel(pane);
  assert.equal(rawLabel, LABEL);
  const v = classifyPollResult({
    resultLabel: rawLabel,
    baselineLabel: '',
    elapsedMs: 1200,
    strippedText: stripped,
    prompt: PROMPT_WITH_LABEL,
    minDurationMs: DEFAULT_MIN_DURATION_MS,
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /label-in-prompt/);
});

test('RED: classifyPollResult rejects prompt-echo false-green (too-fast, no-substance)', () => {
  const prompt = 'Implement evalMeanBrier in _SYSTEM/Scripts/train-fleet-router-from-ledger.mjs';
  const pane = `${prompt}\n$ ${prompt}\nRESULT_LABEL: 02J2_HELD_OUT_BRIER_X_PASS_COMMITTED\n`;
  const stripped = stripInjectedPrompt(pane, prompt);
  const label = extractResultLabel(stripped);
  assert.equal(label, '02J2_HELD_OUT_BRIER_X_PASS_COMMITTED');
  const v = classifyPollResult({
    resultLabel: label,
    baselineLabel: '',
    elapsedMs: 1200,
    strippedText: stripped,
    prompt,
    minDurationMs: DEFAULT_MIN_DURATION_MS,
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, new RegExp(FALSE_GREEN_REASON));
  assert.match(v.reason, /too-fast/);
  assert.match(v.reason, /no-substance/);
});

test('RED: classifyPollResult rejects label already in baseline pane', () => {
  const stripped = 'done\nRESULT_LABEL: 02J2_HELD_OUT_BRIER_X_PASS_COMMITTED\n';
  const label = extractResultLabel(stripped);
  const v = classifyPollResult({
    resultLabel: label,
    baselineLabel: label,
    elapsedMs: 120000,
    strippedText: stripped,
    prompt: 'short prompt',
    minDurationMs: DEFAULT_MIN_DURATION_MS,
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /baseline-had-label/);
});

test('GREEN: classifyPollResult accepts substantive output after min duration', () => {
  const body = [
    'Implemented evalMeanBrier in _SYSTEM/Scripts/train-fleet-router-from-ledger.mjs',
    '```js',
    'export function evalMeanBrier(rows) { return 0.12; }',
    '```',
    `RESULT_LABEL: 02J2_HELD_OUT_BRIER_X_PASS_COMMITTED`,
  ].join('\n');
  const stripped = stripInjectedPrompt(body, PROMPT_WITH_LABEL);
  const label = extractResultLabel(stripped);
  assert.equal(label, '02J2_HELD_OUT_BRIER_X_PASS_COMMITTED');
  const v = classifyPollResult({
    resultLabel: label,
    baselineLabel: '',
    elapsedMs: 90000,
    strippedText: stripped,
    prompt: PROMPT_WITH_LABEL,
    minDurationMs: DEFAULT_MIN_DURATION_MS,
  });
  assert.equal(v.ok, true);
  assert.equal(hasSubstantiveEvidence(stripped, PROMPT_WITH_LABEL), true);
});

test('GREY: smoke min duration is lower than default task floor', () => {
  const smokePrompt = 'Reply with one short line confirming Z.ai tmux fleet is live, then on a NEW line emit exactly: 01LT_ZAI_TMUX_FLEET_SMOKE_X_PASS_COMMITTED . No other text.';
  const stripped = [
    'Z.ai tmux fleet is live — glm-5.2 worker responded in tmux session zai-worker-1.',
    'Headless capture-pane poll path verified; claude-zai interactive shell accepted send-keys.',
    'RESULT_LABEL: 01LT_ZAI_TMUX_FLEET_SMOKE_X_PASS_COMMITTED',
  ].join('\n');
  const label = extractResultLabel(stripped);
  const fastOk = classifyPollResult({
    resultLabel: label,
    baselineLabel: '',
    elapsedMs: 6000,
    strippedText: stripped,
    prompt: smokePrompt,
    minDurationMs: SMOKE_MIN_DURATION_MS,
  });
  assert.equal(fastOk.ok, true);
  const tooFast = classifyPollResult({
    resultLabel: label,
    baselineLabel: '',
    elapsedMs: 2000,
    strippedText: stripped,
    prompt: smokePrompt,
    minDurationMs: SMOKE_MIN_DURATION_MS,
  });
  assert.equal(tooFast.ok, false);
  assert.match(tooFast.reason, /too-fast/);
});

test('RED (DISARMED default): zaiTmuxFleet({armed:false}) dry-runs, spawns NOTHING', async () => {
  const r = await zaiTmuxFleet([{ label: 'A', prompt: 'x' }], { armed: false });
  assert.equal(r.armed, false);
  assert.equal(r.dryRun, true);
  assert.ok(Array.isArray(r.plan) && r.plan.length === 1);
  assert.equal(r.plan[0].model, 'glm-5.2');
  assert.equal(r.plan[0].provider, 'zai-tmux');
  assert.match(r.plan[0].workerName, /^zai-worker/);
  assert.equal(r.results, undefined, 'no results = no tmux spend');
});

test('RED: validatePacket rejects malformed packets', () => {
  assert.equal(validatePacket({ laneId: 'x', role: 'r', status: 'ok', resultLabel: '' }), true);
  assert.equal(validatePacket(null), false);
});

test('GREY: collided labels are de-duped', async () => {
  const r = await zaiTmuxFleet(
    [{ label: 'DUP', prompt: 'a' }, { label: 'DUP', prompt: 'b' }],
    { armed: false },
  );
  const labels = r.plan.map((p) => p.label);
  assert.equal(new Set(labels).size, 2);
});

test('GREY: concurrency default 2 in dry-run plan metadata', async () => {
  const r = await zaiTmuxFleet([{ label: 'X', prompt: 'y' }], { armed: false, concurrency: 2 });
  assert.equal(r.concurrency, 2);
});

test('GREY: isArmed is false with no env + no flag', () => {
  const prev = process.env.YURI_ZAI_TMUX_FLEET;
  delete process.env.YURI_ZAI_TMUX_FLEET;
  const armed = isArmed();
  if (prev !== undefined) process.env.YURI_ZAI_TMUX_FLEET = prev;
  assert.equal(typeof armed, 'boolean');
  if (!fs.existsSync(ARM_FLAG)) assert.equal(armed, false);
});
