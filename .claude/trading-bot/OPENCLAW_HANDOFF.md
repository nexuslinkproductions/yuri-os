# Trading Bot — OpenClaw Handoff Package

**Date:** 2026-05-05  
**Status:** Architecture locked, schemas complete, implementation ready for handoff  
**Recipient:** OpenClaw agent/system  
**Authority:** User explicit instruction to offload remaining phases to OpenClaw entirely

---

## Completed (Locked Specifications)

All 8 phases have production-grade specifications, schemas, and architecture:

### Phase 0-2: Foundation (Complete)
- `.claude/trading-bot/phase-0/SCOPE_LOCK.md` — Trading policy, risk parameters, failure taxonomy
- `.claude/trading-bot/phase-1/ACCOUNTS.md` — Coinbase API setup
- `.claude/trading-bot/phase-2/SCANNER.md` — Market discovery

### Phase 3-8: Full Specifications (Complete)
- `phase-3/RESEARCH_PIPELINE.md` — Evidence collection, source scoring, deduplication
- `phase-4/ENSEMBLE_INFERENCE.md` — Multi-model inference, calibration, dispersion
- `phase-5/RISK_ENGINE.md` — 9 deterministic gates, Kelly sizing, halt mechanisms
- `phase-6/EXECUTION_ENGINE.md` — Idempotent order submission, audit trails
- `phase-7/PAPER_TRADING.md` — 50+ trade validation, post-mortem classification
- `phase-8/LIVE_ROLLOUT.md` — Kill-switch, staging, manual gates

### All Schemas Validated (6 total)
```
market_snapshot.schema.json           (Phase 2 → Phase 3)
candidate_features.schema.json        (Phase 2 → Phase 3)
evidence_packet.schema.json           (Phase 3 → Phase 4)
prediction_result.schema.json         (Phase 4 → Phase 5)
risk_decision.schema.json             (Phase 5 → Phase 6)
execution_event.schema.json           (Phase 6 → Phase 7)
trade_outcome.schema.json             (Phase 7 → Phase 8)
```

### Consolidated Documentation
- `TRADING_BOT_README.md` — 8-phase overview, CLI commands, directory structure

---

## Remaining Work (For OpenClaw)

### 1. Implementation Stubs (6 files)

Each file must implement the interface signatures defined in the corresponding phase .md spec. All logic is deterministic (no inference required).

**Phase 3: evidence-collector.mjs**
- Location: `Scripts/trading-bot/evidence-collector.mjs`
- Required functions (from RESEARCH_PIPELINE.md):
  ```typescript
  async function collectEvidence(marketId: string, lookbackHours?: number): Promise<EvidencePacket>
  async function fetchNewsFeeds(): Promise<NewsItem[]>
  async function fetchSocialSignals(): Promise<SocialPost[]>
  async function deduplicateSources(sources: Source[]): Source[]
  async function extractConsensus(sources: Source[]): string
  function scoreConfidence(source: Source, ageHours: number): number
  ```
- Dependencies: RSS feed libraries, X API client, Reddit API client
- Output: `evidence_packet.jsonl` (append-only)
- Constraints: No API keys in code, use environment variables

**Phase 4: ensemble-inference.mjs**
- Location: `Scripts/trading-bot/ensemble-inference.mjs`
- Required functions (from ENSEMBLE_INFERENCE.md):
  ```typescript
  async function runInference(marketId: string, evidencePacket: EvidencePacket, features: CandidateFeatures): Promise<PredictionResult>
  async function callModel(modelName: string, prompt: string): Promise<number>
  function aggregateProbs(probs: Record<string, number>, weights: Record<string, number>): { p_model: number; dispersion: number }
  function assignConfidence(dispersion: number, calibrationTable: CalibrationBucket[]): number
  async function generateCalibrationReport(trades: Trade[], outcomes: Outcome[]): Promise<CalibrationReport>
  ```
- Model weights (from spec): Claude 0.25, Grok 0.20, GPT-4o 0.20, DeepSeek 0.20, Gemini 0.15
- Output: `prediction_result.jsonl` with dispersion analysis
- Constraints: Parallel model calls with 30s timeout per model

**Phase 5: risk-engine.mjs**
- Location: `Scripts/trading-bot/risk-engine.mjs`
- Required functions (from RISK_ENGINE.md):
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
- Output: `risk_decision.jsonl` with 9 gate evaluations
- Constraints: All gates must pass for APPROVE decision; all division guarded

