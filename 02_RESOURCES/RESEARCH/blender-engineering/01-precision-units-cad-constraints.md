# Precision Engineering in Blender — Units, Float32 Limits, Dimensional Verification, and CAD-Constraint Addons

**Scope:** Achieving CAD-grade dimensional accuracy in a polygon modeler for 3D-print mold tooling (holster-mold company internal knowledge base).
**Date:** 2026-06-24
**Local grounding:** `_SYSTEM/blender/RUNBOOK.md` §2 (units), §7 (QC), §9.4 (tolerances); `_SYSTEM/blender/BLOCKING-BUILD-LOG.md`; `02_RESOURCES/RESEARCH/3d-modelling/04-cad-loft-sweep-surfacing-recommendation.md`.
**Online verification:** ≥2 primary sources per load-bearing claim (docs.blender.org, addon GitHub repos, devtalk). Citations inline; `[VERIFIED]` / `[PARTIAL]` / `[UNVERIFIED]` tagged.
**Two premise corrections surfaced by adversarial verification** (flagged in §3 and §4 — read them before trusting the addon section).

---

## TL;DR — the five load-bearing conclusions

1. **Float32 at mm scale is a non-issue.** A 215 mm gun model sits in the [0.125, 0.25) m exponent bin → ULP ≈ 30 nm = 0.00003 mm. Print tolerance is ±0.2 mm. That's **6700× headroom**. You hit printer mechanical limits and layer quantization thousands of times before float32. The real precision risk is **distance-from-origin**, not part size — keep geometry within ±10 m of (0,0,0). [VERIFIED, §2]
2. **Unit settings are a DISPLAY layer, not a storage layer.** Vertices are always stored float32 in raw Blender units (meters). `scale_length` + `length_unit` only relabel what you see. Exporters and simulations read raw units unless `use_scene_unit=True`. [VERIFIED, §1, §5]
3. **`Apply All Transforms` (Ctrl+A) before every boolean/bevel/export is the #1 precision rule.** Non-applied scale distorts operator math because modifiers/booleans read the *unscaled* mesh while `obj.dimensions` reports mesh×scale. [VERIFIED, §4]
4. **CAD Sketcher is real but EXPERIMENTAL and outputs mesh/bezier, NOT B-rep solids.** Uses SolveSpace (py-slvs). 5.x compat unverified. Do not trust on production files. [VERIFIED with caveat, §3]
5. **For GD&T-grade tolerance + STEP, round-trip to FreeCAD/Onshape/Fusion360.** Blender has no B-rep kernel; addon constraints solve on 2D sketch entities then emit mesh. AngelSTEP is the only B-rep bridge (import-side). [VERIFIED, §6]

---

## 1. The mm-accurate scene — exact API

