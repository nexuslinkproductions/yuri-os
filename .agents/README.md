# YURI Agent Assembly

Status: active
Owner: YURI control plane

`.agents/` is the agent assembly layer.

It does not own canonical skill bodies. Skills live in root `skills/`.

## Agent Model

A YURI agent is a recipe:

```text
context packet
+ role contract
+ ordered skill bundle
+ lane/tool policy
+ verification gate
= agent behavior
```

This keeps "agent" as an interpretable composition pattern instead of a hidden provider feature. The folder order matters:

1. Read `.agents/README.md` to understand assembly.
2. Read `.agents/agent-index.json` to choose the recipe.
3. Resolve every `skillId` through `skills/skill-index.json`.
4. Load only the required `skills/<skill-id>/SKILL.md` files.
5. Execute through the selected lane policy.
6. Verify through the recipe gate before returning claims.

## Rules

- `.agents/` may contain recipes, route metadata, and command adapters.
- `.agents/` must not contain canonical skill bodies.
- Agent recipes reference `skills/<skill-id>` by ID.
- Provider agents, MCPs, plugins, and caches are optional plumbing.
- Local filesystem order and JSON/Markdown indexes are the database.

## Files

| Path | Role |
|---|---|
| `.agents/README.md` | Human/model explanation of agent assembly. |
| `.agents/agent-index.json` | Machine-readable recipes that compose skills into agents. |
| `.agents/commands/` | Compatibility command adapters. |

