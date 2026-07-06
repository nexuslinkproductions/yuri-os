#!/usr/bin/env node
/**
 * Fleet plumbing smoke check — verify lane liveness with minimal output.
 * One short line per lane confirming it can be reached.
 * No file changes, no mutations, DISARMED by default.
 *
 * Usage: node _SYSTEM/Scripts/fleet-plumbing-smoke.mjs [--smoke]
 *
 * Output format (one line per lane):
 *   LANE_ALIVE::<lane>::<status>::<ms>
 *
 * Status codes:
 *   OK          - lane responded successfully
 *   TIMEOUT     - lane timed out (>15s)
 *   ERROR       - lane responded with error
 *   FAIL        - lane unreachable (4xx/5xx/transport)
 *   MISSING_KEY - API key missing for lane
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MODELS_PATH = path.join(REPO_ROOT, '.claude/config/models.json');
const LANE_DISPATCH = path.join(__dirname, 'lane-dispatch.mjs');

// Lane roster from llm_compat_lanes (single source of truth)
const LANE_ROSTER = [
  { lane: 'deepseek-v4-pro', label: 'DeepSeek Pro' },
  { lane: 'deepseek-v4-flash', label: 'DeepSeek Flash' },
  { lane: 'mimo-v2.5-pro[1m]', label: 'Mimo Pro 1M' },
  { lane: 'mimo-v2.5[1m]', label: 'Mimo Multimodal 1M' },
  { lane: 'mimo-v2-flash', label: 'Mimo Flash' },
  { lane: 'glm-4.7', label: 'GLM 4.7' },
  { lane: 'ollama-cloud', label: 'Ollama Cloud' },
];

const SMOKE_PROMPT = 'Reply with exactly one word: ALIVE';
const TIMEOUT_MS = 15000;

/** Check if API key exists for a lane */
function hasApiKey(lane) {
  try {
    const models = JSON.parse(fs.readFileSync(MODELS_PATH, 'utf8'));
    const cfg = models.llm_compat_lanes?.[lane];
    if (!cfg) return false;

    const keyEnv = cfg.api_key_env;
    if (!keyEnv) return true; // lane doesn't need key

    // Check if env var is set (non-empty)
    return process.env[keyEnv] && process.env[keyEnv].length > 0;
  } catch {
    return false;
  }
}

/** Probe a single lane via lane-dispatch.mjs */
async function probeLane(laneConfig) {
  const { lane, label } = laneConfig;

  // Quick key check first
  if (!hasApiKey(lane)) {
    return { lane, label, status: 'MISSING_KEY', ms: 0 };
  }

  const startTime = Date.now();
  const modelFlag = lane === 'ollama-cloud' ? ['--model', 'deepseek-v4-flash:cloud'] : [];

  return new Promise((resolve) => {
    const proc = spawn(
      'node',
      [
        LANE_DISPATCH,
        lane,
        SMOKE_PROMPT,
        '--max-iters', '1',
        ...modelFlag,
      ],
      {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: TIMEOUT_MS,
      }
    );

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({
        lane,
        label,
        status: 'TIMEOUT',
        ms: Date.now() - startTime,
      });
    }, TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      const ms = Date.now() - startTime;

      if (code === 0 && output.toLowerCase().includes('alive')) {
        resolve({ lane, label, status: 'OK', ms });
      } else if (code === 0) {
        resolve({ lane, label, status: 'ERROR', ms });
      } else if (code && code >= 400 && code < 500) {
        resolve({ lane, label, status: 'FAIL', ms });
      } else {
        resolve({ lane, label, status: 'FAIL', ms });
      }
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve({
        lane,
        label,
        status: 'FAIL',
        ms: Date.now() - startTime,
      });
    });
  });
}

/** Main smoke check */
async function main() {
  const isSmoke = process.argv.includes('--smoke');

  if (isSmoke) {
    process.stderr.write('Fleet plumbing smoke check (dry-run, no writes)...\n');
  }

  // Probe all lanes in parallel
  const results = await Promise.all(
    LANE_ROSTER.map((cfg) => probeLane(cfg))
  );

  // Emit one line per lane
  for (const { lane, label, status, ms } of results) {
    process.stdout.write(`LANE_ALIVE::${lane}::${status}::${ms}\n`);
  }

  // Summary stats
  const ok = results.filter((r) => r.status === 'OK').length;
  const total = results.length;

  if (isSmoke) {
    process.stderr.write(`\nFleet smoke: ${ok}/${total} lanes alive\n`);
    process.exit(ok === total ? 0 : 1);
  }

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`FATAL: ${err.message}\n`);
  process.exit(1);
});