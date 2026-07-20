"""REAL-GEOMETRY regression harness for cgs-align (offline, no Blender session needed).

Born from the GLOCK 19 GEN5 failure (2026-07-20): the aligner shipped the gun ~31deg pitched with the
muzzle on the WRONG end, and BOTH datum refinements silently no-opped (their guards cap at 8deg / 3deg,
so a gross PCA miss is out of their reach). The synthetic box-gun suite in `verify_align_math.py` was
100% green through all of it -- the skill's oldest lesson again: a synthetic mesh does not reproduce a
real scan's failure mode. This harness runs the REAL owner STLs.

Method: load a real gun STL, apply N random rotations, run compute_alignment, and score the recovered
pose against INDEPENDENT datums measured on the transformed mesh (never a metric the aligner used):
  PITCH -> the slide-bottom / frame-top PARTING LINE over the dust cover (owner's datum, 2026-07-10)
  ROLL  -> the slide-top up-face consensus normal's width component (front view, 2026-07-10b)
  YAW   -> the two slide SIDEWALL consensus normals
plus the hard invariants (det +1, mass-centered, muzzle -Y, grip -Z, dims ordered).

Run:  "C:/Program Files/Blender Foundation/Blender 5.1/5.1/python/bin/python.exe" verify_real_guns.py
      [--poses 24] [--stl "<path>"]
"""
import os, sys, math, struct
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
exec(open(os.path.join(HERE, "cgs_align.py")).read(), globals())

GUNS = [
    r"C:\Users\rene\Desktop\CAD\GLOCK\GLOCK 19 GEN5\G19_GEN5_SOLID GUN.stl",
    r"C:\Users\rene\Desktop\CAD\GLOCK\GLOCK 17 GEN 5\G17 - GEN5 - SOLID GUN.stl",
]


def load_stl(path):
    """Binary or ASCII STL -> (P(n,3) unique-ish verts, F(m,3) index triangles)."""
    with open(path, "rb") as fh:
        head = fh.read(84)
        if head[:5].lower() == b"solid" and b"facet" in fh.read(512).lower():
            return _load_stl_ascii(path)
        ntri = struct.unpack("<I", head[80:84])[0]
        fh.seek(84)
        buf = fh.read(ntri * 50)
    data = np.frombuffer(buf, dtype=np.uint8).reshape(ntri, 50)
    tri = data[:, 12:48].copy().view(np.float32).reshape(ntri, 3, 3).astype(np.float64)
    return _weld(tri)


def _load_stl_ascii(path):
    vs = []
    for line in open(path, "r", errors="ignore"):
        s = line.strip()
        if s.startswith("vertex"):
            vs.append([float(x) for x in s.split()[1:4]])
    tri = np.asarray(vs, dtype=np.float64).reshape(-1, 3, 3)
    return _weld(tri)


def _weld(tri, tol=1e-4):
    flat = tri.reshape(-1, 3)
    key = np.round(flat / tol).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    P = flat[first]
    F = inv.reshape(-1, 3)
    return P, F.astype(np.int64)


# ---------------------------------------------------------------- independent datums (aligned frame)
def datum_parting(P):
    """PITCH: slide-bottom edge over the dust cover. Selected by |x| > half the SLIDE width, forward of
    the frame's wide lever region -- so it tracks the slide's own underside = the parting line."""
    y0, y1 = np.percentile(P[:, 1], 1), np.percentile(P[:, 1], 99)
    L = y1 - y0
    lo, hi = y0 + 0.03 * L, y0 + 0.24 * L                    # dust-cover span (muzzle at -Y)
    win = P[(P[:, 1] > lo) & (P[:, 1] < hi)]
    if len(win) < 400:
        return None
    # half-width of the SLIDE at this station (the frame below it is narrower) -- measured in-window, NOT
    # from the whole gun (the grip is wider than the slide and would push the cut past every slide vertex).
    thr = 0.95 * float(np.percentile(np.abs(win[:, 0]), 98))
    sel = win[np.abs(win[:, 0]) > thr]
    if len(sel) < 200:
        return None
    edges = np.linspace(lo, hi, 20)
    ys, zs = [], []
    for i in range(len(edges) - 1):
        m = (sel[:, 1] >= edges[i]) & (sel[:, 1] < edges[i + 1])
        if int(m.sum()) >= 8:
            ys.append(0.5 * (edges[i] + edges[i + 1])); zs.append(float(np.percentile(sel[m, 2], 2)))
    if len(ys) < 8:
        return None
    ys = np.asarray(ys); zs = np.asarray(zs)
    # Drop slices that fell OFF the parting line. Rearward of the dust cover the frame widens (slide-stop
    # and takedown levers out-span the slide), so the |x| cut starts admitting frame vertices metres below
    # the seam -- those slices plunge several mm and would drag a plain line fit (they read the G17 as
    # -5.8deg when its slide-top normal says +0.2deg). Trim against the PLATEAU median, not a fit: the
    # parting line is flat-ish by construction, an off-line slice is not a mild outlier but a cliff.
    k = zs > (np.median(zs) - 1.2)
    if int(k.sum()) < 8:
        return None
    ys, zs = ys[k], zs[k]
    p = np.polyfit(ys, zs, 1); r = zs - np.polyval(p, ys)
    mad = float(np.median(np.abs(r - np.median(r)))) or 1e-6
    k = np.abs(r - np.median(r)) < 2.5 * mad
    if int(k.sum()) < 6:
        return None
    return math.degrees(math.atan(float(np.polyfit(ys[k], zs[k], 1)[0])))


