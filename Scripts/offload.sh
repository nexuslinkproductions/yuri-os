#!/usr/bin/env bash
# NUDIMMUD Task Offloader (Enhanced)
# Automatically assesses context or allows manual model/swarm selection.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OFFLOAD_RUNNER="$SCRIPT_DIR/offload-runner.mjs"
BACKEND_URL="http://127.0.0.1:3004"
# Master key for internal API access
API_KEY="nudimmud-master-key-2026-04-23"
RAW_OLLAMA_BIN="${OLLAMA_BIN:-/Applications/Ollama.app/Contents/Resources/ollama}"
OLLAMA_MANIFEST_DIR="${OLLAMA_MANIFEST_DIR:-$HOME/.ollama/models/manifests/registry.ollama.ai/library}"

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
  for lane in gpt-oss deepseek kimi moonshot ollama openrouter-free; do
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
  echo "Raw Ollama binary:"
  if [[ -x "$RAW_OLLAMA_BIN" ]]; then
    printf '  %s\n' "$RAW_OLLAMA_BIN"
  else
    echo "  MISSING"
  fi

  echo
  echo "Local Ollama models:"
  if [[ -d "$OLLAMA_MANIFEST_DIR" ]]; then
    local found=0
    while IFS= read -r manifest; do
      found=1
      rel="${manifest#"$OLLAMA_MANIFEST_DIR"/}"
      model_name="${rel%/*}"
      model_tag="${rel##*/}"
      printf '  [%s:%s]\n' "${model_name//\//:}" "$model_tag"
    done < <(find "$OLLAMA_MANIFEST_DIR" -mindepth 2 -maxdepth 2 -type f | sort)

    if [[ "$found" -eq 0 ]]; then
      echo "  (none)"
    fi
  else
    echo "  (manifest dir missing)"
  fi
}

classify_lane() {
  case "$1" in
    deepseek-v4-*|deepseek-chat|deepseek-reasoner|deepseek-cloud|code-deepseek|kimi*|moonshot*|*-cloud*|openrouter*) printf 'cloud' ;;
    *) printf 'local' ;;
  esac
}

dispatch_model() {
    local target_model="$1"
    local prompt="$2"
    
    # Normalize model IDs to agent names where possible
  case "$target_model" in
      claude-3-5-sonnet-liberated|claude-3-5-sonnet|claude-3-opus|claude)
        echo "⬡ ROUTING_TO_CLAUDE..."
        /Users/marcelspatz/NUDIMMUD/Scripts/ai claude "$prompt"
        ;;
      kimi-k2.6|kimi-k2.5-liberated|kimi-k2.5|kimi|moonshot)
        echo "⬡ ROUTING_TO_KIMI..."
        node "$OFFLOAD_RUNNER" moonshot --model "$target_model" "$prompt"
        ;;
      gpt-oss:20b|gpt-oss:120b|gpt-oss)
        echo "⬡ ROUTING_TO_GPT_OSS..."
        node "$OFFLOAD_RUNNER" gpt-oss --model "$target_model" "$prompt"
        ;;
      deepseek-v4-flash|deepseek-v4-pro|deepseek-v4-pro-lite-budget|deepseek-chat|deepseek-reasoner|deepseek-cloud|code-deepseek)
        echo "⬡ ROUTING_TO_DEEPSEEK_V4..."
        node "$OFFLOAD_RUNNER" "$target_model" "$prompt"
        ;;
      deepseek-r1:latest|deepseek-liberated:latest|deepseek-v2:16b|deepseek)
        echo "⬡ ROUTING_TO_DEEPSEEK..."
        node "$OFFLOAD_RUNNER" deepseek --model "$target_model" "$prompt"
        ;;
      openrouter-free|openrouter)
        echo "⬡ ROUTING_TO_OPENROUTER_FREE..."
        node "$OFFLOAD_RUNNER" openrouter-free "$prompt"
        ;;
      openrouter/free)
        echo "⬡ ROUTING_TO_OPENROUTER_FREE..."
        node "$OFFLOAD_RUNNER" openrouter-free --model openrouter/free "$prompt"
        ;;
      *)
        echo "⬡ ROUTING_TO_OLLAMA ($target_model)..."
        # We wrap Ollama in a temporary UI update if it doesn't have a dedicated command
        # This keeps IndraSwarm visual pulse working for arbitrary models
        curl -s -X POST \
          -H "X-API-KEY: $API_KEY" \
          -H "Content-Type: application/json" \
          -d "{\"status\": \"ACTIVE\", \"command\": \"OLLAMA: $target_model\"}" \
          "$BACKEND_URL/api/agents/ENGINEERING/status" > /dev/null || true

        node "$OFFLOAD_RUNNER" ollama --model "$target_model" "$prompt"

        curl -s -X POST \
          -H "X-API-KEY: $API_KEY" \
          -H "Content-Type: application/json" \
          -d "{\"status\": \"IDLE\", \"command\": \"IDLE\"}" \
          "$BACKEND_URL/api/agents/ENGINEERING/status" > /dev/null || true
        ;;
    esac
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
    printf '⬡ DRY_RUN_SWARM :: models=[%s]\n' "$SWARM_MODELS"
    IFS=',' read -ra ADDR <<< "$SWARM_MODELS"
    for m in "${ADDR[@]}"; do
      printf '  [%s] %s\n' "$(classify_lane "$m")" "$m"
    done
    exit 0
  fi
  if [[ -n "$MODEL_OVERRIDE" ]]; then
    printf '⬡ DRY_RUN :: model=%s lane=%s\n' "$MODEL_OVERRIDE" "$(classify_lane "$MODEL_OVERRIDE")"
    exit 0
  fi
  DECISION=$(curl -s --connect-timeout 3 --max-time 5 -X POST \
    -H "Content-Type: application/json" \
    -d "{\"prompt\": \"$PROMPT\"}" \
    "$BACKEND_URL/api/swarm/route" 2>/dev/null) || DECISION=""
  MODEL=$(echo "$DECISION" | jq -r '.preferredModel // empty' 2>/dev/null) || MODEL=""
  if [[ -z "$MODEL" || "$MODEL" == "null" ]]; then
    printf '⬡ DRY_RUN :: backend unreachable, would fall back to local default\n'
  else
    RUNTIME=$(echo "$DECISION" | jq -r '.preferredRuntime // empty' 2>/dev/null) || RUNTIME=""
    INTENT=$(echo "$DECISION" | jq -r '.intent // empty' 2>/dev/null) || INTENT=""
    printf '⬡ DRY_RUN :: intent=%s runtime=%s model=%s\n' "$INTENT" "$RUNTIME" "$MODEL"
  fi
  exit 0
