#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bootstrapApiKey,
  curlHeaderArgs,
  resolveApiKey,
  resolveEnvApiKey,
} from './auth.mjs';

assert.equal(resolveEnvApiKey({ API_KEY: '  test-api-key-123456  ' }), 'test-api-key-123456');
assert.equal(resolveEnvApiKey({ YURI_BACKEND_API_KEY: 'backend-key' }), 'backend-key');
assert.deepEqual(curlHeaderArgs('test-api-key-123456'), ['-H', 'X-API-KEY: test-api-key-123456']);
assert.deepEqual(curlHeaderArgs(''), []);

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url) => {
    assert.equal(url, 'http://127.0.0.1:3004/api/auth/bootstrap');
    return {
      ok: true,
      async json() {
        return { apiKey: 'bootstrapped-key-123456' };
      },
    };
  };

  const backendUrl = 'http://127.0.0.1:3004';
  assert.equal(await bootstrapApiKey(backendUrl), 'bootstrapped-key-123456');
  assert.equal(await resolveApiKey({ backendUrl, env: {} }), 'bootstrapped-key-123456');

  const cliHeaders = execFileSync(
    process.execPath,
    ['Scripts/auth.mjs', 'curl-headers', 'http://127.0.0.1:1'],
    {
      encoding: 'utf8',
      env: { ...process.env, API_KEY: 'cli-key-1234567890' },
    },
  ).trim().split('\n');
  assert.deepEqual(cliHeaders, ['-H', 'X-API-KEY: cli-key-1234567890']);
} finally {
  globalThis.fetch = originalFetch;
}

const stubRoot = mkdtempSync(join(tmpdir(), 'nudimmud-auth-hook-'));
try {
  const captureFile = join(stubRoot, 'curl-args.txt');
  const curlStub = join(stubRoot, 'curl');
  writeFileSync(curlStub, `#!/usr/bin/env bash
set -euo pipefail
: "\${CAPTURE_FILE:?missing capture file}"
printf '%s\\n' "$@" > "$CAPTURE_FILE"
printf '{"preferredModel":"deepseek-v4-flash","preferredRuntime":"cloud","intent":"auth-test"}\\n'
`);
  chmodSync(curlStub, 0o755);

  execFileSync(
    'bash',
    ['Scripts/offload.sh', '--dry-run', 'auth hook route probe'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        API_KEY: 'pipeline-key-123456',
        CAPTURE_FILE: captureFile,
        PATH: `${stubRoot}:${process.env.PATH}`,
        PULSE_LANE_BYPASS: '1',
      },
    },
  );

  const curlArgs = readFileSync(captureFile, 'utf8');
  assert.match(curlArgs, /X-API-KEY: pipeline-key-123456/);
  assert.match(curlArgs, /\/api\/swarm\/route/);
} finally {
  rmSync(stubRoot, { recursive: true, force: true });
}

process.stdout.write('auth hook: pass\n');
