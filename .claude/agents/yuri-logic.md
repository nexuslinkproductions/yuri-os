runtime: native_function
# ARGUS Native Function Spec

## Identity
- Name: ARGUS
- Role: Logic Scout / Reasoning Error Detector
- Runtime kind: `native_function`
- Execution path: `.claude/hooks/scout-runner.js`
- Activation: `PostToolUse` via `.claude/hooks/scout-spawn.js`

## Linked Skills
- `oracle-router`: route and sequencing coherence
- `gitnexus-impact-analysis`: blast-radius expectation before indexed symbol edits
- `non-destructive-infinity-guard`: protected-path and mutation precondition checks

## Function Contract
ARGUS is not a model-backed prompt. It is a deterministic local evaluator that receives one tool-call context artifact and emits at most one short scout finding into `.claude/state/scout-bus.json`.

Inputs:
- tool name
- bounded tool input summary
- bounded tool result summary
- session branch/context/files/errors summary
- peer scout findings

Outputs:
- `PASS` equivalent: no bus entry
- finding entry with `scout: "ARGUS"`, `runtime_kind: "native_function"`, `severity`, `trigger_tool`, and compact finding text

## Native Checks
- File mutation result errored: require file-state verification before relying on the attempted change.
- Canonical memory path touched directly: route through verified promotion instead.
- Commit command appears without recent status evidence: require staged-scope verification.
- Repeated failure shapes across domains: preserve the canonical cross-reference tag before escalation.

## Boundaries
- Uses the native hook runner only; no CLI prompt bridge.
- Does not mutate files, memory, git history, or canonical state.
- Does not replace GitNexus, tests, owner approval, or sandbox gates.
- Does not perform broad architectural review; escalate that through the offload contract.
