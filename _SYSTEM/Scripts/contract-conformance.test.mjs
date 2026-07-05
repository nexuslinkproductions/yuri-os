// contract-conformance.test.mjs — verify + red-team the output-vs-contract gate.
// Gate posture: fail-CLOSED (never throw) on malformed input; HARD failure → FAIL; SOFT-only → PARTIAL.
// The REGRESSION block locks the 8 flaws an adversarial red-team (5 lenses) confirmed on 2026-06-13.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResultLabel, checkOutputConformance, classifyLaneOutcome } from './contract-conformance.mjs';

const CONTRACT = Object.freeze({
  flags: { no_stage_narration: true, broad_command_ban: true, final_report_only: true, report_line_cap: 25 },
  output_schema: { type: 'final_report', fields: ['RESULT_LABEL', 'HEAD', 'STAGED', 'FILES_CHANGED', 'VALIDATION'] },
  allowed_scope: ['_SYSTEM/Scripts/'],
  forbidden_scope: ['.env', 'backend/data/'],
  failure_contract: { blocked_result_label: '08L_YURI_HARNESS_CORE_X1_BLOCKED', repair_result_label: '08L_YURI_HARNESS_CORE_X1_REPAIR_REQUIRED' },
});
const GOOD = [
  'RESULT_LABEL: 08CW_CONTRACT_CONFORMANCE_GATE_X_PASS_COMMITTED',
  'HEAD: built the gate', 'STAGED: contract-conformance.mjs', 'FILES_CHANGED: 1', 'VALIDATION: tests green',
].join('\n');
const okPaths = { invokedPaths: ['_SYSTEM/Scripts/contract-conformance.mjs'] };

// ═══════════════ grammar parser ═══════════════
test('parseResultLabel: canonical example parses with no deviations', () => {
  const p = parseResultLabel('08CW_PDF_TEXT_EXTRACTION_POPPLER_X_PASS_COMMITTED');
  assert.equal(p.ok, true); assert.equal(p.laneId, '08CW'); assert.equal(p.description, 'PDF_TEXT_EXTRACTION_POPPLER');
  assert.equal(p.passTypeNorm, 'X'); assert.equal(p.terminal, 'PASS_COMMITTED'); assert.equal(p.canonical, true);
});
test('parseResultLabel: compiler variant (08L / X1) parses ok but flags both deviations', () => {
  const p = parseResultLabel('08L_YURI_HARNESS_CORE_X1_BLOCKED');
  assert.equal(p.ok, true); assert.equal(p.variant, true); assert.equal(p.passTypeNorm, 'X'); assert.equal(p.terminal, 'BLOCKED');
  assert.ok(p.issues.some((i) => i.includes('lane-id-noncanonical')));
  assert.ok(p.issues.some((i) => i.includes('pass-type-variant')));
});
test('parseResultLabel: fail-closed on empty, non-string, too-few-segments, bad pass-type/terminal', () => {
  assert.equal(parseResultLabel('').ok, false);
  assert.equal(parseResultLabel(null).ok, false);
  assert.equal(parseResultLabel('FOO').ok, false);
  assert.equal(parseResultLabel('08CW_FOO_Z_COMMITTED').ok, false);
  assert.equal(parseResultLabel('08CW_FOO_X_DONE').ok, false);
});
test('parseResultLabel: too-long / lowercase description flagged as variant', () => {
  assert.ok(parseResultLabel('08CW_' + 'A'.repeat(61) + '_X_COMMITTED').issues.some((i) => i.includes('description-too-long')));
  assert.ok(parseResultLabel('08CW_lower_case_X_COMMITTED').issues.some((i) => i.includes('not-screaming-snake')));
});

