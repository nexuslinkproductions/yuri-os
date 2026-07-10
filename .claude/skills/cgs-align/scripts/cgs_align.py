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

def _robust_extent(t):
    """2/98-percentile span of a 1-D projection — outlier-robust extent in mm."""
    return float(np.percentile(t, 98) - np.percentile(t, 2)) if len(t) else 0.0

def _refine_pitch_to_slide(P, F, center, aL, aH, aW):
    """Owner PITCH datum (2026-07-10, GLOCK 43): level to the SLIDE — the straight UPPER/LOWER parting
    line — NOT the rail / frame underside flats. The flats leveler (compute_alignment step 5) references
    the down-facing forward flats, which on many guns are NOT bore-parallel: a Glock 43 has no rail at all
    (it grabbed frame flats, ~2.2deg off), the Walther PDP's rail sits ~3deg off its slide. Re-level to the
    slide's flat SIDEWALL — a big, clean, bore-parallel plane whose BOTTOM EDGE *is* the parting line —
    as a rigid body: PCA of its face centroids in the (length,height) plane gives the slide's true long
    axis; rotate (aL,aH) to lay that axis horizontal. Self-zeroing (a no-op when the flats leveler already
    nailed it, e.g. the SIG) and GUARDED (degrades to no change if the sidewall can't be isolated — a bare
    light, a sparse scan, a wild fit), so it refines ON TOP of the flats leveler without regressing the
    owner-confirmed guns. Returns corrected (aL, aH)."""
    if F is None or len(F) == 0:
        return aL, aH
    a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    fn = np.cross(b - a, c - a); fa = np.linalg.norm(fn, axis=1); ok = fa > 1e-12
    if int(ok.sum()) < 50:
        return aL, aH
    nn = fn[ok] / fa[ok][:, None]; cen = ((a + b + c) / 3.0)[ok] - center
    l = cen @ aL; h = cen @ aH; nW = nn @ aW
    side = ((np.abs(nW) > math.cos(math.radians(25))) & (h > np.percentile(h, 55))   # slide sidewalls:
            & (l > np.percentile(l, 8)) & (l < np.percentile(l, 70)))                 # X-facing, upper, fwd-mid
    if int(side.sum()) < 200:
        return aL, aH
    LH = np.c_[l[side], h[side]]; LH = LH - LH.mean(0)
    ev, evec = np.linalg.eigh(np.cov(LH.T)); d = evec[:, int(np.argmax(ev))]
    if d[0] < 0:
        d = -d                                              # keep the slide long-axis pointing +l (rear)
    ang = math.degrees(math.atan2(d[1], d[0]))              # slide-axis tilt off level, in (l,h)
    if abs(ang) > 8.0:
        return aL, aH                                       # guard: ignore a wild fit
    th = math.radians(ang)
    aL2 = math.cos(th) * aL + math.sin(th) * aH             # new length axis = the slide's own long axis
    aH2 = -math.sin(th) * aL + math.cos(th) * aH
    return aL2, aH2

