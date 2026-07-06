// _SYSTEM/Scripts/mcs-fold-order-commutativity.test.mjs
// Permanent regression for the canonical fold's FOUNDATION property: settled truth + conflict-detection
// commute under any drain order. Born from the commutativity sim catching a real retract non-commutativity
// (2026-06-14): retract was an unconditional key-delete -> drain-order-dependent. Fixed via retract-by-target
// dead-marking + survivor re-election. This locks it. No leases needed (pure fold over the reference mirror,
// which mcs-fold-mutation-sweep.test anti-drift-anchors to the real store).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenarios, runCommutativity } from './mcs-fold-order-commutativity.mjs';

test('FOUNDATION: settled truth + conflict-detection commute under any drain order (every scenario)', () => {
  for (const sc of scenarios) {
    const r = runCommutativity(sc, 300);
    assert.equal(r.contestedKeysStable, true, `conflict-detection order-invariant for "${sc.name}"`);
    assert.equal(r.nonContestedStable, true, `settled-truth order-invariant for "${sc.name}"`);
  }
});

test('retract-then-reassert is order-invariant (the bug the sim caught is fixed)', () => {
  const sc = scenarios.find((s) => s.name === 'retract then reassert');
  const r = runCommutativity(sc, 300);
  assert.equal(r.contestedKeysStable, true);
  assert.equal(r.nonContestedStable, true);
});

test('the ONLY order-dependent surface is the bare winner of a CONTESTED key (contained + flagged)', () => {
  // documents the boundary: an unresolved conflict has a drain-order-dependent bare winner — contained by the
  // contested flag, and the exact motivation for an order-INVARIANT advisory resolver (the next memory rung).
  const sc = scenarios.find((s) => s.name === 'two-lane conflict (no supersede)');
  const r = runCommutativity(sc, 300);
  assert.equal(r.contestedKeysStable, true, 'the conflict is reliably detected regardless of order');
  assert.equal(r.contestedWinnerOrderDependent, true, 'its bare winner is order-dependent -> motivates the resolver');
});
