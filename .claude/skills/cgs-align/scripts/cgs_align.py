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

def _bore_lattice_pitch(P, F, center, aL, aH, aW):
    """GROSS pitch bootstrap (added 2026-07-20 after the GLOCK 19 GEN5 failure): snap (aL,aH) onto the
    gun's MACHINED-FLAT LATTICE before any of the fine gun-anatomy tests run.

    THE FAILURE this exists for: PCA's principal axis is NOT the bore. On a real Glock STL the surface
    covariance is dragged toward the grip (a GEN5 grip's stipple texture alone contributes tens of
    thousands of faces), so the "length" eigenvector comes out ~33deg off the slide on BOTH the G17 and
    the G19. The G17 happened to recover (the flats leveler found the rail and converged); the G19 did
    NOT (leveler moved only -1.41deg), and EVERY downstream test then keyed off a 31deg-rotated frame:
    muzzle landed on the WRONG END, grip-down read false, and both datum refinements silently no-opped
    because their guards cap at 8deg / 3deg -- far below a 31deg gross miss. Shipped a 31deg-pitched,
    back-to-front gun that the built-in verifier called `aligned_ok: true`. (Owner caught it; the pose was
    rebuilt by hand off his two annotation markers, 2026-07-20.)

    THE MECHANISM: a gun is a machined object. Slide top, slide bottom / parting line, picatinny rail,
    dust-cover underside, breech face, muzzle face, ejection-port walls -- these flats are all either
    PARALLEL or PERPENDICULAR to the bore. So the face-normal directions, projected into the (length,
    height) plane, form a 4-FOLD (90deg-periodic) lattice locked to the bore. Recover its phase with the
    4th-harmonic circular mean

        phase = (1/4) * atan2( SUM w*sin(4*phi), SUM w*cos(4*phi) )

    over faces whose normal is not a sidewall (|n.aW| < 0.4), weighted by area * (in-plane magnitude)^2.
    Curved and textured surfaces (grip stipple, backstrap, trigger guard, barrel hood) spread uniformly
    in phi and CANCEL in the harmonic sum -- the very mass that corrupts PCA is what this ignores. On the
    real STLs the lattice reads 0.545 (G19) / 0.582 (G17) coherence over ~66k / ~33k faces: unambiguous.

    The phase is only known mod 90deg, which is exactly right: it fixes PITCH and leaves the length-vs-
    height LABEL to the extent test (re-run after the rotation, swapping if height now out-spans length)
    and the muzzle/grip SIGNS to the existing anatomy tests -- all of which are reliable ONCE the frame is
    lattice-true. GUARDED (needs real faces + a coherent lattice) and SELF-ZEROING (a frame already on the
    lattice -- the synthetic flat-top test gun, a re-aligned mesh -- reads ~0 and no-ops).

    ⚠ WHEN THE GUARD TRIPS, THE POSE IS NOT TRUSTWORTHY. Falling back to raw PCA is falling back to exactly
    the bug above -- so the coherence is REPORTED (`lattice_coherence`, `lattice_ok` in the diag) instead of
    failing quietly. Measured adversarially: at >=0.4mm of per-vertex jitter on a ~0.5mm-triangle mesh the
    face normals randomize, coherence collapses below the guard, and the gun comes out UPSIDE-DOWN (178deg).
    A `lattice_ok: false` result must be eyeballed in all three ortho views before it is used, never shipped
    on `aligned_ok` alone. (Robust everywhere else: idempotent, and stable down to 1% of the faces.)

    Returns (aL, aH, applied_deg, coherence)."""
    if F is None or len(F) == 0:
        return aL, aH, 0.0, 0.0
    a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    fn = np.cross(b - a, c - a); fa = np.linalg.norm(fn, axis=1); ok = fa > 1e-12
    if int(ok.sum()) < 500:
        return aL, aH, 0.0, 0.0                              # too few faces to trust a lattice
    nn = fn[ok] / fa[ok][:, None]; area = 0.5 * fa[ok]
    nl = nn @ aL; nh = nn @ aH; nw = nn @ aW
    keep = np.abs(nw) < 0.40                                 # drop the sidewalls: they carry no pitch
    if int(keep.sum()) < 300:
        return aL, aH, 0.0, 0.0
    nl = nl[keep]; nh = nh[keep]
    w = area[keep] * (nl * nl + nh * nh)                     # weight by area AND in-plane strength
    tot = float(w.sum())
    if tot < 1e-9:
        return aL, aH, 0.0, 0.0
    phi = np.arctan2(nh, nl)
    S = float(np.sum(w * np.sin(4.0 * phi))); C = float(np.sum(w * np.cos(4.0 * phi)))
    coh = math.hypot(S, C) / tot                             # 4-fold coherence: how machined is this thing
    if coh < 0.15:
        return aL, aH, 0.0, coh                              # guard: no coherent lattice (organic / noisy)
    ang = math.degrees(math.atan2(S, C)) / 4.0               # in (-45, 45]: the lattice phase off (aL,aH)
    th = math.radians(ang)
    aL2 = math.cos(th) * aL + math.sin(th) * aH
    aH2 = -math.sin(th) * aL + math.cos(th) * aH
    return aL2, aH2, ang, coh


def _refine_pitch_to_slide(P, F, center, aL, aH, aW):
    """Owner PITCH datum (2026-07-10 GLOCK 43; RE-HARDENED 2026-07-10b): level to the SLIDE — the straight
    UPPER/LOWER parting line. The prior build levelled to a PCA of the slide-SIDEWALL face-area blob, whose
    principal axis is skewed by the selection band: on the Glock 43 it converged to a FIXED POINT ~1deg
    rear-up of the true parting line (owner caught it against a horizontal ruler; the sidewall-PCA verifier
    SHARED the blind spot and rubber-stamped it — this skill's recurring 'never verify with a metric that
    can share the aligner's bug' failure, repeated). Re-level instead to the SLIDE-TOP SILHOUETTE EDGE —
    bore-parallel to the parting line and exactly what the eye tracks down the side view: take the top-of-
    surface envelope (97th-pct height per length-slice) across the slide span, robustly reject the sight
    spikes (iterative MAD trim), fit a line, and rotate (aL,aH) to lay that edge horizontal. Proven on the
    real Glock 43 mesh: read +0.99deg (matched the owner's eye + ruler), corrected to 0.00deg. Self-zeroing
    (no-op on a truly level slide — the SIG, the flat-top synthetic gun) and GUARDED (degrades to no change
    on a sparse fit or a wild angle). Returns corrected (aL, aH). (`F`,`aW` kept for signature parity.)"""
    D = P - center
    l = D @ aL; h = D @ aH
    lmin, lmax = float(np.percentile(l, 1)), float(np.percentile(l, 99)); Ll = lmax - lmin
    if Ll < 1e-6:
        return aL, aH
    lo = lmin + 0.12 * Ll; hi = lmin + 0.72 * Ll             # slide span: behind muzzle .. before the grip tang
    edges = np.linspace(lo, hi, 41); ls = []; hs = []
    for i in range(len(edges) - 1):
        m = (l >= edges[i]) & (l < edges[i + 1])
        if int(m.sum()) >= 5:
            ls.append(0.5 * (edges[i] + edges[i + 1])); hs.append(float(np.percentile(h[m], 97)))  # top edge
    if len(ls) < 12:
        return aL, aH                                        # too sparse to trust
    ls = np.asarray(ls); hs = np.asarray(hs)
    keep = np.ones(len(ls), bool)                            # robust line fit: MAD-reject the sight spikes
    for _ in range(3):
        A = np.polyfit(ls[keep], hs[keep], 1); res = hs - np.polyval(A, ls)
        med = float(np.median(res[keep])); mad = float(np.median(np.abs(res[keep] - med))) or 1e-6
        keep = np.abs(res - med) < 3.0 * mad
        if int(keep.sum()) < 8:
            keep = np.ones(len(ls), bool); break
    ang = math.degrees(math.atan(float(np.polyfit(ls[keep], hs[keep], 1)[0])))   # top-edge tilt off level
    if abs(ang) > 8.0:
        return aL, aH                                        # guard: ignore a wild fit
    th = math.radians(ang)
    aL2 = math.cos(th) * aL + math.sin(th) * aH              # new length axis = the level slide-top direction
    aH2 = -math.sin(th) * aL + math.cos(th) * aH
    return aL2, aH2

