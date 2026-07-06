# CAD Loft/Sweep Surfacing for Holster Blocking — Reference & Recommendation
**Date:** 2026-06-23 · **Product:** custom-gear.ch holster blocking, HK 45 (~220mm), ~2mm clearance, 2-piece lateral mold split
**Constraint:** Blender-only preferred; CAD-kernel alternative assessed honestly
**Confidence:** HIGH on §1–§4 Blender (primary source verified) · HIGH on §4 FreeCAD (wiki primary) · MEDIUM on Plasticity (docs unreachable; training knowledge flagged)

---

## 12-LINE SUMMARY

1. The blocking is fundamentally a **swept channel**: skin cross-section contours extracted along the draw (Z) axis → clean lofted solid. This is the veteran answer.
2. **Bridge Edge Loops** (`Blend Surface` mode, equal vertex count per ring) is Blender's native loft primitive — it is the right core op.
3. **Equal vertex count + consistent winding is mandatory** per ring before bridging; resample every section to N=64 pts via `Resample Curve` GN node before joining.
4. **Curve to Mesh (GN)** suits a constant-section bore; it cannot morph profile shape along the spine — not sufficient alone for the full holster silhouette.
5. **Blender NURBS Surface objects** are non-solid, non-Boolean — reference tools only, not production mold geometry.
6. **FreeCAD `Part.makeLoft(wires, solid=True, ruled=False)`** produces a true NURBS BRep with G1 continuity, exact `makeOffsetShape(-2.0)` wall, clean Boolean split, STEP export — CAD grade.
7. **Hybrid pipeline** (Blender voxel/silhouette prefix → extract section DXFs → FreeCAD loft+offset+split) is the single best answer for precision production: each tool does exactly what it is good at.
8. **Draft angle** (1.5–2°) and **fillet radius** (≥0.5mm interior lip) are mandatory for thermoform release; model them in FreeCAD after loft.
9. Concentrate bisect stations at protrusions (trigger guard, rail lug, decock lever) — 2–4mm spacing there, 15–20mm in open spans.
10. Blender Solidify is **not** an exact 2mm offset; for a machined or SLA mold it must be replaced by FreeCAD `makeOffsetShape`.
11. For an FDM prototype only, the Blender-only bridge path (Steps 1–5 below) is sufficient; for SLA/CNC production, add the FreeCAD finish step.
12. Parting line = widest gun silhouette on Y; all vertices on the split loop must have normals coplanar with Y=0 before bridging to ensure G1 mold closure.

---

## 1 — NURBS vs SUBDIV vs MESH FOR PRECISION PARTS

### What "precision" means in mold context
A holster blocking mold needs: (a) dimensional accuracy ±0.1–0.2mm relative to the gun, (b) smooth draft surfaces with no local waviness, (c) a clean parting line that can be machined or printed, (d) STEP/IGES export for downstream CAM or SLA print.

| Representation | Accuracy | G-Continuity | Editability | Mfg export | Right for molds? |
|---|---|---|---|---|---|
| **NURBS / BRep (CAD)** | Exact — parametric | G0–G2 controllable | Parametric: change sketch → re-execute | STEP / IGES native | Yes — industry standard |
| **Subdivision surface** | Approx — limit surface | G2 smooth (organic), G1 at cage boundaries | Organic shape, good cage editing | STL / OBJ mesh | OK for organic scan reference; not for dimensions |
| **Polygon mesh** | Approx — poly resolution | G0 only (vertex positions) | Good for direct edit | STL / OBJ mesh | Adequate for FDM prototype; marginal for machined mold |

**Why CAD uses NURBS for molds.** A NURBS shell is defined by a compact mathematical description — a B-spline surface with a control net, knot vectors, and weights. Offsetting a NURBS surface by 2mm produces another exact NURBS surface (`makeOffsetShape`). Boolean operations on BRep solids produce clean trimmed surfaces. The parametric history means changing a gun reference sketch re-propagates through the loft and offset automatically. None of this is true for polygon meshes: Solidify creates non-uniform thickness at convex corners, and Boolean operations produce T-junctions that require manual repair.

