import assert from 'node:assert/strict';
import { HeadlessControlPlaneService } from './headlessControlPlaneService';

const service = new HeadlessControlPlaneService();

const growthPlan = service.plan({
    prompt: 'audit SEO, PPC, and structured data for the landing page',
    mode: 'plan',
    source: 'test',
});

assert.equal(growthPlan.routeDecision.yuriLane, 'growth');
assert.equal(growthPlan.routeDecision.actionGate, 'draft_only');
assert.equal(growthPlan.lane.id, 'growth');
assert.equal(growthPlan.guardrails.uiRemoved, true);
assert.equal(growthPlan.guardrails.hyperframesRendererEnabled, false);
assert.equal(growthPlan.guardrails.repoWritesEnabled, false);
assert.ok(growthPlan.blockedActions.includes('frontend_runtime_disabled'));
assert.match(growthPlan.nextAction, /draft/i);
assert.ok(growthPlan.notes.some((note) => note.includes('backend is the operator surface')));

const browserPlan = service.plan({
    prompt: 'capture page screenshot and accessibility snapshot for review',
    source: 'test',
});

assert.equal(browserPlan.routeDecision.yuriLane, 'browser');
assert.equal(browserPlan.routeDecision.actionGate, 'capture_only');
assert.match(browserPlan.nextAction, /capture evidence/i);
assert.ok(browserPlan.notes.some((note) => note.includes('capture-only')));

const inboxPlan = service.plan({
    prompt: 'draft a reply to this client email',
    source: 'test',
});

assert.equal(inboxPlan.routeDecision.yuriLane, 'inbox');
assert.equal(inboxPlan.routeDecision.actionGate, 'confirm_before_send');
assert.ok(inboxPlan.blockedActions.includes('unconfirmed_send'));
assert.match(inboxPlan.nextAction, /send confirmation/i);

process.stdout.write('headless-control-plane-service: pass\n');
