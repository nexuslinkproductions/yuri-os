# cgs-decimate engine — reduce an already-loaded STL mesh to a target FACE BUDGET via a Blender
# DECIMATE (collapse) modifier, converged to a 120k-125k band, then applied. Blender-only.
#
# SCOPE: DECIMATION ONLY. Add a DECIMATE modifier, solve its collapse ratio so the mesh lands in the
# owner's face-count band [120000, 125000], apply it. Nothing else — no align, no seal, no union, no
# voxel, no cut, no offset, no export. Face-count reduction is LOSSY + irreversible, so by default the
# engine works a COPY (<name>_DECIMATED) and leaves the source mesh untouched.
#
# WHY COLLAPSE + a solved ratio: COLLAPSE exposes `ratio` in [0,1] = "ratio of triangles to reduce to",
# the only decimate mode with a continuous face-count dial (UNSUBDIV steps in whole subdivision levels and
# does ~nothing on irregular scan topology; PLANAR/DISSOLVE merges by coplanar-angle, no count dial).
# An STL is fully triangulated, so mesh polygons == triangles and the ratio math is exact vs the tri count.
#
# WHY depsgraph-eval, NOT modifier.face_count: `DecimateModifier.face_count` is a UI-display readonly
# field with a documented history of desyncing between the original and evaluated (Copy-on-Write) modifier
# copies in scripted/headless contexts with no viewport redraw (Blender T57777 / T58654 / T60722). The
# API-documented, bug-free readback is to evaluate the depsgraph and count the evaluated mesh's polygons
# WITHOUT applying — the same pattern verified live in _SYSTEM/blender/holster_prep_phase1.py.
#
# CONVENTION: axis-agnostic. Decimation reads only mesh topology (face/vert/edge count); it does not read
# or depend on object orientation or world pose. No axis convention applies (contrast the sibling
# cgs-align, which is entirely about pose). An aligned OR unaligned mesh decimates identically.

try:
    import bpy, bmesh          # present inside Blender; absent under plain python
except Exception:              # pragma: no cover
    bpy = None; bmesh = None

DEFAULT_TARGET = 122500        # midpoint of the owner band; the solver aims here, stops anywhere in-band
DEFAULT_LO, DEFAULT_HI = 120000, 125000

def _require_bpy():
    if bpy is None:
        raise RuntimeError("cgs_decimate: bpy unavailable — run this inside Blender via blender-mcp.")

def _resolve(obj_name):
    """Resolve the target: explicit name -> active mesh -> the sole visible mesh in the scene."""
    _require_bpy()
    if obj_name:
        return bpy.data.objects[obj_name]
    o = bpy.context.view_layer.objects.active
    if o and o.type == 'MESH':
        return o
    meshes = [x for x in bpy.context.scene.objects if x.type == 'MESH' and x.visible_get()]
    if len(meshes) == 1:
        return meshes[0]
    raise RuntimeError("cgs_decimate: name the object (multiple/zero meshes; none active). objects=%r"
                       % [x.name for x in meshes])

def _activate(obj):
    """OBJECT mode, deselect all, select + make active — required before any bpy.ops.object.* (headless-safe)."""
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def _dup(src, out_name):
    """Independent copy (own mesh datablock) linked into the source's collection."""
    if out_name in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[out_name], do_unlink=True)
    obj = src.copy(); obj.data = src.data.copy(); obj.name = out_name
    src.users_collection[0].objects.link(obj)
    return obj

def _eval_faces(obj):
    """obj's face count AFTER its full modifier stack, WITHOUT applying — via the depsgraph. The reliable
    headless readback (see header re: why NOT modifier.face_count). Mirrors holster_prep_phase1.py."""
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    return len(obj.evaluated_get(dg).data.polygons)

def _manifold(me):
    """(non-manifold edge count, boundary/open edge count) on a mesh datablock — evidence for the caller."""
    if bmesh is None:
        return -1, -1
    bm = bmesh.new(); bm.from_mesh(me)
    nm = sum(1 for e in bm.edges if not e.is_manifold)
    bd = sum(1 for e in bm.edges if e.is_boundary)
    bm.free()
    return nm, bd

