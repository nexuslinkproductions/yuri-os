#!/bin/bash
# Live Rick pulse watcher — run in a separate terminal tab
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SPINNERS=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
i=0
while true; do
  clear
  echo "━━━ RICK ━━━"
  STATUS=$(cat "$REPO_ROOT/_SYSTEM/state/rick-pulse" 2>/dev/null || echo "idle")
  echo "  ${SPINNERS[$i]} $STATUS"
  i=$(( (i + 1) % 10 ))
  sleep 0.2
done
