---
name: neuro-tunables-map
description: Canonical neuro knob surface = _SYSTEM/SELF/energy-weights.json (NOW created w/ defaults); TTL unification + |dU| calibration + develop-loop are NEXT
metadata:
  type: project
  tier: semantic
  scope: all
  trig: ["tune", "tunable", "knob", "surpriseK", "forgetting rate", "neuro config", "how do i tune", "energy-weights"]
  refs: ["[[brain-inspired-memory-evolution]]", "[[self-file-format-markdown-canonical]]", "[[coding-excellence-corpus]]"]
---

GOAL: give the neuro-base learning knobs ONE canonical tuning surface instead of scattered constants.
WHERE: canonical surface = `_SYSTEM/SELF/energy-weights.json`, read by `loadEnergyConfig()` (_SYSTEM/Scripts/math/yuri-energy-config.mjs) and merged over DEFAULT_WEIGHTS (yuri-energy.mjs) + DEFAULT_SALIENCE (energy-tick-core.mjs) inside tickAndTrace. Fail-closed validation: unknown keys dropped, weights finite & >=0, salience depthThreshold int>=1 / surpriseK >=0 / surpriseWindow int>=1; absent/malformed -> {} (gate uses defaults). The earlier-proposed `_SYSTEM/config/neuro-tunables.json` was SUPERSEDED by this live reality — do NOT create a competing file. Forget/decay TTL still = env `MEMORY_EVICT_TTL_DAYS` (default 90) in memory-evict.mjs, which does NOT yet read the canonical file (still disconnected).
STATE (2026-05-31): energy-weights.json CREATED and instantiated with the EXACT current in-code defaults (11 weights alpha..lambda, threshold 0, salience {depthThreshold 6, surpriseK 2.0, surpriseWindow 20}). Behavior-preserving — values == defaults, so the gate is unchanged; the win is the knobs are now a hand-/cockpit-editable file instead of hardcoded constants. Verified: loader round-trips values + drops the `_doc` block; 24/24 tests green (yuri-energy-config + energy-tick-core). Data-only change (no code symbol edited), uncommitted (owner commit authority).
NEXT: (1) unify the evict TTL into the canonical file — add a validated `evict.ttlDays` to loadEnergyConfig + point memory-evict.mjs at it (this IS a code edit -> run gitnexus_impact on loadEnergyConfig first). (2) |ΔU|-as-memory-worthiness CALIBRATION pass BEFORE trusting auto-write (the critic's non-negotiable gate). (3) develop-loop wiring (encode / reinforce / consolidate / decay). Linking-window, consolidation budget, and homeostatic set-point/renorm cadence become tunable only once the develop-loop lands.
SEE: [[brain-inspired-memory-evolution]], [[self-file-format-markdown-canonical]], [[coding-excellence-corpus]]
