# Scan → Clean Model → STEP → Mold Tooling (Blender Engineering)

**Product:** custom-gear.ch Kydex holster-mold tooling (HK45 class, ~220 mm, 2-piece lateral split).
**Scope:** (A) photogrammetry-scan reverse-engineering into a clean CAD-like model, (B) Blender mesh → STEP export, (C) manufacturing tooling design in Blender.
**Date:** 2026-06-24 · **Blender:** 5.0 (4.1+ deltas noted) · **Confidence:** per-section
**Local-first base:** `_SYSTEM/blender/RUNBOOK.md` (§3, §4, §9), `02_RESOURCES/RESEARCH/3d-modelling/02-retopology-and-scan-reverse-engineering.md`, `_SYSTEM/blender/BLOCKING-BUILD-LOG.md`.
**Online verification:** ≥2 primary sources per load-bearing claim; URLs inline; unverified items flagged `[UNVERIFIED]`.

---

## 12-LINE SUMMARY

1. **Voxel Remesh rounds edges because Marching Cubes (MC) locks output vertices to the voxel lattice** — a sharp crease requires a vertex exactly at the crease intersection, which MC cannot place off-grid, so the corner is rounded by ~0.5×voxel. Confirmed mechanism [S1][S2].
2. **Remesh SHARP mode is the correct edge-preserving alternative** — Blender docs state it "preserves sharp edges and corners" [S1]. The docs do **NOT** name the algorithm; "dual contouring" is the established inference from the 2.62 release notes lineage and secondary technical literature [S2][S3], flagged as inference not docs-confirmed.
3. **Decimate PLANAR (DISSOLVE) + Delimit:Sharp/Normals** is the simplest coplanar-facet flattener that keeps feature edges — well-suited to mechanical scans [S4].
4. **QuadriFlow `use_preserve_sharp=True`** only helps if the *input* mesh already carries real sharp edges (post-Rmesh-SHARP or post-Decimate-PLANAR); on a voxel blob it has nothing to preserve. Known artifact: triangular holes near very sharp corners (Blender tracker lineage — the specific id `T70546` is NOT independently re-confirmed in this audit `[UNVERIFIED-id]`, but the hole-artifact class is multi-source confirmed) [S5].
5. **Shrinkwrap cage + Data-Transfer normals** is the production pattern: clean low-poly proxy snapped (OUTSIDE_SURFACE) onto the raw scan, scan normals baked back — recovers flat-reads-flat without extra geometry [S6].
6. **Blender has NO native STEP/B-rep export** — it is a mesh (tessellation) tool, STEP is a B-rep (parametric) format. This is a fundamental representation mismatch, not a missing feature [S7][S8].
7. **FreeCAD round-trip** (Import mesh → Part → Create shape from mesh → Sew → Convert to solid → Refine → Export STEP) is the standard free path. It produces a faceted B-rep (planar patches), NOT a smooth NURBS solid — good enough for CAM that tolerates tessellation, inadequate if downstream expects analytic surfaces [S8][S9].
8. **Cascadio / trimesh-cascadio is STEP→GLB (IMPORT only)**, not an export path — corrects a common misreading. Blender's STEP-Importer extension wraps it for import [S10].
9. **CAD Exchanger** reads/writes STEP via its SDK/desktop converter (commercial) — use it as an *external* converter, not a Blender-native export [S11]. BlenderBIM/Bonsai exports **IFC**, not STEP, and is architecture-domain — not a mold path [S12].
10. **For a Kydex 3D-printed mold, STL is sufficient** — slicers (Bambu/PrusaSlicer/Cura) consume STL/3MF natively; a STEP adds no value for FDM. STEP matters only if René (Shapr3D) needs to *edit* the blocking parametrically, or for CNC machined molds [S13].
10b. **For René's Shapr3D editing handoff**: STEP (via FreeCAD round-trip) lets him import as a solid and modify sketches/features; STL imports as a dumb mesh he can only eyeball. Recommend STEP for the *design collaboration* artifact, STL for the *print* artifact.
11. **Mold finishing checklist:** 1–3° draft on draw-axis walls (Simple Deform TAPER or per-ring taper) · inner fillet ≥1.6 mm (Bevel, Kydex 0.5× sheet thickness rule) · parting line + split-mold (bisect + use_fill) · 2–4 asymmetric alignment pins/bores (3 mm) · 0.4–0.7% mold shrink scale · PETG 80–100% infill or ASA for repeated presses · support-free channel design [S14][S15][S16].
12. **Order of operations (scan → clean):** heal (Merge by Distance → Recalc Normals → Fill Holes → Dissolve Degenerate) → Limited Dissolve 2–5° → Remesh SHARP (depth 7, sharpness 1.0) OR Decimate PLANAR 2° + Delimit:Sharp → mark sharp edges → (optional) QuadriFlow preserve_sharp → Shrinkwrap cage → Data Transfer normals → Weighted Normal → watertight QC → export.

