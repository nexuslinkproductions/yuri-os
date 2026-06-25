#!/usr/bin/env python3
"""
HK45 Holster Mold pipeline — FreeCAD 1.1 headless (freecadcmd).

DIRECTIONAL method (v4) — replicates René Spatz's Shapr3D blocking (STEPS.docx),
reverse-engineered from his 10-solid `02 STEP` oracle:

  mold = gun body + per-feature clearance channels swept toward the draw EXIT (+Y rear).

Mechanism: a *prefix-union sweep*. The gun draws OUT toward +Y (grip/rear). For every
plane Y, the cavity must clear every feature that passes through Y on the way out — i.e.
the union of gun cross-sections from the muzzle up to Y. Computed per X-column as a
running max(top)/min(bottom) of Z, carried forward from muzzle to rear. This reproduces
René's pattern automatically: the front sight (forward) gets a long top channel; rear
controls (slide-stop/mag) get short feature→rear channels. No featureless over-block
(that was the v1 prism mistake — it flattened everything to the max envelope).

Built as a heightfield (per-cell top & bottom Z surface) so the grip cut is a bottom
clamp and the X-split is a cell partition — no slow/fragile OCC booleans for the body.

Run: /Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd freecad/holster_pipeline.py
"""
import FreeCAD, Part, Mesh, sys, os, time
import numpy as np
try:
    sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
except Exception: pass
def log(*a): print(*a); sys.stdout.flush()

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if "__file__" in globals() else os.getcwd()
SCAN = os.path.join(HERE, "01 HK_45_TACTICAL - SCAN FULL GUN.stl")
ORACLE_STL = os.path.join(HERE, "03 HK 45 TACTICAL STL.stl")
OUT = os.path.join(HERE, "cad", "v4"); os.makedirs(OUT, exist_ok=True)

# ---- config ----
XBIN, YBIN = 1.0, 1.5     # mm grid (X cols / Y rows)
TARGET_H   = 82.3         # holster height: keep top TARGET_H, grip-cut below (René oracle)
CLEARANCE  = 0.0          # mm uniform dilation of top/sides (Kydex); 0 matches oracle
SPLIT_X    = 0.0          # clamshell seam plane (normal X)
# draw exit = +Y (rear/grip); prefix-union accumulates muzzle(Ymin) -> exit(Ymax)

# ---- 1. load + align ----
t0 = time.time()
m = Mesh.Mesh(SCAN)
pts = np.array([(p.x, p.y, p.z) for p in m.Topology[0]], float)
pts -= pts.mean(0)
Xv, Yv, Zv = pts[:,0], pts[:,1], pts[:,2]
log(f"[1] {len(pts)} verts  bbox X[{Xv.min():.1f},{Xv.max():.1f}] Y[{Yv.min():.1f},{Yv.max():.1f}] Z[{Zv.min():.1f},{Zv.max():.1f}]")

# ---- 2. grid: per-cell gun zhi/zlo ----
x0, y0 = Xv.min(), Yv.min()
nx = int(np.ceil((Xv.max()-x0)/XBIN))+1
ny = int(np.ceil((Yv.max()-y0)/YBIN))+1
xi = np.clip(((Xv-x0)/XBIN).astype(int), 0, nx-1)
yi = np.clip(((Yv-y0)/YBIN).astype(int), 0, ny-1)
cell = xi*ny + yi
gtop = np.full(nx*ny, -np.inf); gbot = np.full(nx*ny, np.inf)
np.maximum.at(gtop, cell, Zv); np.minimum.at(gbot, cell, Zv)
gtop = gtop.reshape(nx,ny); gbot = gbot.reshape(nx,ny)
has = np.isfinite(gtop)

# ---- 3. prefix-union sweep toward +Y exit (per X-column, carry forward) ----
top = np.full((nx,ny), np.nan); bot = np.full((nx,ny), np.nan); active = np.zeros((nx,ny), bool)
for i in range(nx):
    ct, cb, seen = -np.inf, np.inf, False
    for j in range(ny):                      # j=0 muzzle -> j=ny-1 rear/exit
        if has[i,j]:
            ct = max(ct, gtop[i,j]); cb = min(cb, gbot[i,j]); seen = True
        if seen:
            active[i,j]=True; top[i,j]=ct+CLEARANCE; bot[i,j]=cb
log(f"[3] prefix-union: {active.sum()} active cells  t={time.time()-t0:.0f}s")

# ---- 4. grip cut: keep top TARGET_H, clamp bottom flat ----
gmax = np.nanmax(top); floor = gmax - TARGET_H
for i in range(nx):
    for j in range(ny):
        if active[i,j]:
            if top[i,j] <= floor: active[i,j]=False
            else: bot[i,j] = max(bot[i,j], floor)
log(f"[4] grip cut floor Z={floor:.1f} (gmax {gmax:.1f}); {active.sum()} cells")

