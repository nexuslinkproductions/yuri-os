# 01 — RESEARCH SYNTHESIS · Frontier-Discipline Transfer Map

> Stage 1 output → Stage 2 input. Consolidates 6 research lanes (R1–R6) + 1 local capability audit (L1).
> Status: peer cross-family verification (Mimo + DeepSeek, blinded) RUNNING at write time — §6 folds in on return.
> All findings ADVISORY until local evidence verifies. Captured for `ai reindex` (local-first mandate).

---

## 0. LOCAL CAPABILITY GROUND TRUTH (L1 audit — capability-first)

What YURI ALREADY has, so we extend not rebuild. Verdicts on HEAD (`main`):

| Need | Verdict | Evidence |
|---|---|---|
| T1 formal / ∀-input invariant proving | **PARTIAL** | `math/math-proof-gate.mjs` (`runFormulaProofGate`, `runFormulaCounterexample`) = per-formula held-out oracle; no ∀-quantifier / PBT over computeU |
| T2 cross-version equivalence checking | **PARTIAL** | `energy-calibration-contract.mjs:196` `assertSingleEra` = fail-closed CDC guard; no semantic equivalence prover |
| T3 input-space coverage measurement | **GAP** | nothing; `formula-foundry.mjs` is a type-checker, not a coverage meter |
| T4 fault campaigns / metamorphic | **PARTIAL** | `experiments/adversarial-probe.mjs` (9 hand-authored scenarios) + `component-ablation.mjs`; no campaign runner, no metamorphic engine |
| T5 redundancy / verdict cross-check | **GAP** | single PDP→`gateProposal`→breaker PEP path; no independent 2nd path |
| T6 security / gaming-resistance | **PARTIAL** | fail-closed props verified (poison→ceiling, breaker coerces corrupt→CLOSED); no structured threat-model doc |
| T7 wiring integrity | **PARTIAL** | energy/tick/enforce chain WIRED; **claim-integrity-gate NOT wired as enforcement** (see §1) |
| T8 scalability analysis | **GAP** | no complexity characterization; caps (LEDGER_CAP=40, CAP=50) hold it O(1) by construction |

Baseline: 38 mechanisms, 42 test files, 46/46 energy-core green, enforce DISARMED.

---

## 1. KEYSTONE FINDING (dual-confirmed, independent, load-bearing)

**The per-claim non-offsettable identity veto (`gateClaimTransition`) is BUILT + TESTED but TEST-ONLY — no live enforcement reader.**

- R6 (independent code read): `claim-cortex.mjs:52` + `929–938` — identity veto is test-only until the v2 prose-claim ledger; partition/swap attacks pass the *live* path without hitting the per-claim floor.
- L1 (independent audit): grep of all `.claude/hooks/` for `scanClaimIntegrity`/`claimIntegrityGate`/`claim.integrity` → **zero hits**. `claim-integrity-gate.mjs` is imported only by `yuri-closeout.mjs` (manual EOT) — no PreToolUse/PostToolUse enforcement reader. The energy/tick/enforce chain IS wired; the claim-integrity verdict is NOT.

This is the brief's suspected "no enforcement reader" gap, now **confirmed on HEAD**. It is the highest-value *wiring* repair (T7) — but it is gate-core wiring → **owner-gated, observe-mode first.**

Companion (R6): the `unsupportedMass` sub-RETRACT floor that catches shallow-partition fabrications below the RETRACT depth is **advisory only** (`claim-cortex.mjs:1006–1009`) — promoting it to enforcing closes the partition class that sits under the identity veto.

---

## 2. CONVERGENCE — and the honest caveat

**Strong cross-lane convergence** (candidate → lanes that independently surfaced it):
- **PBT / ∀-input invariant harness** → R1, R2, R4, R5 (4 lanes)
- **Metamorphic suite + fault campaign runner** → R1, R2, R3, R4, R6 (5 lanes)
- **Cross-era equivalence (LEC / differential random testing)** → R1, R2, R5 (3 lanes)
- **Coverage meter** → R2, R3, R6 (3 lanes)

**CAVEAT (BLIND-THE-FLEET):** I authored the 6 cluster prompts and seeded the words "property / metamorphic / equivalence / coverage" into several — so cross-cluster agreement is *partly my framing echoing back*, NOT pure independent convergence. I am NOT counting the echo as proof. What is genuinely independent evidence and therefore weighted: the **code-level confirmations** — the wiring gap (§1, two lanes, line refs), `cortexSnapshot` O(C×E) with a double-fold in `gateClaimTransition` (R5), the R6 threat-model line references, the L1 GAP/PARTIAL verdicts. Mechanisms stand on those, not on vote-count.

---

## 3. CONSOLIDATED CANDIDATE ROSTER (deduped A–L)

