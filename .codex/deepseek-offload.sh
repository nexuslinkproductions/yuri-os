#!/usr/bin/env bash
# Codex CLI offload to DeepSeek reasoning lane.
# Usage: bash .codex/deepseek-offload.sh "<your task>"
set -euo pipefail
cd "$(dirname "$0")/.."
exec ./_SYSTEM/Scripts/llm-compat.sh --model deepseek-v4-pro "$@"
