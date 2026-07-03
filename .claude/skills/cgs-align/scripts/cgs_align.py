# cgs-align engine — align an uploaded STL (gun / light) to world XYZ, mass-centered. Blender-only.
#
# SCOPE (owner directive 2026-07-03): ALIGNMENT ONLY. Rotate the object so its principal axes land on
# world XYZ, then translate its MASS CENTER to the origin. Nothing else — no seal, no union, no voxel,
# no decimate, no cut, no offset, no export. A pure rigid transform: lossless, reversible, non-mutating
# to geometry (same verts, same face count, same detail).
#
# CONVENTION (inherited from cgs-mold so an aligned object can feed that pipeline directly):
#   Y = length / draw axis   — muzzle (front) at -Y, grip (rear) at +Y
#   Z = height / up          — slide top / sights at +Z, grip toe at -Z
#   X = width / clamshell-seam axis — sign set by right-handedness (X = Y x Z)
#
# METHOD:
#   1. MASS CENTER  = volume centroid of the closed solid (divergence-theorem tetrahedra),
#                     graceful fallback: area-weighted surface centroid -> vertex mean.
#                     Owner 2026-07-03: PURE MASS CENTER on ALL 3 AXES (not the cgs-mold sight-channel X).
#   2. PRINCIPAL AXES = eigenvectors of the area-weighted surface covariance about the mass center
#                     (area-weighting kills scan vertex-density bias; directions are what orientation needs).
#                     Sort by eigenvalue desc -> [length, height, width].
#   3. SIGN FIX (gun heuristics, degrade gracefully on a bare light):
#        Y: the GRIP end has the larger HEIGHT extent (the grip hangs down) -> grip -> +Y.
#        Z: the SLIDE TOP spans the full LENGTH -> the taller-in-length half -> +Z.
#        X: x_hat = y_hat x z_hat  (forces a right-handed proper rotation, det=+1 -> no mirror).
#   4. APPLY: New = (P - center) @ R.T ,  R rows = [x_hat, y_hat, z_hat] ; then matrix_world = identity.
#
# The pure-numpy core (_mass_center_and_cov / compute_alignment / apply_alignment / verify_alignment)
# is bpy-free and unit-tested offline (scripts/verify_align_math.py). bpy is lazy-imported only inside
# the Blender-facing functions so the math module imports under plain python for testing.

import math
import numpy as np

try:
    import bpy, bmesh          # present inside Blender; absent when unit-testing the math offline
except Exception:              # pragma: no cover
    bpy = None; bmesh = None

# ============================================================ pure-numpy core (bpy-free, testable)
def _triangulate(F_polys):
    """Fan-triangulate a list of polygon vertex-index tuples -> (M,3) int array."""
    tris = []
    for vs in F_polys:
        for k in range(1, len(vs) - 1):
            tris.append((vs[0], vs[k], vs[k + 1]))
    return np.array(tris, dtype=np.int64) if tris else np.zeros((0, 3), dtype=np.int64)

def _mass_center_and_cov(P, F):
    """Mass center + principal-axis covariance for a (closed) solid.

    center : volume centroid (divergence theorem) when the mesh is a closed solid with non-zero
             signed volume; else area-weighted surface centroid; else vertex mean.
    cov    : area-weighted surface second-moment matrix about `center` (robust principal DIRECTIONS,
             independent of scan vertex density and of face winding).
    Returns (center(3,), cov(3,3), mode:str, closed:bool).
    """
    P = np.asarray(P, dtype=np.float64)
    if len(P) == 0:
        return np.zeros(3), np.eye(3), "empty", False
    center = P.mean(0)
    cov = np.cov(P.T) if len(P) > 2 else np.eye(3)
    mode, closed = "vertex", False
    if F is not None and len(F):
        a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
        cross = np.cross(b - a, c - a)
        tri_area = 0.5 * np.linalg.norm(cross, axis=1)
        A = float(tri_area.sum())
        vol6 = np.einsum('ij,ij->i', a, np.cross(b, c))     # 6 * signed volume of tetra (origin,a,b,c)
        V = float(vol6.sum()) / 6.0
        centr = (a + b + c) / 3.0                            # per-triangle centroid
        if A > 1e-12:
            w = tri_area / A
            if abs(V) > 1e-9:                                # closed solid -> true volume centroid
                tc = (a + b + c) / 4.0                       # per-tetra centroid (origin apex)
                center = (tc * (vol6 / 6.0)[:, None]).sum(0) / V
                mode, closed = "volume", True
            else:                                            # open shell -> surface centroid
                center = (w[:, None] * centr).sum(0)
                mode = "surface"
            d = centr - center
            cov = np.einsum('i,ij,ik->jk', w, d, d)          # area-weighted surface covariance
    return center, cov, mode, closed

def _sign_by_cross_extent(t_axis, t_other):
    """Split points at the median of `t_axis`; return the extent of `t_other` within each half.
    Used for both sign heuristics (grip=taller half along Y; slide-top=longer half along Z)."""
    med = float(np.median(t_axis))
    hi = t_axis >= med
    lo = ~hi
    ext_hi = float(t_other[hi].max() - t_other[hi].min()) if hi.any() else 0.0
    ext_lo = float(t_other[lo].max() - t_other[lo].min()) if lo.any() else 0.0
    return ext_hi, ext_lo

