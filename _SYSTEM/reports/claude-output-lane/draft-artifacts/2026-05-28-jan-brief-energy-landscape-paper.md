# Project Brief — for Jan

**From:** Marcel Spatz
**Date:** 2026-05-28
**Subject:** Co-authoring a methodology paper on energy-landscape gating for agent control planes

---

## What I want to build with you

I want us to co-author a methodology paper + companion video on a specific contribution: **adding a Lyapunov-gated promotion layer ("energy-landscape control") to ICM/MWP-style folder-as-architecture agent systems** — with YURI as the working reference implementation.

**Working title:**
*Conservative State Flows: Lyapunov-Gated Promotion as an Extension of ICM/MWP Containment Methodology*

**Target ship date:** 2026-07-23 (8 weeks from today)

**Publishing surfaces:**

- My Substack (paper, ~3,000 words)
- My YouTube channel (10–12 min explainer video)
- Jake Van Clief's "Clief Notes" Skool community (cross-post)
- Direct outreach to Jake within 5 days after publication

---

## The premise in one paragraph

Jake Van Clief's ICM (Interpretable Context Methodology) and MWP (Model Workspace Protocol) frameworks treat AI agents as code rather than colleagues — folder structure as architecture, numbered stages, explicit containment via filesystem and scoped credentials. They solve *structural* containment elegantly. What they don't yet formalize is *dynamical* containment: within a stage, state transitions remain arbitrary, agents can drift or loop, and claims can be promoted without verification. We want to propose a complementary layer: a **scalar potential function over orchestration state**, where each lane dispatch and each claim promotion is gated by an energy condition (ΔU ≥ 0 → reject). The folder structure becomes the geography; the energy function becomes the gravity. Together, the agent system is guaranteed to descend toward verified, coherent states rather than drift into incoherence.

