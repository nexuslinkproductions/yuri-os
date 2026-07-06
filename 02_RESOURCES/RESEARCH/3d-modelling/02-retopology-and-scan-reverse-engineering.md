# Retopology & Scan Reverse-Engineering
**Reference: Clean hard-surface topology from noisy 3D scans — pistol/holster mold pipeline**
_Date: 2026-06-23 | Updated: 2026-06-23 (MC/DC mechanism detail; Smooth-by-Angle 4.1; QuadRemesher crease threshold; Instant Meshes sharp fork) | Confidence ratings per section | Blender 4.x/5.0 target_

---

## 12-Line Summary

Voxel remesh converts the scan to an isosurface over a signed-distance field — it has zero
awareness of the input's sharp features, so every hard edge becomes a rounded bead.
QuadriFlow on top of that blob inherits the problem and adds chaotic flow (no feature vectors
to align quads to).
The fix is a two-stage approach: (1) **edge-preserving scan cleanup** that kills photogrammetry
noise on flat faces while locking crease geometry, then (2) a **feature-driven remesh**
(Remesh-SHARP or Decimate-PLANAR) followed by either manual or guided auto retopo.
The shrinkwrap-cage workflow — build a clean low-poly proxy, snap it to the original scan with
Shrinkwrap, bake normals back — recovers fine detail without sacrificing topology quality.
When a manufacturer CAD STL exists alongside the scan, use the CAD for all hard edges and
parametric surfaces, and the scan only to verify real-world geometry deviations.
For a 220 mm pistol with mixed flats, cylinders, fillets, and serrations the recommended
ordered pipeline is: import scan → Limited-Dissolve + Decimate-PLANAR cleanup → Remesh-SHARP
→ QuadriFlow (`use_preserve_sharp=True`) → manual Poly-Build correction on critical edges →
Shrinkwrap-bake → weighted normals → export.

---

## 1. Why Voxel Remesh Rounds Edges — and Why QuadriFlow Fails on the Result

**Confidence: HIGH** | Sources: [1][2]

Blender's Voxel remesh constructs a signed-distance field (SDF) on a uniform grid, then
extracts an isosurface (Marching Cubes / OpenVDB). The SDF is a scalar field; it carries no
directional feature information. When a sharp 90-degree corner is voxelized at voxel-size V,
the isosurface is forced to pass through the center of each voxel — the minimum rounding radius
is ~0.5 × V. At our working resolution (118k face target ≈ ~0.3 mm voxel for a 220 mm object)
every edge is rounded by 0.15–0.3 mm. That is catastrophic for mold parting lines.

**The root cause is the Marching Cubes vertex placement rule**: MC places new vertices via linear
interpolation along voxel grid edges, locking them to the lattice. A sharp crease requires
a vertex exactly AT the crease intersection — but MC cannot place vertices off the grid, so
the intersection is rounded by the grid spacing. The algorithm "lacks flexibility, as its
vertices consistently align to a fixed lattice; non-axis-aligned sharp features are inherently
misrepresented." [1b] Dual Contouring (used in Remesh-SHARP) solves this by placing vertices
**inside each voxel cell** optimized to the gradient planes — it can reconstruct sharp corners
exactly. This is the precise reason to prefer Remesh-SHARP over Remesh-VOXEL for scan cleanup.

