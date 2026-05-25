#!/bin/bash

# This script configures the YURI-OS-MUSUBI to start automatically on boot.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "YURI_DAEMON_INSTALLER: initiating startup hook integration..."

# 1. Ensure PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo ">>> PM2 not found. Installing global process manager..."
    npm install -g pm2
fi

# 2. Start the ecosystem
echo ">>> Launching YURI processes..."
cd "$PROJECT_ROOT"
pm2 start ecosystem.config.js

# 3. Configure OS Startup
echo ">>> Configuring OS-level persistence..."
pm2 startup | grep "sudo" | bash
pm2 save

echo "YURI_DAEMON_INSTALLER: integration complete"
echo ">>> YURI will now start automatically on device power-up."
