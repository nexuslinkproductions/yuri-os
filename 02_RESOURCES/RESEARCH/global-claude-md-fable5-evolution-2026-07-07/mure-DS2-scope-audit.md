# MURE DS2 — Cross-Project Scope-Leak Audit

**Model:** ollama-cloud/deepseek-v4-flash
**Role:** Cross-project scope-leak auditor
**Date:** 2026-07-07
**Target:** Opus-4.8 independent candidate global-file section + persona bullet

---

## Method

Applied SD-1..5 (from `SONNET-VOICE-SCOPE-GATE.md`) to **every sentence** of the Opus candidate's proposed global-file section, one sentence at a time. Also independently verified the Opus lane's anti-leak claim (its listed excluded tokens) against the actual candidate prose.

**SD definitions (abbreviated):**
- **SD-1:** Names no repo-specific script path, lane ID, fleet-role, or CLI tool — OR names one confirmed to exist in every repo the heading governs.
- **SD-2:** A fresh Labs session (zero YURI-OS context) can either correctly execute or safely no-op — no silent wrong action.
- **SD-3:** Content-type (universal vs. repo-specific) matches the section heading's scope qualifier.
- **SD-4:** With every proper noun/path/product name stripped, the remaining instruction still stands alone as a complete, actionable behavioral rule.
- **SD-5:** If a path/tool/convention is absent, failure is loud (visible error) not silent.

**Heading under audit:** `## Reasoning & verification floor (every project)` — claims to govern **every project**, including Labs.

---

## Per-Sentence PASS/FAIL Table

### Block 1: "Reason before you assert."

| # | Sentence | SD-1 | SD-2 | SD-3 | SD-4 | SD-5 | Verdict |
|---|----------|------|------|------|------|------|---------|
| 1 | `**Reason before you assert.**` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 2 | `On any non-trivial decision with more than one viable path, put at least two genuinely divergent options on the table and choose by explicit criteria — evidence, reversibility, blast-radius, goal-fit — never because one was listed, tried, or proposed first.` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 3 | `Hold one goal spine; park side-branches without chasing them.` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 4 | `A change — adding OR removing — carries the burden of proof: cite the evidence for it; when the evidence ties, the reversible default wins (don't act; don't remove what is live and load-bearing).` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 5 | `When defects compete for "do first," one that makes the system's self-reported state or its safety/security boundary honest outranks cosmetic or structural cleanup — tidy-first only makes a thing look simpler without being simpler or safer.` | PASS | PASS | PASS | PASS | PASS | **PASS** |

**Notes on Block 1:**
- **S2:** "blast-radius" is a general risk-analysis term (used in incident response, engineering, security), not a YURI-specific token. A Labs session with zero YURI-OS context can apply it to any decision.
- **S3:** "goal spine" originates in SOUL.md/persona.md, which the global file @-includes. A Labs session inherits this term via the @-include chain. The metaphor is self-explanatory enough to be actionable without YURI-OS context.
- **S4:** "reversible default wins" is a universal decision heuristic. No YURI-specific machinery required.
- **S5:** "system's self-reported state" and "safety/security boundary" are universal concepts. No YURI-specific plumbing referenced.

### Block 2: "Calibrate every load-bearing claim."

| # | Sentence | SD-1 | SD-2 | SD-3 | SD-4 | SD-5 | Verdict |
|---|----------|------|------|------|------|------|---------|
| 6 | `**Calibrate every load-bearing claim.**` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 7 | `Sort each into a small, closed set of confidence tiers (e.g. CONFIRMED / PLAUSIBLE / NEEDS-VERIFICATION) and tag it with where it came from.` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 8 | `The unresolved tier always carries the one specific check that would settle it — "unclear" is never a terminal state, only a pointer to the next move.` | PASS | PASS | PASS | PASS | PASS | **PASS** |

