# YURI OS System Index

Read this after `_SYSTEM/yuri-origin.md`, `SOUL.md`, and `_SYSTEM/context/README.md`.

Purpose: make the repo navigable without guessing. This file tells models what to read first, what to ignore by default, and where runtime noise belongs.

## Read First

| Path | Purpose |
|---|---|
| `_SYSTEM/yuri-origin.md` | Canonical operating contract and authority hierarchy. |
| `SOUL.md` | Persona, cognitive workflow, and collaboration style. |
| `_SYSTEM/context/README.md` | Context layer: how task context, wiki, registry, memory, and research are assembled before implementation. |
| `_SYSTEM/context/context-registry.json` | Machine-readable bounded packet registry used by xref-aware navigation. |
| `_SYSTEM/docs/YURI_ORIGINATOR_BRIDGE_2026-06-07.md` | Shared Originator entry point for LLMs to use YURI's math, energy, xref, memory, and llm-compat substrate. |
| `_SYSTEM/docs/YURI_OS_DISCIPLINED_SELF_IMPROVEMENT_GOAL_2026-05-23.md` | Active `/goal`: disciplined cleanup, memory, navigation, persistent lanes, and cyber companion growth. |
| `_SYSTEM/docs/YURI_OS_STRUCTURE_CLEANUP_AUDIT_2026-05-23.md` | Current structure cleanup audit and cleanup waves. |
| `_SYSTEM/docs/YURI_STORAGE_AND_ARTIFACT_REGISTRY_PROTOCOL_2026-05-23.md` | Where new docs/scripts/reports/registries/runtimes should live and how to classify them. |
| `_SYSTEM/docs/YURI_CODEX_PLUGIN_CONTROL_PLANE_PROTOCOL_2026-05-28.md` | Codex plugin/app connector routing rule: plugins are capability lanes that must traverse YURI context and hook gates. |
| `_SYSTEM/config/folder-registry.json` | Machine-readable folder classification map. |
| `_SYSTEM/config/artifact-registry.json` | Machine-readable durable artifact map and future placement rules. |
| `.agents/README.md` | Agent assembly layer: agents are recipes, not hidden provider magic. |
| `skills/README.md` | Canonical root-visible skill library entrypoint. |
| `skills/skill-index.json` | Machine-readable root skill index. |
| `_SYSTEM/Scripts/llm-compat-contract.mjs` | Lane routing and model contract. |
| `_SYSTEM/Scripts/xref-query.mjs` | Current xref-first navigation surface across FTS5, circuitry graph, GitNexus, spectrum, and provenance scoring. Defaults to a 200-result request floor; use `--top N`, `--scan N`, or `--all` for thousand-hit recall. |
| `_SYSTEM/Scripts/propagation-scan.mjs` | Read-only propagation-law scan from a circuitry node to structural mechanism siblings. |
| `_SYSTEM/Scripts/lane-kernel.mjs` | Canonical lane status/model/tool source when present. |
| `_SYSTEM/Scripts/yuri/` | YURI-owned harness primitives — the canonical harness script folder. |
| `_SYSTEM/Scripts/kagami-event-bus.mjs` | YURI-owned append-only Kagami event bus for governed autonomy state. |
| `_SYSTEM/Scripts/lane-arbitration.mjs` | Codex/main verifier for captured lane evidence, emitting Kagami verification events. |
| `_SYSTEM/Scripts/lane-persona-map.mjs` | Private dev-only Rick alias overlay with neutral shipping labels and cache-stable packet headers. |
| `_SYSTEM/Scripts/yuri-closeout.mjs` | Lean deterministic EOT/closeout checkpoint for continuity without model fanout. |
| `_SYSTEM/Scripts/worker-capture-once.mjs` | Delayed live worker pane capture into `_SYSTEM/state/worker-captures/` with Kagami evidence refs. |
| `_SYSTEM/Scripts/yuri-workcell.mjs` | Workcell orchestration core: DAG validation hard gate via `topologicalSort()`, packet assembly, scope checking, and decomposition builder. |
| `_SYSTEM/Scripts/yuri-workcell-capture.mjs` | Workcell intake bridge: captures live worker/Prime pane output into `_SYSTEM/state/workcell/<runId>/<role>/` as structured output. |
| `_SYSTEM/docs/YURI_GOVERNED_AUTONOMY_SPRINT_PLAN_2026-06-07.md` | Active governed-autonomy sprint plan: xref preflight, broad recall, baseline anchor, evidence runner, approval gates, rollback contract, scorecard, and timed-run path. |
| `_SYSTEM/docs/YURI_SONNET_WORKCELL_PROTOCOL_2026-05-26.md` | Multi-Sonnet workcell protocol: worker bundles, memory capsules/signals, Rick Prime supercharge, C-137 integration, and commit authorization. |
| `_SYSTEM/Scripts/yuri-autonomy-runner.mjs` | Dry-run-first autonomy runner that emits baseline-anchored run manifests and optional Kagami events. |
| `_SYSTEM/Scripts/memory-proposal-autopilot.mjs` | Background-capable memory proposal processor: reviews pending proposals, records keep/rewrite/reject/defer decisions, and optionally commits/pushes scoped source/docs changes. |
| `_SYSTEM/config/schemas/yuri.autonomy-run.v0.schema.json` | Canonical schema reference for autonomy run manifests. |
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
| `_SYSTEM/Scripts/math/yuri-energy.mjs` | Scalar potential U(state) composition over YURI control-plane state. Lyapunov-style gateProposal rejection rule. Reference implementation for the energy-landscape methodology paper (ship 2026-07-23). |
| `_SYSTEM/reports/YURI_GROUND_TRUTH_AUDIT_2026-05-28.md` | Operating-surface ground-truth audit; foundation for paper claims about YURI. |