def compute_alignment(P, F):
    """Compute the rigid transform (center, R) that aligns the object's principal axes to world XYZ
    (length->Y, height->Z, width->X) with gun sign heuristics, mass-centered.

    Returns (center(3,), R(3,3), diag:dict). R rows = [x_hat, y_hat, z_hat]; det(R) == +1 (proper
    rotation, never a mirror). Apply with apply_alignment(P, center, R).
    """
    P = np.asarray(P, dtype=np.float64)
    center, cov, mode, closed = _mass_center_and_cov(P, F)
    D = P - center
    evals, evecs = np.linalg.eigh(cov)                       # ascending; orthonormal columns
    # DIRECTIONS from the covariance (density-robust); LABELS length/height/width from the projected
    # bbox EXTENT (2/98 pct, outlier-robust) so 'longest edge -> Y' holds literally even when a shape
    # is near-cubic and the eigenvalue order disagrees with the bbox order. Identical for elongated guns.
    axes = [evecs[:, k] for k in range(3)]
    def _rext(ax):
        t = D @ ax
        return float(np.percentile(t, 98) - np.percentile(t, 2)) if len(t) else 0.0
    exts = [_rext(a) for a in axes]
    order = np.argsort(exts)[::-1]                           # descending extent -> [length, height, width]
    aL = axes[order[0]]; aH = axes[order[1]]; aW = axes[order[2]]
    lamL, lamH, lamW = (exts[order[0]], exts[order[1]], exts[order[2]])   # robust extents (mm)

    tL = D @ aL; tH = D @ aH                                 # projections onto provisional length/height

    # Y sign: grip end (larger HEIGHT extent) -> +Y
    hgt_hi, hgt_lo = _sign_by_cross_extent(tL, tH)
    ysgn = 1.0 if hgt_hi >= hgt_lo else -1.0
    # Z sign: slide-top (larger LENGTH extent) -> +Z
    len_hi, len_lo = _sign_by_cross_extent(tH, tL)
    zsgn = 1.0 if len_hi >= len_lo else -1.0

    y_hat = ysgn * aL
    z_hat = zsgn * aH
    x_hat = np.cross(y_hat, z_hat); x_hat /= (np.linalg.norm(x_hat) or 1.0)   # X = Y x Z (right-handed)
    z_hat = np.cross(x_hat, y_hat); z_hat /= (np.linalg.norm(z_hat) or 1.0)   # re-orthonormalize
    R = np.vstack([x_hat, y_hat, z_hat])                    # rows map a world vector to new-frame coords

    # ambiguity flags: near-equal EXTENTS => the length/height/width labels are not well-separated
    # (e.g. a near-cubic or square shape) => the forward/up sign call is unreliable. Guns are never this.
    ratio_LH = lamL / lamH if lamH > 1e-9 else float('inf')
    ratio_HW = lamH / lamW if lamW > 1e-9 else float('inf')
    diag = {
        "center_mode": mode, "closed_solid": bool(closed),
        "extent_length": round(lamL, 2), "extent_height": round(lamH, 2), "extent_width": round(lamW, 2),
        "sep_length_height": round(float(ratio_LH), 3), "sep_height_width": round(float(ratio_HW), 3),
        "ambiguous_axes": bool(ratio_LH < 1.08 or ratio_HW < 1.08),
        "grip_height_ext": round(max(hgt_hi, hgt_lo), 2), "slide_len_ext": round(max(len_hi, len_lo), 2),
        "det_R": round(float(np.linalg.det(R)), 6),        # must be +1.0
    }
    return center, R, diag

def apply_alignment(P, center, R):
    """Rigid-transform points into the aligned, mass-centered frame: New = (P - center) @ R.T ."""
    return (np.asarray(P, dtype=np.float64) - center) @ np.asarray(R, dtype=np.float64).T

def verify_alignment(P_new, F):
    """Adversarial self-check on the ALIGNED cloud. Returns residual metrics that must all be ~ideal:
      center_residual ~ 0 ; R_new ~ identity (max off-diagonal ~ 0) ; dims ordered Y>=Z>=X (up to
      near-ties); front at -Y ; slide-top at +Z."""
    P_new = np.asarray(P_new, dtype=np.float64)
    cen2, R2, d2 = compute_alignment(P_new, F)
    dims = P_new.max(0) - P_new.min(0)                       # bbox extents X,Y,Z
    off = float(np.abs(R2 - np.eye(3)).max())
    return {
        "center_residual_mm": round(float(np.linalg.norm(cen2)), 4),
        "R_offdiag_max": round(off, 4),
        "dim_x": round(float(dims[0]), 2), "dim_y": round(float(dims[1]), 2), "dim_z": round(float(dims[2]), 2),
        "dims_ordered_yzx": bool(dims[1] >= dims[2] - 1e-6 and dims[2] >= dims[0] - 1e-6),
        "front_y": round(float(P_new[:, 1].min()), 2), "rear_y": round(float(P_new[:, 1].max()), 2),
        "top_z": round(float(P_new[:, 2].max()), 2), "bottom_z": round(float(P_new[:, 2].min()), 2),
    }

