# YURI Memory Layer Specification

**Version:** 1.0.0 — 2026-05-13
**Status:** Spec only. No implementation in this campaign.
**Artifacts root:** `.claude/state/`, `memory/`, `claude-palace-out/`
**Lifecycle vocabulary:** NIGREDO (dissolve) → ALBEDO (purify) → CITRINITAS (crystallize) → RUBEDO (integrate). Tiers map to the lifecycle; no parallel alchemy invented.
**Drafted by:** DeepSeek V4 Pro (reasoning=high); reviewed and merged by Claude control plane.

---

## Tier 1 — Ephemeral (NIGREDO)

| Field | Detail |
|-------|--------|
| Storage location | `.claude/state/session-state.json` (snapshot) + in-process RAM |
| Lifespan | One Claude session; reset on termination or crash |
| Content type | Active session id, scout-bus ring head, in-flight token counters, pending task context, last-N message hashes |
| Size budget | < 1 MB RAM, < 10 KB on-disk snapshot |
| Eviction policy | Whole tier discarded at session end (deterministic). No intra-session eviction. |
| Write owner | Current Claude instance |
| Read owner | Current Claude instance and child processes forked within the session |
| Health check | `test "$(jq -r .active_session_id .claude/state/session-state.json)" = "${CLAUDE_SESSION_ID}"` |
| Failure mode | Corrupt snapshot → session starts cold; in-flight work lost; operator must restart the task. |

## Tier 2 — Short-term (ALBEDO)

| Field | Detail |
|-------|--------|
| Storage location | `.claude/state/token-weekly.json`, `.claude/state/scout-errors.log`, `.claude/state/decisions.jsonl` (proposed) |
| Lifespan | Rolling 7-day window |
| Content type | Daily token roll-ups, scout-bus error traces, operator decision records (action, timestamp, outcome) |
| Size budget | < 10 MB total |
| Eviction policy | Daily eviction (session-close hook or launchd) removes records older than 7 days using last-modified time. Deterministic, no LRU guesswork. |
| Write owner | All Claude sessions and operator tools |
| Read owner | Any session, operator `grep` / reporting |
| Health check | `jq -e '.weeks \| length > 0' .claude/state/token-weekly.json` |
| Failure mode | Loss erases recent usage history and error context; decisions for 7 days become opaque. Mild degradation, no data-loss at deeper tiers. |

## Tier 3 — Persistent (CITRINITAS)

| Field | Detail |
|-------|--------|
| Storage location | `memory-core.md`, `memory/MEMORY.md` (index), curated `memory/*.md` |
| Lifespan | Indefinite (manual curation) |
| Content type | Core project ethos, long-lived user constraints, compound feedback that survives sessions |
| Size budget | < 1 MB |
| Eviction policy | Manual only. Operator edits or deletes records. No automatic removal. |
| Write owner | Operator (or Claude with explicit "remember" instruction confirmed by operator) |
| Read owner | All sessions unconditionally |
| Health check | `[ -s memory-core.md ]` |

## Tier 4 — Semantic (RUBEDO)

| Field | Detail |
|-------|--------|
| Storage location | `claude-palace-out/palace-index.md` + linked palace-room markdown files |
| Lifespan | Infinite; versioned in git, evolves with project understanding |
| Content type | Graph of concepts, personas, spatial-reasoning structures (YAML front-matter + markdown) |
| Size budget | < 100 KB for index + linked rooms |
| Eviction policy | No auto-eviction. Stale connections pruned manually when a node is deprecated. |
| Write owner | Operator during "palace update" sessions; Claude may propose changes under operator review |
| Read owner | Any session that requests spatial navigation |
| Health check | `grep -q '^#\+ ' claude-palace-out/palace-index.md` |
| Failure mode | Corruption breaks conceptual navigation; Claude falls back to linear file search. Palace can be partially rebuilt from procedural patterns. |

## Tier 5 — Procedural (ALBEDO → CITRINITAS)

