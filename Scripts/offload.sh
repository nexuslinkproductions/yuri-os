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
  -s, --swarm <id,id,..> Run task via multiple models in parallel (manual swarm)
  -h, --help             Show this help

Default behavior: Automatically routes the task based on intent, complexity, and risk.
EOF
}

list_models() {
  echo "⬡ NUDIMMUD_NEURAL_REGISTRY"
  echo "--------------------------------------------------"
  echo "Wrapper lanes:"
  for lane in gpt-oss deepseek kimi moonshot ollama; do
    if command -v "$lane" >/dev/null 2>&1; then
      printf '  [%-8s] %s\n' "$lane" "$(command -v "$lane")"
    else
      printf '  [%-8s] MISSING\n' "$lane"
    fi
  done

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
      deepseek-r1:latest|deepseek-liberated:latest|deepseek-v2:16b|deepseek)
        echo "⬡ ROUTING_TO_DEEPSEEK..."
        node "$OFFLOAD_RUNNER" deepseek --model "$target_model" "$prompt"
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

if [[ -z "$PROMPT" ]]; then
  usage
  exit 1
fi

if [[ -n "$SWARM_MODELS" ]]; then
    echo "⬡ INITIATING_MANUAL_SWARM :: models=[$SWARM_MODELS]"
    IFS=',' read -ra ADDR <<< "$SWARM_MODELS"
    for m in "${ADDR[@]}"; do
        (
            dispatch_model "$m" "$PROMPT"
        ) &
    done
    wait
    exit 0
fi

if [[ -n "$MODEL_OVERRIDE" ]]; then
    echo "⬡ MANUAL_OVERRIDE :: model=$MODEL_OVERRIDE"
    dispatch_model "$MODEL_OVERRIDE" "$PROMPT"
    exit 0
fi

# 1. GET AUTO ROUTING DECISION
DECISION=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "{\"prompt\": \"$PROMPT\"}" \
  "$BACKEND_URL/api/swarm/route")

MODEL=$(echo "$DECISION" | jq -r '.preferredModel')
RUNTIME=$(echo "$DECISION" | jq -r '.preferredRuntime')
INTENT=$(echo "$DECISION" | jq -r '.intent')

echo "⬡ OFFLOAD_ASSESSMENT :: intent=$INTENT runtime=$RUNTIME model=$MODEL"
dispatch_model "$MODEL" "$PROMPT"
