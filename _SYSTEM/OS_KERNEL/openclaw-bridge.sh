#!/bin/bash
# openclaw-bridge.sh — Yuri OS ↔ OpenClaw execution bridge
# Lane: 09OC (OPENCLAW)
# Usage: echo '<json>' | ./openclaw-bridge.sh
#        ./openclaw-bridge.sh '<json>'
#
# Input JSON shape:
# {
#   "task_id": "<uuid or null>",
#   "from_agent": "ENKI|DISCORD|SYSTEM",
#   "channel": "discord:<channel_id>",
#   "model_override": "deepseek/deepseek-v4-flash|null",
#   "message": "prompt text for OpenClaw",
#   "context_files": ["/path/to/file", ...],
#   "origin": "ENKI|DISCORD|SYSTEM"
# }
#
# Output: writes to memory.db via kernel.py, prints result JSON to stdout.

set -euo pipefail

KERNEL_PY="$(cd "$(dirname "$0")" && pwd)/syscalls/kernel.py"
OPENCLAW_CLI="${OPENCLAW_CLI:-openclaw}"
LANE_PREFIX="09OC"
DEFAULT_MODEL="deepseek/deepseek-v4-flash"
# PATCH 041 — derive repo root for debug logging; never fail if path missing
_BRIDGE_REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd 2>/dev/null || echo "/tmp")"
_PULSE_ERRORS_LOG="${_BRIDGE_REPO_ROOT}/.claude/state/pulse-errors.log"

# --- Parse input ---
if [ $# -ge 1 ]; then
    PAYLOAD="$1"
else
    PAYLOAD=$(cat)
fi

TASK_ID=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('task_id','') or '')")
FROM_AGENT=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('from_agent','ENKI'))")
CHANNEL=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('channel',''))")
MODEL=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('model_override','') or '${DEFAULT_MODEL}')")
# PATCH 041 — env var override lets us swap model without touching script or payload
MODEL="${OPENCLAW_FALLBACK_MODEL:-$MODEL}"
MESSAGE=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('message',''))")
ORIGIN=$(echo "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('origin','${FROM_AGENT}'))")

# --- Gateway health gate ---
if ! $OPENCLAW_CLI gateway status > /dev/null 2>&1; then
    echo "{\"status\":\"FAILED\",\"error\":\"OpenClaw gateway not reachable\"}"
    exit 1
fi

# --- Create task if no task_id provided ---
if [ -z "$TASK_ID" ] || [ "$TASK_ID" = "null" ]; then
    TASK_ID=$(python3 "$KERNEL_PY" task-create \
        "OpenClaw task from ${FROM_AGENT}" \
        --agent OPENCLAW 2>&1 | sed -n 's/.*Task \([0-9]*\) created.*/\1/p')
fi

# --- Build lane label ---
LANE_LABEL="${LANE_PREFIX}_$(echo "$MESSAGE" | head -c 40 | tr '[:space:]' '_' | tr -cd 'A-Za-z0-9_')_DIRECT_COMMITTED"

# --- Execute OpenClaw agent ---
# PATCH 043 — removed --model override: gateway rejects caller-specified model overrides
# (GatewayClientRequestError: provider/model overrides are not authorized for this caller).
# Model is now controlled by the OpenClaw agent config, not the caller.
OC_OUTPUT=$($OPENCLAW_CLI agent --agent main --json --timeout 120 \
    --message "$MESSAGE" 2>&1 || echo '{"error":"openclaw agent call failed"}')

# --- Parse result ---
RESULT_TEXT=$(echo "$OC_OUTPUT" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    payloads = d.get('result', {}).get('payloads', [])
    if payloads:
        print(payloads[0].get('text', ''))
    else:
        print('')
except:
    print('')
" 2>/dev/null || echo "")

META=$(echo "$OC_OUTPUT" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    meta = d.get('result', {}).get('meta', {})
    agent_meta = meta.get('agentMeta', {})
    print(json.dumps({
        'model': agent_meta.get('model', ''),
        'session_id': agent_meta.get('sessionId', ''),
        'usage': agent_meta.get('usage', {}),
        'stop_reason': meta.get('completion', {}).get('stopReason', ''),
        'duration_ms': meta.get('durationMs', 0)
    }))
except:
    print('{}')
" 2>/dev/null || echo "{}")

STATUS="COMPLETED"
if [ -z "$RESULT_TEXT" ]; then
    STATUS="FAILED"
    # PATCH 041 — log raw OC_OUTPUT snippet so next session can diagnose model/prompt failure
    _OC_SNIPPET=$(printf '%s' "$OC_OUTPUT" | head -c 200 | tr '\n' ' ' 2>/dev/null || echo "(unreadable)")
    printf '%s [openclaw-bridge] openclaw_empty_result model="%s" raw_oc_output="%s"\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" "$MODEL" "$_OC_SNIPPET" \
        >> "$_PULSE_ERRORS_LOG" 2>/dev/null || true
fi

# --- Log memory ---
SUMMARY=$(echo "$RESULT_TEXT" | head -c 120 | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()).strip('\"'))" 2>/dev/null || echo "")
CONTENT_JSON=$(echo "$RESULT_TEXT" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '""')
MEMORY_PAYLOAD=$(python3 -c "
import json
d = {
    'task_id': '${TASK_ID}',
    'source': 'OPENCLAW',
    'channel': '${CHANNEL}',
    'summary': '${SUMMARY}',
    'content': ${CONTENT_JSON},
    'meta': ${META}
}
print(json.dumps(d))
")
python3 "$KERNEL_PY" mem-log "$MEMORY_PAYLOAD" \
    --type episodic \
    --agent OPENCLAW 2>/dev/null || true

# --- Update task ---
python3 "$KERNEL_PY" task-update "$TASK_ID" "$STATUS" \
    --result "{\"lane_label\":\"${LANE_LABEL}\",\"channel\":\"${CHANNEL}\",\"origin\":\"${ORIGIN}\"}" \
    2>/dev/null || true

# --- Log handoff if from another agent ---
if [ "$FROM_AGENT" != "OPENCLAW" ]; then
    python3 "$KERNEL_PY" handoff 0 "$FROM_AGENT" "OPENCLAW" \
        "bridge: ${LANE_LABEL}" 2>/dev/null || true
fi

# --- Output result ---
cat << EOF
{
  "status": "${STATUS}",
  "task_id": "${TASK_ID}",
  "lane_label": "${LANE_LABEL}",
  "agent": "OPENCLAW",
  "channel": "${CHANNEL}",
  "model": "${MODEL}",
  "summary": "${SUMMARY}",
  "meta": ${META}
}
EOF
