# EvoNexus Integration Map

**Status:** Superseded historical map.  
**Current authority:** `_SYSTEM/INDEX.md`, `_SYSTEM/config/folder-registry.json`, and the lane kernel/offload contract.

This file used to describe the early multi-provider experiment layer. It is kept only
as a compatibility note so old links do not dead-end.

## Current Integration Shape

YURI now treats provider tools as thin adapters around a YURI-owned control plane.
The active system is not provider-first.

| Layer | Current Source | Role |
| --- | --- | --- |
| Workspace authority | `_SYSTEM/yuri-origin.md`, `SOUL.md`, `_SYSTEM/context/README.md` | Operating doctrine and cognitive/persona context |
| Navigation | `_SYSTEM/INDEX.md`, `_SYSTEM/config/folder-registry.json` | Canonical read path and folder meaning |
| Routing | `_SYSTEM/Scripts/offload-contract.mjs`, `_SYSTEM/Scripts/lane-kernel.mjs` | Lane/model/tool truth |
| Skills | `.agents/skills`, `.codex/skills`, `.codex/plugins/cache`, `.claude/skills` | YURI-owned skill recall and optional provider-compatible skills |
| Execution | `./Scripts/ai`, `_SYSTEM/Scripts/offload.sh`, Rick/Kagami terminal | Operator-facing command surface |

## Active Provider Posture

- Codex remains the primary implementation lane.
- DeepSeek remains the dedicated reasoning/workhorse lane.
- Qwen/Alibaba, NIM, local models, and future providers should enter through the lane kernel/offload contract.
- Claude may remain as a dormant or optional provider adapter when subscription and task fit justify it.

## Retired Provider Posture

Old editor/provider experiments are retired from active routing.
Historical concepts may be harvested into YURI-owned skills/docs, but provider-specific
commands, rules, and dispatch defaults must not be revived without a new adoption spec.

## Replacement Rule

When an old integration idea is useful:

1. Extract the architecture pattern.
2. Store it in a YURI-owned skill, doc, or registry entry.
3. Add registry metadata.
4. Remove provider-specific active routing.

The provider is not the architecture. YURI owns the architecture.
