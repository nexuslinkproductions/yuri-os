#!/usr/bin/env bash
# NUDIMMUD Task Offloader (Enhanced)
# Automatically assesses context or allows manual model/swarm selection.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OFFLOAD_RUNNER="$SCRIPT_DIR/offload-runner.mjs"
BACKEND_URL="http://127.0.0.1:3004"
# Master key for internal API access
API_KEY="nudimmud-master-key-2026-04-23"
# Ollama paths removed — lane deprecated

# Bash subprocesses (e.g. Claude Code Bash tool) don't inherit ~/.zshrc exports.
# When invoked from non-zsh contexts, hydrate lane API keys from ~/.zshrc if absent.
# Only fires when a key is missing — zsh users see no overhead.
if [ -f "$HOME/.zshrc" ]; then
  for _lane_var in DEEPSEEK_API_KEY CODE_DEEPSEEK_API_KEY KIMI_API_KEY MOONSHOT_API_KEY OPENROUTER_API_KEY NVIDIA_API_KEY OLLAMA_API_KEY; do
    if [ -z "${!_lane_var:-}" ]; then
      _line="$(grep -E "^export ${_lane_var}=" "$HOME/.zshrc" | tail -n 1 || true)"
      [ -n "$_line" ] && eval "$_line"
    fi
  done
  unset _lane_var _line
fi

usage() {
  cat <<EOF
Usage: offload [options] <prompt>

Options:
  -l, --list             List available neural models in the registry
  -m, --model <id>       Force offload to a specific model ID
  -s, --swarm <id,id,..> Run task via multiple models (cloud parallel, local serialized)
  -d, --dry-run, --route-only
                         Print routing decision without executing
  -h, --help             Show this help

Default behavior: Automatically routes the task based on intent, complexity, and risk.
EOF
}

list_models() {
  echo "⬡ NUDIMMUD_NEURAL_REGISTRY"
  echo "--------------------------------------------------"
  echo "Wrapper lanes:"
  for lane in gpt-oss deepseek openrouter-free; do
    if command -v "$lane" >/dev/null 2>&1; then
      printf '  [%-8s] %s\n' "$lane" "$(command -v "$lane")"
    else
      printf '  [%-8s] MISSING\n' "$lane"
    fi
  done

  echo
  echo "DeepSeek API lanes:"
  printf '  [%-30s] %s\n' "deepseek-v4-flash" "official V4 Flash (non-thinking default)"
  printf '  [%-30s] %s\n' "deepseek-v4-pro" "official V4 Pro (thinking default)"
  printf '  [%-30s] %s\n' "deepseek-v4-pro-lite-budget" "V4 Pro budget lane (non-thinking, tight caps)"
  printf '  [%-30s] %s\n' "deepseek-chat" "compat alias -> deepseek-v4-flash (non-thinking)"
  printf '  [%-30s] %s\n' "deepseek-reasoner" "compat alias -> deepseek-v4-flash (thinking)"
  printf '  [%-30s] %s\n' "deepseek-cloud" "compat alias -> deepseek-v4-pro"
  printf '  [%-30s] %s\n' "code-deepseek" "compat alias -> deepseek-v4-pro"

  echo
}

classify_lane() {
  case "$1" in
    deepseek-v4-*|deepseek-chat|deepseek-reasoner|deepseek-cloud|code-deepseek|kimi*|moonshot*|*-cloud*|openrouter*) printf 'cloud' ;;
    *) printf 'local' ;;
  esac
}

run_offload_runner() {
  local lane="$1"
  local prompt="$2"
  shift 2

  OFFLOAD_PROMPT_TEXT="$prompt" node "$OFFLOAD_RUNNER" "$lane" "$@"
}

build_route_payload() {
  local prompt="$1"
  node -e 'const prompt = process.argv[1] ?? ""; process.stdout.write(JSON.stringify({ prompt }));' "$prompt"
}

dispatch_model() {
    local target_model="$1"
    local prompt="$2"
    
    # Normalize model IDs to agent names where possible
  case "$target_model" in
      claude-3-5-sonnet-liberated|claude-3-5-sonnet|claude-3-opus|claude)
        printf '%s\n' "⬡ ROUTING_TO_CLAUDE..." >&2
        /Users/marcelspatz/NUDIMMUD/Scripts/ai claude "$prompt"
        ;;
      # Deprecated Moonshot/Kimi compatibility path. Keep manual aliasing only.
      kimi-k2.6|kimi-k2.5-liberated|kimi-k2.5|kimi|moonshot)
        printf '%s\n' "⬡ ROUTING_TO_KIMI..." >&2
        run_offload_runner moonshot "$prompt" --model "$target_model"
        ;;
      gpt-oss:20b|gpt-oss:120b|gpt-oss)
        printf '%s\n' "⬡ ROUTING_TO_GPT_OSS..." >&2
        run_offload_runner gpt-oss "$prompt" --model "$target_model"
        ;;
      deepseek-v4-flash|deepseek-v4-pro|deepseek-v4-pro-lite-budget|deepseek-chat|deepseek-reasoner|deepseek-cloud|code-deepseek)
        printf '%s\n' "⬡ ROUTING_TO_DEEPSEEK_V4..." >&2
        run_offload_runner "$target_model" "$prompt"
        ;;
      deepseek-r1:latest|deepseek-liberated:latest|deepseek-v2:16b|deepseek)
        printf '%s\n' "⬡ ROUTING_TO_DEEPSEEK..." >&2
        run_offload_runner deepseek "$prompt" --model "$target_model"
        ;;
      openrouter-free|openrouter)
        printf '%s\n' "⬡ ROUTING_TO_OPENROUTER_FREE..." >&2
        run_offload_runner openrouter-free "$prompt"
        ;;
      openrouter/free)
        printf '%s\n' "⬡ ROUTING_TO_OPENROUTER_FREE..." >&2
        run_offload_runner openrouter-free "$prompt" --model openrouter/free
        ;;
      *)
        printf '%s\n' "⬡ UNKNOWN_MODEL ($target_model) — no lane configured" >&2
        echo "No lane for model: $target_model" >&2
        return 1
        ;;
    esac
}

