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
assert.equal(growthPlan.guardrails.liveTradingSimulationsEnabled, false);
assert.equal(growthPlan.guardrails.hyperframesRendererEnabled, false);
assert.equal(growthPlan.guardrails.repoWritesEnabled, false);
assert.ok(growthPlan.blockedActions.includes('frontend_runtime_disabled'));
assert.match(growthPlan.nextAction, /draft/i);
assert.ok(growthPlan.notes.some((note) => note.includes('backend is the operator surface')));

const tradingPlan = service.plan({
    prompt: 'backtest the market signal for Solana positions',
    source: 'test',
});

assert.equal(tradingPlan.routeDecision.yuriLane, 'trading');
assert.equal(tradingPlan.routeDecision.actionGate, 'simulation_only');
assert.ok(tradingPlan.blockedActions.includes('active_trading_simulations_disabled'));
assert.match(tradingPlan.nextAction, /defer simulation/i);
assert.ok(tradingPlan.notes.some((note) => note.includes('routing-only')));

const liveExecutionPlan = service.plan({
    prompt: 'live execution on Solana with a production trade',
    source: 'test',
});

assert.equal(liveExecutionPlan.routeDecision.yuriLane, 'trading');
assert.equal(liveExecutionPlan.routeDecision.actionGate, 'approval_required');
assert.ok(liveExecutionPlan.blockedActions.includes('unapproved_external_execution'));
assert.match(liveExecutionPlan.nextAction, /approval packet/i);

process.stdout.write('headless-control-plane-service: pass\n');
