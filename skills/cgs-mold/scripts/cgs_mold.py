# cgs-mold engine — gun scan → holster split-mold (Blender-only, gun-dip method)
#
# SOURCE OF TRUTH for the method + why: ../METHOD-NOTES.md
# Validated live with Marcel on the HK45 scan, 2026-06-29/30.
#
# Pipeline (owner gun-dip method):
#   1. seal scan -> GUN_SOLID (watertight manifold)             [upstream, see METHOD-NOTES]
#   2. dip/sweep gun-solid along +Y -> the mold (swept positive)[upstream, see METHOD-NOTES]
#   3. solidify_mold()  — voxel-fill the mold into ONE solid    [VALIDATED here]
#   4. cut_grip()       — cube BOOLEAN DIFFERENCE, FLOAT solver [VALIDATED here]
#   5. smooth_mold()    — 4-stage feature-preserving retouch    [VALIDATED here]
#   6. remove_overhang()— collapse stray cut-edge flaps         [VALIDATED here]
#   7. offset_mold()    — +0.4mm on the SLIDE region only        [VALIDATED here]
#   8. split_mold()     — clamshell halves on the BORE axis       [VALIDATED here]
#      (alignment pins   — TODO)
#
# THE ROOT-CAUSE LAW (failure-anchored): a swept mold is often a closed shell with
# INTERNAL WALLS (nonmanifold>0 WITH boundary==0). A boolean cannot read inside vs
# outside through internal walls -> it tears/empties. So the mold MUST be voxel-filled
# into one solid (manifold 0/0, single island) BEFORE any boolean cut. Detail softened
# by the fill is recovered by the feature-preserving smooth (stage 5).

import bpy, bmesh, math, json
import numpy as np

# ---------------------------------------------------------------- mesh helpers
def _world_verts(obj):
    me=obj.data; N=len(me.vertices)
    P=np.empty((N,3)); me.vertices.foreach_get("co", P.ravel())
    return P  # object-local coords; callers keep matrix_world == identity (centered molds)

def _manifold(me):
    bm=bmesh.new(); bm.from_mesh(me)
    nm=sum(1 for e in bm.edges if not e.is_manifold)
    bd=sum(1 for e in bm.edges if e.is_boundary)
    bm.free()
    return nm, bd

def _edges(me, N):
    bm=bmesh.new(); bm.from_mesh(me)
    ei=np.fromiter((e.verts[0].index for e in bm.edges), dtype=np.int64, count=len(bm.edges))
    ej=np.fromiter((e.verts[1].index for e in bm.edges), dtype=np.int64, count=len(bm.edges))
    bm.free()
    return ei, ej

def _umbrella(P, ei, ej, N):
    s=np.zeros((N,3)); c=np.zeros(N)
    np.add.at(s, ei, P[ej]); np.add.at(s, ej, P[ei])
    np.add.at(c, ei, 1.0);   np.add.at(c, ej, 1.0)
    c[c==0]=1.0
    return s/c[:,None]-P                       # umbrella Laplacian: mean(neighbors)-pos

def _feature(me, N, angle_deg):
    """Sharp verts + per-vert sharp-edge neighbor list (the crease skeleton)."""
    bm=bmesh.new(); bm.from_mesh(me)
    fa=math.radians(angle_deg); nbr=[[] for _ in range(N)]; sharp=np.zeros(N, bool)
    for e in bm.edges:
        if e.calc_face_angle(0.0) > fa or not e.is_manifold:
            a,b=e.verts[0].index, e.verts[1].index
            nbr[a].append(b); nbr[b].append(a); sharp[a]=True; sharp[b]=True
    bm.free()
    return sharp, nbr

def _dup(src, out_name):
    if out_name in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[out_name], do_unlink=True)
    obj=src.copy(); obj.data=src.data.copy(); obj.name=out_name
    src.users_collection[0].objects.link(obj)
    return obj

def _activate(obj):
    for o in bpy.context.selected_objects: o.select_set(False)
    obj.select_set(True); bpy.context.view_layer.objects.active=obj

def _shade(obj, auto_deg=30.0):
    """Smooth shading + recalc outward, via bmesh (no op-context dependency)."""
    me=obj.data
    bm=bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces: f.smooth=True
    bm.to_mesh(me); bm.free(); me.update()
    _activate(obj)
    try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(auto_deg))
    except Exception: pass   # angle-sharpening is a shading nicety; geometry already carries the edges

