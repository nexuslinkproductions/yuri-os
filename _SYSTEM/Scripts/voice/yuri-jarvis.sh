#!/usr/bin/env bash
# @capability: yuri-jarvis-launcher
# @serves: start yuri jarvis mode | voice plus worker dispatch | yuri controls the worker by voice
# @does: launches the Yuri voice loop with the GLM brain (:8014) and worker DISPATCH enabled
#        (YURI_DISPATCH=1). Restarts the GLM brain so the dispatch capability takes effect, then runs
#        the voice bot. Yuri can inject prompts into the tmux worker (start it separately with
#        yuri-worker.sh) via send-keys. Uses the GLM brain — NEVER claude-p-brain.py (retired).
# @use: terminal 1: bash _SYSTEM/Scripts/voice/yuri-worker.sh   (the worker you watch)
#       terminal 2: bash _SYSTEM/Scripts/voice/yuri-jarvis.sh   (voice + dispatch)
#       then: "Yuri, have the worker run the tests" → she composes the prompt + injects it.
# @exports: (launcher)
set -uo pipefail
VOICE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The GLM brain (:8014) reads YURI_DISPATCH at startup — restart it so dispatch mode is live.
# We kill + relaunch via yuri.sh's brain-start logic (which targets :8014, never claude -p).
export YURI_DISPATCH=1
export YURI_WORKER_TARGET="${YURI_WORKER_TARGET:-yuri-worker:0.0}"
echo "🤖 JARVIS mode: Yuri can dispatch to worker '$YURI_WORKER_TARGET' (start it with yuri-worker.sh)."
# Delegate to yuri.sh which starts the GLM brain (:8014) + the voice loop. It reads YURI_DISPATCH.
exec bash "$VOICE/yuri.sh"
