#!/usr/bin/env bash
# @capability: yuri-voice-launcher
# @serves: start yuri voice loop | run jarvis voice | launch pipecat free brain | talk to yuri
# @does: the FREE JARVIS voice loop — starts claude-p-brain (:8012, `claude -p` headless on the Max
#        subscription, $0) if it isn't up, health-checks it, then runs the Pipecat bot (mic -> Silero VAD
#        + smart-turn -> MLX Whisper STT -> claude-p-brain -> Marvis TTS -> speaker). No tmux, no bridge.
# @use: bash _SYSTEM/Scripts/voice/run-yuri.sh   — then just talk. Ctrl-C stops the bot (brain stays up).
#        Override the brain with BRAIN_PROXY_URL=http://127.0.0.1:8011/v1 to use the tmux live-session path.
# @exports: (launcher)
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VOICE="$REPO/_SYSTEM/Scripts/voice"
VP="$REPO/_SYSTEM/state/voice/.venv-pipecat/bin/python"
BRAIN_PORT="${CLAUDE_P_BRAIN_PORT:-8012}"
BRAIN_URL="${BRAIN_PROXY_URL:-http://127.0.0.1:${BRAIN_PORT}/v1}"

[ -x "$VP" ] || { echo "❌ venv missing — run setup-pipecat.sh first ($VP)"; exit 1; }
mkdir -p "$REPO/_SYSTEM/state/voice"

# 1. free brain: claude-p-brain (:8012). Only start it if we're using the default port path.
if [[ "$BRAIN_URL" == *":${BRAIN_PORT}/"* ]]; then
  if ! pgrep -f claude-p-brain.py >/dev/null 2>&1; then
    ( python3 "$VOICE/claude-p-brain.py" >"$REPO/_SYSTEM/state/voice/claude-p-brain.log" 2>&1 & )
    echo "started claude-p-brain -> :${BRAIN_PORT} (free, log: _SYSTEM/state/voice/claude-p-brain.log)"
    sleep 2
  fi
  if ! curl -s --max-time 5 "http://127.0.0.1:${BRAIN_PORT}/health" >/dev/null 2>&1; then
    echo "❌ brain not answering on :${BRAIN_PORT} — check _SYSTEM/state/voice/claude-p-brain.log"; exit 1
  fi
  echo "brain OK -> :${BRAIN_PORT} (claude -p, Max subscription, \$0)"
else
  echo "brain (override) -> $BRAIN_URL"
fi

export BRAIN_PROXY_URL="$BRAIN_URL"
echo "loading the voice bot (mic/speaker, MLX Whisper + Marvis warm-up ~5-10s)…  Ctrl-C to stop."
exec "$VP" "$VOICE/bot.py"
