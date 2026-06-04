# Determined-Circuitry Layout Theory — How a Proper Formula/Theory Map Earns Every Node's Spot

> Research authority for the YURI living-circuitry instrument (83 organs / 77 internal edges / 9 layers / 3-layer moat).
> Owner brief: *"a proper DETERMINED circuitry — every last piece has its very own spot, not random."*
> Method: 4-domain canon sweep + an adversarial refute pass on every citation and formula. **All four domains audited `overallTrust=HIGH`; every load-bearing paper confirmed `verified-fetched`; zero fabricated citations.** Findings below carry the audit corrections inline. Captured 2026-06-04; reindexed into the local corpus.
> Companion: the determinism thread here is the same eigenproblem as [math-theory-transfer-catalog](math-theory-transfer-catalog-2026-06-03.md) **Card 4 (Spectral Laplacian/Fiedler, juice 8)** — the layout research and the math heist are one thread.

---

## The one-line answer

**"Every piece has its own earned spot, not random" = the graph Laplacian.** Force-directed layout (Fruchterman-Reingold, d3-force, the phone "atlas") is a *seeded simulation that stops at a random local rest state* — it only *looks* settled. The deterministic alternative solves the **same spring physics to its exact closed-form equilibrium**: the position of every node is the *solved output of an equation over the connectivity*, computed and unique, not simulated and approximate. Three faces of the same matrix `L = D − W` answer the brief:

| Lens | Method | What's determined | Determinism class |
|---|---|---|---|
| **Atlas** (cartograph) | **Spectral layout** (Hall 1970 / Fiedler) — eigenvectors `ψ₂,ψ₃` of `L` as `(x,y)` | every coord = a solved function of connectivity | **unique global optimum** (up to rotation/sign) |
| **Floorplan** (chip-die) | **GORDIAN quadratic placement** — convex QP with 9-region center-of-gravity constraints | every node at its convex-optimal equilibrium inside its layer | **unique global optimum** (strictly convex) |
| **Hierarchy** | **Sugiyama** — the 9 layers become *fixed* layer constraints; barycenter + Brandes-Köpf for in-layer x | (layer, order, x) triple per node | layer/x unique-optimum; in-layer order heuristic, certifiable at n=83 |
| **Wires** | **Lee/A\*** maze routing + **left-edge** channel routing + lane offset | each trace = shortest obstacle-free orthogonal path on a fixed grid | **unique shortest path** per wire |
| **Declutter** | **Holten** hierarchical edge bundling (post-placement) | each edge spline = closed-form over the layer path | deterministic |

Force / t-SNE / UMAP / SOM / VOSviewer-MDS are all **seed-dependent** — explicitly disqualified by the "not random" requirement (the Nature-cartographs authors themselves state t-SNE/UMAP are not strictly deterministic). The Laplacian family is the only one that is *structure-derived and repeatable to numerical precision*.

---

## Domain 1 — Orthogonal Graph Drawing (the literal axis-aligned circuit look)

