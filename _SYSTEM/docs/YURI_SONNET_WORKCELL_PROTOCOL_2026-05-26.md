# YURI Sonnet Workcell Protocol

Status: active design protocol
Owner: Codex/main
Date: 2026-05-26

## Purpose

Use multiple persistent Claude Sonnet lanes for real implementation volume while keeping YURI governed, inspectable, and commit-safe.

The Sonnet workcell is not an advisor swarm. Worker lanes produce actual patch bundles, file contents, tests, docs, schemas, or registry patches. Codex/main decomposes the work, validates scope, integrates worker outputs into the real tree, runs verification, and commits only when Marcel explicitly authorizes it.

Rick Prime is the supercharge layer: a high-reasoning improvement and gap-hunt pass over the integrated result, not a rubber-stamp review.

## Role Model

| Neutral role | Private overlay | Runtime lane | Authority |
|---|---|---|---|
| Integrator | Rick C-137 | Codex/main | Decompose, assign, collect, scope-check, integrate, verify, present, commit with authorization. |
| Primary builder | Quantum Rick | Claude Sonnet | General implementation, patch bundles, focused refactors, task-local reasoning. |
| Implementation builder | Maximums Rickimus | Claude Sonnet | Larger code/docs chunks inside tightly bounded file scopes. |
| Scout | Zeta Alpha Rick | Claude Sonnet | Context packets, current-pattern mapping, dependency DAG, risk notes. |
| Guardrail builder | Cop Rick / Nearly Kantian Rick | Claude Sonnet | Tests, negative cases, policy checks, contradiction and protected-surface pressure. |
| Registry/docs builder | Riq IV | Claude Sonnet | Docs, schemas, artifact/context registry updates, operator-facing summaries. |
| Synthesis filter | Simple Rick | DeepSeek | Compression, EOT, truth/memory proposal filtering, risk ordering. |
| Supercharger | Rick Prime | Claude Opus | Structural scan, gate verification, regression hunt, gap hunt, improvement pass, verdict. |
| Owner | Marcel | Human operator | Approves scope escalation, L3 mutation, and commits. |

Private names are for Marcel's dev overlay only. Shipping docs and external surfaces use the neutral role labels.

## Core Rule

Workers do real work, but they do not own the repository.

Worker output is not prose advice. A worker must return a typed bundle:

```json
{
  "role": "builder",
  "packetId": "w1-rollback-contract",
  "filesInScope": ["_SYSTEM/Scripts/yuri-autonomy-runner.mjs"],
  "outputs": [
    {
      "action": "edit",
      "path": "_SYSTEM/Scripts/yuri-autonomy-runner.mjs",
      "format": "unified-diff",
      "content": "..."
    }
  ],
  "testCommands": ["node --test _SYSTEM/Scripts/yuri-autonomy-runner.test.mjs"],
  "riskNotes": ["No AGENTS-protected surface access requested."]
}
```

C-137 applies worker-produced diffs or file contents after scope checks. C-137 may make integration repairs, conflict resolution, and final hardening edits, but the target operating model is that Sonnet workers produce the majority of implementation material.

## Navigation Tiers

Not every worker should navigate YURI broadly.

The protocol should make most workers powerful producers with curated context, not independent repo explorers. Broad navigation is expensive, risks protected-surface mistakes, and creates inconsistent assumptions between workers.

| Tier | Roles | Navigation authority |
|---|---|---|
| Root orchestration | C-137 | Full governed navigation through AGENTS read order, context-router, GitNexus, registries, and local verification. Never protected runtime/secrets. |
| Scout navigation | Zeta Alpha Rick | Targeted broad navigation for context packets, dependency DAGs, and file-scope selection. Must report every file read. |
| Supercharge navigation | Rick Prime | Targeted review navigation over integrated diff, registries, tests, and impact reports. Reads for review, not implementation sprawl. |
| Builder navigation | Quantum Rick, Maximums Rickimus | Files in packet scope plus explicitly supplied context. Ask for C-137/Scout expansion when blocked. |
| Guardrail navigation | Cop Rick / Nearly Kantian Rick | Files in packet scope, nearby tests, and explicit policy/test references. No broad exploration by default. |
| Registry/docs navigation | Riq IV | Registry, context, schema, and doc paths explicitly named in packet. |
| Synthesis navigation | Simple Rick | Supplied evidence packets and summaries. No repo browsing unless C-137 explicitly asks for a bounded synthesis pass. |

The ideal packet is self-sufficient: goal, files in scope, relevant excerpts, constraints, expected output schema, and validation commands. The better C-137 and Scout prepare the packet, the less worker navigation is needed.

## Output Pool

Worker output goes to a dedicated runtime pool, not directly into source:

