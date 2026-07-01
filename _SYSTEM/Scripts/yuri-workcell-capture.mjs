#!/usr/bin/env node
/**
 * Capture live worker/Prime pane output into the YURI workcell output pool.
 *
 * This is an intake bridge: it preserves worker output as runtime evidence so
 * Codex/main can review structured artifacts instead of copying terminal text.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appendKagamiEvent } from './kagami-event-bus.mjs';
import { isProtectedPath } from './lane-kernel.mjs';
import { captureWorkerPane } from './worker-tmux.mjs';
import { sanitizeCaptureToken } from './worker-capture-once.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const WORKCELL_STATE_DIR = path.join('_SYSTEM', 'state', 'workcell');
export const WORKCELL_CAPTURE_SCHEMA = 'yuri.workcell.capture.v0';
export const WORKCELL_OUTPUT_SCHEMA = 'yuri.workcell.output.v0';

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

function stableTimestamp(value = new Date().toISOString()) {
  return String(value).replace(/[:.]/g, '-');
}

function assertSafeRelPath(relPath) {
  const normalized = relPath.replaceAll(path.sep, '/');
  if (path.isAbsolute(relPath) || normalized.includes('../') || normalized.startsWith('..')) {
    throw new Error(`workcell path must stay repo-relative: ${relPath}`);
  }
  if (isProtectedPath(normalized)) {
    throw new Error(`workcell path cannot target protected surface: ${relPath}`);
  }
  return normalized;
}

function assertInsideRoot(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`workcell artifact escaped repo root: ${target}`);
  }
}

export function buildWorkcellCaptureArtifact(options = {}) {
  const ts = options.ts || new Date().toISOString();
  const runId = sanitizeCaptureToken(options.runId || 'manual-run', 'manual-run');
  const role = sanitizeCaptureToken(options.role || options.worker || 'worker', 'worker');
  const worker = sanitizeCaptureToken(options.worker || role, role);
  const model = options.model ? String(options.model) : null;
  const source = options.source || 'tmux-pane';
  const text = String(options.text || '');
  const captureId = sanitizeCaptureToken(options.captureId || stableTimestamp(ts), 'capture');
  const relDir = assertSafeRelPath(path.join(WORKCELL_STATE_DIR, runId, role));
  const relCapturePath = assertSafeRelPath(path.join(relDir, 'captures', `${captureId}.md`));
  const relOutputPath = assertSafeRelPath(path.join(relDir, 'output.json'));
  const root = options.root || REPO_ROOT;
  const absDir = path.join(root, relDir);
  const absCapturePath = path.join(root, relCapturePath);
  const absOutputPath = path.join(root, relOutputPath);
  assertInsideRoot(root, absCapturePath);
  assertInsideRoot(root, absOutputPath);

  const captureHash = sha256(text);
  const bytes = Buffer.byteLength(text, 'utf8');
  const lineCount = text ? text.split('\n').length : 0;

  const output = {
    schema: WORKCELL_OUTPUT_SCHEMA,
    captureSchema: WORKCELL_CAPTURE_SCHEMA,
    runId,
    role,
    worker,
    model,
    source,
    ts,
    ok: Boolean(options.ok ?? true),
    captureHash,
    bytes,
    lineCount,
    evidenceRefs: [relCapturePath],
    outputs: [],
    testCommands: [],
    riskNotes: [],
    memorySignals: {
      proposals: [],
      capsuleUsage: {
        contextsUsed: [],
        contextsIgnored: [],
        contradictionsDetected: [],
        staleContexts: [],
      },
      recallLog: [],
    },
  };

  const markdown = [
    '---',
    `schema: ${WORKCELL_CAPTURE_SCHEMA}`,
    `ts: ${ts}`,
    `runId: ${runId}`,
    `role: ${role}`,
    `worker: ${worker}`,
    model ? `model: ${model}` : null,
    `source: ${source}`,
    `captureHash: ${captureHash}`,
    '---',
    '',
    text,
  ].filter((line) => line !== null).join('\n');

  return {
    runId,
    role,
    worker,
    model,
    source,
    ts,
    captureHash,
    bytes,
    lineCount,
    relDir,
    relCapturePath,
    relOutputPath,
    absDir,
    absCapturePath,
    absOutputPath,
    output,
    markdown,
  };
}

export function writeWorkcellCaptureArtifact(options = {}) {
  const artifact = buildWorkcellCaptureArtifact(options);
  mkdirSync(path.dirname(artifact.absCapturePath), { recursive: true });
  writeFileSync(artifact.absCapturePath, artifact.markdown);
  writeFileSync(artifact.absOutputPath, `${JSON.stringify(artifact.output, null, 2)}\n`);
  return artifact;
}

export function captureTmuxTarget(target, lines = 2000) {
  const safeLines = String(-Math.max(50, Number(lines) || 2000));
  try {
    const text = execFileSync(
      'tmux',
      ['capture-pane', '-t', String(target), '-p', '-S', safeLines],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    return { ok: true, target: String(target), text };
  } catch (error) {
    return {
      ok: false,
      target: String(target),
      text: `Workcell tmux capture unavailable: ${error.message || String(error)}`,
      error: error.message || String(error),
    };
  }
}

export function readCaptureFile(filePath, root = REPO_ROOT) {
  const resolved = path.resolve(filePath);
  assertInsideRoot(root, resolved);
  const relPath = path.relative(root, resolved).replaceAll(path.sep, '/');
  if (isProtectedPath(relPath) || isProtectedPath(resolved)) {
    throw new Error(`capture input cannot read protected path: ${filePath}`);
  }
  if (!existsSync(resolved)) {
    throw new Error(`capture input file missing: ${filePath}`);
  }
  return readFileSync(resolved, 'utf8');
}

export async function captureWorkcellOutput(options = {}) {
  const lines = Number(options.lines || 2000);
  let capture;
  if (options.fromFile) {
    const text = readCaptureFile(path.resolve(options.fromFile), options.root || REPO_ROOT);
    capture = { ok: true, target: options.fromFile, text };
  } else if (options.tmuxTarget) {
    capture = captureTmuxTarget(options.tmuxTarget, lines);
  } else {
    capture = captureWorkerPane(options.worker || 'claude', lines);
  }

  const artifact = writeWorkcellCaptureArtifact({
    ...options,
    text: capture.text,
    ok: capture.ok,
    source: options.fromFile ? 'file' : (options.tmuxTarget ? `tmux:${options.tmuxTarget}` : 'worker-registry'),
  });

  let event = null;
  if (options.event !== false) {
    event = appendKagamiEvent(
      'LANE_OUTPUT_DELTA',
      {
        source: 'yuri-workcell-capture',
        session: options.session || `workcell-${artifact.runId}`,
        lane: options.lane || artifact.worker,
        worker: artifact.worker,
        role: artifact.role,
        model: artifact.model,
        runId: artifact.runId,
        ok: capture.ok,
        status: capture.ok ? 'captured' : 'capture-failed',
        captureBytes: artifact.bytes,
        captureLines: artifact.lineCount,
        captureHash: artifact.captureHash,
        evidenceRefs: [artifact.relCapturePath, artifact.relOutputPath],
        error: capture.ok ? null : capture.error || 'workcell capture failed',
      },
      options.eventRoot ? { root: options.eventRoot } : {},
    );
  }

  return {
    ok: capture.ok,
    runId: artifact.runId,
    role: artifact.role,
    outputRef: artifact.relOutputPath,
    captureRef: artifact.relCapturePath,
    captureHash: artifact.captureHash,
    eventId: event?.id || null,
  };
}

function parseArgs(argv) {
  const out = { event: true };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--run-id' && value) out.runId = value;
    else if (key === '--role' && value) out.role = value;
    else if (key === '--worker' && value) out.worker = value;
    else if (key === '--model' && value) out.model = value;
    else if (key === '--lane' && value) out.lane = value;
    else if (key === '--session' && value) out.session = value;
    else if ((key === '--tmux-target' || key === '--target') && value) out.tmuxTarget = value;
    else if (key === '--from-file' && value) out.fromFile = value;
    else if (key === '--lines' && value) out.lines = Number(value);
    else if (key === '--no-event') out.event = false;
    else if (key.startsWith('--') && value) i += 1;
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  captureWorkcellOutput(parseArgs(process.argv.slice(2)))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exit(result.ok ? 0 : 1);
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exit(1);
    });
}