Canonical source: `bpy.types.UnitSettings` [https://docs.blender.org/api/current/bpy.types.UnitSettings.html] and the Units manual page [https://docs.blender.org/manual/en/latest/scene_layout/scene/properties.html].

```python
import bpy
scene = bpy.context.scene
scene.unit_settings.system       = 'METRIC'        # enum: NONE | METRIC | IMPERIAL  [VERIFIED]
scene.unit_settings.scale_length = 0.001            # float [1e-9, inf]; 0.001 = mm   [VERIFIED]
scene.unit_settings.length_unit  = 'MILLIMETERS'    # enum — see caveat below           [PARTIAL]
```

**`length_unit` enum caveat [PARTIAL]:** The API doc page renders `length_unit`'s type as `Literal['DEFAULT']` only. This is a Sphinx limitation — the enum items (`'MILLIMETERS'`, `'CENTIMETERS'`, `'METERS'`, `'ADAPTIVE'`) are built at C/RNA registration time and the doc generator cannot enumerate them. The identifiers are real at runtime and appear in the UI Length dropdown. Confirm with a one-line runtime smoke test if scripting blind:
```python
assert bpy.context.scene.unit_settings.length_unit == 'MILLIMETERS'
```

**What each property actually does [VERIFIED, manual Note]:**
> "Unit Scale … only influences the values displayed in the user interface and not how things behave internally. For example, physics simulations don't take the unit scale into account."

- `system='METRIC'` — selects the unit family.
- `scale_length=0.001` — scale factor converting Blender-internal units ↔ displayed values. With 0.001, "1.0 internal unit" displays as "1 mm".
- `length_unit='MILLIMETERS'` — pins the display label so the N-panel and dimensions field read mm regardless of magnitude.

**Optional vs required:** `length_unit='MILLIMETERS'` alone re-displays meters-as-mm. `scale_length=0.001` additionally changes the unit conversion some exporters and physics use. Set both for an unambiguous mm scene.

### Floor grid — correct property location [CORRECTION to common assumption]

Grid display properties live on **`bpy.types.View3DOverlay`**, NOT on `scene.tool_settings`. [https://docs.blender.org/api/current/bpy.types.View3DOverlay.html]

```python
space = next(a for a in bpy.context.area.spaces if a.type == 'VIEW_3D')
space.overlay.grid_scale         = 0.001   # grid floor scale (mm)         [VERIFIED]
space.overlay.grid_subdivisions  = 10      # subdivisions per cell         [VERIFIED]
space.overlay.grid_lines         = 16      # number of grid lines to draw  [VERIFIED]
# space.overlay.grid_scale_unit  ← read-only current display-unit label
```

`scene.tool_settings.grid_absolute` / `use_snap_grid_absolute` DO exist on ToolSettings — but those are snap toggles, not display. [https://docs.blender.org/api/current/bpy.types.ToolSettings.html]

The grid is unit-coupled: with `system='METRIC'` + `length_unit='MILLIMETERS'`, major grid lines track mm automatically.

---

## 2. Float32 precision — the actual numbers

### 2.1 Internal storage [VERIFIED, primary source]

Blender source `source/blender/makesdna/DNA_meshdata_types.h` [https://github.com/blender/blender/blob/main/source/blender/makesdna/DNA_meshdata_types.h]:
```c
struct MVert {
  float co_legacy[3];   // 3x IEEE-754 binary32 (~7 significant decimal digits)
  ...
};
```
Modern Blender also exposes positions as a generic `float3` attribute — still 32-bit. Vertex coords are **always** float32 in raw Blender units; `unit_settings` does not change this.

### 2.2 ULP arithmetic at gun scale [VERIFIED by calc]

- float32 unit roundoff: 2⁻²³ ≈ **1.19e-7** relative
- At |v| = 0.215 m, exponent bin = 2⁻³ (range 0.125–0.25 m)
- Worst-case representable spacing at 0.215 m ≈ 2⁻²³ × 0.25 ≈ **2.98e-8 m ≈ 30 nm = 0.00003 mm**

### 2.3 Is float32 a problem for mold work? [VERIFIED — no]

| Reference dimension | Value | ULP ratio |
|---|---|---|
| Print tolerance (RUNBOOK §9.4) | ±0.2 mm | ULP is **~6700× smaller** |
| FDM layer height | 0.15–0.2 mm | ULP is **~5000× smaller** |
| FDM nozzle width | 0.4 mm | ULP is **~13,000× smaller** |
| SLA XY pixel | 0.025–0.050 mm | ULP still **~1000× smaller** |
| Mold wall tolerance | ±0.2 mm | ULP **6700× smaller** |
| Pin slip-fit | +0.0 / −0.1 mm | ULP **3300× smaller** |

**Conclusion: float32 coordinate quantization at a 0.215 m gun model is utterly negligible for 3D-print mold work.** Printer mechanical tolerance, layer quantization, and Kydex shrinkage dominate by 3–4 orders of magnitude.

### 2.4 When float32 ACTUALLY bites — distance from origin [VERIFIED, secondary]

ULP scales linearly with magnitude:
- at 0.215 m: 30 nm (invisible)
- at 1 km from origin: ~60 μm (still sub-print-tolerance)
- at ~10 km: ~0.6 mm (now at print tolerance)
- at ~2 km with transform-matrix compounding: users report ~1 cm jitter

Sources: [https://devtalk.blender.org/t/moving-transforms-and-matrices-to-double-precision/30329], [https://devtalk.blender.org/t/inaccuracy-of-values-in-transform/2655], [https://blender.stackexchange.com/questions/283626/increase-floating-point-precision-with-large-scene-and-parented-objects].

**Rule for holster work:** model the HK_45 geometry in local coordinates near (0,0,0); offset only via object transform. If the asset stays within ±10 m of origin you are mathematically safe to ~0.6 μm — far beyond FDM/SLA/mold capability.

### 2.5 Does the manual acknowledge this? [PARTIAL]

No dedicated float-precision section. The closest official acknowledgement is the `scale_length` description:
> "When working at microscopic or astronomical scale, a small or large unit scale respectively can be used to avoid numerical precision problems."
— [https://docs.blender.org/manual/en/latest/scene_layout/scene/properties.html]

No docs.blender.org page quantifies "~7 significant digits" or names float32 as the ceiling. That doctrine is community-sourced (devtalk, stackexchange, source).

---

## 3. CAD-constraint addons — what exists and what doesn't

> **Premise correction #1:** "CAD Transform" is NOT bundled with Blender. It is third-party (s-leger). The bundled addon with overlapping function is **Precision Modeling Tools (PDT)**.
> **Premise correction #2:** "BlendCAD" does not exist as a real addon. It is a misnomer/alias confusion.

### 3.1 CAD Sketcher (formerly ConstraintSketcher) — the real constraint solver

| Field | Value | Status |
|---|---|---|
| Repo | https://github.com/hlorus/CAD_Sketcher | [VERIFIED] |
| Site | https://www.cadsketcher.com | [VERIFIED] |
| Docs | https://hlorus.github.io/CAD_Sketcher/ | [VERIFIED] |
| Maturity | **EXPERIMENTAL / WIP.** README verbatim: *"⚠️ Experimental extension: This is still work in progress, don't use it on production files without a backup."* | [VERIFIED] |
| Blender compat | Minimum **4.2** (README verbatim). 5.x **not stated** — Blender 5.0 broke addon APIs [https://devtalk.blender.org/t/upcoming-blender-5-0-release-compatibility-breakages/37078]. | [5.x UNVERIFIED — assume broken until tested] |
| Install | Download ZIP (Gumroad/GitHub) → Edit > Preferences > Get Extensions > Install from Disk. Uses Blender 4.2+ Extensions platform (`blender_manifest.toml`). | [VERIFIED] |
| Solver | **SolveSpace** (forked), via `py-slvs` Python binding (`realthunder/slvs_py` — same fork FreeCAD Assembly3 uses). Repo contains `solver.py`. | [VERIFIED — https://pypi.org/project/py-slvs/] |
| What it does | 2D constraint sketcher: geometric constraints (coincident, tangent, parallel, perpendicular, equal) + dimensional (distance, angle, radius), driven parameters, non-destructive editable sketches, sketch→3D. Sketches are a custom `Sketch` data-block. | [VERIFIED] |
| **Output type** | **MESH or BEZIER, NOT B-rep solids.** Docs verbatim: *"When a sketch is active, you can choose the convert type… by default it's set to None… Sketches can be converted into beziers or mesh."* | [VERIFIED — https://hlorus.github.io/CAD_Sketcher/integration/] |
| STEP export | **No native STEP.** Output is mesh/bezier → STEP round-trip requires a separate converter (e.g. AngelSTEP) and yields faceted geometry. | [VERIFIED] |

**Community note:** dev cadence slowed after Ondsel's shutdown; repo is maintained-but-slow, not abandoned (3.3k stars, 71 open issues at time of read). [https://www.reddit.com/r/blender/comments/1letpyu/]

**Verdict for holster work:** useful for parametric 2D profiles (gun cross-sections, retention-point layout) IF you verify 5.0 compat first. NOT a CAD-kernel replacement — it cannot produce the B-rep solid a CAM/STEP workflow needs.

### 3.2 CAD Transform — third-party, NOT bundled [CORRECTION]

| Field | Value | Status |
|---|---|---|
| Author | s-leger (Stephen Leger) | [VERIFIED] |
| Free legacy repo | https://github.com/s-leger/blender_cad_transforms — covers 2.8–3.x; **NOT 4.x compatible** | [VERIFIED] |
| Paid v2.0 | https://blender-archipack.gumroad.com/l/emiwtw (~10€ + VAT) — supports Blender 3.3+ / 4.x / 5.x | [VERIFIED — https://blenderartists.org/t/cad-transform-2-0-for-blender-5/1503132] |
| What it does | Precise CAD-like Move/Rotate/Scale/Align-by-3-points with snap-from/snap-to workflow and axis/plane constraints. | [VERIFIED] |
| Why NOT a CAD Sketcher replacement | It is a **transform operator**, not a constraint solver. No parametric sketches, no dimensional constraints, no solver — just precise numeric snapping on existing geometry. | [VERIFIED] |

If you want the **bundled** equivalent, that is **Precision Modeling Tools (PDT)** — Edit > Preferences > Add-ons > "Precision Modeling Tools". PDT gives numeric-entry moves, custom orientations, cursor ops. It is also a transform aid, not a constraint solver.

### 3.3 BlendCAD — DOES NOT EXIST [VERIFIED absence]

Searched GitHub topics, awesome-blender, general web: no addon named "BlendCAD" surfaces. It is a **misnomer** — anyone referencing it almost certainly means CAD Sketcher or CAD Transform. Do not treat as a real product. (Evidence-of-absence, not proof-of-absence: a niche fork could exist under a variant spelling, but nothing in standard searches.)

### 3.4 Bonus — real precision addons (engineering, not gamedev)

| Addon | What | URL |
|---|---|---|
| **MESHmachine** (MACHIN3.io) | Hard-surface mesh modeling: boolean "split" mode, Fuse/Unfuse, variable fillets, cleanup. Mesh-only, no B-rep. | https://machin3.io/MESHmachine/docs/ |
| **AngelSTEP** | True B-rep STEP/IGES importer+exporter; re-fetches original CAD geometry rather than the Blender mesh. Closest thing to a B-rep bridge. Import-side only — does not synthesize B-rep from mesh. | https://superhivemarket.com/products/angel-step-cad-importer |
| **Sverchok** | Node-based parametric geometry. Parametric but mesh-generating, not B-rep. | https://github.com/nortikin/sverchok |

---

## 4. Achieving and verifying exact dimensions

### 4.1 Dimensions vs Scale — the critical distinction [VERIFIED]

Source: [https://docs.blender.org/api/current/bpy.types.Object.html]

- **`obj.dimensions`** — `float[3]`. World-space bounding-box size in Blender units. = mesh bbox × scale. Changes when mesh deforms OR when scale changes.
- **`obj.scale`** — `float[3]`, default (1,1,1). Transform multiplier on top of mesh data.

**The gotcha:** object-mode scaling only edits the transform matrix; raw vertex coordinates stay unchanged. A 1 m cube scaled (2,1,1) reports `dimensions=(2,1,1)` while mesh data still says 1 m. Modifiers (Bevel, Boolean) and exporters read the *unscaled* mesh and get wrong numbers. [https://devtalk.blender.org/t/mesh-tools-and-non-uniformly-scaled-objects/2580], [https://blender.stackexchange.com/questions/283715/why-is-scaling-affecting-my-bevel]

### 4.2 Apply All Transforms — the #1 precision rule [VERIFIED, signature fetched live]

```python
bpy.ops.object.transform_apply(
    location=True, rotation=True, scale=True,
    properties=True, corrective_flip_normals=True, isolate_users=False)
```
Source: [https://docs.blender.org/api/current/bpy.ops.object.html] (verified verbatim 2026-06-24).

Bakes location/rotation/scale into mesh vertex coordinates and resets the transform to identity. `corrective_flip_normals=True` preserves shading on negative-scale mirrors. Run this **before every boolean, bevel, and export** — non-applied scale distorts operator math. This is the rule already in `_SYSTEM/blender/BLOCKING-BUILD-LOG.md:58`: *"Apply scale (Ctrl+A → All Transforms) before any bevel/boolean — non-negotiable."*

### 4.3 MeasureIt — annotation dimensions [VERIFIED with 5.0 bug flag]

| Field | Value |
|---|---|
| Author | **Antonio Vazquez** (NOT "Antony Fouiin" — that attribution is wrong) |
| Bundling | Historically in official `blender-addons` repo; now on Extensions platform |
| Repo | https://github.com/sobotka/blender-addons/blob/master/measureit/measureit_main.py |
| Extensions | https://extensions.blender.org/add-ons/measureit/ |
| What it does | Annotation dimensions: segment length (exact world-space distance between two verts), angle, area, arc. Displays in viewport AND renders. Does NOT snap or constrain geometry — annotation only. |
| Scriptable | YES — plain Python; annotations stored as custom-property groups; operator classes callable from script. Requires ≥2 selected vertices for a segment. |

**⚠️ 5.0 BUG:** A confirmed bug reports segment measurements not displaying in Blender 5.0.1 — [https://projects.blender.org/blender/blender/issues/152386]. **Verify MeasureIt works in your exact 5.0 build before relying on it for tooling sign-off.** Fallback: raw `bpy` distance calc:
```python
import bpy, mathutils
obj = bpy.context.active_object
v1 = obj.data.vertices[i].co
v2 = obj.data.vertices[j].co
distance_m = (v2 - v1).length      # after Apply All Transforms; Blender units (m)
distance_mm = distance_m * 1000.0
```

### 4.4 3D Print Toolbox [VERIFIED]

Bundled. 3D Viewport > Sidebar > 3D-Print. Offers Volume (needs closed manifold), Area, Manifold check, Boundary Edges, Intersections, Make Manifold repair. Standard pre-export sanity tool.
- Manual: [https://docs.blender.org/manual/en/4.0/addons/mesh/3d_print_toolbox.html]
- Extensions: [https://extensions.blender.org/add-ons/print3d-toolbox/]
- *(5.0 manual page path may differ — verify at `docs.blender.org/manual/en/5.0/addons/mesh/3d_print_toolbox.html`)*

### 4.5 Snapping for precise placement [VERIFIED, version note]

Properties on `bpy.context.scene.tool_settings` [https://docs.blender.org/api/current/bpy.types.ToolSettings.html]:

| Property | Values |
|---|---|
| `use_snap` | bool — master toggle |
| `snap_elements` | set — `{'VERTEX'}`, `{'EDGE'}`, `{'FACE'}`, `{'GRID'}`, `{'INCREMENT'}` (2.8+: set; was scalar `snap_element` in 2.7) |
| `snap_target` | `'CLOSEST'`, `'CENTER'`, `'MEDIAN'`, `'ACTIVE'` |
| `use_snap_grid_absolute` | bool — Absolute Grid Snap (relative to grid origin) |

**Precision combo for placing a vertex exactly on another vertex:** `snap_elements={'VERTEX'}` + `snap_target='ACTIVE'`. Select the vertex to move (make active), grab it, it snaps onto the target. `ACTIVE` makes the *chosen* vertex land on the target; `CLOSEST` picks ambiguously.

**Version note (4.2+):** Increment + Absolute Grid Snap workflow was reworked in 4.2; Grid Snap exists separately and behavior differs [https://blender.community/c/rightclick-select/X7AV/]. On 5.0, verify the snap UI matches expectations; the Python properties above remain valid.

### 4.6 Bounding-box sanity check [VERIFIED standard pattern]

```python
EXPECTED_LEN_M = 0.215    # HK45T ~215 mm
assert abs(max(obj.dimensions) - EXPECTED_LEN_M) < 1e-4, "unit scale suspect"
```
Already implemented in RUNBOOK §2 `verify_unit_scale()`. Caveat: `dimensions` is axis-aligned bbox — for non-axis-aligned parts, rotate so the measured dimension aligns with an axis, re-apply, then read. For arbitrary-angle caliper measurement use MeasureIt segment or the raw `(v2.co - v1.co).length` math.

### 4.7 Avoiding cumulative drift [VERIFIED]

Causes:
1. **Chained non-applied transforms** — each unapplied scale/rotate compounds the matrix.
2. **Scale-before-rotate ordering** — matrix multiplication is non-commutative; `S·R ≠ R·S`.
3. **Unapplied modifiers at export** — visible mesh ≠ mesh data exporter bakes.
4. **Float32 + distance-from-origin** — keep tooling geometry near (0,0,0).

Universal fix: **Apply All Transforms before every export and before any authoritative measurement.**
Sources: [https://blender.stackexchange.com/questions/7298/why-is-it-important-to-apply-transformation-to-an-objects-data], [https://devtalk.blender.org/t/moving-transforms-and-matrices-to-double-precision/30329]

---

## 5. What `unit_settings` does NOT do [VERIFIED]

1. **Does not change coordinate storage.** Vertices stay float32 in Blender units. Manual Note confirms.
2. **Does NOT guarantee correct STL/OBJ export scale.** STL stores raw float coords with **no unit metadata**; slicer assumes mm.
   - mm scene (`scale_length=0.001`) → STL export `global_scale = 1.0`.
   - default meters → mm STL → `global_scale = 1000`.
   - Enable **`use_scene_unit=True`** on import/export operators so they honour `scale_length`. [https://developer.blender.org/T43901], [https://blender.stackexchange.com/questions/7503/scale-settings-for-exporting-to-stl-for-3d-printing]
3. **Does not affect physics simulations** (gravity, cloth, rigid-body use raw units).
4. **Does not affect sculpt/brush sizes in raw mode** — brush radius stored in scene units; only display relabelled.

**Slicer-side gate:** after STL export, open in PrusaSlicer/Cura and confirm 215 mm reads as 215 mm, not 0.215 or 215000. This is the final unit-verification gate.

---

## 6. Blender-precision vs B-rep-CAD — where each suffices

### 6.1 The architectural fact [VERIFIED]

Blender has **no B-rep/CAD kernel**. Everything is mesh. Constraints via addons (CAD Sketcher) solve on 2D sketch entities then emit mesh/bezier. Verified across:
- [https://news.ycombinator.com/item?id=24504728] — *"Everything in blender is a mesh, whereas in a parametric solid body modeller everything is a BREP."*
- [https://github.com/naranyala/awesome-3d-modeling-for-cad] — Blender *"uses polygonal mesh modeling and does not include native NURBS-based solid modeling found in traditional CAD applications."*
- [https://devtalk.blender.org/t/better-curve-surface-support/21113]
- [https://www.dr-lex.be/3d-printing/step-versus-mesh.html] — why mesh→STEP is generally impossible.

Note: no docs.blender.org page states this verbatim; the doctrine is inferred from architecture + developer consensus. Conclusion is TRUE; phrasing is community-sourced.

### 6.2 Where Blender precision genuinely suffices — 3D-print mold tooling

For the holster-mold workflow, Blender is sufficient because the downstream manufacturing is itself polygon-limited:

| Requirement | Blender capability | Verdict |
|---|---|---|
| ±0.2 mm dimensional tolerance | float32 ULP 6700× smaller; bbox + Apply rules verify exact | SUFFICES |
| Watertight manifold for 3D print | 3D Print Toolbox + RUNBOOK §7 QC | SUFFICES |
| STL export (mesh-native) | STL is the native format; no B-rep lost | SUFFICES |
| Mold wall ±0.2 mm | Solidify offset in scene units (mm) | SUFFICES |
| Pin slip-fit +0.0/−0.1 mm | boolean cylinder DIFFERENCE, Apply before | SUFFICES |
| Parting-plane flatness <0.2 mm | bisect + symmetry verify (RUNBOOK §9.4) | SUFFICES |
| Kydex inner fillet ≥1.6 mm | Bevel modifier Width parametric | SUFFICES |

### 6.3 Where you MUST round-trip to a B-rep CAD kernel

For GD&T-grade (geometric dimensioning & tolerancing) work, Blender cannot do the job:

| Requirement | Why Blender fails | Round-trip to |
|---|---|---|
| True cylindricality / flatness GD&T callouts | mesh is faceted; no analytic surface | FreeCAD (OpenCascade), Onshape, Fusion 360 |
| Parametric NURBS offset (exact 2 mm shell) | Solidify is non-uniform at corners [doc 04] | FreeCAD `makeOffsetShape` |
| STEP export for CAM/machining | mesh→STEP yields faceted geometry | FreeCAD/Fusion STEP |
| Parametric history (change sketch → re-execute) | modifier stack ≠ sketch-driven re-solve | FreeCAD PartWB, Onshape |
| ±0.01 mm tolerance | mesh resolution + Solidify caps at ±0.3–0.8 mm [doc 04:224] | parametric NURBS B-rep |

**Hybrid workflow** (per `02_RESOURCES/RESEARCH/3d-modelling/04-cad-loft-sweep-surfacing-recommendation.md`): do scan-import + measured-primitive boolean assembly + Kydex finishing in Blender (sufficient for 3D-print molds), round-trip to FreeCAD only when the customer demands STEP/GD&T or parametric gun-variant re-loft.

---

## Settings checklist — mm-accurate engineering scene

```python
import bpy

scene = bpy.context.scene

# 1. Units — DISPLAY layer (storage stays float32 meters)
scene.unit_settings.system       = 'METRIC'
scene.unit_settings.scale_length = 0.001
scene.unit_settings.length_unit  = 'MILLIMETERS'    # runtime-confirm the enum

# 2. Floor grid — lives on View3DOverlay, NOT tool_settings
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        space = next(s for s in area.spaces if s.type == 'VIEW_3D')
        space.overlay.grid_scale        = 0.001   # mm
        space.overlay.grid_subdivisions = 10
        space.overlay.grid_lines        = 16
        break

# 3. Snapping — vertex-precise placement
scene.tool_settings.use_snap              = True
scene.tool_settings.snap_elements         = {'VERTEX'}
scene.tool_settings.snap_target           = 'ACTIVE'
scene.tool_settings.use_snap_grid_absolute = True

# 4. Per-object — before EVERY boolean/bevel/export
#    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True,
#                                   properties=True, corrective_flip_normals=True)

# 5. Export gate — STL
#    bpy.ops.wm.stl_export(filepath=..., use_scene_unit=True, global_scale=1.0)
#    THEN open in PrusaSlicer and confirm 215 mm reads 215 mm.

# 6. Verification — bbox sanity (after Apply)
#    assert abs(max(obj.dimensions) - EXPECTED_M) < 1e-4
#    OR raw: (obj.data.vertices[a].co - obj.data.vertices[b].co).length * 1000  # mm
```

**Enable addons:** Edit > Preferences > Add-ons — **3D Print Toolbox** (bundled), **MeasureIt** (verify on 5.0 due to bug #152386), optionally **Precision Modeling Tools** (bundled, the PDT transform aid). Optionally **CAD Sketcher** (experimental; 5.x compat unverified; mesh output only).

---

## Unverified items flagged

- `'MILLIMETERS'` as a literal API-doc enum value (Sphinx drops runtime enums — runtime-only confirmation).
- Any docs.blender.org page quantifying float32's ~7-digit ceiling (manual only hints via `scale_length` note).
- CAD Sketcher compatibility with Blender 5.x (README floor is 4.2; 5.0 broke addon APIs).
- MeasureIt on Blender 5.0 specifically (bug #152386 — verify in build before depending on it).
- 3D Print Toolbox manual URL for Blender 5.0 (4.0 URL cited as stable pattern).
- A named "N-panel > View > Display > Units" control (not in primary docs; verify live in 5.0).

---

## Sources

**Blender official (primary):**
- https://docs.blender.org/api/current/bpy.types.UnitSettings.html
- https://docs.blender.org/manual/en/latest/scene_layout/scene/properties.html
- https://github.com/blender/blender/blob/main/source/blender/makesdna/DNA_meshdata_types.h
- https://docs.blender.org/api/current/bpy.types.View3DOverlay.html
- https://docs.blender.org/api/current/bpy.types.ToolSettings.html
- https://docs.blender.org/api/current/bpy.types.Object.html
- https://docs.blender.org/api/current/bpy.ops.object.html
- https://docs.blender.org/manual/en/4.0/addons/mesh/3d_print_toolbox.html
- https://developer.blender.org/T43901
- https://devtalk.blender.org/t/moving-transforms-and-matrices-to-double-precision/30329
- https://devtalk.blender.org/t/inaccuracy-of-values-in-transform/2655
- https://devtalk.blender.org/t/mesh-tools-and-non-uniformly-scaled-objects/2580
- https://devtalk.blender.org/t/upcoming-blender-5-0-release-compatibility-breakages/37078
- https://devtalk.blender.org/t/better-curve-surface-support/21113
- https://projects.blender.org/blender/blender/issues/152386 (MeasureIt 5.0 bug)

**Addon repos/docs (primary):**
- https://github.com/hlorus/CAD_Sketcher
- https://hlorus.github.io/CAD_Sketcher/integration/
- https://pypi.org/project/py-slvs/
- https://github.com/s-leger/blender_cad_transforms
- https://blender-archipack.gumroad.com/l/emiwtw
- https://blenderartists.org/t/cad-transform-2-0-for-blender-5/1503132
- https://github.com/sobotka/blender-addons/blob/master/measureit/measureit_main.py
- https://extensions.blender.org/add-ons/measureit/
- https://extensions.blender.org/add-ons/print3d-toolbox/
- https://machin3.io/MESHmachine/docs/
- https://superhivemarket.com/products/angel-step-cad-importer
- https://github.com/nortikin/sverchok

**Community/secondary (corroborating):**
- https://news.ycombinator.com/item?id=24504728
- https://github.com/naranyala/awesome-3d-modeling-for-cad
- https://www.dr-lex.be/3d-printing/step-versus-mesh.html
- https://blender.stackexchange.com/questions/283626/increase-floating-point-precision-with-large-scene-and-parented-objects
- https://blender.stackexchange.com/questions/7503/scale-settings-for-exporting-to-stl-for-3d-printing
- https://blender.stackexchange.com/questions/7298/why-is-it-important-to-apply-transformation-to-an-objects-data
- https://blender.stackexchange.com/questions/283715/why-is-scaling-affecting-my-bevel
- https://blenderartists.org/t/blenders-vertex-coordinates-accuracy/658020
- https://b3d.interplanety.org/en/snapping-elements-property-in-blender-2-8-python-api/
- https://blender.community/c/rightclick-select/X7AV/
- https://www.reddit.com/r/blender/comments/1letpyu/

**Local corpus (YURI prior art):**
- `_SYSTEM/blender/RUNBOOK.md` §2 (unit verification), §7 (QC), §9.4 (tolerances)
- `_SYSTEM/blender/BLOCKING-BUILD-LOG.md` (apply-scale rule, measured-primitive method)
- `02_RESOURCES/RESEARCH/3d-modelling/04-cad-loft-sweep-surfacing-recommendation.md` (Blender vs CAD precision table)
