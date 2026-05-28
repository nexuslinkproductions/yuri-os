# YURI Codex Plugin Control Plane Protocol

Status: active
Owner: YURI control plane
Date: 2026-05-28

## Goal

OpenAI-developed Codex plugins may provide useful tools and skills, but they must not become the operating authority for YURI sessions.

## Configuration

- Canonical rule: `_SYSTEM/yuri-origin.md` -> Plugin / Connector Routing.
- Codex adapter rule: `AGENTS.md` -> Plugin / Connector Rule.
- Future-session skill trigger: `.codex/skills/yuri-control-plane-first/SKILL.md`.
- Canonical reusable skill: `skills/codex-plugin-control-plane/SKILL.md`.
- Context routing trigger: `_SYSTEM/context/context-registry.json` maps plugin/connector tasks to the skills packet.
- Mechanical gate: `.codex/hooks/pre-tool-use.mjs` routes through `_SYSTEM/Scripts/policy/yuri-safety-core.mjs`.

## Runtime Behavior

1. Before plugin capability is used, run:

   ```bash
   node _SYSTEM/Scripts/context-router.mjs "<task>"
   ```

2. The Codex pre-tool hook stamps `_SYSTEM/state/context-router-last.json` when that router command is invoked.
3. `mcp__codex_apps__*` tools are denied until a fresh context-router stamp exists.
4. Protected paths remain blocked even when a plugin asks for the action.

## Boundaries

Plugins can supply syntax, rendering, external API access, browser automation, cloud tools, or domain workflow.

Plugins cannot override owner intent, YURI authority hierarchy, protected paths, no-live-call constraints, registry placement, GitNexus impact checks, verification, commit rules, or push/deploy boundaries.
