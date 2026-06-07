#!/usr/bin/env bash

# ── Key hydration (MUST run first — before any exec that replaces this process) ──
# Bash subprocesses (e.g. Claude Code Bash tool) don't inherit ~/.zshrc exports.
# pulse-lane-dispatch.mjs and llm-lane.mjs are Node child processes that
# inherit this process's env — hydrate before any exec so they always have keys.
# Primary: source dedicated key file (no parsing, always reliable)
# shellcheck source=/dev/null
[ -f "$HOME/.config/yuri/env.sh" ] && source "$HOME/.config/yuri/env.sh"
hydrate_keychain_var() {
  local key="$1"
  local service="${YURI_KEYCHAIN_SERVICE_PREFIX:-YURI_OS_MUSUBI}:$key"
  local value=""
  if [ -n "${!key:-}" ] || ! command -v security >/dev/null 2>&1; then
    return 0
  fi
  value="$(security find-generic-password -a "${USER:-$(whoami)}" -s "$service" -w 2>/dev/null || true)"
  [ -n "$value" ] && export "$key=$value"
}
for _lane_var in DEEPSEEK_API_KEY CODE_DEEPSEEK_API_KEY NVIDIA_API_KEY OPENAI_API_KEY OLLAMA_API_KEY OLLAMA_CLOUD_API_KEY; do
  hydrate_keychain_var "$_lane_var"
done
unset _lane_var
# Fallback: grep .zshrc for any key still unset
if [ -f "$HOME/.zshrc" ]; then
  for _lane_var in DEEPSEEK_API_KEY CODE_DEEPSEEK_API_KEY NVIDIA_API_KEY OPENAI_API_KEY OLLAMA_API_KEY OLLAMA_CLOUD_API_KEY; do
    if [ -z "${!_lane_var:-}" ]; then
      _line="$(grep -E "^export ${_lane_var}=" "$HOME/.zshrc" | tail -n 1 || true)"
      [ -n "$_line" ] && eval "$_line"
    fi
  done
  unset _lane_var _line
fi

# If --model is explicitly set, bypass pulse classifier (MANUAL_OVERRIDE)
for _arg in "$@"; do
  if [[ "$_arg" == "--model" || "$_arg" == "-m" ]]; then export PULSE_LANE_BYPASS=1; break; fi
done

# Tier-gated pulse routing (keys are hydrated above — safe to exec now)
if [ -z "$PULSE_LANE_BYPASS" ] && [ -z "$INSIDE_PULSE_WRAPPER" ]; then
  PULSE_TIER=$(node _SYSTEM/Scripts/pulse-classify-stdin.mjs "$@" 2>/dev/null)
  if [ "$PULSE_TIER" = "complex" ] || [ "$PULSE_TIER" = "critical" ]; then
    export INSIDE_PULSE_WRAPPER=1
    exec node _SYSTEM/Scripts/pulse-lane-dispatch.mjs "$@"
  fi
fi

# YURI LLM Compatibility Dispatcher
# Automatically assesses context or allows manual model selection.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LLM_COMPAT_RUNNER="$SCRIPT_DIR/llm-lane.mjs"
LLM_COMPAT_QUEUE="$SCRIPT_DIR/llm-compat-queue.mjs"
LLM_COMPAT_CONTRACT="$SCRIPT_DIR/llm-compat-contract.mjs"
OLLAMA_LANE_RUNNER="$SCRIPT_DIR/ollama-lane.mjs"

