# YURI Sonnet Workcell Protocol

Status: active design protocol
Owner: Codex/main
Date: 2026-05-26

## Purpose

Use multiple persistent Claude Sonnet lanes for real implementation volume while keeping YURI governed, inspectable, and commit-safe.

The Sonnet workcell is not an advisor swarm. Worker lanes produce actual patch bundles, file contents, tests, docs, schemas, or registry patches. Codex/main decomposes the work, validates scope, integrates worker outputs into the real tree, runs verification, and commits only when Marcel explicitly authorizes it.

Rick Prime is the supercharge layer: a high-reasoning improvement, gap-hunt, and scoped edit pass over the integrated result, not a rubber-stamp review.

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
| Supercharger | Rick Prime | Claude Opus | Structural scan, gate verification, regression hunt, gap hunt, scoped improvement edits, verdict. |
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
      "format": "yuri-patch-v0",
      "scope_declared": ["_SYSTEM/Scripts/yuri-autonomy-runner.mjs"],
      "patches": [
        {
          "op": "replace_lines",
          "file": "_SYSTEM/Scripts/yuri-autonomy-runner.mjs",
          "line_hint": 120,
          "anchor_match": "exact",
          "context_before": ["// exact nearby line before target"],
          "old_lines": ["const oldValue = true;"],
          "new_lines": ["const oldValue = false;"],
          "context_after": ["// exact nearby line after target"],
          "intent": "one-line reviewer-facing reason for the change"
        }
      ],
      "test_commands": ["node --test _SYSTEM/Scripts/yuri-autonomy-runner.test.mjs"],
      "risk_notes": []
    }
  ],
  "testCommands": ["node --test _SYSTEM/Scripts/yuri-autonomy-runner.test.mjs"],
  "riskNotes": ["No AGENTS-protected surface access requested."],
  "memorySignals": {
    "proposals": [],
    "capsuleUsage": {
      "contextsUsed": [],
      "contextsIgnored": [],
      "contradictionsDetected": [],
      "staleContexts": []
    },
    "recallLog": []
  }
}
```

New worker implementation output should prefer `yuri-patch-v0`. Legacy `unified-diff` output remains accepted for backward compatibility, but it is not the preferred format for new workcell packets.

Patch conventions:

- All anchors (`context_before`, `context_after`, `old_lines`) reference the pre-patch file state. When a single patch contains multiple entries targeting the same file, each entry's anchors describe the original file, not the file after earlier entries are applied.
- `replace_lines` with empty `new_lines` is a valid line deletion. No separate `delete_lines` op exists.
- `test_commands` inside the patch envelope is advisory context for reviewers. `testCommands` on the outer worker output wrapper is what C-137 actually runs.
- `intent` on each patch entry is optional but recommended. It gives Prime a one-line reason to review against the actual diff.
- `line_hint` is advisory. When it disagrees with the anchor location, the anchor wins.
- Harmless extras (`context_before`/`context_after`/`intent` on `create_file`/`delete_file`) are tolerated, not rejected.
- `create_file` must not carry `old_lines`. `delete_file` must not carry `old_lines` or `new_lines`.

C-137 applies worker-produced patch bundles, diffs, or file contents after scope checks. C-137 may make integration repairs, conflict resolution, and final hardening edits, but the target operating model is that Sonnet workers produce the majority of implementation material.

## Navigation Tiers

Not every worker should navigate YURI broadly.

The protocol should make most workers powerful producers with curated context, not independent repo explorers. Broad navigation is expensive, risks protected-surface mistakes, and creates inconsistent assumptions between workers.

| Tier | Roles | Navigation authority |
|---|---|---|
| Root orchestration | C-137 | Full governed navigation through AGENTS read order, context-router, GitNexus, registries, and local verification. Never protected runtime/secrets. |
| Scout navigation | Zeta Alpha Rick | Targeted broad navigation for context packets, dependency DAGs, and file-scope selection. Must report every file read. |
| Supercharge navigation | Rick Prime | Targeted navigation over integrated diff, registries, tests, and impact reports. May edit explicit scoped files during implementation slices; no scope expansion, protected paths, staging, or commit. |
| Builder navigation | Quantum Rick, Maximums Rickimus | Files in packet scope plus explicitly supplied context. Ask for C-137/Scout expansion when blocked. |
| Guardrail navigation | Cop Rick / Nearly Kantian Rick | Files in packet scope, nearby tests, and explicit policy/test references. No broad exploration by default. |
| Registry/docs navigation | Riq IV | Registry, context, schema, and doc paths explicitly named in packet. |
| Synthesis navigation | Simple Rick | Supplied evidence packets and summaries. No repo browsing unless C-137 explicitly asks for a bounded synthesis pass. |

The ideal packet is self-sufficient: goal, files in scope, relevant excerpts, constraints, expected output schema, and validation commands. The better C-137 and Scout prepare the packet, the less worker navigation is needed.

## Planning Ladder

Major sprint, architecture, autonomy, memory, or workcell plans should be built bottom-up. C-137 does not privately finish the whole plan and then ask the other lanes to rubber-stamp it.

Default planning shape:

1. C-137 gives Marcel a rough orientation plan first: goal, why it matters, likely route, major risks, and which lanes should participate.
2. Marcel may correct direction, taste, scope, or priority before worker planning begins.
3. C-137 routes only the needed Sonnet workers, not the whole workcell by default. Over-routing is noise.
4. Sonnet workers assemble roughly 60-70% of the planning substance: decomposition options, local risks, implementation slices, tests, packet boundaries, and missing context.
5. C-137 integrates worker planning into a coherent draft and removes contradictions, overreach, protected-surface risk, and irrelevant volume.
6. Rick Prime receives the integrated draft for high-reasoning refinement, gap hunting, architecture pressure, and failure-mode analysis.
7. C-137 arbitrates the final plan, makes it actionable, names evidence gates, and presents it to Marcel before implementation.

This is an ideology, not a rigid ceremony. Small tactical fixes may stay solo in C-137 when that is faster and safe. High-leverage planning should use the ladder because the goal is to train orchestration, not just produce a pretty plan.

### Process Learning Capture

When Marcel corrects the collaboration process, routing ideology, memory boundary, commit habit, or model-lane behavior, C-137 treats it as a candidate operating-memory update even if Marcel does not explicitly say "remember this."

The capture rule is:

- if the correction affects future behavior beyond the current turn, C-137 proposes the durable memory/protocol surface where it belongs;
- if the correction is low-risk and local to this repo's operating style, C-137 may update existing YURI-owned memory/protocol docs directly and report the changed files;
- if the correction changes authority, protected-surface access, commit behavior, or memory promotion semantics, C-137 must present the intended memory update before treating it as canonical;
- worker lanes can emit process-learning candidates through `memorySignals`, but C-137 remains the capture gate and Marcel remains the owner of canonical preference/authority changes.

### Operator Probes

When Marcel tests system behavior with structural constraints, expected exact outputs, routing expectations, rejection checks, or boundary enforcement, these are operator probes, not ordinary memory.

Memory records what the system should know. Tests verify what the code does. Probes verify what the collaboration does: whether the system follows routing rules, respects protected surfaces, produces expected interaction outputs, or rejects malformed requests when Marcel is the one asking.

Probe lifecycle:

1. Marcel issues a structural check in chat or explicitly tags a constraint with `/probe this`.
2. C-137 captures a probe candidate during process-learning capture or EOT. Candidates include an id, type, trigger pattern, expected outcome, and default severity.
3. Marcel confirms or rejects the candidate. Confirmed probes become active; rejected candidates are discarded.
4. Active probes run only on explicit `/probe-run` or at sprint start when their severity is blocking.
5. Advisory probe failures are reported. Blocking probe failures halt the relevant sprint gate until resolved or waived by Marcel.

Probe types:

- `exact-output`: the system must reply with an exact string.
- `contains`: the response must include a substring or declared pattern.
- `rejects`: the system must refuse, error, or block a specific unsafe input.
- `routes-to`: a task must route to a specific lane, context packet, or gate.
- `behavioral`: a multi-step interaction must follow a declared sequence.

Probe rules:

- Do not treat every casual remark as a probe. Candidates require explicit structural signals such as exact-output wording, declared expected output, rejection checks, route expectations, or `/probe this`.
- Probes are not promoted automatically. Marcel confirmation is required before a candidate becomes active.
- Default severity is `advisory`. Only Marcel can escalate a probe to `blocking`.
- Probes that duplicate existing `node --test` coverage must declare `coveredByTest` and defer to the test runner.
- No probe infrastructure should be created until at least three confirmed probes exist from real sessions.
- When the registry is justified, start with a flat `_SYSTEM/config/probe-registry.json` before creating a separate probe directory tree.

## Output Pool

Worker output goes to a dedicated runtime pool, not directly into source:

```text
_SYSTEM/state/workcell/<runId>/<role>/
  packet.json
  output.json
  captures/
    <captureId>.md
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

