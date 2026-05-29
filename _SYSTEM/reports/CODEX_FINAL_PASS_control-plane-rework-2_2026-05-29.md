# Codex Final-Pass Packet — Control-Plane Rework (session 2) 2026-05-29

**Branch:** energy-landscape-sprint-2026-05-28 (sprint branch; commit/merge to main is Codex's gate)
**Lane:** Claude/Opus continuation — owner-directed control-plane upgrade
**Commit requested:** NO — verification handoff. Working tree uncommitted.
**Status:** PENDING_CODEX_MAIN_ARBITRATION

## Task summary
Owner directives: retire comet/computer-use permanently; remove the swarm fan-out lane (DeepSeek being doubled); remove all `nexbox` mentions (failed productization bundle); convert the protected-path enforcement hook to ESM + single-source the protected paths + secure; wire claim-integrity-gate; consolidate `.claude/skills`; then the deity/Conclave cutover.

## What was done + VERIFIED (green)
1. **comet FULL retire** (computer-use permanently off) — removed from offload-contract (lane/alias/lifecycle), offload.sh (5 cases), lane-health, self-audit, canary, promotion; archived `comet-adapter.mjs`, `browser-lane.js`, `offload-envelope-contract.test.mjs` (comet-only) → `_SYSTEM/archive/legacy-purge-2026-05/`. Zero dangling refs.
2. **nexbox removal** — archived the bundle (RUNBOOK/offload-contract/symbiotic-pulse/verify + handoff) → archive; removed the live `nexbox-verify` gate from `launch-readiness-check.mjs` (was the `nexbox-verify: FAIL`); README index row. Strategy docs (`yuri-os-launch-brief.md`, `launch-readiness.html`) + `nexuslinkLandingData.ts` (company site) + historical audits FLAGGED for owner (not silently rewritten).
3. **swarm → native rework** — lane `swarm`→`native` (main-session Opus Workflow orchestration, preserves advisory-beacon behavior); REMOVED `dispatchSwarmFanout` (the auto deepseek-pro+flash doubler), the `swarm-fanout` ensemble slot, the defaultModels pair, `getSwarmModels`; `offload.sh --swarm` removed; `ai @swarm` fused fan-out neutralized; `swarm-default/workhorse` CLI → single-model shim (deepseek-v4-pro, NO pair). Route-plans now resolve `lane=native dispatch=native-orchestration` with a single advisory. **DeepSeek doubling eliminated everywhere.**
4. **Protected-path single-source + enforcement hook → ESM** — `claude-protocol-guard.js`→`.mjs` (ESM), control-files list single-sourced from new `lane-kernel.CONTROL_FILE_PREFIXES`; `.js` kept as a delegating shim (safe hot-swap until reload); settings.json → `.mjs`. Reconciled folder-census, yuri-sandbox-loop (kept `*.db` extra), artifact-registry to canonical `lane-kernel.isProtectedPath`. New `protected-surfaces.test.mjs` (16 surfaces blocked + 8 lookalikes allowed).
5. **claim-integrity-gate wired** into `yuri-closeout.mjs` (scoped, read-only, escalates verdict on failure, non-blocking).

## Files changed (29 modified + 2 new)
Core: offload-contract.mjs, pulse-orchestrator.mjs, offload.sh, ai, lane-health.sh, lane-kernel.mjs, claude-protocol-guard.mjs(NEW)/.js(shim), settings.json, ollama-router-canary.mjs, ollama-promotion-readiness.mjs, self-audit.mjs, launch-readiness-check.mjs, folder-census.mjs, folder-registry.json, context-registry.json, artifact-registry.mjs, yuri-sandbox-loop.mjs, yuri-closeout.mjs, yuri-control-plane-schema.mjs, yuri-symbiotic-pulse.mjs, pre-tool-use.js, offload-contract-regression.test.mjs, protected-surfaces.test.mjs(NEW), README.md. Archived: comet-adapter, browser-lane, envelope-test, nexbox bundle (5).

## Tests / checks (exact, all GREEN)
```
offload-contract-regression.test.mjs   → pass (native lane + single-advisory asserts updated)
protected-surfaces.test.mjs            → pass (16 block + 8 allow + junk-safe)
lane-kernel.test.mjs                   → pass
yuri-closeout.test.mjs                 → pass
generated-artifact-hygiene.test.mjs    → pass
artifact-registry.test.mjs             → pass
folder-census.mjs --validate           → exit 0
.claude/hooks/tests/claude-protocol-guard.test.js → pass (via shim → identical output)
ESM hook: edit SOUL.md/CLAUDE.md → warns; edit normal file → silent; shim delegates identically
node --check / bash -n on all touched files → OK
```

## Protected-path / secret checks
- No protected surface read/written. `backend/data/yuri.db` sqlite access was correctly DENIED by the guard — respected, not bypassed.
- No secrets touched. The ESM hook single-sources from lane-kernel; negative tests prove no surface got unprotected.

## GitNexus
- Symbol-level renames: `swarm` lane→`native` + removed `dispatchSwarmFanout`/`getSwarmModels`. Contract regression test is the call-graph guard (green). No protected-DB symbol changed.

## Residual risks / FLAGS (see also DEITY_CUTOVER_RUNBOOK + flags doc)
1. **swarm phase-2:** `ai` `_fused_swarm_orchestrate` legacy body is dead/unreachable (stubbed); backend `SwarmOrchestrator`/`/swarm/execute|messages|metrics`/`swarm_messages` table orphaned (offload.sh no longer calls fan-out; `/swarm/route` auto-router still used). Full removal = a backend pass.
2. **skills:** `.claude/skills` (56, live Claude Code surface) ↔ `/skills` (110, indexed canonical) is a MANAGED PARITY — manual archive would break live skills + CLI commands. Needs a sync-from-canonical architecture + owner sign-off (NOT executed).
3. **deity cutover:** memory.db `deities` EMPTY (the 169MB-FK fear was false); real work is backend-atomic (protected yuri.db + TS + external vault) — runbook written, deferred to a focused backend session (protected-DB block + atomicity).
4. **`.js` shim:** archive `claude-protocol-guard.js` after a session reload confirms the `.mjs` is live.
5. **claim-integrity** flags fail=3 on offload-contract.mjs (high-risk terms in code) — expected gate behavior, not a defect.

## Recommended Codex route
`node _SYSTEM/Scripts/claude-codex-final-pass.mjs --packet _SYSTEM/reports/CODEX_FINAL_PASS_control-plane-rework-2_2026-05-29.md --execute --model codex --reasoning max` (routing+security+protected-path+tooling change). Not auto-dispatched: owner away mid-run, no commit pending.
