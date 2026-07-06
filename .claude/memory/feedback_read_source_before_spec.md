---
name: feedback-read-source-before-spec
description: "When cloning a visual design or architecture, read the target source first — never spec from a screenshot alone."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b08bc260-e2e8-46c4-9433-c4d07a9d70ae
---

Assumed blessed full-screen was the right approach for Kagami TUI because it "looked like" Claude Code CLI. Held that wrong assumption through 3 failed Codex dispatches before reading Hermes source (cli.py), which showed `full_screen=False` in 5 minutes.

**Why:** 3 broken TUI iterations, each requiring kill + re-dispatch. Wasted ~40 minutes on wrong architecture.

**How to apply:** Before speccing any "clone X" implementation — read X's source code first. grep for the key architectural decision (e.g., `full_screen`, `render`, `screen.render`). One targeted read prevents multiple failed build cycles.

[[feedback-codex-dispatch-prompt-size]]
