#!/usr/bin/env bash
# @capability: voice-rick-ref-prep
# @serves: build rick reference clip | merge rick audio clips | prepare voice clone reference | combine mp3 clips
# @does: converts + concatenates several short Rick clips (mp3/m4a/wav/...) into ONE clean >=10s 24kHz mono reference wav for Chatterbox-Turbo voice cloning (trims dead air, highpass, loudness-normalizes).
# @use: drop clips in _SYSTEM/state/voice/clips/, run this -> _SYSTEM/state/voice/rick-ref.wav
# @exports: (prep script)
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VDIR="$REPO/_SYSTEM/state/voice"
CLIPS="${1:-$VDIR/clips}"
OUT="$VDIR/rick-ref.wav"
command -v ffmpeg >/dev/null 2>&1 || { echo "❌ ffmpeg MISSING (brew install ffmpeg)"; exit 1; }
mkdir -p "$VDIR"
[ -d "$CLIPS" ] || { echo "❌ no clips dir: $CLIPS"; echo "   make it and drop your mp3s in: mkdir -p \"$CLIPS\""; exit 1; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/rickref.XXXXXX")"
list="$TMP/list.txt"; : > "$list"
n=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  n=$((n+1))
  w="$TMP/$(printf '%03d' "$n").wav"
  # mono 24k, cut sub-70Hz rumble. NO silence trim — silenceremove truncated clips at the first pause.
  if ffmpeg -nostdin -hide_banner -loglevel error -y -i "$f" \
       -af "highpass=f=70,aresample=24000" \
       -ac 1 -ar 24000 "$w" 2>/dev/null; then
    printf "file '%s'\n" "$w" >> "$list"
  else
    echo "  ⚠️  skipped (decode failed): $f"; n=$((n-1))
  fi
done < <(find "$CLIPS" -type f \( -iname '*.mp3' -o -iname '*.m4a' -o -iname '*.wav' -o -iname '*.aac' -o -iname '*.flac' -o -iname '*.ogg' \) | sort)

[ "$n" -eq 0 ] && { echo "❌ no usable audio in $CLIPS"; exit 1; }

cat="$TMP/cat.wav"
ffmpeg -nostdin -hide_banner -loglevel error -y -f concat -safe 0 -i "$list" -c copy "$cat" 2>/dev/null \
  || ffmpeg -nostdin -hide_banner -loglevel error -y -f concat -safe 0 -i "$list" -ac 1 -ar 24000 "$cat"
ffmpeg -nostdin -hide_banner -loglevel error -y -i "$cat" -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ac 1 -ar 24000 "$OUT"

dur=""
command -v ffprobe >/dev/null 2>&1 && dur="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$OUT" 2>/dev/null | cut -d. -f1)"
echo "✅ merged $n clip(s) -> $OUT${dur:+  (~${dur}s)}"
if [ -n "$dur" ] && [ "$dur" -lt 10 ]; then echo "⚠️  under 10s — Turbo wants >=10s; add more/longer clips and rerun."; fi
echo "   preview: afplay \"$OUT\""
