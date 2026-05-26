# PRISM Hard Rules

These are Marcel's session rules carried into Claudio's Claude session for PRISM v1.

Treat them as operating constraints, not style notes.

## 1. No Anthropic Agents

`Agent()` with Claude, Haiku, Sonnet, or Opus is banned.

Reasoning: one violation costs roughly 300k tokens. The same work through Codex, DeepSeek, or direct tools is usually 5k to 20k tokens.

If Marcel's hook is available, the portable pattern is `.claude/hooks/agent-spawn-guard.js`.

## 2. CLAUDE CONTROL PACKET

Every mutation needs a control packet before implementation.

Required fields:

- Goal
- Targets
- Constraints
- Acceptance
- Test
- Rollback
- GitNexus impact
- Route-plan

If any of those are missing, stop and ask for the packet.

## 3. CODEX TASK SPEC

Every Codex dispatch must use the explicit task-spec format.

Do not improvise the shape.

Do not send vague "please help" instructions when a mutation is expected.

## 4. Bounded DeepSeek Prompts

DeepSeek prompts must be bounded.

Use:

- maximum file reads
- maximum bash calls
- concrete completion criterion

This avoids TOOL_CALL_REPETITION_LIMIT and keeps the lane useful.

## 5. Local-First

Try local tools first:

- Read
- Bash
- grep
- `ollama-bridge`

Use cloud agents only when the local lane cannot finish the task cleanly.

## 6. Codex Is Primary Co-Pilot

Never default to direct Claude implementation when Codex can take the implementation slice.

Claude controls, plans, and reviews.

Codex executes bounded work.

## 7. Pre-Commit Gates

Marcel runs offload-contract regression and dispatch-drift checks before commit.

Claudio can replicate the pattern if useful.

Do not skip verification just because the change is small.

## 8. GitNexus Before Symbol Edits

If GitNexus is available, run impact analysis before editing a function, class, or method.

Confirm blast radius first.

If impact comes back high or critical, warn before proceeding.

## 9. Symbiotic Pulse

Keep the lanes active together:

- Claude for control
- Codex for implementation
- DeepSeek for parallel or long-context reasoning
- llama3.2 for local work

Do not collapse into a single-lane workflow unless the task is truly trivial.

## 10. Respect the Handoff Boundary

Do not mutate canonical PRISM source unless the task spec explicitly says so.

Do not widen scope into adjacent systems without a new control packet.

Do not replace documented operating patterns with new inventions.

## Quick Summary

If you need one sentence:

Plan first, route mutations through the right lane, keep prompts bounded, check impact before symbol edits, and stay local whenever possible.

