# YURI OS Shintai Member Notes

Date: 2026-05-21
Scope: remaining YURI OS supercharge waves and final Waves 0-2 audit.

## Scoring

- DIRECT_PATCH: output can be turned into local edits with minimal arbitration.
- NEEDS_ARBITRATION: useful signal, but Codex/main must correct stale assumptions or narrow scope.
- REJECT_STALE: contradicted by current source, already implemented, or based on invented policy.

## 2026-05-21 Remaining Waves Deployment

Status: implemented from consensus/direct-patch output; final Wave 0-2 no-timeout recheck still required.

| Member | Lane | Observed result | Usability | Notes |
|---|---|---|---|---|
| Codex Architect | gpt-5.5 | Identified sandbox loopback false-failures, release evidence gap, report/member-notes gap, and final audit order. | DIRECT_PATCH | Used for loopback helper, release gate `ENV_BLOCKED` classification, durable evidence writer, and final report wiring. |
| DeepSeek Reasoner | deepseek-v4-pro:max-reasoning | Converged on Wave 6 `/status` + `/goal`, Wave 7 release JSONL, post-dispatch evidence rehash, and documented residual memory/rail limits. | DIRECT_PATCH | Used for Rick status shape, goal checklist, release evidence schema, and Shintai post-dispatch validation. |
| Claude Opus Audit | claude-opus-4-7-audit | Caught exact `PERSONA: Rick` packet-anchor requirement, stale/no-tools wording, branch/SHA drift risks, and Qwen Coder contamination. | NEEDS_ARBITRATION | Persona anchor was applied. Broader SHA pin and roster-size gate remain audit follow-up. |
| Nemotron Orchestrator | nvidia-nemotron-120b | Pressed NeMo execution sub-rails and health-preflight correctness. | NEEDS_ARBITRATION | Useful for final Wave 2 audit, but timeout-cap and rail refactor were deferred to avoid mixing new rail architecture into Wave 6/7. |
| Mistral Large Auditor | nvidia-mistral-large | Stressed durable release evidence, long-run status, and memory recall as residual risk. | NEEDS_ARBITRATION | Release evidence was used. Express `/status` and embedding recall proposals were rejected as wrong scope/current shape. |
| Qwen Coder Specialist | nvidia-qwen-coder | Output became contaminated with duplicated declarations and unrelated `test.txt` prompt bleed. | REJECT_STALE | No patch text used. The failure is recorded as evidence to filter contaminated Shintai output. |
| GLM Long-Document Auditor | nvidia-glm | Skipped by health preflight during this run. | REJECT_STALE | No silent replacement; absence recorded. Retest later after lane health improves. |
| Qwen3-Next Code Specialist | nvidia-qwen3-next | Focused on PTY/output-rail safety, stream batching, resize, and terminal corruption tests. | NEEDS_ARBITRATION | Valid future Wave 8 output-rail work; not applied here because current slice is release evidence and Rick status. |
| Mistral Medium Reviewer | nvidia-mistral-medium | Reinforced release evidence directory and quarantine/health durability; some offload-runner claims were already implemented. | DIRECT_PATCH | Used for release-gate artifact location and machine-readable evidence shape. |

## Operator Notes

- Slow lane behavior is tracked as latency evidence, not failure.
- GLM was skipped here by health evidence, not manually replaced.
- Codex/main remains the only implementation and commit authority.
- Qwen Coder output poisoning must be treated as a hard rejection signal in future Shintai synthesis.
