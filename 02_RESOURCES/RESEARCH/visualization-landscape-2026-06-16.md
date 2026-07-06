# Visualization Landscape for YURI's Math & Quantum Layer — 2026-06-16

> Survey commissioned by Marcel after building the synthetic 3D implied-volatility surface viewer (`demos/vol-surface.html`). Question: beyond vol surfaces, what visualization techniques exist that are VIABLE for YURI's math/quantum domains — before any wiring.
> Method: 12 parallel Sonnet research agents, each owning one visualization family, each doing live online research with cited sources.
> EVIDENCE STATUS: agent-sourced from online research = **advisory_only**. URLs and version/perf numbers are not yet locally verified (not click-through-checked). Treat as a high-quality leads map, not proven fact, until we evaluate a given tool hands-on.

---

## The map, organized by YURI domain (what we'd actually SHOW)

### 1. Energy gate — ΔU work-dynamics (the richest target)
The energy gate emits a scalar ΔU per claim/action transition (421k+ firings). It has the most natural depictions of anything in YURI:
- **ΔU surface (3D heightfield)** — x=claim-category, y=session-time, z=ΔU. *Reuses our existing vol-surface viewer almost verbatim.* three.js.
- **ΔU isosurface / volume render** — the ΔU=const "energy shell" in parameter space; ray-cast volume with a transfer function so the high-energy core glows. VTK.js / Plotly isosurface / three.js MarchingCubes.
- **Ridgeline (joyplot)** — one ΔU distribution ridge per session; regime shifts in the energy landscape pop instantly.
- **Quantile dotplot** — ΔU distribution as 20-50 countable dots; tail mass (catastrophic events) becomes legible.
- **ThemeRiver / streamgraph** — ΔU signal volume over time.
- **GPGPU particle field driven by ΔU** — high energy = turbulent swarm, calm = drift. The "alive" depiction.

### 2. Quantum-hypothesis simulator (a ready-made physics vocabulary)
The quantum world already solved "how do you draw a Hilbert-space state." Borrow it wholesale:
- **Q-sphere** — the full hypothesis superposition as a constellation: each hypothesis a dot, SIZE=amplitude/weight, COLOR=accumulated phase (order history). Collapse = converge to one bright dot. (Qiskit `plot_state_qsphere`.)
- **Wigner function** — THE killer for order-effects: negative phase-space lobes ARE destructive interference. Evidence A-then-B vs B-then-A produce visibly different interference maps. (QuTiP `wigner()`.)
- **Hinton diagram** — commutator / coupling matrix: square SIZE=|element|, COLOR=sign. Commuting pairs ≈ 0, order-dependent pairs = big squares.
- **State-city** — 3D bar cityscape of the density matrix; off-diagonal towers = coupled evidence channels.
- **Circuit diagram** — render an evidence-update sequence as gates on wires; makes order-dependence legible to non-physicists.

### 3. Circuitry graph + GitNexus call-graph (these are graphs)
- **Hierarchical Edge Bundling (D3)** — the slam-dunk for the ~118-node circuitry graph: hierarchy + bundled cross-edges, readable not hairball. Single HTML file.
- **Reorderable adjacency matrix (D3 + reorder.js)** — community structure compresses into visible blocks in <2s of reordering; great pre-refactor coupling read.
- **Sigma.js v4 + Graphology** — fuse circuitry + GitNexus symbols into one interactive WebGL canvas, community-colored (BloodHound uses this exact stack for attack graphs). ~10k-50k nodes.
- **cosmos.gl / Cosmograph (GPU)** — 1M+ nodes on GPU; future scale when the symbol graph grows.
- **Chord diagram** — inter-lane token/event flow: lanes on a ring, arc width = volume.

### 4. Alpha factor library
- **Clustered heatmap + dendrogram (seaborn clustermap)** — factor correlations auto-cluster into block-diagonal coupled modes. One call.
- **3D correlation surface** — lift the NxN correlation matrix into a rotatable surface (ECharts-GL surface3D / Plotly). Same idiom works for the quantum coupling matrix H.
- **Embedding atlas** — UMAP/t-SNE project the factor space; Nomic Atlas (cloud) or regl-scatterplot (20M points, GPU, in-browser).
- **Parallel coordinates / SPLOM** — 60-factor multi-metric structure; brush any axis to filter.
- **Radar / star plot** — per-strategy factor-exposure glyph.

