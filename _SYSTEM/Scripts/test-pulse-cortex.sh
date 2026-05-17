#!/usr/bin/env bash
# Pulse Cortex end-to-end verification (PATCH 030-039)
#
# Usage: bash _SYSTEM/Scripts/test-pulse-cortex.sh [--phase N | --all]
#
# Verifies each cortex subsystem in isolation. Failure modes are visible
# but never fatal across phases — each phase logs PASS/FAIL independently
# so the script reports a complete diagnostic in one run.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS_COUNT=0
FAIL_COUNT=0
declare -a FAILURES

assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -q -- "$needle"; then
    echo "  ✓ $label"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  ✗ $label  (missing: $needle)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILURES+=("$label")
  fi
}

run_phase() {
  case "$1" in
    1)
      echo "── Phase 1: Classifier extensions (PATCH 030)"
      local trivial standard critical
      trivial=$(node _SYSTEM/Scripts/offload-contract.mjs route-plan "hi")
      standard=$(node _SYSTEM/Scripts/offload-contract.mjs route-plan "fix .claude/hooks/tirith-url-guard.js decode bug")
      critical=$(node _SYSTEM/Scripts/offload-contract.mjs route-plan "refactor pulse cortex protocol gate routing memory.db governance")
      assert_contains "trivial tier" '"complexityTier":"trivial"' "$trivial"
      assert_contains "trivial ensemble empty" '"ensemble":\[\]' "$trivial"
      assert_contains "standard tier" '"complexityTier":"standard"' "$standard"
      assert_contains "standard ensemble has deepseek" '"deepseek-preflight"' "$standard"
      assert_contains "standard codexPolicy dry-run" '"codexPolicy":"dry-run-only"' "$standard"
      assert_contains "critical tier" '"complexityTier":"critical"' "$critical"
      assert_contains "critical ensemble has openclaw" '"openclaw-preflight"' "$critical"
      assert_contains "critical ensemble has cassandra" '"cassandra"' "$critical"
      assert_contains "critical beacon notify+obsidian" 'beaconLevel":"notify+obsidian' "$critical"
      assert_contains "critical codexPolicy none" '"codexPolicy":"none"' "$critical"
      ;;
    2)
      echo "── Phase 2: pulse-bus.js + orchestrator (PATCH 031)"
      node --check _SYSTEM/Scripts/pulse-orchestrator.mjs 2>&1
      assert_contains "orchestrator syntax" "" "$(node --check _SYSTEM/Scripts/pulse-orchestrator.mjs && echo OK)"
      assert_contains "pulse-bus exports" "appendFinding" "$(node -e "console.log(Object.keys(require('./.claude/hooks/pulse-bus.js')).join(','))")"
      assert_contains "lock helper exported" "withLock" "$(node -e "console.log(Object.keys(require('./.claude/hooks/pulse-bus.js')).join(','))")"
      ;;
    3)
      echo "── Phase 3: user-prompt-submit sensory layer (PATCH 032)"
      local trivial_out non_trivial_out
      trivial_out=$(echo '{"messages":[{"role":"user","content":[{"type":"text","text":"hi"}]}]}' | node .claude/hooks/user-prompt-submit.js)
      non_trivial_out=$(echo '{"messages":[{"role":"user","content":[{"type":"text","text":"refactor _SYSTEM/Scripts/offload.sh routing logic"}]}]}' | node .claude/hooks/user-prompt-submit.js)
      assert_contains "trivial returns continue:true" '"continue":true' "$trivial_out"
      assert_contains "trivial no additionalContext" '^{"continue":true}$' "$(echo "$trivial_out" | tr -d ' ')"
      assert_contains "non-trivial has additionalContext" 'additionalContext' "$non_trivial_out"
      assert_contains "non-trivial mentions cortex" 'pulse-cortex' "$non_trivial_out"
      ;;
    4)
      echo "── Phase 4: OpenClaw assessor + bridge quarantine (PATCH 033)"
      local critical
      critical=$(node _SYSTEM/Scripts/offload-contract.mjs route-plan "refactor protocol architecture")
      assert_contains "openClawAdvisory present" '"openClawAdvisory"' "$critical"
      assert_contains "openclaw runtimeKind bridge_advisory" '"runtimeKind":"bridge_advisory"' "$critical"
      assert_contains "openclaw quarantine list" '"Must not directly edit code' "$critical"
      assert_contains "protocol-guard recognizes pulse-plan.json" 'pulseCortexEvidence' "$(cat .claude/hooks/claude-protocol-guard.js)"
      ;;
    5)
      echo "── Phase 5: Hermes-forecast predictive (PATCH 034)"
      assert_contains "evaluateHermesForecast logic present" 'spans .* top-level areas' "$(cat _SYSTEM/Scripts/pulse-orchestrator.mjs)"
      assert_contains "session-state read" 'session-state.json' "$(cat _SYSTEM/Scripts/pulse-orchestrator.mjs)"
      ;;
    6)
      echo "── Phase 6: Cassandra full impl (PATCH 035)"
      assert_contains "git log read" 'git.*log.*-5' "$(cat _SYSTEM/Scripts/pulse-orchestrator.mjs)"
      assert_contains "session-journal.md read" 'session-journal.md' "$(cat _SYSTEM/Scripts/pulse-orchestrator.mjs)"
      assert_contains "Promise.race timeout guard" 'Promise.race' "$(cat _SYSTEM/Scripts/pulse-orchestrator.mjs)"
      assert_contains "model upgrade via deepseek-flash" 'deepseek-v4-flash' "$(cat _SYSTEM/Scripts/pulse-orchestrator.mjs)"
      ;;
    7)
      echo "── Phase 7: Two-phase Codex (PATCH 036)"
      assert_contains "pulse-codex-runner exists" "" "$(test -f _SYSTEM/Scripts/pulse-codex-runner.mjs && echo OK)"
      assert_contains "snapshot_head guard" 'snapshot_head' "$(cat _SYSTEM/Scripts/pulse-codex-runner.mjs)"
      assert_contains "STALE_HEAD status" 'STALE_HEAD' "$(cat _SYSTEM/Scripts/pulse-codex-runner.mjs)"
      assert_contains "PROPOSE-ONLY prohibition" 'PROPOSE-ONLY' "$(cat _SYSTEM/Scripts/pulse-codex-runner.mjs)"
      assert_contains "expires_at 10 min" 'PENDING_TTL_MS' "$(cat _SYSTEM/Scripts/pulse-codex-runner.mjs)"
      local status_out
      status_out=$(node _SYSTEM/Scripts/pulse-codex-runner.mjs status)
      assert_contains "status command works" 'exists' "$status_out"
      ;;
    8)
      echo "── Phase 8: Pulse Beacon (PATCH 037)"
      local beacon_status
      beacon_status=$(node _SYSTEM/Scripts/pulse-beacon.mjs status)
      assert_contains "beacon status JSON" 'session_id' "$beacon_status"
      assert_contains "beacon throttle count" 'count' "$beacon_status"
      assert_contains "obsidian path resolved" 'obsidian_path' "$beacon_status"
      assert_contains "orchestrator spawns beacon" 'pulse-beacon.mjs' "$(cat _SYSTEM/Scripts/pulse-orchestrator.mjs)"
      ;;
    9)
      echo "── Phase 9: _SYSTEM/Scripts/ai cortex self-inspection (PATCH 038)"
      local cortex_out
      cortex_out=$(_SYSTEM/Scripts/ai cortex)
      assert_contains "header present" 'PULSE CORTEX STATUS' "$cortex_out"
      assert_contains "bus section" 'Bus:' "$cortex_out"
      assert_contains "beacon section" 'Beacon:' "$cortex_out"
      assert_contains "openclaw gateway shown" 'OpenClaw gateway' "$cortex_out"
      local cortex_json
      cortex_json=$(_SYSTEM/Scripts/ai cortex --json)
      assert_contains "json mode works" 'openclaw_gateway' "$cortex_json"
      ;;
    10)
      echo "── Phase 10: EOT Phase 10 + tokenmaxxing + CLAUDE.md (PATCH 039)"
      assert_contains "EOT Phase 10 section" 'Phase 10 — Pulse Cortex Archive' "$(cat .claude/skills/end-of-transmission/SKILL.md)"
      assert_contains "PULSE_CORTEX_PROTOCOL section" 'PULSE_CORTEX_PROTOCOL' "$(cat CLAUDE.md)"
      assert_contains "tokenmaxxing description native" 'Native token efficiency' "$(cat .claude/skills/tokenmaxxing/SKILL.md)"
      # /tokenmaxxing no longer in YAML triggers array; only body text references remain
      assert_contains "tokenmaxxing yaml trigger removed" 'triggers:' "$(head -10 .claude/skills/tokenmaxxing/SKILL.md)"
      local frontmatter
      frontmatter="$(awk '/^---$/{c++; next} c==1' .claude/skills/tokenmaxxing/SKILL.md)"
      if echo "$frontmatter" | grep -q '"/tokenmaxxing"'; then
        echo "  ✗ /tokenmaxxing still in YAML triggers"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        FAILURES+=("/tokenmaxxing still in triggers")
      else
        echo "  ✓ /tokenmaxxing removed from YAML triggers"
        PASS_COUNT=$((PASS_COUNT + 1))
      fi
      ;;
  esac
}

echo "═══════════════════════════════════════════════════════════"
echo "  Pulse Cortex e2e verification"
echo "═══════════════════════════════════════════════════════════"

if [[ "${1:-}" == "--phase" && -n "${2:-}" ]]; then
  run_phase "$2"
elif [[ "${1:-}" == "--all" || -z "${1:-}" ]]; then
  for n in 1 2 3 4 5 6 7 8 9 10; do
    run_phase "$n"
    echo ""
  done
else
  echo "usage: $0 [--phase N | --all]"
  exit 1
fi

echo "═══════════════════════════════════════════════════════════"
echo "  SUMMARY: PASS=$PASS_COUNT  FAIL=$FAIL_COUNT"
if [[ $FAIL_COUNT -gt 0 ]]; then
  echo "  Failures:"
  printf '    - %s\n' "${FAILURES[@]}"
fi
echo "═══════════════════════════════════════════════════════════"

[[ $FAIL_COUNT -eq 0 ]]