# THE SEAM NEEDS A DENSE MESH, AND THAT IS NOT FIXABLE BY TUNING. One fine setting, deliberately:
# 0.25mm z-bins, a 2.5mm slab, >=150 points per slice. I tried adapting these to mesh density so the datum
# would survive on René's decimated working meshes (~56k verts). It does not survive -- it gets INVENTED.
# Coarsening the bins let the sweep report a 1.53deg "seam" on the G17, which has no modelled parting line
# at all, and moved the G19's measured pitch by 0.2deg. On a coarse mesh the parting line is simply not
# identifiable by an unsupervised sweep, and a detector that answers anyway is worse than one that says
# NO_DATUM: pitch then falls back to the slide-top silhouette proxy, which is honest and ~0.1deg coarser.
_SEAM_MIN_PTS = 150

def _seam_line(l, h, w, ylo, yhi, zc, half_band, mode, dz=0.25, step=2.0, slab=2.5,
               min_strength=0.10, min_slices=8, smooth=3, min_pts=150, rms_floor=0.004):
    """Fit the UPPER/LOWER PARTING SEAM over a length window. Returns (slope, rms, n, span) or None.

    Shared kernel behind `_refine_pitch_to_parting_seam`; the standalone measurement tool
    `scripts/measure_parting.py` documents the derivation and the traps at length. Two geometry classes:
      GROOVE  the seam is a recess -> interior LOCAL MINIMUM of the per-slice half-width max|w|(h).
      STEP    the seam is a plain shoulder -> sharpest DOWNWARD STEP in max|w|(h).
    Encoded traps: -inf (never NaN) init for maximum.at; EDGE-replicated smoothing (zero-padding dips the
    ends and sends argmin to an edge in every slice); reject edge hits; MAD-trim the fit.
    """
    zlo, zhi = zc - half_band, zc + half_band
    nb = int(round((zhi - zlo) / dz))
    if nb < 8:
        return None
    kern = np.ones(smooth) / float(smooth); pad = smooth // 2
    rows = []
    for y0 in np.arange(ylo, yhi, step):
        m = (l >= y0) & (l < y0 + slab) & (h > zlo) & (h < zhi)
        if int(m.sum()) < min_pts:
            continue
        idx = np.clip(((h[m] - zlo) / dz).astype(int), 0, nb - 1)
        prof = np.full(nb, -np.inf)
        np.maximum.at(prof, idx, np.abs(w[m]))
        ok = np.isfinite(prof)
        if ok.mean() < 0.6:
            continue
        zs = zlo + (np.arange(nb) + 0.5) * dz
        v = np.interp(zs, zs[ok], prof[ok])
        v = np.convolve(np.pad(v, pad, mode="edge"), kern, mode="valid")[:nb]
        if mode == "groove":
            i = int(np.argmin(v))
            if i < 2 or i > nb - 3:
                continue
            strength = min(v[:i].max(), v[i + 1:].max()) - v[i]
            if strength < min_strength:
                continue
            d0, d1, d2 = v[i - 1], v[i], v[i + 1]; den = d0 - 2 * d1 + d2
            zhit = zs[i] + (0.5 * (d0 - d2) / den if abs(den) > 1e-12 else 0.0) * dz
        else:
            g = np.diff(v); i = int(np.argmin(g))
            if i < 2 or i > nb - 4:
                continue
            strength = v[max(0, i - 4):i + 1].max() - v[i + 1:i + 6].min()
            if strength < 2.0 * min_strength:
                continue
            d0, d1, d2 = g[i - 1], g[i], g[i + 1]; den = d0 - 2 * d1 + d2
            zhit = zs[i] + (0.5 + (0.5 * (d0 - d2) / den if abs(den) > 1e-12 else 0.0)) * dz
        rows.append((y0 + slab / 2.0, zhit))
    if len(rows) < min_slices:
        return None
    R = np.asarray(rows)
    p = np.polyfit(R[:, 0], R[:, 1], 1); res = R[:, 1] - np.polyval(p, R[:, 0])
    med = float(np.median(res)); mad = float(np.median(np.abs(res - med))) + 1e-12
    keep = np.abs(res - med) < 3 * 1.4826 * mad
    if int(keep.sum()) < min_slices:
        keep = np.ones(len(R), bool)
    p = np.polyfit(R[keep, 0], R[keep, 1], 1); res = R[keep, 1] - np.polyval(p, R[keep, 0])
    rms = float(np.sqrt((res ** 2).mean()))
    # ANTI-QUANTIZATION GUARD. Callers rank candidates by fit rms, which a DEGENERATE fit wins outright:
    # if every slice's argmin lands in the same z-bin the "line" is perfectly flat and the rms comes out at
    # ~1e-14mm. That is not a good measurement, it is no measurement -- and on a decimated mesh the coarse
    # binning that causes it is exactly what a density-adaptive sweep reaches for. Real geometry always
    # carries per-slice noise (the Glock 34 scan's genuine seam fits at 0.049mm), so an rms far below mesh
    # precision, or a set of fitted heights with almost no distinct values, is an artifact. Reject both.
    if rms < rms_floor or len(np.unique(np.round(R[keep, 1], 4))) < 5:
        return None
    return (float(p[0]), rms, int(keep.sum()),
            float(R[keep, 0].max() - R[keep, 0].min()))

def _refine_pitch_to_parting_seam(P, F, center, aL, aH, aW):
    """Owner PITCH datum, FINAL (2026-08-05): level to the UPPER/LOWER PARTING SEAM ITSELF, measured, rather
    than to the slide-top SILHOUETTE EDGE that `_refine_pitch_to_slide` uses as a proxy for it.

    The proxy is close but not the datum: the slide top is not exactly parallel to the parting line on every
    gun. Measured disagreement — Springfield Echelon 4.5 **0.17deg**, Glock 34 **0.10deg**. Both had to be
    hand-corrected after the aligner declared itself done, which is precisely the residual the owner keeps
    catching. Runs AFTER the silhouette refine and overrides it whenever a real seam is found.

    The seam is found, not assumed: sweep candidate heights across the upper part of the height extent,
    fit both geometry classes at each, and keep the best by fit rms with a span floor. Two properties make
    that sweep honest rather than a fishing expedition:
      * the seam sits HIGH in the height extent (0.81 on the Glock 34) because the grip drags the extent
        down -- a lower-half sweep never visits it;
      * a tight rms over a SHORT span is a small local feature, not a parting line, so span is gated first
        and rms only ranks what survives.
    Fit over the SLIDE SPAN ONLY. Behind the slide the same detector locks onto the frame/beavertail
    shoulder, a different feature several mm lower, and a full-length fit reads -1.51deg where the truth is
    -0.010deg (Sphinx SDP). A MAD trim does NOT save you there: the contaminants are a coherent second
    population, not outliers.

    Self-zeroing + GUARDED — needs >=10 slices over >=35% of the slide span at rms <= 0.25mm and a
    correction under 3deg, so it no-ops on a flat-top synthetic gun and on a repaired CAD solid with no
    modelled seam (René's own G17 has none; the G19 does). Returns corrected (aL, aH)."""
    D = P - center
    l = D @ aL; h = D @ aH
    aWc = np.cross(aH, aL); aWc /= (np.linalg.norm(aWc) or 1.0)
    w = D @ aWc
    lmin, lmax = float(np.percentile(l, 1)), float(np.percentile(l, 99)); Ll = lmax - lmin
    hmin, hmax = float(np.percentile(h, 0.5)), float(np.percentile(h, 99.5)); Hh = hmax - hmin
    if Ll < 1e-6 or Hh < 1e-6:
        return aL, aH
    ylo, yhi = lmin + 0.12 * Ll, lmin + 0.72 * Ll               # slide span (same window as the proxy)
    span_min = 0.35 * (yhi - ylo)
    half_band = max(2.0, 0.025 * Hh)
    best = None
    for f in np.linspace(0.55, 0.95, 17):                       # the seam sits HIGH in the height extent
        zc = hmin + f * Hh
        for mode in ("groove", "step"):
            r = _seam_line(l, h, w, ylo, yhi, zc, half_band, mode, min_pts=_SEAM_MIN_PTS)
            if r is None:
                continue
            slope, rms, n, span = r
            if n < 10 or span < span_min or rms > 0.25:
                continue
            if best is None or rms < best[1]:
                best = r
    if best is None:
        return aL, aH                                            # no measurable seam -> keep the proxy
    ang = math.degrees(math.atan(best[0]))
    if abs(ang) > 3.0:
        return aL, aH                                            # guard: the proxy already got us close
    th = math.radians(ang)
    aL2 = math.cos(th) * aL + math.sin(th) * aH
    aH2 = -math.sin(th) * aL + math.cos(th) * aH
    return aL2, aH2