// ═══════════════ happy path + fail-closed shape ═══════════════
test('checkOutputConformance: fully-conforming output → PASS, all checks green', () => {
  const r = checkOutputConformance(CONTRACT, GOOD, okPaths);
  assert.equal(r.verdict, 'PASS', `hardFails=${r.hardFails} softFails=${r.softFails}`);
  assert.equal(r.ok, true); assert.equal(r.score, 1);
});
test('checkOutputConformance: malformed contract or non-string output → FAIL', () => {
  assert.equal(checkOutputConformance(null, GOOD).verdict, 'FAIL');
  assert.equal(checkOutputConformance(CONTRACT, 12345).verdict, 'FAIL');
  assert.equal(checkOutputConformance(CONTRACT, { not: 'a string' }).verdict, 'FAIL');
});
test('checkOutputConformance: no RESULT_LABEL in output → HARD FAIL', () => {
  const r = checkOutputConformance(CONTRACT, 'HEAD: did stuff\nVALIDATION: ok');
  assert.equal(r.verdict, 'FAIL'); assert.ok(r.hardFails.includes('result-label-grammar'));
});
test('checkOutputConformance: soft-only failures → PARTIAL', () => {
  const out = ['RESULT_LABEL: 08CW_X_GATE_X_PASS_COMMITTED', 'HEAD: x', 'STAGED: y', 'VALIDATION: z'].join('\n'); // no FILES_CHANGED
  const r = checkOutputConformance(CONTRACT, out, okPaths);
  assert.equal(r.verdict, 'PARTIAL'); assert.ok(r.softFails.includes('output-schema-fields'));
});

// ═══════════════ REGRESSION: red-team confirmed flaws (2026-06-13) ═══════════════

// ① SCOPE-ESCAPE: path-traversal (../) resolving to a forbidden surface → HARD FAIL (was PASS)
test('REGRESSION scope: ../ traversal to .env / backend/data is a HARD FAIL', () => {
  for (const p of ['_SYSTEM/Scripts/../../.env', '_SYSTEM/Scripts/../.env', '_SYSTEM/Scripts/../backend/data/secret', '_SYSTEM/Scripts/../../backend/data/', '_SYSTEM/Scripts/sub/../../../.env']) {
    const r = checkOutputConformance(CONTRACT, GOOD, { invokedPaths: [p] });
    assert.equal(r.verdict, 'FAIL', `${p} must FAIL`);
    assert.ok(r.hardFails.includes('scope-containment'), `${p} → scope-containment hard fail`);
  }
});
// ① nested secret + ① sibling-prefix false-accept
test('REGRESSION scope: nested .env (config/.env) and sibling-prefix escape are caught', () => {
  assert.equal(checkOutputConformance({ forbidden_scope: ['.env'], allowed_scope: [], flags: {} }, GOOD, { invokedPaths: ['config/.env'] }).verdict, 'FAIL');
  // allowed '_SYSTEM/Scripts' must NOT accept sibling '_SYSTEM/Scripts-stash/exfil.mjs'
  assert.equal(checkOutputConformance({ allowed_scope: ['_SYSTEM/Scripts'], forbidden_scope: [], flags: {} }, GOOD, { invokedPaths: ['_SYSTEM/Scripts-stash/exfil.mjs'] }).verdict, 'FAIL');
});
// .env.local dotfile-variant still caught
test('REGRESSION scope: .env.local dotfile-variant is caught (fail-closed secret match)', () => {
  assert.equal(checkOutputConformance(CONTRACT, GOOD, { invokedPaths: ['.env.local'] }).verdict, 'FAIL');
});
// always-on PROTECTED FLOOR: .env caught even when contract declares NO scope (vacuous-contract rubber-stamp)
test('REGRESSION floor: protected surface (.env) is HARD-FAILed even with an empty contract scope', () => {
  const r = checkOutputConformance({ flags: {} }, GOOD, { invokedPaths: ['.env'] });
  assert.equal(r.verdict, 'FAIL'); assert.ok(r.hardFails.includes('scope-containment'));
  assert.equal(checkOutputConformance({ flags: {} }, GOOD, { invokedPaths: ['.claude/state/x'] }).verdict, 'FAIL');
});

