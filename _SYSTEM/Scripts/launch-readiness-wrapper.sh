#!/bin/bash
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p /Users/marcelspatz/Library/Logs/NUDIMMUD
node "$REPO_ROOT/_SYSTEM/Scripts/launch-readiness-check.mjs" --json \
  > "$REPO_ROOT/.claude/state/launch-gate.json"
EXIT=$?
touch /Users/marcelspatz/Library/Logs/NUDIMMUD/launch-readiness.out.log
exit $EXIT
