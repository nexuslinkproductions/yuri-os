#!/usr/bin/env bash
# @capability: yuri-session-launcher
# @serves: launch yuri | start yuri voice | talk to yuri
# @does: Yuri's brain = pluggable provider (:8014). Default: Z.ai GLM-5.2 (Coding Plan, $0).
#        Switchable to Ollama/deepseek via YURI_BRAIN_PROVIDER=ollama. Provider abstraction
#        in yuri-z-brain.py routes Anthropic↔Ollama format. Screen awareness (list_windows,
#        targeted screenshots, frontmost_app). Mic forcing for Bluetooth A2DP preservation.
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
bash "$VOICE/voice-stop.sh"

# Brain: yuri-z-brain.py (:8014) with provider abstraction. Default zai/glm-5.2 (reliable, $0).
# Switch to ollama/deepseek-v4-flash:cloud for testing via YURI_BRAIN_PROVIDER=ollama.
# Key self-hydrates from keychain yuri-zai-api-key. OLLAMA_API_KEY from env for ollama provider.
pkill -f yuri-z-brain.py 2>/dev/null || true
export YURI_Z_UNIFIED_GATE="${YURI_Z_UNIFIED_GATE:-1}"
python3 "$VOICE/yuri-z-brain.py" >"$REPO/_SYSTEM/state/voice/yuri-z-brain.log" 2>&1 &

cleanup() {
  trap - EXIT INT TERM HUP
  echo ""; echo "stopping Yuri — full voice cleanup…"
  bash "$VOICE/voice-stop.sh" >/dev/null 2>&1 || true
  exit 0
}
trap cleanup EXIT INT TERM HUP

sleep 1
# Query the ACTUAL provider from the health endpoint (not hardcoded)
_HEALTH=$(curl -s --max-time 5 http://127.0.0.1:8014/health 2>/dev/null)
if [ -n "$_HEALTH" ]; then
  _PROVIDER=$(echo "$_HEALTH" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"{d.get('provider','?')}/{d.get('active_model', d.get('model','?'))}\")" 2>/dev/null || echo "?")
  echo "brain -> $_PROVIDER (:8014)"
else
  echo "⚠ brain not answering on :8014 — check _SYSTEM/state/voice/yuri-z-brain.log"
fi

export BRAIN_PROXY_URL="http://127.0.0.1:8014/v1"
echo "loading the voice loop (mic/speaker, MLX warm-up ~15s)…  Ctrl-C or closing this terminal stops everything."
"$VP" "$VOICE/bot.py" &
wait $!
