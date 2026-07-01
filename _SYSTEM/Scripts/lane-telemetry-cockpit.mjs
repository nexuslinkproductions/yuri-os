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
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const TELEMETRY = path.join(REPO, '_SYSTEM/state/originator-telemetry.jsonl');
const DEFAULT_TAIL_BYTES = 4 * 1024 * 1024;

// phases that are pure noise at the operator altitude — collapsed to counts, never listed individually.
const NOISE = /(_chunk$|lane_ollama_stream_chunk$)/;
// the milestone phases worth a timeline row (match only the exact final dotted segment).
const MILESTONES = ['start', 'context_ready', 'process_start', 'model_call_start', 'model_call_complete', 'tool_iteration', 'tool_loop_exhausted', 'verification_complete', 'complete', 'process_exit'];
const milestoneOf = (phase) => {
  // Suffix substring matching treated revision_complete as complete; only the final segment is authoritative.
  const seg = String(phase || '').split('.').pop();
  return MILESTONES.includes(seg) ? seg : null;
};

export function readTelemetry(file = TELEMETRY, opts = {}) {
  if (!fs.existsSync(file)) return [];
  const maxBytes = Number.isInteger(opts.maxBytes) && opts.maxBytes > 0 ? opts.maxBytes : DEFAULT_TAIL_BYTES;
  const size = fs.statSync(file).size;
  let raw = '';
  if (size > maxBytes) {
    // Telemetry is append-only; read a bounded tail and discard only a truly partial leading JSONL row.
    const start = size - maxBytes;
    const readStart = Math.max(0, start - 1);
    const readLength = size - readStart;
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(readLength);
      fs.readSync(fd, buf, 0, readLength, readStart);
      raw = buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
    // Strip the partial leading row ONLY when the read actually began mid-file. Keying on `start > 0` was an
    // off-by-one: at size == maxBytes+1, start=1 but readStart=0 (the whole file is read from byte 0), so the
    // first line is complete — stripping it dropped a valid telemetry event (T-5).
    if (readStart > 0) {
      if (raw[0] === '\n') raw = raw.slice(1);
      else {
        const firstBreak = raw.indexOf('\n');
        raw = firstBreak >= 0 ? raw.slice(firstBreak + 1) : '';
      }
    }
  } else {
    raw = fs.readFileSync(file, 'utf8');
  }
  return raw.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function summarizeByTrace(events) {
  const traces = new Map();
  for (const e of events) {
    // Telemetry can be malformed; coerce timestamps once so sorting never calls string methods on undefined/number.
    const ts = String(e.ts ?? '');
    const id = (typeof e.traceId === 'string' && e.traceId) ? e.traceId : 'unknown';
    let t = traces.get(id);
    if (!t) { t = { traceId: id, lane: null, model: null, backend: null, firstTs: ts, lastTs: ts, heartbeats: 0, noiseChunks: 0, milestones: [], lastData: {}, status: 'running' }; traces.set(id, t); }
    if (ts < t.firstTs) t.firstTs = ts;
    if (ts > t.lastTs) t.lastTs = ts;
    const d = e.data || {};
    if (d.lane) t.lane = d.lane;
    if (d.model) t.model = d.model;
    if (d.backend) t.backend = d.backend;
    t.lastData = d;
    const phase = String(e.phase || '');
    if (NOISE.test(phase)) { t.noiseChunks += 1; continue; }
    if (phase.endsWith('heartbeat')) { t.heartbeats += 1; continue; }
    const ms = milestoneOf(phase);
    if (ms) t.milestones.push({ ms, ts, elapsedMs: d.elapsedMs ?? null });
    if (ms === 'complete' || ms === 'process_exit') t.status = 'done';
    if (ms === 'tool_loop_exhausted') t.status = 'tool-exhausted';
  }
  // dedup milestones (keep first occurrence of each), sort by ts, compute total duration.
  const out = [...traces.values()].map((t) => {
    const seen = new Set();
    t.milestones = t.milestones.filter((m) => (seen.has(m.ms) ? false : (seen.add(m.ms), true))).sort((a, b) => String(a.ts ?? '').localeCompare(String(b.ts ?? '')));
    t.durationMs = (new Date(t.lastTs) - new Date(t.firstTs)) || 0;
    t.streamedChars = (t.lastData.stdoutChars || 0) + (t.lastData.stderrChars || 0);
    return t;
  });
  out.sort((a, b) => String(b.lastTs ?? '').localeCompare(String(a.lastTs ?? ''))); // most recent first
  return out;
}

function fmtMs(ms) { if (ms == null) return '?'; const s = ms / 1000; return s >= 60 ? `${(s / 60).toFixed(1)}m` : `${s.toFixed(1)}s`; }

export function renderCockpit(traces, { limit = 12 } = {}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 12;
  const lines = [];
  lines.push(`LANE TELEMETRY COCKPIT — ${traces.length} lane run(s), showing ${Math.min(safeLimit, traces.length)} most recent\n`);
  for (const t of traces.slice(0, safeLimit)) {
    const lane = `${t.lane || '?'}${t.model ? '/' + t.model : ''}${t.backend ? ' [' + t.backend + ']' : ''}`;
    const flag = t.status === 'done' ? '✓' : t.status === 'tool-exhausted' ? '⚠ tool-exhausted' : '… running';
    lines.push(`▸ ${String(t.traceId ?? 'unknown').slice(-28)}  ${lane}  ${flag}  ${fmtMs(t.durationMs)}`);
    const path = t.milestones.map((m) => m.ms.replace(/^(worker|substrate)\./, '')).join(' → ') || '(no milestones)';
    lines.push(`    ${path}`);
    lines.push(`    heartbeats=${t.heartbeats}  stream-chunks=${t.noiseChunks}  streamed=${(t.streamedChars / 1024).toFixed(1)}KB`);
  }
  return lines.join('\n') + '\n';
}

function parsePositiveLimit(args) {
  const i = args.indexOf('--limit');
  if (i < 0) return { ok: true, limit: 12 };
  const raw = args[i + 1];
  // Fail loud: parseInt('abc')→NaN and parseInt('-5') let the cockpit silently hide rows.
  if (!/^[1-9]\d*$/.test(String(raw || ''))) return { ok: false, error: '--limit must be a positive integer' };
  return { ok: true, limit: Number.parseInt(raw, 10) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const traceArg = (() => { const i = args.indexOf('--trace'); return i >= 0 ? args[i + 1] : null; })();
  const limitResult = parsePositiveLimit(args);
  if (!limitResult.ok) { process.stderr.write(`${limitResult.error}\n`); process.exit(2); }
  const limit = limitResult.limit;
  let traces = summarizeByTrace(readTelemetry());
  if (traceArg) traces = traces.filter((t) => t.traceId.includes(traceArg));
  process.stdout.write(json ? JSON.stringify(traces.slice(0, limit), null, 2) + '\n' : renderCockpit(traces, { limit }));
}
