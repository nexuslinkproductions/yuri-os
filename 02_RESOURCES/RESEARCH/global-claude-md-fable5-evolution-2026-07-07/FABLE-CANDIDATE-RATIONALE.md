# FABLE-CANDIDATE-RATIONALE — Final Synthesis Ruling (2026-07-07)

**Synthesizer:** Fable-5 (`anthropic/claude-fable-5`, high reasoning), final one-shot pass over the full fan-out: prep-A/B/C, lane-opus-candidate, GLM-turbo adversarial verdict (recovered via IRC — see §6), SONNET-VOICE-SCOPE-GATE, and all eight MURE lanes (DS1–DS4, CF1–CF4).

**Deliverables written this pass:**
1. `.claude/CLAUDE.md.fable-candidate-v2` (candidate — orchestrator swaps after verification)
2. `_SYSTEM/persona.md.evolved-candidate-v2` (candidate — one bullet inserted, nothing else)
3. This rationale
4. `FABLE-NEURAL-GRAPH-RULING.md` (sibling file)
5. `_SYSTEM/FABLE-5-PROTOCOL.md` (canonical, finalized from CF4 draft)
6. **Live edit applied:** `_SYSTEM/yuri-origin.md` — `.amp/` added to Protected Surfaces (CF3 Fix 3, verbatim; one-line additive insertion after `node_modules/`, verified in place). Applied live rather than as a candidate because the adjudication contract instructed verbatim application, the file is not in the do-not-overwrite set, and the edit is one additive line to a list both adapters already carry.

Ruling labels used throughout: **CONFIRMED** (personally verified against live code/config/git this pass) / **PLAUSIBLE** (consistent with evidence, not independently re-derived) / **NEEDS-VERIFICATION** (carries its settling check).

---

## 1. Convergent findings — adopted (with my re-verification)

| Finding | Source | My verification | Action |
|---|---|---|---|
| Candidate section is scope-clean, 22/22 sentences pass SD-1..5 | DS2 | Spot-checked the assembled v2 section against the excluded-token list: zero hits (see §5) | Adopted as baseline confidence; re-ran on MY final text since it differs from what DS2 audited |
| CF1 voice-clean rewrite (9/9 VF; fixed VF-3 bold-lead padding + VF-9 em-dash glue) | CF1 | Read per-sentence table; the rewrite drops zero enforceable residue (cross-checked against Opus R-A..R-G list) | **Used as the prose base** for the new section |
| Candidate does not weaken the binding floor; add one guardrail sentence | DS1 | Re-read DS1's three checks against persona.md Binding floor + yuri-origin Self-Governance Charter; the reasoning-vs-governance layer split holds | Guardrail added to the adjudication paragraph (wording note in §3.4) |
| R-C + R-D genuinely new; R-F extend-don't-restate; R-A cross-ref-don't-restate | DS3 | Independently confirmed R-C/R-D absence: no multi-source adjudication or per-phase dependency language exists in SOUL.md/persona.md/live floor | Adopted; depth ruled in §2.3 |
| CF3's three factual-defect edits | CF3 | **CONFIRMED all three myself:** YURI-BUSINESS `d7af8926` (2026-06-14) is the direct-commit governance upgrade, its CLAUDE.md:166-168 Execution Rules carry the direct-commit language live; live global file lines 26-27/41-44 self-contradict; `.gitignore:185` = `.amp/`; yuri-origin Protected Surfaces (lines 50-61) lacked `.amp/` | Fixes 1a/1b/2 applied verbatim to candidate-v2; Fix 3 applied verbatim to live yuri-origin.md |

---

## 2. The three divergent points — RULINGS

### 2.1 Rule-9 (problem-reframing + decide-under-incomplete-evidence): CF2 full 6th block vs DS4 half-sub-rule

**RULING: DS4's position wins, refined — no new block; one sentence added to the calibration paragraph carrying ONLY the decide-under-incomplete-evidence half. Problem-reframing is CUT from the floor.**

Root-cause adjudication (not by rank — DS4 is a deepseek-flash lane, CF2 a composer lane; neither wins by tier):

