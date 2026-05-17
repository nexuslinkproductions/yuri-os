#!/bin/bash
# Trading Bot Bootstrap Script
# Purpose: Set up environment and validate all prerequisites for Phase 3-8 implementation
# Usage: bash .claude/trading-bot/BOOTSTRAP.sh

set -e

echo "=== Trading Bot Bootstrap ==="
echo "Date: $(date)"
echo ""

# 1. Check Node.js version
echo "✓ Checking Node.js..."
NODE_VERSION=$(node -v)
echo "  Node version: $NODE_VERSION"
if ! [[ "$NODE_VERSION" > "v18.0.0" ]]; then
  echo "  ERROR: Requires Node.js 18+, found $NODE_VERSION"
  exit 1
fi

# 2. Check directory structure
echo ""
echo "✓ Verifying directory structure..."
DIRS=(
  ".claude/trading-bot/phase-0"
  ".claude/trading-bot/phase-1"
  ".claude/trading-bot/phase-2"
  ".claude/trading-bot/phase-3"
  ".claude/trading-bot/phase-4"
  ".claude/trading-bot/phase-5"
  ".claude/trading-bot/phase-6"
  ".claude/trading-bot/phase-7"
  ".claude/trading-bot/phase-8"
  ".claude/trading-bot/schemas"
  ".claude/trading-bot/data"
  ".claude/trading-bot/logs"
  "_SYSTEM/Scripts/trading-bot"
)

for dir in "${DIRS[@]}"; do
  if [ ! -d "$dir" ]; then
    echo "  ERROR: Missing directory: $dir"
    exit 1
  fi
  echo "  ✓ $dir"
done

# 3. Verify specifications locked
echo ""
echo "✓ Verifying specifications..."
SPECS=(
  ".claude/trading-bot/phase-0/SCOPE_LOCK.md"
  ".claude/trading-bot/phase-3/RESEARCH_PIPELINE.md"
  ".claude/trading-bot/phase-4/ENSEMBLE_INFERENCE.md"
  ".claude/trading-bot/phase-5/RISK_ENGINE.md"
  ".claude/trading-bot/phase-6/EXECUTION_ENGINE.md"
  ".claude/trading-bot/phase-7/PAPER_TRADING.md"
  ".claude/trading-bot/phase-8/LIVE_ROLLOUT.md"
  ".claude/trading-bot/TRADING_BOT_README.md"
)

for spec in "${SPECS[@]}"; do
  if [ ! -f "$spec" ]; then
    echo "  ERROR: Missing specification: $spec"
    exit 1
  fi
  echo "  ✓ $(basename $spec)"
done

# 4. Verify all schemas
echo ""
echo "✓ Verifying schemas..."
SCHEMAS=(
  "market_snapshot.schema.json"
  "candidate_features.schema.json"
  "evidence_packet.schema.json"
  "prediction_result.schema.json"
  "risk_decision.schema.json"
  "execution_event.schema.json"
  "trade_outcome.schema.json"
)

for schema in "${SCHEMAS[@]}"; do
  if [ ! -f ".claude/trading-bot/schemas/$schema" ]; then
    echo "  ERROR: Missing schema: $schema"
    exit 1
  fi
  # Validate JSON syntax
  if ! jq empty ".claude/trading-bot/schemas/$schema" 2>/dev/null; then
    echo "  ERROR: Invalid JSON in $schema"
    exit 1
  fi
  echo "  ✓ $schema"
done

# 5. Check .env file
echo ""
echo "✓ Environment configuration..."
if [ ! -f ".env" ]; then
  echo "  WARNING: .env file not found"
  echo "  Create .env with required variables:"
  echo "    COINBASE_API_KEY=..."
  echo "    COINBASE_API_SECRET=..."
  echo "    COINBASE_API_PASSPHRASE=..."
  echo "    COINBASE_SANDBOX_MODE=true"
  echo "    TRADING_BOT_KILL_SWITCH=DISARMED"
  echo "    TRADING_BOT_MODE=sandbox"
  echo ""
  read -p "  Continue without .env? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
else
  echo "  ✓ .env file exists"
  # Check for sensitive variables (non-exhaustive)
  if grep -q "COINBASE_API_KEY=" .env; then
    echo "  ✓ Coinbase API key configured"
  fi