---

## PART A — SCAN → CLEAN ENGINEERING MODEL

### A.1 Why Voxel Remesh Ruins Sharp Edges (CONFIRMED mechanism)

**Confidence: HIGH** | Sources: [S1] Blender Manual · [S2] Marching Cubes / Dual Contouring technical literature

Blender's Voxel remesh (`RemeshModifier.mode='VOXEL'`) builds a signed-distance field (SDF) on a uniform grid, then extracts an isosurface via Marching Cubes (OpenVDB-backed). The SDF is a *scalar* field — it carries no directional feature information. The **root cause of edge-rounding is the Marching Cubes vertex-placement rule**: MC places each output vertex by linear interpolation *along a voxel grid edge*, locking it to the lattice. A sharp crease geometrically requires a vertex exactly AT the crease intersection; MC cannot place vertices off-grid, so the intersection is rounded by approximately half the voxel size (~0.5×V).

At our working resolution (118k-face target ≈ ~0.3 mm voxel for a 220 mm part), every hard edge is rounded by 0.15–0.30 mm — catastrophic for mold parting lines and retention geometry. This is the recurring failure documented in `BLOCKING-BUILD-LOG.md` (s1–s3 sessions).

**Secondary effect:** QuadriFlow run on the voxel blob inherits the problem and adds chaotic quad flow — the cross-field has no hard-feature vectors to anchor to, so quad orientation wanders diagonally across what should be flat panels. `use_preserve_sharp=True` can only help if the input already has sharp edges to preserve.

### A.2 Edge-PRESERVING Alternatives — Ranked Scan-RE Technique Table

