# From Draft to Evidence — Planning Doc for the Remaining Sprint

**Date:** 2026-05-28
**Status:** planning, owner-pending
**Owner:** Claude (Opus, main thread)
**Scope:** Sequence Weeks 3–8 of the energy-landscape paper sprint, ship target 2026-07-23
**Predecessors:** 6 section drafts in `section-1` through `section-6`, all Sonnet/Quantum-authored, 2,810 words total

---

## 1. Honest Assessment of the Current Draft

The six sections each pass their internal acceptance criteria. The voice is consistent enough across them. The ICM/MWP-as-foundation framing is solid. Section 2's structural-vs-dynamical distinction is genuinely a new framing. Section 5's discipline of pairing each limitation with a "what would advance it" extension is real intellectual honesty. The math composition in Section 3 is correct as stated.

The draft also has four structural problems that no amount of stylistic polish fixes:

**Problem 1 — No empirical evidence exists, anywhere.** Section 4 cites two worked-example scenarios (Scenario A descent at ΔU=-0.261, Scenario B ascent at ΔU=100). Both are hand-crafted toy inputs. The paper has zero data from a deployed gate operating on real lane dispatches. A reader cannot distinguish "this works" from "this has been engineered to look like it works on two specific test cases the author wrote."

**Problem 2 — The reference implementation is a function library, not a running system.** Section 5 admits this in plain terms. The function `gateProposal()` is callable and passes unit tests; it is not bound to YURI's actual dispatch path. The paper subtly conflates "the gate is implemented" (true, as a function) with "the gate is deployed" (false, no wiring). A working engineer will see this conflation immediately.

**Problem 3 — No comparison, no ablation, no adversarial result.** A methodology paper with empirical claims is expected to compare against baselines (what does the no-gate world look like?), to ablate components (which U components actually matter?), and to demonstrate behavior under adversarial pressure (the paper *acknowledges* this is unverified — but the acknowledgment is not a substitute for the test). The current draft has none of these.

**Problem 4 — No figures.** A 2,810-word methodology paper with zero figures or diagrams is unusual. Standard reader expectations include: energy descent trace, component contributions over time, rejection rate sensitivity, architectural diagram showing structural-vs-dynamical layers, energy landscape visualization. The brief named "screenshots/diagrams" for Section 4 — the draft delivered prose only.

**The honest summary:** the draft is shippable as a *proposal document* (academic context: workshop or position paper). It is not shippable as a *methodology paper with empirical claims* (which is what Jan and Jake would expect given the framing). Closing that gap is the remaining sprint's work.

---

## 2. What "Shippable" Actually Means

Shippable means: a reader who knows ICM/MWP and is reasonably skeptical (Jan's profile, Jake's profile) reads the paper and cannot ask "where's the evidence?" because the evidence is in the paper. Specifically:

- **The gate has run on real YURI dispatches for at least one continuous data-collection window.** Not unit tests. Real behavior, real workload.
- **At least three controlled experiments have been executed with the gate, with results in figures.** Descent demonstration, component ablation, adversarial probe at minimum.
- **A reproducibility appendix exists** that lets a reader who clones a public artifact run the experiments themselves and get matching numbers.
- **The honest limitations section reflects what experiments revealed, not what experiments would reveal in the abstract.** If an experiment shows the gate is brittle in some specific way, Section 5 names that brittleness with the data.

"Shippable" is not "perfect paper." It is "no obvious gap between claims and shown evidence."

---

## 3. Three Workstreams

The remaining work splits into three parallel-but-dependent workstreams.

### Workstream A — Implementation Hardening (YURI side)

YURI needs three new pieces of infrastructure before any experiments can run.

#### A.1 — Telemetry layer

A logging surface that captures every gate evaluation with structured output. Spec:

