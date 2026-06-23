# Blender Department — Canonical Operating Runbook

**Audience:** AI agents operating Blender to produce professional-grade holster-mold blockings for custom-gear.ch.
**Quality bar:** manufacturable topology, dimensional precision, professional mold engineering.
**Blender version:** 5.0 (API notes include 4.1–4.x deltas where they differ).
**Ground truth:** René Spatz's STEPS.docx process + Phase-1 live script (`_SYSTEM/blender/holster_prep_phase1.py`).

---

## SECTION 1 — PIPELINE OVERVIEW

### The problem

A holster mold is a two-part female tool: the gun presses Kydex (a thermoplastic sheet) into the mold cavity so it takes the gun's shape. The mold's **blocking channel** must cover every protrusion on both sides of the gun (sights, slide serrations, controls, rails) so the formed holster allows the gun to slide cleanly front-to-back (the draw axis, ±Y in Blender convention) without snagging. A convex hull fills too much (it buries the ejection port, fills rail undercuts). The correct shape is a **directional swept silhouette**: the shadow the gun casts along the draw axis, with a uniform offset for Kydex clearance, solidified and split into two lateral mold halves.

### Stage map

```
01 HK_45 SCAN FULL GUN.stl (photogrammetry/scan, ~1.5M tris, non-manifold)
    │
    ▼  [Phase 1 — Blender, scriptable]
IMPORT wm.stl_import  →  VERIFY unit scale (bbox ≈ 215 mm)
    │
VOXEL REMESH (seal scan, watertight)  →  probe-loop to overshoot 120k faces
    │
DECIMATE COLLAPSE  →  land in 115–120k face band (René's spec)
    │
ORIGIN_CENTER_OF_MASS  →  zero location  →  transform_apply
    │
wm.stl_export  →  hk45_prepped.stl
    │
    ▼  [Phase 2 — Blender, semi-automated with human confirm]
IMPORT prepped STL
    │
DIRECTIONAL SILHOUETTE SWEEP along ±Y (draw axis)
  — orthographic camera looking along +Y
  — project gun silhouette to XZ plane
  — extrude silhouette slab full gun length + margin
  — Boolean UNION with per-protrusion convex blocking caps
    │
BOOLEAN UNION → merge all blocking into ONE object
    │
OFFSET / SOLIDIFY (Kydex clearance +0.5–1.5 mm, NON_MANIFOLD mode)
    │
MESH QC: watertight, normals, face count, quad %, self-intersection
    │
BISECT along XZ plane (plane_no = (0,1,0), Y=0) → two lateral mold halves
    │
RE-ALIGN each half to its own mass center
    │
EXPORT each half as STL for PETG print or CNC
```

**Human-in-loop gate:** after the directional sweep is generated the agent presents a viewport render. A human confirms GOOD/BAD per the STEPS.docx acceptance examples before exporting. Phase-1 is fully headless.

---

## SECTION 2 — IMPORT / EXPORT

### 2.1 STL Import — `bpy.ops.wm.stl_import` (Blender 4.1+)

The `import_mesh.stl` add-on was **marked legacy in Blender 4.1**. All Blender 4.1+ and 5.0 code must use `wm.stl_import`. The live Phase-1 script uses a runtime hasattr guard to handle both.

```python
import bpy

def import_stl(filepath: str, forward_axis: str = "Y", up_axis: str = "Z") -> bpy.types.Object:
    """Import STL using the 4.1+ unified operator. Returns the imported object."""
    # Clear pre-existing selection so we can identify the new object.
    bpy.ops.object.select_all(action='DESELECT')

    if hasattr(bpy.ops.wm, "stl_import"):
        # Blender 4.1+ / 5.0 — preferred
        bpy.ops.wm.stl_import(
            filepath=filepath,
            forward_axis=forward_axis,   # 'X','Y','Z','-X','-Y','-Z'
            up_axis=up_axis,
        )
    else:
        # Blender 4.0 and earlier legacy fallback
        bpy.ops.import_mesh.stl(
            filepath=filepath,
            axis_forward=forward_axis,
            axis_up=up_axis,
            global_scale=1.0,
            use_scene_unit=False,
            use_facet_normal=False,
        )

    obj = bpy.context.selected_objects[0]
    bpy.context.view_layer.objects.active = obj
    return obj
```

**Parameter notes:**
- `forward_axis` / `axis_forward`: the file's "forward" direction. For most scan exports (Y-forward, Z-up convention): `forward_axis='Y', up_axis='Z'`. If the imported gun is lying flat or sideways, try `'X'` or `'-Y'`.
- **No `global_scale` in `wm.stl_import`**: scale is handled in scene Units (mm). Set `bpy.context.scene.unit_settings.scale_length = 0.001` for mm scenes BEFORE importing, or verify post-import bbox.
- `use_scene_unit=False` in the legacy operator means "ignore scene unit scale" — i.e., treat file values as millimetres directly. Correct for manufacturing scans.

### 2.2 Unit scale verification — the fatal gotcha

An STL from a scanner is almost always in millimetres. Blender's internal unit is metres. **If you import without verifying, a 215 mm gun appears as 0.215 m — looks fine in viewport but boolean offsets, voxel sizes, and tolerances will all be 1000x wrong.**

```python
def verify_unit_scale(obj: bpy.types.Object, expected_mm: float = 215.0, tol: float = 30.0):
    """
    Verify the imported object's longest dimension is close to expected_mm.
    Scene units must be set to mm (scale_length=0.001) for this to read correctly.
    Raises ValueError if the bbox looks wrong.
    """
    dims = obj.dimensions  # in Blender internal units (metres if scale_length=0.001)
    longest = max(dims)
    # Convert to mm: if scene is mm (scale_length=0.001), dimensions are already in metres,
    # multiply by 1000 to compare against expected_mm.
    longest_mm = longest * 1000.0
    if abs(longest_mm - expected_mm) > tol:
        raise ValueError(
            f"Unit scale suspect: longest dim = {longest_mm:.1f} mm, expected ~{expected_mm} mm. "
            f"Check STL units and axis mapping."
        )
    return longest_mm

# Force scene to millimetre mode before import
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 0.001
bpy.context.scene.unit_settings.length_unit = 'MILLIMETERS'
```

**Alternative pattern (no unit settings change):** import as-is, check `max(obj.dimensions)`. If it's ≈0.215 (metres) the STL was in mm and Blender read it as metres. Apply `obj.scale = (1000, 1000, 1000)` then `bpy.ops.object.transform_apply(scale=True)`. This is what Phase-1 does implicitly (it checks `dims` in whatever unit the scene uses and just verifies the voxel_size produces reasonable face counts).

### 2.3 Origin to mass center

```python
# Must be in OBJECT mode
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.origin_set(type='ORIGIN_CENTER_OF_MASS', center='MEDIAN')
obj.location = (0.0, 0.0, 0.0)
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
```