| Rank | Technique | Mechanism | Edge preservation | Best for | Params | Risk / note |
|------|-----------|-----------|-------------------|----------|--------|-------------|
| **1** | **Decimate PLANAR (DISSOLVE) + Delimit:Sharp** | Dissolves edges whose dihedral angle < Angle Limit; edges marked Sharp are protected | HIGH — explicit feature protection | Noisy mechanical scans with many coplanar facets (the HK45 case) | Angle Limit 1–2° (scan), 5–8° (stubborn); Delimit:Sharp ON; mark sharp edges first | Produces n-gons on flats; triangulate later if slicer needs it [S4] |
| **2** | **Remesh SHARP mode** | Octree-based surface reconstruction that preserves sharp features (algorithm inference: dual-contouring family — **NOT docs-named**) [S1][S2] | HIGH on input that HAS sharp features | Re-sealing a noisy scan while keeping feature edges | Octree Depth 7–8 for ~0.15 mm on 220 mm part; Sharpness 1.0 (clean) / 0.5–0.8 (noisy); Scale 0.9 | Triangulated output; cleanup step not final topology. Flagged: docs say "preserves sharp edges and corners" but do NOT name the algorithm `[INFERENCE-not-docs]` [S1] |
| **3** | **Shrinkwrap cage + Data Transfer normals** | Build clean low-poly proxy manually, snap (OUTSIDE_SURFACE / NEAREST_SURFACEPOINT) onto raw scan, bake scan normals onto proxy | HIGH — proxy topology controls edges; normals carry the detail | Recovering flat-reads-flat without extra geometry; final-stage fidelity | Offset 0.001 m; Data Transfer → Face Corner → Custom Normals | Requires a clean proxy first (manual or QuadriFlow). The production pattern [S6] |
| **4** | **QuadriFlow `use_preserve_sharp=True`** | Cross-field quad alignment with extra weight near detected feature lines | MEDIUM — only if input has real sharp edges | Converting a cleaned mesh to all-quad topology | target_faces 8–12k; use_preserve_boundary=True | Known artifact: triangular holes near very sharp corners (Blender tracker lineage; specific id T70546 `[UNVERIFIED-id]`, hole class multi-source confirmed). Patch with F-fill. Stalls >100k tris [S5] |
| **5** | **QuadRemesher (Exoside, commercial ~$24)** | "Detect Hard Edge by Angles" (>30° configurable) flags crease boundaries; solver places topology boundaries at creases | HIGH — purpose-built for hard surface | When QuadriFlow pole distribution is inadequate | Crease angle 30°; Use Normals Creasing ON | Commercial; not required for single-part pipeline `[UNVERIFIED-pricing]` |
| **6** | **Instant Meshes + instant-meshes-sharp fork** | Interactive feature-line painting; quad flow aligns to painted creases | HIGH with painted guidance | Organic-ish regions (grip texture) | Crease weight 1.0; Adaptive sizing ON | External tool; OBJ round-trip. The `-sharp` fork targets mechanical geometry [S17] |
| **7** | **Manual retopo (Poly Build + F2 + Snap-to-Face)** | Human places edge loops along every crease | HIGHEST (human-gated) | Critical edges (trigger guard, rail slots, parting line) | Snap Face + Project Individual Elements | Slow; reserve for the few highest-stakes edges |

**Ranking rationale for a noisy gun scan → clean CAD-like flats:** the HK45 scan has many genuine flat panels (slide sides, roof, frame flats) separated by crisp feature edges (sight shoulders, rail slots, control nubs). The winning sequence is **#1 (PLANAR+Delimit:Sharp) on the cleaned scan**, optionally preceded by **#2 (Remesh SHARP)** if the scan is non-manifold and needs re-sealing, then **#4 (QuadriFlow)** only if all-quad topology is required for downstream UV/subdivision, finished by **#3 (Shrinkwrap cage + Data Transfer)** for flat-reads-flat fidelity.

### A.3 Order of Operations (heal → edge-preserving remesh → crisp)

```
1. HEAL
   Merge by Distance (0.001 m) → Fill Holes (sides ≤ 4) → Recalculate Normals Outside
   → Dissolve Degenerate → verify non_manifold_edges == 0
   (RUNBOOK §3.1 heal_mesh bmesh sequence — authoritative)

2. LIMITED DISSOLVE (edge-preserving noise reduction on flats)
   angle 2–5° → collapses near-coplanar micro-triangles WITHOUT touching corners.
   Optional: Smooth-by-Angle modifier (4.1+, threshold 20–25°) for normal-only smoothing.

3a. EDGE-PRESERVING REMESH (pick one)
    OPTION A — Remesh SHARP (if scan needs re-sealing):
      mode='SHARP', octree_depth=7, sharpness=1.0 → apply
    OPTION B — Decimate PLANAR (if scan already manifold):
      decimate_type='DISSOLVE', angle_limit=2°, Delimit:Sharp ON
      (mark sharp edges FIRST: Select Sharp 25–40° → Mark Sharp)

4. (OPTIONAL) QUADRIFLOW
   use_preserve_sharp=True, use_preserve_boundary=True, target_faces=10000–12000
   Pre-decimate to <100k tris. Patch triangular holes near sharp corners (F-fill).

5. SHRINKWRAP CAGE (fidelity recovery)
   Shrinkwrap modifier → target = ORIGINAL high-res scan
   mode=NEAREST_SURFACEPOINT, offset=0.001 m → apply

6. DATA TRANSFER NORMALS
   source = original scan → Face Corner → Custom Normals → apply
   Flat areas now report flat normals without extra geometry.

7. CRISP ENCODING
   Mark Sharp on all crease edges → Bevel (Limit:Weight, Segments 2, Harden Normals ON)
   → Weighted Normal modifier LAST (mode=FACE_AREA, weight=50–75)

8. WATERTIGHT QC GATE
   non_manifold_edges == 0 · inverted_normals < 1% · self_intersections == 0
   (RUNBOOK §7 mesh_qc_report — authoritative)

9. EXPORT (see Part B decision flow)
```

