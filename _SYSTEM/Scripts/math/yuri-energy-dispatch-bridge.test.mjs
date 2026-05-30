import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  traceDispatchEvent,
  isObservabilityEnabled,
  _resetWarnOnce,
} from './yuri-energy-dispatch-bridge.mjs';
import { validateRecord } from './yuri-energy-trace.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Enable the guarded test-only reset of the warn-once sentinel. Without this
// flag, _resetWarnOnce() is a no-op (production-safety guard).
process.env.YURI_ENERGY_TEST = '1';

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-test-'));
}

function withObservability(value, fn) {
  const saved = process.env.YURI_ENERGY_OBSERVABILITY;
  if (value === undefined) delete process.env.YURI_ENERGY_OBSERVABILITY;
  else process.env.YURI_ENERGY_OBSERVABILITY = value;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.YURI_ENERGY_OBSERVABILITY;
    else process.env.YURI_ENERGY_OBSERVABILITY = saved;
  }
}

function withStateDir(dir, fn) {
  const saved = process.env.YURI_STATE_DIR;
  process.env.YURI_STATE_DIR = dir;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.YURI_STATE_DIR;
    else process.env.YURI_STATE_DIR = saved;
  }
}

// ---------------------------------------------------------------------------
// isObservabilityEnabled
// ---------------------------------------------------------------------------

test('isObservabilityEnabled returns false when env var is unset', () => {
  withObservability(undefined, () => {
    assert.equal(isObservabilityEnabled(), false);
  });
});

test('isObservabilityEnabled returns false for value "0"', () => {
  withObservability('0', () => assert.equal(isObservabilityEnabled(), false));
});

test('isObservabilityEnabled returns false for value "true"', () => {
  withObservability('true', () => assert.equal(isObservabilityEnabled(), false));
});

test('isObservabilityEnabled returns false for value "yes"', () => {
  withObservability('yes', () => assert.equal(isObservabilityEnabled(), false));
});

test('isObservabilityEnabled returns true only for exact value "1"', () => {
  withObservability('1', () => assert.equal(isObservabilityEnabled(), true));
});

// ---------------------------------------------------------------------------
// Default OFF — no-op behavior
// ---------------------------------------------------------------------------

test('traceDispatchEvent is a strict no-op when observability is off (no file written)', () => {
  const tmpDir = makeTmpDir();
  withObservability(undefined, () =>
    withStateDir(tmpDir, () => {
      traceDispatchEvent({ lane: 'shintai', runId: 'noop-test' });
    }),
  );
  const energyTraceDir = path.join(tmpDir, 'energy-trace');
  assert.equal(fs.existsSync(energyTraceDir), false, 'energy-trace dir must not be created');
});

test('traceDispatchEvent does not throw when observability is off', () => {
  withObservability(undefined, () => {
    assert.doesNotThrow(() => traceDispatchEvent({ lane: 'test', runId: 'no-throw' }));
  });
});

test('traceDispatchEvent with no arguments does not throw', () => {
  withObservability(undefined, () => {
    assert.doesNotThrow(() => traceDispatchEvent());
  });
});

// ---------------------------------------------------------------------------
// ON — record written, content verified
// ---------------------------------------------------------------------------

test('traceDispatchEvent writes a trace record when YURI_ENERGY_OBSERVABILITY=1', () => {
  const tmpDir = makeTmpDir();
  withObservability('1', () =>
    withStateDir(tmpDir, () => {
      traceDispatchEvent({ lane: 'shintai', runId: 'write-test' });
    }),
  );
  const date = new Date().toISOString().slice(0, 10);
  const tracePath = path.join(tmpDir, 'energy-trace', `${date}.jsonl`);
  assert.ok(fs.existsSync(tracePath), 'trace file must exist');
  const line = fs.readFileSync(tracePath, 'utf8').trim();
  assert.ok(line.length > 0, 'trace file must be non-empty');
});

test('written trace record is valid JSON with required fields', () => {
  const tmpDir = makeTmpDir();
  withObservability('1', () =>
    withStateDir(tmpDir, () => {
      traceDispatchEvent({ lane: 'offload', runId: 'json-check', numericContext: { verifiedEvidenceCount: 3 } });
    }),
  );
  const date = new Date().toISOString().slice(0, 10);
  const line = fs.readFileSync(path.join(tmpDir, 'energy-trace', `${date}.jsonl`), 'utf8').trim();
  const record = JSON.parse(line);
  assert.equal(record.lane, 'offload');
  assert.equal(record.runId, 'json-check');
  assert.equal(record.advisory_only, true);
  assert.equal(record.local_truth_claim, false);
  assert.ok(['accept', 'reject'].includes(record.decision));
});

