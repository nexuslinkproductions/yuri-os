#!/usr/bin/env bash
# launchd wrapper for eot-refresh — called by com.yuri.eot-refresh.plist
# Adds homebrew to PATH which launchd minimal env lacks.
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/marcelspatz"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"
echo "[eot-refresh] run at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
exec /opt/homebrew/bin/node "$REPO_ROOT/_SYSTEM/Scripts/eot-archive.mjs" --execute