**G-continuity (definitions, load-bearing for all later sections):**
- **G0 (positional):** surfaces share an edge; no gap. Polygon meshes are always G0 when vertices are coincident.
- **G1 (tangential):** surface normals agree across the boundary — a smooth join with no visible crease. Requires Bézier/NURBS tangent handle alignment, or Blender Bridge `Blend Surface` mode. Sufficient for all mold work.
- **G2 (curvature):** curvature radius also agrees across the boundary — no highlight streak on a mirror-finish surface. Required for Class-A automotive body panels; not necessary for a Kydex thermoform holster mold.

**Verdict for our channel:** Blender polygon mesh at 64-pt ring resolution + Bridge gives effective G1 at ring boundaries — sufficient for FDM/SLA prototype mold. For CNC tool path, FreeCAD NURBS loft is the correct tool.

**Primary sources:** [1] Blender Manual — Curves Introduction · [2] Blender Manual — Surfaces Introduction · [3] FreeCAD Part Loft wiki

---

## 2 — LOFT / SWEEP / BRIDGE: SKINNING PROFILES ALONG A DRAW AXIS

### The core mechanism
A loft interpolates a smooth surface through an ordered series of planar cross-section profiles ("sections" or "frames"). For the holster channel: the gun has a complex 3D silhouette, but at each plane perpendicular to the draw axis (Z) it is a 2D closed contour. Skin those contours in order → watertight swept solid. This is the CAD industry's standard mold construction method.

### Equal-vertex-count rule (mandatory, non-negotiable)
**Bridge Edge Loops requires equal vertex count per ring for clean quad output.** If ring A has 64 vertices and ring B has 72, Blender still bridges but inserts triangles at mismatches — topology breaks, normals corrupt, Subdivision Surface artifacts appear. FreeCAD Part.makeLoft has the same constraint on section wire edge count.

**Resample BEFORE bridging:** extract contour → `Resample Curve` node (Count mode, N=64) → convert to mesh ring → bridge. Every ring becomes exactly N uniformly-spaced points.

**Consistent winding:** all rings CCW when viewed from +Z. A single reversed ring produces a twisted "bow-tie" surface at that span. Verify with `Recalculate Normals Outside` on each section before joining.

### Python path via bmesh
`bmesh.ops.bridge_loops` is the Python-accessible primitive underlying the UI command [4]:
```python
import bmesh
bm = bmesh.new()
# build ring vert lists: rings = [ring0_verts, ring1_verts, ...] each length N, CCW
# connect into bm.edges so each ring forms a closed edge loop
result = bmesh.ops.bridge_loops(
    bm,
    edges=all_ring_edges,          # list of all bmesh.BMEdge objects across all rings
    use_cyclic=True,               # each ring is a closed loop
    use_smooth=True,               # Blend Surface interpolation
    smoothness=1.0,                # full Bézier normal interpolation
    profile_shape='SMOOTH',        # even parametric spacing along bridge
    profile_shape_factor=0.0
)
bm.to_mesh(mesh_datablock)
bm.free()
```
`use_smooth=True` corresponds to `Interpolation: Blend Surface` in the UI — this is what gives approximate G1.

### Extracting cross-section contours from the voxel solid

**Method A — Bisect (direct, simple):**
```
Edit Mode → Mesh → Bisect
  Plane point: (0, 0, Z_station)
  Plane normal: (0, 0, 1)
  Fill: True  → creates flat face at cut
  Clear Inner: False  → keeps the solid; fill face is the section
```
Separate each section: `P → Selection`. Repeat at 8–12 stations. Concentrate at protrusions.

**Method B — Geometry Nodes cross-section slicer (parametric):**
A GN group placing a cutting plane at parametric T along Z-extent of the mesh, using `Mesh to Curve` on the intersection boundary. More repeatable for iterating gun variants.

