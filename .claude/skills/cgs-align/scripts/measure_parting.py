"""measure_parting — VERIFY the owner's PITCH datum (the upper/lower parting line) on a real mesh.

This is a MEASUREMENT tool, not part of the aligner. `refine_parting` inside cgs_align.py levels the
slide-top SILHOUETTE EDGE as a *proxy*; this measures the parting line ITSELF, which is what René
actually looks at. The two have disagreed by up to 0.17deg (Echelon 4.5, 2026-07-27).

Written after hand-rolling the same detector three times — Echelon (groove), Sphinx (step),
Glock 34 (groove) — each time re-learning the same traps. Handles BOTH geometry classes:

  GROOVE  the seam is a real recess -> an interior LOCAL MINIMUM of the per-slice half-width
          max|x|(z).   (Springfield Echelon 4.5, Glock 34)
  STEP    the seam is a plain shoulder, no recess -> the sharpest DOWNWARD STEP in max|x|(z).
          (Sphinx SDP: frame 13.55 -> slide 13.10, identical at every station)

TRAPS THIS ENCODES (each one cost a session):
  * np.maximum.at() into a NaN-initialised array stays NaN -- every slice silently rejects and the
    detector returns "no feature" with no error. Initialise to -inf.            (Glock 34, 2026-07-27b)
  * The parting line ENDS where the slide ends. Fit it full-length and the frame/beavertail shoulder
    (~3.4mm lower on the Sphinx) drags the fit to -1.51deg vs a true -0.010deg. A 3-sigma MAD trim does
    NOT save you: the contaminants are a coherent second population, not outliers.  (Sphinx, 2026-07-27b)
  * Too-fine z-bins on a sparse mesh reject every slice. Report the rejection counts; a detector that
    returns n=0 for every input is a tuning failure, not "no feature".                (Sphinx, 2026-07-27b)
  * A hand-rolled Rx applies pitch in the OPPOSITE sense to align_object's pitch_offset_deg knob.
    Probe it on (0,-100,z) and read the muzzle's dz BEFORE baking.                    (Echelon, 2026-07-27)
  * np.convolve(..., mode="same") ZERO-pads, so a smoothed profile dips at both ends and the argmin lands
    on an edge in every slice. Pad with mode="edge".                                 (Glock 34, 2026-08-05)
  * The seam sits HIGH in the height extent (0.81 on the Glock 34) because the grip drags the extent down
    -- a z sweep over the lower half never visits it.                                (Glock 34, 2026-08-05)

Usage (offline, after dumping vertices from Blender):
    import numpy as np
    from measure_parting import measure_parting, scan_bands
    co = np.load("verts.npy")                 # (N,3) in the ALIGNED frame
    print(scan_bands(co))                     # find the z band + mode if you don't know them
    r = measure_parting(co, ylo=-110, yhi=50, zc=25.3)
    print(r["deg"], r["rms"], r["n"])

Apply the residual as -r["deg"] about X, probe-verified, then compose into obj["cgs_align_R"].
"""

import numpy as np

__all__ = ["halfwidth_profile", "measure_parting", "scan_bands", "slide_span"]


def halfwidth_profile(pts, zlo, zhi, dz):
    """Per-slice side-profile half-width max|x| as a function of z, gap-interpolated.

    Returns (zc, w, fill) or (None, None, fill) when the slice is too sparse to trust.
    """
    nb = int(round((zhi - zlo) / dz))
    if nb < 8 or len(pts) < 150:
        return None, None, 0.0
    idx = np.clip(((pts[:, 2] - zlo) / dz).astype(int), 0, nb - 1)
    w = np.full(nb, -np.inf)                    # NOT np.nan -- maximum.at leaves NaN untouched
    np.maximum.at(w, idx, np.abs(pts[:, 0]))
    ok = np.isfinite(w)
    fill = float(ok.mean())
    if fill < 0.6:
        return None, None, fill
    zc = zlo + (np.arange(nb) + 0.5) * dz
    return zc, np.interp(zc, zc[ok], w[ok]), fill