def _face_normals(P, F):
    a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    n = np.cross(b - a, c - a); A = np.linalg.norm(n, axis=1); ok = A > 1e-12
    return n[ok] / A[ok][:, None], 0.5 * A[ok], ((a + b + c) / 3.0)[ok]


def datum_roll(P, F):
    """ROLL: slide-top up-face consensus normal -> its X component must be 0 (front/down-bore view)."""
    nn, ar, cn = _face_normals(P, F)
    ymin = np.percentile(P[:, 1], 1); L = np.percentile(P[:, 1], 99) - ymin
    zmax = P[:, 2].max()
    m = (nn[:, 2] > math.cos(math.radians(10))) & (cn[:, 1] < ymin + 0.75 * L) & (cn[:, 2] > zmax - 10)
    if int(m.sum()) < 100:
        return None
    w = (nn[m] * ar[m, None]).sum(0); w /= (np.linalg.norm(w) or 1.0)
    return math.degrees(math.atan2(float(w[0]), float(w[2])))


def datum_yaw(P, F):
    """YAW: the two slide SIDEWALL consensus normals -> their difference must lie on X."""
    nn, ar, cn = _face_normals(P, F)
    ymin = np.percentile(P[:, 1], 1); L = np.percentile(P[:, 1], 99) - ymin
    zmax = P[:, 2].max()
    band = (cn[:, 1] < ymin + 0.80 * L) & (cn[:, 2] > zmax - 26) & (cn[:, 2] < zmax - 3)
    out = []
    for sgn in (1.0, -1.0):
        m = band & (sgn * nn[:, 0] > math.cos(math.radians(12)))
        if int(m.sum()) < 200:
            return None
        w = (nn[m] * ar[m, None]).sum(0); out.append(w / (np.linalg.norm(w) or 1.0))
    w = out[0] - out[1]; w /= (np.linalg.norm(w) or 1.0)
    return math.degrees(math.atan2(float(w[1]), float(w[0])))


def rand_rot(rng):
    q = rng.normal(size=4); q /= np.linalg.norm(q)
    w, x, y, z = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def kabsch(A, B):
    """Rotation taking A onto B (both mean-centred, same vertex order). Proper rotation only."""
    A = A - A.mean(0); B = B - B.mean(0)
    U, _, Vt = np.linalg.svd(A.T @ B)
    D = np.diag([1.0, 1.0, float(np.sign(np.linalg.det(U @ Vt)))])
    return U @ D @ Vt


def native_is_canonical(P, F):
    """GROUND TRUTH GATE. René's production `*SOLID GUN.stl` files ship ALREADY in his canonical pose --
    that is the reference this suite scores against, so assert it rather than assume it. Cheap checks:
    axis order Y>Z>X, mass-centred roll/yaw ~0, muzzle (thin end) on -Y."""
    Q = P - _mass_center_and_cov(P, F)[0]
    d = Q.max(0) - Q.min(0)
    why = []
    if not (d[1] > d[2] > d[0]): why.append("axis_order")
    r = datum_roll(Q, F); y = datum_yaw(Q, F)
    if r is None or abs(r) > 1.0: why.append("roll=%s" % _f(r))
    if y is None or abs(y) > 1.0: why.append("yaw=%s" % _f(y))
    ymin, ymax = Q[:, 1].min(), Q[:, 1].max(); L = ymax - ymin
    front = Q[Q[:, 1] < ymin + 0.25 * L]; rear = Q[Q[:, 1] > ymax - 0.25 * L]
    if not np.ptp(front[:, 2]) < np.ptp(rear[:, 2]): why.append("muzzle_not_-Y")
    return why


