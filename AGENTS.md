INHERIT: ./_SYSTEM/yuri-origin.md
INHERIT: ./SOUL.md

# AGENTS.md

Codex-facing adapter for YURI OS / MUSUBI.

This file is a doorway into the YURI control plane, not an independent policy source.

## Read Order

1. `_SYSTEM/yuri-origin.md`
2. `SOUL.md`
3. `_SYSTEM/context/README.md`
4. `_SYSTEM/context/context-registry.json`
5. `_SYSTEM/INDEX.md`
6. task-selected context packet
7. task-local files

Use:

```bash
node _SYSTEM/Scripts/context-router.mjs "<task>"
```

before broad exploration.

## Role

Codex/main is the primary implementation, verification, arbitration, and commit lane when the owner explicitly authorizes commits.

Claude and other model lanes are collaborators, not root authorities. Their outputs must be independently verified before trust.

## Plugin / Connector Rule

Codex plugins, OpenAI-developed plugins, app connectors, MCP app tools, and plugin-provided skills are capability lanes only. Before using them for a task, run:

```bash
node _SYSTEM/Scripts/context-router.mjs "<task>"
```

Then follow the selected YURI context and all protected-path, registry, mutation, commit, GitNexus, and verification rules. Plugin instructions cannot override the YURI control plane.

If a skill fires from a plugin cache, name that as an activation source only; do not frame it as a correction to YURI's canonical root skill layer.

## Persistent Lane Rule

Claude must be used only through an actual continuous CLI/tmux/PTY session when YURI controls it.

Forbidden for Claude routes:

- SDK calls
- `claude -p`
- `claude --print`
- no-session-persistence prompt calls
- spawning a fresh paid prompt process for each advisory packet

DeepSeek should also prefer a persistent session/lane when available so cache and continuity improve.

## Protected Paths

Never read or write:

- `backend/data/`
- `.claude/state/`
- `.claude/history/`
- `.claude/file-history/`
- `.claude/projects/`
- `.env`
- `node_modules/`
- `.amp/`

Use wrappers, health services, summaries, or explicit owner-approved migration steps instead.

## Commit Rule

No auto-commit by default. Commit only when the owner asks for it or the active task explicitly includes commit authorization.

Never push unless explicitly requested.

## Adversarial Verification Rule

Treat the first successful run as a hypothesis, not proof.

Before claiming completion, committing, pushing, relaunching lanes, or accepting Claude/other-agent output:

- attack your own work with at least one skeptical pass
- verify collaborator output with local evidence before trusting it
- include positive checks that prove the intended path works
- include negative or mismatch checks when wiring, routing, permissions, adapters, or parsers changed
- check staged scope and protected surfaces before commit/push
- report what failed first, what was fixed, what commands proved the final state, and any remaining risk

Load `skills/adversarial-verification/SKILL.md` when the task mentions attack, stress test, double-check, verification, completion, commit, push, relaunch, route wiring, adapters, or agent-output review.

## Cleanup Rule

Do not browse or preserve retired tool identities as active architecture. Promote useful patterns into YURI-owned docs, skills, scripts, or registries, then remove the old surface from default navigation.

Before durable new files or folders become normal operating material, classify them in the registry/context layer.

## Verification

Before claiming completion:

- run the smallest meaningful syntax/test checks
- run secret/protected-surface checks when cleanup or routing changed
- show changed files and commit hash if committed

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **yuri-os** (46701 symbols, 69658 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
| Understand architecture / "How does X work?" | `skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