def _refine_yaw_to_sights(P, F, center, aL, aH):
    """Owner YAW datum (2026-07-10, GLOCK 43): make the FRONT SIGHT and REAR SIGHT colinear along the bore
    — the fine reference the slide-SILHOUETTE PCA averages away. A 0.9mm front-sight offset over a ~130mm
    sight baseline is 0.4deg of yaw: invisible in the slide outline (which read 0.04deg 'square'), obvious
    when you look down the sights (front post sits off-centre in the rear notch). Detect the two sight
    blades as HEIGHT SPIKES protruding above the slide-top baseline (front third + rear slide), take each
    blade's width-centroid (the rear = the two notch posts -> notch centre), and rotate aL about the
    vertical (aH) to zero their width difference. GUARDED: each blade must protrude a real margin (>1.5mm)
    over a real baseline, and the correction is capped at 3deg — so it no-ops on a flat-top slide (the
    synthetic test gun), an optic-cut slide, or a bare light. Returns corrected aL (x_hat re-derives from
    cross(aL,aH) downstream, so only aL needs rotating)."""
    D = P - center
    aWc = np.cross(aH, aL); aWc /= (np.linalg.norm(aWc) or 1.0)     # width axis (perp to the slide plane)
    l = D @ aL; h = D @ aH; w = D @ aWc
    lmin, lmax = float(np.percentile(l, 1)), float(np.percentile(l, 99)); L = lmax - lmin
    if L < 1e-6:
        return aL
    upper = h > np.percentile(h, 55)                               # slide band (excludes the grip)
    def blade(lo, hi):
        m = upper & (l > lo) & (l < hi)
        if int(m.sum()) < 40:
            return None
        base = float(np.percentile(h[m], 50)); top = float(h[m].max())
        if top - base < 1.5:                                       # no real protrusion -> not a sight
            return None
        bl = m & (h > top - 2.0)                                    # top 2mm of the blade / notch posts
        if int(bl.sum()) < 15:
            return None
        return float(w[bl].mean()), float(l[bl].mean())
    fs = blade(lmin + 0.02 * L, lmin + 0.42 * L)                   # front sight (forward third)
    rs = blade(lmin + 0.60 * L, lmax - 0.02 * L)                   # rear sight (rear slide)
    if fs is None or rs is None:
        return aL
    wf, lf = fs; wr, lr = rs
    if abs(lf - lr) < 0.3 * L:                                     # need a real baseline
        return aL
    phi = math.atan((wf - wr) / (lf - lr))                        # small yaw that zeroes the width diff
    if abs(math.degrees(phi)) > 3.0:
        return aL                                                  # guard: cap at 3deg
    aL2 = math.cos(phi) * aL + math.sin(phi) * aWc
    return aL2 / (np.linalg.norm(aL2) or 1.0)

