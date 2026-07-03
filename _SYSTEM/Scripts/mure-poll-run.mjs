#!/usr/bin/env node
/**
 * MURE progress poll — status every N seconds while a swarm/company run is live.
 * Uses manifest + leaf result JSON (same paths as wait-for-job.mjs).
 *
 * Usage:
 *   node _SYSTEM/Scripts/mure-poll-run.mjs --run-id swarm-mr2rf0lu-ec9447
 *   node _SYSTEM/Scripts/mure-poll-run.mjs --run-id swarm-xxx --poll-ms 60000 --leaves cal-arch-map,cal-mechanic-ms
 *   node _SYSTEM/Scripts/mure-poll-run.mjs --run-id swarm-xxx --once   # single snapshot, exit
 *
 * Exit: 0 when run finished (finalizeOk true), 2 when finished failed, 1 timeout, 130 SIGINT
 */
import { existsSync, readdirSync, readFileSync, statSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadManifest, loadLeafResult, manifestPath } from './wait-for-job.mjs';
import { buildRunDir } from './glm-fleet.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const DEFAULT_POLL_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 7_200_000;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) out[arg.slice(2, eq)] = arg.slice(eq + 1);
    else {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { out[key] = next; i += 1; }
      else out[key] = 'true';
    }
  }
  return out;
}

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function readLeafSummary(runId, leafId) {
  const r = loadLeafResult(runId, leafId);
  if (!r) return { state: 'pending', label: '', status: '' };
  const label = r.resultLabel || r.label || '';
  const failed = /_F_PASS_COMMITTED\b/.test(label);
  const ok = label && !failed;
  return {
    state: ok ? 'done' : (label ? 'failed' : 'running'),
    label: label || '(no label yet)',
    status: r.status || '',
  };
}

function scanResultsDir(runDir) {
  if (!existsSync(runDir)) return [];
  try {
    return readdirSync(runDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

function formatSnapshot({ runId, manifest, leaves, runDir, poll, elapsedMs }) {
  const lines = [];
  const elapsedMin = (elapsedMs / 60000).toFixed(1);
  lines.push(`[${ts()}] MURE poll #${poll} · run=${runId} · elapsed=${elapsedMin}m`);

  if (manifest) {
    lines.push(`  manifest: converged=${manifest.converged ?? '—'} finalizeOk=${manifest.finalizeOk ?? '—'} finishedAt=${manifest.finishedAt ?? '—'}`);
    if (manifest.finalizeReason) lines.push(`  finalizeReason: ${manifest.finalizeReason}`);
    if (Array.isArray(manifest.roundLog) && manifest.roundLog.length) {
      const last = manifest.roundLog[manifest.roundLog.length - 1];
      lines.push(`  round: ${typeof last === 'object' ? JSON.stringify(last) : last}`);
    }
  } else {
    lines.push('  manifest: (not written yet — round in progress)');
  }

  const onDisk = new Set(scanResultsDir(runDir));
  const leafList = leaves.length ? leaves : [...onDisk];
  if (!leafList.length) {
    lines.push('  leaves: (none declared — waiting for results dir)');
  } else {
    for (const id of leafList) {
      const s = readLeafSummary(runId, id);
      const disk = onDisk.has(id) ? 'file' : '—';
      lines.push(`  · ${id}: ${s.state}${s.label !== '(no label yet)' ? ` · ${s.label}` : ''} [${disk}]`);
    }
    const done = leafList.filter((id) => readLeafSummary(runId, id).state === 'done').length;
    lines.push(`  progress: ${done}/${leafList.length} leaves PASS`);
  }

  return lines.join('\n');
}

export async function pollMureRun(opts) {
  const runId = opts.runId;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const once = opts.once === true;
  const leaves = opts.leaves ?? [];
  const onTick = opts.onTick ?? ((msg) => process.stdout.write(`${msg}\n`));

  const mPath = manifestPath(runId);
  const runDir = opts.runDir ?? buildRunDir(runId);
  const start = Date.now();
  const deadline = start + timeoutMs;
  let poll = 0;

  for (;;) {
    poll += 1;
    const manifest = loadManifest(mPath);
    const elapsedMs = Date.now() - start;
    onTick(formatSnapshot({ runId, manifest, leaves, runDir, poll, elapsedMs }));

    if (manifest?.finishedAt) {
      if (manifest.finalizeOk === true) return { exitCode: 0, reason: 'finished-ok', manifest, polls: poll, elapsedMs };
      return { exitCode: 2, reason: manifest.finalizeReason || 'finalize-failed', manifest, polls: poll, elapsedMs };
    }

    if (once) return { exitCode: 0, reason: 'snapshot', manifest, polls: poll, elapsedMs };

    if (Date.now() >= deadline) {
      return { exitCode: 1, reason: 'timeout', manifest, polls: poll, elapsedMs: Date.now() - start };
    }

    const remaining = deadline - Date.now();
    await sleep(Math.min(pollMs, remaining));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.error(`Usage: mure-poll-run.mjs --run-id <id> [--poll-ms 60000] [--timeout 7200000] [--leaves a,b,c] [--once] [--log path]`);
    process.exit(0);
  }

  const runId = args['run-id'];
  if (!runId) {
    console.error('mure-poll-run: --run-id required');
    process.exit(1);
  }

  const pollMs = args['poll-ms'] ? parseInt(args['poll-ms'], 10) : DEFAULT_POLL_MS;
  const timeoutMs = args.timeout ? parseInt(args.timeout, 10) : DEFAULT_TIMEOUT_MS;
  const leaves = args.leaves ? args.leaves.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const logPath = args.log || null;

  const onTick = (msg) => {
    process.stdout.write(`${msg}\n`);
    if (logPath) {
      try { appendFileSync(logPath, `${msg}\n`); } catch { /* best-effort */ }
    }
  };

  const result = await pollMureRun({
    runId,
    pollMs,
    timeoutMs,
    leaves,
    once: args.once === 'true',
    onTick,
  });

  const tag = result.exitCode === 0 ? 'DONE' : result.exitCode === 2 ? 'FAILED' : 'TIMEOUT';
  process.stdout.write(`\nmure-poll-run: ${tag} — ${result.reason} (${result.polls} polls, ${(result.elapsedMs / 1000).toFixed(0)}s)\n`);
  process.exit(result.exitCode === 0 ? 0 : result.exitCode);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(`mure-poll-run: fatal — ${e.message}`); process.exit(1); });
}
