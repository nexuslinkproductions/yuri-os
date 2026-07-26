# program.md — operating instructions for the Atlas tuning loop

You are the lane driving `atlas-loop.mjs`. This document is the whole contract. Read it before you
arm anything.

The loop tunes **how YURI's Atlas checkpoints get generated** so that a plain-language question
lands on the right file. It does not train a model, and it does not write code. It moves one
declared constant at a time and lets a frozen benchmark decide whether that was an improvement.

Doctrine this implements: `_SYSTEM/yuri-origin.md` → `## Loop Discipline`. Where this file and that
section disagree, that section wins and this file is the bug.

---

## The rule that makes this real

**You may not touch anything under `_SYSTEM/eval/`. Not the scorer, not the benchmark, not a
comment in either.**

That is not a style preference. A loop whose optimizer can edit its own scorer will optimize the
scorer. It is the cheapest available path to a rising number, it requires no bad intent to happen,
and it fails *silently* — the metric climbs, the log looks healthy, and the system underneath is
exactly as bad as it was. Every honest gain this loop can produce depends on the scorer being fixed
while the pipeline moves.

So the split is structural:

| | optimizer | evaluator |
|---|---|---|
| file | `_SYSTEM/Scripts/atlas/atlas-loop.mjs` | `_SYSTEM/eval/atlas-score.mjs` + `atlas-benchmark.jsonl` |
| who may edit it during a run | you | **nobody** |
| what it knows | the proposal, the diff, the reasoning | the benchmark and the resolver's stdout, nothing else |

The loop enforces this itself: before the first iteration, and again before *and* after every
single iteration, it checks that `_SYSTEM/eval/` is byte-identical to `HEAD`. Any difference —
tracked modification, untracked file, one changed character — aborts the run immediately and
loudly. Results already written stay written; the run stops.

This in-loop check is **layer 2 of 4** in the doctrine's enforcement stack (OS file mode; this
check; a git-level hook; harness permission config). It binds every harness that runs this script,
and *only* processes that run this script. That is precisely why it is not the only layer. Do not
argue that the other layers are redundant because this one exists.

### The legitimate-vs-illegitimate test

There is a narrow case where changing the evaluator is correct: the benchmark has a genuine defect
(a question with a wrong expected answer, a duplicate id, a scoring bug). Here is how to tell that
apart from cheating, and it is a hard test, not a vibe:

> **A change to the evaluator is legitimate only if you can justify it from first principles
> WITHOUT reference to which questions currently fail.**

State the justification with the failing-question information removed. If the argument still stands
on its own — "question q023 lists an expected path that was deleted in commit abc123, so it is
unanswerable by any resolver" — it is legitimate. If the argument only makes sense as "this
question is the one we keep getting wrong," it is score manipulation wearing a reasonable sentence.

The tell is direction of reasoning. Legitimate: you noticed a defect in the benchmark, and it
happens to affect the score. Illegitimate: you noticed the score, and went looking at the benchmark.

Even when the test passes, **you do not make the change.** Benchmark ground truth is an owner
judgment and is explicitly not delegable to the lane being measured — that is you. Stop the loop,
write up the defect with the first-principles justification, and hand it to Marcel. A benchmark
edit mid-run also invalidates every score in that run, so the run ends either way.

---

## What the metric means

`atlas-score.mjs` asks the resolver each of the benchmark's plain-language questions and checks
whether the file the question is actually about shows up in the answers.

- **hit@1** — fraction of questions where the top answer was right.
- **hit@3** — fraction where the right answer was somewhere in the top three.
- **atlas_score** — `0.6 * hit@1 + 0.4 * hit@3`. One scalar for tracking trend. Weighted toward
  hit@1 because landing on the answer is worth more than landing near it.

Read `_SYSTEM/eval/atlas-score.mjs`'s header for the authoritative definition. It is defined in
exactly one place on purpose; do not restate it in a commit message or a report and let the two
drift.

**What the number is not.** It is a coarse instrument over a small benchmark. A change of ±0.005 is
noise, not a finding. It measures one thing — can a question find its file — and a knob setting
that helps it can still make regions worse for a human reading the map. When you report results,
report the number and its limits together, or you have overclaimed.

---

## The knobs

