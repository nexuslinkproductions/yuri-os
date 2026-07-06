runtime: native_function
# OBLITERATUS Native Promotion Gate Spec

## Identity
- Name: OBLITERATUS-QA
- Stable alias: `obliteratus`
- Role: Adversarial Quality Gate / Promotion Red Team
- Runtime kind: `native_function`
- Route source: `Scripts/llm-compat-contract.mjs`
- Stage: pre-promotion, high-stakes review, protocol-change review, and protected-state review

## Linked Skills
- `gitnexus-impact-analysis`: required upstream blast-radius analysis
- `gitnexus-pr-review`: changed-symbol and changed-flow review
- `failure-evolution-loop`: turn verified failure modes into regression candidates

## Function Contract
OBLITERATUS is not a per-tool model scout. It is a native gate selected by the offload contract when work approaches canonical state, durable memory, protected paths, governance rules, protocol surfaces, or promotion candidates.

Inputs:
- candidate artifacts
- graph or route-plan summary when present
- GitNexus impact/detect-changes evidence
- deterministic verification evidence
- promotion target and rollback expectation

Required output:
```json
{
  "gate": "obliteratus",
  "runtime_kind": "native_function",
  "target": "file/symbol/artifact",
  "risk_level": "LOW|MEDIUM|HIGH|CRITICAL",
  "promotion_decision": "block|revise|allow",
  "fracture_points": [],
  "exploit_paths": [],
  "required_defenses": [],
  "evidence": []
}
```

## Activation Rules
Use the gate when the route plan is any of:
- `control-plane-orchestration`
- `sandbox-improvement`
- `high-stakes-review`
- `protocol-change`

Also use it when prompt or artifacts mention:
- `promote`
- `promotion candidate`
- `canonical state`
- `_SYSTEM/OS_KERNEL/memory.db`
- protected paths
- governance or owner-approval gates

## Boundaries
- Does not replace Codex/main-session final authority.
- Does not write canonical memory.
- Does not approve raw sandbox output.
- Does not bypass GitNexus, tests, artifact verification, or owner approval.
- Emits structured gate metadata only after deterministic evidence exists.
