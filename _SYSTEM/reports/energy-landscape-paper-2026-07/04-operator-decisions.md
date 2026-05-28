# Operator Decisions — Energy-Landscape Paper Sprint

**Date locked:** 2026-05-28
**Owner:** Marcel
**Status:** all decisions captured, Workstream A unlocked

These decisions answer the open questions from `00-evidence-plan.md` Section 6 and `01-sandbox-simulation-architecture.md` Section 6. Decisions are durable; revising them requires explicit operator re-decision.

## Evidence Plan Decisions

### Q1 — Evidence scope: **HEAVY**
Full B.1 + B.2 + B.3 + B.4 (and B.5 if time allows). Wire gate into dispatch, collect real-traffic data, run 4+ controlled experiments. 4–5 weeks of work. Empirical depth is the differentiator.

### Q2 — Visualization tooling: **Web + D3 / Observable**
**Pipeline:** Codex builds base visuals using his dedicated visualization plugins. Claude refines.
**Discipline rule:** no boring/ugly developer-default matplotlib visuals. The paper's figures reflect Marcel's craft. Designer-grade output.

### Q3 — Lane scope for B.1 (real-dispatch data collection): **DeepSeek heavy, Claude (Sonnet max), Codex (gpt-5.5 xhigh, max 3 concurrent), Shintai conditional**
- **DeepSeek:** high-volume parallel use is fine, "blast it like a muhfucker"
- **Claude/Sonnet:** max reasoning is sufficient for Workstream B execution work
- **Codex/gpt-5.5/xhigh:** maximum 3 concurrent lanes at any time
- **Shintai:** only if it doesn't cause chaos (historical pattern: causes chaos). Default: skip.

### Q4 — Gate enforcement timing: **Observability-only initially; flip to action mode after B.1 data is collected and reviewed**
Real YURI runs observability mode for the B.1 window (10–14 days). After B.1 trace is captured and Marcel + Claude review the would-have-been-rejected transitions, action mode activates for B.5 comparison baseline. Sandbox runs action mode from day one independently per Q6.

### Q5 — Reproducibility scope: **Public artifact at ship time (recommendation accepted)**
Carve `yuri-energy.mjs`, experiment scripts, and a sanitized subset of trace data into a public GitHub mirror. Paper includes "clone, run, verify" reproducibility appendix.

## Sandbox Architecture Decisions

### Q6 — Sandbox aggressiveness: **Action mode from day one**
The whole point of the sandbox is to run aggressive experiments safely. Real-YURI observability-only constraint (Q4) does not apply to sandbox.

### Q7 — Retroactive evaluation scope: **RESOLVED via Layer 7 (Privacy Gate)**
Three-zone discipline: Raw `_SYSTEM/state/` never enters experiments directly; sanitizer module mediates every crossing into Sanitized zone; second sanitization pass produces Public zone for reproducibility artifacts.

### Q8 — Mutation testing depth: **Standard operators first; AI-assisted only if standard pass rate is suspiciously high (recommendation accepted)**
Standard mutation operators (10–20 mutations: sign flips, dropped components, comparison operator changes). If standard mutation suite catches >95% of mutations, the test suite is genuinely thorough. If it catches <70%, the test suite has gaps — then escalate to AI-assisted mutation generation targeting weak spots.

### Q9 — Formal verification commitment: **Only if SMT review confirms feasibility (recommendation accepted)**
SMT proofs (Z3/CVC5) attempted only after Codex review confirms the U invariants are SMT-expressible without infeasible state-space blowup. If feasible, allocate 3–5 days. If infeasible (state-space too large or weights' semantics not capturable), skip — empirical evidence carries the paper.

### Q10 — Regulatory framing: **Adjacent references only (recommendation accepted)**
OWASP ASI 2026 categories cited in Section 4.5 and Section 6 as alignment references. EU AI Act mentioned in Section 6 as adjacent context. Do not lead the paper with regulatory framing — the methodology contribution stays primary.

## Operator-Action Items Resolved

- **`.claude/cache/changelog.md`** — Marcel untracked manually (2026-05-28). No longer a blocker.

## Implications for Workstream A Dispatch

With all decisions captured, Workstream A.1 (telemetry layer) is unblocked for Quantum dispatch. The packet is at `05-quantum-a1-telemetry-packet.md`.

A.1 must address Codex's three flagged implementation risks from the docs-only acceptance verdict:
1. `YURI_STATE_DIR` write-path audit (telemetry write paths specifically)
2. Sanitizer-as-only-bridge enforcement (Layer 7 acceptance criteria become first-class A acceptance)
3. Bootstrap CI temporal-dependency handling (deferred to statistical pipeline, not A.1)
