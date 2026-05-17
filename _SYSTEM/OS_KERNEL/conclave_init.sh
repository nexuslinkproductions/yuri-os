#!/bin/bash
# YURI OS Conclave Initializer
# Usage: ./conclave_init.sh "Mission Description"

MISSION_DESC=$1

if [ -z "$MISSION_DESC" ]; then
    echo "Usage: ./conclave_init.sh \"Mission Description\""
    exit 1
fi

KERNEL_PY="$(dirname "$0")/syscalls/kernel.py"
SCHEDULER_PY="$(dirname "$0")/scheduler.py"

# Step 1: Initialize the Root Mission via ENLIL
echo "--- INITIATING MISSION VIA ENLIL ---"
TASK_ID=$(python3 "$KERNEL_PY" task-create "$MISSION_DESC" --agent "ENLIL" | grep -o 'Task [0-9]*' | awk '{print $2}')

# Step 2: Show Initial Scheduler State
python3 "$SCHEDULER_PY"

echo "Mission $TASK_ID initialized and assigned to ENLIL."
echo "Run the scheduler with --loop to monitor progress."

read -p "Start the YURI OS Dashboard? (y/n): " START_DASHBOARD
if [ "$START_DASHBOARD" == "y" ]; then
    python3 "$(dirname "$0")/dashboard.py"
fi
