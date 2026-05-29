#!/usr/bin/env bash
# lane-health.sh — Live status grid for all major YURI lanes
# Usage: bash _SYSTEM/Scripts/lane-health.sh
# Output: lane × status (LIVE / COOLDOWN / DOWN) × last-check timestamp

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# Explicit PATH — ensures homebrew, node, npx, ollama are found in LaunchAgent env
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/Users/marcelspatz/.bun/bin:$REPO_ROOT/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

color_green() { printf '\033[32m%s\033[0m' "$1"; }
color_yellow() { printf '\033[33m%s\033[0m' "$1"; }
color_red() { printf '\033[31m%s\033[0m' "$1"; }

print_row() {
  local lane="$1" status="$2" detail="$3"
  local icon="?"
  case "$status" in
    LIVE) icon="$(color_green "✅")" ;;
    COOLDOWN) icon="$(color_yellow "⏳")" ;;
    DORMANT) icon="$(color_yellow "🌙")" ;;
    DOWN) icon="$(color_red "❌")" ;;
    SKIP) icon="·" ;;
  esac
  printf '  %s  %-26s  %-10s  %s\n' "$icon" "$lane" "$status" "$detail"
}

check_codex() {
  local tier="$1"
  # Binary capability check — codex CLI uses stored credentials (~/.codex), not OPENAI_API_KEY env.
  # Checking env var is a false negative; checking binary version is the correct signal.
  local version
  version="$(codex --version 2>/dev/null)"
  if [[ -n "$version" ]]; then
    print_row "$tier" LIVE "cli $version"
  else
    print_row "$tier" DOWN "codex binary not found or not authenticated"
  fi
}

check_deepseek() {
  local model="$1"
  local out
  out="$(bash "$SCRIPT_DIR/offload.sh" --dry-run -m "$model" "test" 2>&1 | head -30)"
  # DeepSeek dry-run prints lane resolution JSON with "apiKey": "[set]" and "endpoint"
  if echo "$out" | grep -qE '"apiKey"\s*:\s*"\[set\]"' && echo "$out" | grep -qE '"endpoint"\s*:\s*"https://api\.deepseek\.com"'; then
    print_row "$model" LIVE "dry-run OK"
  elif echo "$out" | grep -qE 'BLOCKED_MISSING|DEEPSEEK_API_KEY|requires DEEPSEEK_API_KEY'; then
    print_row "$model" DOWN "DEEPSEEK_API_KEY missing"
  elif echo "$out" | grep -qE '"lane"\s*:\s*"deepseek'; then
    print_row "$model" LIVE "dry-run OK (key state unknown)"
  else
    print_row "$model" DOWN "no response"
  fi
}

check_ollama_local() {
  # Use curl to check daemon — avoids PATH issues with ollama CLI in LaunchAgent env
  if ! curl -sf --max-time 3 localhost:11434/api/tags >/dev/null 2>&1; then
    print_row "ollama-local" DOWN "daemon not responding on :11434"
    return
  fi
  # Check safe primary model (llama3.2 — only safe model on M2 Pro)
  if curl -sf --max-time 3 localhost:11434/api/tags 2>/dev/null | grep -q "llama3.2"; then
    print_row "ollama-local" LIVE "llama3.2:latest ready"
  else
    print_row "ollama-local" COOLDOWN "daemon up · llama3.2:latest not found"
  fi
}


check_gitnexus() {
  local gitnexus_dir="$SCRIPT_DIR/../.gitnexus"
  if [[ ! -d "$gitnexus_dir" ]]; then
    print_row "gitnexus" DOWN "no .gitnexus dir — run npx gitnexus analyze"
    return
  fi
  # Check index freshness by mtime of dir (updated on each analyze run)
  local age_days
  age_days="$(( ($(date +%s) - $(stat -f %m "$gitnexus_dir")) / 86400 ))"
  if [[ "$age_days" -le 7 ]]; then
    print_row "gitnexus" LIVE "index ${age_days}d old"
  else
    print_row "gitnexus" COOLDOWN "index ${age_days}d stale (>7d)"
  fi
}

# ─── Output ──────────────────────────────────────────────────────────────────

echo "⬡ YURI LANE HEALTH @ $TIMESTAMP"
echo "──────────────────────────────────────────────────────────────"

echo "Codex tiers:"
check_codex gpt-5.3-codex-spark
check_codex gpt-5.4-mini
check_codex gpt-5.5

echo
echo "DeepSeek:"
check_deepseek deepseek-v4-flash
check_deepseek deepseek-v4-pro

echo
echo "Local:"
check_ollama_local

echo
echo "Knowledge:"
check_gitnexus

echo "──────────────────────────────────────────────────────────────"

# Write machine-readable JSON for brain-inject.js and other consumers
JSON_OUT="$SCRIPT_DIR/../.claude/state/lane-health-status.json"
DEEPSEEK_STATUS="DOWN"
bash "$SCRIPT_DIR/offload.sh" --dry-run -m deepseek-v4-pro "test" 2>/dev/null | grep -q '"apiKey": "\[set\]"' && DEEPSEEK_STATUS="LIVE"
OLLAMA_STATUS="DOWN"
curl -sf --max-time 3 localhost:11434/api/tags >/dev/null 2>&1 && OLLAMA_STATUS="LIVE"
CODEX_STATUS="DOWN"
codex --version >/dev/null 2>&1 && CODEX_STATUS="LIVE"
GITNEXUS_STATUS="DOWN"
[[ -d "$SCRIPT_DIR/../.gitnexus" ]] && GITNEXUS_STATUS="LIVE"
printf '{"ts":"%s","lanes":{"codex":"%s","deepseek":"%s","ollama":"%s","gitnexus":"%s"}}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$CODEX_STATUS" "$DEEPSEEK_STATUS" "$OLLAMA_STATUS" "$GITNEXUS_STATUS" \
  > "$JSON_OUT" 2>/dev/null || true
