#!/usr/bin/env bash
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/marcelspatz"
mkdir -p "$HOME/Library/Logs/YURI-OS-MUSUBI"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"
OUT=$(/opt/homebrew/bin/node _SYSTEM/Scripts/independence-check.mjs)
echo "$OUT" | tee "$HOME/Library/Logs/YURI-OS-MUSUBI/independence-check.out.log" | tail -5 > .claude/state/independence-daily.txt
