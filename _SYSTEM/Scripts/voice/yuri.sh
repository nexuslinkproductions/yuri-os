#!/usr/bin/env bash
# @capability: yuri-session-launcher
# @serves: launch yuri | start yuri voice | talk to yuri
# @does: Yuri voice assistant. Composer 2.5 brain running in background OMP (tmux).
#        Composer calls voice_listen/voice_speak/voice_screenshot MCP tools directly.
#        Native vision (real screenshots, no GLM intermediary), full OMP tool access.
#        Invisible — talk by voice, hear voice back. tmux attach -t yuri-brain to debug.
#        Fallback: YURI_BRAIN=zai yuri uses the GLM brain (no vision).
# @use: yuri   (alias). Ctrl-C stops everything.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VOICE="$REPO/_SYSTEM/Scripts/voice"
VP="$REPO/_SYSTEM/state/voice/.venv-pipecat/bin/python"
OMP_BIN="${OMP_BIN:-$(command -v omp 2>/dev/null || echo "$HOME/.bun/bin/omp")}"
mkdir -p "$REPO/_SYSTEM/state/voice"
[ -x "$VP" ] || { echo "❌ venv missing — run setup-pipecat.sh"; exit 1; }

# Clean slate
bash "$VOICE/voice-stop.sh" 2>/dev/null || true
tmux kill-session -t yuri-brain 2>/dev/null || true

YURI_BRAIN="${YURI_BRAIN:-omp-voice}"

cleanup() {
  trap - EXIT INT TERM HUP
  echo ""; echo "stopping Yuri…"
  tmux kill-session -t yuri-brain 2>/dev/null || true
  bash "$VOICE/voice-stop.sh" >/dev/null 2>&1 || true
  pkill -f voice-mcp-server.py 2>/dev/null || true
  exit 0
}
trap cleanup EXIT INT TERM HUP

if [ "$YURI_BRAIN" = "omp-voice" ]; then
  # ── Composer 2.5 via voice MCP tools (DEFAULT) ──
  echo "starting Yuri — Composer 2.5 brain with voice MCP tools…"

  # The voice-loop prompt: Composer calls voice_listen → think → voice_speak → loop
  tmux new-session -d -s yuri-brain -x 200 -y 50 "cd '$REPO' && '$OMP_BIN' 'You are Yuri — Marcel Spatz voice assistant running on Composer 2.5. You are NOT Claude.

Your job: have a continuous voice conversation with Marcel. Loop forever:
1. Call voice_listen() — this blocks until Marcel speaks, then returns his words
2. Think about what he said — use your tools (voice_screenshot to see his screen, bash, read, grep, list_windows) as needed
3. Call voice_speak() with your response — concise, natural spoken English. Full personality: sharp, direct, adversarial-ally. No filler.
4. Call voice_listen() again. Repeat forever.

To see his screen: call voice_screenshot() — it returns the actual image. Describe what you genuinely see.

You are always on, always listening. If voice_listen returns (no speech detected), call it again. Never give up, never stop the loop.'"

  echo ""
  echo "brain -> Composer 2.5 (voice MCP, booting ~20s)"
  echo "  talk to Yuri — she is listening"
  echo "  debug: tmux attach -t yuri-brain  (detach: Ctrl-b d)"
  echo "  stop: Ctrl-C"
  echo ""

  # Keep the script alive until the OMP session dies or Ctrl-C
  while tmux has-session -t yuri-brain 2>/dev/null; do
    sleep 2
  done
  echo "OMP session ended."
  exit 0
fi

# ── Fallback: GLM brain (yuri-z-brain.py) + Pipecat voice loop ──
if [ "$YURI_BRAIN" = "zai" ]; then
  pkill -f yuri-z-brain.py 2>/dev/null || true
  export YURI_Z_UNIFIED_GATE="${YURI_Z_UNIFIED_GATE:-1}"
  python3 "$VOICE/yuri-z-brain.py" >"$REPO/_SYSTEM/state/voice/yuri-z-brain.log" 2>&1 &
  sleep 2
  _HEALTH=$(curl -s --max-time 5 http://127.0.0.1:8014/health 2>/dev/null)
  if [ -n "$_HEALTH" ]; then
    _PROVIDER=$(echo "$_HEALTH" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"{d.get('provider','?')}/{d.get('active_model', d.get('model','?'))}\")" 2>/dev/null || echo "?")
    echo "brain -> $_PROVIDER (:8014)"
  else
    echo "⚠ brain not answering"
  fi
  export BRAIN_PROXY_URL="http://127.0.0.1:8014/v1"
  echo "loading voice loop (mic/speaker, MLX warm-up ~15s)…"
  "$VP" "$VOICE/bot.py" &
  wait $!
fi