A knob is a constant in the Atlas generation pipeline that encodes a genuine trade-off. The registry
lives in the `KNOBS` array at the top of `atlas-loop.mjs`; each entry carries a `why` explaining
what the trade actually is. Run `node _SYSTEM/Scripts/atlas/atlas-loop.mjs --knobs` for live state.

Grouped by what they control:

**Region granularity** — `spectral_k` (`atlas-build.mjs`). How many regions the repo is cut into.
Too few and one blob region swallows everything; too many and every region is a singleton carrying
no navigational information. Both failure modes are visible in `atlas-build`'s own summary output,
but only the benchmark says which side of the trade actually helps a lookup.

**What counts as an edge** — `max_doc_refs`, `capability_membership_cap` (`atlas-edges.mjs`). An
index file names hundreds of paths; uncapped, it becomes a hub connecting everything to everything
and region structure dissolves. A capability with N members contributes O(N²) pairwise edges. These
caps bound real blow-ups — they are trade-offs, not safety margins.

**What an edge is worth** — `edge_weight_calls`, `edge_weight_reads`, `edge_weight_imports`,
`edge_weight_references`, `default_kind_weight` (`atlas-regions.mjs`). The relative pull of each
evidence kind during clustering. Imports are the densest source; over-weighting them makes regions
track the module graph instead of meaning. Doc references are the weakest and noisiest evidence.

**How a question is matched** — `bm25_k1`, `bm25_b` (`atlas-resolve.mjs`). Term-frequency saturation
and length normalisation in the resolver's ranking. These carry prose-tuned defaults, and checkpoint
documents are 5–25 identifier tokens rather than prose — the defaults are a hypothesis here, not a
settled value. `atlas-resolve.mjs` already documents measured alternatives; read that block before
assuming any of it.

### Knobs are declarations, resolved at run time

`atlas-regions.mjs` and `atlas-resolve.mjs` are under active development by other lanes. A knob
therefore is not a line number — it is a pattern matched against the file's *current* text:

- the pattern must match **exactly once**, or the knob is `UNRESOLVED`
- a knob with several sites (a default repeated in a library entry point and a CLI entry point)
  requires all sites to hold the **same** value, or it is `INCONSISTENT`
- unresolved and inconsistent knobs are **skipped and reported**, never guessed at
- a knob whose file no longer exists is unresolved, not a crash

So `--knobs` showing fewer than the full registry is normal and healthy. It means a knob moved or
was renamed upstream, not that something is broken. During the authoring of this loop, `BM25_K1`
and `EDGE_KIND_WEIGHT` both moved out from under it within the same hour.

### Adding a knob

1. Confirm the constant is a real trade-off, not a correctness constant. If one value is simply
   right and the others are bugs, it is not a knob.
2. Add an entry to `KNOBS` with: `id`, `file`, `type` (`int`/`float`), `candidates`, `rebuild` (the
   earliest regeneration stage it invalidates: `identity` → `edges` → `build`, or `[]` for a
   resolver-only knob), `sites`, and an honest `why` naming the trade in both directions.
3. Each `sites` regex captures `(prefix)(value)` and must match exactly once. Verify with `--knobs`.
4. Run `--test`. The registry-integrity tests will catch a missing field or a site pattern with no
   capture group.
5. `--dry-run` before `--run`, always.

Two things that disqualify a knob outright: anything the evaluator can see (it would leak the
proposal into the verifier), and anything that changes what the benchmark asks (that is editing the
evaluator through a side door).

---

## Running it

The loop is **disarmed by default**. No flag prints the plan and exits without touching anything.

```bash
node _SYSTEM/Scripts/atlas/atlas-loop.mjs            # plan only — mutates nothing
node _SYSTEM/Scripts/atlas/atlas-loop.mjs --knobs    # which knobs resolve right now
node _SYSTEM/Scripts/atlas/atlas-loop.mjs --test     # self-tests, synthetic inputs only
node _SYSTEM/Scripts/atlas/atlas-loop.mjs --dry-run  # full control flow, every effect stubbed
```

Arming requires an owner decision. Per the Self-Governance Charter, building behind a disarmed flag
is self-governable; **arming is owner-gated**. The script does not arm itself, and neither do you.

```bash
git switch -c atlas/tune-granularity                          # scratch branch, never main
node _SYSTEM/Scripts/atlas/atlas-loop.mjs --dry-run
node _SYSTEM/Scripts/atlas/atlas-loop.mjs --run --iters=12    # ARMED
```

