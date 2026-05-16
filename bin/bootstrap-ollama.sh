#!/usr/bin/env bash
set -euo pipefail

MODE="install"

for arg in "$@"; do
  case "$arg" in
    --dry-run) MODE="dry-run" ;;
    --check) MODE="check" ;;
    -h|--help)
      cat <<'EOF'
Usage: bin/bootstrap-ollama.sh [--dry-run|--check]
EOF
      exit 0
      ;;
  esac
done

models=(
  "qwen2.5:7b"
  "qwen2.5-coder:7b"
  "qwen3.5:4b"
  "nomic-embed-text:latest"
)

if ! command -v ollama >/dev/null 2>&1; then
  printf 'ollama is not installed.\n'
  printf 'Install it from: https://ollama.com/download\n'
  printf 'Then rerun: %s\n' "$0"
  exit 1
fi

if [[ "$MODE" == "check" ]]; then
  if ! installed="$(ollama list 2>/dev/null | awk 'NR>1 {print $1}')"; then
    printf 'Unable to list installed Ollama models.\n'
    exit 1
  fi
  missing=()
  for model in "${models[@]}"; do
    if ! printf '%s\n' "$installed" | grep -Fxq "$model"; then
      missing+=("$model")
    fi
  done

  if ((${#missing[@]} == 0)); then
    printf 'All pinned Ollama models are present.\n'
    exit 0
  fi

  printf 'Missing Ollama models:\n'
  printf '  %s\n' "${missing[@]}"
  exit 1
fi

if [[ "$MODE" == "dry-run" ]]; then
  printf 'Would pull:\n'
  printf '  %s\n' "${models[@]}"
  exit 0
fi

for model in "${models[@]}"; do
  printf 'Pulling %s...\n' "$model"
  ollama pull "$model"
done

printf 'All pinned Ollama models pulled successfully.\n'