def compute_alignment(P, F, level_slide=True, pitch_offset_deg=0.0, roll_offset_deg=0.0,
                      yaw_offset_deg=0.0, refine_parting=True, refine_sights=True):
    """Gun-canonical rigid transform (center, R): the SLIDE axis -> world Y and horizontal, muzzle at
    -Y, WIDTH -> X, GRIP -> -Z (down); object mass-centered. Owner canonical pose (2026-07-03):
    "muzzle to the left in the X-view, leveled along the slide, grip pointing down".

    Returns (center(3,), R(3,3), diag). R rows = [x_hat, y_hat, z_hat]; det(R) == +1 (proper rotation,
    never a mirror). Apply with apply_alignment(P, center, R). `pitch_offset_deg` adds a manual pitch
    tweak about X on top of the auto-level (owner's eye sets the final degree; + tips the muzzle UP —
    verified 2026-07-04 on the Walther PDP; an earlier note said DOWN and was wrong).

    DATUM REFINEMENTS (owner directive 2026-07-10, GLOCK 43 — the definitive gun references):
      refine_parting=True -> PITCH is re-levelled to the SLIDE / the straight UPPER-LOWER parting line
        (via the slide sidewall, `_refine_pitch_to_slide`), correcting the flats leveler when its rail/
        frame-underside reference isn't bore-parallel (Glock 43 no-rail 2.2deg, PDP rail 3deg).
      refine_sights=True -> YAW is set by FRONT+REAR SIGHT colinearity (`_refine_yaw_to_sights`), the fine
        reference the slide silhouette averages away. Both are self-zeroing + guarded (no-op when already
        right or when the feature can't be found), so they don't regress the earlier owner-confirmed guns.
      `roll_offset_deg` / `yaw_offset_deg` mirror `pitch_offset_deg` — manual eye-tweaks about the bore /
        vertical for the last sub-degree on a coarse scan (owner nudged Rx-0.8/Ry+0.6 on the Glock 43).

    Order: PCA gives 3 orthogonal DIRECTIONS (density-robust) + extent LABELS (length/height/width) ->
    fixes roll, yaw, width. Then gun-anatomy corrections the raw eigen-signs get wrong (each CALIBRATED
    against René's hand-posed SIG P226, 2026-07-03):
      MUZZLE LEFT— the grip (tall) end is the rear; the muzzle end is thin -> the length third with the
                   larger height extent is the rear (+l); muzzle -> -Y. (sign-independent -> done first.)
      GRIP DOWN  — "is the grip below the bore?": the REAR third's area-weighted mean height vs the MIDDLE
                   third's (frame/slide body = bore-height ref). Grip below mid -> grip on -Z; above -> flip.
                   Rear-vs-MID (both exclude the FRONT) survives the two front features that broke earlier
                   tries: an under-barrel WML (dragged the front MEAN down -> flipped René's HK SFP9 upside-
                   down, 2026-07-07) and a tall front sight/optic (out-reached the grip -> broke farthest-
                   reach on the SIG). Area-weighted, so scan vertex-density can't swing it.
      LEVEL SLIDE— level to the mid-height forward SLAB (fwd ~50%, Z 30-75 pct: excludes sight/optic tops
                   AND trigger-guard toe -> the clean bore-parallel body). Calibrated as the reference
                   nearest the owner's eye-level; residual ~1-2deg is covered by `pitch_offset_deg`.
    """
    P = np.asarray(P, dtype=np.float64)
    center, cov, mode, closed = _mass_center_and_cov(P, F)
    D = P - center
    evals, evecs = np.linalg.eigh(cov)
    axes = [evecs[:, k] for k in range(3)]
    exts = [_robust_extent(D @ a) for a in axes]
    order = np.argsort(exts)[::-1]                           # by extent -> [length, height, width]
    aL, aH, aW = axes[order[0]], axes[order[1]], axes[order[2]]
    eL, eH, eW = exts[order[0]], exts[order[1]], exts[order[2]]
    l = D @ aL; h = D @ aH                                   # length & height projections (sign TBD)

    # MUZZLE LEFT (-Y) first (sign-independent): the length third with the larger height extent is the
    # grip/rear -> +l; muzzle -> -l. This fixes which end is the rear so GRIP DOWN can key off it.
    lo = l < np.percentile(l, 33); hi = l > np.percentile(l, 67)
    hext_lo = _robust_extent(h[lo]) if lo.any() else 0.0
    hext_hi = _robust_extent(h[hi]) if hi.any() else 0.0
    if hext_lo > hext_hi:
        aL = -aL; l = -l
    # GRIP DOWN (-Z): "is the grip below the bore line?" Compare the REAR third's AREA-WEIGHTED mean height
    # to the MIDDLE third's (the frame/slide body = a clean bore-height reference). The grip hangs well
    # below the bore -> the rear mean sits below the mid mean -> grip is on -h. If the rear sits ABOVE the
    # mid, the grip is up -> flip.
    #   ★ This survives BOTH failure modes that broke earlier tries, because the reference (mid third) and
    #   the target (rear third) both EXCLUDE the front, where the corrupting features live:
    #     - rear-vs-front MEAN height flipped René's HK SFP9 upside-down (2026-07-07): the under-barrel
    #       TLR-8A dumps low mass at the FRONT, dragging the front mean below the rear -> false flip.
    #     - farthest-reach-from-center flipped the SIG: the tall front sight/optic out-reached the grip
    #       UPWARD. Both live at the front; keying off rear-vs-MID never sees them.
    #   AREA-WEIGHTED (not vertex mean) kills scan vertex-density bias (a densely-scanned slide tail would
    #   otherwise drag a vertex mean up). Verified on the real HK mesh: rear -7.7 vs mid +5.9, a 13.6mm
    #   margin (a vertex mean gave the wrong sign). Vertex fallback when faces are absent.
    if F is not None and len(F):
        fa2, fb2, fc2 = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
        fcen = (fa2 + fb2 + fc2) / 3.0 - center
        far2 = 0.5 * np.linalg.norm(np.cross(fb2 - fa2, fc2 - fa2), axis=1)
        fh = fcen @ aH; fl = fcen @ aL
        mid  = (fl > np.percentile(fl, 35)) & (fl < np.percentile(fl, 62))   # bore-height body (no front, no grip)
        rr   = fl > np.percentile(fl, 70)                                    # rear third = the grip
        def _awh(m):
            s = float(far2[m].sum())
            return float(np.sum(far2[m] * fh[m]) / s) if s > 1e-9 else 0.0
        if rr.any() and mid.any() and _awh(rr) > _awh(mid):     # grip sits above the bore -> it's up -> flip
            aH = -aH; h = -h
    else:                                                       # no faces: vertex fallback (rear vs mid)
        midv = (l > np.percentile(l, 35)) & (l < np.percentile(l, 62)); rrv = l > np.percentile(l, 70)
        if rrv.any() and midv.any() and float(h[rrv].mean()) > float(h[midv].mean()):
            aH = -aH; h = -h

    # LEVEL THE SLIDE (owner: "level to the SLIDE and/or the PICATINNY RAIL — both straight, bore-parallel"):
    # level the near-HORIZONTAL FLATS. The slide-top flat, the slide bottom, and the dust-cover picatinny
    # rail are all machined flats parallel to the bore; their normals point straight up/down when level.
    # Take the area-weighted consensus normal of faces within ~TIGHT_DEG of vertical (both up- and down-
    # facing, folded to +Z) over the forward body, and rotate that consensus to +Z. Iterate to a fixed point.
    #   ★ The TIGHT threshold is the fix (René 2026-07-03): a loose 30deg cone let the slide's angled TOP
    #   BEVELS vote, which read "level" (0.1deg) while the true slide/rail sat -1.7deg. 20deg excludes the
    #   bevels and keeps only the true flats. (Point-cloud slab-PCA landed ~15deg off; up-faces-only caught
    #   the bevels.) Both up+down flats + forward-only + iterate = stable, idempotent, bore-accurate.
    slide_tilt_deg = 0.0
    if level_slide and F is not None and len(F):
        a3, b3, c3 = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
        cosT = math.cos(math.radians(20))                    # near-horizontal flats only (exclude bevels)
        for _ in range(6):
            fn = np.cross(b3 - a3, c3 - a3); fa = np.linalg.norm(fn, axis=1); ok = fa > 1e-12
            fnn = fn[ok] / fa[ok][:, None]; area = 0.5 * fa[ok]
            cl = ((a3 + b3 + c3) / 3.0)[ok] @ aL; ch = ((a3 + b3 + c3) / 3.0)[ok] @ aH
            nH = fnn @ aH; nW = fnn @ aW; nL = fnn @ aL
            fwd = cl < np.percentile(cl, 60)                 # forward body (slide + dust cover, not grip)
            notwall = np.abs(nW) < 0.4
            # PRIMARY reference = the DOWN-facing forward flats = picatinny rail + slide/dust-cover underside
            # (owner's yellow line, 2026-07-03). The underside is the cleanest bore-parallel flat — no
            # sights / optic / serrations, unlike the top. Fall back to the slide-TOP up-flats only if the
            # underside is too sparse (a gun with no rail / open underside).
            rail = (nH < -cosT) & notwall & fwd & (ch < np.median(ch))
            sel = rail if int(rail.sum()) >= 12 else ((nH > cosT) & notwall & fwd & (ch > np.median(ch)))
            if int(sel.sum()) < 8:
                break
            sgn = np.sign(nH[sel])                           # fold the chosen flats to the +aH side
            ul = float(np.sum(area[sel] * sgn * nL[sel]))    # consensus 'up' of the reference flats, in (l,h)
            uh = float(np.sum(area[sel] * sgn * nH[sel]))
            m = math.hypot(ul, uh) or 1.0; ul, uh = ul / m, uh / m
            dth = math.degrees(math.atan2(ul, uh)); slide_tilt_deg += dth
            aH, aL = (ul * aL + uh * aH), (uh * aL - ul * aH)   # rotate so the reference flat -> horizontal
            l = D @ aL; h = D @ aH
            if abs(dth) < 0.1:                               # converged
                break
    # REFINE PITCH to the SLIDE / parting line (owner datum 2026-07-10). The flats leveler above gets close
    # but keys off the rail/frame underside, which isn't bore-parallel on every gun. Re-level to the slide
    # sidewall (self-zeroing + guarded). This is what auto-corrects the Glock-43 2.2deg / PDP 3deg misses.
    parting_refine_deg = 0.0
    if level_slide and refine_parting and F is not None and len(F):
        aL0 = aL.copy(); aL, aH = _refine_pitch_to_slide(P, F, center, aL, aH, aW)
        parting_refine_deg = math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(aL0, aL))))))
        l = D @ aL; h = D @ aH
    # REFINE YAW to the SIGHTS (owner datum 2026-07-10): front + rear sight colinear along the bore.
    sight_yaw_deg = 0.0
    if refine_sights and F is not None and len(F):
        aL1 = aL.copy(); aL = _refine_yaw_to_sights(P, F, center, aL, aH)
        sight_yaw_deg = math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(aL1, aL))))))
        l = D @ aL

    # MANUAL PITCH TWEAK about X (owner's eye): + tips the muzzle UP (verified 2026-07-04, PDP; an older
    # note said "down" and was wrong). Applied after auto-level.
    if pitch_offset_deg:
        th = math.radians(pitch_offset_deg); ct, st = math.cos(th), math.sin(th)
        aL, aH = ct * aL + st * aH, -st * aL + ct * aH
        slide_tilt_deg += pitch_offset_deg
    # MANUAL ROLL about the bore (aL) and YAW about the vertical (aH) — owner's eye, last sub-degree on a
    # coarse scan (Glock 43 needed Rx-0.8 pitch / Ry+0.6 roll after the auto datums). x_hat re-derives below.
    if roll_offset_deg:
        th = math.radians(roll_offset_deg)
        aWc = np.cross(aL, aH); aWc /= (np.linalg.norm(aWc) or 1.0)
        aH = math.cos(th) * aH + math.sin(th) * aWc
    if yaw_offset_deg:
        th = math.radians(yaw_offset_deg)
        aWc = np.cross(aH, aL); aWc /= (np.linalg.norm(aWc) or 1.0)
        aL = math.cos(th) * aL + math.sin(th) * aWc

    y_hat = aL / (np.linalg.norm(aL) or 1.0)
    z_hat = aH / (np.linalg.norm(aH) or 1.0)
    x_hat = np.cross(y_hat, z_hat); x_hat /= (np.linalg.norm(x_hat) or 1.0)   # X = Y x Z (right-handed)
    z_hat = np.cross(x_hat, y_hat); z_hat /= (np.linalg.norm(z_hat) or 1.0)   # re-orthonormalize
    R = np.vstack([x_hat, y_hat, z_hat])

    ratio_LH = eL / eH if eH > 1e-9 else float('inf')
    ratio_HW = eH / eW if eW > 1e-9 else float('inf')
    diag = {
        "center_mode": mode, "closed_solid": bool(closed),
        "extent_length": round(eL, 2), "extent_height": round(eH, 2), "extent_width": round(eW, 2),
        "sep_length_height": round(float(ratio_LH), 3), "sep_height_width": round(float(ratio_HW), 3),
        "ambiguous_axes": bool(ratio_LH < 1.08 or ratio_HW < 1.08),
        "slide_leveled_deg": round(float(slide_tilt_deg), 2),   # pitch correction applied to reach level
        "parting_refine_deg": round(float(parting_refine_deg), 2),   # extra pitch to the slide/parting line
        "sight_yaw_deg": round(float(sight_yaw_deg), 2),        # yaw applied to colinear the sights
        "det_R": round(float(np.linalg.det(R)), 6),             # must be +1.0
    }
    return center, R, diag

