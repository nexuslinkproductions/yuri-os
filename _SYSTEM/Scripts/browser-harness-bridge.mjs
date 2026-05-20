import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const HARNESS_CMD = process.env.BROWSER_HARNESS_BIN || 'browser-harness';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 8 * 1024 * 1024;

export async function harnessViewport(task, options = {}) {
  const input = String(task ?? '').trim();
  if (!input) throw new Error('browser-harness task is empty');

  const timeout = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const result = spawnSync(HARNESS_CMD, [], {
    input: `${input}\n`,
    encoding: 'utf8',
    timeout,
    shell: false,
    maxBuffer: MAX_BUFFER,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });

  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  const payload = {
    task: input,
    stdout,
    stderr,
    status: result.status,
    signal: result.signal,
    error: result.error ? result.error.message : null,
    ts: Date.now(),
  };

  try {
    writeFileSync('/tmp/harness-last-result.json', JSON.stringify(payload, null, 2));
  } catch {}

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = stderr || stdout || `exit ${result.status}`;
    throw new Error(`browser-harness failed: ${detail.trim()}`);
  }

  return stdout;
}

export default { harnessViewport };
