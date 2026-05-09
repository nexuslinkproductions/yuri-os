# Implementation Validator — Test & Schema Validation Framework

**Purpose:** Verify each phase implementation against specs before integration  
**Status:** Ready for OpenClaw use  
**Scope:** 6 implementation files (Phase 3-8)

---

## Schema Validation Scripts

Every `.jsonl` output must validate against corresponding schema before acceptance.

### Phase 3: evidence_packet validation
```bash
# Validate sample evidence packet
node Scripts/validate-schema.mjs \
  --schema .claude/trading-bot/schemas/evidence_packet.schema.json \
  --data .claude/trading-bot/data/evidence_packet.jsonl \
  --sample-count 10
```

**Check:**
- All required fields present
- Timestamps ISO 8601 format
- Confidence scores 0-1 range
- Source confidence decay applied correctly
- Freshness flags populated

### Phase 4: prediction_result validation
```bash
node Scripts/validate-schema.mjs \
  --schema .claude/trading-bot/schemas/prediction_result.schema.json \
  --data .claude/trading-bot/data/prediction_result.jsonl \
  --sample-count 5
```

**Check:**
- p_model: 0-1 range
- confidence: 0-1 range
- dispersion ≥ 0
- Model weights sum to 1.0
- Brier Score (if outcome available) ≤ 0.20 for APPROVE decisions

### Phase 5: risk_decision validation
```bash
node Scripts/validate-schema.mjs \
  --schema .claude/trading-bot/schemas/risk_decision.schema.json \
  --data .claude/trading-bot/data/risk_decision.jsonl \
  --sample-count 10
```

**Check:**
- Decision: APPROVE or REJECT
- gates_passed array non-empty for APPROVE
- gates_failed array populated for REJECT
- Position size ≤ 5% bankroll
- Kelly allocation reasonable (±50% of edge-based calculation)

### Phase 6: execution_event validation
```bash
node Scripts/validate-schema.mjs \
  --schema .claude/trading-bot/schemas/execution_event.schema.json \
  --data .claude/trading-bot/data/execution_event.jsonl \
  --sample-count 20
```

**Check:**
- Status: PENDING, OPEN, PARTIALLY_FILLED, FILLED, CANCELLED, FAILED, TIMEOUT
- Latency tracking: exchange_latency_ms + bot_latency_ms ≈ total_latency_ms
- Fill events: cumulative size matches total filled size
- Fees calculated correctly

### Phase 7: trade_outcome validation
```bash
node Scripts/validate-schema.mjs \
  --schema .claude/trading-bot/schemas/trade_outcome.schema.json \
  --data .claude/trading-bot/data/trade_outcome.jsonl \
  --sample-count 50
```

**Check:**
- Failure classification: A, B, C, or D (or SUCCESS)
- P&L calculation: (exit_price - entry_price) * size - fees
- Brier contribution: (predicted_prob - actual_outcome)²
- All 50+ trades classified

---

## Unit Test Templates

### Phase 3: evidence-collector.mjs
```javascript
// tests/phase-3-evidence-collector.test.mjs
import { collectEvidence, deduplicateSources, scoreConfidence } from '../Scripts/trading-bot/evidence-collector.mjs';

// Test 1: Deduplication removes cosine-similar headlines
test('deduplication: cosine >0.85 → removed', async () => {
  const sources = [
    { url: 'reuters.com/btc1', headline: 'Bitcoin reaches all-time high' },
    { url: 'coindesk.com/btc2', headline: 'Bitcoin hits record high' } // cosine ~0.90
  ];
  const deduped = deduplicateSources(sources);
  expect(deduped.length).toBe(1);
});

// Test 2: Freshness decay applied correctly
test('confidence decay: 12h old with 24h half-life → 0.5x', () => {
  const conf = scoreConfidence(source, 12); // 12 hours old
  expect(conf).toBeCloseTo(source.initial_confidence * 0.5, 2);
});

// Test 3: Consensus extraction: ≥70% agreement → bullish
test('consensus: 80% bullish → consensus_summary includes bullish', async () => {
  const result = await collectEvidence('BTC-USD', 24);
  if (result.sources.filter(s => s.sentiment === 'bullish').length >= result.sources.length * 0.7) {
    expect(result.consensus_summary).toMatch(/bullish|positive|up/i);
  }
});

// Test 4: Evidence packet schema compliance
test('output schema validation', async () => {
  const packet = await collectEvidence('ETH-USD', 24);
  const valid = validateSchema(packet, evidencePacketSchema);
  expect(valid.errors).toEqual([]);
});
```

