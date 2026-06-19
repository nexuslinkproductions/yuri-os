#!/usr/bin/env bash
# @capability: yuri-voice-launcher
# @serves: start yuri voice loop | run jarvis voice | launch brain + voice | talk to yuri
# @does: the JARVIS voice loop — starts the GLM brain (yuri-z-brain.py :8014, Z.ai GLM Coding Plan,
#        $0) if it isn't up, health-checks it, then runs the Pipecat bot (mic -> Silero VAD + smart-turn
#        -> MLX Whisper STT -> GLM brain -> Kokoro TTS -> speaker). NEVER starts claude-p-brain.py
#        (retired — claude -p is a forbidden launch shape). The GLM brain (:8014) is the ONE brain.
# @use: bash _SYSTEM/Scripts/voice/run-yuri.sh   — then just talk. Ctrl-C stops the bot (brain stays up).
#        Override the brain URL with BRAIN_PROXY_URL (rarely needed — the default IS the GLM brain).
# @exports: (launcher)
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VOICE="$REPO/_SYSTEM/Scripts/voice"
VP="$REPO/_SYSTEM/state/voice/.venv-pipecat/bin/python"
BRAIN_PORT="8014"   # GLM brain (the ONE brain — claude-p-brain :8012 is retired)
BRAIN_URL="${BRAIN_PROXY_URL:-http://127.0.0.1:${BRAIN_PORT}/v1}"

[ -x "$VP" ] || { echo "❌ venv missing — run setup-pipecat.sh first ($VP)"; exit 1; }
mkdir -p "$REPO/_SYSTEM/state/voice"

# 1. The GLM brain (yuri-z-brain.py :8014). Start it if it isn't up. NEVER claude-p-brain.py.
if [[ "$BRAIN_URL" == *":${BRAIN_PORT}/"* ]]; then
  if ! pgrep -f yuri-z-brain.py >/dev/null 2>&1; then
    ( python3 "$VOICE/yuri-z-brain.py" >"$REPO/_SYSTEM/state/voice/yuri-z-brain.log" 2>&1 & )
    echo "started yuri-z-brain -> :${BRAIN_PORT} (GLM, log: _SYSTEM/state/voice/yuri-z-brain.log)"
    sleep 2
  fi
  if ! curl -s --max-time 5 "http://127.0.0.1:${BRAIN_PORT}/health" >/dev/null 2>&1; then
    echo "❌ GLM brain not answering on :${BRAIN_PORT} — check _SYSTEM/state/voice/yuri-z-brain.log"; exit 1
  fi
  echo "brain OK -> :${BRAIN_PORT} (Z.ai GLM, Coding Plan, \$0)"
else
  echo "brain (override) -> $BRAIN_URL"
fi

export BRAIN_PROXY_URL="$BRAIN_URL"
echo "loading the voice bot (mic/speaker, MLX Whisper + Kokoro warm-up ~10-15s)…  Ctrl-C to stop."
exec "$VP" "$VOICE/bot.py"
