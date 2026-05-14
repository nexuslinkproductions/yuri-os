#!/usr/bin/env bash
# W4/R3: Codex rate-limit break-even calculator
# Usage: rate-limit-threshold.sh [--restart-cost N] [--burn-rate N] [--remaining-wait N]
#
# Break-even formula: threshold = restart_cost / idle_burn_rate
# If remaining_wait < threshold → WAIT; otherwise → RESTART

set -euo pipefail

RESTART_COST=40000   # tokens; midpoint of 26k-57k session startup range
BURN_RATE=750        # tokens/min idle; midpoint of 500-1000 hook-poll estimate
REMAINING_WAIT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --restart-cost) RESTART_COST="$2"; shift 2 ;;
    --burn-rate)    BURN_RATE="$2";    shift 2 ;;
    --remaining-wait) REMAINING_WAIT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

THRESHOLD=$(( RESTART_COST / BURN_RATE ))

echo "── Codex rate-limit break-even ──────────────────────"
echo "  restart cost   : ${RESTART_COST} tokens"
echo "  idle burn rate : ${BURN_RATE} tokens/min"
echo "  break-even     : ${THRESHOLD} min"
echo "─────────────────────────────────────────────────────"
echo "  RULE: wait if remaining window < ${THRESHOLD} min (current policy: stay for 5-10 min ✓)"

if [[ -n "$REMAINING_WAIT" ]]; then
  echo ""
  if (( REMAINING_WAIT < THRESHOLD )); then
    echo "  VERDICT: WAIT  (${REMAINING_WAIT} min remaining < ${THRESHOLD} min threshold)"
  else
    echo "  VERDICT: RESTART  (${REMAINING_WAIT} min remaining ≥ ${THRESHOLD} min threshold)"
  fi
fi
