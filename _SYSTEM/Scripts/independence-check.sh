#!/usr/bin/env bash
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/marcelspatz"
mkdir -p "$HOME/Library/Logs/NUDIMMUD"
cd /Users/marcelspatz/YURI-OS-MUSUBI
OUT=$(/opt/homebrew/bin/node _SYSTEM/Scripts/independence-check.mjs)
echo "$OUT" | tee "$HOME/Library/Logs/NUDIMMUD/independence-check.out.log" | tail -5 > .claude/state/independence-daily.txt
