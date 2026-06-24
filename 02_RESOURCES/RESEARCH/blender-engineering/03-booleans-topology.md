# Engineering Hard-Surface Boolean Modeling & Clean Topology in Blender
**CAD-like crisp-faceted manifold solids — the exact quality bar for holster blocking (custom-gear.ch)**

Blender 5.0 (with 4.1–4.x deltas) · 2026-06-24
Confidence: **HIGH** — verified against ≥2 primary sources (Blender Manual + Blender Python API + 4.5 release notes), then cross-checked against our live Phase-1/Phase-2 validated work.

---

## SOURCES (primary-first, all URLs verified live 2026-06-24)

| # | Source | URL | Tier |
|---|--------|-----|------|
| P1 | Blender Manual — Boolean Modifier (5.1) | https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/booleans.html | PRIMARY |
| P2 | Blender Python API — `BooleanModifier` | https://docs.blender.org/api/current/bpy.types.BooleanModifier.html | PRIMARY |
| P3 | Blender 4.5 Modeling Release Notes (Manifold solver) | https://developer.blender.org/docs/release_notes/4.5/modeling/ | PRIMARY |
| P4 | Blender Manual — Bevel Modifier (5.1) | https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/bevel.html | PRIMARY |
| P5 | Blender Python API — `BevelModifier` | https://docs.blender.org/api/current/bpy.types.BevelModifier.html | PRIMARY |
| P6 | Blender Manual — Weighted Normal Modifier (4.2+) | https://docs.blender.org/manual/en/latest/modeling/modifiers/normals/weighted_normal.html | PRIMARY |
| P7 | Blender Python API — Object Operators (`shade_auto_smooth`, `smooth_by_angle`) | https://docs.blender.org/api/current/bpy.ops.object.html | PRIMARY |
| P8 | Blender Python API — `DecimateModifier` | https://docs.blender.org/api/current/bpy.types.DecimateModifier.html | PRIMARY |
| P9 | Blender Python API — BMesh Operators | https://docs.blender.org/api/current/bmesh.ops.html | PRIMARY |
| L1 | YURI RUNBOOK §4.7 Boolean, §4b Topology, §7 QC (validated live 5.0) | `_SYSTEM/blender/RUNBOOK.md` | LOCAL |
| L2 | YURI Hard-Surface lane 03 (SubD/Sharp/Bevel) | `02_RESOURCES/RESEARCH/3d-modelling/03-hardsurface-subdivision-sharp-edges.md` | LOCAL |
| L3 | YURI Game-dev lane 05 (firearm topology, primitives, 24-side barrels) | `02_RESOURCES/RESEARCH/3d-modelling/05-gamedev-hardsurface-firearm-topology.md` | LOCAL |
| L4 | YURI Blocking Build Log (validated crisp pass on 5.0) | `_SYSTEM/blender/BLOCKING-BUILD-LOG.md` | LOCAL |
| S1 | CG Channel — Blender 4.5 LTS 5 key features (Manifold) | https://www.cgchannel.com/2025/07/blender-4-5-lts-is-out-check-out-its-5-key-features/ | SECONDARY |
| S2 | BlenderNation — Exact Boolean performance improvements | https://www.blendernation.com/2021/03/17/exact-boolean-gets-performance-improvements/ | SECONDARY |

---

## 1 — BOOLEAN SOLVERS DEEP-DIVE (EXACT vs MANIFOLD vs FLOAT)

Blender's Boolean modifier exposes three `solver` enum values: `'FAST'`, `'EXACT'`, `'MANIFOLD'`. The Python API enum is the source of truth: `mod.solver = 'MANIFOLD' | 'EXACT' | 'FAST'` [P2].

### 1.1 Solver comparison (verified verbatim against Manual [P1] + 4.5 notes [P3])

