All evidence collected. The confluence weights are STATIC (hardcoded `DEFAULT_WEIGHTS` with 1w=0.30 dominant), not regime-conditional. Horizon-ladder is only referenced in comments/oracle text in the orchestrator — never actually called in the live cycle (only imported by `trade-edge-audit.mjs`).

```
AGENT 04 — Multi-TF + regime + horizon gate
SUMMARY: Every A04 module is correctly built but DISARMED-by-default and un-wired to live sizing; confluence is a parallel weighted-average (NOT hierarchical veto), weights are STATIC not regime-conditional, regime TRIMS (not freezes), and horizon-ladder is never invoked in the cycle.

[B | CRITICAL | DESIGN-FLAW] orchestrator.mjs:759 — confluence read is gated behind `oc.confluence` (env OBSERVATORY_CONFLUENCE=1), default false; the ENTRY-GATE (line 861) is a SEPARATE second env arm OBSERVATORY_CONFLUENCE_GATE=1. Neither armed in overseer-config.json → confluence is pure dead code at runtime. FIX: arm confluenceGate=true after shadow-ledger proves edge, OR delete.

[A | HIGH | BUG] multi-tf-confluence.mjs:241 — `computeConfluenceFromBars` is a WEIGHTED AVERAGE across all TFs (Σ wᵢ·scoreᵢ / Σ active wᵢ), NOT a hierarchical higher-TF VETO. Marcel's "parallel not sequential" is misdiagnosed: it is actually the OPPOSITE problem — a strong 1m/5m can OUTVOTE a weak-but-correct weekly. The brief's "hierarchical veto" does not exist in the code. FIX: if hierarchical is desired, gate by weekly/4h sign BEFORE blending.

[B | HIGH | DESIGN-FLAW] multi-tf-confluence.mjs:43 — `DEFAULT_WEIGHTS` (1w=0.30, 4h=0.25...) are STATIC and regime-INDEPENDENT. In a ranging regime, 1w trend weight is noise; in a trending regime, 1m weight should ~0. The weights never adapt to `classifyRegime` output. FIX: regime-conditional weight table (trending→top-heavy, ranging→flatten long TFs).

[B | HIGH | DESIGN-FLAW] multi-horizon-gate.mjs (selectHorizon) — armed only via env OBSERVATORY_MULTI_HORIZON=1 + oc.edgeGate=true (orchestrator.mjs:881); default off. Live overseer-config has edgeGate:true but multiHorizon NOT set → runs the LEGACY single-horizon √5 path. The 3-5-horizon gate Marcel asked for is unbuilt-in-practice. FIX: set multiHorizon=true in overseer-config OR arm env.

[B | MED | MISSING-PRINCIPLE] horizon-ladder.mjs — `scoreLadder`/`writeLadderWeights` are NEVER called by the orchestrator (grep: only referenced in comments L684/L794; only imported by trade-edge-audit.mjs:15). Per-horizon ensemble weights are computed nowhere live. FIX: wire a periodic beat to scoreLadder → ensemble-weights-ladder.json → feed combineSignals per-rung weights.

[C | LOW] orchestrator.mjs:844-845 — regime TRIM (not FREEZE) is correctly implemented: `regimeTrim = oc.regimeGate ? min(1, regimeTrimFactor) : 1` multiplies notional; brief's "does regime ever TRIM not FREEZE" = YES, but regimeGate is default false so it never fires. FIX: none (correct by design); arm regimeGate if instability-trim desired.

[C | LOW] regime-breaker.mjs:88 (as-quote-live) + as-baseline.mjs:398 — the ONLY A04 module actually LIVE-wired; correctly consumed in the A-S maker stack (z-score halt/widen). The brief's regime-detector.mjs (factor-circuit commutativity shift, orchestrator.mjs:47 import) feeds snap.regime.recommendation but is NOT in the live cycle path (snap.regime set only when confluence armed). FIX: none.

VERDICT for slice: REDIRECT needed — code is sound but the entire A04 surface is telemetry-only / DISARMED. The multi-horizon gate is the single highest-leverage rewire (forces long-horizon trades that clear fees) but is un-armed; horizon-ladder is pure dead code; confluence is mislabeled (parallel-blend, not hierarchical veto) and uses static weights.
MISSING quant principle: regime-conditional weight adaptation (trending vs ranging should re-weight TF hierarchy) — absent in code.
```

RESULT_LABEL: 04GL_MULTI_TF_REGIME_HORIZON_AUDIT_P_READONLY