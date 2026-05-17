---
name: izanagi-simulator
description: Counterfactual Simulation Engine — before committing to a high-stakes plan, generates 3 divergent alternate paths, evaluates each by EV/risk/reversibility, commits with explicit simulation record. Fires automatically on CRITICAL/HIGH complexity tiers with multiple viable paths.
triggers:
  - /izanagi
  - /yuri-izanagi
---

# Izanagi (伊弉諾) — Counterfactual Simulation Engine

**Source anime:** Naruto — Itachi's Izanagi genjutsu rewrites reality itself at the cost of one eye. The user exists in multiple states simultaneously, choosing which becomes real.

**Cognitive translation:** Before committing to a high-stakes architectural or strategic decision, Musubi generates 3 genuinely divergent counterfactual branches, scores each by expected value and failure modes, and commits to the highest-EV path — with an explicit simulation record so the decision is traceable and revisable.

---

## When This Fires

- `complexity_tier` = CRITICAL or HIGH in pulse-plan.json
- AND more than one viable architectural path exists
- OR user explicitly invokes `/izanagi`
- Does NOT fire on: trivial tasks, single-path decisions, pure implementation with no strategic branch

---

## Execution Steps

### Phase 1 — Decode the decision space
- Extract the core decision being made (one sentence)
- Identify what is truly at stake (scope, reversibility, blast radius)
- Confirm: are there genuinely 2+ viable paths? If not, exit early with reasoning.

### Phase 2 — Generate 3 counterfactual branches
Each branch must be a **genuinely different approach**, not a variation of the same path:
- **Branch A:** The most direct/obvious path
- **Branch B:** The most conservative/minimal path
- **Branch C:** The highest-leverage but highest-risk path

For each branch, compute:
```
EV = (success_probability × value_if_success) - (failure_probability × cost_if_failure)
```
Estimate all values explicitly (don't hide behind "it depends").

### Phase 3 — Score and compare

| Dimension | Branch A | Branch B | Branch C |
|-----------|----------|----------|----------|
| EV estimate | | | |
| Reversibility | | | |
| Time cost | | | |
| Blast radius if wrong | | | |
| Fit to Marcel's current phase | | | |

### Phase 4 — Commit with record
- State the chosen branch explicitly
- State why the other branches were rejected (one sentence each)
- Write simulation record to `nisaba/izanagi/decision-<turnId>.json`
- Proceed with implementation of chosen branch

### Phase 5 — Post-mortem hook
After the task closes: was the simulation accurate? Log outcome to decision record. Feeds self-hypothesis validation in the next neuron-loop cycle.

---

## Output Format

```
⬡ IZANAGI — Counterfactual Simulation Active

Decision: <one sentence>
Stakes: <scope + reversibility>

Branch A — <name>
  Approach: ...
  EV: +X (success_p=Y, value=Z, failure_p=W, cost=V)
  Reversibility: high/medium/low
  Failure mode: ...

Branch B — <name>
  [same structure]

Branch C — <name>
  [same structure]

RULING: Branch [X] — [reason in one sentence]
Rejected [Y]: [reason]. Rejected [Z]: [reason].

→ Proceeding with Branch [X].
```

---

## Integration

- Reads `pulse-plan.json` to check complexity tier before firing
- Writes `nisaba/izanagi/decision-<turnId>.json` for audit trail
- Feeds `self-hypothesis.mjs` post-mortem validation
- Cross-references `fingerprint.json` confidence_bias to calibrate EV estimates

---

## Session Notes

### 2026-05-16 — Created
Tools: Write. Part of Musubi Hyper-Intelligence v2 sprint.
Anime source: Naruto — Izanagi (Chapter 589+, Itachi vs. Kabuto arc).
Translation principle: The "cost one eye" constraint maps to the commitment cost — once you choose a branch, you lose the optionality of the others. Makes the decision weight real.
