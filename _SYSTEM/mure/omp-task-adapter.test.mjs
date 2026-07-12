import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadOmpTranscript,
  parseOmpSpawnReceipt,
  parseOmpTaskResult,
  deterministicOmpTaskId,
  validateOmpJobId,
  isTerminalStatus,
  parseOmpTranscript,
  OMP_OBSERVATION_CONTRACT_VERSION,
} from './omp-task-adapter.mjs';

// ── shared fixtures ──────────────────────────────────────────────────

const VALID_RECEIPT = { jobId: 'task-001', agent: 'mure-scout' };
const VALID_RESULT = {
  id: 'MurScout1234Xyz',
  agent: 'mure-scout',
  status: 'completed',
  duration: 42,
  output: 'all good',
};

function validTranscript({ withYield = true } = {}) {
  const lines = [
    JSON.stringify({ type: 'session', sessionId: 'sess-abc' }),
    JSON.stringify({ type: 'model_change', model: 'claude-sonnet-5' }),
    JSON.stringify({ type: 'thinking_level_change', level: 'high' }),
  ];
  if (withYield) {
    lines.push(JSON.stringify({ type: 'yield', data: { answer: 'yes' } }));
  }
  return lines.join('\n');
}

// ── OMP_OBSERVATION_CONTRACT_VERSION ─────────────────────────────────

describe('OMP_OBSERVATION_CONTRACT_VERSION', () => {
  it('is the expected string', () => {
    assert.strictEqual(OMP_OBSERVATION_CONTRACT_VERSION, 'omp-observation-v1');
  });
});

// ── parseOmpSpawnReceipt ─────────────────────────────────────────────

describe('parseOmpSpawnReceipt', () => {
  it('returns a frozen object with jobId and agent for well-formed receipt', () => {
    const result = parseOmpSpawnReceipt(VALID_RECEIPT);
    assert.deepStrictEqual(result, { jobId: 'task-001', agent: 'mure-scout' });
    assert.throws(() => { result.jobId = 'hack'; }, TypeError);
  });

  it('rejects non-object (null)', () => {
    assert.throws(
      () => parseOmpSpawnReceipt(null),
      { name: 'TypeError', message: /must be an object/ },
    );
  });

  it('rejects non-object (string)', () => {
    assert.throws(
      () => parseOmpSpawnReceipt('bad'),
      { name: 'TypeError', message: /must be an object/ },
    );
  });

  it('rejects array', () => {
    assert.throws(
      () => parseOmpSpawnReceipt([]),
      { name: 'TypeError', message: /must be an object/ },
    );
  });

  it('rejects missing jobId', () => {
    assert.throws(
      () => parseOmpSpawnReceipt({ agent: 'mure-scout' }),
      { name: 'TypeError', message: /receipt\.jobId is required/ },
    );
  });

  it('rejects missing agent', () => {
    assert.throws(
      () => parseOmpSpawnReceipt({ jobId: 'task-001' }),
      { name: 'TypeError', message: /receipt\.agent is required/ },
    );
  });

  it('rejects malformed jobId (starts with dot)', () => {
    assert.throws(
      () => parseOmpSpawnReceipt({ jobId: '.bad', agent: 'mure-scout' }),
      { name: 'TypeError', message: /jobId is malformed/ },
    );
  });

  it('rejects malformed jobId (empty)', () => {
    assert.throws(
      () => parseOmpSpawnReceipt({ jobId: '', agent: 'mure-scout' }),
      { name: 'TypeError', message: /is required/ },
    );
  });

  it('rejects unknown agent', () => {
    assert.throws(
      () => parseOmpSpawnReceipt({ jobId: 'task-001', agent: 'unknown-agent' }),
      { name: 'TypeError', message: /not a known card id/ },
    );
  });

  it('accepts every canary-bootstrap agent id (evidence-only cards)', () => {
    const bootstrapAgentIds = [
      'deepseek-flash-bootstrap',
      'mure-engineer-kimi-bootstrap',
      'mure-deliberator-nemotron-bootstrap',
      'mure-adjudicator-luna-bootstrap',
      'mure-helmsman-glm51-bootstrap',
      'composer-25-bootstrap',
      'mure-ideator-grok45-bootstrap',
    ];
    for (const agent of bootstrapAgentIds) {
      const result = parseOmpSpawnReceipt({ jobId: 'task-001', agent });
      assert.deepStrictEqual(result, { jobId: 'task-001', agent });
    }
  });

  it('accepts mure-calibrator-sonnet5 (current Sonnet verifier card)', () => {
    const result = parseOmpSpawnReceipt({ jobId: 'task-001', agent: 'mure-calibrator-sonnet5' });
    assert.deepStrictEqual(result, { jobId: 'task-001', agent: 'mure-calibrator-sonnet5' });
  });

  it('rejects the retired bare mure-calibrator agent id', () => {
    assert.throws(
      () => parseOmpSpawnReceipt({ jobId: 'task-001', agent: 'mure-calibrator' }),
      { name: 'TypeError', message: /not a known card id/ },
    );
  });
});