---

## PART B — MESH → CAD / STEP EXPORT

### B.1 The Fundamental Mismatch

Blender is a **mesh (tessellation)** tool: geometry is a discrete set of triangles/polygons approximating a surface. STEP (ISO 10303) is a **B-rep (boundary representation)** format: geometry is analytic surfaces/curves (planes, cylinders, NURBS) with parametric trim boundaries. **A mesh cannot become a "true" STEP without either (a) faceting each triangle into a planar B-rep face (lossy, heavy), or (b) reverse-fitting analytic surfaces to the mesh (hard, approximate).** Blender has no native STEP export for the same reason it has no native NURBS solid kernel — it is representationally the wrong tool for parametric B-rep [S7][S8].

### B.2 STEP-Export Decision Flow

```
Is the downstream consumer a 3D-print SLICER (Bambu / PrusaSlicer / Cura)?
├─ YES → Export STL (or 3MF). STEP adds ZERO value for FDM. DONE.
│         (wm.stl_export, binary, apply_modifiers=True — RUNBOOK §2.4)
│
└─ NO  → Does the consumer need to EDIT the geometry parametrically?
         (e.g. René in Shapr3D modifying sketches / features)
         │
         ├─ YES → Need a STEP. Go to B.3 (FreeCAD round-trip).
         │
         └─ NO  → Is it a CNC machined mold (CAM toolpath)?
                  │
                  ├─ YES → CAM that takes STL (most do): STL is sufficient.
                  │        CAM that requires STEP surfaces: go to B.3.
                  │
                  └─ NO  → STL. You do not need a STEP.
```

### B.3 STEP Paths — Verified Options

| Tool | Direction | What it does | True NURBS STEP? | Cost | Verdict |
|------|-----------|--------------|------------------|------|---------|
| **FreeCAD round-trip** | mesh → STEP | Import mesh → Part WB → Create shape from mesh → (Sew) → Convert to solid → Refine → Export STEP | NO — produces a **faceted B-rep** (planar patch per triangle). Downstream sees a solid but every face is a small flat polygon. Good for CAM that tolerates tessellation; useless if Shapr3D/SolidWorks expects analytic cylinders/planes. | Free | Standard free path. Best for Kydex-mold handoff to René [S8][S9] |
| **FreeCAD Part Loft/Sweep hybrid** | DXF sections → STEP | Blender bisects cross-sections → exports DXFs → FreeCAD `Part.makeLoft(wires, solid=True, ruled=False)` → true NURBS loft → `makeOffsetShape` exact wall → `exportStep` | YES — true analytic NURBS B-spline surfaces (G1 continuous) | Free | The precision path. Use for CNC molds or when René needs editable analytic surfaces. See `04-cad-loft-sweep-surfacing-recommendation.md` Tier B [S18] |
| **CAD Exchanger (desktop / SDK)** | external converter | Reads/writes STEP, SolidWorks, JT, STL, 30+ formats. Uses OCCT kernel. | YES on read (preserves source B-rep); mesh→STEP still facets | Commercial | Use as an *external* batch converter, not a Blender plugin. No first-party Blender addon `[UNVERIFIED-blender-addon]` [S11] |
| **Cascadio / trimesh-cascadio** | STEP → GLB only | OpenCASCADE-based Python lib; converts STEP *to* a triangulated GLB for loading into trimesh/Blender | N/A — **IMPORT only**, not export | Free/open | **Corrects a common misreading:** Cascadio is an IMPORT path, not an export path [S10] |
| **Blender STEP-Importer extension** | STEP → Blender mesh | Wraps Cascadio; drag-and-drop `.step`/`.stp` into Blender | N/A — IMPORT only | Free | Import use only [S19] |
| **STEPper addon** | primarily STEP import | Community mentions it imports STEP into Blender (textures lost) | N/A — import-focused `[UNVERIFIED-export]` | Low-cost | Not a robust export solution [S20] |
| **MStep (Blender Market)** | STEP import | Commercial STEP importer for Blender | N/A — import `[UNVERIFIED-export]` | Commercial | Import only [S21] |
| **BlenderBIM / Bonsai (IfcOpenShell)** | IFC, not STEP | Exports **IFC** (architecture BIM standard), not STEP. Domain-mismatched for molds | NO (wrong format) | Free/open | Do NOT use for mold tooling STEP export [S12] |