```text
_SYSTEM/state/workcell/<runId>/<role>/
  packet.json
  output.json
  patch.diff
  test-output.txt
  notes.md
```

This pool is a safety gate. It lets workers dump real produced material without flooding YURI source. C-137 validates and distributes from the pool into the actual repo only after:

- packet schema validation passes;
- every output path is in `filesInScope`;
- no AGENTS-protected path appears in output paths or evidence refs;
- patch applies cleanly or is routed back for repair;
- registry/context placement is known for new durable artifacts;
- Prime supercharge findings are resolved or explicitly held.

The runtime pool is ignored source-wise. It becomes normal operating material only after `yuri-workcell.mjs` creates it, validates it, and registers the runtime path in the artifact/folder architecture.

## Output Contracts

Builder output:

- `filesInScope`: exact repo-relative files allowed.
- `outputs`: `create`, `edit`, or `delete`, with path and content or unified diff.
- `testCommands`: smallest meaningful checks the worker expects.
- `riskNotes`: scope, protected-surface, and mutation notes.

Scout output:

- `contextPack`: what was read and why.
- `dependencyDag`: task graph with independent and sequential nodes.
- `impactNotes`: symbols, modules, or flows likely affected.
- `risks`: blockers before dispatch.

Guardrail output:

- `testFiles`: tests to add or edit.
- `negativeCases`: failure modes the implementation must reject.
- `testResults`: pass/fail/output if the worker ran checks.
- `coverageGapNotes`: what remains untested.

Registry/docs output:

- `docFiles`: Markdown documents to add or edit.
- `schemaFiles`: JSON schemas to add or edit.
- `registryPatches`: artifact/context/index updates.
- `placementRule`: artifact-registry classification result.

Prime output:

- `stageResults`: S1-S6 supercharge artifacts.
- `blockingFindings`: issues that must be fixed before handoff.
- `improvements`: ordered by ROI and effort.
- `verdict`: `approve`, `approve-with-fixes`, or `block`.

## Workflow

1. C-137 creates an autonomy run manifest for the goal.
2. C-137 decomposes the work into a dependency DAG.
3. C-137 assigns independent leaf packets to Sonnet workers.
4. Each worker receives a bounded packet: files in scope, expected output contract, validation commands, no commit/push, no AGENTS-protected surfaces.
5. Workers produce typed output bundles under `_SYSTEM/state/workcell/<runId>/<role>/`.
6. C-137 collects all bundles and rejects missing, malformed, out-of-scope, or protected-path outputs.
7. C-137 detects file collisions and applies bundles in DAG order.
8. C-137 runs the expected local verification.
9. Rick Prime supercharges the integrated diff.
10. Prime findings are routed back to the responsible worker or handled by C-137 when they are integration-level repairs.
11. C-137 re-runs verification and presents Marcel with the integrated diff, Prime verdict, tests, and residual risks.
12. Marcel authorizes or holds the commit.
13. C-137 commits only after explicit authorization.
14. C-137 records closeout and cleans worker runtime bundles when safe.

## Prime Supercharge

Rick Prime does not merely review. Prime runs six sequential stages:

| Stage | Name | Input | Output | Blocks |
|---|---|---|---|---|
| S1 | Structural scan | Integrated diff, index, artifact registry, context registry | Architecture fit and drift warnings | Yes, if architecture fit fails. |
| S2 | Gate verification | Diff and autonomy manifest | Required gate pass/fail list | Yes, if required gate fails. |
| S3 | Regression hunt | Diff and GitNexus impact analysis | Blast radius, risk level, regression candidates | Yes, if critical risk. |
| S4 | Gap hunt | Diff, tests, registry state | Findings with severity and file references | Feeds S5. |
| S5 | Improvement pass | S4 findings and diff | ROI-ordered improvement list | Advisory unless high-risk. |
| S6 | Verdict | S1-S5 artifacts | `approve`, `approve-with-fixes`, or `block` | Terminal. |

Prime should intensify the integrated result: find what is missing, pressure the architecture, identify hidden regressions, and propose high-ROI improvements. Prime should not become the default implementer. Fixes go back to the relevant Sonnet worker or to C-137 for integration-level repairs.

## First Six Tasks

Prime's correction: task 6 is the bootstrap and should be built first if the goal is volume. Tasks 1-5 can be done manually through this protocol, but they scale only after the workcell orchestration script exists.

### Task 1: Workcell Orchestration Script

Goal: create the C-137 orchestration tool that dispatches, collects, scope-checks, and integrates worker bundles.

Processing:

