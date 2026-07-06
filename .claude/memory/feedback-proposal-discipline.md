---
name: feedback-proposal-discipline
description: When drafting YURI memory proposals: omit WHY when its only content is the originating incident; durable bodies don't need their origin
metadata:
  type: feedback
  tier: semantic
  scope: all
  trig: ["propose", "proposal", "memory-kernel", "why", "incident", "brittle", "timeless", "policy-body"]
  refs: ["[[fb-codex-engineering-lessons]]", "[[ref-memory-format-research]]"]
---

RULE  When drafting YURI canonical memory proposals: omit the WHY section if its only content is "this rule was written because of incident X on date Y." The originating event lives in the proposal ledger and the decision log; durable rule bodies do not need to remember their origin.

WHEN  About to write a new memory proposal via memory-kernel.mjs propose.

DO    Include WHY only when the justification is a timeless principle (e.g. "energy is irreplaceable when the operation is irreversible" — applies to all future cases). Keep RULE + WHEN + DO + DON'T + STYLE as the durable scaffold; SEE for stable policy/skill anchors only.

DONT  Anchor WHY to a date, an incident, a session, a specific lane's rewrite, a commit hash, or a count. Don't bake the originating story into operating policy.

STYLE  Operating-policy voice for durable rules. The memory is a tool the system uses, not a record of why the tool was made.

SEE   skills/adversarial-verification/SKILL.md · _SYSTEM/Scripts/memory-proposal-autopilot.mjs · CLAUDE.md v3 conventions
