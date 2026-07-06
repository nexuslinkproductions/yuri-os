#!/usr/bin/env bash
# @capability: voice-eq-instant
# @serves: instant eq tuning | fast rick eq loop | no-resynth eq preview
# @does: synthesizes ONE raw Chatterbox take and caches it, then applies the current eq-bands.conf EQ to the cached take and plays it — INSTANT, no re-synth per tweak. `fresh` re-synthesizes a new take.
# @use: bash voice-eq.sh [fresh] ["custom line"]   (edit eq-bands.conf between runs)
# @exports: (cli)
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CONF="$REPO/_SYSTEM/state/voice-tts.conf"; [ -f "$CONF" ] && . "$CONF"
URL="${VOICE_TTS_URL:-http://127.0.0.1:8004/v1/audio/speech}"
CACHE="$REPO/_SYSTEM/state/voice/eq-cache-raw.wav"
TXT="${2:-Wubba lubba dub dub Marcel, this is the equalizer tuning take, listen to the tone.}"

# (re)synthesize the raw take only when missing or 'fresh' — otherwise EQ tweaks are instant
if [ "${1:-}" = "fresh" ] || [ ! -s "$CACHE" ]; then
  command -v jq >/dev/null 2>&1 || { echo "need jq"; exit 1; }
  echo "synthesizing one raw take (cached — future tweaks are instant) ..."
  body="$(jq -nc --arg i "$TXT" '{model:"tts-1",input:$i,voice:"rick",response_format:"wav"}')"
  http="$(curl -sS -m 180 -o "$CACHE" -w '%{http_code}' -H 'Content-Type: application/json' -d "$body" "$URL" 2>/dev/null)" || http="000"
  { [ "$http" = "200" ] && [ -s "$CACHE" ]; } || { echo "Chatterbox synth failed (http=$http) on $URL"; exit 1; }
fi

# build the EQ chain from the named bands (gain + editable freq)
BANDS="$REPO/_SYSTEM/state/voice/eq-bands.conf"; [ -f "$BANDS" ] && . "$BANDS"
eq=""
b(){ awk "BEGIN{exit (($1)==0)?0:1}" 2>/dev/null && return; eq="${eq:+$eq,}equalizer=f=$2:t=q:w=$3:g=$1"; }
b "${SUB:-0}"       "${SUB_HZ:-60}"        0.7
b "${BASS:-0}"      "${BASS_HZ:-150}"      0.9
b "${LOW_MID:-0}"   "${LOW_MID_HZ:-400}"   1.0
b "${MID:-0}"       "${MID_HZ:-1000}"      1.0
b "${HIGH_MID:-0}"  "${HIGH_MID_HZ:-2500}" 1.0
b "${PRESENCE:-0}"  "${PRESENCE_HZ:-5000}" 1.0
b "${AIR:-0}"       "${AIR_HZ:-12000}"     1.0

OUT="${TMPDIR:-/tmp}/eq-preview.wav"
if [ -n "$eq" ] && command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg -nostdin -hide_banner -loglevel error -y -i "$CACHE" -af "$eq" "$OUT" 2>/dev/null && afplay "$OUT" || afplay "$CACHE"
else
  afplay "$CACHE"
fi
echo "EQ: ${eq:-flat}"