// ⑤/④ LABEL ANCHORING: an aspirational PASS label in prose must NOT be graded over the real RESULT_LABEL line
test('REGRESSION label: aspirational prose label is ignored; the RESULT_LABEL: marker line is graded', () => {
  const out = ['Note the success criteria 08CW_GOAL_X_PASS_COMMITTED would be ideal.', 'RESULT_LABEL: 08CW_TASK_F_BLOCKED'].join('\n');
  const r = checkOutputConformance({ output_schema: { fields: ['RESULT_LABEL'] }, allowed_scope: ['_SYSTEM/'], forbidden_scope: [], flags: {} }, out, { invokedPaths: ['_SYSTEM/x.mjs'] });
  assert.equal(r.blockedMode, true, 'graded the real BLOCKED marker line, not the prose PASS');
});
// ④ blockedMode LAUNDERING: a stray blocked-label mention must NOT suppress soft checks when the PRIMARY label is PASS
test('REGRESSION blockedMode: stray blocked-label mention does not launder a PASS-claiming report', () => {
  const C = { flags: { no_stage_narration: true, broad_command_ban: false, final_report_only: true, report_line_cap: 10 }, output_schema: { fields: ['RESULT_LABEL'] }, allowed_scope: [], forbidden_scope: [], failure_contract: { blocked_result_label: '08L_HARNESS_X1_BLOCKED' } };
  const body = ['RESULT_LABEL: 08CW_DONE_X_PASS_COMMITTED', 'Let me check the thing.'].concat(Array.from({ length: 20 }, (_, i) => 'x' + i)).join('\n');
  const attack = body + '\nsee earlier 08L_HARNESS_X1_BLOCKED attempt';
  const r = checkOutputConformance(C, attack);
  assert.equal(r.blockedMode, false, 'primary label is X_PASS_COMMITTED → not blocked-mode');
  assert.equal(r.verdict, 'PARTIAL'); // narration + line-cap still enforced
  assert.ok(r.softFails.includes('no-stage-narration') && r.softFails.includes('report-line-cap'));
});
// genuine blocked report (primary terminal BLOCKED) DOES get the exemptions
test('REGRESSION blockedMode: genuine BLOCKED primary label exempts narration + line-cap', () => {
  const big = ['RESULT_LABEL: 09SC_DEPENDENCY_AUDIT_F_BLOCKED', 'Let me explain the blockers.'].concat(Array.from({ length: 40 }, (_, i) => 'blocker ' + i)).join('\n');
  const r = checkOutputConformance(CONTRACT, big, okPaths);
  assert.equal(r.blockedMode, true);
  assert.ok(!r.softFails.includes('report-line-cap') && !r.softFails.includes('no-stage-narration'));
});

// ⑤/⑥/⑦ FAIL-CLOSED (never throw): malformed scope entry, null opts, hostile getter → FAIL not exception
test('REGRESSION fail-closed: non-string scope entry → FAIL (not TypeError)', () => {
  assert.equal(checkOutputConformance({ forbidden_scope: [null], allowed_scope: [], flags: {} }, GOOD, { invokedPaths: ['_SYSTEM/x'] }).verdict, 'PASS'); // null filtered out, floor still applies, _SYSTEM/x clean
  assert.equal(checkOutputConformance({ allowed_scope: [123, '_SYSTEM/Scripts/'], forbidden_scope: ['.env'], flags: {} }, GOOD, { invokedPaths: ['.env'] }).verdict, 'FAIL'); // 123 filtered, .env still hard-fails
});
test('REGRESSION fail-closed: opts=null does not throw, returns a verdict', () => {
  const r = checkOutputConformance(CONTRACT, GOOD, null);
  assert.ok(['PASS', 'PARTIAL', 'FAIL'].includes(r.verdict));
});
test('REGRESSION fail-closed: hostile throwing getter on contract → FAIL (caught), never propagates', () => {
  const c = {}; Object.defineProperty(c, 'allowed_scope', { get() { throw new Error('getter-trap'); } });
  const r = checkOutputConformance(c, GOOD, { invokedPaths: ['x'] });
  assert.equal(r.verdict, 'FAIL'); assert.ok(r.hardFails.includes('internal-error'));
});

