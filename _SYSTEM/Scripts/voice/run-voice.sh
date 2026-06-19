#!/usr/bin/env bash
# @capability: voice-loop-launcher
# @serves: start voice loop | run rick voice agent | launch pipecat voice
# @does: orchestrates the realtime voice loop — arms bridge mode, starts the GLM brain (:8014, Z.ai
#        GLM Coding Plan), runs the Pipecat bot. Run this in a SECOND terminal.
# @use: bash run-voice.sh   (after the one-time setup-pipecat.sh + a rick-ref.wav)
# @exports: (launcher)
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VOICE="$REPO/_SYSTEM/Scripts/voice"
VP="$REPO/_SYSTEM/state/voice/.venv-pipecat/bin/python"
export VOICE_TMUX_TARGET="${VOICE_TMUX_TARGET:-claude:0.0}"

# 1. arm: Stop hook fires (voice-loop.enabled) AND routes replies to the FIFO (bridge.enabled)
mkdir -p "$REPO/_SYSTEM/state/voice"
: > "$REPO/_SYSTEM/state/voice/voice-loop.enabled"
: > "$REPO/_SYSTEM/state/voice/bridge.enabled"

# 2. GLM brain (yuri-z-brain.py :8014) — the ONE brain. claude-brain-proxy.py (:8011) is retired.
# Start it if it isn't up.
if ! pgrep -f yuri-z-brain.py >/dev/null 2>&1; then
  ( python3 "$VOICE/yuri-z-brain.py" >"$REPO/_SYSTEM/state/voice/yuri-z-brain.log" 2>&1 & )
  echo "started GLM brain -> :8014 (log: _SYSTEM/state/voice/yuri-z-brain.log)"
fi
export BRAIN_PROXY_URL="http://127.0.0.1:8014/v1"

echo "target claude pane: $VOICE_TMUX_TARGET   (override with VOICE_TMUX_TARGET=session:win.pane)"
echo "loading the voice bot (mic/speaker, MLX Whisper + Kokoro warm-up ~10s)…  Ctrl-C to stop."
exec "$VP" "$VOICE/bot.py"
