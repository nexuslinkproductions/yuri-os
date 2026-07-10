# AGENTS.md — OpenClaw Workspace (YURI-OS-MUSUBI)

OpenClaw-native adapter. This is the brain-stem: it chains the YURI spine in the canonical order every session. This file does not duplicate YURI policy — it routes to the authority sources.

## Read Order (every session, natively)

1. `_SYSTEM/yuri-origin.md` — canonical operating contract (authority layer)
2. `_SYSTEM/persona.md` — identity, cognition, Marcel operating model
3. `SOUL.md` — core truths, adversarial-ally contract
4. This file — OpenClaw-specific routing and tool conventions
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

Two-track system from YURI origin, plus OpenClaw daily notes:

- **Track A (YURI canonical)** — `_SYSTEM/memory/`, durable store `_SYSTEM/OS_KERNEL/memory.db`. Shared across all lanes. Governed: propose → decide → promote.
- **Track B (Claude auto-memory)** — `.claude/memory/`. Claude-Sonnet behavioral self-development. Not shared.
- **Track C (OpenClaw daily)** — `memory/YYYY-MM-DD.md` + `MEMORY.md`. Session continuity within OpenClaw. Raw logs + curated long-term memory.

Routing: Track A for anything another lane should know. Track B for Claude-only behavioral drift. Track C for OpenClaw-specific session memory. Cross-link by label, never duplicate.

## Skills

Skills live in `.claude/skills/` (Claude Code skills) and are loaded by the YURI skill loader. OpenClaw skills live in the standard skill registry. The `<skill-recall-hint>` injected each prompt should be honored — invoke matching skills before substantial work.

## OpenClaw Conventions

- **Heartbeats** — use proactively: email/calendar/weather checks, memory maintenance, staleness detection
- **Sub-agents** — spawn for parallel work, same fleet-by-default posture as CLAUDE.md
- **Cron vs heartbeat** — cron for exact-timing tasks, heartbeat for batched periodic checks
- **Group chats** — participate, don't dominate. React naturally. Quality > quantity.
- **Memory** — write daily notes to `memory/YYYY-MM-DD.md`. Curate long-term to `MEMORY.md`. No mental notes.

## Agent Fleet (MURE)

MURE agent definitions live exclusively in `.openclaw/agents/` as OpenClaw-native cards. Repo-local `.omp/agents/` is retired and must not become a MURE authority again. The Helmsman dispatches; every other role is a specialized lane. Fleet-by-default: decompose → dispatch parallel → verify → finalize orchestrator-only.

See `.openclaw/mure-agent-catalog.json` for the complete role registry with model bindings.
The executable role boundaries are summarized in `_SYSTEM/mure/ROLE-TOPOLOGY.md`; the provider/model route registry is `_SYSTEM/config/provider-route-registry.json`. Sol is the orchestrator, advisors are consult-only, workers are bounded leaves, and verifiers are independent downstream gates. Fable 5 is archival and excluded.

## Git & GitHub

- Commit AND push session's own work directly (scoped pathspec only — `git add <paths>` + `git commit -- <paths>`)
- NEVER `git add .` or bare `git commit`
- `git fetch` + rebase/fast-forward, NEVER force
- GitHub: `gh` CLI + `@openclaw/github` skill for issues, PRs, CI

## Code Intelligence (GitNexus)

<!-- gitnexus:start -->
GitNexus-indexed (`yuri-os`). Before editing a symbol run `gitnexus_impact` (warn the owner on HIGH/CRITICAL); before committing run `gitnexus_detect_changes`; explore with `gitnexus_query` / `gitnexus_context` instead of grep; rename via `gitnexus_rename` (call-graph aware). Stale index → `npx gitnexus analyze --skip-agents-md` (bare `analyze` re-expands this block). Full dispatcher: `/gitnexus`.

Deep-dives: `skills/gitnexus/SKILL.md` · `skills/gitnexus-exploring/SKILL.md` · `skills/gitnexus-impact-analysis/SKILL.md` · `skills/gitnexus-debugging/SKILL.md` · `skills/gitnexus-refactoring/SKILL.md` · `skills/gitnexus-pr-review/SKILL.md` · `skills/gitnexus-guide/SKILL.md` · `skills/gitnexus-cli/SKILL.md`
<!-- gitnexus:end -->

## Related

- Codex adapter (archived): `AGENTS.codex.bak.md`
- Claude Code adapter: `CLAUDE.md`
- Legacy external OMP config (non-authoritative for MURE): `~/.omp/agent/config.yml`
