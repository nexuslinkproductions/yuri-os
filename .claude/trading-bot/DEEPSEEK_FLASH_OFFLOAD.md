# DeepSeek Flash Offload Package — Phase 3-8 Complete Implementation

**Authority:** User explicit: "offload deepseek-v4-flash end of transmission"  
**Status:** Ready for immediate execution  
**Scope:** All 6 implementation files (Phase 3-8)  
**Model:** DeepSeek v4 Flash (cost-optimized)  

---

## IMPLEMENTATION TASK

Implement all 6 Phase 3-8 .mjs files exactly per specification in `.claude/trading-bot/phase-N/` docs.

### Phase 3: evidence-collector.mjs
**File:** `Scripts/trading-bot/evidence-collector.mjs`

**Functions required:**
```typescript
async function collectEvidence(marketId: string, lookbackHours?: number): Promise<EvidencePacket>
async function fetchNewsFeeds(): Promise<NewsItem[]>
async function fetchSocialSignals(): Promise<SocialPost[]>
async function deduplicateSources(sources: Source[]): Source[]
async function extractConsensus(sources: Source[]): string
function scoreConfidence(source: Source, ageHours: number): number
```

**Spec reference:** `.claude/trading-bot/phase-3/RESEARCH_PIPELINE.md`

**Key constraints:**
- News sources: Reuters (0.95), CoinDesk (0.90), The Block, Cointelegraph
- Social sources: X/Twitter verified (0.70), Reddit upvoted (0.60)
- Deduplication: cosine >0.85 OR same URL OR same event within 30min
- Freshness decay: confidence_t = confidence_0 * 0.5^(hours_old / half_life)
- Consensus: ≥70% sources agree = consensus summary
- Output validates against `evidence_packet.schema.json`
- No API keys in code (use env vars)
- Error handling: no silent failures

---

### Phase 4: ensemble-inference.mjs
**File:** `Scripts/trading-bot/ensemble-inference.mjs`

**Functions required:**
```typescript
async function runInference(marketId: string, evidencePacket: EvidencePacket, features: CandidateFeatures): Promise<PredictionResult>
async function callModel(modelName: string, prompt: string): Promise<number>
function aggregateProbs(probs: Record<string, number>, weights: Record<string, number>): { p_model: number; dispersion: number }
function assignConfidence(dispersion: number, calibrationTable: CalibrationBucket[]): number
async function generateCalibrationReport(trades: Trade[], outcomes: Outcome[]): Promise<CalibrationReport>
```

**Spec reference:** `.claude/trading-bot/phase-4/ENSEMBLE_INFERENCE.md`

**Key constraints:**
- 5 models in parallel: Claude (0.25), Grok (0.20), GPT-4o (0.20), DeepSeek (0.20), Gemini (0.15)
- 30s timeout per model
- Weighted average: p_model = Σ(weight_i * p_i)
- Dispersion: sqrt(Σ(weight_i * (p_i - p_model)²)) — disagreement signal
- Confidence bucketing: dispersion <0.05 (high), 0.05-0.15 (medium), >0.15 (low)
- Brier Score target: ≤0.20
- Output validates against `prediction_result.schema.json`

---

### Phase 5: risk-engine.mjs
**File:** `Scripts/trading-bot/risk-engine.mjs`

**Functions required:**
```typescript
async function evaluateRiskDecision(marketId: string, predictionResult: PredictionResult, marketSnapshot: MarketSnapshot, portfolioState: PortfolioState): Promise<RiskDecision>
function checkDataFreshness(snapshotTimestamp: number): boolean
function checkLiquidity(volume: number, spreadBps: number): boolean
function calculateNetEdge(pModel: number, pMarket: number, flatFeeRate: number, slippageBps: number): number
function calculateKellySize(edge: number, odds: number, bankroll: number, kellyFraction?: number): number
function checkConcentration(openPositions: number, totalExposureRatio: number): boolean
function checkDrawdownHalt(currentEquity: number, initialEquity: number, haltThreshold?: number): boolean
function checkDailyLossHalt(dailyLoss: number, bankroll: number, haltThreshold?: number): boolean
function checkKillSwitch(killSwitchArmed: boolean): boolean
async function generateRiskReport(trades: RiskDecision[], outcomes: TradeOutcome[]): Promise<RiskReport>
```

**Spec reference:** `.claude/trading-bot/phase-5/RISK_ENGINE.md`

**Key constraints:**
- 9 gates ALL must pass for APPROVE
- Gate 1: Data freshness ≤60s
- Gate 2: Liquidity volume ≥$500k, spread ≤25bps
- Gate 3: Net edge ≥4%
- Gate 4: Confidence ≥0.60, dispersion ≤0.08
- Gate 5: Kelly = (edge * odds - 1) / (4 * odds), capped at 5% bankroll
- Gate 6: Max 3 open positions, total ≤15% bankroll
- Gate 7: Drawdown halt if >8% underwater
- Gate 8: Daily loss halt if >15% lost today
- Gate 9: Kill-switch must be ARMED
- Output validates against `risk_decision.schema.json`

