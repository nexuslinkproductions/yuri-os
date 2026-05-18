#!/usr/bin/env bash
# kagami-scheduler-status.sh — one-glance view of all scheduled Kagami agents
set -euo pipefail

REPO="/Users/marcelspatz/YURI-OS-MUSUBI"
echo "═══════════════════════════════════════════════════════════"
echo "  YURI OS — Kagami Automation Status  $(date '+%Y-%m-%d %H:%M')"
echo "═══════════════════════════════════════════════════════════"

check_agent() {
  local label="$1" plist="$2"
  local full="$HOME/Library/LaunchAgents/${plist}.plist"
  if [ ! -f "$full" ]; then
    printf "  %-35s %-12s\n" "$label" "NOT REGISTERED"
    return
  fi
  local state
  state=$(launchctl list 2>/dev/null | awk -v lbl="$label" '$3 == lbl {print $2}' || echo "?")
  if [ "$state" = "0" ] || [ "$state" = "-" ]; then
    printf "  %-35s %-12s\n" "$label" "✓ loaded"
  elif [ -z "$state" ]; then
    printf "  %-35s %-12s\n" "$label" "⚠ not running"
  else
    printf "  %-35s %-12s\n" "$label" "exit=$state"
  fi
}

echo ""
echo "  KAGAMI AGENTS"
check_agent "com.yuri.kagami-heartbeat"           "com.yuri.kagami-heartbeat"
check_agent "com.yuri.kagami-memory-consolidator" "com.yuri.kagami-memory-consolidator"
check_agent "com.yuri.kagami-session-synthesizer" "com.yuri.kagami-session-synthesizer"
check_agent "com.yuri.kagami-stale-memory-scan"   "com.yuri.kagami-stale-memory-scan"

echo ""
echo "  EXISTING YURI AGENTS"
check_agent "com.yuri-os-musubi.lane-health"        "com.yuri-os-musubi.lane-health"
check_agent "com.yuri-os-musubi.neuron-loop"        "com.yuri-os-musubi.neuron-loop"
check_agent "com.yuri-os-musubi.palace-auto-rebuild" "com.yuri-os-musubi.palace-auto-rebuild"
check_agent "com.yuri-os-musubi.yuri-sentinel"      "com.yuri-os-musubi.yuri-sentinel"
check_agent "com.yuri-os-musubi.gitnexus-weekly"    "com.yuri-os-musubi.gitnexus-weekly"

echo ""
echo "  LAST RUN LOGS"
for f in heartbeat memory-pipeline memory-consolidator rag-curator session-synthesizer; do
  log="/tmp/kagami-${f}.log"
  if [ -f "$log" ]; then
    last=$(tail -1 "$log" 2>/dev/null | cut -c1-90)
    printf "  %-30s %s\n" "$f" "$last"
  else
    printf "  %-30s %s\n" "$f" "(never run)"
  fi
done

echo ""
echo "  MEMORY HEALTH"
report="$REPO/_SYSTEM/training/state/memory-health.json"
if [ -f "$report" ]; then
  python3 -c "
import json
d = json.load(open('$report'))
print(f'  score={d.get(\"health_score\",\"?\")} stale={len(d.get(\"stale\",[]))} dupes={len(d.get(\"duplicates\",[]))} analyzed={d.get(\"analyzedAt\",\"never\")[:19]}')
" 2>/dev/null || echo "  (parse error)"
else
  echo "  (not yet run)"
fi

echo ""
echo "  RAG INDEX"
idx="$REPO/_SYSTEM/training/data/rag-index.jsonl"
if [ -f "$idx" ]; then
  count=$(wc -l < "$idx" | tr -d ' ')
  echo "  $count entries in rag-index.jsonl"
else
  echo "  (empty)"
fi
echo "═══════════════════════════════════════════════════════════"
