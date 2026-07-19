---
name: activate-yuri-skills
description: Recall and load the minimal canonical YURI skill set before every substantive YURI task, including implementation, analysis, research, planning, review, or verification. Do not use for trivial acknowledgements or status-only replies.
---

# Activate YURI Skills

1. Express the substantive task as a concise recall query.
2. Run `node _SYSTEM/Scripts/skill-recall.mjs "<task>" --top 12 --json`.
3. Select the smallest relevant set from the returned results. Exclude `activate-yuri-skills`; it is already active.
4. For every selected result, read its returned `path` file completely from beginning to end before acting. If that governed path is sparse-absent, run `node _SYSTEM/Scripts/skill-recall.mjs --show <governed-id>` and read the complete verified output. Do not substitute `yuri-skill-loader.mjs --skill`, because that command returns only a preview.
5. Treat `sourceClass: labgated` results as metadata discovery only. `ownerAuthorizedDiscovery: true` never authorizes runtime actions; obtain explicit current-task authorization before any offensive or dual-use action.
6. Follow the selected canonical source instructions within the YURI authority and protected-surface contracts, then perform the task.
