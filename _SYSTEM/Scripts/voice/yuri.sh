#!/usr/bin/env bash
# @capability: yuri-session-launcher
# @serves: launch yuri | start yuri voice | talk to yuri
# @does: Yuri's brain = headless `claude -p` on the Max subscription (:8012, free, RELIABLE
#        request/response — replies stream straight back to TTS). Dispatch enabled so Yuri spawns +
#        controls VISIBLE worker terminals on request. (The live-session/tmux bridge couldn't keep up
#        with real-time voice — one interactive session lagged + hung; headless is the proven path.)
# @use: bash _SYSTEM/Scripts/voice/yuri.sh   (alias: yuri). Ctrl-C stops.
# @exports: (launcher)
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VOICE="$REPO/_SYSTEM/Scripts/voice"
VP="$REPO/_SYSTEM/state/voice/.venv-pipecat/bin/python"
mkdir -p "$REPO/_SYSTEM/state/voice"
rm -f "$REPO/_SYSTEM/state/voice/tts.paused" 2>/dev/null || true   # never let the pause flag mute her
[ -x "$VP" ] || { echo "❌ venv missing — run setup-pipecat.sh"; exit 1; }

# Brain: headless claude -p (:8012) — the pure conversational Yuri. Dispatch is OFF by default so her
# voice stays natural (the task-routing instructions change her tone); set YURI_DISPATCH=1 to enable
# worker spawning when you want it.
pkill -f claude-brain-proxy.py 2>/dev/null || true   # retire the fragile live-session bridge
pkill -f claude-p-brain.py 2>/dev/null || true
( python3 "$VOICE/claude-p-brain.py" >"$REPO/_SYSTEM/state/voice/claude-p-brain.log" 2>&1 & )
sleep 1
curl -s --max-time 5 http://127.0.0.1:8012/health >/dev/null 2>&1 \
  && echo "brain -> claude -p (:8012, Max subscription, \$0)" \
  || echo "⚠ brain not answering on :8012 — check _SYSTEM/state/voice/claude-p-brain.log"

export BRAIN_PROXY_URL="http://127.0.0.1:8012/v1"
echo "loading the voice loop (mic/speaker, MLX warm-up ~15s)…  Ctrl-C stops."
exec "$VP" "$VOICE/bot.py"
