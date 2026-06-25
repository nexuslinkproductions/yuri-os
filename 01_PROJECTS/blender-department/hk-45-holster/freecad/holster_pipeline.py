#!/usr/bin/env python3
"""
HK45 Holster Mold pipeline — FreeCAD 1.1 headless (freecadcmd).

Replicates René Spatz's Shapr3D workflow (STEPS.docx) end-to-end in CAD:
  scan STL -> align (mass-center) -> BLOCK OUT (directional silhouette sweep,
  front->back along the Y draw axis) -> grip cut -> split X=0 into L/R clamshell
  halves -> export STEP + STL.

Engine note: a holster mold IS the gun's swept frontal envelope, so the silhouette
is the load-bearing primitive. We compute it directly from the projected mesh
vertices (per-X-column min/max Z = filled frontal silhouette) — no fragile OCC 2D
boolean and no slow mesh->solid step. By construction the prism contains every
retention protrusion (sights, serrations, levers) front-to-back => the GOOD
criterion, with concavities (ejection port, rail slots, trigger guard) filled
smooth, which is exactly what a holster mold wants.

Run:
  /Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd freecad/holster_pipeline.py
"""
import FreeCAD, Part, Mesh, sys, time, os
import numpy as np

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

def log(*a):
    print(*a); sys.stdout.flush()

# ---------------------------------------------------------------- CONFIG
HERE      = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) \
            if "__file__" in globals() else os.getcwd()
SCAN      = os.path.join(HERE, "01 HK_45_TACTICAL - SCAN FULL GUN.stl")
ORACLE_STL= os.path.join(HERE, "03 HK 45 TACTICAL STL.stl")
ORACLE_STP= os.path.join(HERE, "02 HK 45 TACTICAL STEP.step")
OUT       = os.path.join(HERE, "cad")
os.makedirs(os.path.join(OUT, "halves"), exist_ok=True)

CLEARANCE   = 0.0    # mm, silhouette dilation (Kydex clearance). 0 for oracle compare; 2.0 production.
XBIN        = 0.6    # mm, silhouette X-column resolution
SPLIT_X     = 0.0    # split plane (normal = X) -> L/R clamshell halves
TARGET_H    = 82.3   # mm holster height (René oracle 03 STL). None = full envelope (keep grip).
                     # grip cut is a flat plane: keep the top TARGET_H (sights down to trigger-guard belly),
                     # remove the exposed grip/magazine below it. Then re-center on the mold's own mass.
DRAW_AXIS   = 1      # Y is the front->back slide/draw axis

# ---------------------------------------------------------------- 1. LOAD + ALIGN
log(f"== pipeline start pid={os.getpid()} ==")
t0 = time.time()
m = Mesh.Mesh(SCAN)
pts = np.array([(p.x, p.y, p.z) for p in m.Topology[0]], dtype=float)
centroid = pts.mean(axis=0)              # vertex mass-center (René's align.py method)
pts -= centroid                          # fully center on all axes (matches oracle 03 STL)
Xmin,Ymin,Zmin = pts.min(0); Xmax,Ymax,Zmax = pts.max(0)
log(f"[1] scan: {len(pts)} verts  centroid={tuple(round(c,2) for c in centroid)}")
log(f"    aligned bbox  X[{Xmin:.1f},{Xmax:.1f}] Y[{Ymin:.1f},{Ymax:.1f}] Z[{Zmin:.1f},{Zmax:.1f}]  t={time.time()-t0:.0f}s")

# ---------------------------------------------------------------- 2. SILHOUETTE (XZ, project along Y)
X = pts[:,0]; Z = pts[:,2]
xb = np.floor((X - Xmin) / XBIN).astype(int)
nb = xb.max() + 1
zmin_col = np.full(nb,  np.inf); zmax_col = np.full(nb, -np.inf)
np.minimum.at(zmin_col, xb, Z); np.maximum.at(zmax_col, xb, Z)
occ = np.isfinite(zmin_col)
cols = np.where(occ)[0]
xc = Xmin + (cols + 0.5) * XBIN
zlo = zmin_col[cols]; zhi = zmax_col[cols]
# closed polygon: top profile L->R, bottom profile R->L
top = [FreeCAD.Vector(float(x), 0.0, float(z)) for x,z in zip(xc, zhi)]
bot = [FreeCAD.Vector(float(x), 0.0, float(z)) for x,z in zip(xc[::-1], zlo[::-1])]
poly_pts = top + bot + [top[0]]
wire = Part.makePolygon(poly_pts)
face = Part.Face(wire)
if CLEARANCE > 0:
    try:
        face = Part.Face(wire.makeOffset2D(CLEARANCE))
    except Exception as e:
        log("    clearance offset failed, using 0:", e)
log(f"[2] silhouette: {len(cols)} cols, area={face.Area:.0f} mm^2, clearance={CLEARANCE}")

# ---------------------------------------------------------------- 3. SWEEP (extrude full Y)
Ylen = Ymax - Ymin
prism = face.extrude(FreeCAD.Vector(0, Ylen, 0))
prism.translate(FreeCAD.Vector(0, Ymin, 0))
bb = prism.BoundBox
log(f"[3] swept mold: vol={prism.Volume:.0f} closed={prism.isClosed()} "
    f"X[{bb.XMin:.1f},{bb.XMax:.1f}] Y[{bb.YMin:.1f},{bb.YMax:.1f}] Z[{bb.ZMin:.1f},{bb.ZMax:.1f}]")