**Phase 6: execution-engine.mjs**
- Location: `Scripts/trading-bot/execution-engine.mjs`
- Required functions (from EXECUTION_ENGINE.md):
  ```typescript
  async function submitOrder(riskDecision: RiskDecision, marketSnapshot: MarketSnapshot): Promise<ExecutionEvent>
  async function pollOrderStatus(exchangeOrderId: string, clientOrderId: string): Promise<ExecutionEvent>
  function calculateDeterministicClientOrderId(tradeId: string, marketId: string, side: string, size: number, price: number): string
  async function cancelOrder(exchangeOrderId: string): Promise<ExecutionEvent>
  function recordExecutionEvent(executionEvent: ExecutionEvent): void
  async function generateExecutionReport(events: ExecutionEvent[], startTime: Date, endTime: Date): Promise<ExecutionReport>
  ```
- Coinbase API: POST /api/v1/brokerage/orders, polling every 2-10-60s
- Output: `execution_event.jsonl` with fill events and latency tracking
- Constraints: Idempotent client_order_id, no duplicate submissions, auth headers required

**Phase 7: paper-trading.mjs**
- Location: `Scripts/trading-bot/paper-trading.mjs`
- Required functions (from PAPER_TRADING.md):
  ```typescript
  async function runPaperTradingCycle(cycleCount: number): Promise<PaperTradingReport>
  function classifyTradeOutcome(trade: Trade, outcome: TradeOutcome, predictions: PredictionResult): FailureClassification
  function calculateBrierScore(predictions: PredictionResult[], outcomes: TradeOutcome[]): number
  async function generateOutcomeAnalysis(trades: TradeOutcome[]): Promise<OutcomeAnalysis>
  function validateBrierScoreGate(brierScore: number, threshold?: number): boolean
  ```
- Failure taxonomy (from SCOPE_LOCK.md):
  - Type A: Prediction error (model was wrong)
  - Type B: Timing error (prediction right, but price moved wrong direction at execution)
  - Type C: Execution error (order not filled, slippage, rejected)
  - Type D: External shock (market crash, exchange issue)
- Output: `trade_outcome.jsonl` with failure classification, feed to calibration
- Constraints: 50+ trades required for sign-off, Brier ≤0.20 mandatory gate

**Phase 8: live-rollout.mjs**
- Location: `Scripts/trading-bot/live-rollout.mjs`
- Required functions:
  ```typescript
  function initKillSwitch(): KillSwitchState
  function armKillSwitch(operator: string): void
  function disarmKillSwitch(operator: string): void
  function getKillSwitchState(): 'ARMED' | 'DISARMED'
  function recordKillSwitchEvent(event: string, operator: string): void
  async function validateLiveReadiness(): Promise<ReadinessCheck>
  async function executeFirstTrade(tradeId: string): Promise<ExecutionResult>
  ```
- Kill-switch: Hardcoded default DISARMED, session-scoped, must be manually armed
- Scaling stages (from LIVE_ROLLOUT.md):
  - Stage 0: $1 capital, 5 trades manual approval
  - Stage 1: $10 capital after 10 profitable trades
  - Stage 2: $100 capital after 50 profitable trades
- Output: `logs/kill_switch_audit.jsonl` for all arm/disarm events
- Constraints: No live trade without kill-switch armed, manual approval gates required

---

### 2. npm Scripts Integration

Add to `package.json` scripts section:

```json
{
  "scripts": {
    "trading-bot:phase-2": "node Scripts/trading-bot/market-scanner.mjs",
    "trading-bot:phase-3": "node Scripts/trading-bot/evidence-collector.mjs",
    "trading-bot:phase-4": "node Scripts/trading-bot/ensemble-inference.mjs",
    "trading-bot:phase-5": "node Scripts/trading-bot/risk-engine.mjs",
    "trading-bot:phase-6": "node Scripts/trading-bot/execution-engine.mjs",
    "trading-bot:phase-7": "node Scripts/trading-bot/paper-trading.mjs",
    "trading-bot:phase-8": "node Scripts/trading-bot/live-rollout.mjs",
    "trading-bot:kill-switch": "node Scripts/trading-bot/kill-switch-cli.mjs",
    "trading-bot:mode": "node Scripts/trading-bot/mode-selector.mjs",
    "trading-bot:approve": "node Scripts/trading-bot/approval-gate.mjs",
    "trading-bot:dashboard": "node Scripts/trading-bot/dashboard.mjs",
    "trading-bot:audit": "node Scripts/trading-bot/audit-export.mjs"
  }
}
```

