---
name: proj-mure-openclaw-fleet-rebuild-2026-07-09
description: "MURE fleet rebuilt in OpenClaw — 26 agents, per-role variant matrix, advisor tier, Yuri main-binding; roster + catalog + schema paths"
metadata: 
  node_type: memory
  type: project
  originSessionId: 74de50a7-6bdd-4631-aa2a-edcea6c27218
---

MURE fleet rebuild inside OpenClaw (2026-07-09, branch main). 25 role agents + `mure-yuri` main-session binding = 26 catalog entries, each with a seeded `variants[]` matrix (67 active variants + 2 pending fable-synth post-2026-07-12). Runtime default flipped to `anthropic/claude-opus-4-8`.

**Canonical files:**
- `.openclaw/mure-agent-catalog.json` — 26 agents, variants, fallbackChain, selection. Authority for fleet shape.
- `.openclaw/agents/mure-yuri.md` — OpenClaw-native Yuri spec (moved OUT of `.omp/` at Marcel's direction — `.omp/` is OMP-format only; OpenClaw agents live in `.openclaw/agents/`). References `_SYSTEM/persona.md` as brain.
- `.omp/agents/mure-advisor.md` — advisor role (OMP format).
- `_SYSTEM/config/cloud-fleet-models.json` v2.1.0 — 8 substrates incl. `deepseek_direct` ($1.25/day cap), `minimax_portal`, `mure_advisor` eligibility matrix.
- `_SYSTEM/research/advisor-note-schema-2026-07-09.md` — binding advisor note JSON schema + §7 budget governance.
- `_SYSTEM/research/model-audit-2026-07-09.md` — 15 models × 24 roles ★/●/— capability matrix (variant seed source).
- `_SYSTEM/research/per-role-variant-table-2026-07-09.md` — Opus 4.8 per-role assignment table.
- `_SYSTEM/research/mure-fleet-roster-2026-07-09.html` — self-contained visual roster (Marcel signed off "very happy").

**Model tier pairings (Marcel 2026-07-09):** apex/judgment Opus 4.8 ↔ Sonnet 5 small; cross-modal heavy M3 (1M+img+video) ↔ M2.7 small; code peer GLM-5.2 ↔ GLM-5.1. Every heavy anchor gets a cheaper same-family fallback.

**Advisor = two-tier + one-turn-lag injection:** cheap watcher (Sonnet 5 prime) every turn; heavy advisor (Opus 4.8 → DVP-Think → GLM-5.2 → M3) only on escalation. Security-relevant heavy turns MUST be Opus 4.8 (Sonnet 5 disqualified per audit). Haiku NEVER in heavy chain (recon/cheap only).

**mure-architect** owns strategy + planning (added 2026-07-09, commit `3757d420`) on top of architecture/method/interface design.

**Open design thread (next):** MoE/MLP-style role-CATEGORY layer above per-role bindings — categories own model-pools per cost-tier + sub-agent spawn scope + MLP re-rank on calibrator track-record. Not yet built; held for Marcel's go.

**Reindex blocker (2026-07-09):** `ai reindex` / `yuri-search-index.mjs` fails — `better-sqlite3` compiled against NODE_MODULE_VERSION 141 (Node 24), runtime is Node 26.4.0 (147). Needs `npm rebuild better-sqlite3` (owner-gated; node_modules is protected). FTS corpus stale until resolved. See [[FB:LIVE-RECALL-NOT-STALE-TRACKERS]].
