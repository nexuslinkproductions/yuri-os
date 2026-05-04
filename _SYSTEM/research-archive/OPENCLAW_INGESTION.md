# OpenClaw Ingestion & Yuri Integration Analysis

**Date**: 2026-05-04
**Source**: https://github.com/openclaw/openclaw (head of main, depth 1)
**Lane**: OPENCLAW_REPO_INGESTION_AND_YURI_INTEGRATION_ANALYSIS
**advisory_only**: true
**local_truth_claim**: false

---

## Overview

OpenClaw is a **personal AI assistant** that runs on your own devices, channels, and infrastructure. It provides a single Gateway control plane connecting 20+ messaging channels (WhatsApp, Telegram, Discord, Slack, Signal, iMessage, etc.) to a multi-agent session system with tools, skills, cron, webhooks, MCP, and companion apps (macOS menu bar, iOS/Android nodes). It is MIT-licensed, TypeScript-first, and runs on Node 22+ with pnpm workspaces. The project was built for Molty (a space lobster AI assistant) by Peter Steinberger and the community.

## Setup

### Global Install Path
```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```
Runtime: Node 22.14+ or Node 24 recommended. Works with npm, pnpm, or bun. Onboarding writes config, pairs channels, and installs launchd/systemd daemon.

### Source Dev Path
```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install                    # pnpm workspace (npm install is NOT supported at root)
pnpm openclaw setup             # first-run only: writes local config/workspace
pnpm ui:build                    # optional: prebuild Control UI
pnpm gateway:watch               # dev loop with auto-reload
```

### Build Path
```bash
pnpm build                       # produces dist/
pnpm ui:build                     # builds Control UI
```

### Docker Path
```bash
docker run --read-only --cap-drop=ALL -v openclaw-data:/app/data openclaw/openclaw:latest
```

### Update / Migration Path
```bash
openclaw update --channel stable|beta|dev
openclaw doctor                   # post-update check
```

## Architecture

### Monorepo Map

| Directory | Purpose |
|---|---|
| `src/` | Core TypeScript: gateway, agents, sessions, channels, tools, plugins, protocol |
| `packages/` | Shared packages (SDK, types, utilities) |
| `extensions/` | Plugin extensions (browser, canvas, cron, nodes, discord, slack, etc.) |
| `ui/` | Control UI (web dashboard) |
| `apps/` | Companion apps (macOS, iOS, Android) |
| `docs/` | Documentation site |
| `skills/` | Bundled skills (SKILL.md files) |
| `scripts/` | Build, test, CI scripts |
| `test/` | Test infrastructure and E2E fixtures |
| `config/` | Configuration examples and presets |
| `deploy/` | Deployment tooling (Docker, cloud) |
| `security/` | Security policy, opengrep rules |

### Key Subsystems

1. **Gateway** (`src/gateway/`) — control plane: sessions, events, protocol (WebSocket RPC), HTTP surfaces (OpenAI-compatible /v1/chat/completions, /tools/invoke).
2. **Agent** (`src/agents/`) — session lifecycle, model routing, tool execution, subagent spawning.
3. **Channels** (`src/channels/`) — 20+ messaging channel connectors (WhatsApp, Telegram, Discord, Slack, Signal, iMessage, etc.).
4. **Tools** — built-in tools (bash, read, write, edit, browser, canvas, nodes, cron, sessions). Also MCP server tools.
5. **Skills** (`skills/` + `~/.openclaw/workspace/skills/`) — SKILL.md files loaded on demand.
6. **Plugins** (`extensions/`) — code plugins (runtime hooks, providers, channels, tools) + bundle plugins (packaged skills, MCP servers).
7. **Companion apps** (`apps/`) — macOS menu bar, iOS/Android nodes.
8. **Sandbox** — Docker-based sandboxing for non-main sessions (optional, `non-main`/`all` modes).

### Data Flow

```
User message (WhatsApp/Telegram/etc.)
  -> Channel connector (src/channels/*)
  -> Gateway (session lookup, auth, DM policy)
  -> Agent session (model + tools + skills)
  -> Tool execution (host or sandbox)
  -> Response back through same channel
```

## Tools & Skills

### Tools
OpenClaw provides built-in tool families: `browser`, `canvas`, `code`, `cron`, `discord`, `exec`, `fs`, `gateway`, `hook`, `nodes`, `sessions`. Tools can be restricted by agent profile (`tools.profile`). Exec tools support sandboxed execution via Docker.

### Skills
Skills are loaded from `~/.openclaw/workspace/skills/<skill>/SKILL.md`. The README lists `AGENTS.md`, `SOUL.md`, `TOOLS.md` as injected prompt files. Skills can be bundled (shipped with core), managed (via ClawHub), or workspace-local. The VISION doc states new skills should be published through ClawHub first, not added to core by default.

