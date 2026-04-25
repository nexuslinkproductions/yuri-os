<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **NUDIMMUD** (107359 symbols, 143289 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST adhere to CAVEMAN PROTOCOL:** Use terse, functional English in thinking and planning. **FORBIDDEN: preambles, "I have successfully..." intros, "Execution Summary" headers.** Go straight to the core result.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.
- NEVER execute a task without registering it in `_SYSTEM/OS_KERNEL/memory.db`.

## OS Kernel Integration

The NUDIMMUD Agentic OS provides the **Memory (RAM)** and **Process Table** for all agents.
- **Shared State:** All task IDs and agent statuses are tracked in `_SYSTEM/OS_KERNEL/memory.db`.
- **Episodic Memory:** Every significant discovery or decision must be logged via `mem-log`.
- **Agent Roles:** Identity is verified against the `agents` table (ENLIL, NABU, ENKI, INANNA).

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/NUDIMMUD/context` | Codebase overview, check index freshness |
| `gitnexus://repo/NUDIMMUD/clusters` | All functional areas |
| `gitnexus://repo/NUDIMMUD/processes` | All execution flows |
| `gitnexus://repo/NUDIMMUD/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Global Offload Directive

- Strict offload is the default across GPT, Claude, Antigravity, Gemini, VS Code, and Cursor.
- Keep the active session as overseer, router, and finalizer only.
- Delegate substantive reasoning, research, implementation, and verification first.
- Use deterministic local shell work only as support for a delegated lane.
- Treat `btw offload this` as immediate delegation.

## Role Matrix

- **Overseer / Coordinator**: load `ai-pipeline-offloading` and `swarm-coordination`; use GitNexus context, impact, and detect-change tools; log task state in `_SYSTEM/OS_KERNEL/memory.db`; hand off via `_SYSTEM/OS_KERNEL/swarm-handoff.sh`.
- **Worker / Implementer**: load the task-specific skill first; use the chosen lane (`@ollama`, `@gpt-oss`, `@kimi`, or `@swarm`); use shell, git, and editor tools for one isolated file boundary.
- **Reviewer / Guardian**: use GitNexus impact analysis, context, and detect-change checks; run tests and adversarial validation before release; preserve the narrower working set if lanes conflict.

## Caveman Protocol

- Terse English.
- No preambles.
- Straight to the result.
- Code and docs remain deep and thorough.
- Canonical startup seed: `.claude/nisaba/learning/global.md`. Root `SessionStart` and subagent hooks read it first in every session.

## ⬡ NUDIMMUD MULTI-IDE SYNC ⬡
- **ENVS**: ANTIGRAVITY, Cursor, VS Code, CODEX, CLAUDE CODE.
- **SOURCE OF TRUTH**: All state MUST be logged in `_SYSTEM/OS_KERNEL/memory.db`.
- **STABILITY**: Every change made here MUST translate to all other agents.
- **PROTOCOL**: Use `_SYSTEM/OS_KERNEL/swarm-handoff.sh` for all inter-agent context transitions.
- **RULE FILES**: Any rule change must be synced across `.cursorrules`, `.windsurfrules`, `.clauderules`, and `.cursor/rules/sync.mdc`.
- **FULL AUTONOMY**: Agents have full global permission to execute shell commands, read/write files, and coordinate without manual Y/N user confirmation. Proceed autonomously.
