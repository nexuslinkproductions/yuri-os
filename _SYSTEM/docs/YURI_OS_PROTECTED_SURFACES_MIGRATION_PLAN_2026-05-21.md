# YURI OS Protected Surfaces Migration Plan

Date: 2026-05-21
Mode: inventory-first, no blind migration

## Operating Rule

Protected surfaces are not implementation shortcuts. They are owner boundaries. This plan maps how each surface should become symbiotic with YURI without direct reads, secret leakage, or hidden ownership drift.

## Current Surfaces

| Surface | Current role | Migration classification | Rule |
|---|---|---|---|
| `.claude/state/` | Runtime telemetry, hook logs, pulse bus, launch gate snapshots | Migrate by projection | Keep raw files sealed. Expose YURI-owned summaries through health/reporting wrappers. |
| `.claude/history/` | Conversation/runtime history | Manual export only | Do not scan automatically. Use user-approved exports or EOT summaries. |
| `.claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory/` | Claude-managed project memory | Importable context | YURI memory may import selected summaries, but Claude memory is not the owner. |
| `backend/data/` | Backend runtime data and databases | API/readiness wrapper only | Do not inspect files directly. Use backend health/readiness endpoints and migration scripts with explicit allowlists. |
| `.env` | Secrets and credentials | Keep sealed | Never read. Validate presence through capability checks that reveal only set/missing. |
| `node_modules/` | Dependency trees | Regenerate, do not migrate | Treat as build cache. Inspect manifests and lockfiles instead. |
| `.amp/` | Retired Amp self-config | Delete-only retirement | Removed without reading contents. Do not route or migrate. |

## Automation Command Center Findings

- `launch-readiness-nightly` is crashed and should be diagnosed through `launch-readiness-check.mjs`, not by reading protected state manually.
- `lane-memory-prune` is crashed and currently has empty local logs; next repair should identify the LaunchAgent command and expected output path.
- `ollama-kv` is an on-demand failed service; it should not reduce scheduled-agent freshness unless a dependent service requests it.
- Running daemons must be judged by PID liveness first. stdout mtime is only a log freshness signal.
- Scheduled jobs need a schedule expectation window, not a generic stale-state label.

## Migration Waves

### Wave A - Projection Layer

- Keep raw protected surfaces sealed.
- Extend health/reporting wrappers to emit sanitized YURI-owned summaries under `_SYSTEM/state/` or `_SYSTEM/monitoring/`.
- Separate process liveness, last exit, stdout mtime, state freshness, and schedule expectation.

Exit tests:

- Command Center renders running daemons as `live` even if stdout mtime is old.
- Scheduled jobs show `on_schedule` or `missed_window`.
- No command-center change requires direct protected-path reads outside the existing aggregator boundary.

### Wave B - Memory Ownership

- Treat Claude memory as importable context, not canonical ownership.
- Promote only reviewed summaries into YURI memory.
- Store EOT continuation notes in ignored EOT runtime artifacts and durable YURI docs when they affect future behavior.

Exit tests:

- Memory import records source, timestamp, and owner.
- Advisory lanes cannot write permanent memory directly.
- Full EOT produces reviewable memory update proposals, not silent policy mutations.

### Wave C - Backend Data Boundary

- Map backend health through readiness endpoints and explicit scripts.
- If a backend data migration is needed, create an allowlisted migration command that reports schema, row counts, backup path, and rollback command without exposing secret values.

Exit tests:

- No direct `backend/data/` file reads in general-purpose scripts.
- Readiness output exposes enough metadata to diagnose health.
- Migration scripts refuse to run without an explicit target and backup.

### Wave D - Retired Surface Cleanup

- Amp active routing is removed from AGENTS, worker registry, launcher, and offload contract.
- `.amp/` is deleted without content inspection.
- Historical docs may mention Amp only as archive context.

Exit tests:

- `Scripts/ai @amp "test"` exits with a retired-lane message.
- Worker registry has no `amp` lane.
- Offload routing priority has no `@amp`.

## Shintai Follow-Up Contract

Dispatch two advisors for this protected-surface sprint:

- DeepSeek: stale-agent diagnosis, memory-loop repair order, non-destructive regression plan.
- Nemotron or Mistral Large: long-horizon EOT/RAG/neuron-loop architecture and presentation content critique.

Prompt constraints:

- Advisory only.
- No commits, pushes, protected reads/writes, secrets, backend data reads, dependency-tree scans, invented lane policy, or Amp revival.
- Output must be usable as findings, proposed edits, tests, risks, and memory update proposals.

## Open Follow-Ups

- Repair `launch-readiness-nightly` from its own public script output.
- Locate `lane-memory-prune` LaunchAgent command without reading protected state.
- Decide whether `kagami-session-synthesizer` should write a YURI-owned state marker in addition to Claude memory.
- Add a command-center regression that validates daemon liveness and schedule freshness render independently.
