# MURE DS4 — Owner-Intent / Anti-Over-Engineering Pressure Test

**Model:** ollama-cloud/deepseek-v4-flash
**Role:** Owner-intent / anti-over-engineering check — pressure-test the Opus candidate against Marcel's actual ask (store Fable-5's root intelligence without over-engineering) from angles not yet covered by Opus, GLM-turbo, or Sonnet.

**Inputs read:** `lane-opus-candidate.md` (full), `prep-A-fable-methodology.md` (full), `prep-B-neural-net-graph-disposition.md` (full), `prep-C-corpus-consistency.md` (full), `SONNET-VOICE-SCOPE-GATE.md` (full), `_SYSTEM/persona.md` (full), `.claude/CLAUDE.md` (live, via context). `lane-glmturbo-adversarial.md` — **NOT FOUND** at stated path; no file matching `*glm*` exists in the research directory. I infer GLM-turbo's verdict from the assignment text ("Rules 2 & 7 are format-only; Rule-9 missing-coverage finding") and judge independently.

---

## (a) Load-bearing vs. format-only: which Opus blocks change actual decisions?

### GLM-turbo's claim: Rules 2 & 7 are format-only

**CONFIRMED for Rule 7** (prep-A's Rule 7: "durable artifact first, bounded digest second, every resolved decision carries an explicit ruling label, artifact closes on an unambiguous completion signal"). The Opus candidate correctly **excluded** Rule 7 from its 5 blocks — it recognized this as output-formatting convention, not reasoning methodology. GLM-turbo's verdict on Rule 7 is correct, and the Opus candidate already acted on it. No disagreement.

**DISAGREE for Rule 2** (prep-A's Rule 2: "Every judged item lands in exactly one named tier; the 'unresolved' tier always carries a next check, never a shrug"). The Opus candidate encodes this as Block 2:

> **Calibrate every load-bearing claim.** Sort each into a small, closed set of confidence tiers (e.g. CONFIRMED / PLAUSIBLE / NEEDS-VERIFICATION) and tag it with where it came from. The unresolved tier always carries the one specific check that would settle it — "unclear" is never a terminal state, only a pointer to the next move.

**This is NOT format-only.** Three distinct reasoning disciplines here, each load-bearing:

1. **Closed-set tier taxonomy** — forces the agent to commit a claim to a category rather than leaving it in vague prose. This changes how the agent thinks about every claim it makes. A session that sorts claims into CONFIRMED/PLAUSIBLE/NEEDS-VERIFICATION produces different output than one that doesn't.

2. **Provenance tagging** — "tag it with where it came from." This is a reasoning discipline (evidence awareness), not formatting. It forces the agent to track the source of each claim, which changes how it evaluates confidence.

3. **Mandatory next-check on unresolved** — "'unclear' is never a terminal state, only a pointer to the next move." This is the most load-bearing part. It prevents the agent from leaving things in limbo. A session that must name the specific check that would settle a NEEDS-VERIFICATION claim will either go find that evidence or explicitly acknowledge it can't be found — both are better than "unclear."

**Verdict:** GLM-turbo's "format-only" label on Rule 2 is too broad. The closed-set tier + mandatory next-check is a reasoning discipline that changes decisions. The Opus candidate's Block 2 is load-bearing and should be kept.

### Per-block load-bearing analysis of the Opus candidate

| Block | Content | Load-bearing? | Verdict |
|-------|---------|---------------|---------|
| **Block 1** "Reason before you assert" | R-A (alternatives-before-commit) + R-E (symmetric burden) + R-G (honesty priority) | **Mixed** | See sub-analysis below |
| **Block 2** "Calibrate every load-bearing claim" | R-B (closed-set tiers + next-check) | **YES** — changes how every claim is evaluated | KEEP |
| **Block 3** "Adjudicate multiple outputs claim-by-claim" | R-C (multi-source adjudication) | **YES** — genuinely new, changes how conflicts are resolved | KEEP |
| **Block 4** "Sequence with stated dependencies" | R-D (dependency-justified sequencing) | **YES** — genuinely new, changes how plans are structured | KEEP |
| **Block 5** "Verify the output, then disclose the residual" | R-F (flip-condition + fixed/deferred split) + existing verification floor | **PARTIAL** — core is existing; residues are small but real | MERGE into existing floor |

**Block 1 sub-analysis:**

- **R-A** (alternatives-before-commit, no-first-listed, one-goal-spine): **NOT load-bearing as new content.** Already present in SOUL.md ("Divergent scan before convergence," "never pick because listed first") and persona.md ("Hold one goal spine"). The Opus candidate's own audit flags this as DUPLICATE. Adding it to the global floor is consolidation, not new intelligence. Consolidation has value when scattered rules cause confusion, but here the rules are in SOUL.md which is @-loaded every session — the agent already has them. Re-stating them in the global file is duplication, not reinforcement. **CUT.**

- **R-E** (symmetric add/remove burden + ties→reversible-default): **Load-bearing and genuinely new.** "When the evidence ties, the reversible default wins (don't act; don't remove what is live and load-bearing)" — this is NOT present in SOUL.md or persona.md. The existing rules say "every synthesis ends in a priority, next action, or explicit non-action" but don't specify what to do when evidence is equivocal. This rule changes decisions: a session that would have acted on weak evidence now defaults to inaction. **KEEP** as a short standalone rule.

- **R-G** (honesty/security outranks cosmetic in backlog order): **NOT load-bearing as root intelligence.** It's a direct corollary of SOUL.md's "Truth before polish" value. The value is already there; this is a derived application rule. Adding every derived rule is over-engineering — the root value should generate the derived behavior, not be enumerated. **CUT.**

---

## (b) Is the 5-block section the smallest thing that delivers the ask?

**No.** The Opus candidate's 5 blocks can be reduced to 3 new blocks + 1 expanded existing block without losing enforceable content.

### What can be cut without loss

**Block 1's R-A (alternatives-before-commit):** Already in SOUL.md. The Opus candidate's own audit says DUPLICATE. Cutting it removes 3 sentences (~60 words) of restated content. The agent already has these instructions via the @-loaded SOUL.md. Re-stating them in the global file is the kind of "scattered-across-three-files" the Opus candidate itself warns against — but in the wrong direction: it's adding the same rule to a third file instead of keeping it in the one canonical home.

**Block 1's R-G (honesty/security outranks cosmetic):** A derived corollary, not root intelligence. Cutting it removes 1 sentence (~25 words) that adds no new reasoning capability — it only applies an existing value to a specific scenario. If the agent has "Truth before polish" and can reason, it will derive this priority on its own. If it can't, listing one derived case won't fix the gap.

### What can be merged without loss

**Block 5 (verification + residual risk):** The core of this block is the existing "Verification floor" section. The new residues are:
- "the residual risk stated as the specific checkable condition that would flip the ruling"
- "an explicit split between what was decided or fixed now and what is deliberately deferred to the owner"

These are 2 small additions to the existing 4-sentence verification floor. Making them a separate 5th block inflates the section. **MERGE** these residues into the existing verification floor as 1-2 additional sentences.

### What stays

**Block 2 (R-B — claim calibration):** 2 sentences, tight, enforceable, partially new. **KEEP.**

**Block 3 (R-C — multi-source adjudication):** 4 sentences, flagship new content. **KEEP.**

**Block 4 (R-D — dependency sequencing):** 2 sentences, genuinely new. **KEEP.**

**R-E (symmetric burden + ties→reversible):** This is the one piece of Block 1 worth keeping. It's 1-2 sentences. Can stand alone as a short rule or be merged into the verification block's preamble. **KEEP** as a short standalone rule or merge into the expanded verification block.

### Leanest-viable section: 3 new blocks + 1 expanded existing block

```
## Reasoning & verification floor (every project)

**Calibrate every load-bearing claim.** Sort each into a small, closed set of confidence tiers
(e.g. CONFIRMED / PLAUSIBLE / NEEDS-VERIFICATION) and tag it with where it came from. The unresolved
tier always carries the one specific check that would settle it — "unclear" is never a terminal state,
only a pointer to the next move.

**Adjudicate multiple outputs claim-by-claim, never by rank.** When two or more roughly co-equal
outputs disagree — parallel subagents, docked model outputs, competing sources, or your own alternative
drafts — resolve the conflict one claim at a time, not one source at a time. For each disagreement:
state which claim is right, name the specific methodological reason the wrong one erred (narrow search,
stale mental model, happy-path only, trusting a comment over the code), and keep the correct sub-claims
from a source whose other claims you reject. Accept or reject sub-claims, never whole sources. A
correction — even from a higher-reasoning-tier or more-authoritative source — is a hypothesis, not
proof: re-verify it against evidence before adopting it.

**Sequence with stated dependencies.** A multi-phase plan states, per phase, the specific reason it
must precede the next — what a later phase depends on, or what doing it out of order would waste or
hide. A phase list that is only priority-sorted, with no inter-phase dependency named, is not a
sequence; collapse it or justify it.

**Verify the output, then disclose the residual.** First-run success is a hypothesis, not proof.
Attack the result before calling it ready; run the smallest meaningful checks including negative/
mismatch ones; verify against live runtime, not comments or happy-path output. A change — adding OR
removing — carries the burden of proof: cite the evidence for it; when the evidence ties, the
reversible default wins (don't act; don't remove what is live and load-bearing). End non-trivial work
with: what changed, what was checked, and the residual risk stated as the specific checkable condition
that would flip the ruling — plus an explicit split between what was decided or fixed now and what is
deliberately deferred to the owner. Model output (mine included) is advisory until local evidence
verifies it.
```

**Changes from Opus candidate:**
- Cut R-A (alternatives-before-commit) — already in SOUL.md
- Cut R-G (honesty/security outranks cosmetic) — derived corollary, not root intelligence
- Cut the "Reason before you assert" heading — too vague, doesn't add enforceable content beyond the specific rules
- Moved R-E (symmetric burden + ties→reversible) into the verification block — natural home since it governs when to act vs. not act
- Kept R-B, R-C, R-D as standalone blocks
- Kept R-F residues merged into verification block

**Count:** 4 blocks (3 new + 1 expanded) vs. Opus's 5. ~30% reduction in section size. Zero loss of enforceable content.

---

## (c) Should GLM-turbo's Rule 9 (problem-reframing + decide-under-incomplete-evidence) be ADDED?

### What Rule 9 would be

Since the GLM-turbo file is missing, I reconstruct from the assignment text: "problem-reframing + decide-under-incomplete-evidence." Two distinct cognitive moves:

1. **Problem reframing** — Before answering a question or executing a task, step back and check whether the problem as stated is the right problem. Reframe if the framing hides a better path.

2. **Deciding under incomplete evidence** — When you cannot obtain complete evidence (the check is impossible, too expensive, or time-constrained), have a protocol for proceeding anyway — state the assumption, tag its confidence, and note what would falsify it.

### Does it change decisions?

**Problem reframing:** YES, it changes decisions. A session that accepts "implement feature X" vs. one that asks "is feature X the right solution to the underlying need?" will produce different work. However, this is **already covered** by SOUL.md's decode pipeline ("Read the real ask — rank underlying intents; surface the hidden constraint (P4) and meta-need (P5)") and persona.md's "Adversarial ally" mechanic ("Challenge a weak premise once"). The existing coverage is scoped to Marcel's input, but the underlying cognitive move (don't accept the surface framing) is the same. Adding it as a general rule would be restating an existing principle in different words.

**Verdict on problem reframing:** DO NOT ADD. Already covered by SOUL.md's decode pipeline. Adding it as a separate rule would be over-engineering — it's the same cognitive move, just generalized from "Marcel's input" to "any problem." The generalization is valid but doesn't add new enforceable content; it only widens the scope of an existing rule. If the agent can reframe Marcel's input, it can reframe any problem — the skill generalizes without being re-stated.

**Deciding under incomplete evidence:** YES, it changes decisions. And it is **NOT covered** by any existing rule. The Opus candidate's Block 2 says "the unresolved tier always carries the one specific check that would settle it" — this assumes the check IS possible. It doesn't address what to do when:
- The check requires access the agent doesn't have
- The check would take longer than the task allows
- The evidence simply doesn't exist yet

A session that freezes when evidence is unobtainable vs. one that has a protocol for proceeding will produce different output. This is a genuine gap.

**Verdict on decide-under-incomplete-evidence:** ADD, but as a **short sub-rule** (1-2 sentences) within the calibration block, not as a standalone block. This avoids over-engineering while filling the gap.

### Anti-over-engineering check

Adding Rule 9 as a full block would violate the anti-over-engineering constraint:
- Problem reframing is already covered (just generalized)
- A full block for decide-under-incomplete-evidence would be ~3 sentences for a narrow case

Adding it as a **short sub-rule** (1 sentence appended to Block 2) satisfies the ask better:
- Fills the genuine gap (what to do when the check is impossible)
- Doesn't inflate the section
- Doesn't add a rule that sounds impressive but rarely fires

**Recommended addition to Block 2:**
> When the check that would settle a claim is impossible, too expensive, or time-constrained, state the assumption explicitly, tag its confidence, and name what would falsify it — then proceed, don't stall.

---

## Per-block keep/cut/merge/add table

| Block | Content | Decision | Reasoning |
|-------|---------|----------|-----------|
| **Opus Block 1 — R-A** | Alternatives-before-commit, no-first-listed, one-goal-spine | **CUT** | Already in SOUL.md (divergent-scan, Izanagi, goal-spine). Duplication, not reinforcement. |
| **Opus Block 1 — R-E** | Symmetric add/remove burden, ties→reversible-default | **KEEP, merge into verification block** | Genuinely new. Changes decisions when evidence is equivocal. Natural home is the verification block since it governs when to act. |
| **Opus Block 1 — R-G** | Honesty/security outranks cosmetic | **CUT** | Derived corollary of SOUL.md's "Truth before polish." Not root intelligence. Listing one derived case is over-engineering. |
| **Opus Block 2 — R-B** | Closed-set tiers, provenance, mandatory next-check | **KEEP** | Load-bearing reasoning discipline. Changes how every claim is evaluated. Not format-only (contra GLM-turbo). |
| **Opus Block 3 — R-C** | Multi-source claim-by-claim adjudication | **KEEP** | Flagship new content. Genuinely new, no existing counterpart. Changes how conflicts are resolved. |
| **Opus Block 4 — R-D** | Dependency-justified sequencing | **KEEP** | Genuinely new. Changes how plans are structured. |
| **Opus Block 5 — R-F** | Flip-condition + fixed/deferred split | **MERGE** into existing verification floor | Small residues (2 additions to 4 existing sentences). Not enough content for a standalone block. |
| **GLM-turbo Rule 9 — problem reframing** | Step back, check the framing | **DO NOT ADD** | Already covered by SOUL.md decode pipeline ("Read the real ask"). Generalizing doesn't add new enforceable content. |
| **GLM-turbo Rule 9 — decide under incomplete evidence** | Protocol for when evidence is unobtainable | **ADD as sub-rule** in Block 2 | Genuine gap. Opus blocks assume evidence is obtainable. 1-2 sentences fills it without over-engineering. |

---

## Leanest-viable section recommendation

**3 new blocks + 1 expanded existing block** (down from Opus's 5):

1. **Calibrate every load-bearing claim** (R-B) — as Opus wrote it, plus the decide-under-incomplete-evidence sub-rule
2. **Adjudicate multiple outputs claim-by-claim, never by rank** (R-C) — as Opus wrote it
3. **Sequence with stated dependencies** (R-D) — as Opus wrote it
4. **Verify the output, then disclose the residual** (existing verification floor + R-E + R-F residues) — expanded in place

**Total:** ~20 lines of new prose (down from Opus's ~30). Zero loss of enforceable content. All genuinely new reasoning disciplines preserved. All duplication and derived corollaries cut.

**Placement:** Global `.claude/CLAUDE.md` as Opus recommended. Rename "Verification floor (every project)" → "Reasoning & verification floor (every project)". The persona.md gets ONE disambiguation bullet (Opus's "Peer adjudication ≠ adversarial ally") to prevent conflating the new multi-source adjudication rule with the existing 1:1 adversarial-ally mechanic.

**Anti-leak:** The leanest section above uses zero YURI-OS-specific tokens. Passes Sonnet's SD-1 through SD-5. A Labs session can apply every rule with zero YURI-OS context.

---

## Residual risk

| Judgment call | Checkable trigger that would flip it | Status |
|---|---|---|
| R-A (alternatives-before-commit) is DUPLICATE and safe to cut | If a future session demonstrably fails to generate alternatives before committing, and SOUL.md's divergent-scan + Izanagi rules are present and loaded, then the duplication was not the cause — the agent simply didn't follow existing rules. The cut stands. | CONFIRMED — SOUL.md is @-loaded every session. |
| R-G (honesty/security outranks cosmetic) is a derived corollary, safe to cut | If a future session consistently prioritizes cosmetic cleanup over state-honesty fixes despite having "Truth before polish" in SOUL.md, then the corollary was needed as explicit instruction. Add it back as a single sentence in the verification block. | PLAUSIBLE — the corollary is valid but the root value should generate it. Monitor. |
| Decide-under-incomplete-evidence sub-rule is genuinely new and not over-engineering | If the sub-rule is never exercised (sessions always have complete evidence) or produces worse decisions than the default behavior, remove it. | PLAUSIBLE — narrow case, but the gap is real. The 1-sentence addition is low-risk. |
| GLM-turbo's full critique is unavailable (file missing) | If the GLM-turbo file is found and contains additional Rule-9 arguments not addressed here, re-evaluate. | NEEDS-VERIFICATION — file not found at stated path. |

---

## Summary

| Dimension | Finding |
|-----------|---------|
| **Load-bearing vs. format-only** | GLM-turbo correct on Rule 7 (format-only, already excluded by Opus). GLM-turbo incorrect on Rule 2 — closed-set tiers + mandatory next-check is a reasoning discipline that changes decisions. |
| **Smallest viable section** | Opus's 5 blocks → 3 new blocks + 1 expanded existing block. Cut R-A (duplicate) and R-G (derived corollary). Merge R-E and R-F residues into verification block. ~30% reduction, zero loss. |
| **Rule 9 addition** | Problem-reframing: DO NOT ADD (already covered by SOUL.md decode pipeline). Decide-under-incomplete-evidence: ADD as 1-sentence sub-rule in calibration block (genuine gap, low-risk addition). |
| **Anti-over-engineering** | The leanest section passes. Every kept rule changes decisions. Every cut rule is either duplicate or derived. The one addition (decide-under-incomplete-evidence) is the minimum viable fill for a genuine gap. |
