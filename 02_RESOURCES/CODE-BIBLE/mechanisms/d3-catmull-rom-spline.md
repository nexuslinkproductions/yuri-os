# Mechanism Card — d3-catmull-rom-spline

**Source:** d3/d3-shape · `src/curve/catmullRom.js` (+ `cardinal.js`, `catmullRomClosed.js`) · branch `main`
**License:** ISC (permissive — study + reimplement freely; functionally MIT-equivalent) · © 2010-2022 Mike Bostock
**Verified read:** quoted `Math.sqrt(this._l23_2a = Math.pow(x23 * x23 + y23 * y23, this._alpha))`, the default factory `})(0.5)`, and the closed-ring replay `this.point(this._x3..)/(_x4..)/(_x5..)` — read from raw source, not memory.

## What it is
An **interpolating** cubic spline: the curve passes THROUGH every input point (Bezier control points are *derived*, not supplied). Each interior segment P1→P2 becomes one cubic Bezier; the two control points come from a sliding 4-point window [P0,P1,P2,P3] weighted by **chord lengths raised to alpha**.

- `alpha = 0` → uniform (cusps/loops on uneven spacing — bad)
- `alpha = 0.5` → **centripetal** (d3 default, baked as `custom(0.5)`) — provably no cusps / no self-intersections
- `alpha = 1` → chordal (rounder, looser)

Centripetal is the win: clustered or unevenly-spaced samples (exactly what spectral layouts produce) stay clean instead of looping back on themselves.

## Algorithm
1. Stream points through a 4-point window; emit one Bezier per interior segment.
2. Precompute chord measures per edge: `l_2a = (dx²+dy²)^alpha`, `l_a = √l_2a`. Keep `l01`, `l12`, `l23`.
3. **Left ctrl** (skip if `l01 ≈ 0`): `a = 2·l01_2a + 3·l01_a·l12_a + l12_2a`; `n = 3·l01_a·(l01_a+l12_a)`; `C1 = (P1·a − P0·l12_2a + P2·l01_2a)/n`.
4. **Right ctrl** (skip if `l23 ≈ 0`): `b = 2·l23_2a + 3·l23_a·l12_a + l12_2a`; `m = 3·l23_a·(l23_a+l12_a)`; `C2 = (P2·b + P1·l23_2a − P3·l12_2a)/m`.
5. `bezierCurveTo(C1, C2, P2)`. The `> epsilon` guard degrades to a straight Bezier at duplicate/endpoint nodes instead of dividing by zero.
6. Shift window each step (`l01←l12←l23`, `P0←P1←P2←new`). Short inputs fall back to `moveTo`/`lineTo`.
7. **CLOSED:** stash the first three points (`_x3/_x4/_x5`); at `lineEnd` replay them to feed the window across the seam → C1-continuous ring, no special-cased corner.
8. `alpha→0` short-circuits to **Cardinal**: `C1 = P1 + k·(P2−P0)`, `C2 = P2 + k·(P1−P3)`, `k=(1−tension)/6` — same per-segment Bezier skeleton, tangents from a fixed tension scalar.

## Formula (centripetal, alpha=0.5)
```
l_ij^2a = ((xi−xj)² + (yi−yj)²)^alpha ,  l_ij^a = √(l_ij^2a)
C1 = (P1·(2·l01_2a + 3·l01_a·l12_a + l12_2a) − P0·l12_2a + P2·l01_2a) / (3·l01_a·(l01_a+l12_a))
C2 = (P2·(2·l23_2a + 3·l23_a·l12_a + l12_2a) + P1·l23_2a − P3·l12_2a) / (3·l23_a·(l23_a+l12_a))
segment = cubicBezier(P1, C1, C2, P2)
```

## YURI application
**Spectral ATLAS lens — district coastlines.** Angular-sort (or convex-hull) each cluster's boundary nodes, feed them to the **CLOSED centripetal** spline → a seamless organic ring through every node. Districts read as islands/territories, not jagged polygons; centripetal alpha kills the self-intersections that clustered spectral points would otherwise generate. Same primitive routes **signal-edges** as OPEN curves through 2-3 waypoints for a soft hand-drawn feel without cusp risk. `alpha` is the single art-direction knob (0.5 default; ↓ tighter/straighter, ↑ looser/rounder).

## Clean-room note
Mechanism distilled and re-expressed; no source pasted verbatim. ISC = permissive, so reimplementation is safe with attribution. The epsilon-guard + window-shift structure is retained because it *is* the mechanism, but framing/naming are YURI-native and the closed-ring replay is described as an algorithm step. Attribution to d3/d3-shape (Mike Bostock) retained.