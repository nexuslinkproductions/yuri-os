#!/usr/bin/env bash
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/marcelspatz"
mkdir -p "$HOME/Library/Logs/NUDIMMUD"
cd /Users/marcelspatz/YURI-OS-MUSUBI
exec /opt/homebrew/bin/node _SYSTEM/Scripts/memory-learning-score.mjs --report
