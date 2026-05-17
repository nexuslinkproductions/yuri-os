#!/usr/bin/env bash
# pre-commit-independence.sh — Packet 13 independence regression gate
# Wire into .git/hooks/pre-commit by adding:
#   bash Scripts/pre-commit-independence.sh

set -euo pipefail

# Whitelist: set YURI_ALLOW_ANTHROPIC_LANES=1 for intentional opt-in additions
if [ "${YURI_ALLOW_ANTHROPIC_LANES:-0}" = "1" ]; then
  exit 0
fi

_NEW_ANTHROPIC=$(git diff --cached -- '*.mjs' '*.js' '*.ts' '*.sh' '*.md' \
  | grep "^+" \
  | grep -vE "^\+\+\+|PRICING\[|pricing_per_million|opt-in|# date-verified|tracking|// date-verified" \
  | grep -E "claude-(sonnet|haiku|opus)|api\.anthropic\.com|claude-[0-9]" \
  | head -5 || true)

if [ -n "$_NEW_ANTHROPIC" ]; then
  echo "[pre-commit] ⚠️  New Anthropic model reference detected in staged files:" >&2
  echo "$_NEW_ANTHROPIC" >&2
  echo "[pre-commit]   Bypass: YURI_ALLOW_ANTHROPIC_LANES=1 git commit" >&2
  echo "[pre-commit]   Reference: Sovereignty Sprint Packet 13" >&2
  exit 1
fi

echo "[pre-commit] independence gate: clean"