Preflight aborts the run — before any mutation — on any of: being on `main` or any branch not
matching `atlas/*`; uncommitted changes anywhere in `_SYSTEM/eval/`; a scorer whose own
`--self-check` does not pass; uncommitted changes in the knob surface (which would make "revert to
the pre-iteration state" meaningless); no resolvable knob; an unwritable results log.

> **Repo quirk, and it has produced wrong numbers twice.** A directory named `main` exists at the
> repo root, so a bare `main` in a git command silently resolves as a *pathspec* rather than the
> branch. Always `refs/heads/main`. The loop guards this mechanically — `assertNoBareMain()` throws
> on a bare `main` token in any git argv it builds — but the guard only covers git calls made
> *through the loop*. When you run git by hand, the quirk is yours to remember.

---

## What one iteration does

```
verify _SYSTEM/eval/ == HEAD          (abort loudly on any difference)
record HEAD + hash every knob-surface file
mutate exactly ONE knob                (refuse if a second knob's value would move)
commit to the scratch branch
regenerate the affected artifacts
score in a FRESH child process         (stdout parsed; nothing else passed in)
  strictly improved -> keep, advance the best score
  equal or worse    -> git reset --hard, regenerate, verify the tree is byte-identical
append one row to _SYSTEM/state/atlas/results.tsv
verify _SYSTEM/eval/ == HEAD again
```

Four properties of that sequence are load-bearing, and each exists because of a specific way loops
like this go wrong.

**One knob per iteration.** Move two and any gain is unattributable — you have a better number and
no idea which change caused it, which is not knowledge. The loop verifies the post-mutation text
against every sibling knob in the same file and refuses a proposal that moved a second one.

**Strict improvement only.** A tie reverts. Keeping ties lets the run ratchet in changes that do
nothing, and across enough iterations that is how noise gets promoted to a finding. Comparison is
always against the **best score so far**, never the previous iteration — otherwise a slow downward
drift can be walked in one "improvement" at a time.

**Byte-exact reverts.** A revert that leaves one stray character silently contaminates every later
measurement, and the contamination is invisible in the results log. The loop hashes every
knob-surface file before the iteration and re-checks after the revert; drift stops the run.
Note that `_SYSTEM/state/atlas/` is gitignored, so `git reset --hard` restores only the *source* —
the loop regenerates the artifacts from that restored source as the second half of the revert.

**Verifier isolation.** The scorer runs as a genuinely fresh child process, never an in-process
import, and is handed no information about the proposal, the diff, the knob name, or the reasoning.
A verifier that shares the optimizer's context inherits the optimizer's blind spots and confirms
them. If you ever find yourself wanting to pass "context about what changed" into the scorer to
help it, that impulse is the failure mode, not a workaround for it.

---

## Reading the results

`_SYSTEM/state/atlas/results.tsv` is **append-only**. One row per iteration, including skips and
failures:

```
iso_timestamp | commit | knob | old_value | new_value | atlas_score | hit@1 | hit@3 | verdict | note
```

Never rewrite, re-sort, de-duplicate, or clean up this file. The reverted rows are the point — a log
showing only successes cannot tell you whether a knob was explored and rejected or never tried, and
that difference is most of what the log is for.

When you report a run, report: the number of iterations, how many were kept, the starting and
final `atlas_score`, which knob produced each gain, and — not optionally — which knobs were
explored and produced nothing. A run where nothing improved is a real result. It says the current
settings are at a local optimum for these knobs, which is information, and reporting it as
disappointing rather than informative is how a loop turns into theatre.

Do not average across runs on different benchmark versions. Do not compare an `atlas_score` from a
run whose preflight was overridden against one where it was not.

---

## When to stop

Stop and hand back to the owner when:

- the freeze check fires — always, no exceptions, no "it was only a comment"
- a revert is not byte-exact
- the scorer's own `--self-check` stops passing
- every knob is exhausted, or the whole schedule reverts
- you find what you believe is a genuine benchmark defect (write it up; do not fix it)
- you catch yourself constructing an argument for why the evaluator should change

The last one is the one to actually watch for. It will not feel like cheating. It will feel like a
reasonable engineering observation about a flawed test.
