# Hard-Surface: Subdivision, Sharp Edges & Bevel Control
**Reference for veteran-grade holster mold blocking — custom-gear.ch / HK_45 project**
Blender 4.2–5.0 · 2026-06-23 · Confidence: HIGH (Blender manual, Polycount wiki, KYDEX TB-140)

---

## SUMMARY (12 lines)

1. **Shade Smooth + Smooth by Angle modifier** (Blender 4.2+, replaces legacy Auto-Smooth): auto-marks sharp edges above threshold (use 30–45° for mechanical forms); right-click Shade Auto-Smooth adds it pinned to stack bottom.
2. **Weighted Normal modifier** (last in stack, Face Area mode): large flat faces dominate per-vertex normals — flat panels read crisp-flat even where they meet small fillet faces, with zero extra geometry.
3. **Bevel modifier → Harden Normals** auto-generates custom split normals at bevel seams so surrounding flats stay flat and bevel faces shade smoothly between them — WN not always needed if bevels cover all seams.
4. **Subdivision Surface (Catmull-Clark)**: sharp read controlled by tight support/holding loops (2 loops close together = small controlled radius) or **Edge Crease** (Shift+E, 0–1, no geometry cost but Blender-only, not reliable on export).
5. **Crease vs loops tradeoff**: creases = zero geo, fast, Blender-only; holding loops = portable, bake-clean, heavier topology. Use creases during blocking, convert to loops before export/print.
6. **Bevel modifier** (Limit: Weight, Segments 2, Profile 0.5, Harden Normals ON) with per-edge `bevel_weight_edge` attribute is the non-destructive parametric fillet tool; Width scales all radii globally.
7. **No real manufactured edge is truly sharp.** Kydex thermoforming: min inner corner radius 1.6–2.3 mm (KYDEX TB-140), min draft 1–2° (male mold) / 2–4° (female). Sharp mold corners → stress-whitening + part-lock.
8. **Boolean (Exact solver) → Bevel → Subdivision → Smooth by Angle → Weighted Normal** is the canonical non-destructive stack. Manifold solver (Blender 4.5+) for final watertight export.
9. **Post-Boolean mandatory cleanup**: Merge by Distance, dissolve coplanar faces, re-loop the junction in quads before adding downstream bevel/subsurf or Ngons cause violent pinching.
10. **Holster blocking**: crisp at rail edges, trigger guard rim, retention step (bevel_weight=1.0, tight loops); smooth at grip ramps, backstrap blend, dust-cover taper (zero bevel weight, no holding loops).
11. **Apply scale (Ctrl+A → All Transforms) before any bevel or boolean** — baked-in scale produces asymmetric bevels and boolean artifacts.
12. **Export**: apply stack top-to-bottom (Boolean first); check Non-Manifold selection empty; export STL/OBJ. Crease data is unreliable in export — all sharpness must live in bevel geometry or explicit topology.

---

## 1 — SHARP vs SMOOTH: NORMALS WITHOUT EXTRA GEOMETRY

### 1.1 Shade Smooth + Smooth by Angle (Blender 4.2+)

**History**: in Blender ≤4.0 Auto-Smooth lived in Object Data Properties (angle slider). In **4.1** it became a Geometry Nodes modifier called "Smooth by Angle". From **4.2** the right-click → *Shade Auto Smooth* shortcut adds this modifier automatically, pinned to stack bottom. The destructive "Mark Sharp via context menu" path was removed in 4.1 as it was unpopular. [7, 8]

Workflow (4.2+):
- Right-click object in viewport → **Shade Auto Smooth** → modifier added, angle defaults to 30°.
- Adjust angle in modifier panel. **30–45°** covers mechanical hard-surface: flats at 0–90° stay flat-shaded, smooth fillets above 30° blend.
- Stack placement: modifier auto-pins to bottom; for WN compatibility, ensure Smooth by Angle is **above** Weighted Normal in the stack (regression in early 4.2 pinned it below WN — verify manually). [3]

