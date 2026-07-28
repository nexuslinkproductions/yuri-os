# Eval evidence (ablation / partition / S1 provenance)

Tracked measurement evidence that must **not** live under `_SYSTEM/eval/`.

`_SYSTEM/eval/` is the frozen scorer+benchmark surface (`YURI_EVAL_UNFREEZE=1`).
Evidence commits must not require unfreezing the scorer. `_SYSTEM/state/atlas/` is
gitignored as loop-generated bulk. This directory is the third location: tracked,
not frozen, not loop-bulk.

## Regenerate

```bash
node _SYSTEM/Scripts/atlas/partition-leak-scan.mjs --write
node _SYSTEM/Scripts/atlas/tier0-threshold-power.mjs --write
```

Matcher spec (frozen before class rerun): `partition-literal-matcher-v1.json`.

---

## Matching rule (prose — attack this, not the script)

A question from find-40 is a **candidate** for a class if **any** enabled predicate
hits on **any** present surface file in that class.

**Question set.** Rows of `_SYSTEM/eval/atlas-benchmark.jsonl` where
`(type || 'find') === 'find'`, then the first 40 in file order. Blob identity is
recorded as git `hash-object` of that file at scan time (see artifacts'
`question_set.blob_sha1`).

**Surfaces (channel-split — Hermes R2 2026-07-28).**

`C_inject` and `C_disk` are **different on purpose**. Never merge them for Channel-C
flags or union arithmetic.

| Channel | Role | Files |
|---|---|---|
| DOCTRINE `C_INJECT` | Packet floor (Tier −1 / Channel C) | `CLAUDE.md` + transitive `@`-includes: `SOUL.md`, `_SYSTEM/persona.md`, `_SYSTEM/yuri-origin.md`. **Not** `AGENTS.md` / `sync.mdc`. Phoenix owns fixture + `g-cinject-doctrine-candidates.json`. |
| DOCTRINE `C_DISK` | Partition class — grep-reachable doctrine | `CLAUDE.md`, `AGENTS.md`, `SOUL.md`, `_SYSTEM/persona.md`, `_SYSTEM/yuri-origin.md`, `.cursor/rules/sync.mdc`, `.claude/rules/*.md`. Artifact: `g-disk-doctrine-candidates.json`. |
| REGISTRY | Tool-readable registries | `_SYSTEM/capabilities.json`, `skills/skill-index.json` |

**Retired.** The original 3-surface “DOCTRINE” scan (`CLAUDE.md` + `AGENTS.md` +
`sync.mdc`) is `RETIRED_SCAN_SURFACE_MISMATCHED_AND_CHANNEL_CONFLATED` — it mixed
never-injected adapters with an incomplete inject set. Preserved under
`g-injected-doctrine-candidates.json` for provenance only; **do not cite its 12**.

**Normalization.** Expect path = `String(expect[0])` with a leading `./` stripped
only. Basename = `path.basename(expect)` **including extension**. Surface bytes =
`readFileSync` UTF-8 as stored; no Unicode NFC/NFD normalize; no line-ending rewrite.

**Enabled predicates (case-sensitive substrings).**

1. `full_path` — `surfaceText.includes(expect_path)`
2. `basename` — `surfaceText.includes(basename)`

**Explicitly disabled.** Stem matching (basename without extension); case-insensitive
matching; word-boundary / regex token matching; path-segment fuzzy matching; symlink
realpath rewriting of expect or surface.

**Context policy.** A hit counts in **any** surrounding context: comments, URLs,
markdown code fences, JSON string values, and prose. No AST parse; no comment-stripping.

**Aggregation.** Evidence records every `(surface, predicate)` hit with a ±40 character
snippet around the first `indexOf` match (`full_path` preferred when both hit on the
same surface). Official REGISTRY count is the union over REGISTRY surfaces.
`capabilities.json` alone under the **same** matcher is also recorded for audit; it
cannot be lower than REGISTRY and is not a second official headline.

**Incomparable prior.** A verbal report of “28/40 in capabilities.json” with no
persisted artifact and no matcher metadata is `INCOMPARABLE_PRIOR_RESULT`. It is not
cited again (not as a range, not as an approximation). Official REGISTRY = **27/40**
under matcher v1.

**Locked counts under matcher v1 predicates (regenerable; C_disk channel).**
DOCTRINE `C_DISK` 17/40 · REGISTRY 27/40 · UNION **36/40** · INTERSECTION 8/40 ·
NEITHER 4/40 (`q024`, `q034`, `q039`, `q040`). These are **candidate** ceilings for
static literal presence, not confirmed subject contamination.

**Do not cite 33/40.** That union used the conflated 3-surface scan and is an
`UNDER_SCOPED_FLOOR`. Full `C_disk` can only add hits (monotone). Global
`~/.claude/CLAUDE.md` is declared in the partition class but out of the
repo-rooted regenerator — if it adds literals, 36/40 is still a lower bound.

---

## Negative tests bind only the context they ran in

This is **not** “run more tests.” A negative test’s scope is the **context it
executed in**. A claim of universal binding therefore has to be violated from the
context **most likely to escape** — the stale worktree, the older checkout, the
other harness — not from the one you happen to be standing in. Without that
distinction the line collapses into generic diligence advice and gets ignored.

