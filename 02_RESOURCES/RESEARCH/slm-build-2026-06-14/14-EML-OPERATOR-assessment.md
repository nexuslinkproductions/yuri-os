# 14 — EML single-operator paper: YURI applicability assessment

> Owner-flagged: arXiv **2603.21852v2** "All elementary functions from a single binary operator" (single author).
> Read abstract + HTML body (symbolic-regression + limitations sections). Honest assessment — where it helps
> YURI's "work + calculate", where it doesn't.

## What it actually is
- One operator **`eml(x,y) = exp(x) − ln(y)`** + constant `1` constructively generates the whole
  scientific-calculator basis (constants e/π/i; +−×÷ ^; transcendental + algebraic functions). Grammar
  `S → 1 | eml(S,S)` → every expression is a **uniform binary tree of identical nodes**.
- **Trainable:** EML trees as differentiable circuits + Adam → recover closed-form elementary laws from
  numerical data. Multi-stage: Adam fit → **"hardening phase pushing weights toward 0/1"** → round weights to
  the **nearest simplex vertex**.
- Verified across C/NumPy/PyTorch/mpmath/Mathematica + a Rust re-impl; constructive completeness proof sketch.

## The honest limits (from the body, not the abstract hype)
- **Recovery falls off a cliff with depth:** 100% at depth 2, ~25% at depth 3–4, **<1% at depth 5** (1000+ runs).
  Most useful functions need deep trees (multiplication = depth 8; "most basic functions require larger depths";
  a trillion-param transformer ≈ depth 40). So as a symbolic-regression engine it currently recovers only
  **shallow elementary laws**.
- **Numerical fragility:** composed exponentials overflow; complex arithmetic produces NaN. Each node adds
  exp+ln+subtract → **deeper trees = worse float stability**, by the author's own account.
- Single-author, 2026-03, "feasibility demonstrated" — an elegant primitive + research direction, not a drop-in.

## Where it genuinely benefits YURI
1. **formula-foundry (symbolic regression) — the real fit.** YURI's formula-discovery organ today searches
   heterogeneous operator grammars. EML offers a **uniform, gradient-trainable substrate** (one operator,
   simplex-weighted nodes) — recover a closed-form law from data via Adam at shallow depth. Good for discovering
   compact elementary laws (e.g. a candidate energy-term form) from YURI's trace data.
2. **Striking structural resonance with the energy gate (cross-domain bridge).** EML's "**Adam fit → harden
   weights toward 0/1 → round to the nearest simplex vertex**" is the SAME mathematical shape as YURI's
   energy-calibration ladder (soft-weight proposal → promotion) and the **affine/corner law** we already proved
   (`feedback-affine-objective-enumerate-corners`: an affine objective over a simplex is extremal at a VERTEX).
   - source: EML weight-hardening · target: YURI energy-weight calibration + corner-enumeration · shared
     mechanism: simplex-vertex extremization of an (affine-ish) objective · confidence: MED-HIGH (same structure,
     different domain). YURI already has the corner-enumeration machinery EML's training implicitly wants.
3. **Energy-formula DISCOVERY (not just tuning).** Today we hand-tune the 12 energy betas. EML SR could attempt
   to recover the *form* of an energy term from the 46k burn-in trace at shallow depth — a research probe, not
   a replacement (depth limit applies).

## Where it does NOT help — the trap (adversarial flag)
- **Do NOT use EML to fix the Rust transcendental bit-exactness.** Tempting framing: "all elementary functions
  reduce to one operator → nail exp+ln bit-exact once, compose everything." **Reality: counterproductive.**
  Each EML node adds exp+ln+subtract, so an eml-tree for (say) `entropy` has FAR MORE float ops than the direct
  form → a bigger cross-ISA divergence surface, and the paper itself reports overflow/NaN from composed exps.
  The 4 stay-JS transcendentals (entropy/kl/crossEntropy/softmax) get HARDER under EML, not easier. Keep the
  direct kernels; this is a unifying *idea*, not a numerical-stability tool.

## Verdict + parked experiment
Genuinely useful for **formula-foundry SR (shallow laws)** + a real **structural bridge to the energy
calibration/corner machinery** — worth keeping. NOT a math-kernel/bit-exactness tool. NOT a YURI-7B training
method (it's symbolic regression over elementary functions, a different problem than fine-tuning an LM).
- **PARKED probe (cheap, zero-GPU, post-planning):** implement `eml(x,y)` + the `S→1|eml(S,S)` tree in
  formula-foundry; try Adam recovery of a KNOWN YURI formula (e.g. `confidenceDecay` or a single energy term)
  at depth ≤4; check if the simplex-hardening reuses the existing corner-law code. If recovery works at depth ≤4,
  it's a new SR primitive for YURI; if not, it stays a reference.

Source: arXiv 2603.21852v2 (abstract + HTML body verified live). Captured because the owner flagged it + the
energy-structure resonance is real; promoted to a parked experiment, not an active build item.
