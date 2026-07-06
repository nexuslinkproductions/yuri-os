#!/usr/bin/env bash
# @capability: yuri-session-launcher
# @serves: launch yuri | start yuri voice | talk to yuri
# @does: Yuri's brain = a BACKGROUND OMP CLI session in detached tmux. The voice loop
#        (bot.py) talks to omp-brain-proxy.py (:8014) which injects transcriptions into
#        the OMP session and captures responses for TTS. Marcel talks by voice, hears
#        voice back — the OMP session runs invisibly. tmux attach -t yuri-brain to debug.
#        Fallback: YURI_BRAIN=zai uses the old yuri-z-brain.py (GLM-5.2) if OMP isn't set up.
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

# Brain selection: YURI_BRAIN=omp (default) or YURI_BRAIN=zai (fallback to GLM brain)
YURI_BRAIN="${YURI_BRAIN:-omp}"

cleanup() {
  trap - EXIT INT TERM HUP
  echo ""; echo "stopping Yuri — full voice cleanup…"
  bash "$VOICE/voice-stop.sh" >/dev/null 2>&1 || true
  # Don't kill the OMP tmux session — it may have ongoing work. Just kill the proxy + bot.
  pkill -f omp-brain-proxy.py 2>/dev/null || true
  exit 0
}
trap cleanup EXIT INT TERM HUP

if [ "$YURI_BRAIN" = "omp" ]; then
  # ── OMP CLI bridge ──
  # Start OMP in detached tmux if not running
  if ! tmux has-session -t yuri-brain 2>/dev/null; then
    echo "starting OMP brain in background tmux…"
    tmux new -ds -s yuri-brain "cd '$REPO' && '$OMP_BIN'"
    sleep 3  # let OMP boot
  fi
  # Start the proxy (drop-in at :8014)
  pkill -f omp-brain-proxy.py 2>/dev/null || true
  python3 "$VOICE/omp-brain-proxy.py" >"$REPO/_SYSTEM/state/voice/omp-brain-proxy.log" 2>&1 &
  sleep 1
  # Health check
  _HEALTH=$(curl -s --max-time 5 http://127.0.0.1:8014/health 2>/dev/null)
  if [ -n "$_HEALTH" ]; then
    _REACH=$(echo "$_HEALTH" | python3 -c "import json,sys; d=json.load(sys.stdin); print('reachable' if d.get('reachable') else 'NOT REACHABLE')" 2>/dev/null || echo "?")
    echo "brain -> OMP CLI bridge (:8014, $_REACH)"
    echo "  debug: tmux attach -t yuri-brain  (detach: Ctrl-b d)"
  else
    echo "⚠ OMP brain proxy not answering — check _SYSTEM/state/voice/omp-brain-proxy.log"
    echo "  falling back to GLM brain…"
    YURI_BRAIN="zai"
  fi
fi

if [ "$YURI_BRAIN" = "zai" ]; then
  # ── Fallback: GLM brain (yuri-z-brain.py) ──
  pkill -f yuri-z-brain.py 2>/dev/null || true
  pkill -f omp-brain-proxy.py 2>/dev/null || true
  export YURI_Z_UNIFIED_GATE="${YURI_Z_UNIFIED_GATE:-1}"
  python3 "$VOICE/yuri-z-brain.py" >"$REPO/_SYSTEM/state/voice/yuri-z-brain.log" 2>&1 &
  sleep 1
  _HEALTH=$(curl -s --max-time 5 http://127.0.0.1:8014/health 2>/dev/null)
  if [ -n "$_HEALTH" ]; then
    _PROVIDER=$(echo "$_HEALTH" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"{d.get('provider','?')}/{d.get('active_model', d.get('model','?'))}\")" 2>/dev/null || echo "?")
    echo "brain -> $_PROVIDER (:8014)"
  else
    echo "⚠ brain not answering on :8014 — check logs"
  fi
fi

export BRAIN_PROXY_URL="http://127.0.0.1:8014/v1"
echo "loading the voice loop (mic/speaker, MLX warm-up ~15s)…  Ctrl-C stops everything."
"$VP" "$VOICE/bot.py" &
wait $!
