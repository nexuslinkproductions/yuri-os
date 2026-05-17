# Worktree Partition - 2026-05-11

Command: `git status --short`
Observed count: 152 entries
Policy: this partition is a review ledger, not a staging plan.

## Decision

The tree is not clean and must not be treated as one promotion unit. Recovery work can be validated, but any merge/commit decision must happen by lane. Unrelated user changes remain untouched.

## Lanes

| Lane | Scope | Ownership | Risk | Promotion Rule |
| --- | --- | --- | --- | --- |
| Readiness recovery | `tsconfig.json`, `tsconfig.node.json`, `_SYSTEM/Scripts/yuri-health.mjs`, `_SYSTEM/Scripts/yuri-lifecycle-controller.mjs`, `package.json`, `_SYSTEM/skill-hash-registry.json`, readiness board, memory backups, weekly consolidation outputs | Codex current recovery | Medium | Promote only with green `npm test`, `npm run build`, `npm run yuri:health`, memory health, and model-review synthesis |
| Agent governance | `.claude/agents/*`, `.claude/hooks/*`, `.claude/reinforcement/*`, `.claude/config/models.json`, `.claude/skills/*`, `.gemini/skills/*`, `AGENTS.md`, `CLAUDE.md` | Existing agent-system work | High | Requires dedicated review against routing and safety policies before promotion |
| Routing and local model runtime | `_SYSTEM/Scripts/offload*`, `_SYSTEM/Scripts/ollama*`, local model policy tests, session runtime tests | Existing routing/runtime work plus readiness gates | High | Requires route regression, local policy tests, and health command pass |
| Backend/API/design services | `backend/src/*`, `backend/data/design-assistant/*`, `tools/*`, design assistant and site builder tests | Existing backend/design work | High | Requires backend test pass, API smoke, and browser/runtime validation before promotion |
| Trading automation | `.claude/trading-bot/*`, `_SYSTEM/Scripts/trading-bot/*` | Existing trading system work | Critical | No live promotion without separate trading risk review, kill-switch test, paper/live separation proof, and explicit operator decision |
| Research/design assets | `RESEARCH/DESIGN-RADAR/*`, `03_RESOURCES/References/design-packs/*`, `DESIGN.md`, `design-memory.json` | Existing design research work | Medium | Promote as documentation/assets only after source review |
| Self-improvement corpus | `_SYSTEM/SELF-IMPROVEMENT/*`, `_SYSTEM/Scripts/self-improvement/*` | Mixed existing + current recovery lesson | Medium | Promote generated consolidation outputs only after dry-run selected expected lessons |
| Logs/backups | `logs/*`, `_SYSTEM/OS_KERNEL/memory.db.backup-*` | Operational artifacts | Low | Keep as evidence; do not mix with source commits unless explicitly desired |

## Current Recovery-Owned Artifacts

- `tsconfig.json`
- `tsconfig.node.json`
- `_SYSTEM/Scripts/yuri-health.mjs`
- `_SYSTEM/Scripts/yuri-lifecycle-controller.mjs`
- `package.json` script entries: `yuri:health`, `yuri:lifecycle`
- `_SYSTEM/skill-hash-registry.json`
- `_SYSTEM/OS_KERNEL/memory.db` schema and lesson rows
- `_SYSTEM/OS_KERNEL/memory.db.backup-20260511-071602`
- `_SYSTEM/OS_KERNEL/memory.db.backup-20260511-lesson-promotion`
- `_SYSTEM/SELF-IMPROVEMENT/03_GAZE/operational-readiness.md`
- `_SYSTEM/SELF-IMPROVEMENT/03_GAZE/worktree-partition-2026-05-11.md`
- `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/archive/raw-lessons/2026-W20/operations/yuri-readiness-gates-2026-05-11.md`
- `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/consolidations/2026-W20-consolidation.md`
- `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/cross-reference-index.json`
- `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/cross-reference-index.md`
- `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/prevention-rules.md`

## Blocking Rule

Do not use GitNexus "index current at `778bcab`" as proof that uncommitted work is analyzed. It proves the committed graph is indexed. The 152-entry dirty tree still needs lane review before any promotion decision.
