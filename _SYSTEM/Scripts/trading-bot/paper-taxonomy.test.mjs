#!/usr/bin/env node
import assert from 'node:assert/strict';
import { classifyFailureDecisionTree } from './paper-trading.mjs';

const result = classifyFailureDecisionTree(
  { tradeStatus: 'LOSS', priceChangePct: -0.01, directionCorrect: false, actualOutcome: 0, netPnl: -1, exitTime: new Date().toISOString() },
  { status: 'FILLED', slippage_bps: 5, order_type: 'LIMIT' },
  { p_model: 0.8, market_question_quality: 'ambiguous', framing_issue: 'Resolution source differs from modeled market.' },
);

assert.equal(result.primary_type, 'E');
assert.match(result.classification_rationale, /framing/i);
assert.equal(result.type_e_detail.prevention_rule.includes('Restate the exact market question'), true);

console.log('paper-taxonomy.test: ok');