def _smooth(v, k):
    """Box-smooth with EDGE-REPLICATED padding.

    np.convolve(v, ones(k)/k, mode="same") zero-pads, so the first and last bins are divided by k while
    summing fewer than k real samples -- the profile dips hard at both ends and `argmin` lands on an edge
    in EVERY slice, which then rejects as "no interior feature". Cost: one debugging round on the Glock 34
    where the packaged detector returned n=0 on data the inline version had fitted at rms 0.049mm.
    """
    if k < 2:
        return v
    pad = k // 2
    return np.convolve(np.pad(v, pad, mode="edge"), np.ones(k) / float(k), mode="valid")[:len(v)]


def _parabolic(y0, y1, y2):
    den = y0 - 2 * y1 + y2
    return 0.5 * (y0 - y2) / den if abs(den) > 1e-12 else 0.0


def measure_parting(co, ylo, yhi, zc, half_band=3.5, mode="auto",
                    dz=0.25, step=2.0, slab=2.5, min_depth=0.10, min_contrast=0.20,
                    min_slices=6, smooth=3, _retry=True):
    """Fit the parting line over a length window and return its pitch in degrees.

    co        (N,3) vertices in the aligned frame (muzzle -Y, grip -Z).
    ylo/yhi   length window -- MUST be the SLIDE SPAN, not the whole gun.
    zc        approximate parting-line height (use scan_bands, or the owner's annotation dots).
    half_band the z window searched around zc. KEEP IT TIGHT. Widen it and a competing feature outside the
              seam wins the argmin in every slice and everything rejects as "edge" -- on the Glock 34 a
              +-8mm band pulled in the narrow dust cover and killed all 80 slices, +-3.5mm gave 50 clean
              ones. The function auto-narrows once when edge-rejections dominate, but pass a good zc.
    mode      "groove" | "step" | "auto" (tries both, keeps the tighter rms).

    Returns a dict with deg, rms, n, span, z_at_0, rej (rejection counts), mode, rows.
    A `deg` without a small `rms` over a long `span` is not a datum -- check rej before believing it.
    """
    if mode == "auto":
        best = None
        for m in ("groove", "step"):
            r = measure_parting(co, ylo, yhi, zc, half_band, m, dz, step, slab,
                                min_depth, min_contrast, min_slices, smooth)
            if r["n"] >= min_slices and (best is None or r["rms"] < best["rms"]):
                best = r
        return best if best is not None else {"n": 0, "mode": "auto",
                                              "rej": {"note": "no feature in either mode"}}

    zlo, zhi = zc - half_band, zc + half_band
    rows, rej = [], {"few": 0, "fill": 0, "edge": 0, "weak": 0}

    for y0 in np.arange(ylo, yhi, step):
        q = co[(co[:, 1] >= y0) & (co[:, 1] < y0 + slab)]
        q = q[(q[:, 2] > zlo) & (q[:, 2] < zhi)]
        if len(q) < 150:
            rej["few"] += 1
            continue
        zs, w, _ = halfwidth_profile(q, zlo, zhi, dz)
        if zs is None:
            rej["fill"] += 1
            continue
        ws = _smooth(w, smooth)
        nb = len(ws)

        if mode == "groove":
            i = int(np.argmin(ws))
            if i < 2 or i > nb - 3:
                rej["edge"] += 1              # minimum on a band edge = no interior recess here
                continue
            strength = min(ws[:i].max(), ws[i + 1:].max()) - ws[i]
            if strength < min_depth:
                rej["weak"] += 1
                continue
            zhit = zs[i] + _parabolic(ws[i - 1], ws[i], ws[i + 1]) * dz
        else:                                  # step: sharpest downward transition going up in z
            d = np.diff(ws)
            i = int(np.argmin(d))
            if i < 2 or i > nb - 4:
                rej["edge"] += 1
                continue
            strength = ws[max(0, i - 4):i + 1].max() - ws[i + 1:i + 6].min()
            if strength < min_contrast:
                rej["weak"] += 1
                continue
            zhit = zs[i] + (0.5 + _parabolic(d[i - 1], d[i], d[i + 1])) * dz

        rows.append((y0 + slab / 2.0, zhit, strength))

    if len(rows) < min_slices:
        # Edge-rejections dominating means the argmin/step is being won by a feature OUTSIDE the seam --
        # narrow the window once and retry rather than reporting a bare "no feature" (a detector that
        # returns n=0 for every input is a tuning failure, not a statement about the gun).
        if _retry and rej["edge"] > 2 * (rej["few"] + rej["fill"] + rej["weak"]) and half_band > 2.0:
            return measure_parting(co, ylo, yhi, zc, half_band * 0.5, mode, dz, step, slab,
                                   min_depth, min_contrast, min_slices, smooth, _retry=False)
        return {"n": 0, "raw": len(rows), "rej": rej, "mode": mode, "rms": np.inf}

    R = np.array(rows)
    p = np.polyfit(R[:, 0], R[:, 1], 1)
    res = R[:, 1] - np.polyval(p, R[:, 0])
    med = np.median(res)
    mad = np.median(np.abs(res - med)) + 1e-12
    keep = np.abs(res - med) < 3 * 1.4826 * mad
    if keep.sum() < min_slices:
        keep = np.ones(len(R), bool)
    p = np.polyfit(R[keep, 0], R[keep, 1], 1)
    res = R[keep, 1] - np.polyval(p, R[keep, 0])
    return {"n": int(keep.sum()), "rej": rej, "mode": mode,
            "span": float(R[keep, 0].max() - R[keep, 0].min()),
            "deg": float(np.degrees(np.arctan(p[0]))),
            "rms": float(np.sqrt((res ** 2).mean())),
            "z_at_0": float(np.polyval(p, 0.0)),
            "strength_med": float(np.median(R[keep, 2]))}


