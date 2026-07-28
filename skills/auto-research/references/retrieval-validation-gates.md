# Retrieval Validation Gates — G0–G6

Fail-closed protocol for validating any proposed improvement to a retrieval or navigation arm.
Companion to `../SKILL.md`; binds under `_SYSTEM/yuri-origin.md` → Loop Discipline.

**Authored by the Orion lane, 2026-07-28**, after adversarial review killed two headline findings in
one session. Every gate below exists because a specific plausible-looking result died at it — this is
a failure-anchored protocol, not a hypothetical checklist.

## Why this exists

Two "wins" were reported and withdrawn on the same day:

- **`locate` +2.7×** — three of six questions leaked their answer into the question text, and the
  measured capability was the *wrong function* (`resolve()` scored as a locator; the purpose-built
  `locate()` scored 0.0000 on the same item).
- **`enriched-split` +0.050** — the entire gain was three questions that paraphrased their answer's
  `@serves`/`@does` card, which enrichment then injected into that answer's own FTS body.

Neither was misconduct. Both were **provenance defects**: every individual step looked correct, and the
circularity only existed in the combination. That is the class this protocol catches.

## Preconditions — do not skip

1. **Three-clause authorship** on the question set:
   - n large enough to resolve a 2–3 question effect (target ≥100; n=40 provably is not)
   - authored **without** `capabilities.json`
   - authored **without** reading the answer file's in-source `@serves`/`@does`/`@capability` tags
2. **Leakage audit covers BOTH channels** before any arm score is trusted:
   - **Channel E** — enricher append (`capabilities.json` → FTS body)
   - **Channel S** — source tags already in the BASE index (tags live in the file text and the corpus
     builder ingests them, so the circle re-forms through the indexer even if the enricher never runs)
3. Gold type labels are **not** usable for promotion. Paraphrase sensitivity is a separate metric.

## Gates — any failure means the arm is not reportable

**G0 — Baseline lock.** Record `fastlex` and `fastlex-split` on the frozen set. All later deltas are
relative to that pair. Also record n, the per-question value vector, and the commit SHA of the scorer,
benchmark, and index builder.

**G1 — Stratum null.** Split expects into CAP (has a capability entry) and NONCAP (none). Only the
NONCAP stratum can support a clean claim. If NONCAP Δ≈0 while CAP Δ>0 → **contaminated, stop.**
*(This alone falsified enrichment: NONCAP n=19 Δ=0.000, CAP n=21 Δ=+0.095.)*

**G2 — Answer-node holdout.** Build the enriched index, then restore the BASE body for every gold
expect path while keeping enrichment on all other mechanisms. If the gain vanishes under holdout, it
was **self-description boost on the target**, not corpus-level reweighting.
*(Enrichment collapsed to exactly the fastlex baseline: 0.3950 → 0.3450, all three winners lost.)*

**G3 — Shuffle ablation.** Append a *random other* mechanism's `serves`/`does` (derangement), same
length budget. Read it as: shuffle ≥ true → length/TF noise, kill. shuffle ≈ baseline and true ≫
shuffle → content identity matters (necessary, not sufficient). true ≈ shuffle ≫ baseline → global TF
mass, do not promote.

**G4 — Leak-blocked enrichment.** Strip any `serves`/`does` token appearing in the benchmark question
text. Derive the blocklist from the frozen question set only — no peeking at which questions fail. If
the delta collapses to ~0, it was smuggling.

**G5 — Significance.** `sequentialDecide` / `confidenceSequence` on per-question **paired** deltas.
Report DECIDED-BETTER / DECIDED-WORSE / UNDECIDED-AT-THIS-N, plus n_improved / n_regressed / n_tied.
UNDECIDED means do not promote **even if monotone** — strict dominance is interesting, never a
substitute for G1–G4.

**G6 — Paraphrase sensitivity (SLM usability).** Generate k degraded variants per question — shorter,
vaguer, pronoun-heavy, missing proper nouns — without reading `serves`/`does`. Report within-question
variance and mean drop from expert phrasing. An arm that wins on expert-written NL and collapses on
degraded variants is **not SLM-ready**: its headline is an upper bound obtained with an expert querier.
Report beside `atlas_score`, never folded into it.

## Promotion rule

> Promote only if **G1 NONCAP positive AND G2 holdout preserves the majority of the gain AND G3 shuffle
> loses AND G4 leak-blocked still positive AND G5 DECIDED-BETTER.**
> Otherwise the mechanism is unproven on that set.

## Later / optional

- **Conditional second pass** (BM25 → `resolveAmong` only when top-1 margin < τ): measure as its own
  arm under G5, never as the default. Unconditional two-stage measured *worse* than plain BM25
  (0.3100 vs 0.3450, p≈0.68 — a coin-flip reshuffle at 2× latency).
- **Directory-aligned locate set**: separate series, n≥20, leakage-audited, never mixed with spectral
  expects. Spectral clusters are not human directories; scoring one against the other produced the
  retracted locate headline.
- **Closed-vocabulary faceted `enter`**: evaluate as menu-selection accuracy, not open retrieval.
