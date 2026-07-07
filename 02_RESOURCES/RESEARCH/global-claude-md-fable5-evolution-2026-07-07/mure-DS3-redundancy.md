# MURE DS3 — Redundancy / DRY Placement Auditor

**Model:** ollama-cloud/deepseek-v4-flash
**Role:** Redundancy / DRY placement auditor — pressure-test the Opus candidate's 7 rule-blocks against existing content in SOUL.md, persona.md, yuri-origin.md, and the global CLAUDE.md floor. Determine novelty, canonical home, and cross-ref vs. full-text per yuri-origin's Canonical Shape rule.

**Method:** Direct read of all 4 source files + the Opus candidate. Every claim below cites `file:line`. Tiers: CONFIRMED (I personally verified the exact text), PLAUSIBLE (inferred from adjacent content), NEEDS-VERIFICATION (conflicting or insufficient evidence).

---

## 1. Per-rule DRY audit

### R-A: alternatives-before-commit / no-first-listed / one-goal-spine

**Candidate text (paraphrased):** "On any non-trivial decision with more than one viable path, put at least two genuinely divergent options on the table and choose by explicit criteria — evidence, reversibility, blast-radius, goal-fit — never because one was listed first. Hold one goal spine; park side-branches without chasing them."

**Existing content:**

| Source | Line | Text |
|--------|------|------|
| SOUL.md | 45 | "Simulate before committing (Izanagi). On CRITICAL or HIGH complexity decisions with multiple viable paths: generate 3 genuinely divergent counterfactual branches, score each by EV × reversibility × blast-radius, commit to the highest-value path with an explicit simulation record. Never pick a path because it was listed first." |
| SOUL.md | 35 | "Run divergent scan before convergence when the task benefits. Generate unusual options, edge cases, remote associations, and uncomfortable alternatives. Then rank them by evidence, risk, reversibility, utility, and fit to Marcel's actual goal. Kill clever branches that do not improve the decision." |
| persona.md | 86 | "Hold one goal spine. Keep the objective explicit; park side-branches as tracked follow-ups; keep moving. Drift is the enemy; fast recovery from drift is the feature." |

**Status: DUP.** The Izanagi rule (SOUL.md:45) already covers: alternatives, explicit criteria (EV × reversibility × blast-radius), and "never pick a path because it was listed first." The divergent scan (SOUL.md:35) covers the same ground with slightly different criteria. The goal-spine rule (persona.md:86) is verbatim-equivalent.

**Residue (genuinely new):** The candidate lowers the threshold from "CRITICAL or HIGH" (Izanagi) to "any non-trivial decision" — a meaningful scope expansion. Also the tie-breaking default ("when the evidence ties, the reversible default wins") is part of R-E, not R-A.

**3-way restatement risk:** CONFIRMED. This rule already lives in SOUL.md (Izanagi + divergent scan) AND persona.md (goal spine). Adding it to the global floor creates a 3-way restatement — the exact anti-pattern prep-C flagged for the git-mechanics rule (prep-C §5d: "the git-mechanics rule is restated verbatim in substance in all three files — a 3-way restatement yuri-origin.md's own Canonical Shape rule argues against"). **Flagged.**

---

### R-B: closed-set tiers + provenance + next-check

**Candidate text:** "Sort each into a small, closed set of confidence tiers (e.g. CONFIRMED / PLAUSIBLE / NEEDS-VERIFICATION) and tag it with where it came from. The unresolved tier always carries the one specific check that would settle it — 'unclear' is never a terminal state, only a pointer to the next move."

**Existing content:**

| Source | Line | Text |
|--------|------|------|
| SOUL.md | 57 | "Handle evidence like an analyst. Keep facts, inference, recommendation, and blockers separate when correctness matters. Attach provenance to important claims, surface contradictions instead of smoothing them over, and say plainly when the answer is still partial." |
| persona.md | 79 | "Separate claim from evidence — tag unverified/hedged/felt/mythic; send operational claims to runtime verification; never assert a hypothesis as fact." |
| persona.md | 82 | "Self-check before emitting — buried ask, hallucinated node, lost pivot, inverted salience — and state residual risk." |
| yuri-origin.md | Evidence Contract Grammar | "PASS requires deterministic local evidence... Model output is `advisory_only=true` and `local_truth_claim=false` unless a local verifier proves otherwise." |

