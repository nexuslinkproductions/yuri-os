#!/usr/bin/env bash
# @capability: voice-listen-overseer
# @serves: talk to the overseer | mic into overseer | always-on voice input | speech to overseer | hands free claude
# @does: always-on mic -> whisper-cli -> cmux send into the overseer surface. Loops short capture windows, transcribes (large-v3-turbo, English), GATES against the Rick TTS playback (won't transcribe its own voice / echo), drops empty + hallucinated segments, injects real speech into the overseer's cmux tab.
# @use: run `listen` (or bash this) in any terminal AFTER `overseer` is up. Ctrl-C to stop. Tune: VOICE_WINDOW, VOICE_MIC_INDEX, VOICE_MIN_CHARS.
# @exports: -
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

MIC="${VOICE_MIC_INDEX:-:1}"                                 # avfoundation audio device (:1 = MacBook Pro Microphone; list: ffmpeg -f avfoundation -list_devices true -i "")
MODEL="${VOICE_WHISPER_MODEL:-$HOME/.cache/whisper-cpp/ggml-large-v3-turbo.bin}"
WINDOW="${VOICE_WINDOW:-7}"                                  # seconds per capture window
MIN_CHARS="${VOICE_MIN_CHARS:-3}"                            # drop transcripts shorter than this (after stripping)
SURFACE_FILE="$REPO/_SYSTEM/state/overseer/overseer.surface"
SURFACE="${VOICE_OVERSEER_SURFACE:-$(cat "$SURFACE_FILE" 2>/dev/null || true)}"

# ── cmux reachability self-test: injection (cmux send) only works from a cmux-spawned
#    shell. If this fails, the mic transcribes but text goes nowhere. ──
if cmux list-pane-surfaces >/dev/null 2>&1; then
  echo "✓ cmux reachable from here — injection into surface $SURFACE will work"
else
  echo "✗ cmux UNREACHABLE from this shell (broken pipe). The mic will transcribe but CANNOT inject."
  echo "  → this must run inside a cmux tab. Easiest: just launch \`overseer\` (it auto-starts the mic in-context)."
fi

# ── prefer Parakeet MLX (≈100× real-time, true VAD streaming) when its venv exists ──
#    override with VOICE_STT_ENGINE=whisper to force the whisper.cpp fallback below.
PARAKEET_PY="$REPO/_SYSTEM/state/voice/.venv-stt/bin/python"
PARAKEET_SCRIPT="$REPO/_SYSTEM/Scripts/voice/parakeet-listen.py"
if [ "${VOICE_STT_ENGINE:-auto}" != "whisper" ] && [ -x "$PARAKEET_PY" ] && [ -f "$PARAKEET_SCRIPT" ]; then
  exec env REPO="$REPO" "$PARAKEET_PY" "$PARAKEET_SCRIPT"
fi
echo "ℹ︎ parakeet venv absent (or VOICE_STT_ENGINE=whisper) — using whisper.cpp fallback"

TMP="$(mktemp -d /tmp/voice-listen.XXXXXX)"; trap 'rm -rf "$TMP"' EXIT

have(){ command -v "$1" >/dev/null 2>&1; }
have ffmpeg      || { echo "✗ ffmpeg missing (brew install ffmpeg)"; exit 1; }
have whisper-cli || { echo "✗ whisper-cli missing (brew install whisper-cpp)"; exit 1; }
have jq          || { echo "✗ jq missing (brew install jq)"; exit 1; }
[ -f "$MODEL" ]  || { echo "✗ no whisper model at $MODEL (still downloading? check the model job)"; exit 1; }
[ -n "$SURFACE" ]|| { echo "✗ no overseer surface recorded. Start the overseer first ('overseer'), or set VOICE_OVERSEER_SURFACE=<cmux surface>."; exit 1; }

# whisper's common silence/noise hallucinations — drop these
is_noise(){
  local t; t="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:][:punct:]')"
  [ -z "$t" ] && return 0
  [ "${#t}" -lt "$MIN_CHARS" ] && return 0
  case "$t" in
    blankaudio|silence|you|thankyou|thanks|thanksforwatching|thank|bye|byebye|so|um|uh|okay|ok|yeah|hmm|music|applause) return 0;;
  esac
  return 1
}

echo "🎙  overseer listener LIVE"
echo "    mic '$MIC'  →  surface $SURFACE  (window ${WINDOW}s, model large-v3-turbo)"
echo "    speak normally; it pauses while Rick talks. Ctrl-C to stop."
echo "    tune live: VOICE_WINDOW=<secs> VOICE_MIC_INDEX=:<n> VOICE_MIN_CHARS=<n> listen"
echo

while true; do
  # echo-gate: never capture while Rick (afplay) is speaking
  while pgrep -x afplay >/dev/null 2>&1; do sleep 0.3; done
  wav="$TMP/cap.wav"; base="$TMP/cap"
  ffmpeg -nostdin -hide_banner -loglevel error -f avfoundation -i "$MIC" -t "$WINDOW" -ac 1 -ar 16000 -y "$wav" 2>/dev/null \
    || { echo "(mic read failed — retrying)"; sleep 0.5; continue; }
  # if Rick started talking during the window, discard (it's echo)
  pgrep -x afplay >/dev/null 2>&1 && continue
  whisper-cli -m "$MODEL" -f "$wav" -l en -nt -oj -of "$base" >/dev/null 2>&1 || continue
  text="$(jq -r '[.transcription[].text] | join(" ")' "$base.json" 2>/dev/null | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/  */ /g')"
  is_noise "$text" && continue
  echo "→ $text"
  cmux send --surface "$SURFACE" -- "$text" && { sleep 0.4; cmux send-key --surface "$SURFACE" enter; }
done
