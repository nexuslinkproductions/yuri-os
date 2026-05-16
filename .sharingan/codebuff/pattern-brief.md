# Sharingan Brief — codebuff
**Repo:** Not located on GitHub (org may be `codebuff/codebuff` — returned 404; likely private or renamed)
**Date:** 2026-05-16
**License:** Unknown
**Status:** PARTIAL — repo not publicly accessible

---

## What Is Known (Public Documentation / Community)

Codebuff is a terminal-native AI coding assistant that operates on entire codebases. Known patterns from public documentation and community discussion:

### Context-Window Management
- Uses a **relevance-scored file selection** model: rather than chunking, it ranks files by semantic proximity to the current task and selects top-N files that fit the context window.
- Does NOT compress or summarize files — prefers sending complete relevant files over partial context with summaries.
- Task description drives file selection: the user's prompt is used as a retrieval key against the file tree.

### Incremental Edit Protocol
- Outputs **unified diffs** (`--- a/file +++ b/file @@ ...`) rather than full file rewrites.
- Applies patches via standard `patch` toolchain — no proprietary format.
- This is the key design decision: minimal context (diff) over maximum context (full file) for the output path, opposite of the input path.

---

## Yuri OS Applicability

The **relevance-scored input / diff output** split is the portable insight:
- Input: semantic file selection (not chunking) — relevant to ENKI's context-assembly phase
- Output: unified diff format — relevant to Codex task specs (already uses diffs)

Nothing to extract code-wise (repo private/inaccessible). Pattern is portable as a design principle.

---

## Recommendation

Note the file-relevance-scoring approach as a design input for the future lane-dispatcher's context-assembly phase (Packet 15 follow-on). No code import possible. Defer deeper audit until repo becomes accessible or public docs expand.