## Root Folder Classes

| Class | Paths | Default behavior |
|---|---|---|
| Human workspace | `00_COMMAND-CENTER`, `01_PROJECTS`, `02_RESOURCES`, `03_NEXUS-LINK`, `04_ARCHIVE` | Read only when the task needs that domain. |
| Control plane | `_SYSTEM` | Read targeted docs/scripts only. |
| Agent assembly | `.agents` | Read recipes and command adapters only. It references skills; it does not own skill bodies. |
| Skill library | `skills` | Canonical YURI capability database. Load selected `skills/<skill-id>/SKILL.md` files only. |
| Provider adapters | `.claude`, `.codex`, `.obsidian`, `.vscode` | Doors, not brains. Read only provider-specific config needed for the task. |
| Runtime/cache | `.codex-worktrees`, `.smart-env`, `.tmp` plus task-scoped generated outputs | Do not read by default. Root generated dumps should be deleted or regenerated through a scoped task. |
| Generated artifacts | Historical roots such as `graph`, `graphify-out`, `claude-palace-out` | Not source truth and not kept in the root. Regenerate only for graph/report tasks. |
| External checkouts | `_SYSTEM/tools/gitnexus`, selected `01_PROJECTS/*`, selected `02_RESOURCES/RESEARCH/*` | Read only when explicitly relevant. Update through their own repo/tool contract. |
| Local model runtimes | Ollama via `_SYSTEM/Scripts/ollama-lane.mjs`, `_SYSTEM/Scripts/ollama-adapter.mjs`, `.claude/config/models.json` | Active routed local policy is `gemma4:12b-it-qat`; retired local identities are compatibility aliases only. |
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
  -> _SYSTEM/docs/YURI_ORIGINATOR_BRIDGE_2026-06-07.md when the task involves math/energy/xref/LLM bridging
  -> _SYSTEM/config/folder-registry.json
  -> _SYSTEM/config/artifact-registry.json
  -> .agents/README.md
  -> skills/README.md
  -> xref-selected registry/context paths
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

## NEXUS CORE / Mathematical Substrate

Math work routes through the `mathematics` context packet and xref-first navigation. Use `02_RESOURCES/RESEARCH/MATH-SCIENCE-MANUAL.md` as the living dock-on guide, `_SYSTEM/Scripts/math/` for verified substrate code and non-invasive simulations, `_SYSTEM/labs/math/` for polyglot visual proof labs, and `_SYSTEM/data/math/formula-banks/` for versioned formula artifacts. The upcoming NEXUS CORE rename should keep code, data, registry, graph, and manual updates in one continuity-law migration. External engines may explore and compute; YURI preserves hypotheses but promotes only verified outputs.

## YURI Originator Bridge

LLM platform-switching and shared math/energy/xref entry-point work routes through `_SYSTEM/docs/YURI_ORIGINATOR_BRIDGE_2026-06-07.md`, `_SYSTEM/docs/YURI_NATIVE_RAPIDFIRE_MATH_ORIGINATOR_2026-06-08.md`, `_SYSTEM/docs/YURI_NATIVE_RAPIDFIRE_CLAUDE_HANDOFF_2026-06-08.md`, and the `originator-bridge` context packet. The bridge is the current canonical design for turning raw operator input into an input genome, broad xref recall, formula/mechanism selection, energy/GVF evaluation, llm-compat advisory routing, and local verification. The rapidfire originator handoff extends that design into a native one-port firing mechanism: decode, xref, formula/theorem synthesis, semantic-to-executable compilation, energy/proof gating, revision, and verified handoff. DeepSeek advisory lanes for this surface must use `ai llm deepseek ...` or the same llm-compat lane internals only.

## Governed Autonomy

Autonomy work routes through the `autonomy` context packet. Start with `_SYSTEM/Scripts/yuri-autonomy-runner.mjs plan --goal "<goal>"` to produce a dry-run manifest before any mutation. L1/L2 runs may collect evidence and propose research or memory work. L3 and above require explicit operator approval, an operator signature slot, rollback readiness, protected-path checks, and local verification before source mutation can be trusted.

Multi-Sonnet implementation work routes through `_SYSTEM/docs/YURI_SONNET_WORKCELL_PROTOCOL_2026-05-26.md`. Sonnet workers produce typed bundles with read-only memory capsules and structured memory signals; `_SYSTEM/Scripts/yuri-workcell-capture.mjs` preserves live pane output in the workcell runtime pool; Codex/main integrates and verifies; Rick Prime supercharges the integrated diff; Marcel authorizes commits and memory promotions.

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
