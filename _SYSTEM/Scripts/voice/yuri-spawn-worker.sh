#!/usr/bin/env bash
# @capability: yuri-spawn-worker-window
# @serves: yuri opens a worker terminal | pop a real terminal window with claude | visible worker session
# @does: spawns a worker Z.ai Claude Code session (GLM-5.2 via `ai claude-zai`) in tmux AND opens a REAL
#        macOS Terminal window attached to it (osascript), so Marcel SEES the worker like a hand-launched
#        terminal. Yuri then drives it with `tmux send-keys -t <name>`. Optional second arg = an initial
#        task to inject. Workers run on the GLM Coding Plan (glm-5.2 default), not the paid `claude` binary.
# @use: Yuri calls this via her Bash tool: bash _SYSTEM/Scripts/voice/yuri-spawn-worker.sh worker1 "run the tests"
# @exports: (launcher)
#
# SELF-HEALING (owner 2026-06-19): a session named <NAME> can exist WITHOUT claude running in it — e.g. a
# prior launch that errored before `ai` exec'd claude leaves a bare zsh pane behind, and tmux keeps the
# session. The old `if ! has-session` guard mistook "session exists" for "worker is live", skipped the
# launch, and attached Marcel to a dead bare shell every time ("plain tmux terminal"). The fix: decide
# liveness by what's actually running in the pane (pane_current_command), NOT by session existence. If the
# pane is a bare shell, (re)launch claude into it; only reuse when claude is genuinely running.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
NAME="${1:-worker1}"
TASK="${2:-}"
# The worker model — GLM-5.2 (Opus-tier) on the Z.ai GLM Coding Plan. Override with YURI_WORKER_MODEL.
WORKER_MODEL="${YURI_WORKER_MODEL:-glm-5.2}"
AI_BIN="${REPO}/_SYSTEM/Scripts/ai"
# `ai` execs `claude --model glm-5.2`, so once this runs the pane IS the worker session. The ZAI_API_KEY
# auto-hydrates from keychain inside run_claude_zai (no inline key). Absolute AI_BIN so it resolves in a
# bare tmux shell that never loaded the `ai` alias.
LAUNCH="export ZAI_MODEL=${WORKER_MODEL} && '${AI_BIN}' claude-zai"

# pane_current_command is the liveness oracle. A running worker shows claude's process title (a version
# string like "2.1.183", verified); a bare/failed pane shows the shell ("zsh"/"bash"/"sh") or nothing.
pane_cmd() { tmux display-message -p -t "${NAME}:0.0" '#{pane_current_command}' 2>/dev/null || echo ""; }

# A shell-name (or empty) in the pane ⇒ claude is NOT running there ⇒ it needs (re)launching.
claude_running() {
  case "$(pane_cmd)" in
    zsh|bash|sh|"-"|"") return 1 ;;   # bare shell / dead pane → worker is NOT live
    *)                  return 0 ;;   # anything else = claude is up
  esac
}

# Wait for a freshly-created pane's shell to be reading stdin before we type at it (race guard — the
# original immediate send-keys usually landed, but on a slow zsh boot the launch can be dropped).
wait_for_shell() {
  local s="$1"
  for _ in $(seq 1 40); do            # up to ~4s
    case "$(tmux display-message -p -t "${s}:0.0" '#{pane_current_command}' 2>/dev/null || true)" in
      zsh|bash|sh) sleep 0.2; return 0 ;;
    esac
    sleep 0.1
  done
  sleep 0.3                           # fallthrough settle
}

# ─── ensure a live worker pane exists ──────────────────────────────────────────
if ! tmux has-session -t "$NAME" 2>/dev/null; then
  tmux new-session -d -s "$NAME" -c "$REPO" -x 220 -y 50
  wait_for_shell "$NAME"
fi

# Self-heal: session may exist with a BARE shell (prior failed/ended launch). Don't attach to a dead pane —
# relaunch claude into it. Only skip the launch when claude is genuinely already running (reuse).
if ! claude_running; then
  tmux send-keys -t "$NAME:0.0" -l "$LAUNCH"
  tmux send-keys -t "$NAME:0.0" Enter
fi

# Pop a real Terminal window attached to the worker so Marcel can watch it (like a hand-opened terminal).
osascript >/dev/null 2>&1 <<OSA
tell application "Terminal"
  do script "tmux attach -t ${NAME}"
  activate
end tell
OSA

# Inject the task ONLY after Claude Code has actually booted (pane flips zsh → claude), so the keystroke
# lands in claude's prompt — not a bare shell, not the boot screen. GLM-5.2 cold boot is ~5-10s.
if [ -n "$TASK" ]; then
  for _ in $(seq 1 60); do            # up to ~30s
    claude_running && break
    sleep 0.5
  done
  sleep 1                             # let the TUI/prompt settle before typing
  tmux send-keys -t "$NAME:0.0" -l "$TASK"
  tmux send-keys -t "$NAME:0.0" Enter
fi
echo "worker '$NAME' on GLM-5.2 is live and a Terminal window opened${TASK:+ (task sent)}"
