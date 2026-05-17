#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildGraphPlan,
  buildNormalizedIntent,
  validateGraphPlan,
  validateNormalizedIntent,
} from './yuri-control-plane-schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const normalizedSchema = readJson(path.join(__dirname, 'schemas', 'normalized-intent.schema.json'));
const graphSchema = readJson(path.join(__dirname, 'schemas', 'graph-plan.schema.json'));

assert.equal(normalizedSchema.properties.intent_version.const, 'yuri.control-plane.v1', 'normalized intent schema version mismatch');
assert.equal(graphSchema.properties.graph_version.const, 'yuri.control-plane.v1', 'graph plan schema version mismatch');
assert.ok(normalizedSchema.required.includes('artifact_policy'), 'normalized intent schema must require artifact_policy');
assert.ok(graphSchema.required.includes('nodes'), 'graph plan schema must require nodes');

const routePlan = {
  scenario: 'control-plane-orchestration',
  lane: 'swarm',
};
const intent = buildNormalizedIntent({
  prompt: 'brain dump to durable orchestration control plane with probability and risk acceptance',
  mode: 'dry-run',
  routePlan,
  artifactRoot: '/tmp/yuri-control-plane-schema-test',
  runDir: '/tmp/yuri-control-plane-schema-test/run',
});
assert.equal(validateNormalizedIntent(intent).ok, true, 'generated normalized intent should validate');
assert.ok(intent.probabilistic_decision, 'uncertainty prompt should include probabilistic decision lens');
assert.equal(intent.mutation_policy.default_mutation, false, 'intent must stay non-mutating by default');

const graphPlan = buildGraphPlan({ normalizedIntent: intent, routePlan });
assert.equal(validateGraphPlan(graphPlan).ok, true, 'generated graph plan should validate');
assert.ok(graphPlan.nodes.some((node) => node.kind === 'promote'), 'graph plan should include promote node');
assert.equal(graphPlan.canonical_state_policy.raw_output_may_enter_memory, false, 'raw output must not enter memory');
assert.deepEqual(graphPlan.observability.events, ['GRAPH_COMPILED', 'NODE_DISPATCHED', 'NODE_VERIFIED', 'PROMOTION_DECISION'], 'control-plane events mismatch');

const missingVerifier = structuredClone(graphPlan);
delete missingVerifier.nodes[0].verifier;
assert.equal(validateGraphPlan(missingVerifier).ok, false, 'missing verifier should be rejected');
assert(validateGraphPlan(missingVerifier).issues.some((issue) => issue.includes('verifier')), 'missing verifier issue should be explicit');

const missingArtifactPolicy = structuredClone(graphPlan);
delete missingArtifactPolicy.artifact_policy;
assert.equal(validateGraphPlan(missingArtifactPolicy).ok, false, 'missing artifact_policy should be rejected');
assert(validateGraphPlan(missingArtifactPolicy).issues.some((issue) => issue.includes('artifact_policy')), 'missing artifact_policy issue should be explicit');

const unsafeMutation = structuredClone(graphPlan);
unsafeMutation.nodes[3].permission_tier = 'tier1_mutation';
unsafeMutation.nodes[3].gitnexus_gate.impact_required = false;
assert.equal(validateGraphPlan(unsafeMutation).ok, false, 'tier1 mutation without GitNexus gate should be rejected');
assert(validateGraphPlan(unsafeMutation).issues.some((issue) => issue.includes('gitnexus impact gate')), 'GitNexus gate issue should be explicit');

const unsafePromotion = structuredClone(graphPlan);
const promoteNode = unsafePromotion.nodes.find((node) => node.kind === 'promote');
promoteNode.promotion_gate.requires_verification = false;
assert.equal(validateGraphPlan(unsafePromotion).ok, false, 'promotion without verification should be rejected');
assert(validateGraphPlan(unsafePromotion).issues.some((issue) => issue.includes('promotion requires verification')), 'promotion gate issue should be explicit');

const brokenDependency = structuredClone(graphPlan);
brokenDependency.nodes[1].dependencies = ['missing-node'];
assert.equal(validateGraphPlan(brokenDependency).ok, false, 'unknown dependency should be rejected');

process.stdout.write('yuri-control-plane-schema: pass\n');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