def _refine_roll_to_slide_top(P, F, center, aL, aH, aW):
    """Owner ROLL datum (added 2026-07-10b, GLOCK 43): in the FRONT view (down the bore) the SLIDE-TOP FLAT
    must be horizontal — no cant about the bore. The auto pose left the Glock 43 rolled ~0.8deg (owner caught
    it in Front-Ortho and hand-fixed it with a +0.8deg bore rotation); the pitch/yaw refines don't touch
    roll, and a decimated scan's principal WIDTH axis alone isn't better than ~0.5-1deg. Re-level roll to the
    slide-top UP-FACES: take their AREA-weighted consensus normal and rotate (aH about the bore aL) so that
    normal points straight up (+aH) — i.e. zero its width-component. Self-zeroing (no-op when the top is
    already flat) and GUARDED (min faces, cap 8deg). Only aH is returned rotated; x_hat re-derives from
    cross(aL,aH) downstream. Returns corrected (aL, aH)."""
    if F is None or len(F) == 0:
        return aL, aH
    a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    fn = np.cross(b - a, c - a); fa = np.linalg.norm(fn, axis=1); ok = fa > 1e-12
    if int(ok.sum()) < 50:
        return aL, aH
    nn = fn[ok] / fa[ok][:, None]; cen = ((a + b + c) / 3.0)[ok] - center
    ch = cen @ aH; nH = nn @ aH
    top = (nH > math.cos(math.radians(20))) & (ch > np.percentile(ch, 80))    # slide-top up-flats (excl. sides)
    if int(top.sum()) < 60:
        return aL, aH
    area = 0.5 * fa[ok][top]
    cons = (nn[top] * area[:, None]).sum(0); cons = cons / (np.linalg.norm(cons) or 1.0)
    roll = math.atan2(float(cons @ aW), float(cons @ aH))    # top-normal cant about the bore, off +aH
    if abs(math.degrees(roll)) > 8.0:
        return aL, aH                                        # guard: ignore a wild fit
    aH2 = math.cos(roll) * aH + math.sin(roll) * aW          # rotate 'up' onto the slide-top normal -> level
    aH2 = aH2 / (np.linalg.norm(aH2) or 1.0)
    return aL, aH2

def _refine_roll_to_rear_sight(P, F, center, aL, aH, aW):
    """Owner ROLL datum, FINAL (2026-08-05, GLOCK 34): the two REAR-SIGHT SHOULDERS — the flat tops either
    side of the notch — must sit at the SAME height in the FRONT / down-the-bore view. This is what the eye
    actually reads when it looks at the gun; the slide-top flat is only a proxy for it, and on the Glock 34
    the two disagreed by 0.33deg (slide top -0.074deg, shoulders +0.258deg). Owner directive: *"why did you
    not align this!!?? This is a MUST as well with all alignments of guns"*, pointing at both shoulders.

    Runs AFTER `_refine_roll_to_slide_top` and OVERRIDES it when a real rear sight is found — sight first,
    slide top as the fallback. Method: isolate the up-facing faces on the rear-sight top (a narrow height
    band under the sight's own top), split them by width sign into the left and right shoulder, and rotate
    aH about the bore (aL) until their AREA-WEIGHTED MEAN heights match.

    Why the mean of two patches and not a plane fit or a consensus normal: each shoulder is a small
    (~43mm^2), scan-rough patch — its own normal reads +-0.5deg of noise (the Glock 34's individual
    shoulders fitted -0.14deg and +0.97deg against a true +0.26deg). But the MEAN height of 2,000+ faces is
    determined to ~0.001mm, so the LEVER ARM between the two shoulder centroids (~9.5mm) resolves the roll
    to ~0.01deg. Same lesson as the TLR-7 seat, inverted: there the lever arm between two patches was the
    trap, here it is the instrument — because these two patches are at the same length and nominal height
    and differ ONLY in width, which is exactly the axis being measured.

    GUARDED + self-zeroing: needs two real shoulders of comparable area straddling the notch, roughly
    symmetric about the centreline, and a correction under 3deg — so it no-ops on an optic-cut slide, a
    flat-top synthetic gun, a single-blade sight, or a light. Returns corrected (aL, aH)."""
    if F is None or len(F) == 0:
        return aL, aH
    a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    fn = np.cross(b - a, c - a); fa = np.linalg.norm(fn, axis=1); ok = fa > 1e-12
    if int(ok.sum()) < 50:
        return aL, aH
    nn = fn[ok] / fa[ok][:, None]; area = 0.5 * fa[ok]
    cen = ((a + b + c) / 3.0)[ok] - center
    l = cen @ aL; h = cen @ aH; w = cen @ aW
    nH = nn @ aH
    lmin, lmax = float(np.percentile(l, 1)), float(np.percentile(l, 99)); L = lmax - lmin
    if L < 1e-6:
        return aL, aH
    rear = (l > lmin + 0.60 * L) & (l < lmax)              # rear slide only (front sight excluded)
    if int(rear.sum()) < 100:
        return aL, aH
    htop = float(h[rear].max())
    top = rear & (nH > math.cos(math.radians(25))) & (h > htop - 1.2)   # the sight's own top flats
    wt, ht, at = w[top], h[top], area[top]
    # GATE ON AREA, NOT FACE COUNT. René's CAD solids carry the same shoulder in ~30 large triangles where
    # a scan carries it in ~2,200 tiny ones; a face-count floor tuned to the scan silently no-ops on every
    # solid (G17 66 faces, G19 102 -> both rejected by a 200-face minimum, 2026-08-05). Area is the
    # mesh-density-invariant quantity, so gate on that and keep only a tiny count floor for fit sanity.
    if int(top.sum()) < 16 or float(at.sum()) < 8.0:
        return aL, aH
    # Split into the two shoulders about the NOTCH CENTRE, not about w=0 — a laterally drifted rear sight
    # (real windage, see the 2026-07-27 Echelon note) would otherwise sample the two shoulders unevenly and
    # leak yaw/windage into the roll estimate. One refinement pass is enough.
    split = 0.0
    for _ in range(2):
        left, right = wt < split, wt > split
        if int(left.sum()) < 6 or int(right.sum()) < 6:
            return aL, aH                                   # need a real notch with a shoulder either side
        alA, arA = float(at[left].sum()), float(at[right].sum())
        if min(alA, arA) < 3.0 or min(alA, arA) / max(alA, arA) < 0.5:
            return aL, aH                                   # lopsided -> not two shoulders of one sight
        wl = float((wt[left] * at[left]).sum() / alA); wr = float((wt[right] * at[right]).sum() / arA)
        split = 0.5 * (wl + wr)
    hl = float((ht[left] * at[left]).sum() / alA); hr = float((ht[right] * at[right]).sum() / arA)
    if (wr - wl) < 2.0 or min(abs(wl - split), abs(wr - split)) / max(abs(wl - split), abs(wr - split)) < 0.6:
        return aL, aH                                       # too narrow / not symmetric about the notch
    theta = math.atan2(hr - hl, wr - wl)                    # shoulder-plane cant about the bore
    # CROSS-CHECK with an area-weighted plane fit h = alpha*w + beta over ALL the top faces. It uses every
    # face and needs no split, but unlike the two-patch lever arm it is sensitive to asymmetric extent and
    # to doming. The two are independent enough that agreement is real evidence — on the Glock 34 they read
    # +0.258 and +0.266. Disagreement means the "shoulders" aren't one flat plane: bail rather than guess.
    Wm = float((wt * at).sum() / at.sum()); Hm = float((ht * at).sum() / at.sum())
    var = float((at * (wt - Wm) ** 2).sum())
    if var < 1e-9:
        return aL, aH
    theta_fit = math.atan(float((at * (wt - Wm) * (ht - Hm)).sum()) / var)
    if abs(math.degrees(theta - theta_fit)) > 0.15:
        return aL, aH                                       # guard: the two estimators disagree
    theta = 0.5 * (theta + theta_fit)
    if abs(math.degrees(theta)) > 3.0:
        return aL, aH                                       # guard: cap at 3deg
    aH2 = math.cos(theta) * aH - math.sin(theta) * aW       # tilt 'up' onto the shoulder-plane normal
    aH2 = aH2 / (np.linalg.norm(aH2) or 1.0)
    return aL, aH2