**Measurement (2026-07-28, Hermes, from a worktree) — cite, do not re-derive:**
`core.hooksPath` is **RELATIVE** (`_SYSTEM/git-hooks`), so each worktree runs its
own checked-out copy of the hook. Exec bit armed in `c641bd22`. Mode at main HEAD:
`100755` (hook runs). Mode at older worktree checkouts: `100644` (hook **silently
skipped**). Git reports the skip as `hint: The '_SYSTEM/git-hooks/pre-commit' hook
was ignored because it's not set as executable` — **not an error**, so the lane
sees nothing. At measurement: **54 of 64** worktrees running without the armed
hook. Layer 1 (`chmod 444` on `_SYSTEM/eval/*`) was designed to bind every process
and was **never applied** (files remain 644).

Orion’s main-root freeze rejection (commit to `atlas-score.mjs` without
`YURI_EVAL_UNFREEZE` → REJECTED) was correct procedure and correct in **one place
out of sixty-four**. Necessary; insufficient as a fleet-wide claim.

Fixing relative `hooksPath` / layer 1 is an owner decision (pushing the exec bit
forward does not fix worktrees pinned before `c641bd22`). Do not self-assign from
this note.

---

## S1 provenance (not a yardstick)

S1 was evaluated as a calibration yardstick and COLLAPSED. It yielded 8 navigation
questions across 14 main sessions, only 3 of them cold. The other 44 transcripts were
subagent sessions, whose questions are agent-generated and excluded by definition.
n=3 cannot calibrate anything. The resolved 8-row artifact proved unrecoverable from
transcripts and checked-in state; the only regenerable candidate used a DIFFERENT
heuristic at 73 rows and was rejected as a surrogate rather than a recovery. No data
file was shipped. Recorded as provenance, not as a yardstick.

---

## Files

| Artifact | Regenerator | Notes |
|---|---|---|
| `partition-literal-matcher-v1.json` | none (frozen predicates; channel surfaces corrected R2) | Predicates frozen before class rerun; C_inject/C_disk split 2026-07-28 |
| `g-disk-doctrine-candidates.json` | `partition-leak-scan.mjs` | **Cite this** for C_disk DOCTRINE literals |
| `g-cinject-doctrine-candidates.json` | Phoenix (fixture @ pinned commit) | Packet-floor Channel C; not written by Orion `--write` |
| `g-injected-doctrine-candidates.json` | preserved / retired | RETIRED — SCAN-SURFACE-MISMATCHED + CHANNEL-CONFLATED; do not cite 12 |
| `g-registry-literal-candidates.json` | `partition-leak-scan.mjs` | REGISTRY candidates |
| `find40-doctrine-registry-overlap.json` | `partition-leak-scan.mjs` | C_disk ∪ REGISTRY — cite **36/40**, not 33/40 |
| `tier0-threshold-power.json` | `tier0-threshold-power.mjs` | CS + Wilson; n=28 cannot CLEAR θ=0.6 at 28/28 |
| `freeze-violation-matrix.json` | `freeze-violation-matrix.mjs` | **v1 / incomparable across version break**; evaluator restoration is a postcondition |
| `freeze-violation-matrix-v2.json` | `freeze-violation-matrix.mjs` | v2 explicit relative/absolute hook-resolution contexts; C3b is N/A until an absolute install exists |
| `source-partition-v1.json` | none (hand-frozen class list) | NAV / REGISTRY / DOCTRINE / CORPUS |
| `athena-digest-expect-score.json` | **none** — `RECORDED_RESULT_NO_REGENERATOR` | ad-hoc digest vs expect |

Do not hand-edit regenerable JSON. Change the matcher spec (new version) before changing
match behaviour; then `--write`.

## Freeze violation matrix

The v1 result (`freeze-violation-matrix.json`, score 0.5) is retained as historical
evidence but is **INCOMPARABLE_ACROSS_VERSION_BREAK**. Its runner imposed a relative
`core.hooksPath` in every scratch context, so it could not observe an absolute-hook repair.
The v2 runner keeps the evaluator and verdict logic unchanged while treating hook resolution
as an explicit context variable: C3 is the relative stale-worktree regression probe and C3b
is the corresponding absolute-install context. C3b is `NOT_APPLICABLE` when no absolute
installed hooksPath exists; it is never counted as an escape or included in a bare denominator.
Report `blocked/applicable` with the applicable count beside it.

Run from a clean checkout with the evaluator unchanged:

```bash
node _SYSTEM/eval-evidence/freeze-violation-matrix.mjs \
  --write=_SYSTEM/eval-evidence/freeze-violation-matrix-v2.json
```

The runner creates disposable clones and nested worktrees, attempts a comment-only edit of
`_SYSTEM/eval/atlas-score.mjs`, captures the actual guard output, and removes only its own
scratch directories. C1 is intentionally a repo-root-shaped scratch checkout rather than the
live `main` branch because the containment rule forbids violating commits on `main`. C6 uses a
throwaway local bare remote and `--dry-run`; it does not measure server-side branch protection.
The result is valid only if `postcondition.evaluator_restored` is true and the recorded evaluator
tree digest is unchanged.

## Freeze repair (Orion, owner scope)

Artifact: `freeze-repair-phases-2-4.json`.

| Ship | Mechanism |
|---|---|
| Absolute `core.hooksPath` | `node _SYSTEM/Scripts/yuri-git-hooks-path.mjs --apply` |
| `chmod 444` on `_SYSTEM/eval/*` | `node _SYSTEM/Scripts/yuri-eval-chmod-advisory.mjs --apply` (advisory, per-checkout) |

C4 / C6 = **OPEN-BY-OWNER-DECISION**. No CI workflow. No installer sync.
`pre-push` = KNOWN INERT GUARD (mode 100644). v2 matrix files untouched.