// ⑧ FALSE-POSITIVE (trust-erosion): legitimate report prose must NOT be flagged
test('REGRESSION false-positive: report-closing courtesy prose stays PASS (not narration)', () => {
  for (const line of ['Let me know if you want me to wire it into the enforcing hook.', "Here's what I changed: the parser now tolerates the X1 variant.", "Let's keep the gate advisory until a Codex pass lands."]) {
    const r = checkOutputConformance(CONTRACT, GOOD + '\n' + line, okPaths);
    assert.equal(r.verdict, 'PASS', `false-positive on: "${line}" (softFails=${r.softFails})`);
  }
});
test('REGRESSION false-positive: documenting/forbidding a broad command stays PASS', () => {
  for (const line of ['The deny-list refuses find / scans because they are unbounded.', 'We never run git add -A; staging is always scoped.', 'The PreToolUse hook blocks rm -rf / before the shell.', 'Anti-pattern: do not git add . the whole tree.']) {
    const r = checkOutputConformance(CONTRACT, GOOD + '\n' + line, okPaths);
    assert.equal(r.verdict, 'PASS', `false-positive on: "${line}" (softFails=${r.softFails})`);
  }
});
// but genuine execution-narration / issued command IS still caught
test('soft scanners still catch genuine execution-narration and an issued broad command', () => {
  const narr = checkOutputConformance(CONTRACT, GOOD + '\nLet me check the logs first.', okPaths);
  assert.ok(narr.softFails.includes('no-stage-narration'), 'execution narration caught');
  const cmd = checkOutputConformance(CONTRACT, GOOD + '\ngit add .', okPaths);
  assert.ok(cmd.softFails.includes('broad-command-ban'), 'line-start issued command caught');
});

// vacuous contract + non-canonical lane-id surfacing
test('REGRESSION vacuous: a contract with nothing checkable cannot certify a clean PASS', () => {
  const r = checkOutputConformance({ flags: {}, output_schema: { fields: [] }, allowed_scope: [], forbidden_scope: [] }, 'RESULT_LABEL: 08CW_NOTHING_X_PASS_COMMITTED');
  assert.equal(r.vacuous, true); assert.equal(r.verdict, 'PARTIAL'); assert.ok(r.softFails.includes('contract-substance'));
});
test('REGRESSION canonical-surfacing: a non-canonical lane-id (08C) is surfaced as a soft fail, not silent PASS', () => {
  const out = ['RESULT_LABEL: 08C_TASK_X_COMMITTED', 'HEAD: h', 'STAGED: s', 'FILES_CHANGED: 1', 'VALIDATION: v'].join('\n');
  const r = checkOutputConformance(CONTRACT, out, okPaths);
  assert.equal(r.verdict, 'PARTIAL'); assert.ok(r.softFails.includes('result-label-canonical'));
});

// scope check is not fabricated when no invoked paths are supplied
test('checkOutputConformance: scope check is skipped (not faked) when no invokedPaths given', () => {
  const r = checkOutputConformance(CONTRACT, GOOD);
  assert.ok(!r.checks.some((c) => c.name === 'scope-containment'));
  assert.equal(r.verdict, 'PASS');
});

// ═══════════════ REGRESSION: Codex gpt-5.5 pre-wiring review (2026-06-13) ═══════════════

// CODEX-1: non-string invokedPaths must NOT silently drop scope. Coerce tool-records; fail-closed on non-coercible.
test('REGRESSION codex-1: object tool-record invokedPaths are coerced (not dropped) and still scope-checked', () => {
  assert.equal(checkOutputConformance(CONTRACT, GOOD, { invokedPaths: [{ path: '.env' }] }).verdict, 'FAIL', '{path:.env} coerced → caught');
  assert.equal(checkOutputConformance(CONTRACT, GOOD, { invokedPaths: [{ file: '_SYSTEM/Scripts/x.mjs' }] }).verdict, 'PASS', 'legit record within scope');
});
test('REGRESSION codex-1: non-coercible invokedPaths fail CLOSED (scope-input-malformed), never silent PASS', () => {
  const r = checkOutputConformance(CONTRACT, GOOD, { invokedPaths: [123, {}, Symbol('x')] });
  assert.equal(r.verdict, 'FAIL'); assert.ok(r.hardFails.includes('scope-input-malformed'));
  // ANY malformed entry fails closed, even alongside a valid one
  const mixed = checkOutputConformance(CONTRACT, GOOD, { invokedPaths: ['_SYSTEM/Scripts/ok.mjs', 42] });
  assert.equal(mixed.verdict, 'FAIL'); assert.ok(mixed.hardFails.includes('scope-input-malformed'));
});

