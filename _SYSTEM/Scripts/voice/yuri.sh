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

if [ -x "$BUN" ]; then
  RUNTIME="$BUN"
elif [ -x "$NODE" ]; then
  RUNTIME="$NODE"
else
  echo "❌ neither bun nor node found"; exit 1
fi

mkdir -p "$REPO/_SYSTEM/state/voice"

# Clean slate
bash "$VOICE/voice-stop.sh" 2>/dev/null || true
pkill -f "voice/orchestrator.mjs" 2>/dev/null || true
pkill -f "stt-bridge.py" 2>/dev/null || true
pkill -f "tts-bridge.py" 2>/dev/null || true
pkill -f "yuri-interrupt-listener.py" 2>/dev/null || true
rm -f /tmp/yuri-interrupt 2>/dev/null || true

cleanup() {
  trap - EXIT INT TERM HUP
  echo ""; echo "stopping Yuri…"
  pkill -f "voice/orchestrator.mjs" 2>/dev/null || true
  pkill -f "stt-bridge.py" 2>/dev/null || true
  pkill -f "tts-bridge.py" 2>/dev/null || true
  pkill -f "yuri-interrupt-listener.py" 2>/dev/null || true
  bash "$VOICE/voice-stop.sh" >/dev/null 2>&1 || true
  exit 0
}
trap cleanup EXIT INT TERM HUP

# Start the Right Command key interrupt listener (background)
"$VP" "$VOICE/yuri-interrupt-listener.py" 2>/dev/null &

echo "starting Yuri (OMP SDK brain + local STT/TTS)…"
echo "  brain:    OMP session (Composer 2.5 Fast / switchable)"
echo "  STT:      Whisper-MLX (HyperX mic, Silero VAD, 2.5s pause tolerance)"
echo "  TTS:      Kokoro-82M (XM5 headphones)"
echo "  interrupt: Right Command key (stops Yuri mid-sentence)"
echo "  stop:     Ctrl-C"
echo ""

# The orchestrator handles everything: spawns STT+TTS, creates OMP session,
# runs the voice loop. We just run it in the foreground.
exec "$RUNTIME" "$VOICE/orchestrator.mjs"
