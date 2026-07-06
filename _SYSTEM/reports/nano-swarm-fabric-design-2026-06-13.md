# NANO SWARM — Autonomous-Lane Fabric Design (2026-06-13)

Design-first spec (owner: lock before build). Produced by a 43-agent max-reasoning planning fleet (8 substrate-ground reads, 8 divergent architectures, 24 adversarial attacks, mimo peer-design on the 2 hard sub-problems, external-lane reachability probe). Run `wf_0634f027-775`.

## What a NANO SWARM is

A **nano** = one autonomous lane: a self-refreshing, self-checking, fully-agentic worker that wakes on a tick, claims a leased work-unit, acts inside its own git worktree, writes its decisions to the shared bus, and reschedules. The **NANO SWARM** = dozens of nanos running side-by-side, coordinated so they never clobber each other, supervised by Kagami. Six properties: (1) self-refreshing, (2) auto-compact at 500k HARD, (3) live observability, (4) coordinated-at-scale, (5) self-checking, (6) fully agentic — native AND external (mimo/codex/deepseek).

## Substrate — most of the spine already exists (Kagami)

| Need | Exists | Reuse / gap |
|---|---|---|
| Supervisor | `kagami-overseer.mjs` (crash-window, quarantine 3-in-60min, auto-unquarantine 120min, health summary) | passive library — needs a DRIVER (nothing ticks it); crash-only (no stall/progress signal) |
| Control contract | `kagami-control-domain.mjs` (canonical state, EVENT_KINDS, DOMAIN_ROLES, FANOUT_PROFILES, EXECUTION_RAILS) | extend EVENT_KINDS with LEASE_*; Kagami = non-mutating operator-kernel |
| Decision/observability bus | `kagami-event-bus.mjs` (append-only `events.jsonl`, guarded API, session index) | **needs `readKagamiEventsSince(cursor)`** + **log rotation** (universal scale risk) |
| Work queue | `worker-bridge.mjs` (enqueue/claim/execute, warm workers) | claim is a **racy read-modify-write** → double-claim; replace with atomic lease |
| Concurrency primitive | `local-concurrency.mjs` (atomic `mkdir` slot, lease + stale-reclaim) | **generalize into work-unit/file leases** |
| Hard-deny hook | `energy-enforce.mjs` (the ONLY hook returning `permissionDecision:'deny'`) | clone its deny path for the compact gate |
| Token/context | `token-ledger.mjs`, `token-status.js`, `context-router.mjs` | billing-metric, per-turn — NOT a live mid-loop counter (see Truth 1) |
| Native agentic + loop + worktree | Agent/Workflow tools, ScheduleWakeup/Cron, worktree isolation, compact-optimizer | already fully agentic; reuse directly |

## The two truths the adversarial phase PROVED (every architecture-defining decision flows from these)

**Truth 1 — the 500k gate cannot be fed from transcript/billing token counts.** `message.usage` is per-assistant-TURN and `token-ledger` is a billing metric; both are stale mid-tool-loop, so a naive gate "structurally cannot fire" while a nano runs its loop. **Fix (convergent):** a NEW PreToolUse hook (`nano-compact-gate.js`) modeled on `energy-enforce.mjs`'s deny path, reading a **live context-occupancy source** — the CLI exposes `context_window.used_percentage` to the PreToolUse payload in real time — plus a per-nano absolute cumulative-token counter written PostToolUse. Fail-closed (no token data = treat as at-ceiling = deny), allowlist the compact action itself.

**Truth 2 — CORRECTED 2026-06-13 (owner challenge → verified against live code).** The fleet's headline ("external lanes are structurally blind to the YURI safety stack") is **FALSE for any lane routed through `llm-lane.mjs`** — the majority conflated the raw single-shot `mimo.mjs` call with the real agentic path. **`llm-lane.mjs` ALREADY wires YURI's full structure into every external lane**, verified in source:
- **Agentic:** a real tool loop, `--max-iters` default 24 (line 608), tools = read_file / grep / list_dir / search(FTS5) / xref_query / propagation_scan / fetch_url / **bash** (line 177+), `--no-tools`/`--no-exec` opt-outs.
- **YURI-aware:** `buildYuriLoadout()` loads the spine (yuri-origin / SOUL / persona / CLAUDE / INDEX) as the system preamble (line 600); a missing spine file is treated as running "cognitively decapitated."
- **Guarded by the SAME core, not a drifting copy:** the bash gate `laneCommandAllowed` calls `evaluateToolCall('bash', …)` — the *same audited safety core* the native PreToolUse path uses (line 159) — plus git-mutation + protected-surface blocks; `isProtectedPath` refuses protected reads on read_file/list_dir/grep (with post-filter); fetch_url has a private/loopback/metadata SSRF deny; the endpoint has a fail-closed allowlist.
- **Hooked into the conscience:** `coreOnDispatch` fires the energy ΔU trace + memory recall on every dispatch (line 586) — "every lane call is hooked into the core like a native turn." The authors re-homed the guards into the lane executor *on purpose*, knowing `execSync` bypasses the main session's PreToolUse hooks (line 156).

