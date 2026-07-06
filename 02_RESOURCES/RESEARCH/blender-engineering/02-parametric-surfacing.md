# Parametric & CAD-Style Surfacing in Blender — for an Any-Gun Holster Pipeline

**Date:** 2026-06-24 · **Product:** custom-gear.ch holster blocking (HK 45 today, any-gun tomorrow)
**Goal:** procedural, reusable, dimension-driven geometry — the foundation that turns a gun scan + a parameter set into a finished mold blocking.
**Confidence:** HIGH on §1–§4 (primary-source verified docs.blender.org 5.1, nortikin.github.io Sverchok 1.4.0, GitHub README) · MEDIUM on §5 recommendation (architectural judgment, locally validated on HK45 build-log s1–s3)
**Sister docs:** `04-cad-loft-sweep-surfacing-recommendation.md` (the CAD-kernel finish path), `_SYSTEM/blender/RUNBOOK.md` §4b (bridge_loops), `_SYSTEM/blender/BLOCKING-BUILD-LOG.md` (live method history)

---

## 0 — THE QUESTION THAT DRIVES EVERYTHING

The build-log's hardest-won lesson (s2 → s3, 2026-06-24): a holster blocking is **NOT a lofted organic surface**. Repeated failures — voxel blob, polar loft blob, shrinkwrap blob, cross-section loft = "correct shape but LUMPY/organic wavy surface." The proven method is **clean per-part hard-surface boolean assembly** (slide block + sight tunnel + barrel + frame + trigger fill) measured to the scan, producing dead-flat faceted planes. So "parametric surfacing" here means **driving THAT assembly by parameters**, not building a NURBS skin. Keep this framing or the research leads you back to the blob failures.

---

## 1 — CURVE-BASED MODELING (the sweep-along-rail primitives)

Blender curves are the foundation of any sweep/loft. Three spline types: **Bezier** (tangent handles, the default for authored shapes), **Poly** (straight segments, exact polylines — best for scan-extracted cross-sections), **NURBS** (control net + weights + knot vector, the CAD-native form but poorly supported in Blender core — see §4). All are 1D primitives; they become 2D/3D geometry via the Geometry panel or GN nodes.

### 1.1 Curve → Bevel Object (sweep-along-rail, the draw-axis channel primitive)

A spine curve with a **Bevel Object** (a separate 2D profile curve) sweeps that profile along the spine — this is Blender's native sweep-by-rail. Verified primary source (Blender 5.1 Manual, Curves → Geometry → Bevel → Object) [1]:

> "This option lets you fully customize the shape of the cross section by selecting a separate Curve object. The curve that defines the cross section. It can be either closed (cyclic) or open. **This curve should be flat in its local XY plane; using another plane will not give the desired result.**"

- Spine = the draw-axis path (nominally straight ±Y for a holster; curved for a canted grip).
- Bevel Object = the 2D muzzle "keyhole" cross-section (slide tunnel + sight bore + control nub).
- Result: an extruded channel — exactly the "front-to-back tunnel" the build-log identifies as the blocking's essence.
- **Fill Caps** seals the ends. **Resolution** drives cross-section vertex count.

**The load-bearing limitation (verified):** the profile shape is **constant along the entire spine**. The manual's own Taper note [1]:

> "The 'taper' in the name is misleading: this word means 'to reduce in size towards the end,' while the Taper Object can apply any size anywhere. A better name might have been 'Scale Curve.'"

Taper scales the profile uniformly per-spine-point; it cannot morph a narrow muzzle rectangle into a wider trigger-guard oval. For a holster — where the cross-section genuinely changes shape along the draw axis (slide → frame → trigger guard) — **Bevel+Taper alone is insufficient**. It is the right primitive for a single constant-section bore (a sight channel, a barrel tunnel), not the whole blocking.

### 1.2 Curve → Mesh conversion & the bmesh layer

- `bpy.ops.object.convert(target='MESH')` — UI operator, context-sensitive (fails headless without a viewport region, RUNBOOK §5.1 [2]).
- `bpy.types.Object.to_mesh()` + `bpy.types.Object.evaluated_get()` — the data-layer path, no context required. This is the headless-safe pattern.
- For GN-curve output: the modifier's evaluated mesh is what you extract.

