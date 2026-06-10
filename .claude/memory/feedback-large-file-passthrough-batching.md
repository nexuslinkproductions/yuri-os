---
name: feedback-large-file-passthrough-batching
description: Large single-file passthrough: small independent batches + single-shot python verify; macOS-safe flags; verify applied-not-assumed
metadata:
  type: feedback
  tier: semantic
  scope: claude
  trig: ["passthrough", "large html", "redesign", "verify file", "big edit", "bsd macos flags"]
  refs: ["[[feedback-multi-lane-parallel]]", "[[feedback_codex_dispatch_prompt_size]]"]
---

RULE | On big single-file passthroughs (200KB+ HTML, long stylesheet swaps), do NOT fire 10+ tool calls in one parallel block — one failing call (e.g. macOS `cat -A`, GNU-only flags) cancels the whole batch and chokes the channel for minutes.
WHEN | Editing/verifying one large file; macOS BSD coreutils; redesign/refactor passthrough; mixed Read+Edit+Bash batches.
DO | Batch only TRULY independent, low-risk calls. Put verification in ONE `python3 - <<PY` heredoc that prints a compact report (writes to /tmp file, then Read it). Prefer macOS-safe tools: `od -c` not `cat -A`; avoid `grep -P`/`grep -z`. Verify each structural Edit (e.g. <details> balance) right after it lands, not at the end.
DONT | Chain `sleep` to wait for a stuck channel (it's hook-blocked); don't re-Read a file the Edit tool already confirmed; don't assume an Edit in a cancelled parallel batch applied — re-grep for it.
STYLE | Tight, deterministic, single-shot verification. Caveman output.
WHY | Parallel-batch cancellation is all-or-nothing; BSD vs GNU flag drift silently fails; the verification-before-completion + adversarial-verification skills demand re-checking applied state vs assumed state.
SEE | skills/adversarial-verification, skills/verification-before-completion; .claude/rules/research_pipeline.md (BSD-safe tooling)