Live pane intake uses:

```bash
node _SYSTEM/Scripts/yuri-workcell-capture.mjs \
  --run-id "<run-id>" \
  --role supercharger \
  --tmux-target "%3" \
  --worker rick-prime \
  --model claude-opus \
  --lines 8000
```

This preserves Prime or worker output as `output.json` plus a raw capture under `captures/`. C-137 consumes those artifacts during integration instead of copy-pasting terminal scrollback into source.

## Symbiotic Memory

Prime's rule: workers see projections, emit signals, touch nothing.

The workcell does not create a second memory system. It wraps the existing memory membrane in `_SYSTEM/Scripts/memory-kernel.mjs`: `recallMemory()` for curated recall, `proposeMemoryWrite()` for gated proposals, and `promoteMemoryProposal()` only after Marcel approves. Worker lanes receive read-only memory capsules in their packets. They do not mutate canonical memory, ledger files, proposal queues, or runtime state directly.

This keeps the Ricks symbiotic with YURI memory without letting every worker become a memory authority. C-137 assembles memory context, workers report what helped or contradicted evidence, Simple Rick filters proposal candidates, Marcel decides, and C-137 performs the approved promotion.

### Memory Permissions

| Neutral role | Private overlay | Memory authority |
|---|---|---|
| Orchestrator | Rick C-137 | May call `recallMemory()`, read bounded ledger summaries, submit filtered proposals, record Marcel decisions, and promote approved proposals. |
| Builder | Quantum Rick / Maximums Rickimus | Capsule only. Emits `memorySignals`; no direct recall, write, promote, or evict. |
| Scout | Zeta Alpha Rick | May perform bounded curated recall when C-137 grants `recallAllowed`; must return `recallLog`. No ledger access and no mutation. |
| Guardrail builder | Cop Rick / Nearly Kantian Rick | Capsule only. Reports stale or contradictory memory in `memorySignals`. |
| Registry/docs builder | Riq IV | Capsule only. May draft docs/schema/registry changes about memory protocol, but cannot mutate memory. |
| Synthesis filter | Simple Rick | May receive collected memory signals, perform bounded dedup/contradiction checks, and return filtered proposal lists. No promotion. |
| Supercharger | Rick Prime | Reviews integrated diff and memory usage for false assumptions. Returns findings, not memory writes. |

