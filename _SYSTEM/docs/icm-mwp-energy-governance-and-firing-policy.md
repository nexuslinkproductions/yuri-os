# ICM/MWP vs Agentic — and the Energy-Gate Firing Policy

**Date:** 2026-05-30. Paper-critical framing + the salience firing design for the everyday-workflow energy gate. Grounded in the paper premise (`section-1-premise.md`) and a verified deep-research pass (sources cited).

## 1. The operating basis is ICM/MWP, not "agentic"

YURI does **not** operate on an agentic basis. It operates on **ICM / MWP**:

- **ICM** — Interpretable Context Methodology · **MWP** — Model Workspace Protocol — Jake Van Clief, arXiv:2603.16021.
- Thesis: **"treat AI like code, not a colleague."** Folder structure *is* the contract; numbered stages are execution boundaries; each stage gets only the context it needs; credentials scoped; environments sandboxed. Containment by *construction* — misuse requires modifying visible, auditable architecture.
- What ICM/MWP solve: **static coherence** — the system *at rest* is fully characterized (what stages exist, what each can access, what credentials are live at each boundary).

**The gap they leave — and YURI's reason to exist (paper §1, verbatim spine):** *"A system that is structurally coherent at rest can behave arbitrarily in motion. Within any ICM stage, state transitions are unconstrained — it can loop, drift, accumulate contradictory claims, and promote assertions without independent verification. When structural containment is solved, what governs the dynamics inside it?"*

→ **ICM/MWP contain the structure (static). The energy landscape governs the dynamics (in motion).** That division is the paper's whole contribution.

## 2. Agentic is the foil, not the validation

The agentic frame (e.g. Salesforce "engineering became agentic": AI-as-colleague, trust-and-observe, agents driving the SDLC) reaches massive *scale observability* — Salesforce's Agentforce traces ~2B predictions/month with execution tracing + anomaly detection. But its own engineering writeup admits the gap: **no outcome-quality metrics, no performance scoring, no human-in-the-loop verification; self-correcting workflows "remain a future challenge."**

That gap is **structural to the agentic frame, not an oversight.** You cannot deterministically govern a *colleague's* autonomy. YURI does not inherit the gap because YURI rejects the frame: code-not-colleague (ICM/MWP) + a Lyapunov gate on the dynamics. **The agentic path is the proof that the dynamics layer is unsolved; YURI is the one building it.** (Tooling parallel still holds — "skills as reusable engineering artifacts / a shared Foundation library" maps to YURI's blueprint+skills shipped to every user — but that is the tooling layer, not the operating basis.)

Sources: [Salesforce — engineering became agentic](https://www.salesforce.com/news/stories/how-engineering-became-agentic/) · [Agentforce observability, 2B predictions/mo](https://engineering.salesforce.com/agentforce-scaling-agentic-ai-for-enterprise-automation-observability-powering-2-billion-predictions-monthly/).

## 3. The firing policy — when does the dynamics gate fire?

Question reframed in the ICM lens: **which ICM-stage transitions need dynamic (energy) governance?** Firing on every keystroke is noise + cost; missing the moments that matter is worse. Verified cross-domain policy (telemetry sampling, model cascades, learning-to-defer):

**Layer A — decide at the transition boundary, not per-event (tail, not head).** Compute ΔU once the outcome is known (edit applied / command pass-fail / protected-path result), then make one keep decision with full context. *(OTel/Refinery tail-sampling. Already done — energy-tick fires PostToolUse, after the result.)*

**Layer B — deterministic force-keep tiers + fail-closed default.** A small library of cheap predicates force-keeps high-salience transitions; everything unmatched is skipped (fail-closed, cheap). *(Already done — CRITICAL tier force-keeps protected-path/fail/error; SKIP is the default for reads/navigation.)*

**Layer C — |ΔU|-as-surprise (YURI-native; the research's open frontier).** The established systems approximate novelty with *inverse frequency* (keep rare signatures, downsample common ones) because they have no energy function. **YURI has one.** Use the gate's own **|ΔU| as the surprise/free-energy trigger** — a large energy jump *is* surprising regardless of surface signature. Compute ΔU cheaply at every boundary; **keep/escalate** only the surprising ones; skip routine low-energy transitions. This collapses tail-sampling + Bayesian-surprise + the Lyapunov thesis into one native signal. (The research explicitly flagged that no established work covers surprise/free-energy triggering and that YURI "already computes energy natively" — this is YURI's edge, not a borrowed pattern.)

**Depth gate on Layer C (owner refinement 2026-05-30).** The surprise tier does NOT fire on every boundary — it engages only at *depth*: the point in a work thread where genuine determinism and mathematical output are actually needed to close the ICM dynamics gap. Shallow/routine transitions are fully handled by Layers A+B (deterministic force-keep + skip); the expensive |ΔU|-surprise evaluation is reserved for deep moments where drift, looping, or accumulated contradiction would actually threaten coherence. Operationally: depth ≈ accumulated session-state complexity (sustained meaningful transitions / rising |U| / chain length). **Fire Layer C iff depth ≥ depth-threshold AND |ΔU| ≥ surprise-threshold.** This is adaptive computation — spend deterministic math only when the work is deep enough to require it, not on every surprising blip.

**Layer D — confidence cascade (optional, residual).** For the leftover "does this need determinism?" judgment, a cheap classifier accepts when confident and escalates only when not (FrugalGPT/RouteLLM/learning-to-defer). Defer rule: escalate iff P(expensive-path-right) ≥ cheap-path max class prob — **but calibrate the threshold on YOUR keep/skip utility, not raw accuracy**, and shift it **asymmetrically**: missing a protected-path violation or silent failure is far costlier than a wasted evaluation, so bias toward firing determinism on high-miss-cost tiers.

**Net:** boundary-timed (A) · deterministic force-keep + fail-closed (B) · |ΔU|-surprise keep/escalation (C) · optional confidence cascade (D), thresholds tuned on miss-cost-weighted utility.

Sources (verified, primary): [OTel tail-sampling](https://opentelemetry.io/blog/2022/tail-sampling/) · [Honeycomb Refinery dynamic/EMA sampling](https://github.com/honeycombio/refinery) · [FrugalGPT](https://arxiv.org/abs/2305.05176) · [RouteLLM](https://arxiv.org/abs/2406.18665) · [Calibrated Learning to Defer (ICML 2022)](https://arxiv.org/pdf/2202.03673) · Bayesian surprise (Itti & Baldi) · active inference / free energy (Friston).

## 4. Current build state vs this policy

- energy-tick salience implements Layers A + B (boundary-timed, deterministic tiers, fail-closed). 15/15 green.
- Layer C (|ΔU|-surprise keep policy) is the recommended next increment to the gate — unifies with the formula-bank `selectionGuidance` picker (Step 2).
- Layer D is optional/later.
- Open question (from research): keying/threshold for Layer C — set the |ΔU| surprise threshold relative to the gate's own ΔU scale; tune on a miss-cost-weighted held-out set (selective-labels caveat noted).
