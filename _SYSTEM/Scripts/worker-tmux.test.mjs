import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesExpectedProcess } from './worker-tmux.mjs';

const registry = {
  tuiHealth: {
    codex: {
      expectedProcess: ['codex'],
      screenNeedles: ['Codex'],
    },
    claude: {
      expectedProcess: ['claude'],
      screenNeedles: ['Claude Code'],
    },
  },
};

test('TUI health rejects stale screen text from an idle shell', () => {
  const result = matchesExpectedProcess(registry, 'codex', {
    currentCommand: 'zsh',
    childProcesses: '',
    screenText: '[yuri-worker:codex] previous output',
  });

  assert.equal(result.ok, false);
  assert.equal(result.source, 'idle-shell');
});

test('TUI health accepts a live process command match', () => {
  const result = matchesExpectedProcess(registry, 'codex', {
    currentCommand: 'codex',
    childProcesses: '',
    screenText: '',
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, 'process');
});

test('TUI health accepts a non-shell Claude screen marker', () => {
  const result = matchesExpectedProcess(registry, 'claude', {
    currentCommand: '2.1.150',
    childProcesses: '',
    screenText: 'Claude Code v2.1.150',
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, 'screen');
});
