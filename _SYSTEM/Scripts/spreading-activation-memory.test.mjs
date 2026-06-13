// Tests for YURI Roadmap Organ 1 — Spreading-Activation Memory.
// All fixtures are deterministic in-memory constructions; no filesystem access.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGraph, addNode, addEdge, hebbianCoRecall, decayWeights,
  recall, toJSON, fromJSON,
} from './spreading-activation-memory.mjs';

describe('spreading-activation-memory', () => {

  // 1. Hub centrality: star graph A-B, A-C, A-D → recall from B ranks A above C, D.
  it('hub centrality: star graph ranks hub above leaves', () => {
    const g = createGraph();
    for (const id of ['A', 'B', 'C', 'D']) addNode(g, id);
    addEdge(g, 'A', 'B', 1);
    addEdge(g, 'A', 'C', 1);
    addEdge(g, 'A', 'D', 1);

    const r = recall(g, ['B']);
    const rank = new Map(r.map(x => [x.id, x.activation]));
    assert.ok(rank.has('A'), 'hub A appears in results');
    assert.ok(rank.get('A') > rank.get('C'), 'hub A > leaf C');
    assert.ok(rank.get('A') > rank.get('D'), 'hub A > leaf D');
  });

  // 2. Hebbian: co-recalling (X,Y) 5 times makes Y outrank Z from seed X.
  it('Hebbian: co-recalling (X,Y) 5× makes Y outrank Z from seed X', () => {
    const g = createGraph();
    for (const id of ['X', 'Y', 'Z']) addNode(g, id);
    addEdge(g, 'X', 'Y', 1);
    addEdge(g, 'X', 'Z', 1);

    // Confirm roughly equal before Hebbian
    const before = recall(g, ['X']);
    const bR = new Map(before.map(x => [x.id, x.activation]));
    assert.ok(Math.abs(bR.get('Y') - bR.get('Z')) < 1e-10, 'initial Y ≈ Z');

    // 5× co-recall of (X, Y)
    for (let i = 0; i < 5; i++) hebbianCoRecall(g, ['X', 'Y'], 1, 1000);

    const after = recall(g, ['X']);
    const aR = new Map(after.map(x => [x.id, x.activation]));
    assert.ok(aR.get('Y') > aR.get('Z'), 'Y outranks Z after Hebbian');
  });

  // 3. Damping: lower damping concentrates activation on seeds (seed share strictly higher).
  it('damping: lower damping → higher seed activation share', () => {
    const g = createGraph();
    for (const id of ['A', 'B', 'C', 'D']) addNode(g, id);
    addEdge(g, 'A', 'B', 1);
    addEdge(g, 'A', 'C', 1);
    addEdge(g, 'A', 'D', 1);

    const seed = 'B';
    const hiD = recall(g, [seed], { damping: 0.95 });
    const loD = recall(g, [seed], { damping: 0.5 });

    const share = (res, id) => {
      const total = res.reduce((s, r) => s + r.activation, 0);
      return res.find(r => r.id === id).activation / total;
    };

    assert.ok(
      share(loD, seed) > share(hiD, seed),
      'seed share strictly higher at damping 0.5 vs 0.95',
    );
  });

  // 4. Decay: after decayWeights with halfLife elapsed once, every weight halves (±1e-9).
  it('decay: one halfLife halves every weight (±1e-9)', () => {
    const g = createGraph();
    addNode(g, 'A'); addNode(g, 'B'); addNode(g, 'C');
    addEdge(g, 'A', 'B', 8);
    addEdge(g, 'B', 'C', 4);
    for (const e of g.edges.values()) e.lastReinforcedMs = 1000;

    const hl = 5000;
    decayWeights(g, 1000 + hl, hl);

    const ws = [...g.edges.values()].map(e => e.w);
    assert.ok(Math.abs(ws[0] - 4) < 1e-9, `expected ≈4, got ${ws[0]}`);
    assert.ok(Math.abs(ws[1] - 2) < 1e-9, `expected ≈2, got ${ws[1]}`);
  });

  // 5. toJSON/fromJSON: recall results identical before and after round-trip.
  it('toJSON/fromJSON: recall results identical after round-trip', () => {
    const g = createGraph();
    for (const id of ['A', 'B', 'C', 'D']) addNode(g, id, { useCount: 3 });
    addEdge(g, 'A', 'B', 1.5);
    addEdge(g, 'A', 'C', 2);
    addEdge(g, 'B', 'D', 0.5);

    const before = recall(g, ['B']);
    const g2 = fromJSON(toJSON(g));
    const after = recall(g2, ['B']);

    assert.deepEqual(before, after);
  });

  // 6. Dangling (isolated) node does not produce NaN and totals stay finite.
  it('dangling node: no NaN, totals stay finite', () => {
    const g = createGraph();
    addNode(g, 'A'); addNode(g, 'B'); addNode(g, 'C'); // C is isolated
    addEdge(g, 'A', 'B', 1);

    const r = recall(g, ['A']);
    for (const { id, activation } of r) {
      assert.ok(Number.isFinite(activation), `${id}: finite`);
      assert.ok(!Number.isNaN(activation), `${id}: not NaN`);
    }
    const total = r.reduce((s, x) => s + x.activation, 0);
    assert.ok(Number.isFinite(total) && total > 0, 'total finite and positive');
  });

});
