---
name: design-assistant-inbox
description: Use when working from Chrome Design Assistant browser selections, pending visual design requests, or the local design-assistant MCP/HTTP bridge.
---

# Design Assistant Inbox

Use this skill to claim browser-originated design work from the local Chrome Design Assistant bridge and turn it into repo-aware implementation.

## Bridge

Default bridge:

```bash
export DESIGN_ASSISTANT_BRIDGE_ORIGIN="${DESIGN_ASSISTANT_BRIDGE_ORIGIN:-http://127.0.0.1:3004}"
```

MCP server:

```bash
node tools/chrome-design-assistant/mcp-server.mjs
```

HTTP fallback:

```bash
curl "$DESIGN_ASSISTANT_BRIDGE_ORIGIN/api/design-assistant/requests/pending"
```

## Workflow

1. Claim work:

```bash
curl -sS -X POST "$DESIGN_ASSISTANT_BRIDGE_ORIGIN/api/design-assistant/requests/claim-next" \
  -H 'Content-Type: application/json' \
  -d '{"claimedBy":"codex"}'
```

2. Read the returned `packet`. Treat `selection`, `capture`, `instruction`, `constraints`, `targetProjectRoot`, and `designSourceIds` as the implementation brief.

3. Inspect the target repo. If editing symbols in this repo, run GitNexus impact first per project rules.

4. Implement and verify. The extension must never mutate source files.

5. Post progress or final result:

```bash
curl -sS -X POST "$DESIGN_ASSISTANT_BRIDGE_ORIGIN/api/design-assistant/responses" \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"REQ_ID","source":"codex","status":"done","message":"Summary and verification.","artifacts":[]}'
```

6. Mark applied only after code changes are complete and verified:

```bash
curl -sS -X POST "$DESIGN_ASSISTANT_BRIDGE_ORIGIN/api/design-assistant/requests/REQ_ID/applied" \
  -H 'Content-Type: application/json' \
  -d '{"notes":"Applied and verified."}'
```

## Watch Loop

For an active Codex thread, poll pending requests every few seconds:

```bash
while sleep 5; do
  curl -sS "$DESIGN_ASSISTANT_BRIDGE_ORIGIN/api/design-assistant/requests/pending"
done
```

Stop the loop before starting edits. Claim one request at a time.