- **Where it lives:** new module `_SYSTEM/Scripts/math/yuri-energy-trace.mjs` plus a runtime state file at `_SYSTEM/state/energy-trace/<YYYY-MM-DD>.jsonl`.
- **What it records per evaluation:** ISO timestamp, run_id, lane (source of the proposed transition), stateBefore snapshot (relevant fields only — not full state), stateAfter snapshot, computed U_before, U_after, ΔU, per-component contributions, gate decision (accept/reject), dominantTerm if rejected, threshold used, weights used, advisory_only flag.
- **Format:** JSONL (one object per line, append-only). Matches existing YURI state-log patterns (kagami-ledger, memory-ledger).
- **Privacy:** record state *summaries* not full state. No memory bodies, no protected-path content, no secrets. The summary must be sufficient to recompute U deterministically when paired with the weights — that's the reproducibility contract.

#### A.2 — Gate-dispatch wiring

The function `gateProposal()` exists. It needs to be invoked by something. Two-phase rollout:

**Phase A.2.a — Observability mode.** Wire `gateProposal()` into `_SYSTEM/Scripts/shintai-dispatch.mjs` and `_SYSTEM/Scripts/offload-runner.mjs` such that every dispatch is *evaluated by the gate but never blocked*. The result is logged via A.1's telemetry layer. This gives us real-traffic data without any risk of disrupting Marcel's actual workflow.

**Phase A.2.b — Action mode (gated).** After A.2.a has produced sufficient trace data and the gate's behavior on real traffic has been characterized, add an opt-in `--enforce` flag that lets the gate actually reject transitions. Default off. Kill switch via environment variable `YURI_ENERGY_GATE=off`.

**Non-negotiable:** A.2.a must not change observable YURI behavior in any way. Same dispatches happen, same outcomes, same lane behavior. Telemetry runs silently in the background. If A.2.a changes any observable behavior, the implementation has a bug.

#### A.3 — Experiment runner scaffolding

A reusable harness for controlled experiments. Spec:

- New module `_SYSTEM/Scripts/math/yuri-energy-experiment.mjs`.
- CLI: `node yuri-energy-experiment.mjs run --scenario <id> --out <path>`.
- Each experiment is a small JS file under `_SYSTEM/Scripts/math/experiments/` that exports a function returning a sequence of state transitions to evaluate.
- The harness runs the sequence through `computeU`, `computeDeltaU`, and `gateProposal`, captures the trace, writes JSONL output.
- Same telemetry format as A.1 — so traces from controlled experiments and real dispatches are directly comparable.

**Acceptance for Workstream A:** all three pieces implemented, tested, and observability mode active. Action mode left disabled until experiments justify activation.

### Workstream B — Empirical Evidence (data side)

Five experiments, ordered by dependency.

#### B.1 — Real-dispatch trace collection (passive)

**Goal:** capture the U trajectory and per-component contributions across Marcel's normal YURI usage over a 1-2 week window. This is the paper's "what does the gate see in the wild?" evidence.

**Mechanism:** A.2.a (observability mode) runs silently. Trace JSONL accumulates.

**What we learn:** baseline distribution of ΔU values, frequency of would-have-been-rejected transitions, which components dominate, how often the dominantTerm flips between protected-path violations, claim drift, and stale evidence.

**Output:** Figure 1 (ΔU distribution histogram), Figure 2 (U trajectory over a representative day), Figure 3 (component-contribution stacked area chart).

**Duration:** 10–14 days minimum for meaningful sample size.

#### B.2 — Controlled descent demonstration

**Goal:** show that under a *known-good* sequence of transitions (verified claim promotions, dispatch with clean evidence), U descends as expected.

**Mechanism:** experiment script that runs a hand-crafted sequence of 15–25 transitions representing a clean workflow (operator submits claim → claim verified by evidence → claim promoted from research to fixture_ready → etc.). Gate logs decisions and ΔU per step.

**What we learn:** the gate behaves as specified on the canonical good case. If U does not descend monotonically (within local-minima caveat), the composition has a bug.

**Output:** Figure 4 (U descent curve over the controlled sequence, with component breakdown annotated).

**Duration:** 1–2 days of experiment scripting + 1 day of execution.

#### B.3 — Component ablation

**Goal:** answer "which U components actually matter?" Run the same controlled descent (B.2) with each component disabled in turn (weight set to 0). Compare gate behavior.

**Mechanism:** 6 ablation runs, one per primitive. Each measures rejection rate and which dominantTerm fires when the disabled component is taken out.