### MCP Support
OpenClaw supports MCP as both a server and a runtime integration surface. MCP details in `docs/cli/mcp.md`. The VISION doc emphasizes pragmatic MCP support without duplicating existing agent, tool, ACPX, plugin, or ClawHub paths.

## Security Model

- **Default**: tools run on the host for the main session (full host access for the trusted operator).
- **Sandbox mode**: `agents.defaults.sandbox.mode: "non-main"` runs non-main sessions in Docker sandboxes.
- **DM pairing**: unknown senders get a pairing code; approved senders go to a local allowlist.
- **Trust model**: personal assistant, not multi-tenant bus. Authenticated Gateway callers are treated as trusted operators.
- **Plugin trust**: plugins load in-process with the Gateway. Installing a plugin grants it the same trust level as local code.
- **Exec approvals**: allowlist/ask UI guardrails, not a multi-tenant boundary.
- **Operator trust**: one user per machine/gateway. Multi-user scenarios require separate gateways/OS users.

## Reusable Patterns for Yuri

| Pattern | Rationale | Priority |
|---|---|---|
| **Plugin architecture** | Extensions/ directory + plugin SDK (api.ts, runtime-api.ts) is clean. Core stays lean; capability ships as plugins. Yuri's Scripts/ and .cline/ layers could adopt this pattern | HIGH |
| **Skills as SKILL.md files** | OpenClaw's workspace `skills/<name>/SKILL.md` matches Yuri's `.claude/skills/*/SKILL.md` and `.cline/rules/*.md`. The skill-loading convention is directly reusable | HIGH |
| **Sandbox doctrine** | Docker sandbox for non-main sessions, host execution for main. Yuri could adopt this for untrusted/sandboxed agent execution | MEDIUM |
| **Session model** | Session lifecycle with isolation, subagents (one level deep), and tool permissions per session. Yuri's fused swarm could use this session isolation pattern | MEDIUM |
| **DM pairing / allowlist** | Pairing-code-based channel authorization. Yuri's browser capture and MCP integration could use this for secure channel pairing | MEDIUM |
| **Tool profiles** | `tools.profile` restricts which tools an agent profile can call. Yuri's adapter system could adopt tool profiles per CLI surface | MEDIUM |
| **Manifest-first control plane** | Plugins declare capabilities via manifest/metadata rather than runtime hooks. Yuri's extension system should prefer manifest-first design | LOW |
| **Exec approvals** | Allowlist/ask UI for dangerous commands without blocking safe ones. Yuri's mutation contract could use this pattern | LOW |

## Risks / Anti-patterns

| Anti-pattern | Why Not for Yuri |
|---|---|
| **20+ channel connectors** | Yuri is local-first, not a multi-channel chatbot. Channel routing complexity is unnecessary overhead |
| **Chat-first UX** | Yuri is CLI/agent-first, not chat-first. OpenClaw's `/compact`, `/think`, `/verbose` chat commands don't map to Yuri's lane structure |
| **Multi-tenant Gateway** | OpenClaw explicitly rejects multi-tenant as a design goal (one user per gateway). Yuri should also avoid multi-tenant complexity in core |
| **In-process plugins** | Plugins loading in-process with full host trust is too permissive for Yuri's guarded-executor model |
| **Host-first exec default** | OpenClaw defaults to host execution for main sessions. Yuri should prefer sandbox-first for all agent execution |

## Next Actions

1. **HIGH**: Prototype a Yuri skill loader based on OpenClaw's `~/.openclaw/workspace/skills/<name>/SKILL.md` convention. Yuri's `.cline/rules/*.md` already mirrors this; formalize the loading path in `Scripts/yuri-skill-loader.mjs`.
2. **MEDIUM**: Study OpenClaw's extension plugin API (`src/plugin-sdk/*`) for Yuri's future `extensions/` directory. The barrel export pattern (`api.ts`, `runtime-api.ts`) is clean.
3. **MEDIUM**: Evaluate OpenClaw's sandbox mode for Yuri's fused swarm execution. Docker sandbox for untrusted lanes, host execution for trusted lanes.
4. **LOW**: Review OpenClaw's session model for Yuri's multi-agent session isolation. Subagent spawning (one level deep) is a useful pattern.
5. **LOW**: Review OpenClaw's exec approvals (allowlist/ask UI) for Yuri's mutation contract implementation.

## Blocker Log

No blockers encountered. Clone succeeded (depth 1, 17529 files). No daemon started. No services installed. All analysis from static file inspection.