### 1.3 bridge_loops — the loft primitive (verified, RUNBOOK §4b [2])

`bmesh.ops.bridge_loops(bm, edges, use_pairs, use_cyclic, use_merge, merge_factor, twist_offset)` — bridges two edge loops into a quad strip [3]. This is the Python-accessible loft for mesh cross-section rings.

```python
import bmesh
bm = bmesh.new()
# rings: list of vert lists, each length N, CCW winding, coplanar
# build closed edge loops per ring, then:
bmesh.ops.bridge_loops(bm, edges=all_ring_edges, use_cyclic=True)
```

**Mandatory preconditions (from the CAD-loft doc, empirically reinforced by build-log s2):**
1. **Equal vertex count per ring** — mismatch inserts triangles, breaks normals.
2. **Consistent winding** (all CCW from +Z) — one reversed ring = bow-tie twist.
3. **Resample before bridging** — `Resample Curve` GN node (Count mode, N=64) enforces uniform spacing [4].

**Build-log caveat (decisive):** bridge_loops on cross-sections "correct SHAPE but LUMPY/organic wavy surface (resampling twist); flat-shading exposed it." Lofting is geometrically valid for a smooth-bore mold; it is the **wrong tool for a crisp faceted hard-surface blocking**. Use it only where you actually want smooth interpolation (a barrel tube, a sight bore), not for the slide/frame body.

---

## 2 — SVERCHOK (parametric node geometry)

### 2.1 What it is

Sverchok is a mature (since 2013, GPL3, 600+ nodes), actively maintained parametric node-geometry addon for Blender — "a powerful parametric tool for architects and designers, enabling visual programming of geometry through nodes" [5]. Tested with Blender 5.1 per the current README [5]. It predates Geometry Nodes and remains more mathematically/CAD-oriented.

**Confirmed capability surface (from the README [5] and NURBS doc [6]):**
- Lists, matrices, **curves, surfaces, scalar/vector fields, solids** as first-class types
- Profile parametric, UV connect, Adaptive Polygons (tissue-vectorized), Bmesh operations/properties
- **CSG Boolean** node, solid modeling, cross-sections/extrusions
- SVG/DXF export directly from node trees; **BREP/NURBS/IFC data exchange**
- Scripted node (custom Python), genetic algorithms, FreeCAD integration
- 3D View panel, one-click update, bpy Get/Set nodes

### 2.2 The CAD/NURBS reality — primary-source honest assessment

The Sverchok NURBS doc [6] is unusually candid about its own scope. Verbatim findings that decide the question:

- **"Sverchok does not have a goal to have 'full NURBS workflow', at least at the moment."** [6]
- **"Blender is, first of all, a mesh editing software, so it is very probable that the most widely used workflow always will be to manipulate with NURBS curves/objects for some time, together with other types of curves/objects, but then convert them to mesh and apply some nodes that manipulate with mesh, to receive a mesh in the end."** [6]
- Three NURBS backends: **geomdl** (external lib), **built-in native** (faster for point evaluation), **FreeCAD/OCCT** (C++, "more widely tested compared to Sverchok built-in implementation" [6]). The OCCT path is the serious CAD one.
- "NURBS-transparent" nodes (Ruled Surface, Surface of Revolution) preserve NURBS through the op, **but coverage is incomplete and "there is no guarantee that some time all curve/surface processing nodes will become NURBS-transparent (and there is no such goal)."** [6]
- **Blender's own NURBS API is "very poor"** and cannot specify arbitrary knot vectors — only clamped-uniform and uniform [6]. This caps what ANY Blender addon can do with native NURBS data.

**Community-confirmed weak point (Blender Stack Exchange [7]):** the CSG Boolean node "can be slow and sometimes unreliable"; users frequently fall back to Blender's native boolean modifier. This matches the build-log's hard-won rule: booleans on dirty geometry need the EXACT/MANIFOLD solver + post-boolean cleanup, not a node-graph shortcut.

### 2.3 Is Sverchok the right tool for a turnkey any-gun pipeline?

