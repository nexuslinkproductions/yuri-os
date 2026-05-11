# Cross-Reference Taxonomy

Domain-agnostic tags for lessons, failures, and experiments.

## Canonical Tags

| Tag | Group | Use When | Common Aliases |
| --- | --- | --- | --- |
| `framing_failure` | Reasoning | The work answered the wrong question. | wrong question, question mismatch, misframed, wrong market question |
| `source_of_truth_mismatch` | Evidence | The wrong source was treated as authoritative. | wrong source, source mismatch, resolution source |
| `missing_gate` | Decision | A readiness or approval check was skipped. | approval gate, manual approval, sign-off |
| `late_data` | Signal | The data arrived stale or too late to trust. | stale data, freshness issue, stale signal |
| `threshold_mismatch` | Decision | The cutoff or boundary was wrong. | threshold mismatch, wrong threshold, boundary issue |
| `scope_mismatch` | Scope | The task was too broad, too narrow, or out of scope. | scope creep, too broad, too narrow |
| `ownership_gap` | Coordination | Responsibility or handoff was unclear. | missing owner, handoff gap, routing gap |
| `calibration_drift` | Learning | Confidence drifted away from reality. | calibration drift, brier, overconfident, underconfident |
| `timing_error` | Execution | The action happened too early or too late. | timing error, entry timing, latency issue |
| `tooling_gap` | Execution | A command, path, or tool was missing or broken. | entrypoint missing, command not found, broken command |
| `state_drift` | State | The live state diverged from the expected state. | out of sync, stale state, desync |
| `implicit_assumption` | Reasoning | A hidden assumption was treated as fact. | assumption, assumed, unspoken assumption |

## How To Use

1. Tag the mechanism, not the topic.
2. Reuse the same tag across different domains when the failure shape is the same.
3. Add the lesson to `cross-reference-index.md` after consolidation.
4. Rewrite repeated tags into prevention rules instead of leaving them as raw notes.
