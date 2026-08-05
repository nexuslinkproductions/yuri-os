"""verify_datums — ALL-AXES regression: scramble a real gun in 3D, re-align, assert every owner datum.

Owner directive 2026-08-05: *"Make sure this is hardened. Not only alignment horizontal but also pitch,
yaw and roll across all axis and also check gun sights / sight channel."*

WHY THIS EXISTS ALONGSIDE THE OTHER TWO SUITES
  verify_align_math.py  synthetic boxes. Catches sign/handedness/centering algebra. Was 100% green straight
                        through the G19 31-degree failure — a box gun cannot reproduce a real scan.
  verify_real_guns.py   real STLs scored by Kabsch rotation back to RENÉ'S OWN canonical pose. Strong, but
                        it can only ever say "same as before": when a datum is CORRECTED the score gets
                        WORSE (the G19's canonical STL is itself 0.11deg off in pitch), and it needs a
                        known-good pose per gun, so the roster cannot grow past the guns he has posed.
  verify_datums.py      THIS. Scores the pose against the PHYSICAL DATUMS themselves — the parting seam,
                        the rear-sight shoulders, the sight picture. No reference pose needed, so ANY gun
                        STL can be dropped into GUNS. And because it measures what the owner's eye
                        measures, "passes" means "he would not send it back", which is the only definition
                        of correct that has ever mattered on this skill.

Each gun is scrambled by a random full 3D rotation (all three axes, uniformly sampled), re-aligned from
that scrambled pose, and every datum re-measured by `pose_report` — which re-derives everything from the
mesh and shares no state with the aligner. That independence is load-bearing: this skill's recurring
failure mode is a verifier that shares the aligner's basis and rubber-stamps a wrong pose.

Run:
    "C:/Program Files/Blender Foundation/Blender 5.1/5.1/python/bin/python.exe" scripts/verify_datums.py
    ... --poses 40 --tol 0.30
"""

import os, sys, math, argparse
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib.util


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ca = _load("cgs_align", os.path.join(HERE, "cgs_align.py"))
vg = _load("verify_real_guns", os.path.join(HERE, "verify_real_guns.py"))

# Any gun STL may be added -- no canonical pose required, unlike verify_real_guns.py.
GUNS = [
    r"C:\Users\rene\Desktop\CAD\GLOCK\GLOCK 19 GEN5\Glock 19 Gen5 GUN.stl",
    r"C:\Users\rene\Desktop\CAD\GLOCK\GLOCK 17 GEN 5\G17 - GEN5 - SOLID GUN.stl",
    r"C:\Users\rene\Desktop\CAD\GLOCK\GLOCK 34\GLOCK 34.stl",
]


def rand_rot(rng):
    """Uniform random rotation (all three axes) via QR of a gaussian matrix, det forced +1."""
    q, r = np.linalg.qr(rng.normal(size=(3, 3)))
    q = q * np.sign(np.diag(r))
    if np.linalg.det(q) < 0:
        q[:, 0] = -q[:, 0]
    return q


def fmt(v, nd=3):
    return "  None" if v is None else ("%+.*f" % (nd, v))


def run(paths, poses, tol, seed=20260805):
    rng = np.random.default_rng(seed)
    overall = True
    for path in paths:
        name = os.path.basename(path)
        if not os.path.exists(path):
            print("SKIP (missing): %s" % path)
            overall = False                       # a SKIP is not a PASS (verify_real_guns lesson, 2026-08-05)
            continue
        P, F = vg.load_stl(path)
        base = ca.pose_report(P, F, tol_deg=tol)
        # A datum the NATIVE mesh does not carry cannot be checked on that gun -- René's repaired G17 solid
        # has no modelled upper/lower parting seam at all. That is a property of the MESH, not a failure of
        # the aligner, so it is excluded from the verdict. It is NEVER silently excluded: it is printed on
        # its own line and the run is labelled PARTIAL, because "0/15 PASS, pitch=NO_DATUM" reads as broken
        # and "15/15 PASS" would hide that an axis went unchecked. Both of those are lies of a different
        # kind. If the native HAS the datum and an aligned pose loses it, that IS a failure.
        absent = [k for k in ("pitch_deg", "roll_deg", "yaw_deg") if base.get(k) is None]
        rows, fails = [], []
        for i in range(poses):
            R0 = rand_rot(rng)
            Pi = P @ R0.T
            c, R, d = ca.compute_alignment(Pi, F)
            Q = (Pi - c) @ R.T
            r = ca.pose_report(Q, F, tol_deg=tol)
            r["pose"] = i
            r["det"] = float(np.linalg.det(R))
            bad = [x for x in r["bad"] if not any(x.startswith(k.replace("_deg", "")) and
                                                  x.endswith("NO_DATUM") for k in absent)]
            if abs(r["det"] - 1.0) > 1e-6:
                bad.append("det=%.6f" % r["det"])
            r["bad"] = bad
            rows.append(r)
            if bad:
                fails.append(r)
        ok = len(rows) - len(fails)
        def col(k):
            v = [abs(x[k]) for x in rows if x.get(k) is not None]
            return max(v) if v else None
        print("%-26s %3d/%3d %-7s worst |pitch|=%s |roll|=%s |yaw|=%s  (tol %.2f)"
              % (name, ok, len(rows), "PARTIAL" if absent else "PASS",
                 fmt(col("pitch_deg")), fmt(col("roll_deg")), fmt(col("yaw_deg")), tol))
        if absent:
            print("      ** NOT CHECKED on this gun: %s -- the native mesh carries no such datum "
                  "(a repaired solid can have no modelled parting seam). Axis unverified here. **"
                  % ", ".join(k.replace("_deg", "") for k in absent))
        ch = rows[0].get("sight_channel", {}) if rows else {}
        print("      native datums: pitch=%s roll=%s yaw=%s   |   sight channel: "
              "notch=%smm post=%smm radius=%smm front_proud=%smm rear_proud=%smm"
              % (fmt(base.get("pitch_deg")), fmt(base.get("roll_deg")), fmt(base.get("yaw_deg")),
                 fmt(ch.get("notch_width_mm"), 2), fmt(ch.get("post_width_mm"), 2),
                 fmt(ch.get("sight_radius_mm"), 1), fmt(ch.get("front_sight_proud_mm"), 2),
                 fmt(ch.get("rear_sight_proud_mm"), 2)))
        for r in fails[:5]:
            print("      pose %-3d %s" % (r["pose"], ",".join(r["bad"])))
        if len(fails) > 5:
            print("      ... %d more failing poses" % (len(fails) - 5))
        if fails:
            overall = False
    return overall


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--poses", type=int, default=20)
    ap.add_argument("--tol", type=float, default=0.30)
    ap.add_argument("--stl", action="append", default=None)
    a = ap.parse_args()
    good = run(a.stl or GUNS, a.poses, a.tol)
    print("\nDATUM SUITE: %s" % ("PASS" if good else "FAIL"))
    sys.exit(0 if good else 1)