route_log() {
  printf '%s\n' "$*" >&2
}

# Parse options
MODEL_OVERRIDE=""
SWARM_MODELS=""
DRY_RUN=0
PROMPT_PARTS=()

while [[ $# -gt 0 ]]; do
  case $1 in
    -l|--list)
      list_models
      exit 0
      ;;
    -m|--model)
      MODEL_OVERRIDE="$2"
      shift 2
      ;;
    -s|--swarm)
      SWARM_MODELS="$2"
      shift 2
      ;;
    -d|--dry-run|--route-only)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      PROMPT_PARTS+=("$1")
      shift
      ;;
  esac
done

PROMPT="${PROMPT_PARTS[*]:-}"

# ── Dry-run gate ────────────────────────────────────────────
if [[ "$DRY_RUN" -eq 1 ]]; then
  if [[ -n "$SWARM_MODELS" ]]; then
    route_log "$(printf '⬡ DRY_RUN_SWARM :: models=[%s]' "$SWARM_MODELS")"
    IFS=',' read -ra ADDR <<< "$SWARM_MODELS"
    for m in "${ADDR[@]}"; do
      route_log "$(printf '  [%s] %s' "$(classify_lane "$m")" "$m")"
    done
    exit 0
  fi
  if [[ -n "$MODEL_OVERRIDE" ]]; then
    route_log "$(printf '⬡ DRY_RUN :: model=%s lane=%s' "$MODEL_OVERRIDE" "$(classify_lane "$MODEL_OVERRIDE")")"
    exit 0
  fi
  DECISION=$(curl -s --connect-timeout 3 --max-time 5 -X POST \
    -H "Content-Type: application/json" \
    -d "{\"prompt\": \"$PROMPT\"}" \
    "$BACKEND_URL/api/swarm/route" 2>/dev/null) || DECISION=""
  MODEL=$(echo "$DECISION" | jq -r '.preferredModel // empty' 2>/dev/null) || MODEL=""
  if [[ -z "$MODEL" || "$MODEL" == "null" ]]; then
    route_log '⬡ DRY_RUN :: backend unreachable, would fall back to local default'
  else
    RUNTIME=$(echo "$DECISION" | jq -r '.preferredRuntime // empty' 2>/dev/null) || RUNTIME=""
    INTENT=$(echo "$DECISION" | jq -r '.intent // empty' 2>/dev/null) || INTENT=""
    route_log "$(printf '⬡ DRY_RUN :: intent=%s runtime=%s model=%s' "$INTENT" "$RUNTIME" "$MODEL")"
  fi
  exit 0
fi

if [[ -z "$PROMPT" ]]; then
  usage
  exit 1
fi

# ── Swarm execution (cloud parallel, local serialized) ─────
if [[ -n "$SWARM_MODELS" ]]; then
    route_log "⬡ INITIATING_MANUAL_SWARM :: models=[$SWARM_MODELS]"
    IFS=',' read -ra ADDR <<< "$SWARM_MODELS"
    cloud_pids=()
    for m in "${ADDR[@]}"; do
        if [[ "$(classify_lane "$m")" == "cloud" ]]; then
            ( OFFLOAD_OPTIONAL=1 dispatch_model "$m" "$PROMPT" ) &
            cloud_pids+=($!)
        else
            OFFLOAD_OPTIONAL=1 dispatch_model "$m" "$PROMPT"
        fi
    done
    for pid in "${cloud_pids[@]}"; do
        wait "$pid" || true
    done
    exit 0
fi

if [[ -n "$MODEL_OVERRIDE" ]]; then
        printf '%s\n' "⬡ MANUAL_OVERRIDE :: model=$MODEL_OVERRIDE" >&2
        dispatch_model "$MODEL_OVERRIDE" "$PROMPT"
        exit 0
fi

# ── Auto routing: try backend, fall back to local default ──
DECISION=$(curl -s --connect-timeout 3 --max-time 5 -X POST \
  -H "Content-Type: application/json" \
  -d "$(build_route_payload "$PROMPT")" \
  "$BACKEND_URL/api/swarm/route" 2>/dev/null) || DECISION=""

MODEL=$(echo "$DECISION" | jq -r '.preferredModel // empty' 2>/dev/null) || MODEL=""
RUNTIME=$(echo "$DECISION" | jq -r '.preferredRuntime // empty' 2>/dev/null) || RUNTIME=""
INTENT=$(echo "$DECISION" | jq -r '.intent // empty' 2>/dev/null) || INTENT=""

if [[ -z "$MODEL" || "$MODEL" == "null" ]]; then
  echo "⬡ BACKEND_UNREACHABLE — cannot auto-route." >&2
  echo "  Manual fallback options:" >&2
  echo "    offload --model <id> \"<prompt>\"                  # direct model" >&2
  echo "    offload --swarm gpt-oss \"<prompt>\"       # swarm" >&2
  # ollama lane removed
  echo "    ai @kimi \"<prompt>\"                              # deprecated Kimi compatibility" >&2
  echo "    ai @deepseek \"<prompt>\"                          # deepseek local" >&2
  exit 1
fi

printf '%s\n' "⬡ OFFLOAD_ASSESSMENT :: intent=$INTENT runtime=$RUNTIME model=$MODEL" >&2
dispatch_model "$MODEL" "$PROMPT"
