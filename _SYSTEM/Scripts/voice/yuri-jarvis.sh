#!/usr/bin/env bash
# @capability: yuri-jarvis-launcher
# @serves: start yuri jarvis mode | voice plus worker dispatch | yuri controls the worker by voice
# @does: launches the Yuri voice loop with worker DISPATCH enabled (YURI_DISPATCH=1). Restarts the
#        brain so the dispatch capability takes effect, then runs the voice bot. Yuri can now inject
#        prompts into the tmux worker (start it separately with yuri-worker.sh) via send-keys.
# @use: terminal 1: bash _SYSTEM/Scripts/voice/yuri-worker.sh   (the worker you watch)
#       terminal 2: bash _SYSTEM/Scripts/voice/yuri-jarvis.sh   (voice + dispatch)
#       then: "Yuri, have the worker run the tests" → she composes the prompt + injects it.
# @exports: (launcher)
set -uo pipefail
VOICE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Brain reads YURI_DISPATCH at startup — restart it so dispatch mode is live.
pkill -f claude-p-brain.py 2>/dev/null && echo "restarting brain in dispatch mode…" || true
export YURI_DISPATCH=1
export YURI_WORKER_TARGET="${YURI_WORKER_TARGET:-yuri-worker:0.0}"
echo "🤖 JARVIS mode: Yuri can dispatch to worker '$YURI_WORKER_TARGET' (start it with yuri-worker.sh)."
exec bash "$VOICE/run-yuri.sh"
