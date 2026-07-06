#!/usr/bin/env bash
# @capability: yuri-session-launcher
# @serves: launch yuri | start yuri voice | talk to yuri
# @does: Yuri voice assistant. Three modes:
#   YURI_BRAIN=zai (default): GLM-5.2 brain + Pipecat voice loop. Proven, reliable.
#   YURI_BRAIN=omp-voice: Composer 2.5 via voice MCP tools. Composer drives the voice
#     (voice_listen/voice_speak). Native vision, full OMP tools. Invisible background.
#   YURI_BRAIN=omp: legacy OMP tmux bridge (debugging only — reads terminal chrome).
# @use: bash _SYSTEM/Scripts/voice/yuri.sh   (alias: yuri). Ctrl-C stops everything.
# @exports: (launcher)
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VOICE="$REPO/_SYSTEM/Scripts/voice"
VP="$REPO/_SYSTEM/state/voice/.venv-pipecat/bin/python"
OMP_BIN="${OMP_BIN:-$(command -v omp 2>/dev/null || echo "$HOME/.bun/bin/omp")}"
mkdir -p "$REPO/_SYSTEM/state/voice"
rm -f "$REPO/_SYSTEM/state/voice/tts.paused" 2>/dev/null || true
[ -x "$VP" ] || { echo "❌ venv missing — run setup-pipecat.sh"; exit 1; }

# Clean slate
bash "$VOICE/voice-stop.sh" 2>/dev/null || true
pkill -f omp-brain-proxy.py 2>/dev/null || true
tmux kill-session -t omp 2>/dev/null || true

YURI_BRAIN="${YURI_BRAIN:-zai}"

cleanup() {
  trap - EXIT INT TERM HUP
  echo ""; echo "stopping Yuri — full voice cleanup…"
  bash "$VOICE/voice-stop.sh" >/dev/null 2>&1 || true
  pkill -f omp-brain-proxy.py 2>/dev/null || true
  pkill -f voice-mcp-server.py 2>/dev/null || true
  tmux kill-session -t omp 2>/dev/null || true
  exit 0
}
trap cleanup EXIT INT TERM HUP

if [ "$YURI_BRAIN" = "omp-voice" ]; then
  # ── Composer 2.5 via voice MCP tools ──
  # OMP runs in background tmux. Composer drives the voice via MCP tools:
  # voice_listen() → mic+STT → text. voice_speak(text) → TTS+speaker.
  # No bot.py, no terminal capture, no proxy. Clean tool calls.
  echo "starting OMP + Composer 2.5 with voice MCP tools…"
  tmux new-session -d -s omp -x 200 -y 50 "cd '$REPO' && '$OMP_BIN' 'You are Yuri — Marcel Spatz voice assistant. You run on Composer 2.5. You are NOT Claude.

 Loop forever:
 1. Call voice_listen() to hear Marcel
 2. Think about what he said — use your tools (screenshot, list_windows, bash, read, grep) as needed
 3. Call voice_speak() with your response — concise, natural spoken English, full personality
 4. Go back to step 1

 You are always on, always listening. Never say you cannot do something — try it. Be sharp, direct, no filler. When you look at the screen, use screenshot + list_windows to see what is actually there.'"
  echo "brain -> Composer 2.5 via voice MCP (booting ~20s for OMP + model load)"
  echo "debug: tmux attach -t omp  (detach: Ctrl-b d)"
  echo ""
  # Keep the script alive — OMP drives the voice, we just wait
  tmux wait-for omp 2>/dev/null || wait
  exit 0
fi

# ── Default: GLM brain (yuri-z-brain.py) + Pipecat voice loop ──
if [ "$YURI_BRAIN" = "zai" ] || [ "$YURI_BRAIN" = "omp" ]; then
  if [ "$YURI_BRAIN" = "omp" ]; then
    # Legacy OMP tmux bridge (debugging)
    if ! tmux has-session -t omp 2>/dev/null; then
      tmux new-session -d -s omp -x 200 -y 50 "cd '$REPO' && '$OMP_BIN'"
      sleep 6
    fi
    export OMP_TMUX_TARGET="omp:0.0"
    python3 "$VOICE/omp-brain-proxy.py" >"$REPO/_SYSTEM/state/voice/omp-brain-proxy.log" 2>&1 &
    sleep 1
    _HEALTH=$(curl -s --max-time 5 http://127.0.0.1:8014/health 2>/dev/null)
    if echo "$_HEALTH" | grep -q "reachable.*true" 2>/dev/null; then
      echo "brain -> OMP CLI bridge (:8014, reachable)"
    else
      echo "⚠ OMP bridge not reachable — falling back to GLM"
      YURI_BRAIN="zai"
    fi
  fi

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
  fi

  export BRAIN_PROXY_URL="http://127.0.0.1:8014/v1"
  echo "loading voice loop (mic/speaker, MLX warm-up ~15s)…  Ctrl-C stops everything."
  "$VP" "$VOICE/bot.py" &
  wait $!
fi