**What we learn:** which components carry signal and which are redundant. Possible result: KL divergence is doing most of the work and other components are decoration. Equally possible result: every component catches a different failure class and removing any one weakens detection materially.

**Output:** Figure 5 (component ablation table — for each component, what gate behavior changes when it's removed). Possibly Figure 6 (rejection rate by ablation).

**Duration:** 2–3 days.

#### B.4 — Adversarial probe

**Goal:** test whether the gate catches transitions specifically engineered to evade it.

**Mechanism:** hand-craft 10–20 adversarial state transitions. Specifically:
- Transitions that reduce one component while degrading another by a smaller amount (test: does U see the degradation?).
- Transitions that introduce a protected-path violation while strongly improving other components (test: does the η·protectedPathViolations weight dominate as designed?).
- Transitions that exploit weight ratios (e.g., a small ε advantage that cancels a large η penalty — test: does the composition's threshold catch this?).

**What we learn:** the gate's actual robustness to adversarial input. If the gate fails to catch adversarial cases, the paper says so honestly and Section 5/6 update to reflect this.

**Output:** Figure 7 (adversarial-case-by-case table — for each adversarial transition, the engineered intent, what U saw, whether the gate caught it).

**Duration:** 2–3 days.

#### B.5 — Comparison baseline (optional, if time)

**Goal:** show that the gate adds value beyond what structural containment (ICM/MWP alone) already provides.

**Mechanism:** rerun B.1's trace data through a structural-only filter (no Lyapunov gate, just ICM stage boundaries + protected-path checks). Compare what gets blocked.

**What we learn:** if the gate's rejections are a strict superset of structural rejections, the gate adds value. If they overlap substantially, the gate may be redundant for most real workloads (which is an honest paper result, just a different one).

**Output:** Figure 8 (Venn-style comparison of gate-rejected vs structural-rejected transitions).

**Duration:** 1–2 days if B.1 data is already in place.

**Acceptance for Workstream B:** B.1, B.2, B.3, B.4 executed with figures. B.5 optional but recommended if time allows.

### Workstream C — Paper Rework (artifact side)

#### C.1 — Unification + voice pass (Opus, main thread, this week)

The 6 sections become one document at `_SYSTEM/reports/energy-landscape-paper-2026-07/conservative-state-flows.md`. The work is not stitch-and-publish:

- **Voice unification.** Sonnet/Quantum's register subtly shifts across sections — declarative in S1, categorical in S2, technical in S3, concrete in S4, list-disciplined in S5, exploratory in S6. The unified document picks one register (the strongest section's, which is probably S2 — categorical-with-edges) and pulls all sections toward it.
- **Transition smoothing.** Currently each section ends with an explicit forward pointer to the next section. In a unified document, those pointers either dissolve into prose flow or get cut.
- **Redundancy elimination.** Each section opens by re-anchoring the previous section. In unification, those re-anchors collapse.
- **One-section, one-claim discipline.** A unified read often surfaces hidden duplication. If S5 and S6 both say "this hasn't been tested adversarially," one of them should cut.
- **Inserting empty-but-named placeholders for figures.** The unified draft has `[FIGURE 1 — ΔU distribution histogram]` style placeholders where Workstream B's outputs will land. This makes the paper structure visible before the data exists.

This is the work I do directly, in main thread, with Opus reasoning. Not dispatched. Not Sonnet/Quantum. Marcel explicitly asked for this.

#### C.2 — Experimental results integration (after B.1–B.4 complete)

A new section is added between current S4 and S5: **Section 4.5 — Experimental Results.** It documents what the experiments actually showed. This is the section the paper currently lacks entirely.

Section 4.5 is the section that converts the paper from proposal to methodology-with-evidence. It is ~600–800 words, contains 5–7 figures, names what worked and what did not honestly.

Section 5 (Honest Limitations) updates based on what the experiments revealed. Section 6 (Open Questions) likewise — questions that the experiments answered get moved out, new questions that emerged get added.

#### C.3 — Visual production

Figures get produced. Tooling TBD pending Marcel's call (see Decision Question 2 below). Figures are styled to match Marcel's brand (his Substack, his YouTube channel) — this is where his craft strength enters the paper directly.

#### C.4 — Polish + reproducibility appendix + Substack styling

Final pass. Adds a reproducibility appendix that lists: how to clone the artifacts, how to run each experiment, what numbers to expect, where the data lives. Substack formatting + cover image + tags. Cross-post setup for Skool drop.

---

## 4. Sequencing Across Remaining Weeks

Today is 2026-05-28. Ship target is 2026-07-23. That's eight weeks and one day. The current sprint plan named Weeks 1–2 for the draft; we are on track for that.

**Revised sequencing for Weeks 3–8:**

| Week | Dates | Primary work | Secondary work | Owner |
|---|---|---|---|---|
| 3 | Jun 4 – Jun 10 | A.1 telemetry + A.2.a observability wiring | C.1 unification + voice pass | A: Quantum (packet); C.1: me |
| 4 | Jun 11 – Jun 17 | A.3 experiment runner + B.1 starts | B.2 + B.3 design | A.3: Quantum; design: me |
| 5 | Jun 18 – Jun 24 | B.1 ongoing, B.2 executes | B.3 begins, B.4 design | B: experiment runner |
| 6 | Jun 25 – Jul 1 | B.3 + B.4 execute, B.5 if time | C.2 experimental-results section draft | me + Quantum |
| 7 | Jul 2 – Jul 8 | C.3 visual production | Codex full-paper review | me + Marcel for visuals |
| 8 | Jul 9 – Jul 23 | C.4 polish + Substack + Jake DM prep | Buffer | me + Marcel |

**The hard constraint:** Workstream B cannot complete faster than B.1's 10–14 day passive collection window. That window must start at the beginning of Week 3 for B.1's data to be available by end of Week 5. Everything else slips if the telemetry layer doesn't go up immediately.

---

## 5. Role Allocation

- **Me (Opus, main thread).** Lead the unification + voice pass (C.1). Write the experimental-results section once data is available (C.2). Sequence packet dispatches to Quantum. Review experiment outputs for honesty before they enter the paper. Be the voice of "wait, what does this actually show?" before any claim is added.
- **Quantum (Sonnet, tmux lane).** Implement A.1, A.2, A.3 via dispatched packets. Execute B experiments via dispatched packets. Generate raw figure data. Do not own paper voice or claim framing.
- **Codex (gpt-5.5 final-pass).** Final review on C.2 specifically (concrete claims about empirical results — needs the highest fact-check density). Optional full-paper review at the end of Week 7.
- **Marcel.** Five decisions (next section). Run YURI normally during Week 3–5 so B.1 has real traffic to collect. Polish Substack styling. Final call on ship vs delay if Workstream B runs over.

---

## 6. Decision Points Needing Marcel Input

These are the decisions that gate execution. I cannot proceed past Week 3 planning without your answers.

**Q1 — Evidence scope (the most important decision).**

How much empirical work do we commit to? Three honest options:

- **Heavy (recommended for paper quality, risk on timeline):** wire gate into dispatch, run for 2 weeks, do B.1+B.2+B.3+B.4 with B.5 if time allows. 4–5 weeks of total work. Paper has a real evidence stack. Strong artifact for Jake/Jan.
- **Medium (recommended for timeline safety, modest paper quality):** observability mode only for B.1 data, do B.2 + B.3 + B.4 as controlled experiments. 2–3 weeks of work. Paper has empirical evidence but lighter on "real workload" stories. Ship date safe.
- **Light (recommended only if timeline is non-negotiable):** skip B.1 entirely, do only B.2 + B.3 with hand-crafted scenarios. Paper acknowledges "synthetic scenarios" honestly. 1 week of work. Paper is closer to "proposal with controlled demonstration" than "methodology with deployment evidence."

**Q2 — Visualization tooling.**

Where do figures get produced? Tradeoffs:

- **Python + matplotlib.** Developer-standard, ugly defaults, easy reproducibility. Works in a Jupyter notebook that lives in the repo.
- **Web + D3 / Observable.** Aligns with your craft (you build motion-design for clients). Beautiful figures. Higher production cost. Embeddable in Substack via iframe or static export.
- **R + ggplot.** Academic-standard, good defaults, weird tooling overhead.
- **Mermaid + ASCII art (markdown-native).** Lowest friction, fits Substack natively. Limited to flow diagrams and bar charts — cannot do the more interesting figures (descent curves, ablation tables with detail).

My recommendation: **Web + D3 for the 2–3 most important figures** (energy descent curve, component ablation, architectural diagram) **+ matplotlib for the rest** (histograms, contribution stacks). Hybrid honors your craft on the figures that matter and uses fast tooling for the rest.

**Q3 — Real-dispatch data scope.**

For B.1 passive collection, what counts as "real dispatch"?

- **Main-thread Claude only.** I'm the most active surface; logs are clean and well-scoped.
- **All lane dispatches** (Shintai, Codex final-pass, DeepSeek, Quantum tmux, etc.). Richer data but mixed lane behaviors confound the analysis.
- **Tagged subset** (only dispatches you mark as "production-realistic" via a flag). Cleanest data but lowest volume.

My recommendation: **all lane dispatches, with lane field captured per-record.** Mixed data is a feature — the paper can show per-lane breakdowns.

**Q4 — Gate enforcement timing.**

When (if ever) do we flip from observability mode (A.2.a) to action mode (A.2.b) during the data collection?

- **Never within the sprint.** Stays observability-only. Paper claims "the gate as designed would have rejected N% of observed transitions" but doesn't claim rejection happened.
- **After B.1 data is collected and reviewed.** Run action mode for 3–5 days at end of Week 5 / start of Week 6 to demonstrate live enforcement. Paper claims actual rejections occurred.
- **Aggressive — turn on action mode immediately at start of Week 3.** Maximum live-evidence story but maximum risk of disrupting your workflow.

My recommendation: **observability-only within the sprint, with a clearly-labeled "action mode is implemented but not deployed during this study" honest-scope statement.** Lower risk, honest paper, same intellectual contribution.

**Q5 — Reproducibility scope.**

Does the paper come with a public artifact a reader can clone?

- **Public artifact (recommended).** Carve `yuri-energy.mjs`, the experiment scripts, and a sanitized subset of the trace data into a public GitHub mirror. Paper has a "clone, run, verify" reproducibility appendix. Stronger artifact for outreach.
- **Repo-internal only.** Paper points to YURI's repo (which is your private workspace). Readers can read the paper but cannot reproduce.
- **Public artifact at a later date.** Ship paper without public mirror, prepare mirror in Q4.

My recommendation: **public artifact at ship time.** The reproducibility appendix is what distinguishes a methodology paper from a position paper. Setting it up costs ~1 day; the payoff is substantial for Jake/Jan outreach.

---

## 7. First Concrete Next Action

Once you answer Q1–Q5, the immediate next move is:

1. **I begin C.1** (unification + voice pass in main thread) — this is independent of every decision and gives you a unified draft to read while the rest of the plan executes.
2. **I draft the Quantum packet for A.1** (telemetry layer) — first piece of the implementation work, dispatched immediately after you green-light scope.
3. **You run YURI normally** for the next 1–2 weeks so B.1 can collect data in the background.

C.1 + A.1 packet drafting can happen in this session if you confirm direction. The unification is the main-thread work you asked for explicitly — I will do it directly, not dispatched.

---

## Closing — On the discipline this plan enforces

The paper's signature is honesty about limitations. The evidence plan must match that ethic. Three operating rules for the remaining sprint:

1. **No faked or aspirational results.** If an experiment shows the gate is weak in some specific case, Section 4.5 and Section 5 document that weakness with the data. The paper that admits failures is more trustworthy than the paper that hides them.
2. **No "look-good" visualization.** Figures show what the data shows. If the descent curve is noisy, the figure is noisy. Cosmetic smoothing belongs in a marketing deck, not a methodology paper.
3. **Reproducibility is non-negotiable.** Every numeric claim in Section 4.5 must be reproducible from the published artifact. If a number cannot be regenerated by a reader following the appendix, it does not appear in the paper.

These three rules are the difference between a paper Jan finds interesting-but-thin and a paper Jan reads and asks to be a named reviewer on the v2.