**No, not as the primary substrate.** Reasoning, adversarially checked:

- **For.** Dimension-driven sliders (slide width, sight height, barrel protrusion) wired to a parametric profile is exactly Sverchok's wheelhouse. The node graph is auditable and re-executable. FreeCAD/OCCT nodes give real BREP for the STEP-export finish path.
- **Against (decisive).** (1) The build-log proves the blocking is a **hard-surface boolean assembly**, not a NURBS skin — Sverchok's distinctive strength (parametric NURBS/surfaces) is orthogonal to the actual geometry. (2) Its own docs disclaim a full-NURBS-workflow goal [6]. (3) CSG Boolean reliability is a known weak point [7]. (4) A node graph is harder to version-control and headlessly drive than Python code. (5) Native Geometry Nodes now covers most of the procedural-mesh ground with better performance and first-class support.

**Verdict:** Sverchok is a strong **auxiliary** — for a one-off parametric fixture/jig, a DXF-exported section family, or an OCCT-backed STEP finish step. It is **not** the spine of an automated any-gun pipeline. Use `bpy`/`bmesh` + Geometry Nodes for the spine.

---

## 3 — GEOMETRY NODES (built-in parametric)

### 3.1 The parametric mesh substrate

GN is Blender's built-in, first-class procedural system. Relevant primitives (Blender 5.1 Manual [8][9][10][11]):

- **Fields** — per-element lazy evaluation (vs single-value sockets). Scales to large meshes because work is done only where needed.
- **Instances** — lightweight references; **Realize Instances** is the expensive op (converts instances to real geometry). **Defer Realize as late as possible** — the main bottleneck at scale [12].
- **Curve to Mesh node** [9] — spine `Curve` + `Profile Curve` + per-point `Scale` + `Fill Caps` (n-gon caps, manifold output). Verified verbatim: "If a profile curve is provided, it will be extruded along all splines… Scale: the scale used at each control point of the input curve to scale the profile curve." Same constant-profile limitation as Bevel Object — Scale is uniform, not shape-morphing.
- **Resample Curve node** [4] — Count or Length mode; enforces uniform point spacing. The canonical pre-step before any loft/bridge.
- **Mesh Boolean node** [10] — solver options: EXACT (stable since 2.91), MANIFOLD (Blender 4.5+, fast watertight output when both operands are manifold), FAST (deprecated for precision). Same solver engine as the modifier layer.
- **Mesh to Curve / Curve to Mesh / Fill Curve** [11] — the curve-mesh bridge toolkit for section extraction and lofting.
- **Extrude Mesh node** [8] — verts/edges/faces modes; the procedural extruder.

### 3.2 Performance on ~100k meshes (the holster scale)

The Phase-1 voxel-decimate target is **115–120k faces** (RUNBOOK §4.1). GN handles this comfortably for the blocking pipeline:

- **Field evaluation** on 120k faces is sub-second for typical ops (selection, transform, boolean) — confirmed by community performance threads [12] and consistent with the live build-log driving 118k-face scans through boolean ops in the MCP-socket without timeout.
- **The bottleneck is Realize Instances + Mesh Boolean EXACT on non-manifold input.** Build-log s3: "a big EXACT boolean DIFFERENCE silently NO-OP'd on the messy multi-union scan mesh in the headless MCP." Fix: heal the mesh first (RUNBOOK §3 `heal_mesh`: remove_doubles → recalc normals → holes_fill → dissolve_degenerate → verify `non_manifold_edges == 0`), then boolean. GN does not absolve you of mesh hygiene.
- For the **output** blocking (~3–8k faces after the clean primitive assembly), GN is dramatically over-provisioned. Performance is a non-issue at that scale.

### 3.3 GN vs Sverchok for this use case

| Factor | Geometry Nodes | Sverchok |
|---|---|---|
| First-class Blender support | Yes (shipped, documented at docs.blender.org) | Addon (mature but external) |
| NURBS/BRep/STEP | No (mesh-native) | Yes (via geomdl/OCCT nodes) [6] |
| Boolean reliability | EXACT/MANIFOLD solvers, robust | CSG Boolean node — known flaky [7] |
| Performance at 100k+ | Fields + lazy eval, scales well | Variable; depends on node graph |
| Headless/scriptable | `bpy` node-tree API is full and stable | Scripted node helps but graph is GUI-first |
| Version control | `.blend` + exported Python — workable | `.blend` node graph — harder to diff |
| CAD finish (STEP for CAM) | No | Yes (OCCT nodes) — but FreeCAD headless is better |

