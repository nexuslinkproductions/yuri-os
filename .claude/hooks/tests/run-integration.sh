#!/bin/bash
# AEONIC Protocol Phase 3 Integration Test Harness
# Tests: hook pipeline, settings.json wiring, browser-lane exports

# SAFETY: Manual integration harness only.
# Do not run automatically in CI.
# Requires a live Claude hook environment and may execute hook scripts.
# Use only in an explicitly approved hook-validation sprint.

PASS=0
FAIL=0
NUDIMMUD_ROOT="/Users/marcelspatz/YURI-OS-MUSUBI"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

test_pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((PASS++))
}

test_fail() {
  echo -e "${RED}✗${NC} $1"
  ((FAIL++))
}

echo "=========================================="
echo "AEONIC Protocol Integration Tests"
echo "=========================================="
echo ""

# Test 1: aeonic-ingest.js outputs valid JSON
echo "[Test 1] aeonic-ingest.js JSON + sections..."
cd "$NUDIMMUD_ROOT" || exit 1
OUT=$(node ~/.claude/hooks/aeonic-ingest.js 2>/dev/null)
if echo "$OUT" | jq . > /dev/null 2>&1; then
  test_pass "aeonic-ingest outputs valid JSON"
else
  test_fail "aeonic-ingest JSON parse error"
fi

# Test 2: aeonic-protocol block present
if echo "$OUT" | jq '.hookSpecificOutput.additionalContext' | grep -q "aeonic-protocol"; then
  test_pass "aeonic-protocol block present"
else
  test_fail "aeonic-protocol block missing"
fi

# Test 3: ROLE_MATRIX in output
if echo "$OUT" | jq '.hookSpecificOutput.additionalContext' | grep -q "ROLE_MATRIX"; then
  test_pass "ROLE_MATRIX section found"
else
  test_fail "ROLE_MATRIX section missing"
fi

# Test 4: session-state.json initialized
echo ""
echo "[Test 2] session-state.json..."
STATEFILE=".claude/state/session-state.json"
if [ -f "$STATEFILE" ] && jq -e '.aeonic.loadedAt' "$STATEFILE" > /dev/null 2>&1; then
  test_pass "session-state.json.aeonic.loadedAt set"
else
  test_fail "session-state.json.aeonic fields missing"
fi

# Test 5: aeonic-enforce.js silent pass
echo ""
echo "[Test 3] aeonic-enforce.js..."
ENFORCE_OUT=$(echo '{"tool_name":"Write","tool_input":{}}' | node ~/.claude/hooks/aeonic-enforce.js 2>/dev/null)
if [ -z "$ENFORCE_OUT" ]; then
  test_pass "aeonic-enforce silent pass (clean state)"
else
  test_fail "aeonic-enforce should be silent, got output"
fi

# Test 6: browser-lane.js exports
echo ""
echo "[Test 4] browser-lane.js module..."
if node -e "const bl=require('$HOME/.claude/hooks/browser-lane.js'); console.log(Object.keys(bl).join(','))" 2>/dev/null | grep -q "routeToBrowser"; then
  test_pass "browser-lane exports routeToBrowser"
else
  test_fail "browser-lane missing routeToBrowser"
fi

# Test 7: settings.json wiring
echo ""
echo "[Test 5] settings.json hook wiring..."
WIRED=0
grep -q "aeonic-ingest.js" ~/.claude/settings.json && ((WIRED++))
grep -q "aeonic-enforce.js" ~/.claude/settings.json && ((WIRED++))
if [ $WIRED -eq 2 ]; then
  test_pass "~/.claude/settings.json wired correctly"
else
  test_fail "~/.claude/settings.json missing hooks"
fi

if grep -q "aeonic-ingest.js" "$NUDIMMUD_ROOT/.claude/settings.json"; then
  test_pass "NUDIMMUD/.claude/settings.json wired correctly"
else
  test_fail "NUDIMMUD/.claude/settings.json missing hooks"
fi

# Summary
echo ""
echo "=========================================="
echo -e "Results: ${GREEN}$PASS PASS${NC} ${RED}$FAIL FAIL${NC}"
echo "=========================================="
echo ""

exit $((FAIL > 0 ? 1 : 0))
