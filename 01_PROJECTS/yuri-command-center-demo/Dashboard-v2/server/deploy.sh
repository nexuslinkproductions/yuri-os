#!/bin/bash
# deploy.sh — Push + start NEX on Infomaniak server
# Run from Mac: bash server/deploy.sh
# Prerequisites: SSH access to ubuntu@84.234.31.186

set -e

SERVER="ubuntu@84.234.31.186"
REMOTE="/opt/nex/app"

echo "[1/5] Syncing files to server..."
rsync -avz --exclude='node_modules' --exclude='.svelte-kit' --exclude='.netlify' \
  /Users/ic2m/Documents/c2moviez/APP/Dashboard-v2/ \
  "$SERVER:$REMOTE/"

echo "[2/5] Installing dependencies on server..."
ssh "$SERVER" "cd $REMOTE && npm install 2>&1 | tail -3"
ssh "$SERVER" "cd $REMOTE/netlify/functions && npm install 2>&1 | tail -3"

echo "[3/5] Updating ecosystem config..."
ssh "$SERVER" "cp $REMOTE/server/ecosystem.config.js $REMOTE/server/ecosystem.config.cjs"
ssh "$SERVER" "sed -i 's/require/module.exports/' $REMOTE/server/ecosystem.config.cjs 2>/dev/null || true"

echo "[4/5] Updating Caddy config..."
ssh "$SERVER" "sudo cp $REMOTE/server/Caddyfile.template /etc/caddy/Caddyfile && sudo systemctl reload caddy"

echo "[5/5] Restarting PM2 processes..."
ssh "$SERVER" "set -a; source /opt/nex/.env; set +a; cd $REMOTE && pm2 delete nex-frontend 2>/dev/null || true; pm2 start server/ecosystem.config.cjs --update-env; pm2 save"

echo ""
echo "Testing..."
sleep 4
ssh "$SERVER" "curl -s http://localhost:3001/health && echo '' && curl -s http://localhost:3002 | head -3"

echo ""
echo "Done. Check https://ops.c2moviez.com"
