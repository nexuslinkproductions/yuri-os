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

# Brain: Z.ai GLM-5-Turbo (:8014) — Claude-class + snappy (~2s warm, no claude -p spawn lag).
# Persisted memory + model-driven tool-calling (spawn_worker). Key self-hydrates from keychain
# yuri-zai-api-key. Fallbacks on disk: claude-p-brain.py (:8012) + yuri-local-brain.py (:8013) —
# to switch back, point the line below + BRAIN_PROXY_URL at one of them.
pkill -f claude-brain-proxy.py 2>/dev/null || true   # retire the fragile live-session bridge
pkill -f claude-p-brain.py 2>/dev/null || true
pkill -f yuri-local-brain.py 2>/dev/null || true
pkill -f yuri-z-brain.py 2>/dev/null || true
( python3 "$VOICE/yuri-z-brain.py" >"$REPO/_SYSTEM/state/voice/yuri-z-brain.log" 2>&1 & )
sleep 1
curl -s --max-time 5 http://127.0.0.1:8014/health >/dev/null 2>&1 \
  && echo "brain -> Z.ai GLM-5-Turbo (:8014, GLM Coding Plan, \$0)" \
  || echo "⚠ brain not answering on :8014 — check _SYSTEM/state/voice/yuri-z-brain.log"

export BRAIN_PROXY_URL="http://127.0.0.1:8014/v1"
echo "loading the voice loop (mic/speaker, MLX warm-up ~15s)…  Ctrl-C stops."
exec "$VP" "$VOICE/bot.py"
