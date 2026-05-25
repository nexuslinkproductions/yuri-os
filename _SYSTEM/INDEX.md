# YURI OS System Index

Read this after `_SYSTEM/yuri-origin.md`, `SOUL.md`, and `_SYSTEM/context/README.md`.

Purpose: make the repo navigable without guessing. This file tells models what to read first, what to ignore by default, and where runtime noise belongs.

## Read First

| Path | Purpose |
|---|---|
| `_SYSTEM/yuri-origin.md` | Canonical operating contract and authority hierarchy. |
| `SOUL.md` | Persona, cognitive workflow, and collaboration style. |
| `_SYSTEM/context/README.md` | Context layer: how task context, wiki, registry, memory, and research are assembled before implementation. |
| `_SYSTEM/context/context-registry.json` | Machine-readable context packet selector. |
| `_SYSTEM/docs/YURI_OS_DISCIPLINED_SELF_IMPROVEMENT_GOAL_2026-05-23.md` | Active `/goal`: disciplined cleanup, memory, navigation, persistent lanes, and cyber companion growth. |
| `_SYSTEM/docs/YURI_OS_STRUCTURE_CLEANUP_AUDIT_2026-05-23.md` | Current structure cleanup audit and cleanup waves. |
| `_SYSTEM/docs/YURI_STORAGE_AND_ARTIFACT_REGISTRY_PROTOCOL_2026-05-23.md` | Where new docs/scripts/reports/registries/runtimes should live and how to classify them. |
| `_SYSTEM/config/folder-registry.json` | Machine-readable folder classification map. |
| `_SYSTEM/config/artifact-registry.json` | Machine-readable durable artifact map and future placement rules. |
| `.agents/README.md` | Agent assembly layer: agents are recipes, not hidden provider magic. |
| `skills/README.md` | Canonical root-visible skill library entrypoint. |
| `skills/skill-index.json` | Machine-readable root skill index. |
| `_SYSTEM/Scripts/offload-contract.mjs` | Lane routing and model contract. |
| `_SYSTEM/Scripts/lane-kernel.mjs` | Canonical lane status/model/tool source when present. |
| `_SYSTEM/Scripts/yuri/` | YURI-owned harness primitives relocated from the retired `nudimmud` script folder. |
| `_SYSTEM/Scripts/kagami-event-bus.mjs` | YURI-owned append-only Kagami event bus for governed autonomy state. |
| `_SYSTEM/Scripts/lane-arbitration.mjs` | Codex/main verifier for captured lane evidence, emitting Kagami verification events. |
| `_SYSTEM/Scripts/lane-persona-map.mjs` | Private dev-only Rick alias overlay with neutral shipping labels and cache-stable packet headers. |
| `_SYSTEM/Scripts/yuri-closeout.mjs` | Lean deterministic EOT/closeout checkpoint for continuity without model fanout. |
| `_SYSTEM/Scripts/worker-capture-once.mjs` | Delayed live worker pane capture into `_SYSTEM/state/worker-captures/` with Kagami evidence refs. |
| `_SYSTEM/research-archive/yuri-math-engine-2026-05/00_manifest.md` | Mathematical operating substrate research intake and governance boundary. |
| `_SYSTEM/research-archive/yuri-math-engine-2026-05/09_general_math_operationalization.md` | General-purpose math operationalization method and adapter map. |
| `_SYSTEM/research-archive/yuri-math-engine-2026-05/10_formula_card_schema.md` | Rich formula-card schema for operational formulas and examples. |
| `_SYSTEM/research-archive/yuri-math-engine-2026-05/11_general_math_hardening_plan.md` | Current non-domain-specific math hardening plan. |
| `_SYSTEM/research-archive/yuri-math-engine-2026-05/12_research_sprint_2026_05_25.md` | Shintai plus web research hardening sprint for formula gates and proof traces. |
| `_SYSTEM/research-archive/yuri-math-engine-2026-05/13_math_application_playbook.md` | Operating playbook for mapping YURI tasks into math domains, variables, proof checks, visual artifacts, and non-invasive integrations. |
| `_SYSTEM/config/schemas/yuri.math.formula-bank.v0.schema.json` | Canonical schema reference for promoted formula banks. |
| `_SYSTEM/Scripts/math/math-proof-gate.mjs` | Formula-bank proof gate for executable examples and deterministic proof traces. |
| `_SYSTEM/Scripts/math/math-health.mjs` | Health check for math archive, adapters, formula banks, and core algorithm proofs. |
| `_SYSTEM/Scripts/math/math-operational-simulation.mjs` | Non-invasive math integration report for memory scoring, context routing, RAG conflict detection, tool routing, release scoring, and creative scheduling. |

## Root Folder Classes