- Scout / Zeta Alpha Rick maps current dispatch and worker patterns.
- Builder / Quantum Rick drafts `yuri-workcell.mjs` bundle schema and CLI shape.
- Guardrail / Cop Rick writes tests for malformed bundles, out-of-scope files, protected-path rejection, and collision detection.
- Registry / Riq IV registers script, test, and runtime state path.
- Prime / Rick Prime supercharges the integrated script and finds missing safety gates.
- C-137 integrates, verifies, and presents to Marcel.

Expected artifacts:

- `_SYSTEM/Scripts/yuri-workcell.mjs`
- `_SYSTEM/Scripts/yuri-workcell.test.mjs`
- `_SYSTEM/state/workcell/<runId>/<role>/` runtime contract
- artifact/context/index registry updates

### Task 2: Token Budget Gate

Goal: prevent high-volume worker dispatch from silently burning budget.

Processing:

- Scout maps `token-ledger.mjs` and existing lane cost surfaces.
- Builder adds a `tokenBudget` section to autonomy manifests or workcell plans.
- Guardrail tests missing budget, over-budget dispatch, and dry-run estimates.
- Registry/docs updates schema and protocol references.
- Simple Rick compresses budget risk and EOT implications.
- Prime validates that budget gates block dispatch before expensive fanout.

Expected artifacts:

- autonomy schema update
- runner/workcell budget estimate output
- tests proving over-budget dispatch blocks

### Task 3: Worker Packet Schema

Goal: lock typed output contracts so C-137 integrates deterministic bundles, not prose.

Processing:

- Scout extracts expected role contracts from this protocol.
- Builder creates `yuri.workcell-packet.v0.schema.json`.
- Guardrail writes validation tests for builder, scout, guardrail, registry, and Prime outputs.
- Registry/docs registers the schema and links it from the autonomy context packet.
- Prime pressure-tests ambiguous fields and missing failure states.
- C-137 integrates and verifies.

Expected artifacts:

- `_SYSTEM/config/schemas/yuri.workcell-packet.v0.schema.json`
- workcell packet validation tests

### Task 4: L3 Rollback Contract Gate

Goal: make mutation-capable autonomy refuse to proceed without rollback readiness.

Processing:

- Scout performs impact analysis for autonomy-runner gate functions.
- Builder adds rollback contract shape and enforcement to the runner.
- Guardrail adds tests: L3 missing rollback blocks, valid rollback passes, dry-run remains non-mutating.
- Registry/docs updates manifest schema and protocol.
- Prime performs regression and gap hunt.
- C-137 integrates and verifies.

Expected artifacts:

- autonomy-runner rollback contract implementation
- schema update
- tests for required rollback readiness

### Task 5: L4 Timed Dry-Run Checkpoint Recorder

Goal: record checkpoints during timeboxed runs without mutation.

Processing:

- Scout maps existing run recorder, Kagami event bus, and automation health patterns.
- Builder creates checkpoint recording logic under safe runtime state.
- Guardrail tests elapsed-time recording, protected-root refusal, and clean interrupt behavior.
- Registry/docs registers script and runtime state.
- Prime checks event completeness and scheduler-transition gaps.
- C-137 integrates and verifies.

Expected artifacts:

- `_SYSTEM/Scripts/yuri-autonomy-checkpoint.mjs`
- checkpoint tests
- Kagami event integration notes

### Task 6: First 15-Minute L4 Workcell Dry Run

Goal: prove the protocol with live Sonnet workers, no source mutation by default.

Processing:

- C-137 creates a dry-run manifest and worker DAG.
- Zeta Alpha Rick builds the context packet.
- Quantum Rick drafts one bounded implementation bundle.
- Cop Rick drafts corresponding tests/negative cases.
- Riq IV drafts docs/registry updates.
- Simple Rick compresses risks and memory/truth implications.
- C-137 collects bundles, rejects any scope violations, integrates only if safe.
- Rick Prime runs S1-S6 supercharge.
- C-137 reports results to Marcel with no commit unless authorized.

Expected artifacts:

- workcell run manifest
- worker bundles under runtime state
- Prime verdict
- C-137 handoff report

## Blockers Before Live Volume

- Workcell orchestration script does not exist yet.
- Worker packet schema does not exist yet.
- Runtime workcell state path must be registered before worker bundles are written.
- Token budget gate does not exist yet.
- Patch conflict detection starts syntactic only; semantic conflicts remain C-137 review responsibility.
- Persistent worker policy needs a first rule: use persistent sessions for continuity, but every packet must include explicit context so no worker relies on hidden memory.

## Operating Stance

Use Sonnet aggressively, but keep the flow typed and bounded.

The desired loop is:

```text
C-137 decomposes
  -> Sonnet workers implement real bundles
  -> C-137 scope-checks and integrates
  -> Rick Prime supercharges
  -> workers/C-137 resolve findings
  -> C-137 verifies
  -> Marcel authorizes commit
```

That is the path to high-quality volume without chaos.