Implementation lock: add an explicit worker-deny authority such as `sonnet-worker: []` in `MEMORY_AUTHORITY` before worker dispatch tooling exposes any memory wrapper path. The protocol should not rely on the current safe-ish fallback to session scope.

### Memory Capsule

Every worker packet includes a read-only capsule assembled by C-137:

```json
{
  "memoryCapsule": {
    "version": "workcell.capsule.v0",
    "assembledAt": "2026-05-26T14:00:00Z",
    "assembledBy": "orchestrator",
    "goal": "sub-task goal that drove recall",
    "contexts": [
      {
        "id": "feedback_codex_primary_partner.md",
        "path": "_SYSTEM/memory/feedback_codex_primary_partner.md",
        "score": 0.85,
        "content": "truncated curated projection",
        "bytes": 1200,
        "sha256": "abc123",
        "truncated": false
      }
    ],
    "maxContexts": 8,
    "maxBytesPerContext": 4000,
    "maxTotalBytes": 24000,
    "policy": {
      "readOnly": true,
      "proposalAllowed": true,
      "writeAllowed": false,
      "promoteAllowed": false,
      "recallAllowed": false
    },
    "staleness": {
      "checkedAt": "2026-05-26T14:00:00Z",
      "staleContextIds": [],
      "freshnessWindowHours": 24
    },
    "ledgerSummary": {
      "recentEntryCount": 5,
      "lastTimestamp": "2026-05-26T13:45:00Z",
      "scope": "session"
    }
  }
}
```

