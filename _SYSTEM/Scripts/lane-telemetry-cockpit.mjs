#!/usr/bin/env node
/**
 * lane-telemetry-cockpit.mjs — human-readable cockpit over the Originator YURI_LANE_TELEMETRY stream.
 *
 * JSONL is the audit substrate, not the operator experience (Codex handoff). This reads
 * _SYSTEM/state/originator-telemetry.jsonl, groups by traceId, COLLAPSES the noisy stream/stderr/stdout chunk
 * events into counts, and prints a compact timeline per lane run: start → model call → verification → exit, with
 * elapsed, heartbeat count, chars streamed, and status — so the operator sees what a lane is doing without reading
 * raw JSON. Read-only; never mutates telemetry.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const TELEMETRY = path.join(REPO, '_SYSTEM/state/originator-telemetry.jsonl');

// phases that are pure noise at the operator altitude — collapsed to counts, never listed individually.
const NOISE = /(_chunk$|lane_ollama_stream_chunk$)/;
// the milestone phases worth a timeline row (suffix-matched so worker.* / substrate.* both hit).
const MILESTONES = ['start', 'context_ready', 'process_start', 'model_call_start', 'model_call_complete', 'tool_iteration', 'tool_loop_exhausted', 'verification_complete', 'complete', 'process_exit'];
const milestoneOf = (phase) => MILESTONES.find((m) => phase === m || phase.endsWith('.' + m) || phase.endsWith(m));

export function readTelemetry(file = TELEMETRY) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function summarizeByTrace(events) {
  const traces = new Map();
  for (const e of events) {
    const id = e.traceId || 'unknown';
    let t = traces.get(id);
    if (!t) { t = { traceId: id, lane: null, model: null, backend: null, firstTs: e.ts, lastTs: e.ts, heartbeats: 0, noiseChunks: 0, milestones: [], lastData: {}, status: 'running' }; traces.set(id, t); }
    if (e.ts < t.firstTs) t.firstTs = e.ts;
    if (e.ts > t.lastTs) t.lastTs = e.ts;
    const d = e.data || {};
    if (d.lane) t.lane = d.lane;
    if (d.model) t.model = d.model;
    if (d.backend) t.backend = d.backend;
    t.lastData = d;
    const phase = String(e.phase || '');
    if (NOISE.test(phase)) { t.noiseChunks += 1; continue; }
    if (phase.endsWith('heartbeat')) { t.heartbeats += 1; continue; }
    const ms = milestoneOf(phase);
    if (ms) t.milestones.push({ ms, ts: e.ts, elapsedMs: d.elapsedMs ?? null });
    if (ms === 'complete' || ms === 'process_exit') t.status = 'done';
    if (ms === 'tool_loop_exhausted') t.status = 'tool-exhausted';
  }
  // dedup milestones (keep first occurrence of each), sort by ts, compute total duration.
  const out = [...traces.values()].map((t) => {
    const seen = new Set();
    t.milestones = t.milestones.filter((m) => (seen.has(m.ms) ? false : (seen.add(m.ms), true))).sort((a, b) => a.ts.localeCompare(b.ts));
    t.durationMs = (new Date(t.lastTs) - new Date(t.firstTs)) || 0;
    t.streamedChars = (t.lastData.stdoutChars || 0) + (t.lastData.stderrChars || 0);
    return t;
  });
  out.sort((a, b) => b.lastTs.localeCompare(a.lastTs)); // most recent first
  return out;
}

function fmtMs(ms) { if (ms == null) return '?'; const s = ms / 1000; return s >= 60 ? `${(s / 60).toFixed(1)}m` : `${s.toFixed(1)}s`; }

export function renderCockpit(traces, { limit = 12 } = {}) {
  const lines = [];
  lines.push(`LANE TELEMETRY COCKPIT — ${traces.length} lane run(s), showing ${Math.min(limit, traces.length)} most recent\n`);
  for (const t of traces.slice(0, limit)) {
    const lane = `${t.lane || '?'}${t.model ? '/' + t.model : ''}${t.backend ? ' [' + t.backend + ']' : ''}`;
    const flag = t.status === 'done' ? '✓' : t.status === 'tool-exhausted' ? '⚠ tool-exhausted' : '… running';
    lines.push(`▸ ${t.traceId.slice(-28)}  ${lane}  ${flag}  ${fmtMs(t.durationMs)}`);
    const path = t.milestones.map((m) => m.ms.replace(/^(worker|substrate)\./, '')).join(' → ') || '(no milestones)';
    lines.push(`    ${path}`);
    lines.push(`    heartbeats=${t.heartbeats}  stream-chunks=${t.noiseChunks}  streamed=${(t.streamedChars / 1024).toFixed(1)}KB`);
  }
  return lines.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const traceArg = (() => { const i = args.indexOf('--trace'); return i >= 0 ? args[i + 1] : null; })();
  const limit = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : 12; })();
  let traces = summarizeByTrace(readTelemetry());
  if (traceArg) traces = traces.filter((t) => t.traceId.includes(traceArg));
  process.stdout.write(json ? JSON.stringify(traces.slice(0, limit), null, 2) + '\n' : renderCockpit(traces, { limit }));
}
