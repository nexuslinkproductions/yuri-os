#!/usr/bin/env bash
# @capability: yuri-local-session-launcher
# @serves: launch yuri local | start yuri on llama | snappy local yuri | talk to yuri offline
# @does: Yuri's brain = a LOCAL Ollama model (default llama3.2, ~0.7s warm) on :8013 — on-device, $0,
#        private, snappy (no claude -p spawn lag). Persisted rolling-transcript memory across turns +
#        restarts. Same Pipecat voice loop + Kokoro voice as `yuri`; only the brain differs.
# @use: bash _SYSTEM/Scripts/voice/yuri-local.sh   (alias: yuri-local). Ctrl-C stops.
#        Swap model: YURI_LOCAL_MODEL=phi4-mini:latest bash .../yuri-local.sh
# @exports: (launcher)
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VOICE="$REPO/_SYSTEM/Scripts/voice"
VP="$REPO/_SYSTEM/state/voice/.venv-pipecat/bin/python"
MODEL="${YURI_LOCAL_MODEL:-llama3.2:latest}"   # parked on the working snappy model (local-SLM voice on hold until a hw upgrade)
mkdir -p "$REPO/_SYSTEM/state/voice"
rm -f "$REPO/_SYSTEM/state/voice/tts.paused" 2>/dev/null || true   # never let the pause flag mute her
[ -x "$VP" ] || { echo "❌ venv missing — run setup-pipecat.sh"; exit 1; }
command -v ollama >/dev/null || { echo "❌ ollama not installed"; exit 1; }

# Only ONE brain at a time (lesson: simultaneous models thrash an M2 Pro). Retire any other brain.
pkill -f claude-p-brain.py 2>/dev/null || true
pkill -f claude-brain-proxy.py 2>/dev/null || true
pkill -f yuri-local-brain.py 2>/dev/null || true

export YURI_LOCAL_MODEL="$MODEL"
( python3 "$VOICE/yuri-local-brain.py" >"$REPO/_SYSTEM/state/voice/yuri-local-brain.log" 2>&1 & )
sleep 1
curl -s --max-time 5 http://127.0.0.1:8013/health >/dev/null 2>&1 \
  && echo "brain -> ollama $MODEL (:8013, on-device, \$0, snappy)" \
  || echo "⚠ brain not answering on :8013 — check _SYSTEM/state/voice/yuri-local-brain.log"

export BRAIN_PROXY_URL="http://127.0.0.1:8013/v1"
echo "loading the voice loop (mic/speaker, MLX warm-up ~15s)…  Ctrl-C stops."
exec "$VP" "$VOICE/bot.py"
