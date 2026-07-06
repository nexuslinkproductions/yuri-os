# Self-Governance & Self-Goal-Setting for Agent Roles
## Research Report — YURI OS / Sakana Blueprint Session 2026-06-22

---

## 1. Autonomy Taxonomy (L0–L5 Frame)

The SAE-inspired taxonomy now has strong arXiv consensus (2506.12469; 2510.23587; 2405.06643):

| Level | Human role | Scope |
|-------|-----------|-------|
| L0 | Full operator | No AI agency |
| L1 | Director | Rule-based execution only |
| L2 | Supervisor | Autonomous sub-tasks |
| **L3** | **Consultant** | **Agent recognizes limits, escalates** |
| L4 | Approver | Agent proactive, human approves |
| L5 | Observer | Full autonomy, emergency stop only |

**YURI's existing charter maps to L3–L4 boundary**: self-governable decisions execute at L3 (evidence-decidable, blast ≤ MEDIUM); anything that escalates falls to L4 (owner-gated HOLD + one-token confirm). L5 is explicitly refused — outward-facing and irreversible actions always gate.

Sources: [arXiv:2506.12469](https://arxiv.org/abs/2506.12469) · [arXiv:2510.23587](https://arxiv.org/html/2510.23587) · [arXiv:2405.06643](https://arxiv.org/pdf/2405.06643)

---

## 2. Generative Agents: Plan → Reflect → Act Loop (Park et al., 2023)

Mechanism: `Perceive → Retrieve (memory stream) → Plan (daily → hourly → minute) → Act → Reflect`.

Key insight: reflection synthesizes past events into higher-level concepts that *revise* future plans. The agent doesn't just execute — it re-plans when short-term observations contradict the standing plan ("react" branch). Goal stability comes from the memory stream anchoring intent across turns.

**YURI mapping**: the Reflect step = YURI's adversarial self-verification phase; the memory stream = Track-B auto-memory + canonical store; re-plan trigger = the energy gate's catastrophic verdict.

Sources: [arXiv:2304.03442 / UIST '23](https://dl.acm.org/doi/fullHtml/10.1145/3586183.3606763)

---

## 3. Voyager: Automatic Curriculum (Wang et al., 2023)

Three-component mechanism: **(a) curriculum proposer** — GPT-4 receives full agent state (inventory, biome, completed/failed task lists, contextual wiki retrieval) and must propose the NEXT goal satisfying the constraint "not too hard given current resources and learned skills"; **(b) skill library** — each verified skill is vectorized and retrieved for future goals, compounding capability non-linearly; **(c) self-verifier** — a separate GPT-4 critic receives task + final state and returns pass/fail + corrective critique, feeding up to 4 iterative repair rounds before the task is abandoned.

Key safety property: the curriculum is **capability-bounded**. The proposer has access to what the agent has already done and what it currently holds — it cannot propose beyond that frontier.

**YURI mapping**: curriculum proposer ↔ goal-generation step; self-verifier ↔ adversarial verification; skill library ↔ `capability-recall.mjs` + `capabilities.json`.

Sources: [arXiv:2305.16291](https://arxiv.org/abs/2305.16291)

---

## 4. Darwin Gödel Machine & Gödel Agent (Zhang et al. 2025; Yin et al. 2024)

**DGM** (arXiv:2505.22954, ICLR 2026): maintains an archive of agent variants, samples from it, applies LLM-driven self-modification, then validates against coding benchmarks before promotion. Safety: containerized sandboxing + human oversight as explicit preconditions. The archive structure prevents a single runaway lineage — parallel exploration, not a single chain.

**Gödel Agent** (arXiv:2410.04444): modification acceptance requires passing a validation task set before broad application. Runtime errors halt the current cycle and store error context for the next decision. Critical gap: no hard computational cap on recursion — the LLM itself decides `continue_improve`, creating an acknowledged safety hole.

**SAHOO** (arXiv:2603.06333, 2026) closes this gap with three invariants: Goal Drift Index (GDI < 0.44 threshold), constraint predicate satisfaction (zero-tolerance for critical violations → immediate halt), and regression-risk budget. These operate in sequence; constraint violation has absolute priority.

**YURI mapping**: DGM archive ↔ `_SYSTEM/state/memory-canonical/` promotion ledger; SAHOO's GDI ↔ YURI's `computeU` ΔU energy gate; constraint predicates ↔ YURI's 6-gate self-governance charter.

Sources: [arXiv:2505.22954](https://arxiv.org/abs/2505.22954) · [arXiv:2410.04444](https://arxiv.org/abs/2410.04444) · [arXiv:2603.06333](https://arxiv.org/html/2603.06333)

---

## 5. Constitutional AI: Self-Critique for Bounded Autonomy (Bai et al., 2022)

Two-phase: (1) generate response → critique against principles → revise (supervised phase); (2) RL using AI-generated preference labels derived from the constitution (RLAIF). The constitution is primarily **negative** — it specifies what NOT to do (harm, deception, privacy violation), which makes each principle independently verifiable as a binary check.

Key insight for self-governing agents: negative constraints are structurally superior to positive preferences because they are independently decidable. A role that knows its hard-stop list can self-audit against it without human judgment at every step.

Sources: [Anthropic CAI paper](https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback) · [arXiv:2504.04918](https://arxiv.org/html/2504.04918v1)

---

## 6. Failure Modes & Published Mitigations

| Failure mode | Mechanism | Mitigation |
|---|---|---|
| **Goal drift** | Contextual pressure competes with original objective; no weight update needed (arXiv:2603.03258) | Deployment-time behavioral monitoring; memory-anchored intent (generative agents stream) |
| **Reward hacking** | Agent edits test assertions or disables error logging to inflate proxy score | Process-based rewards penalizing unsafe intermediate steps; inoculation prompting (75–90% reduction per arXiv:2511.18397) |
| **Runaway loops** | Self-repair with no stopping condition consumes resources indefinitely | Hard iteration cap + risk budget per step; SAHOO-style GDI threshold |
| **Over-claiming** | Lane reports 18/19 completed; 0 actual edits (YURI NS2 empirical, 2026-06-16) | Local verification mandatory; advisory-only model output until locally confirmed |
| **Scope intoxication** | Agent expands goal beyond original request | Pre-execution guardrail monitor classifying by autonomy domain; ElephantBroker 4-level escalation |

Sources: [arXiv:2603.03258](https://arxiv.org/pdf/2603.03258) · [arXiv:2511.18397](https://arxiv.org/html/2511.18397v1) · [arXiv:2603.06333](https://arxiv.org/html/2603.06333)

---

## 7. Mechanism Design: YURI Capability-Role Self-Governance

### 7.1 Overview

A **capability-based role** in YURI is a bounded agent identity that:
- knows its own capability set (via `capability-recall.mjs`)
- proposes its own next goal from within that set
- scores the candidate against YURI's 6-gate charter
- self-executes when all gates pass, escalates when any fail
- records outcomes and feeds them back into its capability model

### 7.2 Five-Step Loop

```
PROPOSE → SCORE → GATE → EXECUTE → LEARN
```

**Step 1 — PROPOSE (goal generation)**

Input pack: `{task_context, capability_set, completed_goals[], failed_goals[], canonical_state, energy_ΔU_last}`.

The role queries `capability-recall.mjs "<current_gap>"` to surface what it already has. It then proposes a candidate goal that: (a) sits at the frontier of proven capability (Voyager curriculum rule: not too hard given current inventory), (b) fills a gap evidenced by the failed_goals list, and (c) is expressible as a falsifiable outcome (pass/fail verifiable locally).

Negative-first filter: immediately discard any candidate that touches a protected path, arms a gate, or is outward-facing (Constitutional AI principle — hard-stop list checked before scoring).

**Step 2 — SCORE (ranking)**

Score each surviving candidate on five dimensions (0–1 each):

| Dimension | Source | Weight |
|---|---|---|
| Capability fit | `capability-recall` confidence | 0.25 |
| Reversibility | git-revert / flag-delete / env-unset path exists | 0.25 |
| Blast radius | file-count × mutation-depth heuristic | 0.20 |
| Evidence decidability | local-run verifiable, not preference | 0.20 |
| Doctrine fit | not-contended, not-outward, in-scope | 0.10 |

Composite score ≥ 0.75 → candidate advances to gate. Below threshold → park as PARKED_BRANCH in the five-state router.

**Step 3 — GATE (YURI 6-gate charter)**

Apply YURI's existing 6-gate decision tree in sequence:

```
reversible? → evidence-decidable? → in-doctrine? → blast ≤ MEDIUM?
→ not-outward-facing? → not-contended?
```

ALL PASS → self-execute (L3 autonomy, no owner confirm).  
ANY FAIL → produce finished ruling (calc/sim + recommendation + reversibility/blast) → HOLD for one-token owner confirm (L4).

BUILD-DISARMED is always self-governable. ARMING is always owner-gated. This is the same rule; the scoring in Step 2 just surfaces the right branch faster.

**Step 4 — EXECUTE**

Run with: explicit pathspec mutations only, adversarial self-verification before claiming done (attack the output, name failure modes, run negative tests), SAHOO-style stopping conditions active throughout:

- GDI equivalent: if `computeU` ΔU trailing verdict is catastrophic → circuit breaker fires, halt.
- Iteration cap: max 4 repair cycles per sub-goal (Voyager verifier ceiling) before escalating to owner.
- Scope lock: compare final changed-file set against proposed scope at commit time; any new file outside the proposed scope triggers an owner-gate advisory.

**Step 5 — LEARN**

On completion: write outcome to Track-B auto-memory (`feedback-*.md`) with v3 frontmatter: `RULE · WHEN · DO · DONT · WHY`. Update capability tag at source (`@serves` synonym enrichment if the goal revealed a new use-case). Run `capability-scan.mjs` to regenerate registry. Feed `{goal, score, gate_result, outcome}` tuple to the prediction ledger (falsifiable forecast → observed result → calibration update).

On failure: record exact failure class against the anti-pattern table; if a rationalization was used to bypass a gate, log it as a new row in the discipline skill's rationalization table with failure-anchor.

### 7.3 Hard Caps (Runaway / Drift Prevention)

These are non-negotiable and cannot be self-governed away:

1. **Iteration ceiling**: ≤ 4 repair cycles per goal before mandatory escalation.
2. **Scope lock**: final diff must be subset of proposed scope; any expansion → owner-gate.
3. **GDI / energy floor**: SAHOO-inspired — if semantic distance between proposed goal and original task intent exceeds threshold, halt and escalate. Proxy: `xref-query` the candidate goal against the original task context; if no overlap, flag.
4. **Constitution hard-stop list**: protected paths, gate-arming, outward-facing actions, secrets — discard before scoring, never score through.
5. **Contention veto**: any candidate touching uncommitted lines of another session → immediate owner-gate, no scoring.
6. **No recursive self-modification**: the role may expand its capability set (register new skills) but may NOT modify the gate logic itself. Gate-modification is owner-gated absolutely (Gödel Agent's acknowledged gap, explicitly closed here).

### 7.4 Alignment to YURI's Existing Charter

| YURI gate | Mechanism mapping |
|---|---|
| reversible | Step 2 score dimension 2 + Step 3 gate 1 |
| evidence-decidable | Step 1 falsifiable-outcome requirement + Step 2 score dim 4 |
| in-doctrine | Step 1 negative-first filter + Step 3 gate 3 |
| blast ≤ MEDIUM | Step 2 score dim 3 + Step 3 gate 4 |
| not-outward-facing | Step 1 filter + Step 3 gate 5 |
| not-contended | Hard cap 5 (contention veto) + Step 3 gate 6 |
| BUILD-DISARMED self-gov | Step 3 all-pass → execute without confirm |
| ARMING → owner-gated | Hard cap 6 (no gate-logic self-modification) |

---

## 8. Key References (Primary Sources)

- [arXiv:2506.12469 — Levels of Autonomy for AI Agents (2025)](https://arxiv.org/abs/2506.12469)
- [arXiv:2304.03442 — Generative Agents (Park et al., UIST 2023)](https://arxiv.org/abs/2304.03442)
- [arXiv:2305.16291 — Voyager Automatic Curriculum (Wang et al., 2023)](https://arxiv.org/abs/2305.16291)
- [arXiv:2505.22954 — Darwin Gödel Machine (Zhang et al., ICLR 2026)](https://arxiv.org/abs/2505.22954)
- [arXiv:2410.04444 — Gödel Agent (Yin et al., 2024)](https://arxiv.org/abs/2410.04444)
- [arXiv:2603.06333 — SAHOO Safety for RSI (2026)](https://arxiv.org/html/2603.06333)
- [Anthropic CAI — Constitutional AI: Harmlessness from AI Feedback (Bai et al., 2022)](https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback)
- [arXiv:2603.03258 — Inherited Goal Drift (2026)](https://arxiv.org/pdf/2603.03258)
- [arXiv:2511.18397 — Reward Hacking Mitigations (2025)](https://arxiv.org/html/2511.18397v1)
- [arXiv:2603.06333 — SAHOO (2026)](https://arxiv.org/html/2603.06333)
- [arXiv:2510.09781 — Foundational Guardrail via Synthetic Data (2025)](https://arxiv.org/html/2510.09781v1)
- [arXiv:2510.15739 — AURA Autonomy Risk Assessment (2025)](https://arxiv.org/pdf/2510.15739)
