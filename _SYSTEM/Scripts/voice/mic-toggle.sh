#!/usr/bin/env bash
# @capability: voice-mic-mute
# @serves: mute the mic | mute myself | stop the overseer listening | pause voice input | unmute
# @does: toggles the mic-mute flag the overseer listener watches. Muted = the mic still runs but injects NOTHING (except a spoken 'unmute'). One flag file, checked every loop.
# @use: `mute` toggles · `mute on` / `mute off` explicit. Or say "mute" / "unmute" out loud.
# @exports: -
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FLAG="$REPO/_SYSTEM/state/voice/mic.muted"
mkdir -p "$(dirname "$FLAG")"
case "${1:-toggle}" in
  on|mute|off-mic)   : > "$FLAG"; echo "🔇 mic MUTED — overseer won't hear you. (say 'unmute' or run: mute off)";;
  off|unmute|on-mic) rm -f "$FLAG"; echo "🎙 mic LIVE — talk away.";;
  status)            [ -f "$FLAG" ] && echo "🔇 MUTED" || echo "🎙 LIVE";;
  *)                 if [ -f "$FLAG" ]; then rm -f "$FLAG"; echo "🎙 mic LIVE — talk away."; else : > "$FLAG"; echo "🔇 mic MUTED — say 'unmute' or run: mute"; fi;;
esac