| Solver | API value | Speed | Robustness | Manifold required? | Coplanar / overlap | `use_hole_tolerant` |
|--------|-----------|-------|-----------|--------------------|--------------------|---------------------|
| **Fast (Float)** | `'FAST'` | Fastest | Low | No | Fails — "lacks support for overlapping geometry" [P1] | N/A |
| **Exact** | `'EXACT'` | Slowest | Highest | No (but cleaner if manifold) | Full support — "best results, full support for overlapping geometry" [P1] | Yes — optimizes for non-manifold input, performance cost [P1] |
| **Manifold** (4.5+) | `'MANIFOLD'` | Usually fastest (scales with CPU cores) [P3] | High on clean input | **Yes — hard requirement** | Works if both operands manifold | N/A |

Verbatim from the 4.5 release notes [P3]: the Manifold solver "is based on the Manifold Library. It is much more robust than the float solver... It only works when all the arguments are manifold — i.e., each edge is adjacent to exactly two faces. As an exception, the case of subtracting a plane from a manifold mesh should work."

### 1.2 When to use each (engineering-solid decision tree)

```
Is the input confirmed manifold (heal_mesh → nm_edges==0)?
├─ YES → MANIFOLD (fastest, cleanest). Fall back to EXACT only if artifacts appear.
└─ NO  → EXACT. Enable use_hole_tolerant=True only if EXACT itself errors on
         non-manifold input (performance cost). Never FAST for precision work.
```

- **MANIFOLD** [P3, L1 §4.7]: production default for watertight engineering solids once heal-mesh has passed. Fastest, scales with cores. **Hard requirement: every operand manifold.** Special-case: Difference with a plane works even on a manifold base.
- **EXACT** [P1, S2]: modeling-phase default when inputs may not yet be clean; the only solver that correctly handles coplanar faces, self-intersection (`use_self_intersection=True`, performance cost), and non-manifold input. Slower.
- **FAST (Float)** [P1, L1 §4.7]: avoid in precision/engineering work. Known to produce T-junctions and missing faces on complex geometry. Use only for throwaway previews.

### 1.3 `use_hole_tolerant` and coplanar handling (EXACT only)

From the Manual [P1], verified verbatim:
- **Hole Tolerant** (`use_hole_tolerant`, EXACT-only): "Optimizes the Boolean output for Non-manifold geometry at the cost of increased computational time. Because of the performance impact, this option should only be enabled when the Exact solver demonstrates errors." Set `mod.use_hole_tolerant = (solver == 'EXACT' and errors_observed)`.
- **Self Intersection** (`use_self_intersection`, EXACT-only): "Correctly handle self-intersection in the participating meshes, at the cost of performance." Enable when a single operand self-intersects.
- **Coplanar faces**: EXACT handles them natively (this is its core advantage over FAST). MANIFOLD handles coplanar faces correctly *if* both operands are manifold; if you see sliver/missing-face artifacts on coplanar boolean seams with MANIFOLD, switch that op to EXACT.
- **Materials** (EXACT only, `solver_material_mode`): `'INDEX'` (index-based mapping) or `'TRANSFER'` (copy source materials, add slots). Irrelevant for single-material mold STLs — leave default.

### 1.4 Why both operands must be manifold (and how to guarantee it)

MANIFOLD and clean-EXACT both require it; non-manifold input produces "odd glitches and artifacts" [P1]. Guarantee via the heal-mesh sequence (Section 2):

```python
# Mandatory pre-boolean gate
nm_edges = sum(1 for e in bm.edges if not e.is_manifold)
nm_verts = sum(1 for v in bm.verts if not v.is_manifold)
assert nm_edges == 0 and nm_verts == 0, f"Non-manifold: {nm_edges} edges, {nm_verts} verts"
```

**For cutters too.** A cutter that is a flat plane (single-sided n-gon) is non-manifold — it works only with EXACT (and the special-case MANIFOLD Difference-with-plane). For general cuts, give cutters wall thickness (Solidify) or cap them (`holes_fill`) so they're closed solids.

---

## 2 — NON-MANIFURFACE REPAIR (bmesh, no ops — headless-safe)

Canonical sequence from RUNBOOK §3.1 [L1], verified property names against BMesh ops API [P9]:

