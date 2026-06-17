#!/usr/bin/env bash
# @capability: voice-eq-ab
# @serves: a/b compare rick eq presets | tune voice eq | voice comparison harness
# @does: synthesizes ONE line via the Chatterbox Rick server, applies several EQ presets, plays each labeled so you can pick the best. Pick a letter -> I lock it into voice-tts.conf VOICE_EQ.
# @use: bash voice-ab.sh ["optional custom line"]
# @exports: (cli)
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CONF="$REPO/_SYSTEM/state/voice-tts.conf"; [ -f "$CONF" ] && . "$CONF"
URL="${VOICE_TTS_URL:-http://127.0.0.1:8004/v1/audio/speech}"
TXT="${1:-Wubba lubba dub dub Marcel. This is an equalizer comparison. Pick the version that sounds most like the real Rick Sanchez.}"
D="$(mktemp -d "${TMPDIR:-/tmp}/voiceab.XXXXXX")"

command -v jq >/dev/null 2>&1 && command -v ffmpeg >/dev/null 2>&1 && command -v afplay >/dev/null 2>&1 || { echo "need jq+ffmpeg+afplay"; exit 1; }
echo "synthesizing once via Chatterbox (the EQ is applied after, so it's the same take)..."
body="$(jq -nc --arg i "$TXT" '{model:"tts-1",input:$i,voice:"rick",response_format:"wav"}')"
curl -sS -m120 -o "$D/raw.wav" -H 'Content-Type: application/json' -d "$body" "$URL" 2>/dev/null || { echo "server unreachable on $URL"; exit 1; }
[ -s "$D/raw.wav" ] || { echo "empty synth — is the Chatterbox server up?"; exit 1; }

NAMES=("A current" "B brighter" "C warmer" "D scooped")
EQS=(
  "bass=g=9:f=120,equalizer=f=450:t=q:w=1.1:g=-2.5,treble=g=6:f=3800,equalizer=f=9000:t=q:w=1.0:g=2.5"
  "bass=g=7:f=120,equalizer=f=500:t=q:w=1.1:g=-2,treble=g=9:f=3500,equalizer=f=10000:t=q:w=1.0:g=4"
  "bass=g=11:f=130,equalizer=f=450:t=q:w=1.1:g=-1.5,treble=g=4:f=4000"
  "bass=g=9:f=120,equalizer=f=600:t=q:w=1.4:g=-4,treble=g=6:f=3800,equalizer=f=9000:t=q:w=1:g=2.5"
)
for i in "${!NAMES[@]}"; do
  ffmpeg -nostdin -hide_banner -loglevel error -y -i "$D/raw.wav" -af "${EQS[$i]}" "$D/$i.wav" 2>/dev/null
done
for i in "${!NAMES[@]}"; do
  echo ">>> ${NAMES[$i]}"
  say -r 230 "Version ${NAMES[$i]%% *}" 2>/dev/null
  afplay "$D/$i.wav"
  sleep 0.4
done
echo ""
echo "presets:"
for i in "${!NAMES[@]}"; do echo "  ${NAMES[$i]} = ${EQS[$i]}"; done
echo "Tell me the letter and I lock it into voice-tts.conf."
rm -rf "$D" 2>/dev/null