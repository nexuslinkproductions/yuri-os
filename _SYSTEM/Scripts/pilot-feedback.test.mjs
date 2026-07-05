// Hermetic tests for pilot-feedback.mjs — classifier, add, ingest-git (with injected gitLog), report.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyCommit, addFeedback, ingestGitFeedback, reportFeedback } from './pilot-feedback.mjs';

function tmpLedger() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-fb-'));
  return path.join(dir, 'feedback.jsonl');
}

test('classifyCommit: replacement/fix/rejection → bad; addition/build → good; neutral otherwise', () => {
  assert.deepEqual(classifyCommit('jeffrey: human voice — Kokoro British replaces robotic SAPI').polarity, 'bad');
  assert.equal(classifyCommit('jeffrey: human voice — Kokoro British replaces robotic SAPI').tag, 'voice');
  assert.equal(classifyCommit('jeffrey: add LightBurn Pro to René daily-tool list').polarity, 'good');
  assert.equal(classifyCommit('jeffrey: add LightBurn Pro to René daily-tool list').tag, 'tool');
  assert.equal(classifyCommit('fix crash on empty input').polarity, 'bad');
  assert.equal(classifyCommit('docs: tweak README wording').polarity, 'neutral');
  assert.equal(classifyCommit('jeffrey: gated read/edit/save scoped to CGS folders').tag, 'safety');
  assert.equal(classifyCommit('local-file second brain — FTS5 index + search_files').tag, 'memory');
});

test('addFeedback + reportFeedback: writes and aggregates by polarity + tag', () => {
  const ledger = tmpLedger();
  addFeedback({ pilot: 'rene', polarity: 'bad', tag: 'voice', note: 'robotic TTS', ledger });
  addFeedback({ pilot: 'rene', polarity: 'good', tag: 'tool', note: 'LightBurn added', ledger });
  addFeedback({ pilot: 'rene', polarity: 'good', tag: 'memory', note: 'second-brain', ledger });
  const r = reportFeedback({ pilot: 'rene', ledger });
  assert.equal(r.total, 3);
  assert.equal(r.byPolarity.bad, 1);
  assert.equal(r.byPolarity.good, 2);
  assert.equal(r.byTag.voice.bad, 1);
  assert.equal(r.byTag.tool.good, 1);
});

test('addFeedback rejects unknown polarity + missing pilot', () => {
  assert.throws(() => addFeedback({ pilot: 'rene', polarity: 'meh', ledger: tmpLedger() }), /good\|bad\|neutral/);
  assert.throws(() => addFeedback({ polarity: 'good', ledger: tmpLedger() }), /pilot required/);
});

test('ingestGitFeedback: classifies + skips neutral + only-signal commits recorded', () => {
  const ledger = tmpLedger();
  const fixture = [
    'h1|René|jeffrey: Kokoro British replaces robotic SAPI TTS',
    'h2|René|jeffrey: add LightBurn Pro to daily-tool list',
    'h3|René|docs: readme tweak',                  // neutral — skipped
    'h4|Marcel|feat: unrelated Marcel commit',     // wrong author — skipped (author filter)
    'h5|René|fix crash in read_file on PDF',
  ].join('\n');
  const ingested = ingestGitFeedback({
    pilot: 'rene', branch: 'origin/rene', since: '1d', author: 'René', ledger,
    gitLog: () => fixture,
  });
  assert.equal(ingested.length, 3); // h1 (bad/voice), h2 (good/tool), h5 (bad/file-io)
  const r = reportFeedback({ pilot: 'rene', ledger });
  assert.equal(r.total, 3);
  assert.equal(r.byPolarity.bad, 2);
  assert.equal(r.byPolarity.good, 1);
});

test('ingestGitFeedback requires pilot + branch', () => {
  assert.throws(() => ingestGitFeedback({ pilot: 'rene', ledger: tmpLedger(), gitLog: () => '' }), /branch required/);
});
