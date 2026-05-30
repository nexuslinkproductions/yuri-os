#!/usr/bin/env node
/**
 * energy-tick hook — the everyday-workflow ΔU source.
 *
 * Registered on PostToolUse + Stop. On each genuine session transition it feeds
 * a real before/after control-plane state pair into the energy gate and appends
 * a real-ΔU trace record (regime='action', lane='session', user-attributed).
 * This replaces the retired legacy dispatch surfaces as the live ΔU source.
 *
 * SAFETY: gated on YURI_ENERGY_OBSERVABILITY=1 (zero work otherwise). Fully
 * error-isolated — always exits 0, never blocks or breaks the session. Snapshot
 * state lives in _SYSTEM/state/energy-session/ (gitignored). Observability-only:
 * it records the gate's decision, it does NOT block any tool.
 *
 * Thin wrapper — all logic lives in _SYSTEM/Scripts/energy-tick-core.mjs (tested).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tickAndTrace, freshState } from '../../_SYSTEM/Scripts/energy-tick-core.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(_HERE, '..', '..');
// Snapshot dir honors YURI_STATE_DIR (same as the energy-trace dir) so the two
// session-state stores stay together and tests never touch real state.
const SNAP_DIR = process.env.YURI_STATE_DIR
  ? path.join(process.env.YURI_STATE_DIR, 'energy-session')
  : path.join(REPO_ROOT, '_SYSTEM', 'state', 'energy-session');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function run() {
  // Master switch — zero I/O unless explicitly enabled.
  if (process.env.YURI_ENERGY_OBSERVABILITY !== '1') return;

  let event;
  try { event = JSON.parse(readStdin() || '{}'); } catch { return; }

  const rawId = (event && typeof event.session_id === 'string' && event.session_id) ? event.session_id : 'default';
  const sessionId = rawId.replace(/[^A-Za-z0-9_-]/g, '') || 'default';
  const snapPath = path.join(SNAP_DIR, `${sessionId}.json`);

  let snap = null;
  try { snap = JSON.parse(fs.readFileSync(snapPath, 'utf8')); } catch { snap = null; }
  const prevState = (snap && snap.state && typeof snap.state === 'object') ? snap.state : freshState();
  const depth = (snap && Number.isFinite(snap.depth)) ? snap.depth : 0;
  const recentAbs = (snap && Array.isArray(snap.recentAbs)) ? snap.recentAbs : [];
  const nowIso = new Date().toISOString();

  const result = tickAndTrace(prevState, event, {
    runId: `session-${sessionId}-${depth}`, nowIso, depth, recentAbs,
  });

  // SKIP transitions don't advance state/depth or write a record — nothing to persist.
  if (!result.traced) return;

  try {
    fs.mkdirSync(SNAP_DIR, { recursive: true });
    fs.writeFileSync(snapPath, JSON.stringify({
      state: result.state,
      depth: result.depth,
      recentAbs: result.recentAbs,
      surpriseEngaged: result.surpriseEngaged,
      sessionId,
      updatedAt: nowIso,
    }) + '\n');
  } catch { /* snapshot write failure must never affect the session */ }
}

try { run(); } catch { /* never propagate */ }
process.exit(0);
