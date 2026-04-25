---
name: agent-ux-designer
description: Standards for building and using Agent-Native interfaces. Use when designing CLI tools, TUIs, or automated feedback loops to ensure high-signal aesthetics and deterministic machine interaction.
---

# Agent UX Designer

Standards for agent-to-agent and agent-to-human interaction in the NUDIMMUD empire.

## The Dual-Mode Pattern
Every tool MUST support two interaction modes:
1. **Human (Default)**: Beautiful, high-signal, using TUI frameworks like Bubble Tea or Ink.
2. **Agent (`--json`)**: Pure, structured, deterministic JSON output.

## Interface Standards
- **Non-Interactivity**: Always provide flags for all decisions (`--force`, `--yes`, `--env`).
- **Dry-Runs**: Implement `--dry-run` which returns a JSON diff of intended file or system mutations.
- **Schema Introspection**: Tools should support `--describe` to expose their own API and parameter schemas for agent discovery.
- **Exit Codes**: Use semantic codes (0: success, 1: user error, 2: infra error, 3: validation fail).

## Aesthetic Best Practices
- **Flicker-Free Rendering**: Use synchronized output escape sequences.
- **Low-Contrast Palettes**: Standardize on Catppuccin or Nord for all dashboards.
- **Progressive Disclosure**: Only show the most critical "Thinking" step; hide full logs in a side-rail.