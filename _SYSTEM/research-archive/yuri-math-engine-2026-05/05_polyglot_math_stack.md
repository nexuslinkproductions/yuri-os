# Polyglot Math Stack

Date: 2026-05-24
advisory_only: true
local_truth_claim: false

## Principle

YURI must not lock itself into one language or one runtime. Mathematics is broader than any single stack.

The adapter model lets external engines participate while preserving YURI governance.

## Adapter Classes

| Class | Examples | Promotion Boundary |
|---|---|---|
| Core | Node math kernel | Verified baseline |
| Lab | Python visual proof scripts | Research/lab only |
| Symbolic | SymPy, future CAS adapters | Research until formula equivalence tests exist |
| Graph | NetworkX, future graph engines | Cross-check against baseline fixtures |
| Proof | Lean, SMT, theorem provers | Future proof obligations |
| Accelerator | WASM, GraphBLAS-style kernels | Future performance lane after correctness baseline |
| EML | parser/serializer/symbolic regression | Research sandbox |

## Adapter Contract

Every adapter declares:

- schema
- id
- engine
- capabilities
- run mode
- promotion status
- runtime-truth write policy

The v0 contract is implemented in `_SYSTEM/Scripts/math/math-adapters.mjs`.

## Runtime Rule

External engines can explore and compute. YURI promotes only verified outputs.

That gives us the power of the external math ecosystem without giving every dependency authority over memory, routing, or release state.