def _refine_yaw_to_sights(P, F, center, aL, aH):
    """Owner YAW datum (2026-07-10, GLOCK 43): make the FRONT SIGHT and REAR SIGHT colinear along the bore
    — front post centred in the rear notch, viewed from behind. The slide SILHOUETTE is not sensitive
    enough: a 0.9mm sight offset over a ~130mm baseline is 0.4deg of yaw that reads "square" (0.04deg) in
    the outline and is obvious down the sights. Rotates aL about the vertical (aH) to zero the difference.
    Returns corrected aL (x_hat re-derives from cross(aL,aH) downstream, so only aL needs rotating).

    HOW THE REFERENCE IS TAKEN — three generations, each killed by a measurement:
      v1  each blade's width-CENTROID. Wrong at the rear: that band holds both ~17mm shoulders, so their
          centroid is the SIGHT BODY centre, not the notch. Called the Glock 34 square at -0.07deg while
          the post sat 0.361mm (0.109deg) off in the notch.                              (owner-caught)
      v2  NOTCH GAP centre from the largest empty run in the sorted vertex widths, vs the post's vertex
          silhouette. Correct on a 2.2M-tri scan, GARBAGE on a CAD solid: on René's own canonical G17 it
          read -1.83deg of yaw, which at a 165mm sight radius is 5.3mm — physically impossible. A thin
          z-band of a 114k-tri mesh holds too few vertices for "largest gap" to find the aperture.
      v3  (current) the two facing WALL PLANES: area-weighted mean width of the NOTCH inner walls, against
          the same for the FRONT POST flanks. Area-weighting makes it MESH-DENSITY-INVARIANT, which is
          exactly what v2 was not. Calibrated against ground truth — René's canonical STLs, which are by
          definition correctly yawed, must read zero:
              G17 native  v2 -1.831deg   v3 -0.020deg
              G19 native  v2 +0.007deg   v3 +0.007deg
              G34 scan    v2 -0.000deg   v3 -0.015deg
          v3 is the only one right on all three, across a 20x range of mesh density.
    GUARDED: both walls of both features need real area, notch and post widths must be plausible
    (1.5-8mm), and the correction is capped at 3deg — so it no-ops on a flat-top slide (the synthetic test
    gun), an optic-cut slide, or a bare light."""
    if F is None or len(F) == 0:
        return aL
    a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    fn = np.cross(b - a, c - a); fa = np.linalg.norm(fn, axis=1); ok = fa > 1e-12
    if int(ok.sum()) < 50:
        return aL
    nn = fn[ok] / fa[ok][:, None]; ar = 0.5 * fa[ok]
    aWc = np.cross(aH, aL); aWc /= (np.linalg.norm(aWc) or 1.0)
    cen = ((a + b + c) / 3.0)[ok] - center
    l = cen @ aL; h = cen @ aH; w = cen @ aWc
    nH = nn @ aH; nW = nn @ aWc
    lmin, lmax = float(np.percentile(l, 1)), float(np.percentile(l, 99)); L = lmax - lmin
    if L < 1e-6:
        return aL
    # slide-top plane: the area-dominant up-facing flat
    up = (nH > 0.97) & (h > float(np.percentile(h, 55)))
    if int(up.sum()) < 20:
        return aL
    hist, edges = np.histogram(h[up], bins=200, weights=ar[up])
    ZT = float(edges[int(hist.argmax())])
    # the two blades, as area bands protruding above that plane
    prot = (h > ZT + 1.5) & (nH > 0.0)
    if int(prot.sum()) < 20:
        return aL
    hy, ey = np.histogram(l[prot], bins=120, weights=ar[prot])
    mid = 0.5 * (lmin + lmax)
    fb = [ey[i] for i in range(120) if hy[i] > 0.5 and ey[i] < mid]
    rb = [ey[i] for i in range(120) if hy[i] > 0.5 and ey[i] > mid]
    if not fb or not rb:
        return aL
    fy0, fy1 = fb[0] - 2.0, fb[-1] + 2.0
    ry0, ry1 = rb[0] - 2.0, rb[-1] + 2.0
    rad = abs(0.5 * (ry0 + ry1) - 0.5 * (fy0 + fy1))
    if rad < 0.3 * L:                                        # need a real sight baseline
        return aL
    side = np.abs(nW) > 0.85                                 # faces whose normal points across the bore
    def walls(y0, y1, inner):
        # GATE ON PLANARITY, NOT ON RAW AREA. A machined flank is a PLANE, so its area-weighted mean width
        # is unbiased at ANY coverage -- partial coverage of a plane still gives the plane's position. What
        # WOULD bias it is sampling a CURVED surface, and that shows up as spread. So require small spread
        # and let the area floor be low: René's canonical G17 carries the front post's right flank in just
        # 0.605mm2, and a 1.0mm2 floor silently voided the entire yaw datum on that gun.
        m = side & (l > y0) & (l < y1) & (h > ZT + 1.5)
        if inner:
            m = m & (np.abs(w) < 6.0)                        # notch walls only, not the shoulders' flanks
        Lm, Rm = m & (w < 0), m & (w > 0)
        al_, ar_ = float(ar[Lm].sum()), float(ar[Rm].sum())
        if al_ < 0.25 or ar_ < 0.25 or int(Lm.sum()) < 3 or int(Rm.sum()) < 3:
            return None
        xl = float((w[Lm] * ar[Lm]).sum() / al_); xr = float((w[Rm] * ar[Rm]).sum() / ar_)
        sl = math.sqrt(max(0.0, float((ar[Lm] * (w[Lm] - xl) ** 2).sum() / al_)))
        sr = math.sqrt(max(0.0, float((ar[Rm] * (w[Rm] - xr) ** 2).sum() / ar_)))
        if sl > 0.35 or sr > 0.35:                           # not flat walls -> not a machined flank
            return None
        return 0.5 * (xl + xr), xr - xl
    nw = walls(ry0, ry1, True); pw = walls(fy0, fy1, False)
    if nw is None or pw is None:
        return aL
    if not (1.5 < nw[1] < 8.0) or not (1.5 < pw[1] < 8.0):   # implausible aperture / blade -> not sights
        return aL
    phi = math.atan2(pw[0] - nw[0], rad)                     # yaw that centres the post in the notch
    if abs(math.degrees(phi)) > 3.0:
        return aL                                            # guard: cap at 3deg
    aL2 = math.cos(phi) * aL - math.sin(phi) * aWc
    return aL2 / (np.linalg.norm(aL2) or 1.0)