**Notes on Block 2:**
- **S7:** CONFIRMED/PLAUSIBLE/NEEDS-VERIFICATION are generic confidence tiers, not YURI-specific. The candidate uses them as *examples* ("e.g."), not as a mandated closed set. A Labs session can substitute its own tier names or adopt these directly — both are safe.
- **S8:** "unclear is never a terminal state" is a universal epistemic rule. No YURI-OS machinery required.

### Block 3: "Adjudicate multiple outputs claim-by-claim, never by rank."

| # | Sentence | SD-1 | SD-2 | SD-3 | SD-4 | SD-5 | Verdict |
|---|----------|------|------|------|------|------|---------|
| 9 | `**Adjudicate multiple outputs claim-by-claim, never by rank.**` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 10 | `When two or more roughly co-equal outputs disagree — parallel subagents, docked model outputs, competing sources, or your own alternative drafts — resolve the conflict one claim at a time, not one source at a time.` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 11 | `For each disagreement: state which claim is right, name the specific methodological reason the wrong one erred (narrow search, stale mental model, happy-path only, trusting a comment over the code), and keep the correct sub-claims from a source whose other claims you reject.` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 12 | `Accept or reject sub-claims, never whole sources.` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 13 | `A correction — even from a higher-reasoning-tier or more-authoritative source — is a hypothesis, not proof: re-verify it against evidence before adopting it, exactly as you would any other claim.` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 14 | `Reasoning tier, author, and confidence tone never win an adjudication; evidence and named root-cause do.` | PASS | PASS | PASS | PASS | PASS | **PASS** |

**Notes on Block 3:**
- **S10:** "parallel subagents" and "docked model outputs" are generic descriptions of agent patterns, not YURI-specific lane IDs. "Subagents" is a general Claude Code concept. A Labs session using subagents can apply this rule directly.
- **S11:** The error-mode examples (narrow search, stale mental model, happy-path only, trusting a comment over the code) are all generic failure modes, not YURI-specific. Every session can diagnose these.
- **S13:** "higher-reasoning-tier" is a generic concept (e.g., Opus vs. Sonnet in any model hierarchy), not a YURI-specific rank. A Labs session with a single model can safely no-op this (no tier comparison to do).
- **S14:** "author" and "confidence tone" are universal. No YURI-specific vocabulary.

### Block 4: "Sequence with stated dependencies."

| # | Sentence | SD-1 | SD-2 | SD-3 | SD-4 | SD-5 | Verdict |
|---|----------|------|------|------|------|------|---------|
| 15 | `**Sequence with stated dependencies.**` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 16 | `A multi-phase plan states, per phase, the specific reason it must precede the next — what a later phase depends on, or what doing it out of order would waste or hide.` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 17 | `A phase list that is only priority-sorted, with no inter-phase dependency named, is not a sequence; collapse it or justify it.` | PASS | PASS | PASS | PASS | PASS | **PASS** |

**Notes on Block 4:**
- All three sentences are pure process rules with zero proper nouns. A Labs session planning its own multi-phase work applies them directly. No YURI-OS context needed.

### Block 5: "Verify the output, then disclose the residual."

| # | Sentence | SD-1 | SD-2 | SD-3 | SD-4 | SD-5 | Verdict |
|---|----------|------|------|------|------|------|---------|
| 18 | `**Verify the output, then disclose the residual.**` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 19 | `First-run success is a hypothesis, not proof.` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 20 | `Attack the result before calling it ready; run the smallest meaningful checks including negative/mismatch ones; verify against live runtime, not comments or happy-path output.` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 21 | `Model output (mine included) is advisory until local evidence verifies it.` | PASS | PASS | PASS | PASS | PASS | **PASS** |
| 22 | `End non-trivial work with: what changed, what was checked, and the residual risk stated as the specific checkable condition that would flip the ruling — plus an explicit split between what was decided or fixed now and what is deliberately deferred to the owner.` | PASS | PASS | PASS | PASS | PASS | **PASS** |

