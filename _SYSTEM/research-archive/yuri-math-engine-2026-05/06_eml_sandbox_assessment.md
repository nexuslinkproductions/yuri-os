# EML Sandbox Assessment

Date: 2026-05-24
advisory_only: true
local_truth_claim: false

## Opportunity

The EML paper proposes `eml(x,y)=exp(x)-ln(y)` plus constant `1` as a compact expression basis for a scientific-calculator-style elementary function set. If validated for YURI's needs, this could become useful as:

- formula intermediate representation
- expression-tree substrate
- symbolic regression search space
- derivation graph visualization target
- formula compression experiment
- formula-space A* domain

## Caveats

EML is not promoted to runtime core in v1.

Reasons:

- The breadth of the "elementary functions" claim is contested.
- Some constructions require complex arithmetic.
- Branch cuts and principal values must be explicit.
- Infinities and signed zero can change behavior across numerical engines.
- Repeated exponentials can create overflow risk.
- A compiler or symbolic regression engine would add major complexity before baseline graph/logarithmic primitives are proven.

## Sandbox Policy

Allowed now:

- archive source material
- document EML terms and caveats
- visualize derivation trees later
- prototype parser/serializer later under lab/research mode

Blocked now:

- runtime control-plane dependency
- automatic formula-bank promotion
- memory/routing authority
- unverified symbolic-regression claims

## Promotion Requirement

Before EML can become more than a sandbox, YURI needs:

- explicit numeric domain policy
- parser/serializer tests
- equivalence tests for primitive examples
- branch-cut tests
- overflow/underflow tests
- visual derivation report
- independent critique digest attached to every EML promotion proposal