# ---------------------------------------------------------------- 4. GRIP CUT + RE-CENTER
if TARGET_H is not None:
    bb = prism.BoundBox; mg = 50
    cut_z = bb.ZMax - TARGET_H                 # flat grip cut: keep top TARGET_H
    keep = Part.makeBox(bb.XLength+2*mg, bb.YLength+2*mg, TARGET_H+mg,
                        FreeCAD.Vector(bb.XMin-mg, bb.YMin-mg, cut_z))
    prism = prism.common(keep).removeSplitter()
    if prism.Solids:                            # common() can wrap the result in a Compound
        prism = max(prism.Solids, key=lambda s: s.Volume)
    log(f"[4] grip cut @Z={cut_z:.1f} (keep top {TARGET_H}mm): vol={prism.Volume:.0f} solid={prism.ShapeType}")
else:
    log("[4] grip cut: (skipped, full envelope)")
# re-center mold on its OWN mass center (matches René step-7 'align to center mass X/Y/Z')
mc = prism.CenterOfMass
RECENTER = FreeCAD.Vector(-mc.x, -mc.y, -mc.z)   # remember for verification frame
CUT_Z = (prism.BoundBox.ZMax - TARGET_H) if TARGET_H is not None else -1e9
prism.translate(RECENTER)
bb = prism.BoundBox
log(f"[4] re-centered: X[{bb.XMin:.1f},{bb.XMax:.1f}] Y[{bb.YMin:.1f},{bb.YMax:.1f}] Z[{bb.ZMin:.1f},{bb.ZMax:.1f}]")

# ---------------------------------------------------------------- 5. SPLIT X=0 -> L/R
def split_x(solid, x0, margin=30):
    bb = solid.BoundBox
    boxR = Part.makeBox(bb.XMax-x0+margin, bb.YLength+2*margin, bb.ZLength+2*margin,
                        FreeCAD.Vector(x0, bb.YMin-margin, bb.ZMin-margin))
    boxL = Part.makeBox(x0-bb.XMin+margin, bb.YLength+2*margin, bb.ZLength+2*margin,
                        FreeCAD.Vector(bb.XMin-margin, bb.YMin-margin, bb.ZMin-margin))
    return solid.common(boxR).removeSplitter(), solid.common(boxL).removeSplitter()
log("[5] splitting..."); right, left = split_x(prism, SPLIT_X)
log(f"[5] split X={SPLIT_X}: R vol={right.Volume:.0f} (X>0)  L vol={left.Volume:.0f} (X<0)")

# ---------------------------------------------------------------- 6. EXPORT
def write_stl(shape, path, dev=0.1):
    Mesh.Mesh(shape.tessellate(dev)).write(path)
prism.exportStep(os.path.join(OUT, "hk45_mold_merged.step"))
write_stl(prism, os.path.join(OUT, "hk45_mold_merged.stl"))
right.exportStep(os.path.join(OUT, "halves", "hk45_mold_R.step"))
left.exportStep (os.path.join(OUT, "halves", "hk45_mold_L.step"))
write_stl(right, os.path.join(OUT, "halves", "hk45_mold_R.stl"))
write_stl(left,  os.path.join(OUT, "halves", "hk45_mold_L.stl"))
log("[6] exported merged + L/R (STEP+STL)")

# build a viewing workspace
doc = FreeCAD.newDocument("hk45_result")
if os.path.exists(os.path.join(OUT, "aligned_gun.brep")):
    g = Part.Shape(); g.read(os.path.join(OUT, "aligned_gun.brep"))
    doc.addObject("Part::Feature","OUR_Aligned_Gun").Shape = g
doc.addObject("Part::Feature","Mold_Merged").Shape = prism
doc.addObject("Part::Feature","Mold_R").Shape = right
doc.addObject("Part::Feature","Mold_L").Shape = left
gt = Part.Shape(); gt.read(ORACLE_STP); gt.translate(FreeCAD.Vector(90,0,0))
doc.addObject("Part::Feature","RENE_TARGET").Shape = gt
doc.recompute(); doc.saveAs(os.path.join(HERE, "hk45_result.FCStd"))
log("[6] saved hk45_result.FCStd")

# ---------------------------------------------------------------- 7. VERIFY vs ORACLE
om = Mesh.Mesh(ORACLE_STL); ob = om.BoundBox
log(f"[7] VERIFY vs oracle 03 STL:")
log(f"    oracle  X={ob.XLength:.1f} Y={ob.YLength:.1f} Z={ob.ZLength:.1f}  Z[{ob.ZMin:.1f},{ob.ZMax:.1f}]")
log(f"    ours    X={bb.XLength:.1f} Y={bb.YLength:.1f} Z={bb.ZLength:.1f}  Z[{bb.ZMin:.1f},{bb.ZMax:.1f}]  (vol {prism.Volume:.0f}, oracle STEP vol 607086)")
# GOOD-criterion containment: every gun vertex in the COVERED region (above the grip cut)
# must be inside the mold. Transform gun verts into the mold's frame, drop the cut-off grip.
try:
    covered = pts[pts[:,2] >= CUT_Z]                  # slide+frame down to trigger-guard belly
    covered = covered + np.array([RECENTER.x, RECENTER.y, RECENTER.z])
    samp = covered[::300]
    inside = sum(1 for v in samp if prism.isInside(FreeCAD.Vector(float(v[0]),float(v[1]),float(v[2])), 0.05, True))
    pct = 100.0*inside/len(samp)
    log(f"    containment: {inside}/{len(samp)} covered gun verts inside mold = {pct:.1f}% "
        f"(GOOD criterion: every retention point blocked, want 100%)")
except Exception as e:
    log("    containment check skipped:", e)
log(f"DONE total {time.time()-t0:.0f}s")