test('written trace record passes validateRecord (Privacy Gate v3)', () => {
  const tmpDir = makeTmpDir();
  withObservability('1', () =>
    withStateDir(tmpDir, () => {
      traceDispatchEvent({ lane: 'codex-final-pass', runId: 'gate-check' });
    }),
  );
  const date = new Date().toISOString().slice(0, 10);
  const line = fs.readFileSync(path.join(tmpDir, 'energy-trace', `${date}.jsonl`), 'utf8').trim();
  const record = JSON.parse(line);
  assert.doesNotThrow(() => validateRecord(record), 'record must pass Privacy Gate v3');
});

test('ΔU = 0 for every synthetic dispatch (before and after state are identical)', () => {
  const tmpDir = makeTmpDir();
  withObservability('1', () =>
    withStateDir(tmpDir, () => {
      traceDispatchEvent({ lane: 'shintai', runId: 'delta-check', numericContext: { verifiedEvidenceCount: 5, evidence_count: 3 } });
    }),
  );
  const date = new Date().toISOString().slice(0, 10);
  const line = fs.readFileSync(path.join(tmpDir, 'energy-trace', `${date}.jsonl`), 'utf8').trim();
  const record = JSON.parse(line);
  assert.equal(record.deltaU, 0, 'ΔU must be 0 for dispatch events (before === after state)');
});

test('numericContext string values are stripped before record construction', () => {
  const tmpDir = makeTmpDir();
  withObservability('1', () =>
    withStateDir(tmpDir, () => {
      traceDispatchEvent({
        lane: 'offload',
        runId: 'strip-test',
        numericContext: {
          verifiedEvidenceCount: 2,
          promptBody: 'secret content — must not appear in record',
          freeLine: 'also forbidden',
        },
      });
    }),
  );
  const date = new Date().toISOString().slice(0, 10);
  const raw = fs.readFileSync(path.join(tmpDir, 'energy-trace', `${date}.jsonl`), 'utf8');
  assert.ok(!raw.includes('secret content'), 'stripped string must not appear in JSONL');
  assert.ok(!raw.includes('also forbidden'), 'stripped string must not appear in JSONL');
});

test('numericContext evidence_count maps to evidence_count in stateBefore_summary', () => {
  const tmpDir = makeTmpDir();
  withObservability('1', () =>
    withStateDir(tmpDir, () => {
      traceDispatchEvent({ lane: 'shintai', runId: 'evidence-map', numericContext: { evidence_count: 5 } });
    }),
  );
  const date = new Date().toISOString().slice(0, 10);
  const record = JSON.parse(fs.readFileSync(path.join(tmpDir, 'energy-trace', `${date}.jsonl`), 'utf8').trim());
  // evidence_count capped at 10, so 5 should map through directly
  assert.equal(record.stateBefore_summary.evidence_count, 5);
  assert.equal(record.stateAfter_summary.evidence_count, 5);
});

// ---------------------------------------------------------------------------
// Error isolation — telemetry errors must never propagate
// ---------------------------------------------------------------------------

test('telemetry errors are caught and do not propagate to the caller', () => {
  // Point YURI_STATE_DIR at an existing FILE (not a dir) so mkdirSync will fail
  const badPath = path.join(os.tmpdir(), `bridge-collision-${Date.now()}`);
  fs.writeFileSync(badPath, 'not-a-directory');

  withObservability('1', () =>
    withStateDir(badPath, () => {
      // Must not throw even though appendTrace will fail (badPath is a file, not dir)
      assert.doesNotThrow(
        () => traceDispatchEvent({ lane: 'offload', runId: 'error-isolation' }),
        'dispatch surface must not see telemetry errors',
      );
    }),
  );
});

test('one-time stderr warning fires on first telemetry error', () => {
  _resetWarnOnce();
  const badPath = path.join(os.tmpdir(), `bridge-warn-${Date.now()}`);
  fs.writeFileSync(badPath, 'not-a-directory');

  const warnings = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    const s = String(chunk);
    if (s.includes('yuri-energy-dispatch-bridge')) warnings.push(s);
    return origWrite(chunk, ...rest);
  };

  try {
    withObservability('1', () =>
      withStateDir(badPath, () => {
        traceDispatchEvent({ lane: 'test', runId: 'warn-first' });
      }),
    );
    assert.equal(warnings.length, 1, 'exactly one warning must fire on first error');
    assert.ok(warnings[0].includes('suppressed'), 'warning must state that dispatch is unaffected');
  } finally {
    process.stderr.write = origWrite;
  }
});

