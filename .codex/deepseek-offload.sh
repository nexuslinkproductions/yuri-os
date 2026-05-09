#!/usr/bin/env bash
# Codex CLI offload to DeepSeek reasoning lane.
# Usage: bash .codex/deepseek-offload.sh "<your task>"
set -euo pipefail
cd "$(dirname "$0")/.."
exec ./Scripts/offload.sh --model deepseek-v4-pro "$@"