// ── parseOmpTaskResult ───────────────────────────────────────────────

describe('parseOmpTaskResult', () => {
  it('returns a frozen object with all fields for well-formed result', () => {
    const result = parseOmpTaskResult(VALID_RESULT);
    assert.deepStrictEqual(result, {
      id: 'MurScout1234Xyz',
      agent: 'mure-scout',
      status: 'completed',
      duration: 42,
      output: 'all good',
    });
    assert.throws(() => { result.status = 'hacked'; }, TypeError);
  });

  it('rejects non-object (null)', () => {
    assert.throws(
      () => parseOmpTaskResult(null),
      { name: 'TypeError', message: /must be an object/ },
    );
  });

  it('rejects missing id', () => {
    const { id, ...rest } = VALID_RESULT;
    assert.throws(
      () => parseOmpTaskResult(rest),
      { name: 'TypeError', message: /result\.id is required/ },
    );
  });

  it('rejects missing agent', () => {
    const { agent, ...rest } = VALID_RESULT;
    assert.throws(
      () => parseOmpTaskResult(rest),
      { name: 'TypeError', message: /result\.agent is required/ },
    );
  });

  it('rejects missing status', () => {
    const { status, ...rest } = VALID_RESULT;
    assert.throws(
      () => parseOmpTaskResult(rest),
      { name: 'TypeError', message: /result\.status is required/ },
    );
  });

  it('rejects missing duration key', () => {
    const { duration, ...rest } = VALID_RESULT;
    assert.throws(
      () => parseOmpTaskResult(rest),
      { name: 'TypeError', message: /result\.duration is required/ },
    );
  });

  it('rejects missing output key', () => {
    const { output, ...rest } = VALID_RESULT;
    assert.throws(
      () => parseOmpTaskResult(rest),
      { name: 'TypeError', message: /result\.output key is required/ },
    );
  });

  it('rejects undefined output', () => {
    assert.throws(
      () => parseOmpTaskResult({ ...VALID_RESULT, output: undefined }),
      { name: 'TypeError', message: /output must not be undefined/ },
    );
  });

  it('accepts any status string (terminal check deferred to parent adapter)', () => {
    // 'running' and 'failed (exit 1)' are valid OMP status strings.
    // Only exact 'completed' yields ok:true in the parent adapter.
    assert.doesNotThrow(() => parseOmpTaskResult({ ...VALID_RESULT, status: 'running' }));
    assert.doesNotThrow(() => parseOmpTaskResult({ ...VALID_RESULT, status: 'failed (exit 1)' }));
  });

  it('rejects non-CamelCase id (lowercase start)', () => {
    assert.throws(
      () => parseOmpTaskResult({ ...VALID_RESULT, id: 'badId' }),
      { name: 'TypeError', message: /not valid CamelCase/ },
    );
  });

  it('rejects unknown agent', () => {
    assert.throws(
      () => parseOmpTaskResult({ ...VALID_RESULT, agent: 'unknown-agent' }),
      { name: 'TypeError', message: /not a known card id/ },
    );
  });

  it('accepts null output', () => {
    const result = parseOmpTaskResult({ ...VALID_RESULT, output: null });
    assert.strictEqual(result.output, null);
  });

  it('coerces non-null non-string output to string', () => {
    const result = parseOmpTaskResult({ ...VALID_RESULT, output: 123 });
    assert.strictEqual(result.output, '123');
  });

  it('accepts null duration', () => {
    const result = parseOmpTaskResult({ ...VALID_RESULT, duration: null });
    assert.strictEqual(result.duration, null);
  });
});