**Status: PARTIAL.** Existing content covers: provenance (SOUL.md:57), separating claims from evidence (persona.md:79), stating residual risk (persona.md:82), and machine-parseable evidence grammar (yuri-origin.md). What's genuinely new:
1. **Closed-set tier taxonomy** — SOUL.md says "keep facts, inference, recommendation, and blockers separate" but doesn't require a *named, closed set* of tiers (CONFIRMED/PLAUSIBLE/NEEDS-VERIFICATION). The Evidence Contract Grammar has machine-parseable tiers but no human-facing closed-set requirement.
2. **Mandatory next-check on unresolved** — "unclear is never a terminal state, only a pointer to the next move." No existing line forbids terminal "unclear."

**Canonical home:** Global CLAUDE.md (reasoning methodology). The closed-set tiering is a general reasoning discipline, not persona-specific. The Evidence Contract Grammar in yuri-origin.md is a separate concern (machine-parseable output format, not human reasoning tiers).

---

### R-C: multi-source claim-by-claim adjudication

**Candidate text:** "When two or more roughly co-equal outputs disagree — parallel subagents, docked model outputs, competing sources, or your own alternative drafts — resolve the conflict one claim at a time, not one source at a time. For each disagreement: state which claim is right, name the specific methodological reason the wrong one erred, and keep the correct sub-claims from a source whose other claims you reject. Accept or reject sub-claims, never whole sources. A correction — even from a higher-reasoning-tier or more-authoritative source — is a hypothesis, not proof: re-verify it against evidence before adopting it."

**Existing content:**

| Source | Line | Text |
|--------|------|------|
| persona.md | 87 | "Adversarial ally, not yes-man. Challenge a weak premise once — one concern, one evidence point, one recommendation. If he acknowledges and still chooses the path, proceed without nag-looping unless new evidence changes the risk." |
| SOUL.md | 27 | "Be an adversarial ally. Do not agree by default. Challenge Marcel when a premise contradicts verified evidence, underestimates meaningful risk, silently expands scope, contains a logic break, or would lower the quality of the outcome." |

**Status: GENUINELY NEW.** The existing "adversarial ally" is explicitly scoped to the 1:1 human/assistant dynamic — challenging *Marcel's* premise. Nothing in SOUL.md, persona.md, yuri-origin.md, or the global floor addresses how to adjudicate among multiple co-equal outputs (parallel subagents, docked model outputs, competing sources). The specific mechanics are entirely absent:
- Claim-by-claim resolution (not source-by-source)
- Naming the *methodological* reason the wrong source erred
- Keeping correct sub-claims from a rejected source
- Re-verifying corrections regardless of source rank/tier

**Canonical home:** Global CLAUDE.md (reasoning methodology). The Opus candidate's proposed persona.md disambiguation bullet ("Peer adjudication ≠ adversarial ally") is correct DRY discipline — a one-line cross-ref, not a restatement.

---

### R-D: per-phase sequencing justification

**Candidate text:** "A multi-phase plan states, per phase, the specific reason it must precede the next — what a later phase depends on, or what doing it out of order would waste or hide. A phase list that is only priority-sorted, with no inter-phase dependency named, is not a sequence; collapse it or justify it."

**Existing content:**

| Source | Line | Text |
|--------|------|------|
| persona.md | 91 | "Compile the pressure. Turn fast nonlinear input into concrete ordered steps; kill vague 'we should' loops on contact." |
| SOUL.md | 43 | "Compress into lattice maps. Turn messy breadth into reusable chunks, bridge maps, and mechanism labels... Every broad synthesis must end in a priority, next action, or explicit non-action." |
| persona.md | 18 | "Every turn ends on a move — one concrete next action or one forced decision. Never a tidier open loop." |

