#!/usr/bin/env bash
# NUDIMMUD Task Offloader (Enhanced)
# Automatically assesses context or allows manual model/swarm selection.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OFFLOAD_RUNNER="$SCRIPT_DIR/offload-runner.mjs"
OFFLOAD_QUEUE="$SCRIPT_DIR/offload-queue.mjs"
OFFLOAD_CONTRACT="$SCRIPT_DIR/offload-contract.mjs"
BACKEND_URL="http://127.0.0.1:3004"
# Master key for internal API access
API_KEY="nudimmud-master-key-2026-04-23"
# Ollama paths removed — lane deprecated

# Bash subprocesses (e.g. Claude Code Bash tool) don't inherit ~/.zshrc exports.
# When invoked from non-zsh contexts, hydrate lane API keys from ~/.zshrc if absent.
# Only fires when a key is missing — zsh users see no overhead.
if [ -f "$HOME/.zshrc" ]; then
  for _lane_var in DEEPSEEK_API_KEY CODE_DEEPSEEK_API_KEY KIMI_API_KEY MOONSHOT_API_KEY OPENROUTER_API_KEY NVIDIA_API_KEY OLLAMA_API_KEY OLLAMA_CLOUD_API_KEY; do
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
  --intent <id>          Pass a router intent hint for auto routing
  --reasoning <depth>    Reasoning depth hint: low, medium, high, xhigh
  --tools                Allow model tool calls (default: disabled for DeepSeek)
  --no-tools             Force text-only model output
  -s, --swarm <id,id,..|default>
                         Run task via multiple models (cloud parallel, local serialized)
  -d, --dry-run, --route-only
                         Print routing decision without executing
  -h, --help             Show this help

Default behavior: Automatically routes the task based on intent, complexity, and risk.
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 127
  fi
}

list_models() {
  echo "⬡ NUDIMMUD_NEURAL_REGISTRY"
  echo "--------------------------------------------------"
  echo "Wrapper lanes:"
  printf '  [%-16s] %s\n' "gpt-oss" "active via offload-runner (local wrapper)"
  printf '  [%-16s] %s\n' "deepseek" "compat cloud default via offload-runner"
  printf '  [%-16s] %s\n' "openrouter-free" "active via offload-runner (needs OPENROUTER_API_KEY; supports openrouter/free and provider/model:free)"
  printf '  [%-16s] %s\n' "nvidia-deepseek" "active via offload-runner (needs NVIDIA_API_KEY; defaults to deepseek-ai/deepseek-v4-pro)"

  echo
  echo "DeepSeek API lanes:"
  printf '  [%-30s] %s\n' "deepseek-v4-flash" "official V4 Flash, text-only advisory default"
  printf '  [%-30s] %s\n' "deepseek-v4-pro" "official V4 Pro, reasoning depth via --reasoning"
  printf '  [%-30s] %s\n' "deepseek" "compat default -> deepseek-v4-flash when key is set"
  echo "  Deprecated DeepSeek aliases normalize into the two official lanes above."

  echo
  echo "OpenRouter free lanes:"
  printf '  [%-30s] %s\n' "openrouter/free" "free router; picks a currently available free model"
  printf '  [%-30s] %s\n' "provider/model:free" "any OpenRouter free variant, for example inclusionai/ring-2.6-1t:free"

  echo
  echo "NVIDIA hosted lanes:"
  printf '  [%-30s] %s\n' "nvidia-deepseek" "hosted DeepSeek V4 Pro via NVIDIA NIM"
  printf '  [%-30s] %s\n' "deepseek-ai/deepseek-v4-pro" "direct model override for the NVIDIA lane"

  echo
  echo "Additive Ollama lanes:"
  printf '  [%-30s] %s\n' "ollama" "local-first utility lane, cloud fallback only if configured"
  printf '  [%-30s] %s\n' "ollama-local" "local-only private utility lane"
  printf '  [%-30s] %s\n' "ollama-cloud" "temporary Ollama Cloud fallback using OLLAMA_API_KEY"

  echo
  echo "Needle local runtime:"
  printf '  [%-30s] %s\n' "needle" "active local default for general tasks while qwen2.5:7b remains retired"

  echo
  echo "Codex lanes (Codex CLI; OpenAI Responses API disabled — no API key):"
  echo "  ── Spark tier (gpt-5.3-codex-spark — read-only sandbox, bounded tasks):"
  printf '  [%-30s] %s\n' "codex-spark" "pinned to gpt-5.3-codex-spark, read-only sandbox"
  printf '  [%-30s] %s\n' "spark" "alias → codex-spark"
  printf '  [%-30s] %s\n' "fast-codex" "alias → codex-spark"
  echo "  ── Mini tier (gpt-5.4-mini — workspace-write, reasoning=high default):"
  printf '  [%-30s] %s\n' "gpt-5.4-mini" "gpt-5.4-mini, workspace-write, --reasoning high"
  printf '  [%-30s] %s\n' "codex-mini" "alias → gpt-5.4-mini"
  echo "  ── Full tier (gpt-5.5 — workspace-write, reasoning=high→xhigh, project rules on):"
  printf '  [%-30s] %s\n' "gpt-5.5" "gpt-5.5, workspace-write, --reasoning high (xhigh supported)"
  printf '  [%-30s] %s\n' "codex" "alias → gpt-5.5"
  printf '  [%-30s] %s\n' "codex-high" "alias → gpt-5.5"
  printf '  [%-30s] %s\n' "gpt-5.3-codex" "Alias for codex-spark"

  echo
  echo "Perplexity API lane (requires PERPLEXITY_API_KEY):"
  printf '  [%-30s] %s\n' "perplexity" "sonar-pro default; --reasoning high/xhigh → sonar-reasoning-pro"

  echo
  echo "Browser control lane:"
  printf '  [%-30s] %s\n' "comet" "browser-control adapter via Scripts/comet-adapter.mjs"

  echo
}

