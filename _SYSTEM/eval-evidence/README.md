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

**Surfaces.**

| Class | Files |
|---|---|
| DOCTRINE | `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/sync.mdc` |
| REGISTRY | `_SYSTEM/capabilities.json`, `skills/skill-index.json` |

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

**Locked counts under matcher v1 (regenerable).** DOCTRINE 12/40 · REGISTRY 27/40 ·
UNION 33/40 · INTERSECTION 6/40. These are **candidate** ceilings for static literal
presence, not confirmed subject contamination.

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
| `partition-literal-matcher-v1.json` | none (frozen spec) | Committed **before** class rerun |
| `g-injected-doctrine-candidates.json` | `partition-leak-scan.mjs` | DOCTRINE candidates |
| `g-registry-literal-candidates.json` | `partition-leak-scan.mjs` | REGISTRY candidates |
| `find40-doctrine-registry-overlap.json` | `partition-leak-scan.mjs` | union / intersection |
| `tier0-threshold-power.json` | `tier0-threshold-power.mjs` | CS + Wilson; n=28 cannot CLEAR θ=0.6 at 28/28 |
| `source-partition-v1.json` | none (hand-frozen class list) | NAV / REGISTRY / DOCTRINE / CORPUS |
| `athena-digest-expect-score.json` | **none** — `RECORDED_RESULT_NO_REGENERATOR` | ad-hoc digest vs expect |

Do not hand-edit regenerable JSON. Change the matcher spec (new version) before changing
match behaviour; then `--write`.
