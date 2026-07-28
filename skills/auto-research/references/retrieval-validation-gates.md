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

**G6 — Paraphrase sensitivity (SLM usability).** Owner constraint: a small model must reach the same
result as a large one. An arm whose accuracy depends on query craft gives big models one number and
small models another. Report beside `atlas_score`, never folded into it.

Two distinct questions — do not conflate them (Orion, 2026-07-28):

- **G6a — mechanical degradation. Available immediately, no new authorship.** Deterministic transforms
  of the question text only, never touching the answer: content-words-only, identifiers stripped,
  first-N content tokens, long-tokens-only, every-other-token. Introduces **no new circularity**,
  because nothing is authored. Measures sensitivity to information loss — a proxy for "small model
  emits shorter, vaguer text," not a sample from a real 3B querier. **Use as a PRE-GATE on every arm,
  including any menu/faceted design**, before spending on authored paraphrases.

- **G6b — independently authored paraphrases. Requires sealed provenance.** Any author with the
  worktree mounted can re-read `capabilities.json`, in-source tags, or the gold expect path, which
  reopens Channels E and S. *"Don't look" is not enforceable on a lane with filesystem access.*
  Authentic SLM-distribution paraphrases need a provenance-isolated author with expect IDs sealed
  until after paraphrase lock. That is new process, not a trick available on an existing set.

**Measured baseline for calibration** — `fastlex` on find-40 under G6a:

```
expert 0.3450 | content_only 0.3450 | no_identifiers 0.3050 | long_tokens_6 0.3050
every_other 0.3100 | first8 0.2700 | first5 0.2100 | first3 0.1050
23/40 questions change score under some degradation
16/40 expert hits collapse to ZERO under at least one degradation
mean expert -> worst drop 0.325
```

So bounded BM25 is **already highly phrasing-dependent**, and the constraint is not hypothetical —
it is visible under mechanical shortening alone, with no new questions required. Any headline score
on expert-written NL should be read as an upper bound until G6a is reported next to it.

**G6a caveat:** it does *not* clear Channel S. Distinctive leaked tokens often survive truncation —
`sparse-checkout` is still present in the first-N content words — so a contaminated question stays
contaminated after degradation.

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