---

### Phase 6: execution-engine.mjs
**File:** `Scripts/trading-bot/execution-engine.mjs`

**Functions required:**
```typescript
async function submitOrder(riskDecision: RiskDecision, marketSnapshot: MarketSnapshot): Promise<ExecutionEvent>
async function pollOrderStatus(exchangeOrderId: string, clientOrderId: string): Promise<ExecutionEvent>
function calculateDeterministicClientOrderId(tradeId: string, marketId: string, side: string, size: number, price: number): string
async function cancelOrder(exchangeOrderId: string): Promise<ExecutionEvent>
function recordExecutionEvent(executionEvent: ExecutionEvent): void
async function generateExecutionReport(events: ExecutionEvent[], startTime: Date, endTime: Date): Promise<ExecutionReport>
```

**Spec reference:** `.claude/trading-bot/phase-6/EXECUTION_ENGINE.md`

**Key constraints:**
- Idempotent client_order_id (deterministic sha256 hash)
- Coinbase API: POST /api/v1/brokerage/orders (sandbox)
- Polling: 2s for 30s, then 10s for 5min, then 60s
- Auth headers: CB-ACCESS-KEY, CB-ACCESS-SIGN (HMAC-SHA256), CB-ACCESS-TIMESTAMP, CB-ACCESS-PASSPHRASE
- Order types: LIMIT (post_only=false)
- Error handling: 429 rate limit (exponential backoff), 402 insufficient funds (HALT), 5xx (retry)
- Output validates against `execution_event.schema.json`
- Full audit trail: every fill, latency, slippage

---

### Phase 7: paper-trading.mjs
**File:** `Scripts/trading-bot/paper-trading.mjs`

**Functions required:**
```typescript
async function runPaperTradingCycle(cycleCount: number): Promise<PaperTradingReport>
function classifyTradeOutcome(trade: Trade, outcome: TradeOutcome, predictions: PredictionResult): FailureClassification
function calculateBrierScore(predictions: PredictionResult[], outcomes: TradeOutcome[]): number
async function generateOutcomeAnalysis(trades: TradeOutcome[]): Promise<OutcomeAnalysis>
function validateBrierScoreGate(brierScore: number, threshold?: number): boolean
```

**Spec reference:** `.claude/trading-bot/phase-7/PAPER_TRADING.md`

**Key constraints:**
- Failure taxonomy (from SCOPE_LOCK.md):
  - Type A: Prediction error (model forecast wrong, execution good)
  - Type B: Timing error (prediction right direction, price moved opposite at execution)
  - Type C: Execution error (order rejected, slippage, unfilled)
  - Type D: External shock (market crash, exchange issue)
- Brier Score = mean((forecast - outcome)²) where outcome is 0 or 1
- 50+ trades REQUIRED before live rollout
- Brier ≤0.20 MANDATORY gate
- Output validates against `trade_outcome.schema.json`
- Generate post-mortem for each loss

---

### Phase 8: live-rollout.mjs
**File:** `Scripts/trading-bot/live-rollout.mjs`

**Functions required:**
```typescript
function initKillSwitch(): KillSwitchState
function armKillSwitch(operator: string): void
function disarmKillSwitch(operator: string): void
function getKillSwitchState(): 'ARMED' | 'DISARMED'
function recordKillSwitchEvent(event: string, operator: string): void
async function validateLiveReadiness(): Promise<ReadinessCheck>
async function executeFirstTrade(tradeId: string): Promise<ExecutionResult>
```

**Spec reference:** `.claude/trading-bot/phase-8/LIVE_ROLLOUT.md`

**Key constraints:**
- Kill-switch: Hardcoded default DISARMED, never auto-arms
- Manual arm required: operator must type command explicitly
- Session-scoped: disarms on restart
- Audit log every arm/disarm (timestamp + operator)
- Staging:
  - Stage 0: $1 capital, 5 trades require manual approval
  - Stage 1: $10 after 10 profitable trades
  - Stage 2: $100 after 50 profitable trades
- Manual approval gates for all Stage 0 trades
- Output validates against kill-switch audit log

---

## REFERENCE AUTHORITY

All implementation details derive from:
- `.claude/trading-bot/phase-N/` spec files (locked)
- `.claude/trading-bot/schemas/` JSON schemas (validated)
- `.claude/trading-bot/SCOPE_LOCK.md` (policy, risk gates, failure taxonomy)

**No inference required.** All logic is deterministic and specified. Implementation is code-to-spec transcription.

---

## DELIVERY EXPECTATIONS

✅ All 6 .mjs files with complete function bodies  
✅ TypeScript interfaces/types defined  
✅ All error handling explicit (no silent failures)  
✅ All `.jsonl` output validates against schemas  
✅ No API keys in code (env vars only)  
✅ Deterministic + reproducible execution  
✅ Full audit trails for critical events  
✅ Ready for Phase 7 (paper trading) validation  

**Next:** User runs Phase 7 (50+ trades), validates Brier ≤0.20, signs off for Phase 8 live rollout.