- **Both lanes missed the decisive evidence.** SOUL.md already carries "**Resolve ambiguity directly.** If a decision depends on a missing fact, name the missing fact. If the fact is not decisive, proceed with an explicit assumption" — the closest existing counterpart to Rule-9's second half — and "**Be an adversarial ally**… challenge Marcel when a premise contradicts verified evidence," which IS evidence-contact-time premise checking, i.e. the reframing half's core move. Neither CF2's placement argument nor DS4's coverage argument cites either line. CF2's "persona decode pipeline is Marcel-scoped" argument is technically right but immaterial on this machine: SOUL.md + persona.md are @-included into every session, Labs included, so the coverage travels wherever the floor travels. CONFIRMED (read both live files this pass).
- **Why the reframing half is cut:** its residue over SOUL.md ("if the evidence reshapes the question, answer the new question" as an imperative rather than a challenge) is one clause deep. Under the prime directive (when in doubt, CUT) and the same DRY logic that cross-refs R-A instead of restating it, a one-clause residue does not earn a floor block. Consistency matters: I cannot cut R-A for being SOUL-covered and simultaneously admit a SOUL-covered reframing rule.
- **Why the incomplete-evidence half is kept — and where:** the new floor text itself creates the gap. "The unresolved tier always carries the one specific check that would settle it" loops forever when the check is unreachable (no access, too costly, evidence doesn't exist yet). That defect is internal to the calibration paragraph, so it is closed in the calibration paragraph — not in a standalone block that would re-separate a rule from the text it patches. Final sentence merges DS4's draft with CF2's sharpest constraint ("never decide without stating what you are deciding without" — kept, it is transcript-gradable and nowhere else in the corpus).

Adopted text (calibration paragraph, final sentence): *"When that check is unreachable (impossible, too costly, or slower than the decision is worth), state the assumption you proceed on, tag its confidence, and name what would falsify it; don't stall on evidence you cannot get, and don't decide without stating what you are deciding without."*

CF2's block-level VF/SD self-check was accurate for its own text — the cut is not a quality judgment on CF2's prose, it is a duplication judgment on its first half and a placement judgment on its second.

### 2.2 R-G (honesty/security-outranks-cosmetic): DS3 keep vs DS4 cut

**RULING: KEEP (DS3 wins). One sentence, in the decision-discipline paragraph, as CF1 voice-cleaned it.**

- **DS4's own flip-trigger has already fired.** DS4's residual-risk table says cut R-G unless "a future session consistently prioritizes cosmetic cleanup over state-honesty fixes despite having 'Truth before polish.'" That is not a future hypothetical — it is this repo's documented past: two present-tense-false mythic docs sat in `_SYSTEM/` beside live scripts (prep-B, re-verified by me: `YURI-COGNITION.md:4` still asserts "I am a self-modifying neural network" today), and `.retired-kagami-2026-07-05/` + `.retired-overseer-2026-07-05/` are two subsystems that died of exactly this failure mode. "The root value should generate the derived behavior" is the idealism the evidence contradicts. CONFIRMED.
- **Different decision surface, so not a duplicate.** SOUL.md's "Truth before polish" governs answer quality (truth outranks speed/cost/style in what you say). R-G governs work ordering (which defect you fix first). A backlog-sequencing rule is also a direct input to R-D (dependency sequencing) — it is load-bearing for the section's own machinery. prep-A Rule 5 shows it independently derived in an unbriefed tasking (`01-FABLE-MASTERMIND-VERDICT.md:6`). GLM-turbo's 0.55-confidence "weak recurrence" read is the correct caution about *emergence*, not about *utility* — a rule can be partially briefed AND decision-changing.
- **Cost is one voice-clean, scope-clean sentence.** VF 9/9 (CF1 table sentence 6 rewrite), SD 5/5 (DS2 table sentence 5). The anti-over-engineering bar is "does it change decisions per token spent" — one sentence that reorders backlogs clears it.

### 2.3 R-A / R-F duplication depth

**RULING: R-A — zero restatement; one cross-ref sentence that names the two mechanics and declares them binding via the @-includes. R-F — extend in place; the base four lines stay exactly once, in the floor section they have always lived in.**

- **R-A:** DS3's proposed cross-ref line named SOUL.md section headings ("Izanagi") — a fragile pointer that also drags a codename the Opus anti-leak list excludes into the global file. DS4's "cut entirely, no cross-ref" is leaner but loses two things the adjudication contract wanted kept: (a) an explicit signpost preventing a future editor from re-adding R-A "because the floor looks incomplete" (the anti-over-engineering ratchet), and (b) Opus's authority point — R-A currently binds only at persona-advisory weight; a floor sentence that says the discipline *binds* promotes it to floor authority without duplicating a word of its text. Final wording: *"Alternatives-before-commit and goal-spine discipline bind via the @-included SOUL.md and persona.md; they are not restated here."* One sentence, no restatement, no codenames, resolves both DS3's DRY flag and Opus's authority argument.
- **R-F:** DS3's "don't restate the base" warning targets duplication *across files*. Since the new section REPLACES the old "Verification floor" in place, the base text ("First-run success is a hypothesis…") exists exactly once — here, its canonical home. The pre-existing persona.md:82 echo ("state residual risk") predates this pass and is a different register (emit-time self-check); left untouched. Extension = CF1's paragraph 5: flip-condition phrasing + decided-now/deferred-to-owner split appended to the close-out contract. Adopted verbatim from CF1.

---

## 3. Kept / dropped / merged — full ledger

### 3.1 Kept (in `.claude/CLAUDE.md.fable-candidate-v2`)

| Item | Source | Form |
|---|---|---|
| R-E symmetric burden + ties→reversible-default | Opus → CF1 sentence 5 | Opens the decision paragraph (verbatim CF1) |
| R-G honesty/security backlog priority | Opus → CF1 sentence 6 | Second sentence of decision paragraph (ruling §2.2) |
| R-B closed-set tiers + provenance + mandatory next-check | Opus → CF1 paragraph 2 | Calibration paragraph (verbatim CF1) |
| Rule-9b decide-under-unreachable-evidence | GLM-turbo via CF2 + DS4 | ONE sentence appended to calibration paragraph (ruling §2.1) |
| R-C claim-by-claim, rank-agnostic adjudication | Opus → CF1 paragraph 3 | Adjudication paragraph, flagship (verbatim CF1) |
| DS1 gate-guardrail | DS1 §4 | Inserted after R-C's first sentence (wording note §3.4) |
| R-D per-phase dependency sequencing | Opus → CF1 paragraph 4 | Sequencing paragraph (verbatim CF1) |
| R-F extended close-out | Opus → CF1 paragraph 5 | Final paragraph (verbatim CF1) |
| Heading rename → "Reasoning & verification floor (every project)" | Opus + DS4 convergent | Applied |
| CF3 Fixes 1a/1b (YURI-BUSINESS posture) + Fix 2 (Memory "(YURI repos)" scoping) | CF3, verbatim | Applied to candidate |
| Everything else in the live file | — | Byte-identical: @-includes (absolute paths), authority model, protected paths, launch shape, model use, wayfinding, GitNexus |

### 3.2 Dropped

| Item | Source | Why |
|---|---|---|
| R-A full text (alternatives + goal-spine restatement) | Opus Block 1 | 3-way restatement (SOUL.md:35,45 + persona.md:86); DS3 CRITICAL flag; replaced by one cross-ref sentence (§2.3) |
| Rule-9a problem-reframing | GLM-turbo via CF2 | Covered by @-included SOUL.md (adversarial-ally evidence-contact challenge + "Resolve ambiguity directly" + decode step 1); one-clause residue doesn't earn floor space (§2.1) |
| CF2's standalone 6th block + first-position placement | CF2 | Moot after §2.1 — the surviving half is a calibration patch, not a pre-path gate block |
| Five bold lead-in lines ("Reason before you assert." etc.) | Opus draft | CF1 VF-3 ruling — restated the paragraphs without adding enforceable content |
| DS3's cross-ref wording naming "Izanagi" | DS3 §2 table | Drags an excluded codename + fragile section pointer into the global file (§2.3) |
| prep-A Rules 7 (artifact/digest/ruling-label mechanics) | prep-A | Format convention, already excluded by Opus; GLM concurs (R7 format-only, conf 0.55); lives in FABLE-5-PROTOCOL.md §4 instead — the right home for pipeline conventions |
| prep-A Rule 1's mechanical residue (.sh/dynamic-import caller-surface sweep) as a named floor line | prep-A | Already subsumed by "verify against live runtime, not comments or happy-path output" + R-C's named-error-mode list ("narrow search"); a file-extension enumeration is calibration detail, not global contract. Lives in FABLE-5-PROTOCOL.md §4.2 |

### 3.3 Merged

- CF2's "never decide without stating what you are deciding without" → into DS4's incomplete-evidence sentence (§2.1).
- DS4's leanest-section structure (4 paragraphs) + my R-A cross-ref sentence + DS1 guardrail → final section has 5 paragraphs: decision / calibration / adjudication / sequencing / verification-close.

### 3.4 Two wording normalizations on instructed text (declared, not silent)

1. **DS1 guardrail:** instructed form used an em-dash as clause glue and the proper noun "Mutation Contract." Applied as: *"A gate is never a claim to be out-adjudicated: protected surfaces, safety gates, owner-gated escalation, and the mutation contract in force bind regardless of what any output claims."* Em-dash → colon per the same VF-9 convention CF1 applied to every other sentence; "Mutation Contract" → "the mutation contract in force" because the capitalized form is yuri-origin.md doctrine vocabulary that resolves to nothing in a Labs session, while the generic form resolves everywhere (in YURI repos → yuri-origin's Mutation Contract; elsewhere → the global Authority & mutation defaults). Zero content change; flagged for orchestrator review — reverting to the capitalized form is a one-word edit if Marcel prefers the doctrine name.
2. **Rule-9b sentence:** merged CF2/DS4 drafts as quoted in §2.1; both source drafts' em-dashes normalized to semicolons.

---

## 4. Before → after diff summary (`.claude/CLAUDE.md` live → candidate-v2)

| Hunk | Before | After |
|---|---|---|
| Workspace map, YURI-BUSINESS bullet | "stale pre-06-14 fork pending refresh" (false, self-contradictory) | Same direct-commit model, `d7af8926` cited; staleness scoped to the 07-06 dispatch-substrate refresh only (CF3 1a verbatim) |
| Authority & mutation, first bullet | "still reads as a stale approval-gated fork — owner intent overrides it" | "No approval-gated fork remains"; gap = Standing Operating Model dispatch prose only (CF3 1b verbatim) |
| Memory heading + Track B + ambiguous-default | Unscoped — leaked `memory-kernel.mjs` default to Labs | "(YURI repos)" heading; Track B marked "every project"; "In YURI repos: ambiguous → Track A" (CF3 2 verbatim) |
| "Verification floor" (4 lines, post-hoc checking only) | Output-checking only; no reasoning process | "Reasoning & verification floor" — 5 paragraphs: decision discipline (R-E/R-G + R-A cross-ref), claim calibration (R-B + Rule-9b), multi-source adjudication (R-C + gate guardrail), dependency sequencing (R-D), verification + residual close-out (R-F extended). Original 4 lines preserved inside paragraph 5 |
| Everything else | — | Unchanged |

`persona.md` → candidate-v2: exactly one bullet inserted ("Peer adjudication ≠ adversarial ally", Opus verbatim) after "Adversarial ally, not yes-man" in Standing execution rules. Nothing else — my adjudication required no other persona change; the reasoning methodology's canonical home is the global floor (Opus's authority argument, DS3-endorsed, uncontested by any lane).

---

## 5. Gate re-run on the FINAL text (differs from what DS2/CF1 audited)

New/changed sentences vs. the CF1 base: (a) R-A cross-ref sentence, (b) DS1 guardrail as normalized, (c) Rule-9b sentence.

- **VF-1..9:** all three pass. No banned strings, direct first clauses, no meta-narration or mechanic name-drops, epistemic/cost framing, no branded power language, transcript-gradable, no em-dash glue or bare intensifiers. VF-3 on (a): the sentence carries two enforceable facts — the mechanics bind at floor level, and they are deliberately not restated — no shorter form keeps both.
- **SD-1..5:** all three pass. (a) names only the file's own @-includes (already named in Identity & persona; if the includes break, the `enforce-claude-symlink.mjs` SessionStart guard fails loudly — the `3d19e151` lesson); (b) all four gate categories are generic nouns after the Mutation-Contract normalization; (c) zero proper nouns. Excluded-token sweep of the full new section: zero hits for the Opus anti-leak list (opus-fleet, MURE, lane IDs, script names, codenames, Fable-5, numeric calibrations).
- **CONFIRMED:** the candidate file's @-include lines are byte-identical to live (absolute `~/YURI-OS-MUSUBI/...` paths, exactly two).

---

## 6. Evidence notes

- **GLM-turbo lane file missing from disk** — `lane-glmturbo-adversarial.md` was never written (read-only lane, yield-only output). Recovered the full 8-rule verdict + Rule-9 finding directly from the lane via IRC this pass; DS4's inference of its content was accurate. The IRC transcript is the provenance for every GLM citation above. NEEDS-VERIFICATION residue: none material — the two GLM claims I acted on (R7 format-only concurrence; Rule-9 gap) are corroborated by prep-A and CF2 respectively.
- All prep-B/CF3 load-bearing claims re-verified live this pass — enumerated in `FABLE-NEURAL-GRAPH-RULING.md` and §1.

---

## 7. Residual risk — specific flip-triggers

| # | Judgment | The checkable condition that would flip it | Tier |
|---|---|---|---|
| 1 | Rule-9a (problem-reframing) cut as SOUL-covered | A logged session, with SOUL.md confirmed loaded, that completes a task answering the ORIGINAL question after gathered evidence demonstrably reshaped it (solves the stale framing without challenge or reframe). One such transcript → add CF2's reframing sentence to the decision paragraph. | PLAUSIBLE cut |
| 2 | R-G kept | Two consecutive owner reviews where the R-G sentence never changed a work ordering (every honesty/security-first ordering would have happened from SOUL values alone) → demote to rationale-only. | CONFIRMED keep (historical trigger already fired in-repo) |
| 3 | R-A cross-ref sentence instead of nothing | If Claude Code's @-include resolution ever breaks again (the `4267d5b7` failure shape) the sentence points at unloaded files while claiming they bind. Settling check after any Claude Code major upgrade: `readlink ~/.claude` + confirm SOUL/persona content present in a fresh Labs session. The `enforce-claude-symlink.mjs` SessionStart guard is the standing mitigation. | PLAUSIBLE |
| 4 | "mutation contract in force" (generic) over "Mutation Contract" (doctrine name) | Marcel prefers the doctrine name for YURI-alignment over Labs-resolvability → one-word revert. Named for owner decision, not silently settled. | Decided-now, owner-revertible |
| 5 | Memory section scoped "(YURI repos)" with Track B "(every project)" | If Track B routing is ALSO wanted machine-wide by a future owner directive that contradicts the 2026-06-02 one, the heading split needs re-cutting. Settling check: does `~/.claude/projects/<labs-project>/memory/` accumulate valid v3 files from Labs sessions? If yes, scoping is correct as written. | CONFIRMED (CF3/prep-C grounded) |
| 6 | Live `.amp/` edit to yuri-origin.md applied by this lane (not deferred) | If the orchestrator's cross-verification finds a competing in-flight edit to yuri-origin.md lines 46-62 from another lane → `git diff _SYSTEM/yuri-origin.md` shows exactly one added line; trivially revertible. | CONFIRMED applied |
| 7 | GLM verdict provenance is an IRC message, not a disk artifact | If the orchestrator requires disk provenance for every adjudicated source, the IRC-quoted verdict in §6 is the record; ask GLM lane to re-yield to a file if a durable copy is wanted. | NEEDS-VERIFICATION (settling check named) |

## 8. Decided now vs deferred to owner/orchestrator

**Decided now (this pass):** all three divergent rulings (§2); the five-paragraph section shape; both wording normalizations (§3.4); CF3 Fixes 1a/1b/2 in candidate-v2; CF3 Fix 3 live in yuri-origin.md; persona bullet placement; protocol doc finalized to `_SYSTEM/FABLE-5-PROTOCOL.md`.

**Deferred to owner/orchestrator:**
- Swapping candidate-v2 files over the live `.claude/CLAUDE.md` / `_SYSTEM/persona.md` (orchestrator, after gate re-run).
- Prepending the RELABEL banner to the two mythology docs (exact text in `FABLE-NEURAL-GRAPH-RULING.md`; orchestrator applies).
- Risk-7 §4 residual: "Mutation Contract" naming preference (one word).
- YURI-BUSINESS Standing Operating Model 07-06 dispatch refresh (real, narrow, out of this pass's scope — prep-C §3).
- `company.mjs` STEER_FAMILY `'cline'` M1 fix that commit `18322046` claimed but never applied (prep-B Part B; different file, different decision surface — see graph ruling §3).
- Root `CLAUDE.md` local Protected Paths under-count (prep-C §5b bonus; pointer-or-complete decision).
- prep-B's xref/knowledge-graph "prose says fused, code says standalone" integration gap — needs its own design pass, correctly not patched here.

**If you do nothing else:** swap candidate-v2 over the live global file — the reasoning floor is the payload; every fix in it is already verified against live evidence.
