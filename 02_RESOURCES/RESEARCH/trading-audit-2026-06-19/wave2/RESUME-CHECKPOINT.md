# Wave-2 Resume Checkpoint (2026-06-20) — ALL 5 PEERS DONE + VERIFIED + FOLDED · AWAITING BUILD GREENLIGHT

> Compacted 2026-06-20. Read this FIRST on resume.

## STATE
- Guard: `pwd=/Users/marcelspatz/YURI-OS-MUSUBI`, `branch=main` (verified 2026-06-20 05:52 CEST).
- **Wave-2 peer cross-check committed + pushed: `59a4d2b3`** (origin/main, FF). Doc: `02_RESOURCES/RESEARCH/trading-audit-2026-06-19/wave2/02-WAVE2-MISSING-CAPABILITIES.md` (+ §11 peer cross-check; lane outputs `out/P1.md`, `out/P2.md`, `out/P5.md`).

## PEER LANES — FINAL STATUS
| Peer | Lane | Status |
|---|---|---|
| P1 | pro-benchmark | ✓ verified clean (212 lines); 3 crux claims confirmed locally (funding-carry unwired @ orchestrator:130; computeFundingPriceReaction test-only callers; k[9] taker-buy dropped @ perp-adapter mapKline:396). Committed. |
| P2 | factor orthogonality | ✓ committed (`7c82e3d6`). |
| P5 | edge/Kelly/capacity calc | ✓ verified clean (122 lines); every number checked (Kelly 10%/2.5%, corr-adj divisor 2.6 / eff-N 1.15, funding 0.003%/8h→3.28%/yr, break-even 37.8d, maker κ-tier). Committed. |
| P4 | quantum order-effect | replaced by own sim §3 (`/tmp/yuri-quantum-sim.mjs`): ratio 1.08–1.99, non-monotone in cosine, noise-dominated. A10 mechanism refuted, conclusion survives. |
| P3 | agent topology | ✓ **verified clean** (3rd scoped re-attempt @ `high` solo, 18.9KB, 4 primary citations: LMAX/Thompson/Aeron/arXiv). **Highest-quality lane of the five** — REFUTED 3 points of §7: (D1) A2 must be a *pre-trade* gate at the egress seam, not a reactive killer; (D2) hot bus = lock-free `SharedArrayBuffer` ring NOT SQLite; (D3) supervision/OMS/drop-copy missing. Folded into §7/§8/§9/§10/§11. |

**4 verified deltas P1/P5 added (doc §11):** (1) sizing fix → **~26–42× portfolio basis** (was "~78×", mixed per-bet with the portfolio cap; eff-N 1.15); (2) maker blocker = **κ not fee tier** (negative at every VIP incl. VIP9 at retail κ); (3) live funding **0.003%/8h = 3.28%/yr** (confirms "+5–15%/mo" is per-year, 20–61× overstated); (4) new gaps VPIN/BH-FDR/PBO-CSCV/k[9]/GTX-maker/OI-feed/5–10d-momentum/purged-k-fold + primary citations (Harvey-Liu-Zhu 313→9, Cont-Kukanov OFI R² 65–87%, Dobrynskaya 1–2wk).

## GREENLIGHT READY — the live decision point
P3 returned, **verified locally** (critiqued §7, not rubber-stamped; 4 real primary citations; every refutation sound), and folded into §7/§8/§9/§10/§11. **All 5 peers done.** The complete picture is committed (see below).
**Next = Marcel green-lights the BUILD wave** (his gate, verbatim: *"I give the greenlight once they return and we have a full picture"*). On greenlight → fire the **self-gov batch first** (class-A measurement, no live-output change):
1. Wire the dead `scoreForecasts` + cost cliff → edge readout on the **574k existing forecast rows** (answers "do we have a net edge?" in minutes).
2. Cut hot-loop theater (`computeCircuit`/`computeEnergyDelta`/legacy √5/zombie-conformal — read by nothing).
Then owner-gated: route `computeSize`→crypto (#1, kills 600% gross) · wire 5 orthogonal sources (#3) · `apply:true` promote beat (#8, currently DEAD not gated) · scrap Coinbase (#7).

## BUILD WAVE (next, owner-gated) — ranked path (doc §8)
- **Self-governable first move:** wire the dead `scoreForecasts` + cost cliff → edge readout on **574k existing forecast rows** (answers "do we have a net edge?" in minutes, class-A measurement, no live-output change). `scoreForecasts` exists + leak-free + NEVER CALLED (dead import in `strategy-weights.mjs`).
- **Then (self-gov):** cut hot-loop theater — `computeCircuit` (orchestrator:703,990) + `computeEnergyDelta` (:899,1009) + legacy √5 multi-horizon (:866-897) + zombie `yuri-energy-conformal.mjs`. Read by nothing = pure win.
- **Owner-gated after:** route `computeSize`→crypto (#1, kills the 600% gross); wire 5 orthogonal sources (#3); `apply:true` promote beat (#8, currently DEAD not gated).
- **Task #7 (pending, owner-gated BUILD):** scrap Coinbase entirely (delete coinbase-adapter, kill `PERP_MODE` conditional orchestrator:426, repoint tick-stream→Binance, drop Coinbase fee tiers maker-fill-sim:31).

## OWN SIM HARNESSES (execution-verified, `/tmp`, READ-ONLY on repo, re-runnable)
`/tmp/yuri-quantum-sim.mjs` (A10 verdict) · `/tmp/yuri-edge-calc.mjs` (Kelly/carry/maker) · `/tmp/yuri-growth-ruin.mjs` (€300→€10k MC, 20k paths) · `/tmp/yuri-edge-power.mjs` (trades-to-significance).

## OPEN HOUSEKEEPING
- Two of Marcel's detached claude sessions look hung — **43032** (glm-4.7, 12h, 0% CPU) + **69011** (glm-5.2, 6.5h, 0% CPU) — his call to kill. **18239** (glm-4.7, 11.4% CPU) is ACTIVE — leave it.
- Memory updated: `feedback-glm-zai-build-lane` now captures the **`xhigh`→z.ai-transport-crash linkage** (ECONNRESET/OOM/socket-stall under concurrent nano-swarm; evidence 3/5 crashed @ xhigh, 2/3 clean @ high; owner correction "stick with high").

## HARD CONSTRAINTS (persist)
- Wave-2 was READ-ONLY on `_SYSTEM` engine code; the BUILD wave is owner-gated (Marcel green-lights after P3).
- Commit/push OWN work only: explicit pathspec (`git add <paths>` + `git commit -m msg -- <paths>`), NEVER `git add .`/bare commit; `git show --stat HEAD` before push; fetch+FF never force.
- No Workflow tool (binding memory `feedback-no-workflow-tool-use-agent-only`) — GLM nano-swarm via `ai llm glm-5.2` (default `--reasoning high`, NEVER `xhigh` for concurrent fan-out); native `Agent` (model:sonnet) for Sonnet fan-out.
- Online = verification layer for external claims (≥2 primary, cite+date); local execution = ground truth for our code.
- GLM peers: verify EVERY claim locally (lanes over-claim); bg-NO-tee; **exit-0 ≠ success — read the artifact**.