### 5. Prediction ledger + decision-sim (uncertainty — show it honestly)
- **Calibration / reliability diagram** — the PRIMARY tool: predicted-prob vs observed-freq; deviation from diagonal = the overconfidence the energy gate already penalizes.
- **Quantile dotplot + fan/forecast cone** — distribution shape + track record together (the Kay/Hullman empirical winner for non-experts).
- **HOPs (hypothetical outcome plots)** — animated draws; the visual system counts frequency. Visceral for CVaR.
- **Raincloud / violin** — compare CVaR distributions across decision branches.
- **CVaR risk cone** — stacked tail bands on a trajectory.

### 6. Lane telemetry / token / live operator cockpit
- **uPlot + LTTB downsampling** — sub-ms redraws, 60fps; the only realistic high-frequency path for the 421k-event ΔU trace (LTTB preserves the spikes exactly).
- **Horizon charts** — 20+ lane traces stacked in the same vertical space without overlap.
- **FINOS Perspective** — one streaming Arrow/WebSocket feed → grid + heatmap + candlestick + pivot, hot-swappable. The "Grafana panel" answer with no backend query layer.
- **Heatmap-over-time** — x=time, y=lane/model, color=ΔU or tokens/min; anomalies pop.
- **Sparkline small-multiples** — 30 lanes at a glance, click to drill.

### 7. Flow / state / memory pipeline
- **Sankey / alluvial (d3-sankey)** — work volume flowing through lanes (entry → energy gate → dispatch → lane sinks); animated links make routing visceral.
- **State-transition graph (XState / Stately)** — the energy gate and 5-state thought-router ARE state machines; render them live and debuggable, fire events in-browser.
- **DAG layout (elkjs + react-flow)** — memory store claim→fold→canonical chain; capability dependency DAG.
- **Sunburst / treemap / circle packing** — authority hierarchy, token-budget allocation, capability domains sized by usage.
- **Bookmap-style density map** — repurpose order-book depth heatmap for canonical memory: x=time, y=claim-key, color=confidence×recency. "Bookmap for memory."

### 8. The "alive" layer (Marcel's presence axis — data-driven, not decoration)
- **GPGPU particles + live uniforms** — millions of particles whose velocity field is reshaped each frame by ΔU/telemetry. Gate trips → swarm turbulent. (three.js GPUComputationRenderer / R3F.)
- **FBM domain-warp background + bloom spike on events** — breathes at idle, surges (warp + bloom) when the gate fires. Two uniforms, huge "system is alive" payoff. (`<shaderMaterial>` + @react-three/postprocessing.)
- **Instanced glyphs** — one glyph per factor; size=signal, rotation=bias, color=regime.

---

## Strongest convergences (multiple agents pointed here)
1. **three.js / react-three-fiber is the spine** — we already own it (`three@0.173` + R3F@9 + Vite), GPU ceiling effectively unlimited. First choice for anything 3D/spatial/immersive. The vol-surface viewer is the first of a family.
2. **The energy ΔU has ~6 ready depictions** — surface, isosurface, ridgeline, dotplot, river, particle field. It's the single most visualizable object we have.
3. **The quantum sim has a literally pre-built vocabulary** — Q-sphere, Hinton, Wigner, state-city, circuit. We don't invent; we map hypothesis weights → amplitudes and reuse 20 years of quantum-viz.
4. **Graphs want HEB now, GPU later** — Hierarchical Edge Bundling for the 118-node circuitry graph today (cheap, single file); Sigma/cosmos.gl when the fused symbol graph scales.

## Default build stack (from the library-landscape agent)
- **R3F first** for any 3D/spatial/immersive (own it, unlimited GPU ceiling).
- **visx or D3** for React-native 2D charts needing full control (HEB, sankey, chord, adjacency, calibration).
- **uPlot** (via useRef) for dense time-series/telemetry.
- **ECharts (+ECharts-GL)** for general dashboard charts at scale without custom code.
- **Sigma.js** default for graphs; **cosmos.gl / Cosmograph** at 100k+ nodes.
- **FINOS Perspective** for streaming analytical grids.
- **regl-scatterplot** for extreme-scale scatter (20M pts).
- Don't bother (for our stack): Vega-Lite (painful React fit), VTK.js (overkill unless true volume rendering), Highcharts (commercial license).

