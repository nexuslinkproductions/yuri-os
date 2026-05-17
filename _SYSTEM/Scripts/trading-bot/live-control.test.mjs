#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  armKillSwitch,
  disarmKillSwitch,
  getKillSwitchState,
  manualApproveTrade,
} from './live-rollout.mjs';

disarmKillSwitch('test');
assert.equal(getKillSwitchState(), 'DISARMED');

const rejected = manualApproveTrade({
  tradeId: 'test-trade',
  marketId: 'BTC-USD',
  riskDecision: { decision: 'APPROVE', open_positions: 0, total_exposure_ratio: 0 },
  operator: 'test',
  brierScore: 0.1,
  marketConditions: { snapshot_age_ms: 0 },
});
assert.equal(rejected.approved, false);

armKillSwitch('test');
const approved = manualApproveTrade({
  tradeId: 'test-trade',
  marketId: 'BTC-USD',
  riskDecision: { decision: 'APPROVE', open_positions: 0, total_exposure_ratio: 0 },
  operator: 'test',
  brierScore: 0.1,
  marketConditions: { snapshot_age_ms: 0 },
});
assert.equal(approved.approved, true);

disarmKillSwitch('test');
console.log('live-control.test: ok');
