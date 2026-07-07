#!/usr/bin/env bash
# @capability: yuri-session-launcher
# @does: Yuri voice assistant v2. OMP SDK brain + Python STT/TTS bridges.
#        The orchestrator (Bun/Node) embeds OMP, spawns STT+TTS subprocesses,
#        streams text_delta from the brain to TTS. No tmux, no capture, no proxy.
#        Right Command key = interrupt Yuri mid-sentence (barge-in).
# @use: yuri   (alias). Ctrl-C stops everything.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VOICE="$REPO/_SYSTEM/Scripts/voice"
VP="$REPO/_SYSTEM/state/voice/.venv-pipecat/bin/python"
BUN="${BUN:-$(command -v bun 2>/dev/null || echo "$HOME/.bun/bin/bun")}"
NODE="${NODE:-$(command -v node)}"
RUNTIME=""
PID_FILE="$REPO/_SYSTEM/state/voice/yuri-orchestrator.pid"

if [ -x "$BUN" ]; then
  RUNTIME="$BUN"
elif [ -x "$NODE" ]; then
  RUNTIME="$NODE"
else
  echo "❌ neither bun nor node found"; exit 1
fi

mkdir -p "$REPO/_SYSTEM/state/voice"

# Clean slate — SIGKILL (SIGTERM is ignored by native-spun processes that block the event loop)
bash "$VOICE/voice-stop.sh" 2>/dev/null || true
pkill -9 -f "voice/orchestrator.mjs" 2>/dev/null || true
pkill -9 -f "stt-bridge.py" 2>/dev/null || true
pkill -9 -f "tts-bridge.py" 2>/dev/null || true
pkill -f "yuri-interrupt-listener.py" 2>/dev/null || true
rm -f /tmp/yuri-interrupt 2>/dev/null || true

# Singleton guard — kill a stale orchestrator recorded in the PID file
if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    if ps -o command= -p "$OLD_PID" 2>/dev/null | grep -q "orchestrator.mjs"; then
      echo "⚠️  stale Yuri orchestrator (PID $OLD_PID) still running — SIGKILL"
      kill -9 "$OLD_PID" 2>/dev/null || true
      sleep 1
    fi
  fi
  rm -f "$PID_FILE"
fi

cleanup() {
  trap - EXIT INT TERM HUP
  echo ""; echo "stopping Yuri…"
  pkill -9 -f "voice/orchestrator.mjs" 2>/dev/null || true
  pkill -9 -f "stt-bridge.py" 2>/dev/null || true
  pkill -9 -f "tts-bridge.py" 2>/dev/null || true
  pkill -f "yuri-interrupt-listener.py" 2>/dev/null || true
  bash "$VOICE/voice-stop.sh" >/dev/null 2>&1 || true
  rm -f "$PID_FILE"
  exit 0
}
trap cleanup EXIT INT TERM HUP

# Start the Right Command key interrupt listener (background)
"$VP" "$VOICE/yuri-interrupt-listener.py" 2>/dev/null &

echo "starting Yuri (OMP SDK brain + local STT/TTS)…"
echo "  brain:    OMP session (GLM-5.2 / switchable)"
echo "  STT:      Whisper-MLX (HyperX mic, Silero VAD, 2.5s pause tolerance)"
echo "  TTS:      Kokoro-82M (XM5 headphones)"
echo "  interrupt: Right Command key (stops Yuri mid-sentence)"
echo "  stop:     Ctrl-C"
echo ""

# The orchestrator handles everything: spawns STT+TTS, creates OMP session,
# runs the voice loop. Launch in background so we can record the PID, then wait
# so Ctrl-C still works in the foreground.
"$RUNTIME" "$VOICE/orchestrator.mjs" &
ORCH_PID=$!
echo "$ORCH_PID" > "$PID_FILE"
wait "$ORCH_PID"
EXIT_CODE=$?
rm -f "$PID_FILE"
exit "$EXIT_CODE"