For holster blocking: 40° is the sweet spot — flat shield faces, vertical walls, and the rail floor all read flat; the barrel channel radius and trigger guard curve read smooth.

### 1.2 Weighted Normal Modifier

Placed **last** in the modifier stack, WN overrides per-vertex normals using face-area or corner-angle weighting. The effect: large flat faces dominate the normal interpolation at shared vertices — the face reads flat even where it meets a smaller curved neighbor. [Blender Manual — WN]

Key parameters:
- **Mode — Face Area**: best for boxy mechanical forms; bigger faces win the normal vote.
- **Weight (50–100)**: higher = flat faces more dominant.
- **Face Influence (checkbox)**: uses the `face_normals_strength` attribute (Weak / Medium / Strong) assigned via Alt+N → Face Strength in Edit Mode, or auto-set by Bevel modifier. Bevel faces → Medium; base flat faces → Strong → bevels shade into hard flats cleanly.
- **Keep Sharp**: respects existing Sharp edge marks — WN does not soften intentional hard boundaries.

**When to skip WN**: if Bevel modifier's Harden Normals already covers all shading seams and there are no non-beveled flat-face boundaries that show faceting, WN adds overhead for no visual gain.

### 1.3 Bevel → Harden Normals

Bevel modifier's **Harden Normals** flag generates custom split normals at every bevel seam automatically — surrounding flat faces stay flat-shaded, bevel faces shade smoothly between them. Requires Shade Smooth on the object. This is usually sufficient for holster blocking without adding WN, unless there are large un-beveled flat faces that still show faceting.

### 1.4 Custom Split Normals

For surgical control when modifiers are insufficient: select faces → Mesh → Normals → Set From Faces or use Data Transfer modifier to copy normals from a reference mesh. Rarely needed during blocking; useful if a specific bake target demands per-face normals that no modifier combination produces cleanly.

---

## 2 — SUBDIVISION SURFACE (CATMULL-CLARK)

**Sources**: Blender Manual — Subdivision Surface [1]; Polycount Wiki — Subdivision Surface Modeling [4]; RenderGuide subdivision tutorial [9]

### 2.1 Algorithm

Catmull-Clark: each face splits into four quads; vertices reposition toward a weighted average of neighboring face centroids. Each subdivision level roughly halves visible edge length. An uncontrolled cube at level 3 approaches a sphere — topology controls everything.

- **Viewport Level 1–2** for interactive work (responsive mesh editing).
- **Render/Export Level 3** for smooth output or mold geometry.
- **Quality setting** (1–6): affects accuracy of crease and boundary interpolation; increase to 3–4 when using edge crease values in the 0.5–0.9 range. [1]

### 2.2 Support / Holding Loops

Two tight edge loops bracketing a sharp feature edge is the standard method. The gap between them controls the post-subdivision radius:

```
  base edge
  │
──│──────────────────────│──
  ^ holding loop (near)   ^ holding loop (near)
  ←—— gap controls radius ——→
```

- **Gap < 5% face width** → near-crisp edge (visually ≈ crease 0.9).
- **Gap 5–20%** → controlled visible fillet.
- **Gap > 30%** → broad organic rounding.

Loops must remain parallel and topologically complete across the surface — a loop that terminates into a face (T-junction) creates a pinching artifact at its end point. Redirect with a diagonal or merge into an existing edge flow. [4]

### 2.3 Edge Crease (Shift+E)

`Shift+E` in Edit Mode → interactive drag 0–1. Stored in the `crease_edge` mesh attribute. Subdivision Surface reads it when **Use Creases** is enabled (default ON).

- **1.0** = fully sharp; subdivision does not round.
- **0.5** = partial softening; can produce slight interpolation artifacts at medium values.
- **0.0** = fully smooth.

**Crease vs holding loops tradeoff**:

