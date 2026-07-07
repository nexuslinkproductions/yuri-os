# Offline unit-test for the cgs-align pure-numpy core. Run with Blender's bundled python (has numpy):
#   "/c/Program Files/Blender Foundation/Blender 5.1/5.1/python/bin/python.exe" verify_align_math.py
# No bpy needed — exercises compute_alignment / apply_alignment / verify_alignment against synthetic
# guns under random rigid transforms, plus degenerate-light and reversibility checks.
import os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
NS = {}
exec(open(os.path.join(HERE, "cgs_align.py")).read(), NS)          # loads the real engine (bpy -> None)
compute_alignment = NS["compute_alignment"]; apply_alignment = NS["apply_alignment"]
verify_alignment = NS["verify_alignment"]; _mass_center_and_cov = NS["_mass_center_and_cov"]
_slide_top_tilt_deg = NS["_slide_top_tilt_deg"]

# ---- consistent-winding axis-aligned box (verts + tris). Winding uniform across boxes -> signed
#      volumes add, so a set of disjoint boxes has the correct combined volume centroid.
def box(x0, x1, y0, y1, z0, z1):
    V = np.array([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
                  [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], dtype=np.float64)
    # uniformly OUTWARD-wound triangles (verified: cross(b-a,c-a) points out on every face) so the
    # divergence-theorem volume centroid is correct and disjoint boxes' volumes add, not cancel.
    F = [(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),
         (3,7,6),(3,6,2),(0,4,7),(0,7,3),(1,2,6),(1,6,5)]
    return V, np.array(F, dtype=np.int64)

def sbox(x0, x1, y0, y1, z0, z1, ny=12, nx=3, nz=3):
    """A SUBDIVIDED axis-aligned box — dense verts along each axis so length/height percentiles behave like
    a real scan (the 8-corner box() clusters all verts at the corners, which throws percentile windows).
    Winding is auto-corrected outward (each tri flipped if its normal points toward the box center) so the
    divergence-theorem volume centroid is correct and disjoint sboxes' volumes add."""
    ctr = np.array([(x0+x1)/2, (y0+y1)/2, (z0+z1)/2], float)
    xs, ys, zs = np.linspace(x0,x1,nx+1), np.linspace(y0,y1,ny+1), np.linspace(z0,z1,nz+1)
    V=[]; F=[]
    def face(pgrid):
        base=len(V); m=len(pgrid)-1; n=len(pgrid[0])-1
        for row in pgrid:
            for p in row: V.append(p)
        for r in range(m):
            for c in range(n):
                a=base+r*(n+1)+c; b=base+r*(n+1)+c+1; cc=base+(r+1)*(n+1)+c+1; d=base+(r+1)*(n+1)+c
                F.append((a,b,cc)); F.append((a,cc,d))
    face([[(x, y, z0) for x in xs] for y in ys])          # z=z0
    face([[(x, y, z1) for x in xs] for y in ys])          # z=z1
    face([[(x, y0, z) for x in xs] for z in zs])          # y=y0
    face([[(x, y1, z) for x in xs] for z in zs])          # y=y1
    face([[(x0, y, z) for y in ys] for z in zs])          # x=x0
    face([[(x1, y, z) for y in ys] for z in zs])          # x=x1
    V=np.array(V,float); F=np.array(F,np.int64)
    a3,b3,c3=V[F[:,0]],V[F[:,1]],V[F[:,2]]
    nrm=np.cross(b3-a3,c3-a3); out=((a3+b3+c3)/3.0)-ctr
    flip=np.einsum('ij,ij->i',nrm,out)<0                  # tri normal points inward -> reverse it
    F[flip]=F[flip][:,::-1]
    return V,F

def merge(parts):
    Vs=[]; Fs=[]; off=0
    for V,F in parts:
        Vs.append(V); Fs.append(F+off); off+=len(V)
    return np.vstack(Vs), np.vstack(Fs)

# Canonical gun: length->Y (muzzle -Y), height->Z (slide top +Z), grip hangs down at rear +Y.
def canonical_gun():
    # dense flat-top slide-dominant pistol: continuous slide-top ridge (clean level check), grip at rear.
    slide = sbox(-6, 6, -130, 15, 20, 42)     # long slide, flat top Z=42 to the muzzle, spans the length
    grip  = sbox(-8, 8,    2, 36, -30, 22)    # tall grip at rear (+Y), hangs to Z=-30
    return merge([slide, grip])

# Canonical gun + an UNDER-BARREL WEAPON-LIGHT (WML) hung below the front dust cover. Regression for
# René's HK SFP9 TLR-8A (2026-07-07): the retired rear-vs-front MEAN-height grip-down test let the light's
# front-low mass flip the gun upside-down. The grip toe (Z=-30) still out-reaches any realistic light, so
# the reach-asymmetry test must keep the grip DOWN. lz0 = how far the light hangs below the bore.
def wml_gun(lz0=-8.0, ly0=-128.0, ly1=-92.0):
    slide = sbox(-6, 6, -130, 15, 20, 42)
    grip  = sbox(-8, 8,    2, 36, -30, 22)
    light = sbox(-5, 5, ly0, ly1, lz0, 18)     # FORWARD (dust-cover rail, ahead of the trigger), below the
    return merge([slide, grip, light])         # bore, never below the grip toe — where a real WML mounts

def mean_metric_would_flip(P):
    """Replicate the RETIRED rear-vs-front MEAN-height grip-down decision in canonical pose (Y=length,
    Z=height). True => the old test would have flipped this (correctly-posed) gun upside-down."""
    y = P[:, 1]; z = P[:, 2]
    rear = y > np.percentile(y, 70); front = y < np.percentile(y, 30)
    return bool(float(z[rear].mean()) > float(z[front].mean()))

def rand_rot(rng):
    A = rng.standard_normal((3,3)); Q,_ = np.linalg.qr(A)
    if np.linalg.det(Q) < 0: Q[:,0] = -Q[:,0]                 # ensure a proper rotation
    return Q

def gun_invariants(Pn):
    """On an aligned cloud (canonical pose): grip DOWN (lowest vert at the rear +Y, below center),
    MUZZLE at -Y (front thin / rear tall), SLIDE LEVEL (top-ridge tilt ~0)."""
    y=Pn[:,1]; z=Pn[:,2]
    low=int(np.argmin(z))
    grip_down = bool(y[low] > 0 and z[low] < z.mean())               # grip toe = lowest, at the rear
    # muzzle at -Y: the TALL end (grip) is the rear. Compare the rear/front THIRDS, not halves — a grip that
    # straddles the MEDIAN Y would put its full height-extent in BOTH halves and defeat a median split.
    yl=np.percentile(y,33); yh=np.percentile(y,67)
    zext_front=np.ptp(z[y<yl]); zext_rear=np.ptp(z[y>yh])
    muzzle_left = bool(zext_rear > zext_front)                        # tall end is the rear -> muzzle -Y
    slide_level = bool(abs(_slide_top_tilt_deg(Pn)) < 3.0)
    return grip_down, muzzle_left, slide_level

def main():
    fails=[]; rng=np.random.default_rng(7)
    P0, F = canonical_gun()

    # -- volume centroid sanity: a single unit-ish box centroid == geometric center
    Vb,Fb = box(2,8, -3,5, 1,7); cen,_,mode,closed = _mass_center_and_cov(Vb,Fb)
    if not (closed and np.allclose(cen, [5,1,4], atol=1e-6)):
        fails.append(f"box volume-centroid wrong: mode={mode} closed={closed} cen={cen}")

    # -- 300 random rigid transforms: engine must recover axis-alignment + gun signs every time
    n=300; bad_order=bad_center=bad_offdiag=bad_det=bad_grip=bad_muzzle=bad_level=0
    for i in range(n):
        R=rand_rot(rng); t=rng.standard_normal(3)*250
        P = P0 @ R.T + t                                       # arbitrary pose
        c, Ralign, diag = compute_alignment(P, F)
        Pn = apply_alignment(P, c, Ralign)
        ver = verify_alignment(Pn, F)
        if abs(diag["det_R"]-1.0) > 1e-4: bad_det+=1
        if not ver["dims_ordered_yzx"]: bad_order+=1
        if ver["center_residual_mm"] > 0.05: bad_center+=1
        if ver["R_offdiag_max"] > 1e-2: bad_offdiag+=1
        grip_down, muzzle_left, slide_level = gun_invariants(Pn)
        if not grip_down: bad_grip+=1
        if not muzzle_left: bad_muzzle+=1
        if not slide_level: bad_level+=1
    for label,cnt in [("det!=+1",bad_det),("dims not Y>=Z>=X",bad_order),("center residual",bad_center),
                      ("R offdiag",bad_offdiag),("grip not down/rear",bad_grip),
                      ("muzzle not -Y",bad_muzzle),("slide not level",bad_level)]:
        if cnt: fails.append(f"[{n} poses] {label}: {cnt} failures")

    # -- WML regression: under-barrel-light guns must still align grip-DOWN under any pose (2026-07-07)
    wml_depths = [-6.0, -10.0, -14.0, -18.0]; nw = 60
    wml_bad_grip = wml_bad_muzzle = wml_bad_level = wml_bad_det = wml_bad_order = 0
    mean_flip_seen = False
    for lz0 in wml_depths:
        Pw0, Fw = wml_gun(lz0=lz0)
        mean_flip_seen = mean_flip_seen or mean_metric_would_flip(Pw0)   # did the retired test misfire here?
        for i in range(nw):
            R = rand_rot(rng); t = rng.standard_normal(3) * 200
            Pw = Pw0 @ R.T + t
            c, Ra, diag = compute_alignment(Pw, Fw)
            Pn = apply_alignment(Pw, c, Ra)
            if abs(diag["det_R"] - 1.0) > 1e-4: wml_bad_det += 1
            if not verify_alignment(Pn, Fw)["dims_ordered_yzx"]: wml_bad_order += 1
            gd, ml, sl = gun_invariants(Pn)
            if not gd: wml_bad_grip += 1
            if not ml: wml_bad_muzzle += 1
            if not sl: wml_bad_level += 1
    ntot = len(wml_depths) * nw
    # HARD-assert the invariants the grip-down fix owns (grip/muzzle + rigid-transform health). Slide-level
    # is REPORTED but not hard-failed for WML: with a light the leveler keys off the light underside (a
    # separate, known concern the skill mitigates with pitch_offset_deg — the real HK SFP9 TLR-8A levels to
    # -0.4deg). This block guards grip-down, not leveling.
    for label, cnt in [("det!=+1", wml_bad_det), ("dims not Y>=Z>=X", wml_bad_order),
                       ("grip not down/rear", wml_bad_grip), ("muzzle not -Y", wml_bad_muzzle)]:
        if cnt: fails.append(f"[WML {ntot} poses] {label}: {cnt} failures")

    # -- reversibility: (P-c)@R.T inverted by @R + c returns the original
    R=rand_rot(rng); t=rng.standard_normal(3)*100; P=P0 @ R.T + t
    c,Ralign,_=compute_alignment(P,F); Pn=apply_alignment(P,c,Ralign)
    Pback = Pn @ Ralign + c
    if not np.allclose(Pback, P, atol=1e-6): fails.append("reversibility (unalign) mismatch")

    # -- 'light' (well-separated cuboid): must not crash, proper rotation, centered, axes ordered
    Vl,Fl = box(-15,15,-10,10,-9,9)
    Rl=rand_rot(rng); Pl = Vl @ Rl.T + rng.standard_normal(3)*50
    cl,Rla,dl=compute_alignment(Pl,Fl); Pln=apply_alignment(Pl,cl,Rla); vl=verify_alignment(Pln,Fl)
    if abs(dl["det_R"]-1.0)>1e-4 or vl["center_residual_mm"]>0.05 or not vl["dims_ordered_yzx"]:
        fails.append(f"light case bad: det={dl['det_R']} centerres={vl['center_residual_mm']} ord={vl['dims_ordered_yzx']}")

    # -- ambiguity flag: a near-square plate (length ~= width) must raise ambiguous_axes
    Va,Fa = box(-20,20,-19,19,-4,4)          # X range 40 ~= Y range 38 -> length/width near-tie
    ca,Ra,da=compute_alignment(Va@rand_rot(rng).T + rng.standard_normal(3)*30, Fa)
    if not da["ambiguous_axes"]:
        fails.append(f"ambiguity not flagged on near-square plate: sep_LH={da['sep_length_height']} sep_HW={da['sep_height_width']}")

    print("=== cgs-align math verification ===")
    print(f"random-pose guns: {n} | det/order/center/offdiag/grip-down/muzzle-left/slide-level failures ="
          f" {bad_det}/{bad_order}/{bad_center}/{bad_offdiag}/{bad_grip}/{bad_muzzle}/{bad_level}")
    print(f"WML under-barrel-light guns: {ntot} poses | det/order/grip-down/muzzle-left/slide-level failures ="
          f" {wml_bad_det}/{wml_bad_order}/{wml_bad_grip}/{wml_bad_muzzle}/{wml_bad_level}"
          f" | retired-mean-test-misfires={mean_flip_seen}")
    print(f"light det_R={dl['det_R']} centered={vl['center_residual_mm']}mm ordered={vl['dims_ordered_yzx']}")
    print(f"near-square plate ambiguous_axes={da['ambiguous_axes']} (expected True)")
    if fails:
        print("FAIL:"); [print("  -", f) for f in fails]; sys.exit(1)
    print("PASS -- axis-recovery, gun signs, right-handedness, centering, reversibility all hold.")

if __name__ == "__main__":
    main()
