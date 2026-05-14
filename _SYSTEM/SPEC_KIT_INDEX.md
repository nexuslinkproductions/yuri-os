# Spec Kit Index — NUDIMMUD Operational Surface (PATCH 014)

Quick reference for the Spec Kit operational surface — what to invoke, in what order, for what purpose.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER: "I want to build feature X"                                          │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  /spec-intake "feature X"                                                   │
│  Phase 1: Pattern-Mirror — DeepSeek-tools scans codebase for prior impls    │
│  Phase 2: Auto-fill spec template (PATCH 011 bounded prompt)                │
│  Phase 2.5: PATCH 016 content filter — blocks secrets/credentials           │
│  Phase 3: Hand-off → user reviews specs/active/<slug>.md                    │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ (user reviews + edits inline)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  /spec-clarify   (OPTIONAL)                                                 │
│  DeepSeek-tools 1M-context ambiguity audit                                  │
│  Output: AMBIGUITY / MISSING / HIDDEN / RISK findings + verdict             │
│  Verdict: GREEN (proceed) | YELLOW (revise + re-run) | RED (rewrite)        │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  node Scripts/spec-pipeline.mjs --spec specs/active/<slug>.md               │
│  Generates plan.md + tasks.md siblings.                                     │
│  PATCH 017: tasks derived from spec acceptance criteria.                    │
│  PATCH 012: stderr warning when GitNexus impact skipped.                    │
│  Each task: CODEX TASK SPEC SCAFFOLD + GITNEXUS IMPACT.                     │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  /spec-analyze   (OPTIONAL)                                                 │
│  Probabilistic-decision-core: COMPLEXITY (1-5), RISK (1-5), EV per task     │
│  Recommends lane (Codex tier or DeepSeek-tools) + execution order           │
│  Cross-references PATCH 005 GitNexus impact already inlined                 │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  IMPLEMENTATION via Codex (primary) + DeepSeek-tools (parallel)             │
│  Per anime DNA gates: Pattern-Mirror → Execution-Domain → Clone-Orchestrator│
│  → Infinity-Guard (dry-run) → Failure-Evolution (capture + regression)      │
│  PATCH 015 pre-commit: blocks commits on offload-contract-dispatch drift    │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ (all tasks committed)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  node Scripts/spec-archive.mjs --execute                                    │
│  Moves completed spec to specs/done/YYYY-MM/<slug>/                         │
│  Detection: tasks.md tasks all marked - [x] OR frontmatter status: done     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Entry Points

| Command / Script | Purpose | Authority |
|---|---|---|
| `/spec-intake "<feature>"` | Author spec from feature idea (DeepSeek auto-fill + content filter) | Slash command |
| `/spec-clarify [<spec-path>]` | DeepSeek 1M ambiguity audit on a spec | Slash command (optional) |
| `node Scripts/spec-pipeline.mjs --spec <path>` | Generate plan.md + tasks.md (with GitNexus impact) | Script |
| `/spec-analyze [<plan-path>]` | Probabilistic risk + complexity scoring | Slash command (optional) |
| `node Scripts/spec-archive.mjs [--execute]` | Archive completed specs to specs/done/ | Script |
| `/constitution [--write]` | Render NUDIMMUD project constitution from yuri-origin + memory rules | Slash command |

## Storage

```
specs/
├── active/
│   ├── .gitkeep
│   ├── <slug>.md            # spec-intake output
│   ├── plan.md              # spec-pipeline output
│   └── tasks.md             # spec-pipeline output (PATCH 017 derived)
└── done/
    ├── .gitkeep
    └── YYYY-MM/<slug>/      # spec-archive moves completed work here
```

## Authority Reminder

**Spec Kit operates at level 5 of the authority chain (per `_SYSTEM/yuri-origin.md`):**

1. Owner intent
2. Direct local evidence
3. `_SYSTEM/yuri-origin.md`
4. `SOUL.md`
5. `AGENTS.md`, `_SYSTEM/spec-kit-workflow-bridge.md` ← Spec Kit adapter sits here
6. `Scripts/offload-contract.mjs`
7. References / skills
8. Model inference

**Spec Kit cannot override anything above level 5.** It is FORMAT-ONLY input adapters into NUDIMMUD's authoritative `intake → route → delegate → verify → merge → learn` pipeline.

## Related Memory Rules

- `memory/feedback_spec_kit_advisory_only.md` — hard architectural rule
- `memory/feedback_codex_primary_partner.md` — Codex always first for implementation
- `memory/feedback_deepseek_tool_unblock.md` — DeepSeek tools default ON
- `memory/feedback_long_session_codex_burst.md` — stay in session through Codex rate-limit
- `memory/feedback_parallel_pulse_playbook.md` — parallel branches pattern
- `memory/feedback_perplexity_app_browser.md` — web search via Perplexity app
- `memory/feedback_tirith_url_guard.md` — URL security layer

## Related System Docs

- `_SYSTEM/spec-kit-workflow-bridge.md` — full phase mapping (Spec Kit → NUDIMMUD)
- `_SYSTEM/deepseek-tool-prompt-template.md` — PATCH 011 bounded prompt template
- `integrations/spec-kit/NUDIMMUD-ADOPTION.md` — original advisory-only declaration
- `integrations/spec-kit/templates/{spec,plan,tasks}-template.md` — vendored format references

## Pre-Commit Gate (PATCH 015)

`_SYSTEM/git-hooks/pre-commit` runs:
1. cached diff check
2. offload-contract-regression
3. **offload-contract-dispatch-check** (NEW — PATCH 015)

PATCH 018 legacy allowlist means default exit=0 unless NEW drift introduced.
Bypass: `git commit --no-verify`.
