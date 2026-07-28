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

### ⚠️ CALIBRATION TABLE QUARANTINED 2026-07-28 — DO NOT CITE THE NUMBERS

The table previously printed here was produced by **ad-hoc, unpersisted code** in an authoring
session. No committed harness reproduces it. It is withdrawn as a reference baseline; the numbers
below are kept only as a worked example of how far a shared metric forks when its transforms are
defined twice.

Three independent runs of the **same arm, same frozen scorer, same 40 questions, same corpus**:

```
                     first3   every_other  no_identifiers  long_tokens_6   content_only
orion ad-hoc (was)   0.1050     0.3100         0.3050          0.3050         0.3450
committed harness    0.1400     0.2950         0.2850          0.3200         0.3450
raw-positional (v1)  0.0350     0.2150            —               —            0.3450
```

`content_only` is **0.3450 in all three**. That exact agreement is the proof the scorer, benchmark
and corpus are common — every divergence is transform definition, and it survives even after the
content-spine repair. **Four independent definition deltas**, not one (measured, Orion 2026-07-28):

1. **Stopword set** — the ad-hoc `STOP` ≠ `FASTLEX_STOP`. `before` / `run` / `want` flip membership,
   which moves the content spine and everything derived from it.
2. **Tokenizer** — whitespace-split-then-filter (keeps `decided?`) vs `/[a-z0-9_.-]{3,}/g` (strips
   punctuation and re-tokenizes).
3. **`long_tokens_6` is a different function under the same name** — spine → `len>=6` → **capped at
   6** vs raw → `len>=6` → **uncapped**. This is why it moves *opposite* to every other transform:
   the uncapped form retains extra long tokens (`self-governable` on q022, 0.4 → 1.0) and can also
   hurt (q032, 0.4 → 0 via a retained `action?`).
4. **`no_identifiers` ontology** — path/extension stripping vs `/[._/-]|[a-z][A-Z]/`, which also
   kills camelCase.

**Do not chase byte-identity with the phantom script.** An unpersisted implementation is not ground
truth. Re-baseline against whatever the committed harness emits, under an explicit series break.

### G6a is TWO proxies, not one — report both, gate on the worse

The single-transform-family design was wrong, and the argument that killed it is worth keeping:
"content tokens" is **not a natural kind**. It imports a stopword list and a tokenizer, and two
reasonable choices of those produced `first3` 0.1050 vs 0.1400 on identical inputs. A definition
whose value depends on a preprocessing judgment cannot be the sole authority for a portability gate.

- **G6a-vocab** — content-spine transforms (`content_only`, spine-`firstN`, spine-`every_other`).
  Proxies **vocabulary poverty**: a small model emitting keywords instead of prose.
- **G6a-span** — raw positional transforms (raw `firstN`, raw `every_other`). Proxies **early stop**:
  max-tokens truncation, cut-off tool args, mid-span generation failure. This is the *purer* ablation
  — one operation on the surface string, no vocabulary judgment — and the *worse* proxy for
  vocabulary poverty. Both failure modes are real for SLMs.

**Binding rule: an arm is gated on the WORSE of the two.** Reporting two numbers without this is an
invitation to cherry-pick, which is how a two-metric gate stops being a gate.

**Do not read `content_only ≈ expert` as evidence for the vocabulary model.** That identity is close
to guaranteed when the expert questions are already keyword-dense BM25 bait; it confirms the
tokenizer, not the theory of how small models shorten queries.

**What survives the fork.** Bounded BM25 is **highly phrasing-dependent** under every implementation
measured: `first3` lands between 0.0350 and 0.1400 against an expert 0.3450, so the collapse is
2.5–10× regardless of whose definitions you use. The owner constraint is not hypothetical, and any
headline score on expert-written NL is an upper bound until G6a is reported beside it. The
qualitative finding is robust; only the calibration constants were not.

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
