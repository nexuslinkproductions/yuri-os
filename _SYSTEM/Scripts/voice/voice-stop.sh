#!/usr/bin/env bash
# @capability: voice-stop
# @serves: stop yuri voice | kill voice processes | clean voice restart | clear mlx orphans
# @does: cleanly stops the ENTIRE voice process set — bot.py (Pipecat), yuri-z-brain.py (GLM brain),
#        the orphan-prone voice-mlx-server.py + marvis_tts.py (stale marvis-path MLX), and any stray
#        kokoro/MLX Python processes — so a relaunch is a clean slate with NO GPU memory orphans.
#        This fixes the "killing the terminal doesn't clear it" bug: those processes are detached
#        orphans that survive terminal kill and accumulate Metal/GPU memory pressure across sessions.
# @use: bash _SYSTEM/Scripts/voice/voice-stop.sh   (run before relaunch, or yuri.sh calls it on start)
# @exports: (stopper)
set -uo pipefail
echo "stopping voice processes (clean slate)…"

# The brains (all variants — only one runs at a time, but kill all to be safe)
pkill -f "yuri-z-brain.py"     2>/dev/null && echo "  ✓ killed yuri-z-brain.py"      || true
pkill -f "claude-p-brain.py"   2>/dev/null && echo "  ✓ killed claude-p-brain.py"    || true
pkill -f "claude-brain-proxy.py" 2>/dev/null && echo "  ✓ killed claude-brain-proxy.py" || true
pkill -f "yuri-local-brain.py" 2>/dev/null && echo "  ✓ killed yuri-local-brain.py"  || true

# The voice bot (Pipecat pipeline — has the in-process Kokoro MLX model)
pkill -f "voice/bot.py"        2>/dev/null && echo "  ✓ killed bot.py"               || true

# Orphan-prone MLX servers from the retired marvis/overseer path — these are the main degradation
# cause: they run detached, hold Metal/GPU memory for DAYS, and a terminal kill never frees them.
pkill -f "voice-mlx-server.py" 2>/dev/null && echo "  ✓ killed voice-mlx-server.py (orphan)" || true
pkill -f "voice-marvis-server.py" 2>/dev/null && echo "  ✓ killed voice-marvis-server.py" || true
pkill -f "marvis_tts.py"       2>/dev/null && echo "  ✓ killed marvis_tts.py"        || true
pkill -f "voice-rick-server.py" 2>/dev/null && echo "  ✓ killed voice-rick-server.py" || true

# Stray kokoro/MLX Python processes (the in-process Kokoro sometimes leaves workers)
pkill -f "kokoro_tts"          2>/dev/null && echo "  ✓ killed stray kokoro process" || true

# Spawned WORKER terminals — owner 2026-06-19: closing Yuri tears down the worker terminals she opened
# too. Kill the worker tmux sessions (stops each worker's `ai claude-zai`), then best-effort close the
# macOS Terminal windows attached to them. Set YURI_KEEP_WORKERS=1 to leave workers running.
if [ "${YURI_KEEP_WORKERS:-0}" != "1" ]; then
  for s in "${YURI_WORKER_NAME:-worker1}" "${YURI_WORKER_SESSION:-yuri-worker}"; do
    if tmux has-session -t "$s" 2>/dev/null; then
      tmux kill-session -t "$s" 2>/dev/null && echo "  ✓ killed worker tmux session: $s" || true
    fi
  done
  # Best-effort window close: the spawn helper's `do script "tmux attach -t <name>"` leaves that
  # command in the tab's history, so we can find + close exactly those windows. Never errors; only
  # closes windows that clearly match a worker attach. `saving no` suppresses the close prompt.
  osascript >/dev/null 2>&1 <<'OSA' || true
tell application "Terminal"
  repeat with w in (every window)
    try
      repeat with t in (tabs of w)
        if (history of t) contains "tmux attach -t worker1" or (history of t) contains "tmux attach -t yuri-worker" then
          close w saving no
          exit repeat
        end if
      end repeat
    end try
  end repeat
end tell
OSA
fi

# Give the OS a moment to reclaim the Metal/GPU memory before a relaunch competes for it.
sleep 1
echo "voice processes stopped — Metal/GPU memory should be clear for a clean relaunch."