```python
import bpy, bmesh

def heal_mesh(obj, merge_dist=0.001):
    """Guarantee a manifold mesh. merge_dist in scene units (1 µm for mm scenes)."""
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(obj.data)
    bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table(); bm.faces.ensure_lookup_table()

    # 1. Delete loose (verts/edges not in any face)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # 2. Merge by distance (weld scan-noise duplicates)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge_dist)
    # 3. Consistent outward normals
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # 4. Fill simple holes (≤4 sides; complex holes → Voxel Remesh)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if not e.is_manifold], sides=4)
    # 5. Dissolve degenerate (zero-area) faces
    bmesh.ops.dissolve_degenerate(bm, dist=merge_dist*0.1, edges=bm.edges)

    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode='OBJECT')
```

### 2.1 Detection primitives

- **`bmesh`:** `edge.is_manifold` (bool — exactly 2 adjacent faces), `edge.is_wire` (no faces), `vert.is_manifold` [P9]. The authoritative programmatic check.
- **`bpy.ops.mesh.select_non_manifold(use_wire=True, use_boundary=True, use_multi_face=True, use_non_contiguous=True, use_verts=True)`** [L1 §3.2] — interactive selection. Requires EDIT mode + a viewport region (use `temp_override` headless).
- **3D Print Toolbox** (`bpy.ops.preferences.addon_enable(module='mesh_3d_print_toolbox')`) [L1 §3.3] — comprehensive report; interactive-only, results land in `obj.data["3d_print_stats"]`.

### 2.2 Voxel Remesh to seal the unsealable

When `holes_fill` can't close a complex tear (typical on a raw photogrammetry scan), Voxel Remesh reconstructs a guaranteed-manifold mesh from the volume [L1 §4.1]:

```python
mod = obj.modifiers.new("Remesh", 'REMESH')
mod.mode = 'VOXEL'             # 'VOXEL' | 'BLOCKS' | 'SHARP' | 'SMOOTH'
mod.voxel_size = voxel_size    # smaller = more faces; probe via depsgraph to hit target
mod.adaptivity = 0.0           # 0 = uniform density; >0 coarsens flat areas
mod.use_smooth_shade = True
mod.use_remove_disconnected = True
mod.threshold = 1.0            # keep largest connected component only
bpy.ops.object.modifier_apply(modifier="Remesh")
```

**Gotcha (verified live [L4]):** VOXEL rounds every sharp edge (Marching-Cubes lattice). It is a *sealing* op, not a *crispness* op. Run it to seal, then re-establish crisp edges via the Bevel pass (§4) — never expect voxel output to be CAD-crisp.

---

## 3 — CLEAN BOOLEAN → QUAD TOPOLOGY (avoid T-junctions, ngon slivers)

Boolean output is valid but artistically unusable: long thin triangles, T-vertices, and n-gons at the intersection seam [L2 §4.3]. Mandatory cleanup before any downstream Bevel/SubD:

### 3.1 The post-boolean cleanup sequence

```python
# 1. Merge by Distance — collapse intersection-coincident verts
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0001)   # 0.1 µm in mm scenes

# 2. Dissolve coplanar n-gons on flat regions (the key crisp-facet op)
#    Decimate modifier, DISSOLVE mode, is the non-destructive equivalent:
mod = obj.modifiers.new("DecPlanar", 'DECIMATE')
mod.decimate_type = 'DISSOLVE'                               # [P8] enum: COLLAPSE|UNSUBDIV|DISSOLVE
mod.angle_limit = 0.0174533                                  # ~1° in radians — merge near-flat faces
bpy.ops.object.modifier_apply(modifier="DecPlanar")

# 3. Re-loop the seam into quads (manual, the one tediously-human step [L3 §6])
#    Add edge loops (Ctrl+R) along the boolean junction → convert n-gons to quads.

# 4. Recalculate normals outward
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
```

### 3.2 Decimate modes for clean facets (verified enums [P8])