# ---------------------------------------------------------------- stage 3: solidify
def solidify_mold(src, out_name="CGS_MOLD_SOLID", voxel=0.7):
    """Voxel-fill the mold shell into ONE filled manifold solid (the cut precondition)."""
    obj=_dup(src, out_name); _activate(obj)
    obj.data.remesh_voxel_size=voxel; obj.data.remesh_voxel_adaptivity=0.0
    bpy.ops.object.voxel_remesh()
    # outward normals (signed volume > 0)
    bm=bmesh.new(); bm.from_mesh(obj.data); vol=bm.calc_volume(signed=True); bm.free()
    if vol < 0:
        _activate(obj); bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.flip_normals()
        bpy.ops.object.mode_set(mode='OBJECT')
    nm,bd=_manifold(obj.data)
    return obj, {"voxel":voxel, "verts":len(obj.data.vertices), "nonmanifold":nm, "boundary":bd}

# ---------------------------------------------------------------- stage 4: grip cut
def _find_cut_points(P, corner_below, bt_below):
    """Trigger-guard/grip corner (knee of bottom-Z profile) + beavertail (rear, mid-height)."""
    X,Y,Z=P[:,0],P[:,1],P[:,2]
    xc=float((X.min()+X.max())/2.0)
    # beavertail = rearmost (max Y) vertex at thumb-rest height
    m=(Z>0)&(Z<35); idx=np.where(m)[0]; bt=idx[np.argmax(Y[idx])]
    bt_y=float(Y[bt]); bt_z=float(Z[bt])
    # corner = knee where the trigger-guard underside plateau ends and the grip plunges.
    # scan the bottom-Z profile front->rear; the knee is the last bin before the steep drop.
    ymax=Y.max(); step=3.0
    bins=np.arange(0.0, ymax+step, step)       # grip region only (Y>=0)
    prof=[]
    for i in range(len(bins)-1):
        sl=(Y>=bins[i])&(Y<bins[i+1])
        if sl.sum(): prof.append(((bins[i]+bins[i+1])/2.0, float(Z[sl].min())))
    corner_y, corner_z = prof[0]
    for k in range(1,len(prof)):
        y,z=prof[k]
        if z < prof[k-1][1]-8.0:               # steep plunge into the grip -> knee was previous bin
            corner_y, corner_z = prof[k-1]; break
        corner_y, corner_z = y, z
    A=np.array([xc, corner_y, corner_z-corner_below])   # first cut point
    B=np.array([xc, bt_y,     bt_z-bt_below])           # second cut point
    return A, B

def cut_grip(src, out_name="CGS_MOLD_CUT", corner_below=20.0, bt_below=10.0,
             solver='FLOAT', cube=(90.,220.,220.)):
    """Diagonal grip cut: cube BOOLEAN DIFFERENCE through (corner-Nmm)->(beavertail-Mmm).
    FLOAT solver on the filled solid (EXACT empties on heavy voxel meshes)."""
    from mathutils import Vector, Euler
    obj=_dup(src, out_name)
    P=_world_verts(src)
    A,B=_find_cut_points(P, corner_below, bt_below)
    A=Vector(A.tolist()); B=Vector(B.tolist()); M=(A+B)/2
    alpha=math.atan2(B.z-A.z, B.y-A.y)                 # tilt about X so top face follows A->B
    u=Vector((0,-math.sin(alpha),math.cos(alpha)))    # top-face normal (away from grip)
    Lx,Ly,Lz=cube; loc=M-(Lz/2.0)*u
    me=bpy.data.meshes.new("GRIP_CUTTER"); bm=bmesh.new(); bmesh.ops.create_cube(bm,size=1.0)
    for v in bm.verts: v.co.x*=Lx; v.co.y*=Ly; v.co.z*=Lz
    bm.to_mesh(me); bm.free()
    cutter=bpy.data.objects.new("GRIP_CUTTER", me); src.users_collection[0].objects.link(cutter)
    cutter.rotation_euler=Euler((alpha,0,0),'XYZ'); cutter.location=loc
    mod=obj.modifiers.new("grip","BOOLEAN"); mod.operation='DIFFERENCE'; mod.object=cutter; mod.solver=solver
    _activate(obj); bpy.ops.object.modifier_apply(modifier="grip")
    bpy.data.objects.remove(cutter, do_unlink=True)
    nm,bd=_manifold(obj.data)
    return obj, {"A":[round(c,1) for c in A], "B":[round(c,1) for c in B],
                 "alpha_deg":round(math.degrees(alpha),1), "verts":len(obj.data.vertices),
                 "nonmanifold":nm, "boundary":bd}