fi

# 6. Validate package.json scripts
echo ""
echo "✓ Checking package.json scripts..."
if grep -q '"trading-bot:phase-3"' package.json; then
  echo "  ✓ npm scripts registered"
else
  echo "  WARNING: npm trading-bot scripts not found in package.json"
  echo "  Add scripts section with:"
  echo "    \"trading-bot:phase-3\": \"node _SYSTEM/Scripts/trading-bot/evidence-collector.mjs\""
  echo "    ... etc for phases 4-8"
fi

# 7. Create data directories if missing
echo ""
echo "✓ Setting up data directories..."
mkdir -p .claude/trading-bot/data
mkdir -p .claude/trading-bot/logs
echo "  ✓ Data directories ready"

# 8. Initialize empty JSONL files if needed
echo ""
echo "✓ Initializing data files..."
JSONL_FILES=(
  "market_snapshots.jsonl"
  "candidate_features.jsonl"
  "evidence_packet.jsonl"
  "prediction_result.jsonl"
  "risk_decision.jsonl"
  "execution_event.jsonl"
  "trade_outcome.jsonl"
)

for file in "${JSONL_FILES[@]}"; do
  if [ ! -f ".claude/trading-bot/data/$file" ]; then
    touch ".claude/trading-bot/data/$file"
    echo "  ✓ Created $file"
  fi
done

# 9. Check for existing implementations
echo ""
echo "✓ Checking implementation files..."
IMPL_FILES=(
  "_SYSTEM/Scripts/trading-bot/evidence-collector.mjs"
  "_SYSTEM/Scripts/trading-bot/ensemble-inference.mjs"
  "_SYSTEM/Scripts/trading-bot/risk-engine.mjs"
  "_SYSTEM/Scripts/trading-bot/execution-engine.mjs"
  "_SYSTEM/Scripts/trading-bot/paper-trading.mjs"
  "_SYSTEM/Scripts/trading-bot/live-rollout.mjs"
)

MISSING_COUNT=0
for file in "${IMPL_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "  ⏳ $(basename $file) - NOT YET IMPLEMENTED"
    ((MISSING_COUNT++))
  else
    echo "  ✓ $(basename $file)"
  fi
done

echo ""
echo "=== Bootstrap Complete ==="
echo ""
if [ $MISSING_COUNT -gt 0 ]; then
  echo "Status: Ready for implementation"
  echo "  $MISSING_COUNT files to implement (Phase 3-8)"
  echo ""
  echo "Next steps:"
  echo "  1. Review .claude/trading-bot/OPENCLAW_HANDOFF.md"
  echo "  2. Implement Phase 3: evidence-collector.mjs"
  echo "  3. Run tests: npm run trading-bot:test:phase-3"
  echo "  4. Continue with Phase 4-8"
else
  echo "Status: All implementations present"
  echo ""
  echo "Next steps:"
  echo "  1. Run full test suite: npm run trading-bot:test"
  echo "  2. Run Phase 7 paper trading: npm run trading-bot:phase-7"
  echo "  3. Verify Brier Score ≤0.20"
  echo "  4. Review Phase 8 deployment readiness"
fi

echo ""
echo "Configuration summary:"
echo "  Venue: Coinbase Advanced Trade API"
echo "  Mode: $(grep -oP '(?<=TRADING_BOT_MODE=).+' .env 2>/dev/null || echo 'sandbox (default)')"
echo "  Kill-switch: $(grep -oP '(?<=TRADING_BOT_KILL_SWITCH=).+' .env 2>/dev/null || echo 'DISARMED (default)')"
echo "  Initial capital: $(grep -oP '(?<=TRADING_BOT_INITIAL_CAPITAL=).+' .env 2>/dev/null || echo '\$100 (default)')"
echo ""
echo "Reference docs:"
echo "  Phase specs: .claude/trading-bot/phase-N/"
echo "  Handoff: .claude/trading-bot/OPENCLAW_HANDOFF.md"
echo "  Tests: .claude/trading-bot/IMPLEMENTATION_VALIDATOR.md"
echo "  README: .claude/trading-bot/TRADING_BOT_README.md"
echo ""
