# Wave-3 Governance Domain — Fix Wave Report (2026-06-11)

Executor: Claude (Fable 5). Decisions: `wave3-decision-tracker.md` (D-G1=A, D-G2=B delete, D-G3=warn-only, D-G4→T.3). Codex addenda N/A (Codex retired wave-2; Mimo lane).

## Landed (11/11 WPs)
- **WP-G.1 (D-G1-A)** trust root closed — **with an attacker-correction the spec missed**: `.claude/settings.json` + `.claude/settings.local.json` added to `ROLE_TRUST_SURFACES.files` (lane-kernel — NOTE: lives at `_SYSTEM/Scripts/lane-kernel.mjs`, the spec's `.claude/hooks/` path was stale). For bash-security-guard, the spec said add settings.json to `BLOCKED_CLAUDE_FILES` — but that set ALSO drives the sensitive-READ block (unconditional, all roles): it would have blocked `cat/grep .claude/settings.json` for the owner. Landed a separate `BLOCKED_CLAUDE_WRITE_FILES` (superset) consumed only by `isBlockedClaudeFileWrite` — bash WRITES blocked for everyone (Edit-tool writes stay role-gated by operator-write-guard, dev exempt), reads stay free. Live probe: `echo x > .claude/settings.json` → DENY; `cat .claude/settings.json` → allowed.
- **WP-G.2** pre-tool-use `emitContext` stderr→stdout — every compaction-tier/token advisory this hook computed was being silently discarded; now reaches the model. 0 stderr writes remain.
- **WP-G.3** CLAUDE_SESSION_ID downgrade made visible (stderr WARN when findings exist with no session id) + block-path NOTE; energy-enforce header corrected (hooks run in PARALLEL; deny wins by OR-composition, not registration order).
- **WP-G.4** musubi stale accumulators: `MAX_DIRECT_WRITE_LOOKBACK = 20` slice — 3 writes from hours ago no longer fire the offload advisory forever.
- **WP-G.5** plan_dispatch_gate AUTO-EXPIRE documented as design + `[plan-dispatch-gate] EXPIRED via <reason>` stderr audit line.
- **WP-G.6** Argus honesty: activation string now `(async — observes only; cannot prevent tool execution)` — verified live in route-plan output.
- **WP-G.7** OpenClaw DEAD BRANCH comment at assessOpenClawAdvisory (always 'skip'; OC_BRIDGE is a ghost) + fixed the stale pulse-orchestrator pointer above it (deleted wave-2 D-C2).
- **WP-G.8 (D-G2-B)** 7 phantom codex_gate die nodes (PROPOSE/APPROVED/APPLY/APPLY_HEAD/CODEX_FLOW/PROP_DRYRUN/CDX_FULL — 8 entries incl. sector header) DELETED from wave3-scope-die-extract.json (0 refs remain) + CODEX_GATE-pruned comment in the contract.
- **WP-G.9** advisory boundary: @governance JSDoc on buildRoutePlan (SELF-ENFORCING via behavioral contract) + exported `validateAdvisoryBoundary(routePlan, advisoryOutput)` — warning-only lexical screen for the mechanically-checkable subset (commit/push, .env, protected paths); semantic conditions stay behavioral. `denyPermissionDecision: false` annotated ARCHITECTURAL (D-G3).
- **WP-G.10** `ai` run_auto_route lane-table guard: VALID_LANES membership check (incl. mimo/native — post-consolidation lanes the spec's list predated), stderr warn on unrecognized lane, fail-open to catch-all preserved.
- **WP-G.11** SPRINT_MODE suppression audit line (bypass stays; silence doesn't).

## Audit follow-ups resolved in-wave
- **G.AUDIT-2**: pulse-orchestrator.mjs DELETED in wave-2 (D-C2) — Pulse Cortex fan-out consumer confirmed retired; contract comment updated to say assessors serve route-plan inspection only.
- **G.AUDIT-3**: `deepseek-guarded-handoff` — zero callers repo-wide → dead utility (candidate for a future cleanup pass; not deleted, out of WP scope).
- G.AUDIT-1 (scout-runner internals) remains open.

## Flagged drift (not touched — outside WP scope)
The contract's HARD RULE header (line 24) still declares "Codex is ALWAYS first for implementation" and routingPriority leads with @gpt-5.5 — predates the wave-2 Codex retirement / deepseek+mimo consolidation. Routing-table changes route through the contract owner; flagging for an owner-approved routing pass.

## Final acceptance gate (9/9)
1. Baseline stable ✓ 2. settings.json in kernel (3 refs) + guard write-set ✓ (probe: write DENY / read pass) 3. pre-tool-use stderr=0 ✓ 4. SESSION_ID warning ✓ 5. lookback guard ✓ 6. SPRINT audit line ✓ 7. validateAdvisoryBoundary + SELF-ENFORCING doc ✓ 8. VALID_LANES + unrecognized-lane warn ✓ 9. D-G2/D-G3 recorded in tracker ✓.
Checks: contract regression 12/12 · lane-kernel 11/11 · `ai auto` dry-run route-plan emits cleanly · all edited files node --check/bash -n green.

## PARKED
PARKED-G.A–G.G stand as parked (G.B HERMES ghost noted for die housekeeping).
