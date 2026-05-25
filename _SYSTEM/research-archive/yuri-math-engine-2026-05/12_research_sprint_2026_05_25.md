---
title: Math Substrate Hardening Research Sprint
date: 2026-05-25
advisory_only: true
local_truth_claim: false
promotion_status: research
---

# Research Sprint 2026-05-25

## Purpose

This sprint hardens the current mathematical operating substrate without narrowing the
overall ambition. Hypotheses remain valuable and should be preserved. Promotion still
requires executable evidence, deterministic checks, and traceable proof metadata.

## Truth Boundary Clarification

Mathematical truth is not limited to YURI-local files. The local gate only answers:
"Can YURI safely treat this formula, implementation, input mapping, and result as
operationally trusted right now?"

External mathematics, real-world formulas, external solvers, visual proof labs, symbolic
engines, and future adapter outputs remain first-class expansion paths. They enter as
research or advisory hypotheses, then become trusted YURI operations only after their
variables, assumptions, units, examples, implementation binding, and proof traces are
verified.

So the boundary is:

- open exploration for mathematics and real-world use cases
- strict promotion for YURI runtime truth
- no suppression of useful hypotheses merely because they are not yet locally promoted

## Shintai Council Result

Artifact:
`_SYSTEM/state/shintai-advisory/shintai-2026-05-25T00-07-32-166Z.json`

Run boundary:

- 600000 ms per advisory lane.
- Memory evidence disabled to avoid protected runtime surfaces.
- Source paths limited to math code, formula banks, and research docs.
- Output preserved as advisory hypotheses where evidence was incomplete.

Useful synthesis:

- The kernel already has meaningful deterministic primitives.
- Formula cards now need machine enforcement, not only prose.
- Worked examples must execute against the real kernel.
- Proof traces need stable input/result/formula hashes.
- Visual proof work needs real rendered artifacts in a later slice.
- Runtime guards should be added where evidence proves they are needed; first enforce schema, examples, and edge tests.

## External Research Findings

JSON Schema:

- Draft 2020-12 separates Core and Validation, and publishes meta-schemas for validation-oriented schemas.
- YURI should keep a schema reference for formula banks and enforce the subset it needs in local code, rather than relying on prose-only cards.

Property-based testing:

- Property-based tests complement example-based tests.
- Deterministic seeds and shrunk counterexamples are important for reproducible debugging.
- YURI should add deterministic property batteries after the proof-gate slice.

Floating-point reliability:

- JavaScript `Number` is IEEE 754 binary64 with NaN, infinities, signed zero, rounding behavior, and finite precision.
- Floating-point errors are normal system behavior, not rare exceptions.
- YURI proof gates should preserve invalid inputs as explicit proof failures, not accidental NaN propagation.

Provenance and tracing:

- W3C PROV frames provenance as information about entities, activities, and people involved in producing a thing, useful for assessing quality and reliability.
- OpenTelemetry semantic conventions show why shared attribute names matter across polyglot systems.
- YURI proof traces should use stable field names so adapters, labs, and health checks can correlate math results.

Probability calibration:

- Calibration is about whether predicted probabilities can be interpreted as confidence levels.
- Brier score and log loss are useful but can blend reliability, resolution, and uncertainty.
- YURI should pair scalar scores with visual reliability plots before promoting calibration interpretation.

Risk management:

- NIST AI RMF emphasizes trustworthiness considerations across design, development, use, and evaluation.
- YURI should treat mathematical promotion as a lifecycle gate: design card, deterministic implementation, worked example, edge battery, trace, then operational use.

## Implementation Decision

Implement a proof-gate slice now:

- Canonical formula-bank schema reference.
- Formula-bank validator for promoted banks.
- Executable worked examples for every promoted formula.
- Deterministic proof traces with input, result, and formula hashes.
- `math-health` fails if promoted formula cards drift from implementation.

Do not implement now:

- Heavy symbolic IR.
- Runtime theorem proving.
- Broad new math domains.
- Production sandbox workers.
- Interval arithmetic everywhere.

Those remain research lanes until the current substrate proves its schema and trace discipline.

## Sources Used

- JSON Schema specification: https://json-schema.org/specification
- fast-check property-based testing: https://fast-check.dev/docs/introduction/why-property-based/
- Goldberg floating-point paper reprint: https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html
- ECMAScript Number type reference: https://262.ecma-international.org/16.0/index.html
- W3C PROV overview: https://www.w3.org/TR/2013/NOTE-prov-overview-20130430/
- OpenTelemetry semantic conventions: https://opentelemetry.io/docs/concepts/semantic-conventions/
- scikit-learn probability calibration: https://scikit-learn.org/stable/modules/calibration.html
- NIST AI RMF: https://www.nist.gov/itl/ai-risk-management-framework
