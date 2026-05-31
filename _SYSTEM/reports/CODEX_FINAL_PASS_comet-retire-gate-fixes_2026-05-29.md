# Codex Final-Pass Packet — comet retire + census/registry gate fixes

**Date:** 2026-05-29
**Branch:** energy-landscape-sprint-2026-05-28 (sprint branch; not main — commit/merge to main is Codex's gate)
**Lane:** Claude/Opus continuation of the control-plane debug+upgrade session
**Commit requested:** NO — verification handoff only. Working tree is uncommitted (83 files total across the full session; this packet covers the discrete comet+gates unit).
**Status:** PENDING_CODEX_MAIN_ARBITRATION

---

## Task summary

Three control-plane backlog items from the cartography findings, executed as safe, reversible, verified units:

1. **folder-census `--validate` tombstone gate** — the gate was permanently red because 16 registry entries with tombstone statuses (`removed_from_root`/`planned`/`retired`) are expected-absent on disk yet counted as missing.
2. **`yuri.db` registry drift** — the single genuine drift the fixed gate surfaced: a root-level `yuri.db` entry (status `ignore`) whose real DB lives at `backend/data/yuri.db`.
3. **energy-landscape-paper context packet** — the packet was missing 5 energy scripts that exist on disk.
4. **comet dead-lane retire** — comet (browser lane) maps to `mcp__computer-use__*`, which is not wired in this harness; yet it was the live `defaultLane` for the entire `research-latest` scenario, and lane-health reported it falsely LIVE.

## Files changed (this unit — 7 files)

| File | Change |
|------|--------|
| `_SYSTEM/Scripts/folder-census.mjs` | Added `TOMBSTONE_STATUSES` exemption (`removed_from_root`/`planned`/`retired`) to `missingRegistryEntries`, mirroring artifact-registry's existence exemption. |
| `_SYSTEM/config/folder-registry.json` | `yuri.db` entry status `ignore` → `removed_from_root` (tombstone); note now points at `backend/data/yuri.db`. |
| `_SYSTEM/context/context-registry.json` | Added 5 energy scripts to `energy-landscape-paper` packet `paths` (trace, dispatch-bridge, experiment, sanitize, experiments/descent-demo); extended `loadRule`. |
| `_SYSTEM/Scripts/offload-contract.mjs` | comet lane → `status: 'dormant'` + note (alias kept for auto-reactivation); `research-latest.defaultLane` `comet` → `swarm`; lifecycle Delegate step now names the main-session deep-research skill (WebSearch+WebFetch) as the real executor. (Diff stat also reflects earlier-wave HERMES removal in this same file.) |
| `_SYSTEM/Scripts/ollama-router-canary.mjs` | `research_latest` expected-lane `['comet']` → `['swarm']`. |
| `_SYSTEM/Scripts/ollama-promotion-readiness.mjs` | same as canary. |
| `_SYSTEM/Scripts/lane-health.sh` | `check_comet` false-LIVE → `DORMANT` (capability gated on computer-use MCP); added `DORMANT` icon to `print_row`. |

Adapter `_SYSTEM/Scripts/comet-adapter.mjs` deliberately **untouched** — dormant ≠ deleted; the envelope test depends on it and the lane auto-reactivates if computer-use MCP reconnects.

## Tests / checks run (exact)

```
node -e JSON.parse(folder-registry.json)            → valid
node -e JSON.parse(context-registry.json)           → valid
node --check offload-contract.mjs                   → OK
node --check ollama-router-canary.mjs               → OK
node --check ollama-promotion-readiness.mjs         → OK
bash -n lane-health.sh                              → OK
node folder-census.mjs --validate                   → exit 0 (was exit 1: 16 tombstones; now 0 drift)
node offload-contract-regression.test.mjs           → exit 0 (offload-contract-regression: pass)
node offload-envelope-contract.test.mjs             → exit 0 (✓ All contract tests PASSED; comet-adapter --dry-run still PASS)
context-router.mjs "energy landscape paper ..."     → selectedPacket=energy-landscape-paper score=1, all 5 new paths exists:true
```

## Protected-path / secret-surface checks

- No protected surface read or written. `backend/data/` referenced only as a registry *note* string, not accessed.
- No secrets touched. No `.env`, `.claude/state`, `.claude/history` access.
- comet retire is a routing-contract + advisory-config change; it does NOT alter any protected-path enforcement.

## GitNexus impact

- No indexed symbol renamed in this unit. `defaultLane` string repoint + a frozen-array status field + canary map values; `check_comet` is a shell function. Low blast radius; the two contract tests are the call-graph guard and both pass.

## Residual risks

1. `research-latest.defaultLane` now `swarm`. swarm (deepseek pair) cannot itself browse live web — the lifecycle prose makes the main-session deep-research skill the real executor, but a naive consumer that dispatches `swarm` for a current-facts query gets a model that can't fetch current facts. Acceptable: the *default* is no longer a dead lane, and the prose is explicit. Confirm `ai route-plan`'s separate classifier (not the offload-contract scenarios surface) routes research as intended.
2. comet remains a defined (dormant) lane with a live `@comet` alias + offload.sh dispatch cases intact — intentional, for auto-reactivation. If computer-use MCP is permanently gone, a follow-up can fully archive the adapter + remove the lane (touches the envelope test).
3. folder-census's own top-level `PROTECTED` Set is partially vestigial (multi-segment entries can't match single-segment top-level names) — NOT changed here; noted in the deferred-items findings.

## Recommended Codex route

Routing/tooling change → escalated route is appropriate when the owner is ready:
`node _SYSTEM/Scripts/claude-codex-final-pass.mjs --packet _SYSTEM/reports/CODEX_FINAL_PASS_comet-retire-gate-fixes_2026-05-29.md --execute --model codex --reasoning xhigh`

Not auto-dispatched: owner away, no commit pending, and Codex Spark/full runs cost credits with nothing to gate yet.
