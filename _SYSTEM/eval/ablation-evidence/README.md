# Ablation evidence (find-40 / source partition)

Versioned freeze inputs for the tool-ablation measurement design (2026-07-28).

`_SYSTEM/state/atlas/` is gitignored (loop-generated bulk). These files live here next to
`atlas-benchmark.jsonl` so a partition freeze hash is reproducible after reboot.

## Regenerate

```bash
node _SYSTEM/Scripts/atlas/partition-leak-scan.mjs --write
node _SYSTEM/Scripts/atlas/tier0-threshold-power.mjs --write
```

## Files

| Artifact | Regenerator | Notes |
|---|---|---|
| `g-injected-doctrine-candidates.json` | `partition-leak-scan.mjs` | DOCTRINE packet literal candidates (12/40) |
| `g-registry-literal-candidates.json` | `partition-leak-scan.mjs` | REGISTRY class literals (capabilities.json + skill-index) |
| `find40-doctrine-registry-overlap.json` | `partition-leak-scan.mjs` | union/intersection |
| `tier0-threshold-power.json` | `tier0-threshold-power.mjs` | CS + Wilson; n=28 cannot CLEAR θ=0.6 even at 28/28 |
| `source-partition-v1.json` | none (hand-frozen class list) | DECIDED; hash after candidate artifacts exist |
| `athena-digest-expect-score.json` | **none** — `RECORDED_RESULT_NO_REGENERATOR` | ad-hoc digest vs expect score |

Do not hand-edit regenerable JSON; change surfaces in the script and `--write`.
