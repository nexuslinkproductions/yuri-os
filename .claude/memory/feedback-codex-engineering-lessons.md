---
name: feedback-codex-engineering-lessons
description: Five defensive patterns from Codex review — boundary-validate, no-silent-fail, -0 norm, strict-true, CLI-test
metadata:
  type: feedback
  tier: working
  scope: claude
  trig: ["codex", "review", "validate", "boundary", "signed-zero", "strict-equals", "cli-test"]
---

RULE  When building any new substrate wrapper script that accepts external input, apply five defensive engineering patterns by default.

WHEN  Writing a new script that exposes a public API or CLI accepting parameters from outside the immediate caller.

DO
(1) Validate at boundaries even when composing trusted primitives — trusted inputs are not the same as trusted callers. Use a normalize/validate function for parameter sets (e.g. normalizeWeights enforcing finite + non-negative + known-keys-only).
(2) No silent zero-failures. Emit a validationWarnings array; refuse to clamp negatives silently. Skipped components must be explicit ({ skipped: true, reason }).
(3) Normalize signed zero. -weight * 0 = -0 in JS. Object.is(0, -0) === false breaks deterministic hashes and assert.equal. Use Object.is(x, -0) ? 0 : x after every rounding step.
(4) Strict-equality on safety-affecting booleans. Use flag === true literal check to prevent allowOverride: "yes" / allowOverride: 1 / allowOverride: {} sneaking through.
(5) Test the CLI surface separately from the API. execFileSync the script with controlled args, assert stdout + exit codes. --help and unknown-arg cases are real bugs in disguise if untested.

DONT  Assume composition of trusted primitives means trusted output. Don't silently clamp invalid input. Don't trust truthy.

WHY   2026-05-28 Codex review of yuri-energy.mjs (Claude skeleton → 28/28 tests after Codex tightening). All five lessons came from that diff.

SEE   _SYSTEM/Scripts/math/yuri-energy.mjs
