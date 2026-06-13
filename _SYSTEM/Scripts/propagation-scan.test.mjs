#!/usr/bin/env node
/**
 * propagation-scan.test.mjs — deterministic guard tests for the cross-reference engine V1.
 *
 * These DO NOT touch the live gitnexus index or the real _SYSTEM/state/ backlog. The structural
 * leg is injected as a stub (deps.gitnexus) and the state dir is redirected to an OS tmp dir
 * (deps.stateDir), so the tests are hermetic and assert the GUARDS, not the live graph:
 *   T1 bogus-node-id        -> fail-closed: ok=false, exit-equivalent, ZERO JSONL lines written.
 *   T2 writes-edge exclusion -> a sibling reachable ONLY via a `writes` edge is NEVER surfaced.
 *   T3 matched/surfaced      -> emits matched=N surfaced=K honestly.
 *   T4 sub-0.55 suppression  -> structural leg DOWN -> would-be sibling downgraded + suppressed,
 *                               NEVER promoted to structural confidence, zero written.
 *   T5 cooldown              -> a second scan within 24h is skipped (no write), --force overrides.
 *   T6 status=proposed       -> every written backlog record has status === 'proposed'.
 *   T7 graph-not-mutated     -> the injected graph object is unchanged after a scan.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import { propagationScan, parseImportSpecifiers } from './propagation-scan.mjs';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

function freshStateDir() {
  const dir = path.join(os.tmpdir(), `prop-scan-test-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function backlogLines(stateDir) {
  const p = path.join(stateDir, 'propagation-backlog.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim().length > 0);
}

// --- A small fixture graph modeling the llm-compat-contract dispatch family ------------------------
// source node "alpha" (import-only, file a.mjs); siblings "beta"/"gamma" share witness `sharedFn`;
// "delta" is reachable ONLY via a writes edge (must be excluded).
function fixtureGraph() {
  return {
    nodes: [
      { id: 'alpha', label: 'alpha contract', files: ['_SYSTEM/Scripts/a.mjs'] },
      { id: 'beta', label: 'beta runner', files: ['_SYSTEM/Scripts/b.mjs'] },
      { id: 'gamma', label: 'gamma dispatch', files: ['_SYSTEM/Scripts/c.mjs'] },
      { id: 'delta', label: 'delta writer', files: ['_SYSTEM/Scripts/d.mjs'] },
    ],
    edges: [],
  };
}

// Stub gitnexus modeling the real 2-hop witness walk + the writes-exclusion case:
//   - alpha's own file (a.mjs) has NO outgoing structural calls (import-only contract).
//   - hop-1: cluster query surfaces the sibling node-files b.mjs (beta) + c.mjs (gamma).
//   - hop-2: context on b.mjs + c.mjs basenames -> both emit outgoing `sharedFn` (calls) ->
//            sharedFn is the shared witness (>=2 cluster files emit it).
//   - SIBLING HARVEST: context sharedFn -> incoming beta(calls)+gamma(reads)+delta(WRITES).
//            delta is reachable ONLY via a writes edge -> MUST be excluded.
function structuralStub() {
  return (sub, target) => {
    if (sub === 'context' && target === '_SYSTEM/Scripts/a.mjs') {
      return { available: true, reason: null, json: { incoming: {}, outgoing: {} } }; // import-only
    }
    // hop-1: cluster query surfaces the sibling node-files (b.mjs, c.mjs).
    if (sub === 'query' && /alpha|contract|dispatch/.test(target)) {
      return {
        available: true,
        reason: null,
        json: { definitions: [
          { name: 'someExport', filePath: '_SYSTEM/Scripts/b.mjs' },
          { name: 'otherExport', filePath: '_SYSTEM/Scripts/c.mjs' },
        ] },
      };
    }
    // hop-2: outgoing of each cluster file's basename -> both emit `sharedFn` (calls).
    if (sub === 'context' && (target === 'b.mjs' || target === 'c.mjs')) {
      return {
        available: true,
        reason: null,
        json: { incoming: {}, outgoing: { calls: [{ name: 'sharedFn', filePath: '_SYSTEM/Scripts/bridge.mjs' }] } },
      };
    }
    // SIBLING HARVEST: callers of the witness -> beta(calls), gamma(reads), delta(WRITES — excluded).
    if (sub === 'context' && target === 'sharedFn') {
      return {
        available: true,
        reason: null,
        json: {
          incoming: {
            calls: [{ name: 'sharedFn', filePath: '_SYSTEM/Scripts/b.mjs' }],
            reads: [{ name: 'sharedFn', filePath: '_SYSTEM/Scripts/c.mjs' }],
            writes: [{ name: 'sharedFn', filePath: '_SYSTEM/Scripts/d.mjs' }], // delta — EXCLUDED
          },
        },
      };
    }
    if (sub === 'query' && target === 'sharedFn') {
      // query co-occurrence recall — beta + gamma (deduped by node), NO delta.
      return {
        available: true,
        reason: null,
        json: { definitions: [
          { name: 'sharedFn', filePath: '_SYSTEM/Scripts/b.mjs' },
          { name: 'sharedFn', filePath: '_SYSTEM/Scripts/c.mjs' },
        ] },
      };
    }
    return { available: true, reason: null, json: { definitions: [] } };
  };
}

// gitnexus DOWN stub — every call reports unavailable (graceful-degrade path).
function downStub() {
  return () => ({ available: false, reason: 'stub: structural leg down', json: null });
}

console.log('propagation-scan guard tests:\n');

// T1 — bogus node-id -> fail-closed, ZERO writes.
test('T1 bogus node-id fails closed with zero JSONL written', () => {
  const stateDir = freshStateDir();
  const res = propagationScan('this-node-does-not-exist', {
    deps: { graph: fixtureGraph(), gitnexus: structuralStub(), stateDir },
  });
  assert.equal(res.ok, false, 'ok must be false for bogus id');
  assert.equal(res.written, 0, 'zero records written');
  assert.match(res.error, /not found/i);
  assert.equal(backlogLines(stateDir).length, 0, 'no backlog file lines on fail-closed');
});

// T2 — writes-edge sibling (delta) is NEVER surfaced; beta+gamma ARE.
test('T2 writes-edge sibling excluded; calls/reads siblings surfaced', () => {
  const stateDir = freshStateDir();
  const res = propagationScan('alpha', {
    deps: { graph: fixtureGraph(), gitnexus: structuralStub(), stateDir },
  });
  assert.equal(res.ok, true);
  const ids = res.siblings.map((s) => s.nodeId).sort();
  assert.deepEqual(ids, ['beta', 'gamma'], `expected [beta,gamma], got [${ids}]`);
  assert.ok(!ids.includes('delta'), 'delta (writes-only) must be excluded');
  assert.ok(res.writesExcluded >= 1, `writesExcluded must count the delta drop (got ${res.writesExcluded})`);
});

// T3 — matched=N surfaced=K emitted, both >0 and surfaced<=matched.
test('T3 matched/surfaced emission', () => {
  const stateDir = freshStateDir();
  const res = propagationScan('alpha', {
    deps: { graph: fixtureGraph(), gitnexus: structuralStub(), stateDir },
  });
  assert.ok(Number.isInteger(res.matched) && res.matched >= 2, `matched>=2 (got ${res.matched})`);
  assert.ok(Number.isInteger(res.surfaced) && res.surfaced === 2, `surfaced===2 (got ${res.surfaced})`);
  assert.ok(res.surfaced <= res.matched, 'surfaced<=matched');
  // structural -> confidence above floor.
  for (const s of res.siblings) {
    assert.ok(s.confidence >= 0.55, `sibling conf>=0.55 (got ${s.confidence})`);
    assert.equal(s.evidenceKind, 'gitnexus-structural');
  }
});

// T4 — structural leg DOWN -> would-be sibling downgraded + suppressed, NEVER promoted, zero written.
test('T4 structural-leg-down: siblings suppressed, never promoted, zero written', () => {
  const stateDir = freshStateDir();
  const res = propagationScan('alpha', {
    deps: { graph: fixtureGraph(), gitnexus: downStub(), stateDir },
  });
  assert.equal(res.ok, true);
  assert.equal(res.structuralLegAvailable, false, 'leg must report DOWN');
  assert.equal(res.surfaced, 0, 'no sibling surfaced when leg is down (no lexical promotion)');
  assert.equal(res.written, 0, 'zero written on a down leg');
  // any record that reached grading must be lexical (downgraded), never structural.
  for (const s of res.siblings) {
    assert.notEqual(s.evidenceKind, 'gitnexus-structural', 'a down-leg hit must NOT be structural');
  }
});

// T5 — 24h cooldown: second scan within window is skipped; --force overrides.
test('T5 24h per-pattern cooldown (and --force override)', () => {
  const stateDir = freshStateDir();
  const base = Date.now();
  const first = propagationScan('alpha', {
    deps: { graph: fixtureGraph(), gitnexus: structuralStub(), stateDir },
    now: base,
  });
  assert.ok(first.written >= 1, 'first scan writes');
  const linesAfterFirst = backlogLines(stateDir).length;

  const second = propagationScan('alpha', {
    deps: { graph: fixtureGraph(), gitnexus: structuralStub(), stateDir },
    now: base + 60_000, // +1 min, well within 24h
  });
  assert.equal(second.onCooldown, true, 'second scan within 24h is on cooldown');
  assert.equal(second.written, 0, 'cooldown scan writes nothing');
  assert.equal(backlogLines(stateDir).length, linesAfterFirst, 'no new backlog lines under cooldown');

  const forced = propagationScan('alpha', {
    deps: { graph: fixtureGraph(), gitnexus: structuralStub(), stateDir },
    now: base + 120_000,
    force: true,
  });
  assert.ok(forced.written >= 1, '--force overrides cooldown and writes');
  assert.ok(backlogLines(stateDir).length > linesAfterFirst, 'forced scan appended new lines');
});

// T6 — every written backlog record has status === 'proposed'.
test('T6 every backlog record is status=proposed', () => {
  const stateDir = freshStateDir();
  const res = propagationScan('alpha', {
    deps: { graph: fixtureGraph(), gitnexus: structuralStub(), stateDir },
  });
  assert.ok(res.written >= 1);
  const lines = backlogLines(stateDir);
  assert.ok(lines.length >= 1);
  for (const l of lines) {
    const rec = JSON.parse(l);
    assert.equal(rec.status, 'proposed', `record status must be proposed (got ${rec.status})`);
    assert.equal(rec.schema, 'yuri.propagation-proposal.v0');
    assert.equal(rec.sourceNode, 'alpha');
  }
});

// T7 — the input graph object is not mutated (read-only contract).
test('T7 input graph is not mutated', () => {
  const stateDir = freshStateDir();
  const g = fixtureGraph();
  const snapshot = JSON.stringify(g);
  propagationScan('alpha', { deps: { graph: g, gitnexus: structuralStub(), stateDir } });
  assert.equal(JSON.stringify(g), snapshot, 'graph object must be byte-identical after a scan');
});

// ===============================================================================================
// XREF-02 LAUNDERING-FIX REGRESSIONS (the lexical-vs-structural firewall)
// ===============================================================================================

// --- T8 fixture: a node-mapped .md AND .json file is returned by `query <witness>` but does NOT
// appear in any `context` outgoing — it must NEVER be surfaced as a gitnexus-structural sibling.
// This proves the lexical/structural separation is ENFORCED (by the source-file + outgoing-confirm
// firewall), not corpus-incidental (the old `fileToNodes.has(path)` membership filter let these
// node-mapped prose/data files launder to 0.97 because the query hit was stamped edgeKind:'calls').
function firewallGraph() {
  return {
    nodes: [
      { id: 'src', label: 'src contract', files: ['_SYSTEM/Scripts/src.mjs'] },
      { id: 'realsib', label: 'real caller', files: ['_SYSTEM/Scripts/realcaller.mjs'] },
      // a PROSE node + a DATA node, both legitimately node-mapped (membership is incidental).
      { id: 'prosenode', label: 'prose report', files: ['_SYSTEM/reports/dispatch-notes.md'] },
      { id: 'datanode', label: 'graph data', files: ['02_RESOURCES/RESEARCH/yuri-circuitry-graph.json'] },
    ],
    edges: [],
  };
}
// witness `dispatchPrim`. The witness's INCOMING context is empty (the index dropped the incoming
// edge — the realistic shintai case), so discovery rests entirely on the query-NOMINATION leg:
//   query dispatchPrim -> realcaller.mjs (.mjs, confirmable) + dispatch-notes.md + circuitry-graph.json.
//   confirm: context realcaller.mjs outgoing EMITS dispatchPrim (calls) -> realsib is STRUCTURAL.
//            context on the .md / .json basenames emits NOTHING -> prose/data can NEVER confirm.
function firewallStub() {
  return (sub, target) => {
    // src.mjs is import-only; cluster query nominates realcaller.mjs as the family file.
    if (sub === 'context' && target === '_SYSTEM/Scripts/src.mjs') {
      return { available: true, reason: null, json: { incoming: {}, outgoing: {} } };
    }
    if (sub === 'query' && /src|contract/.test(target)) {
      return { available: true, reason: null, json: { definitions: [
        { name: 'callDispatch', filePath: '_SYSTEM/Scripts/realcaller.mjs' },
      ] } };
    }
    // hop-2: realcaller.mjs emits the shared witness `dispatchPrim`.
    if (sub === 'context' && (target === 'realcaller.mjs' || target === '_SYSTEM/Scripts/realcaller.mjs')) {
      return { available: true, reason: null, json: { incoming: {}, outgoing: {
        calls: [{ name: 'dispatchPrim', filePath: '_SYSTEM/Scripts/prim.mjs' }],
      } } };
    }
    // single-file witness recall confirmation (extractWitnesses leg) — query dispatchPrim also
    // surfaces the prose/data files (the lexical flood the firewall must reject downstream).
    if (sub === 'query' && target === 'dispatchPrim') {
      return { available: true, reason: null, json: { definitions: [
        { name: 'dispatchPrim', filePath: '_SYSTEM/Scripts/realcaller.mjs' },
        { name: 'dispatchPrim', filePath: '_SYSTEM/reports/dispatch-notes.md' },          // PROSE
        { name: 'dispatchPrim', filePath: '02_RESOURCES/RESEARCH/yuri-circuitry-graph.json' }, // DATA
      ] } };
    }
    // the witness's INCOMING context is EMPTY — the index dropped the incoming edge.
    if (sub === 'context' && target === 'dispatchPrim') {
      return { available: true, reason: null, json: { incoming: {}, outgoing: {} } };
    }
    // prose/data files have NO outgoing call edges -> cannot confirm structurally.
    if (sub === 'context' && (target === 'dispatch-notes.md' || target === 'yuri-circuitry-graph.json')) {
      return { available: true, reason: null, json: { incoming: {}, outgoing: {} } };
    }
    return { available: true, reason: null, json: { definitions: [] } };
  };
}

// T8 — REQUIRED negative fixture: a query-recall .md / .json that is NOT in context-outgoing must
// NOT surface as gitnexus-structural. The real source file (confirmed via outgoing) still does.
test('T8 query-recall .md/.json NOT in context-outgoing is NOT surfaced as structural', () => {
  const stateDir = freshStateDir();
  const res = propagationScan('src', {
    deps: { graph: firewallGraph(), gitnexus: firewallStub(), stateDir },
  });
  assert.equal(res.ok, true);
  const structuralIds = res.siblings
    .filter((s) => s.evidenceKind === 'gitnexus-structural')
    .map((s) => s.nodeId);
  // the .md prose node and the .json data node MUST NOT be structural siblings, ever.
  assert.ok(!structuralIds.includes('prosenode'), `prose .md node laundered to structural: [${structuralIds}]`);
  assert.ok(!structuralIds.includes('datanode'), `data .json node laundered to structural: [${structuralIds}]`);
  // they must not appear in the structural siblings list at ALL (not just sub-floor).
  const allSiblingIds = res.siblings.map((s) => s.nodeId);
  assert.ok(!allSiblingIds.includes('prosenode'), 'prose node must be hard-rejected from structural surface');
  assert.ok(!allSiblingIds.includes('datanode'), 'data node must be hard-rejected from structural surface');
  // the firewall must have COUNTED the rejection (proves enforcement, not corpus-incidental).
  assert.ok(res.lexicalRejected >= 2, `lexicalRejected must count the .md + .json drops (got ${res.lexicalRejected})`);
  // the real, outgoing-confirmed source caller MUST still surface as structural at HIGH confidence.
  assert.ok(structuralIds.includes('realsib'), `confirmed source caller must surface structural (got [${structuralIds}])`);
  const real = res.siblings.find((s) => s.nodeId === 'realsib');
  assert.ok(real.confidence >= 0.55, `realsib confirmed-structural conf>=0.55 (got ${real.confidence})`);
});

// --- T9 fixture: the WRITES-ONLY-VIA-QUERY-RECALL laundering path the verifier demanded (T2 cannot
// exercise it — T2's writes edge is dropped on the honest context-incoming leg by the writes-
// exclusion; the LAUNDERING was the QUERY-recall leg stamping every hit edgeKind:'calls'). Here the
// writer file reaches the sibling surface ONLY through `query <witness>` recall, never a confirmed
// call edge. Pre-fix this laundered the writes-only sibling to 0.97 structural; post-fix it must be
// rejected because its OWN OUTGOING context cannot confirm a calls/reads edge.
//
// Fixture: `caller.mjs` and `writer.mjs` are two cluster files; BOTH appear to emit `dataPrim` in
// hop-2 (so dataPrim clears the >=2-cluster-file witness bar legitimately). In SIBLING HARVEST:
//   - context dataPrim incoming -> caller.mjs(calls) [honest] + writer.mjs(writes) [honest-excluded].
//   - query  dataPrim           -> caller.mjs + writer.mjs  (the laundering recall leg).
//   - confirm: caller.mjs outgoing EMITS dataPrim(calls) -> caller is genuinely structural.
//              writer.mjs outgoing EMITS dataPrim only on a WRITE (modeled as empty calls/reads) ->
//              cannot confirm -> writer must NOT reach the structural band via the query leg.
function writesLaunderGraph() {
  return {
    nodes: [
      { id: 'origin', label: 'origin contract', files: ['_SYSTEM/Scripts/origin.mjs'] },
      { id: 'realcaller', label: 'real caller', files: ['_SYSTEM/Scripts/caller.mjs'] },
      { id: 'writeonly', label: 'writes-only', files: ['_SYSTEM/Scripts/writer.mjs'] },
    ],
    edges: [],
  };
}
function writesLaunderStub() {
  return (sub, target) => {
    if (sub === 'context' && target === '_SYSTEM/Scripts/origin.mjs') {
      return { available: true, reason: null, json: { incoming: {}, outgoing: {} } };
    }
    // cluster query nominates BOTH family files (caller.mjs + writer.mjs).
    if (sub === 'query' && /origin|contract/.test(target)) {
      return { available: true, reason: null, json: { definitions: [
        { name: 'doCall', filePath: '_SYSTEM/Scripts/caller.mjs' },
        { name: 'doWrite', filePath: '_SYSTEM/Scripts/writer.mjs' },
      ] } };
    }
    // hop-2: BOTH cluster files emit `dataPrim` outgoing (calls) -> dataPrim clears the >=2 bar and
    // becomes a legitimate shared witness. (writer.mjs emitting it here is the cluster-discovery
    // signal; the SIBLING-side confirm below is what separates a caller from a writer.)
    if (sub === 'context' && (target === 'caller.mjs' || target === '_SYSTEM/Scripts/caller.mjs')) {
      return { available: true, reason: null, json: { incoming: {}, outgoing: {
        calls: [{ name: 'dataPrim', filePath: '_SYSTEM/Scripts/prim.mjs' }],
      } } };
    }
    if (sub === 'context' && (target === 'writer.mjs' || target === '_SYSTEM/Scripts/writer.mjs')) {
      // writer's OUTGOING has NO calls/reads to dataPrim (it only WRITES it) -> cannot CONFIRM.
      return { available: true, reason: null, json: { incoming: {}, outgoing: {} } };
    }
    // SIBLING HARVEST incoming: dataPrim is CALLED by caller.mjs and WRITTEN by writer.mjs.
    if (sub === 'context' && target === 'dataPrim') {
      return { available: true, reason: null, json: { incoming: {
        calls: [{ name: 'dataPrim', filePath: '_SYSTEM/Scripts/caller.mjs' }],
        writes: [{ name: 'dataPrim', filePath: '_SYSTEM/Scripts/writer.mjs' }], // honest-excluded
      }, outgoing: {} } };
    }
    // the LAUNDERING leg: query recall surfaces BOTH caller.mjs AND writer.mjs for the witness.
    if (sub === 'query' && target === 'dataPrim') {
      return { available: true, reason: null, json: { definitions: [
        { name: 'dataPrim', filePath: '_SYSTEM/Scripts/caller.mjs' },
        { name: 'dataPrim', filePath: '_SYSTEM/Scripts/writer.mjs' }, // writes-only — must NOT launder
      ] } };
    }
    return { available: true, reason: null, json: { definitions: [] } };
  };
}

// T9 — writes-only sibling reachable via query-recall is NOT laundered to structural. The query leg
// can no longer fabricate a `calls` edge: writer's incoming edge is writes-only (honest-excluded) AND
// its candidate-outgoing cannot confirm, so it must NOT surface as a gitnexus-structural sibling. The
// genuine caller (confirmed via outgoing) DOES surface — proving the leg still recovers real edges.
test('T9 writes-only sibling via query-recall is NOT laundered to structural', () => {
  const stateDir = freshStateDir();
  const res = propagationScan('origin', {
    deps: { graph: writesLaunderGraph(), gitnexus: writesLaunderStub(), stateDir },
  });
  assert.equal(res.ok, true);
  const structuralIds = res.siblings
    .filter((s) => s.evidenceKind === 'gitnexus-structural')
    .map((s) => s.nodeId);
  // the genuine caller (outgoing-confirmed) MUST surface structural — guards against an over-broad
  // fix that simply drops the whole query leg (which would also lose shintai-style real recoveries).
  assert.ok(structuralIds.includes('realcaller'),
    `genuine outgoing-confirmed caller must still surface structural (got [${structuralIds}])`);
  // the writes-only sibling MUST NOT be a structural sibling, via ANY leg.
  assert.ok(!structuralIds.includes('writeonly'),
    `writes-only sibling laundered to structural via query-recall: [${structuralIds}]`);
  const launderedHigh = res.siblings.find(
    (s) => s.nodeId === 'writeonly' && s.confidence >= 0.55 && s.evidenceKind === 'gitnexus-structural',
  );
  assert.equal(launderedHigh, undefined, 'writeonly must never reach the structural HIGH band');
  // the writes-edge drop must be COUNTED (the honest context-incoming writes exclusion still fires).
  assert.ok(res.writesExcluded >= 1, `writesExcluded must count the writer writes-edge (got ${res.writesExcluded})`);
});

// T10 — FORK 3 anti-witness routing: a lexical look-alike mechanism is NOT laundered into the
// transfer backlog as a confident verb, and never consumes a real verb's cooldown slot.
test('T10 antiWitness mechanism -> unclassified row + guess preserved + cooldown keys on node', () => {
  const stateDir = freshStateDir();
  const res = propagationScan('alpha', {
    deps: { graph: fixtureGraph(), gitnexus: structuralStub(), stateDir },
  });
  assert.ok(res.written >= 1);
  const recs = backlogLines(stateDir).map((l) => JSON.parse(l));
  for (const rec of recs) {
    // fixture witness `sharedFn` lexically hits `shared`-prerequisite-unlock with NO structural bond.
    assert.equal(rec.mechanismAntiWitness, true, 'sharedFn sibling must be flagged antiWitness');
    assert.equal(rec.mechanismProvenance, 'lexical-only');
    assert.equal(rec.mechanismPattern, 'unclassified-mechanism', 'no confident verb in the transfer row');
    assert.equal(rec.mechanismLexicalGuess, 'shared-prerequisite-unlock', 'the guess is preserved, labelled');
  }
  const cd = JSON.parse(fs.readFileSync(path.join(stateDir, 'pattern-cooldown.json'), 'utf8'));
  assert.ok(Object.prototype.hasOwnProperty.call(cd, 'node:alpha'), `cooldown keyed on node:alpha (keys: ${Object.keys(cd)})`);
  assert.ok(!Object.keys(cd).includes('shared-prerequisite-unlock'), 'a look-alike verb must NOT hold a cooldown slot');
});

// namedStub — structuralStub generalised over the witness symbol, so a test can force a sibling that
// classifies as UNCLASSIFIED (a witness name sharing no registry verb token, file, or import edge).
function namedStub(w) {
  return (sub, target) => {
    if (sub === 'context' && target === '_SYSTEM/Scripts/a.mjs') return { available: true, reason: null, json: { incoming: {}, outgoing: {} } };
    if (sub === 'query' && /alpha|contract|dispatch/.test(target)) return { available: true, reason: null, json: { definitions: [{ name: 'someExport', filePath: '_SYSTEM/Scripts/b.mjs' }, { name: 'otherExport', filePath: '_SYSTEM/Scripts/c.mjs' }] } };
    if (sub === 'context' && (target === 'b.mjs' || target === 'c.mjs')) return { available: true, reason: null, json: { incoming: {}, outgoing: { calls: [{ name: w, filePath: '_SYSTEM/Scripts/bridge.mjs' }] } } };
    if (sub === 'context' && target === w) return { available: true, reason: null, json: { incoming: { calls: [{ name: w, filePath: '_SYSTEM/Scripts/b.mjs' }], reads: [{ name: w, filePath: '_SYSTEM/Scripts/c.mjs' }] } } };
    if (sub === 'query' && target === w) return { available: true, reason: null, json: { definitions: [{ name: w, filePath: '_SYSTEM/Scripts/b.mjs' }, { name: w, filePath: '_SYSTEM/Scripts/c.mjs' }] } };
    return { available: true, reason: null, json: { definitions: [] } };
  };
}

// T11 — red-team F1/#7: an unclassified top sibling must NOT cool down on the shared literal
// 'unclassified-mechanism' (which would make one node's scan block every other unmatched node 24h).
test('T11 unclassified top sibling cools down on the node key, not the shared literal', () => {
  const stateDir = freshStateDir();
  const res = propagationScan('alpha', { deps: { graph: fixtureGraph(), gitnexus: namedStub('plainHelper'), stateDir } });
  assert.ok(res.written >= 1);
  for (const rec of backlogLines(stateDir).map((l) => JSON.parse(l))) {
    assert.equal(rec.mechanismPattern, 'unclassified-mechanism');
    assert.equal(rec.mechanismAntiWitness, false, 'plainHelper is unclassified, not a lexical look-alike');
  }
  const cd = JSON.parse(fs.readFileSync(path.join(stateDir, 'pattern-cooldown.json'), 'utf8'));
  assert.ok(Object.prototype.hasOwnProperty.call(cd, 'node:alpha'), `must key on node:alpha (keys: ${Object.keys(cd)})`);
  assert.ok(!Object.keys(cd).includes('unclassified-mechanism'), 'the shared literal must NEVER be a cooldown key (cross-node collision)');
});

// T12 — red-team F2/#1: the import parser ignores commented/block/external/interpolated specifiers
// and still sees real static + resolvable template-literal imports.
test('T12 parseImportSpecifiers ignores commented/block/external/interpolated, keeps real + template', () => {
  const src = [
    "import { a } from './real.mjs';",
    "// import { x } from './line-commented.mjs';",
    "/* import { y } from './block-commented.mjs'; */",
    "import('./dynamic.mjs');",
    'import(`./tmpl.mjs`);',
    'import(`./${d}/interp.mjs`);',
    "import { z } from 'external-pkg';",
  ].join('\n');
  const specs = parseImportSpecifiers(src);
  assert.ok(specs.includes('./real.mjs') && specs.includes('./dynamic.mjs') && specs.includes('./tmpl.mjs'), `real/dynamic/template kept (got ${specs})`);
  assert.ok(!specs.includes('./line-commented.mjs'), 'line-commented import ignored');
  assert.ok(!specs.includes('./block-commented.mjs'), 'block-commented import ignored');
  assert.ok(!specs.some((s) => s.includes('${')), 'interpolated specifier skipped');
  assert.ok(!specs.includes('external-pkg'), 'non-local skipped');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
