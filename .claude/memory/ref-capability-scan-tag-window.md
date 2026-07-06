---
name: ref-capability-scan-tag-window
description: "capability-scan.mjs only parses 12 lines past @capability — keep @exports inside the tag cluster, prose after, or exports silently drop to []."
metadata:
  node_type: memory
  type: reference
  tier: 3
  scope: editing @capability-tagged mechanism headers / capabilities.json reconcile
  trig: "adding/moving @capability @serves @does @use @exports tags; capabilities.json drift on exports:[]; pre-commit capability registry STALE"
  refs:
    - feedback-nano-swarm-orchestration
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

FACTS:
- capability-scan.mjs parse() scans only `j < Math.min(i + 12, lines.length)` lines after the `// @capability:` line (capability-scan.mjs:39). Tags beyond i+11 are NOT parsed.
- The loop also `break`s at the first non-`//` non-empty line (left the comment block, :46) — but a `//` prose block does NOT break it; it just consumes window slots.
- So a long `//` prose block BETWEEN the tags and `@exports` pushes `@exports` out of the 12-line window → `exports: []` silently, even though the tag is present and correct.

IMPLICATION:
- Keep the tag cluster CONTIGUOUS and FIRST: `@capability` → `@serves` → `@does` → `@use` → `@exports`, THEN any prose (HYDRATION/notes). Never interleave multi-line prose before `@exports`.
- Born 2026-06-16: a 1-line HYDRATION note in nano-dispatch-gated.mjs grew to 8 lines, pushing `@exports` to i+12 → scan produced `exports:[]` → pre-commit "capability registry STALE". Fix was reorder (move @exports up), not a scan change.
- Reconcile cap drift via `node _SYSTEM/Scripts/capability-scan.mjs` then commit capabilities.json WITH the source change when the diff is ONLY your entry (owner: reconcile PROPERLY, not --no-verify). --no-verify is ONLY for a genuinely parallel session's unrelated cap drift.

SEE: [[feedback-nano-swarm-orchestration]]; rule .claude/rules/capability_first.md (the @-tag contract).