def scan_bands(co, ylo=None, yhi=None, zfrac=(0.45, 0.95), n_z=20, half_band=3.5, min_span_frac=0.35):
    """Sweep candidate parting heights and return them ranked by fit quality (best first).

    A HINT, not an answer -- always sanity-check the winner's z against the owner's annotation dots.

    zfrac is a fraction of the FULL HEIGHT EXTENT, which includes the grip hanging far below the bore, so
    the seam sits HIGH in that range: on the Glock 34 it is at 0.81 (z=25.3 in a -88.2..52.2 extent). An
    earlier 0.10-0.60 sweep never even visited it and confidently returned garbage bands instead.
    Candidates spanning less than `min_span_frac` of the length window are dropped: a tight rms over a
    short span is the signature of a small local feature, not of a parting line.
    """
    zmin, zmax = co[:, 2].min(), co[:, 2].max()
    H = zmax - zmin
    if ylo is None or yhi is None:
        ylo, yhi = slide_span(co)
    out = []
    for f in np.linspace(zfrac[0], zfrac[1], n_z):
        z = zmin + f * H
        r = measure_parting(co, ylo, yhi, z, half_band=half_band)
        if r and r.get("n", 0) >= 6 and r.get("span", 0.0) >= min_span_frac * abs(yhi - ylo):
            r["z_probe"] = float(z)
            out.append(r)
    out.sort(key=lambda r: r["rms"])          # rms IS the quality; span is already gated above
    return out


def slide_span(co, top_frac=0.25):
    """Crude slide-span estimate: the length range occupied by the upper quarter of the height.

    The parting line ENDS where the slide ends -- fitting past it mixes in the frame/beavertail
    shoulder. Prefer passing an explicit window when you can see the geometry.
    """
    zmin, zmax = co[:, 2].min(), co[:, 2].max()
    m = co[:, 2] > zmax - top_frac * (zmax - zmin)
    ys = co[m, 1]
    return float(np.percentile(ys, 0.5)), float(np.percentile(ys, 99.5))
