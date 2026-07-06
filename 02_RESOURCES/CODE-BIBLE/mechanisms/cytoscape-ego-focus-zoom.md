# Mechanism Card — cytoscape-ego-focus-zoom

> 1-hop ego-subgraph selection + fit-and-tween camera focus. Click an organ, frame its neighborhood, reveal its micro-IO.

| field | value |
|---|---|
| **slug** | `cytoscape-ego-focus-zoom` |
| **source** | cytoscape/cytoscape.js @ `master` |
| **files** | `src/collection/traversing.mjs` · `src/core/viewport.mjs` · `src/core/animation/step.mjs` · `src/core/animation/ease.mjs` |
| **license** | MIT (permissive) — safe to study + reimplement |
| **YURI use** | INSPECT MODE: click organ → tween camera to frame it → reveal 1-hop ego (neighbors + micro-IO) |

## The two primitives (decoupled on purpose)

### A. 1-hop ego set — `neighborhood` / `closedNeighborhood`
Don't BFS for one hop. Just walk each seed's incident edges and grab the far endpoint plus the edge.

```js
// clean-room sketch — Map-keyed dedup, not cytoscape's internal id-set
function closedEgo(graph, seedIds) {
  const seeds = new Set(seedIds);
  const out = new Map();                 // id -> element, dedup for free
  for (const nid of seeds) {
    out.set(nid, graph.node(nid));       // closed = include the seed itself
    for (const e of graph.incidentEdges(nid)) {
      const other = e.source === nid ? e.target : e.source;
      if (other != null && other !== nid) out.set(other, graph.node(other)); // self-loop guard
      out.set(e.id, e);                  // the connecting edge = the micro-IO
    }
  }
  return [...out.values()];
}
```

- **open** neighborhood = neighbors + edges, seed excluded. **closed** = `neighborhood().add(self)`.
- Self-loop guard: skip the far endpoint when it equals the seed (cytoscape checks `otherNode.length > 0`; cytoscape's `otherNode = node === src ? tgt : src`).
- Dedup is structural (collection/Map id-set), never a manual `includes()` scan.
- Append a `.filter(selector)` to scope: only `:visible`, only edges of a kind, etc.

### B. Frame-the-set camera — `getFitViewport` math + per-frame tween

**Target (single fit from the ego bbox):**
```js
function fitViewport(bb, w, h, pad, zMin, zMax) {
  let zoom = Math.min((w - 2*pad) / bb.w, (h - 2*pad) / bb.h); // tighter axis wins
  zoom = Math.max(zMin, Math.min(zMax, zoom));                 // crop to zoom range
  return {
    zoom,
    pan: {                                                     // center the bbox midpoint
      x: (w - zoom * (bb.x1 + bb.x2)) / 2,
      y: (h - zoom * (bb.y1 + bb.y2)) / 2,
    },
  };
}
```

**Tween (per requestAnimationFrame frame):**
```js
function tickCamera(cam, t) {
  let p = cam.dur === 0 ? 1 : (t - cam.t0) / cam.dur;
  p = p < 0 ? 0 : p > 1 ? 1 : p;                  // clamp01
  const k = easeOutCubic(p);                       // easing applied to PROGRESS
  cam.pan.x = lerp(cam.startPan.x, cam.endPan.x, k);
  cam.pan.y = lerp(cam.startPan.y, cam.endPan.y, k);
  cam.zoom  = clamp(lerp(cam.startZoom, cam.endZoom, k), cam.zMin, cam.zMax); // re-clamp zoom
  return p < 1;                                    // keep animating until p hits 1
}
const lerp = (a, b, p) => (p === 1 || a === b) ? b : a + (b - a) * p; // short-circuit endpoints
const easeOutCubic = p => 1 - Math.pow(1 - p, 3);
```

## Math (load-bearing)
```
zoom = clamp( min((w−2·pad)/bb_w, (h−2·pad)/bb_h), zoom_min, zoom_max )
pan_x = (w − zoom·(bb_x1 + bb_x2)) / 2
pan_y = (h − zoom·(bb_y1 + bb_y2)) / 2
p     = clamp01((t − t0)/Δt)
v(p)  = (p==1 ‖ a==b) ? b : ease(a, b, p)   // independently for pan_x, pan_y, zoom
```

## Why it's good
- **Fit = one min().** Pick the axis that constrains first; the whole box is guaranteed inside the padded viewport. No iterative zoom-to-fit loop.
- **Pan centers the box, not a node.** Uses `(x1+x2)` / `(y1+y2)` midpoint, so the ego reads as a framed cluster, not an off-center blob.
- **Tween eases progress, lerps state.** Easing curves `p`, then linear-interpolates each channel — pan and zoom land together. Endpoint short-circuit (`p===1 || a===b`) kills float drift and skips no-op channels.
- **Zoom re-clamped every frame**, so an aggressive easing overshoot can't push past min/max.
- **Traversal and camera are independent.** The ego set feeds the reveal highlight AND supplies the bbox for the camera — same primitive serves click-focus, search-result framing, keyboard nav.

## YURI wiring (INSPECT MODE)
1. On organ click → `closedEgo(circuitryGraph, [organId])` over `yuri-circuitry-graph.json`.
2. Highlight the ego: light neighbors + their connecting edges (the micro-IO); dim everything else.
3. `bb = boundingBox(ego)` → `fitViewport(bb, canvasW, canvasH, padding, zMin, zMax)`.
4. Kick a RAF tween from current `{pan, zoom}` to the fit target; `easeOutCubic`, ~400ms.
5. Same path reused for search-hit framing and "what touches this dark term" without re-deriving either half.

## License note
MIT — verbatim reuse permitted, but this card stays mechanism-only (Map dedup, plain bbox, RAF loop) so it ports to any renderer (canvas / SVG / WebGL) without cytoscape's collection abstraction. © 2016-2026 The Cytoscape Consortium.

## Evidence actually read
- `viewport.mjs` L276 `zoom = Math.min( (w - 2 * padding) / bb.w, (h - 2 * padding) / bb.h );`
- `viewport.mjs` L283-285 pan `x: (w - zoom * ( bb.x1 + bb.x2 )) / 2`
- `traversing.mjs` L155 `let otherNode = node === src ? tgt : src;` · L172 `closedNeighborhood: ... this.neighborhood().add( this )`
- `step.mjs` L114 `_p.zoom = bound( _p.minZoom, ease( startZoom, endZoom, percent, easing ), _p.maxZoom );`
- `ease.mjs` L4-9 `if( percent === 1 ) return end; if( start === end ) return end;`