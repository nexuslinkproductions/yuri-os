#!/usr/bin/env node
/**
 * Capture one live worker TUI pane after a feed and attach it as Kagami evidence.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appendKagamiEvent } from './kagami-event-bus.mjs';
import { captureWorkerPane } from './worker-tmux.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const WORKER_CAPTURE_DIR = path.join('_SYSTEM', 'state', 'worker-captures');

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

export function sanitizeCaptureToken(value, fallback = 'unknown') {
  const token = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80);
  return token || fallback;
}

export function buildWorkerCaptureEvidence({ worker, taskId, model, text, root = REPO_ROOT, ts = new Date().toISOString() }) {
  const safeWorker = sanitizeCaptureToken(worker, 'worker');
  const safeTask = sanitizeCaptureToken(taskId, 'task');
  const fileName = `${safeWorker}-${safeTask}.txt`;
  const relPath = path.join(WORKER_CAPTURE_DIR, fileName);
  const absPath = path.join(root, relPath);
  const body = String(text || '');
  return {
    absPath,
    relPath,
    ts,
    worker: safeWorker,
    taskId: safeTask,
    bytes: Buffer.byteLength(body, 'utf8'),
    lineCount: body ? body.split('\n').length : 0,
    captureHash: sha256(body),
    model: model || null,
    body,
  };
}

export function writeWorkerCaptureEvidence(args) {
  const evidence = buildWorkerCaptureEvidence(args);
  mkdirSync(path.dirname(evidence.absPath), { recursive: true });
  writeFileSync(
    evidence.absPath,
    [
      `ts: ${evidence.ts}`,
      `worker: ${evidence.worker}`,
      `taskId: ${evidence.taskId}`,
      evidence.model ? `model: ${evidence.model}` : null,
      `captureHash: ${evidence.captureHash}`,
      '',
      evidence.body,
    ].filter((line) => line !== null).join('\n'),
  );
  return evidence;
}

export function appendWorkerCaptureEvent({ worker, taskId, lane, session, capture, evidence, eventRoot }) {
  return appendKagamiEvent(
    'LANE_OUTPUT_DELTA',
    {
      source: 'worker-capture-once',
      worker,
      lane,
      session,
      model: evidence.model || null,
      taskId,
      ok: Boolean(capture.ok),
      status: capture.ok ? 'captured' : 'capture-failed',
      target: capture.target || null,
      captureBytes: evidence.bytes,
      captureLines: evidence.lineCount,
      captureHash: evidence.captureHash,
      evidenceRefs: [evidence.relPath],
      error: capture.ok ? null : capture.error || 'worker pane capture failed',
    },
    eventRoot ? { root: eventRoot } : {},
  );
}

export async function captureOnce(options = {}) {
  const worker = options.worker || 'claude';
  const taskId = options.taskId || 'manual';
  const lane = options.lane || (worker === 'claude' ? 'claude' : worker);
  const session = options.session || `marcel-${worker}`;
  const model = options.model || null;
  const delayMs = Number(options.delayMs ?? process.env.YURI_CAPTURE_DELAY_MS ?? 12_000);
  const lines = Number(options.lines ?? process.env.YURI_CAPTURE_LINES ?? 500);

  if (Number.isFinite(delayMs) && delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const capture = captureWorkerPane(worker, Number.isFinite(lines) ? lines : 500);
  const text = capture.ok
    ? capture.text
    : `Worker pane capture unavailable: ${capture.error || 'unknown error'}`;
  const evidence = writeWorkerCaptureEvidence({
    worker,
    taskId,
    model,
    text,
    root: options.root || REPO_ROOT,
  });
  const event = appendWorkerCaptureEvent({
    worker,
    taskId,
    lane,
    session,
    capture,
    evidence,
    eventRoot: options.eventRoot,
  });
  return { ok: capture.ok, evidenceRef: evidence.relPath, eventId: event.id, captureHash: evidence.captureHash };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--worker' && value) out.worker = value;
    if (key === '--task-id' && value) out.taskId = value;
    if (key === '--lane' && value) out.lane = value;
    if (key === '--session' && value) out.session = value;
    if (key === '--model' && value) out.model = value;
    if (key === '--delay' && value) out.delayMs = Number(value);
    if (key === '--lines' && value) out.lines = Number(value);
    if (key.startsWith('--') && value) i += 1;
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  captureOnce(parseArgs(process.argv.slice(2)))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exit(result.ok ? 0 : 1);
    })
    .catch((err) => {
      console.error(err?.stack || err?.message || String(err));
      process.exit(1);
    });
}
