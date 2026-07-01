#!/usr/bin/env node
/**
 * arch-graph-watch.mjs — the REFLEX that makes arch-graph fire on its own.
 *
 * Problem it solves: arch-graph-engine computes real structural fragility (cut-vertices /
 * bridges / sector-drift) but nothing refreshed it and nothing read it — a diagnostic you
 * had to remember to run. This wires it into the live loop:
 *
 *   1. AUTO-REFRESH  — cheap mtime+hash gate on _SYSTEM/yuri-graph-state.json; when the
 *      architecture graph actually changes, regenerate the (deterministic) metrics reference.
 *   2. AUTO-WARN     — diff the structural sets vs the last seen; when a node BECOMES an
 *      articulation point (a single-point-of-failure whose removal disconnects the system),
 *      record a nerve FINDING so the AI wakes with it (afferent digest) and can be warned
 *      mid-work via the PostToolUse hook. When it stops being one, close the finding.
 *
 * Cheap on the common path: unchanged mtime → one stat, no read, no eigensolver.
 * Deterministic, fail-open, append-only on the nerve, never mutates the graph schema.
 * Atomic state/metrics writes (tmp+rename) so a timeout-kill or concurrent run can't truncate.
 *
 * CLI:  node _SYSTEM/Scripts/arch-graph-watch.mjs check [--json]
 * Import: { check, graphHash, spofFindingTitle, loadState }
 */
import fs from 'node:fs';
import { atomicWriteFile } from './_lib/fs.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyzeArchGraph, buildMetricsPayload } from './arch-graph-engine.mjs';
import { recordEvent, closeEvent, mintEventId } from './yuri-nerve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const MAX_NODES = 600; // eigensolver is O(n^3); above this, skip (DoS / pathological-graph backstop)

const DEFAULTS = {
  graphPath: path.join(REPO, '_SYSTEM/yuri-graph-state.json'),
  metricsPath: path.join(REPO, '_SYSTEM/state/arch-graph-metrics.json'),
  statePath: path.join(REPO, '_SYSTEM/state/arch-graph-watch-state.json'),
  nerveStore: undefined, // nerve default store
};

// FNV-1a 32-bit — cheap, dependency-free content hash for the change gate.
export function graphHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// Deterministic finding title → stable nerve id (re-detect supersedes; resolve can close it).
export function spofFindingTitle(node) {
  return `ARCH-SPOF: "${node}" is an articulation point in the architecture graph — removing it disconnects the system`;
}

// Collision-proof bridge key (a node id could in theory contain any char).
const normBridge = (b) => JSON.stringify([String(b.a), String(b.b)].sort());

// Distinguish "state absent" (→ first run) from "state present but unparseable" (→ corrupt, do NOT
// misread as first run, which would silently re-baseline and orphan/miss findings).
export function loadState(p) {
  if (!fs.existsSync(p)) return { state: null, corrupt: false };
  try { return { state: JSON.parse(fs.readFileSync(p, 'utf8')), corrupt: false }; }
  catch { return { state: null, corrupt: true }; }
}

function writeAtomic(p, data) {
  atomicWriteFile(p, data); // tmp+rename consolidated into _lib/fs.mjs (random-suffix collision fix)
}

/**
 * One reflex pass. Returns a compact verdict; only does the heavy analysis when the graph changed.
 * opts: { graphPath, metricsPath, statePath, nerveStore, emit=true, stamp }
 */