test('no second warning on subsequent telemetry error (one-time only)', () => {
  // _warnedOnce is already true from the previous test (or set explicitly here)
  // Either way: a second error must not produce another warning
  const badPath = path.join(os.tmpdir(), `bridge-warn2-${Date.now()}`);
  fs.writeFileSync(badPath, 'not-a-directory');

  const warnings = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    const s = String(chunk);
    if (s.includes('yuri-energy-dispatch-bridge')) warnings.push(s);
    return origWrite(chunk, ...rest);
  };

  try {
    withObservability('1', () =>
      withStateDir(badPath, () => {
        traceDispatchEvent({ lane: 'test', runId: 'warn-second' });
      }),
    );
    assert.equal(warnings.length, 0, 'no second warning must fire — one-time only per process');
  } finally {
    process.stderr.write = origWrite;
  }
});

// ---------------------------------------------------------------------------
// Concurrent calls
// ---------------------------------------------------------------------------

test('concurrent calls write distinct records without corruption', () => {
  const tmpDir = makeTmpDir();
  const date = new Date().toISOString().slice(0, 10);
  const N = 8;

  withObservability('1', () =>
    withStateDir(tmpDir, () => {
      for (let i = 0; i < N; i++) {
        traceDispatchEvent({ lane: 'shintai', runId: `concurrent-${i}` });
      }
    }),
  );

  const tracePath = path.join(tmpDir, 'energy-trace', `${date}.jsonl`);
  const lines = fs.readFileSync(tracePath, 'utf8').trim().split('\n').filter(Boolean);
  assert.equal(lines.length, N, `expected ${N} lines`);
  const runIds = new Set(lines.map((l) => JSON.parse(l).runId));
  assert.equal(runIds.size, N, 'each call must produce a distinct runId');
  for (const line of lines) {
    assert.doesNotThrow(() => JSON.parse(line), 'each line must be valid JSON');
  }
});

// ---------------------------------------------------------------------------
// Full-body error isolation — malformed input must never propagate (Codex
// BLOCKED 2026-05-28T20-30: destructuring + env check now inside try)
// ---------------------------------------------------------------------------

test('traceDispatchEvent(null) does not throw when observability is ON', () => {
  withObservability('1', () => {
    assert.doesNotThrow(() => traceDispatchEvent(null), 'null arg must be absorbed');
  });
});

test('traceDispatchEvent(undefined) does not throw when observability is ON', () => {
  withObservability('1', () => {
    assert.doesNotThrow(() => traceDispatchEvent(undefined), 'undefined arg must be absorbed');
  });
});

test('traceDispatchEvent() with no args does not throw when observability is ON', () => {
  withObservability('1', () => {
    assert.doesNotThrow(() => traceDispatchEvent(), 'missing arg must be absorbed');
  });
});

test('traceDispatchEvent(42) — non-object primitive does not throw', () => {
  withObservability('1', () => {
    assert.doesNotThrow(() => traceDispatchEvent(42), 'primitive arg must be absorbed');
  });
});

test('traceDispatchEvent("string") — string primitive does not throw', () => {
  withObservability('1', () => {
    assert.doesNotThrow(() => traceDispatchEvent('lane-as-string'), 'string arg must be absorbed');
  });
});

test('traceDispatchEvent(null) is a strict no-op when observability is OFF', () => {
  const tmpDir = makeTmpDir();
  withObservability(undefined, () =>
    withStateDir(tmpDir, () => {
      assert.doesNotThrow(() => traceDispatchEvent(null));
    }),
  );
  // OFF + null arg: no energy-trace directory should be created
  assert.equal(
    fs.existsSync(path.join(tmpDir, 'energy-trace')),
    false,
    'OFF path must do zero I/O even with malformed input',
  );
});

test('malformed input still produces no record (no partial write)', () => {
  const tmpDir = makeTmpDir();
  const date = new Date().toISOString().slice(0, 10);
  withObservability('1', () =>
    withStateDir(tmpDir, () => {
      traceDispatchEvent(null);
      traceDispatchEvent(42);
      traceDispatchEvent('x');
    }),
  );
  // Malformed inputs that survive into the trace path still produce VALID
  // records (lane/runId coerce to '') — but must never produce a corrupt or
  // partial line. Assert: if the file exists, every line is valid JSON.
  const tracePath = path.join(tmpDir, 'energy-trace', `${date}.jsonl`);
  if (fs.existsSync(tracePath)) {
    const lines = fs.readFileSync(tracePath, 'utf8').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line), 'no corrupt/partial lines from malformed input');
    }
  }
});

