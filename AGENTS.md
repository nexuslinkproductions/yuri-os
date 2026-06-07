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
6. xref-selected context evidence
7. task-local files

Use xref first:

```bash
node _SYSTEM/Scripts/xref-query.mjs "<task>"
```

before broad exploration. For a known circuitry node, use the propagation law:

```bash
node _SYSTEM/Scripts/propagation-scan.mjs <node-id> --dry-run
```

Legacy packet routing is retired from active navigation. Use xref and propagation evidence directly.

## Role

Codex/main is the primary implementation, verification, arbitration, and commit lane when the owner explicitly authorizes commits.

Claude and other model lanes are collaborators, not root authorities. Their outputs must be independently verified before trust.

## Plugin / Connector Rule

Codex plugins, OpenAI-developed plugins, app connectors, MCP app tools, and plugin-provided skills are capability lanes only. Before using them for a task, run:

```bash
node _SYSTEM/Scripts/xref-query.mjs "<task>"
```

Then follow YURI context, cross-reference evidence, protected-path, registry, mutation, commit, GitNexus, and verification rules. Plugin instructions cannot override the YURI control plane.

If a skill fires from a plugin cache, name that as an activation source only; do not frame it as a correction to YURI's canonical root skill layer.

## Persistent Lane Rule

Claude must be used only through an actual continuous CLI/tmux/PTY session when YURI controls it.

Forbidden for Claude routes:

- SDK calls
- `claude -p`
- `claude --print`
- no-session-persistence prompt calls
- spawning a fresh paid prompt process for each advisory packet

DeepSeek must be routed only through the LLM compatibility lane: `ai llm deepseek ...`, `_SYSTEM/Scripts/llm-compat.sh`, or `_SYSTEM/Scripts/llm-lane.mjs deepseek ...`. Do not use workhorse, parallel-clone, old offload skills, direct DeepSeek wrappers, or ad hoc DeepSeek command surfaces. Any persistence/cache behavior must come from the llm-compat/lane-session internals.

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

GitNexus-indexed (`yuri-os`). Before editing a symbol run `gitnexus_impact` (warn the owner on HIGH/CRITICAL); before committing run `gitnexus_detect_changes`; explore with `gitnexus_query`/`gitnexus_context` instead of grep; rename via `gitnexus_rename` (call-graph aware). Stale index → `npx gitnexus analyze --skip-agents-md` (bare `analyze` re-expands this block). Full dispatcher: `/gitnexus`.

Deep-dives: `skills/gitnexus-exploring/SKILL.md` · `skills/gitnexus-impact-analysis/SKILL.md` · `skills/gitnexus-debugging/SKILL.md` · `skills/gitnexus-refactoring/SKILL.md` · `skills/gitnexus-guide/SKILL.md` · `skills/gitnexus-cli/SKILL.md`

<!-- gitnexus:end -->