---

### 3. Environment Variables Required

Create `.env` file (DO NOT COMMIT):

```bash
# Coinbase API (sandbox)
COINBASE_API_KEY=your_sandbox_key
COINBASE_API_SECRET=your_sandbox_secret
COINBASE_API_PASSPHRASE=your_sandbox_passphrase
COINBASE_SANDBOX_MODE=true

# Model APIs
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_claude_key
DEEPSEEK_API_KEY=your_deepseek_key
XRPC_API_KEY=your_grok_key
GOOGLE_API_KEY=your_gemini_key

# Trading bot configuration
TRADING_BOT_KILL_SWITCH=DISARMED          # Hardcoded default
TRADING_BOT_MODE=sandbox                  # sandbox or live
TRADING_BOT_INITIAL_CAPITAL=100           # USD for sandbox
TRADING_BOT_LOG_LEVEL=info                # debug, info, warn, error

# News/Social sources (optional)
NEWSAPI_KEY=your_newsapi_key
TWITTER_API_KEY=your_twitter_key
REDDIT_CLIENT_ID=your_reddit_id
REDDIT_CLIENT_SECRET=your_reddit_secret

# Monitoring
SENTRY_DSN=optional_sentry_url
```

---

### 4. Testing & Validation Checklist

Before handoff to live trading, verify:

- [ ] Phase 3: Evidence collector produces valid `evidence_packet.jsonl`, deduplication removes >90% duplicates
- [ ] Phase 4: Ensemble runs all 5 models in parallel, dispersion calculated correctly, calibration report generated
- [ ] Phase 5: All 9 gates evaluate correctly, Kelly sizing formula verified, position sizes capped at 5%
- [ ] Phase 6: Orders submit with deterministic client_order_id, idempotency tested (double-submit same order)
- [ ] Phase 7: 50+ paper trades completed, all outcomes classified (A/B/C/D), Brier ≤0.20
- [ ] Phase 8: Kill-switch starts DISARMED, arm/disarm audit logged, staging gates enforced
- [ ] All `.jsonl` outputs validate against schemas
- [ ] No API keys in code or logs
- [ ] All timestamps ISO 8601
- [ ] Error handling: no silent failures

---

### 5. Implementation Order

Recommended sequence (parallel-safe):
1. Phase 3 & 4: Can develop in parallel (independent APIs)
2. Phase 5: Depends on Phase 4 output
3. Phase 6: Depends on Phase 5 output
4. Phase 7: Depends on Phase 6 output
5. Phase 8: Depends on Phase 7 sign-off

---

### 6. Reference Authority

For all implementation details:
- **Policies & Risk:** `.claude/trading-bot/phase-0/SCOPE_LOCK.md`
- **Architecture & Formulas:** Individual phase .md files (phase-3 through phase-8)
- **Schemas:** `.claude/trading-bot/schemas/*.schema.json`
- **CLI:** `TRADING_BOT_README.md`

All specifications are deterministic and locked. No inference or design decisions required — only implementation to spec.

---

### 7. Failure Points & Recovery

Known constraints (for error handling):
- **Phase 3:** News feeds may timeout; implement exponential backoff (2s, 4s, 8s), max 3 retries
- **Phase 4:** Model API rate limiting; queue requests, implement jitter backoff
- **Phase 5:** Zero-division on edge calculation; all division guarded with checks
- **Phase 6:** Order submission timeout; check with deterministic client_order_id, no duplicate
- **Phase 7:** Insufficient trades; continue collecting until ≥50 completed
- **Phase 8:** Kill-switch not armed; auto-reject all trades with clear reason code

---

## Delivery Expectations

- All 6 implementation files (.mjs) with complete function bodies
- All functions adhere to interface signatures in specs
- All error handling explicit (no silent failures)
- All `.jsonl` output validates against schemas
- npm scripts integrated and working
- Full test coverage for each phase
- README updates for CLI commands and deployment

**Status Upon Completion:** Trading bot ready for paper trading validation (Phase 7) with path to live rollout (Phase 8).

---

**End of Handoff Package**
