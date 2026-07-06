---
name: astronomy-astrophysics-channel-2026-06-08
description: Astronomy / astrophysics as a FIRST-CLASS deterministic candidate-generator math channel for the Formula Foundry (Marcel: astronomy is a future domain for astrophysics). Real falsifiable formulas. Domain-blind — same proof-gate bar as information-theory.
metadata: { node_type: research, date: 2026-06-08, status: candidate-generators, tier: high }
tags: formula-foundry, astronomy, astrophysics, candidate-channels, deterministic, domain-blind
---

# Astronomy / Astrophysics — Foundry Candidate Channel

> FRAMING: astronomy is a FIRST-CLASS fundamental domain, gated identically to information-theory — deterministic +
> embedding-free + falsifiable, and promotes only by binding a real math-kernel symbol + a green worked example
> through math-proof-gate. No domain privilege. See [[all-domains-first-class-domain-blind-gate]]. (The Gemma lane
> returned empty-parsed; authored natively — standard astrophysics, verifiable by the worked examples below.)

## `astronomy.kepler-third-law` — Kepler's harmonic law
- **Formula:** T² = (4π²/GM)·a³ ; for the Sun in years+AU: T² = a³.
- **In:** a = semi-major axis (AU or m); M = central mass (kg, if SI). **Out:** T = orbital period (yr or s).
- **Deterministic:** closed-form power law, O(1), no data/RNG. **Falsifiable:** a=1 AU → T=1.000 yr; a=4 AU → T=8.000 yr (not 4); a=9.537 AU (Saturn) → T≈29.46 yr. An impl returning T=a for a=4 is wrong.
- **YURI use:** the canonical resonance/period↔scale operator — given a "size" feature, emit its harmonic period (a 3/2-power scaling law, sibling of the music harmonic ratios + yuri-phi cadence).

## `astronomy.newton-gravitation` — universal gravitation
- **Formula:** F = G·m₁·m₂ / r² (G = 6.674e-11). **In:** m₁,m₂ (kg), r (m). **Out:** F (N).
- **Deterministic.** **Falsifiable:** m₁=m₂=1kg, r=1m → F=6.674e-11 N; doubling r quarters F (inverse-square). An impl with inverse-linear falloff fails.
- **YURI use:** the inverse-square interaction kernel — attraction/affinity between two masses/weights as 1/r²; a principled distance-decay operator (contrast hazard-decay's exponential).

## `astronomy.orbital-escape-velocity` — orbital + escape velocity
- **Formula:** v_orb = √(GM/r) ; v_esc = √(2GM/r) = √2·v_orb. **In:** M (kg), r (m). **Out:** v (m/s).
- **Falsifiable:** Earth surface (M=5.972e24, r=6.371e6) → v_esc≈11.19 km/s, v_orb≈7.91 km/s; v_esc/v_orb = √2 ≈ 1.4142 exactly. An impl where that ratio ≠ √2 is wrong.
- **YURI use:** a threshold operator — the "escape" boundary of a potential well (√2 above the circular state); maps to a confidence/energy escape threshold.

## `astronomy.hubble-law` — cosmic recession
- **Formula:** v = H₀·d (H₀ ≈ 70 km/s/Mpc). **In:** d = distance (Mpc). **Out:** v = recession velocity (km/s).
- **Deterministic linear.** **Falsifiable:** d=100 Mpc → v=7000 km/s; doubling d doubles v. **YURI use:** a pure linear-scaling reference operator (the simplest proportional law).

## `astronomy.pogson-magnitude` — stellar magnitude (log flux ratio)
- **Formula:** m₁ − m₂ = −2.5·log₁₀(F₁/F₂). **In:** flux ratio F₁/F₂. **Out:** magnitude difference (dimensionless).
- **Falsifiable:** F₁/F₂ = 100 → Δm = −5.000 (a factor-100 in flux is exactly 5 magnitudes); F₁/F₂=1 → Δm=0. **YURI use:** a log-ratio compression operator (bridges to information-theory's log measures + the Tenney-height music consonance — same log-ratio mechanism).

## `astronomy.wien-displacement` — blackbody peak
- **Formula:** λ_max = b/T (b = 2.898e-3 m·K). **In:** T (K). **Out:** λ_max (m).
- **Falsifiable:** T=5778 K (Sun) → λ_max≈501 nm (visible green); T=2·5778 → λ_max halves. **YURI use:** an inverse-scaling spectral operator (peak ∝ 1/T).

## `astronomy.schwarzschild-radius` — event horizon
- **Formula:** r_s = 2GM/c². **In:** M (kg). **Out:** r_s (m).
- **Falsifiable:** M = 1 M_sun (1.989e30) → r_s ≈ 2.95 km; linear in M. **YURI use:** a critical-radius / collapse-threshold operator (a hard boundary scaling linearly with mass).

## `astronomy.titius-bode` — orbital spacing heuristic
- **Formula:** a_n = 0.4 + 0.3·2ⁿ (AU), n = −∞,0,1,2,… **In:** index n. **Out:** predicted semi-major axis (AU).
- **Falsifiable (and honestly imperfect — a HEURISTIC):** n=1 → 1.0 AU (Earth ✓); n=2 → 1.6 AU (Mars ~1.52, close); n=3 → 2.8 AU (asteroid belt ✓); FAILS for Neptune. Promote ONLY with the failure stated. **YURI use:** a geometric-spacing generator (even log-spacing of N slots, sibling of the equal-temperament + Euclidean-rhythm spacing operators) — useful, never asserted as law.

## Cross-domain bridges
- log-flux magnitude (Pogson) ≡ log-ratio mechanism shared with **information-theory** (entropy/KL logs) + **music** (Tenney-height log consonance) → source: astronomy · target: info-theory/music · mechanism: log-of-ratio · confidence: high.
- inverse-square gravitation ↔ field falloff shared with **magnetism** (dipole field) → mechanism: 1/r^k radial law.
- Kepler T²∝a³ harmonic scaling ↔ **music** harmonic series + **yuri-phi** cadence → mechanism: power-law resonance/spacing.

## Discipline
Every formula above is a DETERMINISTIC candidate-generator operator with a falsifiable worked example. It enters
the Foundry at `promotionStatus:research`; it promotes only by binding a real math-kernel symbol + passing a green
worked example through math-proof-gate — the SAME bar as Shannon entropy. Astronomy is first-class, not symbolic.