// CODEX-2: prose (semantic) allowed_scope must NOT be treated as filesystem prefixes → no false HARD FAIL
test('REGRESSION codex-2: prose allowed_scope (genome-style) does not false-fail a legitimate invoked path', () => {
  const PROSE = { flags: {}, output_schema: { fields: ['RESULT_LABEL'] },
    allowed_scope: ['Decode raw input into objective, constraints, risks.', 'Use YURI context and registry architecture before durable writes.'],
    forbidden_scope: ['Direct Claude one-shot calls', '.env', 'backend/data/'] };
  assert.equal(checkOutputConformance(PROSE, GOOD, { invokedPaths: ['_SYSTEM/Scripts/yuri-input-genome.mjs'] }).verdict, 'PASS', 'prose scope ignored for path-containment');
  // but a path-like forbidden entry mixed into prose scope STILL enforces
  assert.equal(checkOutputConformance(PROSE, GOOD, { invokedPaths: ['.env'] }).verdict, 'FAIL', 'path-like forbidden still bites');
});
test('REGRESSION codex-2: explicit allowed_paths/forbidden_paths are honored', () => {
  const C = { flags: {}, output_schema: { fields: ['RESULT_LABEL'] }, allowed_paths: ['_SYSTEM/Scripts/'], forbidden_paths: ['_SYSTEM/Scripts/secret/'] };
  assert.equal(checkOutputConformance(C, GOOD, { invokedPaths: ['_SYSTEM/Scripts/ok.mjs'] }).verdict, 'PASS');
  assert.equal(checkOutputConformance(C, GOOD, { invokedPaths: ['_SYSTEM/Scripts/secret/key'] }).verdict, 'FAIL');
});

// CODEX-3: command_output_caps coarsely enforced; split_required_trigger surfaced as not-enforced (no over-claim)
test('REGRESSION codex-3: a 20k-char line trips command-output-cap; split_required_trigger is surfaced not-enforced', () => {
  const C = { flags: { command_output_caps: true, split_required_trigger: true }, output_schema: { fields: ['RESULT_LABEL'] } };
  const out = 'RESULT_LABEL: 08CW_X_GATE_X_PASS_COMMITTED\n' + 'a'.repeat(20000);
  const r = checkOutputConformance(C, out);
  assert.equal(r.verdict, 'PARTIAL'); assert.ok(r.softFails.includes('command-output-cap'));
  assert.ok(r.notEnforced.some((n) => n.startsWith('split_required_trigger')), 'honest about what it cannot check');
});

// dotfile-precision tradeoff (Codex note): .env.local caught, but .envrc / .amp-cache no longer false-flagged
test('REGRESSION codex-note: dotfile match is precise — .env.local caught, .envrc/.amp-cache not false-flagged', () => {
  const C = { flags: {}, output_schema: { fields: ['RESULT_LABEL'] } }; // floor only, no allowed_scope
  assert.equal(checkOutputConformance(C, GOOD, { invokedPaths: ['.env.local'] }).verdict, 'FAIL', '.env.local is a secret variant');
  assert.equal(checkOutputConformance(C, GOOD, { invokedPaths: ['.envrc'] }).verdict, 'PASS', '.envrc not a protected target');
  assert.equal(checkOutputConformance(C, GOOD, { invokedPaths: ['.amp-cache/x'] }).verdict, 'PASS', '.amp-cache not .amp');
});

