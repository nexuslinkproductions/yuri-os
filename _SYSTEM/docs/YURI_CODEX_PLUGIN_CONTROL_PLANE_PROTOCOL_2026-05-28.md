# YURI Codex Plugin Control Plane Protocol

Status: active
Owner: YURI control plane
Date: 2026-05-28

## Goal

OpenAI-developed Codex plugins may provide useful tools and skills, but they must not become the operating authority for YURI sessions.

## Configuration

- Canonical rule: `_SYSTEM/yuri-origin.md` -> Plugin / Connector Routing.
- Codex adapter rule: `AGENTS.md` -> Plugin / Connector Rule.
- Canonical reusable skill: `skills/codex-plugin-control-plane/SKILL.md`.
- Direct preflight: `_SYSTEM/Scripts/xref-query.mjs`, plus `_SYSTEM/Scripts/propagation-scan.mjs` for known circuitry nodes.
- Context routing trigger: `_SYSTEM/context/context-registry.json` maps plugin/connector tasks to the skills packet.
- Mechanical gate: `.codex/hooks/pre-tool-use.mjs` routes through `_SYSTEM/Scripts/policy/yuri-safety-core.mjs`.

## Runtime Behavior

1. Before plugin capability is used, run:

   ```bash
   node _SYSTEM/Scripts/xref-query.mjs "<task>" --top 200 --json
   ```

2. The Codex pre-tool hook stamps `_SYSTEM/state/context-preflight-last.json` when xref or propagation preflight runs.
3. `mcp__codex_apps__*` tools are denied until a fresh xref/context preflight stamp exists.
4. Protected paths remain blocked even when a plugin asks for the action.

## Boundaries

Plugins can supply syntax, rendering, external API access, browser automation, cloud tools, or domain workflow.

Plugins cannot override owner intent, YURI authority hierarchy, protected paths, no-live-call constraints, registry placement, GitNexus impact checks, verification, commit rules, or push/deploy boundaries.