// ── deterministicOmpTaskId ───────────────────────────────────────────

describe('deterministicOmpTaskId', () => {
  const entry = {
    id: 'my-entry',
    taskId: 'task-alpha',
    purpose: 'test-purpose',
    agentId: 'mure-scout',
    model: 'claude-sonnet-5',
  };

  it('returns the same id for the same entry', () => {
    const a = deterministicOmpTaskId(entry);
    const b = deterministicOmpTaskId(entry);
    assert.strictEqual(a, b);
  });

  it('returns ≤32 chars', () => {
    const id = deterministicOmpTaskId(entry);
    assert.ok(id.length <= 32);
  });

  it('matches full shape contract: /^[A-Z][A-Za-z0-9]{0,23}[0-9a-f]{8}$/', () => {
    const id = deterministicOmpTaskId(entry);
    assert.ok(
      /^[A-Z][A-Za-z0-9]{0,23}[0-9a-f]{8}$/.test(id),
      `expected /^[A-Z][A-Za-z0-9]{0,23}[0-9a-f]{8}$/, got "${id}"`,
    );
  });
});

// ── validateOmpJobId ─────────────────────────────────────────────────

describe('validateOmpJobId', () => {
  it('accepts valid job id', () => {
    assert.strictEqual(validateOmpJobId('task-001'), true);
  });

  it('accepts job id with dots and underscores', () => {
    assert.strictEqual(validateOmpJobId('a.b_c-123'), true);
  });

  it('rejects empty string', () => {
    assert.strictEqual(validateOmpJobId(''), false);
  });

  it('rejects string with leading whitespace', () => {
    assert.strictEqual(validateOmpJobId('  bad'), false);
  });

  it('rejects string with trailing whitespace', () => {
    assert.strictEqual(validateOmpJobId('bad  '), false);
  });

  it('rejects string with leading dot', () => {
    assert.strictEqual(validateOmpJobId('.bad'), false);
  });

  it('rejects non-string', () => {
    assert.strictEqual(validateOmpJobId(42), false);
  });

  it('rejects null', () => {
    assert.strictEqual(validateOmpJobId(null), false);
  });
});

// ── isTerminalStatus ─────────────────────────────────────────────────

describe('isTerminalStatus', () => {
  it('completed → true', () => {
    assert.strictEqual(isTerminalStatus('completed'), true);
  });

  it('failed → true', () => {
    assert.strictEqual(isTerminalStatus('failed'), true);
  });

  it('cancelled → true', () => {
    assert.strictEqual(isTerminalStatus('cancelled'), true);
  });

  it('timeout → true', () => {
    assert.strictEqual(isTerminalStatus('timeout'), true);
  });

  it('running → false', () => {
    assert.strictEqual(isTerminalStatus('running'), false);
  });

  it('unknown → false', () => {
    assert.strictEqual(isTerminalStatus('unknown'), false);
  });
});

// ── parseOmpTranscript — happy path ──────────────────────────────────