usage() {
  cat <<EOF
Usage: llm-compat [options] <prompt>

Options:
  -l, --list             List available neural models in the registry
  -m, --model <id>       Force llm-compat to a specific model ID
  --intent <id>          Pass a router intent hint for auto routing
  --reasoning <depth>    Reasoning depth hint: low, medium, high, xhigh
  --tools                Force API tool-call mode only when explicitly requested
  --no-tools             Force text-only model output
  --no-session           Disable persistent lane-session read/write for this call
  --session <name>       Use a named persistent lane session
  --fresh                Rotate the named lane session before this call
  --write-scope <paths>  Colon-delimited write allowlist for DeepSeek write_file
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
  echo "⬡ YURI_NEURAL_REGISTRY"
  echo "--------------------------------------------------"
  echo "Wrapper lanes:"
  printf '  [%-16s] %s\n' "gpt-oss" "active via Ollama local wrapper; policy model gemma4:12b-it-qat"
  printf '  [%-16s] %s\n' "deepseek" "active direct DeepSeek API; keychain/env hydrated"
  printf '  [%-16s] %s\n' "openrouter-free" "legacy compatibility token (requires explicit implementation before use)"

  echo
  echo "LLM compatibility reasoning lanes:"
  printf '  [%-30s] %s\n' "deepseek-v4-pro" "V4 Pro via api.deepseek.com; reasoning depth via --reasoning"
  printf '  [%-30s] %s\n' "nemotron-3-ultra-550b-a55b" "Nemotron 3 Ultra via NVIDIA NIM"
  printf '  [%-30s] %s\n' "kimi-k2.6" "Kimi K2.6 via NVIDIA NIM"

  echo
  echo "Additive Ollama lanes:"
  printf '  [%-30s] %s\n' "ollama" "local-first utility lane, cloud fallback only if configured"
  printf '  [%-30s] %s\n' "ollama-local" "local-only private utility lane"
  printf '  [%-30s] %s\n' "gemma-local" "local Gemma lane, prefers gemma4:12b-it-qat"
  printf '  [%-30s] %s\n' "gemma" "Gemma lane, local-first with cloud fallback only if configured"

  echo
  echo "Codex lanes (Codex CLI; OpenAI Responses API disabled — no API key):"
  echo "  ── Spark tier (gpt-5.3-codex-spark — read-only sandbox, bounded tasks):"
  printf '  [%-30s] %s\n' "codex-spark" "pinned to gpt-5.3-codex-spark, read-only sandbox"
  printf '  [%-30s] %s\n' "spark" "alias → codex-spark"
  printf '  [%-30s] %s\n' "fast-codex" "alias → codex-spark"
  echo "  ── Mini tier (gpt-5.4-mini — workspace-write, reasoning=max default):"
  printf '  [%-30s] %s\n' "gpt-5.4-mini" "gpt-5.4-mini, workspace-write, --reasoning max"
  printf '  [%-30s] %s\n' "codex-mini" "alias → gpt-5.4-mini"
  echo "  ── Full tier (gpt-5.5 — workspace-write, reasoning=max default, project rules on):"
  printf '  [%-30s] %s\n' "gpt-5.5" "gpt-5.5, workspace-write, --reasoning max (override for cheaper runs)"
  printf '  [%-30s] %s\n' "codex" "alias → gpt-5.5"
  printf '  [%-30s] %s\n' "codex-high" "alias → gpt-5.5"
  printf '  [%-30s] %s\n' "gpt-5.3-codex" "Alias for codex-spark"

  echo
}

