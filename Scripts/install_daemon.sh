#!/bin/bash

# ⬡ NUDIMMUD_DAEMON_INSTALLER
# This script configures the NUDIMMUD Command Center to start automatically on boot.

PROJECT_ROOT="/Volumes/T7/NUDIMMUD"

echo "⬡ INITIATING_STARTUP_HOOK_INTEGRATION..."

# 1. Ensure PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo ">>> PM2 not found. Installing global process manager..."
    npm install -g pm2
fi

# 2. Start the ecosystem
echo ">>> Launching NUDIMMUD processes..."
cd "$PROJECT_ROOT"
pm2 start ecosystem.config.js

# 3. Configure OS Startup
echo ">>> Configuring OS-level persistence..."
pm2 startup | grep "sudo" | bash
pm2 save

echo "⬡ INTEGRATION_COMPLETE"
echo ">>> NUDIMMUD will now start automatically on device power-up."
