---
domain: operations
tags: missing_gate, tooling_gap, state_drift, source_of_truth_mismatch
---

# Yuri readiness gates must be live, not declarative

- What happened?
  - The council audit exposed a false-readiness pattern: tests could pass while build, live memory health, GitNexus status, launchd runtime, and skill registry drift were failing or unverified.
- What was the real question?
  - Can Yuri prove operational readiness from deterministic local commands and canonical memory state?
- What question did I answer instead?
  - Whether a written plan described the right architecture.
- What did I assume without checking?
  - That plan status, unit-test status, and current runtime status were equivalent.
- What signal did I ignore?
  - The audit explicitly separated passing tests from failing build/live DB/GitNexus gates.
- What cost did the miss create?
  - A plan could be promoted while the actual operating substrate was still unsafe.
- What repeated pattern does this resemble?
  - Missing gate, tooling gap, source-of-truth mismatch, and state drift.
- Which canonical tag(s) apply?
  - missing_gate, tooling_gap, state_drift, source_of_truth_mismatch
- Which other domain would this lesson map to?
  - release engineering, agent orchestration, memory governance, model-routing operations.
- What alias or alternate wording should I search for later?
  - false green, audit-to-gate gap, plan without proof, live health missing, readiness drift.
- What rule would have prevented it?
  - A recovery plan cannot be marked complete until the consolidated live health command, tests, build, memory health, and model-review lanes have produced current exit-code evidence.
- Where should that rule live?
  - `_SYSTEM/SELF-IMPROVEMENT/03_GAZE/operational-readiness.md` and `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/prevention-rules.md`.
- What experiment would test the better behavior next week?
  - Run `npm run yuri:health` before and after a recovery task, then verify the weekly consolidation contains at least one promoted lesson when a systemic failure pattern was found.