**Verdict:** GN (or raw `bpy`/`bmesh`) is the right substrate for the procedural blocking. Sverchok adds no decisive advantage for mesh-native blocking and introduces a dependency + a flakier boolean. For the STEP-export finish step, go directly to FreeCAD headless (see `04-cad-loft-sweep-surfacing-recommendation.md` §4) rather than routing through Sverchok's OCCT nodes.

---

## 4 — CAD-STYLE LOFT / SWEEP-BY-RAIL SURFACING (Blender vs true NURBS)

### 4.1 What Blender can and cannot do

Blender is a **polygon mesh** modeler. It has no BRep kernel. Three approximations to CAD surfacing:

| Technique | Continuity | Limitation | Mold fit |
|---|---|---|---|
| **Bridge Edge Loops** (Blend Surface) [3] | ~G1 at ring junctions | Mesh resolution; wavy if rings are resampled unevenly | FDM prototype channel |
| **Curve to Mesh** (spine + profile) [9] | G1 along spine; G0 at caps | Constant profile shape (Scale ≠ morph) | Constant-section bores only |
| **NURBS Surface objects** (native) | G2 in theory | No volume, no boolean, no offset, no STEP; convert-to-mesh loses history | Reference only — disqualified |

**G-continuity recap** (load-bearing for mold release):
- **G0** positional (shared edge) — polygon meshes are always G0.
- **G1** tangential (normals agree) — sufficient for Kydex thermoform release. Bridge Blend Surface and Curve-to-Mesh achieve this.
- **G2** curvature (highlight-continuous) — automotive Class-A; **not required** for a holster mold.

### 4.2 The directional draw-axis channel — why loft is the wrong primary tool here

The CAD-loft doc §2 prescribes: extract cross-sections along the draw axis → resample to N=64 → bridge → approximate-G1 swept solid. This is the **textbook CAD mold method** and it is correct for a smooth-bore female cavity. But the build-log (s2) empirically refuted it for **this product**:

> "lofting cross-sections (angular-resampled hulls → bridged quads) = correct SHAPE but LUMPY/organic wavy surface (resampling twist); flat-shading exposed it. Same wavy class as s1. The 3-view INTERSECTION wins: boolean-of-extruded-polygons yields ONLY flat planar facets."

The owner confirmed the target is a **"CLEAN, SMOOTH, FULLY-SIMPLIFIED BLOCKY volume — zero gun-surface detail"** with **crisp flat facets** (build-log s3). A loft interpolates; interpolation between sampled sections is inherently prone to waviness. A **boolean of extruded planar profiles** yields only flat planar facets by construction — which is exactly the CAD's look.

### 4.3 The technique that actually delivers the channel

For the holster blocking, "CAD-style surfacing" reduces to:

1. **Per-part clean primitives** (slide block = beveled box; barrel = cylinder; sight channel = raised tunnel; trigger guard = solid fill). Each is a planar-faceted solid measured to the scan.
2. **Boolean UNION** (EXACT solver during modeling; MANIFOLD for the final watertight pass) into one blocking.
3. **Crisp pass**: shade_smooth → Bevel (Angle limit, 2 segments, harden normals, clamp overlap) → Weighted Normal (Face Area) → `shade_auto_smooth` operator (~40°). Produces dead-flat facets with sharp marked edges.
4. **Lateral split** (bisection at the mold parting plane) into two Kydex-press halves.
5. **Kydex finish**: ≥1.6 mm inner fillet, 1–2° male draft, +0.5% mold shrink.

**Loft/sweep is reserved for the genuinely smooth sub-parts** — the barrel cylinder (a lathe-equivalent sweep), a sight bore (Curve-to-Mesh constant profile). The slide/frame body is hard-surface boolean, not lofted.

