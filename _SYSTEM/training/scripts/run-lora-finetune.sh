#!/usr/bin/env bash
# run-lora-finetune.sh — LoRA fine-tune yuri-triage model using mlx-lm (Apple Silicon native)
# Requires: pip install mlx-lm
# Output: _SYSTEM/training/adapters/yuri-triage/ (LoRA adapter weights)
# After success: runs promote-model.sh to update Ollama variant
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAINING_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$TRAINING_DIR/../.." && pwd)"

DATA_DIR="$TRAINING_DIR/data"
ADAPTER_PATH="$TRAINING_DIR/adapters/yuri-triage"
SEED_FILE="$DATA_DIR/seed-examples.jsonl"
CORRECTIONS_FILE="$DATA_DIR/corrections.jsonl"
MERGED_FILE="$DATA_DIR/train.jsonl"
VALID_FILE="$DATA_DIR/valid.jsonl"

LORA_ITERS="${LORA_ITERS:-200}"
LORA_BATCH="${LORA_BATCH:-4}"
LORA_LR="${LORA_LR:-1e-4}"
BASE_MODEL="${LORA_BASE_MODEL:-mlx-community/Llama-3.2-3B-Instruct-4bit}"

log() { echo "[lora-finetune] $*"; }

# ── 1. Check mlx-lm ──────────────────────────────────────────────────────────
if ! python3 -c "import mlx_lm" 2>/dev/null; then
  log "✗ mlx-lm not installed. Run: pip install mlx-lm"
  exit 1
fi

# ── 2. Merge seed + corrections into train/valid split (90/10) ───────────────
log "merging training data..."
cat "$SEED_FILE" ${CORRECTIONS_FILE:+"$CORRECTIONS_FILE"} 2>/dev/null > "$MERGED_FILE"
TOTAL=$(wc -l < "$MERGED_FILE")
VALID_COUNT=$(( TOTAL / 10 < 1 ? 1 : TOTAL / 10 ))
TRAIN_COUNT=$(( TOTAL - VALID_COUNT ))

head -n "$TRAIN_COUNT" "$MERGED_FILE" > "${MERGED_FILE}.tmp" && mv "${MERGED_FILE}.tmp" "$MERGED_FILE"
tail -n "$VALID_COUNT" "$MERGED_FILE" > "$VALID_FILE"
log "train=${TRAIN_COUNT} valid=${VALID_COUNT}"

# ── 3. Convert JSONL to mlx-lm chat format ───────────────────────────────────
CHAT_TRAIN="$DATA_DIR/chat-train.jsonl"
CHAT_VALID="$DATA_DIR/chat-valid.jsonl"

python3 - <<'PYEOF'
import json, sys, os

SYSTEM_PROMPT = open(os.path.join(os.environ['TRAINING_DIR'], '../Modelfile.yuri-triage')).read()
# extract system content between triple quotes
import re
m = re.search(r'SYSTEM """(.+?)"""', SYSTEM_PROMPT, re.DOTALL)
system_content = m.group(1).strip() if m else "You are Yuri's complexity classifier."

def convert(inpath, outpath):
    with open(inpath) as f, open(outpath, 'w') as out:
        for line in f:
            row = json.loads(line)
            entry = {"messages": [
                {"role": "system", "content": system_content},
                {"role": "user",   "content": row["prompt"]},
                {"role": "assistant", "content": row["completion"]}
            ]}
            out.write(json.dumps(entry) + "\n")

convert(os.environ['MERGED_FILE'], os.environ['CHAT_TRAIN'])
convert(os.environ['VALID_FILE'],  os.environ['CHAT_VALID'])
print(f"[lora-finetune] converted to chat format")
PYEOF

export TRAINING_DIR MERGED_FILE VALID_FILE CHAT_TRAIN CHAT_VALID

# ── 4. Run LoRA fine-tune ─────────────────────────────────────────────────────
log "starting LoRA fine-tune (iters=${LORA_ITERS}, batch=${LORA_BATCH})..."
log "base model: $BASE_MODEL"
log "adapter output: $ADAPTER_PATH"

mkdir -p "$ADAPTER_PATH"

python3 -m mlx_lm.lora \
  --model "$BASE_MODEL" \
  --data "$DATA_DIR" \
  --train-file chat-train.jsonl \
  --valid-file chat-valid.jsonl \
  --batch-size "$LORA_BATCH" \
  --num-iterations "$LORA_ITERS" \
  --learning-rate "$LORA_LR" \
  --adapter-path "$ADAPTER_PATH" \
  --save-every 50

log "✓ fine-tune complete"

# ── 5. Promote to Ollama ──────────────────────────────────────────────────────
bash "$SCRIPT_DIR/promote-model.sh"
