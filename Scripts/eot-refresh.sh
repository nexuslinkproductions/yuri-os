#!/usr/bin/env bash
# launchd wrapper for eot-refresh — called by com.nudimmud.eot-refresh.plist
# Adds homebrew to PATH which launchd minimal env lacks.
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/marcelspatz"
cd /Users/marcelspatz/NUDIMMUD
exec /Users/marcelspatz/NUDIMMUD/Scripts/ai eot
