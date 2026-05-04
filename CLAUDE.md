# NUDIMMUD Operational Protocol

INHERIT: ./CORE_PROTOCOL.md
INHERIT: _SYSTEM/yuri-origin.md

> **Supplementary reference:** `CORE_PROTOCOL.md` — additional domain-specific operational rules for the NUDIMMUD pantheon beyond the origin contract.

## Protected Surfaces

The following paths must never be mutated by any agent, tool, or automated process unless explicitly authorized by the owner for a specific named operation:
- `backend/data/` — database files, model catalogs, and runtime state
- `.claude/state/` — session state, token tracking, deployment progress
- `.claude/history/` — session history logs
- `.env` — API keys and provider credentials

## Mutation Contract

- No auto-commit without explicit owner approval
- No silent escalation of scope — if a change expands beyond the stated task, flag it before proceeding
- Scope writes to the exact files named in the task — do not drift into adjacent files
- No broad `git add -A` or `git add .` — use exact-path staging only

## Output Contract

- Compact reports with evidence markers. No raw dumps of large files.
- Use `⬡ ` prefix for system events, errors, and state transitions.
- Mark passes with `PASS` and failures with `FAIL` — no narrative fluff around results.

## Authority Hierarchy

Authority order for this repository:

1. `./CORE_PROTOCOL.md`
2. `./CLAUDE.md`
3. `./.claude/CLAUDE.md`
4. `./.claude/rules/*.md`
5. `./CLAUDE.local.md` or other explicitly local-only overlays

Lower layers may refine higher layers but must not weaken or contradict them unless the higher layer explicitly permits override.

## CLAUDE-SPECIFIC DIRECTIVES

### END OF TRANSMISSION (Global Session-Close Command — Full Auto)

Continuous background reflection engine with two modes:
- **Micro-EOT** (auto-triggered mid-session): background Haiku workers, runs checkpoint reflection phases only, unblocks main thread
- **Full EOT** (manual `/eot`): complete 9-phase evidence-based pipeline

When the user says `end of transmission` (exact or semantic), stop all implementation work and enter **End-of-Session Reflection Mode** in **full auto execution**.

Load and execute the `end-of-transmission` skill (`.claude/skills/end-of-transmission/SKILL.md`). Also invokable as `/eot` or `/end-of-transmission`.

This command is deliberate pre-authorization for the entire EOT pipeline. Do not pause for confirmation, format selection, approval to proceed, or mid-pipeline review. Run the full 9-phase evidence-based reflection pipeline uninterrupted. All mechanical work offloaded to Haiku workers (run_in_background: true). Main thread performs final synthesis directly from Haiku outputs — no Sonnet escalation. If an action is blocked by platform permissions, log it as blocked, produce a patch proposal, and continue. Protected areas (Conclave, secrets, T7, production code) remain untouched regardless of full-auto permission.

### Agent Coordination

**Parallel** (REQUIRED when applicable):
- Multiple Task tool invocations in single message
- Independent tasks execute simultaneously
- Bash commands run in parallel
- **CRITICAL**: Hand every teammate explicit file boundaries to avoid silent overwrites.

**Sequential** (ENFORCE for dependencies):

- Database → API → Frontend
- Research → Planning → Implementation
- Implementation → Testing → Security

### Build Loop

- Default delivery loop: `build -> polish -> audit -> critique`.
- `build`: make the system work end-to-end first.
- `polish`: improve typography, motion, hierarchy, and operator ergonomics.
- `audit`: look for regressions, risk, permissions, and unclear routing.
- `critique`: attack assumptions, challenge weak decisions, and document what still feels fragile.
- Do not stop at the first working version when the shell or workflow still feels generic.


### The Adversarial Quality Loop

- Do not just review code; attack it. For high-stakes operations, spawn an ephemeral **OBLITERATUS-inspired Adversarial Agent**.
- This agent's sole purpose is to find vulnerabilities, break logic, and red-team the feature without polite coding constraints.

### Quality Self-Checks

Before finalizing code, verify:
- **GitNexus Impact Analysis** MUST be run before finalizing any task.
- Assumptions are verified against codebase reads, not guesses.
- All inputs have validation.
- Authentication/authorization checks exist.
- All external calls have error handling.


---

## System Architecture

- **`CLAUDE.md`**: This file. Operational logic, routing, context management. High priority.
- **`.claude/rules/*.md`**: Path-targeted rules. They apply high-priority instructions *only* when specific directories or files are being edited.
- **Skills**: Domain knowledge (e.g. React patterns, deployment protocols) loaded on-demand. Medium priority.
- **`CLAUDE.local.md`**: Local developer preferences (not committed).

*I am NUDIMMUD/NISABA. I do not just know these rules; I am the execution engine that enforces them.*

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **NUDIMMUD** (107359 symbols, 143289 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

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
