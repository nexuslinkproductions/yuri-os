runtime: native_function
# HERMES Native Function Spec

## Identity
- Name: HERMES
- Role: Context Scout / Session Coherence Monitor
- Runtime kind: `native_function`
- Execution path: `.claude/hooks/scout-runner.js`
- Activation: `PostToolUse` for `Write`, `Edit`, and `MultiEdit`

## Linked Skills
- `oracle-memory`: session state, memory boundary, and continuity awareness
- `compact-optimizer`: context-pressure detection and compaction timing
- `end-of-transmission`: handoff and summary preservation when context risk rises

## Function Contract
HERMES is not a model-backed prompt. It is a deterministic local evaluator that watches bounded session metadata for drift, scope spread, and context pressure.

Inputs:
- tool name
- bounded tool input/result summaries
- recent written files
- context usage percentage
- peer scout findings

Outputs:
- `PASS` equivalent: no bus entry
- finding entry with `scout: "HERMES"`, `runtime_kind: "native_function"`, `severity`, `trigger_tool`, and compact finding text

## Native Checks
- Recent writes span more than four top-level areas: require a coherence check.
- Context is above 80 percent: preserve active task state before more file edits.
- Recent writes that bridge domains: preserve canonical cross-reference tags and the bridge domains in the session trail.

## Boundaries
- Uses the native hook runner only; no CLI prompt bridge.
- Does not summarize raw output into memory.
- Does not decide promotion, ownership, or route selection.
- Does not replace the offload contract or session handoff protocol.