### B.4 When is STL "Good Enough" vs Must-Deliver STEP?

| Consumer | STL sufficient? | STEP required? | Why |
|----------|-----------------|----------------|-----|
| FDM 3D-print mold (PETG/ASA) | YES | No | Slicers tessellate anyway; STEP is lossy to mesh at import |
| SLA 3D-print mold | YES | No | Same — slicer wants tessellation |
| CAM for CNC machined mold | Often (most CAM reads STL) | Only if toolpath needs analytic surfaces | STL tessellates the toolpath; STEP preserves surfaces if the CAM surface-fits |
| René editing in Shapr3D | No (dumb mesh import) | YES | Shapr3D imports STL as non-editable geometry; STEP imports as an editable solid |
| Collaboration / revision history | Marginal | YES | STEP carries parametric features STL cannot |
| Tolerance inspection (CMM) | YES (mesh-based GD&T) | Optional | Either works; mesh-based is common now |

**For the custom-gear.ch Kydex pipeline:** deliver **STL for the 3D-print** and **STEP (via FreeCAD round-trip) for the René design handoff**. Two artifacts, two purposes. If René needs to modify blocking dimensions parametrically, escalate to the FreeCAD `Part.makeLoft` hybrid path (Tier B in `04-cad-loft-sweep-surfacing-recommendation.md`) for true analytic surfaces.

---

## PART C — MANUFACTURING TOOLING IN BLENDER

### C.1 Mold-Finishing Checklist

**Confidence: HIGH** | Sources: [S14] RUNBOOK §9 · [S15] thermoforming design guides · [S16] Kydex-specific

Run every item before exporting either mold half. Order matters.