### 4.4 When you DO want true NURBS (the STEP finish path)

For SLA/CNC production molds requiring ±0.01 mm and exact 2 mm walls, route the finish step to **FreeCAD headless** (`Part.makeLoft` + `makeOffsetShape` + `cut` + `exportStep`). This is the hybrid path documented in `04-cad-loft-sweep-surfacing-recommendation.md` §4/§6. Blender preps the sections (DXF export per station); FreeCAD lofts/offsets/splits/exports STEP. Do not attempt this in Blender — it has no BRep kernel and Solidify is a non-uniform ±0.3–0.8 mm approximation.

---

## 5 — RECOMMENDATION: PARAMETRIZING THE ANY-GUN PIPELINE

### 5.1 The three options ranked

| Approach | Parametrization | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Pure `bpy`/`bmesh` script** | Python dataclass/dict of gun dims | Full control; headless; version-controllable; matches live Phase-1 script; drives blender-mcp directly | Parameters are code, not a GUI slider | **PRIMARY — recommended** |
| **Geometry Nodes** | Node-tree inputs + Object info | Live, visual, re-executes on param change; first-class | Per-gun dim set is awkward as GN inputs; harder to serialize per-gun presets | **AUXILIARY — for sub-parts** |
| **Sverchok** | Node graph + sliders | CAD-leaning; DXF/STEP via OCCT | Disclaims full-NURBS goal [6]; flaky boolean [7]; external dependency | **NICHE — STEP finish only** |

### 5.2 Recommended architecture: parameterized `bpy` spine + GN sub-parts + FreeCAD finish

```
                       ┌──────────────────────────────────────────┐
 gun_scan.stl ────────►│  PHASE 1 (exists, holster_prep_phase1.py)│
                       │  import → voxel seal → decimate 115-120k │
                       │  → center on mass → export prepped STL   │
                       └────────────────────┬─────────────────────┘
                                            │
                       ┌────────────────────▼─────────────────────┐
  gun_params.json ────►│  PHASE 2a: PARAMETER EXTRACTOR (bpy)     │
  (per-gun preset)     │  measure prepped scan → {slide_w,        │
                       │  slide_h, sight_h, barrel_len, guard_z,  │
                       │  frame_w, overall_L, ...} → merge with   │
                       │  user preset → resolved param dict       │
                       └────────────────────┬─────────────────────┘
                                            │
                       ┌────────────────────▼─────────────────────┐
                       │  PHASE 2b: PARAMETRIC BLOCKING (bpy/bmesh│
                       │  + GN for constant-section bores)        │
                       │                                          │
                       │  per part (slide_block, sight_tunnel,    │
                       │  barrel, frame, trigger_fill, controls): │
                       │    primitive scaled to params            │
                       │    → boolean UNION (EXACT)               │
                       │    → heal_mesh + recalc normals          │
                       │  grip cut (bmesh Z <-holster_mouth)      │
                       │  crisp pass (bevel + weighted normal)    │
                       │  → blocking object                       │
                       └────────────────────┬─────────────────────┘
                                            │
                       ┌────────────────────▼─────────────────────┐
                       │  PHASE 2c: SPLIT + KYDEX FINISH (bpy)    │
                       │  duplicate → bisection at parting plane  │
                       │  → 2 halves → inner fillet ≥1.6mm        │
                       │  → draft 1-2° → +0.5% shrink             │
                       │  → export STL (FDM) OR hand off to CAD   │
                       └────────────────────┬─────────────────────┘
                                            │
                       ┌────────────────────▼─────────────────────┐
                       │  PHASE 3 (optional, SLA/CNC): FreeCAD    │
                       │  headless: section DXFs → makeLoft →     │
                       │  makeOffsetShape(-2.0) → cut → STEP      │
                       └──────────────────────────────────────────┘
```

### 5.3 Why pure-bpy spine (not GN, not Sverchok)