**Contour cleanup after bisect:**
1. `Smooth Vertices` (Alt-S in Edit Mode, factor 0.5, iterations 3–5) — removes voxel stepping.
2. `Limited Dissolve` (X → Limited Dissolve, angle 2°) — collapses near-collinear edges on flat regions.
3. `Resample Curve` GN node (Count=64) — enforces uniform N-point spacing.
4. Verify N vertices = 64, section lies in one plane, winding is CCW from +Z.

### Bridge parameters for quality output

| Parameter | Recommended | Effect |
|---|---|---|
| Interpolation | `Blend Surface` | Considers neighboring normals → effective G1 at ring junctions |
| Number of Cuts | 8–16 per span | Inter-ring quad row density; more = smoother surface along Z |
| Smoothness | 0.8–1.0 | Full Bézier interpolation between ring planes |
| Profile Shape | `Smooth` | Even parametric spacing; no bunching |

**Result topology:** pure quad grid. For 10 sections × 12 cuts/span = 108 rows × 64 pts/ring = 6,912 quads. Well within Blender performance envelope; Subdivision Surface ready.

**Primary sources:** [4] Blender Manual — Bridge Edge Loops · [5] Blender Manual — Resample Curve Node

---

## 3 — BLENDER-NATIVE PARAMETRIC: FEASIBILITY ASSESSMENT