# ---------------------------------------------------------------- stage 5: smooth (4 sub-passes)
def smooth_mold(src, out_name="CGS_MOLD_SMOOTH", feature_angle=50.0,
                flat_pairs=2, crease_pairs=6, deburr_thr=0.05, deburr_rings=3,
                deburr_pairs=8, final_crease_pairs=4, auto_deg=30.0):
    """Feature-preserving retouch of the voxel surface — smooth AND sharp.
    (1) flat Taubin denoise, sharp creases frozen;
    (2) crease-line de-zigzag (1D midpoint along the crease -> straight & still sharp);
    (3) roughness deburr (topology-agnostic: only high-Laplacian voxel steps move);
    (4) thorough deburr (low thr) + crease re-straighten for residual steps.
    Clean edges sit at ~0 Laplacian and stay put; angle preserved."""
    obj=_dup(src, out_name); me=obj.data; N=len(me.vertices)
    P=_world_verts(obj); P0=P.copy()
    ei,ej=_edges(me,N); sharp,nbr=_feature(me,N,feature_angle)
    L=lambda Pp: _umbrella(Pp,ei,ej,N)

    free=~sharp                                                  # (1) flat denoise
    for s in [0.5,-0.53]*flat_pairs: P[free]+=s*L(P)[free]

    crease=np.array([i for i in range(N) if len(nbr[i])==2], dtype=np.int64)  # (2) crease de-zigzag
    if len(crease):
        A=np.array([nbr[i][0] for i in crease]); B=np.array([nbr[i][1] for i in crease])
        for s in [0.5,-0.53]*crease_pairs:
            P[crease]+=s*(((P[A]+P[B])/2.0)-P[crease])

    def deburr(thr, rings, pairs):                              # (3)/(4) roughness deburr
        rough=np.linalg.norm(L(P),axis=1)>thr
        for _ in range(rings):
            nb=np.zeros(N,bool); nb[ei[rough[ej]]]=True; nb[ej[rough[ei]]]=True; rough|=nb
        for s in [0.5,-0.53]*pairs: P[rough]+=s*L(P)[rough]
    deburr(0.08, 2, 4)
    deburr(deburr_thr, deburr_rings, deburr_pairs)
    if len(crease):                                            # re-straighten after deburr
        for s in [0.5,-0.53]*final_crease_pairs:
            P[crease]+=s*(((P[A]+P[B])/2.0)-P[crease])

    me.vertices.foreach_set("co", P.ravel()); me.update()
    _shade(obj, auto_deg)
    nm,bd=_manifold(me)
    disp=np.linalg.norm(P-P0,axis=1)
    return obj, {"sharp_verts":int(sharp.sum()), "crease_verts":int(len(crease)),
                 "max_disp_mm":round(float(disp.max()),3), "nonmanifold":nm, "boundary":bd}

# ---------------------------------------------------------------- stage 6: overhang cleanup
def remove_overhang(obj, box, factor=0.6, iters=25, rings=3):
    """Collapse a stray cut-edge flap/hook flush into the surface.
    box = ((xmin,ymin,zmin),(xmax,ymax,zmax)) world AABB around the artifact.
    Strong local Laplacian: the flat cut verts sit at ~0 Laplacian and hold; the
    protruding flap (high Laplacian) gets pulled flush."""
    me=obj.data; N=len(me.vertices); P=_world_verts(obj); P0=P.copy()
    ei,ej=_edges(me,N)
    (x0,y0,z0),(x1,y1,z1)=box
    mask=((P[:,0]>x0)&(P[:,0]<x1)&(P[:,1]>y0)&(P[:,1]<y1)&(P[:,2]>z0)&(P[:,2]<z1))
    for _ in range(rings):
        nb=np.zeros(N,bool); nb[ei[mask[ej]]]=True; nb[ej[mask[ei]]]=True; mask|=nb
    for _ in range(iters): P[mask]+=factor*_umbrella(P,ei,ej,N)[mask]
    me.vertices.foreach_set("co", P.ravel()); me.update()
    _shade(obj)
    nm,bd=_manifold(me)
    disp=np.linalg.norm(P-P0,axis=1)
    return {"affected":int(mask.sum()), "max_disp_mm":round(float(disp.max()),3),
            "nonmanifold":nm, "boundary":bd}

# ---------------------------------------------------------------- stage 7: regional offset
def offset_mold(obj, z_line=14.0, feather=2.0, offset=0.4):
    """Thicken ONLY the slide+barrel+beavertail (Kydex shrink comp) — owner corrected the
    earlier 'offset everywhere' to this region (2026-06-30). Push verts ABOVE the slide/frame
    parting line outward along their normals by `offset` mm, feathered across `feather` mm at
    the line so there is no hard ridge. The grip/frame/trigger-guard (below z_line) stay put.
    REQUIRES the object in OBJECT mode (edit-mode discards foreach_set). In-place.
    Verify outward: the region bbox max-X and max-Z must GROW by ~offset (else normals inward)."""
    me=obj.data; N=len(me.vertices)
    P=_world_verts(obj); P0=P.copy()
    Nrm=np.empty((N,3)); me.vertices.foreach_get("normal", Nrm.ravel())
    w=np.clip((P[:,2]-(z_line-feather/2.0))/feather, 0.0, 1.0)
    P += (w*offset)[:,None]*Nrm
    me.vertices.foreach_set("co", P.ravel()); me.update()
    _shade(obj)
    nm,bd=_manifold(me)
    return {"region_verts":int((w>0.99).sum()), "offset_mm":offset, "z_line":z_line,
            "feather":feather, "max_disp_mm":round(float(np.linalg.norm(P-P0,axis=1).max()),3),
            "nonmanifold":nm, "boundary":bd}

