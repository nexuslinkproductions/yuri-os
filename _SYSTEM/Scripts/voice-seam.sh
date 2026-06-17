#!/usr/bin/env bash
# @capability: voice-seam-inject
# @serves: inject voice into claude | speak to claude | always-on voice input | tmux send transcribed speech
# @does: IN half of the voice loop — push transcribed speech into a LIVE tmux-backed Claude Code session. `listen` records the mic, transcribes with whisper-cli, and injects.
# @use: Phase 1 seam proof. Run alongside a `claude` session running inside tmux.
# @exports: inject, listen, status
#
# This drives the REAL interactive session (no headless / no `claude -p`), per the YURI launch-shape rule.
# Verified contract: tmux send-keys -l (literal) for text, then a separate Enter keypress.

set -uo pipefail

TARGET="${VOICE_TMUX_TARGET:-claude:0.0}"      # tmux session:window.pane the claude CLI runs in
MIC="${VOICE_MIC_INDEX:-:0}"                    # ffmpeg avfoundation audio device, e.g. ":0" (list: ffmpeg -f avfoundation -list_devices true -i "")
MODEL="${VOICE_WHISPER_MODEL:-$HOME/.cache/whisper-cpp/ggml-large-v3-turbo.bin}"
TMP="${TMPDIR:-/tmp}/voice-seam"; mkdir -p "$TMP"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FLAG="${VOICE_FLAG:-$REPO/_SYSTEM/state/voice-loop.enabled}"

have(){ command -v "$1" >/dev/null 2>&1; }

arm(){ mkdir -p "$(dirname "$FLAG")"; : > "$FLAG"; echo "✅ voice OUT armed (flag: $FLAG)."; echo "   Restart Claude Code, then I speak every reply. Disarm: voice-seam.sh off"; }
disarm(){ rm -f "$FLAG" 2>/dev/null; echo "🔇 voice OUT disarmed."; }

inject(){
  local text="$1"
  [ -z "${text// /}" ] && { echo "inject: empty text"; return 1; }
  have tmux || { echo "inject: tmux MISSING — run claude inside tmux first"; return 1; }
  tmux has-session -t "${TARGET%%:*}" 2>/dev/null || { echo "inject: no tmux session '${TARGET%%:*}' (set VOICE_TMUX_TARGET)"; return 1; }
  tmux send-keys -t "$TARGET" -l "$text" && tmux send-keys -t "$TARGET" Enter
}

listen(){
  local secs="${1:-6}"
  have ffmpeg     || { echo "listen: ffmpeg MISSING (brew install ffmpeg)"; return 1; }
  have whisper-cli|| { echo "listen: whisper-cli MISSING (brew install whisper-cpp)"; return 1; }
  have jq         || { echo "listen: jq MISSING (brew install jq)"; return 1; }
  [ -f "$MODEL" ] || { echo "listen: whisper model not found at $MODEL (set VOICE_WHISPER_MODEL)"; return 1; }
  local wav16="$TMP/utt-16k.wav" base="$TMP/utt"
  echo "🎙  recording ${secs}s from avfoundation '$MIC' — speak now…"
  ffmpeg -nostdin -hide_banner -loglevel error -f avfoundation -i "$MIC" -t "$secs" -ac 1 -ar 16000 -y "$wav16" \
    || { echo "listen: capture failed (check VOICE_MIC_INDEX + mic permission)"; return 1; }
  whisper-cli -m "$MODEL" -f "$wav16" -l en -nt -oj -of "$base" >/dev/null 2>&1 \
    || { echo "listen: transcribe failed"; return 1; }
  local text
  text="$(jq -r '[.transcription[].text] | join(" ")' "$base.json" 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [ -z "${text// /}" ] && { echo "listen: empty transcript (silence / wrong mic?)"; return 1; }
  echo "📝  $text"
  inject "$text"
}

status(){
  echo "── VOICE SEAM STATUS ──"
  echo "  target pane : $TARGET"
  echo "  mic index   : $MIC"
  echo "  model       : $MODEL ($([ -f "$MODEL" ] && echo present || echo MISSING))"
  for t in tmux ffmpeg whisper-cli jq say node; do printf "  %-11s : %s\n" "$t" "$(command -v "$t" 2>/dev/null || echo MISSING)"; done
  echo "  armed (OUT) : flag=$([ -f "$FLAG" ] && echo ON || echo off)  env=${VOICE_AGENT_ACTIVE:-unset}"
  echo "  flag file   : $FLAG"
}

case "${1:-status}" in
  on)     arm;;
  off)    disarm;;
  inject) shift; inject "$*";;
  listen) listen "${2:-6}";;
  status) status;;
  *) echo "usage: bash voice-seam.sh {on | off | status | inject <text> | listen [seconds]}";;
esac