### Phase 4: ensemble-inference.mjs
```javascript
// tests/phase-4-ensemble.test.mjs
import { aggregateProbs, calculateDispersion, assignConfidence } from '../Scripts/trading-bot/ensemble-inference.mjs';

// Test 1: Weighted average calculation
test('aggregateProbs: manual weights → correct p_model', () => {
  const probs = { grok: 0.67, claude: 0.62, gpt4o: 0.65, gemini: 0.60, deepseek: 0.64 };
  const weights = { grok: 0.20, claude: 0.25, gpt4o: 0.20, gemini: 0.15, deepseek: 0.20 };
  const { p_model } = aggregateProbs(probs, weights);
  const expected = (0.67*0.20 + 0.62*0.25 + 0.65*0.20 + 0.60*0.15 + 0.64*0.20);
  expect(p_model).toBeCloseTo(expected, 4);
});

// Test 2: Dispersion < 0.05 → high confidence
test('dispersion interpretation: 0.024 → high confidence', () => {
  const { dispersion } = aggregateProbs(narrowProbs, weights);
  expect(dispersion).toBeLessThan(0.05);
  const conf = assignConfidence(dispersion, calibrationTable);
  expect(conf).toBeGreaterThan(0.75);
});

// Test 3: Dispersion > 0.15 → low confidence
test('dispersion interpretation: 0.25 → low confidence', () => {
  const { dispersion } = aggregateProbs(wideProbs, weights);
  expect(dispersion).toBeGreaterThan(0.15);
  const conf = assignConfidence(dispersion, calibrationTable);
  expect(conf).toBeLessThan(0.70);
});

// Test 4: Calibration bucketing consistent with historical Brier
test('confidence assignment: bucket matches observed Brier', () => {
  const historicalBrier = { '0.05': 0.12, '0.10': 0.18, '0.15': 0.24 };
  // Confidence should be: 1 - (actual_brier / max_brier)
  const dispersion = 0.08; // 0.05-0.10 bucket
  const conf = assignConfidence(dispersion, calibrationTable);
  expect(conf).toBeCloseTo(0.82, 1); // Matches table
});
```

### Phase 5: risk-engine.mjs
```javascript
// tests/phase-5-risk-engine.test.mjs
import { evaluateRiskDecision, calculateKellySize, checkDrawdownHalt } from '../Scripts/trading-bot/risk-engine.mjs';

// Test 1: Kelly sizing formula
test('Kelly sizing: edge=6%, odds=2.0 → 0.5% quarter-kelly', () => {
  const size = calculateKellySize(0.06, 2.0, 100, 0.25);
  const expected = (0.06 * 2.0 - 1) / 2.0 / 4 * 100; // 0.5
  expect(size).toBeCloseTo(expected, 2);
});

// Test 2: Position capped at 5% bankroll
test('Kelly sizing: capped at 5% bankroll max', () => {
  const size = calculateKellySize(0.15, 2.0, 100, 0.25); // Would exceed 5%
  expect(size).toBeLessThanOrEqual(5); // Max 5% of $100 = $5
});

// Test 3: All 9 gates must pass for APPROVE
test('risk gates: any failure → REJECT', async () => {
  const decisionFailEdge = await evaluateRiskDecision(
    'BTC-USD',
    { ...goodPrediction, p_model: 0.51 }, // Edge too low
    marketSnapshot,
    portfolioState
  );
  expect(decisionFailEdge.decision).toBe('REJECT');
  expect(decisionFailEdge.gates_failed[0].gate).toBe('NET_EDGE');
});

// Test 4: Drawdown halt at 8%
test('drawdown halt: >8% → REJECT all new trades', async () => {
  const underwater = { ...portfolioState, current_equity: 91.50 }; // 8.5% down
  const decision = await evaluateRiskDecision(
    'ETH-USD',
    goodPrediction,
    marketSnapshot,
    underwater
  );
  expect(decision.decision).toBe('REJECT');
  expect(decision.gates_failed[0].gate).toBe('DRAWDOWN');
});

// Test 5: Daily loss halt at 15%
test('daily loss halt: >15% lost today → REJECT', async () => {
  const heavyLoss = { ...portfolioState, daily_loss_usd: 16.00 }; // 16% of $100
  const decision = await evaluateRiskDecision(
    'SOL-USD',
    goodPrediction,
    marketSnapshot,
    heavyLoss
  );
  expect(decision.decision).toBe('REJECT');
  expect(decision.gates_failed[0].gate).toBe('DAILY_LOSS');
});
```