fi

if [[ -z "$PROMPT" ]]; then
  usage
  exit 1
fi

# ── Swarm execution (cloud parallel, local serialized) ─────
if [[ -n "$SWARM_MODELS" ]]; then
    echo "⬡ INITIATING_MANUAL_SWARM :: models=[$SWARM_MODELS]"
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
    echo "⬡ MANUAL_OVERRIDE :: model=$MODEL_OVERRIDE"
    dispatch_model "$MODEL_OVERRIDE" "$PROMPT"
    exit 0
fi

# ── Auto routing: try backend, fall back to local default ──
DECISION=$(curl -s --connect-timeout 3 --max-time 5 -X POST \
  -H "Content-Type: application/json" \
  -d "{\"prompt\": \"$PROMPT\"}" \
  "$BACKEND_URL/api/swarm/route" 2>/dev/null) || DECISION=""

MODEL=$(echo "$DECISION" | jq -r '.preferredModel // empty' 2>/dev/null) || MODEL=""
RUNTIME=$(echo "$DECISION" | jq -r '.preferredRuntime // empty' 2>/dev/null) || RUNTIME=""
INTENT=$(echo "$DECISION" | jq -r '.intent // empty' 2>/dev/null) || INTENT=""

if [[ -z "$MODEL" || "$MODEL" == "null" ]]; then
  echo "⬡ BACKEND_UNREACHABLE — cannot auto-route." >&2
  echo "  Manual fallback options:" >&2
  echo "    offload --model <id> \"<prompt>\"                  # direct model" >&2
  echo "    offload --swarm kimi,gpt-oss,ollama \"<prompt>\"   # swarm" >&2
  echo "    ai @ollama \"<prompt>\"                            # local ollama" >&2
  echo "    ai @kimi \"<prompt>\"                              # kimi cloud" >&2
  echo "    ai @deepseek \"<prompt>\"                          # deepseek local" >&2
  exit 1
fi

echo "⬡ OFFLOAD_ASSESSMENT :: intent=$INTENT runtime=$RUNTIME model=$MODEL"
dispatch_model "$MODEL" "$PROMPT"
