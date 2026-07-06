# 00 — MASTER BRIEF · Substrate Frontier-Grade Hardening

> Ground-truth anchor for a multi-stage, multi-spawn mission. Every spawn reads this FIRST.
> Status: LIVE. Owner: Marcel. Lane: Claude/Opus (nano-swarm orchestrator). Started 2026-06-14.

---

## 1. MISSION

Standing mandate (Marcel, 2026-06-14): I am the **nano-swarm agent over YURI's cognitive-gate substrate**. One job — drive its **integrity, validity, security, wiring, mechanisms** to frontier-lab engineering grade. Not a one-off task; a continuing mission resumed across sessions via this brief + the status log (§9).

The work proceeds at high scientific/mathematical rigor (Einstein/Tesla framing = depth + first-principles + provable correctness, NOT mythic branding).

## 2. FRAMING — the transfer thesis

The innovation engine is **cross-domain mechanism transfer** (YURI's core method): mine how the best chip shops and frontier AI labs actually engineer *correctness, reliability, and scale*, then port those mechanisms into the substrate. Each transfer is named as `source domain → target → shared mechanism → mismatch → confidence` and must survive contact with local evidence before it climbs from hypothesis to fact.

Seed mapping (already visible, to be refined by research):

| Frontier discipline | YURI substrate analog | Status |
|---|---|---|
| Clock-domain-crossing (CDC) guard | version-reader `assertSingleEra` (fail-closed cross-era pooling guard) | **already built** (v3 work) |
| Fault injection | `experiments/adversarial-probe.mjs` | already have |
| Ablation studies | `experiments/component-ablation.mjs` | already have |
| Held-out validation oracle | `math/math-proof-gate.mjs` (advisory→fact promotion bar) | already have |
| Reproducible/deterministic runs | `yuri-proving-run-repeatable.mjs` | already have |
| **Formal invariant proof** (∀-inputs, not example tests) | partial (proof-gate is per-formula) | **GAP** |
| **Cross-version equivalence checking** (LEC) | version-reader exists; no equivalence prover | **GAP** |
| **Coverage-driven verification** (functional coverage closure) | no input-space coverage meter | **GAP (likely)** |
| **Systematic fault campaigns / metamorphic testing** | probes are hand-authored, not campaign-driven | partial |
| **Wiring integrity** | xref flags "gate verdicts — no enforcement reader", "NOT wired to any live hook" | **GAP (verify)** |

### Reframe on "can't be replicated" (adversarial-ally note)
Un-replicability will NOT be pursued as secrecy/obscurity — that is brittle, bad engineering. What makes a system genuinely hard to clone is **verifiable depth + compounding rigor**: provable invariants, closed coverage, fault campaigns, equivalence-checked evolution. The moat is a side effect of correctness, not the goal. (Flag to owner if literal secrecy-moat was intended.)

## 3. SCOPE (explicit assumption — correct if wrong)

IN: the cognitive-gate math substrate —
`math/yuri-energy.mjs` (computeU), `claim-cortex.mjs`, `claim-ledger.mjs`, `claim-integrity-gate`, `energy-tick-core.mjs`, `math/math-proof-gate.mjs`, `math/math-kernel.mjs`, `math/energy-calibration-contract.mjs`, the `yuri-energy-*` calibration/analysis toolchain, `math/experiments/*`, trace (`yuri-energy-trace.mjs`), FSRS/phi/mdl/jaccard/minhash kernels, the circuitry wiring that connects them to live hooks.

OUT (unless owner expands): app/business surfaces, design system, sales, video, non-substrate skills.

## 4. VERIFIED LANE REALITY (census 2026-06-14)

- Repo root `/Users/marcelspatz/YURI-OS-MUSUBI`, branch `main`. ✓
- `_SYSTEM/Scripts/math/`: **38 mechanisms, 42 test files.**
- `yuri-energy.test.mjs`: **46/46 green** at baseline.
- Energy enforce: **DISARMED** (`_SYSTEM/state/energy-enforce.enabled` ABSENT). Stays disarmed.
- Working tree DIRTY: uncommitted **v3 (KL→Wasserstein-1) + confidence-coupling (μ)** diff + pre-existing offload-retirement churn (deleted command/hook files — NOT mine, do not touch). New work lands in NEW files to avoid tangling the uncommitted gate-core diff.
- `math-proof-gate.mjs` = held-out executable validation oracle (shannon-entropy / kl-divergence / cross-entropy impls), domain-blind promotion bar. Formal-verification seed.

## 5. HARD CONSTRAINTS (binding floor — non-negotiable)

- **No commit / no push** without explicit owner approval. The uncommitted v3+μ diff is NOT mine to land.
- **enforce stays DISARMED.** Barriers η/θ NEVER calibrated.
- **Gate-core behavior changes are owner-gated.** This mission produces verified proposals + observe-mode prototypes; arming/landing is Marcel's call.
- Protected paths off-limits: `backend/data/`, `.claude/state/`, `.claude/history/`, `.env`, `node_modules/`, `.amp/`. (`_SYSTEM/state/`, `_SYSTEM/SELF/` writable.)
- Research = **local-first** (`ai search` → `_SYSTEM/` corpus) THEN online; capture genuinely-useful synthesized+cited findings to `02_RESOURCES/RESEARCH/substrate-frontier-grade-2026-06-14/` and `ai reindex`.
- **Capability-first**: `capability-recall.mjs "<need>"` before building any primitive; register new mechanisms with `@capability` tags.
- Anthropic fan-out ≤15 agents, sonnet-pinned for research breadth (cost floor); Opus reserved for main-loop synthesis/architecture. Mimo + DeepSeek = peer lanes (background, cross-family verification), not capped sidecars.
- Every claim separated from evidence; advisory until local evidence verifies. Adversarially attack own output before "ready."

## 6. STAGED OWNER-GATED FLOW

- **Stage 0** — Ground + this brief + baseline census. *(no mutation)* ← IN PROGRESS
- **Stage 1** — Frontier-discipline research swarm: 6 research clusters + 1 local capability audit → a transfer map (each candidate scored, mapped, mismatch-named). Local-first then online deep research. Capture + reindex.
- **Stage 2** — Synthesize the upgrade architecture; rank candidates by EV × reversibility × blast-radius; **cross-family verify** the ranking (Mimo + DeepSeek, blinded). → design doc.
- **Stage 3** — Build + adversarially verify the high-value / low-risk upgrades as **observe-mode prototypes** (new files; tests; red-team). Owner gate before any arm/land.
- **Stage 4** — Wiring repair: close the "no enforcement reader" / "not wired to any live hook" gaps (observe-mode, owner-gated).

Gate between every stage: present evidence, get owner go before the next stage spends big or anything touches live behavior.

## 7. TARGETS (initial hypotheses — research refines)

T1 Formal invariant prover for computeU (monotonicity, sign-convention, boundedness, U-floor, per-term linear reconstruction) — ∀-inputs via property-based + counterexample search, beyond example tests.
T2 Cross-version equivalence-checking harness (logical equivalence across formula eras; prove a refactor preserves semantics; the LEC analog of the version-reader).
T3 Coverage-driven verification: an input-space / component-activation coverage meter that finds untested regions and closes holes.
T4 Fault-campaign runner: systematic + metamorphic fault injection (generalize hand-authored probes into a campaign with coverage feedback).
T5 Redundancy / cross-check: independent redundant decision path (ECC/TMR analog) for high-stakes verdicts.
T6 Security threat model + Goodhart/gaming-resistance audit of the gate (adversary cannot cheaply evade or game).
T7 Wiring-integrity census + repair plan (enforcement-reader, live-hook coverage).
T8 Scalability analysis: algorithmic scaling of the gate as #claims / #components / #eras grow; incremental/compositional verification.

## 8. SPAWN PROTOCOL

- Every spawn reads THIS brief first.
- Research agents: local-first (cite YURI internals actually read), then online (cite URLs), return bounded structured synthesis (per-candidate: NAME · what · source→target · shared mechanism · mismatch · confidence · concrete YURI deliverable). ≤~80 lines. Final message IS the deliverable (data, not chat).
- No mutation by research agents. Advisory until verified.
- Orchestrator (me) synthesizes returns → research doc → reindex → Stage 2.

## 9. STATUS LOG (append-only)

- 2026-06-14 — Stage 0 opened. Census captured (§4). Scope assumption stated (§3). Brief written. Next: launch Stage 1 swarm (6 research clusters + 1 local audit, sonnet-pinned).
- 2026-06-14 — Stage 1 DONE: 7 lanes returned (R1–R6 + L1 audit) → transfer map in `01-research-synthesis.md`. Stage 2 DONE: ranked A–L by EV×reversibility×blast-radius; Mimo + DeepSeek blinded cross-family verify. Three-way convergence: **A unanimous top-2**; both peers flag the heaviest gate-core items overrated (Mimo→L, DeepSeek→J) → DEFER L+J. Two real gaps the framed swarm missed: **M** (shadow-mode safe-shipping), **N** (operator-labeled ground-truth corpus).
- 2026-06-14 — KEYSTONE confirmed on HEAD by 2 independent lanes (R6 + L1): the per-claim non-offsettable identity veto (`gateClaimTransition`) is BUILT+TESTED but TEST-ONLY — no live enforcement reader. DeepSeek ranked wiring it (E) #1. OWNER-GATED.
- 2026-06-14 — Stage 3 STARTED: **Candidate A SHIPPED + ADVERSARIALLY VERIFIED** — `_SYSTEM/Scripts/math/yuri-energy-invariants.mjs` (∀-input property prover for computeU: 9 invariants — reconstruction, finiteness, 3× monotonicity, sign-convention, U-floor, barrier-dominance, weight-isolation). 9/9 hold over 72k property checks; 4/4 planted mutants caught by exactly the invariants they break (non-vacuous). 51 tests green (5 new + 46 core). Registered in MATH-SCIENCE-MANUAL.md (register-first closure law honored). Incidental finding: computeU fail-closes on negative weights. enforce DISARMED; nothing committed.
- 2026-06-14 — AWAITING OWNER STEER: (a) continue Tier-1 additive instruments autonomously (D coverage meter → C cross-era equivalence → G contamination seal → B metamorphic campaign → I DbC+scan, all observe-mode/reversible), OR (b) prioritize owner-gated keystone E (wire identity veto, observe-mode) + H (resolved-outcome log) + M/N. Defer L+J per both peers.
- 2026-06-14 — OWNER CHOSE "both: E first, then Tier-1".
- 2026-06-14 — **KEYSTONE E WIRED (observe-mode, LIVE-PROVEN)**: `_SYSTEM/Scripts/claim-transition-observer.mjs` gives `gateClaimTransition` its first runtime caller, wired ADVISORY into the already-live `prose-claim-extract` PostToolUse hook (the v2 prose-claim source its own docblock named as the correct seam). Caps disabled (observe-only), NEVER blocks, hook exit-0/fail-open preserved; RETRACT-gated so the O(ledger) double cortex-snapshot only runs when an over-claim exists. 75 tests green (5 observer + 70 cortex). End-to-end smoke: a fake over-claim write made the identity veto FIRE in observe-mode (2 claims 0→5, advisory) + write a JSONL trace (`_SYSTEM/state/claim-transition-trace.jsonl`) — proven non-vacuous. HONEST: wiring to the v1 fixture tick ledger would've been dead code (per the veto's docblock); the prose-claim path is the live seam where it bites. Arming the block = owner's separate step. enforce DISARMED, uncommitted.
- 2026-06-14 — Now executing Tier-1 per owner: D (coverage meter) next.
- 2026-06-14 — **Tier-1 D SHIPPED+VERIFIED**: `_SYSTEM/Scripts/math/yuri-energy-coverage.mjs` — UVM-covergroup coverage meter over computeU's 12 contribution keys (sign-aware bins, per-component holes, overall %, cross-coverage over 3 key pairs). Registered in manual. **Caught + fixed its OWN measurement bug pre-ship**: the 3 always-emitted keys (protectedPathViolations/promotionLadderInversions/verifiedEvidenceCredit) can't be 'absent' → counting it was a permanent false hole deflating coverage; honest denominator now drops it. FINDING: the random generator exercises only ~40% of reachable bins → coverage-closure worklist (skip/'absent' paths, extreme-value bins, malformed/stale paths under-exercised by genState; some value-bin holes are structural, e.g. entropy 'med'/'large' unreachable for ≤6 classes at α=1). 671 tests green (full math+cortex+observer sweep).
- 2026-06-14 — CHECKPOINT. Shipped this session (all observe-mode, reversible, UNCOMMITTED, enforce DISARMED): research foundation (7 lanes + 2 blinded peers) + **A** (invariant prover) + **E** (identity-veto observe-wiring, live+proven) + **D** (coverage meter). Tier-1 remaining: C → G → B → I. Owner-gated pending: arm E's block · H · M · N. Defer L+J.
- 2026-06-14 — OWNER: commit+push approved; DeepSeek+Mimo to build as peers at max reasoning; red-team EVERYTHING after all waves.
- 2026-06-14 — COMMIT staged clean (A+E+D + research + memory, 11 files, explicit pathspec; v3+μ untouched) but BLOCKED by pre-existing protected-path stray `_SYSTEM/Scripts/math/.claude/state/session-checkpoint.json` tripping the repo-wide root-arch pre-commit gate. Claude is policy-barred from touching any `.claude/state/` path (guard denies it). OWNER must clear: `rm -rf "_SYSTEM/Scripts/math/.claude"` (real repo-root .claude/state untouched) OR greenlight `git commit --no-verify` (secret-scan already passed clean). ROOT CAUSE (substrate follow-up): `.claude/hooks/session-checkpoint.js` writes a cwd-relative `.claude/state/` path → breeds stray nested copies; should be repo-root-anchored.
- 2026-06-14 — PEER WAVE returned. **I (Mimo peer-built, Claude-verified) SHIPPED+VERIFIED**: `_SYSTEM/Scripts/math/yuri-energy-contracts.mjs` — Design-by-Contract layer (C1 finite · C2 sum==U · C3 U-floor · C4 known-keys · C5 credit-signs · C6 barrier-dominance + W-* weight preconditions), {assert:true} opt-in throw. 24/24 tests green; standalone (no gate imports → zero regression surface); registered in manual. **C (DeepSeek peer-built) DEFERRED — verifier finding**: the LEC/DRT scaffold is good (Spearman ρ + tail-quartile agreement + sign-flipped-drift negative control) BUT the property is BARRIER-CONFOUNDED — genState's eta=100 barrier swamps β·W₁≤~10, so full-U ordinal correlation passes trivially and the sign-flip control likely won't be caught. Also v2(KL)/v3(W₁) are INTENTIONALLY non-equivalent on drift (KL saturates, W₁ distance-aware), so an honest property must verify agree-on-clear-cases + the intended divergence, not blanket ρ>0.90. Raw build saved /tmp/ds-build-C.out; refine with a drift-isolating generator next pass. NOT written to disk/registered.
- 2026-06-14 — VERIFIED TALLY: A,E,D,I shipped+verified (4 instruments). NEXT: clear commit blocker → push A+E+D+I → refine C → build G+B → red-team EVERYTHING → arm-E/H/M/N owner decisions.
- 2026-06-14 — COMMIT+PUSH wave 1 DONE: main a2fc0b84 (A+E+D+I, 14 files). Owner cleared the protected-path stray; root-arch + capability-registry gates reconciled (capabilities.json +4 caps).
- 2026-06-14 — **C SHIPPED+VERIFIED** (DeepSeek-built, Claude-refined): barrier-confound FIXED via `genDriftState` (drift-isolated → pure-drift U). Honest property: GATE on co-ranking (ρ=0.815 ≥ 0.5) + zero-drift exactness (v2==v3==0) + negative-control caught (sign-flip ρ_v3=−1.0, ρ_v2=−0.81 ≤ −0.5); REPORT the intended divergence (top-tail 60.8% = W₁ reorders where KL saturates; bottom-tail 81.6%). Full-state ρ=0.9999 retained as evidence of the confound. 6/6 C tests, 701/701 full sweep. FINDING worth keeping: v2(KL)↔v3(W₁) co-rank 0.815 but diverge ~40% on the high-drift tail — the distance-awareness gain, quantified. VERIFIED TALLY now A,E,D,I,C (5). NEXT: G + B → red-team EVERYTHING.
- 2026-06-14 — C committed+pushed (main 84f5105a, 6 files). **G SHIPPED+VERIFIED**: `_SYSTEM/Scripts/math/yuri-energy-corpus-seal.mjs` — calibration-corpus contamination seal (order-independent + content-sensitive SHA-256; sealCorpus/assertCorpusSeal/verifyCorpusSeal). 7/7 tests + CLI smoke (reorder intact; tamper/add/remove all detected). ADVISORY primitive — wiring into scoreRealData is the owner-gated step. VERIFIED TALLY A,E,D,I,C,G (6). B (metamorphic campaign) building on DeepSeek (bg). NEXT: integrate B → RED-TEAM EVERYTHING.
- 2026-06-14 — **B SHIPPED+VERIFIED** (DeepSeek-built, Claude-verified+fixed): `_SYSTEM/Scripts/math/yuri-energy-metamorphic.mjs` — 6 metamorphic relations (MR-scale/permute/ceiling-idempotence/additivity/prediction-symmetry/drift-monotonicity) + coverage-fed campaign + counterexample shrinker + per-MR planted mutants. Campaign 11,581 checks / 0 violations; all 6 mutants caught by their TARGET MR. THREE Claude-fixes on the peer draft (advisory-until-verified earning its keep): (1) invalid hex literal `0x5HR1NK` blocked module load; (2) `permute-breaker` mutant used a permutation-INVARIANT `keys.length` bias → never caught by MR-permute → fixed to a position-weighted bias; (3) `runMutationCheck` re-derived each MR check inline and DRIFTED (mis-attributed the drift/ceiling mutants) → refactored to dependency-injection that runs the REAL `mr.check()` against the injected mutant. B test 7/7, full sweep 715/715.
- 2026-06-14 — **ALL 7 TIER-1 INSTRUMENTS DONE + VERIFIED**: A (invariant prover) · E (identity-veto observe-wiring) · D (coverage meter) · I (DbC contracts) · C (cross-era equivalence) · G (contamination seal) · B (metamorphic campaign). Plus session-checkpoint.js root-cause fix (cwd→repo-root anchor, stops stray-breeding). G+B+hook-fix STAGED + verified, blocked only on the 1 protected stray `_SYSTEM/Scripts/.claude/state/session-checkpoint.json` (root cause now fixed → last recurrence). NEXT: owner clears stray (or --no-verify) → commit → RED-TEAM EVERYTHING (the final owner directive) → arm-E/H/M/N owner decisions.
