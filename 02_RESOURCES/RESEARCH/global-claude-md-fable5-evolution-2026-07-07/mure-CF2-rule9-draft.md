# CF2 — Rule 9 Draft (problem-reframing + decide-under-incomplete-evidence)

**Source:** GLMTurbo_AdversarialOutsider `missing_coverage` finding (Rule-9 pair). **Style anchor:** `lane-opus-candidate.md` bolded-lead rule blocks. **Gates:** `SONNET-VOICE-SCOPE-GATE.md` VF-1..9, SD-1..5.

---

## Candidate rule block (insert into `## Reasoning & verification floor (every project)`)

```
**Test the problem before you commit to a path.** Verify the problem statement survives contact with the evidence — if the evidence reshapes the question, answer the new question. When evidence is incomplete, name the one specific missing fact that would change the decision, then gather or decide based on whichever is faster — never stall indefinitely, never decide without stating what you are deciding without.
```

---

## Gate self-check

| Gate | Verdict | Note |
|------|---------|------|
| VF-1 | PASS | No banned strings or corporate verbs. |
| VF-2 | PASS | Lead clause states the rule directly. |
| VF-3 | PASS | Three sentences, zero restatement — reframing mechanic, gather-or-decide mechanic, two anti-failure constraints each carry distinct enforceable content. |
| VF-4 | PASS | Mandates verify/reframe/name/decide-or-gather; no meta-narration. |
| VF-5 | PASS | No rule/mechanic name-drop. |
| VF-6 | PASS | Framed in evidence, speed, and decision-cost terms. |
| VF-7 | PASS | No branded power language. |
| VF-8 | PASS | Transcript-gradable: did the session test the problem against evidence before committing? name the flip-condition fact? choose gather vs decide? avoid indefinite stall and silent decide? |
| VF-9 | PASS | Em-dashes join clauses within one rule chain (reframe branch; gather-or-decide branch); no unrelated-clause glue, no bare intensifiers. |
| SD-1 | PASS | Zero repo-specific paths, lane IDs, or tools. |
| SD-2 | PASS | A Labs session with no YURI-OS context can execute every verb. |
| SD-3 | PASS | Content is universal process; matches an "(every project)" heading. |
| SD-4 | PASS | Stripped of all proper nouns, the instruction remains a complete behavioral rule. |
| SD-5 | PASS | No repo-specific dependency that could silently no-op. |

**VF: 9/9 PASS. SD: 5/5 PASS.**

---

## Placement recommendation

**Belongs in the global `Reasoning & verification floor (every project)` section — not in persona.md's decode pipeline.**

Rules 2/3/8 teach how to *label* uncertainty inside an already-posed problem; Rule 9 governs two earlier meta-decisions every session faces regardless of operator: whether the problem itself still holds after evidence contact, and whether incomplete evidence warrants gathering or deciding now. persona.md's decode pipeline is scoped to Marcel's nonlinear brain-dump input (five-state router, P4/P5 intent ranking, `04-BRAIN-DUMP-DECODER.md`) — a different job. A Labs session with zero Marcel context still needs reframing and gather-or-decide discipline; burying Rule 9 in persona would either duplicate the global floor or wrongly Marcel-gate a universal reasoning obligation. Same authority argument as Opus R-C/R-D: operational-floor weight, not persona-advisory register. Optional DRY residue: one persona bullet pointing to the global floor for "read the real ask" ↔ problem-reframing disambiguation — not a second copy of the rule.

**New 6th block (ideally first in the section), not merged into "Reason before you assert" or "Calibrate every load-bearing claim":** problem-reframing is a pre-path gate (is the question still right?) whereas R-A is a within-problem gate (which path among viable options?), and gather-or-decide is an action-timing rule under incomplete evidence whereas R-B only tags claims — merging either half would overload an already-dense block, misalign the bolded lead with half the content, and collapse two transcript-gradable checks into one.
