---
name: Scripts/ai is a bash script — invoke with bash not node
description: _SYSTEM/Scripts/ai has #!/usr/bin/env bash shebang. Never invoke with node.
type: feedback
originSessionId: de90abf3-c289-46bb-ae93-b788728d46a7
---
`_SYSTEM/Scripts/ai` is a shell script. Always invoke as `bash _SYSTEM/Scripts/ai <subcommand>`.

**Why:** 2026-05-18 — `node _SYSTEM/Scripts/ai auto` threw `SyntaxError: Unexpected identifier 'pipefail'` immediately.

**How to apply:** Before any Scripts/ai invocation, use `bash`. No `node`. No `./`.