# ---------------------------------------------------------------- stage 8: clamshell split
def _bore_center_x(P, y_band=3.0, z_min=32.0):
    """Bore axis X via circle-fit (Kasa) of the muzzle crown in the X-Z plane.
    THE SPLIT GOES THROUGH THE BARREL BORE AXIS, *not* the mold symmetry plane / centroid —
    one-sided controls (slide stop, etc.) pull the symmetry plane off the bore. Owner correction
    2026-06-30: 'center of the barrel, not the exact center point of the entire mold'."""
    X,Y,Z=P[:,0],P[:,1],P[:,2]; ymin=Y.min()
    m=(Y<ymin+y_band)&(Z>z_min); u=X[m]; v=Z[m]
    A=np.vstack([2*u,2*v,np.ones(len(u))]).T
    sol,_,_,_=np.linalg.lstsq(A, u*u+v*v, rcond=None)
    return float(sol[0])

def split_mold(obj, plane_x=None, name_l="CGS_HALF_L", name_r="CGS_HALF_R"):
    """Split into two CAPPED, closed, manifold clamshell halves along a VERTICAL plane through
    the barrel bore axis (or an explicit `plane_x`). bisect + holes_fill = ZERO material loss —
    each half is capped flat on the seam and together they reconstitute the whole mold (NOT a
    saw kerf that removes material — owner correction 2026-06-30). Verify: vol(L)+vol(R) ~=
    vol(full), both boundary==0."""
    from mathutils import Vector
    coll=obj.users_collection[0]
    cx = _bore_center_x(_world_verts(obj)) if plane_x is None else plane_x
    for nm in (name_l, name_r):
        if nm in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[nm], do_unlink=True)
    def half(name, clear_outer):
        o=obj.copy(); o.data=obj.data.copy(); o.name=name; coll.objects.link(o)
        bm=bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:]+bm.edges[:]+bm.faces[:],
            plane_co=Vector((cx,0,0)), plane_no=Vector((1,0,0)),
            clear_inner=not clear_outer, clear_outer=clear_outer)
        oe=[e for e in bm.edges if e.is_boundary]
        if oe: bmesh.ops.holes_fill(bm, edges=oe)      # flat cap on the seam plane
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in bm.faces: f.smooth=True
        nm_=sum(1 for e in bm.edges if not e.is_manifold); bd=sum(1 for e in bm.edges if e.is_boundary)
        bm.to_mesh(o.data); bm.free(); o.data.update()
        v=bmesh.new(); v.from_mesh(o.data); vol=abs(v.calc_volume(signed=True)); v.free()
        return o,{"vol":round(vol,1),"nonmanifold":nm_,"boundary":bd}
    L,sl=half(name_l, True); R,sr=half(name_r, False)
    return {"plane_x":round(cx,3), "L":sl, "R":sr}

# ---------------------------------------------------------------- orchestrator
def build_mold(mold_shell_name, params, out_name=None):
    """Run the VALIDATED core (solidify -> cut -> smooth) on a swept-mold shell object.
    Upstream (seal+dip) and downstream (offset+split) are separate stages — see METHOD-NOTES.
    Writes /tmp/cgs_mold_summary.json. Non-destructive: never edits the input object."""
    src=bpy.data.objects[mold_shell_name]
    sol,s1=solidify_mold(src, voxel=params.get("solidify",{}).get("voxel_size",0.7))
    gc=params.get("grip_cut",{})
    cut,s2=cut_grip(sol, corner_below=gc.get("corner_below_mm",20.0),
                    bt_below=gc.get("beavertail_below_mm",10.0), solver=gc.get("solver","FLOAT"))
    smo,s3=smooth_mold(cut, out_name=out_name or params.get("out_name","CGS_MOLD_CUT"))
    summary={"solidify":s1, "grip_cut":s2, "smooth":s3, "result":smo.name}
    json.dump(summary, open("/tmp/cgs_mold_summary.json","w"), indent=2)
    print("CGS_MOLD_SUMMARY", json.dumps(summary))
    return smo
