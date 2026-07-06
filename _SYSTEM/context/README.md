# YURI Context Layer

Status: active
Owner: YURI control plane

## Purpose

The context layer is the bounded registry between global authority and task-local files.

It prevents models from walking the whole repo, guessing which folders matter, or treating tool/runtime folders as policy. A model should first load the canonical anchors, then use the xref layer to navigate current evidence.

## Read Cascade

```text
operator input
  -> current adapter or Kagami/Rick intake
  -> _SYSTEM/yuri-origin.md
  -> SOUL.md
  -> _SYSTEM/context/README.md
  -> _SYSTEM/context/context-registry.json
  -> _SYSTEM/INDEX.md
  -> _SYSTEM/config/folder-registry.json
  -> _SYSTEM/config/artifact-registry.json
  -> .agents/README.md
  -> skills/README.md
  -> xref-selected registry/context paths
  -> task-local docs
  -> implementation files
  -> verification / release gate
```

## Xref-First Navigation

Use:

```bash
node _SYSTEM/Scripts/xref-query.mjs "task description"
```

Default xref scans request 200 results. Use `--top N` to list larger working sets, `--scan N` to widen candidate collection, and `--all` when the LLM needs a full FTS5/spectrum recall aperture instead of a ranked snippet page.

For known circuitry nodes, apply the propagation law:

```bash
node _SYSTEM/Scripts/propagation-scan.mjs <node-id> --dry-run
```

These are the active first navigation surfaces. They cross-reference FTS5, the circuitry graph, GitNexus, and provenance scoring instead of relying on a single substring packet route.

## Registry Packet Layer

The registry still stores bounded packet families for durable architecture, but active navigation happens through `xref-query.mjs` and `propagation-scan.mjs`. Consumers should use xref provenance, graph neighbors, GitNexus structural evidence, and registry paths together instead of asking the retired router to choose a packet.

Use the artifact registry before adding durable files:

```bash
node _SYSTEM/Scripts/artifact-registry.mjs --classify "_SYSTEM/docs/new-plan.md"
```

## Context Sources

| Source | Role | Rule |
|---|---|---|
| `_SYSTEM/context/context-registry.json` | Bounded packet map used by xref-aware navigation | Keep paths current; do not treat it as a standalone router. |
| `_SYSTEM/INDEX.md` | Human/model navigation map | Read before root browsing. |
| `_SYSTEM/config/folder-registry.json` | Machine-readable folder classification | Use to answer "what is this path?" without rediscovery. |
| `_SYSTEM/config/artifact-registry.json` | Machine-readable durable artifact classification | Use to answer "where should this new artifact live?" before creation. |
| `_SYSTEM/yuri-wiki/index.md` | Curated wiki and RAG entrypoint | Advisory projection; local repo truth outranks it. |
| `_SYSTEM/docs/*` | Current architecture, guardrail, cyber, memory, and sprint docs | Prefer recent dated docs over old handoffs. |
| `.agents/README.md` and `.agents/agent-index.json` | Agent assembly layer | Read to understand how context, role contracts, skills, lanes, and verification gates compose into agents. |
| `skills/*` | Canonical YURI skill library | Load only relevant skills. Provider caches are import/reference sources only. |
| `.codex/skills/*` | Codex-specific compatibility surface | Load only when Codex behavior or local adapter skills are the task. |
| Local domain notes | Folder-specific context files | Keep when they explain local domain conventions; do not let them override global policy. |

## Context Packets

Current packet families:

- `baseline`: authority, structure, storage, registry
- `llm-compat-lanes`: LLM compatibility lanes, local Gemma/Ollama runner, and operator lane routing
- `xref-navigation`: xref-query, propagation-scan, drift scan, provenance, circuitry graph, and NEXUS CORE manuals
- `skills`: skill tree, capability census, design system, skill evolution
- `memory`: recall, RAG, wiki, persona, EOT
- `cybersecurity`: threat intel, guardrails, client/product buildout
- `automation`: workers, launchd, health, stale agent repair

## Storage Rule

New durable artifacts should not land wherever the current tool happens to write them.

Use this decision order:

1. Operating policy or architecture: `_SYSTEM/docs/`
2. Runtime script: `_SYSTEM/Scripts/`
3. Config/registry/schema: `_SYSTEM/config/`
4. Context selector or packet docs: `_SYSTEM/context/`
5. Agent recipe or assembly metadata: `.agents/`
6. Skill: `skills/`
7. Provider-specific compatibility skill: `.codex/skills/`
8. Curated wiki/RAG page: `_SYSTEM/yuri-wiki/`
9. Evidence/research source: `_SYSTEM/research-archive/`
10. Generated report: `_SYSTEM/reports/`
11. Active project material: `01_PROJECTS/<project>/`
12. Durable reusable reference: `02_RESOURCES/`
13. Historical inactive material: `04_ARCHIVE/`

If none fit, create or update a registry entry first and document why.

## Retired Surface Rule

Retired providers and early experiments are not context authorities.

Do not preserve old platform identities in active architecture. Harvest useful patterns into YURI-owned skills/docs, then remove the old surface from default navigation.

## Wiki Rule

`_SYSTEM/yuri-wiki` is a context projection and RAG surface.

It should mirror curated, approved knowledge. It should not silently become the master database. The machine-readable registries remain the classification source; the wiki explains and retrieves them.
