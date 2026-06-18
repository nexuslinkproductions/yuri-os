#!/usr/bin/env bash
# @capability: yuri-worker-launcher
# @serves: start yuri worker session | tmux claude worker | jarvis worker terminal | session yuri dispatches into
# @does: creates (or re-attaches) a tmux session running the Claude Code CLI in the repo. Yuri's voice
#        brain injects prompts into this pane via `tmux send-keys` (YURI_DISPATCH=1); you watch it work.
# @use: terminal 1: bash _SYSTEM/Scripts/voice/yuri-worker.sh  (detach Ctrl-b d, it keeps running).
#       terminal 2: YURI_DISPATCH=1 bash _SYSTEM/Scripts/voice/run-yuri.sh  (voice loop that can dispatch).
# @exports: (launcher)
set -uo pipefail
SESSION="${YURI_WORKER_SESSION:-yuri-worker}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "worker session '$SESSION' already running — attaching (Yuri dispatches into $SESSION:0.0)."
else
  tmux new-session -d -s "$SESSION" -c "$REPO" -x 220 -y 50
  tmux send-keys -t "$SESSION:0.0" -l "claude"
  tmux send-keys -t "$SESSION:0.0" Enter
  echo "started worker '$SESSION' (claude launching in $REPO). Yuri dispatches into $SESSION:0.0."
  echo "say e.g. \"Yuri, have the worker run the test suite\" from the voice loop."
fi
exec tmux attach -t "$SESSION"
