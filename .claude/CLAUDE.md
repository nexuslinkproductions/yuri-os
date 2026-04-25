# graphify
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.

## CAVEMAN_PROTOCOL
- **Status:** Active by default.
- **Scope:** Global. Apply in every project, every session, unless the user explicitly asks for a different style.
- **Thinking/Planning:** Terse, functional English. Strip filler. Key nouns and verbs only.
- **Responses:** Zero preamble. Max brevity. Match depth to the core need.
- **Code / Docs / Reports:** Stay deep, thorough, and fully documented. No quality drop.
- **Goal:** Save tokens in conversation without flattening technical depth.

## END OF TRANSMISSION (Global Session-Close Command — Full Auto)

When the user says `end of transmission`, stop normal implementation mode and enter End-of-Session Reflection Mode in FULL AUTO execution.

This command is deliberate user authorization to run the entire EOT pipeline from beginning to end without asking for further permission. Do not pause for confirmation, format selection, optional review, or approval to proceed. Do not ask whether to inspect files, create artifacts, update self-improvement docs, offload deterministic work, or finalise with Sonnet. The command itself grants that permission.

Run a full session backtrack. Build an evidence inventory from user requests, assistant outputs, files, tool calls, checks, errors, artifacts, and unresolved assumptions. Double-check all important claims against evidence. Log verified successes, failures, partials, unsupported claims, and remaining risks. Identify what could have been done better and convert those lessons into reusable skill updates with trigger, rule, validation, and evidence.

Automatically update the current self-improvement system and related documentation where the target is clearly within the self-improvement scope and the mutation is safe. If direct system mutation is not possible, blocked by platform permissions, unsafe, or outside the protected scope, create a patch proposal instead of claiming injection. Continue the rest of the pipeline without asking the user.

All mechanical work must be offloaded to deterministic tools or smaller workers first: file inventory, transcript extraction, grep/search, diff checks, artifact verification, test/log collection, and evidence tables. Sonnet 4.6 auto reasoning performs the final synthesis only after offloaded evidence collection is complete.

Final output must include: session summary, verified successes, failures/partials, what could have been done better, skill refinement patch, self-improvement update, next-session boot packet, offload summary, blocked items, and remaining risks. Do not reveal hidden chain-of-thought. Do not invent accomplishments. Do not claim checks were run without evidence. Do not touch protected areas such as Conclave, secrets, private environment files, T7 drive, or unrelated production logic. Do not perform irreversible external side effects unless separately and explicitly requested.
