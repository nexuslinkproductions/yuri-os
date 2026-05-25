#!/usr/bin/env node
/**
 * Codex/main arbitration for captured lane evidence.
 *
 * Model lane output stays advisory until this verifier accepts the captured
 * evidence and records a Kagami verification event.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendKagamiEvent, readKagamiEvents } from './kagami-event-bus.mjs';
import { isProtectedPath } from './lane-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

export function parseWorkerCaptureEvidence(text) {
  const raw = String(text || '');
  const match = raw.match(/^([\s\S]*?)\r?\n\r?\n([\s\S]*)$/);
  const headerText = match ? match[1] : raw;
  const body = match ? match[2] : '';
  const headers = {};
  for (const line of headerText.split(/\r?\n/)) {
    const parts = line.match(/^([^:]+):\s*(.*)$/);
    if (parts) headers[parts[1].trim()] = parts[2].trim();
  }
  return { headers, body, computedCaptureHash: sha256(body) };
}

export function resolveEvidencePath(ref, options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const evidenceRef = String(ref || '').trim();
  if (!evidenceRef) throw new Error('missing evidence ref');
  if (isProtectedPath(evidenceRef)) throw new Error(`protected evidence ref: ${evidenceRef}`);
  const absPath = path.resolve(repoRoot, evidenceRef);
  const insideRepo = absPath === repoRoot || absPath.startsWith(`${repoRoot}${path.sep}`);
  if (!insideRepo) throw new Error(`evidence ref escapes repo root: ${evidenceRef}`);
  return absPath;
}

export function findLatestCapturedLaneEvent(events, options = {}) {
  const worker = options.worker || 'claude';
  const taskId = options.taskId || '';
  return [...events].reverse().find((event) => {
    const payload = event.payload || {};
    if (event.kind !== 'LANE_OUTPUT_DELTA') return false;
    if (payload.source !== 'worker-capture-once') return false;
    if (worker && payload.worker !== worker) return false;
    if (taskId && payload.taskId !== taskId) return false;
    return true;
  }) || null;
}

export function findExistingArbitration(events, captureEventId) {
  if (!captureEventId) return null;
  return [...events].reverse().find((event) => {
    const payload = event.payload || {};
    return (
      (event.kind === 'CODEX_VERIFICATION_PASSED' || event.kind === 'CODEX_VERIFICATION_FAILED')
      && payload.source === 'lane-arbitration'
      && payload.captureEventId === captureEventId
    );
  }) || null;
}

export function evaluateCapturedLaneEvidence(captureEvent, options = {}) {
  const payload = captureEvent?.payload || {};
  const evidenceRefs = captureEvent?.evidenceRefs || payload.evidenceRefs || [];
  const issues = [];
  const expected = options.expected ? String(options.expected) : '';
  let parsed = { headers: {}, body: '', computedCaptureHash: '' };

  if (!captureEvent) {
    return { ok: false, issues: ['missing capture event'], evidenceRefs: [], expectedFound: false };
  }
  if (payload.ok !== true) issues.push('capture event is not ok');
  if (!evidenceRefs.length) issues.push('capture event has no evidence refs');
  if (evidenceRefs.length > 1) issues.push('capture event has multiple evidence refs; expected one');

  try {
    const evidencePath = resolveEvidencePath(evidenceRefs[0], options);
    if (!existsSync(evidencePath)) {
      issues.push(`evidence file missing: ${evidenceRefs[0]}`);
    } else {
      parsed = parseWorkerCaptureEvidence(readFileSync(evidencePath, 'utf8'));
      if (!parsed.body.trim()) issues.push('capture body is empty');
      if (parsed.headers.captureHash !== parsed.computedCaptureHash) {
        issues.push('capture file hash does not match capture body');
      }
      if (payload.captureHash && payload.captureHash !== parsed.computedCaptureHash) {
        issues.push('capture event hash does not match capture body');
      }
    }
  } catch (err) {
    issues.push(err.message || String(err));
  }

  const expectedFound = expected ? parsed.body.includes(expected) : true;
  if (expected && !expectedFound) issues.push('expected marker not found in capture body');

  return {
    ok: issues.length === 0,
    issues,
    evidenceRefs,
    expectedFound,
    expectedHash: expected ? sha256(expected) : null,
    captureHash: parsed.computedCaptureHash || payload.captureHash || null,
    captureBytes: Buffer.byteLength(parsed.body || '', 'utf8'),
    captureLines: parsed.body ? parsed.body.split('\n').length : 0,
    model: payload.model || parsed.headers.model || null,
  };
}

export function arbitrateLatestLaneEvidence(options = {}) {
  const events = readKagamiEvents({ root: options.eventRoot });
  const captureEvent = findLatestCapturedLaneEvent(events, options);
  const worker = options.worker || captureEvent?.payload?.worker || 'claude';
  const taskId = options.taskId || captureEvent?.payload?.taskId || null;

  if (!captureEvent) {
    const failed = appendKagamiEvent('CODEX_VERIFICATION_FAILED', {
      source: 'lane-arbitration',
      session: 'codex-main',
      lane: 'codex-main',
      worker,
      taskId,
      status: 'missing-capture-event',
      issues: ['no matching captured lane event'],
    }, options.eventRoot ? { root: options.eventRoot } : {});
    return { ok: false, status: 'missing-capture-event', eventId: failed.id, issues: ['no matching captured lane event'] };
  }

  const prior = options.force ? null : findExistingArbitration(events, captureEvent.id);
  if (prior) {
    return {
      ok: prior.kind === 'CODEX_VERIFICATION_PASSED',
      status: 'deduped',
      deduped: true,
      eventId: prior.id,
      captureEventId: captureEvent.id,
      issues: prior.payload?.issues || [],
    };
  }

  const payload = captureEvent.payload || {};
  const evidenceRefs = captureEvent.evidenceRefs || payload.evidenceRefs || [];
  const eventOptions = options.eventRoot ? { root: options.eventRoot } : {};
  appendKagamiEvent('CODEX_VERIFICATION_STARTED', {
    source: 'lane-arbitration',
    session: 'codex-main',
    lane: 'codex-main',
    worker: payload.worker || worker,
    taskId: payload.taskId || taskId,
    captureEventId: captureEvent.id,
    evidenceRefs,
  }, eventOptions);

  const evaluation = evaluateCapturedLaneEvidence(captureEvent, options);
  const kind = evaluation.ok ? 'CODEX_VERIFICATION_PASSED' : 'CODEX_VERIFICATION_FAILED';
  const resultEvent = appendKagamiEvent(kind, {
    source: 'lane-arbitration',
    session: 'codex-main',
    lane: 'codex-main',
    worker: payload.worker || worker,
    taskId: payload.taskId || taskId,
    captureEventId: captureEvent.id,
    capturedLane: payload.lane || captureEvent.lane || null,
    capturedSession: payload.session || captureEvent.session || null,
    model: evaluation.model || payload.model || null,
    status: evaluation.ok ? 'accepted' : 'rejected',
    expectedHash: evaluation.expectedHash,
    expectedFound: evaluation.expectedFound,
    captureHash: evaluation.captureHash,
    captureBytes: evaluation.captureBytes,
    captureLines: evaluation.captureLines,
    evidenceRefs,
    issues: evaluation.issues,
  }, eventOptions);

  return {
    ok: evaluation.ok,
    status: evaluation.ok ? 'accepted' : 'rejected',
    eventId: resultEvent.id,
    captureEventId: captureEvent.id,
    evidenceRefs,
    issues: evaluation.issues,
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--worker' && value) out.worker = value;
    if (key === '--task-id' && value) out.taskId = value;
    if (key === '--expect' && value) out.expected = value;
    if (key === '--event-root' && value) out.eventRoot = value;
    if (key === '--repo-root' && value) out.repoRoot = value;
    if (key === '--force') out.force = true;
    if (key.startsWith('--') && key !== '--force' && value) i += 1;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = arbitrateLatestLaneEvidence(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  }
}
