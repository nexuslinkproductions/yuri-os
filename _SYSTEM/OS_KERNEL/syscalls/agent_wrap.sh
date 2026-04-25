#!/bin/bash
# NUDIMMUD OS Agent Wrapper
# Usage: ./agent_wrap.sh <AGENT_ID> <TASK_DESCRIPTION> <COMMAND...>

AGENT_ID=$1
DESCRIPTION=$2
shift 2
COMMAND=$@

KERNEL_PY="$(dirname "$0")/kernel.py"

# Register Task
TASK_ID=$(python3 "$KERNEL_PY" task-create "$DESCRIPTION" --agent "$AGENT_ID" | grep -o 'Task [0-9]*' | awk '{print $2}')

# Set to RUNNING
python3 "$KERNEL_PY" task-update "$TASK_ID" "RUNNING"

# Execute Command
echo "--- AGENT $AGENT_ID EXECUTION START ---"
eval "$COMMAND"
EXIT_CODE=$?
echo "--- AGENT $AGENT_ID EXECUTION END (Code: $EXIT_CODE) ---"

# Set Final Status
if [ $EXIT_CODE -eq 0 ]; then
    python3 "$KERNEL_PY" task-update "$TASK_ID" "COMPLETED"
else
    python3 "$KERNEL_PY" task-update "$TASK_ID" "FAILED" --result "Exit code $EXIT_CODE"
fi

exit $EXIT_CODE
