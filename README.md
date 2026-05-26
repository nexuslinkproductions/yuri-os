# YURI-OS-MUSUBI

Private repository for the YURI OS / MUSUBI workspace.

This README is a factual orientation map. It is not a product claim, readiness claim, sales page, or architecture guarantee. For current operating rules, read the canonical system files listed below.

## Current State

- Active development repository.
- The main control plane is under `_SYSTEM/`.
- The root contains a mix of active workspace folders, provider adapters, generated outputs, runtime/cache folders, and legacy surfaces still under review.
- New durable files should be placed through the YURI registry/context architecture.
- Protected runtime and secret surfaces must not be read or written directly.

## Canonical Entry Points

| Path | Role |
|---|---|
| `AGENTS.md` | Codex-facing adapter and read order. |
| `CLAUDE.md` | Claude-facing adapter. |
| `SOUL.md` | Collaboration and persona anchor. |
| `_SYSTEM/yuri-origin.md` | Canonical operating contract. |
| `_SYSTEM/context/README.md` | Context loading model. |
| `_SYSTEM/context/context-registry.json` | Machine-readable context packet selector. |
| `_SYSTEM/INDEX.md` | System navigation index. |
| `_SYSTEM/config/folder-registry.json` | Folder classification map. |
| `_SYSTEM/config/artifact-registry.json` | Durable artifact placement rules. |

Before broad exploration, use:

```bash
node _SYSTEM/Scripts/context-router.mjs "<task>"
```

## Root Map

The root is not a clean product package. It is an active workspace with canonical surfaces, adapters, human work areas, and cleanup candidates.

| Path | Current role |
|---|---|
| `_SYSTEM/` | Main YURI control plane: docs, scripts, registries, schemas, frontend/backend source, reports, labs, runtime state, and research archive. |
| `.agents/` | Agent assembly and role-composition recipes. |
| `.claude/`, `.codex/` | Provider adapters and command/config surfaces. They are not independent policy sources. |
| `.sharingan/` | Tracked pattern briefs. Active status is under review. |
| `skills/` | Root-visible YURI skill library. |
| `00_COMMAND-CENTER/` | Human command/status workspace. |
| `01_PROJECTS/` | Active project work. Some children may be external checkouts or project-specific repos. |
| `02_AREAS/` | Ongoing responsibility areas. |
| `03_RESOURCES/` | Reusable references, research, knowledge, and design material. |
| `04_FINANCE/` | Finance material. Read only for finance tasks. |
| `05_NEXUS-LINK/` | Nexus Link company identity, strategy, and public-facing work. |
| `07_ARCHIVE/` | Historical/inactive material. Not default source truth. |
| `AGENTS.md`, `CLAUDE.md`, `SOUL.md`, `README.md` | Root orientation and adapter documents. |
| `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.mts`, `ecosystem.config.js` | Root development, build, and process configuration. |
| `yuri-os-dashboard.html` | Tracked dashboard snapshot; source truth is the generator/spec layer, not the snapshot alone. |
| `GeneratedContent` | Local ignored symlink to external generated content. Kept out of Git and hidden from default navigation. |
| `backend/`, `Scripts/`, `test/` | Legacy or runtime surfaces. Active code belongs under `_SYSTEM/` unless a scoped cleanup proves otherwise. |
| `integrations/`, `NEURAL-NETWORK/`, `YURI-SENTINEL/`, `needle/` | External, model, or legacy tool surfaces that need per-child classification before root cleanup. |
| `output/`, `logs/`, `checkpoints/`, `dist/`, `graph/`, `graphify-out/`, `claude-palace-out/` | Generated/runtime output. Do not treat as source truth. |
| `.codex-worktrees/`, `.gitnexus/`, `.obsidian/`, `.smart-env/`, `.tmp/`, `.vscode/` | Local tool/runtime/editor state. Not canonical architecture. |
| `.env`, `ruvector.db`, `yuri.db` | Local secret/runtime data surfaces. Do not inspect directly. |

## Active Implementation Areas

| Area | Location |
|---|---|
| Frontend app | `_SYSTEM/src/` via Vite root configuration. |
| Backend service | `_SYSTEM/backend/` with TypeScript/Express scripts. |
| System scripts and tests | `_SYSTEM/Scripts/`. |
| Context routing | `_SYSTEM/Scripts/context-router.mjs`, `_SYSTEM/context/`, `_SYSTEM/config/`. |
| Artifact and folder governance | `_SYSTEM/config/folder-registry.json`, `_SYSTEM/config/artifact-registry.json`, `_SYSTEM/Scripts/artifact-registry.mjs`. |
| Governed autonomy | `_SYSTEM/Scripts/yuri-autonomy-runner.mjs`, `_SYSTEM/docs/YURI_GOVERNED_AUTONOMY_SPRINT_PLAN_2026-05-26.md`. |
| Workcell orchestration | `_SYSTEM/Scripts/yuri-workcell.mjs`, `_SYSTEM/Scripts/yuri-workcell-capture.mjs`, `_SYSTEM/docs/YURI_SONNET_WORKCELL_PROTOCOL_2026-05-26.md`. |
| Math substrate | `_SYSTEM/Scripts/math/`, `_SYSTEM/research-archive/yuri-math-engine-2026-05/`, `_SYSTEM/data/math/`, `_SYSTEM/labs/math/`. |
| RAG and knowledge health | `_SYSTEM/backend/src/scripts/`, `_SYSTEM/Scripts/*rag*`, `_SYSTEM/Scripts/*health*`. |
| Reports and scenario artifacts | `_SYSTEM/reports/`, `_SYSTEM/labs/`, `_SYSTEM/research-archive/`. |

## Local Commands

```bash
npm run dev
npm --prefix _SYSTEM/backend run dev
npm test
npm run test:math-substrate
npm run yuri:health
node _SYSTEM/Scripts/artifact-registry.mjs --validate
```

Notes:

- `npm run dev` starts the Vite frontend from `_SYSTEM/src` on `127.0.0.1:4200`.
- The backend package has its own scripts under `_SYSTEM/backend`.
- The full root test command is broad and may take time; use focused scripts when working on a narrow area.

## Protected Surfaces

Do not read or write these directly:

```text
backend/data/
.claude/state/
.claude/history/
.claude/file-history/
.claude/projects/
.env
node_modules/
.amp/
```

Use existing wrappers, health scripts, summaries, or explicit owner-approved migration steps instead.

## What Not To Infer

- The presence of a root folder does not mean it is an active product module.
- Generated reports, graph outputs, runtime logs, and cache folders are not source truth.
- Provider adapter folders are doors into tools, not separate YURI authorities.
- This README does not certify that YURI is production-ready for an external user.
- Current readiness must be judged from tests, registered artifacts, explicit reports, and the active goal/checklist.
