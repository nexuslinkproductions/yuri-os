#!/usr/bin/env bash
# @capability: voice-pipecat-setup
# @serves: install pipecat voice stack | realtime voice agent install | mlx whisper marvis tts pipecat
# @does: builds a fresh venv and installs the Pipecat realtime-voice stack (MLX Whisper STT + Marvis/MLX-Audio streaming TTS + Silero VAD + smart-turn) per the kwindla/macos-local-voice-agents reference.
# @use: one-time setup for the full Pipecat voice rebuild (R2). Dependency install — owner approved.
# @exports: (setup script)
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VENV="$REPO/_SYSTEM/state/voice/.venv-pipecat"

PY="$(command -v python3.12 || command -v python3.13 || command -v python3.11 || command -v python3)"
echo "== python: $PY ($("$PY" --version 2>&1)) =="
case "$("$PY" --version 2>&1)" in
  *3.14*|*3.15*) echo "⚠️  $PY is very new; mlx/pipecat wheels may be missing. Prefer python3.12 (brew install python@3.12)";;
esac

"$PY" -m venv "$VENV"
# shellcheck disable=SC1091
. "$VENV/bin/activate"
python -m pip install --quiet --upgrade pip

echo "== installing pipecat realtime-voice stack (several minutes) =="
pip install --quiet \
  python-dotenv mlx-lm mlx-audio aiortc nltk fastapi "uvicorn[standard]" \
  "pipecat-ai[openai,silero,webrtc,mlx-whisper]>=0.0.80" \
  || { echo "❌ install FAILED — paste the error"; exit 1; }

echo "✅ pipecat stack installed → $VENV"
echo "   python: $("$PY" --version 2>&1)"
"$VENV/bin/python" - <<'PY'
mods = ["pipecat", "mlx_audio", "mlx_whisper", "aiortc", "fastapi"]
import importlib
for m in mods:
    try:
        importlib.import_module(m); print(f"  import {m}: OK")
    except Exception as e:
        print(f"  import {m}: FAIL ({e})")
PY
