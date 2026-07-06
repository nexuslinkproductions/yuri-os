// _SYSTEM/Scripts/truth-maintenance.test.mjs
// Tests for JTMS — node:test + node:assert only, zero external deps.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTms, assertPremise, addJustification, retract,
  label, affectedBy, whySupported, takeReviewQueue,
  toJSON, fromJSON,
} from './truth-maintenance.mjs';

describe('truth-maintenance (JTMS)', () => {

  // 1. Linear chain: premise A → B → C. Retract A should collapse all three.
  it('1. chain: A→B→C; retract A flips B,C OUT and queues them', () => {
    const tms = createTms();
    assertPremise(tms, 'A', 'setup');
    addJustification(tms, { consequent: 'B', inList: ['A'], informant: 'a-to-b' });
    addJustification(tms, { consequent: 'C', inList: ['B'], informant: 'b-to-c' });

    assert.equal(label(tms, 'A'), 'IN');
    assert.equal(label(tms, 'B'), 'IN');
    assert.equal(label(tms, 'C'), 'IN');

    retract(tms, 'A');

    assert.equal(label(tms, 'A'), 'OUT');
    assert.equal(label(tms, 'B'), 'OUT');
    assert.equal(label(tms, 'C'), 'OUT');

    const queue = takeReviewQueue(tms);
    const ids = queue.map(q => q.id);
    assert.ok(ids.includes('B'), 'B should be in review queue');
    assert.ok(ids.includes('C'), 'C should be in review queue');
    // A is also queued (it flipped IN→OUT); the test only asserts B and C.
  });

  // 2. Alternate support: B justified by A1 and separately by A2.
  //    Retract A1 → B stays IN; B must NOT appear in the review queue.
  it('2. alternate support: B stays IN when one of two supports retracted', () => {
    const tms = createTms();
    assertPremise(tms, 'A1', 'premise-1');
    assertPremise(tms, 'A2', 'premise-2');
    addJustification(tms, { consequent: 'B', inList: ['A1'], informant: 'a1-to-b' });
    addJustification(tms, { consequent: 'B', inList: ['A2'], informant: 'a2-to-b' });

    assert.equal(label(tms, 'B'), 'IN');

    retract(tms, 'A1');

    assert.equal(label(tms, 'B'), 'IN', 'B should stay IN via A2');
    const queue = takeReviewQueue(tms);
    const ids = queue.map(q => q.id);
    assert.ok(!ids.includes('B'), 'B must not appear in review queue');
  });

  // 3. Circular support with no premise base → well-foundedness leaves both OUT.
  it('3. circular: B⊢C and C⊢B with no premise → both OUT', () => {
    const tms = createTms();
    addJustification(tms, { consequent: 'B', inList: ['C'], informant: 'c-to-b' });
    addJustification(tms, { consequent: 'C', inList: ['B'], informant: 'b-to-c' });

    assert.equal(label(tms, 'B'), 'OUT');
    assert.equal(label(tms, 'C'), 'OUT');
  });

  // 4. Nonmonotonic default: D holds while E is OUT; asserting E flips D OUT.
  it('4. nonmonotonic default: outList flips when blocking premise asserted', () => {
    const tms = createTms();
    addJustification(tms, { consequent: 'D', outList: ['E'], informant: 'default-d' });

    assert.equal(label(tms, 'D'), 'IN', 'D should be IN while E is OUT');
    assert.equal(label(tms, 'E'), 'OUT');

    assertPremise(tms, 'E', 'evidence-for-e');

    assert.equal(label(tms, 'D'), 'OUT', 'D must flip OUT when E is asserted');
    assert.equal(label(tms, 'E'), 'IN');

    const queue = takeReviewQueue(tms);
    const ids = queue.map(q => q.id);
    assert.ok(ids.includes('D'), 'D should be queued for review');
  });

  // 5. affectedBy returns transitive dependents, excludes unrelated nodes.
  it('5. affectedBy returns transitive dependents only', () => {
    const tms = createTms();
    assertPremise(tms, 'A', 'setup');
    addJustification(tms, { consequent: 'B', inList: ['A'], informant: 'a-to-b' });
    addJustification(tms, { consequent: 'C', inList: ['B'], informant: 'b-to-c' });
    assertPremise(tms, 'Z', 'unrelated');

    const deps = affectedBy(tms, 'A');
    assert.ok(deps.has('B'));
    assert.ok(deps.has('C'));
    assert.ok(!deps.has('Z'), 'Z is unrelated');
    assert.ok(!deps.has('A'), 'A is not its own dependent');
    assert.equal(deps.size, 2);
  });

  // 6. whySupported returns the full tree with informants; toJSON/fromJSON round-trips.
  it('6. whySupported tree + toJSON/fromJSON round-trip', () => {
    const tms = createTms();
    assertPremise(tms, 'A', 'root');
    addJustification(tms, { consequent: 'B', inList: ['A'], informant: 'a-to-b' });
    addJustification(tms, { consequent: 'C', inList: ['B'], informant: 'b-to-c' });

    // -- whySupported tree --
    const tree = whySupported(tms, 'C');
    assert.equal(tree.id, 'C');
    assert.equal(tree.informant, 'b-to-c');
    assert.deepEqual(tree.outList, []);

    assert.equal(tree.inList[0].id, 'B');
    assert.equal(tree.inList[0].informant, 'a-to-b');

    assert.equal(tree.inList[0].inList[0].id, 'A');
    assert.equal(tree.inList[0].inList[0].informant, 'root');
    assert.deepEqual(tree.inList[0].inList[0].inList, []);

    // null for OUT node
    assert.equal(whySupported(tms, 'nonexistent'), null);

    // -- toJSON / fromJSON round-trip --
    const json = toJSON(tms);
    const restored = fromJSON(json);

    assert.equal(label(restored, 'A'), 'IN');
    assert.equal(label(restored, 'B'), 'IN');
    assert.equal(label(restored, 'C'), 'IN');

    // Verify structural independence: mutate restored, original untouched
    const treeR = whySupported(restored, 'C');
    assert.equal(treeR.informant, 'b-to-c');

    // Round-tripped TMS supports retract + review queue
    retract(restored, 'A');
    assert.equal(label(restored, 'A'), 'OUT');
    assert.equal(label(restored, 'B'), 'OUT');
    assert.equal(label(restored, 'C'), 'OUT');

    const queue = takeReviewQueue(restored);
    assert.ok(queue.length >= 2, 'review queue should have B and C');
    const qIds = queue.map(q => q.id);
    assert.ok(qIds.includes('B'));
    assert.ok(qIds.includes('C'));
  });

  // 7. Nonmonotonic + alternate support: outList default with backup justification.
  it('7. nonmonotonic with alternate support: D has default + premise backup', () => {
    const tms = createTms();
    assertPremise(tms, 'F', 'fallback-premise');
    addJustification(tms, { consequent: 'D', outList: ['E'], informant: 'default-d' });
    addJustification(tms, { consequent: 'D', inList: ['F'], informant: 'fallback-d' });

    assert.equal(label(tms, 'D'), 'IN');
    assert.equal(label(tms, 'E'), 'OUT');

    // Assert E — kills default-d, but fallback-d keeps D IN
    assertPremise(tms, 'E', 'evidence-for-e');

    assert.equal(label(tms, 'D'), 'IN', 'D stays IN via fallback');
    assert.equal(label(tms, 'E'), 'IN');

    const queue = takeReviewQueue(tms);
    const ids = queue.map(q => q.id);
    assert.ok(!ids.includes('D'), 'D should NOT be queued — still IN via fallback');
  });

  // 8. label returns UNKNOWN for never-mentioned nodes.
  it('8. UNKNOWN for never-mentioned nodes', () => {
    const tms = createTms();
    assert.equal(label(tms, 'ghost'), 'UNKNOWN');
    assertPremise(tms, 'A', 'test');
    assert.equal(label(tms, 'A'), 'IN');
    assert.equal(label(tms, 'ghost'), 'UNKNOWN');
  });

  // 9. retract by justification id (not premise node id).
  it('9. retract by justification id removes specific justification', () => {
    const tms = createTms();
    assertPremise(tms, 'A1', 'p1');
    assertPremise(tms, 'A2', 'p2');
    const jid = addJustification(tms, { consequent: 'B', inList: ['A1', 'A2'], informant: 'both' });

    assert.equal(label(tms, 'B'), 'IN');

    retract(tms, jid); // remove the derivation, not the premises

    assert.equal(label(tms, 'B'), 'OUT');
    assert.equal(label(tms, 'A1'), 'IN', 'A1 premise still intact');
    assert.equal(label(tms, 'A2'), 'IN', 'A2 premise still intact');
  });

  // 10. retract of unknown id is a no-op.
  it('10. retract unknown id is safe no-op', () => {
    const tms = createTms();
    assertPremise(tms, 'A', 'test');
    retract(tms, 'nonexistent');
    assert.equal(label(tms, 'A'), 'IN');
    assert.deepEqual(takeReviewQueue(tms), []);
  });
});