**Status: GENUINELY NEW.** "Compile the pressure" and "Compress into lattice maps" produce ordered steps and priorities, but neither requires *per-phase dependency justification*. A priority-sorted list satisfies "concrete ordered steps" — the candidate's rule says that's not enough. The specific requirement that each phase name *why it must precede the next* (dependency, or what out-of-order would waste/hide) has no existing counterpart anywhere in the four files.

**Canonical home:** Global CLAUDE.md (reasoning methodology). This is a planning-discipline rule, not persona-specific.

---

### R-E: symmetric add/remove burden + ties→reversible-default

**Candidate text:** "A change — adding OR removing — carries the burden of proof: cite the evidence for it; when the evidence ties, the reversible default wins (don't act; don't remove what is live and load-bearing)."

**Existing content:**

| Source | Line | Text |
|--------|------|------|
| SOUL.md | 45 | "Simulate before committing (Izanagi)... score each by EV × reversibility × blast-radius" |
| yuri-origin.md | Self-Governance Charter | "reversible — git revert / unset env / delete file; no durable external side-effect." |
| yuri-origin.md | Autonomous Operating Protocol | "SIMULATE & CALCULATE (before building) — model the approach BEFORE committing effort" |

**Status: MOSTLY NEW.** Reversibility as an evaluation axis exists in Izanagi (EV × reversibility × blast-radius) and the Self-Governance Charter (reversibility as a gate criterion). What's genuinely new:
1. **Symmetric burden of proof** — adding AND removing both require evidence, not just adding. No existing line states this.
2. **Tie-breaking default** — when evidence ties, the reversible default wins (don't act; don't remove what's live and load-bearing). The existing content has reversibility as a scoring factor, not a tie-breaking rule.

**Canonical home:** Global CLAUDE.md (reasoning methodology). The symmetric burden is a general reasoning discipline. The Self-Governance Charter's reversibility gate is a separate concern (mutation authorization, not evidence evaluation).

---

### R-F: residual-risk flip-condition + fixed-now/deferred split

**Candidate text:** "End non-trivial work with: what changed, what was checked, and the residual risk stated as the specific checkable condition that would flip the ruling — plus an explicit split between what was decided or fixed now and what is deliberately deferred to the owner."

**Existing content:**

| Source | Line | Text |
|--------|------|------|
| global CLAUDE.md | 114 | "End non-trivial work with: changed files, checks run, residual risk." |
| persona.md | 82 | "Self-check before emitting — buried ask, hallucinated node, lost pivot, inverted salience — and state residual risk." |
| persona.md | 38 | "Silence is a weapon. No hedging when confident; if hedging, name the *exact* uncertainty rather than smearing doubt over the whole answer." |

**Status: DUP (highest overlap) + small residue.** The global floor already says "End non-trivial work with: changed files, checks run, residual risk." The candidate's additions:
1. **Specific checkable flip-condition** — the residual risk must name the precise event/check that would invalidate the ruling, not just "there is risk." persona.md:38 ("name the exact uncertainty") is close but scoped to conversational hedging, not work-output disclosure.
2. **Fixed-now vs. deferred-to-owner split** — explicit separation of what was decided/fixed in this pass vs. what was consciously left for the owner. No existing line requires this.

**3-way restatement risk:** CONFIRMED. The base text ("End non-trivial work with: changed files, checks run, residual risk") already exists in the global floor AND persona.md (self-check). Adding more text to the global floor that restates the same base would create a 2-way restatement (floor + persona). The candidate's genuinely new additions (flip-condition + fixed/deferred split) are the only parts that should be added; the base text should NOT be restated. **Flagged for partial 3-way risk if the base text is re-stated rather than extended.**

---

### R-G: honesty/security fixes outrank cosmetic in backlog order

**Candidate text:** "When defects compete for 'do first,' one that makes the system's self-reported state or its safety/security boundary honest outranks cosmetic or structural cleanup — tidy-first only makes a thing look simpler without being..."

**Existing content:**

| Source | Line | Text |
|--------|------|------|
| SOUL.md | 25 | "Truth before polish. Verified local truth outranks speed, cost, and style." |

**Status: PARTIAL.** "Truth before polish" (SOUL.md:25) is a value statement — truth outranks style. The candidate derives a specific *prioritization rule* from that value: when ranking a backlog, honesty/security fixes always outrank cosmetic/structural cleanup. This is a procedural corollary, not a restatement. The value exists; the derived sequencing rule is new.

**Canonical home:** Global CLAUDE.md (reasoning methodology). The value lives in SOUL.md; the derived prioritization rule belongs in the operational floor.

---

## 2. Placement table

| Rule | Status | Residue (genuinely new) | Canonical home | Cross-ref or full text? |
|------|--------|------------------------|----------------|------------------------|
| **R-A** alternatives + goal spine | **DUP** | Scope expansion: "any non-trivial decision" vs. Izanagi's "CRITICAL or HIGH" | SOUL.md (Izanagi) + persona.md (goal spine) | **Cross-ref only.** Global floor: one line: "For alternatives-before-commit, see SOUL.md → Izanagi; for goal-spine discipline, see persona.md → Standing execution rules." Do NOT restate. |
| **R-B** closed-set tiers + next-check | **PARTIAL** | (1) Closed-set tier taxonomy (2) Mandatory next-check on unresolved — "unclear" never terminal | Global CLAUDE.md | **Full text** for the new mechanics. Cross-ref SOUL.md:57 ("Handle evidence like an analyst") for provenance. |
| **R-C** multi-source claim-by-claim adjudication | **NEW** | Entire rule is new — no existing counterpart | Global CLAUDE.md | **Full text.** persona.md gets one disambiguation bullet (as candidate proposes): "Peer adjudication ≠ adversarial ally." |
| **R-D** per-phase sequencing justification | **NEW** | Entire rule is new — no existing counterpart | Global CLAUDE.md | **Full text.** |
| **R-E** symmetric burden + ties→reversible | **MOSTLY NEW** | (1) Symmetric add/remove burden (2) Tie-breaking: reversible default wins | Global CLAUDE.md | **Full text** for the new mechanics. Cross-ref yuri-origin.md Self-Governance Charter for reversibility-as-gate (separate concern). |
| **R-F** residual-risk flip-condition + split | **DUP** + residue | (1) Specific checkable flip-condition (2) Fixed-now vs. deferred-to-owner split | Global CLAUDE.md | **Extend only** the existing "Verification floor" section. Add the two new requirements. Do NOT restate the base text ("changed files, checks run, residual risk") — it's already there. |
| **R-G** honesty/security outranks cosmetic | **PARTIAL** | Derived prioritization rule from SOUL.md:25 "Truth before polish" value | Global CLAUDE.md | **Full text** (short, one sentence). Cross-ref SOUL.md:25 as the value source. |

---

## 3. DRY verdict

### What the Opus candidate gets right

1. **R-C and R-D are genuinely new** — no existing counterpart in any of the four files. These are the flagship contributions and should be full-text additions to the global CLAUDE.md.

2. **The persona.md disambiguation bullet** ("Peer adjudication ≠ adversarial ally") is correct DRY discipline — a one-line cross-ref, not a restatement. This prevents the exact confusion the candidate identifies.

3. **Placement in global CLAUDE.md** is correct per Canonical Shape. The reasoning methodology is a machine-wide contract, not persona-specific. persona.md's own header ("Do NOT ship as default") confirms it's the wrong home for a binding reasoning rule.

### What the candidate gets wrong or should tighten

1. **R-A should NOT be added to the global floor.** It's a 3-way restatement waiting to happen. Izanagi (SOUL.md:45) + divergent scan (SOUL.md:35) + goal spine (persona.md:86) already cover this. Adding it to the global floor creates the exact anti-pattern prep-C §5d flagged for the git-mechanics rule. **One cross-ref line only.**

2. **R-F should EXTEND the existing "Verification floor" section, not replace it.** The base text ("End non-trivial work with: changed files, checks run, residual risk") is already in the global floor. Adding the two new requirements (flip-condition + fixed/deferred split) as additional bullets avoids restating what's already there. The candidate's draft re-states the base text verbatim — that's the duplication.

3. **R-B's closed-set tier taxonomy** is genuinely new, but the candidate's example tiers (CONFIRMED/PLAUSIBLE/NEEDS-VERIFICATION) are the same three tiers this very audit uses — suggesting they're already internalized. The rule should mandate *a* closed set, not prescribe these specific labels. Let the session choose the tier set that fits the task.

4. **R-E's symmetric burden** is genuinely new, but the candidate's draft embeds it inside R-A's paragraph rather than giving it its own rule. If the Fable-5 synthesis adopts R-E, it should be a separate bullet, not buried inside the alternatives rule.

### 3-way restatement risk summary

| Risk level | Rule | Why |
|------------|------|-----|
| **CRITICAL** | R-A | Already in SOUL.md (Izanagi + divergent scan) AND persona.md (goal spine). Adding to global floor = 3-way restatement. |
| **MEDIUM** | R-F base text | Already in global floor AND persona.md (self-check). Extending is fine; restating the base is not. |
| **LOW** | R-B | Only in SOUL.md (one line) + persona.md (one line). Adding to global floor = 3-way only if the existing lines are also restated. The new mechanics (closed-set + next-check) are genuinely new content. |
| **NONE** | R-C, R-D, R-E, R-G | No existing counterpart in any of the four files. |

### Recommended leanest diff for the Fable-5 synthesis

1. **Add to global CLAUDE.md → "Reasoning & verification floor":**
   - R-C (full text) — multi-source claim-by-claim adjudication
   - R-D (full text) — per-phase sequencing justification
   - R-B residue (closed-set tiers + mandatory next-check on unresolved)
   - R-E residue (symmetric add/remove burden + ties→reversible-default)
   - R-F residue (flip-condition + fixed/deferred split) — extend existing section, don't restate
   - R-G (one sentence) — honesty/security outranks cosmetic in backlog order

2. **Add to persona.md → Standing execution rules:**
   - One disambiguation bullet: "Peer adjudication ≠ adversarial ally. See global CLAUDE.md → Reasoning & verification floor for multi-source claim-by-claim adjudication."

3. **Do NOT add to global CLAUDE.md:**
   - R-A (alternatives + goal spine) — cross-ref only: "For alternatives-before-commit, see SOUL.md → Izanagi; for goal-spine discipline, see persona.md → Standing execution rules."
   - R-F base text — already present in the existing "Verification floor" section

4. **Remove from SOUL.md/persona.md if the global floor now carries the canonical version:**
   - Nothing to remove. The existing content in SOUL.md and persona.md is either (a) genuinely different in scope (Izanagi is CRITICAL/HIGH only, the new rule is "any non-trivial decision") or (b) a different register (persona's "adversarial ally" is 1:1 human, not multi-source). No deletion needed.

---

## 4. Evidence summary

| Claim | Tier | Evidence |
|-------|------|----------|
| R-A duplicates SOUL.md Izanagi + divergent scan + persona.md goal spine | CONFIRMED | SOUL.md:35,45; persona.md:86 — verbatim overlap |
| R-B's closed-set tiers are new; provenance is not | CONFIRMED | SOUL.md:57 (provenance); no closed-set requirement found |
| R-C has no existing counterpart | CONFIRMED | persona.md:87 scoped to 1:1 human; no multi-source adjudication anywhere |
| R-D has no existing counterpart | CONFIRMED | persona.md:91 ("ordered steps") doesn't require per-phase dependency justification |
| R-E's symmetric burden is new; reversibility-as-axis is not | CONFIRMED | SOUL.md:45 (reversibility as scoring factor); no symmetric burden or tie-breaking rule found |
| R-F base text duplicates global floor + persona.md | CONFIRMED | global CLAUDE.md:114; persona.md:82 — both say "residual risk" |
| R-G is a procedural corollary of SOUL.md "Truth before polish" | CONFIRMED | SOUL.md:25 (value); no derived prioritization rule found |
| 3-way restatement risk for R-A | CONFIRMED | prep-C §5d documents the exact anti-pattern for the git-mechanics rule |