## Frontier / "playable math layer" (the next-gen kicker)
- **Mosaic × DuckDB-WASM** — cross-filter the energy trace + prediction ledger + capability registry simultaneously on 10M+ rows, in-browser, instant.
- **Explorable-explanation sliders (Bret Victor / Nicky Case)** — drag the energy β-weights / sim parameters and watch CVaR scores + calibration update live. The math becomes auditable, not just observable.
- **cosmos.gl on WebGPU** — the circuitry + GitNexus graph as a 1M-node GPU force graph you grab/drag/query. The architecture made physical.
- **WebGPU compute-shader particles** — ΔU field + order-effects as a live particle simulation.
- **marimo + anywidget** — reactive Python notebook for calibration experiments (tune weights → dependent cells re-run).
- **Observable Framework** — markdown-native reactive static dashboards (self-updating YURI observatory).

## Honest constraints (adversarial note)
- Several gold-standard tools are **Python-first** and NOT our JS/three stack: Qiskit, QuTiP (quantum); ArviZ, seaborn (stats). Two paths per technique: (a) **reimplement the depiction in JS/three** (full control, our stack, more work) or (b) **render server-side to image/embed** (fast, less interactive). The pure-JS winners that drop straight into our stack with zero impedance: three.js/R3F, D3, uPlot, ECharts(-GL), Plotly.js, regl-scatterplot, Sigma.js, FINOS Perspective.
- Frontier perf/version claims (WebGPU baseline 2026, three.js r171, "1M nodes," "20M points") are agent-sourced and **advisory** until benchmarked on our hardware.
- A depiction being beautiful ≠ being honest. The uncertainty-viz literature (Padilla/Kay/Hullman) exists because naive charts (bar charts, smooth curves) hide tail risk. For the prediction ledger and CVaR, prefer the empirically-validated honest forms (calibration diagram, quantile dotplot) over the pretty ones.

## Next moves (no wiring — still survey/prototype phase)
1. Pick 1-2 to mock up as standalone demos (like the vol surface, no live data): strongest candidates by wow÷effort —
   - **Energy ΔU surface** (near-free — clone the vol viewer, swap the model).
   - **Quantum Q-sphere / Wigner** (the most novel-looking; maps directly to the hypothesis tracker).
   - **Circuitry Hierarchical Edge Bundling** (shows YURI's own wiring; single D3 file).
2. Or go straight for the "playable" frontier demo (explorable sliders driving a live sim chart).

## Source index (agent-sourced, advisory)
Quant/market: menthorq.com/guide/3d-volatility-surface · echarts.apache.org (ECharts-GL) · tradingview lightweight-charts · github.com/Azhagesan-dev/OrderFlowMap
Quantum: quantum.cloud.ibm.com/docs/en/guides/plot-quantum-states · qutip.readthedocs.io/en/latest/guide/guide-visualization.html · arxiv.org/pdf/2412.04705 (QuTiP 5)
Graph: observablehq.com/@d3/hierarchical-edge-bundling · v4.sigmajs.org · cosmograph.app · github.com/vasturiano/react-force-graph
High-dim: docs.nomic.ai/atlas · github.com/flekschas/regl-scatterplot · plotly.com/python/parallel-coordinates-plot
Uncertainty: space.ucmerced.edu/.../Uncertainty_Visualization_Padilla_Kay_Hullman_2022.pdf · clauswilke.com/dataviz/visualizing-uncertainty.html · python.arviz.org
Volumetric: threejs.org/examples/webgl_marchingcubes.html · plotly.com/javascript/3d-isosurface-plots · kitware.github.io/vtk-js
Telemetry: leeoniya.github.io/uPlot · github.com/finos/perspective · siftstack.com/mission-critical/lttb-downsampling
Flow/state: observablehq.com/@d3/sankey · stately.ai/registry/editor · echarts.apache.org (themeRiver)
Shader: tympanus.net/codrops (GPGPU particles) · blog.maximeheckel.com (raymarching/shaders) · react-postprocessing.docs.pmnd.rs
Matrix: seaborn.pydata.org/generated/seaborn.clustermap.html · matplotlib hinton_demo · arxiv.org/pdf/2506.19821 (seriation)
Library landscape: deck.gl/docs/developer-guide/performance · blog.logrocket.com/best-react-chart-libraries-2026 · v4.sigmajs.org
Frontier: openjsf.org/blog/introducing-cosmos-gl · idl.uw.edu/mosaic · worrydream.com/ExplorableExplanations · marimo.io/features · observablehq.com/blog (Framework)
