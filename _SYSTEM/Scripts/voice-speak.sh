#!/usr/bin/env bash
# @capability: voice-speak-openai-tts
# @serves: speak text via local tts server | rick voice output | openai-compatible tts client | smooth playback
# @does: reads text on stdin, sends it in ONE request to an OpenAI-compatible /v1/audio/speech endpoint (Marvis Rick server), plays the returned wav smoothly (no inter-sentence gaps); falls back to macOS `say` if the server is unreachable so the loop never goes silent.
# @use: Phase 3 voice-engine bridge, auto-used by the Stop hook. Configure via env or _SYSTEM/state/voice-tts.conf.
# @exports: (stdin text -> spoken audio)
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONF="$REPO/_SYSTEM/state/voice-tts.conf"
[ -f "$CONF" ] && . "$CONF"

# Named-band graphic EQ: build the ffmpeg EQ chain from human-readable bands in eq-bands.conf.
# Each band -> a peaking filter at its center frequency. Bands at 0 dB are skipped (flat).
BANDS_CONF="$REPO/_SYSTEM/state/voice/eq-bands.conf"
if [ -f "$BANDS_CONF" ]; then
  . "$BANDS_CONF"
  _eq=""
  _band(){ awk "BEGIN{exit (($1)==0)?0:1}" 2>/dev/null && return; _eq="${_eq:+$_eq,}equalizer=f=$2:t=q:w=$3:g=$1"; }
  _band "${SUB:-0}"       "${SUB_HZ:-60}"        0.7
  _band "${BASS:-0}"      "${BASS_HZ:-150}"      0.9
  _band "${LOW_MID:-0}"   "${LOW_MID_HZ:-400}"   1.0
  _band "${MID:-0}"       "${MID_HZ:-1000}"      1.0
  _band "${HIGH_MID:-0}"  "${HIGH_MID_HZ:-2500}" 1.0
  _band "${PRESENCE:-0}"  "${PRESENCE_HZ:-5000}" 1.0
  _band "${AIR:-0}"       "${AIR_HZ:-12000}"     1.0
  VOICE_EQ="$_eq"   # bands are the source of truth; empty = flat (no EQ)
fi

URL="${VOICE_TTS_URL:-http://127.0.0.1:8004/v1/audio/speech}"
HEALTH="${URL%/v1/audio/speech}/health"
VOICE="${VOICE_TTS_VOICE:-rick}"
MODEL="${VOICE_TTS_MODEL:-tts-1}"
FMT="${VOICE_TTS_FORMAT:-wav}"

text="$(cat)"
[ -z "${text// /}" ] && exit 0

say_fallback(){ command -v say >/dev/null 2>&1 && printf '%s' "$text" | say -r "${VOICE_SAY_RATE:-200}"; }

command -v curl >/dev/null 2>&1 || { say_fallback; exit 0; }
command -v jq   >/dev/null 2>&1 || { say_fallback; exit 0; }
# server up? else degrade to `say` (never go silent)
curl -sS -m 2 -o /dev/null "$HEALTH" 2>/dev/null || { say_fallback; exit 0; }

TMP="$(mktemp "${TMPDIR:-/tmp}/vspk.XXXXXX")"
body="$(jq -nc --arg m "$MODEL" --arg i "$text" --arg v "$VOICE" --arg f "$FMT" \
        '{model:$m, input:$i, voice:$v, response_format:$f}')"
http="$(curl -sS -m 120 -o "$TMP" -w '%{http_code}' \
        -H 'Content-Type: application/json' -d "$body" "$URL" 2>/dev/null)" || http="000"

if [ "$http" = "200" ] && [ -s "$TMP" ]; then
  # LATEST-WINS: if a newer reply was queued while we synthesized, drop this stale one.
  if [ -n "${VOICE_SEQ:-}" ] && [ -n "${VOICE_SEQ_FILE:-}" ]; then
    cur="$(cat "$VOICE_SEQ_FILE" 2>/dev/null || echo "$VOICE_SEQ")"
    if [ "${cur:-0}" -gt "${VOICE_SEQ:-0}" ] 2>/dev/null; then rm -f "$TMP" "$TMP.eq.wav" 2>/dev/null; exit 0; fi
    pkill -x afplay 2>/dev/null   # we are the newest — cut off any older Rick still playing
  fi
  PLAY="$TMP"
  # Optional EQ (boost lows / add body so Rick doesn't sound highpassed). Tune via VOICE_EQ.
  if [ -n "${VOICE_EQ:-}" ] && command -v ffmpeg >/dev/null 2>&1; then
    if ffmpeg -nostdin -hide_banner -loglevel error -y -i "$TMP" -af "$VOICE_EQ" "$TMP.eq.wav" 2>/dev/null; then PLAY="$TMP.eq.wav"; fi
  fi
  if   command -v afplay >/dev/null 2>&1; then afplay "$PLAY"
  elif command -v ffplay >/dev/null 2>&1; then ffplay -nodisp -autoexit -loglevel quiet "$PLAY"
  else say_fallback; fi
  rm -f "$TMP.eq.wav" 2>/dev/null
else
  say_fallback
fi
rm -f "$TMP" 2>/dev/null
exit 0