`decimate_type` literal values: `'COLLAPSE'` (edge collapse, ratio-based), `'UNSUBDIV'` (un-subdivide), `'DISSOLVE'` (planar — dissolve to form planar polygons). `delimit` (a set) limits which geometry merges; for clean facets preserving sharp edges, use Decimate DISSOLVE then rely on Bevel/Weighted Normal to re-establish the read (dissolving across a sharp edge destroys it — verify visually).

**For holster blocking:** DISSOLVE at ~1° collapses the many coplanar micro-faces a boolean leaves on flat mold walls, producing the clean n-gon facets René's CAD shows — without losing the true sharp edges (those survive because they're >1° dihedral). Follow with the crisp-edge stack (§4).

### 3.3 T-junctions and how to avoid them

A T-junction is a vertex on the edge of another face where no edge continues — it creates a pinching/normal artifact and breaks SubD [L2 §2.4]. Causes + fixes:
- **FAST solver** → notorious for T-junctions. Use EXACT/MANIFOLD [L1 §4.7].
- **Stacked uncleaned booleans** → each adds complexity the next multiplies. Clean (§3.1) between every boolean.
- **Manual loop termination** → when adding a support loop, always provide a redirect (diagonal or merge into existing flow); never let a loop end mid-face [L2 §2.4].

---

## 4 — THE CAD-LIKE CRISP EDGE TECHNIQUE (the definitive stack)

### 4.1 Our validated stack (live on Blender 5.0, BLOCKING-BUILD-LOG s2 [L4])

This is the exact sequence that produced the CAD-matching crisp-faceted HK45 clone. All API names verified against the Blender Python API [P5, P7] and Manual [P4, P6]:

```python
# 0. Pre-conditions: apply scale, mesh is manifold, Shade Smooth ON
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
for poly in obj.data.polygons: poly.use_smooth = True

# 1. Bevel modifier — physical fillet on tagged edges
bev = obj.modifiers.new("Bevel", 'BEVEL')
bev.limit_method   = 'ANGLE'           # [P5] enum: NONE|ANGLE|WEIGHT|VGROUP
bev.angle_limit    = 0.523599          # 30° in radians (ANGLE mode). Use 'WEIGHT' for surgical control.
bev.width          = 0.8               # mm — primary edges; Kydex inner corners ≥1.6 [L2 §3.1]
bev.segments       = 2                 # 1=chamfer, 2=smooth fillet, 3+=near-circular
bev.profile        = 0.5               # 0.5=circular arc; <0.5 concave; >0.5 convex
bev.clamp_overlap  = True              # [P5] default True — cap at 50% shortest edge, prevent self-intersection
bev.harden_normals = True              # [P5] match bevel-face normals to surrounding flats → crisp read
bev.face_strength_mode = 'FSTR_AFFECTED'  # [P5] enum: FSTR_NONE|FSTR_NEW|FSTR_AFFECTED → feeds WN Face Influence
bev.mark_sharp     = True              # [P5] mark bevel edges sharp → feeds sharp-edge shading + export
bev.affect         = 'EDGES'           # [P5] enum: EDGES|VERTICES

# 2. Weighted Normal modifier — flatten the flats, last in stack
wn = obj.modifiers.new("WN", 'WEIGHTED_NORMAL')
wn.weight_mode  = 'FACE_AREA'          # [P6] Face Area | Corner Angle | Face Area and Angle
wn.weight       = 75                   # >50 = large flats dominate (more "contrast")
wn.keep_sharp   = True                 # [P6] preserve Sharp edges → don't soften intentional boundaries
wn.use_face_influence = True           # [P6] read Face Strength from Bevel's FSTR_AFFECTED

# 3. shade_auto_smooth OPERATOR — the 5.0 replacement for legacy Auto Smooth
#    Adds a Smooth-by-Angle modifier (Geometry Nodes asset) pinned to stack bottom [P7].
bpy.ops.object.shade_auto_smooth(use_auto_smooth=True, angle=0.6981317)  # 40° in radians
```

**Stack order (load-bearing):** Bevel → WN → (Smooth-by-Angle auto-pinned bottom). Bevel before WN so WN reads Bevel's `face_strength_mode` tags; Smooth-by-Angle below WN so sharp-edge marks are set first [L2 §6.1].