1. **Matches the proven method.** Build-log s3 delivered `HK45_blocking_v3` via exactly this path: duplicate scan → clean chamfered slide block + dust-cover + trigger fill + barrel + frame → boolean union → grip cut → voxel-remesh + planar-decimate → smooth. It works. GN/Sverchok would be a rewrite of a solved problem.
2. **Parameters serialize cleanly.** A `gun_params.json` per gun (`{"slide_width": 25.4, "slide_height": 13.2, "sight_height": 6.0, "barrel_protrusion": 18.8, "overall_length": 221.7, "holster_mouth_z": -29.0, ...}`) is diffable, templatable, and drives every primitive dimension in the script. GN node-tree inputs cannot match this for authoring/maintaining a per-gun library.
3. **Headless + blender-mcp native.** The `bpy`/`bmesh` data layer has no context requirements (RUNBOOK §5.1 [2]) — it runs in the MCP socket where `bpy.ops`-based GUI operators silently no-op. This is the live production path.
4. **Where GN earns its place:** the constant-section sub-parts. A sight-bore tunnel = GN `Curve to Mesh` (straight spine + small rectangular profile). A barrel = GN sweep or a simple cylinder primitive. These are isolated, parametrically clean, and don't need the full boolean cleanup. Optional, not load-bearing.
5. **Where Sverchok earns its place:** nowhere essential. If a future STEP-export finish step is wanted and FreeCAD headless is for some reason unavailable, Sverchok's OCCT nodes are a fallback. FreeCAD headless is the better tool for that job.

### 5.4 The parameter set (the any-gun contract)

Derived from the HK45 build-log measurement pass + the part decomposition table. This is the JSON schema every gun preset must satisfy:

```json
{
  "gun_id": "HK45T",
  "overall_length_mm": 221.7,
  "draw_axis": "Y",
  "muzzle_y_mm": 0,
  "holster_mouth_z_mm": -29.0,
  "parts": {
    "slide":   {"width": 25.4, "height": 13.2, "crown_z": 82.3, "front_taper_y": 14, "shoulder_deg": 46},
    "sights":  {"height_above_slide": 6.0, "front_y": 4, "rear_y": 200, "width": 5},
    "barrel":  {"diameter": 13.0, "protrusion_mm": 18.8, "thread": "M16x1 LH"},
    "frame":   {"width": 30.0, "belly_z_front": 34, "belly_z_rear": 12},
    "trigger_guard": {"fill": "solid", "outline_z_min": 3.3, "outline_z_max": 48},
    "controls": {"slide_stop_left": true, "mag_release_ambidextrous": true, "safety_left": true},
    "ejection_port": {"side": "right", "fill": "flat"}
  },
  "mold": {"clearance_mm": 2.0, "inner_fillet_mm": 1.6, "draft_deg": 1.5, "shrink_pct": 0.5, "split_axis": "X"}
}
```

Adding a new gun = measure its prepped scan (Phase 2a auto-extracts most fields), edit the preset, re-run. That is the turnkey loop.

---

## 6 — API / NODE REFERENCE CHEAT SHEET

### Blender Python (`bpy` / `bmesh`) — headless-safe
- `bpy.ops.wm.stl_import` / `bpy.ops.wm.stl_export` (4.1+/5.0, RUNBOOK §2 [2])
- `bpy.context.scene.unit_settings.scale_length = 0.001` (mm scene)
- `bmesh.ops.bridge_loops(bm, edges, use_cyclic=True)` — loft two rings [3]
- `bmesh.ops.remove_doubles` / `recalc_face_normals` / `holes_fill` / `dissolve_degenerate` — heal_mesh [2]
- `bmesh.ops.bisect_plane(bm, geom, plane_co, plane_no, clear_inner, clear_outer)` — split (headless-safe vs `bpy.ops.mesh.bisect`)
- Boolean: `obj.modifiers.new(name, 'BOOLEAN')` → `solver='EXACT'` (or `'MANIFOLD'` 4.5+) → `modifier_apply`
- `obj.to_mesh()` + `evaluated_get()` — extract evaluated geometry (GN-safe)

### Geometry Nodes (Blender 5.1) [8][9][10][11]
- `Curve to Mesh`: spine + Profile Curve + Scale + Fill Caps
- `Resample Curve`: Count / Length — enforce uniform spacing
- `Mesh Boolean`: EXACT / MANIFOLD / FAST
- `Mesh to Curve` / `Curve to Mesh` / `Fill Curve`: curve-mesh bridge
- `Extrude Mesh`: verts/edges/faces
- `Realize Instances`: defer to end (performance)

