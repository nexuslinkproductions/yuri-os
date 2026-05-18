#!/usr/bin/env bash
# Universal Yuri gate for terminal commands. Generates packet, sets env, executes.
set -euo pipefail
REPO_ROOT="/Users/marcelspatz/YURI-OS-MUSUBI"
if [[ $# -eq 0 ]]; then echo 'Usage: yuri-gate-exec <command> [args...]' >&2; exit 1; fi

SESSION_ID="gate-$(date +%s)-$$"
YURI_ENTRY_POINT=terminal CLAUDE_SESSION_ID="$SESSION_ID" \
  node "$REPO_ROOT/_SYSTEM/Scripts/pulse-packager.mjs" \
  --session-id "$SESSION_ID" --prompt "$*" 2>/dev/null || true

export YURI_PACKET_PATH="/tmp/yuri-session-packet-${SESSION_ID}.json"
export YURI_ENTRY_POINT=terminal
export YURI_SESSION_ID="$SESSION_ID"
exec "$@"
