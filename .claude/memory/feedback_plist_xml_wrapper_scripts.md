---
name: plist-xml-wrapper-scripts
description: "Never put shell operators (&, |, >) in plist ProgramArguments strings — use wrapper .sh scripts"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2ab87dd8-f649-4816-bbd0-4565aab40a22
---

Never put shell syntax (`2>&1`, `|`, `>`) inside `<ProgramArguments><string>` tags in launchd plists.

**Why:** `&` must be `&amp;` in strict XML. `launchd` uses a lenient parser and loads the agent fine, but `plutil -lint` fails — so health-aggregator can't read the plist schedule or `StandardOutPath`, and the agent shows "on-demand / no last-run" in the dashboard forever. This caused 3 silent failures this session (gitnexus-weekly, independence-check, learning-score).

**How to apply:** When writing any plist that needs shell redirection, create a `_SYSTEM/Scripts/<agent-name>.sh` wrapper using the `eot-refresh.sh` pattern (export PATH, export HOME, cd REPO_ROOT, exec node/npx). The plist ProgramArguments just calls `/bin/bash /path/to/wrapper.sh`. After writing, always run `plutil -lint <plist>` — fail hard on non-zero.
