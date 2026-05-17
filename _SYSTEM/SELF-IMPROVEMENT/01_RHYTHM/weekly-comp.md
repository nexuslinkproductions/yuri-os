# Weekly Comp

Canonical weekly consolidation ritual.

## Goal

Rewrite lessons into prevention rules, archive raw notes, and choose the next experiment.

## Flow

1. Read `02_EXTRACT/entries/` and `02_EXTRACT/experiments/`.
2. Select lessons with repeated failures, high cost, or unclear framing.
3. Rewrite each selected lesson into a prevention rule.
4. Update `02_EXTRACT/prevention-rules.md`.
5. Write a digest to `02_EXTRACT/consolidations/`.
6. Move processed raw lessons to `02_EXTRACT/archive/raw-lessons/`.
7. Keep one active experiment for next week.
8. Write `cross-reference-index.md` so lessons from different domains point at the same mechanism.

## Command

```bash
node _SYSTEM/Scripts/self-improvement/weekly-comp.mjs --dry-run
node _SYSTEM/Scripts/self-improvement/weekly-comp.mjs
```