def compute_alignment(P, F, level_slide=True, pitch_offset_deg=0.0, roll_offset_deg=0.0,
                      yaw_offset_deg=0.0, refine_parting=True, refine_sights=True, refine_roll=True,
                      refine_sight_roll=True, refine_seam=True):
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

    # BORE-LATTICE BOOTSTRAP (2026-07-20, GLOCK 19 GEN5). PCA's principal axis is NOT the bore: on a real
    # Glock STL the surface covariance is pulled toward the grip (a GEN5 grip's stipple texture alone is
    # tens of thousands of faces), so "length" comes out ~33deg off the slide on BOTH the G17 and the G19.
    # Every test below -- muzzle-left, grip-down, flats-leveling -- assumes a roughly bore-true frame, and
    # every DATUM REFINEMENT is guarded at 8deg/3deg, so a gross miss is out of their reach and propagates
    # silently (the G19 shipped 31deg pitched AND back-to-front, self-verified "aligned_ok"). Snap the
    # frame onto the machined-flat 4-fold lattice FIRST, then let the anatomy tests do what they're good
    # at. Self-zeroing (a lattice-true frame reads ~0) and guarded (needs a coherent lattice).
    lattice_pitch_deg = 0.0; lattice_coh = 0.0
    if F is not None and len(F):
        aL, aH, lattice_pitch_deg, lattice_coh = _bore_lattice_pitch(P, F, center, aL, aH, aW)
        if lattice_pitch_deg:
            # the lattice fixes PITCH but not the length-vs-height LABEL -- re-measure and swap if the
            # rotation handed the longer span to 'height' (happens when the PCA miss approaches 45deg).
            eL, eH = _robust_extent(D @ aL), _robust_extent(D @ aH)
            if eH > eL:
                aL, aH = aH, -aL                             # keep the pair right-handed against aW
                eL, eH = eH, eL
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
    # REFINE PITCH again, to the MEASURED PARTING SEAM (owner datum, final — 2026-08-05). The silhouette
    # edge above is a proxy and disagrees with the real seam by 0.10deg (G34) / 0.17deg (Echelon); both
    # needed a hand pitch step afterwards. Overrides the proxy when a seam is actually found; self-zeroing.
    seam_refine_deg = 0.0
    if level_slide and refine_seam and F is not None and len(F):
        aL0 = aL.copy(); aL, aH = _refine_pitch_to_parting_seam(P, F, center, aL, aH, aW)
        seam_refine_deg = math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(aL0, aL))))))
        l = D @ aL; h = D @ aH
    # REFINE ROLL to the SLIDE-TOP FLAT (owner datum 2026-07-10b): the slide top must be horizontal in the
    # FRONT view — no cant about the bore. The pitch/yaw refines don't touch roll; a decimated scan's WIDTH
    # axis alone left the Glock 43 ~0.8deg rolled (owner caught it in Front-Ortho). Self-zeroing + guarded.
    roll_refine_deg = 0.0
    if level_slide and refine_roll and F is not None and len(F):
        aH0 = aH.copy(); aL, aH = _refine_roll_to_slide_top(P, F, center, aL, aH, aW)
        roll_refine_deg = math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(aH0, aH))))))
        l = D @ aL; h = D @ aH
    # REFINE ROLL again, to the REAR-SIGHT SHOULDERS (owner datum 2026-08-05, GLOCK 34) — the FINAL roll
    # reference. The slide-top flat above is only a proxy for it and read 0.33deg off on the Glock 34.
    # Overrides the slide-top result whenever a real two-shouldered rear sight is present; self-zeroing.
    sight_roll_deg = 0.0
    if level_slide and refine_sight_roll and F is not None and len(F):
        aH1 = aH.copy()
        aWc = np.cross(aL, aH); aWc /= (np.linalg.norm(aWc) or 1.0)
        aL, aH = _refine_roll_to_rear_sight(P, F, center, aL, aH, aWc)
        sight_roll_deg = math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(aH1, aH))))))
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
        "lattice_pitch_deg": round(float(lattice_pitch_deg), 2),  # gross PCA->bore snap (G19 needed ~33)
        "lattice_coherence": round(float(lattice_coh), 3),        # 4-fold strength; real guns read 0.54-0.58
        # FALSE => the bootstrap could not lock the bore and the pose fell back to RAW PCA, which is the
        # 2026-07-20 bug (G19: 31deg pitched, back-to-front, 'aligned_ok' anyway). EYEBALL ALL THREE ORTHO
        # VIEWS before using such a pose -- do not trust aligned_ok on its own.
        "lattice_ok": bool(lattice_coh >= 0.15),
        "slide_leveled_deg": round(float(slide_tilt_deg), 2),   # pitch correction applied to reach level
        "parting_refine_deg": round(float(parting_refine_deg), 2),   # extra pitch to the slide/parting line
        "seam_refine_deg": round(float(seam_refine_deg), 3),    # pitch applied to level the MEASURED parting seam
        "roll_refine_deg": round(float(roll_refine_deg), 2),         # roll applied to level the slide-top flat
        "sight_roll_deg": round(float(sight_roll_deg), 3),      # roll applied to level the REAR-SIGHT SHOULDERS
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