def apply_alignment(P, center, R):
    """Rigid-transform points into the aligned, mass-centered frame: New = (P - center) @ R.T ."""
    return (np.asarray(P, dtype=np.float64) - center) @ np.asarray(R, dtype=np.float64).T

def _slide_top_tilt_deg(P, front_frac=0.55):
    """Residual tilt of the slide-top ridge (max-Z per Y-bin over the forward slide) vs horizontal.
    ~0 => the slide is level. Independent of compute_alignment (a true post-hoc check)."""
    Y, Z = P[:, 1], P[:, 2]
    y0, y1 = float(Y.min()), float(Y.min() + front_frac * np.ptp(Y))
    bins = np.linspace(y0, y1, 40); ys, zs = [], []
    for i in range(len(bins) - 1):
        m = (Y >= bins[i]) & (Y < bins[i + 1])
        if int(m.sum()) > 5:
            ys.append((bins[i] + bins[i + 1]) / 2.0); zs.append(float(Z[m].max()))
    if len(ys) < 3:
        return 0.0
    slope = float(np.polyfit(np.array(ys), np.array(zs), 1)[0])
    return float(np.degrees(np.arctan(slope)))

def compute_alignment_light(P, F):
    """LIGHT-canonical rigid transform (center, R) for a weapon-light STL: long axis -> Y, the RAIL
    CLAMP face -> +Z (up) and level, the BEZEL -> -Y (left); object mass-centered. Owner spec 2026-07-03
    (OLIGHT PL2 Valkyrie): "the rail clip is the reference (up + level); the bezel points left".

    A light has none of a gun's grip/slide/sight asymmetry — its cross-section is near-symmetric — so the
    gun heuristics don't apply. Two light-specific features drive it:
      CLAMP  (primary, owner's best cue) — the rail-clip face carries a recessed GROOVE (the channel that
             grips the rail), a valley running along the length; the opposite (battery) side is smooth /
             convex. Search directions perpendicular to the long axis for the one whose OUTER surface is
             most CONCAVE (a channel) -> that face's outward direction is UP. Then level its mounting flat.
      BEZEL  — the reflector/lens end is a concave DISH (the centre is recessed behind the rim); the tail
             (switch) end is not. The dished end -> -Y.
    Returns (center, R, diag); R rows = [x_hat, y_hat, z_hat], det(R)=+1. Apply with apply_alignment.
    """
    P = np.asarray(P, dtype=np.float64)
    center, cov, mode, closed = _mass_center_and_cov(P, F)
    D = P - center
    evals, evecs = np.linalg.eigh(cov)
    axes = [evecs[:, k] for k in range(3)]
    exts = [_robust_extent(D @ a) for a in axes]
    order = np.argsort(exts)[::-1]
    aL = axes[order[0]]; a1 = axes[order[1]]; a2 = axes[order[2]]     # long axis + 2 perpendicular
    pY = D @ aL; p1 = D @ a1; p2 = D @ a2

    # face data (world normals, areas, centroids-about-center) — for clamp search, leveling, bezel
    fclamp = None
    if F is None or len(F) == 0:
        raise RuntimeError("cgs_align light-mode needs faces (the clamp is found from surface structure).")
    a3, b3, c3 = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    fn = np.cross(b3 - a3, c3 - a3); fa = np.linalg.norm(fn, axis=1); ok = fa > 1e-12
    fnn = fn[ok] / fa[ok][:, None]; area = 0.5 * fa[ok]; cen = ((a3 + b3 + c3) / 3.0)[ok] - center
    nA = fnn @ a1; nB = fnn @ a2; nY = fnn @ aL; cA = cen @ a1; cB = cen @ a2
    cos15 = math.cos(math.radians(15))

    # ---- CLAMP: the rail mounting face is the most STRUCTURED large flat (rail slot + cross-bolt +
    # lever) — the battery/body flat is smooth. Score each outward direction by (outer flat area) x
    # (structural complexity)^2. Calibrated on the PL2 (René 2026-07-03): the body flat has MORE raw
    # area (1158 vs 970) but the clamp face is far more complex (1.08 vs 0.88), so complexity^2 tips it.
    best_th, best_score, best_flatarea, best_cx = 0.0, -1.0, 0.0, 0.0
    for th in np.arange(0.0, 360.0, 5.0):
        cd, sd = math.cos(math.radians(th)), math.sin(math.radians(th))
        ndot = nA * cd + nB * sd; cdot = cA * cd + cB * sd
        outer_thr = np.percentile(cdot, 60); outer2_thr = np.percentile(cdot, 80)
        flat = (ndot > cos15) & (np.abs(nY) < 0.4) & (cdot > outer_thr)   # outward-facing flats this way
        outer = cdot > outer2_thr
        if int(outer.sum()) < 10: continue
        fa_ = float(np.sum(area[flat]))
        tang = nA * (-sd) + nB * cd                                    # in-plane tangential normal comp
        cx = float(np.std(nY[outer])) + float(np.std(tang[outer]))     # structural complexity of the face
        score = fa_ * cx * cx
        if score > best_score:
            best_score, best_th, best_flatarea, best_cx = score, float(th), fa_, cx
    cd, sd = math.cos(math.radians(best_th)), math.sin(math.radians(best_th))
    z_hat = cd * a1 + sd * a2                                          # clamp mounting face faces this way -> UP
    y_hat = aL
    x_hat = np.cross(y_hat, z_hat); x_hat /= (np.linalg.norm(x_hat) or 1.0)
    z_hat = np.cross(x_hat, y_hat); z_hat /= (np.linalg.norm(z_hat) or 1.0)

    # ---- LEVEL: set the clamp mounting-flat consensus normal exactly to +Z (fixes roll + pitch) ----
    clamp_level_deg = 0.0
    cosT = math.cos(math.radians(20))
    for _ in range(6):
        nZ = fnn @ z_hat; nYh = fnn @ y_hat; nX = fnn @ x_hat; cZ = cen @ z_hat
        sel = (nZ > cosT) & (np.abs(nYh) < 0.4) & (cZ > 0)            # up-facing clamp-side mounting flats
        if int(sel.sum()) < 8: break
        up = np.array([float(np.sum(area[sel] * nX[sel])), float(np.sum(area[sel] * nYh[sel])),
                       float(np.sum(area[sel] * nZ[sel]))])
        new_z = up[0] * x_hat + up[1] * y_hat + up[2] * z_hat; new_z /= (np.linalg.norm(new_z) or 1.0)
        dth = math.degrees(math.acos(max(-1.0, min(1.0, float(new_z @ z_hat)))))
        x_hat = np.cross(y_hat, new_z); x_hat /= (np.linalg.norm(x_hat) or 1.0)
        z_hat = np.cross(x_hat, y_hat); z_hat /= (np.linalg.norm(z_hat) or 1.0)
        clamp_level_deg += dth
        if dth < 0.1: break

    # ---- BEZEL -> -Y: the REFLECTOR/lens end (owner cue #2). The mount POSITION is unreliable (clamp
    # vs single-screw; centered vs offset), so key off the light-emitting end itself: a concave reflector
    # BOWL (centre recessed behind the rim) with a forward-facing lens cap. Score each end by
    # `cap_area × bowl_depth`; the higher end is the bezel -> -Y. Calibrated on the PL2 (René 2026-07-03):
    # bezel bowl 5.4 vs tail 3.7, cap area 475 vs 386 -> 2575 vs 1428, a clean 1.8x margin.
    pl = D @ y_hat; rr_v = np.hypot(D @ x_hat, D @ z_hat)
    nYb = fnn @ y_hat; cyb = cen @ y_hat
    lmin, lmax = float(pl.min()), float(pl.max()); span = max(lmax - lmin, 1e-6)
    cos35 = math.cos(math.radians(35))
    def _refl_score(front):
        capdir = -1.0 if front else 1.0
        capsel = (((cyb < lmin + 0.25 * span) if front else (cyb > lmax - 0.25 * span))
                  & (nYb * capdir > cos35))                     # end-cap / lens faces pointing out along axis
        capA = float(np.sum(area[capsel]))
        tipv = (pl < lmin + 0.18 * span) if front else (pl > lmax - 0.18 * span)
        if int(tipv.sum()) < 30: return 0.0
        ry = pl[tipv]; rrr = rr_v[tipv]
        inner = rrr < np.percentile(rrr, 30); outer = rrr > np.percentile(rrr, 55)
        if not (inner.any() and outer.any()): return 0.0
        bowl = (float(ry[inner].mean()) - float(ry[outer].mean())) * capdir   # >0 => centre recessed (a bowl)
        return capA * max(bowl, 0.1)
    sf, sr = _refl_score(True), _refl_score(False)
    if sr > sf:                                                 # reflector is at +Y -> flip so bezel -> -Y
        y_hat = -y_hat; x_hat = np.cross(y_hat, z_hat); x_hat /= (np.linalg.norm(x_hat) or 1.0)
        z_hat = np.cross(x_hat, y_hat); z_hat /= (np.linalg.norm(z_hat) or 1.0)

    R = np.vstack([x_hat, y_hat, z_hat])
    diag = {"mode": "light", "center_mode": mode, "closed_solid": bool(closed),
            "clamp_angle_deg": round(float(best_th), 1), "clamp_flat_area": round(best_flatarea, 0),
            "clamp_complexity": round(best_cx, 3), "clamp_leveled_deg": round(float(clamp_level_deg), 2),
            "bezel_score_front": round(sf, 0), "bezel_score_rear": round(sr, 0),
            "det_R": round(float(np.linalg.det(R)), 6)}
    return center, R, diag