describe('parseOmpTranscript', () => {
  it('parses all 4 event types and returns frozen evidence', () => {
    const raw = validTranscript();
    const evidence = parseOmpTranscript(raw, 'job-42');
    assert.deepStrictEqual(evidence.session, { sessionId: 'sess-abc' });
    assert.deepStrictEqual(evidence.modelChange, { model: 'claude-sonnet-5' });
    assert.deepStrictEqual(evidence.thinkingLevelChanges, [{ level: 'high' }]);
    assert.deepStrictEqual(evidence.terminalYield, { yieldType: 'result', data: { answer: 'yes' } });
    assert.strictEqual(evidence._jobId, 'job-42');
    assert.throws(() => { evidence.session = {}; }, TypeError);
  });

  it('accepts absent yield (Gemini variant)', () => {
    const raw = validTranscript({ withYield: false });
    const evidence = parseOmpTranscript(raw);
    assert.strictEqual(evidence.terminalYield, null);
  });

  it('accepts multiple thinking_level_change events', () => {
    const raw = JSON.stringify({ type: 'session', sessionId: 'sess-abc' }) + '\n'
      + JSON.stringify({ type: 'model_change', model: 'claude-sonnet-5' }) + '\n'
      + JSON.stringify({ type: 'thinking_level_change', level: 'low' }) + '\n'
      + JSON.stringify({ type: 'thinking_level_change', level: 'high' }) + '\n';
    const evidence = parseOmpTranscript(raw);
    assert.deepStrictEqual(evidence.thinkingLevelChanges, [{ level: 'low' }, { level: 'high' }]);
  });

  it('accepts live OMP session and thinking field names', () => {
    const raw = JSON.stringify({ type: 'session', id: 'sess-live' }) + '\n'
      + JSON.stringify({ type: 'model_change', model: 'zai/glm-5.2' }) + '\n'
      + JSON.stringify({ type: 'thinking_level_change', thinkingLevel: 'high' }) + '\n';
    const evidence = parseOmpTranscript(raw);
    assert.deepStrictEqual(evidence.session, { sessionId: 'sess-live' });
    assert.deepStrictEqual(evidence.thinkingLevelChanges, [{ level: 'high' }]);
  });
});

// ── parseOmpTranscript — rejections ──────────────────────────────────

describe('parseOmpTranscript rejections', () => {
  const base = () => validTranscript();

  it('rejects missing session event', () => {
    const raw = JSON.stringify({ type: 'model_change', model: 'claude-sonnet-5' }) + '\n'
      + JSON.stringify({ type: 'thinking_level_change', level: 'high' }) + '\n'
      + JSON.stringify({ type: 'yield', data: { answer: 'yes' } });
    assert.throws(
      () => parseOmpTranscript(raw),
      { name: 'TypeError', message: /missing a session event/ },
    );
  });

  it('rejects missing model_change event', () => {
    // remove model_change, keep session + thinking_level_change + yield
    const raw = JSON.stringify({ type: 'session', sessionId: 'sess-abc' }) + '\n'
      + JSON.stringify({ type: 'thinking_level_change', level: 'high' }) + '\n'
      + JSON.stringify({ type: 'yield', data: { answer: 'yes' } });
    assert.throws(
      () => parseOmpTranscript(raw),
      { name: 'TypeError', message: /missing a model_change event/ },
    );
  });

  it('rejects missing thinking_level_change events', () => {
    const raw = JSON.stringify({ type: 'session', sessionId: 'sess-abc' }) + '\n'
      + JSON.stringify({ type: 'model_change', model: 'claude-sonnet-5' }) + '\n'
      + JSON.stringify({ type: 'yield', data: { answer: 'yes' } });
    assert.throws(
      () => parseOmpTranscript(raw),
      { name: 'TypeError', message: /missing thinking_level_change/ },
    );
  });

  it('rejects duplicate session event', () => {
    const fixture = base();
    const raw = fixture.replace(
      '"model_change"',
      '"session"',
    );
    assert.throws(
      () => parseOmpTranscript(raw),
      { name: 'TypeError', message: /duplicate session event/ },
    );
  });

  it('rejects duplicate model_change event', () => {
    const fixture = base();
    const raw = fixture.replace(
      '"thinking_level_change"',
      '"model_change"',
    );
    assert.throws(
      () => parseOmpTranscript(raw),
      { name: 'TypeError', message: /duplicate model_change event/ },
    );
  });

  it('rejects duplicate yield event', () => {
    const fixture = validTranscript();
    assert.throws(
      () => parseOmpTranscript(fixture + '\n' + JSON.stringify({ type: 'yield', data: 'oops' })),
      { name: 'TypeError', message: /duplicate yield event/ },
    );
  });

  it('rejects non-JSON line', () => {
    const raw = validTranscript() + '\nnot-json';
    assert.throws(
      () => parseOmpTranscript(raw),
      { name: 'TypeError', message: /not valid JSON/ },
    );
  });

  it('rejects unknown event type', () => {
    const raw = JSON.stringify({ type: 'session', sessionId: 'sess-abc' }) + '\n'
      + JSON.stringify({ type: 'model_change', model: 'claude-sonnet-5' }) + '\n'
      + JSON.stringify({ type: 'thinking_level_change', level: 'high' }) + '\n'
      + JSON.stringify({ type: 'foobar', data: 'x' });
    assert.throws(
      () => parseOmpTranscript(raw),
      { name: 'TypeError', message: /unknown event type/ },
    );
  });

  it('rejects non-object line (array)', () => {
    const raw = JSON.stringify({ type: 'session', sessionId: 'sess-abc' }) + '\n'
      + JSON.stringify({ type: 'model_change', model: 'claude-sonnet-5' }) + '\n'
      + JSON.stringify({ type: 'thinking_level_change', level: 'high' }) + '\n'
      + JSON.stringify([1, 2, 3]);
    assert.throws(
      () => parseOmpTranscript(raw),
      { name: 'TypeError', message: /not a JSON object/ },
    );
  });

  it('rejects non-string raw', () => {
    assert.throws(
      () => parseOmpTranscript(42),
      { name: 'TypeError', message: /must be a string/ },
    );
  });

  it('rejects empty string (no non-blank lines)', () => {
    assert.throws(
      () => parseOmpTranscript('  \n  \n'),
      { name: 'TypeError', message: /empty/ },
    );
  });
});