The inspiration is the Potential-Derived (PD) layer concept from recent energy-based-models research, applied not at the neural-network layer (where we can't reach) but at the **control-plane layer** (which we own).

---

## The mechanism in plain terms

YURI already has:

- A math kernel (`_SYSTEM/Scripts/math/math-kernel.mjs`) with proven primitives: entropy, KL divergence, cross-entropy, log loss, Brier score, Bayes update, confidence decay, weighted means, vector operations
- A formula-bank system with promotion-status tagging
- A truth-promotion ladder (`draft → research → fixture_ready → runtime_tested → operator_validated → trusted`)
- Multi-lane council dispatch
- A claim-integrity gate (planned, not yet built)

What's missing is the unifying scalar U(state) that composes these primitives into a single energy function and binds it to dispatch as a rejection rule. The proposal:

```
U(state) = α·entropy(claim_promotion_distribution)
        + β·klDivergence(claimed, verified)
        + γ·logLoss(predictions, outcomes)
        + δ·brierScore(forecasts, results)
        - ε·informationGain(prior_state, current_state)
        + ζ·sum(confidenceDecay over stale evidence)
        + η·protected_path_violations
        + θ·promotion_ladder_inversions
```

Every term is already a function in the existing math kernel. The novel work is **the composition rule + the gating discipline**.

This gives us a framing that's mathematically honest: we're not inventing new math, we're applying proven primitives as a Lyapunov function over agent-system state, with operator-tuned weights. We'll be explicit about that — no overclaim.

---

## Your role and why I want it to be you

You're the engineering co-author. Your role is **engineering rigor, system review, project execution discipline, and the enterprise-governance perspective** that comes from your SAP FS-ICM background.

Specifically:

1. **Review the implementation.** I'll build `yuri-energy.mjs` that composes the existing kernel primitives into U(state). You review the code for correctness, edge cases, missing checks, naming, documentation discipline. SAP-grade rigor on a side project.

2. **Stress-test the Lyapunov claim engineering-side.** Can you construct a state transition where U decreases mathematically but the system actually got worse in operator terms? That's the honest weakness-finding pass. If you find one, we either fix it in the paper or flag it explicitly as an open question.

3. **Make sure the demonstration code runs cleanly on a fresh checkout.** You're better at this than I am. The paper needs a runnable example, not a "works on my machine" demo.

4. **Write the "Enterprise Governance Perspective" callout in the paper.** ~300–500 words. Your voice. Draw the parallel between SAP-grade governance patterns (controlled transports, audit logging, access control, explicit data models) and AI agent containment / energy-gating. **This is your unique contribution.** Nobody else writing about AI agents has your day-to-day SAP enterprise-governance lens. That parallel is genuinely interesting and original.

5. **Run the 8-week sprint with PSM discipline.** Stand-ups when needed, sprint review at the midpoint, hard cutoff at week 8 — whatever's done ships. I trust your Scrum instinct on this more than mine.

**What you do NOT do:** validate the math claims at research-ML level. You're not the EBM/PyTorch reviewer. I'll own the math application and frame the paper as *methodology applying proven primitives*, not *new theoretical contribution*. That keeps it honest.

---

## The byline I'm proposing

```
Conservative State Flows: Lyapunov-Gated Promotion as an Extension
of ICM/MWP Containment Methodology

Marcel Spatz — Independent researcher, Vienna
    (system architecture, reference implementation, math application)

Jan-Erich Meister, PSM I — Software engineer, Stuttgart
    (engineering review, project execution, enterprise-governance perspective)

July 2026
```

I'm intentionally **not** naming VPV Versicherungen or AGENA in the byline — this is independent side work, not employer-sponsored. PSM I is named because it's earned and signals project discipline. Push back on any of this if you'd frame it differently.

---

## The 8-week structure

- **Week 1 (May 28 – Jun 3):** Lock outline + scope + terminology. I draft `yuri-energy.mjs` skeleton. You read the existing math kernel + Jake's ICM/MWP paper. End of week: written agreement on scope.
- **Week 2 (Jun 4 – Jun 10):** I write Sections 1–3 (premise, gap, proposal). You do v1 implementation review of `yuri-energy.mjs`.
- **Week 3 (Jun 11 – Jun 17):** I revise the energy function based on your feedback and ship v2. Both of us start outlining Section 4.
- **Week 4 (Jun 18 – Jun 24):** I write Section 4 (reference implementation). You draft your governance-perspective callout. Demo code must run cleanly on a fresh checkout. **Midpoint sync — adjust scope if needed.**
- **Week 5 (Jun 25 – Jul 1):** I write Sections 5–6 (limitations, open questions). You do full code-review pass. Bibliography + citations locked.
- **Week 6 (Jul 2 – Jul 8):** Cross-review pass on all written sections. Video production begins (my side). Paper formatting decided.
- **Week 7 (Jul 9 – Jul 15):** Video production finishes. Final engineering polish. Substack post styled. Final read-through together.
- **Week 8 (Jul 16 – Jul 23):** Final cross-review. **Ship: 2026-07-23.** Substack + YouTube + Skool cross-post. DM to Jake within 5 days of drop (by 2026-07-28).

**Bandwidth check:** ~15–20 hours total spread over 8 weeks. ~2 hours/week average with heavier load in weeks 2 and 5. Confirm this is realistic on your side given VPV workload.

---

## What I need from you to start

1. **Read this brief. Push back on any part of the scope you'd change.**
2. **Confirm VPV's Nebentätigkeit policy allows public co-authorship of independent methodology work.** This is the hard blocker — if there's any IP conflict from your employer, we either solve it before starting or you stay anonymous as "engineering review by JEM" without public byline. I'd rather have you publicly named, but only if it's clean for you.
3. **Confirm bandwidth: ~15–20 hours spread over 8 weeks.** Not a hard commitment yet — just a realistic check. If you're at 5 hours max, the scope shrinks. If you're at 25 hours, we can deepen.
4. **Decide if you want to write your governance-perspective section in German first** (I'll translate) or in English directly. Whichever lets you write the truest version.

Once we've talked through your reactions to the above, we lock the goal and start week 1.

---

This is the work I want us to do together. It's a real artifact, it's honest about what we are and what we're not, it positions both of us cleanly in the AI-methodology conversation Jake is having, and it builds something I think we'd both actually be proud of.

Let me know what you think.

— Marcel
