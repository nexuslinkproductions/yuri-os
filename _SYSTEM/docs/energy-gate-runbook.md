# YURI Energy Gate Operational Runbook

**Purpose:** This document is the operational contract for the YURI energy observability and governance gate, as referenced by `_SYSTEM/Scripts/energy-tick-core.mjs` and the `energy-operations` context packet. It separates the static integration details (found in the integration audit) from the active procedural workflows required to run, test, and rollback the energy layer.

## 1. Registration & Enablement
The energy gate runs via the `yuri-energy-tick` hook, intercepting `PostToolUse` transitions.
- **Provider Projection:** Ensure the hook is active in `.claude/hooks.json` or `.codex/config.toml` (depending on the active harness). The registry `_SYSTEM/config/yuri-hook-registry.json` is the canonical source of truth for the adapter bindings.
- **Enablement:** The gate is fail-open. If `_SYSTEM/Scripts/energy-tick-adapter.mjs` cannot find `better-sqlite3` or the underlying `energy-tick-core.mjs` fails, it logs an error but permits the session to continue.

## 2. Trace Accrual & Dynamics
The core logic resides in `_SYSTEM/Scripts/energy-tick-core.mjs`. It computes $\Delta U$ from the four highest-signal transitions:
*   **iota ($\iota$):** Verified-evidence credit on a successful Edit/Write/passing Bash ($\Delta U \downarrow$).
*   **gamma ($\gamma$):** logLoss calibration for confidently-wrong (failed) actions ($\Delta U \uparrow$).
*   **delta ($\delta$):** brierScore calibration sibling ($\Delta U \uparrow$).
*   **eta ($\eta$):** Protected-path violation. Weight is 100 $\rightarrow$ Gate REJECTS ($\Delta U \approx 100$).

Traces are durably accumulated. Use `_SYSTEM/Scripts/math/yuri-energy-trace.mjs` to inspect the historical energy landscape.

## 3. Testing & Validation (Rebuild Rule)
To validate the energy gate, run the focused energy suites. Do NOT run arbitrary `PostToolUse` commands blindly.
```bash
# Verify the configuration and weights
node _SYSTEM/Scripts/math/yuri-energy-config.mjs --test
node _SYSTEM/SELF/energy-weights.json # Check schema validity

# Run core math and trace unit tests
node _SYSTEM/Scripts/math/yuri-energy.mjs --test
node _SYSTEM/Scripts/energy-tick-core.mjs --test

# Run the health observability sweep
node _SYSTEM/Scripts/energy-observability-health.mjs --test
```

## 4. Breaker & Rollback
If the energy gate enters a runaway state or begins rejecting valid commands (e.g., an incorrect $\eta$ classification):
1. **Engage Breaker:** Run `node _SYSTEM/Scripts/energy-breaker.mjs --trip` to temporarily bypass the dynamics gate.
2. **Diagnose:** Inspect `_SYSTEM/state/energy-ledger/` (or the equivalent local DB) using `energy-observability-health.mjs`.
3. **Rollback:** Revert `_SYSTEM/SELF/energy-weights.json` to the last known good commit.
4. **Restore:** Run `node _SYSTEM/Scripts/energy-breaker.mjs --reset` to re-engage the gate.

## 5. Adjacent-Organ Acceptance
Any organ (like MURE MoE reducers or fleet validators) relying on energy states must read from the deterministic outputs of `yuri-energy-trace.mjs` rather than intercepting the `PostToolUse` telemetry directly.
