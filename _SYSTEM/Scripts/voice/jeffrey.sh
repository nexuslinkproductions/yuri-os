#!/usr/bin/env bash
# @capability: jeffrey-local-launcher
# @serves: start jeffrey | run jeffrey | one word jeffrey | jeffrey local brain | test jeffrey | jeffrey on windows
# @does: one-word launcher for René's LOCAL Jeffrey brain — Ollama qwen3:14b on :8013, operator=jeffrey,
#        on-device, $0, private. Windows-native (uses `py -3`, not the macOS pipecat venv). Subcommands:
#        (default) start the brain foreground; `test` = health + one chat round-trip smoke then exit;
#        `stop` = kill a running brain.
# @use: jeffrey            # start the local brain foreground (alias in ~/.bashrc -> this script) — Ctrl-C stops
#       jeffrey voice      # full VOICE loop: brain + hold-to-talk (Parakeet STT -> brain -> SAPI TTS)
#       jeffrey test       # smoke test the local brain and exit
#       jeffrey stop       # stop it
#       swap model: YURI_LOCAL_MODEL=qwen3:8b jeffrey
# @exports: (launcher)
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VOICE="$REPO/_SYSTEM/Scripts/voice"
PORT="${YURI_LOCAL_BRAIN_PORT:-8013}"
MODEL="${YURI_LOCAL_MODEL:-qwen3:14b}"
LOG="$REPO/_SYSTEM/state/voice/jeffrey-brain.log"

export YURI_VOICE_OPERATOR=jeffrey
export YURI_LOCAL_MODEL="$MODEL"
export YURI_LOCAL_BRAIN_PORT="$PORT"

# real python on this Windows box is `py -3` (python/python3 on PATH are WindowsApps Store stubs)
PY=(py -3)

mkdir -p "$REPO/_SYSTEM/state/voice"

_ollama_up() { curl -s --max-time 5 http://localhost:11434/api/tags >/dev/null 2>&1; }

case "${1:-run}" in
  test)
    _ollama_up || { echo "❌ ollama not reachable on :11434 — start Ollama first"; exit 1; }
    "${PY[@]}" "$VOICE/yuri-local-brain.py" >"$LOG" 2>&1 &
    BPID=$!
    sleep 3
    echo "── health ──"
    curl -s "http://127.0.0.1:$PORT/health"; echo
    echo "── chat smoke (cold model load can take a bit) ──"
    curl -s -X POST "http://127.0.0.1:$PORT/v1/chat/completions" \
      -H "Content-Type: application/json" \
      -d '{"messages":[{"role":"user","content":"Good morning Jeffrey, in one line: what is your role?"}]}' \
      --max-time 180
    echo
    kill "$BPID" 2>/dev/null || true
    ;;
  voice)
    _ollama_up || { echo "❌ ollama not reachable on :11434 — start Ollama first"; exit 1; }
    VENV="${VOICE_ASSIST_PY:-/c/Users/rene/.venvs/parakeet-ptt/Scripts/python.exe}"
    [ -x "$VENV" ] || { echo "❌ voice venv missing at $VENV (set VOICE_ASSIST_PY)"; exit 1; }
    # bring the brain up in the background if it isn't already answering
    if ! curl -s --max-time 3 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
      echo "starting Jeffrey brain (:$PORT, $MODEL)…"
      "${PY[@]}" "$VOICE/yuri-local-brain.py" >"$LOG" 2>&1 &
      sleep 3
    fi
    echo "jeffrey voice — HOLD Right-Shift, speak, release. Local brain ($MODEL), on-device, \$0. Ctrl-C stops."
    exec "$VENV" "$VOICE/voice-assistant-win.py"
    ;;
  stop)
    if pkill -f yuri-local-brain.py 2>/dev/null; then echo "jeffrey stopped"; else echo "jeffrey was not running"; fi
    ;;
  *)
    _ollama_up || { echo "❌ ollama not reachable on :11434 — start Ollama first"; exit 1; }
    echo "jeffrey -> ollama $MODEL (:$PORT, operator=jeffrey, on-device, \$0). Ctrl-C stops."
    exec "${PY[@]}" "$VOICE/yuri-local-brain.py"
    ;;
esac