classify_lane() {
  case "$1" in
    deepseek-v4-*|deepseek-chat|deepseek-reasoner|deepseek-cloud|code-deepseek|deepseek-ai/*|nvidia-deepseek|kimi*|moonshot*|*-cloud*|openrouter*|*/*:free|codex*|gpt-5.5*|gpt-5.4*|gpt-5.3-codex*|comet) printf 'cloud' ;;
    *) printf 'local' ;;
  esac
}

is_direct_lane_token() {
  local token="${1#@}"
  token="${token%%:*}"
  case "$token" in
    deepseek|deepseek-v4-flash|deepseek-v4-pro|deepseek-chat|deepseek-reasoner|deepseek-cloud|code-deepseek|nvidia-deepseek|kimi|moonshot|gpt-oss|ollama|ollama-local|ollama-cloud|triage-local|summarize-local|code-local|reason-cloud|code-cloud|gemma|gemma-local|gemma-cloud|codex|codex-mini|gpt-5.5|gpt-5.4|gpt-5.4-mini|gpt-5.3-codex|needle|comet)
      return 0
      ;;
  esac

  case "$token" in
    deepseek-v4-*|deepseek-ai/*|kimi*|moonshot*|ollama*|openrouter*|codex*|gpt-5.5*|gpt-5.4*|gpt-5.3-codex*)
      return 0
      ;;
  esac

  return 1
}

resolve_swarm_models() {
  local swarm_models="${1:-}"

  if [[ -z "$swarm_models" || "$swarm_models" == "default" ]]; then
    require_cmd node
    node "$OFFLOAD_CONTRACT" swarm-default
    return
  fi

  printf '%s\n' "$swarm_models"
}

run_offload_runner() {
  local lane="$1"
  local prompt="$2"
  local queue_needed=1
  shift 2

  for arg in "$@"; do
    if [[ "$arg" == "--dry-run" || "$arg" == "--route-only" ]]; then
      queue_needed=0
      break
    fi
  done

  if [[ "$queue_needed" -eq 1 && "$(classify_lane "$lane")" == "cloud" && "${OFFLOAD_QUEUE_BYPASS:-0}" != "1" ]]; then
    OFFLOAD_PROMPT_TEXT="$prompt" node "$OFFLOAD_QUEUE" run --lane "$lane" -- node "$OFFLOAD_RUNNER" "$lane" "$@"
    return
  fi

  OFFLOAD_PROMPT_TEXT="$prompt" node "$OFFLOAD_RUNNER" "$lane" "$@"
}

normalize_reasoning_depth() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    off|none|false|disabled) printf 'off' ;;
    lite|light|low|budget|cheap) printf 'low' ;;
    medium|normal|standard|balanced) printf 'medium' ;;
    reasoning|deep|high|thinking) printf 'high' ;;
    max|maximum|max-reasoning|xhigh|extra-high|ultra) printf 'xhigh' ;;
    *) printf '%s' "${1:-}" ;;
  esac
}

normalize_deepseek_model() {
  local raw="$1"
  local model="${raw#@}"
  local suffix=""

  if [[ "$model" == deepseek-v4-*:* || "$model" == deepseek-cloud:* || "$model" == code-deepseek:* || "$model" == deepseek-reasoner:* || "$model" == deepseek-chat:* ]]; then
    suffix="${model#*:}"
    model="${model%%:*}"
  fi

  case "$model" in
    deepseek-cloud|code-deepseek|deepseek-reasoner)
      printf '%s\n' "⬡ DEEPSEEK_ALIAS_NORMALIZED :: $raw -> deepseek-v4-pro" >&2
      model="deepseek-v4-pro"
      ;;
    deepseek-chat)
      printf '%s\n' "⬡ DEEPSEEK_ALIAS_NORMALIZED :: $raw -> deepseek-v4-flash" >&2
      model="deepseek-v4-flash"
      ;;
    deepseek-v4-pro-lite-budget)
      printf '%s\n' "⬡ DEEPSEEK_ALIAS_NORMALIZED :: $raw -> deepseek-v4-pro --reasoning low" >&2
      model="deepseek-v4-pro"
      suffix="${suffix:-low}"
      ;;
  esac

  if [[ -n "$suffix" ]]; then
    suffix="$(normalize_reasoning_depth "$suffix")"
  fi

  printf '%s|%s' "$model" "$suffix"
}

apply_deepseek_normalization() {
  local var_name="$1"
  local normalized model depth
  normalized="$(normalize_deepseek_model "${!var_name}")"
  model="${normalized%%|*}"
  depth="${normalized#*|}"
  printf -v "$var_name" '%s' "$model"
  if [[ -n "$depth" ]]; then
    REASONING_DEPTH="$depth"
  fi
}

build_route_payload() {
  local prompt="$1"
  local intent="${2:-}"
  node -e 'const prompt = process.argv[1] ?? ""; const intent = process.argv[2] ?? ""; const payload = { prompt }; if (intent) payload.intent = intent; process.stdout.write(JSON.stringify(payload));' "$prompt" "$intent"
}

dry_run_model_override() {
  local target_model="$1"
  local prompt="$2"
  apply_deepseek_normalization target_model
  local reasoning_args=()
  if [[ -n "${REASONING_DEPTH:-}" ]]; then
    reasoning_args=(--reasoning "$REASONING_DEPTH")
  fi

  case "$target_model" in
      codex-spark|spark|fast-codex|gpt-5.3-codex-spark|gpt-5.3-codex)
        OFFLOAD_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/codex-offload-runner.mjs" "$target_model" --dry-run
        ;;
      gpt-5.4-mini|gpt-5.4|codex-mini)
        OFFLOAD_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/codex-offload-runner.mjs" "$target_model" --dry-run ${REASONING_DEPTH:+--reasoning "$REASONING_DEPTH"}
        ;;
      gpt-5.5|codex|codex-high|codex-full)
        OFFLOAD_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/codex-offload-runner.mjs" "$target_model" --dry-run ${REASONING_DEPTH:+--reasoning "$REASONING_DEPTH"}
        ;;
      nvidia-deepseek|deepseek-ai/*)
        printf '%s\n' "⬡ ROUTING_TO_NVIDIA_DEEPSEEK..." >&2
        run_offload_runner nvidia-deepseek "$prompt" --dry-run --model "$target_model"
        ;;
      openrouter-free|openrouter/free|*/*:free)
        printf '%s\n' "⬡ ROUTING_TO_OPENROUTER_FREE..." >&2
        run_offload_runner openrouter-free "$prompt" --dry-run --model "$target_model"
        ;;
      gpt-oss:20b|gpt-oss:120b|gpt-oss)
        run_offload_runner gpt-oss "$prompt" --dry-run
        ;;
      swarm)
        local swarm_models
        swarm_models="$(resolve_swarm_models default)"
        route_log "$(printf '⬡ DRY_RUN_SWARM :: models=[%s]' "$swarm_models")"
        IFS=',' read -ra ADDR <<< "$swarm_models"
        for m in "${ADDR[@]}"; do
          route_log "$(printf '  [%s] %s' "$(classify_lane "$m")" "$m")"
        done
        ;;
      needle)
        printf '%s\n' "⬡ ROUTING_TO_NEEDLE..." >&2
        run_offload_runner ollama-local "$prompt" --dry-run --model needle
        ;;
      perplexity|perplexity-sonar|sonar-pro|sonar-reasoning-pro)
        OFFLOAD_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/perplexity-adapter.mjs" --dry-run ${REASONING_DEPTH:+--reasoning "$REASONING_DEPTH"}
        ;;
      comet)
        printf '%s\n' "⬡ ROUTING_TO_COMET..." >&2
        OFFLOAD_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/comet-adapter.mjs" --dry-run
        ;;
      deepseek-v4-flash|deepseek-v4-pro|deepseek)
        # DeepSeek dry-run: tools default ON unless --no-tools explicit
        local _ds_tool_arg="--tools"
        if [[ "${TOOLS_EXPLICIT:-0}" == "1" && "$ALLOW_MODEL_TOOLS" == "0" ]]; then
          _ds_tool_arg="--no-tools"
        fi
        run_offload_runner "$target_model" "$prompt" --dry-run ${reasoning_args[@]+"${reasoning_args[@]}"} "$_ds_tool_arg"
        ;;
      *)
        route_log "$(printf '⬡ DRY_RUN :: model=%s lane=%s' "$target_model" "$(classify_lane "$target_model")")"
        ;;
  esac
}

