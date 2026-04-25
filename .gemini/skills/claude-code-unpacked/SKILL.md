---
name: claude-code-unpacked
description: Research and apply insights from the Claude Code source code leak (March 2026). Use for understanding agent architecture, internal mechanisms like anti-distillation, undercover mode, and terminal pet systems (Tengu).
---

# Claude Code Unpacked

Use this skill to reason about the architecture and internal logic of Claude Code, as revealed in the March 2026 source map leak.

## Core Workflows

### 1. Architectural Analysis
Refer to [architecture.md](references/architecture.md) for details on:
- The `Agent Loop` (Model -> Tool -> Exec -> Model).
- Permission systems and wildcard bypasses.
- High-reasoning modes like `ULTRAPLAN`.

### 2. Internal Safety & Anti-Scraping
Claude Code employs several hidden strategies:
- **Anti-Distillation**: Fake tool calls in output.
- **Undercover Mode**: instructions to mimic human coding styles in commits.
- **Frustration Regex**: Monitoring user sentiment to adjust agent tone.

### 3. Terminal UX & Easter Eggs
- **Tengu (Buddy)**: Terminal pets that react to activity.
- Custom ASCII art and "alive" feel in the CLI.

## Local Research
If attempting to run or replicate these features locally:
- Reconstruct the TypeScript environment from the leaked source maps.
- Look for `KAIROS` implementation for long-term memory patterns.
- Implement the "Agent Loop" logic found in the core handler files.

## References
- [Architecture Details](references/architecture.md)