Capsule rules:

- C-137 assembles the capsule with `recallMemory()` against curated `_SYSTEM/memory/` projections.
- Capsule total should stay at or below 24KB until token-budget telemetry proves a better threshold.
- Scout may receive `recallAllowed: true`, capped at five recall queries per task.
- Builder, guardrail, registry/docs, and Prime packets default to `recallAllowed: false`.
- Capsule context hashes are checked during assembly and again at output collection. Drift is logged as stale memory, not silently trusted.

### Memory Signals

Every worker output includes `memorySignals`. This is the only worker-to-memory channel.

```json
{
  "memorySignals": {
    "proposals": [
      {
        "type": "rule",
        "scope": "project",
        "content": "What should be remembered",
        "confidence": 0.75,
        "reason": "Why this helps future work",
        "tags": ["autonomy", "workcell"],
        "sourceEvidence": ["_SYSTEM/Scripts/yuri-autonomy-runner.mjs:200"],
        "originRole": "builder"
      }
    ],
    "capsuleUsage": {
      "contextsUsed": ["feedback_codex_primary_partner.md"],
      "contextsIgnored": ["memory-core.md"],
      "contradictionsDetected": [
        {
          "capsuleContextId": "feedback_codex_primary_partner.md",
          "contradiction": "Capsule says X but current evidence says not-X.",
          "currentEvidence": "path:line",
          "severity": "high"
        }
      ],
      "staleContexts": [
        {
          "capsuleContextId": "memory-core.md",
          "reason": "References a deleted or renamed entity.",
          "suggestedAction": "update"
        }
      ]
    },
    "recallLog": []
  }
}
```

Worker proposals may request `session` or `project` scope. `permanent` requests from workers are rejected or downgraded before reaching the memory kernel. The orchestrator injects `runId`, `taskGoal`, `capsuleVersion`, and verified `originRole` before any proposal is routed.

### Recall Flow

1. Marcel assigns a task.
2. C-137 routes context, recalls curated memory, and assembles a base capsule.
3. If deep context is needed, Scout receives a minimal packet, performs capped recall, and returns `recallLog` plus context references.
4. C-137 merges Scout findings into role-specific capsules.
5. Workers execute with capsules as read-only context.
6. Workers report useful, ignored, stale, and contradictory capsule context in `memorySignals`.
7. C-137 collects outputs and validates all memory signals before integration.

Scout's `recallLog` is audit evidence. If Prime later finds that memory created a false assumption, the run can trace which recall produced the bad context.

### Proposal And Promotion Flow

1. Workers emit `memorySignals.proposals`.
2. C-137 deduplicates by content hash, validates `type` against `MEMORY_ENTRY_TYPES`, validates scope, rejects `permanent`, and attaches run metadata.
3. Simple Rick receives unique proposals plus the integrated diff and filters for contradiction, duplicate ledger entries, low-confidence noise, and "this belongs in code, not memory" cases.
4. C-137 submits surviving proposals through `proposeMemoryWrite()` with `record: true`.
5. Proposals remain pending until Marcel reviews them through the memory proposal flow.
6. Marcel decides `keep`, `rewrite`, `reject`, or `defer`.
7. C-137 promotes only kept proposals with explicit approval. Rewrites become new proposals. Rejects and defers remain logged.
8. Promoted memory lands under `_SYSTEM/memory/` and is committed only when Marcel authorizes the commit.

There are three gates between worker output and canonical memory: Simple Rick filtering, Marcel decision, and explicit promotion/commit.

### Stale And Contradiction Gates

- Capsule assembly excludes hash-stale contexts and records `staleContextIds`.
- Worker-detected contradictions are routed to Simple Rick with evidence.
- If current code is more authoritative than old memory, Simple Rick can emit an eviction/update proposal. Eviction follows the same Marcel-decision path.
- If memory is more authoritative than a worker claim, C-137 routes the worker output to Prime or re-dispatches with clarified context.
- Cross-worker contradictions are resolved before integration and reviewed during Prime's gap hunt.
- If Prime finds memory-induced false assumptions in the integrated diff, the finding blocks handoff until C-137 either corrects the diff or opens a memory update/eviction proposal.

