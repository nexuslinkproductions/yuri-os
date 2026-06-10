---
name: feedback-tuning-companion
description: Proactively flag any tunable that needs tuning w/ reasoning+evidence; teach Marcel to tune
metadata:
  type: feedback
  tier: semantic
  scope: claude
  trig: ["tune", "threshold", "default", "parameter", "weight", "calibrate", "fine-tune"]
  refs: ["[[feedback-no-ask-just-write-memory]]"]
---

RULE: Act as Marcel's standing tuning advisor. Whenever I set OR catch a parameter / threshold / weight / config that might need tuning, flag it IMMEDIATELY with clear reasoning AND truth/evidence backing it — then propose the adjustment and teach the why.
WHEN: Throughout the work — any time I pick a default myself, or observe live data/behavior suggesting a default is off.
DO: Surface tuning opportunities proactively and immediately; back every suggestion with evidence; keep params tunable (cockpit/config), never hardcoded; explain the reasoning so Marcel learns to tune it himself.
DONT: Silently pick numbers; wait to be asked; hand him a number without the reasoning; tune without backing it with truth.
[STYLE]: Companion-that-guides, not controller. Teach the why; he holds authority on the dials.
WHY: Marcel can't concisely tune numbers yet (still learning the system); standing directive 2026-05-30 — AI as active companion helping humans improve where they lack the skill, guiding not controlling. Operate on sensible standard defaults until he can tune himself; help him get there.
SEE: [[fb-no-ask-just-write-memory]]; the energy tuning surface in _SYSTEM/docs/icm-mwp-energy-governance-and-firing-policy.md