def _refine_light_seat(P, F, center, x_hat, y_hat, z_hat):
    """Owner LIGHT datum (2026-08-04, STREAMLIGHT TLR-7 HL-X): level to the RAIL SEAT — the machined floor
    of the rail channel, the surface that actually contacts the gun's rail. This is the light's analogue of
    the gun's parting line, and the owner's stated rule ("reference the mount for level; it's always the
    datum, like a gun's rail").

    The step-2 clamp leveler takes an AREA-WEIGHTED CONSENSUS over every up-facing face within a 20deg cone
    above the centre. That is a BLEND, not a datum: on the TLR-7 it averages the seat together with the two
    clamp-jaw tops, the bezel deck and the rear housing deck (which sits 1.3deg off the seat), and it left
    the rail seat **4.33deg nose-down** while every internal check passed and `aligned_ok` only tripped on an
    unrelated verifier bug. A consensus over several non-parallel decks cannot recover any one of them.

    Fix: isolate the seat by the MODE of the up-facing normals inside the channel width band, not their mean
    — a tilted plane keeps ONE normal however tilted it is, whereas a blend of decks has none. Take every
    up-facing face within ~2deg of that mode (this keeps the seat's parallel sub-planes together: the TLR-7's
    242mm2 pocket floor and the 42mm2 forward pad, 2.4mm apart and parallel to 0.07deg), plane-fit them
    area-weighted with a MAD trim, and rotate the frame so that plane's normal is exactly +Z. Yaw is
    preserved (new_x is built from the existing y_hat), so this moves pitch + roll only.

    Self-zeroing (no-op on an already-level seat, e.g. the synthetic WML whose mount face IS the consensus)
    and GUARDED (needs a real channel-band population, a clean fit, and a correction under 8deg; otherwise
    returns the frame untouched). Proven on the real TLR-7 mesh: seat read 4.33deg pitch / 0.09deg roll ->
    corrected to -0.09deg / 0.04deg, corroborated by an INDEPENDENT datum the refine never sees (the bezel
    reflector's cylinder axis, 4.57deg -> 0.17deg). Returns (x_hat, y_hat, z_hat, applied_deg)."""
    D = np.asarray(P, dtype=np.float64) - center
    q = np.c_[D @ x_hat, D @ y_hat, D @ z_hat]                  # current-frame coordinates
    if F is None or len(F) == 0:
        return x_hat, y_hat, z_hat, 0.0
    a3, b3, c3 = q[F[:, 0]], q[F[:, 1]], q[F[:, 2]]
    fn = np.cross(b3 - a3, c3 - a3); fa = np.linalg.norm(fn, axis=1); ok = fa > 1e-12
    if int(ok.sum()) < 200:
        return x_hat, y_hat, z_hat, 0.0
    nn = fn[ok] / fa[ok][:, None]; area = 0.5 * fa[ok]; cen = ((a3 + b3 + c3) / 3.0)[ok]
    W = _robust_extent(q[:, 0]); H = _robust_extent(q[:, 2])
    if W < 1e-6 or H < 1e-6:
        return x_hat, y_hat, z_hat, 0.0
    # Restrict to the RAIL CHANNEL by what physically defines it — floor with a JAW STANDING ABOVE IT ON
    # BOTH SIDES — not by a width fraction. Necessary, and the whole ballgame: the TLR-7's rear housing deck
    # is 1.34deg off the seat but only 0.12mm away from its plane, so it is neither cone-separable nor
    # offset-separable; it is separable only by the fact that it lies BEHIND the jaws. Slices with no jaws
    # (bezel deck, rear deck) drop out here. A light with no standing jaws leaves nothing -> clean no-op.
    L = _robust_extent(q[:, 1])
    dy = max(1.0, 0.02 * L); lip = 0.025 * H
    ylo, yhi = float(np.percentile(q[:, 1], 1)), float(np.percentile(q[:, 1], 99))
    yb = np.arange(ylo, yhi + dy, dy)
    idx = np.clip(((q[:, 1] - ylo) / dy).astype(int), 0, len(yb) - 1)
    mid = np.abs(q[:, 0]) < 0.22 * W
    lft = (q[:, 0] < -0.26 * W) & (q[:, 0] > -0.50 * W)
    rgt = (q[:, 0] > 0.26 * W) & (q[:, 0] < 0.50 * W)
    per_bin = len(q) * dy / max(L, 1e-6)                        # density-relative counts, not absolutes: a
    n_mid = max(6, int(0.02 * per_bin)); n_side = max(4, int(0.008 * per_bin))   # coarse mesh must still gate
    chan = np.zeros(len(yb), bool)
    for b in range(len(yb)):
        s_b = idx == b
        m_b = s_b & mid; l_b = s_b & lft; r_b = s_b & rgt
        if int(m_b.sum()) < n_mid or int(l_b.sum()) < n_side or int(r_b.sum()) < n_side:
            continue
        floor = float(np.percentile(q[m_b, 2], 90))
        chan[b] = (float(q[l_b, 2].max()) > floor + lip) and (float(q[r_b, 2].max()) > floor + lip)
    if int(chan.sum()) * dy < 0.15 * L:
        return x_hat, y_hat, z_hat, 0.0                         # no jawed channel found -> keep the consensus
    fidx = np.clip(((cen[:, 1] - ylo) / dy).astype(int), 0, len(yb) - 1)
    band = (nn[:, 2] > 0.85) & (np.abs(cen[:, 0]) < 0.30 * W) & (cen[:, 2] > 0.10 * H) & chan[fidx]
    if int(band.sum()) < 200:
        return x_hat, y_hat, z_hat, 0.0
    # Pick the direction that carries the MOST FACE AREA within a ~2deg cone — a raw histogram peak would
    # not do: a scan surface's normals scatter, so a small very-flat deck (the TLR-7's rear housing, fit rms
    # 0.016mm) concentrates into one bin and outbids the 5x-larger but rougher rail seat (rms 0.070mm). That
    # miss is not academic: the raw-peak build under-corrected by exactly the rear deck's 1.3deg offset.
    # Smoothing the area histogram with a box window of the cone radius restores "largest plane wins".
    step, lim, rad = 0.005, 0.45, 7                             # 0.005 bins, +/-7 bins ~ 2deg cone
    bins = np.arange(-lim, lim + 0.5 * step, step)
    Hn, ex, ey = np.histogram2d(nn[band, 0], nn[band, 1], bins=[bins, bins], weights=area[band])
    C = np.zeros((Hn.shape[0] + 1, Hn.shape[1] + 1)); C[1:, 1:] = Hn.cumsum(0).cumsum(1)   # integral image
    nb = Hn.shape[0]
    i0 = np.clip(np.arange(nb) - rad, 0, nb); i1 = np.clip(np.arange(nb) + rad + 1, 0, nb)
    S = (C[np.ix_(i1, i1)] - C[np.ix_(i0, i1)] - C[np.ix_(i1, i0)] + C[np.ix_(i0, i0)])    # box-summed area
    i, j = np.unravel_index(int(np.argmax(S)), S.shape)
    nx0, ny0 = 0.5 * (ex[i] + ex[i + 1]), 0.5 * (ey[j] + ey[j + 1])
    sel = band & (np.abs(nn[:, 0] - nx0) < rad * step) & (np.abs(nn[:, 1] - ny0) < rad * step)
    if int(sel.sum()) < 150:
        return x_hat, y_hat, z_hat, 0.0
    # Collapse the cone to ONE coplanar SHEET before fitting. A cone alone is not enough: the TLR-7's rear
    # housing deck sits only 1.34deg off the seat, so it lands inside any usable cone — and a single plane
    # fit through two patches at different y AND different z is driven by the LEVER ARM between them, not by
    # either patch's own slope (that mix read 3.13deg where the seat is 4.31deg). So iterate: fit, histogram
    # the area-weighted residuals, keep only the dominant peak (one physical sheet), refit. Parallel
    # sub-planes of the same datum (the TLR-7's pocket floor and forward pad, 2.4mm apart) separate here too
    # — harmless, the larger one carries the datum and the fit is then free of any offset contamination.
    X = cen[sel]; Wt = area[sel]
    A = np.c_[X[:, 0], X[:, 1], np.ones(len(X))]
    keep = np.ones(len(X), bool)
    for it in range(4):
        co, *_ = np.linalg.lstsq(A[keep] * np.sqrt(Wt[keep])[:, None], X[keep, 2] * np.sqrt(Wt[keep]), rcond=None)
        r = X[:, 2] - A @ co
        if it < 3:                                              # sheet isolation: dominant residual peak
            lo, hi = float(np.percentile(r, 1)), float(np.percentile(r, 99))
            if hi - lo < 1e-6:
                break
            nb2 = max(20, min(400, int((hi - lo) / 0.05)))
            hr, er = np.histogram(r, bins=nb2, range=(lo, hi), weights=Wt)
            p = int(np.argmax(hr)); c0 = 0.5 * (er[p] + er[p + 1])
            keep2 = np.abs(r - c0) < max(0.35, 3.0 * (hi - lo) / nb2)
            if int(keep2.sum()) < 150:
                break
            keep = keep2
        else:                                                   # final MAD polish on the isolated sheet
            med = float(np.median(r[keep])); mad = float(np.median(np.abs(r[keep] - med))) or 1e-6
            k2 = keep & (np.abs(r - med) < 3.0 * 1.4826 * mad)
            if int(k2.sum()) >= 150:
                keep = k2
    k = keep
    if int(k.sum()) < 150 or float(Wt[k].sum()) < 0.10 * float(area[band].sum()):
        return x_hat, y_hat, z_hat, 0.0                         # guard: no dominant seat sheet in the channel
    co, *_ = np.linalg.lstsq(A[k] * np.sqrt(Wt[k])[:, None], X[k, 2] * np.sqrt(Wt[k]), rcond=None)
    rms = float(np.sqrt(np.mean((X[k, 2] - A[k] @ co) ** 2)))
    if rms > 0.02 * H:
        return x_hat, y_hat, z_hat, 0.0                         # guard: not a real machined flat
    n_loc = np.array([-co[0], -co[1], 1.0]); n_loc /= (np.linalg.norm(n_loc) or 1.0)
    new_z = n_loc[0] * x_hat + n_loc[1] * y_hat + n_loc[2] * z_hat
    new_z /= (np.linalg.norm(new_z) or 1.0)
    ang = math.degrees(math.acos(max(-1.0, min(1.0, float(new_z @ z_hat)))))
    if ang > 8.0:
        return x_hat, y_hat, z_hat, 0.0                         # guard: wild correction, keep the consensus
    new_x = np.cross(y_hat, new_z); nx_n = np.linalg.norm(new_x)
    if nx_n < 1e-9:
        return x_hat, y_hat, z_hat, 0.0
    new_x /= nx_n
    new_y = np.cross(new_z, new_x); new_y /= (np.linalg.norm(new_y) or 1.0)
    return new_x, new_y, new_z, ang