`center='MEDIAN'` uses the median of all vertex positions (geometric center). `center='BOUNDS'` uses the bounding box center — use BOUNDS if you want the holster centered on its envelope rather than its mass. For mold registration: MEDIAN is correct.

### 2.4 STL Export — `bpy.ops.wm.stl_export` (Blender 4.1+)

```python
def export_stl(filepath: str, obj: bpy.types.Object = None):
    """Export active object (or specific obj) as binary STL."""
    if obj:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

    if hasattr(bpy.ops.wm, "stl_export"):
        # Blender 4.1+ / 5.0
        bpy.ops.wm.stl_export(
            filepath=filepath,
            export_selected_objects=True,  # only the active/selected object
            apply_modifiers=True,
            forward_axis='Y',
            up_axis='Z',
        )
    else:
        # Legacy fallback
        bpy.ops.export_mesh.stl(
            filepath=filepath,
            use_selection=True,
            global_scale=1.0,
            use_scene_unit=False,
            ascii=False,
            use_mesh_modifiers=True,
            axis_forward='Y',
            axis_up='Z',
        )
```

**Manufacturing export settings:**
- `ascii=False` — binary STL is smaller and universally supported by slicers.
- `apply_modifiers=True` / `use_mesh_modifiers=True` — the slicer sees the final evaluated mesh.
- Never export with `global_scale` other than 1.0 unless you deliberately want to scale. The slicer must receive the file in the same mm scale it was built.

---

## SECTION 3 — MESH HYGIENE

Before ANY boolean, remesh, or print operation: the mesh must be manifold (watertight, no holes, no loose geometry, consistent normals). Scan STLs are almost never clean out of the box.

### 3.1 Complete hygiene sequence (bmesh, no ops)

```python
import bpy
import bmesh

def heal_mesh(obj: bpy.types.Object, merge_dist: float = 0.01) -> dict:
    """
    Full mesh hygiene on obj. Returns a dict of before/after stats.
    merge_dist in Blender internal units (0.01 = 10 mm in mm-scene — adjust to ~0.001 for fine scans).
    """
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')

    bm = bmesh.from_edit_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    before = {
        'verts': len(bm.verts),
        'edges': len(bm.edges),
        'faces': len(bm.faces),
        'non_manifold_edges': sum(1 for e in bm.edges if not e.is_manifold),
        'non_manifold_verts': sum(1 for v in bm.verts if not v.is_manifold),
        'wire_edges': sum(1 for e in bm.edges if e.is_wire),
    }

    # 1. Delete loose geometry (verts/edges not part of any face)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')

    # 2. Merge by distance (welds duplicate/near-duplicate verts from scan noise)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge_dist)

    # 3. Recalculate face normals (consistent outward-pointing)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    # 4. Fill simple holes (up to 4-sided holes; for complex holes use remesh instead)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if not e.is_manifold], sides=4)

    # 5. Dissolve degenerate faces (zero-area, slivered)
    bmesh.ops.dissolve_degenerate(bm, dist=merge_dist * 0.1, edges=bm.edges)

    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    after = {
        'verts': len(bm.verts),
        'edges': len(bm.edges),
        'faces': len(bm.faces),
        'non_manifold_edges': sum(1 for e in bm.edges if not e.is_manifold),
        'non_manifold_verts': sum(1 for v in bm.verts if not v.is_manifold),
        'wire_edges': sum(1 for e in bm.edges if e.is_wire),
    }

    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode='OBJECT')

    return {'before': before, 'after': after}
```

**Key thresholds:**
- `non_manifold_edges == 0` and `non_manifold_verts == 0` → manifold/watertight. Required for Boolean MANIFOLD solver and QuadriFlow.
- `wire_edges == 0` → no stray edges.
- After `heal_mesh`, if non-manifold counts are still non-zero: apply Voxel Remesh (Section 4.1) — it reconstructs a guaranteed-manifold mesh from the volume.

### 3.2 Non-manifold detection and selection (interactive / inspect)

```python
def select_non_manifold(obj: bpy.types.Object):
    """Select all non-manifold elements for visual inspection."""
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    # Built-in operator selects non-manifold verts + edges
    bpy.ops.mesh.select_non_manifold(
        extend=False,
        use_wire=True,
        use_boundary=True,
        use_multi_face=True,
        use_non_contiguous=True,
        use_verts=True,
    )
    # Count selected
    bm = bmesh.from_edit_mesh(obj.data)
    n = sum(1 for v in bm.verts if v.select)
    print(f"Non-manifold elements selected: {n}")
    bpy.ops.object.mode_set(mode='OBJECT')
    return n
```

### 3.3 3D Print Toolbox (built-in add-on)

For a comprehensive report without writing bmesh code, enable the built-in add-on:

```python
# Enable the 3D Print Toolbox
bpy.ops.preferences.addon_enable(module='mesh_3d_print_toolbox')

# Run the check — results appear in obj.data["3d_print_stats"] after execution
# (interactive only; in headless mode use the bmesh approach above)
```

---

## SECTION 4 — MODIFIERS

All modifiers follow the same pattern: `obj.modifiers.new(name, type)` → set properties → `bpy.ops.object.modifier_apply(modifier=name)`. Always be in OBJECT mode before applying.

### 4.1 Voxel Remesh

**When:** sealing a scan (non-manifold, noisy), reconstructing a watertight volume, preparing for QuadriFlow or Boolean. **Effect:** destroys all existing topology and UV; output is always manifold.

```python
def voxel_remesh(obj: bpy.types.Object, voxel_size: float, adaptivity: float = 0.0) -> int:
    """
    Apply Voxel Remesh. voxel_size in scene units (mm if scene is mm).
    Returns final face count.
    Smaller voxel_size = more faces, more detail. adaptivity 0.0 = uniform density.
    """
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='OBJECT')

    # Remove any existing Remesh modifier to avoid stacking
    for m in list(obj.modifiers):
        if m.type == 'REMESH':
            obj.modifiers.remove(m)

    mod = obj.modifiers.new("Remesh", 'REMESH')
    mod.mode = 'VOXEL'          # modes: 'VOXEL', 'BLOCKS', 'SHARP', 'SMOOTH'
    mod.voxel_size = voxel_size
    mod.adaptivity = adaptivity  # 0.0–0.99: higher = coarser in flat areas, finer at detail
    mod.use_smooth_shade = True
    mod.use_remove_disconnected = True
    mod.threshold = 1.0          # keep only the largest connected component

    bpy.ops.object.modifier_apply(modifier="Remesh")
    return len(obj.data.polygons)


# Phase-1 pattern: probe before applying to hit a face-count target
def voxel_remesh_to_target(obj, target_min: int, target_max: int) -> float:
    """
    Binary-search voxel_size to land face count in [target_min, target_max].
    Uses depsgraph evaluation (no destructive apply until converged).
    Returns the voxel_size used.
    """
    max_dim = max(obj.dimensions)
    voxel = max_dim / 380.0  # starting guess: coarse enough to be fast

    # Add modifier once, tune in-place
    mod = obj.modifiers.new("Remesh", 'REMESH')
    mod.mode = 'VOXEL'
    mod.adaptivity = 0.0

    for attempt in range(8):
        mod.voxel_size = voxel
        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()
        ef = len(obj.evaluated_get(dg).data.polygons)
        print(f"  probe {attempt}: voxel={voxel:.4f} -> ~{ef} faces")
        if ef >= target_max:
            break
        voxel *= 0.82  # finer = more faces

    bpy.ops.object.modifier_apply(modifier="Remesh")
    return voxel
```

