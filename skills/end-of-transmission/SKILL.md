---
name: end-of-transmission
description: "Lean YURI closeout checkpoint for session continuity, evidence correction, and next-action handoff. Manual by default; no automatic model fanout."
triggers:
  - "end of transmission"
  - "/eot"
  - "/eot deep"
  - "/end-of-transmission"
  - "move to a new session"
  - "handoff to new session"
---

# End of Transmission

EOT is still useful, but it should no longer be a heavy ritual or automatic worker swarm.

Use it as a deliberate closeout checkpoint when the session needs continuity, a corrected record, or a clean next-session boot packet. It is a nice-to-have after small turns and a must-have only after long, risky, multi-lane, or memory-affecting work.

## Current Verdict

Keep EOT as a YURI closeout protocol, not as the old NUDIMMUD full-auto pipeline.

Remove these early-dev assumptions:

- no automatic micro-EOT based only on context percentage or tool-call count
- no Haiku, Sonnet, or fresh Claude worker spawning for EOT
- no mandatory 9-phase reflection ceremony for ordinary work
- no `.claude/eot/` as the default artifact home
- no write-heavy self-improvement mutation without verified local evidence

Preserve these useful pieces:

- corrected record of what happened
- tests/checks actually run
- changed files and unresolved risks
- useful failures and repeated patterns
- next-session boot packet
- optional DeepSeek synthesis when the session is large enough to justify it

## Trigger Policy

Manual triggers:

- `/eot`
- `/eot deep`
- `/eot --deepseek`
- `/end-of-transmission`
- `end of transmission`
- `move to a new session`
- `handoff to new session`

Automatic behavior:

- Do not auto-run model-backed EOT.
- It is acceptable to emit a lightweight suggestion that EOT may be useful after a long or risky session.
- Auto-run deterministic read-only closeout only when a harness command explicitly requests it.

## Execution Shape

Default mode is deterministic and read-only:

```bash
node _SYSTEM/Scripts/yuri-closeout.mjs
```

Scoped validation:

```bash
node _SYSTEM/Scripts/yuri-closeout.mjs --path _SYSTEM/Scripts/example.mjs
```

DeepSeek mode is optional:

- Trigger it explicitly with `/eot deep` or `/eot --deepseek`.
- Use the persistent DeepSeek lane when available.
- Use it for synthesis, contradictions, and next-session boot packet refinement.
- Keep Codex/main as verifier and commit lane.

Claude rule:

- Do not use Claude for EOT by default.
- Do not use Claude headless prompt/print modes, SDK calls, or fresh no-session prompt calls.
- If Claude is relevant, it must be through the continuous tmux/PTY lane and only for bounded advisory review, not closeout authority.

## Artifact Policy

Default runtime and closeout artifacts belong under YURI-owned state:

- `_SYSTEM/state/eot/`
- `_SYSTEM/state/eot/continuous/`
- `_SYSTEM/state/eot/_archive/`
- `_SYSTEM/state/kagami-control/events.jsonl`

Durable promoted learnings belong in the correct registry-backed surface:

- `_SYSTEM/memory/` for verified memory projections
- `_SYSTEM/docs/` for architecture or policy
- `skills/` for reusable skill changes
- `_SYSTEM/research-archive/` for evidence intake

Do not write new default EOT artifacts under `.claude/eot/`.

## Closeout Checklist

1. Freeze new feature work.
2. Read the current git status and scoped file status.
3. List changed files without staging unrelated runtime noise.
4. Verify important completion claims against files, tests, or command output.
5. Record tests/checks actually run.
6. Name failures, partials, and remaining risks plainly.
7. Extract at most three reusable learnings.
8. Propose memory/skill/doc updates only when evidence is strong.
9. Produce a next-session boot packet with first actions.

## User-Facing Output

Prefer readable Markdown over XML.

Use this shape:

```text
EOT Checkpoint

What changed:
- ...

Verified:
- ...

Still open:
- ...

Worth remembering:
- ...

Next boot:
- ...
```

Keep the voice alive. EOT is a landing strip, not a tax form.

## Boundaries

EOT cannot override:

- protected paths
- secret handling
- no-push/no-commit rules
- cybersecurity authorization rules
- local truth requirements
- user interruption

If a write would be unsafe, emit a patch proposal or a TODO instead of mutating.

## When Not To Use EOT

Skip EOT when:

- the turn was a simple answer
- no files changed
- no memory-worthy learning happened
- the next action is already obvious
- running it would be ceremony without signal

Use a one-paragraph closeout instead.

## When EOT Is Worth It

Run EOT when:

- the session involved commits, release gates, or arbitration
- multiple lanes participated
- context is about to be compacted or reset
- the user asks to pause/resume later
- a mistake or correction should become durable behavior
- new architecture or memory rules were created

## Session Note

2026-05-26: EOT was simplified from early full-auto reflection into a YURI closeout checkpoint. The protocol now favors deterministic local evidence, optional DeepSeek synthesis, YURI-owned runtime state, and conversational handoff output.
