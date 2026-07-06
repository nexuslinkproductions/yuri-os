#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTelemetry, summarizeByTrace, renderCockpit } from './lane-telemetry-cockpit.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// synthetic telemetry: two traces, one complete (with noise), one still running
const events = [
  { ts: '2026-06-08T10:00:00.000Z', traceId: 'A', phase: 'worker.start', data: { lane: 'gemma-local', model: 'gemma4', backend: 'ollama' } },
  { ts: '2026-06-08T10:00:01.000Z', traceId: 'A', phase: 'worker.heartbeat', data: { elapsedMs: 1000 } },
  { ts: '2026-06-08T10:00:02.000Z', traceId: 'A', phase: 'worker.lane_ollama_stream_chunk', data: { chunkChars: 13 } },
  { ts: '2026-06-08T10:00:02.100Z', traceId: 'A', phase: 'worker.lane_ollama_stream_chunk', data: { chunkChars: 13 } },
  { ts: '2026-06-08T10:00:03.000Z', traceId: 'A', phase: 'worker.model_call_complete', data: {} },
  { ts: '2026-06-08T10:00:04.000Z', traceId: 'A', phase: 'worker.verification_complete', data: {} },
  { ts: '2026-06-08T10:00:05.000Z', traceId: 'A', phase: 'worker.complete', data: { stdoutChars: 2048, stderrChars: 1024 } },
  { ts: '2026-06-08T10:05:00.000Z', traceId: 'B', phase: 'deepseek.start', data: { lane: 'deepseek-v4-pro', backend: 'llm-lane' } },
  { ts: '2026-06-08T10:05:01.000Z', traceId: 'B', phase: 'deepseek.heartbeat', data: {} },
];

const traces = summarizeByTrace(events);
ok(traces.length === 2, `two traces summarized (got ${traces.length})`);
const a = traces.find((t) => t.traceId === 'A');
const b = traces.find((t) => t.traceId === 'B');

// noise collapsed to a count, not listed
ok(a.noiseChunks === 2, 'stream chunks collapsed to a count (2), not listed individually');
ok(a.heartbeats === 1, 'heartbeats counted');
// milestones present + deduped + ordered, noise excluded
ok(a.milestones.map((m) => m.ms).join(',').includes('model_call_complete'), 'milestone phases captured');
ok(!a.milestones.some((m) => /chunk/.test(m.ms)), 'noise phases are NOT milestones');
// status
ok(a.status === 'done', 'a trace reaching worker.complete is done');
ok(b.status === 'running', 'a trace without complete/exit is still running');
const revisionOnly = summarizeByTrace([
  { ts: '2026-06-08T10:00:00.000Z', traceId: 'R', phase: 'worker.start', data: {} },
  { ts: '2026-06-08T10:00:01.000Z', traceId: 'R', phase: 'worker.revision_complete', data: {} },
])[0];
ok(revisionOnly.status === 'running' && !revisionOnly.milestones.some((m) => m.ms === 'complete'),
  'T-1: revision_complete is not misclassified as final complete');
const processStart = summarizeByTrace([
  { ts: '2026-06-08T10:00:00.000Z', traceId: 'P', phase: 'worker.process_start', data: {} },
])[0];
ok(processStart.milestones.map((m) => m.ms).join(',') === 'process_start',
  'T-2: process_start is not mislabeled as start');
const oddTs = summarizeByTrace([
  { traceId: 'TS', phase: 'worker.start', data: {} },
  { ts: 7, traceId: 'TS', phase: 'worker.complete', data: {} },
])[0];
ok(oddTs.status === 'done' && oddTs.milestones.length === 2,
  'T-3: missing/numeric timestamps are string-normalized instead of crashing');
const numericTraceOut = renderCockpit(summarizeByTrace([
  { ts: '2026-06-08T10:00:00.000Z', traceId: 123, phase: 'worker.start', data: {} },
]));
ok(numericTraceOut.includes('unknown'),
  'T-4: non-string traceId renders as unknown instead of throwing');
