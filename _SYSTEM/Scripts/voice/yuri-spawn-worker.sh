#!/usr/bin/env bash
# @capability: yuri-spawn-worker-window
# @serves: yuri opens a worker terminal | pop a real terminal window with claude | visible worker session
# @does: spawns a worker Z.ai Claude Code session (GLM-5.2 via `ai claude-zai`) in tmux AND opens a REAL
#        macOS Terminal window attached to it (osascript), so Marcel SEES the worker like a hand-launched
#        terminal. Yuri then drives it with `tmux send-keys -t <name>`. Optional second arg = an initial
#        task to inject. Workers run on the GLM Coding Plan (glm-5.2 default), not the paid `claude` binary.
# @use: Yuri calls this via her Bash tool: bash _SYSTEM/Scripts/voice/yuri-spawn-worker.sh worker1 "run the tests"
# @exports: (launcher)
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
NAME="${1:-worker1}"
TASK="${2:-}"
# The worker model — GLM-5.2 (Opus-tier) on the Z.ai GLM Coding Plan. Override with YURI_WORKER_MODEL.
WORKER_MODEL="${YURI_WORKER_MODEL:-glm-5.2}"

if ! tmux has-session -t "$NAME" 2>/dev/null; then
  tmux new-session -d -s "$NAME" -c "$REPO" -x 220 -y 50
  # Worker = a Z.ai Claude Code session (GLM-5.2), not the paid `claude` binary. ZAI_MODEL is exported
  # in-line so run_claude_zai picks up the model at launch. Absolute path to the `ai` launcher so it
  # resolves even in a bare tmux shell that didn't load the alias. The ZAI_API_KEY hydrates from
  # keychain inside the `ai` script's key hydration block (run_claude_zai → security find-generic-password).
  tmux send-keys -t "$NAME:0.0" -l "export ZAI_MODEL=${WORKER_MODEL} && '${REPO}/_SYSTEM/Scripts/ai' claude-zai"
  tmux send-keys -t "$NAME:0.0" Enter
fi

# Pop a real Terminal window attached to the worker so Marcel can watch it (like a hand-opened terminal).
osascript >/dev/null 2>&1 <<OSA
tell application "Terminal"
  do script "tmux attach -t ${NAME}"
  activate
end tell
OSA

# Wait for the GLM session to be ready (keychain hydrate + Claude Code boot + splash), then inject the
# task. GLM-5.2 cold boot is ~5-10s in a fresh tmux; we wait conservatively, then inject.
sleep 9
if [ -n "$TASK" ]; then
  tmux send-keys -t "$NAME:0.0" -l "$TASK"
  tmux send-keys -t "$NAME:0.0" Enter
fi
echo "worker '$NAME' is up on GLM-5.2 and a Terminal window opened${TASK:+ (task sent)}"
