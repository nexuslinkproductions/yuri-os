# Prep A — Fable-5 Reasoning Methodology

**Scope read (all in full):** `yuri-assistant-role-synthesis-2026-07-05/{FABLE-MASTER-BRIEF,FABLE-PASS-1-SYNTHESIS,FABLE-PASS-2-RATIONALE}.md`; `yuri-full-logic-inspection-2026-07-06/{00-MASTER-MAP,01-FABLE-MASTERMIND-VERDICT}.md`; `yuri-structural-security-audit-2026-07-06/{FABLE-AUDIT-BRIEF,FABLE-AUDIT-SYNTHESIS}.md`; `git show 18322046` (opus-fleet-v2 fix, full diff) and `git show 1889cc83` (AMS deck fix, full message + representative diff). Three independent Fable-5 taskings across three dates/domains (role design, systems-logic audit, security/structural audit) plus two later code-fix commits.

## 1. Extracted methodology rules

### Rule 1 — Re-derive inherited claims across every caller surface, not the first one searched
**Testable rule:** Before writing "CONFIRMED-DEAD," "CONFIRMED-SHIPPED," or "CONFIRMED-MISSING" on any claim a downstream decision depends on, the session must show the specific check that covers **every way the runtime can reach that code** (all file extensions actually executed — `.mjs`/`.js`/`.cjs`/`.sh` — plus dynamic `import()` sites), not just the extension the first grep happened to use; a claim resting on a narrower search gets NEEDS-VERIFICATION, not CONFIRMED.
**Citations:** `FABLE-AUDIT-SYNTHESIS.md:15-16` (codex-offload-runner.mjs/pulse-lane-dispatch.mjs falsely marked dead by `.mjs`/`.js`-only grep, missing `.sh` exec sites); `:171` ("shell-caller blindness + comment-trusting is how a good analyst ships a wrong cut"); `:162` (generalizes: any `.sh`-exec'd or dynamically `import()`ed script); `FABLE-PASS-1-SYNTHESIS.md:195-199` (H2 audited the questionnaire against a stale mental model, not the code).
**Confidence:** CONFIRMED recurring (2 independent taskings, 5 citations). Not spelled out in either brief — Fable discovered and named it as "the meta-lesson of the whole audit" on its own. Most operationally distinctive rule in the set.

### Rule 2 — Every judged item lands in exactly one named tier; the "unresolved" tier always carries a next check, never a shrug
**Testable rule:** A finding/claim/build-candidate must be sorted into a small, named, closed set of tiers (CONFIRMED/PLAUSIBLE/NEEDS-VERIFICATION, or FIX/IMPROVE/LEAVE-ALONE, or LIVE/BUILD-NOW/DEFER/CUT); anything unresolved gets its own named tier with a stated, executable next-step — "unclear" alone is not acceptable.
**Citations:** `01-FABLE-MASTERMIND-VERDICT.md:8,19,30` (FIX/IMPROVE/LEAVE-ALONE headers); `FABLE-AUDIT-SYNTHESIS.md:71,79,149` (CONFIRMED-DEAD/NEEDS-VERIFICATION with a "trace that would settle it" column); `FABLE-PASS-1-SYNTHESIS.md:83,100,125,130` (LIVE/BUILD-NOW/DEFER/CUT-LIST).
**Confidence:** CONFIRMED recurring (3/3 taskings). The logic-inspection verdict invents fresh vocabulary with no visible brief instructing it — the stable *shape* recurring under self-chosen names is the emergent signal.

### Rule 3 — Symmetric, evidence-gated burden of proof on any change (adding OR removing); default state wins ties
**Testable rule:** A "build this" or "cut this" verdict must cite either (a) one named test applied uniformly across all candidates of that type, or (b) positive dead-code evidence (zero callers across every caller surface, no retirement marker); absence of a build-request is not sufficient to cut something already live; absence of urgency is sufficient to defer something not yet built. When unsure, default is *don't act*.
**Citations:** `FABLE-MASTER-BRIEF.md:8` ("does the daily loop fail without this in 2 weeks? If no → defer"); `FABLE-AUDIT-BRIEF.md:11` (mirror rule for removal: "when unsure, defer, don't cut"); `FABLE-AUDIT-SYNTHESIS.md:77` ("I will not pad the cut list to look productive"); `:174` (burden of proof applied per-claim even to an otherwise-useful lane).
**Confidence:** CONFIRMED recurring, symmetric build-side and cut-side instances.

### Rule 4 — Every phase of a sequenced roadmap states, in-line, why it must precede the next phase
**Testable rule:** A multi-phase plan is only acceptable if each phase's text names the specific reason it must come before the following phase; a phase list that is merely priority-sorted without stated inter-phase dependency is sequencing theater.
**Citations:** `FABLE-AUDIT-SYNTHESIS.md:131,135,137,143,145` (Phase 0 as keystone, Phase 2 cheap *because of* Phase 0, closing meta-statement "if Phase 0 is done LAST, every cut above it is cosmetic"); `01-FABLE-MASTERMIND-VERDICT.md:47-49`; `FABLE-PASS-1-SYNTHESIS.md:172,179-181`.
**Confidence:** CONFIRMED recurring (3/3). Only one brief asks for this explicitly; the other two supply it unprompted. **No existing counterpart found in SOUL.md/persona.md/global floor** — strongest candidate for genuinely new content.

### Rule 5 — Truth/state-honesty/security-root fixes outrank cosmetic or structural cleanup when both compete for "do first"
**Testable rule:** When multiple defect classes compete for priority, a fix that makes the system's self-reported state or security boundary honest/sound wins the "first" slot over structural/cosmetic/de-bloat work — cleanup before the root fix only makes the system *look* simpler without *being* simpler or safer.
**Citations:** `FABLE-AUDIT-BRIEF.md:13` (explicit weighting instruction); `FABLE-AUDIT-SYNTHESIS.md:128` (restated as own governing logic); `01-FABLE-MASTERMIND-VERDICT.md:6` (independently derived, no visible equivalent brief instruction found: "safety-critical + state-honesty claims must be deterministic... Fix the gap in three zones only").
**Confidence:** CONFIRMED recurring (2/3; role-synthesis tasking's dominant value was anti-over-engineering instead — different, non-conflicting priority).

### Rule 6 — Disagreement between sources is adjudicated claim-by-claim with a named root-cause, never by source rank or wholesale accept/reject
**Testable rule:** When two evidence sources conflict, the resolution must (a) state which was right, (b) diagnose the specific methodological reason the wrong one erred, (c) be able to adopt some sub-claims from a source while rejecting others from the same source — never an all-or-nothing verdict on an entire source, never a verdict that wins purely by reasoning-tier rank.
**Citations:** `FABLE-PASS-1-SYNTHESIS.md:195-199` (diagnoses H2's specific failure mode; credits GLM as sharpest input while still overruling one of its claims); `FABLE-AUDIT-SYNTHESIS.md:171,174` (diagnoses S2's error mechanism; keeps a divergent lane's 2 verified insights while discounting its unverified mass-cut); `00-MASTER-MAP.md:26-35` (reciprocal case — Opus does NOT defer to Fable by rank, independently re-verifies before accepting the correction).
**Confidence:** CONFIRMED recurring. Most clearly emergent rule — neither brief asks for root-cause diagnosis or bidirectional re-checking. **No existing counterpart** — persona.md's "adversarial ally" is scoped to challenging the human operator, not peer-evidence adjudication among co-equal sources. Strongest "genuinely distinctive" flag.

### Rule 7 — Durable artifact first, bounded digest second, every resolved decision carries an explicit ruling label, artifact closes on an unambiguous completion signal
**Testable rule:** Substantial findings are written to a named file, never left only in conversational output; the chat-facing reply is a hard-bounded executive digest; every individually resolved question in the file is prefixed with an explicit ruling label bound to its citations; the artifact ends on a single distilled top-priority statement a time-constrained reader could act on alone.
**Citations:** `FABLE-MASTER-BRIEF.md:47` / `FABLE-AUDIT-BRIEF.md:36` (explicit, near-identical instruction in two independent briefs); `FABLE-PASS-1-SYNTHESIS.md:24,52,59,96` (T1-T4 ruling labels); `FABLE-AUDIT-SYNTHESIS.md:13,33` (same convention, unprompted, one day later); single-priority closers in all three docs (`NORTH STAR`, `"If you do nothing else"`, `PHASE 0`).
**Confidence:** CONFIRMED recurring (3/3) for file-first/digest/ruling-label/single-priority-closer. The `NNFB_..._X_PASS_COMMITTED` tag grammar itself is NEEDS-VERIFICATION as Fable's own invention (may be a shared template outside read scope) — only the underlying principle (unambiguous completion signal) is safe to extract.

### Rule 8 — Residual-risk disclosure names the specific checkable condition that would flip the ruling, and explicitly separates "fixed/decided now" from "deliberately deferred to the owner"
**Testable rule:** A completed ruling must state not just "there is residual risk" but the precise, checkable trigger that would invalidate it, and must explicitly list what was consciously left undone/undecided and handed back to the owner, rather than hedging generically.
**Citations:** `FABLE-PASS-2-RATIONALE.md:114-123` (named triggers, e.g. "if Claude Code ever resolves `@../` against the symlink path... re-verify after major Claude Code upgrades"); `FABLE-AUDIT-SYNTHESIS.md:57` (names exact condition that flips SEC-2 severity); `git show 18322046` commit message (explicit fixed-now vs. deferred-design-work split); `git show 1889cc83` (explicit "Owner decides... no deck edit made for this item, correctly held").
**Confidence:** CONFIRMED recurring (4 independent artifacts, including both code commits which have no brief at all). Strong emergent signal.

**Direct answer to the section-7 question:** `01-FABLE-MASTERMIND-VERDICT.md` §7 ("What the inspection missed") is **NOT** a self-audit of Fable's own output — it audits the *separate* opus-fleet/MURE prep's blind spots (a one-level-removed activity). The genuine Fable self-audit equivalent is **Rule 8** (Pass-2's "Residual risk" + both commits' deferred-findings sections). The "what category did nobody even ask" completeness-audit move is single-instance only — NEEDS-VERIFICATION as recurring, not confirmed methodology.

## 2. What does NOT generalize — YURI-OS-specific plumbing to exclude from a global file

- The entire "prep lanes + one-shot mastermind overseer" fleet architecture (lane IDs H1-H5/S1/S2/D1-D8/GLM Ga-c, MURE dry-runs) — portable residue is only the underlying stance in Rule 1/6, not the lane vocabulary.
- Concrete tool/file names used as evidence anchors (`evaluateToolCall`, `yuri-safety-core.mjs`, `bash-security-guard.js`, `xref-query.mjs`, the ΔU energy-gate math, arm-state manifests) — load-bearing to citations, not to a project-agnostic identity file.
- The exact `NNFB_<TOPIC>_..._X_PASS_COMMITTED` completion-tag grammar — machine-parseable handoff convention for this pipeline's automated detection, not an interactive single-session need. Only the underlying principle is portable.
- Calibrated numbers presented as universal ("≤25-line digest," "~100 lines," "two weeks") — task-specific calibrations, not universal constants. A global file should encode "state an explicit bound, pick one appropriate to context," not a specific number.
- "Marcel's explicit stated fear is over-engineering" framing — person-specific narrative color wrapped around Rule 3. The behavioral rule generalizes; the personal justification does not.
- Owner-gated "arming" vocabulary (build-vs-arm approval tiers) — bound to YURI's Self-Governance Charter mechanics; the loose generalization is already adjacent to ordinary "build behind a flag" practice, not a distinctively Fable-5 contribution.
- All literal domain content (memory-store internals, hook inventories, trading-organ specifics, investor-deck chapters) — non-methodology, excluded without comment.

## 3. Overlap verdict — how much is already standard-good-practice / already in the persona docs?

Roughly **half of this extraction (Rules 1, 2, 3, 5, 7, 8) sharpens/operationalizes values the persona docs already assert** — worth encoding because the existing prose is vaguer and less checkable than Fable's concrete instantiation, not because the value itself is missing:
- Rule 1 vs. global floor's "verify against live runtime, not comments or happy-path output" — genuinely new residue: the specific mechanical technique (check every caller extension including `.sh`, and dynamic `import()` sites).
- Rule 2 vs. SOUL.md's "keep facts, inference, recommendation, blockers separate" — new residue: a *closed-set tier taxonomy* with a mandatory named-next-check for unresolved items.
- Rule 3 vs. SOUL.md's "every synthesis ends in a priority, next action, or explicit non-action" — new residue: the asymmetric-burden-of-proof framing + "wrong cut > missed cut" cost asymmetry.
- Rule 5 is a procedural corollary of SOUL.md's "Truth before polish" — new residue: the derived sequencing rule (honesty/security defects always outrank structural cleanup when ranking a backlog).
- Rule 7 close to persona's "Silence is a weapon... don't hedge" — new residue: the concrete file-first/digest-second/labeled-ruling/completion-signal mechanics.
- Rule 8 is the **highest-overlap** rule — nearly a direct match for persona.md's "if hedging, name the exact uncertainty" and the floor's "residual risk" line. Closer to "Fable executing an existing instruction unusually well" than inventing something new. Only addition worth keeping: name the *specific future event/check* that would flip the ruling, and explicitly separate "fixed now" from "deliberately deferred."

**Rules 4 and 6 have no clear existing counterpart** in persona.md/SOUL.md/the global floor (dependency-justified roadmap sequencing; claim-level/rank-agnostic multi-source adjudication) — strongest candidates for genuinely new global content rather than restatement.

**Bottom line for the mastermind pass:** don't just append all 8 rules verbatim — sharpen the existing verification-floor/SOUL.md prose with Rules 1/2/3/5/7/8's concrete mechanics, and add Rules 4 and 6 as genuinely new content, since persona.md's "adversarial ally" is a one-on-one human/assistant dynamic that has no existing language for adjudicating among multiple roughly co-equal fleet/lane sources — which is exactly the standing opus-fleet operating model every session now runs.