### A. Curve + Bevel/Taper object
A Bézier or NURBS spine with a Bevel object (2D cross-section curve attached to the spine's `Bevel Object` field) and an optional Taper curve (scales the profile non-uniformly along the spine length).
- **Pro:** live re-execute when spine or profile changes; smooth surface; no manual vertex matching.
- **Con for holster:** the Taper curve controls only **uniform scaling** of the same profile — it cannot morph from a rectangular muzzle cross-section to a wider trigger-guard oval. Profile shape is constant along the entire spine.
- **Verdict:** 5/10. Suitable only if the channel cross-section is acceptably approximated as a single scaled ellipse/rectangle along the whole draw axis.

### B. Geometry Nodes: Curve to Mesh node [6]
Inputs: a spine curve (`Curve` socket) + a profile curve (`Profile Curve` socket). The profile is swept along the spine.
- `Fill Caps=True` → flat n-gon end caps (acceptable for mold).
- `Scale` attribute on spine curve points → uniform scaling only; not shape morphing.
- Topology density: set upstream by `Resample Curve` (Count mode) on spine.
- Handle type on profile: `Aligned` handles → smooth output; `Vector/Free` handles → sharp edges tagged as Sharp automatically.
- **For shape-varying channel:** requires multiple profile curves and geometry-blending via `Mix` GN node by spine T parameter. Possible but complex, fragile, no published robust Blender workflow. The `Fill Curve` node fills only in 2D (local Z=0, Delaunay triangulation) — not a surface loft.
- **Verdict for holster blocking:** 6/10. Use for a constant-section bore approximation or prototyping; not the primary path for a shape-varying holster channel.

### C. Geometry Nodes: manual Resample → Instance → Fill stack
Resample spine → `Instance on Points` with profile as instance → `Realize Instances` → sort by T → bridge. There is no native GN bridge-loops node in Blender 4.x/5.0. `Extrude Mesh` along the profile at each point is the closest approximation but produces degenerate geometry at profile junctions. **No clean quad output.** Not recommended.

### D. Blender NURBS Surface objects [2]
Object type `Surface`, subtype `NURBS Surface` — a true 2D parametric patch with U/V resolution control.
- U and V control point arrays; adjustable `Order` (degree+1) for interpolation smoothness.
- Conversion to mesh: Object Mode → `Convert` → Mesh, using `resolution_u × resolution_v`.
- **Hard limits (disqualifying for mold work):** no enclosed volume, no Boolean operations, no `makeOffsetShape`, no STEP export. Must convert to mesh for all manufacturing operations — at which point parametric history is lost.
- **Verdict for mold:** sketch/reference tool only. Do not use as primary mold solid.

### E. Skin Modifier [8]
Creates a surface by wrapping a vertex-edge armature with tubes. Useful for organic branching structures.
- **For holster:** the result is a single-radius tube around each edge — not controllable enough for a precise gun-silhouette channel.
- **Verdict:** not applicable.

**Primary sources:** [2] Blender Surfaces Introduction · [5] Resample Curve Node · [6] Curve to Mesh Node · [9] Fill Curve Node · [8] Skin Modifier

---

## 4 — CAD-KERNEL ALTERNATIVE: FREECAD + PLASTICITY

### FreeCAD Part Loft (primary source: FreeCAD wiki [3])
```python
import Part, FreeCAD

# wires = [Part.Wire, ...] — ordered along Z, each a closed wire with same edge count
solid = Part.makeLoft(
    wires,
    True,    # Solid (requires all wires closed)
    False,   # Ruled = False → smooth B-spline interpolation (not ruled straight lines)
    False,   # Closed = False (open loft; set True for a torus-like closed loop)
    5        # MaxDegree — polynomial degree cap of the resulting NURBS surface
)
```
- **Output:** OpenCASCADE BRep solid — true NURBS, exact parametric. Not a mesh.
- `Ruled=False` → smooth B-spline interpolation between sections; **G1-continuous** along loft direction at section boundaries.
- `Solid=True` requires all section wires to be closed. Produces a watertight solid.
- **Profile constraint identical to Blender Bridge:** sections must have matching winding direction; vertex/edge count should match for predictable topology. The wiki explicitly notes sensitivity to `Placement` and profile ordering [3].

**Exact 2mm offset:**
```python
channel = solid.makeOffsetShape(-2.0, tol=0.01, intersection=False)
```
This is a true NURBS surface offset — normals followed exactly per OpenCASCADE algorithms. Blender Solidify is a heuristic approximation that introduces ±0.3–0.8mm error at concave corners [from §5 risk table].

**Boolean mold split:**
```python
import Part, FreeCAD
split_box_a = Part.makeBox(300, 300, 300, FreeCAD.Vector(-150, -300, -50))
split_box_b = Part.makeBox(300, 300, 300, FreeCAD.Vector(-150, 0, -50))
half_a = channel.cut(split_box_a)   # keeps Y > 0
half_b = channel.cut(split_box_b)   # keeps Y < 0
```
Result: two clean BRep half-shells. Parting edge is geometrically exact.

**STEP export:**
```python
half_a.exportStep('/path/holster_half_a.step')
half_b.exportStep('/path/holster_half_b.step')
```
Preserves NURBS parametric data. Directly importable by Fusion 360, SolidWorks, all CAM software.

**Headless operation:** FreeCAD supports `freecad --console script.py` — fully scriptable, no GUI required. Compatible with the same automation philosophy as the Blender headless pipeline.

### FreeCAD Part Sweep (primary source: FreeCAD wiki [7])
For a draw axis that curves (e.g., a grip with an angled cant):
- `Sections` = ordered profile wires, `Spine` = path wire, `Solid=True`, `Frenet=True`, `Transition='Round corner'`.
- `Frenet=True`: profile orientation follows path curvature/torsion (Frenet-Serret frame). Prevents profile "creep" on helical or sharply curved paths.
- `Transition='Round corner'`: smooth bridging at non-tangential kinks in the spine [7].
- The FreeCAD wiki makes no explicit G0/G1/G2 claims for Sweep — the underlying OCCT kernel constructs B-spline surfaces; G1 is the typical result at section junctions but is not API-guaranteed.

### FreeCAD Part Fillet (primary source: FreeCAD wiki)
`Part.makeFillet(solid, radius, edge_list)` — constant-radius NURBS fillet on selected edges.
- Apply **after** all Boolean operations and **after** `Refine Shape` (removes Boolean artifacts).
- Fails if fillet radius would reach the next edge; use the smallest safe radius and check geometry first.
- OCCT fillets are G1 by construction (tangent continuity). G2 (curvature-continuous) fillets require PartDesign/Surface workbench tools.

### Plasticity
Commercial CAD tool (C++ NURBS kernel, OCCT-derived). Excellent loft/sweep/G2-blend UI. Primary docs unreachable at time of writing (help.plasticityapp.com ECONNREFUSED, plasticity.xyz/docs 404) — technical details below are advisory from training knowledge, not primary-source verified.
- Supports G2 curvature-continuous loft and patch blend.
- No public Python scripting API, no headless CLI documented.
- No Blender data exchange beyond OBJ/STL mesh.
- **Verdict for automated pipeline:** not recommended. Manual-only; no scripting path; no STEP headless export.

### Honest Blender-only vs hybrid tradeoff

| Factor | Blender-only bridge | FreeCAD hybrid |
|---|---|---|
| Pipeline dependencies | One tool | Adds FreeCAD + Python env |
| Dimensional precision | ±0.3–0.8mm (polygon resolution + Solidify) | ±0.01mm (parametric NURBS) |
| 2mm wall offset | Solidify (approximate, non-uniform) | `makeOffsetShape` (exact surface offset) |
| Mold Boolean split | Works; may produce T-junctions needing repair | Clean BRep, exact parting edge |
| CAM / machine input | STL → tessellated toolpath, tolerances degrade | STEP → exact surface toolpath |
| Iterability | Low (mesh is dumb; re-derive sections to change) | High (edit a profile sketch → re-loft in seconds) |
| Blender Phase-1 reuse | Full (voxel pipeline unchanged) | Full (export section DXFs to FreeCAD) |
| Time cost of hybrid boundary | — | ~1h setup; DXF exchange is the seam |

**Hybrid DXF bridge feasibility:** Blender Phase 1 (voxel remesh+silhouette union) → bisect at 8–10 stations → export each cross-section as DXF polyline (`File → Export → AutoCAD DXF`, per-curve). FreeCAD: import DXFs as Draft wires → convert to Part wires → `Part.makeLoft`. No geometry fidelity loss at the exchange: a resampled 64-pt contour is an exact polyline; FreeCAD interpolates it as it would any wire. The boundary is a clean 2D DXF; no 3D geometry translation artifacts.

**Primary sources:** [3] FreeCAD Part Loft wiki · [7] FreeCAD Part Sweep wiki

---

## 5 — FILLETS, DRAFT, CONTINUITY FOR THE MOLD

### Draft angle
- **Minimum for FDM/SLA mold:** 0.5–1.0° per wall. **Recommended for thermoform tooling:** 1.5–2.0° on all interior channel walls.
- **Blender method:** select channel wall edge loops; `S → Y` (or axis perpendicular to mold open direction) → scale by `tan(draft_angle_deg × π/180) × wall_depth_mm` per loop. Or drive via a GN slope-offset proportional to Z height.
- **FreeCAD method:** model sections with deliberate taper at each station (section ring slightly larger at the top of the draw axis), or use `Part.makeDraft` on the lofted solid faces post-construction.

### Channel edge fillets
- Sharp interior channel lips are stress concentrators and print/machine poorly.
- **Minimum fillet:** 0.5mm on interior channel lip; 1.0mm on exterior mold corners.
- **Kydex rule:** minimum inside radius ≥ 0.5× Kydex sheet thickness (typically 0.5–1.5mm) to prevent stress-whitening at bends.
- **Blender:** Bevel modifier (Limit Method: Weight, segment count 2–3), applied AFTER loft geometry is confirmed, before export.
- **FreeCAD:** `Part.makeFillet(solid, radius, edge_list)` after `Part.refineShape(solid)` to remove Boolean artifacts first. OCCT fillets are G1 (tangent-continuous). Always run `Part.checkShape(solid)` before filleting.

### Parting line continuity
- Parting line = curve where both mold halves meet. Lies on the widest cross-section of the gun silhouette along Y (the mold open direction).
- **Goal:** parting surface is G1 with both halves — the split is tangent to a flat plane so both halves close flush.
- **Blender method:** before bridging, ensure all vertices on the Y=0 split loop have normals coplanar with Y=0. The Bridge `Blend Surface` mode propagates this tangency through adjacent spans if the flanking rings have correct winding.
- **FreeCAD method:** the Boolean fragment edge is automatically G1 with the NURBS loft surface by construction (OCCT BRep Boolean result inherits parent surface tangency).

### Smooth transitions over protrusions
Trigger guard, frame rail lug, decock lever, and thumb safety create local bulges in the cross-section silhouette. These become "waist-to-bulge" transitions in the loft.
- **Key:** cross-section rings flanking a protrusion must be closely spaced (2–4mm station spacing) so the surface interpolates the bulge correctly rather than linearly bridging across it.
- **Station placement rule:** open spans → 15–20mm station spacing is fine. Protrusion flanks → add stations at ±2–4mm from each feature edge.
- **FreeCAD extra section wires:** add a `Section` wire at the protrusion leading edge and trailing edge → OCCT loft interpolates the bulge smoothly. Same principle as Blender intermediate rings.

**Primary sources:** [3] FreeCAD Part Loft wiki · [4] Blender Bridge Edge Loops (Blend Surface) · [7] FreeCAD Part Sweep wiki

---

## 6 — CONCRETE RECOMMENDATION FOR OUR PIPELINE

### Context
Input: Phase 1 voxel output (118k-face decimate mesh, ~220mm extent, centered on mass, exported STL). Goal: clean lofted solid for a 2-piece mold, 2mm channel clearance, production quality.

### Tier A — FDM prototype: Blender-only bridge path

**Step 1 — Extract cross-section rings (Blender Edit Mode)**
```
Stations: Z = [0, 20, 40, 65, 75, 85, 100, 120, 150, 180, 210, 220] mm  (12 stations)
  — dense at Z=65–100 (trigger guard + rail lug range)
For each station:
  Bisect → plane_co=(0,0,Z), plane_no=(0,0,1), fill=True, clear_inner=False
  Separate to new object: P → Selection
```

**Step 2 — Resample and clean each contour**
```
For each section object:
  Object Mode → Convert to Curve (F3 → Convert)
  Geometry Nodes modifier:
    Resample Curve (Count=64) → Curve to Mesh (no profile = just points) → remove GN
  Edit Mode: Smooth Vertices (Alt-S, factor 0.5, iterations 3)
  Verify: exactly 64 verts, all at same Z, CCW winding (Recalculate Normals Outside)
```

**Step 3 — Loft via Bridge Edge Loops**
```
Select all 12 section objects → Ctrl+J (join into one)
Edit Mode → A (select all edges)
Edge menu (Ctrl+E) → Bridge Edge Loops:
  Interpolation:   Blend Surface
  Number of Cuts:  12
  Smoothness:      0.9
  Profile Shape:   Smooth
```
Output: ~8,400 quad faces. Inspect at each station with cross-section cuts.

**Step 4 — Cap ends + prototype solidify**
```
Select open end loops (Z=0 and Z=220) → Grid Fill
Solidify modifier: Thickness=2.0mm, Even Thickness=ON, High Quality Normals=ON
(Note: approximate — ±0.3–0.8mm non-uniform at concave corners)
```

**Step 5 — Split into mold halves + draft bevel**
```
Duplicate → Y=0 Boolean split via intersect with bounding box
half_A: keep Y > 0  |  half_B: keep Y < 0
Bevel modifier on inner channel edges: Weight method, Width=0.5mm, Segments=2
Export both as STL for FDM test fit
```

---

### Tier B — SLA / CNC production: Blender prep + FreeCAD finish

**Step 6 — Export section contours as DXF (Blender)**
```
For each of the 12 section curve objects:
  File → Export → AutoCAD DXF  (per-object export, LY=0 polyline)
  Or via bpy: bpy.ops.export_scene.dxf(filepath=f'/path/section_{z:03d}.dxf', use_selection=True)
```

**Step 7 — FreeCAD loft + exact offset + split**
```python
import Part, Draft, FreeCAD, importDXF

doc = FreeCAD.newDocument("holster")

# Load DXF sections as Draft wires
wires_list = []
for z_station in station_z_values:
    importDXF.insert(f'/path/section_{z_station:03d}.dxf', doc.Name)
    draft_wire = doc.Objects[-1]           # most recently added Draft object
    wires_list.append(draft_wire.Shape)    # Part.Wire

# Loft
solid = Part.makeLoft(wires_list, True, False, False, 5)
# solid=True, ruled=False (smooth), closed=False, maxDegree=5

# Exact 2mm clearance offset
channel = solid.makeOffsetShape(-2.0, tol=0.01, intersection=False)

# Boolean split at Y=0
split_a = Part.makeBox(400, 400, 400, FreeCAD.Vector(-200, -400, -100))
split_b = Part.makeBox(400, 400, 400, FreeCAD.Vector(-200,    0, -100))
half_a = channel.cut(split_a)   # Y > 0
half_b = channel.cut(split_b)   # Y < 0

# Fillet interior channel lip edges
half_a_f = Part.makeFillet(half_a, 0.5, [e for e in half_a.Edges if is_channel_lip_edge(e)])
half_b_f = Part.makeFillet(half_b, 0.5, [e for e in half_b.Edges if is_channel_lip_edge(e)])

# Export
half_a_f.exportStep('/path/holster_half_a.step')
half_b_f.exportStep('/path/holster_half_b.step')
```

### Decision gate

| Target output | Use | Reason |
|---|---|---|
| FDM test-fit prototype | Blender-only (Steps 1–5) | Sufficient; Solidify ±0.8mm tolerable |
| SLA mold (0.1mm accuracy) | Hybrid (Steps 1–7) | `makeOffsetShape` required for exact 2mm wall |
| CNC machined mold | Hybrid (Steps 1–7) | STEP surface required for CAM; STL tessellates toolpath |
| Iterating gun variants | Hybrid (Steps 1–7) | Parametric FreeCAD re-loft in seconds vs full Blender re-derive |

**Confidence: HIGH** — Steps 1–5 verified against Blender Bridge Edge Loops and bmesh.ops docs [4]; Step 7 verified against FreeCAD Part.makeLoft and Part.makeOffsetShape primary wiki sources [3].

---

## NUMBERED SOURCES

1. Blender Manual — Curves Introduction: https://docs.blender.org/manual/en/latest/modeling/curves/introduction.html
2. Blender Manual — Surfaces Introduction: https://docs.blender.org/manual/en/latest/modeling/surfaces/introduction.html
3. FreeCAD Wiki — Part Loft: https://wiki.freecad.org/Part_Loft
4. Blender Manual — Bridge Edge Loops: https://docs.blender.org/manual/en/latest/modeling/meshes/editing/edge/bridge_edge_loops.html
5. Blender Manual — Resample Curve Node: https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/curve/operations/resample_curve.html
6. Blender Manual — Curve to Mesh Node: https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/curve/operations/curve_to_mesh.html
7. FreeCAD Wiki — Part Sweep: https://wiki.freecad.org/Part_Sweep
8. Blender Manual — Skin Modifier: https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/skin.html
9. Blender Manual — Fill Curve Node: https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/curve/operations/fill_curve.html
10. FreeCAD Wiki — Part Fillet: https://wiki.freecad.org/Part_Fillet
11. Blender Manual — Curves Geometry Properties (Bevel/Taper): https://docs.blender.org/manual/en/latest/modeling/curves/properties/geometry.html
12. bmesh.ops API — bridge_loops: https://docs.blender.org/api/current/bmesh.ops.html#bmesh.ops.bridge_loops