| Field | Detail |
|-------|--------|
| Storage location | `memory/patterns/*.md` + `memory/patterns/index.json` (both proposed; not yet created) |
| Lifespan | Indefinite; patterns unused for 90 days become archive candidates |
| Content type | Successful task-sequence patterns: preconditions, ordered steps, tools used, verification signs |
| Size budget | < 5 MB |
| Eviction policy | Deterministic atime-based LRU on individual `.md` files. Nightly job moves pattern files with `atime` > 90 days to `memory/patterns-archive/`. `index.json` updated accordingly. |
| Write owner | Claude, after operator confirms a closed task (RUBEDO transition) |
| Read owner | Claude before launching similar tasks; operator for review |
| Health check | `jq -e '.' memory/patterns/index.json` |
| Failure mode | Loss of patterns forces Claude to re-learn from scratch; task quality drops temporarily until new successful runs restore the tier. |

---

## Tier Boundaries (semantic vs. procedural)

- **Semantic (RUBEDO)** captures *what things mean* and how they relate.
- **Procedural** captures *what to do* — concrete action sequences, tool choices, timing cues.
- A palace node (e.g. "Roadmap") may *describe* the roadmap; a procedural pattern may *rehearse* "how to advance a roadmap item."
- Cross-reference is allowed (a pattern can cite a palace node), but the tiers remain separately stored and managed.

---

## Anti-Rule: When NOT to Add a Tier

Do **not** create a new tier for content that is a deterministic derivative of an existing tier. Examples:

- A cached-inference layer (derivable from semantic + persistent).
- A "plan cache" (derivable from procedural + ephemeral context).

If a proposed tier can be rebuilt losslessly from the live ones, keep it out — it would only add consistency risk.

---

## Implementation Status & Codex Handoff

| Tier | Storage exists today? | Implementation gap |
|---|---|---|
| 1 Ephemeral | Yes (`session-state.json`) | None — already operating |
| 2 Short-term | Partial (`token-weekly.json`, `scout-errors.log`) | Missing: `decisions.jsonl` writer, 7-day eviction script |
| 3 Persistent | Yes (`memory-core.md`, `memory/MEMORY.md`) | None — already operating |
| 4 Semantic | Yes (`palace-index.md`) | None for now; rebuild script exists |
| 5 Procedural | **No** | Need: directory scaffold, `index.json`, atime-LRU eviction job |

**Codex task specs** (for follow-up campaign, not executed in-campaign):

```
## CODEX TASK SPEC — Procedural tier scaffold + atime LRU evictor

**Goal:** Create the procedural-tier directory and an atime-based LRU evictor.

**Target files (new):**
- memory/patterns/.gitkeep
- memory/patterns/index.json — empty {} initial
- memory/patterns-archive/.gitkeep
- _SYSTEM/Scripts/memory-evict.mjs — reads memory/patterns, archives files with atime > 90d, updates index.json, has --dry-run

**Constraints:**
- No frameworks. Native node:fs.
- --dry-run prints planned moves, performs nothing.
- atime read with fs.statSync, never assumes mtime.

**Acceptance criteria:**
- [ ] node _SYSTEM/Scripts/memory-evict.mjs --dry-run on an empty patterns dir prints "no eviction needed" and exits 0.
- [ ] With a synthetic atime-aged file, --dry-run prints the move plan; without --dry-run it moves the file and updates index.json.
- [ ] Re-running is idempotent.

**Test command:** Synthetic test in a tmp dir.

**Prohibited:** No git, no auto-install of launchd, no new dependencies.
```

```
## CODEX TASK SPEC — Short-term tier 7-day eviction

**Goal:** Add a deterministic 7-day eviction pass for short-term tier files.

**Target files (new):**
- _SYSTEM/Scripts/memory-evict-shortterm.mjs — removes lines/records older than 7 days from .claude/state/scout-errors.log, .claude/state/decisions.jsonl (skip if missing); does not touch token-weekly.json (which has its own rollover).

**Acceptance criteria:**
- [ ] On a synthetic log with mixed-age lines, only entries older than 7 days are removed.
- [ ] --dry-run mode prints removal counts.
- [ ] Idempotent.

**Prohibited:** No git, no auto-install.
```

---

## Notes

- All health checks are shell one-liners that exit 0 on success; operators can run them directly from `_SYSTEM/`.
- The YURI lifecycle vocabulary (NIGREDO–RUBEDO) already exists in swarm-coordination and parallel-clone-orchestrator; this specification maps tiers to those phases without inventing new alchemical terms.
