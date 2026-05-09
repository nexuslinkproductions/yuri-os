#!/usr/bin/env node

import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const SPARK_MODEL = 'gpt-5.3-codex-spark';
const SPARK_ALIASES = new Set(['codex-spark', 'spark', 'fast-codex', SPARK_MODEL]);
const SPARK_SMOKE_PROMPT = 'Reply exactly CODEX_SPARK_SMOKE_OK and do not inspect files.';
const SPARK_READY_MARKER = 'CODEX_SPARK_LANE_READY';
const SKIP_RE = /(?:rate limit|rate-limited|queued|unavailable|temporarily unavailable|capacity|retry later|busy)/i;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const argv = process.argv.slice(2);
const options = parseArgs(argv);
const envPrompt = (process.env.OFFLOAD_PROMPT_TEXT || '').trim();
const prompt = options.prompt || envPrompt || (options.smoke || options.proveRoute ? SPARK_SMOKE_PROMPT : '');

if (options.requestedModel && options.requestedModel !== SPARK_MODEL) {
  emitStatus({
    lane: 'codex-spark',
    status: 'BLOCKED_MODEL_OVERRIDE',
    reason: `Codex Spark is pinned to ${SPARK_MODEL}.`,
    requestedModel: options.requestedModel,
  });
  process.exit(1);
}

if (options.dryRun) {
  const artifactDir = prepareArtifactDir(options.artifactDir);
  const preview = buildPreview({
    lane: options.lane,
    model: SPARK_MODEL,
    prompt,
    artifactDir,
  });
  writeArtifact(artifactDir, 'dry-run.json', preview);
  emitStatus(preview);
  process.exit(0);
}

if (!prompt) {
  emitStatus({
    lane: 'codex-spark',
    status: 'BLOCKED_MISSING_PROMPT',
    reason: 'Missing prompt.',
  });
  process.exit(1);
}

const artifactDir = prepareArtifactDir(options.artifactDir);
const run = await runSpark({
  prompt,
  artifactDir,
  timeoutMs: options.timeoutMs,
});

if (run.status === 'SKIPPED_OR_RATE_LIMITED') {
  emitStatus(run.summary);
  process.exit(0);
}

if (run.status === 'FAILED') {
  emitStatus(run.summary);
  process.exit(1);
}

if (options.smoke) {
  const smokeOk = run.output.trim() === 'CODEX_SPARK_SMOKE_OK';
  const summary = {
    ...run.summary,
    status: smokeOk ? 'SMOKE_OK' : 'SMOKE_MISMATCH',
    expected: 'CODEX_SPARK_SMOKE_OK',
    observed: run.output.trim(),
  };
  writeArtifact(artifactDir, 'smoke.json', summary);
  emitStatus(summary);
  if (smokeOk) {
    process.stdout.write('CODEX_SPARK_SMOKE_OK\n');
    process.exit(0);
  }
  process.exit(1);
}

if (options.proveRoute) {
  const smokeRun = await runSpark({
    prompt: SPARK_SMOKE_PROMPT,
    artifactDir,
    timeoutMs: options.timeoutMs,
  });
  if (smokeRun.status === 'SKIPPED_OR_RATE_LIMITED') {
    emitStatus(smokeRun.summary);
    process.exit(0);
  }
  if (smokeRun.status === 'FAILED') {
    emitStatus(smokeRun.summary);
    process.exit(1);
  }
  const smokeOk = smokeRun.output.trim() === 'CODEX_SPARK_SMOKE_OK';
  const summary = {
    lane: 'codex-spark',
    model: SPARK_MODEL,
    status: smokeOk ? 'CODEX_SPARK_LANE_READY' : 'SMOKE_MISMATCH',
    routeMarker: smokeOk ? SPARK_READY_MARKER : '',
    artifactDir,
    dryRun: buildPreview({
      lane: options.lane,
      model: SPARK_MODEL,
      prompt,
      artifactDir,
    }),
    smoke: {
      status: smokeOk ? 'SMOKE_OK' : 'SMOKE_MISMATCH',
      expected: 'CODEX_SPARK_SMOKE_OK',
      observed: smokeRun.output.trim(),
    },
  };
  writeArtifact(artifactDir, 'prove-route.json', summary);
  emitStatus(summary);
  if (smokeOk) {
    process.stdout.write(`${SPARK_READY_MARKER}\n`);
    process.exit(0);
  }
  process.exit(1);
}

writeArtifact(artifactDir, 'run.json', run.summary);
process.stdout.write(run.output + (run.output.endsWith('\n') ? '' : '\n'));
process.exit(0);

function parseArgs(rest) {
  const out = {
    lane: 'codex-spark',
    requestedModel: '',
    dryRun: false,
    smoke: false,
    proveRoute: false,
    promptParts: [],
    artifactDir: '',
    timeoutMs: parseInt(process.env.CODEX_SPARK_TIMEOUT_MS || '180000', 10),
  };

  const args = [...rest];
  if (args[0] && !args[0].startsWith('--') && SPARK_ALIASES.has(args[0].toLowerCase())) {
    out.lane = normalizeLane(args.shift());
  }

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--dry-run' || token === '--route-only') {
      out.dryRun = true;
      continue;
    }
    if (token === '--smoke') {
      out.smoke = true;
      continue;
    }
    if (token === '--prove-route') {
      out.proveRoute = true;
      continue;
    }
    if (token === '--model' && args[i + 1]) {
      out.requestedModel = args[++i];
      continue;
    }
    if (token === '--artifact-dir' && args[i + 1]) {
      out.artifactDir = args[++i];
      continue;
    }
    if (token === '--timeout-ms' && args[i + 1]) {
      out.timeoutMs = parseInt(args[++i], 10);
      continue;
    }
    out.promptParts.push(token);
  }

  out.prompt = out.promptParts.join(' ').trim();
  out.lane = normalizeLane(out.lane);
  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs <= 0) {
    out.timeoutMs = 180000;
  }
  return out;
}

