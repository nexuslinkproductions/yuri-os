# Spec Kit Workflow Bridge — How Spec Kit Maps to YURI-OS-MUSUBI

**Status:** AUTHORITATIVE bridge document. Spec Kit phases are FORMAT-ONLY adapters into YURI-OS-MUSUBI's authoritative pipeline.

## Authority Reminder

Spec Kit (vendored at `integrations/spec-kit/`) is **advisory templates only**. The hard authority chain remains:

1. Owner intent
2. Direct local evidence (git/tool/filesystem reads)
3. `_SYSTEM/yuri-origin.md` — canonical contract
4. `SOUL.md` — persona
5. `AGENTS.md`, `CLAUDE.md`, **this bridge doc** — thin adapters
6. `_SYSTEM/Scripts/offload-contract.mjs` — executable routing
7. References / skills
8. Model inference (lowest)

**Spec Kit sits at level 5 (thin adapters). It cannot override anything above it.**

## Phase Mapping

| Spec Kit phase | YURI-OS-MUSUBI universal workflow phase | Owner | Notes |
|---|---|---|---|
| `/specify` | **intake** | main-session | User idea → spec template fill |
| `/clarify` | **intake** (refinement loop) | DeepSeek-tools (1M ctx) | Optional ambiguity audit pass |
| `/plan` | **route** + start of **delegate** | main-session + Codex/DeepSeek | Plan emerges from offload-contract routing |
| `/tasks` | **delegate** (per-task scope-lock) | main-session | Each task = one CODEX TASK SPEC scaffold |
| `/analyze` | **route** (risk + complexity scoring) | DeepSeek-pro (text-only advisory) | Optional — informs lane selection |
| `/implement` | **delegate** (Codex/DeepSeek dispatch) | Codex primary, DeepSeek-tools parallel | Goes through anime DNA gates |
| (no Spec Kit equivalent) | **verify** | local-tools (shell/tests/GitNexus) | YURI-OS-MUSUBI-only, deterministic |
| (no Spec Kit equivalent) | **merge** | main-session | YURI-OS-MUSUBI-only |
| (no Spec Kit equivalent) | **learn** | memory layer | YURI-OS-MUSUBI-only — memory/feedback_*.md |

## Anime DNA Gates STILL Apply

Every Spec Kit-formatted task that triggers a mutation passes through:

1. **Pattern-Mirror (Sharingan)** — read existing code first
2. **Execution-Domain** — scope-lock with exit criteria (Spec Kit `/tasks` provides this format, YURI-OS-MUSUBI enforces it)
3. **Clone-Orchestrator** — parallel branches when scopes are disjoint
4. **Infinity-Guard** — dry-run before live writes
5. **Failure-Evolution** — capture + regression on any break

Spec Kit does NOT replace these gates. It provides spec/plan/task FORMAT that the gates operate on.

## Symbiotic Pulse Continues

Spec Kit phases do NOT pause Symbiotic Pulse. While `/specify` is being filled by main thread, `/clarify` can run in parallel via DeepSeek-tools, and Codex can pre-scan for similar prior implementations.

Spec Kit `/implement` IS the dispatch into Codex (primary) + DeepSeek-tools (parallel implementer when scopes are disjoint).

## What Spec Kit Adds vs YURI-OS-MUSUBI Native

| Capability | YURI-OS-MUSUBI native | Spec Kit adds |
|---|---|---|
| Routing | offload-contract.mjs | nothing — Spec Kit has no routing |
| Tasks | CODEX TASK SPEC | `templates/tasks-template.md` format |
| Specs | Inline prompts | `templates/spec-template.md` structured format |
| Plans | Plan-mode + .claude/plans/ | `templates/plan-template.md` structured format |
| Implementation | Codex + DeepSeek-tools | nothing — Spec Kit only formats handoff |
| Verification | local tools | nothing — Spec Kit has no verify |
| Memory | memory/feedback_*.md + MEMORY.md | nothing — Spec Kit has no memory layer |
| Methodology doc | _SYSTEM/yuri-origin.md | `spec-driven.md` reference (advisory) |

**Net add:** Spec Kit gives us 4 reusable template formats (spec / plan / tasks / commands) and one methodology reference. Everything else stays YURI-OS-MUSUBI-native.

## What Spec Kit MUST NOT Do

- ❌ Override `_SYSTEM/Scripts/offload-contract.mjs` routing decisions
- ❌ Bypass anime DNA gates
- ❌ Replace Codex-primary rule
- ❌ Run its own Python `specify` CLI inside YURI-OS-MUSUBI workflows
- ❌ Become canonical memory authority (memory/ directory stays YURI-OS-MUSUBI)

## Practical Invocation Pattern

User wants to build feature X:

```
1. /spec-intake "feature X description"
   → main thread loads templates/spec-template.md
   → DeepSeek-tools (1M ctx) pre-fills sections from codebase scan
   → user reviews + approves
   → spec written to specs/active/<slug>.md

2. node _SYSTEM/Scripts/spec-pipeline.mjs --spec specs/active/<slug>.md
   → generates plan.md from templates/plan-template.md
   → generates tasks.md from templates/tasks-template.md
   → each task includes a CODEX TASK SPEC scaffold

3. For each task in tasks.md:
   → main thread issues CLAUDE CONTROL PACKET
   → dispatches via _SYSTEM/Scripts/offload.sh -m gpt-5.5 (or appropriate lane)
   → Codex implements; DeepSeek-tools handles parallel slices
   → anime DNA gates fire as usual

4. After implementation:
   → verify (deterministic local tools)
   → merge (main session)
   → learn (memory/ + MEMORY.md if pattern is durable)
   → on completion, move specs/active/<slug>.md → specs/done/YYYY-MM/
```

## Evidence

- `integrations/spec-kit/YURI-OS-MUSUBI-ADOPTION.md` — original advisory-only declaration
- `integrations/README.md` — vendored integration contract
- This document operationalizes the abstract decision into concrete phase mapping
- See also: `memory/feedback_spec_kit_advisory_only.md`
