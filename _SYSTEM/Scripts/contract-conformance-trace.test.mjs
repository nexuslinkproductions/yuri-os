// contract-conformance-trace.test.mjs — the DISARMED advisory soak recorder.
// Tests use record:false so they never write the real soak trace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordConformance, scopeAudit, CANONICAL_YURI_OUTPUT_CONTRACT, SCOPE_AUDIT_CONTRACT } from './contract-conformance-trace.mjs';

const GOOD = ['RESULT_LABEL: 08CW_X_GATE_X_PASS_COMMITTED', 'HEAD: x', 'STAGED: y', 'FILES_CHANGED: 1', 'VALIDATION: z'].join('\n');

test('scopeAudit: clean path → PASS, protected path → FAIL (segment-aware floor)', () => {
  assert.equal(scopeAudit(['_SYSTEM/Scripts/x.mjs'], { record: false }).verdict, 'PASS');
  const bad = scopeAudit(['.env'], { record: false });
  assert.equal(bad.verdict, 'FAIL');
  assert.ok(bad.hardFails.includes('scope-containment'));
  // ../ traversal still caught through the recorder
  assert.equal(scopeAudit(['_SYSTEM/Scripts/../../.env'], { record: false }).verdict, 'FAIL');
});

test('recordConformance: canonical YURI contract grades a real report; returns a compact soak entry', () => {
  const r = recordConformance(GOOD, { record: false, label: 'unit', invokedPaths: ['_SYSTEM/Scripts/x.mjs'] });
  assert.ok(['PASS', 'PARTIAL'].includes(r.verdict)); // canonical contract requires only RESULT_LABEL; GOOD has it
  assert.equal(r.soak.label, 'unit');
  assert.equal(typeof r.soak.ts, 'number');
  assert.ok(Array.isArray(r.soak.hardFails) && Array.isArray(r.soak.softFails));
});

test('recordConformance: DISARMED — never throws on hostile/garbage input, returns a verdict', () => {
  for (const bad of [null, undefined, 12345, {}, []]) {
    const r = recordConformance(bad, { record: false });
    assert.ok(['PASS', 'PARTIAL', 'FAIL'].includes(r.verdict), `verdict for ${JSON.stringify(bad)}`);
  }
});

test('enforce: HARD fail blocks only when armed; SOFT fails never block; disarmed never blocks', () => {
  // armed (opts.enforce:true) + HARD fail (protected path) → enforceBlock
  const hard = scopeAudit(['.env'], { record: false, enforce: true });
  assert.equal(hard.enforcing, true);
  assert.equal(hard.enforceBlock, true);
  // armed + clean path → no block
  assert.equal(scopeAudit(['_SYSTEM/Scripts/x.mjs'], { record: false, enforce: true }).enforceBlock, false);
  // armed + SOFT-only fail (narration) → NOT blocked (HARD-only enforcement)
  const softOnly = recordConformance('RESULT_LABEL: 08CW_X_GATE_X_PASS_COMMITTED\nLet me check the logs.', { record: false, enforce: true });
  assert.equal(softOnly.verdict, 'PARTIAL');
  assert.equal(softOnly.enforceBlock, false, 'soft failures never enforce-block');
  // DISARMED (enforce:false) → never blocks even on a HARD fail
  assert.equal(scopeAudit(['.env'], { record: false, enforce: false }).enforceBlock, false);
});

test('contracts: canonical requires a label; scope-audit does not', () => {
  // canonical on a labelless report → FAIL (label hard check)
  assert.equal(recordConformance('no label here', { record: false }).verdict, 'FAIL');
  // scope-audit contract on labelless empty output + clean path → PASS
  assert.equal(recordConformance('', { record: false, contract: SCOPE_AUDIT_CONTRACT, invokedPaths: ['_SYSTEM/Scripts/x.mjs'] }).verdict, 'PASS');
  assert.equal(CANONICAL_YURI_OUTPUT_CONTRACT.output_schema.fields.includes('RESULT_LABEL'), true);
});