### Workcell Memory Pool

The runtime pool should store memory artifacts alongside worker outputs:

```text
_SYSTEM/state/workcell/<runId>/
  manifest.json
  decomposition.json
  capsules/
    scout.json
    builder.json
    guardrail.json
    registry.json
  outputs/
    scout.json
    builder.json
    guardrail.json
    registry.json
  memory/
    collected.json
    filtered.json
    proposed.json
    contradictions.json
  integration/
    diff.patch
    conflicts.json
  supercharge/
    findings.json
  verdict.json
```

`_SYSTEM/state/workcell/` must be registered as runtime state before live worker bundles are written. `yuri-closeout.mjs` should summarize workcell memory proposals during EOT when a workcell run is active.

## Output Contracts

Common output:

- `memorySignals`: proposal candidates, capsule usage, contradictions, stale contexts, and Scout recall log.

Builder output:

- `filesInScope`: exact repo-relative files allowed.
- `outputs`: prefer `yuri-patch-v0` structured patch envelopes. Legacy `unified-diff` entries remain accepted for compatibility.
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
3. C-137 assembles role-specific memory capsules.
4. C-137 assigns independent leaf packets to Sonnet workers.
5. Each worker receives a bounded packet: files in scope, memory capsule, expected output contract, validation commands, no commit/push, no AGENTS-protected surfaces.
6. Workers produce typed output bundles under `_SYSTEM/state/workcell/<runId>/<role>/`.
7. C-137 collects all bundles and rejects missing, malformed, out-of-scope, or protected-path outputs.
8. C-137 collects `memorySignals` and routes proposal candidates through Simple Rick before any memory-kernel proposal is created.
9. C-137 detects file collisions and applies bundles in DAG order.
10. C-137 runs the expected local verification.
11. Rick Prime supercharges the integrated diff and memory usage with scoped edit authority for implementation slices.
12. Prime may directly fix issues inside the authorized file scope. Findings outside scope route back to C-137, the responsible worker, or Marcel for expansion.
13. C-137 re-runs verification and presents Marcel with the integrated diff, Prime verdict, tests, memory proposals, and residual risks.
14. Marcel authorizes or holds the commit and decides memory proposals separately.
15. C-137 commits only after explicit authorization.
16. C-137 records closeout and cleans worker runtime bundles when safe.

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

Prime should intensify the integrated result: find what is missing, pressure the architecture, identify hidden regressions, and implement high-ROI improvements inside the explicit authorized scope. Prime is not the default first-pass implementer, but for implementation tasks like this Prime should have edit privileges by default after C-137 has integrated the worker result. C-137 remains responsible for scope control, final verification, commit authorization, and rollback discipline.

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
- `_SYSTEM/Scripts/yuri-workcell-capture.mjs`
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

### Task 3: Worker Packet And Memory Schemas

Goal: lock typed output contracts so C-137 integrates deterministic bundles, not prose.

Processing:

- Scout extracts expected role contracts from this protocol.
- Builder creates packet, output, and memory capsule schemas.
- Guardrail writes validation tests for builder, scout, guardrail, registry, and Prime outputs.
- Registry/docs registers the schema and links it from the autonomy context packet.
- Simple Rick pressure-tests memory proposal fields for filtering and dedup.
- Prime pressure-tests ambiguous fields and missing failure states.
- C-137 integrates and verifies.

Expected artifacts:

- `_SYSTEM/config/schemas/yuri.workcell-packet.v0.schema.json`
- `_SYSTEM/config/schemas/yuri.workcell-output.v0.schema.json`
- `_SYSTEM/config/schemas/yuri.workcell-capsule.v0.schema.json`
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
- Workcell memory capsule/output schemas do not exist yet.
- `MEMORY_AUTHORITY` needs an explicit worker-deny entry before memory wrapper access can be safely exposed to worker tooling.
- Scout recall must be capped, with five recall queries per task as the initial default.
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