**Mode comparison:**
| Mode | Output | Use case |
|------|--------|----------|
| `VOXEL` | Even density, manifold, volume-aware | Scan sealing, boolean prep |
| `BLOCKS` | Minecraft-voxel aesthetic | Not for manufacturing |
| `SHARP` | Preserves sharp edges | Feature-preserving retopo |
| `SMOOTH` | Smoother than SHARP | Organic retopo |

**Gotcha:** The input mesh must have some thickness. A flat plane through VOXEL mode may produce nothing or a degenerate result. Add Solidify first.

### 4.2 QuadriFlow Remesh

**When:** you need an all-quad mesh for clean topology (boolean results, artist-quality loft base, UV-friendly surfaces). Requires a manifold input.

```python
def quadriflow_remesh(obj: bpy.types.Object, target_faces: int = 8000,
                       preserve_sharp: bool = True, preserve_boundary: bool = True) -> int:
    """
    Run QuadriFlow on obj. Destroys all data layers (UVs, vertex colors, etc.).
    Returns final face count.
    """
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='OBJECT')

    # QuadriFlow requires manifold input — verify first
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    nm = sum(1 for e in bm.edges if not e.is_manifold)
    bm.free()
    if nm > 0:
        raise ValueError(f"QuadriFlow requires manifold mesh. Non-manifold edges: {nm}. Run voxel_remesh first.")

    bpy.ops.object.quadriflow_remesh(
        use_paint_symmetry=False,
        use_preserve_sharp=preserve_sharp,
        use_preserve_boundary=preserve_boundary,
        preserve_paint_mask=False,
        smooth_normals=True,
        mode='FACES',             # 'FACES', 'RATIO', or 'EDGE' for edge-length mode
        target_faces=target_faces,
        seed=0,                   # change seed for different quad layouts
    )
    return len(obj.data.polygons)
```

**Target face counts for holster work:**
- Blocking channel body: 4,000–8,000 faces (sufficient detail, fast boolean)
- Mold outer shell: 2,000–4,000 faces
- Final print-ready export: keep René's 115–120k for the gun; mold halves at 30–60k is adequate for PETG print.

### 4.3 Decimate

**When:** reducing face count while preserving gross shape (after voxel remesh overshot, or to simplify a boolean cutter).

```python
def decimate_to_target(obj: bpy.types.Object, target: int, max_passes: int = 5) -> int:
    """
    Iteratively apply COLLAPSE decimate until face count is at or below target.
    Returns final face count.
    """
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='OBJECT')

    for i in range(max_passes):
        cur = len(obj.data.polygons)
        if cur <= target:
            break
        ratio = min(0.98, max(0.05, target / cur))
        mod = obj.modifiers.new(f"Dec{i}", 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = ratio
        mod.use_collapse_triangulate = False  # keep quads where possible
        bpy.ops.object.modifier_apply(modifier=f"Dec{i}")

    return len(obj.data.polygons)
```

**PLANAR mode** (dissolves coplanar faces — good for cleaning up boolean outputs with many coplanar micro-faces):
```python
mod = obj.modifiers.new("DecPlanar", 'DECIMATE')
mod.decimate_type = 'DISSOLVE'
mod.angle_limit = 0.0174533  # ~1 degree in radians — dissolve nearly-flat faces
bpy.ops.object.modifier_apply(modifier="DecPlanar")
```

### 4.4 Smooth vs Corrective Smooth

**Plain Smooth** (`'SMOOTH'`) — Laplacian averaging. Shrinks the mesh. Fast, no volume preservation. Use only on small, non-critical regions or when you explicitly want to round edges.

```python
mod = obj.modifiers.new("Smooth", 'SMOOTH')
mod.factor = 0.5       # 0–1: intensity per iteration
mod.iterations = 3     # keep low — 5+ on complex mesh gets slow
mod.use_x = mod.use_y = mod.use_z = True
```

**Corrective Smooth** (`'CORRECTIVE_SMOOTH'`) — smooths while preserving volume by binding a rest pose and correcting back. **Use this for holster blocking** where you want rounded edges on the mold walls without shrinking the sight covers or grip tip.

```python
mod = obj.modifiers.new("CorrSmooth", 'CORRECTIVE_SMOOTH')
mod.factor = 0.8
mod.iterations = 12
mod.smooth_type = 'LENGTH_WEIGHTED'  # 'SIMPLE' or 'LENGTH_WEIGHTED' (better for irregular meshes)
mod.use_only_smooth = False           # True = preview smoothing only, no correction
mod.use_pin_boundary = True           # pin mold parting-line boundary edges — prevents them from moving
mod.rest_source = 'ORCO'             # 'ORCO' = original mesh coords, 'BIND' = bind on first eval
```

**Critical for sight tips:** wrap the sight cover region in a vertex group and set `mod.vertex_group = "sight_cover"`. Limit the corrective smooth to non-critical surfaces only. Sight cover walls must stay sharp (0.5 mm deviation = failed retention).

```python
# Assign vertex group for selective smoothing
vg = obj.vertex_groups.new(name="smooth_zone")
# Add face indices to the group (example — in practice derive from proximity to smooth_targets)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
# ... select desired faces ...
bpy.ops.object.vertex_group_assign()
bpy.ops.object.mode_set(mode='OBJECT')
mod.vertex_group = "smooth_zone"
mod.invert_vertex_group = False
```

### 4.5 Shrinkwrap

**When:** fitting an offset shell tightly around the gun scan, or projecting blocking geometry onto the gun surface.

```python
mod = obj.modifiers.new("Shrinkwrap", 'SHRINKWRAP')
mod.target = bpy.data.objects["HK45_block_prep"]   # the gun object
mod.wrap_method = 'NEAREST_SURFACEPOINT'            # 'NEAREST_SURFACEPOINT', 'PROJECT', 'NEAREST_VERTEX', 'TARGET_PROJECT'
mod.wrap_mode = 'ON_SURFACE'                        # 'ON_SURFACE', 'INSIDE', 'OUTSIDE', 'OUTSIDE_SURFACE', 'ABOVE_SURFACE'
mod.offset = 0.5                                    # clearance in scene units (mm)
mod.use_project_z = False
```