**Topology-Shape-Metrics (TSM)** — Tamassia 1987, codified in Di Battista-Eades-Tamassia-Tollis 1999. A 3-phase pipeline, each phase fixing the input to the next:
1. **Topology (planarize)** — fix a planar embedding; replace each crossing with a dummy degree-4 vertex.
2. **Shape (orthogonalize)** — compute the **orthogonal representation** H (per-face angles ∈ {90,180,270,360}° + per-edge bend list). **Bend minimization for a fixed embedding = min-cost flow** (the field's strongest formal guarantee):
   - Network `N(P)`: nodes = graph vertices ∪ one per face. Arc `(v,f)` lower 1 / cap 4 / cost 0 carries the 90°-units of angle v subtends in f; arc `(f,g)` lower 0 / cap ∞ / **cost 1** carries bends along the shared edge. Each vertex is a **source of 4 units** (360°); internal face f a **sink of `2·deg(f)−4`**; outer face sink `2·deg(f)+4`. **Objective = Σ cost·flow = total bend count.** Integral because all bounds are integral.
3. **Metrics (compact)** — normalize to rectangular faces, then two independent per-axis min-cost flows assign integer coordinates minimizing area/edge-length.

**Determinism verdict — PARTIAL, honest:** every node/bend lands on a *rule-derived integer grid coordinate* (fully "not random," bit-reproducible given fixed embedding + solver), and the **minimum bend count is a true unique optimum**. BUT: the optimal *flow* (hence the realizing drawing) is generally **not** unique — ties resolved by the solver's deterministic-arbitrary tie-break; and choosing the best embedding over *all* planar embeddings is **NP-hard** (Garg-Tamassia 2001). Degree-3 is poly; **degree > 4 needs the Kandinsky model** (vertices as boxes, multi-edge sides) whose exact bend-min is **NP-hard** (Bläsius-Brückner-Rutter 2014).
**YURI fit:** the truest PCB look, but an 83-node software graph has hubs with degree > 4 → Kandinsky → NP-hard, and TSM doesn't natively model the 9-layer/moat clustering. Aspirational aesthetic; not the practical spine alone.
**Confirmed cites:** Tamassia, *On Embedding a Graph in the Grid with the Minimum Number of Bends*, SIAM J. Comput. 16(3):421-444, 1987 (DOI 10.1137/0216030) · Di Battista, Eades, Tamassia, Tollis, *Graph Drawing*, Prentice Hall 1999 (ISBN 0-13-301615-3) · Garg & Tamassia, *On the Computational Complexity of Upward and Rectilinear Planarity Testing*, SIAM J. Comput. 31(2):601-625, 2001 · Garg & Tamassia 1997, *A New Min-Cost Flow Algorithm…*, GD'96 LNCS 1190 (the O(n^{7/4}√log n) bound) · Bläsius, Brückner, Rutter, *Complexity of Higher-Degree Orthogonal Graph Embedding in the Kandinsky Model*, ESA 2014 / arXiv:1405.2300 · Foessmeier & Kaufmann, *Drawing High Degree Graphs with Low Bend Numbers*, GD'95 LNCS 1027 (Kandinsky).

---

## Domain 2 — VLSI Placement & Floorplanning (the silicon-die metaphor)

Splits cleanly on the determinism axis:

**SEEDED-RANDOM (reject for coordinates):** simulated-annealing **floorplanning** — Wong & Liu 1986 (slicing floorplan as a normalized **Polish expression**, length 2n−1; moves M1/M2/M3; accept worse with `P=exp(−ΔC/T)`, cool `T←r·T`), Sequence-Pair (Murata 1996), B*-trees (Chang 2000). Different seed → different valid layout. This is the "organic blob" — keep it **only** for the 9 macro-rectangles if at all (and even there, 9 rectangles are better placed by a fixed rule).

**UNIQUE-OPTIMUM (the answer):** **analytic / quadratic placement.** Minimize total squared wirelength
`Φ(x,y) = ½ Σ_{i,j} w_ij·[(x_i−x_j)² + (y_i−y_j)²] = ½·xᵀQx + bᵀx + c`,
where `Q` is the weighted graph Laplacian and `b` comes from fixed anchors. **Audit correction:** `Q` is positive-**semi**definite (all-ones nullvector); the **solved system matrix** `Q + anchor-diagonal` is **SPD once ≥1 node is pinned** — that's what makes the minimum unique. Set `∇Φ = Qx + b = 0` → solve the linear systems `Qx=−b`, `Qy=−d` (x,y decouple). **Strictly convex → exactly one global minimum, closed-form, zero seed, byte-identical every run.** Physical reading: each weighted edge is a Hooke spring; the placement is the static equilibrium where forces cancel — the *same physics force-layout simulates*, solved exactly. Net model for a k-pin relation: clique weight **`1/(k−1)`** (canonical; `1/k` is the less-standard variant — audit note).

**GORDIAN** (Kleinhans-Sigl-Johannes-Antreich 1991) makes it spread without losing uniqueness: recursively re-solve the convex QP under **linear center-of-gravity constraints** (each region's node-average pinned to that region's center): `min ½xᵀQx + bᵀx s.t. Ax=u`, solved via the KKT saddle system `[[Q,Aᵀ],[A,0]]·[x;λ]=[−b;u]` — **unique global min at every level.** YURI's 9 layers + moat *are* those regions, for free. **Force-directed spreading** (Eisenmann-Johannes 1998) is the deterministic density-gradient alternative. **Min-cut partitioning** (Kernighan-Lin 1970 `g=D_a+D_b−2c_ab`; Fiduccia-Mattheyses 1982 `gain=FS−TE`, O(P)/pass) is deterministic-heuristic — use it to *derive/verify* the 9-layer assignment, not for coordinates.
**Confirmed cites (all verified-fetched):** Wong & Liu, DAC 1986 · Kleinhans et al., *GORDIAN*, IEEE TCAD 10(3):356-365, 1991 (DOI 10.1109/43.67789) · Eisenmann & Johannes, *Generic Global Placement and Floorplanning*, DAC 1998 · Fiduccia & Mattheyses, DAC 1982 · Kernighan & Lin, BSTJ 49(2):291-307, 1970 · Murata et al., Sequence-Pair, IEEE TCAD 15(12), 1996 · Chang et al., *B\*-Trees*, DAC 2000.

---

## Domain 3 — Layered Drawing + Channel/Edge Routing (structured hierarchy + wires)

**Sugiyama framework** (Sugiyama-Tagawa-Toda 1981) — the canonical *structured* (non-force) layout; earns a determined `(layer, in-layer order, x)` triple per node via 4 stages:
1. **Cycle removal** → DAG (greedy FAS; optimal is NP-hard).
2. **Layer assignment** — longest-path (`layer(v)=1+max_pred layer(u)`, O(V+E), **min layer *count* is unique** — audit: the *count* is unique/minimal, the *assignment* is not) · Coffman-Graham (width-cap W, height ≤ `(2−2/W)·OPT`) · **network-simplex** (GraphViz `dot`: `min Σ w(u,v)·(layer(v)−layer(u)) s.t. ≥ minlen`, LP optimum).
3. **Crossing minimization** — optimal (OSCM) is **NP-complete** (Eades-Wormald 1994) → **barycenter** `bary(v)=(1/deg(v))Σ pos(u)` re-sort + sweep, or **median** (proven **3-approximation**). Deterministic-heuristic, no seed.
4. **x-coordinate** — **Brandes-Köpf** (4 alignment passes → median, ≤2 bends/edge, linear time; **use the 2020 Brandes-Walter-Zink erratum** — it fixes two correctness flaws in the 2002 version).

**Wires:** **left-edge channel routing** (Hashimoto-Stevens 1971) packs horizontal segments into the **minimum tracks = channel density** (provable lower bound) when no vertical constraints; doglegs break VCG cycles. **Lee 1961 maze router** (BFS wavefront → backtrace) / **A\*** (`f=g+h`, h=Manhattan, admissible) return the **unique shortest obstacle-free orthogonal path**; lane/offset assignment separates parallel wires. **Octilinear metro-map** (Nöllenburg-Wolff 2011 MIP; MetroSets 2021) snaps edges to 8 directions — global MIP optimum, tractable at n=83 — the optional brand-grade aesthetic.
**Determinism verdict:** the most deterministic-friendly family — layer-count, x-assignment, channel routing, shortest-path all unique-optimum; only in-layer ordering is heuristic, and at n=83 an **exact ILP one-sided OSCM per adjacent layer pair certifies it optimal**, closing the only gap → fully determined, provably-best at every stage.
**Confirmed cites (all verified-fetched):** Sugiyama, Tagawa, Toda, IEEE SMC-11(2):109-125, 1981 · Coffman & Graham, Acta Inf. 1(3), 1972 · Eades & Wormald, Algorithmica 11(4):379-403, 1994 · Gansner, Koutsofios, North, Vo, IEEE TSE 19(3):214-230, 1993 · Brandes & Köpf, GD 2001 LNCS 2265 + **erratum arXiv:2008.01252 (2020)** · Hashimoto & Stevens, DAC 1971 · Lee, IRE Trans. EC-10, 1961 · Nöllenburg & Wolff, IEEE TVCG 17(5), 2011 · MetroSets, IEEE TVCG 27(2), 2021 / arXiv:2008.09367.

---

## Domain 4 — Knowledge / Formula / Theory-Map Cartography (how maps of knowledge are built)

The owner's "theory & formula maps" question. Six families; **exactly one is a true deterministic structural optimum:**

**SPECTRAL LAYOUT (Hall 1970 / Fiedler 1973 / Koren 2005) — the determined spine.** Place nodes to minimize total squared edge length:
`E(x) = xᵀLx = Σ_{(a,b)∈E}(x_a−x_b)²`, `L=D−W`, subject to `‖x‖²=1` (scale) and `1ᵀx=0` (centering, orthogonal to the trivial all-ones eigenvector). **The global minimizer is the Laplacian eigenvectors:** `x = ψ₂` (Fiedler vector, 2nd-smallest eigenvalue) and for 2D `y = ψ₃`. Every coordinate is a *determined function of connectivity* — no seed, repeatable to numerical precision. Only freedom: a global rotation/reflection + per-axis sign flip (both pinnable by a fixed gauge), and a degeneracy only if `λ₂` has multiplicity > 1 (near-symmetric graph; mitigated by the type-weighted edges YURI already specced, or tiny perturbation). Degree-normalized variant: generalized eigenproblem `Lx = λDx`.

**The rest are NOT deterministic** (disqualified as the placement engine, by the "not random" rule): **VOSviewer VOS** (van Eck-Waltman) minimizes a *non-convex* constrained weighted-MDS `E=Σ s_ij‖x_i−x_j‖²` (assoc. strength `s_ij = 2m·c_ij/(w_i·w_j)` — audit: full form carries the `2m` constant, but layout is scale-invariant so the `c_ij/(w_i·w_j)` shorthand is standard) → local minima, seed-sensitive · **Nature network cartographs** (Hutter-Sin-Müller-Menche 2022) use t-SNE/UMAP, authors *explicitly* state not strictly deterministic · **Kohonen SOM** seeded + order-dependent.
**The two that aren't placement engines but are still useful:** **concept maps** (Novak-Cañas) give the *structural grammar* — hierarchical propositions + cross-links + focus question = YURI's 9-layer hierarchy + moat-at-top semantics (placement is human, not algorithmic) · **Holten hierarchical edge bundling** (2006) is *edge routing after placement* — route each adjacency as a cubic B-spline along the layer-tree path, `P_i' = β·P_i + (1−β)·(straight-line)`, β≈0.8 → bundles the 77 edges to kill clutter **without moving any node**.
**Confirmed cites (all verified-fetched, formulas verified line-by-line):** Hall, *An r-dimensional quadratic placement algorithm*, Management Science 17(3):219-229, 1970 · Fiedler, *Algebraic connectivity of graphs*, Czech. Math. J. 23(2):298-305, 1973 · Koren, *Drawing Graphs by Eigenvectors*, Comput. & Math. with Appl. 49(11-12), 2005 · van Eck & Waltman, *VOS* 2006 + VOSviewer Scientometrics 84(2), 2010 + assoc.-strength JASIST 60(8), 2009 · Hutter, Sin, Müller, Menche, *Network cartographs for interpretable visualizations*, Nature Comput. Sci. 2(2):84-89, 2022 · Novak & Cañas, IHMC 2008 · Holten, IEEE TVCG 12(5):741-748, 2006 · Cerioli et al., *wayfinding map metaphor*, Information Visualization 23(4), 2024.

---

## The YURI decision — dual-lens, both deterministic, one shared Laplacian

The two phone lenses survive — but the math under both is now **determined, not force**:

- **ATLAS lens = pure spectral layout.** `(x,y) = (ψ₂, ψ₃)` of the **type-weighted normalized Laplacian** `Lsym = I − D^{−1/2} A D^{−1/2}` over the giant component (Card 4 already specs the type-weights `{calls/flow high … logs low}`). The organic-*looking* cartograph, but every position is the *solved eigenvector*. Pin the 11 topologically-isolated organs on a fixed orbital ring (don't let them pollute the eigenvectors — Card 4's warning). **This replaces the phone's Fruchterman-Reingold force-atlas** — same shape family, now deterministic.
- **FLOORPLAN lens = GORDIAN region-constrained quadratic placement.** The 9 layers (3-moat inner) are the center-of-gravity regions; solve `[[Q,Aᵀ],[A,0]][x;λ]=[−b;u]` for the convex-optimal equilibrium inside each region; route the 77 traces orthogonally (Lee/A\* + left-edge channels + lane offset = exactly what router-kernel K2 builds). The chip-die, every cell at its earned equilibrium.
- **Shared `Q`:** both lenses are the same matrix seen two ways — spectral takes its eigenvectors, GORDIAN solves it under region constraints. **One Laplacian build serves the visual instrument AND the Card-4 architecture second-opinion.** That is the upgrade-propagation thesis in action: one mechanism, many sites.

**The determinism contract (so "earned spot" is literally true + reproducible):** freeze (i) one embedding/edge-weight set, (ii) the solver + tie-break (lexicographic by node id), (iii) the rotation/sign gauge (moat centroid → origin, largest-degree node sign-positive). Then the layout is a **pure deterministic function of `yuri-circuitry-graph.json`** — same input, identical pixels, every run. Document it on the instrument.

**Honest caveat to hold:** "determined" = yes (rule-derived, repeatable, earned-by-structure). "The one cosmic unique position" = no — quadratic/spectral give a *unique optimum of a stated objective*; TSM bends are unique in count but not in realizing flow. For a graph this symmetric that's the strongest guarantee available, and it fully satisfies "not random." Don't oversell it as the single metaphysically-correct placement.

## Impact on the in-flight kernels
- **K3 (force-atlas) → rebuild as spectral.** Fruchterman-Reingold is the blob the brief rejects; swap for `ψ₂,ψ₃` of the type-weighted Laplacian. Deterministic, no seed.
- **K1 (floorplan packer) → keep block-packing, upgrade intra-region placement** from a plain grid toward GORDIAN region-constrained quadratic equilibrium (or barycenter-ordered) so within-block position is earned, not arbitrary.
- **K2 (orthogonal router) → confirmed correct as specced** (Lee/A\* + channels + lanes); the research validates it.
- **Add later:** Holten edge-bundling as the atlas declutter pass; optional ILP-OSCM / octilinear snap for certified-optimal polish.

## Build order (leverage × determinism × no-prereq)
1. **The Laplacian core** — one `buildLaplacian(graph, typeWeights)` → serves spectral-atlas + GORDIAN-floorplan + Card-4 clustering. Highest leverage; pure, read-only.
2. **Spectral atlas** (`ψ₂,ψ₃`, gauge-pinned) — replaces K3.
3. **GORDIAN floorplan** (region-constrained QP) — upgrades K1 intra-block.
4. **Orthogonal routing** (K2) + **edge bundling** — the wires + declutter.