**Notes on Block 5:**
- **S20:** "verify against live runtime" is a universal instruction. A Labs session with no runtime infrastructure can still run its own tests.
- **S22:** "owner" is a generic term (the human running the session), not a YURI-specific role. A Labs session reports to its own human.

---

## Summary Table

| Block | Sentences | PASS | FAIL | Scope-leak rate |
|-------|-----------|------|------|-----------------|
| 1. Reason before you assert | 5 | 5 | 0 | 0% |
| 2. Calibrate every load-bearing claim | 3 | 3 | 0 | 0% |
| 3. Adjudicate multiple outputs | 6 | 6 | 0 | 0% |
| 4. Sequence with stated dependencies | 3 | 3 | 0 | 0% |
| 5. Verify the output, then disclose | 5 | 5 | 0 | 0% |
| **Total** | **22** | **22** | **0** | **0%** |

**Verdict: 22/22 PASS on all five scope-discipline checks. Zero scope leaks detected in the candidate global-file prose.**

---

## Anti-Leak Claim Verification

The Opus lane listed these excluded tokens that must NOT appear in the global-file text:

> opus-fleet · MURE · spawn_nano · lane IDs (H1-H5/S1/S2/D-series/GLM Ga-c) · xref-query.mjs · capability-recall.mjs · propagation-scan.mjs · memory-kernel.mjs · llm-compat-contract.mjs · fleet-router-mlp.mjs · Fable-5 · GLM-5.2 · Izanagi/Haki/Nen/Bankai/Geass codenames · NNFB_..._X_PASS_COMMITTED grammar · ΔU/energy-gate math · numeric constants (≤25-line, ~100 lines, two weeks) · Marcel-over-engineering personal narrative

**Verification result: CONFIRMED — zero leaks.** Grep of the candidate prose block (the verbatim draft under `## Candidate global section (verbatim draft)`) returns zero matches for any excluded token. The only matches in the full file are in the meta-commentary sections (per-rule novelty audit, anti-leak list itself, self-critique) — none of which are proposed for the global file.

**CONFIRMED:** The Opus lane's anti-leak note is also accurate — the rule text names scenarios harness-agnostically ("parallel subagents, docked model outputs, competing sources, or your own alternative drafts") so it binds any harness without naming YURI-specific machinery.

---

## Persona Bullet — Scope Check

The candidate persona bullet (proposed for `persona.md`, not the global file):

> `- **Peer adjudication ≠ adversarial ally.** "Adversarial ally" is the 1:1 human mechanic — challenge Marcel's premise once, then commit. Weighing multiple co-equal lane/model outputs against *each other* is a different job: adjudicate claim-by-claim per the global reasoning floor, never by author, reasoning tier, or confidence tone. Higher tier is a stronger hypothesis, not a verdict.`

**Scope check:** This targets `persona.md`, which is explicitly Marcel-private (header: "Do NOT ship as default"). The SD gate is designed for the global file's `(every project)` heading. For persona.md, the relevant scope question is: does this bullet introduce YURI-OS operational vocabulary into a file that's already Marcel-private? 

- "lane/model outputs" — generic, not YURI-specific lane IDs
- "Marcel" — the operator's name, already established in persona.md
- "global reasoning floor" — a forward reference to the proposed global section; this is a cross-file pointer, not a YURI-OS operational token

**Verdict: PASS for its intended home (persona.md).** No YURI-OS operational vocabulary leaked. The forward reference to the global floor is appropriate DRY discipline.

---

## Edge Cases and Subtle Findings

### 1. "Goal spine" — inherited vocabulary, not a leak

The term "goal spine" originates in SOUL.md/persona.md, which the global file @-includes. A Labs session inherits this term. The metaphor is self-explanatory (a single explicit objective you hold to). **Not a scope leak** — it's established vocabulary that travels with the @-include chain, and it's generic enough to be actionable without YURI-OS context.

### 2. "Blast-radius" — general risk term, not YURI-specific