def decimate_object(obj_name=None, target=DEFAULT_TARGET, lo=DEFAULT_LO, hi=DEFAULT_HI,
                    in_place=False, out_name=None, use_symmetry=False, symmetry_axis='X', max_iters=6):
    """Reduce an already-loaded mesh to the face band [lo, hi] via a solved DECIMATE(collapse). Entry point.

    in_place=False (default) -> work a copy `<name>_DECIMATED`, leave the source untouched (decimation is
                                lossy + irreversible, so the safe default keeps the original).
    in_place=True            -> apply the decimate to the object's own mesh.
    target                   -> the count the ratio solver aims at (band midpoint); it STOPS as soon as the
                                evaluated count is anywhere in [lo, hi].
    use_symmetry             -> OFF by default; ON constrains collapse to mirror-paired verts about symmetry_axis.
    Returns (object, summary). summary['status']: converged | already_in_band | below_band | gave_up.
    """
    _require_bpy()
    src = _resolve(obj_name)
    if src.type != 'MESH':
        raise RuntimeError("cgs_decimate: %r is not a mesh (type=%s)" % (src.name, src.type))
    original = len(src.data.polygons)          # STL is triangulated: polygons == triangles
    existing = [m.name for m in src.modifiers]

    # ---- edge cases: nothing to reduce -----------------------------------------------------------
    if lo <= original <= hi:
        return src, {"status": "already_in_band", "object": src.name, "original_faces": original,
                     "final_faces": original, "in_band": True, "existing_modifiers": existing}
    if original < lo:
        return src, {"status": "below_band", "object": src.name, "original_faces": original,
                     "final_faces": original, "in_band": False, "existing_modifiers": existing,
                     "warning": "%d faces is already below %d — decimate only REMOVES faces, it cannot "
                                "reach the band from below." % (original, lo)}

    # ---- work a copy by default; add ONE collapse modifier ----------------------------------------
    work = src if in_place else _dup(src, out_name or (src.name + "_DECIMATED"))
    _activate(work)
    mod = work.modifiers.new(name="cgs_decimate", type='DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.use_collapse_triangulate = True        # keep output all-triangles at collapse sites
    mod.use_symmetry = use_symmetry            # OFF unless asked
    if use_symmetry:
        mod.symmetry_axis = symmetry_axis

    # ---- solve the ratio: proportional-correct against the ACHIEVED (evaluated) count -------------
    ratio = max(0.02, min(1.0, target / float(original)))
    mod.ratio = ratio
    achieved = _eval_faces(work)
    hist = [{"iter": 0, "ratio": round(ratio, 5), "faces": achieved}]
    it = 1
    while not (lo <= achieved <= hi) and it < max_iters:
        if achieved <= 0:                      # over-collapsed to nothing — back off hard
            ratio = max(0.02, ratio * 0.5)
        else:
            ratio = max(0.02, min(1.0, ratio * target / float(achieved)))
        mod.ratio = ratio
        achieved = _eval_faces(work)
        hist.append({"iter": it, "ratio": round(ratio, 5), "faces": achieved})
        it += 1
        if ratio >= 0.999 and achieved < lo:   # even ratio~1 can't reach the band -> structural, stop
            break
    status = "converged" if lo <= achieved <= hi else "gave_up"

    # ---- apply the (baked) modifier; read the real count -----------------------------------------
    _activate(work)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    final = len(work.data.polygons)
    nm, bd = _manifold(work.data)
    return work, {"status": status, "object": work.name, "in_place": bool(in_place),
                  "original_faces": original, "final_faces": final,
                  "in_band": bool(lo <= final <= hi), "final_ratio": round(ratio, 5),
                  "iterations": it, "reduction_pct": round(100.0 * (1 - final / float(original)), 1),
                  "verts": len(work.data.vertices), "nonmanifold": nm, "boundary": bd,
                  "used_symmetry": bool(use_symmetry), "existing_modifiers": existing, "history": hist}

def import_and_decimate(path, in_place=False, **kw):
    """Import an STL from disk, then decimate it to the band. Convenience for the full 'uploaded STL' flow.
    Blender 4.x/5.x uses wm.stl_import; falls back to import_mesh.stl. Returns (object, summary)."""
    _require_bpy()
    before = set(bpy.data.objects.keys())
    try:
        bpy.ops.wm.stl_import(filepath=path)
    except Exception:
        bpy.ops.import_mesh.stl(filepath=path)
    new = [bpy.data.objects[n] for n in bpy.data.objects.keys()
           if n not in before and bpy.data.objects[n].type == 'MESH']
    if not new:
        raise RuntimeError("cgs_decimate: STL import added no mesh object (%s)" % path)
    return decimate_object(new[0].name, in_place=in_place, **kw)
