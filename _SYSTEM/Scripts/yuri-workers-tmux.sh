#!/usr/bin/env bash
# yuri-workers-tmux.sh — launch Rick cockpit: 3 worker panes in yuri-workers tmux session
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
SESSION="yuri-workers"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Session $SESSION already running — attaching"
  tmux attach -t "$SESSION"
  exit 0
fi

# Create session with Codex pane
tmux new-session -d -s "$SESSION" -x 220 -y 50 -c "$REPO"
tmux rename-window -t "$SESSION:0" "workers"

# Pane 0: Codex CLI worker
tmux send-keys -t "$SESSION:0.0" "echo '🤖 CODEX WORKER READY — waiting for tasks'" Enter

# Pane 1: Claude CLI worker
tmux split-window -h -t "$SESSION:0" -c "$REPO"
tmux send-keys -t "$SESSION:0.1" "echo '🧠 CLAUDE WORKER READY — waiting for tasks'" Enter

# Pane 2: DeepSeek continuous queue worker.
# This keeps one stable LANE_SESSION (`marcel-deepseek`) so DeepSeek prompt-cache
# can reuse the same growing prefix across dispatches.
tmux split-window -v -t "$SESSION:0.1" -c "$REPO"
tmux send-keys -t "$SESSION:0.2" "node _SYSTEM/Scripts/worker-bridge.mjs loop --worker deepseek" Enter

tmux select-pane -t "$SESSION:0.0"
echo "✓ yuri-workers session created — run: tmux attach -t yuri-workers"
