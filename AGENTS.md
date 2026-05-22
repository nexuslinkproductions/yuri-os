INHERIT: ./_SYSTEM/yuri-origin.md
INHERIT: ./SOUL.md

# AGENTS.md

Canonical policy lives in `_SYSTEM/yuri-origin.md`; persona and workflow live in `SOUL.md`.
One implementation agent is active: **Codex** (primary). Amp is retired and must not be dispatched.

---

## Amp (Retired)

Amp was removed from the active YURI OS lane set because it was too costly and produced failed implementation attempts. Do not route new work to Amp, do not depend on `.amp/`, and do not revive `Scripts/ai @amp` without a new explicit re-adoption spec.

Historical archive docs may still mention Amp for audit context only. Active routing, worker registries, and task specs must treat Amp as unavailable.

---

## Role

Codex is the scoped implementation lane. Claude Code is the control plane and orchestrator.

Codex executes well-defined task specs. Codex does not make policy decisions, approve merges, or initiate pushes.

## Task Intake

Codex receives task specs in the format defined in `CODEX_PROTOCOL.md`.

If no spec is provided, stop and request one from Claude.

## Protected Paths

Never read or write:

- `backend/data/`
- `.claude/state/`
- `.claude/history/`
- `.env`
- `node_modules/`

Reference: `_SYSTEM/yuri-origin.md` Protected Surfaces.

## Prohibited Actions

- No auto-commit
- No `git push` or `git push --force`
- No changes outside files listed in the task spec
- No new dependencies without explicit approval in the task spec
- No destructive shell commands such as `rm -rf`, `git reset --hard`, or `git clean`

## Verification Output

After completing a task, output:

- Files changed with exact paths
- Test command result
- `git diff --stat` summary

Wait for Claude to review before any commit.

---

## Yuri OS / Musubi Project Context

> This section defines build/test/lint commands, architecture conventions, and common mistakes for this workspace.

### Build

```bash
bun run build         # frontend
bun run build:backend # backend (if applicable)
```

### Test

```bash
bun test              # all tests
bun test <file>       # single file
node Scripts/<name>.test.mjs  # standalone script tests
```

### Lint / Type-check

```bash
bun run lint
bun run typecheck
```

### Architecture Notes

- **Control plane:** Claude Code (`Scripts/ai claude`) — routes, reviews, integrates
- **Impl lane:** Codex (`Scripts/ai codex` / `x`)
- **Routing contract:** `Scripts/offload-contract.mjs` — lane definitions, priority, mode map
- **Pulse cortex:** `.claude/hooks/user-prompt-submit.js` → `Scripts/pulse-orchestrator.mjs` — fires on every Claude Code prompt
- **State:** `.claude/state/` — pulse-bus, pulse-plan, cortex logs — protected runtime telemetry
- **Memory:** `.claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory/` — Claude Code managed only
- **Protected surfaces:** `backend/data/`, `.env`, `.claude/state/`, `.claude/history/`, `.amp/`

### Workflow Patterns

- **One task per thread** — do not mix DB changes with CSS changes in one session
- **Plan before execute** for complex tasks when scope is unclear
- **Always verify:** end every task with the relevant test/lint/build command
- **Fresh thread > noisy thread:** if a thread has accumulated failed attempts, abandon and start fresh

### Common Mistakes

- Do not touch `Scripts/offload-contract.mjs` dispatch tokens without Claude review — routing breaks silently
- `.claude/hooks/` may be edited when task spec explicitly includes hook files in target list
- Do not run `git push` or commit without explicit spec instruction
- Do not install new npm/bun packages without approval in the task spec
- Do not read `.env` or `.claude/state/` — those are protected surfaces

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **yuri-os** (59734 symbols, 86443 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
| `gitnexus://repo/yuri-os/context` | Codebase overview, check index freshness |
| `gitnexus://repo/yuri-os/clusters` | All functional areas |
| `gitnexus://repo/yuri-os/processes` | All execution flows |
| `gitnexus://repo/yuri-os/process/{name}` | Step-by-step execution trace |

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