### Sverchok 1.4.0 [5][6] (auxiliary only)
- Curves / Surfaces / Fields / Solids as first-class types
- NURBS backends: geomdl, built-in, FreeCAD/OCCT
- NURBS-transparent nodes: Ruled Surface, Surface of Revolution (partial coverage)
- CSG Boolean (flaky on dirty geometry [7]) — prefer native modifier
- DXF/SVG/IFC/BREP export

### FreeCAD headless (finish path, `04-cad-loft-sweep-surfacing-recommendation.md` §4)
- `Part.makeLoft(wires, solid=True, ruled=False, closed=False, maxDegree=5)` — smooth B-spline loft, G1
- `solid.makeOffsetShape(-2.0, tol=0.01)` — exact 2 mm wall
- `solid.cut(box)` — Boolean split
- `Part.makeFillet(solid, radius, edges)` — G1 fillet
- `solid.exportStep(path)` — STEP for CAM

---

## NUMBERED SOURCES

1. Blender 5.1 Manual — Curves, Geometry properties (Bevel/Taper/Offset/Extrude): https://docs.blender.org/manual/en/latest/modeling/curves/properties/geometry.html
2. YURI internal — Blender Department RUNBOOK (canonical operating manual, 1319 lines): `_SYSTEM/blender/RUNBOOK.md`
3. Blender API — bmesh.ops.bridge_loops: https://docs.blender.org/api/current/bmesh.ops.html#bmesh.ops.bridge_loops
4. Blender Manual — Resample Curve Node: https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/curve/operations/resample_curve.html
5. Sverchok README (GitHub, tested with Blender 5.1, 600+ nodes): https://github.com/nortikin/sverchok
6. Sverchok 1.4.0 docs — NURBS: Curves and Surfaces (scope disclaimer): https://nortikin.github.io/sverchok/docs/data_structure/nurbs.html
7. Blender Stack Exchange — Boolean operations in Sverchok (CSG reliability): https://blender.stackexchange.com/questions/212949/boolean-operations-in-sverchok
8. Blender Manual — Extrude Mesh Node: https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/mesh/operations/extrude_mesh.html
9. Blender Manual — Curve to Mesh Node (verified verbatim 2026-06-24): https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/curve/operations/curve_to_mesh.html
10. Blender Manual — Mesh Boolean Node: https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/mesh/operations/mesh_boolean.html
11. Blender Manual — Fill Curve Node: https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/curve/operations/fill_curve.html
12. Blender Artists Forum — Geometry Nodes Performance Optimization: https://blenderartists.org/t/geometry-nodes-performance-optimization/1588459
13. YURI internal — CAD loft/sweep surfacing recommendation (sister doc): `02_RESOURCES/RESEARCH/3d-modelling/04-cad-loft-sweep-surfacing-recommendation.md`
14. YURI internal — HK45 blocking build log (live method history s1–s3): `_SYSTEM/blender/BLOCKING-BUILD-LOG.md`

---

## UNVERIFIED / FLAGGED ITEMS

- **Sverchok + Blender 5.0/5.1 runtime compatibility:** the README claims "tested with 5.1" [5] but the YURI pipeline has not exercised Sverchok live. Treat as "installs and loads" until a live smoke test runs a CSG Boolean + NURBS-curve node in Blender 5.0.
- **GN Mesh Boolean MANIFOLD solver on 120k-face scan meshes:** verified stable for clean manifold input; the build-log s3 "silent no-op" was on a dirty multi-union mesh, not a GN-resolver bug. Always `heal_mesh` first.
- **Per-gun parameter auto-extraction (Phase 2a):** the JSON schema in §5.4 is derived from the HK45 manual measurement pass. Automated extraction (bounding-box probes, silhouette analysis) is the next engineering step and is not yet validated against a second gun.
- **Plasticity:** not assessed here; the sister doc `04-cad-loft-sweep-surfacing-recommendation.md` §4 flagged its docs unreachable and no scripting path. Unchanged.
