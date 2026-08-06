# AGENTS.md — YURI Workspace (YURI-OS-MUSUBI)

Root agent adapter. This is the only always-loaded file; everything else is opt-in by pointer. Do not restate policy here. If this file and `_SYSTEM/yuri-origin.md` conflict, origin wins.

## Operator

- Operator: Marcel (never "Rick").
- Workspace root: `/Users/marcelspatz/YURI-OS-MUSUBI` (branch `main`). Every file here is home.

## Orientation (load on demand)

| Need | Path |
|---|---|
| Operating contract | `_SYSTEM/yuri-origin.md` |
| Identity / cognition | `_SYSTEM/persona.md` (`SOUL.md` is injection redirect only) |
| Navigation map | `_SYSTEM/INDEX.md` |
| Context cascade | `_SYSTEM/context/README.md` |
| Context packets | `_SYSTEM/context/context-registry.json` |
| Folder / artifact placement | `_SYSTEM/config/folder-registry.json`, `_SYSTEM/config/artifact-registry.json` |
| MURE roles | `_SYSTEM/mure/ROLE-TOPOLOGY.md` |
| MURE role cards | `_SYSTEM/mure/agents/`, `_SYSTEM/mure/agent-catalog.json` |
| Skill library | `skills/README.md`, `skills/skill-index.json` |
| Agent recipes | `.agents/README.md` |
| Canonical graph | `_SYSTEM/yuri-graph.json` |
| Graph unify | `_SYSTEM/Scripts/yuri-graph-unify.mjs` |
| Xref navigation | `_SYSTEM/Scripts/xref-query.mjs` |
| Structural navigate | `_SYSTEM/Scripts/yuri-navigate.mjs` |
| Propagation scan | `_SYSTEM/Scripts/propagation-scan.mjs` |
| Memory mediator | `_SYSTEM/Scripts/memory-kernel.mjs` |
| Failure evolution | `skills/failure-evolution-loop/SKILL.md` |
| Agentic fleet discipline | `skills/agentic-engineering-fleet-discipline/SKILL.md` |
| GitNexus skill | `skills/gitnexus/SKILL.md` |

## Hard Rails

### Protected Surfaces

READING is allowed. WRITING is forbidden (mutation-locked). Exact list from `_SYSTEM/yuri-origin.md` → Protected Surfaces:

- `backend/data/`
- `.claude/state/`
- `.claude/history/`
- `.claude/file-history/`
- `.claude/projects/*/history/`
- `.claude/projects/*/state/`
- `.claude/projects/*/file-history/`
- `.claude/projects/*/worktrees/`
- `.claude/projects/*/transcripts/`
- `.env`
- `node_modules/`
- `.amp/`
- secrets, API keys, credentials

### Git

- Scoped pathspec only: `git add <paths>` + `git commit -- <paths>`
- Never `git add .` or bare `git commit`
- `git fetch` + rebase/fast-forward; never force
- Worktree lanes: commit on own branch; integrate via PR; never push (parent/merge lane publishes)
- Full Mutation Contract: `_SYSTEM/yuri-origin.md` → Mutation Contract

### Evidence

- Deterministic local evidence required before any PASS claim
- Grammar: `TERM_COUNT` / `FILE_COUNT` / `MATCH`
- Full rules: `_SYSTEM/yuri-origin.md` → Evidence Contract Grammar

### RESULT_LABEL

- Every lane result emits: `NNXX_DESCRIPTION_(X|P|F)_PASS_COMMITTED`
- Full grammar: `_SYSTEM/yuri-origin.md` → Lane Result Grammar

### Durable Files

- New durable files go through placement first: `node _SYSTEM/Scripts/artifact-registry.mjs --classify <path>`; no random top-level folders
- Policy → `_SYSTEM/docs/`; full storage rule: `_SYSTEM/context/README.md` → Storage Rule

## Agentic Operating Loop

Pointers only. Use existing machinery; do not invent a second doctrine.

1. **Orient** — `node _SYSTEM/Scripts/xref-query.mjs "<task>"`; known circuitry node → `node _SYSTEM/Scripts/propagation-scan.mjs <node-id> --dry-run`
2. **Recall skills** — Skill Loading below
3. **Graph engineering** — edit `_SYSTEM/yuri-graph.json` only; regenerate projections with `_SYSTEM/Scripts/yuri-graph-unify.mjs`; navigate via `_SYSTEM/Scripts/xref-query.mjs` / `_SYSTEM/Scripts/yuri-navigate.mjs`
4. **Loop engineering** — `_SYSTEM/yuri-origin.md` → Loop Discipline: frozen evaluator (a loop must never modify its own scorer); single-knob mutate → measure → keep-or-revert → durable results log; run on scratch branches
5. **Self-eval** — independent verifier downstream of producer (`_SYSTEM/mure/ROLE-TOPOLOGY.md`); adversarial verification before completion; failure capture via `skills/failure-evolution-loop/SKILL.md` (failure → root cause → regression → memory proposal)
6. **Agentic engineering** — fleet/role discipline via `skills/agentic-engineering-fleet-discipline/SKILL.md`; orchestrator plans/delegates/verifies; workers are bounded leaves; producers do not self-grade
7. **Measurement closeout** — GitNexus impact before symbol edits + detect before commit; deterministic evidence lines; RESULT_LABEL

## Skill Loading

For every substantive task:

```bash
node _SYSTEM/Scripts/skill-recall.mjs "<task>" --top 12 --json
```

- Read each selected governed `SKILL.md` completely before acting
- Sparse-hidden tracked source: `node _SYSTEM/Scripts/skill-recall.mjs --show <skill-id>`, then read that output
- `.agents/skills/` is generated metadata + pointers only; never skill-body authority
- `activate-yuri-skills` is implicit; other adapters are explicit via `$skill-id` or recall
- Detail: `skills/README.md`

## Memory

- **Track A (canonical, shared):** `_SYSTEM/memory/` via `_SYSTEM/Scripts/memory-kernel.mjs`; pipeline `propose → decide → promote`
- **Track B:** lane-local auto-memory (Claude), not shared
- Ambiguous → Track A
- No provider-specific shadow memory; cross-link by label, never duplicate
- Full rules: `_SYSTEM/yuri-origin.md` → Memory Architecture

## Code Intelligence (GitNexus)

<!-- gitnexus:start -->
- Before editing a symbol: `gitnexus_impact` (warn owner on HIGH/CRITICAL)
- Before committing: `gitnexus_detect_changes`
- Explore: `gitnexus_query` / `gitnexus_context`; rename: `gitnexus_rename`
- Stale index: `npx gitnexus analyze --skip-agents-md` (bare `analyze` re-expands this block)
- Deep-dives: `skills/gitnexus/SKILL.md` · `skills/gitnexus-exploring/SKILL.md` · `skills/gitnexus-impact-analysis/SKILL.md` · `skills/gitnexus-debugging/SKILL.md` · `skills/gitnexus-refactoring/SKILL.md` · `skills/gitnexus-pr-review/SKILL.md` · `skills/gitnexus-guide/SKILL.md` · `skills/gitnexus-cli/SKILL.md`
<!-- gitnexus:end -->

## Roles (pointer)

- Orchestrator / Architect / Advisor / Worker / Verifier boundaries: `_SYSTEM/mure/ROLE-TOPOLOGY.md`. Verifiers are independent and downstream
- Models and sessions are route bindings, not roles
- Subagent output is advisory until locally verified; never present subagents as route or model evidence