def compute_alignment_light(P, F, refine_seat=True):
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

    # ---- SEAT REFINE: re-level PITCH+ROLL to the RAIL SEAT itself (the machined channel floor). The
    # consensus above blends the seat with the jaw tops / bezel deck / rear deck; on the TLR-7 that left the
    # real seat 4.33deg nose-down. Self-zeroing + guarded. Owner datum: the mount is the light's rail.
    seat_refine_deg = 0.0
    if refine_seat:
        x_hat, y_hat, z_hat, seat_refine_deg = _refine_light_seat(P, F, center, x_hat, y_hat, z_hat)

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
            "seat_refine_deg": round(float(seat_refine_deg), 3),
            "bezel_score_front": round(sf, 0), "bezel_score_rear": round(sr, 0),
            "det_R": round(float(np.linalg.det(R)), 6)}
    return center, R, diag

def pose_report(P, F, tol_deg=0.30):
    """Measure ALL THREE gun datums + the SIGHT CHANNEL on an ALREADY-ALIGNED (P,F). Owner directive
    2026-08-05: *"Not only alignment horizontal but also pitch, yaw and roll across all axis and also check
    gun sights / sight channel."*

    This is the INDEPENDENT verifier: every quantity is re-derived from the mesh, none is carried over from
    `compute_alignment`. That separation is the whole point — this skill's recurring failure is a verifier
    that shares the aligner's basis and rubber-stamps a wrong pose (2026-07-03, again 2026-07-10b). It is
    still not a substitute for rendering the three ortho views; a number and a picture fail differently.

    Returns a dict. The three datums, each measured the way the owner's eye reads it:
      pitch_deg   the UPPER/LOWER PARTING SEAM, measured (groove or step), NOT the slide-top proxy.
      roll_deg    the two REAR-SIGHT SHOULDERS, area-weighted mean height each, across their lever arm.
      yaw_deg     the SIGHT PICTURE: notch-gap centre vs front-post silhouette centre, over 4 z-bands.
    Plus `sight_channel` (slide-top plane, both blades, notch width, post width, protrusions, sight radius)
    and `ok` / `bad` — `bad` lists every datum outside tol_deg, or missing.
    """
    out = {"n_verts": int(len(P))}
    a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    fn = np.cross(b - a, c - a); fa = np.linalg.norm(fn, axis=1); ok = fa > 1e-12
    nn = fn[ok] / fa[ok][:, None]; ar = 0.5 * fa[ok]; cen = ((a + b + c) / 3.0)[ok]
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    zmax = float(z.max())

    # --- slide-top flat: the area-dominant up-facing plane (NOT a percentile of a height band, which
    #     swallows the whole upper slide and makes the front sight look like a 74mm rib -- Echelon 2026-07-27)
    up = (nn[:, 2] > 0.97) & (cen[:, 2] > zmax - 25.0)
    ZT = None
    if int(up.sum()) > 20:
        hh, ee = np.histogram(cen[up, 2], bins=200, weights=ar[up])
        ZT = float(ee[int(hh.argmax())])
        sel = up & (np.abs(cen[:, 2] - ZT) < 0.6)
        N = (nn[sel] * ar[sel][:, None]).sum(0); N /= (np.linalg.norm(N) or 1.0)
        out["slide_top_z"] = ZT
        out["slide_top_area_mm2"] = float(ar[sel].sum())
        out["slide_top_roll_deg"] = float(math.degrees(math.asin(max(-1.0, min(1.0, N[0])))))
        out["slide_top_pitch_deg"] = float(math.degrees(math.asin(max(-1.0, min(1.0, -N[1])))))

    # --- PITCH: the measured parting seam ---
    lmin, lmax = float(np.percentile(y, 1)), float(np.percentile(y, 99)); Ll = lmax - lmin
    hmin, hmax = float(np.percentile(z, 0.5)), float(np.percentile(z, 99.5)); Hh = hmax - hmin
    best = None
    if Ll > 1e-6 and Hh > 1e-6:
        ylo, yhi = lmin + 0.12 * Ll, lmin + 0.72 * Ll
        span_min = 0.35 * (yhi - ylo); hb = max(2.0, 0.025 * Hh)
        for f in np.linspace(0.55, 0.95, 17):
            for mode in ("groove", "step"):
                r = _seam_line(y, z, x, ylo, yhi, hmin + f * Hh, hb, mode, min_pts=_SEAM_MIN_PTS)
                if r is None:
                    continue
                slope, rms, n, span = r
                if n >= 10 and span >= span_min and rms <= 0.25 and (best is None or rms < best[1]):
                    best = (slope, rms, n, span, mode, hmin + f * Hh)
    if best is not None:
        out["pitch_deg"] = float(math.degrees(math.atan(best[0])))
        out["pitch_rms_mm"] = float(best[1]); out["pitch_n"] = int(best[2])
        out["pitch_span_mm"] = float(best[3]); out["pitch_mode"] = best[4]
        out["pitch_seam_z"] = float(best[5])
    else:
        out["pitch_deg"] = None                                  # no modelled seam (e.g. a repaired solid)

    # --- rear sight band, then ROLL + YAW + the sight channel ---
    ch = {}
    if ZT is not None:
        prot = (cen[:, 2] > ZT + 1.5) & (nn[:, 2] > 0.0)
        if int(prot.sum()) > 20:
            hy, ey = np.histogram(cen[prot, 1], bins=120, weights=ar[prot])
            mid = 0.5 * (lmin + lmax)
            fb = [(ey[i], hy[i]) for i in range(120) if hy[i] > 0.5 and ey[i] < mid]
            rb = [(ey[i], hy[i]) for i in range(120) if hy[i] > 0.5 and ey[i] > mid]
            if fb and rb:
                fy0, fy1 = fb[0][0] - 2.0, fb[-1][0] + 2.0
                ry0, ry1 = rb[0][0] - 2.0, rb[-1][0] + 2.0
                ch["front_y"] = [float(fy0), float(fy1)]; ch["rear_y"] = [float(ry0), float(ry1)]
                # ROLL: the two rear-sight shoulders
                rs = (cen[:, 1] > ry0) & (cen[:, 1] < ry1)
                if int(rs.sum()) > 20:
                    htop = float(cen[rs, 2].max())
                    top = rs & (nn[:, 2] > math.cos(math.radians(25))) & (cen[:, 2] > htop - 1.2)
                    Lm, Rm = top & (cen[:, 0] < 0), top & (cen[:, 0] > 0)
                    if int(Lm.sum()) >= 6 and int(Rm.sum()) >= 6 and ar[Lm].sum() > 1 and ar[Rm].sum() > 1:
                        hl = float((cen[Lm, 2] * ar[Lm]).sum() / ar[Lm].sum())
                        hr = float((cen[Rm, 2] * ar[Rm]).sum() / ar[Rm].sum())
                        wl = float((cen[Lm, 0] * ar[Lm]).sum() / ar[Lm].sum())
                        wr = float((cen[Rm, 0] * ar[Rm]).sum() / ar[Rm].sum())
                        out["roll_deg"] = float(math.degrees(math.atan2(hr - hl, wr - wl)))
                        out["roll_shoulder_dz_mm"] = float(hr - hl)
                        ch["shoulder_area_mm2"] = [float(ar[Lm].sum()), float(ar[Rm].sum())]
                # YAW (PRIMARY): the two facing WALL PLANES -- notch inner walls vs front-post flanks,
                # area-weighted so it is MESH-DENSITY-INVARIANT. Calibrated on the owner's canonical STLs,
                # which must read zero: G17 -0.020, G19 +0.007, G34 scan -0.015.
                fyc = 0.5 * (fy0 + fy1); ryc = 0.5 * (ry0 + ry1); rad = abs(ryc - fyc)
                ch["sight_radius_mm"] = float(rad)
                side = np.abs(nn[:, 0]) > 0.85
                def _walls(y0v, y1v, inner):
                    m = side & (cen[:, 1] > y0v) & (cen[:, 1] < y1v) & (cen[:, 2] > ZT + 1.5)
                    if inner:
                        m = m & (np.abs(cen[:, 0]) < 6.0)
                    Lm, Rm = m & (cen[:, 0] < 0), m & (cen[:, 0] > 0)
                    al_, ar_ = float(ar[Lm].sum()), float(ar[Rm].sum())
                    if al_ < 0.25 or ar_ < 0.25 or int(Lm.sum()) < 3 or int(Rm.sum()) < 3:
                        return None
                    xl = float((cen[Lm, 0] * ar[Lm]).sum() / al_)
                    xr = float((cen[Rm, 0] * ar[Rm]).sum() / ar_)
                    sl = math.sqrt(max(0.0, float((ar[Lm] * (cen[Lm, 0] - xl) ** 2).sum() / al_)))
                    sr = math.sqrt(max(0.0, float((ar[Rm] * (cen[Rm, 0] - xr) ** 2).sum() / ar_)))
                    if sl > 0.35 or sr > 0.35:               # planarity gate, see _refine_yaw_to_sights
                        return None
                    return 0.5 * (xl + xr), xr - xl
                nwl = _walls(ry0, ry1, True); pwl = _walls(fy0, fy1, False)
                if nwl and pwl and rad > 1.0:
                    out["yaw_deg"] = float(math.degrees(math.atan2(pwl[0] - nwl[0], rad)))
                    out["yaw_post_offset_mm"] = float(pwl[0] - nwl[0])
                    ch["notch_width_mm"] = float(nwl[1]); ch["post_width_mm"] = float(pwl[1])
                    ch["post_wider_than_notch"] = bool(pwl[1] > nwl[1])
                # SECONDARY, informational: the vertex-gap sight picture. Reliable only on a DENSE mesh
                # (it read -1.83deg on the 114k-tri G17 native, where the truth is ~0), so it is reported
                # and never asserted -- a disagreement with yaw_deg means the mesh is too coarse for it.
                dxs = []
                for d0, d1 in ((2.0, 3.0), (2.5, 3.5), (3.0, 4.0), (3.5, 4.5)):
                    v = P[(y > ry0) & (y < ry1) & (z > ZT + d0) & (z < ZT + d1) & (np.abs(x) < 9.0)]
                    u = P[(y > fy0) & (y < fy1) & (z > ZT + d0) & (z < ZT + d1)]
                    if len(v) < 40 or len(u) < 20:
                        continue
                    xs = np.sort(v[:, 0]); g = np.diff(xs)
                    if not len(g):
                        continue
                    i = int(np.argmax(g))
                    if not (0.8 < float(g[i]) < 8.0):
                        continue
                    dxs.append(0.5 * (float(u[:, 0].min()) + float(u[:, 0].max()))
                               - 0.5 * (float(xs[i]) + float(xs[i + 1])))
                if dxs:
                    out["yaw_vertexgap_deg"] = float(math.degrees(math.atan2(float(np.mean(dxs)),
                                                                             rad or 1.0)))
                    out["yaw_sight_dx_mm"] = float(np.mean(dxs))
                    out["yaw_sight_dx_sd_mm"] = float(np.std(dxs))
                    ch["n_bands"] = len(dxs)
                for tag, y0v, y1v in (("front_sight", fy0, fy1), ("rear_sight", ry0, ry1)):
                    v = P[(y > y0v) & (y < y1v) & (z > ZT + 0.5)]
                    if len(v) > 20:
                        ch[tag + "_proud_mm"] = float(v[:, 2].max() - ZT)
                        ch[tag + "_width_mm"] = float(v[:, 0].max() - v[:, 0].min())
    out["sight_channel"] = ch

    bad = []
    for k in ("pitch_deg", "roll_deg", "yaw_deg"):
        v = out.get(k)
        if v is None:
            bad.append(k.replace("_deg", "") + "=NO_DATUM")
        elif abs(v) > tol_deg:
            bad.append("%s=%.3f" % (k.replace("_deg", ""), v))
    out["bad"] = bad; out["ok"] = not bad; out["tol_deg"] = tol_deg
    return out

