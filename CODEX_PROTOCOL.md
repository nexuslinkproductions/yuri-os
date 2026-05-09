# CODEX_PROTOCOL (compat stub — canonical rules live in OPERATOR_PROTOCOL.md)

INHERIT: ./OPERATOR_PROTOCOL.md

## CODEX-SPECIFIC ROUTING

- **Automatic Routing:** Every non-trivial request routes through `Scripts/offload-contract.mjs` before execution. No `btw`, `/tokenmaxxing`, or `@lane` trigger is required.
- **Compatibility Aliases:** `btw`, `btw offload this`, `/tokenmaxxing`, and explicit `@lane` mentions still work, but only as manual overrides for the same contract.
- **Execution Plans:** Use `./Scripts/ai route-plan "<request>"` when a Codex or external harness needs the lane, lifecycle scenario, DeepSeek advisory decision, and learning capture shape in JSON.
- **DeepSeek Quality Gate:** DeepSeek V4 Flash/Pro are advisory only; Codex remains executor, verifier, and final authority. Skip DeepSeek for clear low-risk execution tasks, and discard outputs that lack exact evidence, conflict with local proof, expand scope, or propose forbidden operations.
- **Skills-First Workflow:** EVERY user request follows: Request → Load Skills → Gather Context → Execute. Skills are the primary cognitive extensions of the NUDIMMUD system.
- **Direct Feedback Protocol:** Truth over momentum. Challenge weak assumptions. Name regressions and hidden costs. Evidence-based agreement only.
