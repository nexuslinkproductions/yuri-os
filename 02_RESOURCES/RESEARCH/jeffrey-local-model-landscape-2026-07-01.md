# Jeffrey Local Model Landscape — RTX 5060 Ti 16GB (2026-07-01)

Research for **Jeffrey**, René's offline vision+reasoning assistant (CGSSCHWEIZ / holster CAD workflow).

**Hardware:** Windows 11, i7-14700K, RTX 5060 Ti 16GB VRAM, 32GB+ RAM assumed.

---

## Architecture: dual-slot, on-demand

One model loaded at a time in VRAM. Pattern from [LocalClicky](https://github.com/dikshantrajput/LocalClicky) and [Hey Clicky Windows](https://github.com/Bitshank-2338/clicky-windows):

| Slot | Role | When loaded |
|------|------|-------------|
| **Vision** | Screenshot → describe / locate UI / read drawings | On `look_at_screen` or Clicky vision query |
| **Command brain** | Plan, tool loops, multi-step reasoning | Default orchestrator |

---

## Top 5 stacks (ranked)

| Rank | Name | Vision | Brain | Fit 16GB |
|------|------|--------|-------|----------|
| **1** | Max-CoT Dual | `qwen3-vl:8b-thinking` | `qwen3:14b` + think | ✅ sequential |
| **2** | Fable Agent | `gemma4:12b` | `xentriom/gemma-4-12B-coder-fable5-composer2.5-v1:Q4_K_M` | ✅ YURI-proven |
| **3** | LocalClicky+ | `gemma4:e4b` | `qwen3:14b` | ✅ fast vision |
| **4** | Fable Pure-Reason | `qwen3-vl:8b-instruct` | HF `Qwen3.6-14B-FableVibes` | ✅ HF import |
| **5** | Speed | `openbmb/minicpm-v4.6-thinking` | `qwen3:8b` | ✅ headroom |

**Recommended default for Jeffrey:** Stack #1.

---

## Vision models (≤16GB)

| Model | Ollama pull | Q4 VRAM | Thinking | Best for |
|-------|-------------|---------|----------|----------|
| Qwen3-VL-8B-Thinking | `ollama pull qwen3-vl:8b-thinking` | ~6 GB | Always-on CoT | CAD, STEM, docs, GUI |
| Qwen3-VL-8B-Instruct | `ollama pull qwen3-vl:8b-instruct` | ~6 GB | Off (fast) | OCR, quick UI locate |
| Gemma 4 12B | `ollama pull gemma4:12b` | ~8 GB | `<|think|>` toggle | Unified multimodal |
| Gemma 4 E4B | `ollama pull gemma4:e4b` | ~6 GB | Weaker | Clicky default speed |
| MiniCPM-V-4.6-Thinking | `ollama pull openbmb/minicpm-v4.6-thinking` | ~3 GB | Separate variant | Low latency |
| InternVL3-8B | `ollama pull blaifa/InternVL3:8b-Q4_K_M` | ~5 GB | Standard | Industrial/CAD |
| Phi-4-reasoning-vision-15B | HF GGUF → Modelfile | ~12 GB | Dynamic CoT | GUI grounding (tight) |

**Avoid on 16GB solo:** `llama4:scout` (~61GB Q4), `qwen3-vl:30b`, `gemma4:31b`, `autotrust/gemma4-31B-Fable-5` Q4 (~19GB + mmproj).

---

## Fable 5 distillations (≤16GB)

| Model | Size Q4 | Vision | Ollama |
|-------|---------|--------|--------|
| gemma-4-12B-coder-fable5-composer2.5 | ~7.4 GB | ❌ text | `xentriom/gemma-4-12B-coder-fable5-composer2.5-v1:Q4_K_M` |
| Qwen3.6-14B-A3B-FableVibes | ~8.4 GB | ❌ text | HF → `ollama create fable-vibes` |
| gemma4-31B-Fable-5-Distilled | ~19 GB | ✅ | HF only — marginal on 16GB |

YURI already wires `gemma4-coder-local` to the Fable Gemma 12B lane.

---

## Command brains (pair with vision)

| Model | Ollama pull | Tools | Thinking |
|-------|-------------|-------|----------|
| Qwen3-14B | `ollama pull qwen3:14b` | ✅ | `/think` toggle |
| Qwen3-8B | `ollama pull qwen3:8b` | ✅ | `/think` toggle |
| gemma4-coder-fable5 | see above | ✅ coding | Gemma CoT |
| DeepSeek-R1-14B tools | `MFDoom/deepseek-r1-tool-calling:14b` | ✅ | Always CoT |

---

## Hey Clicky reference

Upstream: [farzaa/clicky](https://github.com/farzaa/clicky) (macOS). Windows ports:

- [Bitshank-2338/clicky-windows](https://github.com/Bitshank-2338/clicky-windows) — tray app, dual Ollama slots
- [lefterisloukas/heyclicky-windowz](https://github.com/lefterisloukas/heyclicky-windowz) — fork

Configure `.env`:

```env
OLLAMA_HOST=http://localhost:11434
OLLAMA_VISION_MODEL=qwen3-vl:8b-thinking
OLLAMA_TEXT_MODEL=qwen3:14b
```

Tray: **Ollama → Vision model / Text model** to swap at runtime.

---

## Pull sequence (Jeffrey default)

```powershell
ollama pull qwen3-vl:8b-thinking
ollama pull qwen3:14b
ollama pull gemma4:12b
ollama pull xentriom/gemma-4-12B-coder-fable5-composer2.5-v1:Q4_K_M
```

## Windows env tuning

```powershell
$env:OLLAMA_FLASH_ATTENTION = "1"
$env:OLLAMA_KV_CACHE_TYPE = "q4_0"
$env:YURI_LOCAL_MAX_CONCURRENCY = "1"
```

---

## Residual risks

1. Dual full-load OOM — enforce one model at a time.
2. `qwen3-vl:8b-thinking` cannot disable CoT at runtime — use instruct for fast passes.
3. Fable distillations trace proprietary teacher data — verify license for commercial holster work.
4. Phi-4-RV-15B / Molmo — no clean `ollama pull`; HF import required.

---

*MURE task: `02_RESOURCES/TASKS/jeffrey-rene-build.json` · plan: `jeffrey-rene-mure-plan.json`*