**Workflow for Kydex clearance shell:**
1. Duplicate the prepped gun mesh.
2. Apply Shrinkwrap with `wrap_mode='OUTSIDE_SURFACE'`, `offset=1.0` (1 mm clearance + Kydex thickness buffer).
3. Apply Solidify to give the shell wall thickness.
4. This becomes the blocking channel interior surface.

### 4.6 Solidify

```python
mod = obj.modifiers.new("Solidify", 'SOLIDIFY')
mod.thickness = 3.0          # wall thickness in scene units (mm)
mod.offset = -1.0            # -1 = expand outward from original surface, +1 = inward, 0 = both sides
mod.use_even_offset = True   # uniform thickness even at curved surfaces (critical for mold walls)
mod.mode = 'NON_MANIFOLD'    # 'EXTRUDE' (simple) or 'NON_MANIFOLD' (better for curved inputs)
mod.use_rim_only = False
```

`NON_MANIFOLD` mode is slower but handles concave/convex surface transitions without self-intersection. Always use it for holster blocking.

### 4.7 Boolean

**When:** cutting the gun impression into the mold block, merging blocking caps into the channel, splitting the mold.

```python
def boolean_op(target_obj, cutter_obj, operation='DIFFERENCE', solver='MANIFOLD'):
    """
    Apply a boolean modifier to target_obj using cutter_obj.
    operation: 'DIFFERENCE', 'UNION', 'INTERSECT'
    solver: 'MANIFOLD' (4.5+, fastest, requires watertight), 'EXACT' (best for coplanar), 'FAST' (legacy)
    """
    bpy.context.view_layer.objects.active = target_obj
    bpy.ops.object.mode_set(mode='OBJECT')

    mod = target_obj.modifiers.new("Bool", 'BOOLEAN')
    mod.operation = operation
    mod.object = cutter_obj
    mod.solver = solver                        # 'MANIFOLD' | 'EXACT' | 'FAST'
    mod.use_self = False
    mod.use_hole_tolerant = (solver == 'EXACT') # only meaningful for EXACT

    bpy.ops.object.modifier_apply(modifier="Bool")

    # Clean up: hide or delete the cutter (don't delete if you need it for the other mold half)
    cutter_obj.hide_viewport = True
    cutter_obj.hide_render = True
```

**Solver selection for holster work:**
- `'MANIFOLD'` (Blender 4.5+/5.0): fastest, most reliable for clean watertight meshes. Use for all production work after mesh hygiene passes.
- `'EXACT'`: use when MANIFOLD produces artifacts, when meshes have coplanar faces, or on Blender 4.0–4.4.
- `'FAST'`: avoid in precision work — known to produce T-junctions and missing faces on complex geometry.

**Both operands must be watertight for MANIFOLD/EXACT.** Run `heal_mesh` + verify `non_manifold_edges == 0` before boolean.

---

## SECTION 4b — TOPOLOGY FOR ARTISTS

### What "marvellous topology" means

In a holster mold context: the mesh deforms and renders predictably, UV unwrapping is clean, normals are consistent, and the slicer (Bambu/Cura/PrusaSlicer) produces clean perimeters without micro-facets that cause surface artifacts on the molded Kydex.

