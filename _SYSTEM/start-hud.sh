#!/bin/bash
# ⬡ YURI TRADING — start all services
cd /Users/marcelspatz/.cline/worktrees/51d5c/YURI

echo "Starting feed aggregator (:4201)..."
node _SYSTEM/Scripts/feeds/feed-aggregator.mjs &
AGG_PID=$!
sleep 2

echo "Starting trading API (:3004)..."
node backend/src/trading-server.mjs &
API_PID=$!
sleep 2

echo "Starting HUD frontend (:4200)..."
npx vite --host 0.0.0.0 &
VITE_PID=$!
sleep 3

echo ""
echo "✅ All services running:"
echo "   Frontend:  http://localhost:4200"
echo "   Trading API: http://localhost:3004/api/ping-test"
echo "   Aggregator: http://localhost:4201/health"
echo ""
echo "PIDs: aggregator=$AGG_PID  api=$API_PID  vite=$VITE_PID"
echo "Run 'node _SYSTEM/Scripts/feeds/yuri-validate.mjs' to verify"
echo ""
echo "Press Ctrl+C to stop all"
wait