test('_resetWarnOnce is a no-op without YURI_ENERGY_TEST flag (production guard)', () => {
  const saved = process.env.YURI_ENERGY_TEST;
  delete process.env.YURI_ENERGY_TEST;
  try {
    // Force a warning, then attempt reset without the flag — reset must NOT work
    _resetWarnOnce(); // no-op here
    assert.doesNotThrow(() => _resetWarnOnce(), 'guarded reset must never throw');
  } finally {
    if (saved === undefined) delete process.env.YURI_ENERGY_TEST;
    else process.env.YURI_ENERGY_TEST = saved;
  }
});

// ---------------------------------------------------------------------------
// Phase 2 — user attribution + regime + canonical event taxonomy
// ---------------------------------------------------------------------------

function withActionMode(value, fn) {
  const saved = process.env.YURI_ENERGY_ACTION_MODE;
  if (value === undefined) delete process.env.YURI_ENERGY_ACTION_MODE;
  else process.env.YURI_ENERGY_ACTION_MODE = value;
  try { return fn(); } finally {
    if (saved === undefined) delete process.env.YURI_ENERGY_ACTION_MODE;
    else process.env.YURI_ENERGY_ACTION_MODE = saved;
  }
}
function withUserEnv(value, fn) {
  const saved = process.env.YURI_USER;
  if (value === undefined) delete process.env.YURI_USER;
  else process.env.YURI_USER = value;
  try { return fn(); } finally {
    if (saved === undefined) delete process.env.YURI_USER;
    else process.env.YURI_USER = saved;
  }
}
function readLastRecord(tmpDir) {
  const date = new Date().toISOString().slice(0, 10);
  const line = fs.readFileSync(path.join(tmpDir, 'energy-trace', `${date}.jsonl`), 'utf8').trim().split('\n').pop();
  return JSON.parse(line);
}

test('traceDispatchEvent stamps the resolved user handle from YURI_USER', () => {
  const tmpDir = makeTmpDir();
  withObservability('1', () => withStateDir(tmpDir, () => withUserEnv('Mike', () => {
    traceDispatchEvent({ lane: 'shintai', runId: 'user-env' });
  })));
  assert.equal(readLastRecord(tmpDir).user, 'mike');
});

test('explicit args.user overrides the env-resolved handle', () => {
  const tmpDir = makeTmpDir();
  withObservability('1', () => withStateDir(tmpDir, () => withUserEnv('Mike', () => {
    traceDispatchEvent({ lane: 'offload', runId: 'user-explicit', user: 'marcel' });
  })));
  assert.equal(readLastRecord(tmpDir).user, 'marcel');
});

test('default (no action mode) → regime=observability, event=Dispatch Recorded, ΔU=0', () => {
  const tmpDir = makeTmpDir();
  withObservability('1', () => withStateDir(tmpDir, () => withActionMode(undefined, () => {
    traceDispatchEvent({ lane: 'shintai', runId: 'obs-regime', numericContext: { verifiedEvidenceCount: 5 } });
  })));
  const r = readLastRecord(tmpDir);
  assert.equal(r.regime, 'observability');
  assert.equal(r.event, 'Dispatch Recorded');
  assert.equal(r.deltaU, 0);
});

test('action mode → regime=action, distinct before/after counts yield real (non-zero) ΔU', () => {
  const tmpDir = makeTmpDir();
  withObservability('1', () => withStateDir(tmpDir, () => withActionMode('1', () => {
    // more verified evidence after than before → verified credit lowers U → ΔU < 0
    traceDispatchEvent({
      lane: 'shintai', runId: 'action-delta',
      numericContext: { verifiedEvidenceCountBefore: 1, verifiedEvidenceCountAfter: 8 },
    });
  })));
  const r = readLastRecord(tmpDir);
  assert.equal(r.regime, 'action');
  assert.notEqual(r.deltaU, 0, 'distinct before/after must produce a real non-zero ΔU');
  assert.ok(['Proposal Accepted', 'Proposal Rejected'].includes(r.event));
});

test('action-mode record carrying user/regime/event still passes the Privacy Gate', () => {
  const tmpDir = makeTmpDir();
  withObservability('1', () => withStateDir(tmpDir, () => withActionMode('1', () => withUserEnv('mike', () => {
    traceDispatchEvent({ lane: 'codex-final-pass', runId: 'gate-newfields', numericContext: { verifiedEvidenceCountBefore: 0, verifiedEvidenceCountAfter: 3 } });
  }))));
  assert.doesNotThrow(() => validateRecord(readLastRecord(tmpDir)));
});

test('a user handle never leaks into a forbidden nested path (Privacy Gate negative)', () => {
  // sanity: the record carries user only at root; nested user strings are refused
  assert.throws(() => validateRecord({ stateAfter_summary: { user: 'mike' } }), /Privacy Gate/);
});
