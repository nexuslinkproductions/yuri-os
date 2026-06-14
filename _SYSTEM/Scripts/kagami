#!/usr/bin/env bash
# DEPRECATED 2026-06-14 (owner: kagami-cli reflect is scrapped — do not route through it).
# This launcher no longer execs kagami-cli.mjs. That path connected to the Kagami
# control-plane (localhost:3005) and, when it was down, produced a dual-stack
# ECONNREFUSED that Node masked as a bare red "AggregateError" — poisoning every
# node lane/tool call routed here (see memory: ref-llm-lane-aggregateerror-ipv4).
# The 5 SCHEDULED kagami agents (overseer / session-synthesizer / heartbeat /
# memory-consolidator / stale-memory-scan) are LIVE and UNAFFECTED — they run via
# their own scripts (kagami-*.mjs / .sh), never through this reflect launcher.
echo "kagami: reflect CLI is scrapped (2026-06-14) — not routed. Use 'ai llm <lane> \"<task>\"' for model lanes." >&2
exit 127
# (original, intentionally disabled): exec node "$(dirname "$0")/kagami-cli.mjs" "$@"