| | Geometry cost | Pipeline portable | Export | Best for |
|---|:---:|:---:|:---:|---|
| Edge Crease | Zero | No — Blender-only [4] | Unreliable (not in OBJ/FBX) | Fast in-session sharpness during blocking |
| Holding loops | +2 loops per edge | Yes | Clean | CAM / print / bake targets |
| Bevel modifier | +bevel segments | Yes | Clean | Non-destructive parametric radii |

Recommendation: use crease during Phase-2 blocking for speed; convert key edges to bevel-weight or explicit holding loops before the final export pass.

### 2.4 Subdivision-Ready Topology Rules

- **All quads**. Tris create pinching; Ngons create unpredictable collapsing under Catmull-Clark.
- **N-poles (5-edge vertices)** acceptable on flat plane terminations only; keep off curved surfaces.
- **E-poles (3-edge vertices)** cause pinching — redirect them away from curved/beveled regions.
- **Consistent face normals** — a flipped face switches that face to Simple subdivision, breaking continuity.
- **No T-junctions** before a support loop terminates — always provide a redirect loop.

---

## 3 — BEVEL / FILLET / CHAMFER

**Sources**: Blender Manual — Bevel Modifier [2]; Artisticrender.com bevel guide [10]; Gachoki Studios clamp overlap [11]

### 3.1 Physical Basis: Why No Truly Sharp Edges

Every CNC-machined, injection-moulded, or thermoformed part has a finite edge radius:
- **CNC tool tip radius**: typically 0.1–0.5 mm minimum.
- **Kydex thermoforming**: sharp interior mold corners concentrate stress in the heated sheet → **stress-whitening** (cosmetic defect) or cracking. Sheet cannot fully conform to a zero-radius inside corner.
- **Part release**: zero-draft + zero-fillet inside corners lock the formed Kydex to the mold.

**KYDEX Technical Brief TB-140 spec** [5]:
- Minimum inner corner radius: **1.60–2.30 mm** (vacuum forming minimum = sheet thickness, typically 0.71–2.0 mm for holster-grade Kydex).
- Draft angle: **1–2° male mold**, **2–4° female mold**.
- Mold shrinkage: 0.4–0.6% male, 0.5–0.7% female — account for in final geometry.

Practical holster modeling target: fillet **≥ 1.2 mm** on all interior mold features; 0.5–1.0 mm on exterior convex edges; model draft taper explicitly or note it for the CNC operator.

### 3.2 Bevel Modifier Parameters

| Parameter | Notes |
|---|---|
| **Limit Method: Angle** | Bevels all edges where adjacent faces meet above threshold. Fast to set up; fragile if topology changes. |
| **Limit Method: Weight** | Only edges with `bevel_weight_edge > 0` are beveled. Surgical control — **preferred for complex blocking**. |
| **Width** | Physical radius of the fillet. For Kydex: 0.8–1.5 mm primary edges, 0.3–0.8 mm secondary. |
| **Segments** | 1 = chamfer (flat); **2 = smooth fillet** (adequate for Kydex); 3+ = near-circular for subdivision pass. |
| **Profile** | 0.5 = circular arc; < 0.5 = concave; > 0.5 = convex; Custom Profile = control point curve. |
| **Clamp Overlap** | Caps bevel at 50% of adjacent shortest edge — prevents intersecting bevels on tight geometry. Enable by default. [11] |
| **Harden Normals** | Generates custom split normals at seams. Requires Shade Smooth. |
| **Miter Inner/Outer** | Arc miter at concave corners prevents pinching. |
| **Mark Sharp** | Marks bevel boundary edges as sharp — feeds WN and FBX smoothing groups. |

**Bevel Weight workflow** (non-destructive, per-edge):
1. Edit Mode → select target edges → Ctrl+E → **Edge Bevel Weight** → drag 0–1.
2. Bevel modifier: Limit Method = **Weight**, Width = global fillet radius.
3. Each edge bevels at `weight × Width`. Set weight = 1.0 on primary structural edges; 0.5 on secondary detail.
4. Change modifier Width to rescale all radii proportionally — fully parametric.