**The four properties of professional topology:**
1. **All-quad or near-quad flow.** Triangles on flat faces are fine (they'll be printed flat). Triangles at high-curvature zones (sight tower, grip base) cause normal artifacts in renders and uneven slicer paths.
2. **Even face density.** Adjacent faces within 3:1 area ratio. Huge faces next to micro-faces = slicer artifacts.
3. **Edge loops follow the form.** Loops ring around cylindrical features (barrel, sight tower). They don't terminate abruptly in the middle of a flat face — pole vertices (5+ edges) are hidden on flat areas, never at corners.
4. **Consistent outward normals.** All normals point out of the volume. `recalc_face_normals` handles this.

### When voxel→QuadriFlow is enough

For the **blocking channel body**: voxel remesh at 2–3 mm → QuadriFlow at 6,000–10,000 faces. The QuadriFlow output will have clean quad flow, even density, and correct normals. Sufficient for mold manufacturing.

### When a lofted/bridged cross-section approach gives superior topology

When the blocking channel must follow a complex silhouette path (e.g., the HK45T's threaded barrel adds a cylindrical protrusion at muzzle that the blocking channel must envelope without over-filling the receiver undercuts): build the channel from **lofted cross-sections**.

```python
import bpy, bmesh, mathutils

def build_lofted_blocking_channel(gun_obj, cross_sections_Y: list, xz_radius: float) -> bpy.types.Object:
    """
    Build a blocking channel by lofting oval cross-sections along the draw axis (Y).
    cross_sections_Y: list of Y positions (in mm / scene units) where cross-sections are placed.
    xz_radius: initial radius for each cross-section (XZ plane); will be adjusted to gun silhouette.

    Returns a new mesh object representing the channel interior.
    """
    bm = bmesh.new()
    loop_verts = []

    for y_pos in cross_sections_Y:
        # Generate an oval cross-section in XZ at this Y
        ring = []
        segments = 16  # quad-friendly: power of 2
        for i in range(segments):
            import math
            angle = 2 * math.pi * i / segments
            x = xz_radius * math.cos(angle)
            z = xz_radius * 0.6 * math.sin(angle)  # narrower in Z (gun is wider than tall)
            v = bm.verts.new(mathutils.Vector((x, y_pos, z)))
            ring.append(v)
        loop_verts.append(ring)

    # Bridge adjacent rings into quad faces
    for i in range(len(loop_verts) - 1):
        edges_a = []
        edges_b = []
        ring_a = loop_verts[i]
        ring_b = loop_verts[i + 1]
        n = len(ring_a)
        for j in range(n):
            ea = bm.edges.get([ring_a[j], ring_a[(j + 1) % n]]) or bm.edges.new([ring_a[j], ring_a[(j + 1) % n]])
            eb = bm.edges.get([ring_b[j], ring_b[(j + 1) % n]]) or bm.edges.new([ring_b[j], ring_b[(j + 1) % n]])
            edges_a.append(ea)
            edges_b.append(eb)
        # bridge_loops bridges two edge loops into a quad strip
        bmesh.ops.bridge_loops(bm, edges=edges_a + edges_b)

    # Cap the ends
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if not e.is_manifold], sides=segments)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new("blocking_channel")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new("blocking_channel", mesh)
    bpy.context.collection.objects.link(obj)
    return obj
```

**`bmesh.ops.bridge_loops` signature:**
```python
bmesh.ops.bridge_loops(bm, edges, use_pairs=False, use_cyclic=False, use_merge=False,
                        merge_factor=0.5, twist_offset=0)
```
- `edges`: combined list of edges from BOTH loops. The op identifies the two loops automatically.
- `use_cyclic`: True for closed loops (rings around the gun barrel). False for open profiles.
- Output: quad faces connecting the two rings. The result is artist-quality quad topology.

**Adjusting cross-section to gun silhouette:** after creating the lofted channel, apply Shrinkwrap with `OUTSIDE_SURFACE` mode to fit it snugly, then Solidify outward. This is the "directional sweep" approach that beats convex hull.

---

## SECTION 5 — CONTEXT / OPS PITFALLS

### 5.1 The poll() problem

Every `bpy.ops.*` call checks a `poll()` condition before executing. If the required context (active object, mode, area type) is not satisfied, Blender raises `RuntimeError: Operator bpy.ops.X.poll() failed`. In headless / MCP-socket scripts the window/area may be None or the wrong type.

**Rule:** prefer `bpy.data` and `bmesh` operations over `bpy.ops` wherever possible. `bpy.ops` is the GUI layer; `bpy.data` + `bmesh` is the data layer — always available, no context requirements.

```python
# BAD — ops that fail headless:
bpy.ops.mesh.remove_doubles()     # requires EDIT mode + active mesh object
bpy.ops.object.shade_smooth()     # requires active object

# GOOD — data-layer equivalents:
# remove_doubles:
bm = bmesh.new(); bm.from_mesh(obj.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
bm.to_mesh(obj.data); bm.free()

# shade smooth:
for poly in obj.data.polygons:
    poly.use_smooth = True
obj.data.update()
```

### 5.2 temp_override (Blender 3.2+)

When you must use an ops-only operator from a script context (e.g., view3d.view_selected, screen_full_area):

```python
# Find the VIEW_3D area
def get_view3d_area():
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == 'VIEW_3D':
                return window, area
    return None, None

window, area = get_view3d_area()
if area:
    region = next(r for r in area.regions if r.type == 'WINDOW')
    with bpy.context.temp_override(window=window, area=area, region=region):
        bpy.ops.view3d.view_selected()
```

**Never use the old dict override pattern (`bpy.ops.X({'area': area, ...})`) — deprecated since 3.2, errors in 4.x.**

### 5.3 Mode discipline

```python
# Always set OBJECT mode before:
# - modifier_apply
# - origin_set
# - transform_apply
# - adding/removing modifiers programmatically

bpy.context.view_layer.objects.active = obj
if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
```

A common crash pattern: apply a modifier while in EDIT mode → the mesh data is locked → RuntimeError. Always check and set mode first.

### 5.4 Depsgraph pattern (evaluate without applying)

```python
# Evaluate modifier stack WITHOUT applying — read the resulting mesh:
dg = bpy.context.evaluated_depsgraph_get()
dg.update()
evaluated_obj = obj.evaluated_get(dg)
evaluated_mesh = evaluated_obj.data

face_count = len(evaluated_mesh.polygons)
dimensions  = evaluated_obj.dimensions

# Do NOT call bm.from_mesh(evaluated_mesh) and then modify it — it's read-only.
# To edit, apply the modifier first, then use bmesh on obj.data.
```

### 5.5 No-undo in scripts

`bpy.ops.ed.undo()` does nothing in scripts. Before any destructive operation (modifier_apply, delete, boolean), save a copy:

```python
# Save .blend checkpoint
bpy.ops.wm.save_as_mainfile(filepath="/tmp/checkpoint_before_bool.blend")
```

Or duplicate the object first, hide the original:
```python
import copy
bpy.ops.object.duplicate()
backup = bpy.context.selected_objects[0]
backup.name = obj.name + "_backup"
backup.hide_viewport = True
backup.hide_render = True
```

---

## SECTION 6 — RENDER / VERIFY

### 6.1 Viewport screenshot via Workbench render

`mcp__blender__get_viewport_screenshot` only works in interactive (non-headless) sessions. For headless or reproducible QC renders, use Workbench render to file:

```python
def render_qc_screenshot(obj: bpy.types.Object, output_path: str = "/tmp/qc_render.png",
                          resolution: tuple = (1920, 1080)):
    """
    Set up a camera to frame the object and render a Workbench screenshot.
    Works headless.
    """
    scene = bpy.context.scene

    # Create camera
    bpy.ops.object.camera_add(location=(0, -0.5, 0.15))  # adjust to gun scale
    cam_obj = bpy.context.active_object
    cam_obj.rotation_euler = (1.309, 0, 0)  # ~75° tilt

    # Frame camera to object
    scene.camera = cam_obj
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # Use Workbench (fast, no lighting setup needed)
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'MATCAP'
    scene.display.shading.show_xray = False
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.filepath = output_path
    scene.render.image_settings.file_format = 'PNG'

    bpy.ops.render.render(write_still=True)
    print(f"QC render saved: {output_path}")


def render_wireframe_qc(obj: bpy.types.Object, output_path: str = "/tmp/qc_wire.png"):
    """Render wireframe overlay for topology QC."""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.show_backface_culling = True
    scene.display.shading.show_cavity = True

    overlay = scene.display.shading
    # Wire overlay on workbench
    scene.display.shading.type = 'WIREFRAME'
    scene.display.shading.wireframe_color_type = 'EDGE_ANGLE'

    scene.render.filepath = output_path
    bpy.ops.render.render(write_still=True)
```

### 6.2 Driving VIEW_3D shading live (interactive session)

```python
def set_viewport_solid(obj: bpy.types.Object):
    """Set viewport to SOLID shading and frame the object. Interactive only."""
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            for space in area.spaces:
                if space.type == 'VIEW_3D':
                    space.shading.type = 'SOLID'
                    space.shading.light = 'MATCAP'
                    space.shading.show_cavity = True
            # Frame the object
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            with bpy.context.temp_override(area=area, region=area.regions[-1]):
                bpy.ops.view3d.view_selected()
            break
```

---

## SECTION 7 — MESH QC METRICS

Every mold export must pass all six checks. Run this function before exporting.

```python
import bpy, bmesh, math

def mesh_qc_report(obj: bpy.types.Object) -> dict:
    """
    Compute comprehensive mesh quality metrics.
    Returns a dict; 'pass' key is True only if all hard gates pass.
    """
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='OBJECT')

    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    # 1. Face count
    n_faces = len(bm.faces)

    # 2. Quad %
    n_quads = sum(1 for f in bm.faces if len(f.verts) == 4)
    n_tris  = sum(1 for f in bm.faces if len(f.verts) == 3)
    n_ngons = n_faces - n_quads - n_tris
    quad_pct = (n_quads / n_faces * 100) if n_faces > 0 else 0.0

    # 3. Non-manifold edges and verts
    nm_edges = [e for e in bm.edges if not e.is_manifold]
    nm_verts = [v for v in bm.verts if not v.is_manifold]

    # 4. Face area uniformity (coefficient of variation of face areas)
    areas = [f.calc_area() for f in bm.faces]
    mean_area = sum(areas) / len(areas) if areas else 0
    if mean_area > 0:
        variance = sum((a - mean_area) ** 2 for a in areas) / len(areas)
        cv_area = math.sqrt(variance) / mean_area  # low = uniform; <2.0 is acceptable
    else:
        cv_area = float('inf')

    # 5. Normal consistency (faces pointing inward = inverted normal)
    # Heuristic: check all face normals against their centroid-to-object-center vector
    center = obj.location
    inverted_normals = 0
    for f in bm.faces:
        centroid = f.calc_center_median()
        to_center = center - centroid
        if f.normal.dot(to_center) > 0:
            inverted_normals += 1

    # 6. Self-intersection (bmesh BVH overlap — approximate)
    tree = bmesh.bvh.BVHTree.FromBMesh(bm, epsilon=0.0001)
    overlaps = tree.overlap(tree)
    self_intersect_count = len(overlaps)

    bm.free()

    # Hard gates for mold export
    is_manifold   = len(nm_edges) == 0 and len(nm_verts) == 0
    normals_ok    = inverted_normals < (n_faces * 0.01)  # <1% inverted is acceptable after recalc
    no_self_isect = self_intersect_count == 0

    report = {
        'face_count': n_faces,
        'quad_pct': round(quad_pct, 1),
        'tri_count': n_tris,
        'ngon_count': n_ngons,
        'non_manifold_edges': len(nm_edges),
        'non_manifold_verts': len(nm_verts),
        'area_cv': round(cv_area, 3),
        'inverted_normals': inverted_normals,
        'self_intersections': self_intersect_count,
        # Gates
        'is_manifold': is_manifold,
        'normals_ok': normals_ok,
        'no_self_intersect': no_self_isect,
        'pass': is_manifold and normals_ok and no_self_isect,
    }

    for k, v in report.items():
        print(f"  QC {k}: {v}")

    return report
```

**Acceptance thresholds for mold halves:**
| Metric | Target | Hard gate |
|--------|--------|-----------|
| Manifold | `non_manifold_edges == 0` | Yes — block export if failed |
| Normals | `inverted_normals < 1%` | Yes |
| Self-intersection | 0 | Yes for MANIFOLD boolean solver |
| Quad % | >60% | Advisory (tris acceptable for print) |
| Area CV | <3.0 | Advisory |
| Face count (mold half) | 30k–80k | Advisory |

---

## SECTION 8 — HEADLESS / BATCH

### 8.1 Running a script headless

```bash
# Standard headless run
/Applications/Blender.app/Contents/MacOS/Blender \
    --background \
    --python /path/to/script.py \
    -- \
    --input  "/path/to/scan.stl" \
    --output "/path/to/output.stl" \
    --faces  117500

# With an existing .blend file as base (preserves material library, camera setups etc.)
/Applications/Blender.app/Contents/MacOS/Blender \
    --background base_scene.blend \
    --python /path/to/script.py \
    -- \
    --input  "/path/to/scan.stl"
```

**Argument parsing inside the script:**
```python
import sys

def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    def get(flag, default=None):
        return argv[argv.index(flag) + 1] if flag in argv else default

    return {
        'input':  get("--input"),
        'output': get("--output"),
        'faces':  int(get("--faces", "117500")),
        'gun':    get("--gun", "hk45"),
    }

params = parse_args()
```

### 8.2 Parametric per-gun configuration

```python
# Gun parameter registry (expand per new firearm)
GUN_PARAMS = {
    "hk45": {
        "expected_length_mm": 215.0,
        "target_faces_min": 115000,
        "target_faces_max": 120000,
        "draw_axis": "Y",           # gun slides front→back along +Y
        "split_axis_normal": (0, 1, 0),  # Y=0 plane splits left/right halves
        "kydex_clearance_mm": 1.0,  # Kydex spring-back + fit clearance
        "solidify_thickness_mm": 3.0,
        "mold_margin_mm": 5.0,      # extra mold material around gun envelope
    },
    "glock19": {
        "expected_length_mm": 187.0,
        "target_faces_min": 110000,
        "target_faces_max": 120000,
        "draw_axis": "Y",
        "split_axis_normal": (0, 1, 0),
        "kydex_clearance_mm": 0.8,
        "solidify_thickness_mm": 3.0,
        "mold_margin_mm": 5.0,
    },
}

def get_gun_params(gun_id: str) -> dict:
    params = GUN_PARAMS.get(gun_id.lower())
    if not params:
        raise ValueError(f"Unknown gun: {gun_id}. Add it to GUN_PARAMS.")
    return params
```

### 8.3 Structured output for pipeline integration

Every headless script should print a JSON summary line:

```python
import json

summary = {
    "status": "PASS" if qc['pass'] else "FAIL",
    "gun": params['gun'],
    "input": params['input'],
    "output": output_path,
    "faces_initial": initial_faces,
    "faces_final": final_faces,
    "in_target_band": target_min <= final_faces <= target_max,
    "dims_mm": dims_mm,
    "qc": qc_report,
    "voxel_size": voxel_size,
    "duration_s": round(time.time() - t_start, 1),
}
print("PIPELINE_RESULT " + json.dumps(summary), flush=True)
```

The orchestrator (yuri-workcell, MURE, or a shell script) greps for `PIPELINE_RESULT` and parses it.

### 8.4 Headless gotchas

- **No window manager:** `bpy.context.screen` is `None` headless. Any code that references `bpy.context.screen.areas` will crash. Guard every viewport operation with `if bpy.context.screen:`.
- **bpy can only be imported once per process.** If you need multiple scripts, chain them with `--python script1.py --python script2.py` or merge into one.
- **MCP socket runs interactively.** The blender-mcp socket server lives inside an interactive Blender session. Phase-2 interactive work (human GOOD/BAD confirmation) runs via MCP; Phase-1 batch work runs headless.
- **Print flushing:** always `print(..., flush=True)` so orchestrators see output in real time.

---

## SECTION 9 — EXPORT FOR MANUFACTURING

### 9.1 Material selection

| Material | Temp resistance | Durability | Notes |
|----------|----------------|-----------|-------|
| PETG | ~80°C | High | Standard for holster molds; survives Kydex press temps (~165°C air, ~120°C contact) with aluminum tape buffer |
| ABS | ~100°C | Medium | More heat-resistant than PETG but warps during printing |
| PLA | ~60°C | Low | **Do not use** — melts during Kydex thermoforming |
| ASA | ~100°C | High | Best if available; UV-stable, handles repeated presses |

Print settings for PETG mold halves:
- Infill: 80–100% (structural mold — not decorative)
- Walls: 4+ perimeters
- Layer height: 0.15–0.2 mm (dimensional accuracy)
- No supports inside blocking channel (design for support-free)

### 9.2 Draft angles

A mold with vertical walls grips the Kydex — it won't release cleanly. Add 1–3° draft angle to all walls parallel to the draw (Y) axis:

```python
def add_draft_angle(obj: bpy.types.Object, axis: str = 'Y', angle_deg: float = 2.0):
    """
    Apply a Weld + Simple Deform taper to approximate draft angle on the draw-axis walls.
    For precision: use the Mesh Data Transfer or manual bevel on parting-line edges.
    angle_deg: 1 = minimum, 2 = standard, 3 = deep undercut zones.
    """
    import math
    bpy.context.view_layer.objects.active = obj
    # Simple Deform TAPER along axis
    mod = obj.modifiers.new("DraftTaper", 'SIMPLE_DEFORM')
    mod.deform_method = 'TAPER'
    mod.deform_axis = axis       # 'X', 'Y', 'Z'
    mod.factor = math.tan(math.radians(angle_deg)) * 2.0  # approximate
    bpy.ops.object.modifier_apply(modifier="DraftTaper")
```

For production: draft angle is better added in the cross-section generation stage (step 4b) by slightly tapering each cross-section ring outward from the parting plane rather than post-applied.

### 9.3 Two lateral mold halves + parting line

The gun is split along the XZ plane at Y=0 (left/right halves). This gives symmetric vacuum-forming pressure and a parting line along the gun's longitudinal axis.

```python
def split_mold_halves(blocking_obj: bpy.types.Object) -> tuple:
    """
    Bisect the blocking object into left (Y>0) and right (Y<0) halves.
    Returns (left_obj, right_obj).
    """
    import bpy

    # Duplicate for the second half
    bpy.ops.object.select_all(action='DESELECT')
    blocking_obj.select_set(True)
    bpy.context.view_layer.objects.active = blocking_obj
    bpy.ops.object.duplicate()
    right_obj = bpy.context.selected_objects[0]
    right_obj.name = blocking_obj.name + "_right"
    left_obj = blocking_obj
    left_obj.name = blocking_obj.name + "_left"

    # Bisect LEFT half: keep Y>=0, clear Y<0
    bpy.context.view_layer.objects.active = left_obj
    left_obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(
        plane_co=(0, 0, 0),
        plane_no=(0, 1, 0),       # Y=0 plane; normal points toward Y+
        use_fill=True,            # fill the cut face
        clear_inner=True,         # remove Y<0 geometry
        clear_outer=False,
        threshold=0.0001,
    )
    bpy.ops.object.mode_set(mode='OBJECT')

    # Bisect RIGHT half: keep Y<=0, clear Y>0
    bpy.context.view_layer.objects.active = right_obj
    right_obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(
        plane_co=(0, 0, 0),
        plane_no=(0, -1, 0),      # flipped normal = keep Y<0 side
        use_fill=True,
        clear_inner=True,
        clear_outer=False,
        threshold=0.0001,
    )
    bpy.ops.object.mode_set(mode='OBJECT')

    # Re-center each half on its own mass center
    for half in (left_obj, right_obj):
        bpy.context.view_layer.objects.active = half
        bpy.ops.object.origin_set(type='ORIGIN_CENTER_OF_MASS', center='MEDIAN')

    return left_obj, right_obj
```

**Parting line registration features:** add alignment pins to ensure the two halves register precisely during pressing. These are cylindrical booleans (2–3 mm diameter, 3 mm deep) in offset positions on the flat face. Add two per side (total 4 pins), asymmetrically placed to prevent reverse assembly.

```python
def add_alignment_pins(left_obj, right_obj, pin_positions: list, pin_r: float = 1.5, pin_depth: float = 3.0):
    """
    pin_positions: list of (x, z) positions for pins on the parting face (Y=0 plane).
    Cuts socket into left half, leaves pin stub on right half.
    """
    for i, (px, pz) in enumerate(pin_positions):
        # Create pin cylinder
        bpy.ops.mesh.primitive_cylinder_add(radius=pin_r, depth=pin_depth * 2,
                                            location=(px, 0, pz))
        pin = bpy.context.active_object
        pin.name = f"pin_{i}"

        # Socket in left half
        boolean_op(left_obj, pin, 'DIFFERENCE', solver='EXACT')

        # Re-create for right half stub (keep pin, hide socket version)
        bpy.ops.mesh.primitive_cylinder_add(radius=pin_r * 0.98, depth=pin_depth,
                                            location=(px, pin_depth * 0.5, pz))
        stub = bpy.context.active_object
        stub.name = f"stub_{i}"
        boolean_op(right_obj, stub, 'UNION', solver='EXACT')
```

### 9.4 Dimensional tolerances

| Feature | Nominal | Tolerance | Notes |
|---------|---------|-----------|-------|
| Gun channel width | gun_width | +1.0 mm | Kydex spring-back |
| Gun channel length | gun_length + 10 mm | ±0.5 mm | 5 mm margin each end |
| Mold wall thickness | 3.0 mm | ±0.2 mm | Solidify NON_MANIFOLD |
| Alignment pin diameter | 3.0 mm | +0.0 / -0.1 mm | Slip fit |
| Pin socket diameter | 3.0 mm | +0.1 / -0.0 mm | Slip fit |
| Parting plane flatness | 0.0 mm deviation | <0.2 mm | Verify post-bisect |

**Verify symmetry after bisect:**
```python
def verify_split_symmetry(left_obj, right_obj, axis: int = 1, tol: float = 0.5):
    """Check that both halves are mirror-symmetric. axis=1 = Y."""
    ld = left_obj.dimensions
    rd = right_obj.dimensions
    for i, ax in enumerate(['X', 'Y', 'Z']):
        delta = abs(ld[i] - rd[i])
        status = "OK" if delta <= tol else f"WARNING: {delta:.2f} mm > {tol} mm"
        print(f"  Symmetry {ax}: left={ld[i]:.2f} right={rd[i]:.2f} delta={delta:.2f} mm — {status}")
```

### 9.5 Final STL export for manufacturing

```python
def export_mold_halves(left_obj, right_obj, output_dir: str, gun_id: str):
    """Export both mold halves as binary STL, named for the gun and side."""
    import os

    for obj, side in [(left_obj, "left"), (right_obj, "right")]:
        path = os.path.join(output_dir, f"{gun_id}_mold_{side}.stl")
        export_stl(path, obj)
        print(f"Exported: {path}")

    # QC both halves
    for obj, side in [(left_obj, "left"), (right_obj, "right")]:
        print(f"\nQC — {side} half:")
        qc = mesh_qc_report(obj)
        if not qc['pass']:
            print(f"  EXPORT BLOCKED: {side} half failed QC gates.")
            return False

    return True
```

---

## SECTION 10 — COMPLETE PHASE-1 REFERENCE (ground truth)

The live Phase-1 script at `_SYSTEM/blender/holster_prep_phase1.py` is the canonical reference. It implements:
- `wm.stl_import` with `import_mesh.stl` fallback (hasattr guard)
- Depsgraph probe loop to overshoot 120k faces before applying
- Iterative decimate to land in 115–120k band
- `ORIGIN_CENTER_OF_MASS` → zero location → `transform_apply`
- `wm.stl_export` with `export_mesh.stl` fallback
- Viewport `temp_override` for `view3d.view_selected`
- Structured `PHASE1_SUMMARY` JSON output

**Verified result (HK_45_TACTICAL, 2026-06-23):** 118,495 faces, in-band, ~45 seconds runtime vs. ~30–45 minutes manual.

---

## SOURCES

1. Blender 4.1 Release Notes — Import/Export pipeline changes (wm.stl_import introduced):
   https://developer.blender.org/docs/release_notes/4.1/pipeline_assets_io/

2. Blender Python API — Wm Operators (current/5.x):
   https://docs.blender.org/api/current/bpy.ops.wm.html

3. Blender Python API — Import Mesh Operators (4.2):
   https://docs.blender.org/api/4.2/bpy.ops.import_mesh.html

4. Blender Python API — Export Mesh Operators (4.1):
   https://docs.blender.org/api/4.1/bpy.ops.export_mesh.html

5. Blender Python API — BMesh Operators:
   https://docs.blender.org/api/current/bmesh.ops.html

6. Blender Python API — BMesh Module:
   https://docs.blender.org/api/current/bmesh.html

7. Blender Python API — RemeshModifier:
   https://docs.blender.org/api/current/bpy.types.RemeshModifier.html

8. Blender 5.1 Manual — Remesh Modifier:
   https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/remesh.html

9. Blender Python API — BooleanModifier:
   https://docs.blender.org/api/current/bpy.types.BooleanModifier.html

10. Blender 5.1 Manual — Boolean Modifier (including Manifold solver, 4.5+):
    https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/booleans.html

11. Blender Python API — Operators (bpy.ops), context override / temp_override:
    https://docs.blender.org/api/current/bpy.ops.html

12. Blender Python API — CorrectiveSmoothModifier:
    https://docs.blender.org/api/current/bpy.types.CorrectiveSmoothModifier.html

13. Blender 5.1 Manual — Smooth Corrective Modifier:
    https://docs.blender.org/manual/en/latest/modeling/modifiers/deform/corrective_smooth.html

14. Blender Python API — Object Operators (quadriflow_remesh):
    https://docs.blender.org/api/current/bpy.ops.object.html

15. Blender Python API Tips and Tricks (headless, arg parsing):
    https://docs.blender.org/api/current/info_tips_and_tricks.html

16. Blender CLI Mastery Guide (renderday.com):
    https://renderday.com/blog/mastering-the-blender-cli

17. Knightfall Customs — 3D Printed PETG Split Molds for Kydex:
    https://knightfallcustoms.com/products/3d-printed-split-molds

18. Jeremy Behreandt — Shaping Models with BMesh (bridge_loops, lofting):
    https://behreajj.medium.com/shaping-models-with-bmesh-in-blender-2-9-2f4fcc889bf0

19. YURI internal research: Claude ↔ Blender + HK_45 feasibility (ground truth for René's process):
    `02_RESOURCES/RESEARCH/claude-blender-holster-blocking-2026-06-23.md`

20. YURI live script (Phase-1, verified 2026-06-23):
    `_SYSTEM/blender/holster_prep_phase1.py`

---

## CONFIDENCE NOTES (version-sensitive API)

| API | Confidence | Notes |
|-----|-----------|-------|
| `wm.stl_import` / `wm.stl_export` | HIGH | Confirmed: introduced 4.1 per official release notes [1]; live script verified working on Blender 5.0 [20] |
| `import_mesh.stl` / `export_mesh.stl` | HIGH (legacy) | Works on Blender ≤4.0; marked legacy 4.1+; still present in 4.x for backward compat |
| `wm.stl_export` `export_selected_objects` param | MEDIUM | Parameter name confirmed in Phase-1 script runtime; not in legacy docs [2] — verify in running Blender with `bpy.ops.wm.stl_export.get_rna_type().properties` |
| `quadriflow_remesh` parameters | HIGH | Documented in 2.83+ API; stable through 5.0 [14] |
| Boolean `solver='MANIFOLD'` | HIGH | New in Blender 4.5; confirmed in manual [10] |
| Boolean `solver='EXACT'` | HIGH | Stable since 2.91 |
| `bmesh.ops.bridge_loops` | HIGH | Stable across all versions [5] |
| `temp_override` context manager | HIGH | Introduced 3.2; required for 4.x+ [11] |
| `CorrectiveSmoothModifier` properties | HIGH | Stable across 3.x–5.x [12] |
| `RemeshModifier.voxel_size` / `adaptivity` | HIGH | Stable since 2.82 [7] |
| Depsgraph eval pattern | HIGH | Canonical pattern, stable [11] |

---

## 15-LINE SUMMARY

```
1.  PIPELINE: scan STL → voxel-seal → decimate to 115-120k faces → center on mass → export (Phase 1, headless);
    then directional-sweep blocking → boolean union → solidify → bisect Y=0 → two mold halves (Phase 2, human-gate).
2.  IMPORT: bpy.ops.wm.stl_import (Blender 4.1+/5.0); import_mesh.stl is legacy (4.0-). Use hasattr guard.
3.  UNIT SCALE: verify max(obj.dimensions)*1000 ≈ 215 mm post-import or raise ValueError — unit mismatch is fatal.
4.  ORIGIN: origin_set(ORIGIN_CENTER_OF_MASS) → obj.location=(0,0,0) → transform_apply(location=True).
5.  EXPORT: bpy.ops.wm.stl_export(export_selected_objects=True, apply_modifiers=True) — binary STL only.
6.  HYGIENE: bmesh remove_doubles → recalc_face_normals → holes_fill → dissolve_degenerate → verify nm_edges==0.
7.  VOXEL REMESH: depsgraph probe loop to overshoot target, then apply; voxel_size ≈ max_dim/380 starting guess.
8.  BOOLEAN: solver='MANIFOLD' (4.5+/5.0) for watertight meshes; fall back to 'EXACT'; never 'FAST' for precision.
9.  TOPOLOGY: bmesh.ops.bridge_loops lofts cross-section rings into quad strips — superior to convex hull for the directional channel.
10. CORRECTIVE SMOOTH: use CORRECTIVE_SMOOTH (LENGTH_WEIGHTED, use_pin_boundary=True) not plain SMOOTH to preserve sight-cover geometry.
11. CONTEXT PITFALLS: use bpy.data+bmesh over bpy.ops headless; use temp_override(window,area,region) for VIEW_3D ops.
12. QC GATES: non_manifold_edges==0, inverted_normals<1%, self_intersections==0; all three must pass before STL export.
13. HEADLESS: blender --background --python script.py -- --input X --output Y; print PIPELINE_RESULT JSON; guard bpy.context.screen.
14. MOLD HALVES: mesh.bisect(plane_no=(0,1,0), use_fill=True, clear_inner=True) × 2 (left/right); add 3mm alignment pins.
15. MATERIAL: PETG 80-100% infill, 0.15mm layer; aluminum tape on mold face; 1-3° draft angle; +1mm Kydex clearance.
```
