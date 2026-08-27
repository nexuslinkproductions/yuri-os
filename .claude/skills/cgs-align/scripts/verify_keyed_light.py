"""Regression test — LIGHT mode must pick the rail-clamp side as UP even when the rail channel is
FILLED by a fitted key/insert.

Failure this pins (2026-08-27, STREAMLIGHT TLR-7 HL-X + 1913-1 KEY): the key fills the rail channel,
which flattens exactly the surface structure that `flat_area x complexity^2` exists to detect
(clamp_complexity 1.026 vs the bare PL2's 1.09). The smooth body panel then wins the mount score and
the light aligns UPSIDE DOWN while `aligned_ok` stays true. `_refine_light_seat`'s jaw gate then finds
no channel and returns seat_refine_deg 0.0 -- a silent no-op that reads identically to "already level".

The geometry that survives a key is the CHANNEL STEP: two jaws standing above a floor. On the real
keyed TLR-7 the mid columns sat at 11.6-13.2 while the outer columns sat at 16-18. That step is what
the mount score must key off.

bpy-free. Run:  python verify_keyed_light.py
"""
import os
import sys
import math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cgs_align as CA


# ---------------------------------------------------------------- synthetic light
def _ring(floor_z):
    """Closed 2D cross-section (x, z) of the light: superelliptic body with a large flattish battery
    face at the bottom, straight sides, and a jawed rail channel cut into the top.

    Point count is CONSTANT for every station so the stations stitch directly; on a station with no
    channel the notch collapses (floor_z = 13.0) into degenerate edges, which the area filter drops.
    """
    a, b, n = 11.0, 12.0, 4.0
    pts = []
    for t in np.linspace(math.pi, 2.0 * math.pi, 61):               # lower body: flat-ish battery face
        ct, st = math.cos(t), math.sin(t)
        pts.append((a * math.copysign(abs(ct) ** (2.0 / n), ct),
                    b * math.copysign(abs(st) ** (2.0 / n), st)))
    pts += [(11.0, 6.5), (11.0, 13.0)]                              # right side wall, up
    pts += [(5.5, 13.0), (5.5, floor_z), (-5.5, floor_z), (-5.5, 13.0), (-11.0, 13.0)]   # top + notch
    pts += [(-11.0, 6.5)]                                           # left side wall, down; closes to pts[0]
    return pts


def build_light(keyed: bool, ny: int = 241):
    """Weapon light swept along +Y, rail channel on the +Z face.

    +Z face : two jaws (|x| > 5.5) at z=13 flanking a channel floor
              bare  -> floor 8.0, plus a transverse cross-slot (structure the key hides)
              keyed -> floor 10.5, featureless insert; jaws still stand 2.5 mm proud
    -Z face : large smooth battery panel -- the competitor the real failure lost to
    """
    ys = np.linspace(-36.5, 36.5, ny)
    rings = []
    for y in ys:
        in_chan = -16.0 <= y <= 8.0
        if not in_chan:
            fz = 13.0
        elif keyed:
            fz = 10.5
        else:
            fz = 6.0 if (-6.0 <= y <= -4.0) else 8.0                # bare: rail cross-slot
        rings.append(_ring(fz))

    K = len(rings[0])
    P = np.array([[p[0], y, p[1]] for y, ring in zip(ys, rings) for p in ring], dtype=np.float64)

    F = []
    for i in range(ny - 1):
        for k in range(K):
            k2 = (k + 1) % K
            A, B = i * K + k, i * K + k2
            C, D = (i + 1) * K + k, (i + 1) * K + k2
            F.append((A, C, D))
            F.append((A, D, B))
    for i, sgn in ((0, 1), (ny - 1, -1)):                            # end caps, fanned from the centroid
        c = len(P)
        P = np.vstack([P, P[i * K:(i + 1) * K].mean(axis=0)])
        for k in range(K):
            k2 = (k + 1) % K
            tri = (c, i * K + k, i * K + k2) if sgn > 0 else (c, i * K + k2, i * K + k)
            F.append(tri)
    return P, np.asarray(F, dtype=np.int64)