dispatch_model() {
    local target_model="$1"
    local prompt="$2"
    apply_deepseek_normalization target_model
    local reasoning_args=()
    if [[ -n "${REASONING_DEPTH:-}" ]]; then
      reasoning_args=(--reasoning "$REASONING_DEPTH")
    fi
    # Per-lane tool default: DeepSeek lanes get tools ON by default (full bash/read/write capability,
    # 50-iter loop). Other lanes default to --no-tools. User can override either direction with explicit
    # --tools / --no-tools flags (TOOLS_EXPLICIT=1).
    local tool_args=()
    local effective_tools="$ALLOW_MODEL_TOOLS"
    if [[ "${TOOLS_EXPLICIT:-0}" != "1" ]]; then
      case "$target_model" in
        deepseek|deepseek-v4-flash|deepseek-v4-pro)
          effective_tools=1
          ;;
      esac
    fi
    if [[ "$effective_tools" == "1" ]]; then
      tool_args=(--tools)
    else
      tool_args=(--no-tools)
    fi

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
        run_offload_runner gpt-oss "$prompt"
        ;;
      needle)
        printf '%s\n' "⬡ ROUTING_TO_NEEDLE..." >&2
        run_offload_runner ollama-local "$prompt" --model needle
        ;;
      perplexity|perplexity-sonar|sonar-pro|sonar-reasoning-pro)
        printf '%s\n' "⬡ ROUTING_TO_PERPLEXITY [${REASONING_DEPTH:+sonar-reasoning-pro}${REASONING_DEPTH:-sonar-pro}]..." >&2
        OFFLOAD_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/perplexity-adapter.mjs" ${REASONING_DEPTH:+--reasoning "$REASONING_DEPTH"}
        ;;
      comet)
        printf '%s\n' "⬡ ROUTING_TO_COMET..." >&2
        OFFLOAD_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/comet-adapter.mjs"
        ;;
      deepseek-v4-flash|deepseek-v4-pro)
        printf '%s\n' "⬡ ROUTING_TO_DEEPSEEK_V4..." >&2
        run_offload_runner "$target_model" "$prompt" ${reasoning_args[@]+"${reasoning_args[@]}"} "${tool_args[@]}"
        ;;
      deepseek-r1:8b|deepseek-r1:latest|deepseek-liberated:latest|deepseek-v2:16b)
        printf '%s\n' "⬡ DEEPSEEK_LOCAL_FROZEN :: local DeepSeek models disabled to prevent system hangs" >&2
        run_offload_runner deepseek-local "$prompt" --model "$target_model" --dry-run
        ;;
      deepseek)
        printf '%s\n' "⬡ ROUTING_TO_DEEPSEEK_CLOUD..." >&2
        run_offload_runner deepseek "$prompt" ${reasoning_args[@]+"${reasoning_args[@]}"} "${tool_args[@]}"
        ;;
      nvidia-deepseek|deepseek-ai/*)
        printf '%s\n' "⬡ ROUTING_TO_NVIDIA_DEEPSEEK..." >&2
        run_offload_runner nvidia-deepseek "$prompt" --model "$target_model"
        ;;
      openrouter-free|openrouter/free|*/*:free)
        printf '%s\n' "⬡ ROUTING_TO_OPENROUTER_FREE..." >&2
        run_offload_runner openrouter-free "$prompt" --model "$target_model"
        ;;
      codex-spark|spark|fast-codex|gpt-5.3-codex-spark|gpt-5.3-codex)
        printf '%s\n' "⬡ ROUTING_TO_CODEX_SPARK [gpt-5.3-codex-spark, read-only]..." >&2
        OFFLOAD_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/codex-offload-runner.mjs" "$target_model"
        ;;
      swarm)
        printf '%s\n' "⬡ ROUTING_TO_SWARM..." >&2
        exec bash "$0" -s default "$prompt"
        ;;
      gpt-5.4-mini|gpt-5.4|codex-mini)
        printf '%s\n' "⬡ ROUTING_TO_CODEX_MINI [gpt-5.4-mini, workspace-write, reasoning=${REASONING_DEPTH:-high}]..." >&2
        OFFLOAD_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/codex-offload-runner.mjs" "$target_model" ${REASONING_DEPTH:+--reasoning "$REASONING_DEPTH"}
        ;;
      gpt-5.5|codex|codex-high|codex-full)
        printf '%s\n' "⬡ ROUTING_TO_CODEX_FULL [gpt-5.5, workspace-write, reasoning=${REASONING_DEPTH:-high}]..." >&2
        OFFLOAD_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/codex-offload-runner.mjs" "$target_model" ${REASONING_DEPTH:+--reasoning "$REASONING_DEPTH"}
        ;;
      triage-local|summarize-local|code-local|ollama|ollama-local|ollama-cloud|reason-cloud|code-cloud|nvidia-deepseek|gemma|gemma-local|gemma-cloud)
        printf '%s\n' "⬡ ROUTING_TO_OFFLOAD_RUNNER..." >&2
        run_offload_runner "$target_model" "$prompt"
        ;;
      self)
        printf '%s\n' "⬡ SELF_EXECUTION_RECOMMENDED — router selected Codex/self for this task." >&2
        return 75
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
ROUTE_INTENT="${OFFLOAD_INTENT:-}"
REASONING_DEPTH=""
ALLOW_MODEL_TOOLS=0
TOOLS_EXPLICIT=0   # 1 if user explicitly passed --tools or --no-tools
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
    --intent)
      ROUTE_INTENT="$2"
      shift 2
      ;;
    --reasoning)
      REASONING_DEPTH="$(normalize_reasoning_depth "$2")"
      shift 2
      ;;
    --tools)
      ALLOW_MODEL_TOOLS=1
      TOOLS_EXPLICIT=1
      shift
      ;;
    --no-tools|--text-only)
      ALLOW_MODEL_TOOLS=0
      TOOLS_EXPLICIT=1
      shift
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

