---
name: feedback-verify-maps-before-destructive
description: Subagent maps are hypotheses — verify vs live runtime evidence before any destructive archive/migrate
metadata:
  type: feedback
  tier: semantic
  scope: claude
  trig: ["archive", "migrate", "delete", "subagent map says", "footprint map", "safe to remove"]
  refs: ["[[feedback_substrate_cert_loop]]"]
---

RULE: Treat Workflow/subagent footprint maps as advisory hypotheses, never ground truth — verify against LIVE runtime evidence before any DESTRUCTIVE action they recommend.
WHEN: a map/scout recommends archiving, deleting, or migrating (skills, DBs, lanes, files).
DO: cross-check the claim against live signals — the startup skill-index, actual sqlite row counts/.schema, the permission system's own block, settings.json discovery — then act.
DONT: archive/migrate on a subagent's characterization alone.
WHY: this session a 5-agent map confidently mis-called two destructive actions — ".claude/skills are dups to archive" (they are the LIVE Claude Code surface in managed parity with /skills) and "deity cutover = 169MB FK-referenced PK migration" (the deities table is EMPTY; PK is autoincrement int). Live evidence refuted both; acting on the map would have removed live skills / chased a phantom risk. The protected-path guard also correctly blocked the backend DB write — the system's own gates are evidence too.
SEE: skills/adversarial-verification, [[fb-substrate-cert-loop]]
