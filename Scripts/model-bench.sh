#!/usr/bin/env zsh
# model-bench.sh — Sequential local model benchmark
# ONE model at a time. Max 10GB RAM. Kills Ollama between runs.
# Usage: ./Scripts/model-bench.sh [model_id]   (omit = run all)

set -e

SCRIPT_DIR="${0:A:h}"
REGISTRY="$SCRIPT_DIR/../_SYSTEM/model-registry.md"
OLLAMA_BIN="${OLLAMA_BIN:-/Applications/Ollama.app/Contents/Resources/ollama}"
RAM_LIMIT_GB=10

# ms timestamp via python3 (macOS date lacks %N)
ms_now() { python3 -c "import time; print(int(time.time()*1000))"; }

# ── Prompts ───────────────────────────────────────────────────────────────────
get_prompt() {
  case "$1" in
    code_gen)           print "Write a TypeScript debounce function. Return only the function, no prose." ;;
    reasoning)          print "A bat and ball cost \$1.10. The bat costs \$1.00 more than the ball. How much is the ball? Show working." ;;
    summarization)      print "Summarize in 2 sentences: Vercel's design system uses sharp tokens, consistent spacing, typography-led composition, minimal grids, and strong empty/stateful components." ;;
    instruction_follow) print "List exactly 3 CSS custom properties for a dark UI. Format: --name: value; — one per line, nothing else." ;;
    speed)              print "Reply with only the word: READY" ;;
  esac
}

TESTS=(code_gen reasoning summarization instruction_follow speed)

# ⚠ NEVER run all models in one sweep — causes system freeze on M2 Pro 16GB
# Always pass a specific model: ./Scripts/model-bench.sh qwen2.5:7b
ALL_MODELS=()  # disabled — must specify model explicitly

# ── RAM guard ─────────────────────────────────────────────────────────────────
check_ram_gb() {
  local pid rss_kb
  pid=$(pgrep -x ollama 2>/dev/null || true)
  [[ -z "$pid" ]] && { print 0; return; }
  rss_kb=$(ps -o rss= -p "$pid" 2>/dev/null || print 0)
  print $(( rss_kb / 1024 / 1024 ))
}

kill_ollama() {
  pkill -x ollama 2>/dev/null || true
  sleep 4
}

# ── Run one test — logs to stderr, returns "elapsed_ms|||output" to stdout ────
run_test() {
  local model="$1" test="$2" prompt start_ms end_ms elapsed output ram_gb

  prompt="$(get_prompt "$test")"
  ram_gb=$(check_ram_gb)

  if (( ram_gb >= RAM_LIMIT_GB )); then
    print -u2 "[bench] ⚠ RAM ${ram_gb}GB ≥ ${RAM_LIMIT_GB}GB — killing Ollama"
    kill_ollama
  fi

  start_ms=$(ms_now)
  output=$("$OLLAMA_BIN" run "$model" "$prompt" 2>/dev/null || true)
  end_ms=$(ms_now)
  elapsed=$(( end_ms - start_ms ))

  # strip ANSI escape sequences
  output=$(print "$output" | sed 's/\x1b\[[0-9;]*m//g; s/\x1b\[[0-9]*[A-Z]//g' | head -c 500)

  print -u2 "    ✓ ${test}: ${elapsed}ms"
  # stdout: machine-readable result only
  print "${elapsed}|||${output}"
}

# ── Init registry ─────────────────────────────────────────────────────────────
mkdir -p "$(dirname "$REGISTRY")"
cat > "$REGISTRY" <<HEADER
# Model Registry — NUDIMMUD Local LLMs

**Benchmarked:** $(date '+%Y-%m-%d %H:%M')
**Machine:** M2 Pro, 16GB unified memory
**RAM cap:** ${RAM_LIMIT_GB}GB per model
**Rule:** ONE model at a time. Ollama killed between models.

---

## Summary

| Model | Code (ms) | Reason (ms) | Summary (ms) | Instruct (ms) | Speed (ms) | Best For |
|-------|-----------|-------------|--------------|---------------|------------|----------|
HEADER

# ── Main loop ─────────────────────────────────────────────────────────────────
if [[ $# -eq 0 ]]; then
  print -u2 "Usage: model-bench.sh <model_id>"
  print -u2 "Example: model-bench.sh qwen2.5:7b"
  print -u2 "⚠ Never omit — full sweep freezes M2 Pro"
  exit 1
fi
TARGET_MODELS=("$@")

typeset -A DETAIL_BLOCKS

for model in "${TARGET_MODELS[@]}"; do
  print -u2 "\n[bench] ═══ $model ═══"

  code_t="-" reason_t="-" summary_t="-" instruct_t="-" speed_t="-"
  detail_block="\n## ${model}\n"

  for test in "${TESTS[@]}"; do
    result="$(run_test "$model" "$test")"
    t_ms="${result%%|||*}"
    t_out="${result#*|||}"

    case "$test" in
      code_gen)           code_t="$t_ms" ;;
      reasoning)          reason_t="$t_ms" ;;
      summarization)      summary_t="$t_ms" ;;
      instruction_follow) instruct_t="$t_ms" ;;
      speed)              speed_t="$t_ms" ;;
    esac

    detail_block+="
### ${test} — ${t_ms}ms
\`\`\`
${t_out}
\`\`\`
"
    sleep 1
  done

  # Append summary row
  printf '| `%s` | %s | %s | %s | %s | %s | TBD |\n' \
    "$model" "$code_t" "$reason_t" "$summary_t" "$instruct_t" "$speed_t" \
    >> "$REGISTRY"

  # Store detail for later
  DETAIL_BLOCKS[$model]="$detail_block"

  print -u2 "[bench] Done: $model — killing Ollama, cooling 8s"
  kill_ollama
done

# Append all detail blocks at end
print "\n---\n\n## Detail Results" >> "$REGISTRY"
for model in "${TARGET_MODELS[@]}"; do
  print "$DETAIL_BLOCKS[$model]" >> "$REGISTRY"
done

print -u2 "\n⬡ BENCHMARK_COMPLETE"
print -u2 "Registry → $REGISTRY"
