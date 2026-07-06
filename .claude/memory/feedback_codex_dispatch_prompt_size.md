---
name: feedback-codex-dispatch-prompt-size
description: Codex prompts over ~2000 chars as shell args cause stalls. Write to /tmp file and reference instead.
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b08bc260-e2e8-46c4-9433-c4d07a9d70ae
---

Long prompts (4000+ chars) passed inline as shell arguments to `bash _SYSTEM/Scripts/ai codex "..."` cause Codex to stall and require manual pkill.

**Why:** Multiple failed dispatches in 2026-05-20 session. Each stall required kill + re-dispatch cycle, wasting 10+ minutes each time.

**How to apply:** When dispatch prompt exceeds ~1500 chars, write it to `/tmp/shintai-briefs/brief-N.txt` first, then pass via `bash _SYSTEM/Scripts/ai codex "$(cat /tmp/brief.txt)"`. Keep inline prompts tight — file references for anything long.
