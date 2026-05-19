#!/usr/bin/env bash
# launchd wrapper for eot-refresh — called by com.yuri.eot-refresh.plist
# Adds homebrew to PATH which launchd minimal env lacks.
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/marcelspatz"
cd /Users/marcelspatz/YURI-OS-MUSUBI
exec /opt/homebrew/bin/node /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/eot-archive.mjs --execute