"Blast-radius" is a standard engineering/security risk-analysis term (incident response, change management, software architecture). It appears in the candidate as one of four explicit criteria alongside "evidence, reversibility, goal-fit." **Not a YURI-specific token.** A Labs session applies it to any decision.

### 3. "Parallel subagents, docked model outputs" — generic agent patterns

These are descriptions of agent workflows, not YURI-specific lane IDs. "Subagents" is a general Claude Code concept. "Docked model outputs" describes any scenario where another agent's output is available for review. **Not a scope leak.** A Labs session using subagents can apply the adjudication rule directly.

### 4. "Higher-reasoning-tier" — generic model hierarchy

This describes any model tier hierarchy (Opus > Sonnet > Haiku in any provider's lineup). It does not name a specific YURI tier or lane. **Not a scope leak.** A Labs session with a single model safely no-ops this clause.

### 5. "Owner" — generic human operator

"Owner" in the candidate's close-out instruction refers to the human running the session. This is a universal concept, not a YURI-specific role. **Not a scope leak.**

### 6. The candidate's "e.g." on confidence tiers is a safety valve

The candidate writes "Sort each into a small, closed set of confidence tiers (e.g. CONFIRMED / PLAUSIBLE / NEEDS-VERIFICATION)." The "e.g." means a Labs session can substitute its own tier names. If it were "i.e." or no qualifier, a Labs session might feel compelled to adopt YURI-specific tier names — but the "e.g." makes this a suggestion, not a mandate. **Correct design choice.**

---

## Comparison: Opus Candidate vs. SONNET-VOICE-SCOPE-GATE Worked Examples

The SONNET gate's "bad-shape probes" demonstrated how a sentence can pass VF 9/9 while failing SD 0/5. The Opus candidate avoids this trap entirely:

| Bad-shape probe failure | Opus candidate equivalent | Status |
|-------------------------|--------------------------|--------|
| Names `FABLE-AUDIT-SYNTHESIS.md`, `MURE`, `xref-query.mjs`, `H1-H5 lanes` | Names nothing repo-specific | **Avoided** |
| Names `GLM`, `Opus lanes`, `opus-fleet dispatch`, `00-MASTER-MAP.md`, `S1/S2 audit lanes`, `gitnexus_impact` | Uses generic "parallel subagents, docked model outputs, competing sources" | **Avoided** |
| Labs session cannot act on the instruction | Every sentence is directly executable or safely no-op-able | **Achieved** |
| Stripped of nouns, the instruction collapses to fragments | Every sentence survives noun-stripping as a complete behavioral rule | **Achieved** |

**CONFIRMED:** The Opus candidate's prose was written with scope discipline already baked in. It does not need the SD gate to catch it — it was designed to pass it.

---

## Residual Risk

1. **The heading rename** (`Verification floor` → `Reasoning & verification floor`) is a structural change to the live file. This audit only covers the candidate's prose content, not the rename's impact on existing cross-references or the file's internal consistency. The Fable-5 synthesis should verify the rename doesn't break any existing pointer.

2. **The persona bullet's forward reference** to "the global reasoning floor" assumes the global section is adopted. If the global section is rejected or renamed differently, the persona bullet's pointer breaks. This is a cross-file dependency risk, not a scope leak.

3. **"Goal spine"** is inherited from SOUL.md/persona.md via @-include. If a future change removes or renames this term in the persona files, the global section's reference becomes orphaned. Low probability, but worth noting for the Fable-5 pass.

---

## Conclusion

**The Opus candidate's global-file prose passes all five scope-discipline checks on all 22 sentences. Zero scope leaks. Zero excluded-token violations. The anti-leak claim is accurate and verified.**

The candidate is safe to land in the global `.claude/CLAUDE.md` under the `(every project)` heading without any scope-related rewrites. A Labs session with zero YURI-OS context can act on every sentence or safely no-op the ones that don't apply to its workflow.