// ── parseOmpTranscript — yield payload normalization ─────────────────

describe('parseOmpTranscript yield normalization', () => {
  const prefix = () =>
    JSON.stringify({ type: 'session', sessionId: 'sess-abc' }) + '\n'
    + JSON.stringify({ type: 'model_change', model: 'claude-sonnet-5' }) + '\n'
    + JSON.stringify({ type: 'thinking_level_change', level: 'high' }) + '\n';

  it('flat yield.data object', () => {
    const raw = prefix() + JSON.stringify({ type: 'yield', data: { answer: 'hello' } });
    const evidence = parseOmpTranscript(raw);
    assert.deepStrictEqual(evidence.terminalYield, {
      yieldType: 'result',
      data: { answer: 'hello' },
    });
  });

  it('flat yield.data JSON string', () => {
    const raw = prefix() + JSON.stringify({ type: 'yield', data: JSON.stringify({ answer: 'parsed' }) });
    const evidence = parseOmpTranscript(raw);
    assert.deepStrictEqual(evidence.terminalYield, {
      yieldType: 'result',
      data: { answer: 'parsed' },
    });
  });

  it('MiniMax M3 yield.result.data JSON string', () => {
    const raw = prefix()
      + JSON.stringify({
        type: 'yield',
        result: { data: JSON.stringify({ answer: 'minimax-result' }) },
      });
    const evidence = parseOmpTranscript(raw);
    assert.deepStrictEqual(evidence.terminalYield, {
      yieldType: 'result',
      data: { answer: 'minimax-result' },
    });
  });

  it('MiMo yield.result JSON string of entire result', () => {
    const raw = prefix()
      + JSON.stringify({
        type: 'yield',
        result: JSON.stringify({ final: 'output', ok: true }),
      });
    const evidence = parseOmpTranscript(raw);
    // MiMo: entire parsed result object becomes terminalYield.data
    assert.deepStrictEqual(evidence.terminalYield, {
      yieldType: 'result',
      data: { final: 'output', ok: true },
    });
  });

  it('preserves yieldType from input', () => {
    const raw = prefix()
      + JSON.stringify({ type: 'yield', yieldType: 'error', data: { err: 'boom' } });
    const evidence = parseOmpTranscript(raw);
    assert.strictEqual(evidence.terminalYield.yieldType, 'error');
  });

  it('defaults yieldType to result when absent', () => {
    const raw = prefix() + JSON.stringify({ type: 'yield', data: { ok: true } });
    const evidence = parseOmpTranscript(raw);
    assert.strictEqual(evidence.terminalYield.yieldType, 'result');
  });
});