# ============================================================ Blender-facing (bpy) — align in Blender
def _require_bpy():
    if bpy is None:
        raise RuntimeError("cgs_align: bpy unavailable — run this inside Blender via blender-mcp.")

def _resolve(obj_name):
    """Resolve the target object: explicit name -> active -> the sole mesh in the scene."""
    _require_bpy()
    if obj_name:
        return bpy.data.objects[obj_name]
    o = bpy.context.view_layer.objects.active
    if o and o.type == 'MESH':
        return o
    meshes = [x for x in bpy.context.scene.objects if x.type == 'MESH' and x.visible_get()]
    if len(meshes) == 1:
        return meshes[0]
    raise RuntimeError("cgs_align: name the object (multiple/zero meshes; none active). objects=%r"
                       % [x.name for x in meshes])

def _world_arrays(obj):
    """World-space vertex positions (N,3) and triangulated faces (M,3) for `obj`."""
    me = obj.data
    mw = np.array(obj.matrix_world)
    N = len(me.vertices)
    P = np.empty((N, 3)); me.vertices.foreach_get("co", P.ravel())
    Pw = P @ mw[:3, :3].T + mw[:3, 3]                        # local -> world
    F = _triangulate([tuple(p.vertices) for p in me.polygons])
    return Pw, F

def _dup(src, out_name):
    if out_name in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[out_name], do_unlink=True)
    obj = src.copy(); obj.data = src.data.copy(); obj.name = out_name
    src.users_collection[0].objects.link(obj)
    return obj

def align_object(obj_name=None, in_place=True, out_name=None):
    """Align an already-imported gun/light mesh to world XYZ, mass-centered. THE skill entry point.

    in_place=True  -> transform the object's own mesh (lossless rigid transform), matrix_world=identity.
    in_place=False -> leave the source untouched, write an aligned copy `<name>_ALIGNED`.
    Stores the applied transform on the object (`cgs_align_center`, `cgs_align_R`) for reversibility/audit.
    Returns (object, summary). Non-geometry-mutating: vertex count + detail are identical, only moved.
    """
    _require_bpy()
    src = _resolve(obj_name)
    P, F = _world_arrays(src)
    center, R, diag = compute_alignment(P, F)
    P_new = apply_alignment(P, center, R)

    target = src if in_place else _dup(src, out_name or (src.name + "_ALIGNED"))
    if not in_place:                                        # dup carries src.matrix_world; we bake world coords
        pass
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    target.data.vertices.foreach_set("co", P_new.ravel().astype(np.float32))
    target.data.update()
    target.matrix_world.identity()
    target["cgs_align_center"] = [float(c) for c in center]
    target["cgs_align_R"] = [float(v) for v in R.ravel()]  # row-major x_hat,y_hat,z_hat

    ver = verify_alignment(P_new, F)
    ok = (ver["center_residual_mm"] < 0.05 and ver["R_offdiag_max"] < 1e-2 and ver["dims_ordered_yzx"])
    summary = {"object": target.name, "in_place": in_place, "verts": len(target.data.vertices),
               "aligned_ok": bool(ok), **diag, **ver}
    return target, summary

def import_and_align(path, in_place=True):
    """Import an STL from disk, then align it. Convenience for the full 'uploaded STL' flow.
    Returns (object, summary). Blender 4.x/5.x uses wm.stl_import; falls back to import_mesh.stl."""
    _require_bpy()
    before = set(bpy.data.objects.keys())
    try:
        bpy.ops.wm.stl_import(filepath=path)
    except Exception:
        bpy.ops.import_mesh.stl(filepath=path)
    new = [bpy.data.objects[n] for n in bpy.data.objects.keys() if n not in before and bpy.data.objects[n].type == 'MESH']
    if not new:
        raise RuntimeError("cgs_align: STL import added no mesh object (%s)" % path)
    obj = new[0]
    return align_object(obj.name, in_place=in_place)

def unalign_object(obj_name):
    """Reverse a prior align_object using the stored transform props (audit/undo). In-place."""
    _require_bpy()
    obj = bpy.data.objects[obj_name]
    if "cgs_align_center" not in obj or "cgs_align_R" not in obj:
        raise RuntimeError("cgs_align: no stored transform on %r" % obj_name)
    center = np.array(list(obj["cgs_align_center"]), dtype=np.float64)
    R = np.array(list(obj["cgs_align_R"]), dtype=np.float64).reshape(3, 3)
    me = obj.data; N = len(me.vertices)
    P = np.empty((N, 3)); me.vertices.foreach_get("co", P.ravel())
    P_orig = P @ R + center                                 # inverse of (P-center)@R.T  ==  P@R + center
    me.vertices.foreach_set("co", P_orig.ravel().astype(np.float32)); me.update()
    return {"object": obj_name, "restored_verts": N}
