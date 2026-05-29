# nexbox RUNBOOK
**Version:** 1.0 · **Date:** 2026-05-16
**Platform:** Mac Mini M4 Pro 16 GB+ (or equivalent)

---

## Install

```bash
# 1. Clone / copy the nexbox bundle into your project root
cp -r nexbox/ your-project/nexbox/
cp bin/bootstrap-ollama.sh your-project/bin/

# 2. Bootstrap local models (one-time, ~10 min)
bash bin/bootstrap-ollama.sh

# 3. Verify zero Anthropic dependency
node nexbox/verify --strict

# 4. First pulse smoke test
node nexbox/symbiotic-pulse.mjs plan "analyze this codebase architecture"
```

---

## Optional Cloud Keys

nexbox works fully offline with local Ollama. Add cloud lanes as opt-in:

```bash
export DEEPSEEK_API_KEY=<your-key>     # @deepseek lane
export KIMI_API_KEY=<your-key>         # @kimi lane
export NVIDIA_API_KEY=<your-key>       # @nvidia lane
export OPENAI_API_KEY=<your-key>       # @codex-spark lane
# @claude lane: NOT included by default — add via: nexbox config add-lane claude
```

---

## Daily Use

```bash
# Route a task through the pulse
node nexbox/symbiotic-pulse.mjs plan "implement user auth feature"
node nexbox/symbiotic-pulse.mjs plan "review security risks in payment flow"

# Check lane availability
node nexbox/offload-contract.mjs --check

# Verify independence (run after any config change)
node nexbox/verify
```

---

## Kill-Switch Drill

```bash
# Disable all cloud keys — verify local-only operation
unset DEEPSEEK_API_KEY KIMI_API_KEY NVIDIA_API_KEY OPENAI_API_KEY
node nexbox/verify --strict
node nexbox/symbiotic-pulse.mjs plan "test prompt"
# Expected: routes to ollama-local, no cloud calls
```

---

## Pinned Model Set (local, via Ollama)

| Model | Size | Purpose |
|-------|------|---------|
| `qwen2.5:7b` | ~4.5 GB | General primary |
| `qwen2.5-coder:7b` | ~4.5 GB | Code primary |
| `qwen3.5:4b` | ~2.5 GB | Lightweight triage |
| `nomic-embed-text:latest` | ~0.3 GB | Embeddings |

Total: ~12 GB — fits on M4 Pro 16 GB with headroom for browser + IDE.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `ollama: command not found` | Install from ollama.ai, then re-run `bash bin/bootstrap-ollama.sh` |
| `node nexbox/verify` fails on Anthropic ref | Check env vars — `echo $ANTHROPIC_API_KEY` should be unset |
| Lane routes to `triage-local` for everything | Ollama not running — `ollama serve` in a separate terminal |
| `NVIDIA_API_KEY` lane unavailable | Free NIM tier — verify key at build.nvidia.com |