| Class | Paths | Default behavior |
|---|---|---|
| Human workspace | `00_COMMAND-CENTER`, `01_PROJECTS`, `02_AREAS`, `03_RESOURCES`, `04_FINANCE`, `05_NEXUS-LINK`, `07_ARCHIVE` | Read only when the task needs that domain. |
| Control plane | `_SYSTEM` | Read targeted docs/scripts only. |
| Agent assembly | `.agents` | Read recipes and command adapters only. It references skills; it does not own skill bodies. |
| Skill library | `skills` | Canonical YURI capability database. Load selected `skills/<skill-id>/SKILL.md` files only. |
| Provider adapters | `.claude`, `.codex`, `.obsidian`, `.vscode` | Doors, not brains. Read only provider-specific config needed for the task. |
| Runtime/cache | `.codex-worktrees`, `.smart-env`, `.tmp`, `logs`, `checkpoints`, `dist`, `output` | Do not read by default. Candidate cleanup only after registry/process checks. |
| Generated artifacts | `graph`, `graphify-out`, `claude-palace-out` | Do not read by default. Regenerate or inspect only for graph/report tasks. |
| External checkouts | `_SYSTEM/tools/*`, selected `01_PROJECTS/*`, selected `03_RESOURCES/RESEARCH/*` | Read only when explicitly relevant. Update through their own repo/tool contract. |
| Local model runtimes | `needle` | Treat as a model runtime, not a generic research repo. Use through YURI routing/health contracts. |
| Protected surfaces | `.env`, `backend/data`, `.claude/state`, `.claude/history`, `node_modules` | Never read directly. Use existing wrappers or explicit owner-approved operation. |

## Canonical Model Read Path

```text
owner prompt
  -> Kagami/Rick intake or current provider adapter
  -> _SYSTEM/yuri-origin.md
  -> SOUL.md
  -> _SYSTEM/context/README.md
  -> _SYSTEM/context/context-registry.json
  -> _SYSTEM/INDEX.md
  -> _SYSTEM/config/folder-registry.json
  -> _SYSTEM/config/artifact-registry.json
  -> .agents/README.md
  -> skills/README.md
  -> selected context packet
  -> _SYSTEM/yuri-wiki/index.md when curated memory/context is needed
  -> task-specific local context
  -> implementation files
  -> verification / release gate
```

## Adapter Rule

Provider files are doors, not brains.

Allowed:

- inherit `_SYSTEM/yuri-origin.md`
- inherit `SOUL.md`
- point to the context layer
- add provider-specific launch checks
- add provider-specific command syntax

Not allowed:

- duplicate global policy
- declare separate source-of-truth hierarchies
- maintain independent model/lane tables
- revive retired lanes or old aliases
- call paid provider models through headless prompt routes when a persistent CLI session is required

## Continuous Session Rule

Claude and DeepSeek collaboration must prefer persistent CLI/tmux/PTY sessions.

Allowed:

- start or attach a real interactive CLI session
- feed bounded packets into that live session through the Kagami bridge
- stream deltas back into the operator surface

Not allowed:

- SDK-style Claude calls
- `claude -p`
- Claude `--print` prompt calls
- no-session-persistence prompt calls
- spawning fresh paid model sessions for every advisory packet

## New Artifact Rule

Every new durable folder, script, JSON registry, Markdown plan, HTML report, database, model runtime, or external checkout must be classified before it becomes normal operating material.

Minimum metadata:

- repo-relative `path`
- `type`: folder, doc, script, config, data, report, runtime, external_checkout, model_runtime
- `class`: one of the registry classes
- owner
- status
- read-by-default policy
- storage destination
- cleanup/rebuild rule

Agent recipes belong in `.agents/`. Canonical reusable skills belong in `skills/`.

`_SYSTEM/config/folder-registry.json` is the folder implementation of this rule. `_SYSTEM/config/artifact-registry.json` is the durable artifact implementation. `_SYSTEM/context/context-registry.json` is the context-packet implementation. `_SYSTEM/yuri-wiki` is the human/RAG-readable projection, not the hidden source of truth.

## Mathematical Operating Substrate

Math work routes through the `mathematics` context packet. Use `_SYSTEM/research-archive/yuri-math-engine-2026-05/` for research intake and application playbooks, `_SYSTEM/Scripts/math/` for verified substrate code and non-invasive simulations, `_SYSTEM/labs/math/` for polyglot visual proof labs, and `_SYSTEM/data/math/formula-banks/` for versioned formula artifacts. External engines may explore and compute; YURI preserves hypotheses but promotes only verified outputs.

## Current Cleanup North Star

YURI should read as:

- one canonical operating spine
- root-visible agent assembly followed by root-visible skills
- thin provider adapters
- strong context layer
- clear human workspace
- hidden runtime/cache noise
- explicit external research/tool checkouts
- protected surfaces behind wrappers
