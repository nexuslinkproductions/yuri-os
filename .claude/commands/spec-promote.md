---
name: spec-promote
description: Promote a completed spec from specs/active/ to specs/done/YYYY-MM/<slug>/. Detects completion via tasks.md all-checked or frontmatter status: done. Wraps Scripts/spec-archive.mjs.
triggers:
  - "/spec-promote"
  - "/promote-spec"
---

# /spec-promote — Completed Spec Promotion

When invoked with a spec reference or no argument, execute this workflow:

## Phase 1 — Identify

Scan `specs/active/` for completion candidates:

```bash
node Scripts/spec-archive.mjs --dry-run --json
```

Use the dry-run JSON output to identify specs that are complete by either:

- all tasks in `tasks.md` marked `- [x]`
- frontmatter `status: done`

If the user provided a slug, treat it as a filter and only surface matching candidates.

## Phase 2 — Confirm

Print the candidate slugs and each candidate's `tasks.md` completion state to the user.

If no candidates are found, abort and report that nothing is promotable.

If more than one candidate is found, require the user to choose the slug before proceeding.

Reference the trigger discipline rule in `.claude/rules/skill-creation.md`:

- slash command routing must remain explicit
- do not imply `/promote-spec` support unless the command file exists and matches the declared triggers

## Phase 3 — Promote

Promote the selected spec with:

```bash
node Scripts/spec-archive.mjs --execute
```

If the user named a specific slug, pass the optional slug filter supported by the archive script.

Do not perform any live promotion until Phase 2 confirmation is complete.

## Phase 4 — Verify

Confirm the move succeeded and print the final archive path.

Success format:

```text
✅ Promoted <slug> to specs/done/YYYY-MM/
```

Verify that the spec now resides under the expected `specs/done/YYYY-MM/<slug>/` archive path.

## Authority Boundaries

- This command is an advisory adapter only.
- It wraps `Scripts/spec-archive.mjs` and does not override the offload-contract.
- It follows the same spec-* command boundary as the other slash commands in `.claude/commands/`.
- It does not mutate specs directly; archive movement is delegated to the existing archive script.
- Trigger discipline follows `.claude/rules/skill-creation.md`: keep slash command triggers explicit and file-backed.

## Example Invocation

```text
/spec-promote add-health-check-endpoint
```

Expected flow:

1. Identify completed specs in `specs/active/`
2. Confirm the candidate slug and completion state
3. Execute archive promotion
4. Verify the move and report the destination path