### 4.2 Per-edge bevel weight (the surgical alternative to ANGLE)

For complex blocking where ANGLE over-selects, use `limit_method='WEIGHT'` and tag edges individually [L4, L2 §3.2]:

```python
# The bevel-weight edge layer (NOT edge.bevel_weight) — verified live on 5.0 [L4]
bm = bmesh.from_edit_mesh(obj.data)
layer = bm.edges.layers.float.get("bevel_weight_edge") or bm.edges.layers.float.new("bevel_weight_edge")
for e in bm.edges:
    if should_bevel(e):                # your criterion (sharp edge, retention boundary)
        e[layer] = 1.0                 # 0.0 = no bevel, 1.0 = full width
bmesh.update_edit_mesh(obj.data)
```

With `limit_method='WEIGHT'`, each edge bevels at `weight × width` — fully parametric; change the modifier `width` to rescale all radii proportionally.

### 4.3 Alternatives ranked (flattest flats + sharpest edges)

| Technique | Flats | Edges | Geo cost | Portable | Best for |
|-----------|-------|-------|----------|----------|----------|
| **Bevel(WEIGHT) + WN(FACE_AREA) + Harden Normals** ★ | Dead-flat | Crisp fillet | +bevel segs | Yes (geometry-baked) | **Holster blocking — our validated default** |
| Bevel(ANGLE) + WN + Harden Normals | Dead-flat | Crisp fillet | +bevel segs | Yes | Fast setup, uniform edges |
| Holding/support loops + SubD | Flat (under SubD) | Controlled radius | +2 loops/edge | Yes | Subdivision-surface workflow, portable bake |
| Edge Crease (Shift+E) + SubD | Flat (under SubD) | Near-crisp at 1.0 | Zero | **No — Blender-only** [L2 §2.3] | In-session speed; convert before export |
| WN(FACE_AREA) alone, no Bevel | Dead-flat | Shading-crisp only (no physical radius) | Zero | Yes | Visual-only crispness; no manufacturing fillet |
| Shade Auto-Smooth alone | Read-flat above angle | Shading-crisp | Zero | Yes | Base layer; insufficient alone for engineering |

★ = our validated stack. It gives **physical radii** (manufacturable, Kydex-safe ≥1.6 mm inner) **AND** dead-flat shading (WN Face Area) **AND** crisp reads (Harden Normals) in one non-destructive, parametric setup.

### 4.4 Subdivision-surface variant (when SubD is needed)

For a SubD path [L2 §2, L3 §2]: add Subdivision Surface (`'SUBSURF'`, Catmull-Clark, viewport L1–2 / render L3, `use_creases=True`) **between Bevel and WN**. Control edges with tight holding loops (2 loops, <5% face-width gap → near-crisp) or Edge Crease (Shift+E, 1.0 = sharp; zero-geo but Blender-only, unreliable on export). Poles (3/5-edge verts) belong on flat hidden faces, never on curves/bevels [L3 §2]. All quads required before SubD — tris pinch, n-gons collapse unpredictably.

---

## 5 — COMMON BOOLEAN ARTIFACTS + FIXES

| Artifact | Cause | Fix |
|----------|-------|-----|
| **Missing faces** at seam | FAST solver, or non-manifold operand with MANIFOLD | Switch to EXACT; heal operands; enable `use_hole_tolerant` on EXACT [P1] |
| **N-gon slivers** (long thin faces) | Boolean intersection on coplanar regions | Decimate DISSOLVE ~1° [P8]; then re-loop seam into quads [§3.1] |
| **Flipped/inconsistent normals** | Operand normals disagreed pre-boolean | `bmesh.ops.recalc_face_normals` on both operands BEFORE boolean [L1 §3.1] |
| **T-junctions** | FAST solver; or stacked uncleaned booleans | Use EXACT/MANIFOLD; clean between every boolean [§3.3] |
| **Bevel pinches/overlaps at corners** | Bevel width > edge length; adjacent bevels collide | `clamp_overlap=True` (default) [P5]; Miter Outer = ARC at concave corners [L2 §3.2] |
| **MANIFOLD solver no-ops / errors** | Operand non-manifold (hole, open boundary, internal face) | heal_mesh → verify `nm_edges==0`; or fall back to EXACT for that op [P3, L1] |
| **Shading seams on flat faces** after boolean | Vertex normals averaged across the seam | WN modifier (Face Area, Face Influence) [P6]; or Bevel Harden Normals [P5] |
| **Asymmetric bevels** | Baked-in object scale | `transform_apply(scale=True)` BEFORE any Bevel/Boolean [L2 §11] |
| **Self-intersection not handled** | EXACT without `use_self_intersection` | Set `mod.use_self_intersection = True` (EXACT only, perf cost) [P1] |

