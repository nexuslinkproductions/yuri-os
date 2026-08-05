#!/usr/bin/env bash
# Transcribe a captured Atilla call — whisper.cpp large-v3-turbo, German pinned.
# Usage: ./transcribe.sh [stamp]   (defaults to the last recording)
# Verifies each channel with volumedetect FIRST (mean ~ -91 dB = silence/routing broken;
# ~ -20 to -40 dB = real audio). German is pinned (-l de) — auto-detect on a silent slice
# hallucinates English filler ("Untertitel...", "Vielen Dank").
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/recordings"
MODEL="${VOICE_WHISPER_MODEL:-$HOME/.cache/whisper-cpp/ggml-large-v3-turbo.bin}"
STAMP="${1:-$(cat "$HERE/.last-stamp" 2>/dev/null || true)}"

[ -z "$STAMP" ] && { echo "usage: ./transcribe.sh <stamp>   (none recorded yet)"; exit 1; }
[ -f "$MODEL" ] || { echo "ERROR: whisper model missing at $MODEL"; exit 1; }

tx() { # role wav
  local role="$1" wav="$2"
  [ -f "$wav" ] || { echo "[$role] missing: $wav"; return; }
  echo "== [$role] level check =="
  ffmpeg -hide_banner -nostdin -i "$wav" -af volumedetect -f null - 2>&1 | grep -E "mean_volume|max_volume" || true
  local w16="$OUT/$role-$STAMP-16k.wav"
  ffmpeg -nostdin -hide_banner -loglevel error -i "$wav" -ar 16000 -ac 1 -y "$w16"
  echo "[$role] transcribing (de)..."
  whisper-cli -m "$MODEL" -f "$w16" -l de -nt -otxt -oj -of "$OUT/$role-$STAMP" >/dev/null 2>&1
  echo "[$role] -> $OUT/$role-$STAMP.txt"
}

tx mic    "$OUT/mic-$STAMP.wav"
tx remote "$OUT/remote-$STAMP.wav"
echo "done. transcripts: $OUT/{mic,remote}-$STAMP.txt"
