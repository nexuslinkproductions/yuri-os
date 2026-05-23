import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildCyberDemoTranscript,
  validateCyberDemoTranscript,
  writeCyberDemoTranscript,
} from './cyber-demo-runner.mjs';

test('cyber demo transcript runs local fixture proofs in meeting order', () => {
  const transcript = buildCyberDemoTranscript();

  assert.equal(transcript.schema, 'yuri.upgreat-demo-transcript.v0');
  assert.equal(transcript.validation.ok, true, transcript.validation.errors.join('\n'));
  assert.equal(transcript.steps.length, 7);
  assert.deepEqual(transcript.steps.map((step) => step.lab_id), [
    'prompt-injection-replay',
    'malicious-mcp-tool-schema',
    'browser-agent-fake-portal',
    'memory-poisoning-corpus',
    'rag-poisoning-corpus',
    'vulnerable-api-cases',
    'local-load-test-plan',
  ]);
  assert.ok(transcript.steps.every((step) => step.state === 'proven'));
  assert.ok(transcript.steps.every((step) => step.passed_cases === step.total_cases));
});

test('cyber demo transcript validation fails closed on missing or overclaimed proof', () => {
  const transcript = buildCyberDemoTranscript();
  const invalid = structuredClone(transcript);
  invalid.steps[0].state = 'failed';
  invalid.steps[1].boundary = 'Production proof passed.';
  invalid.steps[2].claim = 'YURI is a mature MDR replacement.';

  const validation = validateCyberDemoTranscript(invalid);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /not proven/);
  assert.match(validation.errors.join('\n'), /fixture-scoped/);
  assert.match(validation.errors.join('\n'), /forbidden platform maturity claim/);
});

test('cyber demo transcript writes markdown artifact', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-demo-runner-'));
  try {
    const reportPath = path.join(dir, 'demo.md');
    const result = writeCyberDemoTranscript({ reportPath });
    const markdown = readFileSync(reportPath, 'utf8');

    assert.equal(result.ok, true);
    assert.equal(existsSync(reportPath), true);
    assert.match(markdown, /YURI Upgreat Demo Transcript/);
    assert.match(markdown, /Prompt Injection Replay Lab/);
    assert.match(markdown, /Cases: 3\/3/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
