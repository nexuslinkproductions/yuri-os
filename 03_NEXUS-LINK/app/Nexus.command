#!/bin/bash
# Nexus — Marcel's personal application launcher.
# Double-click to start: dashboard (:8472) + social MCP (:8787), opens the app.
# Close this window (or Ctrl+C) to shut everything down.
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="/Users/marcelspatz/.local/bin/node"
LOG_DIR="$APP_DIR/../../_SYSTEM/state/nexus/logs"
mkdir -p "$LOG_DIR"

DASH_PID=""
MCP_PID=""
cleanup() {
  echo
  echo "shutting down Nexus..."
  [ -n "$DASH_PID" ] && kill "$DASH_PID" 2>/dev/null
  [ -n "$MCP_PID" ] && kill "$MCP_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# already running? just open the app
if curl -s -m 1 http://localhost:8472/api/health >/dev/null 2>&1; then
  echo "Nexus already running — opening."
  open http://localhost:8472
  exit 0
fi

echo "starting Nexus..."
"$NODE" "$APP_DIR/server.mjs" >> "$LOG_DIR/dashboard.log" 2>&1 &
DASH_PID=$!
"$NODE" "$APP_DIR/social-mcp.mjs" >> "$LOG_DIR/social-mcp.log" 2>&1 &
MCP_PID=$!

for i in $(seq 1 20); do
  curl -s -m 1 http://localhost:8472/api/health >/dev/null 2>&1 && break
  sleep 0.3
done
curl -s -m 1 http://localhost:8472/api/health >/dev/null 2>&1 || { echo "dashboard failed to start — see $LOG_DIR/dashboard.log"; cleanup; }

curl -s -m 1 http://127.0.0.1:8787/health >/dev/null 2>&1 && MCP_OK="yes" || MCP_OK="no"

echo "dashboard :8472  up"
echo "social-mcp :8787  ${MCP_OK}"
open http://localhost:8472
echo
echo "Nexus is running. Close this window to stop it."
wait