### 3.3 Chamfer vs Fillet for Kydex

- **Chamfer (45°, Segments 1)**: crisp highlight, readable edge — use on external corners of retention bumps and belt-loop attachment points where visual definition matters and the Kydex does not need to conform inward.
- **Circular fillet (Segments 2–3, Profile 0.5)**: distributes stress over a radius — mandatory on all **interior mold corners** and any concave feature the Kydex must form into.

---

## 4 — CLEAN BOOLEAN WORKFLOW

**Sources**: Blender Manual — Boolean Modifier [3]; Hyper-Casual.games clean topology guide [12]; CG Channel — Blender 4.5 Manifold solver [13]

### 4.1 Solver Selection

| Solver | Speed | Use |
|---|:---:|---|
| **Fast (Float)** | Fastest | Performance only; artifacts on coplanar/thin geo |
| **Exact** | Moderate | **Default for all production work** |
| **Manifold** (Blender 4.5+) | Fastest | Final export pass on confirmed-manifold clean meshes |

Always **Exact** during modeling. Switch to Manifold for the final export pass only after confirming both operands are manifold. Enable **Hole Tolerant** (performance penalty) only when Exact gives errors on genuinely non-manifold input.

### 4.2 Manifold Requirements

A mesh is manifold when:
- Every edge borders exactly two faces.
- No open boundaries.
- No internal (non-manifold) faces.

Check: Edit Mode → Select → Select All by Trait → **Non Manifold**. Zero selection = manifold. Both the base mesh and boolean cutters must be manifold for Exact/Manifold solvers to produce clean output.

### 4.3 Post-Boolean Topology Cleanup (Mandatory)

Boolean operations produce valid but unusable topology for downstream subdivision — long thin triangles, T-vertices, and Ngons at the intersection seam:

1. **Merge by Distance** (M in Edit Mode) — collapses coincident vertices from the intersection.
2. **Dissolve coplanar faces**: Select Faces by Sides (≥ 5) on flat regions → X → Dissolve Faces.
3. **Degenerate Dissolve**: Mesh → Clean Up → Degenerate Dissolve.
4. **Re-loop the junction**: manually add edge loops to convert Ngons to quads along the Boolean seam. This is mandatory before adding Subdivision Surface.
5. **Add holding loops around the cut boundary** before the downstream Bevel modifier to prevent the bevel from treating the Ngon boundary as a single flat face.
6. Verify: Select All by Trait → Non Manifold — must return empty.

Do NOT stack multiple uncleaned Booleans — each uncleaned junction adds complexity that the next Boolean multiplies.

---

## 5 — EDGE SHARPNESS CONTROL ON HOLSTER BLOCKING

### 5.1 Feature Map for HK45 / Holster Mold

| Feature | Target shading read | Method |
|---|---|---|
| Slide top flat | Perfectly flat, no ghost faceting | WN Face Strength: Strong on face |
| Slide-to-frame step | Crisp defined transition | Tight holding loops (1–2 mm gap) + bevel_weight=1.0, 0.8 mm |
| Rail channel longitudinal edges | Crisp bottom edges, smooth side walls | Holding loops on bottom edges; no loops on side walls |
| Barrel channel opening | Sharp circular boundary | Crease 1.0 on opening edge loop (convert to holding loop for export) |
| Trigger guard rim | Crisp top and bottom boundary | bevel_weight=1.0, 1.2 mm, 2 segments |
| Retention bump (muzzle/ejection) | Crisp outer edge, filleted interior | bevel_weight=1.0 outer; Bevel mod 1.5 mm fillet inner |
| Grip contour ramp | Smooth organic sweep | Zero bevel weight; wide loop spacing or none |
| Backstrap blend | Broad smooth curve | No holding loops; Subdivision level 2 rounds it |
| Outer mold shell edge | Safe Kydex release | Bevel 1.0–1.5 mm, 2 segments (≥ Kydex thickness) |
| Inner mold corner | Stress-whitening prevention | Bevel ≥ 1.6 mm, 2 segments (per KYDEX TB-140) |