function normalizeLane(lane) {
  const normalized = String(lane || '').toLowerCase();
  if (SPARK_ALIASES.has(normalized)) return 'codex-spark';
  return normalized || 'codex-spark';
}

function prepareArtifactDir(overrideDir) {
  const base = overrideDir || mkdtempSync(path.join(os.tmpdir(), 'nudimmud-codex-spark-'));
  return path.resolve(base);
}

function buildPreview({ lane, model, prompt, artifactDir }) {
  return {
    lane,
    model,
    status: 'DRY_RUN',
    routeMarker: '',
    artifactDir,
    command: [
      'codex',
      'exec',
      '--model',
      model,
      '--sandbox',
      'read-only',
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      '--skip-git-repo-check',
      '--cd',
      repoRoot,
      '--output-last-message',
      path.join(artifactDir, 'last-message.txt'),
      prompt || SPARK_SMOKE_PROMPT,
    ],
    prompt,
  };
}

async function runSpark({ prompt, artifactDir, timeoutMs }) {
  const lastMessagePath = path.join(artifactDir, 'last-message.txt');
  const stdoutPath = path.join(artifactDir, 'stdout.log');
  const stderrPath = path.join(artifactDir, 'stderr.log');
  const invocation = {
    lane: 'codex-spark',
    model: SPARK_MODEL,
    prompt,
    cwd: repoRoot,
    artifactDir,
    command: [
      'codex',
      'exec',
      '--model',
      SPARK_MODEL,
      '--sandbox',
      'read-only',
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      '--skip-git-repo-check',
      '--cd',
      repoRoot,
      '--output-last-message',
      lastMessagePath,
      prompt,
    ],
  };

  writeArtifact(artifactDir, 'invocation.json', invocation);

  const child = spawn('codex', invocation.command.slice(1), {
    cwd: repoRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let timedOut = false;

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 5000).unref?.();
  }, timeoutMs);

  const outcome = await new Promise((resolve) => {
    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        exitCode: null,
        signal: null,
        error,
        stdout,
        stderr,
      });
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout);
      resolve({
        exitCode,
        signal,
        error: null,
        stdout,
        stderr,
      });
    });
  });

  writeArtifact(artifactDir, 'stdout.log', outcome.stdout);
  writeArtifact(artifactDir, 'stderr.log', outcome.stderr);

  if (outcome.error?.code === 'ENOENT') {
    return {
      status: 'SKIPPED_OR_RATE_LIMITED',
      output: '',
      summary: {
        lane: 'codex-spark',
        model: SPARK_MODEL,
        status: 'SKIPPED_OR_RATE_LIMITED',
        reason: 'Codex binary unavailable.',
        artifactDir,
      },
    };
  }

  const lastMessage = readMaybe(lastMessagePath);
  const output = lastMessage || outcome.stdout || '';
  const combined = [output, outcome.stderr, outcome.stdout, outcome.error?.message || ''].filter(Boolean).join('\n');

  if (timedOut || SKIP_RE.test(combined)) {
    return {
      status: 'SKIPPED_OR_RATE_LIMITED',
      output,
      summary: {
        lane: 'codex-spark',
        model: SPARK_MODEL,
        status: 'SKIPPED_OR_RATE_LIMITED',
        reason: timedOut ? 'Timed out waiting for Codex Spark.' : classifySkipReason(combined),
        exitCode: outcome.exitCode,
        signal: outcome.signal,
        timedOut,
        artifactDir,
      },
    };
  }

  if (outcome.exitCode !== 0) {
    return {
      status: 'FAILED',
      output,
      summary: {
        lane: 'codex-spark',
        model: SPARK_MODEL,
        status: 'FAILED',
        reason: outcome.error?.message || `Codex exited with code ${outcome.exitCode}.`,
        exitCode: outcome.exitCode,
        signal: outcome.signal,
        artifactDir,
      },
    };
  }

  return {
    status: 'OK',
    output,
    summary: {
      lane: 'codex-spark',
      model: SPARK_MODEL,
      status: 'OK',
      exitCode: outcome.exitCode,
      signal: outcome.signal,
      artifactDir,
    },
  };
}

function readMaybe(filePath) {
  try {
    return readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

function classifySkipReason(text) {
  if (/queued/i.test(text)) return 'Codex queued.';
  if (/rate limit|rate-limited/i.test(text)) return 'Codex rate-limited.';
  if (/unavailable/i.test(text)) return 'Codex unavailable.';
  return 'Codex Spark unavailable or rate-limited.';
}

function writeArtifact(dir, name, data) {
  writeFileSync(path.join(dir, name), typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`);
}

function emitStatus(data) {
  process.stderr.write(`${JSON.stringify(data, null, 2)}\n`);
}