if [[ -z "$MODEL_OVERRIDE" && "${#PROMPT_PARTS[@]}" -gt 1 ]] && is_direct_lane_token "${PROMPT_PARTS[0]}"; then
  MODEL_OVERRIDE="${PROMPT_PARTS[0]#@}"
  PROMPT_PARTS=("${PROMPT_PARTS[@]:1}")
  PROMPT="${PROMPT_PARTS[*]:-}"
fi

# ── Dry-run gate ────────────────────────────────────────────
if [[ "$DRY_RUN" -eq 1 ]]; then
  if [[ -n "$SWARM_MODELS" ]]; then
    SWARM_MODELS="$(resolve_swarm_models "$SWARM_MODELS")"
    route_log "$(printf '⬡ DRY_RUN_SWARM :: models=[%s]' "$SWARM_MODELS")"
    IFS=',' read -ra ADDR <<< "$SWARM_MODELS"
    for m in "${ADDR[@]}"; do
      route_log "$(printf '  [%s] %s' "$(classify_lane "$m")" "$m")"
    done
    exit 0
  fi
  if [[ -n "$MODEL_OVERRIDE" ]]; then
    dry_run_model_override "$MODEL_OVERRIDE" "$PROMPT"
    exit 0
  fi
  DECISION=$(curl -s --connect-timeout 3 --max-time 5 -X POST \
    -H "Content-Type: application/json" \
    -d "$(build_route_payload "$PROMPT" "$ROUTE_INTENT")" \
    "$BACKEND_URL/api/swarm/route" 2>/dev/null) || DECISION=""
  MODEL=$(echo "$DECISION" | jq -r '.preferredModel // empty' 2>/dev/null) || MODEL=""
  if [[ -z "$MODEL" || "$MODEL" == "null" ]]; then
    FALLBACK_MODEL="deepseek-v4-flash"
    case "${ROUTE_INTENT,,}" in
      architecture_review|audit_security|strategy|review|code_edit_large)
        FALLBACK_MODEL="deepseek-v4-pro"
        ;;
    esac
    if [[ "${REASONING_DEPTH,,}" == "high" || "${REASONING_DEPTH,,}" == "xhigh" ]]; then
      FALLBACK_MODEL="deepseek-v4-pro"
    fi
    route_log "$(printf '⬡ DRY_RUN :: backend unreachable, would fall back to %s' "$FALLBACK_MODEL")"
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
    SWARM_MODELS="$(resolve_swarm_models "$SWARM_MODELS")"
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
        apply_deepseek_normalization MODEL_OVERRIDE
        printf '%s\n' "⬡ MANUAL_OVERRIDE :: model=$MODEL_OVERRIDE${REASONING_DEPTH:+ reasoning=$REASONING_DEPTH}" >&2
        dispatch_model "$MODEL_OVERRIDE" "$PROMPT"
        exit 0