| ID | Candidate | Target | Blast radius | Reversibility | Gate |
|---|---|---|---|---|---|
| A | PBT / k-safety invariant harness for computeU (monotonicity, sign, boundedness, U-floor, per-term reconstruction, barrier-dominance) | T1 | **zero** (new test file, reads gate, changes nothing) | full | none |
| B | Metamorphic-relation suite + coverage-fed fault campaign (generalize the 9 probes) | T4 | zero (new experiment file) | full | none |
| C | Cross-era equivalence checker via differential random testing (v2 KL vs v3 W₁; verdict-ordering, not bit-equality) | T2 | zero (new harness) | full | none |
| D | Input-space coverage meter (covergroup bins + holes over 12 components) | T3 | zero (new meter + afterEach hook in tests) | full | none |
| G | Held-out corpus contamination seal (`hashCorpusSlice` + `assertCorpusSeal`) for the bakeoff | T1/eval | low (adds a seal check to calibrate path; fail-closed) | full | light |
| I | DbC runtime pre/post contracts + DFT scan-observability wrapper for computeU | T1/T6 | low (env-gated debug wrapper; prod-stripped) | full | none |
| E | **WIRE the per-claim identity veto live** (§1 keystone) | T7 | **gate-core wiring** | full (observe-mode adapter, no block) | **OWNER** |
| H | Resolved-outcome log ({runId,decision}@t0 + {outcome}@t1) — unlocks K + reliability + FP/FN | eval infra | medium (ledger schema add) | full | **OWNER** |
| F | Redundant TMR-style cross-check of high-stakes verdicts (2nd path, disagree→fail-closed) | T5 | low-med (observe-mode wrapper) | full | OWNER (if it gates) |
| K | Conformal-prediction calibrated ASSERT threshold (distribution-free coverage) | eval | gate-core (changes promotion bar) | full | **OWNER** (needs H) |
| L | Goodhart heterogeneous term + symmetric strictness-channel L∞ floor + sub-RETRACT floor advisory→enforcing + confidence-threshold graduation | T6/gate-core | gate-core behavior | full | **OWNER** |
| J | Scalability: incremental (Welford) cortexSnapshot + anytime tiering + modular per-term contracts | T8 | refactor (touches hot path) | medium | OWNER (deferred — caps hold it) |

---

## 4. RANKING (EV × reversibility × LOW blast-radius) — my call, pre-peer

**Tier 1 — BUILD NOW (additive, observe-mode, zero gate-core behavior change, fully reversible):**
1. **A — PBT invariant harness.** Highest EV/lowest risk. Turns 46 example tests into ∀-input property proofs. Directly closes the T1 ∀-quantifier gap. Foundation everything else verifies against.
2. **B — Metamorphic suite + fault campaign.** Generalizes hand-authored probes into a generated, coverage-fed campaign. Closes T4. Reuses existing `runProbe`/`compareEvasion` API.
3. **D — Coverage meter.** Answers "what input regions has any test ever exercised?" Closes T3 (pure GAP). Feeds A + B (tells them where the holes are).
4. **C — Cross-era equivalence checker (DRT).** Closes T2. Proves v2→v3 (and future era bumps) preserve verdict ordering. Cedar's 100M-input DRT pipeline is the model.
5. **G — Contamination seal.** Closes a real structural integrity hole in the bakeoff (gradient overfitting on the tuning corpus). `hashWeightConfig` already exists → short add.
6. **I — DbC contracts + scan observability.** Cheap hardening; makes A's failures pinpoint the exact violating intermediate node.

**Tier 2 — OWNER-GATED, high value (wiring / schema):**
7. **E — Wire the identity veto live** (KEYSTONE §1). Build the observe-mode PostToolUse adapter (advisory, no block); owner arms the block.
8. **H — Resolved-outcome log.** The single prerequisite unlocking K + reliability diagrams + FP/FN burn-in. Design the schema first.
9. **F — TMR redundant cross-check** for high-stakes verdicts (observe-mode disagreement logging first).

**Tier 3 — OWNER-GATED, gate-core behavior (calibration-dependent):**
10. **K — Conformal calibrated threshold** (after H).
11. **L — Goodhart/symmetric/sub-RETRACT/confidence-graduation** bundle (some already documented in memory; verify shipped-state before rebuild).

**Tier 4 — DEFERRED:**
12. **J — Scalability refactor.** Real but not urgent; caps hold the gate O(1) today. Revisit if caps lift or eras multiply. Build A/C first so the refactor is equivalence-checked.

---

## 5. RECOMMENDED BUILD SEQUENCE

Tier 1 in order A→D→I→B→C→G (D before B so the campaign is coverage-fed; I early so A pinpoints failures). All Tier 1 = new files, observe-mode, reversible by deletion, no gate-core behavior change → buildable without arming anything.
Tier 2+ = present evidence, owner go, observe-mode prototype, then owner arms.

## 6. PEER CROSS-FAMILY VERIFICATION

