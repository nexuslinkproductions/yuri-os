#!/usr/bin/env bash
# @capability: yuri-worker-launcher
# @serves: start yuri worker session | tmux claude worker | jarvis worker terminal | session yuri dispatches into
# @does: creates (or re-attaches) a tmux session running a Z.ai Claude Code session (GLM-5.2 via
#        `ai claude-zai`) in the repo — NOT the paid `claude` binary. Workers run on the GLM Coding
#        Plan, default model glm-5.2 (Opus-tier). Yuri's voice brain injects prompts into this pane
#        via `tmux send-keys` (YURI_DISPATCH=1); you watch it work.
# @use: terminal 1: bash _SYSTEM/Scripts/voice/yuri-worker.sh  (detach Ctrl-b d, it keeps running).
#       terminal 2: bash _SYSTEM/Scripts/voice/yuri-jarvis.sh   (voice + dispatch).
# @exports: (launcher)
set -uo pipefail
SESSION="${YURI_WORKER_SESSION:-yuri-worker}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "worker session '$SESSION' already running — attaching (Yuri dispatches into $SESSION:0.0)."
else
  tmux new-session -d -s "$SESSION" -c "$REPO" -x 220 -y 50
  # Worker = a Z.ai Claude Code session on GLM-5.2 (Opus-tier on the GLM Coding Plan), NOT the paid
  # `claude` binary. ZAI_MODEL is exported BEFORE the launch so run_claude_zai picks it up. Absolute
  # path to the `ai` launcher so it resolves even in a bare tmux shell that didn't load the alias.
  # The worker has its OWN permission prompts (it is a watched main session, not a bypass session).
  tmux send-keys -t "$SESSION:0.0" -l "export ZAI_MODEL=glm-5.2 && '$REPO/_SYSTEM/Scripts/ai' claude-zai"
  tmux send-keys -t "$SESSION:0.0" Enter
  echo "started worker '$SESSION' (GLM-5.2 Claude Code launching in $REPO). Yuri dispatches into $SESSION:0.0."
  echo "say e.g. \"Yuri, have the worker run the test suite\" from the voice loop."
fi
exec tmux attach -t "$SESSION"
