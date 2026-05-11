# EvoNexus Integration Map — Platform & CLI Architecture

**Version:** 1.0  
**Created:** 2026-04-24  
**Scope:** Multi-platform CLI-first integration (Antigravity as primary IDE)

> This map is distinct from [`INTEGRATION-MAP.md`](INTEGRATION-MAP.md) (Self-Evolving Hooks + GAN Loop).  
> This covers the *cross-platform ecosystem* integration — Claude, Gemini, ChatGPT, local LLMs.

---

## Platform Roles

| Platform | CLI | Token Source | Primary Role |
|----------|-----|-------------|--------------|
| Claude Sonnet 4.6 | `c` | Anthropic subscription | Orchestrator — complex reasoning, architecture, routing |
| Claude Haiku 4.5 | `c` (model flag) | Anthropic subscription | Fallback executor — only when Gemini/local can't handle it |
| Gemini Flash 3.1 | `g` | Google (unlimited, paid) | Free workhorse — file ops, synthesis, large context, RLM loops |
| Gemini Pro 2.5 | `g` | Google | Deep reasoning tasks when Flash insufficient |
| NotebookLM | Manual (web) | Google (unlimited) | Knowledge synthesis, audio digest, multi-source research |
| ChatGPT Images 2.0 | Manual (web) | OpenAI subscription | Visual asset generation for clients |
| Gemini App | Manual (app) | Google | Video + image generation (Veo, Imagen) |
| Codex | `x` | OpenAI subscription | Code-specific tasks, code review |
| Cursor | `cursor` (free tier) | Free (limited) | IDE code editing with context |
| Local LLMs | `@ollama` / `@gpt-oss` | Local (free) | Deterministic, repetitive, offline tasks |
| Antigravity | `apip` / IDE | Local | Universal CLI pipe, primary IDE |

---

## Token Routing Rule

> **If a step can run on Gemini CLI (`g`) or local LLM → it MUST.**  
> Claude CLI (`c`) only handles tasks that require Claude's specific reasoning capability.

---

## CLI-First Dispatch Pattern

```
User Intent (Antigravity IDE terminal)
  → Claude CLI `c` / Sonnet 4.6 (Orchestrator)
       │
       ├── [FREE / FILE OPS]     → `g "<prompt>"` (Gemini CLI)
       │                            Zero cost. File ops, doc writing, synthesis,
       │                            gathering, template gen, analysis.
       │
       ├── [HEAVY CONTEXT >50k]  → `g` via RLM pattern (Gemini Flash)
       │                            Mental Map JSON output. Sonnet ingests map,
       │                            not raw output. See rlm-synthesis.md.
       │
       ├── [CODE TASKS]          → `x "<prompt>"` (Codex CLI)
       │                            Code review, refactor, debugging.
       │
       ├── [DETERMINISTIC/LOCAL] → @ollama / @gpt-oss
       │                            Formatting, extraction, offline tasks.
       │
       ├── [KNOWLEDGE SYNTHESIS] → NotebookLM (manual upload)
       │                            Gemini Flash prepares markdown digest first.
       │                            Then manually upload to NotebookLM for
       │                            podcast-style synthesis or source mapping.
       │
       ├── [IMAGE GENERATION]    → ChatGPT Images 2.0 (manual trigger)
       │                            Save output to project 05_ASSETS/
       │
       ├── [VIDEO GENERATION]    → Gemini App / Veo (manual trigger)
       │                            Save to 05_ASSETS/storyboards/
       │
       ├── [COMPLEX REASON]      → `c` / Sonnet (stays in Claude)
       │                            Architecture decisions, protocol design,
       │                            high-stakes synthesis.
       │
       └── [PROTOCOL CHECK]      → 06_NETWORK-SYNC/ (read-only)
                                    Yuri Flow skeleton — read state, never write.
```

---

## RLM Dispatch Protocol (Gemini Flash)

For tasks exceeding 50k tokens:

1. Sonnet identifies large-context task
2. Sends structured prompt to `g`: include task + shard instructions + Mental Map JSON schema
3. Gemini Flash processes recursively, outputs Mental Map JSON per shard
4. Sonnet ingests JSON maps (not raw output) → preserves context bandwidth
5. Sonnet synthesizes final output

**Shadow Context option:** Run `g` in Antigravity background tab → maintains Full Tape playback for Sonnet without active context cost.

See: [`rlm-synthesis.md`](../06_KNOWLEDGE-BASE/05_OPERATIONAL/rlm-synthesis.md)

---

## NotebookLM Workflow

1. Gemini Flash (`g`) generates strict technical markdown digest from source material
2. Save digest to `_SYSTEM/session-outputs/notebooklm-prep-[date].md`
3. Manually upload to NotebookLM as source
4. Use NotebookLM for: audio digest, cross-source synthesis, knowledge mapping
5. Export insights back to vault as research note

---

## Yuri Flow Skeleton Protocol

```
Yuri Flow (Claudio-compatible workflow layer) = structural skeleton: security, client pipeline, billing authority
Nudimmud OS (Marcel) = cognitive symbiote: agentic execution, synthesis, creative direction

Access pattern:
  Read:  06_NETWORK-SYNC/C2MOVIEZ/Database/ (weekly sync)
  Write: NEVER — Nudimmud wraps, never overwrites Yuri Flow
  Sync:  session_log.md entries tagged [YURI-FLOW-SYNC] for Claudio-layer changes
```

---

## CLI Command Reference

```bash
# Gemini CLI — free workhorse
g "write synthesis note for RLM paper"
g "generate shoot template for C2MOVIEZ project BOVIRO"
g "summarize this 80k token document"

# Codex CLI — code tasks
x "review this TypeScript file for performance issues"
x "refactor this function to use async/await"

# Claude CLI — orchestration only
c "design the architecture for EvoNexus Vessel UI"
c "synthesize findings from 4 Mental Map JSONs into protocol doc"

# Antigravity pipe
apip g "large context task" | apip c "synthesize"

# Local LLMs
./Scripts/ai @ollama "format this JSON"
./Scripts/ai @gpt-oss "generate template"
./Scripts/ai @swarm "cross-validate this decision"
```

---

## Related Files

- [`EVONEXUS_PROTOCOLS.md`](EVONEXUS_PROTOCOLS.md) — Structural fusion protocols (Skeleton + Enhancement + Liquid Bridge + Fusion)
- [`offload-workflow.md`](offload-workflow.md) — Detailed lane routing + Ruflo + Openclaw
- [`rlm-synthesis.md`](../06_KNOWLEDGE-BASE/05_OPERATIONAL/rlm-synthesis.md) — MIT RLM paper synthesis
- [`IMAGE-VIDEO-GEN-PROTOCOL.md`](IMAGE-VIDEO-GEN-PROTOCOL.md) — Image/video generation pipeline
- [`INTEGRATION-MAP.md`](INTEGRATION-MAP.md) — Self-Evolving Hooks + GAN Loop (separate scope)
