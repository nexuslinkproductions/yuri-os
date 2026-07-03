import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countProcessLines, checkStaleProcesses } from './apply-preflight.mjs';

class MockPreflightResult {
  constructor() {
    this.passes = [];
    this.warnings = [];
    this.failures = [];
  }
  pass(message) { this.passes.push(message); }
  warn(message) { this.warnings.push(message); }
  fail(message) { this.failures.push(message); }
}

describe('countProcessLines', () => {
  it('empty stdout → 0', () => {
    assert.equal(countProcessLines(''), 0);
    assert.equal(countProcessLines('   \n'), 0);
  });

  it('single line → 1', () => {
    assert.equal(countProcessLines('26024 node company-dispatch.mjs'), 1);
  });

  it('multiple lines → correct count', () => {
    const stdout = '26024 node company-dispatch.mjs\n26029 node lane-dispatch.mjs\n';
    assert.equal(countProcessLines(stdout), 2);
  });
});

describe('checkStaleProcesses — live pgrep (hermetic when idle)', () => {
  it('validation mode with no stale dispatch → passes Check 5a/5b', () => {
    const result = new MockPreflightResult();
    checkStaleProcesses(result, { applyReady: false, forceStale: false });
    const pass5 = result.passes.filter((p) => p.startsWith('Check 5'));
    assert.ok(pass5.length >= 2, `expected Check 5 passes, got: ${JSON.stringify(result)}`);
    assert.equal(result.failures.length, 0);
  });
});