# ---------------------------------------------------------------- assertion helper
def channel_is_up(P, F, center, R):
    """Independent of the aligner's own report: after alignment, does the +Z face carry the channel?

    Per-slice top/bottom profile -- the 2026-08-27 manual method. Returns (score_up, score_down);
    a channel scores high when mid columns sit BELOW the outer columns across many length slices.
    """
    q = (np.asarray(P) - center) @ R.T
    W = CA._robust_extent(q[:, 0])
    L = CA._robust_extent(q[:, 1])
    dy = max(1.0, 0.02 * L)
    ylo, yhi = np.percentile(q[:, 1], 1), np.percentile(q[:, 1], 99)
    yb = np.arange(ylo, yhi + dy, dy)
    idx = np.clip(((q[:, 1] - ylo) / dy).astype(int), 0, len(yb) - 1)
    mid = np.abs(q[:, 0]) < 0.22 * W
    side = (np.abs(q[:, 0]) > 0.26 * W) & (np.abs(q[:, 0]) < 0.50 * W)
    up_hits = down_hits = 0
    for b in range(len(yb)):
        s = idx == b
        m, o = s & mid, s & side
        if m.sum() < 6 or o.sum() < 6:
            continue
        if q[o, 2].max() > np.percentile(q[m, 2], 90) + 0.4:
            up_hits += 1
        if q[o, 2].min() < np.percentile(q[m, 2], 10) - 0.4:
            down_hits += 1
    return up_hits, down_hits


def run_case(keyed):
    P, F = build_light(keyed=keyed)
    center, R, diag = CA.compute_alignment_light(P, F)
    up, down = channel_is_up(P, F, center, R)
    ok = up > down
    return ok, up, down, diag


_SL = r"C:\Users\rene\Desktop\CAD\STREAMLIGHT"
_OWN = os.path.join(_SL, "TLR-7 HL-X OWN SCAN")
REAL_LIGHTS = [
    ("BARE  TLR-7 HL-X",     os.path.join(_SL, "TLR-7 HL-X.stl")),
    ("BARE  TLR-7 HL-X SUB", os.path.join(_SL, "TLR-7 HL-X SUB.stl")),
    ("BARE  TLR-1 HL-X",     os.path.join(_SL, "TLR-1 HL-X.stl")),
    ("BARE  TLR-8",          os.path.join(_SL, "TLR-8.stl")),
    ("BARE  PL2 VALKYRIE",   r"C:\Users\rene\Desktop\CAD\GLOCK\GLOCK 17 GEN 5\PL2_MINI VALKYRIE.stl"),
    ("KEYED 1913-1",         os.path.join(_OWN, "STREAMLIGHT TLR-7 HL-X - 1913-1 KEY.stl")),
    ("KEYED 1913-2",         os.path.join(_OWN, "1913-2 KEY.stl")),
    ("KEYED 1913-3",         os.path.join(_OWN, "1913-3 KEY.stl")),
    ("KEYED 1913-4",         os.path.join(_OWN, "1913-4 KEY.stl")),
    ("KEYED UNIV-1",         os.path.join(_OWN, "UNIV-1 KEY.stl")),
    ("KEYED UNIV-2",         os.path.join(_OWN, "UNIV-2 KEY.stl")),
]


def _report(tag, ok, up, down, diag):
    print(f"[{'PASS' if ok else 'FAIL'}] {tag:22s} up={up:3d} down={down:3d} "
          f"method={diag.get('mount_method','n/a'):10s} "
          f"cplx={diag.get('clamp_complexity')} "
          f"frac={diag.get('mount_channel_frac')} conf={diag.get('mount_confidence')} "
          f"seat={diag.get('seat_refine_deg')} "
          f"reason={diag.get('seat_refine_reason','n/a'):22s} "
          f"manual={diag.get('needs_manual_check','n/a')}")


def main():
    failures = []

    print("--- synthetic ---")
    for keyed in (False, True):
        tag = "KEYED synthetic" if keyed else "BARE synthetic"
        ok, up, down, diag = run_case(keyed)
        _report(tag, ok, up, down, diag)
        if not ok:
            failures.append(f"{tag}: aligned UPSIDE DOWN ({down} channel-down slices vs {up})")

    print("--- real scans (skipped if absent) ---")
    seen_real = 0
    for tag, path in REAL_LIGHTS:
        if not os.path.exists(path):
            print(f"[SKIP] {tag:22s} not on this machine")
            continue
        seen_real += 1
        try:
            from _stl_io import read_stl
            P, F = read_stl(path)
            center, R, diag = CA.compute_alignment_light(P, F)
            up, down = channel_is_up(P, F, center, R)
        except Exception as exc:
            failures.append(f"{tag}: {type(exc).__name__}: {exc}")
            print(f"[FAIL] {tag:22s} {type(exc).__name__}: {exc}")
            continue
        ok = up > down
        _report(tag, ok, up, down, diag)
        if not ok:
            failures.append(f"{tag}: aligned UPSIDE DOWN ({down} channel-down slices vs {up})")
        # a seat that was never measured must say so, never report a silent clean level
        if diag.get("seat_refine_deg") == 0.0 and not diag.get("needs_manual_check", False):
            failures.append(f"{tag}: seat_refine_deg 0.0 returned SILENTLY")

    print()
    if failures:
        for f in failures:
            print("  FAILURE:", f)
        print(f"\n{len(failures)} failure(s)")
        return 1
    print(f"all checks passed ({seen_real} real scans + 2 synthetic)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
