#!/usr/bin/env node
import { seedCanonical, projectFlow, projectMechanism, verifyLossless } from './yuri-graph-unify.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };

// seed from the live views → canonical is a lossless union
const canon = seedCanonical();
ok(canon.schema === 'yuri.unified-graph.v0', 'canonical has the unified schema');
ok(canon.nodes.length > 200, `canonical unions both graphs (${canon.nodes.length} nodes)`);
ok(canon.nodes.some((n) => n.tiers.length > 1), 'some nodes are multi-tier (flow ∩ mechanism)');
ok(canon.nodes.every((n) => Array.isArray(n.tiers) && n.tiers.length >= 1), 'every node has at least one tier');

// THE guarantee: projection reproduces the original views byte-for-byte (fields + edge counts)
const v = verifyLossless(canon);
ok(v.lossless === true, `projection is LOSSLESS${v.lossless ? '' : ' — ' + v.issues.slice(0, 3).join('; ')}`);

// projection is deterministic
ok(JSON.stringify(projectFlow(canon)) === JSON.stringify(projectFlow(canon)), 'projectFlow deterministic');
ok(JSON.stringify(projectMechanism(canon)) === JSON.stringify(projectMechanism(canon)), 'projectMechanism deterministic');

// every projected node belongs to the right view tier
const flow = projectFlow(canon); const mech = projectMechanism(canon);
ok(flow.nodes.every((n) => canon.nodes.find((c) => c.id === n.id).tiers.includes('flow')), 'flow view only has flow-tier nodes');
ok(mech.nodes.every((n) => canon.nodes.find((c) => c.id === n.id).tiers.includes('mechanism')), 'mechanism view only has mechanism-tier nodes');
ok(flow.nodes.length + mech.nodes.length - canon.nodes.filter((n) => n.tiers.length > 1).length === canon.nodes.length,
  'flow + mechanism − shared = canonical (no node lost or duplicated)');

// a node ADDED to the canonical lands in the right projected view (the new workflow)
const withNew = { ...canon, nodes: [...canon.nodes, { id: 'test-new-mech', tiers: ['mechanism'], mechanism: { label: 'x', layer: 'Test', files: ['x.mjs'] } }], mechOrder: [...canon.mechOrder, 'test-new-mech'] };
ok(projectMechanism(withNew).nodes.some((n) => n.id === 'test-new-mech'), 'a node added to the canonical appears in the mechanism projection');
ok(!projectFlow(withNew).nodes.some((n) => n.id === 'test-new-mech'), 'a mechanism-only node does NOT leak into the flow view');

// the generated marker is present (warns against hand-editing the projection)
ok(typeof flow._generated === 'string' && flow._generated.includes('canonical'), 'projections carry the do-not-hand-edit marker');

console.log(`\nyuri-graph-unify.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