QuadriFlow (used in Blender's Quad Remesh) works by computing a smooth cross-field over the
surface and aligning quads to it. When applied to a voxel blob:
- The cross-field has no hard-feature vectors to anchor to — every region is equally smooth.
- Quad orientation is driven by curvature, which on a rounded blob is near-zero on flats.
- The algorithm produces random poles, uneven density, and edge loops that wander diagonally
  across what should be flat panels.

`use_preserve_sharp=True` in QuadriFlow can only help if the **input mesh** carries genuine
sharp edges. On the voxel blob it has nothing to preserve. [2]

---

## 2. Scan Cleanup Before Retopo: Noise Reduction with Edge Preservation

**Confidence: HIGH** | Sources: [3][4][5]

Raw photogrammetry output has two distinct noise types that require opposite treatment:

**High-frequency noise on flat/smooth surfaces** (bumps, texture bleed, photogrammetry
speckle): safe to smooth. Use Blender Sculpt Mode → Smooth brush or the **Smooth modifier**
(iterations ≤ 3, strength 0.3–0.5). Conceptually this is bilateral/edge-preserving smoothing:
smooth WITHIN a neighborhood that has similar normal direction, leave edges between differently-
oriented neighborhoods intact. In practice, sculpt-smooth with a large radius on flat areas
works adequately.

**Edge noise** (saw-teeth on corners, bumpy bevels): must NOT be smoothed away; it marks where
the crisp edge actually lives.

Concrete Blender cleanup sequence:
1. **Merge by Distance** (M → Merge by Distance, threshold 0.01 mm) — collapses duplicate
   vertices from scan stitching.
2. **Fill Holes**: Edit Mode → Mesh → Clean Up → Fill Holes (sides ≤ 4 for small scan gaps).
3. **Recalculate Normals Outside** (Alt+N → Recalculate Outside) — photogrammetry often
   produces inward-flipped faces.
4. **Weighted Normal modifier** — resolves normal direction averaging so flat areas read flat
   even on a dense scan mesh; add BEFORE any retopo step.
5. **Limited Dissolve** (X → Limited Dissolve, angle 2–5°) — collapses near-coplanar micro-
   triangles on flat panels WITHOUT touching corners. This alone can drop a 500k-tri flat-panel
   mesh to 50k with no visible change to edges.
6. For photogrammetry bumps on plastic surfaces: Sculpt Mode → Smooth brush (large radius,
   low strength) in 2–3 passes over flats only. Avoid near edges.

**Blender 4.1+ Smooth by Angle Modifier**: replaces the old "Auto Smooth" checkbox. Added
automatically via right-click → Shade Auto Smooth. Key parameter: angle threshold (default 30°)
— edges where neighboring face normals differ by more than the threshold are treated as sharp;
gentler transitions are smoothed. This is effectively edge-preserving normal smoothing without
touching geometry. For scan noise: set threshold at 20–25° so small-amplitude bumps (< 20°)
get smoothed away, while genuine hard edges (> 25°) are preserved as sharp. Note: requires
Merge by Distance first — duplicate vertices at zero distance break the topological normal
computation. [3b]

MeshMixer and MeshLab offer stronger bilateral smoothing (Laplacian + feature angle lock)
if the Blender approach is insufficient; export OBJ, clean externally, reimport. [3]

---

## 3. Sharp-Edge-Preserving Remeshing

**Confidence: HIGH** | Sources: [1][6]

### Remesh Modifier: SHARP mode

`bpy.ops.object.modifier_add(type='REMESH')` → mode = 'SHARP'

The Sharp mode uses an octree-based surface reconstruction (dual-contouring style) that
explicitly preserves sharp features from the input mesh. Unlike Voxel/Marching-Cubes, dual
contouring places mesh vertices at the intersection of gradient planes — which naturally
reconstructs sharp corners when the input has them.

Key parameters:
- **Octree Depth** (4–8): resolution. Depth 7–8 for ~0.15 mm feature retention on a 220 mm
  part. Higher = slower but sharper edges.
- **Sharpness** (default 1.0): higher values reproduce input edges more closely; lower values
  filter noise. For clean scan data after cleanup: 1.0–1.5. For noisy input: 0.5–0.8.
- **Scale** (0.0–0.99, default 0.9): ratio of largest model dimension over grid size.
- **Smooth Shading**: off for initial inspection; enables flat-shaded edge verification.

Sharp mode retains triangles (not quads). It is a **cleanup step**, not final topology.
Use it after Limited Dissolve to get a manifold, crease-aware mesh to feed into QuadriFlow.

### Decimate Modifier: PLANAR mode

`bpy.ops.object.modifier_add(type='DECIMATE')` → decimate_type = 'DISSOLVE'

Planar mode finds all edges whose dihedral angle is **below** the Angle Limit, and dissolves
them — collapsing coplanar adjacent faces into n-gons. Edges AT or ABOVE the threshold survive
untouched. This is the correct approach for mechanical scans.

Key parameters:
- **Angle Limit** (default 5°): start at 1–2° for scan data (tighter = fewer false collapses).
  Increase to 5–8° if stubborn micro-triangles remain on known-flat faces.
- **Delimit: Sharp** — do NOT dissolve edges marked as Sharp. Mark crease edges as Sharp first
  (Edge Properties → Mark Sharp), then Decimate PLANAR with Delimit:Sharp = ON.
- **Delimit: Seam / Material / Normal** — additional protection layers.
- **All Boundaries**: OFF for mechanical parts (protects open boundary edges).

Combined workflow: Remesh-SHARP (depth 7) → apply → mark all visible creases as Sharp edges
(Edge Select → Select Sharp Edges, angle 25–45°, Mark Sharp) → Decimate PLANAR 2° with
Delimit:Sharp → result is a clean triangulated mesh with hard edges preserved and coplanar
faces dissolved. [6]

---

## 4. Retopology Methods

**Confidence: HIGH** | Sources: [2][7][8][9]

### 4a. Manual Retopology (Poly Build + F2 + Snapping)

Best for high-stakes edges (trigger guard, rail slots, parting line). Workflow:
1. Place scan in collection, set viewport overlay to **Wireframe on Shades**.
2. Add empty Mesh object as retopo surface.
3. Enable **Snap to Face** (Shift+Tab → Face, Project Individual Elements ON).
4. Proportional editing OFF. X-Ray ON.
5. Use **Poly Build** tool (toolbar) to click-create quads directly on the scan surface.
6. **F2 addon** (built-in): press F with one vertex/edge selected to auto-fill quads following
   edge direction — dramatically speeds flat-panel fills.
7. Add **Shrinkwrap modifier** (mode: Nearest Surface Point, Wrap Method: Above Surface,
   Offset 0.001 m) to the retopo mesh — keeps every vertex exactly on the scan as you work.

Key rule: place explicit edge loops ALONG every visible scan crease before filling the interior.
Those first loops become the "skeleton"; F2 fills between them. Never fill first and add
crease loops later — it creates pole chaos.

### 4b. Auto Retopology: QuadriFlow

```python
bpy.ops.object.quadriflow_remesh(
    use_preserve_sharp=True,
    use_preserve_boundary=True,
    smooth_normals=False,
    target_faces=12000,   # adjust for detail level
    seed=0
)
```

`use_preserve_sharp=True` activates the `-sharp` code path from the original QuadriFlow paper —
the algorithm scores orientation field samples with extra weight near detected feature lines.
**Only effective if the input mesh has real sharp edges** (post Remesh-SHARP or Decimate-PLANAR
preprocessing). Pre-decimate to <100k tris before running; above that the algorithm stalls or
fails. [2]

Known issue: `use_preserve_sharp=True` can create triangular holes near very sharp corners
(Blender bug T70546 [2]). Workaround: run with sharp=True, manually patch the few holes with
F-fill, then continue.

### 4c. Instant Meshes (External, Free)

Instant Meshes [8] provides interactive feature-line detection via a `creaseAngle` parameter
and a dedicated "Creases" visualization layer. The viewer exposes `mCreaseMap` for crease
detection alongside boundary and non-manifold vertex detection. Paint sharp crease lines in the
UI, set target edge count, remesh. The algorithm aligns quad flow to the painted feature lines
with high reliability. Export the result as OBJ, import into Blender. Best for organic-ish
surfaces with irregular curvature (grip texture, curved grip body). Parameters:
- **Crease weight 1.0**: full respect for painted creases.
- **Adaptive sizing ON**: concentrates quads at high-curvature regions (corners, fillets).
- **Rosy/Posy iterations**: 6 outer / 6 inner for convergence on mechanical surfaces.
- For hard-surface forks with better crease handling: `GeorgeAdamon/instant-meshes-sharp`
  (GitHub) — fork specifically targeting sharp edge preservation on mechanical geometry. [8b]

### 4d. QuadRemesher (Commercial Blender Addon, Exoside)

Developed by Maxime Rouca (same author as ZBrush's ZRemesher). Key hard-surface feature:
**"Detect Hard Edge by Angles"** — analyzes dihedral angles and flags edges above **30°**
(configurable) as crease boundaries; the quad-flow solver places topology boundaries at those
creases so the hard edge survives in the output quad mesh. Additionally exposes **"Use Normals
Creasing"** to use existing normal-encoded hard edges (not just geometry angles) as guides.
Respects Blender Mark Sharp directly. For scan data: mark sharp edges first (§3 pipeline),
then run QuadRemesher — the crease detection gets corroborating geometry and normal evidence.
~$24 USD; outperforms QuadriFlow on edge alignment and pole distribution for hard-surface parts.
Not required for single-part pipeline. [13]

### The Shrinkwrap Cage Workflow (Semi-Auto → Manual Finish)

This is the production pattern for maximum fidelity:
1. Run QuadriFlow on the cleaned scan → get ~12k-face draft topology.
2. Add **Shrinkwrap modifier** to the QuadriFlow result, targeting the ORIGINAL high-res scan.
   Mode: Nearest Surface Point. Offset: 0.0 (snap exactly to surface).
3. The Shrinkwrap "re-drapes" the auto topology onto the exact scan surface — compensates for
   QuadriFlow drift on flat areas.
4. Apply Shrinkwrap. Add **Data Transfer modifier** (source: original scan, data: Face Corner
   Normals / Custom Normals). This bakes the scan's normals onto the retopo mesh — flat areas
   read as perfectly flat, curved areas as smooth, without needing extra geometry.
5. Result: clean quad topology, exact surface match, scan-accurate normals. [7]

---

## 5. Sharp Edges on the Retopo Mesh

**Confidence: HIGH** | Sources: [9][10]

A retopo mesh looks great in the viewport but ships flat unless sharp edges are explicitly
encoded. Standard pipeline:

1. **Mark Sharp**: Edit Mode → Edge Select → Select Sharp Edges (angle 25–40° for holster
   geometry, where flats meet bevels) → Edge Properties → Mark Sharp.
2. **Crease** (Shift+E, value 1.0) on subdivision-cage meshes: tells the Subdivision Surface
   modifier to hold the edge tightly. Creasing is portable; crease values export in FBX/GLTF.
   Support loops are more reliable across renderers but add geometry.
3. **Support / Holding Edges**: insert a loop 0.2–0.5 mm from each hard edge on both sides.
   This is the canonical hard-surface technique — the two flanking loops pull the subdivided
   surface tight to the corner. Tighter loops = sharper edge. For mold geometry (no SubD):
   support loops are still useful to signal to the CAM toolpath where a hard edge lives.
4. **Weighted Normal Modifier** (add LAST in modifier stack): blends normals by face area,
   so large flat panels get pure flat normals and the small transition faces near a bevel get
   averaged correctly. Set Mode: Face Area, Weight: 50. This is the key to flat-reads-flat
   without smoothing groups. [9]
5. **Auto-Smooth** (Object Properties → Normals → Auto Smooth, angle 30–60°): splits normals
   at edges above the threshold without adding geometry. Works in conjunction with Mark Sharp
   (Mark Sharp edges always split regardless of angle).

For mold geometry: weighted normals + mark sharp is the minimum; add support loops if the
downstream CAM reads vertex normals for surface finish guidance.

---

## 6. Using a CAD Reference Alongside the Scan

**Confidence: HIGH** | Sources: [4][11][12]

When a manufacturer CAD STL/STEP exists (e.g., a Glock 17 from a licensed CAD library):

**Strategy**: CAD is authoritative for dimensions and crisp edges. Scan is authoritative for
the real physical part's deviations (worn surfaces, user-fitted modifications, assembly gaps).

**Alignment (ICP-style in Blender)**:
1. Import both scan and CAD STL into the same scene.
2. In Edit Mode, manually align using 3-point correspondence: select a vertex on the scan,
   note coordinates; snap the CAD mesh to match at ≥ 3 landmark points (front face, rail
   start, grip heel).
3. For higher accuracy: MeshLab's ICP registration (Filters → Sampling → ICP) or
   CloudCompare (free) → align scan to CAD → export aligned scan back to Blender.
4. Verify with Mesh Analysis overlay (Face Orientations, Thickness) after alignment.

**Region-based sourcing**:
- Flat panels, cylinder bore axes, rail geometry, sharp corner radii → USE CAD mesh directly.
  Shrinkwrap the retopo onto the CAD surface in these regions.
- Grip texture, worn retention surfaces, real-world bevel transitions → USE scan.
  Shrinkwrap onto the scan in these regions.
- Vertex Groups + Shrinkwrap modifier weight painting: assign a vertex group to "CAD regions",
  another to "scan regions", use two stacked Shrinkwrap modifiers each masked by group.

**Boolean-snap hybrid**:
For critical flat faces (trigger guard plate, rail interface): Boolean Intersect the retopo
mesh with a CAD-sourced plane/primitive to get mathematically flat faces. Then bridge to
surrounding scan-sourced geometry with connecting edge loops.

**Deviation check**: after assembly, add a Mesh Display → Face Normals overlay and visually
verify no surface normal reversals at the CAD/scan seam. Measure critical datums with
the Measure tool (N panel → View → Measure) against the original CAD dimensions. [11][12]

---

## 7. Recommended Pipeline: 220 mm Pistol, Manufacturing-Ready

**Confidence: HIGH** | Sources: [1][2][3][6][7][9]

Goal: crisp edges, even quad topology, watertight, mold-ready. Ordered steps:

```
STEP 1 — IMPORT & VERIFY
  Import scan OBJ/STL.
  Modifier: Remesh (mode=SHARP, depth=7) → apply. Verify face count ~80–120k.
  Sculpt: Smooth brush (radius 0.05 m, strength 0.3) × 3 passes on flat panels only.

STEP 2 — EDGE MARKING
  Edit Mode → Select Sharp Edges (angle 30°) → Mark Sharp.
  Manually inspect; add/remove as needed. These protect through all downstream steps.

STEP 3 — PLANAR DECIMATION
  Decimate modifier: PLANAR, Angle Limit 2°, Delimit: Sharp ON.
  Result: coplanar face clutter dissolved, all marked-sharp edges survive.
  Target: 20–40k faces on flat-heavy regions.

STEP 4 — QUADRIFLOW AUTO RETOPO
  bpy.ops.object.quadriflow_remesh(
      use_preserve_sharp=True,
      use_preserve_boundary=True,
      target_faces=12000,
      seed=0
  )
  Inspect for triangular holes near sharp corners (T70546 bug); patch manually with F-fill.

STEP 5 — SHRINKWRAP CAGE
  Add Shrinkwrap modifier to QuadriFlow result, target=original scan,
  mode=NEAREST_SURFACE_POINT, offset=0.001 m.
  Apply. Re-drapes topology onto exact scan surface.

STEP 6 — DATA TRANSFER NORMALS
  Add Data Transfer modifier, source=original scan,
  data layers: Face Corner → Custom Normals.
  Apply. Flat areas now report flat normals without extra geometry.

STEP 7 — MANUAL CORRECTION PASS
  Poly Build + F2: correct pole placement, redirect edge loops through rail
  slots, trigger guard, slide serrations. Mark Sharp on any newly created
  hard edges.

STEP 8 — SUPPORT EDGES
  Insert support loops 0.2 mm from all mold-critical corners (parting line,
  retention lip, rail shoulders). Crease = 1.0 on those same edges.

STEP 9 — WEIGHTED NORMALS
  Add Weighted Normal modifier (mode=FACE_AREA, weight=50) LAST in stack.
  Enable Auto Smooth 35°.

STEP 10 — WATERTIGHT CHECK
  Edit Mode → Select → Select All by Trait → Non Manifold.
  Any selection = holes; fill or bridge. Mesh must be 0 non-manifold edges
  before export.

STEP 11 — EXPORT
  Export FBX or STL (for mold CAM): apply all modifiers, triangulate OFF
  for FBX (CAM can triangulate on import), ON for STL.
  Verify bounding box matches physical measurements ±0.1 mm.
```

**Serrations** (fine slide serrations, ~0.5 mm pitch): do NOT retopo at full resolution.
Model as a separate Boolean detail on top of the cleaned slide surface. Boolean Difference
from a serration array primitive → apply → export as a separate mesh or as a Boolean
modifier for non-destructive mold iteration.

**Cylinders** (barrel hood, screw holes): Blender Cylinder primitive (32–64 verts) manually
placed and Shrinkwrapped onto the scan cylinder axis. This gives true circular cross-section
vs. the scan's inevitably faceted cylinder approximation.

---

## Sources

1. [Remesh Modifier – Blender 5.1 Manual](https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/remesh.html)
   1b. [Handling small features in isosurface generation using Marching Cubes – ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/0097849394900116) | [Isosurface Extraction – swiftcoder.wordpress.com](https://swiftcoder.wordpress.com/planets/isosurface-extraction/)
2. [QuadriFlow Remesh – Blender Python API & Retopology Manual](https://docs.blender.org/manual/en/3.3/modeling/meshes/retopology.html) | [T70546 bug report](https://developer.blender.org/T70546) | [Object Operators API – bpy.ops.object.quadriflow_remesh](https://docs.blender.org/api/2.83/bpy.ops.object.html)
3. [Cleaning Up a 3D Scan – 3D-Ace](https://3d-ace.com/blog/cleaning-up-a-3d-scan/)
   3b. [Smooth by Angle Modifier – Blender 5.1 Manual](https://docs.blender.org/manual/en/latest/modeling/modifiers/normals/smooth_by_angle.html) | [Auto-smooth by angle in Blender 4.1 – CGCookie](https://cgcookie.com/community/18459-auto-smooth-by-angle-in-blender-4-1)
4. [3D Scan to CAD Reverse Engineering – Verisurf](https://www.verisurf.com/blog/article/3d-scan-to-cad-reverse-engineering/)
5. [Smart Mesh Retopology for Scanned Meshes – Tripo3D](https://www.tripo3d.ai/blog/explore/smart-mesh-retopology-for-scanned-meshes)
6. [Decimate Modifier – Blender 5.1 Manual](https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/decimate.html) | [Decimate without Losing Edges – Meshmixer.org](https://meshmixer.org/decimate-without-losing-edges-reduce-remesh-best-practices/)
7. [Shrinkwrap Modifier for Retopology – Blender Base Camp](https://www.blenderbasecamp.com/how-to-use-the-shrinkwrap-modifier-for-retopology/) | [Data Transfer Modifier – Polycount FWN discussion](https://polycount.com/discussion/188399/solved-blender-face-weighted-normals-controlling-bevel-weights)
8. [Instant Meshes – wjakob/instant-meshes GitHub](https://github.com/wjakob/instant-meshes) | [Feature-line driven quad remeshing](https://www.quadmesh.cloud/)
   8b. [instant-meshes-sharp fork – GeorgeAdamon/instant-meshes-sharp GitHub](https://github.com/GeorgeAdamon/instant-meshes-sharp)
9. [ReTopologyModeling – Polycount Wiki](http://wiki.polycount.com/wiki/ReTopologyModeling) | [Topology – Polycount Wiki](http://wiki.polycount.com/wiki/Topology) | [Hard Surface Retopo Workflow – Polycount Forum](https://polycount.com/discussion/202539/hard-surface-retopologize-whats-your-hardsurface-retopology-workflow)
10. [Poly Build Tool – Blender 5.1 Manual](https://docs.blender.org/manual/en/latest/modeling/meshes/tools/poly_build.html) | [Blender Retopology Techniques – RebusFarm](https://rebusfarm.net/blog/how-to-retopology-in-blender-from-manual-techniques-to-automatic-retopology)
11. [Reverse Engineering with Metashape – Agisoft](https://www.agisoftmetashape.com/reverse-engineering-objects-with-metashape-from-scan-to-cad/)
12. [Geomagic Wrap – Hexagon / scan-to-CAD pipeline](https://hexagon.com/products/geomagic-wrap) | [How to Convert 3D Scan to CAD – QuickSurface](https://www.quicksurface.com/3d-scan-to-cad-how-to-turn-stl-obj-scan-data-into-an-editable-model/)
13. [QuadRemesher User Documentation (PDF) – Exoside](https://www.exoside.com/quadremesherdata/QuadRemesher_1.0_UserDoc.pdf) | [Quad Remesher for Blender – SuperRenders guide](https://superrendersfarm.com/article/quad-remesher-blender-retopology)