# ---- 5. build watertight voxel-surface mesh from heightfield ----
xc = x0 + (np.arange(nx)+0.5)*XBIN
yc = y0 + (np.arange(ny)+0.5)*YBIN
def quad(p1,p2,p3,p4): return [[p1,p2,p3],[p1,p3,p4]]
def build(mask):
    tris=[]
    for i in range(nx):
        xa,xb = xc[i]-XBIN/2, xc[i]+XBIN/2
        for j in range(ny):
            if not mask[i,j]: continue
            ya,yb = yc[j]-YBIN/2, yc[j]+YBIN/2
            T,B = top[i,j], bot[i,j]
            tris += quad((xa,ya,T),(xb,ya,T),(xb,yb,T),(xa,yb,T))      # top
            tris += quad((xa,ya,B),(xa,yb,B),(xb,yb,B),(xb,ya,B))      # bottom (rev)
            # 4 side neighbours: wall the exposed band
            for (di,dj,e0,e1) in [(-1,0,(xa,ya),(xa,yb)),(1,0,(xb,yb),(xb,ya)),
                                  (0,-1,(xb,ya),(xa,ya)),(0,1,(xa,yb),(xb,yb))]:
                ni,nj = i+di, j+dj
                nact = 0<=ni<nx and 0<=nj<ny and mask[ni,nj]
                nT = top[ni,nj] if nact else None; nB = bot[ni,nj] if nact else None
                lo = B if (nB is None) else max(B, min(nB,T))
                hi = T if (nT is None) else max(B, max(nT,B))
                # full wall if neighbour inactive; else only the step(s) outside neighbour band
                if not nact:
                    a,b=e0,e1
                    tris += quad((a[0],a[1],B),(b[0],b[1],B),(b[0],b[1],T),(a[0],a[1],T))
                else:
                    a,b=e0,e1
                    if T>nT:  # top step
                        tris += quad((a[0],a[1],nT),(b[0],b[1],nT),(b[0],b[1],T),(a[0],a[1],T))
                    if B<nB:  # bottom step
                        tris += quad((a[0],a[1],B),(b[0],b[1],B),(b[0],b[1],nB),(a[0],a[1],nB))
    return tris
maskL = active & (xc[:,None] <  SPLIT_X)
maskR = active & (xc[:,None] >= SPLIT_X)
mL, mR, mM = Mesh.Mesh(build(maskL)), Mesh.Mesh(build(maskR)), Mesh.Mesh(build(active))
# recenter Y & Z on merged bbox center to match oracle frame
bb = mM.BoundBox; sy, sz = -(bb.YMin+bb.YMax)/2, -(bb.ZMin+bb.ZMax)/2
for mm in (mL,mR,mM): mm.translate(0.0, sy, sz)
log(f"[5] mesh built L={mL.CountFacets} R={mR.CountFacets} merged={mM.CountFacets} t={time.time()-t0:.0f}s")

# ---- 6. export STL + STEP ----
mM.write(os.path.join(OUT,"hk45_mold_merged.stl"))
mL.write(os.path.join(OUT,"hk45_mold_L.stl")); mR.write(os.path.join(OUT,"hk45_mold_R.stl"))
def to_step(mesh, path):
    mesh.harmonizeNormals()
    s=Part.Shape(); s.makeShapeFromMesh(mesh.Topology,0.1); s.sewShape()
    try:
        sol=Part.makeSolid(s)
        if sol.Volume<0: sol.reverse()
        sol.exportStep(path); return sol.Volume
    except Exception: s.exportStep(path); return -1
vM = to_step(mM, os.path.join(OUT,"hk45_mold_merged.step"))
to_step(mL, os.path.join(OUT,"hk45_mold_L.step")); to_step(mR, os.path.join(OUT,"hk45_mold_R.step"))
bb=mM.BoundBox
log(f"[6] exported cad/v4/  merged vol~{vM:.0f}  bbox X={bb.XLength:.1f} Y={bb.YLength:.1f} Z={bb.ZLength:.1f}")

# ---- 7. verify cross-sections vs oracle ----
ours = np.array([(p.x,p.y,p.z) for p in mM.Topology[0]], float)
orc  = np.array([(p.x,p.y,p.z) for p in Mesh.Mesh(ORACLE_STL).Topology[0]], float)
for v in (ours,orc): v[:,1]-=(v[:,1].min()+v[:,1].max())/2; v[:,2]-=(v[:,2].min()+v[:,2].max())/2
def sec(v,y):
    s=v[np.abs(v[:,1]-y)<1.5]
    return (0,0,0,0) if len(s)<3 else (s[:,0].max()-s[:,0].min(),s[:,2].max()-s[:,2].min(),s[:,2].min(),s[:,2].max())
log("[7] Y   |  v4 X/Z [zmin,zmax]        |  ORACLE X/Z [zmin,zmax]")
for y in [-70,-45,-20,0,20,45,70]:
    o=sec(ours,y); r=sec(orc,y)
    log(f"      {y:4d} | X{o[0]:5.1f} Z{o[1]:5.1f} [{o[2]:6.1f},{o[3]:5.1f}] | X{r[0]:5.1f} Z{r[1]:5.1f} [{r[2]:6.1f},{r[3]:5.1f}]")
log(f"DONE {time.time()-t0:.0f}s")
