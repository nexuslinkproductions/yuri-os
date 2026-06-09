#!/usr/bin/env node
// Tests for arch-graph-watch.mjs — the structural-drift reflex.
// All IO is redirected to a temp sandbox; the real graph/state/nerve are never touched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check, graphHash, spofFindingTitle } from './arch-graph-watch.mjs';
import { loadEvents, mintEventId } from './yuri-nerve.mjs';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`PASS ${msg}`); } else { fail++; console.log(`FAIL ${msg}`); } };

// temp sandbox
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archwatch-'));
const graphPath = path.join(dir, 'graph.json');
const metricsPath = path.join(dir, 'metrics.json');
const statePath = path.join(dir, 'watch-state.json');
const nerveStore = path.join(dir, 'nerve.jsonl');
const cfg = { graphPath, metricsPath, statePath, nerveStore, stamp: '2026-06-09T00:00:00Z' };

const E = (source, target) => ({ source, target, type: 'flow' });
// Two triangles joined by a single bridge edge C<->E ⇒ C and E are cut-vertices, C-E is a bridge.
const BASE_NODES = ['A', 'B', 'C', 'E', 'F', 'G'].map((id) => ({ id, sector: 'core', label: id }));
const BASE_EDGES = [E('A', 'B'), E('B', 'C'), E('C', 'A'), E('E', 'F'), E('F', 'G'), E('G', 'E'), E('C', 'E')];
// Bump mtime deterministically each write so the cheap mtime-gate always sees a real change
// (guards the test against sub-millisecond filesystem mtime granularity).
let tick = 1_000_000;
const writeGraph = (nodes, edges) => {
  fs.writeFileSync(graphPath, JSON.stringify({ nodes, edges }, null, 2));
  tick += 60; fs.utimesSync(graphPath, new Date(tick * 1000), new Date(tick * 1000));
};

// 1) first run seeds a baseline silently (no spam findings)
writeGraph(BASE_NODES, BASE_EDGES);
const r1 = check(cfg);
ok(r1.fired && r1.seeded, 'first run seeds baseline (fired+seeded)');
ok(fs.existsSync(metricsPath), 'baseline writes the metrics golden reference');
ok(JSON.parse(fs.readFileSync(statePath, 'utf8')).graphMtimeMs > 0, 'state records graphMtimeMs (mtime gate)');
ok(loadEvents(nerveStore).length === 0, 'baseline emits NO nerve findings (no first-run spam)');

// 2) unchanged graph → cheap mtime no-op
const r2 = check(cfg);
ok(!r2.fired && r2.reason === 'unchanged-mtime', 'unchanged graph → fired:false via mtime gate');

// 3) pendant H-A makes A a NEW articulation point → finding emitted
writeGraph([...BASE_NODES, { id: 'H', sector: 'core', label: 'H' }], [...BASE_EDGES, E('A', 'H')]);
const r3 = check(cfg);
ok(r3.fired && r3.newArticulation.includes('A'), 'new pendant makes A a new articulation point');
const aId = mintEventId({ kind: 'finding', title: spofFindingTitle('A') });
ok(!!loadEvents(nerveStore).find((e) => e.id === aId && e.state === 'open'), 'a nerve finding is recorded for the new SPOF "A"');

// 4) idempotent — same graph again → no-op, no duplicate finding
const r4 = check(cfg);
ok(!r4.fired, 'idempotent: re-run on same graph is a no-op');
ok(loadEvents(nerveStore).filter((e) => e.id === aId).length === 1, 'no duplicate finding for "A" (content-hash id)');

// 5) remove the pendant → A resolves → finding closed
writeGraph(BASE_NODES, BASE_EDGES);
const r5 = check(cfg);
ok(r5.fired && r5.resolvedArticulation.includes('A'), 'removing the pendant resolves A');
ok(loadEvents(nerveStore).find((e) => e.id === aId)?.state === 'closed', 'the SPOF finding for "A" is closed on resolution');

// 6) CORRUPT watch-state → fail-open, NOT misread as first-run (the high-sev review finding)
writeGraph([...BASE_NODES, { id: 'H', sector: 'core', label: 'H' }], [...BASE_EDGES, E('A', 'H')]); // A is AP again
check(cfg); // A finding re-opens
const goodState = fs.readFileSync(statePath, 'utf8');
fs.writeFileSync(statePath, '{ this is : not json');           // truncate/corrupt the state
const rc = check(cfg);
ok(!rc.fired && rc.reason === 'state-corrupt', 'corrupt state → fail-open (state-corrupt), NOT re-seeded');
ok(fs.readFileSync(statePath, 'utf8') === '{ this is : not json', 'corrupt state is left untouched (no silent re-baseline)');
fs.writeFileSync(statePath, goodState);                        // operator/next-good-write repairs it
const rr = check(cfg);
ok(!rr.fired, 'after repair, unchanged graph is a clean no-op (state recovered)');

// 7) atomic write leaves no .tmp residue
ok(!fs.existsSync(`${statePath}.tmp`) && !fs.existsSync(`${metricsPath}.tmp`), 'atomic writes leave no .tmp residue');

// 8) determinism + fail-open edges
ok(graphHash('abc') === graphHash('abc') && graphHash('abc') !== graphHash('abd'), 'graphHash deterministic + sensitive');
const r9 = check({ ...cfg, graphPath: path.join(dir, 'nope.json') });
ok(r9.fired === false && r9.reason === 'no-graph', 'missing graph → fail-open (no throw)');

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
