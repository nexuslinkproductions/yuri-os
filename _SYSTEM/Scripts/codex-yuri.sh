#!/usr/bin/env bash
# Yuri-aware Codex wrapper. Generates session packet then invokes Codex with context.
set -euo pipefail
REPO_ROOT="/Users/marcelspatz/YURI-OS-MUSUBI"
PROMPT="${*:-}"
if [[ -z "$PROMPT" ]]; then echo 'Usage: codex-yuri <prompt>' >&2; exit 1; fi

SESSION_ID="codex-$(date +%s)-$$"
YURI_ENTRY_POINT=codex CLAUDE_SESSION_ID="$SESSION_ID" \
  node "$REPO_ROOT/_SYSTEM/Scripts/pulse-packager.mjs" \
  --session-id "$SESSION_ID" --prompt "$PROMPT" 2>/dev/null || true

PACKET_PATH="/tmp/yuri-session-packet-${SESSION_ID}.json"
CONTEXT_BLOCK=""
if [[ -f "$PACKET_PATH" ]]; then
  CONTEXT_BLOCK="$(cat "$PACKET_PATH")"
fi

ENRICHED_PROMPT="[YURI_CONTEXT]
${CONTEXT_BLOCK}
[END_YURI_CONTEXT]

${PROMPT}"

exec /opt/homebrew/bin/codex "$ENRICHED_PROMPT"
