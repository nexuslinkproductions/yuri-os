---
name: claude-codex-capability-bridge
description: Use when a Claude lane needs help from Codex-developed plugins, plugin-provided skills, app connectors, MCP tools, browser/design/cloud/GitHub capabilities, or Codex-only workflow knowledge inside YURI-OS-MUSUBI.
scope: harness
invocation: ability
---

# Claude Codex Capability Bridge

Use this skill to let Claude benefit from Codex capability without making Codex plugins raw Claude authority.

For categorized Claude output, pair this skill with:

```text
skills/claude-output-lane/SKILL.md
```

## Core Rule

Codex plugins are capability lanes. YURI remains the control plane.

Before plugin-derived capability is used or routed into Claude:

```bash
node _SYSTEM/Scripts/context-router.mjs "<task>"
```

Then load the selected YURI context and follow protected-path, mutation, registry, verification, and commit rules.

## Capability Classes

### 1. Instruction Capsule

Use for plugin skills, docs, checklists, examples, and best-practice guidance.

Allowed shape:

- Codex summarizes the relevant plugin skill or official docs into a bounded packet.
- Claude uses the packet as advisory context.
- Codex/main verifies any resulting claim or plan before trust.

### 2. Draft Artifact Lane

Use when Claude should advise by writing a draft.

Allowed only when the packet explicitly says:

- `DRAFT_ARTIFACT_ALLOWED`
- exact path or directory
- artifact class, such as `report`, `proposal`, `review`, or `diff-note`
- authority label, usually `proposal_only`
- output sublane, using the Claude output lane taxonomy

Draft artifacts may be useful advisory output. They are not final authority until Codex/main integrates or accepts them.

Without `DRAFT_ARTIFACT_ALLOWED`, Claude should return the draft in the TUI response instead of writing a file.

### 3. Diff Proposal Lane

Use when source edits are not authorized but implementation thinking is needed.

Allowed shape:

- unified diff proposal
- file-scope list
- verification checklist
- risks and unknowns

No repo mutation unless the packet explicitly grants source edit scope.

### 4. YURI Wrapper Lane

Use when a Codex plugin capability has a safe local wrapper or YURI script.

Allowed shape:

- Claude requests the wrapper by name and reason.
- Codex/main or a YURI harness runs it.
- Results return as evidence in a bounded packet.

Do not let Claude call credentialed, browser, cloud, GitHub, design, or deploy tools directly unless that route has a YURI-owned wrapper and the task explicitly authorizes it.

### 5. Codex-Only or Credentialed Lane

Keep these with Codex/main:

- app connectors
- MCP app tools
- browser sessions involving user state
- GitHub mutations
- cloud/provider APIs
- credentials, auth, production deploys
- plugin installs or plugin cache mutation

Claude may ask for a bounded evidence packet from Codex, but should not operate those surfaces directly.

## Common Routing Map

| Need | Claude route |
| --- | --- |
| Frontend/browser verification | Ask Codex for screenshots, logs, console/network evidence, or a YURI browser wrapper result |
| OpenAI/API docs | Ask Codex for official-docs packet with citations; do not browse broadly |
| GitHub/PR/issue work | Ask Codex to use GitHub capability and return bounded evidence |
| Figma/Canva/design connectors | Ask Codex to operate connector and return artifact links/evidence |
| GitNexus impact/context | Ask Codex for GitNexus blast-radius summary before implementation |
| Codex plugin skill guidance | Ask Codex for an instruction capsule, then proceed as advisory |
| Durable new files | Require registry classification before write |

## Launch And Packet Guidance

Preferred Claude launch shape:

```bash
claude --model sonnet --effort max --setting-sources user,project --permission-mode default -- "<bounded packet>"
```

For review-only Opus packets:

```bash
claude --model opus --effort max --setting-sources user,project --permission-mode plan --tools '' -- "<bounded packet>"
```

If `--tools` is used, keep the `--` before the packet so CLI option parsing does not eat the prompt.

Do not rely on tmux paste into the Claude prompt editor for critical packets. Use startup-prompt or respawn-prompt launch paths that execute immediately in a persistent PTY lane.

## Packet Tags

Use these tags when routing plugin capability into Claude:

- `CAPABILITY_BRIDGE_ACTIVE`
- `CLAUDE_OUTPUT_LANE_ACTIVE`
- `OUTPUT_SUBLANE=<ideas|plans|findings|draft-artifacts|diff-proposals|reviews|questions|decisions|evidence|raw-captures>`
- `INSTRUCTION_CAPSULE_ALLOWED`
- `DRAFT_ARTIFACT_ALLOWED path=<path> authority=proposal_only`
- `DIFF_PROPOSAL_ONLY`
- `CODEX_TOOL_REQUIRED evidence=<needed-output>`
- `NO_LIVE_CALLS`
- `NO_CREDENTIALS`
- `NO_DEPLOY`

## Verification

Before treating Claude output as accepted:

- confirm whether it was a TUI response, draft artifact, diff proposal, or source mutation
- check changed files with `git status --short`
- verify protected paths were not touched
- verify any plugin-derived claim with local evidence or official docs
- have Codex/main integrate or explicitly accept the output

## Failure Mode

If Claude tries to use raw plugin internals, protected paths, credentials, live services, or unscoped writes, stop the packet and reissue it with the correct capability class.

## Session Notes

- 2026-06-16 — Bridges Claude lanes to Codex-developed plugins, MCP tools, and Codex-only workflow knowledge; reach for it when Claude needs plugin capability without giving plugins raw Claude authority.