**Mimo (pure-reasoning, blinded) — returned:**
- TOP 5: **A** (PBT) #1 · **I** (contracts+scan) #2 · **B** (metamorphic campaign) #3 · **D** (coverage meter) #4 · **H** (resolved-outcome log) #5.
- OVERRATED: **L** (Goodhart bundle) — "diagnosis before cure": 4 sub-mechanisms atomic'd into one gate-core rewrite; you cannot design a credible anti-Goodhart countermeasure before empirical drift measurements (needs A+I+H first); the advisory→enforcing step creates a discontinuous risk cliff.
- MISSING → **new candidate M** (below): shadow-mode differential deployment + auto-rollback.

**Convergence (genuine — Mimo had NO sight of §4):** A is #1 for both; B/D/I/H all in both top tiers. Signal, not framing-echo. Divergence: Mimo ranks I and H higher than I did (minor, accepted).

**Sequencing insight ADOPTED:** "diagnosis before cure" → build the measurement instruments (Tier 1: A, I, D + H infra) BEFORE any gate-core cure (K, L). My tiering already does this; Mimo's reasoning hardens *why*.

**DeepSeek (code-grounded, blinded) — returned:**
- TOP 5: **E** (wire identity veto) #1 · **A** (PBT) #2 · **H** (resolved-outcome log) #3 · **D** (coverage meter) #4 · **C** (cross-era equivalence) #5.
- E#1 rationale: the identity veto is BUILT (1,122 lines, 70/70 green) + feeder runs in shadow; the gap is "one import + one call in the tick path" — a tested gate that blocks nothing is dead capital. Observe-first, near-zero blast.
- OVERRATED: **J** (scalability refactor) — premature optimization of a non-bottleneck: caps make it O(1), gate is DISARMED, zero perf pressure. "Solves a problem that doesn't exist yet under conditions that don't exist yet."
- MISSING → **new candidate N**: **operator-labeled ground-truth corpus.** All calibration runs on the gate's OWN verdicts → we know it's *stable* across weight changes, NOT *correct* against reality. H (passive outcome join) is step one; active operator labeling (claims marked SHOULD-have-blocked / was-a-false-positive) is a distinct instrument. Without it, K + L calibrate to internal drift, not real accuracy.

### THREE-WAY CONVERGENCE (all blinded — none saw my §4 or each other)
- **A — unanimous top-2** (me #1, Mimo #1, DeepSeek #2). Build first.
- **D + H — top-5 in all three.**
- **E** — DeepSeek #1, my Tier-2-top; the strongest OWNER-DECISION item (gate-core wiring).
- **Both peers flag the heaviest gate-core items as overrated** (Mimo→L, DeepSeek→J) → combined signal: defer L and J; stay in measurement + wiring tiers.
- **Two distinct real gaps surfaced** (M safe-shipping, N ground-truth) — the value of cross-family blinding; my framed swarm missed both.

### Candidate N (added — DeepSeek completeness-critic)
| N | **Operator-labeled ground-truth corpus** — operator-annotated SHOULD-block / was-FP claims, so calibration measures accuracy vs reality, not self-consistency | eval truth | low (new corpus + scorer) | full | **OWNER** (needs operator labeling effort) |

N is the truth-anchor: K/L/conformal are only as honest as the labels they calibrate against. Pair with H (passive) — N is the active half.

### Candidate M (added — Mimo completeness-critic)
| M | **Shadow-mode differential deployment + auto-rollback** — run old-vs-new gate in parallel on live dispatch, diff verdicts, auto-rollback on a divergence spike above a pre-registered threshold | shipping safety | medium (harness around dispatch) | full | **OWNER** |

M is the safe-shipping substrate for EVERY owner-gated change (E, H, K, L): without it, arming any change is an uncontrolled experiment on the gate. Belongs in Tier 2 as enabling infrastructure — build before arming anything in Tier 3.

## 7. CITATION ANCHORS (rolled up, for reindex)

fast-check (PBT JS) · Metamorphic Testing (Chen et al., arXiv 2211.12003) · Design-by-Contract (Eiffel) · Differential testing / EquiBench (arXiv 2502.12466) · Z3/SMT bounded model checking · AWS Cedar DRT (amazon.science) · seL4 / CompCert / s2n-bignum (verified-systems scale) · UVM coverage-driven verification (Doulos) · Logic Equivalence Checking (Cadence Conformal / Synopsys Formality) · CDC verification (arXiv 2406.06533) · Welford weighted online stats · Split conformal prediction (Angelopoulos & Bates arXiv 2107.07511) · METR frontier-safety eval common-elements · ECE/Brier/Thermometer calibration (ICML 2024) · TMR software (IEEE) · Byzantine peer-ranked consensus (Fortytwo arXiv 2510.24801) · Goodhart formalization (arXiv 2505.23445) · Process Reward Models (arXiv 2510.08049) · QD red-teaming (arXiv 2506.07121).