fi

# ── Auto routing: try backend, fall back to local default ──
DECISION=$(curl -s --connect-timeout 3 --max-time 5 -X POST \
  -H "Content-Type: application/json" \
  -d "$(build_route_payload "$PROMPT" "$ROUTE_INTENT")" \
  "$BACKEND_URL/api/swarm/route" 2>/dev/null) || DECISION=""

MODEL=$(echo "$DECISION" | jq -r '.preferredModel // empty' 2>/dev/null) || MODEL=""
RUNTIME=$(echo "$DECISION" | jq -r '.preferredRuntime // empty' 2>/dev/null) || RUNTIME=""
INTENT=$(echo "$DECISION" | jq -r '.intent // empty' 2>/dev/null) || INTENT=""

if [[ -z "$MODEL" || "$MODEL" == "null" ]]; then
  FALLBACK_MODEL="deepseek-v4-flash"
  case "${ROUTE_INTENT,,}" in
    architecture_review|audit_security|strategy|review|code_edit_large)
      FALLBACK_MODEL="deepseek-v4-pro"
      ;;
  esac
  if [[ "${REASONING_DEPTH,,}" == "high" || "${REASONING_DEPTH,,}" == "xhigh" ]]; then
    FALLBACK_MODEL="deepseek-v4-pro"
  fi
  echo "⬡ BACKEND_UNREACHABLE — using direct DeepSeek fallback ($FALLBACK_MODEL)." >&2
  echo "  Manual fallback options:" >&2
  echo "    offload --model <id> \"<prompt>\"                  # direct model" >&2
  echo "    offload --model codex-spark \"<prompt>\"          # bounded Codex Spark lane" >&2
  echo "    offload --swarm deepseek-v4-flash,deepseek-v4-pro \"<prompt>\"   # swarm" >&2
  echo "    ai route-plan \"<prompt>\"                         # shared automatic route plan" >&2
  echo "    ai @kimi \"<prompt>\"                              # deprecated Kimi compatibility" >&2
  echo "    ai @deepseek-v4-flash \"<prompt>\"                 # DeepSeek cloud flash" >&2
  MODEL="$FALLBACK_MODEL"
  RUNTIME="cloud"
fi

printf '%s\n' "⬡ OFFLOAD_ASSESSMENT :: intent=$INTENT runtime=$RUNTIME model=$MODEL" >&2
dispatch_model "$MODEL" "$PROMPT"
