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

VOICE="${VOICE_TTS_VOICE:-rick}"
MODEL="${VOICE_TTS_MODEL:-tts-1}"
FMT="${VOICE_TTS_FORMAT:-wav}"

text="$(cat)"
[ -z "${text// /}" ] && exit 0

say_fallback(){ command -v say >/dev/null 2>&1 && printf '%s' "$text" | say -r "${VOICE_SAY_RATE:-200}"; }

command -v curl >/dev/null 2>&1 || { say_fallback; exit 0; }
command -v jq   >/dev/null 2>&1 || { say_fallback; exit 0; }
# pick the live TTS engine: MLX/MOSS (:8005, ~4x faster) -> Chatterbox (:8004) -> say.
# force one with VOICE_TTS_ENGINE=mlx|chatterbox, or pin a URL with VOICE_TTS_URL.
ENG="${VOICE_TTS_ENGINE:-auto}"
URL="${VOICE_TTS_URL:-}"
if [ -z "$URL" ]; then
  if [ "$ENG" != "chatterbox" ] && curl -sf -m 2 -o /dev/null http://127.0.0.1:8005/health 2>/dev/null; then
    URL="http://127.0.0.1:8005/v1/audio/speech"
  elif [ "$ENG" != "mlx" ] && curl -sf -m 2 -o /dev/null http://127.0.0.1:8004/health 2>/dev/null; then
    URL="http://127.0.0.1:8004/v1/audio/speech"
  fi
fi
[ -z "$URL" ] && { say_fallback; exit 0; }

# --- chunked + pipelined: synth sentence 1 (~2s) and PLAY it while the rest synthesize,
#     so first-sound is the first sentence, not the whole reply (~5s on Chatterbox). ---
synth_one(){  # $1=text $2=outfile -> 0 if a wav was produced
  [ -z "${1// /}" ] && return 1
  local b h
  b="$(jq -nc --arg m "$MODEL" --arg i "$1" --arg v "$VOICE" --arg f "$FMT" \
       '{model:$m, input:$i, voice:$v, response_format:$f}')"
  h="$(curl -sS -m 120 -o "$2" -w '%{http_code}' -H 'Content-Type: application/json' -d "$b" "$URL" 2>/dev/null)" || h="000"
  [ "$h" = "200" ] && [ -s "$2" ]
}
play_one(){  # $1=wav -> EQ, play, remove
  local p="$1"
  if [ -n "${VOICE_EQ:-}" ] && command -v ffmpeg >/dev/null 2>&1; then
    ffmpeg -nostdin -hide_banner -loglevel error -y -i "$1" -af "$VOICE_EQ" "$1.eq" 2>/dev/null && p="$1.eq"
  fi
  if   command -v afplay >/dev/null 2>&1; then afplay "$p" 2>/dev/null
  elif command -v ffplay >/dev/null 2>&1; then ffplay -nodisp -autoexit -loglevel quiet "$p"; fi
  rm -f "$1" "$1.eq" 2>/dev/null
}
is_stale(){  # a newer reply queued since we started?
  [ -n "${VOICE_SEQ:-}" ] && [ -n "${VOICE_SEQ_FILE:-}" ] || return 1
  local c; c="$(cat "$VOICE_SEQ_FILE" 2>/dev/null || echo "$VOICE_SEQ")"
  [ "${c:-0}" -gt "${VOICE_SEQ:-0}" ] 2>/dev/null
}

TMPD="$(mktemp -d "${TMPDIR:-/tmp}/vspk.XXXXXX")"
trap 'rm -rf "$TMPD" 2>/dev/null' EXIT

# split into sentences (octal sentinel after .!? + space, then tr -> newlines; BSD-safe)
SENTS=()
while IFS= read -r _l; do [ -n "${_l// /}" ] && SENTS+=("$_l"); done < <(
  printf '%s' "$text" | awk '{gsub(/[.!?]+[ \t]+/,"&\001"); print}' | tr '\001' '\n'
)
[ "${#SENTS[@]}" -eq 0 ] && SENTS=("$text")

is_stale && exit 0
pkill -x afplay 2>/dev/null   # newest reply cuts off any older Rick still playing

if ! synth_one "${SENTS[0]}" "$TMPD/0.wav"; then say_fallback; exit 0; fi
N=${#SENTS[@]}; i=0
while [ "$i" -lt "$N" ]; do
  ni=$((i+1)); pf=""
  if [ "$ni" -lt "$N" ]; then ( synth_one "${SENTS[$ni]}" "$TMPD/$ni.wav" ) & pf=$!; fi
  if is_stale; then [ -n "$pf" ] && kill "$pf" 2>/dev/null; break; fi
  [ -s "$TMPD/$i.wav" ] && play_one "$TMPD/$i.wav"
  [ -n "$pf" ] && wait "$pf" 2>/dev/null
  i="$ni"
done
exit 0