classify_lane() {
  case "$1" in
    deepseek-v4-pro|nemotron-3-ultra-550b-a55b|kimi-k2.6|nvidia/nemotron-3-ultra-550b-a55b|moonshotai/kimi-k2.6|kimi|nemotron|deepseek|nvidia/*|codex*|gpt-5.5*|gpt-5.4*|gpt-5.3-codex*) printf 'cloud' ;;
    *) printf 'local' ;;
  esac
}

is_direct_lane_token() {
  local token="${1#@}"
  token="${token%%:*}"
  case "$token" in
    deepseek|deepseek-v4-pro|nemotron|nemotron-3-ultra-550b-a55b|kimi|kimi-k2.6|codex|codex-mini|gpt-5.5|gpt-5.4|gpt-5.4-mini|gpt-5.3-codex|triage-local|summarize-local|code-local|ollama|ollama-local|ollama-cloud|gemma|gemma-local|gemma-cloud|gpt-oss|reason-cloud|code-cloud)
      return 0
      ;;
  esac

  case "$token" in
    nvidia/nemotron-3-ultra-550b-a55b|moonshotai/kimi-k2.6|codex*|gpt-5.5*|gpt-5.4*|gpt-5.3-codex*)
      return 0
      ;;
  esac

  return 1
}

run_offload_runner() {
  local lane="$1"
  local prompt="$2"
  local queue_needed=1
  local write_scope="${WRITE_SCOPE:-}"
  local runner_args=()
  local has_runner_args=0
  shift 2

  if [[ "${#SESSION_ARGS[@]}" -gt 0 ]]; then
    runner_args+=("${SESSION_ARGS[@]}")
    has_runner_args=1
  fi

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --write-scope)
        write_scope="$2"
        shift 2
        ;;
      *)
        runner_args+=("$1")
        has_runner_args=1
        shift
        ;;
    esac
  done

  local env_args=(LLM_COMPAT_PROMPT_TEXT="$prompt")
  case "$lane" in
    deepseek|deepseek-v4-pro)
      if [[ -n "$write_scope" ]]; then
        env_args+=(DEEPSEEK_WRITE_SCOPE="$write_scope")
      fi
      ;;
  esac

  case "$lane" in
    triage-local|summarize-local|code-local|ollama|ollama-local|ollama-cloud|gemma|gemma-local|gemma-cloud|gpt-oss|reason-cloud|code-cloud)
      env "${env_args[@]}" node "$OLLAMA_LANE_RUNNER" "$lane" ${runner_args[@]+"${runner_args[@]}"}
      return
      ;;
  esac

  if [[ "$has_runner_args" -eq 1 ]]; then
    for arg in "${runner_args[@]}"; do
      if [[ "$arg" == "--dry-run" || "$arg" == "--route-only" ]]; then
        queue_needed=0
        break
      fi
    done
  fi

  # Dispatch through the minimal llm-lane.mjs core (replaces the retired legacy runner).
  # The 3 live lanes resolve; any dead legacy lane name loud-fails exit 3 (correct).
  if [[ "$queue_needed" -eq 1 && "$(classify_lane "$lane")" == "cloud" && "${LLM_COMPAT_QUEUE_BYPASS:-0}" != "1" ]]; then
    env "${env_args[@]}" node "$LLM_COMPAT_QUEUE" run --lane "$lane" -- node "$SCRIPT_DIR/llm-lane.mjs" "$lane" ${runner_args[@]+"${runner_args[@]}"}
    return
  fi

  env "${env_args[@]}" node "$SCRIPT_DIR/llm-lane.mjs" "$lane" ${runner_args[@]+"${runner_args[@]}"}
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
      printf '%s\n' "⬡ DEEPSEEK_ALIAS_NORMALIZED :: $raw -> deepseek-v4-pro" >&2
      model="deepseek-v4-pro"
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


dry_run_model_override() {
  local target_model="$1"
  local prompt="$2"
  apply_deepseek_normalization target_model
  local reasoning_args=()
  local tool_args=()
  local extra_codex_flags=""
  if [[ -n "${REASONING_DEPTH:-}" ]]; then
    reasoning_args=(--reasoning "$REASONING_DEPTH")
  fi
  if [[ "${TOOLS_EXPLICIT:-0}" == "1" && "$ALLOW_MODEL_TOOLS" == "1" ]]; then
    tool_args=(--tools)
  elif [[ "${TOOLS_EXPLICIT:-0}" == "1" && "$ALLOW_MODEL_TOOLS" != "1" ]]; then
    tool_args=(--no-tools)
  fi
  if [[ -n "${CODEX_TARGET_WORKTREE:-}" ]]; then
    extra_codex_flags="--cd $CODEX_TARGET_WORKTREE"
  fi

  case "$target_model" in
      codex-spark|spark|fast-codex|gpt-5.3-codex-spark|gpt-5.3-codex)
        LLM_COMPAT_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/codex-offload-runner.mjs" "$target_model" ${extra_codex_flags:+$extra_codex_flags} --dry-run
        ;;
      gpt-5.4-mini|gpt-5.4|codex-mini)
        LLM_COMPAT_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/codex-offload-runner.mjs" "$target_model" ${extra_codex_flags:+$extra_codex_flags} --dry-run ${REASONING_DEPTH:+--reasoning "$REASONING_DEPTH"}
        ;;
      gpt-5.5|codex|codex-high|codex-full)
        LLM_COMPAT_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/codex-offload-runner.mjs" "$target_model" ${extra_codex_flags:+$extra_codex_flags} --dry-run ${REASONING_DEPTH:+--reasoning "$REASONING_DEPTH"}
        ;;
      nvidia-deepseek|nvidia-deepseek-v4-pro|nvidia-deepseek-v4-flash)
        printf '%s\n' "⬡ NVIDIA_DEEPSEEK_RETIRED :: use direct deepseek-v4-pro" >&2
        return 2
        ;;
      nemotron|nemotron-3-ultra-550b-a55b|nvidia/nemotron-3-ultra-550b-a55b)
        _nim_model="nvidia/nemotron-3-ultra-550b-a55b"
        printf '%s\n' "⬡ ROUTING_TO_NVIDIA_NIM [${_nim_model}]..." >&2
        run_offload_runner nvidia-nim "$prompt" --dry-run --model "$_nim_model" ${tool_args[@]+"${tool_args[@]}"}
        ;;
      kimi|kimi-k2.6|moonshotai/kimi-k2.6)
        printf '%s\n' "⬡ ROUTING_TO_KIMI_NIM..." >&2
        run_offload_runner kimi-k2.6 "$prompt" --dry-run ${tool_args[@]+"${tool_args[@]}"}
        ;;
      openrouter-free|openrouter/free|*/*:free)
        printf '%s\n' "⬡ ROUTING_TO_OPENROUTER_FREE..." >&2
        run_offload_runner openrouter-free "$prompt" --dry-run --model "$target_model"
        ;;
      needle)
        printf '%s\n' "⬡ NEEDLE_RETIRED :: local policy is gemma4:12b-it-qat only" >&2
        run_offload_runner gemma-local "$prompt" --dry-run --model gemma4:12b-it-qat
        ;;
      triage-local|summarize-local|code-local|ollama|ollama-local|ollama-cloud|gemma|gemma-local|gemma-cloud|gpt-oss|gpt-oss:20b|gpt-oss:120b|reason-cloud|code-cloud)
        printf '%s\n' "⬡ DRY_RUN_OLLAMA_LANE..." >&2
        run_offload_runner "${target_model%%:*}" "$prompt" --dry-run
        ;;
      gemma4:*|hf.co/*gemma*)
        printf '%s\n' "⬡ DRY_RUN_GEMMA_LOCAL..." >&2
        run_offload_runner gemma-local "$prompt" --dry-run --model "$target_model"
        ;;
      deepseek-v4-pro|deepseek)
        # DeepSeek dispatch: do not force CLI tool flags. Tool/skill intent belongs
        # in the prompt contract unless the caller explicitly overrides here.
        local _ds_tool_args=()
        if [[ "${TOOLS_EXPLICIT:-0}" == "1" && "$ALLOW_MODEL_TOOLS" == "1" ]]; then
          _ds_tool_args=(--tools)
        elif [[ "${TOOLS_EXPLICIT:-0}" == "1" && "$ALLOW_MODEL_TOOLS" != "1" ]]; then
          _ds_tool_args=(--no-tools)
        fi
        case "$target_model" in
          deepseek-v4-pro)
            run_offload_runner "$target_model" "$prompt" --dry-run ${reasoning_args[@]+"${reasoning_args[@]}"} ${_ds_tool_args[@]+"${_ds_tool_args[@]}"}
            ;;
          deepseek)
            run_offload_runner deepseek-v4-pro "$prompt" --dry-run ${reasoning_args[@]+"${reasoning_args[@]}"} ${_ds_tool_args[@]+"${_ds_tool_args[@]}"}
            ;;
        esac
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
    local extra_codex_flags=""
    if [[ -n "${REASONING_DEPTH:-}" ]]; then
      reasoning_args=(--reasoning "$REASONING_DEPTH")
    fi
    # DeepSeek dispatch must not force CLI tool flags. Prompt packets name the
    # skills/tools to invoke; explicit user flags still pass through.
    local tool_args=()
    if [[ "${TOOLS_EXPLICIT:-0}" == "1" && "$ALLOW_MODEL_TOOLS" == "1" ]]; then
      tool_args=(--tools)
    elif [[ "${TOOLS_EXPLICIT:-0}" == "1" && "$ALLOW_MODEL_TOOLS" != "1" ]]; then
      tool_args=(--no-tools)
    fi
    if [[ -n "${CODEX_TARGET_WORKTREE:-}" ]]; then
      extra_codex_flags="--cd $CODEX_TARGET_WORKTREE"
    fi

    check_branch_lock_advisory "$prompt"

    # Normalize model IDs to agent names where possible
  case "$target_model" in
      claude-3-5-sonnet-liberated|claude-3-5-sonnet|claude-3-opus|claude)
        printf '%s\n' "⬡ ROUTING_TO_CLAUDE..." >&2
        "$SCRIPT_DIR/ai" claude "$prompt"
        ;;
      kimi-k2.6|kimi|moonshotai/kimi-k2.6)
        printf '%s\n' "⬡ ROUTING_TO_KIMI_NIM..." >&2
        run_offload_runner kimi-k2.6 "$prompt" ${tool_args[@]+"${tool_args[@]}"}
        ;;
      gpt-oss:20b|gpt-oss:120b|gpt-oss)
        printf '%s\n' "⬡ ROUTING_TO_GPT_OSS..." >&2
        run_offload_runner gpt-oss "$prompt"
        ;;
      needle)
        printf '%s\n' "⬡ NEEDLE_RETIRED :: routing to gemma4:12b-it-qat local policy" >&2
        run_offload_runner gemma-local "$prompt" --model gemma4:12b-it-qat
        ;;
      deepseek-v4-pro)
        printf '%s\n' "⬡ ROUTING_TO_DEEPSEEK_DIRECT [$target_model]..." >&2
        run_offload_runner "$target_model" "$prompt" ${reasoning_args[@]+"${reasoning_args[@]}"} ${tool_args[@]+"${tool_args[@]}"}
        ;;
      deepseek-r1:8b|deepseek-r1:latest|deepseek-liberated:latest|deepseek-v2:16b)
        printf '%s\n' "⬡ DEEPSEEK_LOCAL_FROZEN :: local DeepSeek models disabled to prevent system hangs" >&2
        run_offload_runner deepseek-local "$prompt" --model "$target_model" --dry-run
        ;;
      deepseek)
        printf '%s\n' "⬡ ROUTING_TO_DEEPSEEK_DIRECT [deepseek-v4-pro]..." >&2
        run_offload_runner deepseek-v4-pro "$prompt" ${reasoning_args[@]+"${reasoning_args[@]}"} ${tool_args[@]+"${tool_args[@]}"}
        ;;
      nvidia-deepseek|nvidia-deepseek-v4-pro|nvidia-deepseek-v4-flash)
        printf '%s\n' "⬡ NVIDIA_DEEPSEEK_RETIRED :: use direct deepseek-v4-pro" >&2
        return 2
        ;;
      nemotron|nemotron-3-ultra-550b-a55b|nvidia/nemotron-3-ultra-550b-a55b)
        _nim_model="nvidia/nemotron-3-ultra-550b-a55b"
        printf '%s\n' "⬡ ROUTING_TO_NVIDIA_NIM [${_nim_model}]..." >&2
        run_offload_runner nvidia-nim "$prompt" --model "$_nim_model" ${tool_args[@]+"${tool_args[@]}"}
        ;;
      openrouter-free|openrouter/free|*/*:free)
        printf '%s\n' "⬡ ROUTING_TO_OPENROUTER_FREE..." >&2
        run_offload_runner openrouter-free "$prompt" --model "$target_model"
        ;;
      codex-spark|spark|fast-codex|gpt-5.3-codex-spark|gpt-5.3-codex)
        printf '%s\n' "⬡ ROUTING_TO_CODEX_SPARK [gpt-5.3-codex-spark, read-only]..." >&2
        LLM_COMPAT_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/codex-offload-runner.mjs" "$target_model" ${extra_codex_flags:+$extra_codex_flags}
        ;;
      gpt-5.4-mini|gpt-5.4|codex-mini)
        printf '%s\n' "⬡ ROUTING_TO_CODEX_MINI [gpt-5.4-mini, workspace-write, reasoning=${REASONING_DEPTH:-high}]..." >&2
        LLM_COMPAT_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/codex-offload-runner.mjs" "$target_model" ${extra_codex_flags:+$extra_codex_flags} ${REASONING_DEPTH:+--reasoning "$REASONING_DEPTH"}
        ;;
      gpt-5.5|codex|codex-high|codex-full)
        printf '%s\n' "⬡ ROUTING_TO_CODEX_FULL [gpt-5.5, workspace-write, reasoning=${REASONING_DEPTH:-high}]..." >&2
        LLM_COMPAT_PROMPT_TEXT="$prompt" node "$SCRIPT_DIR/codex-offload-runner.mjs" "$target_model" ${extra_codex_flags:+$extra_codex_flags} ${REASONING_DEPTH:+--reasoning "$REASONING_DEPTH"}
        ;;
      triage-local|summarize-local|code-local|ollama|ollama-local|ollama-cloud|reason-cloud|code-cloud|gemma|gemma-local|gemma-cloud)
        if ! curl -sf --max-time 2 localhost:11434/api/tags >/dev/null 2>&1; then printf '%s\n' '⚠ [llm-compat] Ollama not responding on :11434 — lane may cold-start' >&2; fi
        printf '%s\n' "⬡ ROUTING_TO_OLLAMA_LANE..." >&2
        run_offload_runner "$target_model" "$prompt"
        ;;
      gemma4:*|hf.co/*gemma*)
        if ! curl -sf --max-time 2 localhost:11434/api/tags >/dev/null 2>&1; then printf '%s\n' '⚠ [llm-compat] Ollama not responding on :11434 — lane may cold-start' >&2; fi
        printf '%s\n' "⬡ ROUTING_TO_GEMMA_LOCAL..." >&2
        run_offload_runner gemma-local "$prompt" --model "$target_model"
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

check_branch_lock_advisory() {
  local prompt="$1"
  local candidate
  local json_tmp
  local check_output
  local conflict_id

  while IFS= read -r candidate; do
    case "$candidate" in
      */*|.*|*.*) ;;
      *) continue ;;
    esac

    json_tmp="$(mktemp "${TMPDIR:-/tmp}/branch-lock.XXXXXX")"
    check_output="$(node "$SCRIPT_DIR/branch-lock.mjs" --check "$candidate" --json 2>"$json_tmp" || true)"

    if [[ "$check_output" == "LOCKED" ]]; then
      conflict_id="$(node -e 'const fs = require("fs"); const file = process.argv[1]; try { const payload = JSON.parse(fs.readFileSync(file, "utf8")); const lock = payload.conflict; process.stdout.write(lock && lock.id ? lock.id : "unknown"); } catch { process.stdout.write("unknown"); }' "$json_tmp")"
      printf '%s\n' "⬡ BRANCH_LOCK_ADVISORY :: file=$candidate locked_by=$conflict_id" >&2
    fi

    rm -f "$json_tmp"
  done < <(printf '%s\n' "$prompt" | grep -oE "\"[^\"]+\"|'[^']+'" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true)
}

