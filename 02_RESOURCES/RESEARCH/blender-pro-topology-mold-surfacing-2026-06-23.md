# Blender Pro Topology & Mold Surfacing — Kydex Holster Blocking
*220mm pistol positive · thermoforming mold · 2026-06-23*

---
## 1. VOXEL-BLOB → CLEAN

**WHY QuadriFlow fails on a voxel blob.** QuadriFlow requires manifold, consistently-oriented input. A voxel remesh at moderate resolution produces non-manifold edges at tight geometry (trigger guard, rail slot), causing QuadriFlow to crash or abort [1]. On a smooth featureless blob the cross-field solver has zero alignment cues (no sharp-edge seams, no UV islands) → quad orientation is pseudo-random, edge density is uneven, face-area CoV > 0.6. To preserve 1mm detail on 220mm you start with ~600k–1M tris; QuadriFlow at 5k–12k target quads can't collapse that ratio without chaotic poles. [2]

| Chain | Wins when | Face count (220mm) | Verdict |
|---|---|---|---|
| **(a) QuadriFlow** (Remesh → Quad) | Clean manifold organic input | 5k–12k quads | ❌ Fails on voxel blob |
| **(b) RetopoFlow/Instant Meshes** | Production edge flow, hard-surface | 6k–12k quads | ✅ Best flow quality |
| **(c) Voxel fine + Decimate Planar** (angle 1–5°) | Print/CNC export only, no further sculpt | 40k–80k tris | ✅ Fast, direct-to-STL |
| **(d) Loft cross-section rings** (Bridge Edge Loops) | Swept channel, controlled retention loops | 1.5k–8k quads | ✅ Best for our case |

Instant Meshes (free): paint feature creases on slide edges before solving → ~85% quads, field-aligned. [3][4]
Decimate Planar preserves sharp angle boundaries and material seams; does NOT produce quads. [5]
Loft: 10–14 Bézier rings resampled to N=32, converted to mesh, `Bridge Edge Loops` (PATH, cuts=3). [6]

---
## 2. SURFACE QUALITY WITHOUT SHRINKING FEATURES

Staircase from 0.3mm voxel ≈ 0.15mm step on inclined faces. Naive smooth collapses sight tips.

- **Laplacian Smooth** (lambda=0.3–0.5, iter=5): curvature-flow Laplace-Beltrami, preserves macro shape, slight shrinkage per pass. Best for barrel/backstrap. [7]
- **Corrective Smooth** (Factor ≤ 0.5, Rest Source=Orco): volume-envelope preserving; good post-deformation fix. Less aggressive than Laplacian on features. [8]
- **Standard Smooth**: uniform averaging → most shrinkage → avoid on features.
- **Volume Preserving Smoothing addon** (sharp-edge rail mode): explicit rail edges prevent volume collapse; best option for hard-surface with marked creases. [9]

**Canonical fidelity restore — "remesh → retopo → shrinkwrap to original":** After any smooth pass, add Shrinkwrap modifier → Target = original voxel solid, Mode = Nearest Surface Point, Offset = +0.05mm. This re-anchors every vertex to the reference, cancelling accumulated drift. Stack order: `Subdivision(L2) → Shrinkwrap → Bevel`. [10][11]
Mark crease edges (muzzle crown, sight base) BEFORE smoothing — Laplacian respects boundary vertex groups; creased edges act as rails.

---
## 3. LOFT/SWEEP TOPOLOGY FOR THE CHANNEL

Holster blocking is a directional sweep along draw-Y. Lofted equal-N rings guarantee edge loops coincide with retention cross-sections (trigger guard notch, slide crown) — critical for sculpting retention bumps later.

**Vertex correspondence.** Each ring must have identical N=32 (or 64) verts:
1. Closed Bézier curve per cross-section → `Object Data → Resolution Preview U = N/4`.
2. `Object → Convert to Mesh` → N uniform verts per ring.
3. Join all rings (`Ctrl+J`) → Edit Mode → Select all → `Edge → Bridge Edge Loops`:
   `interpolation=PATH, number_cuts=3, smoothness=1.0`. [6]

