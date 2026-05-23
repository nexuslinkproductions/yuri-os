# YURI Storage And Artifact Registry Protocol

Date: 2026-05-23
Status: draft-active
Owner: YURI control plane

## Purpose

YURI must not become messy every time a new sprint creates files.

Every durable artifact needs a predictable home and a registry entry. This makes future models faster because they can ask the registry what something is instead of scanning the repo like a confused tourist with a flamethrower.

## Current Rule

`_SYSTEM/config/folder-registry.json` is the first registry layer.

It currently classifies root folders and key subfolders. It is navigation metadata, not cleanup permission.

## Next Evolution

Promote the folder registry into a master artifact registry.

The master registry should cover:

- folders
- Markdown docs
- JSON registries
- scripts
- tests
- HTML reports
- databases
- external checkouts
- model runtimes
- generated artifacts
- skills
- wiki pages

## Required Metadata

Every durable artifact should eventually expose:

| Field | Meaning |
|---|---|
| `path` | Repo-relative path. This is a lookup key, not proof the path is ideal. |
| `type` | folder, doc, script, config, data, report, runtime, external_checkout, model_runtime, skill, wiki_page. |
| `class` | canonical_anchor, context_layer, system_control_plane, human_workspace, runtime_cache, harvest_source, archive, protected_surface, etc. |
| `owner` | Human/system owner responsible for truth. |
| `status` | active, dormant, retired, harvest_then_remove, archive, generated, sealed. |
| `readByDefault` | Whether a model should load it during normal orientation. |
| `protected` | Whether direct reads/writes are sealed. |
| `storageRule` | Where similar future artifacts should go. |
| `rebuildRule` | How to regenerate, refresh, or safely delete it. |
| `supersedes` | Older artifact replaced by this one. |
| `supersededBy` | Newer artifact that replaces this one. |
| `notes` | Human-readable reason this exists. |

## Storage Destinations

| Artifact | Destination |
|---|---|
| Operating policy or architecture | `_SYSTEM/docs/` |
| Runtime script | `_SYSTEM/Scripts/` |
| Registry/schema/config | `_SYSTEM/config/` |
| Curated context layer doc | `_SYSTEM/context/` |
| Curated wiki/RAG page | `_SYSTEM/yuri-wiki/` |
| Skill | `.agents/skills/` |
| Research source/evidence | `_SYSTEM/research-archive/` |
| Generated report | `_SYSTEM/reports/` |
| Active project work | `01_PROJECTS/<project>/` |
| Durable reusable reference | `03_RESOURCES/` |
| Inactive/historical work | `07_ARCHIVE/` |
| Runtime state | `_SYSTEM/state/` or an approved existing runtime surface |

## Creation Policy

When creating a new durable file or folder:

1. Pick the storage destination first.
2. Add or update the registry entry.
3. Add supersession metadata when replacing an older artifact.
4. Avoid root-level files unless a tool absolutely requires them.
5. Do not create a new provider-specific source of truth.

## Wiki Relationship

`_SYSTEM/yuri-wiki` is not the master database.

It is the human/RAG-readable projection of curated knowledge. The registry owns classification; the wiki explains it and makes it retrievable.

## Provider Relationship

Claude, Codex, Alibaba/Qwen, Obsidian, VS Code, and future providers get adapters.

Adapters are doors. They do not own global policy, memory, or lane truth.

## Guardrail

If a future artifact cannot be classified, it starts as:

```json
{
  "class": "candidate_review",
  "status": "needs_registry_entry",
  "readByDefault": false
}
```

That keeps experimentation possible without letting chaos become architecture.
