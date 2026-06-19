Confirmed. Sentiment goes to `overlaySignals` (line 662), but `combineSignals` (line 757) is fed `signals` only (the price-derived obs-* signals). Line 703: `snap.signals = [...signals, ...overlaySignals]` — overlays are recorded to snapshot telemetry but the sizing path uses `signals` alone. I have everything I need.

```
AGENT 12 — CROSS-CUTTING: vision↔reality gap map
SUMMARY: Of Marcel's 5 vision-components, 2 are THEATER (quantum, energy), 1 is HALF-BUILT-BUT-UNWIRED (news intel), 1 is WORKING-BUT-EDGELESS (market prediction), and HFT is FANTASY on this hardware; the real lever is maker-quoting + fee tier, not prediction.

GAP MATRIX (vision-component → status):
[B | CRIT | THEATER] orchestrator.mjs:703 — "Quantum prediction" = theater. snap.circuit=computeCircuit() is TELEMETRY ONLY; never read by combineSignals(L757) or sizing. quantum-ab-shadow.mjs records A/B calls but arming→sizing is "owner-gated" = never wired. FIX: delete circuit from sizing-adjacent code or wire circuit.ratio as a sizing confidence modulator behind a flag.
[B | CRIT | THEATER] orchestrator.mjs:14,339,899 — "YURI math base / energy gate" = theater. gateProposal ΔU is "advisory telemetry, NEVER blocks" (L14 comment). computeEnergyDelta fires but result discarded. FIX: either wire ΔU as a real trade-rejection gate or stop calling it a gate.
[B | HIGH | MISSING-PRINCIPLE] orchestrator.mjs:1247,1251 — "Market prediction learn loop" = DEAD. reevaluateFactors({apply:false}) = dry-run, never writes. Graduation R1→R2 metrics null (L1295) → fail-closed forever. "0 edge" verdict may be ARTIFACT of dead loop, not truth (the A11 keystone). FIX: wire apply:true nightly + recordOutcome→factor attribution.
[B | MED | DESIGN-FLAW] orchestrator.mjs:661-662,757 — "News intel" = HALF-BUILT. social-adapter.mjs + agentReachSentiment pull real Reddit/Exa/RSS news → sentimentToSignal → overlaySignals. But combineSignals(L757) fed ONLY price `signals`; overlaySignals recorded to snap, NEVER sized. FIX: route sentiment overlay into combineSignals or a multi-horizon rung.
[B | CRIT | DESIGN-FLAW] orchestrator.mjs:757 — "Market prediction" = WORKING-BUT-EDGELESS. combineSignals(signals,...) fuses ~24 correlated price-TA strategies → Brier≈0.255. Structural edge (funding L684, OFI, cross-asset L676) all pushed to overlaySignals, excluded from sizing. FIX: rewire real-edge signals into sizing; retire TA ensemble.
[A | CRIT | FANTASY] as-quote-live.mjs:9,332 — "HFT" = impossible on M2 Pro retail. INV-1 hard-bans real orders; no co-location; public WS ~90ms behind colocated act; queue position invisible. Real class = medium-frequency maker (~10s cycle). FIX: rename vision "automated quant trading," drop HFT framing.

HONEST REORDER (achievable → fantasy on M2 Pro retail Binance perp):
1. ACHIEVABLE: automated maker quoting at VIP3+ fee tier (current A-S stack; fee tier is the 3-5× lever, not prediction).
2. ACHIEVABLE: structural/funding/carry edge at 4h-8h horizon IF wired to sizing + learn loop closed.
3. ACHIEVABLE: news-sentiment overlay at 1h-4h horizon (social-adapter exists; needs NLP upgrade + sizing wire).
4. BORDERLINE: calibrated directional prediction (needs closed learn loop first to know if edge exists at all).
5. FANTASY: μs-HFT (hardware wall — co-location, FPGA, rebate tier required; structurally impossible here).
6. FANTASY: quantum prediction lifting returns (circuit is decorative; no proven return-link; no quantum advantage on classical sim).

SMALLEST HONEST PATH current→vision: (a) close the learn loop [apply:true + outcome attribution] to get TRUTH about whether any edge exists; (b) rewire the 3 real-edge signals (funding/OFI/cross-asset) into sizing; (c) route sentiment into a 1h rung; (d) park A-S maker as the income engine while prediction matures; (e) retire quantum/energy theater or wire it for real. Vision shrinks from "HFT+quantum+news prediction" to "medium-freq structural+sentiment edge, maker-income-subsidized" — which is what's actually buildable here.

VERDICT for slice: REDIRECT needed (not refactor — the vision itself is mis-scaled to hardware; the code is mostly honest, the ambition isn't).
MISSING quant principle in scope: CLOSED LEARN LOOP (outcome→factor attribution→reescore→graduation) — without it, "no edge" is unverified, not proven; everything downstream is built on unknown ground.
```