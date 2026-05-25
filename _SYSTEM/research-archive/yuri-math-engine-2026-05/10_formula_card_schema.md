---
title: Formula Card Schema
date: 2026-05-25
advisory_only: true
local_truth_claim: false
promotion_status: research
---

# Formula Card Schema

## Purpose

Formula banks must be executable knowledge, not decorative notation. A formula card
should tell YURI when a formula applies, what each symbol means, how it fails, which
implementation owns it, and which examples prove that YURI can use it correctly.

## Required Fields

```json
{
  "id": "stable-formula-id",
  "domain": "probability | graph | vector-geometry | optimization | control | proof",
  "notation": "mathematical notation",
  "purpose": "plain-language operating purpose",
  "implementedBy": "_SYSTEM/Scripts/math/math-kernel.mjs#functionName",
  "variables": [
    {
      "symbol": "p",
      "meaning": "predicted probability",
      "type": "number",
      "constraints": ["0 <= p <= 1"]
    }
  ],
  "assumptions": ["explicit assumption"],
  "invalidInputs": ["what must be rejected"],
  "failureModes": ["how the formula can mislead if assumptions are false"],
  "workedExamples": [
    {
      "name": "short synthetic example",
      "input": {},
      "expected": {},
      "interpretation": "what YURI can do with the result"
    }
  ],
  "proofObligations": ["test or proof requirement"],
  "promotionStatus": "research | verified-baseline | stable",
  "advisoryOnly": false
}
```

## Promotion Meaning

| Status | Meaning |
|---|---|
| `research` | Useful hypothesis or external reference; not runtime truth. |
| `verified-baseline` | Deterministic local implementation and tests exist. |
| `stable` | Has survived repeated operational use and regression checks. |
| `quarantined` | Known issue or stale assumption; must not be used operationally. |

## Worked Example Standard

Every promoted formula needs at least one example that answers:

- What YURI situation is being mathematized?
- What are the variables and units?
- What input values are used?
- What is the expected output?
- What does the result mean operationally?
- Which caveat prevents overclaiming?

## Machine Enforcement

Promoted banks must pass `_SYSTEM/Scripts/math/math-proof-gate.mjs`.

The proof gate checks:

- bank and formula-card required fields
- per-formula promotion state and advisory boundary
- declared implementation binding
- executable worked examples
- deterministic input, formula, and result hashes
- failed examples preserved as proof traces when run in advisory mode

The schema reference lives at
`_SYSTEM/config/schemas/yuri.math.formula-bank.v0.schema.json`. The local validator
is intentionally stricter for promoted banks than for fixture banks.

## Adapter Result Contract

External adapters should return:

```json
{
  "schema": "yuri.math.adapter-result.v0",
  "adapterId": "python-scipy",
  "capability": "optimization",
  "inputHash": "sha256",
  "resultHash": "sha256",
  "result": {},
  "proof": {
    "method": "solver or theorem prover name",
    "libraryVersion": "string",
    "assumptions": [],
    "warnings": []
  },
  "writesRuntimeTruth": false
}
```

## Non-Blocking Hypothesis Rule

Model and adapter outputs should be preserved even when evidence is missing. The correct
action is to mark them as advisory hypotheses, not to discard them. Promotion gates decide
whether they become trusted truth.
