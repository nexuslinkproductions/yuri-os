#!/usr/bin/env bash
# kagami-heartbeat.sh — runs every hour via LaunchAgent
# Checks: Kagami server, Rapid-MLX, Ollama, pulse-bus size
# Non-fatal: always exits 0 so LaunchAgent doesn't retry aggressively
set -euo pipefail

REPO="/Users/marcelspatz/YURI-OS-MUSUBI"
LOG="/tmp/kagami-heartbeat.log"
TS="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

log() { echo "[$TS] $*" | tee -a "$LOG"; }

# ── Kagami ──────────────────────────────────────────────────────────────────
if curl -sf http://localhost:3005/kagami/health > /tmp/_hb_kagami.json 2>/dev/null; then
  UPTIME=$(python3 -c "import json,sys; d=json.load(open('/tmp/_hb_kagami.json')); print(round(d.get('value',d).get('uptimeSeconds',0)))" 2>/dev/null || echo "?")
  log "kagami=OK uptime=${UPTIME}s"
else
  log "kagami=DOWN — consider: bash .codex-worktrees/kagami-rebuild/_SYSTEM/Scripts/kagami-start.sh"
fi

# ── Rapid-MLX ───────────────────────────────────────────────────────────────
if curl -sf http://localhost:8000/v1/models > /dev/null 2>&1; then
  log "rapid-mlx=OK"
else
  log "rapid-mlx=DOWN"
fi

# ── Ollama ───────────────────────────────────────────────────────────────────
if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
  log "ollama=OK"
else
  log "ollama=DOWN"
fi

# ── Pulse-bus size ───────────────────────────────────────────────────────────
BUS="$REPO/.claude/state/pulse-bus.jsonl"
if [ -f "$BUS" ]; then
  LINES=$(wc -l < "$BUS" | tr -d ' ')
  SIZE=$(du -sh "$BUS" | cut -f1)
  log "pulse-bus=${LINES} lines ${SIZE}"
  if [ "$LINES" -gt 4500 ]; then
    log "pulse-bus WARN: approaching rotation threshold (5000)"
    node "$REPO/_SYSTEM/Scripts/rotate-pulse-bus.mjs" >> "$LOG" 2>&1 || true
  fi
fi

# ── Memory pipeline log tail (last run) ─────────────────────────────────────
if [ -f /tmp/kagami-memory-pipeline.log ]; then
  LAST=$(tail -1 /tmp/kagami-memory-pipeline.log 2>/dev/null || true)
  log "mem-pipeline last: $LAST"
fi

log "heartbeat=complete"
