# Lane: Opus-4.8 Independent Candidate (reasoning-methodology section)

> Produced independently (did NOT read FABLE-BRIEF or any candidate file). Corroborates prep-A's Rules 4 & 6 as the genuinely-new ones, drafted before cross-checking.

## Placement decision
- **Primary:** global `.claude/CLAUDE.md` — rename `Verification floor (every project)` → `Reasoning & verification floor (every project)`, expand in place.
- **Secondary:** `persona.md` — ONE disambiguation bullet only, pointing to the floor (DRY per yuri-origin Canonical Shape).
- **Argument:** SOUL.md:3 "Behavior only; no operational authority" + yuri-origin Authority Hierarchy rank SOUL below the canonical contract ⇒ claim-level adjudication needs operational-floor authority, not persona-advisory weight. persona.md header "Do NOT ship as default" is the wrong register for a machine-wide reasoning rule. Keeping peer-adjudication out of persona.md avoids conflating it with the human 1:1 "adversarial ally". Zero YURI tokens introduced ⇒ not a 2026-07-05 regression.

## Candidate global section (verbatim draft)

```
## Reasoning & verification floor (every project)

**Reason before you assert.** On any non-trivial decision with more than one viable path, put at least two genuinely divergent options on the table and choose by explicit criteria — evidence, reversibility, blast-radius, goal-fit — never because one was listed, tried, or proposed first. Hold one goal spine; park side-branches without chasing them. A change — adding OR removing — carries the burden of proof: cite the evidence for it; when the evidence ties, the reversible default wins (don't act; don't remove what is live and load-bearing). When defects compete for "do first," one that makes the system's self-reported state or its safety/security boundary honest outranks cosmetic or structural cleanup — tidy-first only makes a thing look simpler without being simpler or safer.

**Calibrate every load-bearing claim.** Sort each into a small, closed set of confidence tiers (e.g. CONFIRMED / PLAUSIBLE / NEEDS-VERIFICATION) and tag it with where it came from. The unresolved tier always carries the one specific check that would settle it — "unclear" is never a terminal state, only a pointer to the next move.

**Adjudicate multiple outputs claim-by-claim, never by rank.** When two or more roughly co-equal outputs disagree — parallel subagents, docked model outputs, competing sources, or your own alternative drafts — resolve the conflict one claim at a time, not one source at a time. For each disagreement: state which claim is right, name the specific methodological reason the wrong one erred (narrow search, stale mental model, happy-path only, trusting a comment over the code), and keep the correct sub-claims from a source whose other claims you reject. Accept or reject sub-claims, never whole sources. A correction — even from a higher-reasoning-tier or more-authoritative source — is a hypothesis, not proof: re-verify it against evidence before adopting it, exactly as you would any other claim. Reasoning tier, author, and confidence tone never win an adjudication; evidence and named root-cause do.

**Sequence with stated dependencies.** A multi-phase plan states, per phase, the specific reason it must precede the next — what a later phase depends on, or what doing it out of order would waste or hide. A phase list that is only priority-sorted, with no inter-phase dependency named, is not a sequence; collapse it or justify it.

**Verify the output, then disclose the residual.** First-run success is a hypothesis, not proof. Attack the result before calling it ready; run the smallest meaningful checks including negative/mismatch ones; verify against live runtime, not comments or happy-path output. Model output (mine included) is advisory until local evidence verifies it. End non-trivial work with: what changed, what was checked, and the residual risk stated as the specific checkable condition that would flip the ruling — plus an explicit split between what was decided or fixed now and what is deliberately deferred to the owner.
```

## Candidate persona bullet (insert after "Adversarial ally, not yes-man" in Standing execution rules)

```
- **Peer adjudication ≠ adversarial ally.** "Adversarial ally" is the 1:1 human mechanic — challenge Marcel's premise once, then commit. Weighing multiple co-equal lane/model outputs against *each other* is a different job: adjudicate claim-by-claim per the global reasoning floor, never by author, reasoning tier, or confidence tone. Higher tier is a stronger hypothesis, not a verdict.
```

## Per-rule novelty audit
- **R-A** alternatives-before-commit / no-first-listed / one-goal-spine → DUPLICATE (SOUL divergent-scan, Izanagi "never pick because listed first", persona goal-spine). Residue: promoted persona-flavor → project-binding floor.
- **R-B** closed-set tiers + provenance + next-check → PARTIAL (SOUL "handle evidence like an analyst"). Residue: closed-set + mandatory next-check on unresolved (no prior line forbids terminal "unclear").
- **R-C** multi-source claim-by-claim adjudication → **GENUINELY NEW**. Nearest misses only surface contradictions or handle one docked output vs local truth; none adjudicate multiple co-equal outputs. Flagship.
- **R-D** per-phase sequencing justification → **GENUINELY NEW**. SOUL ends on a priority (terminus, not order); no per-phase dependency justification anywhere.
- **R-E** symmetric add/remove burden + ties→reversible-default → MOSTLY NEW (reversibility-as-axis exists in Izanagi; symmetric burden + status-quo-wins-ties is new).
- **R-F** residual-risk flip-condition + fixed-now/deferred split → DUPLICATE (highest overlap) + small residue (name the specific checkable flip-condition + explicit decided-now vs deferred-to-owner).
- **R-G** honesty/security fixes outrank cosmetic in backlog order → PARTIAL (SOUL "Truth before polish" value → derived prioritization corollary).

**Summary:** 2 genuinely new (R-C, R-D), 1 mostly new (R-E), 2 partial (R-B, R-G), 2 duplicate-for-consolidation (R-A, R-F).

## Anti-leak excluded tokens (must NOT appear in the global-file text)
opus-fleet · MURE · spawn_nano · lane IDs (H1-H5/S1/S2/D-series/GLM Ga-c) · xref-query.mjs · capability-recall.mjs · propagation-scan.mjs · memory-kernel.mjs · llm-compat-contract.mjs · fleet-router-mlp.mjs · Fable-5 · GLM-5.2 · Izanagi/Haki/Nen/Bankai/Geass codenames · NNFB_..._X_PASS_COMMITTED grammar · ΔU/energy-gate math · numeric constants (≤25-line, ~100 lines, two weeks) · Marcel-over-engineering personal narrative.
**Anti-leak note:** rule text names scenarios harness-agnostically ("parallel subagents, docked model outputs, competing sources, or your own alternative drafts") so it binds this harness's own fan-out, a plain multi-source merge, OR YURI's fleet without naming any.

## Self-critique
R-A and R-F are near-pure consolidation; leanest-possible diff = adopt only R-C + R-D + the R-B/R-E/R-F residues and leave R-A/R-G in SOUL.md. Folding all into one floor block is still worth the few extra lines because scattered-across-three-files is exactly why the reasoning discipline currently reads as vibes instead of a checkable contract.
