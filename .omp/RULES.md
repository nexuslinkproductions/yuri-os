# OMP Rules — sticky floor

Role-agnostic, deterministic, live at `.omp/RULES.md`. Every OMP lane inherits this file's constraints.

## Authority chain

Owner intent → direct local evidence → `CLAUDE.md` + `_SYSTEM/yuri-origin.md` → this file → model inference. Persona is a behavior layer; it never overrides the floor.

## Navigation discipline

- **`xref-query.mjs` first.** Run `node _SYSTEM/Scripts/xref-query.mjs "<task>"` before any broad grep/glob exploration. It fuses FTS5, circuitry graph, GitNexus, and capability hits.
- **`capability-recall.mjs` before new primitives.** Run `node _SYSTEM/Scripts/capability-recall.mjs "<need>"` before building any mechanism, scorer, loop, or parser. Never rebuild what YURI already has.
- `context-router.mjs` and `yuri-control-plane-first` are RETIRED. Do not invoke or instruct either.

## Memory

Two tracks:
- **Track A (YURI canonical):** facts other lanes need → `_SYSTEM/Scripts/memory-kernel.mjs` (propose→decide→ledger).
- **Track B (Claude auto-memory):** behavioral self-development → write into `~/.claude/projects/*/memory/` with v3 frontmatter.
- Ambiguous → Track A. Never duplicate across tracks.

## Protected paths

Never read or write: `.env`, secrets/API keys/credentials, `node_modules/`, `.claude/state/`, `.claude/history/`, `.claude/file-history/`, `.claude/projects/*/{history,state,file-history,worktrees,transcripts}`, `backend/data/`, `.amp/`.

## Evidence discipline

Sort claims into confidence tiers: CONFIRMED / PLAUSIBLE / NEEDS-VERIFICATION. Tag every claim with provenance. `NEEDS-VERIFICATION` names the one check that would settle it. Verify operational claims against live runtime, not comments or happy-path output.

## Worker safety

Workers (subagents, spawned lanes): **never commit, never push, never reach outward** (no email, no tweets, no external APIs without owner directive). Workers produce local evidence only. The parent orchestrator owns commit/push/external-action authority. Parent session: explicit pathspec only (`git add <paths>` + `git commit -- <paths>`), never `git add .`.

## Model routing

Parent orchestrates; explicit model-bound subagents execute. Dispatch eligibility is governed by the Provider route eligibility section below. Sol (`openai/gpt-5.6-sol`) is catalogued but FAIL_CLOSED/unproven and is not the effective OMP default. Terra and Luna are likewise unproven or quota-blocked — fail closed. Cline provider is unavailable — fail closed. Local Ollama is forbidden.

## Provider route eligibility

The MURE agent catalog is the sole authority for role-variant bindings.
Catalog presence alone is insufficient for dispatch eligibility. Every route binding
must satisfy both conditions:

1. **Admission history**: Resolvable to a `canary-proven` entry in
   `_SYSTEM/config/provider-route-registry.json`.
2. **Live gate**: The route's latest canary must have passed; no later failed canary
   exists. A failed canary (quota exhaustion, provider drift, API change) blocks that
   route immediately until re-canary succeeds.

Acceptable evidence is exactly one of:
- Exact source-route match (e.g. `zai/glm-5.2`) in the registry with `canary-proven`
  status and passing latest canary.
- Normalized selector match (provider-scoped shorthand like `minimax-code` →
  `minimax-code/MiniMax-M3`) backed by `canary-proven` registry evidence and passing
  latest canary.

Missing admission history OR latest canary failure → route fails closed.

Routes with `blocked-schema`, `unresolved`, or `owner-excluded` status are known
disqualifications — they fail closed regardless of catalog or model-list appearance.

### Discoverability vs. executability

All catalog cards are projected — every variant and role binding appears in generated
`.omp/agents/` for discovery. But being projected is not the same as being executable.
Unproven, blocked, and excluded cards are listed in the generated project config's
`task.disabledAgents` and must never inherit the parent or default model binding.
Only cards meeting Provider route eligibility criteria (canary-proven admission history and passing latest canary) are dispatch-eligible.

### Card-level stale-session backstop

`task.disabledAgents` is the primary steady-state gate after session startup.
`disabled/mure-route-unavailable` is the card-level stale-session backstop
that blocks parent/default model inheritance. Project-config changes require a
fresh OMP session — there is no hot reload; do not rely on settings-layer
enforcement until the session has restarted.

### Verified runtime defenses

Two independent gates protect against dispatch of unproven routes:

1. **Fresh-session disabledAgents rejection**: On session startup, OMP processes the `disabledAgents` list and refuses to spawn any agent card listed by ID.
2. **Isolated non-disabled sentinel card failure**: An isolated card with a non-disabled model binding that is unproven/unreachable fails fast (no model selected, zero model_change and zero message events) in 177–183 ms, never reaching orchestrator or parent fallback chain.

### Registry canary evidence is admission history, not liveness

`canary-proven` status in `_SYSTEM/config/provider-route-registry.json` records successful past execution, not current availability. The full dispatch-eligibility criteria (see Provider route eligibility above) require both admission history AND a passing latest canary. Routes with later failed canaries are blocked until re-canary succeeds.
