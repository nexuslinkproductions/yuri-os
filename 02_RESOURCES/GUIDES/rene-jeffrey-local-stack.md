# Jeffrey — René's Local Assistant (Windows + 5060 Ti)

Jeffrey sees your screen, hears your question, and reasons locally — no API keys, no cloud spend. Built for holster blocking, Blender, CAD, and the CGSSCHWEIZ workflow.

**Who:** René (CGSSCHWEIZ) · **Branch:** `rene` · **Hardware:** RTX 5060 Ti 16GB, i7-14700K, Windows 11

---

## What Jeffrey is

| Piece | What it does |
|-------|----------------|
| **Hey Clicky (Windows)** | Tray assistant — screenshot + voice + speak answer. Exactly the “see my screen and help” UX. |
| **Ollama** | Runs AI models on your GPU, offline. |
| **YURI** | Company spine — search repo, job pool, work dashboard. Jeffrey handles *your screen*; YURI handles *the codebase*. |

Jeffrey is **not** a replacement for YURI search. Use both:

- **Jeffrey / Clicky** → “What’s wrong with this Blender mesh?” (sees viewport)
- **YURI** → `node _SYSTEM/Scripts/xref-query.mjs "holster mold"` (repo knowledge)

---

## First 30 minutes

### 1. Ollama

1. Install from [ollama.com](https://ollama.com) (Windows).
2. Open PowerShell:

```powershell
ollama serve
# new terminal:
ollama pull qwen3-vl:8b-thinking
ollama pull qwen3:14b
```

Optional fallbacks:

```powershell
ollama pull gemma4:12b
ollama pull xentriom/gemma-4-12B-coder-fable5-composer2.5-v1:Q4_K_M
```

### 2. Environment (recommended)

```powershell
[System.Environment]::SetEnvironmentVariable("OLLAMA_FLASH_ATTENTION", "1", "User")
[System.Environment]::SetEnvironmentVariable("YURI_LOCAL_MAX_CONCURRENCY", "1", "User")
```

Restart terminal after setting user env vars.

### 3. Hey Clicky Windows

```powershell
git clone https://github.com/Bitshank-2338/clicky-windows.git
cd clicky-windows
copy .env.example .env
```

Edit `.env`:

```env
OLLAMA_HOST=http://localhost:11434
OLLAMA_VISION_MODEL=qwen3-vl:8b-thinking
OLLAMA_TEXT_MODEL=qwen3:14b
```

```powershell
pip install -r requirements.txt
python main.py
```

Tray icon → **Ollama → Vision model** / **Text model** to swap.

### 4. YURI smoke test

From your `yuri-os` clone (`rene` branch):

```powershell
node _SYSTEM/Scripts/fix-main-module-guard.mjs --check
node _SYSTEM/Scripts/xref-query.mjs "holster"
node _SYSTEM/Scripts/ai.mjs search "blender" --limit 3
```

### 5. Automated setup (optional)

```powershell
powershell -ExecutionPolicy Bypass -File _SYSTEM/Scripts/jeffrey-rene-setup.ps1
```

---

## Model choices

| When | Use |
|------|-----|
| Deep look at screen / CAD / PDF | `qwen3-vl:8b-thinking` |
| Fast “where is the button?” | `qwen3-vl:8b-instruct` |
| Planning + tools | `qwen3:14b` with thinking on |
| Fable-style coding CoT | `gemma4-coder-fable5` lane |

**Rule:** Only one big model in VRAM at a time. Clicky swaps vision vs text; don’t run two 12B+ models in parallel.

Full research: `02_RESOURCES/RESEARCH/jeffrey-local-model-landscape-2026-07-01.md`

---

## YURI lanes (Jeffrey)

After models are pulled:

```powershell
node _SYSTEM/Scripts/llm-lane.mjs jeffrey-vision-local --light "describe this workflow step"
node _SYSTEM/Scripts/llm-lane.mjs jeffrey-brain-local --light "plan holster blocking steps"
```

Vision lane needs an image path wired by your client; Clicky handles screenshots natively.

---

## Company / MURE (zero spend)

See what the agent company planned for Jeffrey:

```powershell
type 02_RESOURCES\TASKS\jeffrey-rene-mure-plan.json
node _SYSTEM/mure/company.mjs --task-file 02_RESOURCES/TASKS/jeffrey-rene-build.json --dry-run
node _SYSTEM/Scripts/nexus-company.mjs --dry-run
node _SYSTEM/Scripts/mure.mjs --demo
```

Work dashboard (local):

```powershell
node _SYSTEM/Scripts/work-dashboard.mjs --serve :4270
```

Open `http://localhost:4270` in browser.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Script exits with no output | Update `rene` branch — issue #3 fix |
| OOM / CUDA error | Pull smaller quant; set `YURI_LOCAL_MAX_CONCURRENCY=1` |
| Clicky “no vision” | Tray → set Vision model; must be VLM tag |
| Slow first answer | Thinking models need longer `max_tokens` — normal |

---

## Links

- Clicky Windows: https://github.com/Bitshank-2338/clicky-windows
- Model research: `02_RESOURCES/RESEARCH/jeffrey-local-model-landscape-2026-07-01.md`
- MURE task: `02_RESOURCES/TASKS/jeffrey-rene-build.json`