### 5.2 Intentional Sharp + Smooth Mix on One Object

These four layers coexist on the same mesh:

1. **Smooth by Angle at 40°** — base level of smooth vs flat reading; handles the majority automatically.
2. **bevel_weight_edge** — overrides specific edges to receive a physical fillet via the Bevel modifier.
3. **Crease 1.0** on edge loops requiring temporary sharp read during blocking; remove or convert before export.
4. **Weighted Normal (Face Area, Face Strength: Strong on flat faces)** — final pass; cleans residual normal-interpolation artifacts at flat-face boundaries.

---

## 6 — NON-DESTRUCTIVE MODIFIER STACK

**Sources**: Blender Manual — Modifier Stack [6]; Hyper-Casual.games hard surface guide [12]

### 6.1 Canonical Order

```
Object
 └─ [1] Boolean          — cuts on the base mesh; Exact solver
 └─ [2] Bevel            — fillets tagged edges; Harden Normals ON; Limit: Weight
 └─ [3] Subdivision Surf — Catmull-Clark L1 viewport / L3 export; Use Creases ON
 └─ [4] Smooth by Angle  — marks sharp/smooth boundaries (auto-pinned in 4.2+)
 └─ [5] Weighted Normal  — resolves flat-face dominance; last in stack
```

**Why this order is load-bearing**:
- **Boolean before Bevel**: fillet applied to the post-cut geometry. Boolean after Bevel = fillet cut through, requiring rebuild.
- **Bevel before Subdivision**: Subdivision reads Bevel's support segments as holding geometry. Reversed = Subdivision rounds the clean cage before Bevel can control it → pinching.
- **Smooth by Angle before WN**: WN must read the sharp-edge marks that Smooth by Angle sets, or it smooths over intentional boundaries.
- **WN last**: resolves normals on the final subdivided mesh, not the cage — correct weighting, no performance overhead from resolving pre-subdivision normals.

### 6.2 When to Apply

**Never apply during design iteration.** Apply only for:
- Final STL/OBJ export for printing, CAM, or mold hand-off.
- Handing off to a non-Blender pipeline that cannot read modifier data.

**Apply order when exporting**: Boolean → Bevel → Subdivision → Smooth by Angle → Weighted Normal. Top to bottom, each step becomes the new base. Run manifold check after applying Boolean and again after full apply.

### 6.3 Parametric Editing While Unapplied

- Change Bevel Width → all `bevel_weight_edge`-tagged edges rescale proportionally.
- Change Boolean cutter position → cut re-evaluates.
- Change Subdivision level → mesh density trades; Bevel support loops scale with it.
- Change Smooth by Angle threshold → sharp/smooth boundary shifts globally.

This is the correct holster iteration workflow — dial radii and crispness per-feature without rebuilding the mesh.

---

## 7 — RECOMMENDATION: VETERAN-GRADE HOLSTER BLOCKING

### Phase Setup (continuation of Phase-1 prep)

1. Import Phase-1 output (decimated, centered, 115–120k face budget).
2. Build blocking shell as clean quad mesh over reference (~500–2k faces, simple forms).
3. **Apply scale immediately** (Ctrl+A → All Transforms). Non-negotiable.
4. Shade Smooth the blocking body.

### Normals + Shading

5. Right-click → Shade Auto Smooth → sets Smooth by Angle modifier at 40°.
6. Add Weighted Normal modifier (Mode: Face Area, Weight 75, Face Influence ON) — leave at stack bottom.

### Edge Control