```
[ ] 1. DRAFT ANGLE (1–3°) on all walls parallel to the draw (open) axis
       - Method A: Simple Deform TAPER (deform_axis = open axis, factor = tan(angle°) × 2)
       - Method B (preferred): taper each cross-section ring outward from the parting
         plane during the build stage (cleaner than post-applied taper)
       - Male (positive) mold: 1–2°. Female (cavity) mold: 2–4° (deeper draw needs more).
       - Verified basis: thermoforming design guides recommend ≥2° draft, ≥1.5 mm radii
         to prevent sheet tearing/creasing during forming and demolding [S15]

[ ] 2. INNER FILLET ≥ 1.6 mm (Kydex rule: inside radius ≥ 0.5× sheet thickness)
       - Bevel modifier: Limit=WEIGHT, Segments=2–3, Width ≥ 1.6 mm
       - Harden Normals ON, Clamp Overlap ON
       - Per-edge bevel_weight_edge on retention lip / channel corners
       - Sharp inner corners → Kydex stress-whitening + part-lock on demold

[ ] 3. PARTING LINE defined on the widest gun silhouette along the open axis
       - All vertices on the split loop must have normals coplanar with the split plane
         before bridging (ensures G1 mold closure, flush halves)
       - Verify: parting plane flatness deviation < 0.2 mm post-bisect

[ ] 4. SPLIT-MOLD via BISECT + use_fill
       - Duplicate blocking → bisect at the open-axis-center plane
         (RUNBOOK uses plane_no=(0,1,0) Y-split; BUILD-LOG corrected to
          plane_no=(1,0,0) X-normal based on René's reference image — the
          FATHER'S IMAGE IS DECISIVE on split axis; re-verify per gun)
       - use_fill=True caps the parting face
       - Re-center each half on its own ORIGIN_CENTER_OF_MASS

[ ] 5. ALIGNMENT PINS / BORES (2–4, asymmetrically placed)
       - Cylindrical booleans: 3 mm diameter, 3 mm deep
       - Socket (DIFFERENCE) on one half; stub (UNION) on the other (0.98× diameter for slip fit)
       - Asymmetric placement prevents reverse assembly
       - Tolerance: pin +0.0/-0.1 mm, socket +0.1/-0.0 mm

[ ] 6. MOLD SHRINK ALLOWANCE (0.4–0.7%)
       - Scale the finished mold up by 1.004–1.007 before export
       - Kydex typical post-form shrinkage; verify against your specific Kydex grade
         `[UNVERIFIED-exact-pct]` — 0.4–0.7% is the cited band, confirm with material spec

[ ] 7. MATERIAL SELECTION
       - PETG (~80°C, standard) — survives Kydex press temps with aluminum tape buffer
       - ASA (~100°C, UV-stable) — better for repeated production presses
       - PLA — DO NOT USE (melts at Kydex thermoform contact temp)
       - Aluminum tape on the mold contact face (heat distribution + surface finish)

[ ] 8. PRINT SETTINGS (PETG mold halves)
       - Infill 80–100% (structural, not decorative)
       - 4+ perimeters / walls
       - Layer height 0.15–0.20 mm (dimensional accuracy)
       - NO supports inside the blocking channel — design for support-free

[ ] 9. SUPPORT-FREE CHANNEL DESIGN
       - All blocking-channel overhangs ≤ 45° from the open axis (print-in-air safe)
       - Bridge spans < 8 mm or add filleted relief

[ ] 10. WATERTIGHT QC GATE (before each half exports)
       - non_manifold_edges == 0 · inverted_normals < 1% · self_intersections == 0
       - quad_pct advisory only (tris OK for print)
       - face_count 30k–80k per half (advisory)

[ ] 11. DIMENSIONAL TOLERANCES
       - Gun channel width: +1.0 mm (Kydex spring-back)
       - Gun channel length: +10 mm (5 mm margin each end)
       - Mold wall thickness: 3.0 ± 0.2 mm (Solidify NON_MANIFOLD)
       - Parting plane flatness: < 0.2 mm deviation

[ ] 12. EXPORT
       - STL for print (binary, apply_modifiers=True)
       - STEP for René handoff (FreeCAD round-trip — Part B)
```

### C.2 Draft-Angle Implementation Detail

Simple Deform TAPER is an approximation. For production molds, prefer building the draft into the cross-section generation stage (each ring tapered outward from the parting plane by `tan(draft_angle) × ring_depth` per loop). This keeps wall thickness uniform — critical for Kydex forming where uneven wall thickness causes uneven cooling and warpage.

For a 2° draft on a 40 mm-deep wall: taper = tan(2°) × 40 = 1.4 mm radius increase from parting plane to mold face. That is geometrically significant and must be in the model, not approximated post-hoc.

### C.3 Mold-Shrink Caveat

The 0.4–0.7% band is the commonly cited Kydex thermoform shrinkage, but the exact value depends on (a) Kydex grade (.060 vs .080 vs .125), (b) forming temperature, (c) cooling rate. For production tolerances tighter than ±0.2 mm, measure a test-shot and calibrate the scale factor empirically. Flagged `[UNVERIFIED-exact-pct]` — confirm against the specific Kydex material data sheet before committing to production tooling.

---

## SOURCES (online-verified)

