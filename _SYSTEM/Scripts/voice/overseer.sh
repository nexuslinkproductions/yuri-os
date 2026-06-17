#!/usr/bin/env bash
# @capability: overseer-launch
# @serves: launch the overseer | start voice conductor | overseer session | talk to overseer | one command overseer
# @does: one-command launch of the voice-armed OVERSEER Claude session — ensures the Rick TTS server is up on :8004, silences workers (global voice flag OFF), then launches `claude` with VOICE_AGENT_ACTIVE=1, the overseer role system-prompt, and an opening prompt that re-reads the fleet board.
# @use: type `overseer` (alias) or `bash _SYSTEM/Scripts/voice/overseer.sh` in a cmux terminal tab. Workers = plain `claude` in other tabs.
# @exports: -
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VENV_PY="$REPO/_SYSTEM/state/voice/.venv/bin/python"
SERVER="$REPO/_SYSTEM/Scripts/voice/voice-rick-server.py"
ROLE="$REPO/_SYSTEM/Scripts/voice/overseer-role.md"
BOARD="$REPO/_SYSTEM/state/overseer/board.md"
TEMPLATE="$REPO/_SYSTEM/Scripts/voice/board.template.md"
HEALTH="http://127.0.0.1:8004/health"

up(){ curl -sf -m 2 "$HEALTH" >/dev/null 2>&1; }

# 1. Rick voice server up? (start if not)
if ! up; then
  echo "▶ starting Rick voice server on :8004 …"
  ( "$VENV_PY" "$SERVER" >"$REPO/_SYSTEM/state/voice/server.log" 2>&1 & )
  for _ in $(seq 1 90); do up && break; sleep 1; done
fi
up && echo "✓ Rick voice server live" || echo "⚠ voice server not responding — overseer still runs, just silent (log: _SYSTEM/state/voice/server.log)"

# 2. silence workers: global flag OFF so ONLY this env-armed session speaks
bash "$REPO/_SYSTEM/Scripts/voice-seam.sh" off >/dev/null 2>&1 || true

# 3. ensure the fleet board exists
if [ ! -f "$BOARD" ]; then
  mkdir -p "$(dirname "$BOARD")"
  cp "$TEMPLATE" "$BOARD" 2>/dev/null || : > "$BOARD"
  echo "✓ seeded fleet board: $BOARD"
fi

# 4. launch the voice-armed overseer with its role + an opening board read
echo "▶ launching OVERSEER (voice ON) …"
cd "$REPO"
exec env VOICE_AGENT_ACTIVE=1 claude \
  --append-system-prompt "$(cat "$ROLE")" \
  "Read your fleet board at $BOARD, then tell me in one short sentence the current fleet state and what you need from me. List the worker surfaces you can see with: bash _SYSTEM/Scripts/voice/cmux-dispatch.sh workers"