route_log() {
  printf '%s\n' "$*" >&2
}

# Parse options
MODEL_OVERRIDE=""
DRY_RUN=0
ROUTE_INTENT="${LLM_COMPAT_INTENT:-}"
REASONING_DEPTH=""
ALLOW_MODEL_TOOLS=0
TOOLS_EXPLICIT=0   # 1 if user explicitly passed --tools or --no-tools
WRITE_SCOPE=""
SESSION_ARGS=()
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
    --no-session|--no-lane-session)
      SESSION_ARGS+=("$1")
      shift
      ;;
    --session)
      SESSION_ARGS+=("$1" "$2")
      shift 2
      ;;
    --fresh|--new-session)
      SESSION_ARGS+=("$1")
      shift
      ;;
    --write-scope)
      WRITE_SCOPE="$2"
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

if [[ -z "$MODEL_OVERRIDE" && "${#PROMPT_PARTS[@]}" -gt 1 ]] && is_direct_lane_token "${PROMPT_PARTS[0]}"; then
  MODEL_OVERRIDE="${PROMPT_PARTS[0]#@}"
  PROMPT_PARTS=("${PROMPT_PARTS[@]:1}")
  PROMPT="${PROMPT_PARTS[*]:-}"
fi

# ── Dry-run gate ────────────────────────────────────────────
if [[ "$DRY_RUN" -eq 1 ]]; then
  if [[ -n "$MODEL_OVERRIDE" ]]; then
    dry_run_model_override "$MODEL_OVERRIDE" "$PROMPT"
    exit 0
  fi
  # Backend command center (NUDIMMUD-era, pre-ICM) retired 2026-05-29 — route locally only.
  DECISION=""
  MODEL=$(echo "$DECISION" | jq -r '.preferredModel // empty' 2>/dev/null) || MODEL=""
  if [[ -z "$MODEL" || "$MODEL" == "null" ]]; then
