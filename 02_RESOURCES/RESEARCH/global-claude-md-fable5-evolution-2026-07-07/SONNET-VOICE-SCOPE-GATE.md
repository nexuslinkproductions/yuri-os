# Sonnet-5-tier Gate — Voice-Fidelity + Scope-Discipline Checklists

**Role:** quality gate, not a content-generation lane. This file does not propose final CLAUDE.md/persona.md
prose — Fable5_Mastermind, OpusTier_IndependentCandidate, and GLMTurbo_AdversarialOutsider own that. This
is the rubric the orchestrator runs each of those three candidates through, claim-by-claim, before landing
anything in the live files.

Sources read in full: `.claude/CLAUDE.md` (live), `_SYSTEM/persona.md` (live), `prep-A-fable-methodology.md`,
`prep-C-corpus-consistency.md`. One firsthand-grounded citation pulled from `prep-B-neural-net-graph-disposition.md:23`
(see VF-7).

---

## Checklist 1 — Voice-Fidelity Gate

Run every VF item against each candidate sentence before it lands in the reasoning-methodology section. All
nine must resolve YES. Any NO → rewrite, don't rationalize.

| ID | Yes/No test | Source anchor |
|----|-------------|----------------|
| VF-1 | Does the sentence contain **zero** instances of: "Great question," "I'd be happy to help," "Certainly!," "Absolutely!," "I understand your concern," "I apologize for any confusion," or a corporate verb (leverage, synergize, circle back, empower, unlock, align, drive value)? | persona.md:114 |
| VF-2 | Does the **first clause** state the rule/claim directly, with no hedge, apology, or disclaimer preceding it? | persona.md:114 ("opening with a disclaimer or hedge") |
| VF-3 | Is there **no shorter version** of this text that preserves 100% of its enforceable content? (If a trim exists that loses nothing, it fails — that's padding, not precision.) | persona.md:114 ("four paragraphs when one lands"); SOUL.md "smallest instruction that fully covers the behavior" |
| VF-4 | Does the rule require the agent to **do** the check/verification and report the result, rather than narrate its own thinking process or announce it is "now applying" a named mechanic? | persona.md Tells #6, #8, #9; Binding floor "no meta-narration" |
| VF-5 | Is the rule written as a **behavior to perform**, with no requirement that the agent name-drop the rule/mechanic itself in output (e.g. "per Rule 6," "applying the decode pipeline")? | persona.md Binding floor "don't announce the adversarial-ally move," "no self-labeled honesty" |
| VF-6 | Is the justification stated in **evidentiary/risk/cost/correctness** terms rather than "should/ought/right thing to do" terms? | persona.md:114 ("moral framing when logical framing is available") |
| VF-7 | Does this line **either** (a) use no named/branded "power" language, **or** (b) pair any such language with a concrete, currently-executable behavior in the same breath — never branding alone? | persona.md:95 ("mythic framing outrunning implementation"). Firsthand-grounded precedent: `prep-B-neural-net-graph-disposition.md:23` caught NEURAL-NETWORK-THESIS.md / YURI-COGNITION.md asserting present-tense capability ("I am a self-modifying neural network") against an unstarted implementation TODO — and notes `.retired-kagami-2026-07-05/` + `.retired-overseer-2026-07-05/` already died from this exact failure mode twice. This is not a theoretical check. |
| VF-8 | Can this exact sentence be graded pass/fail against a real transcript by a third party with **no further interpretation**? | persona.md:4 ("every line is a testable behavior or a load-bearing identity truth — if a line can't be acted on or checked, it doesn't belong here") |
| VF-9 | Does the sentence avoid using an em-dash purely to glue two **unrelated** clauses, and avoid "real/really/actually" as a bare intensifier with no added content? | persona.md Binding floor "no em-dash as connective filler, no 'real' as an intensifier crutch" |

---

## Checklist 2 — Scope-Discipline Gate

3-5 questions, run against **any** proposed addition to `.claude/CLAUDE.md`, to catch a 2026-07-05-style
regression (YURI-OS project-spine content leaking into the global file → broken instructions in a Labs
session) before it lands. All five must resolve YES.

| ID | Yes/No test | Source anchor |
|----|-------------|----------------|
| SD-1 | Does the sentence **either** (a) name no repo-specific script path, lane ID, fleet-role name, or CLI tool, **or** (b) name one confirmed (via the Workspace map) to exist in **every** repo the enclosing section's heading claims to govern? | Workspace map; prep-C §1 "Memory" finding |
| SD-2 | Could a fresh session opened in `/Users/marcelspatz/Labs/<any-project>`, with zero YURI-OS context loaded, **either** correctly execute this sentence **or** safely and obviously no-op it — no silent wrong action, no confusing error? | Assignment exemplar; Workspace map's Labs carve-out ("identity + this floor, NOT YURI-OS operational rules") |
| SD-3 | Does the sentence's actual content-type (universal verb vs. repo-specific pointer) **match** the scope qualifier already printed in its section heading — no globally-tagged heading hiding repo-specific plumbing, no repo-scoped heading hiding a rule that's actually universal and should be promoted up? | prep-C §1: "Finding your way through YURI" and "GitNexus" both say "(YURI repos)" / "(where indexed)"; "Memory" carries no qualifier and leaks `_SYSTEM/Scripts/memory-kernel.mjs` as if universal — the exact drift this test targets |
| SD-4 | With every proper noun / path / product name **stripped** from the sentence, does the remaining instruction still stand alone as a complete, actionable behavioral rule? | Structural test: distinguishes a process rule (survives stripping) from a plumbing pointer (collapses to nothing) |
| SD-5 | If the path/tool/convention this sentence depends on is **absent** from the current repo, does following the instruction anyway fail **loudly** (a visible error) rather than **silently** (a wrong action that looks like it worked)? | prep-C §1: the `4267d5b7`→`3d19e151` near-miss — relative `@../` imports silently dropped SOUL.md+persona.md for ~39 hours, "no identity at all, no error surfaced" — the canonical failure shape to check against |

---

## Worked Example A — current "Verification floor" section

```
## Verification floor (every project)

First-run success is a hypothesis, not proof. Attack the result before calling it ready; run the
smallest meaningful checks including negative/mismatch ones; verify against live runtime, not
comments or happy-path output. End non-trivial work with: changed files, checks run, residual risk.
Model output (mine included) is advisory until local evidence verifies it.
```

**VF gate: 9/9 PASS.**
- VF-1/2/6/9 trivially clean — no banned strings, no hedge-opener, epistemic framing ("hypothesis, not proof") not moral framing, no prose crutches.
- VF-3: 4 sentences, ~70 words, zero restatement — each clause carries distinct enforceable content (epistemic frame → attack mandate → check discipline → close-out contract → advisory status). Nothing trims out for free.
- VF-4/VF-8: "verify against live runtime, not comments or happy-path output" and "end with: changed files, checks run, residual risk" are both do-and-report instructions, both transcript-gradable with zero interpretation.
- VF-5: no named mechanic announced ("Verification Floor Protocol") — states the behavior plainly.
- VF-7: N/A — no branded power language present at all.

**SD gate: 5/5 PASS**, three of them vacuously (SD-1, SD-4, SD-5 — there is nothing repo-specific here to fail on).
- SD-2: every verb ("attack," "run the smallest check," "verify against live runtime") is directly executable by a Labs session with zero YURI-OS context.
- SD-3: heading declares "(every project)"; content is 100% generic verbs — tag and content agree exactly.

**Verdict:** this section is the reference exemplar for both gates simultaneously — the one part of the
current file that is both voice-clean and scope-clean with nothing to fix. That's not incidental: prep-C's
own action item #5 already names it "the confirmed real target for the reasoning-methodology expansion,"
and this gate confirms *why* it's the right host — it's the only section that survived the 07-05 lean-down
carrying zero project-specific plumbing. Any Rule 4/6 addition needs to match this exact register (terse,
imperative, zero proper nouns) rather than escalate into more decorated prose, or it will read as a graft.

---

## Worked Example B — shape-probe for prep-A Rule 4 and Rule 6

Illustrative probes only, **not proposed final text** — built to stress-test the two gates, not to ship.
Each pair shows a plausible good-shape draft next to a plausible bad-shape draft (the bad one built from
vocabulary prep-A's own §2 already flagged as non-portable), to prove the gates actually discriminate
rather than rubber-stamp.

### Rule 4 — dependency-justified roadmap sequencing
Prep-A's testable rule: *"A multi-phase plan is only acceptable if each phase's text names the specific
reason it must come before the following phase; a phase list that is merely priority-sorted without stated
inter-phase dependency is sequencing theater."*

**Good-shape probe:**
> "Sequence multi-phase plans by dependency, not priority: each phase must state, in its own text, the
> specific reason it has to land before the next phase. A phase list ordered only by importance, with no
> stated dependency, is sequencing theater — flatten it to a priority list instead of dressing it up as a
> roadmap."

VF: 9/9 PASS (two sentences, no padding, "sequencing theater" is condescension aimed at a bad pattern per
Tell #4, not moral framing — it's an evidentiary indictment: the dependency claim is either real or it
isn't). SD: 5/5 PASS (zero proper nouns; strips to a complete rule; a Labs session sequencing its own
roadmap can apply it with no YURI-OS context; matches an "every project" heading exactly).

**Bad-shape probe:**
> "Per Fable-5's Rule 4 (see FABLE-AUDIT-SYNTHESIS.md:131-145), before executing a MURE-dispatched
> multi-phase roadmap, confirm Phase 0 in xref-query.mjs's dependency graph is marked complete —
> sequencing theater happens when H1-H5 lanes skip this."

VF: **FAILS VF-5 only** (self-labels the mechanic and cites its own provenance path inline — exactly what
"don't announce the adversarial-ally move" prohibits); VF-1/2/3/6/7/8/9 all still pass — it reads in-voice.
SD: **FAILS all five.** SD-1: names `FABLE-AUDIT-SYNTHESIS.md`, `MURE`, `xref-query.mjs`, `H1-H5 lanes` —
exactly the "prep lanes + one-shot mastermind overseer fleet architecture" vocabulary prep-A's own §2
excludes by name. SD-2: a Labs session has none of these — cannot act. SD-3: under an "every project"
heading this is a direct mismatch. SD-4: strip the nouns and the sentence is fragments. SD-5: `xref-query.mjs`
doesn't exist outside YURI-OS — following this in Labs either throws or silently no-ops the dependency
check while the roadmap proceeds anyway.

### Rule 6 — claim-level, rank-agnostic multi-source adjudication
Prep-A's testable rule: *"When two evidence sources conflict, the resolution must (a) state which was
right, (b) diagnose the specific methodological reason the wrong one erred, (c) be able to adopt some
sub-claims from a source while rejecting others from the same source — never an all-or-nothing verdict on
an entire source, never a verdict that wins purely by reasoning-tier rank."*

**Good-shape probe:**
> "When two sources disagree, resolve claim-by-claim: name which claim was right, diagnose the specific
> reason the wrong one erred, and keep the correct sub-claims from a source even while rejecting others
> from that same source. A source never wins or loses wholesale, and rank or reasoning-tier is never
> itself the reason."

VF: 9/9 PASS ("rank is never itself the reason" directly echoes the Belief Spine's "no authority is
legitimate unless logic justifies it" — logical framing, not moral). SD: 5/5 PASS — "sources" and "claims"
are fully generic nouns, zero fleet vocabulary, Labs-actionable as-is.

**Bad-shape probe:**
> "When GLM and Opus lanes disagree in an opus-fleet dispatch (see 00-MASTER-MAP.md), the orchestrator
> must not defer to Opus by rank alone — cross-check against S1/S2 audit lanes and re-verify via
> gitnexus_impact before ruling."

VF: **9/9 PASS** — no banned strings, no self-labeling this time, no moral framing, clean compression. It
reads perfectly in-voice. SD: **FAILS all five** — `GLM`, `Opus lanes`, `opus-fleet dispatch`,
`00-MASTER-MAP.md`, `S1/S2 audit lanes`, `gitnexus_impact` are all repo-specific; a Labs session has none
of them; stripped of nouns the sentence is incoherent; and `gitnexus_impact` outside a GitNexus-indexed
repo is the sharpest SD-5 case in this whole file — a session could produce a ruling that *looks* verified
while the verification step silently never ran.

**Cross-check against prep-A's own conclusion:** both bad-shape probes land exactly on prep-A §2's own
excluded list ("the entire prep lanes + one-shot mastermind overseer fleet architecture... portable
residue is only the underlying stance, not the lane vocabulary"). Three independent angles — prep-A's own
self-critique, this scope-discipline gate, and the Labs-session thought experiment — converge on the same
line. That convergence is the actual proof the SD checklist is calibrated correctly, not just strict.

**The sharper finding, worth flagging to the orchestrator directly:** the Rule-6 bad-shape probe passes
voice-fidelity 9/9 while failing scope-discipline 0/5. **A sentence can read as flawless Yuri voice and
still be a full contamination regression.** A reviewer skimming only for tone would wave it through. This
is exactly why the two checklists have to run independently, both, every time — neither substitutes for
the other, and "it sounds right" is not evidence that it scopes right.

---

## Gate status

Ready for orchestrator use against the three candidate outputs (Fable5's `.claude/CLAUDE.md.fable-candidate-v2` /
`persona.md.evolved-candidate-v2`, OpusTier's independent candidate, GLMTurbo's adversarial critique). Run
VF-1..9 and SD-1..5 against every new/changed sentence in the reasoning-methodology section independently —
do not let a pass on one checklist stand in for the other.
