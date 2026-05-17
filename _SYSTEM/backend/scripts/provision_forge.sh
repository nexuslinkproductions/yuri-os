#!/bin/bash

echo "⬡ PROVISIONING_NEURAL_FORGE..."

# Create DeepSeek Liberated
if ollama list | grep -q "deepseek-v2:16b"; then
    echo ">>> Creating deepseek-liberated..."
    ollama create deepseek-liberated -f /Users/marcelspatz/YURI-OS-MUSUBI/backend/data/Modelfile.deepseek_liberated
else
    echo "!!! deepseek-v2:16b not found. Please run 'ollama pull deepseek-v2:16b' first."
fi

# Create Qwen Liberated
if ollama list | grep -q "qwen2.5:7b"; then
    echo ">>> Creating qwen-liberated..."
    ollama create qwen-liberated -f /Users/marcelspatz/YURI-OS-MUSUBI/backend/data/Modelfile.qwen_liberated
else
    echo "!!! qwen2.5:7b not found. Please run 'ollama pull qwen2.5:7b' first."
fi

echo "⬡ PROVISIONING_COMPLETE"