export function check(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const emit = opts.emit !== false;
  const stamp = opts.stamp || null;

  if (!fs.existsSync(cfg.graphPath)) {
    return { fired: false, reason: 'no-graph', graphPath: cfg.graphPath };
  }

  const { state: prior, corrupt } = loadState(cfg.statePath);
  if (corrupt) {
    // Fail-open: leave the last-good state untouched rather than re-baselining off a truncated file.
    return { fired: false, reason: 'state-corrupt', statePath: cfg.statePath };
  }

  // Cheap pre-gate: an unchanged mtime means no change without even reading the file.
  const mtimeMs = fs.statSync(cfg.graphPath).mtimeMs;
  if (prior && prior.graphMtimeMs === mtimeMs) {
    return { fired: false, reason: 'unchanged-mtime' };
  }

  // mtime advanced (or first run) → authoritative content hash (touch without edit → identical hash).
  const text = fs.readFileSync(cfg.graphPath, 'utf8');
  const hash = graphHash(text);

  if (prior && prior.graphHash === hash) {
    // Content identical despite the mtime touch → just refresh the stored mtime so the next call short-circuits.
    writeAtomic(cfg.statePath, JSON.stringify({ ...prior, graphMtimeMs: mtimeMs }, null, 2));
    return { fired: false, reason: 'unchanged-hash' };
  }

  let graph;
  try { graph = JSON.parse(text); } catch (e) { return { fired: false, reason: 'graph-unparseable', error: e.message }; }
  if (!graph || !Array.isArray(graph.nodes)) return { fired: false, reason: 'graph-malformed' };
  if (graph.nodes.length > MAX_NODES) {
    return { fired: false, reason: 'graph-too-large', nodes: graph.nodes.length, cap: MAX_NODES };
  }

  let report;
  try { report = analyzeArchGraph(graph); }
  catch (e) { return { fired: false, reason: 'analyze-failed', error: e.message }; }

  // 1) AUTO-REFRESH the deterministic golden metrics (atomic).
  writeAtomic(cfg.metricsPath, JSON.stringify(buildMetricsPayload(report), null, 2));

  const curAP = report.articulationPoints.map(String);
  const curBR = report.bridges.map(normBridge);
  const curDIS = (report.diff || []).filter((d) => d.verdict === 'DISAGREE').map((d) => String(d.node));

  const writeState = () => writeAtomic(cfg.statePath, JSON.stringify({
    graphHash: hash, graphMtimeMs: mtimeMs,
    articulationPoints: curAP, bridges: curBR, disagreements: curDIS, summary: report.summary,
  }, null, 2));

  // First run → establish a baseline silently; only CHANGES after this warn (no first-run spam).
  if (!prior) {
    writeState();
    return { fired: true, seeded: true, hash, articulationPoints: curAP.length, bridges: curBR.length, disagreements: curDIS.length };
  }

  const priorAP = new Set(prior.articulationPoints || []);
  const priorBR = new Set(prior.bridges || []);
  const curAPset = new Set(curAP);
  const curBRset = new Set(curBR);

  const newAP = curAP.filter((n) => !priorAP.has(n));
  const resolvedAP = [...priorAP].filter((n) => !curAPset.has(n));
  const newBR = curBR.filter((e) => !priorBR.has(e));
  const resolvedBR = [...priorBR].filter((e) => !curBRset.has(e));

  // 2) AUTO-WARN via the nerve — individual findings for cut-vertices (the sharpest SPOF signal).
  // Each emit is isolated: one bad event must not abort the loop or leave the state hash un-advanced
  // (findings are content-hash idempotent, so a retried emit supersedes rather than duplicates).
  if (emit) {
    for (const node of newAP) {
      try {
        recordEvent({
          kind: 'finding',
          title: spofFindingTitle(node),
          weight: 0.7,
          risk: 0.6,
          halfLife: 21,
          evidence: [{ base: 1, age: 0, halfLife: 21 }],
          refs: ['_SYSTEM/Scripts/arch-graph-watch.mjs', '_SYSTEM/state/arch-graph-metrics.json'],
          nextCandidateAction: `add a redundant path or decouple "${node}" so it is not the sole cut-vertex`,
          closureCondition: `"${node}" is no longer an articulation point in yuri-graph-state.json`,
          stamp,
        }, { store: cfg.nerveStore });
      } catch { /* isolate: keep processing + still advance state below */ }
    }
    for (const node of resolvedAP) {
      try {
        closeEvent(mintEventId({ kind: 'finding', title: spofFindingTitle(node) }), {
          kind: 'finding', title: `${spofFindingTitle(node)} — RESOLVED (no longer a cut-vertex)`, stamp, store: cfg.nerveStore,
        });
      } catch { /* isolate */ }
    }
  }

  writeState();
  return {
    fired: true,
    hash,
    newArticulation: newAP,
    resolvedArticulation: resolvedAP,
    newBridges: newBR,
    resolvedBridges: resolvedBR,
    counts: { articulationPoints: curAP.length, bridges: curBR.length, disagreements: curDIS.length },
  };
}

// ---- CLI --------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const json = process.argv.includes('--json');
  const r = check({ stamp: new Date().toISOString() });
  if (json) { process.stdout.write(JSON.stringify(r) + '\n'); }
  else if (!r.fired) { process.stdout.write(`arch-graph-watch: ${r.reason} (no structural change)\n`); }
  else if (r.seeded) { process.stdout.write(`arch-graph-watch: baseline seeded — AP=${r.articulationPoints} bridges=${r.bridges}\n`); }
  else {
    const bits = [];
    if (r.newArticulation.length) bits.push(`NEW SPOF: ${r.newArticulation.join(', ')}`);
    if (r.resolvedArticulation.length) bits.push(`resolved: ${r.resolvedArticulation.join(', ')}`);
    if (r.newBridges.length) bits.push(`+${r.newBridges.length} bridge(s)`);
    process.stdout.write(`arch-graph-watch: graph changed — ${bits.length ? bits.join(' | ') : 'no new cut-vertices'}\n`);
  }
  process.exit(0);
}