Rings that change size (barrel ∅11mm → muzzle hood ∅14mm): Bridge maps vertex i→i by index; consistent N is the only requirement. No manual correspondence needed.

**bmesh low-level:** `bmesh.ops.bridge_loops(bm, edges=boundary_edges_A + boundary_edges_B)` — returns `{'faces': [...]}`. [12]
Resample automation: `bpy.ops.curve.resample(count=N)` before convert; set `use_cyclic_u=True` for closed ring.

---
## 4. MANUFACTURING SURFACE

**Draft angles** (vacuum-formed Kydex over 3D-printed male mold):
- Lateral walls: **3–4°** minimum on male mold; 5° for deep-draw pockets (trigger guard depth > 15mm). [13][14]
- Female undercut areas: 2–3°.

**Minimum inside fillet radius** to prevent stress whitening: ≥ **2mm** (≈2× Kydex 0.093" sheet thickness). Whitening on corners = sheet too cold OR radius < 1× thickness. Formlabs: mold corner radius ≥ max(1.27mm, sheet thickness). [14]

**Surface finish.** FDM as-printed Ra ≈ 5–15µm → transfers layer texture to Kydex and impedes demold. Sand 120→220→400→800→1500 wet; spray lacquer seal. Target Ra ≤ 0.8µm. [15]

**Watertight/manifold.** Zero non-manifold edges, zero self-intersections. `Mesh → Cleanup → Fill Holes` + `Merge by Distance (0.001mm)` before STL export.

**Wall minimums** (PETG/ASA FDM mold): structural walls ≥ 2mm; base ≥ 3mm. Vacuum draw-through vents: ∅ 1.0mm, one per ~25mm² of mold face. [14]

**Y-split parting plane.** Bisect at widest XZ silhouette. Add 0.5mm locating land at seam; no gap > 0.1mm or Kydex flash forms.

---
## 5. QC METRICS (bpy/bmesh-computable)

All metrics computable from `bmesh.types` (`is_manifold`, `calc_area`) [12]:

| Metric | bpy expression | GREEN gate |
|---|---|---|
| Quad ratio | `sum(1 for f in bm.faces if len(f.verts)==4) / len(bm.faces)` | > 0.95 |
| Non-manifold edges | `sum(1 for e in bm.edges if not e.is_manifold)` | = 0 |
| Face-area CoV | `stdev([f.calc_area() for f in bm.faces]) / mean(...)` | < 0.30 |
| Min normal dot | `min(e.link_faces[0].normal.dot(e.link_faces[1].normal) for e in bm.edges if len(e.link_faces)==2)` | > 0.0 |
| Edge-length variance | `stdev([e.calc_length() for e in bm.edges]) / mean(...)` | < 0.25 |
| Near-doubles | `len(bmesh.ops.find_doubles(bm, verts=bm.verts, dist=0.001)['targetmap'])` | = 0 |

---
## 6. RECOMMENDED PIPELINE

**A. REFERENCE** — Voxel Remesh 0.3mm → hide, never modify (~800k tris ground truth).
**B. LOFT SKELETON** (2–3h) — 12 Bézier rings (heel/grip-mid/triggerguard-entry+base/frame-ledge/dust-cover/muzzle-shoulder+crown), resample N=32, convert mesh, join, Bridge Edge Loops (PATH, cuts=3) → ~2k quad surface.
**C. SHRINKWRAP RESTORE** — stack: `Subdivision(L2) → Shrinkwrap(NearestSurface +0.10mm, target=REF)`, apply; Laplacian Smooth (lambda=0.3, iter=3) on non-crease vgroup; Shrinkwrap offset=0 again → ~8–12k quads ±0.15mm fidelity.
**D. FEATURE HARDENING** — Bevel muzzle/sight/retention ridge (0.3mm, segs=2); fillet inside corners ≥ 2mm; verify 3–4° draft; Boolean Bisect X=0 Y-split + 0.5mm parting land.
**E. QC + EXPORT** — `mesh_qc()` → GREEN gate; Merge by Distance 0.001mm + Fill Holes; STL export (apply all). Print: 0.1mm layer PETG/ASA, 4 perimeters, 3mm walls. Post-print: sand Ra ≤ 0.8µm, lacquer seal.

Modifier order: `Subdivision(2) → Shrinkwrap(+0.1mm) → Bevel(0.3mm)`

---
## SOURCES
1. Blender dev T70548 — Voxel Remesh non-manifolds break QuadriFlow: https://developer.blender.org/T70548
2. Blender Manual — Remesh (QuadriFlow/Voxel): https://docs.blender.org/manual/en/latest/modeling/meshes/retopology.html
3. RetopoFlow 4: https://superhivemarket.com/products/softwrap
4. MutaMesh/Instant Meshes/QuadWild: https://superhivemarket.com/products/mutamesh/docs
5. Blender Manual — Decimate: https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/decimate.html
6. Blender Manual — Bridge Edge Loops: https://docs.blender.org/manual/en/latest/modeling/meshes/editing/edge/bridge_edge_loops.html
7. Blender Wiki — Laplacian Smooth: http://builder.openhmd.net/blender-hmd-viewport-temp/modeling/modifiers/deform/laplacian_smooth.html
8. Blender Manual — Corrective Smooth: https://docs.blender.org/manual/en/latest/modeling/modifiers/deform/corrective_smooth.html
9. Volume Preserving Smoothing addon: https://bartoszstyperek.gumroad.com/l/vol_smooth
10. Ray Mairlot — Shrinkwrap retopo: https://www.raymairlot.co.uk/blog/the-shrinkwrap-modifier-a-hard-surface-modellers-best-friend
11. RebusFarm — retopo techniques: https://rebusfarm.net/blog/how-to-retopology-in-blender-from-manual-techniques-to-automatic-retopology
12. Blender Python API — bmesh.ops: https://docs.blender.org/api/current/bmesh.ops.html · bmesh.types: https://docs.blender.org/api/current/bmesh.types.html
13. CW Thomas — Thermoforming guide: https://cwthomas.com/thermoforming-plastic-sheets-a-practical-guide-for-engineers-new-to-the-process/
14. Formlabs — 3D-printed thermoforming molds: https://formlabs.com/white-papers/low-volume-rapid-thermoforming-with-3d-printed-molds/
15. PETG FDM surface roughness (NIH PMC9919812): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9919812/

**Confidence:** §1–3 HIGH (docs + dev tracker + API) · §4 MEDIUM-HIGH (Formlabs primary; official Kydex PDF 403-blocked, fell back to CW Thomas + Stratasys) · §5–6 HIGH

---
## SUMMARY
QuadriFlow on a voxel blob fails: cross-field needs feature cues, voxel remesher leaves non-manifolds that crash it. Winning chain for our case: (1) keep voxel solid as immutable reference; (2) sketch 10–14 Bézier rings resampled to N=32, loft with Bridge Edge Loops (PATH, cuts=3) → pure-quad swept surface; (3) Shrinkwrap back onto voxel reference (Nearest Surface Point, +0.1mm) to restore ±0.15mm fidelity; (4) Laplacian Smooth (non-crease vertex group) then second shrinkwrap pass → eliminates staircase without collapsing sight tips. Mold requirements: 3–4° draft lateral walls, inside fillets ≥ 2mm (prevents Kydex stress whitening), parting plane at widest XZ silhouette with 0.5mm locating land. FDM PETG/ASA: 0.1mm layers, sand to Ra ≤ 0.8µm, lacquer seal. QC gate: quad_ratio > 0.95, non_manifold = 0, face_area_CoV < 0.30, no flipped normals. Estimated: 2–3h loft + 1h QC/export vs 1–2 days from raw auto-remesh.
