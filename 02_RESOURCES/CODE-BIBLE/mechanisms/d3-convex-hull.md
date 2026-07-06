# Mechanism Card — d3-convex-hull

**Slug:** `d3-convex-hull`
**Source:** d3/d3-polygon · `src/hull.js` + `src/cross.js` · branch `main`
**License:** ISC (`Copyright 2010-2021 Mike Bostock`) — **permissive**, safe to study + reimplement.
**Mechanism class:** computational geometry / convex hull

---

## Mechanism
**Andrew's monotone-chain convex hull.** Sort the point set lexicographically by (x, y), then sweep left-to-right twice — once for the upper boundary, once for the lower — maintaining a stack and popping any vertex that does not make a strict right turn, judged by a 2D cross-product orientation test. Concatenate the two chains into a closed hull polygon. O(n log n), dominated entirely by the sort; the sweeps are linear.

## Why it's excellent
- **Single orientation primitive.** Every decision reduces to one branch-free cross-product sign. No trig, no division, no floating-point angle comparisons.
- **The duality trick.** d3 does *not* write a separate lower-hull routine. It runs the **upper**-hull function a second time on a y-flipped copy (`[x, -y]`) — flipping y maps the lower boundary onto an upper boundary, so one tested loop serves both chains. Less code, fewer bugs, identical orientation logic.
- **Index-carrying tuples.** Each working point is `[x, y, originalIndex]`, so after the sort scrambles order, the returned hull still references the caller's actual point objects.
- **Robust endpoints.** Explicit `skipLeft` / `skipRight` dedup of the shared corner vertices when stitching chains; `< 3 points → null` guard.

## Core algorithm
1. Wrap each point as `[x, y, i]` (carry original index).
2. Sort lexicographically: `by x, then y`.  ← the only O(n log n) step.
3. **Upper chain** — left-to-right sweep with a stack seeded by the first two points. For each next point, pop while the last turn is not a strict right turn (`cross(prev2, prev1, next) <= 0`), then push.
4. **Lower chain** — same routine on `[x, -y]` (y-flipped). Duality: `upperHull({x,-y}) == lowerHull({x,y})`.
5. Stitch: upper chain right-to-left, then lower chain left-to-right, mapping indices back to original points.
6. Drop duplicated shared endpoints (`skipLeft`/`skipRight`).

## Formula
```
cross(a, b, c) = (b.x - a.x)*(c.y - a.y) - (b.y - a.y)*(c.x - a.x)
   > 0 : counter-clockwise (left turn)
   < 0 : clockwise (right turn)
   = 0 : collinear

pop while:  cross(stack[-2], stack[-1], next) <= 0     // keep strict right turns; collinear dropped
lower via:  upperHull({x, -y}) == lowerHull({x, y})
sort key:   (x, y) lexicographic       complexity: O(n log n)
```

## Clean-room sketch (my form, not the source)
```js
// orientation: >0 left turn, <0 right turn, 0 collinear
const cross = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

// one monotone half-chain; flip=false -> upper, flip=true -> lower
function halfChain(pts, flip) {
  const stack = [];
  for (const p of pts) {
    const q = flip ? [p[0], -p[1], p[2]] : p;
    while (stack.length >= 2 &&
           cross(stack[stack.length - 2], stack[stack.length - 1], q) <= 0) {
      stack.pop();
    }
    stack.push(q);
  }
  return stack;
}

function convexHull(points) {
  if (points.length < 3) return null;
  const pts = points
    .map((p, i) => [+p[0], +p[1], i])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const upper = halfChain(pts, false);
  const lower = halfChain(pts, true).map(p => [p[0], -p[1], p[2]]);
  // drop the duplicated shared corners, restitch, map back to original points
  const ring = [...upper, ...lower.slice(1, -1).reverse()];
  return ring.map(p => points[p[2]]);
}
```
*Reconstructed from the algorithm; d3 packs the lower chain via an in-place y-flip reuse of the upper routine rather than this explicit loop.*

## YURI application — spectral atlas district coastlines
Each layer of the circuitry graph is a node cloud. Pipeline:
1. **Hull** the layer's node positions → guaranteed-simple closed polygon, deterministic O(n log n).
2. **Expand** the hull outward by a margin so the boundary clears every node.
3. **Smooth** via closed Catmull-Rom spline using the hull vertices as control points → organic district coastline.

The carried original index lets the smoothed coastline anchor back to real layer nodes for labels. The `cross` primitive is reusable across the layout engine for any left/right/collinear test (winding, edge-crossing).

## Provenance
- `src/hull.js` — `while (size > 1 && cross(points[indexes[size-2]], points[indexes[size-1]], points[i]) <= 0) --size;`
- `src/cross.js` — `return (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);`
- Lower-chain duality — `flippedPoints[i] = [sortedPoints[i][0], -sortedPoints[i][1]];`
- LICENSE — ISC, permissive (verbatim "Permission to use, copy, modify, and/or distribute...").

**Verified read:** pulled raw from `raw.githubusercontent.com/d3/d3-polygon/main/`; quoted identifiers `computeUpperHullIndexes`, `lexicographicOrder`, `flippedPoints`, and the literal `cross` body above.