---

## 6 — KYDEX / MANUFACTURING GUARDRAILS (context-bound)

From lane 03 [L2 §3.1, §5], verified against KYDEX TB-140:
- **Inner mold corners:** Bevel ≥ 1.6 mm, 2+ segments (stress-whitening prevention).
- **Draft angle:** 1–2° male, 2–4° female, on all walls parallel to the draw axis.
- **Outer edges:** Bevel ≥ 1.0 mm.
- **Mold shrink:** 0.4–0.6% male / 0.5–0.7% female — scale final geometry before export.
- **No crease-1.0 edges on interior mold surfaces** — replace with holding loops or bevel geometry before export (crease doesn't survive OBJ/FBX/STL) [L2 §2.3].

---

## 7 — CANONICAL CRISP-EDGE STACK RECIPE (copy-paste, Blender 5.0)

```python
"""CAD-like crisp-faceted manifold solid — the holster-blocking quality bar.
Validated live on Blender 5.0. All API names verified against bpy docs [P2,P5,P6,P7,P8]."""
import bpy, bmesh

def crisp_cad_solid(obj, bevel_width=0.8, bevel_angle_deg=30.0, smooth_angle_deg=40.0):
    # 0. Preconditions
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for poly in obj.data.polygons: poly.use_smooth = True

    # Verify manifold (REQUIRED for MANIFOLD solver; cleaner for EXACT)
    bm = bmesh.new(); bm.from_mesh(obj.data)
    nm = sum(1 for e in bm.edges if not e.is_manifold); bm.free()
    assert nm == 0, f"Heal mesh first: {nm} non-manifold edges"

    import math
    # 1. Bevel — physical crisp fillet + harden normals + face-strength tags
    bev = obj.modifiers.new("Bevel", 'BEVEL')
    bev.limit_method        = 'ANGLE'
    bev.angle_limit         = math.radians(bevel_angle_deg)
    bev.width               = bevel_width
    bev.segments            = 2
    bev.profile             = 0.5
    bev.clamp_overlap       = True
    bev.harden_normals      = True
    bev.face_strength_mode  = 'FSTR_AFFECTED'
    bev.mark_sharp          = True
    bev.affect              = 'EDGES'

    # 2. Weighted Normal — flatten flats, preserve sharps, read Bevel face-strength
    wn = obj.modifiers.new("WN", 'WEIGHTED_NORMAL')
    wn.weight_mode         = 'FACE_AREA'
    wn.weight              = 75
    wn.keep_sharp          = True
    wn.use_face_influence  = True

    # 3. Smooth-by-Angle (5.0 operator — adds the GN modifier, auto-pinned bottom)
    bpy.ops.object.shade_auto_smooth(use_auto_smooth=True,
                                     angle=math.radians(smooth_angle_deg))
    return obj
```

**Boolean coupling:** run booleans (MANIFOLD solver, both operands healed-manifold) BEFORE this stack. Clean each boolean junction (§3.1) before the next. Apply the stack top-down for final STL export; verify `nm_edges==0` after every apply.

---

## 8 — UNVERIFIED / NEEDS-RUNTIME-CHECK FLAGS

Honesty layer — these are documented but not yet runtime-confirmed in our live 5.0 scene:
- **`use_hole_tolerant` measurable benefit** on our specific scan-derived meshes — Manual says "only when EXACT demonstrates errors" [P1]; we haven't benchmarked the threshold. Verify empirically when a MANIFOLD boolean produces seam artifacts on a healed mesh.
- **`face_strength_mode='FSTR_AFFECTED'` vs `'FSTR_NEW'`** visual delta on holster-scale geometry — both documented [P5]; A/B on the next blocking pass.
- **Decimate DISSOLVE `delimit` set** for preserving sharp edges while dissolving coplanar — the enum exists [P8] but the exact `delimit` bitmask that protects Sharp-tagged edges needs a runtime test on a post-boolean mesh.
- **MANIFOLD solver core-scaling** on macOS (our host) — release notes say "bigger speedups on more processors" [P3]; not benchmarked locally.

---

## 15-LINE SUMMARY (the definitive answer)

```
1. SOLVERS: 'MANIFOLD' (4.5+, default for watertight), 'EXACT' (coplanar/non-manifold/self-intersect),
   'FAST' (avoid for precision — T-junctions). API: mod.solver enum [P1,P2,P3].
2. MANIFOLD hard-requires both operands manifold ("each edge adjacent to exactly two faces" [P3]);
   special-case Difference-with-plane works on a manifold base.
3. EXACT-only flags: use_hole_tolerant (perf cost, use only when EXACT errors on non-manifold [P1]),
   use_self_intersection (perf cost, for self-intersecting operands [P1]).
4. GUARANTEE manifold: heal_mesh = delete loose → remove_doubles → recalc_face_normals → holes_fill
   → dissolve_degenerate; gate on nm_edges==0 && nm_verts==0 [L1,P9].
5. DETECT non-manifold: bmesh edge.is_manifold/vert.is_manifold [P9]; or select_non_manifold op;
   or 3D Print Toolbox addon. Seal the unsealable with Voxel Remesh (rounds edges — re-crisp after).
6. POST-BOOLEAN CLEANUP (mandatory): remove_doubles → Decimate DISSOLVE ~1° (decimate_type='DISSOLVE' [P8])
   → re-loop seam into quads → recalc normals. Never stack uncleaned booleans.
7. CRISP-EDGE STACK (validated live 5.0 [L4]): Bevel(limit=ANGLE/WEIGHT, seg 2, profile 0.5,
   clamp_overlap=True, harden_normals=True, face_strength_mode='FSTR_AFFECTED', mark_sharp=True)
   → Weighted Normal(weight_mode='FACE_AREA', weight 75, keep_sharp=True, use_face_influence=True [P6])
   → bpy.ops.object.shade_auto_smooth(angle=40°) [P7].
8. BEVEL harden_normals matches bevel-face normals to surrounding flats → crisp read w/o extra geo [P5].
9. WN FACE_AREA makes large flats dominate vertex normals → dead-flat read even at small fillet meets [P6].
10. shade_auto_smooth is the 5.0 OPERATOR (adds Smooth-by-Angle GN modifier, auto-pinned bottom) [P7];
    legacy Object-Data Auto Smooth was REMOVED in 4.1.
11. PER-EDGE control: limit_method='WEIGHT' + bm.edges.layers.float "bevel_weight_edge" (NOT edge.bevel_weight) [L4].
12. SUBSURF variant: insert SUBSURF (Catmull-Clark, use_creases=True) between Bevel and WN; all-quads required;
    holding loops (<5% gap) or Edge Crease 1.0 (Blender-only, not in export [L2 §2.3]).
13. KYDEX: inner corners ≥1.6mm bevel, draft 1-2° male/2-4° female, shrink 0.4-0.7% [L2 §3.1].
14. APPLY ORDER for export: Bevel → WN → Smooth-by-Angle (top-down); verify nm_edges==0 after each.
15. FLAGS: use_hole_tolerant benefit, FSTR_AFFECTED vs NEW delta, Decimate delimit sharp-edge preservation,
    MANIFOLD macOS core-scaling — all documented but not yet runtime-confirmed on our meshes (§8).
```
