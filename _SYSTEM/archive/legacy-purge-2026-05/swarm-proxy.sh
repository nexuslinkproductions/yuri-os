#!/usr/bin/env bash
# YURI Swarm Proxy - Bridge between global shell and Swarm Intelligence UI
# This script updates the IndraSwarm UI status and executes the task via the 'ai' CLI.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_CLI="$SCRIPT_DIR/ai"

AGENT_NAME="${1:-}"
if [[ -z "$AGENT_NAME" ]]; then
  echo "Usage: swarm-proxy <agent_name> <prompt>"
  exit 1
fi
shift

PROMPT="$*"
AGENT_NAME="${AGENT_NAME#@}"
AGENT_UPPER=$(echo "$AGENT_NAME" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
AGENT_LOWER=$(echo "$AGENT_NAME" | tr '[:upper:]' '[:lower:]' | tr '_' '-')

# 1. AUTH & CONFIG
# We pull the master API key from the environment or local .env
API_KEY="${SHELL_SERVICE_KEY:-}"
BACKEND_URL="http://127.0.0.1:3004"

update_swarm_ui() {
  local status="$1"
  local op="${2:-}"
  curl -s -X POST \
    -H "X-API-KEY: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"status\": \"$status\", \"command\": \"$op\"}" \
    "$BACKEND_URL/api/agents/$AGENT_UPPER/status" > /dev/null || true
}

# 2. START SIGNAL (Update IndraSwarm UI)
update_swarm_ui "ACTIVE" "SHELL_EXEC: $PROMPT"

# 3. EXECUTE CLI TASK
if [[ "${AI_DRY_RUN:-0}" == "1" ]]; then
  printf '%s\n' "$AGENT_LOWER"
  status=0
else
  if [[ "$AGENT_LOWER" == "swarm" || "$AGENT_LOWER" == "ruflo" ]]; then
    if [[ -x "$AI_CLI" ]]; then
      "$AI_CLI" "@swarm" "$PROMPT"
    else
      node "$SCRIPT_DIR/offload-runner.mjs" gpt-oss "$PROMPT"
    fi
  else
    node "$SCRIPT_DIR/offload-runner.mjs" "$AGENT_LOWER" "$PROMPT"
  fi
  status=$?
fi

# 4. END SIGNAL (Reset UI to Idle)
update_swarm_ui "IDLE" "IDLE"
exit "$status"
