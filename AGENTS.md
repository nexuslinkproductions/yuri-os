# AGENTS.md — YURI Workspace (YURI-OS-MUSUBI)

Root agent adapter. This is the brain-stem: it chains the YURI spine in the canonical order every session. This file does not duplicate YURI policy; it routes to the authority sources.

## Read Order (every session, natively)

1. `_SYSTEM/yuri-origin.md` — canonical operating contract (authority layer)
2. `_SYSTEM/persona.md` — identity, cognition, Marcel operating model
3. `SOUL.md` — core truths, adversarial-ally contract
4. This file — root-agent routing and tool conventions
5. xref-selected context evidence (on task)
6. task-local files

## Workspace

This repo (`/Users/marcelspatz/YURI-OS-MUSUBI`, branch `main`) IS the workspace. Operator: Marcel (never "Rick"). Every file here is home. Treat it that way.

## YURI Spine (inherited, never restated)

All authority, mutation, evidence, protected-surface, self-governance, and lane-routing rules flow from `_SYSTEM/yuri-origin.md`. Do not inline them here. When a rule appears in both places, `yuri-origin.md` wins.

Key contracts (see origin for full text):
- **Mutation Contract** — scoped-pathspec commit/push, no `git add .`, no force push
- **Protected Surfaces** — `.env`, `.claude/state/`, `.claude/history/`, `.claude/file-history/`, `backend/data/`, `node_modules/`, `.amp/`, secrets
- **Evidence Contract** — TERM_COUNT / FILE_COUNT / MATCH grammar, deterministic local evidence required
- **Self-Governance Charter** — decide+execute safe defaults; hold for owner confirm on gated actions
- **RESULT_LABEL grammar** — every lane result emits `NNXX_DESCRIPTION_(X|P|F)_PASS_COMMITTED`

## Memory Architecture

Use the two-track system from YURI origin:

- **Track A (YURI canonical)** — `_SYSTEM/memory/`, durable store `_SYSTEM/OS_KERNEL/memory.db`. Shared across all lanes. Governed: propose → decide → promote.
- **Track B (Claude auto-memory)** — `.claude/memory/`. Claude-Sonnet behavioral self-development. Not shared.
Routing: Track A for anything another lane should know. Track B for Claude-only behavioral drift. Cross-link by label, never duplicate.

## Skills

Canonical skills live in root `skills/` and are loaded through the YURI skill indexes. Provider-specific skill folders are compatibility surfaces only. Honor injected skill-recall hints and invoke matching skills before substantial work.

## Root-Agent Conventions

- **Sub-agents** — use for bounded parallel work; never present Codex subagents as MURE route/model evidence.
- **Continuity** — promote cross-lane durable knowledge through Track A; do not create provider-specific shadow memory.
- **Freshness** — detect stale indexes and safely regenerate derived projections before trusting them.

## Agent Fleet (MURE)

Canonical logical MURE role cards live under `_SYSTEM/mure/agents/`; `_SYSTEM/mure/agent-catalog.json` is their generated machine-readable projection. The executable role boundaries are summarized in `_SYSTEM/mure/ROLE-TOPOLOGY.md`; the provider/model route registry is `_SYSTEM/config/provider-route-registry.json`. OMP cards and terminal sessions are replaceable runtime bindings, not role authorities. Sol is the orchestrator, advisors are consult-only, workers are bounded leaves, and verifiers are independent downstream gates. Fable 5 is archival and excluded.

OpenClaw is retired. `.openclaw/` is historical/provider residue only and must not be restored to active architecture, role, skill, memory, or routing authority.

## Git & GitHub

- Commit AND push session's own work directly (scoped pathspec only — `git add <paths>` + `git commit -- <paths>`)
- NEVER `git add .` or bare `git commit`
- `git fetch` + rebase/fast-forward, NEVER force
- GitHub: `gh` CLI plus the relevant canonical GitHub skill for issues, PRs, and CI

## Code Intelligence (GitNexus)

<!-- gitnexus:start -->
GitNexus-indexed (`yuri-os`). Before editing a symbol run `gitnexus_impact` (warn the owner on HIGH/CRITICAL); before committing run `gitnexus_detect_changes`; explore with `gitnexus_query` / `gitnexus_context` instead of grep; rename via `gitnexus_rename` (call-graph aware). Stale index → `npx gitnexus analyze --skip-agents-md` (bare `analyze` re-expands this block). Full dispatcher: `/gitnexus`.

Deep-dives: `skills/gitnexus/SKILL.md` · `skills/gitnexus-exploring/SKILL.md` · `skills/gitnexus-impact-analysis/SKILL.md` · `skills/gitnexus-debugging/SKILL.md` · `skills/gitnexus-refactoring/SKILL.md` · `skills/gitnexus-pr-review/SKILL.md` · `skills/gitnexus-guide/SKILL.md` · `skills/gitnexus-cli/SKILL.md`
<!-- gitnexus:end -->

## Related

- Codex adapter (archived): `AGENTS.codex.bak.md`
- Claude Code adapter: `CLAUDE.md`
- Legacy external OMP config (non-authoritative for MURE): `~/.omp/agent/config.yml`