FALLBACK_MODEL="deepseek-v4-pro"
    case "$(printf '%s' "$ROUTE_INTENT" | tr 'A-Z' 'a-z')" in
      architecture_review|audit_security|strategy|review|code_edit_large)
        FALLBACK_MODEL="deepseek-v4-pro"
        ;;
    esac
    if [[ "$(printf '%s' "$REASONING_DEPTH" | tr 'A-Z' 'a-z')" == "high" || "$(printf '%s' "$REASONING_DEPTH" | tr 'A-Z' 'a-z')" == "xhigh" ]]; then
      FALLBACK_MODEL="deepseek-v4-pro"
    fi
    route_log "$(printf '⬡ DRY_RUN :: local routing → %s' "$FALLBACK_MODEL")"
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

if [[ -n "$MODEL_OVERRIDE" ]]; then
        apply_deepseek_normalization MODEL_OVERRIDE
        printf '%s\n' "⬡ MANUAL_OVERRIDE :: model=$MODEL_OVERRIDE${REASONING_DEPTH:+ reasoning=$REASONING_DEPTH}" >&2
        dispatch_model "$MODEL_OVERRIDE" "$PROMPT"
        exit 0
fi

# ── Auto routing: local-only (backend command center retired 2026-05-29, pre-ICM legacy) ──
DECISION=""

