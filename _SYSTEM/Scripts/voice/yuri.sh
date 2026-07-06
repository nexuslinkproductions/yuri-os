#!/usr/bin/env bash
# @capability: yuri-session-launcher
# @serves: launch yuri | start yuri voice | talk to yuri
# @does: Yuri's brain = Z.ai GLM-5-Turbo (:8014, GLM Coding Plan, $0) — Claude-class conversation at
#        ~2s warm (no claude -p spawn lag), persisted memory, model-driven tool-calling (spawn_worker
#        opens visible worker terminals). claude-p-brain.py + yuri-local-brain.py stay on disk as fallbacks.
# @use: bash _SYSTEM/Scripts/voice/yuri.sh   (alias: yuri). Ctrl-C stops.
# @exports: (launcher)
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VOICE="$REPO/_SYSTEM/Scripts/voice"
VP="$REPO/_SYSTEM/state/voice/.venv-pipecat/bin/python"
mkdir -p "$REPO/_SYSTEM/state/voice"
rm -f "$REPO/_SYSTEM/state/voice/tts.paused" 2>/dev/null || true   # never let the pause flag mute her
[ -x "$VP" ] || { echo "❌ venv missing — run setup-pipecat.sh"; exit 1; }

# Clean slate: kill the FULL voice process set (brains, bot, orphan MLX servers, stray kokoro) so a
# relaunch doesn't compete with stale GPU memory from a previous session or the retired marvis path.
# This is the fix for "TTS degrades over time + killing the terminal doesn't clear it."
bash "$VOICE/voice-stop.sh"

# Brain: Z.ai GLM-5-Turbo (:8014) — Claude-class + snappy (~2s warm, no claude -p spawn lag).
# Persisted memory + model-driven tool-calling (spawn_worker). Key self-hydrates from keychain
# yuri-zai-api-key. This is the ONE brain for ALL launchers (claude-p-brain.py is retired).
pkill -f yuri-z-brain.py 2>/dev/null || true
# SEC-1 armed 2026-07-06: route the brain's bash/write/edit through the ONE shared safety gate
# (evaluateToolCall). Inline floor still runs first; degrades to inline on any shim fault. Override
# with YURI_Z_UNIFIED_GATE=0 to disarm.
export YURI_Z_UNIFIED_GATE="${YURI_Z_UNIFIED_GATE:-1}"
# Brain as a TRACKED background child (not a detached ( … & ) subshell). The trap below kills the
# FULL voice set on ANY exit — Ctrl-C (INT), terminal close (HUP), or normal exit — so nothing is
# ever left orphaned (owner 2026-06-19: "if I close the terminal all of it should end right with it").
python3 "$VOICE/yuri-z-brain.py" >"$REPO/_SYSTEM/state/voice/yuri-z-brain.log" 2>&1 &

cleanup() {
  trap - EXIT INT TERM HUP                 # disarm so the sweep runs exactly once
  echo ""; echo "stopping Yuri — full voice cleanup…"
  bash "$VOICE/voice-stop.sh" >/dev/null 2>&1 || true   # kills brain + bot + MLX/kokoro, nothing survives
  exit 0
}
trap cleanup EXIT INT TERM HUP

sleep 1
curl -s --max-time 5 http://127.0.0.1:8014/health >/dev/null 2>&1 \
  && echo "brain -> Z.ai GLM-5-Turbo (:8014, GLM Coding Plan, \$0)" \
  || echo "⚠ brain not answering on :8014 — check _SYSTEM/state/voice/yuri-z-brain.log"

export BRAIN_PROXY_URL="http://127.0.0.1:8014/v1"
echo "loading the voice loop (mic/speaker, MLX warm-up ~15s)…  Ctrl-C or closing this terminal stops everything."
# Foreground via background + wait (NOT exec) so the trap fires on terminal close / Ctrl-C. `exec`
# would replace this shell and the trap could never run — that's what orphaned the brain + MLX before.
"$VP" "$VOICE/bot.py" &
wait $!
