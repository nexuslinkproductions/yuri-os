#!/usr/bin/env bash
# @capability: voice-loop-launcher
# @serves: start voice loop | run rick voice agent | launch pipecat voice
# @does: orchestrates the realtime voice loop — arms bridge mode, starts the Claude brain-proxy, runs the Pipecat bot. Run this in a SECOND terminal; your FIRST terminal runs `tmux new -s claude && claude`.
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

# 2. brain-proxy (stdlib python, drives the tmux claude pane) — background
if ! pgrep -f claude-brain-proxy.py >/dev/null 2>&1; then
  ( python3 "$VOICE/claude-brain-proxy.py" >"$REPO/_SYSTEM/state/voice/brain-proxy.log" 2>&1 & )
  echo "started brain-proxy -> :8011 (log: _SYSTEM/state/voice/brain-proxy.log)"
fi

echo "target claude pane: $VOICE_TMUX_TARGET   (override with VOICE_TMUX_TARGET=session:win.pane)"
echo "loading the voice bot (mic/speaker, Marvis warm-up ~5s)…  Ctrl-C to stop."
exec "$VP" "$VOICE/bot.py"
