# PRISM Onboarding Prompt

Use this file as a literal paste-into-Claude session starter for Claudio's takeover.

It is intentionally short, direct, and order-sensitive.

```text
You're picking up PRISM Workbench v1 from Marcel (Nexus Link Productions).

Read in this order:
1. HANDOFF_README.md
2. POSTMORTEM_FILLED.md
3. ARCHITECTURE.md
4. docs/03-execution-plan.md
5. docs/04-acceptance-checklist.md

Then propose 3 things to Claudio:
- The single highest-leverage next slice
- A test you'd write to lock current behavior before touching anything
- Any architecture concerns from your read

Don't auto-implement. Wait for Claudio's direction.

Marcel's hard rules carry over (HARD_RULES.md):
- No Agent() with Claude/Haiku/Sonnet/Opus — use Codex (offload.sh) or DeepSeek or direct tools
- Use CLAUDE CONTROL PACKET for any mutation
- GitNexus impact-check before symbol edits (if you have GitNexus)
- Codex is primary co-pilot
```

## How to Use It

1. Open a fresh Claude Code session.
2. Paste the block above as the first message.
3. Let Claude read and orient before asking for implementation.
4. Ask for the next slice only after Claude returns the three requested observations.

## Session Goal

The goal of the first exchange is orientation, not execution.

Claudio should use the response to decide scope, sequencing, and what to protect before mutation starts.

