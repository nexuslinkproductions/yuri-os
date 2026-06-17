#!/usr/bin/env bash
# @capability: voice-rick-setup
# @serves: install rick voice | chatterbox setup | voice phase 3 install | smoke test rick tts
# @does: one-time setup for the Rick voice engine — venv + chatterbox-tts install + Chatterbox-Turbo smoke test on Apple Silicon MPS (CPU fallback), reports device + latency.
# @use: run ONCE before starting voice-rick-server.py. Installs a Python dependency (owner-approved).
# @exports: (setup script)
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VDIR="$REPO/_SYSTEM/state/voice"
VENV="$VDIR/.venv"
REF="${RICK_REF:-$VDIR/rick-ref.wav}"
mkdir -p "$VDIR"

echo "== Python venv: $VENV =="
python3 -m venv "$VENV"
# shellcheck disable=SC1091
. "$VENV/bin/activate"
python -m pip install --quiet --upgrade pip

echo "== installing chatterbox-tts (downloads torch — a few minutes) =="
pip install --quiet chatterbox-tts || { echo "❌ install failed"; exit 1; }

echo "== smoke test: load Turbo + synthesize one line =="
python - "$REF" <<'PY'
import sys, os, time, torch, torchaudio
from chatterbox.tts_turbo import ChatterboxTurboTTS
ref = sys.argv[1]
dev = "mps" if torch.backends.mps.is_available() else "cpu"
print(f"device candidate: {dev}")
try:
    m = ChatterboxTurboTTS.from_pretrained(device=dev)
except Exception as e:
    print(f"{dev} failed ({e}); retrying CPU"); dev = "cpu"
    m = ChatterboxTurboTTS.from_pretrained(device="cpu")
kw = {"exaggeration": 0.7, "cfg_weight": 0.5}
if os.path.exists(ref):
    kw["audio_prompt_path"] = ref; print(f"using ref clip: {ref}")
else:
    print("no ref clip yet — testing with the default voice")
t = time.time()
wav = m.generate("Wubba lubba dub dub. The voice loop is alive, Marcel.", **kw)
dt = time.time() - t
out = os.path.join(os.path.dirname(ref) or ".", "rick-smoketest.wav")
torchaudio.save(out, wav.detach().cpu(), m.sr)
print(f"✅ OK device={dev} sr={m.sr} synth={dt:.2f}s -> {out}")
PY

echo ""
echo "next:"
echo "  play test : afplay $VDIR/rick-smoketest.wav"
echo "  run server: $VENV/bin/python $REPO/_SYSTEM/Scripts/voice/voice-rick-server.py"
echo "  then restart Claude Code — replies speak in Rick's voice (voice-speak.sh -> :8004)."