// ── loadOmpTranscript path containment ────────────────────────────────
describe('loadOmpTranscript path containment', () => {
  const baseDir = () => fs.mkdtempSync(path.join(os.tmpdir(), '.omp-contain-'));
  const transcriptLines = [
    JSON.stringify({ type: 'session', sessionId: 'sess-x' }),
    JSON.stringify({ type: 'model_change', model: 'openai/gpt-5.6-terra' }),
    JSON.stringify({ type: 'thinking_level_change', level: 'medium' }),
    JSON.stringify({ type: 'yield', yieldType: 'result', data: { ok: true } }),
  ].join('\n');

  it('reads a transcript inside the base directory', () => {
    const dir = baseDir();
    try {
      fs.writeFileSync(path.join(dir, 'j1.jsonl'), transcriptLines);
      const evidence = loadOmpTranscript('j1', dir);
      assert.strictEqual(evidence.session.sessionId, 'sess-x');
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* cleanup */ }
    }
  });

  it('rejects an in-directory symlink to an external file', () => {
    const dir = baseDir();
    const targetDir = path.join(dir, 'real');
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), '.omp-ext-'));
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      const externalFile = path.join(externalDir, 'esc.jsonl');
      fs.writeFileSync(externalFile, transcriptLines);
      fs.symlinkSync(externalFile, path.join(targetDir, 'j2.jsonl'));

      assert.throws(
        () => loadOmpTranscript('j2', targetDir),
        { name: 'TypeError', message: /symlink escaped confinement/ },
      );
    } finally {
      try { fs.rmSync(externalDir, { recursive: true, force: true }); } catch { /* cleanup */ }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* cleanup */ }
    }
  });

  it('rejects a base symlink that escapes containment', () => {
    const dir = baseDir();
    try {
      const realStorage = path.join(dir, 'real-storage');
      fs.mkdirSync(realStorage, { recursive: true });
      // Symlink dir/sym-base -> realStorage, then symlink file inside to outside
      const symBase = path.join(dir, 'sym-base');
      fs.symlinkSync(realStorage, symBase);
      const externalFile = path.join(dir, 'escaped-outside.jsonl');
      fs.writeFileSync(externalFile, transcriptLines);
      fs.symlinkSync(externalFile, path.join(symBase, 'j3.jsonl'));

      assert.throws(
        () => loadOmpTranscript('j3', symBase),
        { name: 'TypeError', message: /symlink escaped confinement/ },
      );
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* cleanup */ }
    }
  });

  it('rejects a sibling-prefix path (not contained)', () => {
    const dir = baseDir();
    try {
      const realStorage = path.join(dir, 'real');
      fs.mkdirSync(realStorage, { recursive: true });
      fs.writeFileSync(path.join(realStorage, 'j4.jsonl'), transcriptLines);
      assert.throws(
        () => loadOmpTranscript('j4', realStorage + '-evil'),
        { name: 'TypeError', message: /not accessible/ },
      );
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* cleanup */ }
    }
  });

  it('rejects missing transcript file (ENOENT)', () => {
    const dir = baseDir();
    try {
      const emptyDir = path.join(dir, 'empty');
      fs.mkdirSync(emptyDir, { recursive: true });
      assert.throws(
        () => loadOmpTranscript('j5', emptyDir),
        { name: 'TypeError', message: /not accessible/ },
      );
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* cleanup */ }
    }
  });

  it('rejects non-regular-file (directory)', () => {
    const dir = baseDir();
    try {
      const dirAsFile = path.join(dir, 'j6.jsonl');
      fs.mkdirSync(dirAsFile, { recursive: true });
      assert.throws(
        () => loadOmpTranscript('j6', dir),
        { name: 'TypeError', message: /not a regular file/ },
      );
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* cleanup */ }
    }
  });
});