// expects_result_label:false — meta-report (e.g. closeout scope audit) skips the label HARD check
test('expects_result_label:false skips the label check but still enforces scope', () => {
  const C = { expects_result_label: false, flags: {} };
  const ok = checkOutputConformance(C, '', { invokedPaths: ['_SYSTEM/Scripts/x.mjs'] });
  assert.equal(ok.verdict, 'PASS', 'no label required + clean scope → PASS');
  assert.ok(!ok.checks.some((c) => c.name === 'result-label-grammar'), 'label check skipped');
  assert.equal(checkOutputConformance(C, '', { invokedPaths: ['.env'] }).verdict, 'FAIL', 'scope still enforced without a label');
});

// ═══════════════ classifyLaneOutcome — the cosmetic-exit-1 fix (2026-07-03) ═══════════════
// Both glm-fleet + ollama-fleet delegate lane pass/fail here. A lane's PROCESS EXIT CODE and its
// PRODUCED OUTPUT can disagree; classification is OUTPUT-first. Locks the owner-flagged false-error:
// a complete, labeled design doc that exited non-zero (post-output cap-kill) must NOT read as a fleet fail.
const LABELED = 'Design written.\nRESULT_LABEL: 10GC_PROVIDER_CONNECTORS_DESIGN_X_PASS_COMMITTED';
test('classifyLaneOutcome: clean exit + labeled output → ok, not degraded', () => {
  const o = classifyLaneOutcome({ code: 0, text: LABELED });
  assert.equal(o.ok, true); assert.equal(o.degraded, false); assert.equal(o.reason, 'clean');
});
test('REGRESSION cosmetic-exit-1: nonzero exit + complete X-labeled output → ok (degraded)', () => {
  const o = classifyLaneOutcome({ code: 1, text: LABELED });
  assert.equal(o.ok, true, 'a finished lane that exited 1 after writing --out is NOT a failure');
  assert.equal(o.degraded, true);
  assert.match(o.reason, /completed-despite-exit-1/);
});
test('classifyLaneOutcome: nonzero exit + P (partial) label → still ok (work landed)', () => {
  const o = classifyLaneOutcome({ code: 137, text: 'partial notes\nRESULT_LABEL: 10GS_SYNC_DIAGNOSIS_P_PASS_COMMITTED' });
  assert.equal(o.ok, true); assert.equal(o.degraded, true);
});
test('classifyLaneOutcome: nonzero exit + F (self-reported-failed) label → NOT ok (fail loudly)', () => {
  const o = classifyLaneOutcome({ code: 1, text: 'could not finish\nRESULT_LABEL: 10GX_TASK_F_PASS_COMMITTED' });
  assert.equal(o.ok, false, 'an F label is a self-declared failure — never upgrade it');
});
test('classifyLaneOutcome: nonzero exit + usable output but NO label → NOT ok (cannot certify)', () => {
  const o = classifyLaneOutcome({ code: 1, text: 'a long design doc with no result label at all' });
  assert.equal(o.ok, false); assert.match(o.reason, /no-pass-label/);
});
test('classifyLaneOutcome: empty --out (clean exit) → NOT ok (empty-output)', () => {
  const o = classifyLaneOutcome({ code: 0, text: '' });
  assert.equal(o.ok, false); assert.equal(o.reason, 'empty-output');
});
test('classifyLaneOutcome: failure sentinel in --out → NOT ok even if exit 0', () => {
  assert.equal(classifyLaneOutcome({ code: 0, text: '[GLM_FLEET_LIKELY_TIMEOUT] lane=glm-max exit=null' }).ok, false);
  assert.equal(classifyLaneOutcome({ code: 3, text: 'LANE_DISPATCH_FAIL lane=ollama-cloud reason=exit_3' }).ok, false);
});
test('classifyLaneOutcome: missing/garbage input fails closed (never throws)', () => {
  assert.equal(classifyLaneOutcome().ok, false);
  assert.equal(classifyLaneOutcome({ code: 1 }).ok, false);
  assert.equal(classifyLaneOutcome({ code: 0, text: null }).ok, false);
});
