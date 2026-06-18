#!/usr/bin/env bash
# @capability: yuri-spawn-worker-window
# @serves: yuri opens a worker terminal | pop a real terminal window with claude | visible worker session
# @does: spawns a worker Claude Code session in tmux AND opens a REAL macOS Terminal window attached to
#        it (osascript), so Marcel SEES the worker like a hand-launched terminal. Yuri then drives it with
#        `tmux send-keys -t <name>`. Optional second arg = an initial task to inject.
# @use: Yuri calls this via her Bash tool: bash _SYSTEM/Scripts/voice/yuri-spawn-worker.sh worker1 "run the tests"
# @exports: (launcher)
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
NAME="${1:-worker1}"
TASK="${2:-}"

if ! tmux has-session -t "$NAME" 2>/dev/null; then
  tmux new-session -d -s "$NAME" -c "$REPO" -x 220 -y 50
  tmux send-keys -t "$NAME:0.0" -l "claude"
  tmux send-keys -t "$NAME:0.0" Enter
fi

# Pop a real Terminal window attached to the worker so Marcel can watch it (like a hand-opened terminal).
osascript >/dev/null 2>&1 <<OSA
tell application "Terminal"
  do script "tmux attach -t ${NAME}"
  activate
end tell
OSA

# Give claude a moment to boot, then inject the optional first task.
sleep 4
if [ -n "$TASK" ]; then
  tmux send-keys -t "$NAME:0.0" -l "$TASK"
  tmux send-keys -t "$NAME:0.0" Enter
fi
echo "worker '$NAME' is up and a Terminal window opened${TASK:+ (task sent)}"