def run(path, poses, tol_deg=1.0):
    P0, F = load_stl(path)
    name = os.path.basename(path)
    why = native_is_canonical(P0, F)
    if why:
        print("%-38s  SKIP -- native STL is not canonical (%s); no ground truth" % (name, ",".join(why)))
        return True
    rng = np.random.default_rng(20260720)
    fails = []; rows = []
    for i in range(poses):
        R0 = rand_rot(rng)
        P = P0 @ R0.T + rng.normal(scale=40.0, size=3)
        center, R, diag = compute_alignment(P, F)
        Q = apply_alignment(P, center, R)
        # PRIMARY: total rotation between the recovered pose and the owner's own canonical file. One
        # number that catches pitch, roll, yaw, end-flips and mirrors at once -- and it cannot share a
        # blind spot with the aligner, because it is the OWNER's pose, not a metric I derived.
        M = kabsch(P0, Q)
        d = dict(pose=i, det=diag["det_R"],
                 err_deg=math.degrees(math.acos(max(-1.0, min(1.0, (np.trace(M) - 1.0) / 2.0)))))
        d["center_mm"] = float(np.linalg.norm(_mass_center_and_cov(Q, F)[0]))
        dims = Q.max(0) - Q.min(0)
        d["dims"] = [round(float(v), 1) for v in dims]
        d["order_ok"] = bool(dims[1] > dims[2] > dims[0])
        # SECONDARY (reported, loosely asserted): the physical datums, as a cross-check on the primary.
        d["pitch"] = datum_parting(Q); d["roll"] = datum_roll(Q, F); d["yaw"] = datum_yaw(Q, F)
        bad = []
        if abs(d["det"] - 1.0) > 1e-6: bad.append("det")
        if d["center_mm"] > 0.05: bad.append("center")
        if not d["order_ok"]: bad.append("axis_order")
        if d["err_deg"] > tol_deg: bad.append("err=%.2f" % d["err_deg"])
        for k in ("roll", "yaw"):                       # tight: both are clean, gun-independent datums
            if d[k] is None: bad.append(k + "_nodatum")
            elif abs(d[k]) > 1.0: bad.append("%s=%.2f" % (k, d[k]))
        # parting-edge extraction carries ~1deg of gun-to-gun bias (frame-lever contamination rearward of
        # the dust cover), so it is a sanity band, not the verdict -- the Kabsch error above is.
        if d["pitch"] is not None and abs(d["pitch"]) > 3.0: bad.append("pitch=%.2f" % d["pitch"])
        d["bad"] = bad; rows.append(d)
        if bad: fails.append(d)
    ok = len(rows) - len(fails)
    e = [r["err_deg"] for r in rows]
    print("%-38s %3d/%3d PASS   err vs owner pose: max %.2fdeg mean %.2fdeg  (tol %.1f)"
          % (name, ok, len(rows), max(e), sum(e) / len(e), tol_deg))
    for d in fails[:6]:
        print("   pose %-3d %s  dims=%s pitch=%s roll=%s yaw=%s"
              % (d["pose"], ",".join(d["bad"]), d["dims"], _f(d["pitch"]), _f(d["roll"]), _f(d["yaw"])))
    if len(fails) > 6:
        print("   ... %d more failing poses" % (len(fails) - 6))
    return len(fails) == 0


def _f(v):
    return "None" if v is None else "%.2f" % v


if __name__ == "__main__":
    poses = 24
    stls = list(GUNS)
    a = sys.argv[1:]
    if "--poses" in a: poses = int(a[a.index("--poses") + 1])
    if "--stl" in a: stls = [a[a.index("--stl") + 1]]
    allok = True
    for p in stls:
        if not os.path.exists(p):
            print("SKIP (missing): %s" % p); continue
        allok &= run(p, poses)
    print("\nREAL-GUN SUITE:", "PASS" if allok else "FAIL")
    sys.exit(0 if allok else 1)
