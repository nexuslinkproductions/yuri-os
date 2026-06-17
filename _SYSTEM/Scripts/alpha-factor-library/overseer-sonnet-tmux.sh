#!/usr/bin/env bash
# overseer-sonnet-tmux.sh — DISARMED launcher for the always-on SONNET trading overseer.
#
# The sanctioned YURI launch shape: a REAL interactive `claude` session living in tmux (NO `claude -p`,
# NO --print, NO SDK — that ban is hook-enforced). A beat injects an overseer packet on an interval;
# the session runs the deterministic overseer brain (`overseer.mjs --once --lane sonnet`) PLUS its own
# max-reasoning judgment, edits the hot-reloaded config / weights, and posts reasoning to the shared
# board. A capture-pane reader logs each turn (the round-trip half voice-seam.sh doesn't do).
#
# WHY tmux over `claude -p`: the session is STATEFUL — it remembers prior decisions + the deepseek
# teammate's board posts across ticks. `-p` is stateless (forgets each tick) and hook-blocked.
#
# ARMING IS OWNER-GATED (a continuous, paid, max-reasoning session). Marcel runs + supervises first
# launch (there may be a one-time trust prompt to clear in the pane). Nothing auto-starts this.
#
#   bash overseer-sonnet-tmux.sh start      # create the tmux session + launch claude (clear any prompt)
#   bash overseer-sonnet-tmux.sh tick       # one manual overseer tick (validate before looping)
#   bash overseer-sonnet-tmux.sh beat       # loop: inject a tick every $SONNET_OVERSEER_INTERVAL s
#   bash overseer-sonnet-tmux.sh stop       # kill the session + any beat
#
# NOTE ON CADENCE: a max-reasoning turn does NOT finish in 10s. The beat targets the interval but real
# cadence is turn-latency-governed (injects queue; claude processes sequentially). Default 30s.
set -euo pipefail

SESSION="${SONNET_OVERSEER_SESSION:-yuri-overseer}"
INTERVAL="${SONNET_OVERSEER_INTERVAL:-30}"
ROOT="${YURI_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
TARGET="${SESSION}:0.0"
LOG="${ROOT}/_SYSTEM/state/overseer-sonnet.log"
OVERSEER="_SYSTEM/Scripts/alpha-factor-library/overseer.mjs"
BOARD="_SYSTEM/state/overseer-board.jsonl"

# The directive injected each tick. Kept short; the session does the work with its own tools.
read -r -d '' TICK_PACKET <<EOF || true
OVERSEER TICK (Sonnet, max reasoning). Be terse, one tool cycle.
1) Run: node ${OVERSEER} --once --lane sonnet
2) Read last 12 lines of ${BOARD} + GET http://127.0.0.1:4243/api/observatory/ensemble.
3) If your net-of-fee judgment says a change helps (weights, threshold, feeHurdle, minHoldCycles, perMarketEnable, pause), edit _SYSTEM/state/overseer-config.json and post ONE board line via overseer.postBoard(lane:'sonnet',kind:'proposal'). Respect the deepseek teammate's posts; ratify or refute, don't blind-fight.
Constraints: config+weights ONLY (INV-1, never an order). DISARMED gates stay owner-gated.
EOF

inject() { tmux send-keys -t "$TARGET" -l "$1"; tmux send-keys -t "$TARGET" Enter; }

case "${1:-}" in
  start)
    if tmux has-session -t "$SESSION" 2>/dev/null; then echo "session $SESSION already exists"; exit 0; fi
    tmux new-session -d -s "$SESSION" -c "$ROOT"
    tmux send-keys -t "$TARGET" -l "claude"; tmux send-keys -t "$TARGET" Enter
    echo "Started tmux '$SESSION' running claude. Attach with: tmux attach -t $SESSION"
    echo "Clear any first-run trust prompt, then: bash $0 tick   (validate)   or   bash $0 beat"
    ;;
  tick)
    tmux has-session -t "$SESSION" 2>/dev/null || { echo "no session $SESSION — run 'start' first"; exit 1; }
    inject "$TICK_PACKET"
    sleep 8  # settle; a real reasoning turn is longer — this only grabs the head of the response
    { echo "=== tick $(date -u +%FT%TZ) ==="; tmux capture-pane -p -t "$TARGET" | tail -40; } >> "$LOG"
    echo "tick injected; head captured → $LOG"
    ;;
  beat)
    tmux has-session -t "$SESSION" 2>/dev/null || { echo "no session $SESSION — run 'start' first"; exit 1; }
    echo "beat every ${INTERVAL}s (Ctrl-C to stop the loop; session keeps running). log → $LOG"
    while true; do
      inject "$TICK_PACKET"
      sleep "$INTERVAL"
      { echo "=== tick $(date -u +%FT%TZ) ==="; tmux capture-pane -p -t "$TARGET" | tail -40; } >> "$LOG"
    done
    ;;
  stop)
    tmux kill-session -t "$SESSION" 2>/dev/null && echo "killed $SESSION" || echo "no session $SESSION"
    ;;
  *)
    echo "usage: $0 {start|tick|beat|stop}"; exit 2 ;;
esac