def verify_alignment(P_new, F):
    """Adversarial self-check on the ALIGNED cloud (gun-canonical pose). All must be ~ideal:
      center_residual ~ 0 ; R_new ~ identity ; dims Y>=Z>=X ; muzzle at -Y ; GRIP at bottom-rear
      (min-Z vert sits at +Y and below center) ; slide level (|slide_top_tilt| small)."""
    P_new = np.asarray(P_new, dtype=np.float64)
    cen2, R2, d2 = compute_alignment(P_new, F, refine_parting=False, refine_sights=False, refine_roll=False,
                                     refine_sight_roll=False, refine_seam=False)  # pure axis/sign recheck
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
                 roll_offset_deg=0.0, yaw_offset_deg=0.0, mode="gun", refine_parting=True, refine_sights=True,
                 refine_roll=True, refine_seat=True, refine_sight_roll=True, refine_seam=True):
    """Align an already-imported gun/light mesh to world XYZ, mass-centered. THE skill entry point.

    mode="gun"  (default) -> muzzle -Y, grip -Z, slide/rail level (gun anatomy heuristics).
    mode="light"          -> rail clamp +Z & level, bezel -Y (weapon-light heuristics; near-symmetric body).
                             `refine_seat` re-levels pitch+roll to the RAIL SEAT itself (owner light datum,
                             2026-08-04 TLR-7 HL-X) — self-zeroing + guarded, see _refine_light_seat.
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
        center, R, diag = compute_alignment_light(P, F, refine_seat=refine_seat)
    else:
        center, R, diag = compute_alignment(P, F, level_slide=level_slide, pitch_offset_deg=pitch_offset_deg,
                                             roll_offset_deg=roll_offset_deg, yaw_offset_deg=yaw_offset_deg,
                                             refine_parting=refine_parting, refine_sights=refine_sights,
                                             refine_roll=refine_roll, refine_sight_roll=refine_sight_roll,
                                             refine_seam=refine_seam)
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
        # Re-measure the centre the SAME WAY the aligner set it (volume centroid on a closed solid). The
        # old check used the VERTEX MEAN, which a scan's uneven vertex density puts millimetres off the
        # volume centroid: the TLR-7 HL-X read 2.07mm and reported `aligned_ok: false` on a mesh whose
        # volume centroid was exactly (0,0,0) — a verifier measuring a different quantity than the aligner.
        cen_v, _, cmode, _ = _mass_center_and_cov(P_new, F)
        cen2 = float(np.linalg.norm(cen_v))
        dims = P_new.max(0) - P_new.min(0)
        ver = {"center_residual_mm": round(cen2, 4), "center_check_mode": cmode,
               "vertex_mean_offset_mm": round(float(np.linalg.norm(P_new.mean(0))), 3),
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
