# Agent-Native UI/UX & Terminal Aesthetics

## Dual-Mode Pattern
Interfaces must be human-friendly by default but machine-native when flagged by an agent.

### Core Principles for Agentic CLIs:
1. **Structured Outputs**: All tools must support a `--json` flag to return deterministic state rather than ASCII tables.
2. **Schema Introspection**: Tools should expose a `--describe` or `--schema` command (or use MCP) so agents can discover capabilities at runtime.
3. **Non-Interactivity**: Agents cannot answer arbitrary `y/n` prompts. Support `--force`, `--yes`, or `--dry-run` (returning JSON diffs of intended changes).

### Terminal Aesthetics (For the Human Observer):
1. **Synchronized Rendering**: Use escape sequences (CSI `?2026h/l`) to buffer rendering, preventing flicker during high-speed agent actions.
2. **Progressive Disclosure**: Show "Thinking" pulses or step-bars (e.g., via Bubble Tea, Indicatif, or Ink). Keep massive chain-of-thought logs in a collapsed side-rail to reduce visual noise.
3. **Color & Typography**: Use low-contrast palettes (Catppuccin, Nord) and ligature-rich fonts (JetBrains Mono, Monaspace).

### Gap Analysis & Implementation for NUDIMMUD
- **Current Gap**: Agents might be parsing unstructured text output or getting stuck on interactive prompts.
- **Implementation**: Mandate the Dual-Mode pattern for all Conclave tools. Use MCP (Model Context Protocol) for dynamic tool discovery. Provide semantic exit codes so agents can self-correct.