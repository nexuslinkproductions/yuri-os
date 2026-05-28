# Sandbox + Simulation Architecture for YURI Energy Gate Validation

**Date:** 2026-05-28
**Status:** planning, pre-Codex review
**Owner:** Claude (Opus, main thread)
**Extends:** [00-evidence-plan.md](00-evidence-plan.md)
**Purpose:** Specify *how* the experiments in the evidence plan run — safely, reproducibly, and at scale — before any YURI implementation begins.
**Next gate:** Codex full review of this architecture before A.1/A.2 packets dispatch.

---

## 1. Research Foundation (2026 Literature)

The 2026 academic literature on agent gate validation converges on five techniques that the evidence plan must adopt:

- **Record & Replay separation** — untrusted model explores in a sandbox; trusted agent replays in real environment. Separates "exploration/discovery" from "trusted execution." [arXiv 2505.17716](https://arxiv.org/html/2505.17716v1)
- **LM-based tool emulation (ToolEmu)** — emulate downstream tools/lanes to identify long-tail failures without touching real infrastructure. [arXiv 2309.15817](https://arxiv.org/pdf/2309.15817)
- **Metamorphic testing for the oracle problem** — when there's no "correct output," test invariants under transformations. Directly applicable to U(state). [arXiv 2211.12003](https://arxiv.org/pdf/2211.12003)
- **Property-based testing for ML** — generate millions of random inputs, verify mathematical properties hold across the space. Hypothesis library is the reference tooling.
- **Continuous adversarial assessment** — agentic red-teaming has moved from annual engagement to continuous assessment. [arXiv 2605.04019](https://arxiv.org/html/2605.04019v1)
- **Runtime governance frameworks** — gating mechanisms as policies on execution paths. Directly relevant prior art for YURI's design. [arXiv 2603.16586](https://arxiv.org/pdf/2603.16586)

External taxonomies worth aligning with:

- **OWASP ASI 2026** — Agent Security Initiative published the first agent-specific risk taxonomy. ASI01 (Agent Goal Hijack), ASI02 (Tool Misuse) are the highest-priority risks. The adversarial experiments below explicitly target ASI01/ASI02 categories so the paper has external taxonomy alignment.
- **EU AI Act high-risk provisions** — take effect August 2026, demand orchestration with auditability. YURI's gate architecture is structurally a candidate answer to that requirement. Optional framing for paper positioning.

The evidence plan's experiments (B.1–B.5) are the right set. What the literature changes is the *scale* and *isolation* discipline:

- B.1's "10–14 day passive collection" remains the floor for real-traffic data
- But B.2/B.3/B.4 should run **millions of synthetic cases via property-based testing**, not "15–25 hand-crafted scenarios"
- All non-passive work runs in an **isolated sandbox**, not against real YURI

---

## 2. Sandbox Architecture for YURI

Seven layers, each addressing a specific concern.

### Layer 1 — Isolation primitive: Git worktree + isolated state directory

YURI already supports worktrees (`.codex-worktrees/`). The energy-experiment sandbox is a worktree at a stable path with its own state root:

```
/Users/marcelspatz/YURI-OS-MUSUBI-sandbox-energy/
└── (full YURI checkout, isolated)
   └── _SYSTEM/state/         ← isolated state writes
       └── energy-experiments/ ← experiment outputs land here
```

Environment variable `YURI_STATE_DIR=<sandbox-state-root>` redirects all state writes to the sandbox. Real YURI's state at `~/YURI-OS-MUSUBI/_SYSTEM/state/` is untouched.

**Why this matters:** worst case in any experiment is YURI breaks. Worktree means broken sandbox = `git worktree remove`, real YURI intact. Cheap insurance policy.

**Acceptance:** `node _SYSTEM/Scripts/yuri-health.mjs` from real YURI passes unchanged before and after any sandbox experiment. Verifiable.

### Layer 2 — Trace replay infrastructure

The Record & Replay methodology applied to YURI:

1. Real YURI runs observability mode (Workstream A.2.a from the evidence plan). Captures U-traces via `yuri-energy-trace.mjs` to `_SYSTEM/state/energy-trace/<date>.jsonl`.
2. Sandbox imports these traces as input. New module `_SYSTEM/Scripts/math/yuri-energy-replay.mjs`.
3. Sandbox **re-evaluates** each transition through the gate with optional configuration changes (different weights, enforcement enabled vs not).
4. Outputs comparison: what would the gate have done with config X vs config Y on the same trace.

**Critical temporal discipline:** the gate at time T may only use state available at time T. Replay must not leak future information into past decisions. The trace records both stateBefore and stateAfter; the gate evaluates the transition itself, not the future.

**Differential testing emerges naturally:** run the same trace under 5 different weight configurations, compare decisions. Surface which weights are load-bearing and which are decoration.

### Layer 3 — Synthetic traffic generators (property-based testing)

For the cases real traffic doesn't cover, generate them. Adopt the **Hypothesis (Python) or fast-check (JavaScript) library style** of property-based testing:

```js
// pseudocode
forEach random_state in stateGenerator(count=1_000_000):
  result = computeU(random_state)
  assert isFinite(result.U)
  assert all components either skipped or finite
  assert all weights applied as documented
```

Generators by category:

- **goodPromotionGenerator** — synthesizes state transitions representing verified claim promotions (entropy down, KL drops, info gain up)
- **driftGenerator** — synthesizes transitions where claimed and verified distributions diverge
- **adversarialGenerator** — synthesizes transitions that game one component to mask another (more on this in Layer 5)
- **noOpGenerator** — synthesizes transitions where stateAfter == stateBefore (should produce ΔU = 0)
- **edgeCaseGenerator** — synthesizes empty distributions, single-element distributions, all-zero states, max-value states

Run each generator with sample size ≥ 10,000 per category, ≥ 1,000,000 across all categories. Latency is fine — `computeU` is sub-millisecond.

**Why this scales the evidence dramatically:** the original B.2 plan named "15–25 hand-crafted scenarios." Property-based testing replaces that with "1,000,000 transitions in 5 minutes of sandbox runtime."

### Layer 4 — Metamorphic invariants

Metamorphic testing addresses the oracle problem: U(state) doesn't have a known "correct" value, but it has known **relationships** that must hold. Test those relationships across the property-based generators.

Six invariants the gate must satisfy:

1. **Weight homogeneity** — Scaling all weights by k > 0 scales ΔU by k. (Algebraic property.)
2. **Component additivity** — ΔU(transition_A then transition_B) = ΔU(transition_A) + ΔU(transition_B′) where B′ has stateBefore = stateAfter of A. (Composition property.)
3. **No-op identity** — ΔU(stateBefore → stateBefore) = 0 within floating-point tolerance. (Trivial-case property.)
4. **Negation antisymmetry** — If stateA → stateB has ΔU = δ, then stateB → stateA has ΔU = -δ. (Reversibility property.)
5. **Component independence** — If only component K's input changed between two transitions, only the K contribution differs in the breakdown. (Locality property.)
6. **Empty-state ground** — computeU({}) returns U = 0 with all components skipped. (Bottom-of-lattice property.)

Each invariant becomes a property-based test running across 1,000,000+ generated states. **An invariant failure is a real bug.** A passing invariant suite under millions of cases is a much stronger claim than 28 unit tests.

### Layer 5 — Adversarial generators (white-box red-team)

The gate's source is known. Adversarial generators use that knowledge to construct evasion attempts. Five attack categories, mapped to OWASP ASI 2026:

1. **Weight-ratio exploitation (ASI02 Tool Misuse analogue).** Construct a transition where the component with high weight (η=100 for protectedPathViolations) is improved by a small amount, but multiple low-weight components are degraded by amounts that net out. Test: does the gate accept this as a free improvement when the human-readable interpretation is "spread the harm thinly"?

2. **Component blind-spot exploitation.** Find a component the U composition does NOT include but should. Construct a transition that maximally degrades along that axis. Test: gate accepts (because U sees no problem) — paper documents the gap.

3. **Stale-evidence accumulation (ASI01 Goal Hijack analogue).** Construct transitions that individually pass ΔU ≤ 0 but cumulatively let stale evidence dominate a future decision. Test: does the gate catch the trajectory, or just the local step?

4. **Distribution-shape attacks on entropy/KL.** Construct claim distributions where adding a single new claim flips the entropy contribution dramatically (e.g., narrow → wide). Test: gate behavior near distribution boundaries.

5. **Threshold-edge attacks.** Construct transitions where ΔU = threshold + ε for very small ε. Test: floating-point stability at the boundary.

Each category produces 100–500 specifically crafted cases. **A successful evasion is a real finding** — it goes into Section 5 (Honest Limitations) of the paper with the specific case documented.

### Layer 6 — Statistical analysis pipeline

All experiments emit JSONL with consistent schema. A new module `_SYSTEM/Scripts/math/yuri-energy-analyze.mjs` provides:

- **Distribution summaries** — rejection rate, ΔU distribution, dominant-term frequency
- **Confidence intervals via bootstrap** — for any rate claim in the paper, generate a 95% bootstrap CI
- **Component contribution analysis** — what fraction of total |ΔU| each component contributes, averaged over a trace
- **Differential comparison** — given two configs, table of decision differences with statistical significance

The paper's empirical claims (Section 4.5) carry CIs, not point estimates. "The gate rejected 8.2% ± 1.3% of observed transitions" — not "the gate rejected 8.2%."

### Layer 7 — Retroactive Evaluation Privacy Gate

Raw `_SYSTEM/state/` contains memory ledgers, Shintai advisories, Kagami events, lane sessions, worker captures, and other operator-private material. Retroactive evaluation against this history (Insight 1) needs an explicit sanitization boundary before any data crosses into experiments — and a stronger boundary before any data crosses into public reproducibility artifacts.

**Three-zone discipline:**

1. **Raw zone — `_SYSTEM/state/` itself.** Stays local. Never directly consumed by experiment runners. Never copied to the sandbox worktree as-is. Never enters version control beyond what's already tracked.

2. **Sanitized zone — sandbox experiment inputs.** A new sanitizer module `_SYSTEM/Scripts/math/yuri-energy-sanitize.mjs` reads raw state events and emits **schema-limited, redacted state-transition records** for experiment consumption. Schema fields allowed: timestamp, lane (canonical name only), event-type, structural numeric counts (claim distribution sizes, evidence ages, violation counts), promotion-ladder transitions (by label, not by claim body). Schema fields forbidden: memory bodies, prompt text, transcript content, protected-path content, raw identifiers (user names, file paths, lane-instance IDs), credentials, evidence excerpts, and any free-text field.

3. **Public zone — reproducibility artifact.** A second sanitization pass produces the public artifact's example traces. Beyond Sanitized-zone rules: lane names are replaced with generic labels (`lane-1`, `lane-2`), timestamps are normalized to relative-offset format, all counts above N are bucketed into ranges. The public artifact ships only Public-zone traces. Raw and Sanitized-zone data stays local-only.

**Mechanical enforcement.** The sanitizer module is the only allowed bridge between the raw zone and any experiment runner. Experiment runners refuse to accept raw `_SYSTEM/state/` paths as input. CI check verifies no Raw-zone path appears in any public-zone artifact before reproducibility ship.

**Operator approval gate.** Before the first sanitized batch generates, Marcel reviews the sanitizer schema and confirms the field allow-list captures everything safe and excludes everything sensitive. Schema changes after that gate require explicit operator re-approval.

**Why this is Layer 7 and not an afterthought:** retroactive evaluation is one of the strongest evidence accelerators in the plan (Insight 1 cut the "wait 2 weeks for fresh data" bottleneck). Without the privacy gate, the accelerator becomes a privacy hazard. With the gate, retroactive evaluation is safe and the bottleneck stays cut.

**Resolves Codex review concern raised 2026-05-28.** Replaces the prior recommendation "full history initially in sandbox, sanitize before public artifact" (Q7) with a stricter rule: full raw history never enters the sandbox; the sanitizer mediates every crossing.

---

## 3. Ten Insights Outside the Plan's Original Horizon

Things the literature surfaced that the original evidence plan did not name.

### Insight 1 — Retroactive evaluation against existing YURI history

YURI's `_SYSTEM/state/` already contains weeks of session history, memory ledgers, Shintai advisories, Kagami events. **The gate can be retroactively evaluated against this existing history without waiting for new data collection.** Construct a synthetic stateBefore/stateAfter pair from each existing state-change event in the historical record; run the gate.

**Impact:** B.1's "10–14 day passive collection" floor drops because retroactive analysis gives us a starting evidence base immediately. Live B.1 collection then supplements rather than gates.

### Insight 2 — Differential testing across weight configurations

Don't test one U formula — test 5 weight schemes against the same trace. Surface which assumptions are load-bearing. The original plan's component ablation (B.3) is a subset of this; differential weight testing generalizes it.

**Impact:** the paper can claim "we evaluated the proposal under 5 weight configurations; the qualitative conclusions hold across all of them" — a much stronger robustness claim than a single-config evaluation.

### Insight 3 — Mutation testing of the gate source

Introduce small intentional bugs into `yuri-energy.mjs` (flip a sign, drop a component, change a comparison operator). Run the experiment suite. If a mutation passes all tests, the test suite has a gap. **Mutation testing validates the validation infrastructure.**

**Impact:** the paper's reproducibility appendix can cite mutation testing coverage as evidence that the test suite would catch real bugs. Standard practice in safety-critical software, rarely done for AI gate mechanisms.

### Insight 4 — Formal verification via SMT (Z3 / CVC5)

Express U as an SMT formula. Prove the monotonicity property algebraically. **Stronger than empirical testing** for the properties that are expressible in SMT.

What SMT can prove: weight homogeneity, additivity, no-op identity, monotonicity bounds.
What SMT cannot prove: operator-tuned weights' semantic correctness, adversarial robustness in the general case.

**Impact:** the paper can claim algebraic guarantees for the invariants formal methods can express, and empirical evidence for the rest. Mixed-method validation is the gold standard.

### Insight 5 — Continuous evaluation, not episodic study

The 2026 literature has moved from "annual red team engagement" to "continuous assessment in CI." YURI's experiment runner architecture should be designed as a **continuous evaluation system**, not a one-off study. Nightly runs, drift alerts, regression detection.

**Impact:** the paper's reproducibility appendix becomes a continuous-evaluation manifest, not a one-off script collection. Long-term, this is YURI's strongest external positioning.

### Insight 6 — OWASP ASI 2026 taxonomy alignment

Frame adversarial experiments against the published ASI01 (Agent Goal Hijack) and ASI02 (Tool Misuse) categories. **External taxonomy alignment makes Jan and Jake immediately able to map the paper to known security thinking.**

**Impact:** Section 4.5 (Experimental Results) cites OWASP ASI 2026 categories explicitly. Section 5 (Honest Limitations) names which ASI categories the proposal does not address.

### Insight 7 — EU AI Act regulatory framing (optional)

EU AI Act high-risk provisions effective August 2026 demand orchestration with auditability. YURI's gate architecture is structurally a candidate compliance mechanism.

**Impact (optional):** if the paper leans into this, it's not just "interesting methodology" — it answers an active regulatory question. Higher-stakes framing, broader audience. Marcel's call on whether to lean in.

### Insight 8 — Naive-user shadow mode (Phase 2, parked)

Your friend joining YURI as a novice user provides truly out-of-distribution traffic that Marcel's traffic cannot simulate. Sandboxing protects both his data and the friend's experience. **Frame: Phase 2 = "naive user shadow mode" — out-of-sprint, post-paper.**

**Impact:** explicitly named as future work in Section 6 of the paper. Not scope for the 2026-07-23 ship.

### Insight 9 — Don't trust the gate's self-reported decisions

A subtle issue with replay-based testing: the gate evaluating a trace can claim it would have rejected something, but if the rejection decision depends on state computed *after* the original transition, replay accuracy degrades. **Temporal discipline:** evaluate state ≤ T using information available at T only.

**Impact:** the replay infrastructure (Layer 2) requires a strict temporal contract. Implementation must be auditable.

### Insight 10 — Sandbox is the only safe place for action-mode experiments

The evidence plan's Q4 (gate enforcement timing) suggested "observability-only within the sprint." With sandbox isolation, **action mode can run safely in the sandbox at any time** without touching real YURI. The observability-only constraint applies only to real YURI; sandbox can be aggressive from day one.

**Impact:** the paper can claim "the gate ran in action mode against N replayed traces; rejection behavior was as specified." Real YURI stays unenforcing for safety; sandbox provides the action-mode evidence.

---

## 4. Revised Sequencing (Folds Sandbox Architecture Into Evidence Plan)

Same 6-week window. The sandbox architecture changes *what gets built when*:

| Week | Real-YURI work | Sandbox work | Paper work |
|---|---|---|---|
| 3 (Jun 4–10) | A.1 telemetry + A.2.a observability wiring | Worktree sandbox setup; Layer 1+2 (replay infra); **retroactive evaluation of YURI history** (Insight 1) | C.1 unification + voice pass (me, main thread) |
| 4 (Jun 11–17) | A.3 experiment runner + B.1 live data accumulates | Layer 3 (property-based generators); 6 metamorphic invariants implemented as tests | C.1 continues, voice-passed sections 1-3 reviewable |
| 5 (Jun 18–24) | B.1 continues | Layer 4 (metamorphic tests run at 1M+ scale); Layer 5 (adversarial generators); mutation testing (Insight 3) | C.1 complete, draft circulated |
| 6 (Jun 25–Jul 1) | B.1 closes; B.2 controlled descent | Layer 5 adversarial sweeps; Layer 6 statistical pipeline; SMT proofs (Insight 4) | C.2 starts: Section 4.5 from experiment data |
| 7 (Jul 2–8) | Cross-experiment analysis | Differential weight testing (Insight 2); ablation finalized | C.3 visual production using sandbox-generated data |
| 8 (Jul 9–23) | Codex final pass; reproducibility appendix; ship prep | Continuous-evaluation manifest (Insight 5) — for v2 | C.4 polish + Substack + Jake DM |

**Key sequencing change:** retroactive evaluation (Insight 1) starts immediately at Week 3, providing initial evidence base before B.1's live collection completes. Removes the "wait 2 weeks for data" bottleneck.

---

## 5. Codex Review Packet — What We Want Codex To Check

Before any of this implements, Codex (gpt-5.5 at xhigh) reviews the architecture. Specific questions for Codex:

### Architectural correctness

1. Is the **worktree-based sandbox isolation** strong enough? Are there environment leak paths (env vars, file descriptors, shared sockets, shared databases like `_SYSTEM/OS_KERNEL/memory.db`) that would let sandbox operations affect real YURI?
2. Does the **YURI_STATE_DIR environment variable redirect** capture every state-write path in YURI's scripts? Or are there hardcoded paths somewhere that would write to real state regardless?
3. Is the **temporal discipline of replay** (Layer 2 Insight 9) actually enforceable in implementation, or does YURI's state evolution have implicit information flow that breaks the contract?
4. Are the **six metamorphic invariants** (Layer 4) mathematically correct given U's actual composition? Specifically: does additivity (#2) hold when components include nonlinear terms like log-loss?

### Implementation safety

5. The **gate-dispatch wiring (A.2.a observability mode)** adds a synchronous gate evaluation to the dispatch path. What's the latency impact? Is there a path where a slow gate evaluation could stall the dispatch lane?
6. The **adversarial generators (Layer 5)** construct cases designed to evade the gate. Could any of these constructed cases produce real harm if accidentally executed against real YURI (e.g., if sandbox isolation fails)? What's the blast radius if a generator misfires?
7. The **mutation testing approach (Insight 3)** modifies `yuri-energy.mjs` source. How do we ensure mutations are reverted reliably — do we use a separate mutated copy or an in-memory transformation?

### Statistical and methodological soundness

8. Are the **sample sizes** (10K per generator category, 1M aggregate) sufficient for the confidence intervals the paper will claim? What power analysis backs this?
9. Is **bootstrap CI computation** appropriate for the rate claims, given the data may have temporal dependencies (sequential dispatches are not iid)?
10. Does **SMT proof scope** (Insight 4) actually cover what's claimable, or would Z3/CVC5 timeout on the U formula for realistic state sizes?

### Discipline rules

11. The evidence plan's three discipline rules (no faked results, no cosmetic visualization, reproducibility non-negotiable) — does this architecture preserve them? Specifically: can a reader reproduce the exact figures from the published artifact?

---

## 6. Decision Points Added By This Architecture (Beyond Q1–Q5 from 00-evidence-plan)

- **Q6 — Sandbox aggressiveness.** Action mode in sandbox from day one (yes, per Insight 10), or observability-only mirroring real YURI? My recommendation: **action mode in sandbox from day one** — that's the whole point of the sandbox.
- **Q7 — Retroactive evaluation scope.** RESOLVED via Layer 7 (Retroactive Evaluation Privacy Gate). Three-zone discipline: raw `_SYSTEM/state/` never directly enters experiments; sanitizer mediates every crossing into the Sanitized zone; second sanitization pass produces the Public zone for reproducibility artifacts. No "full history initially" — full history stays local; sanitized projections cross into the sandbox.
- **Q8 — Mutation testing depth.** Standard mutation operators (10–20 mutations), or AI-assisted mutation (LLM proposes mutations targeting weak spots)? Recommendation: **standard operators first; AI-assisted only if standard pass rate is suspiciously high**.
- **Q9 — Formal verification commitment.** Spend time on SMT proofs (Insight 4)? Adds 3–5 days of work for a 1-2 paragraph contribution in the paper. Recommendation: **only if Codex review confirms the invariants are SMT-expressible without infeasible state-space blowup.**
- **Q10 — Regulatory framing.** Lean into EU AI Act / OWASP ASI 2026 positioning (Insight 6, 7), or treat as adjacent references only? Recommendation: **adjacent references in Section 4.5 and Section 6; do not lead with regulatory framing — keeps the paper focused on the methodology contribution.**

---

## 7. First Concrete Next Action

This document is ready for Codex review. Recommended dispatch:

```bash
node _SYSTEM/Scripts/claude-codex-final-pass.mjs \
  --packet _SYSTEM/reports/energy-landscape-paper-2026-07/01-sandbox-simulation-architecture.md \
  --execute \
  --model codex \
  --reasoning max
```

This invokes Codex at gpt-5.5 max-reasoning to review the architecture against the 11 questions in Section 5. Expected output: Codex flags structural issues, missed concerns, implementation safety problems, and recommends adjustments before YURI implementation begins.

After Codex review lands, the architecture either:
- **Holds clean** → Workstream A packets dispatch in Week 3 as planned
- **Surfaces structural issues** → architecture revises before any implementation

Either outcome is progress. The cost of a Codex review pass before implementation is ~30 minutes; the cost of discovering an architectural flaw mid-implementation could be days.

---

## 8. Closing — Why This Architecture Matters

The evidence plan's experiments are the right experiments. But running them at hand-crafted-scenario scale produces a paper that says "the gate worked on 25 examples we chose." Running them in a sandbox at property-based scale produces a paper that says "the gate worked on 1.2M generated cases, was attacked along 5 adversarial axes, satisfies 6 algebraic invariants, and is reproducible from the published artifact."

The first paper is a proposal with controlled demonstration. The second is a methodology paper a working engineer takes seriously.

The sandbox architecture is what makes the second version possible without risking Marcel's actual workflow. It is the missing layer between "the gate exists as a function" and "the gate has been validated."

The 2026 literature said this clearly: continuous, sandboxed, property-based, metamorphic. The architecture above implements those four ideas concretely for YURI.

**External citation status:** sources below are research anchors found via web search during architecture drafting. They are **advisory references**, not locally verified. Marcel may verify them via citation-verification pass with network access before paper ship, or the paper explicitly marks them as advisory references and treats them as background context rather than empirical foundation.

**Sources (advisory):**
- [Record & Replay for LLM agents — arXiv 2505.17716](https://arxiv.org/html/2505.17716v1)
- [ToolEmu LM-based tool emulation — arXiv 2309.15817](https://arxiv.org/pdf/2309.15817)
- [Property-based testing for metamorphic — arXiv 2211.12003](https://arxiv.org/pdf/2211.12003)
- [Agentic red teaming, weeks to hours — arXiv 2605.04019](https://arxiv.org/html/2605.04019v1)
- [Runtime Governance: Policies on Paths — arXiv 2603.16586](https://arxiv.org/pdf/2603.16586)
- [OWASP ASI 2026 Q2 update](https://www.straiker.ai/blog/three-landscapes-one-security-shift-what-owasps-q2-2026-update-is-really-saying)
- [Metamorphic testing for AI applications](https://medium.com/trustableai/testing-ai-with-metamorphic-testing-61d690001f5c)
- [Property-based testing with Hypothesis (2026 guide)](https://www.marktechpost.com/2026/04/18/a-coding-guide-for-property-based-testing-using-hypothesis-with-stateful-differential-and-metamorphic-test-design/)
