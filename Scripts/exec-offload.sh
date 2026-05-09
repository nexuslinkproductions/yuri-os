#!/usr/bin/env bash
# Executor wrapper for /offload, /ds-flash, /ds-pro, /research commands
# Called by Claude Code skill system → offload.sh → offload-runner.mjs

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OFFLOAD_SCRIPT="$SCRIPT_DIR/offload.sh"

# Args: $1 = lane (deepseek-v4-flash | deepseek-v4-pro | etc.)
#       $2+ = prompt text
lane="${1:-}"
shift || true
prompt="${@:-}"

if [[ -z "$lane" || -z "$prompt" ]]; then
  echo "Usage: exec-offload.sh <lane> <prompt>"
  echo ""
  echo "Lanes: deepseek-v4-flash, deepseek-v4-pro, deepseek-cloud, deepseek-v4-pro-lite-budget"
  exit 1
fi

# Pass through to offload.sh with prompt via env var (cleaner arg handling)
export OFFLOAD_PROMPT_TEXT="$prompt"
export DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-}"

# Execute and stream output
exec "$OFFLOAD_SCRIPT" --model "" "$lane"