7. Add Bevel modifier (Limit: Weight, Segments 2, Width 1.0 mm, Profile 0.5, Harden Normals ON, Clamp Overlap ON).
8. In Edit Mode: assign `bevel_weight_edge` per the feature map in §5.1 — primary structural edges = 1.0, secondary = 0.5.
9. Add Subdivision Surface (Viewport L1, Render/Export L3, Use Creases ON, Quality 3).
10. Use Shift+E crease 1.0 for temporary sharp read on blocking edges that will later convert to holding loops.

### Boolean Cutters (retention window, belt-loop slot, sight channel)

11. Model cutters as clean manifold quads fully enclosing the cut region.
12. Add Boolean (Exact) modifiers above Bevel in stack.
13. After visual verification: apply each Boolean, run cleanup pipeline (§4.3), then continue.

### Kydex Mold Safety Checklist

- [ ] All interior mold corners: Bevel ≥ 1.6 mm, 2+ segments.
- [ ] Outer mold edges: Bevel ≥ 1.0 mm with note for CNC operator on draft (1–2° male, 2–4° female).
- [ ] No crease-1.0 edges on interior mold surfaces — replace with holding loops before export.
- [ ] Mold shrinkage compensation (0.4–0.6%): scale up final geometry by 1.005 before export if printing a male mold.

### Export

14. Duplicate and save the parametric `.blend` before applying.
15. Apply modifier stack top-down.
16. Select All by Trait → Non Manifold — must return empty.
17. Export as STL (no normals needed) or OBJ+MTL for visual review.
18. All edge sharpness must be represented as bevel geometry or explicit loops in the exported mesh — crease data will not survive.

---

## SOURCES

| # | URL | Domain | Confidence |
|---|---|---|---|
| 1 | https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/subdivision_surface.html | Blender Manual — Subdivision Surface | HIGH |
| 2 | https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/bevel.html | Blender Manual — Bevel Modifier | HIGH |
| 3 | https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/booleans.html | Blender Manual — Boolean Modifier | HIGH |
| 4 | http://wiki.polycount.com/wiki/Subdivision_Surface_Modeling | Polycount Wiki — Subdivision | HIGH |
| 5 | https://www.curbellplastics.com/wp-content/uploads/2022/11/KYDEX-Sheet-TB-140-A-Thermoforming.pdf | KYDEX Technical Brief TB-140-A | HIGH |
| 5b | https://www.curbellplastics.com/wp-content/uploads/2022/11/KYDEX-Sheet-TB-140-C-Forming.pdf | KYDEX Technical Brief TB-140-C | HIGH |
| 6 | https://docs.blender.org/manual/en/latest/modeling/modifiers/introduction.html | Blender Manual — Modifier Stack | HIGH |
| 7 | https://cgcookie.com/community/18932-auto-smooth-is-back-in-blender-4-2 | CGCookie — Auto Smooth / Smooth by Angle 4.2 | HIGH |
| 8 | https://docs.blender.org/manual/en/latest/modeling/modifiers/normals/smooth_by_angle.html | Blender Manual — Smooth by Angle | HIGH |
| 9 | https://renderguide.com/blender-subdivision-modifier-tutorial/ | RenderGuide — Subdivision Tutorial | MEDIUM |
| 10 | https://artisticrender.com/how-to-bevel-in-blender-using-the-tool-and-modifier/ | Artisticrender — Bevel Guide | MEDIUM |
| 11 | https://gachoki.com/how-to-fix-bevel-overlap-issue-in-blender/ | Gachoki Studios — Clamp Overlap | MEDIUM |
| 12 | https://hyper-casual.games/blog/blender-hard-surface-modeling | Hyper-Casual.games — Hard Surface Guide | MEDIUM |
| 13 | https://www.cgchannel.com/2025/07/blender-4-5-lts-is-out-check-out-its-5-key-features/ | CG Channel — Blender 4.5 Manifold Solver | HIGH |
| 14 | https://projects.blender.org/blender/blender/issues/121620 | Blender Tracker — WN + Smooth by Angle regression | HIGH |
