#!/usr/bin/env bash
# @capability: yuri-session-launcher
# @serves: launch yuri | start yuri voice
# @does: Yuri voice assistant. Composer 2.5 brain in background OMP (tmux).
#        Composer calls voice_listen/voice_speak/voice_screenshot MCP tools.
#        Native vision, full OMP tools. Invisible — talk by voice, hear voice back.
# @use: yuri   Ctrl-C stops.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VOICE="$REPO/_SYSTEM/Scripts/voice"
OMP_BIN="${OMP_BIN:-$(command -v omp 2>/dev/null || echo "$HOME/.bun/bin/omp")}"
mkdir -p "$REPO/_SYSTEM/state/voice"

bash "$VOICE/voice-stop.sh" 2>/dev/null || true
tmux kill-session -t yuri-brain 2>/dev/null || true

cleanup() {
  trap - EXIT INT TERM HUP
  echo ""; echo "stopping Yuri…"
  tmux kill-session -t yuri-brain 2>/dev/null || true
  bash "$VOICE/voice-stop.sh" >/dev/null 2>&1 || true
  pkill -f voice-mcp-server.py 2>/dev/null || true
  exit 0
}
trap cleanup EXIT INT TERM HUP

# ── Composer 2.5 via voice MCP tools ──
echo "starting Yuri (Composer 2.5 + voice MCP, ~20s boot)…"

# Short prompt = faster boot. Acknowledgment-first = no silence gaps.
# Short timeouts = no provider stream stalls.
tmux new-session -d -s yuri-brain -x 200 -y 50 "cd '$REPO' && '$OMP_BIN' 'You are Yuri, Marcel voice assistant on Composer 2.5. Loop forever:
1. voice_listen(timeout_secs=10) — hear Marcel
2. voice_speak a 2-3 word acknowledgment (got it, checking, hmm) IMMEDIATELY
3. think + use tools (voice_screenshot to see screen, bash, read)
4. voice_speak your full response — concise, natural speech
5. voice_listen again. If no speech, retry immediately.
Never stop. You are Yuri not Claude. Be sharp, no filler.'"

echo "  talk to Yuri — she is listening"
echo "  debug: tmux attach -t yuri-brain  (Ctrl-b d)"
echo "  stop: Ctrl-C"
echo ""

while tmux has-session -t yuri-brain 2>/dev/null; do
  sleep 2
done
echo "session ended."
