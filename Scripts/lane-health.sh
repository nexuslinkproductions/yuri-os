#!/usr/bin/env bash
# lane-health.sh — Live status grid for all major NUDIMMUD lanes
# Usage: bash Scripts/lane-health.sh
# Output: lane × status (LIVE / COOLDOWN / DOWN) × last-check timestamp

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
    DOWN) icon="$(color_red "❌")" ;;
    SKIP) icon="·" ;;
  esac
  printf '  %s  %-26s  %-10s  %s\n' "$icon" "$lane" "$status" "$detail"
}

check_codex() {
  local tier="$1"
  local out
  out="$(node "$SCRIPT_DIR/codex-offload-runner.mjs" "$tier" --smoke 2>&1 | tail -5 | grep -oE 'SMOKE_OK|SKIPPED_OR_RATE_LIMITED|FAILED' | head -1)"
  case "$out" in
    SMOKE_OK) print_row "$tier" LIVE "smoke OK" ;;
    SKIPPED_OR_RATE_LIMITED) print_row "$tier" COOLDOWN "rate-limited" ;;
    FAILED) print_row "$tier" DOWN "smoke failed" ;;
    *) print_row "$tier" DOWN "no response" ;;
  esac
}

check_deepseek() {
  local model="$1"
  local out
  out="$(bash "$SCRIPT_DIR/offload.sh" --dry-run -m "$model" "test" 2>&1 | head -20)"
  if echo "$out" | grep -qE '"status"\s*:\s*"DRY_RUN"' || echo "$out" | grep -q 'DRY_RUN'; then
    print_row "$model" LIVE "dry-run OK"
  elif echo "$out" | grep -qE 'BLOCKED_MISSING|DEEPSEEK_API_KEY'; then
    print_row "$model" DOWN "DEEPSEEK_API_KEY missing"
  else
    print_row "$model" DOWN "no response"
  fi
}

check_ollama_local() {
  if ! command -v ollama >/dev/null 2>&1; then
    print_row "ollama-local" DOWN "ollama CLI missing"
    return
  fi
  if ! ollama list >/dev/null 2>&1; then
    print_row "ollama-local" DOWN "daemon not running"
    return
  fi
  local primary
  primary="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SCRIPT_DIR/../.claude/config/models.json', 'utf8')).local.primary)" 2>/dev/null)"
  if ollama list 2>/dev/null | awk -v m="$primary" '$1==m {found=1} END{exit !found}'; then
    print_row "ollama-local" LIVE "model=$primary"
  else
    print_row "ollama-local" DOWN "primary model $primary not installed"
  fi
}

check_perplexity_api() {
  if [[ -n "${PERPLEXITY_API_KEY:-}" ]]; then
    print_row "perplexity (API)" LIVE "key set"
  else
    print_row "perplexity (API)" DOWN "PERPLEXITY_API_KEY missing — use computer-control app instead"
  fi
}

check_comet() {
  local out
  out="$(OFFLOAD_PROMPT_TEXT="test" node "$SCRIPT_DIR/comet-adapter.mjs" 2>&1 | head -1)"
  if echo "$out" | grep -q '"offload"'; then
    print_row "comet" LIVE "adapter responds"
  else
    print_row "comet" DOWN "adapter not responding"
  fi
}

check_palace() {
  local palace_path="$SCRIPT_DIR/../claude-palace-out/palace-index.md"
  if [[ ! -f "$palace_path" ]]; then
    print_row "palace-index" DOWN "missing"
    return
  fi
  local age_days
  age_days="$(( ($(date +%s) - $(stat -f %m "$palace_path")) / 86400 ))"
  if (( age_days <= 7 )); then
    print_row "palace-index" LIVE "${age_days}d old"
  else
    print_row "palace-index" COOLDOWN "${age_days}d stale (>7d)"
  fi
}

check_gitnexus() {
  if ! command -v npx >/dev/null 2>&1; then
    print_row "gitnexus" DOWN "npx missing"
    return
  fi
  if [[ -d "$SCRIPT_DIR/../.gitnexus" ]]; then
    print_row "gitnexus" LIVE "index present"
  else
    print_row "gitnexus" COOLDOWN "no .gitnexus dir"
  fi
}

# ─── Output ──────────────────────────────────────────────────────────────────

echo "⬡ NUDIMMUD LANE HEALTH @ $TIMESTAMP"
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
echo "Browser / Web:"
check_comet
check_perplexity_api

echo
echo "Knowledge:"
check_palace
check_gitnexus

echo "──────────────────────────────────────────────────────────────"
