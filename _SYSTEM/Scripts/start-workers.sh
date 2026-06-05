#!/bin/bash
# YURI Worker Session Bootstrap
# Starts tmux session 'yuri-workers' with 3 panes: codex / claude / deepseek
# Creates FIFOs for transport. Re-entrant — kills stale session first.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION="yuri-workers"
WORKER_BRIDGE="$REPO_ROOT/_SYSTEM/Scripts/worker-bridge.mjs"

# Kill stale session without error
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Create FIFOs for FIFO transport layer
for w in codex amp deepseek; do
  rm -f "/tmp/yuri-worker-$w"
  mkfifo "/tmp/yuri-worker-$w" 2>/dev/null || true
done

# New 3-pane session
tmux new-session -d -s "$SESSION" -n workers

# Pane 0: codex worker
tmux send-keys -t "$SESSION:0.0" \
  "cd $REPO_ROOT && node $WORKER_BRIDGE loop --worker codex" Enter

# Pane 1: claude worker (split horizontal)
tmux split-window -t "$SESSION:0" -h
tmux send-keys -t "$SESSION:0.1" \
  "cd $REPO_ROOT && node $WORKER_BRIDGE loop --worker claude" Enter

# Pane 2: deepseek worker (split pane 1 vertical)
tmux split-window -t "$SESSION:0.1" -v
tmux send-keys -t "$SESSION:0.2" \
  "cd $REPO_ROOT && node $WORKER_BRIDGE loop --worker deepseek" Enter

echo "[yuri-workers] session started"
tmux list-panes -t "$SESSION" -F "  pane #{pane_index}: #{pane_title} (#{pane_pid})"

# ── ARCHITECTURE NOTES ──────────────────────────────────────────────────────
# (NVIDIA Nemotron 120B architectural review — 2026-05-20)
#
# ISSUE 1 — No heartbeat or reclaim mechanism
#   YURI workers run as long-lived tmux panes. If a pane crashes or hangs, the
#   worker-bridge loop stops silently. Hermes Kanban has per-task heartbeats and
#   a reclaim sweep that re-assigns abandoned tasks. YURI has neither.
#   Fix: add a watchdog loop to worker-bridge.mjs that pings each worker every
#   60s and restarts the pane if the heartbeat fails.
#
# ISSUE 2 — Transport fragility (tmux keys >> FIFO >> probe cascade)
#   worker-tmux.mjs tries tmux first, then FIFO, then HTTP probe. But tmux
#   send-keys is fire-and-forget — there's no ACK. If tmux is slow to start
#   the workers, the first few tasks silently drop. Hermes uses a message queue
#   with idempotency keys and retry budgets.
#   Fix: add a 2s startup delay + readiness probe before accepting first task.
#
# ISSUE 3 — Single session per worker type
#   All 3 workers share one tmux session. If one worker panics and corrupts the
#   session, all 3 go down. Hermes uses isolated worker profiles per board.
#   Fix: run each worker in its own named session (yuri-codex, yuri-claude,
#   yuri-deepseek) for blast radius isolation.