### Phase 6: execution-engine.mjs
```javascript
// tests/phase-6-execution.test.mjs
import { calculateDeterministicClientOrderId, submitOrder } from '../Scripts/trading-bot/execution-engine.mjs';

// Test 1: Client order ID deterministic
test('deterministic client order ID: same inputs → same ID', () => {
  const id1 = calculateDeterministicClientOrderId('trade-1', 'BTC-USD', 'BUY', 0.5, 42500);
  const id2 = calculateDeterministicClientOrderId('trade-1', 'BTC-USD', 'BUY', 0.5, 42500);
  expect(id1).toBe(id2);
});

// Test 2: Different inputs → different ID
test('client order ID: different inputs → different ID', () => {
  const id1 = calculateDeterministicClientOrderId('trade-1', 'BTC-USD', 'BUY', 0.5, 42500);
  const id2 = calculateDeterministicClientOrderId('trade-1', 'BTC-USD', 'SELL', 0.5, 42500);
  expect(id1).not.toBe(id2);
});

// Test 3: Idempotent submission (mock Coinbase API)
test('idempotent submission: duplicate → returns same order', async () => {
  const order1 = await submitOrder(riskDecision, marketSnapshot);
  const order2 = await submitOrder(riskDecision, marketSnapshot);
  expect(order1.client_order_id).toBe(order2.client_order_id);
  expect(order2.status).not.toBe('DUPLICATE');
});

// Test 4: Latency tracking
test('latency tracking: total ≈ exchange + bot', async () => {
  const event = await submitOrder(riskDecision, marketSnapshot);
  const sum = event.exchange_latency_ms + event.bot_latency_ms;
  expect(Math.abs(event.total_latency_ms - sum)).toBeLessThan(100); // Allow 100ms tolerance
});
```

### Phase 7: paper-trading.mjs
```javascript
// tests/phase-7-paper-trading.test.mjs
import { classifyTradeOutcome, calculateBrierScore } from '../Scripts/trading-bot/paper-trading.mjs';

// Test 1: Failure classification Type A (prediction error)
test('failure type A: prediction wrong, execution good → A', () => {
  const outcome = classifyTradeOutcome(
    { predicted_prob: 0.70, side: 'BUY' }, // Predicted price up
    { actual_outcome: 0, filled: true }, // Price went down, order filled
    {}
  );
  expect(outcome.failure_type).toBe('A');
});

// Test 2: Failure classification Type C (execution error)
test('failure type C: prediction right, order rejected → C', () => {
  const outcome = classifyTradeOutcome(
    { predicted_prob: 0.70, side: 'BUY' },
    { actual_outcome: 1, filled: false, rejection_reason: 'INSUFFICIENT_BALANCE' }, // Order failed
    {}
  );
  expect(outcome.failure_type).toBe('C');
});

// Test 3: Brier Score calculation
test('Brier Score: 4 predictions → mean squared error', () => {
  const preds = [
    { p_model: 0.7, outcome: 1 }, // (0.7-1)² = 0.09
    { p_model: 0.3, outcome: 0 }, // (0.3-0)² = 0.09
    { p_model: 0.6, outcome: 1 }, // (0.6-1)² = 0.16
    { p_model: 0.8, outcome: 0 }  // (0.8-0)² = 0.64
  ];
  const brier = calculateBrierScore(preds);
  const expected = (0.09 + 0.09 + 0.16 + 0.64) / 4;
  expect(brier).toBeCloseTo(expected, 4);
});

// Test 4: 50+ trades requirement
test('paper trading gate: <50 trades → not ready for live', async () => {
  const report = await runPaperTradingValidation(30); // Only 30 trades
  expect(report.ready_for_live).toBe(false);
  expect(report.reason).toMatch(/50/);
});

// Test 5: Brier ≤ 0.20 gate
test('paper trading gate: Brier >0.20 → not ready for live', async () => {
  const report = await runPaperTradingValidation(50, 0.22); // Brier = 0.22
  expect(report.ready_for_live).toBe(false);
  expect(report.reason).toMatch(/Brier/);
});
```

