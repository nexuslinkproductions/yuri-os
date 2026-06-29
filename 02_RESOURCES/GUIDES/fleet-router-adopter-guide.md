# Fleet Router — Adopter Guide

The MLP router (`_SYSTEM/Scripts/fleet-router-mlp.mjs`) is **advisory only**. Hard governance always wins.

---

## What it does today

1. Extracts 12 features from each task leaf (complexity, blast, role signals, etc.).
2. Scores routing **candidates** (glm-max, glm, ollama-flash, native sonnet).
3. Attaches `routerSuggestion` + `routerConfidence` to plans and swarm manifests.
4. May bias `timeoutMs` upward for heavy lanes in `runSwarm.mjs`.

It does **not** override `role-registry.mjs` or the 6-gate charter.

---

## Cold start (fresh clone)

- Weights: `_SYSTEM/state/fleet-router-weights.json` (gitignored, Xavier init if missing).
- Ledger: `_SYSTEM/state/prediction-ledger.jsonl` (gitignored).
- Demo: `node _SYSTEM/Scripts/fleet-router-mlp.mjs --demo`

---

## Learn loop (manual)

After armed fleet runs:

```bash
# 1. Record outcomes (customize paths for your job dir)
node _SYSTEM/Scripts/ingest-audit-trace.mjs --job-dir .claude/jobs/<runId>

# 2. Train
node _SYSTEM/Scripts/train-fleet-router-from-ledger.mjs --epochs=4 --lr=0.015

# 3. Inspect
node _SYSTEM/Scripts/fleet-router-mlp.mjs --weights
node _SYSTEM/Scripts/prediction-ledger.mjs report
```

Predictions now persist `features` in the ledger (required for training).

---

## Multi-candidate scoring

Pass multiple candidates to `predictRoute` for meaningful confidence margins:

```javascript
await predictRoute(features, [
  { id: 'heavy', substrate: 'glm', lane: 'glm-max', role: 'adjudicator' },
  { id: 'bulk', substrate: 'ollama', lane: 'ollama-flash', role: 'artificer' },
  { id: 'native', substrate: 'native', lane: 'sonnet', role: 'sentinel' },
]);
```

---

## Safe defaults vs advanced

| Mode | Behavior |
|------|----------|
| **Safe (default)** | DISARMED; trust role registry; ignore router for dispatch |
| **Advanced** | Arm fleets; ingest outcomes; train weights; still advisory until explicit override wiring |

---

## Tri-substrate conductor

```bash
node _SYSTEM/Scripts/runFleet.mjs --task-file task.json --dry-run
```

Returns GLM plan + native specs + ollama sidecar instructions.

---

## Residual risks

- Small training set → overfit; treat weights as hints.
- Long timeouts on glm-max → cost; set explicit `timeoutMs` on leaves.
- Ollama not auto-wired in `company.mjs` — run `ollama-fleet.mjs` in parallel.
