# Wave-2 Resume Checkpoint (2026-06-19) — IN FLIGHT

> Context hit 60% mid-wave → compacted. Peers run detached during compact. Read this FIRST on resume.

## STATE
- Guard: pwd=repo root, branch=`main`. (HEAD was e0a99036 at wave-2 start; re-verify on resume — a parallel
  voice session landed kokoro/voice commits, disjoint from this work.)
- Wave-1 audit DONE + committed (d495d02f): `02_RESOURCES/RESEARCH/trading-audit-2026-06-19/01-AUDIT-PLAN.md`.
  Verdict = STRATEGIC REDIRECT; ranked path #0 Coinbase→#1 learn-loop→#2 funding-carry→#3 Kelly→#4 parallel
  →#5 calibrate→#6 cut-theater→#7 news→#8 stats.

## WAVE-2 MISSION (owner 2026-06-19)
"Launch next wave, refine+extend the trading platform to get it functional — FIRST gather more context on
what we're effectively MISSING. Run several quantum simulations + calculations, compare how professionals
trade (indicators/factors), how many effective trading agents 24/7 each owning roles. Do it together with
5 GLM-5.2 peers at xhigh reasoning, work side by side."
→ Wave-2 = CONTEXT + SIMS + PRO COMPARISON (NOT the build yet). Build (#7 Coinbase scrap + redirect path)
comes after this wave informs it.

## DELIVERABLES WRITTEN (uncommitted, in wave2/)
- `wave2/00-MASTER-BRIEF.md` — read-first brief all peers consume (mission, constraints, output format).
- `wave2/prompts/P1..P5.txt` — the 5 peer prompts.

## 5 GLM PEERS — DISPATCHED, RUNNING DETACHED (bg-NO-tee, `--reasoning xhigh`, staggered 0/8/16/24/32s)
| Peer | Lane | bg task ID | output | stderr |
|---|---|---|---|---|
| P1 | pro-benchmark (how pros trade, indicators/factors that survive DSR, Binance fee tiers) | bfxe4rrd2 | wave2/out/P1.md | wave2/out/P1.err |
| P2 | factor orthogonality + effective-N audit | b3vmbhva9 | wave2/out/P2.md | wave2/out/P2.err |
| P3 | agent topology / role design (how many agents 24/7, role matrix, messaging, latency) | bswt7a719 | wave2/out/P3.md | wave2/out/P3.err |
| P4 | quantum order-effect sim (collinear vs orthogonal circuitQuality) | b3n649kf9 | wave2/out/P4.md | wave2/out/P4.err |
| P5 | edge/Kelly/capacity/fee calc sheet (does the math close, honest monthly expectancy) | bxjgii881 | wave2/out/P5.md | wave2/out/P5.err |

Check status: `ls -la 02_RESOURCES/RESEARCH/trading-audit-2026-06-19/wave2/out/` (files appear as each
lands; `.err` empty/non-EPIPE = healthy). TaskOutput on the bg IDs also works. **VERIFY every load-bearing
peer claim locally** (lanes over-claim — precedent 18/19 reported done w/ 0 edits).

## MY OWN INDEPENDENT SIM (Claude/main cross-check of P4) — HALF-RUN, NEEDS 1-LINE FIX
- Harness: `/tmp/yuri-quantum-sim.mjs` (READ-ONLY; imports factor-return-vectors + factor-circuit from _SYSTEM).
- **FAILED ONLY because `timeout` is not on macOS** (command-not-found; sim never ran, no harm).
- RE-RUN: `node /tmp/yuri-quantum-sim.mjs` (drop `timeout 120`; the harness self-times, ~5-10s).
- Tests: (A) LIVE config (obs-momentum + obs-vol-regime on 200 GBM bars) → cosine + commutatorNorm +
  circuitQuality.ratio, 4 sub-cases; (B) orthogonal synthetic AR(1) factors at rho 0/0.3/0.8; (C) sensitivity
  sweep: ratio vs pairwise cosine [0→1.0].
- **LOAD-BEARING QUESTION it answers:** Is audit A10's "circuit ratio=1 by construction (obs-momentum +
  obs-vol-regime are near-parallel)" TRUE? I traced that the live path DOES inject real vectors
  (`computeCircuit` orchestrator.mjs:360-381 → `circuitInputFromBars` :366 → `opts.vectors`). obs-momentum
  vector = sign×log-returns×conf; obs-vol-regime = sign×(high−low)×conf. These are DIFFERENT series
  (signed returns vs always-≥0 range) → likely NOT collinear → **A10 may be an OVER-CLAIM (ratio≠1).**
  The sim settles it empirically. This directly informs the quantum cut-vs-wire ruling (#6).

## KEY GROUND-TRUTH (verified this wave, re-usable)
- `computeCircuit` orchestrator.mjs:360 — filters `obs-*` + `side!=='flat'`, injects REAL vectors, FAIL-OPEN.
  Only price-derived obs-* signals carry a return-vector mapping; perp/social overlays → zero vectors (excluded).
- factor-circuit `circuitQuality.ratio` = quantumScore/classicalScore (meanOrderingScore = honest random-order
  baseline, same k-fold units). allCommute → ratio=1 by construction (degenerate short-circuit, no fake lift).
- `factorVector` metadata embedding (category one-hot + cluster + inputs + tier) is the FALLBACK when no real
  vectors; real vectors win when count+dim valid (buildCommutativityMatrix injectionValid check).
- computeLiveSignals orchestrator.mjs:231 → exactly 2 obs-* signals (momentum EMA5/10, vol-regime ATR),
  then computeAllStrategies (the ~24 TA). Only the 2 obs-* feed the circuit (strategies aren't obs-* prefixed).

## TASKS
- #9 (dispatch peers) → mark completed (dispatched, running).
- #10 (own sims+calcs) → in_progress: quantum sim half-run (re-run node cmd); Kelly/fee/capacity calcs NOT
  started yet — do after sim (cross-check P5).
- #11 (synthesize "what we're missing" → wave2/02-WAVE2-MISSING-CAPABILITIES.md + commit) → pending.
- #7 (Coinbase scrap) → pending, BUILD step, owner-gated go (NOT this wave).

## NEXT ON RESUME (in order)
1. `git branch --show-current` (guard) + `ls wave2/out/` (peer status).
2. `node /tmp/yuri-quantum-sim.mjs` — get the ratio=1 verdict (settles A10).
3. Read each landed out/P*.md; verify load-bearing claims locally; note over-claims.
4. Run my own Kelly + fee-tier + capacity calcs (cross-check P5): quarter-Kelly f* at 55%/Sharpe 0.5;
   Binance VIP0-9 maker/taker bps (cite official doc); correlation-adjusted gross cap vs configured 6.0;
   M2-Pro WS msg-rate capacity; A-S maker edge per tier (confirm/refute "VIP0 −2.16bps/fill").
5. Synthesize `wave2/02-WAVE2-MISSING-CAPABILITIES.md` (missing-capability map + pro benchmark gap +
   agent-role matrix + sim verdicts + refined ranked path). Commit explicit pathspec `wave2/`, show-stat, push.
6. Hand the verdict + decision point to Marcel (start build #0+#1, or revise).

## HARD CONSTRAINTS (persist)
- READ-ONLY audit/sim on the repo this wave (no _SYSTEM/ edits until build wave; build is owner-gated).
- Commit/push OWN work only: explicit pathspec (`git add <paths>` + `git commit -m msg -- <paths>`),
  never `git add .`/bare commit; show-stat before push; fetch+FF never force.
- No Workflow tool (binding memory) — GLM nano-swarm via `ai llm glm-5.2` + native Agent for any Sonnet fan-out.
- Online = verification layer for external claims (≥2 primary, cite+date); local exec = ground truth for our code.
