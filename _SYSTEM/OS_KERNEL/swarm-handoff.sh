#!/bin/bash
# Swarm Handoff Utility for Aeonic Conclave
# Bridges the Fractal Orchestration between Agent Tool Loops and Macro Swarm State

if [ "$#" -lt 4 ]; then
    echo "Usage: $0 <TASK_ID> <FROM_AGENT> <TO_AGENT> \"<COMPRESSED_CONTEXT>\""
    echo "Agents: ENLIL, NABU, ENKI, INANNA"
    exit 1
fi

TASK_ID=$1
FROM_AGENT=$2
TO_AGENT=$3
CONTEXT=$4

VALID_AGENTS=("ENLIL" "NABU" "ENKI" "INANNA")
if [[ ! " ${VALID_AGENTS[*]} " =~ " ${FROM_AGENT} " ]] || [[ ! " ${VALID_AGENTS[*]} " =~ " ${TO_AGENT} " ]]; then
    echo "Error: Both FROM and TO agents must be members of the Conclave (ENLIL, NABU, ENKI, INANNA)."
    exit 1
fi

# 1. Log the handoff in the OS_KERNEL to maintain Spectral Stability (prevent infinite loops)
python3 _SYSTEM/OS_KERNEL/syscalls/kernel.py handoff "$TASK_ID" "$FROM_AGENT" "$TO_AGENT" "$CONTEXT"

# 2. Output a structured markdown artifact for the receiving agent's context
cat << EOF > .agent_handoff_context.md
# ⬡ AEONIC CONCLAVE HANDOFF ⬡
**Mission ID:** $TASK_ID
**From:** $FROM_AGENT
**To:** $TO_AGENT
**Timestamp:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")

## Compressed State
$CONTEXT

---
*Note to $TO_AGENT: You are now the active node in the Agent Loop. Read this state, update the task in the OS_KERNEL, and execute your phase of the operation.*
EOF

echo "✅ Handoff logged in kernel."
echo "✅ Context compressed to .agent_handoff_context.md. Please provide this to $TO_AGENT."
