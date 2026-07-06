#!/usr/bin/env bash
# @capability: yuri-session-launcher
# @does: Yuri voice assistant. Composer 2.5 Fast in background OMP.
# @use: yuri   Ctrl-C stops.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VOICE="$REPO/_SYSTEM/Scripts/voice"
OMP_BIN="${OMP_BIN:-$(command -v omp 2>/dev/null || echo "$HOME/.bun/bin/omp")}"
mkdir -p "$REPO/_SYSTEM/state/voice"

bash "$VOICE/voice-stop.sh" 2>/dev/null || true
tmux kill-session -t yuri-brain 2>/dev/null || true
pkill -f voice-serve.py 2>/dev/null || true
rm -f /tmp/yuri-voice.sock 2>/dev/null || true

cleanup() {
  trap - EXIT INT TERM HUP
  echo ""; echo "stopping Yuri…"
  tmux kill-session -t yuri-brain 2>/dev/null || true
  pkill -f voice-serve.py 2>/dev/null || true
  bash "$VOICE/voice-stop.sh" >/dev/null 2>&1 || true
  exit 0
}
trap cleanup EXIT INT TERM HUP

echo "starting Yuri (Composer 2.5 Fast, voice daemon, ~15s first-call boot)…"

# ULTRA-MINIMAL prompt — just the loop. No exploration, no file reading, no grepping.
# Composer must ONLY: listen → speak → listen. Nothing else unless asked.
tmux new-session -d -s yuri-brain -x 200 -y 50 "cd '$REPO' && '$OMP_BIN' 'You are Yuri. Marcel talks to you by voice.

Repeat forever:
1. Call voice_listen to hear Marcel
2. Call voice_speak with your reply — keep it short, natural, conversational
3. Call voice_listen again

Rules:
- ONLY use voice_listen and voice_speak. Do NOT use bash, read, grep, or any file tools unless Marcel explicitly asks you to do something on the computer.
- Keep replies SHORT — 1-3 sentences max. This is a voice conversation, not a text report.
- If voice_listen returns (no speech detected), call it again immediately.
- You are Yuri, not Claude. Be direct, warm, no filler.
- To see the screen, call voice_screenshot. Use it ONLY when Marcel asks what you see.'"

echo "  talk to Yuri — she is listening"
echo "  debug: tmux attach -t yuri-brain  (Ctrl-b d)"
echo "  stop: Ctrl-C"
echo ""

while tmux has-session -t yuri-brain 2>/dev/null; do
  sleep 2
done
echo "session ended."
