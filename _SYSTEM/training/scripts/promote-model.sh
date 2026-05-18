#!/usr/bin/env bash
# promote-model.sh — merge LoRA adapter + update Ollama yuri-triage variant
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAINING_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ADAPTER_PATH="$TRAINING_DIR/adapters/yuri-triage"
MERGED_PATH="$TRAINING_DIR/adapters/yuri-triage-merged"
MODELFILE="$TRAINING_DIR/Modelfile.yuri-triage"
BASE_MODEL="${LORA_BASE_MODEL:-mlx-community/Llama-3.2-3B-Instruct-4bit}"

log() { echo "[promote-model] $*"; }

log "fusing adapter into merged model..."
python3 -m mlx_lm.fuse \
  --model "$BASE_MODEL" \
  --adapter-path "$ADAPTER_PATH" \
  --save-path "$MERGED_PATH" \
  --de-quantize

log "converting to GGUF for Ollama..."
GGUF_PATH="$TRAINING_DIR/adapters/yuri-triage.gguf"
python3 -m mlx_lm.convert \
  --hf-path "$MERGED_PATH" \
  --mlx-path "$MERGED_PATH" \
  --quantize --q-bits 4

# Write updated Modelfile pointing to fine-tuned weights
cat > "$MODELFILE.promoted" <<EOF
FROM $GGUF_PATH

$(grep -v '^FROM' "$MODELFILE")
EOF

log "creating yuri-triage Ollama model..."
ollama create yuri-triage -f "$MODELFILE.promoted"

log "✓ yuri-triage promoted — test with: ollama run yuri-triage 'list files in a directory'"
