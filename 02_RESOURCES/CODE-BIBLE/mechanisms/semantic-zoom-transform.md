# Mechanism Card — semantic-zoom-transform

> **Source:** d3-zoom (`src/transform.js`, `src/zoom.js`) + d3-interpolate (`src/zoom.js`), branch `main`
> **Author/License:** Mike Bostock — **ISC** (permissive; © 2010–2021). Safe to study + reimplement clean-room.
> **Slug:** `semantic-zoom-transform`

## Mechanism (one line)
A 2D camera is one affine transform `T=(k,x,y)` (`screen = world*k + offset`); programmatic moves tween the *world point under a fixed focal pixel* + a width proxy (Van Wijk smooth-zoom), not the raw `(k,x,y)` — and **semantic zoom** swaps *what renders* by the current `k`.

## The core object
```
T = (k, x, y)            // scale + translate, no rotation/shear
applyX(wx)  = wx*k + x    // world -> screen   (forward)
invertX(sx) = (sx - x)/k  // screen -> world   (inverse)
identity    = (1, 0, 0)   // zoomIdentity
```
`apply` and `invert` are exact inverses — that inverse is the whole trick for "keep the thing under the cursor fixed while scaling."

## Focal-pinned scale (zoom toward cursor)
```
p0 = focal pixel (cursor, or viewport centroid)
p1 = T.invert(p0)        // world point currently under p0
k' = clamp(k_target, scaleExtent)
T' = (k',  p0.x - p1.x*k',  p0.y - p1.y*k')   // p1 now maps back onto p0
```

## Programmatic transition (the camera flythrough)
d3 does **not** lerp `(k,x,y)`. In `schedule()` it interpolates in *invariant space* — the world point under a held focal pixel `p`, plus `w/k` (w = max viewport dim) as a zoom-distance proxy — using the **Van Wijk** interpolant, then **reconstructs** the transform each frame:

```
a = start, b = target, w = max(viewportW, viewportH)
i = interpolateZoom( [a.invert(p), w/a.k], [b.invert(p), w/b.k] )
frame(t):
  if t == 1: T = b                      // snap, kill rounding drift
  else:
    l = i(t); k = w / l[2]
    T = ( k, p.x - l[0]*k, p.y - l[1]*k )
  applyCamera(T)
```

### Van Wijk smooth-zoom (d3-interpolate, ρ=√2)
General case (`d2 = |p1−p0|² ≥ ε`):
```
d1 = √d2
b0 = (w1²−w0²+ρ⁴·d2)/(2·w0·ρ²·d1)
b1 = (w1²−w0²−ρ⁴·d2)/(2·w1·ρ²·d1)
r0 = ln(√(b0²+1)−b0);  r1 = ln(√(b1²+1)−b1)
S  = (r1−r0)/ρ
at t:  s=t·S
  u    = (w0/(ρ²·d1))·(cosh(r0)·tanh(ρ·s+r0) − sinh(r0))
  pt   = (ux0+u·dx, uy0+u·dy)
  w(t) = w0·cosh(r0)/cosh(ρ·s+r0)
duration = S·1000·ρ/√2          // auto, distance-aware
```
Degenerate (pure zoom, `d2<ε`): `S = ln(w1/w0)/ρ`, `w(t)=w0·exp(ρ·t·S)`. This is what makes a deep jump zoom *out* then *in* (an arc through scale-space) instead of sliding linearly — it minimizes perceived velocity.

## Semantic zoom / LOD (layered on top)
The transform never re-lays-out the graph; only render detail keys off `k`:
```
k < K_district  -> draw layer hulls + aggregate counts only      (macro)
k < K_node      -> + node glyphs
k < K_edge      -> + edges
else            -> + every label                                 (focus)
```

## YURI application
- **Shared pan/zoom shell** for the circuitry-graph instrument: camera = one `Transform`; pan mutates `(x,y)`, wheel/pinch mutates `k` via the focal-pinned formula so the organ under the pointer stays put.
- **Macro→focus inspect transition:** clicking a node/district runs the `schedule` tween so the camera *flies* from whole-graph to one focused organ (zoom-out-then-in arc), distance-aware duration — feels like a real camera, not a CSS slide.
- **LOD ladder** (YURI-original thresholds): far = 9-layer district hulls + counts; near = nodes → edges → all labels fade in across `k` thresholds. Macro stays legible, focus stays rich, zero re-layout.

## Evidence actually read
- `src/transform.js`: `applyX: function(x){ return x*this.k + this.x; }` · `invertX: (x-this.x)/this.k` · `export var identity = new Transform(1, 0, 0);`
- `src/zoom.js schedule()`: `i = interpolate(a.invert(p).concat(w/a.k), b.invert(p).concat(w/b.k));` · per-frame `t = new Transform(k, p[0]-l[0]*k, p[1]-l[1]*k);` · `if (t === 1) t = b; // Avoid rounding error on end.`
- `d3-interpolate/src/zoom.js`: `zoomRho(Math.SQRT2, 2, 4)` · `i.duration = S * 1000 * rho / Math.SQRT2;`

## Clean-room note
All snippets above are rewritten from the distilled algorithm, not pasted. The Van Wijk interpolant is a published academic method (van Wijk & Nuij, 2003). ISC permits reimplementation; LOD thresholds are YURI-original.