MODEL=$(echo "$DECISION" | jq -r '.preferredModel // empty' 2>/dev/null) || MODEL=""
RUNTIME=$(echo "$DECISION" | jq -r '.preferredRuntime // empty' 2>/dev/null) || RUNTIME=""
INTENT=$(echo "$DECISION" | jq -r '.intent // empty' 2>/dev/null) || INTENT=""

if [[ -z "$MODEL" || "$MODEL" == "null" ]]; then
  FALLBACK_MODEL="deepseek-v4-pro"
  case "$(printf '%s' "$ROUTE_INTENT" | tr 'A-Z' 'a-z')" in
    architecture_review|audit_security|strategy|review|code_edit_large)
      FALLBACK_MODEL="deepseek-v4-pro"
      ;;
  esac
  if [[ "$(printf '%s' "$REASONING_DEPTH" | tr 'A-Z' 'a-z')" == "high" || "$(printf '%s' "$REASONING_DEPTH" | tr 'A-Z' 'a-z')" == "xhigh" ]]; then
    FALLBACK_MODEL="deepseek-v4-pro"
  fi
  echo "⬡ LOCAL_ROUTING — using direct DeepSeek lane ($FALLBACK_MODEL)." >&2
  echo "  Manual fallback options:" >&2
  echo "    llm-compat --model <id> \"<prompt>\"              # direct model" >&2
  echo "    llm-compat --model gemma-local \"<prompt>\"       # local Gemma SLM lane" >&2
  echo "    llm-compat --model codex-spark \"<prompt>\"       # bounded Codex Spark lane" >&2
  echo "    llm-compat --model deepseek-v4-pro \"<prompt>\"   # DeepSeek cloud pro" >&2
  MODEL="$FALLBACK_MODEL"
  RUNTIME="cloud"
fi

printf '%s\n' "⬡ LLM_COMPAT_ASSESSMENT :: intent=$INTENT runtime=$RUNTIME model=$MODEL" >&2

# Auto-fallback: if primary lane fails (429, auth error, timeout), route to DeepSeek.
# This eliminates rate-limit time gates — work completes on fallback rather than blocking.
if ! dispatch_model "$MODEL" "$PROMPT"; then
  FAIL_EXIT=$?
  if [[ "$MODEL" != "deepseek-v4-pro" && "$MODEL" != "deepseek" ]]; then
    AUTO_FALLBACK="deepseek-v4-pro"
    [[ "$(printf '%s' "$REASONING_DEPTH" | tr 'A-Z' 'a-z')" == "high" || "$(printf '%s' "$REASONING_DEPTH" | tr 'A-Z' 'a-z')" == "xhigh" ]] && AUTO_FALLBACK="deepseek-v4-pro"
    printf '%s\n' "⬡ LANE_FAILURE [model=$MODEL exit=$FAIL_EXIT] — auto-fallback to $AUTO_FALLBACK" >&2
    dispatch_model "$AUTO_FALLBACK" "$PROMPT"
  else
    exit "$FAIL_EXIT"
  fi
fi