So a planner/executor split is NOT needed — llm-lane IS the guarded agentic harness. **The real (much smaller) residual:** (a) the extra lane rules beyond the shared core (git-mutation/protected-surface) are LEXICAL regex (line 157 self-describes "defense-in-depth, not a bulletproof sandbox") → harden to realpath/closed-set; (b) NANO SWARM external nanos must run through `llm-lane` (agentic+guarded), NOT the raw `mimo.mjs` single-shot path (which has no tools/guards by design); (c) egress — llm-lane's external fetch is AggregateError-blocked in THIS sandbox, so external nanos won't RUN here until egress is fixed (native + direct-mimo-to-file work today).

## Synthesized architecture (the winner = a merge, not one proposal)

Spine = **KAGAMI-SWARM** (smallest delta on the existing Kagami control domain — no parallel fabric, no new state root, no daemon; nanos are native Cron/Agent loops whose only shared truth is the guarded event bus). Grafted with the strongest pieces from the others:

- **Coordination (from SHOAL/TORII + mimo peer):** per-PATH atomic `mkdir`-EXCL lease (NOT a per-path-SET with a racy index — that has a TOCTOU double-acquire). Lease IDs encode any resource: `file:src/auth.ts`, `task:build`, `slot:gpu-2`. Primitives: `acquire` (mkdir atomic), `release` (owner-verified), `renew` (heartbeat), `reclaim` (atomic rename-then-delete — exactly one winner, no double-free), `acquireOrWait` (spin + jitter + reclaim). **Worktree-per-nano handles 95%** (code edits on a nano's own branch = OS/git isolation for free); **leases only for the rare shared resource (~5%)**. Fix mimo's one bug: renew/reclaim must use the SAME timestamp source (it mixed `utimesSync` mtime with the JSON `ts`).
- **Agentic harness (from NANO-LOOM + mimo peer, corrected by Truth 2):** one provider-agnostic tool-loop. Loop = call lane → if no tool_calls, done → else **sequential `for`-await each tool call, try/catch per tool**, push results back, until MAX_STEPS/MAX_TOKENS. AggregateError root-cause (the broken launcher) = `Promise.all` over tool calls let rejections pile up; fix = sequential awaits + per-tool try/catch + `child.on('error')` + `AbortController` timeout on the fetch. **Execution routes through the native PEP (Truth 2), not a bespoke allowlist.**
- **Observability (from NEZUMI):** the event bus IS the swarm. `readKagamiEventsSince(cursor)` + a persistent **swarm-board** Monitor tailing `events.jsonl`. Every nano emits SPAWN / LANE_OUTPUT_DELTA / ROUTE_DECISION / LEASE_* / HANDOFF.
- **Cost (from TOLLGATE):** a `governor-tollgate.mjs` admits a nano only when a global token/USD budget AND a free lease are both satisfied; cheapest-model-tier that fits (Opus is the justified exception, not the default — except when the owner says "max reasoning"). Budget veto fails CLOSED.
- **Self-heal (from MUSUBI-ICHO):** work is a leased, idempotent, **restartable** unit, never a trusted in-flight process. Supervisor (driven `kagami-overseer`) reaps stale leases, records crashes, respawns. Assume every nano dies.

## Output coordination — "one document, each nano its own dedicated part" (owner requirement 2026-06-13)

Possible, yes — but **fragment-per-agent + deterministic assembler**, NOT concurrent region-writes to one physical file (that is the lost-update RMW race the fleet flagged as fatal for `sessions.json`). Each nano owns a fragment file (e.g. `doc/<section>.<nanoId>.md`) it writes atomically and exclusively (its dedicated part = its own file → zero collision); an `assemble.mjs` stitches fragments in a declared section order into the single rendered document. The "one document" is a VIEW; isolation is physical — identical philosophy to worktree-per-nano. If a literal single physical file is mandatory, gate every write behind a file-level lease (serializes writers, slower, only for genuinely-shared output).

## Per-nano lifecycle loop (canonical)

`WAKE (cron self-renewing) → SELF-REFRESH (git HEAD + last commits + tail events-since-cursor + own lease still-held + energy verdict, into a <nano-brain> block) → COMPACT-PRECHECK (≥500k live context → compact-first, HARD) → CLAIM lease (atomic; skip if held) → ACT in own worktree (full order-of-ops: plan/sim/build/verify/red-team) → EMIT decisions to bus → SELF-CHECK (energy gate) → RELEASE lease + HANDOFF → RESCHEDULE.`

## Gaps to build (priority order, with the convergent fixes baked in)

- **G1 — `nano-lease.mjs`** (KEYSTONE): per-PATH mkdir-EXCL lease + TTL + heartbeat + atomic-rename reclaim; replaces worker-bridge's racy claim. Anti-clobber.
- **G2 — `nano-compact-gate.js`** (PreToolUse): HARD 500k deny via the live `context_window.used_percentage` + per-nano PostToolUse token counter; cloned from `energy-enforce.mjs`; fail-closed.
- **G3 — `nano-refresh.mjs`**: per-tick self-refresh (git delta + events-since-cursor + lease check) → `<nano-brain>` block. Depends on `readKagamiEventsSince`.
- **G4 — external-nano agentic path** (REVISED — much smaller than first scoped): `llm-lane.mjs` IS the agentic+guarded harness already (24-iter loop, spine preamble, shared safety core, energy trace). Work = (1) run external nanos through `llm-lane` with tools on (not raw `mimo.mjs`); (2) harden the lane's LEXICAL extra rules (git-mutation/protected-surface) to realpath/closed-set; (3) generalize `tryAcquireLocalSlot` admission to external lanes if desired. NOT a from-scratch planner/executor build. Egress for codex/deepseek is a separate environment fix.
- **Cross-cutting:** `readKagamiEventsSince(cursor)` + **event-log rotation/snapshot** (the universal scale risk — every proposal dies on unbounded JSONL replay past ~6 nanos); the swarm-board Monitor; the cost governor; the supervisor driver on `kagami-overseer`.

## Reachable TODAY vs blocked

- **Native (Anthropic) nanos:** fully agentic NOW via Agent/Workflow — no harness needed.
- **mimo / codex / deepseek nanos:** the agentic+guarded path ALREADY EXISTS (`llm-lane.mjs` — 24-iter loop, spine preamble, shared safety core, energy trace). It is RUN-blocked here only by egress (llm-lane's external fetch → AggregateError). Raw `mimo.mjs` (direct node, redirect-to-file) works today but is single-shot by design. So external nanos are code-ready, egress-blocked in this sandbox.
- **codex + deepseek:** BOTH **egress-BLOCKED** in this sandbox (AggregateError on the llm-compat curl path — re-confirmed by the probe). Can be designed/built but won't RUN here until egress is fixed. Don't block the swarm on them.

## Phased build (MVP → dozens)

- **Phase 0 (1 nano, prove the loop):** `nano-tick` + `nano-refresh` + native-Agent nano in a worktree, emitting to the bus. No lease, no gate yet. Proves self-refresh + native-agentic + observability.
- **Phase 1 (1 nano, make it safe):** G2 compact gate (arm, prove a 500k push HARD-blocks) + the energy-gate self-check.
- **Phase 2 (2-3 nanos, prove no-collision):** G1 lease registry + worktree pool. Write the failing double-claim test FIRST, then make exactly-one-wins pass.
- **Phase 3 (mimo agentic):** G4 planner/executor harness — one mimo nano runs a real multi-step tool-loop through the native PEP on a read-only task, then guarded mutation.
- **Phase 4 (dozens):** event-log rotation + cursor + swarm-board Monitor + cost governor + supervisor reaper. Scale past ~6 only after rotation lands.
- **Phase 5 (codex/deepseek):** when egress is fixed.

## Owner decisions — LOCKED 2026-06-13

1. **Scheduler → native Cron self-renewal** (KAGAMI-SWARM spine; no launchd, no daemon, no `claude -p`).
2. **Lease state root → `_SYSTEM/state/kagami-control/` via the guarded event-bus API** (governed nod GRANTED). Add `LEASE_*` event kinds to `KAGAMI_EVENT_KINDS`.
3. **Cost → TRACKING ONLY, NO CAPPING.** The TOLLGATE budget-veto/admission-throttle is DROPPED. Keep a `cost-ledger.jsonl` (observability) + the `local-concurrency` slot (collision/host-safety, not cost). No model-tier forcing — "max reasoning" stands. Per [[feedback-max-reasoning-fleet-override]].
4. **Build → APPROVED.** Per-gap implementation may proceed (still: no commit without explicit go, protected paths via guarded API only, red-team + mutation-test each gap).
5. **Output coordination → fragment+assemble** (each nano owns its own fragment file; `assemble.mjs` stitches the single-doc view). No concurrent region-writes to one physical file.

## Hard problems carried forward (don't rebuild the mistakes)

- Token gate fed from stale transcript usage → use live PreToolUse context occupancy (Truth 1).
- External lanes self-executing tools → planner/executor through native PEP (Truth 2).
- Per-path-SET lease with a racy index → per-PATH atomic mkdir CAS.
- Unbounded `events.jsonl`/lease-ledger replay → rotation + derived snapshot before ~6 nanos.
- Lexical guard string-match → realpath + closed-set, fail-closed.