def verify_alignment(P_new, F):
    """Adversarial self-check on the ALIGNED cloud (gun-canonical pose). All must be ~ideal:
      center_residual ~ 0 ; R_new ~ identity ; dims Y>=Z>=X ; muzzle at -Y ; GRIP at bottom-rear
      (min-Z vert sits at +Y and below center) ; slide level (|slide_top_tilt| small)."""
    P_new = np.asarray(P_new, dtype=np.float64)
    cen2, R2, d2 = compute_alignment(P_new, F, refine_parting=False, refine_sights=False)  # pure axis/sign recheck
    dims = P_new.max(0) - P_new.min(0)                       # bbox extents X,Y,Z
    off = float(np.abs(R2 - np.eye(3)).max())
    low_i = int(np.argmin(P_new[:, 2]))                     # the lowest vert = the grip toe
    return {
        "center_residual_mm": round(float(np.linalg.norm(cen2)), 4),
        "R_offdiag_max": round(off, 4),
        "dim_x": round(float(dims[0]), 2), "dim_y": round(float(dims[1]), 2), "dim_z": round(float(dims[2]), 2),
        "dims_ordered_yzx": bool(dims[1] >= dims[2] - 1e-6 and dims[2] >= dims[0] - 1e-6),
        "front_y": round(float(P_new[:, 1].min()), 2), "rear_y": round(float(P_new[:, 1].max()), 2),
        "top_z": round(float(P_new[:, 2].max()), 2), "bottom_z": round(float(P_new[:, 2].min()), 2),
        "grip_low_vert_y": round(float(P_new[low_i, 1]), 2),   # >0 => grip toe is at the rear (correct)
        "grip_is_down": bool(P_new[low_i, 1] > 0),             # lowest point at the rear = grip pointing down
        "slide_top_tilt_deg": round(_slide_top_tilt_deg(P_new), 2),
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

def align_object(obj_name=None, in_place=True, out_name=None, level_slide=True, pitch_offset_deg=0.0,
                 roll_offset_deg=0.0, yaw_offset_deg=0.0, mode="gun", refine_parting=True, refine_sights=True):
    """Align an already-imported gun/light mesh to world XYZ, mass-centered. THE skill entry point.

    mode="gun"  (default) -> muzzle -Y, grip -Z, slide/rail level (gun anatomy heuristics).
    mode="light"          -> rail clamp +Z & level, bezel -Y (weapon-light heuristics; near-symmetric body).
    in_place=True  -> transform the object's own mesh (lossless rigid transform), matrix_world=identity.
    in_place=False -> leave the source untouched, write an aligned copy `<name>_ALIGNED`.
    Gun-mode datums (owner directive 2026-07-10): PITCH auto-levels to the SLIDE / parting line
    (refine_parting) and YAW to FRONT+REAR SIGHT colinearity (refine_sights) — both self-zeroing + guarded.
    pitch_offset_deg / roll_offset_deg / yaw_offset_deg -> manual eye-tweaks (deg about X / bore / vertical)
    for the last sub-degree on a coarse scan.
    Stores the applied transform on the object (`cgs_align_center`, `cgs_align_R`) for reversibility/audit.
    Returns (object, summary). Non-geometry-mutating: vertex count + detail are identical, only moved.
    """
    _require_bpy()
    src = _resolve(obj_name)
    P, F = _world_arrays(src)
    if mode == "light":
        center, R, diag = compute_alignment_light(P, F)
    else:
        center, R, diag = compute_alignment(P, F, level_slide=level_slide, pitch_offset_deg=pitch_offset_deg,
                                             roll_offset_deg=roll_offset_deg, yaw_offset_deg=yaw_offset_deg,
                                             refine_parting=refine_parting, refine_sights=refine_sights)
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

    if mode == "light":                                    # light-specific evidence (gun verifier N/A)
        cen2 = float(np.linalg.norm(P_new.mean(0)))
        dims = P_new.max(0) - P_new.min(0)
        ver = {"center_residual_mm": round(cen2, 4),
               "dim_x": round(float(dims[0]), 2), "dim_y": round(float(dims[1]), 2),
               "dim_z": round(float(dims[2]), 2), "bezel_front_y": round(float(P_new[:, 1].min()), 2)}
        ok = cen2 < 0.05 and abs(diag["det_R"] - 1.0) < 1e-4
    else:
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