// lane/model/backend captured
ok(a.lane === 'gemma-local' && a.model === 'gemma4' && a.backend === 'ollama', 'lane/model/backend captured');
// duration + streamed chars
ok(a.durationMs === 5000, 'duration computed from first→last ts');
ok(a.streamedChars === 3072, 'streamed chars = stdout+stderr from the last event');
// most-recent first
ok(traces[0].traceId === 'B', 'traces sorted most-recent first');

// render is human-readable + carries NO raw event JSON
const out = renderCockpit(traces);
ok(out.includes('LANE TELEMETRY COCKPIT') && out.includes('gemma-local'), 'render is human-readable');
ok(!out.includes('"phase"') && !out.includes('"data"'), 'render contains NO raw event JSON (the whole point)');
ok(out.includes('stream-chunks=2'), 'render shows the collapsed chunk count');

const telemetryTailFile = '/tmp/lane-telemetry-tail-test.jsonl';
const oldLine = JSON.stringify({ ts: '2026-06-08T09:00:00.000Z', traceId: 'old', phase: 'worker.start', data: { pad: 'x'.repeat(200) } });
const tailLineA = JSON.stringify({ ts: '2026-06-08T10:00:00.000Z', traceId: 'tail-a', phase: 'worker.start', data: {} });
const tailLineB = JSON.stringify({ ts: '2026-06-08T10:00:01.000Z', traceId: 'tail-b', phase: 'worker.complete', data: {} });
fs.writeFileSync(telemetryTailFile, `${oldLine}\n${tailLineA}\n${tailLineB}\n`, 'utf8');
const tailEvents = readTelemetry(telemetryTailFile, { maxBytes: tailLineA.length + tailLineB.length + 2 });
ok(tailEvents.length === 2 && tailEvents.every((e) => e.traceId !== 'old'),
  'T-5: readTelemetry reads a bounded JSONL tail and drops the partial first row');
try { fs.unlinkSync(telemetryTailFile); } catch { /* ignore */ }

const cliPath = path.join(__dirname, 'lane-telemetry-cockpit.mjs');
const badLimit = spawnSync(process.execPath, [cliPath, '--limit', 'abc'], { encoding: 'utf8' });
const negativeLimit = spawnSync(process.execPath, [cliPath, '--limit', '-5'], { encoding: 'utf8' });
ok(badLimit.status === 2 && badLimit.stderr.includes('--limit must be a positive integer'),
  'T-6: CLI rejects non-numeric --limit');
ok(negativeLimit.status === 2 && negativeLimit.stderr.includes('--limit must be a positive integer'),
  'T-6: CLI rejects negative --limit');

// determinism
ok(JSON.stringify(summarizeByTrace(events)) === JSON.stringify(summarizeByTrace(events)), 'summarize is deterministic');
const src = fs.readFileSync(path.join(__dirname, 'lane-telemetry-cockpit.mjs'), 'utf8');
ok(!/Math\.random\(/.test(src), 'no Math.random (deterministic; timestamps read from telemetry, not generated)');

// T-5 off-by-one boundary: at size == maxBytes+1 the file is read whole (readStart=0) — the first line must survive.
const t5File = path.join('/tmp', 'cockpit-t5-boundary.jsonl');
fs.writeFileSync(t5File, JSON.stringify({ ts: '2026-06-09T00:00:00.000Z', traceId: 'T5', phase: 'worker.start' }) + '\n' + JSON.stringify({ ts: '2026-06-09T00:00:01.000Z', traceId: 'T5', phase: 'worker.complete' }) + '\n', 'utf8');
const t5sz = fs.statSync(t5File).size;
const t5events = readTelemetry(t5File, { maxBytes: t5sz - 1 }); // size == maxBytes+1 → start=1, readStart=0
ok(t5events.length === 2 && t5events[0].traceId === 'T5' && t5events[0].phase === 'worker.start',
  'T-5 off-by-one: at size==maxBytes+1 the first telemetry line is kept (readStart=0, not stripped)');
try { fs.unlinkSync(t5File); } catch { /* ignore */ }

console.log(`\nlane-telemetry-cockpit.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