### Phase 8: live-rollout.mjs
```javascript
// tests/phase-8-live-rollout.test.mjs
import { initKillSwitch, armKillSwitch, getKillSwitchState } from '../Scripts/trading-bot/live-rollout.mjs';

// Test 1: Kill-switch starts DISARMED
test('kill-switch: default DISARMED on startup', () => {
  const ks = initKillSwitch();
  expect(getKillSwitchState()).toBe('DISARMED');
});

// Test 2: Kill-switch arm/disarm
test('kill-switch: manual arm → ARMED', () => {
  armKillSwitch('trader@example.com');
  expect(getKillSwitchState()).toBe('ARMED');
});

// Test 3: Trades rejected if kill-switch DISARMED
test('kill-switch gate: DISARMED → reject all trades', async () => {
  disarmKillSwitch('trader@example.com');
  const result = await executeFirstTrade('trade-1');
  expect(result.rejected).toBe(true);
  expect(result.reason).toMatch(/kill-switch/i);
});

// Test 4: Stage 0 approval gate required
test('stage 0: first trade requires manual approval', async () => {
  const result = await executeFirstTrade('trade-1');
  expect(result.requires_approval).toBe(true);
});

// Test 5: Kill-switch audit logged
test('kill-switch: all arm/disarm events logged', () => {
  armKillSwitch('trader@example.com');
  const audit = readKillSwitchAudit();
  expect(audit[audit.length - 1].event).toBe('ARMED');
  expect(audit[audit.length - 1].operator).toBe('trader@example.com');
});
```

---

## Integration Tests

### End-to-end Phase 2→7
```javascript
// tests/integration-full-pipeline.test.mjs
// Mock market data → evidence → prediction → risk → execution → outcome → Brier

test('full pipeline: market data → Brier Score', async () => {
  const mockMarket = { symbol: 'BTC-USD', price: 42500, volume: 1000000 };
  
  // Phase 2: Scanner
  const candidates = await scanner.findCandidates([mockMarket]);
  expect(candidates.length).toBeGreaterThan(0);
  
  // Phase 3: Evidence
  const evidence = await evidenceCollector.collectEvidence(candidates[0].market_id);
  expect(evidence.sources.length).toBeGreaterThan(0);
  
  // Phase 4: Ensemble
  const prediction = await ensemble.runInference(candidates[0].market_id, evidence, candidates[0]);
  expect(prediction.p_model).toBeGreaterThan(0);
  
  // Phase 5: Risk
  const risk = await riskEngine.evaluateRiskDecision(candidates[0].market_id, prediction, mockMarket, portfolio);
  if (risk.decision === 'APPROVE') {
    
    // Phase 6: Execution
    const execution = await executionEngine.submitOrder(risk, mockMarket);
    expect(execution.status).toBe('OPEN');
    
    // Phase 7: Outcome
    const outcome = { actual_outcome: prediction.p_model > 0.5 ? 1 : 0 };
    const classification = papperTrading.classifyTradeOutcome({}, outcome, prediction);
    expect(classification.failure_type).toBeDefined();
  }
});
```

---

## Performance Benchmarks

Expected execution times:
- **Phase 3 (Evidence):** <30s per market (includes API calls, dedup)
- **Phase 4 (Ensemble):** <60s (5 models parallel, 30s timeout each)
- **Phase 5 (Risk):** <1s per decision (all gates deterministic)
- **Phase 6 (Execution):** <5s submission, then polling (1-1440s for fill)
- **Phase 7 (Paper Trading):** 50 trades over 5-7 days (realistic market pace)
- **Full pipeline latency (2→7):** ~100s per trade (evidence + ensemble + risk + execution)

---

## Acceptance Criteria

All implementation deliverables must pass:

✅ Schema validation (no validation errors)  
✅ Unit tests (all pass, >80% coverage)  
✅ Integration tests (full pipeline works)  
✅ Performance benchmarks (meet time targets)  
✅ Error handling (all failure modes logged, no silent failures)  
✅ Audit trails (all critical events recorded)  
✅ Kill-switch gate (DISARMED default enforced)  

---

**Ready for OpenClaw implementation & testing.**
