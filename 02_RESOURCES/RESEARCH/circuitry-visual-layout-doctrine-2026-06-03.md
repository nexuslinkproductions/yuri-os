# Circuitry Visualization — Layout Doctrine (2026-06-03)

Research note for reworking the YURI circuitry visualization from a linear columnar
layout into a **navigable map** (Google-Maps / wayfinding feel) where every node's
position is *computed from the architecture's connectivity*, not placed on a grid.

## The governing idea: a cartograph, not a diagram

Across the sources the strongest, most-cited frame is the **cartographic / wayfinding
map metaphor** for complex networks: a visualization defines a visual *space*, and the
user navigates it the way they'd wayfind a city — so **node position should encode
structural/functional meaning** (proximity = relatedness, region = subsystem, centre =
importance). "Network cartographs" formalize this: directly encode network characteristics
into node positions and use region/landmark cues to make a dense graph interpretable.

Translated to YURI:

| Map element | YURI mapping |
|---|---|
| **Districts / territories** | the 9 layers — each a region with an organic border + a big low-opacity region label (like a country name on a map) |
| **Downtown / capital (centre)** | the **moat** layers (Energy, Cognition, Memory) — pulled to the map centre, brightest |
| **Suburbs / outskirts** | commodity layers (Skills, Token-Efficiency, Hidden/Meta) — pushed to the rim, dimmer |
| **Cities vs hamlets** | node marker size proportional to degree — hubs are big, leaves are small |
| **Roads** | edges — curved, colour = kind (calls/reads/writes), weight proportional to endpoints' centrality |
| **Interchanges** | high-degree cross-layer nodes (metro-map "interchange station" idea) |
| **Wayfinding / LOD** | zoom controls detail: far out = districts + hub labels only; zoomed in = every landmark labelled |

## Layout algorithm: force-directed (Fruchterman-Reingold), clustered

Force-directed beats hierarchical here: hierarchical (what we had) forces a linear/levelled
read; force-directed lets the **real call-graph topology** settle into an organic shape that
"reveals underlying structure" — connected organs drift adjacent, subsystems self-cluster.
Risk = the "hairball" for big graphs; we counter it with cluster-gravity + district separation
(only 83 nodes, so well within the safe regime).

Two-stage deterministic FR (seeded PRNG -> reproducible):
1. **Layer macro-layout** — treat the 9 layers as super-nodes; spring weight = count of edges
   between the two layers; moat layers get centre-gravity. Settles the *districts* spatially so
   strongly-coupled subsystems sit adjacent (the energy/cognition/memory core in the middle).
2. **Node micro-layout** — per node: Coulomb repulsion `k^2/d` all-pairs (distance-cutoff bounded),
   Hooke attraction `d^2/k` along real edges, gravity toward its own layer centre (district
   cohesion), collision radius, cooling schedule + global centring. Cross-layer edges tug nodes to
   district borders -> the flow reads at the seams.

Then per layer: convex hull of its nodes -> expand outward -> Catmull-Rom smooth = an organic
"coastline" region. Render order: districts -> roads -> landmarks, with metro-map discipline
(curved monotone roads, minimal visual crossings, uniform-ish landmark spacing via collision).

## Why this satisfies the brief

"Every piece has its specific position perfectly calculated so the flow makes sense" = positions
are the *output of the connectivity*, not an author's grid. Pan/zoom/minimap already exist; the
rework is (a) the computed positions, (b) the district/road/landmark cartography, (c) zoom LOD.

Implemented by `build-circuitry-map.mjs` -> `yuri-circuitry-map.html` (interactive) +
`yuri-circuitry-map.svg` (static snapshot, renders inline on GitHub/mobile).

## Sources
- Cerioli, Vyas, Reeve, Masoodian (2024), *Designing complex network visualisations using the
  wayfinding map metaphor*, Information Visualization (SAGE). https://journals.sagepub.com/doi/10.1177/14738716241270341
- *Network cartographs for interpretable visualizations*, Nature Computational Science (2022). https://www.nature.com/articles/s43588-022-00199-z
- *MetroSets: Visualizing Sets as Metro Maps*, arXiv:2008.09367. https://arxiv.org/pdf/2008.09367
- The Map of Mathematics (interactive territory metaphor). https://themapofmathematics.org/
- Force-directed graph drawing (Fruchterman-Reingold). https://en.wikipedia.org/wiki/Force-directed_graph_drawing
- Automatic Graph Layouts (force-directed vs hierarchical), Cambridge Intelligence. https://cambridge-intelligence.com/blog/automatic-graph-layouts/
