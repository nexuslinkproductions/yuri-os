#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeByTrace, renderCockpit } from './lane-telemetry-cockpit.mjs';

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

// determinism
ok(JSON.stringify(summarizeByTrace(events)) === JSON.stringify(summarizeByTrace(events)), 'summarize is deterministic');
const src = fs.readFileSync(path.join(__dirname, 'lane-telemetry-cockpit.mjs'), 'utf8');
ok(!/Math\.random\(/.test(src), 'no Math.random (deterministic; timestamps read from telemetry, not generated)');

console.log(`\nlane-telemetry-cockpit.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