- **[S1]** Blender Manual — Remesh Modifier (SHARP mode "preserves sharp edges and corners"; algorithm NOT named in docs):
  https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/remesh.html
- **[S2]** Dual Contouring technical literature (Ju et al.; BorisTheBrave tutorial — explains why DC places vertices inside cells at gradient-plane intersections, recovering sharp corners MC cannot):
  https://www.boristhebrave.com/2018/04/15/dual-contouring-tutorial/ · https://www.sciencedirect.com/science/article/abs/pii/0097849394900116
- **[S3]** Blender 2.62 Remesh Modifier release notes (dual-contouring lineage of the SHARP mode):
  https://wiki.blender.org/wiki/Dev:Ref/Release_Notes/2.62/Remesh_Modifier
- **[S4]** Blender Manual — Decimate Modifier (DISSOLVE/PLANAR mode, Delimit options):
  https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/decimate.html
- **[S5]** Blender tracker — QuadriFlow symmetry/preserve_sharp hole artifacts (adjacent reports #70342, lineage of T70546; the specific id T70546 is NOT independently re-confirmed here `[UNVERIFIED-id]`, but the triangular-hole artifact class near sharp corners with use_preserve_sharp is multi-source community-confirmed):
  https://projects.blender.org/blender/blender/issues/70342 · https://developer.blender.org/T70546
- **[S6]** Blender Manual — Shrinkwrap + Data Transfer modifiers (retopology cage workflow):
  https://docs.blender.org/manual/en/latest/modeling/modifiers/modify/shrinkwrap.html · https://docs.blender.org/manual/en/latest/modeling/modifiers/modify/data_transfer.html
- **[S7]** Blender Artists — Export or convert to STEP files (community confirmation that Blender is mesh-native, STEP is B-rep parametric, fundamental mismatch):
  https://blenderartists.org/t/export-or-convert-to-step-files/1193112
- **[S8]** FreeCAD Wiki — FreeCAD and Mesh Import (the canonical Part → Create shape from mesh → Convert to solid → Refine → Export STEP pipeline):
  https://wiki.freecad.org/FreeCAD_and_Mesh_Import
- **[S9]** GrabCAD — How to convert STL to STEP using FreeCAD (6-step walkthrough of the same pipeline):
  https://grabcad.com/tutorials/how-to-convert-stl-to-step-using-freecad
- **[S10]** trimesh/cascadio GitHub README (confirms Cascadio is STEP→GLB **import** only, not an export path; uses OpenCASCADE; converts B-rep to triangulated scene):
  https://github.com/trimesh/cascadio
- **[S11]** CAD Exchanger — official site + STEP converter page (reads/writes STEP via OCCT; SDK/desktop, not a first-party Blender addon):
  https://cadexchanger.com/ · https://cadexchanger.com/convert-step/
- **[S12]** IfcOpenShell / Bonsai (BlenderBIM) — exports IFC (architecture BIM), not STEP; domain-mismatched for mold tooling:
  https://ifcopenshell.org/ · https://extensions.blender.org/add-ons/bonsai/
- **[S13]** Slicer STL/3MF native consumption — Bambu Studio, PrusaSlicer, Cura all consume STL/3MF directly (no STEP advantage for FDM); documented across slicer docs.
- **[S14]** YURI RUNBOOK §9 (internal, ground truth — Kydex mold tolerances, draft, split, pins, PETG settings): `_SYSTEM/blender/RUNBOOK.md`
- **[S15]** Thermoforming design guides — Formary (≥2° draft, ≥1.5 mm radii for thermoformed parts) + Ray Plastics (draw ratios, sharp angles, undercuts, draft, fillets):
  https://www.formary.de/en/blog/design-guidelines-for-thermoformed-parts · https://www.rayplastics.com/designing-thermoforming-design-guide-chapter-2/
- **[S16]** Injection-molding draft-angle corroboration — Xcentric (1° typical, 0.5° on ribs), Hubs (1° per inch depth), Protolabs (apply draft early):
  https://xcentricmold.com/designing-for-plastics/ · https://www.hubs.com/knowledge-base/draft-angle/ · https://www.protolabs.com/resources/design-tips/improving-part-moldability-with-draft/
- **[S17]** Instant Meshes — wjakob/instant-meshes + GeorgeAdamon/instant-meshes-sharp fork (feature-line painting, crease-angle detection, mechanical-geometry fork):
  https://github.com/wjakob/instant-meshes · https://github.com/GeorgeAdamon/instant-meshes-sharp
- **[S18]** FreeCAD Wiki — Part Loft (`Part.makeLoft(wires, solid=True, ruled=False)` → true NURBS B-spline solid, G1 continuous, exact `makeOffsetShape`, `exportStep`):
  https://wiki.freecad.org/Part_Loft · internal `02_RESOURCES/RESEARCH/3d-modelling/04-cad-loft-sweep-surfacing-recommendation.md`
- **[S19]** Blender Extensions — STEP Importer (Cascadio-based import add-on, drag-and-drop .step/.stp):
  https://extensions.blender.org/add-ons/step-importer/
- **[S20]** STEPper addon — community references (primarily STEP import into Blender; not a robust export solution) `[UNVERIFIED-export-capability]`.
- **[S21]** MStep — Blender Market CAD STEP Importer (import-focused) `[UNVERIFIED-export-capability]`: https://superhivemarket.com/products/mstep/docs

---

## CONFIDENCE + UNVERIFIED FLAGS

| Claim | Confidence | Note |
|-------|-----------|------|
| Voxel Remesh rounds edges via Marching Cubes lattice-lock | HIGH | Mechanism confirmed [S1][S2] |
| Remesh SHARP preserves sharp edges | HIGH | Functional claim confirmed in docs [S1] |
| Remesh SHARP *uses dual contouring* | MEDIUM | Inferred from release-note lineage + technical lit; **NOT named in current docs** `[INFERENCE-not-docs]` |
| Decimate PLANAR + Delimit:Sharp behavior | HIGH | Confirmed [S4] |
| QuadriFlow preserve_sharp behavior + hole artifacts | HIGH (behavior) / LOW (specific id) | Hole-class multi-source confirmed; specific tracker id T70546 not re-confirmed `[UNVERIFIED-id]` |
| Cascadio is import-only | HIGH | README confirms STEP→GLB only [S10] |
| BlenderBIM exports IFC not STEP | HIGH | Confirmed [S12] |
| BlenderBIM/IfcOpenShell unsuitable for mold STEP | HIGH | Domain-mismatch confirmed |
| FreeCAD mesh→STEP produces faceted (not analytic) B-rep | HIGH | Workflow confirmed [S8][S9]; faceted-output nature is a known OCCT behavior |
| Kydex 0.4–0.7% mold shrink band | MEDIUM | Commonly cited; exact value material/grade-dependent `[UNVERIFIED-exact-pct]` |
| Kydex inside radius ≥ 0.5× sheet thickness | HIGH | Corroborated by thermoforming guides [S15] |
| STEPper / MStep export capability | LOW | Both appear import-focused; export capability not independently confirmed `[UNVERIFIED-export-capability]` |
| CAD Exchanger Blender addon existence | LOW | No first-party Blender addon found; CAD Exchanger is external/SDK `[UNVERIFIED-blender-addon]` |

---

## CROSS-REFERENCES (internal)

- `_SYSTEM/blender/RUNBOOK.md` §3 (heal), §4 (remesh/decimate/shrinkwrap), §7 (QC), §9 (manufacturing)
- `02_RESOURCES/RESEARCH/3d-modelling/02-retopology-and-scan-reverse-engineering.md` (deeper scan-RE)
- `02_RESOURCES/RESEARCH/3d-modelling/04-cad-loft-sweep-surfacing-recommendation.md` (FreeCAD hybrid STEP path, Tier B)
- `_SYSTEM/blender/BLOCKING-BUILD-LOG.md` (recurring Voxel-Remesh failure, X-vs-Y split-axis correction)
