#!/usr/bin/env bash
# Atilla call — dual-channel clean capture (own voice + remote via BlackHole).
# Proven pipeline: ref-call-transcription-pipeline-2026-06-16 (DJI/HyperX mic + BlackHole + whisper.cpp).
# Own mic  -> mic-<stamp>.wav      (auto: DJI "Wireless Microphone RX" > HyperX SoloCast > MacBook mic)
# Remote   -> remote-<stamp>.wav   (BlackHole 2ch = the other party's audio via a Multi-Output Device)
# Separate files = clean 2-way speaker separation. Ctrl-C stops both.
# Preflights the chosen mic and REFUSES to record silence (muted mic) unless ALLOW_SILENT=1.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/recordings"; mkdir -p "$OUT"
STAMP="$(date +%Y%m%d-%H%M%S)"

# Resolve an avfoundation AUDIO device index by name substring (case-insensitive).
idx() {
  ffmpeg -f avfoundation -list_devices true -i "" 2>&1 \
    | grep -iE '\] \[[0-9]+\] .*'"$1" \
    | sed -E 's/.*\] \[([0-9]+)\].*/\1/' | head -1
}

MIC_IDX=""; MIC_NAME=""
for name in "Wireless Microphone RX" "HyperX SoloCast" "MacBook Pro Microphone"; do
  i="$(idx "$name")"; if [ -n "$i" ]; then MIC_IDX="$i"; MIC_NAME="$name"; break; fi
done
BH_IDX="$(idx 'BlackHole 2ch')"

[ -z "$MIC_IDX" ] && { echo "ERROR: no own-mic found (DJI/HyperX/MacBook). Plug one in."; exit 1; }
[ -z "$BH_IDX" ]  && { echo "ERROR: BlackHole 2ch not found. Install + route it (see README)."; exit 1; }

# --- Preflight: chosen mic must not be silent (muted / no signal) ---
PROBE="$OUT/.probe.wav"
ffmpeg -nostdin -hide_banner -loglevel error -f avfoundation -i ":$MIC_IDX" -t 1 -ac 1 -ar 48000 -y "$PROBE" 2>/dev/null || true
LVL="$(ffmpeg -hide_banner -nostdin -i "$PROBE" -af volumedetect -f null - 2>&1 | sed -nE 's/.*mean_volume: (-?[0-9.]+) dB/\1/p')"
rm -f "$PROBE"
echo "own mic  : [$MIC_IDX] $MIC_NAME   level: ${LVL:-unknown} dB"
if [ -n "$LVL" ] && awk "BEGIN{exit !($LVL < -80)}"; then
  echo "!! WARNING: '$MIC_NAME' is SILENT (${LVL} dB) — likely MUTED (tap the HyperX top; LED off = live) or wrong device."
  if [ "${ALLOW_SILENT:-0}" != "1" ]; then
    echo "   Unmute it and re-run, or force anyway with:  ALLOW_SILENT=1 ./record.sh"
    exit 1
  fi
fi

echo "remote   : [$BH_IDX] BlackHole 2ch   (silent until the call app output = Multi-Output Device)"
echo "writing  : $OUT/{mic,remote}-$STAMP.wav"
echo "RECORDING. Leave this open. Ctrl-C to stop."
echo "$STAMP" > "$HERE/.last-stamp"

ffmpeg -nostdin -hide_banner -loglevel warning -f avfoundation -i ":$MIC_IDX" -ac 2 -ar 48000 -y "$OUT/mic-$STAMP.wav" &
MIC_PID=$!
ffmpeg -nostdin -hide_banner -loglevel warning -f avfoundation -i ":$BH_IDX" -ac 2 -ar 48000 -y "$OUT/remote-$STAMP.wav" &
BH_PID=$!

cleanup() {
  kill "$MIC_PID" "$BH_PID" 2>/dev/null
  wait "$MIC_PID" "$BH_PID" 2>/dev/null
  echo
  echo "STOPPED. stamp=$STAMP"
  echo "next: $HERE/transcribe.sh $STAMP"
}
trap cleanup INT TERM
wait
