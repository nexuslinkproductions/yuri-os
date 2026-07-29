# qsphere-demo

A self-contained, single-file three.js visualization of a quantum-cognition
hypothesis tracker: a "Q-sphere" of 8 basis hypotheses (3-bit basis, |000⟩ …
|111⟩) laid out by Hamming weight, where each dot's size is |amplitude|² and its
color is the sign-phase.

What you can do in it:

- **Measure (collapse).** Project the state onto a qubit outcome or the dominant
  hypothesis and watch the constellation collapse and renormalize — real
  projector math, not an animation trick.
- **Order-effect test.** Run two non-commuting evidence projectors in both
  orders and see P(A→B) ≠ P(B→A), while the QQ statistic stays ≈ 0 — the
  parameter-free invariant of quantum question-order models (Wang & Busemeyer
  2013).
- **Coupling rank.** A live Schmidt decomposition (hand-rolled Jacobi SVD)
  reports whether the displayed state is a product state or coupled.

## Running it

Double-click `index.html` — it opens straight from `file://`. The page loads
three.js from the unpkg CDN via an import map, so it needs an internet
connection on first load; there is no build step and nothing to install.

## The engine behind it

The measurement, order-effect, and Schmidt math is inlined verbatim from the
companion repo **quantum-order-effects** (`quantum-hypothesis-tracker.mjs`),
which also carries the test suite and the two-sided quantum-vs-Bayes
falsification benchmark this demo's numbers come from.

## License

MIT.
