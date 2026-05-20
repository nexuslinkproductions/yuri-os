import assert from 'node:assert/strict';
import { test } from 'node:test';

import { printBanner } from './rick-banner.mjs';

function captureStdout() {
  const originalWrite = process.stdout.write.bind(process.stdout);
  let output = '';

  process.stdout.write = (chunk, encoding, callback) => {
    output += Buffer.isBuffer(chunk) ? chunk.toString(encoding) : String(chunk);
    if (typeof callback === 'function') callback();
    return true;
  };

  return {
    restore() {
      process.stdout.write = originalWrite;
      return output;
    },
  };
}

test('printBanner renders live health data when available', async () => {
  const originalFetch = globalThis.fetch;
  const stdout = captureStdout();

  globalThis.fetch = async (url) => {
    assert.equal(url, 'http://localhost:4242/health.json');
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          launchagents: [
            { name: 'agent-alpha', status: 'running', pid: 1201 },
            { name: 'agent-beta', status: 'crashed', last_exit_code: 1 },
            { name: 'agent-gamma', status: 'gate_failed', last_exit_code: 0 },
            { name: 'kagami-overseer', status: 'running', pid: 4242 },
          ],
          lanes: {
            '@deepseek': { status: 'running' },
            '@codex': { status: 'crashed' },
            '@claude': { status: 'idle' },
            '@nvidia': { status: 'running' },
            '@shintai': { status: 'idle' },
          },
        };
      },
    };
  };

  try {
    await printBanner('rick-123');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const output = stdout.restore();
  assert.match(output, /██/);
  assert.match(output, /Welcome to Kagami\. Type your message or \/help for commands\./);
  assert.match(output, /神鏡 · YURI OS/);
  assert.match(output, /Session: rick-123/);
  assert.match(output, /Active Agents/);
  assert.match(output, /agent-alpha/);
  assert.match(output, /✓.*running/);
  assert.match(output, /⚠.*gate_failed/);
  assert.match(output, /✗.*crashed/);
  assert.match(output, /Active Lanes/);
  assert.match(output, /@deepseek/);
  assert.match(output, /Kagami Overseer/);
});

test('printBanner skips live health data when fetch fails', async () => {
  const originalFetch = globalThis.fetch;
  const stdout = captureStdout();

  globalThis.fetch = async () => {
    throw new Error('network down');
  };

  try {
    await printBanner('rick-404');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const output = stdout.restore();
  assert.match(output, /Welcome to Kagami\. Type your message or \/help for commands\./);
  assert.match(output, /Session: rick-404/);
  assert.doesNotMatch(output, /Active Agents/);
  assert.doesNotMatch(output, /Active Lanes/);
  assert.doesNotMatch(output, /Kagami Overseer/);
});
