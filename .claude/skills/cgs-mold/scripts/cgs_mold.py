# cgs-mold engine — gun scan → holster split-mold (Blender-only, gun-dip method)
#
# SOURCE OF TRUTH for the method + why: ../METHOD-NOTES.md
# Validated live with Marcel on the HK45 scan, 2026-06-29/30.
#
# Pipeline (owner gun-dip method):
#   1. seal scan -> GUN_SOLID (watertight manifold)             [upstream, see METHOD-NOTES]
#   2. sweep_dip()      — FULL-LENGTH dip, log-doubling voxel-union [VALIDATED here 2026-07-02]
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

# ---------------------------------------------------------------- stage 1: assemble + seal GUN_SOLID
def _island_ids(ei, ej, N):
    """Connected-component id per vertex (numpy union-find over the edge list)."""
    parent=list(range(N))
    def find(a):
        r=a
        while parent[r]!=r: r=parent[r]
        while parent[a]!=r: parent[a],a=r,parent[a]   # path-compress
        return r
    for a,b in zip(ei.tolist(), ej.tolist()):
        ra,rb=find(int(a)),find(int(b))
        if ra!=rb: parent[ra]=rb
    return np.array([find(i) for i in range(N)], dtype=np.int64)

def assemble_gun_solid(scan_names, out_name="GUN_SOLID", speck_frac=0.02, center=True):
    """Build GUN_SOLID from the FULL scan: UNION every substantial island (gun body + light/laser +
    rail attachment) into ONE sealed solid, dropping ONLY true near-zero specks (bbox-diagonal <
    speck_frac x the biggest island). This REPLACES the HK45-era 'keep the largest connected island'.

    ★ WHY (failure anchor, René 2026-07-03): 'keep largest' drops a separate light/attachment island,
    so on a SHORT GUN with a BIG FORWARD LIGHT the light bezel — the furthest-forward feature — never
    enters GUN_SOLID. sweep_dip then measures travel on the gun body alone and the dip stops at the
    MUZZLE, not the light: 'the sweep is not going along the entire gun'. Universal fix: keep every
    real island so the furthest -Y feature (muzzle OR light bezel, whichever protrudes) survives, and
    sweep_dip's travel/front reference reaches it automatically. The G17 session did this by hand
    ('joined + kept both islands'); this codifies it so it is not a per-gun manual decision.

    scan_names: one object name or a list (gun + separate light objects). Non-destructive — copies the
    sources, never mutates the scan. Seal = weld doubles -> fill holes -> outward normals -> center.
    VALIDATED live 2026-07-03 on Glock 43X + TLR-7 HL-X SUB (2 islands, light longer than the gun):
    islands_total=2 -> islands_kept=2, front_feature_z=-4.7 (light drives the front), sweep front_y
    stayed -74.1 through the full 175.8mm dip. Confirms the fix on the exact short-gun/big-light case."""
    if isinstance(scan_names, str): scan_names=[scan_names]
    srcs=[bpy.data.objects[n] for n in scan_names]
    coll=srcs[0].users_collection[0]
    if out_name in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[out_name], do_unlink=True)
    bm=bmesh.new()
    for s in srcs:                                   # merge all source geometry in WORLD space
        me=s.data.copy(); me.transform(s.matrix_world)
        bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table()
    bm.verts.index_update()                          # .index must be current before we read it below
    N=len(bm.verts)
    P=np.array([[v.co.x,v.co.y,v.co.z] for v in bm.verts]) if N else np.zeros((0,3))
    ei=np.fromiter((e.verts[0].index for e in bm.edges), dtype=np.int64, count=len(bm.edges))
    ej=np.fromiter((e.verts[1].index for e in bm.edges), dtype=np.int64, count=len(bm.edges))
    roots=_island_ids(ei, ej, N)
    diag={}
    for r in np.unique(roots):
        C=P[roots==r]
        diag[int(r)]=float(np.linalg.norm(C.max(0)-C.min(0))) if len(C)>1 else 0.0
    dmax=max(diag.values()) if diag else 0.0
    keep=np.array([diag[int(r)]>=speck_frac*dmax and diag[int(r)]>0 for r in roots])
    dropped=[bm.verts[i] for i in np.where(~keep)[0]]
    if dropped: bmesh.ops.delete(bm, geom=dropped, context='VERTS')
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)                 # seal
    bd_edges=[e for e in bm.edges if e.is_boundary]
    if bd_edges: bmesh.ops.holes_fill(bm, edges=bd_edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me=bpy.data.meshes.new(out_name); bm.to_mesh(me); bm.free()
    obj=bpy.data.objects.new(out_name, me); coll.objects.link(obj); obj.matrix_world.identity()
    if center:
        Q=_world_verts(obj); Q-=Q.mean(0); me.vertices.foreach_set("co", Q.ravel()); me.update()
    Q=_world_verts(obj); fi=int(np.argmin(Q[:,1])) if len(Q) else 0
    nm,bd=_manifold(me)
    n_islands=len(diag); n_kept=int(sum(1 for r in diag if diag[r]>=speck_frac*dmax and diag[r]>0))
    return obj, {"islands_total":n_islands, "islands_kept":n_kept, "specks_dropped":n_islands-n_kept,
                 "front_y":round(float(Q[:,1].min()),2) if len(Q) else 0.0,
                 "front_feature_z":round(float(Q[fi,2]),1) if len(Q) else 0.0,   # low z => a light drives the front
                 "rear_y":round(float(Q[:,1].max()),2) if len(Q) else 0.0,
                 "y_length":round(float(Q[:,1].max()-Q[:,1].min()),2) if len(Q) else 0.0,
                 "verts":len(me.vertices), "nonmanifold":nm, "boundary":bd}

# ---------------------------------------------------------------- stage 2: the dip / draw sweep
def sweep_dip(gun_solid, out_name="CGS_MOLD_SOLID", voxel=0.7, boot=2.0, travel=None):
    """FULL-LENGTH translational 'dip' of the sealed GUN_SOLID along +Y, as ONE clean filled
    manifold solid. THE VALIDATED SWEEP (owner-confirmed 2026-07-02, SIG 1911 + TLR-1 HL-X).

    METHOD = log-doubling voxel-UNION: union the working solid with a +Y-shifted copy and
    voxel-fill to the OUTER ENVELOPE each pass, doubling the shift (boot -> 2x -> ... -> travel).
    Envelope-fill EVERY pass is the whole trick — it never tears and never steps, unlike the two
    REJECTED methods (see METHOD-NOTES failure anchor):
      - array-of-copies + one final voxel-fill  -> visible STEPS when step > voxel (2026-07-01 G17,
        2026-07-02 SIG 1911 attempt-1);
      - front/back-face split + silhouette bridge -> COMBS fine features (slide serrations, light
        grooves) because it tears co-located front/back faces apart (2026-07-02 SIG 1911 attempt-2).
    A whole-solid union never tears (both operands are complete solids); each shift <= current swept
    length keeps the cross-section windows continuous -> no steps. `travel` defaults to the FULL gun
    Y-length: OWNER REQUIREMENT — the dip runs muzzle ALL THE WAY TO THE END, filling every -Y-facing
    undercut; the excess tail past the real grip is trimmed later by cut B (vertical). This one call
    replaces BOTH the old 'sweep' and the initial `solidify_mold` (its last pass is already a fill).
    PRECONDITION (René 2026-07-03): `gun_solid` MUST be the FULL scan assembly — build it with
    `assemble_gun_solid` so EVERY island (gun + light + rail) is present. `travel` defaults to that
    assembly's own Y-span, so the dip automatically reaches the furthest-forward feature — muzzle OR
    light bezel, whichever protrudes. If GUN_SOLID is only the gun body (a dropped light island), the
    dip stops at the muzzle and 'does not go along the entire gun'. `front_feature_z` in the return
    reports the Z at the front-most vert (a low value => a forward light is correctly driving the front).
    Non-destructive: reads gun_solid, builds a NEW object; identity matrix_world (centered mold)."""
    gV=np.empty((len(gun_solid.data.vertices),3)); gun_solid.data.vertices.foreach_get("co",gV.ravel()); gV=gV.reshape(-1,3)
    T = float(gV[:,1].max()-gV[:,1].min()) if travel is None else float(travel)
    coll=gun_solid.users_collection[0]
    if out_name in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[out_name], do_unlink=True)
    obj=gun_solid.copy(); obj.data=gun_solid.data.copy(); obj.name=out_name; coll.objects.link(obj)
    obj.matrix_world.identity(); _activate(obj)
    if bpy.context.object and bpy.context.object.mode!='OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
    def _vox(o):
        _activate(o); o.data.remesh_voxel_size=voxel; o.data.remesh_voxel_adaptivity=0.0
        bpy.ops.object.voxel_remesh()
    _vox(obj)                                            # clean fill of the base gun
    L=0.0; step=boot; passes=[]
    while L < T-1e-6:
        s = step if L==0.0 else L                        # doubling: shift by current swept length
        s = min(s, T-L)
        cp=obj.copy(); cp.data=obj.data.copy(); coll.objects.link(cp)
        cp.matrix_world=obj.matrix_world.copy(); cp.location.y+=s
        for x in bpy.context.selected_objects: x.select_set(False)
        cp.select_set(True); obj.select_set(True); bpy.context.view_layer.objects.active=obj
        bpy.ops.object.join(); _vox(obj); L+=s; passes.append(round(L,1))
    bm=bmesh.new(); bm.from_mesh(obj.data); vol=bm.calc_volume(signed=True); bm.free()  # outward normals
    if vol<0:
        _activate(obj); bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.flip_normals(); bpy.ops.object.mode_set(mode='OBJECT')
    nm,bd=_manifold(obj.data)
    fV=np.empty((len(obj.data.vertices),3)); obj.data.vertices.foreach_get("co",fV.ravel()); fV=fV.reshape(-1,3)
    fi=int(np.argmin(fV[:,1]))                          # front-most vert (draw axis)
    obj["gun_front_y"]=float(gV[:,1].min()); obj["gun_rear_y"]=float(gV[:,1].max())  # REAL gun extent (excl. dip tail) -> downstream cut/offset restrict to it so the tail is never mistaken for the grip/beavertail
    return obj, {"travel":round(T,1), "voxel":voxel, "passes":passes, "gun_rear_y":round(float(gV[:,1].max()),1),
                 "front_y":round(float(fV[:,1].min()),2), "front_feature_z":round(float(fV[fi,2]),1),
                 "verts":len(obj.data.vertices), "nonmanifold":nm, "boundary":bd}

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
def _find_cut_points(P, corner_below, bt_below, gun_rear=None, bt_band=(0.45,0.90)):
    """Trigger-guard/grip corner (scan-relative knee of the bottom-Z profile) + beavertail (rearmost
    upper-grip vert). SCAN-RELATIVE (2026-07-03) — no HK45 absolute Z bands:
      - restrict to the ORIGINAL gun region (Y <= gun_rear) so the dip's rear TAIL is never mistaken
        for the grip/beavertail (the old `(Z>0)&(Z<35)` + rearmost grabbed the +Y tail end);
      - beavertail = rearmost vert in the upper-grip Z band (bt_band as fractions of the gun-region
        height, below the slide top) — auto-scales to any frame;
      - knee threshold is a FRACTION of the plateau->grip depth (not an absolute 8mm/bin), so it works
        on both a sharp (HK45/43X) and a smooth (G17) trigger-guard/grip transition.
    gun_rear defaults to Y.max(); pass the real gun rear on a full-dip mold (sweep_dip tags it as
    obj['gun_rear_y']). Cut points are auto-seeded then tuned visually per scan (owner's eye)."""
    X,Y,Z=P[:,0],P[:,1],P[:,2]
    xc=float((X.min()+X.max())/2.0)
    gr=float(Y.max()) if gun_rear is None else float(gun_rear)
    reg=Y<=gr+1e-6; Xr,Yr,Zr=X[reg],Y[reg],Z[reg]
    zmin,zmax=float(Zr.min()),float(Zr.max()); H=max(zmax-zmin,1e-6)
    # beavertail = rearmost vert in the upper-grip band (below slide top), gun region only
    lo,hi=zmin+bt_band[0]*H, zmin+bt_band[1]*H
    band=(Zr>lo)&(Zr<hi); bi=np.where(band)[0]
    if len(bi)==0: bi=np.arange(len(Yr))                     # degenerate guard
    bt=bi[np.argmax(Yr[bi])]; bt_y=float(Yr[bt]); bt_z=float(Zr[bt])
    # corner = knee where the trigger-guard underside plateau ends and the grip plunges.
    step=3.0; ys=np.arange(0.0, gr+step, step)               # grip-transition region (Y>=0), gun only
    prof=[]
    for i in range(len(ys)-1):
        sl=(Yr>=ys[i])&(Yr<ys[i+1])
        if sl.sum(): prof.append(((ys[i]+ys[i+1])/2.0, float(Zr[sl].min())))
    if not prof: prof=[(0.0,zmin)]
    plateau=float(np.median([z for _,z in prof[:max(1,len(prof)//3)]]))  # front-third plateau level
    gripz=min(z for _,z in prof)
    thr=plateau-0.15*(plateau-gripz)                         # scan-relative: knee starts at 15% of plateau->grip depth
    corner_y,corner_z=prof[0]
    for y,z in prof:
        if z<thr: break                                     # first bin past the plateau -> knee is the previous bin
        corner_y,corner_z=y,z
    A=np.array([xc, corner_y, corner_z-corner_below])       # first cut point
    B=np.array([xc, bt_y,     bt_z-bt_below])               # second cut point
    return A, B

def cut_grip(src, out_name="CGS_MOLD_CUT", corner_below=20.0, bt_below=10.0,
             solver='FLOAT', cube=None, gun_rear=None):
    """Cut A — diagonal grip cut: cube BOOLEAN DIFFERENCE through (corner-Nmm)->(beavertail-Mmm).
    FLOAT solver on the filled solid (EXACT empties on heavy voxel meshes). SCAN-RELATIVE (2026-07-03):
    cut points auto-restricted to the real gun region (gun_rear from obj['gun_rear_y'] so the dip tail
    is excluded), cube auto-sized from the mold bbox — no HK45 magic numbers. Owner's eye still tunes
    `corner_below`/`bt_below` per scan (render-verify)."""
    from mathutils import Vector, Euler
    obj=_dup(src, out_name)
    P=_world_verts(src)
    gr = (src.get("gun_rear_y") if gun_rear is None else gun_rear)
    A,B=_find_cut_points(P, corner_below, bt_below, gun_rear=gr)
    A=Vector(A.tolist()); B=Vector(B.tolist()); M=(A+B)/2
    alpha=math.atan2(B.z-A.z, B.y-A.y)                 # tilt about X so top face follows A->B
    u=Vector((0,-math.sin(alpha),math.cos(alpha)))    # top-face normal (away from grip)
    if cube is None:
        ext=P.max(0)-P.min(0)                          # engulf the grip: generous multiples of the mold bbox
        cube=(float(ext[0]*3+40), float(ext[1]*1.5+80), float(ext[2]*1.6+40))
    Lx,Ly,Lz=cube; loc=M-(Lz/2.0)*u
    me=bpy.data.meshes.new("GRIP_CUTTER"); bm=bmesh.new(); bmesh.ops.create_cube(bm,size=1.0)
    for v in bm.verts: v.co.x*=Lx; v.co.y*=Ly; v.co.z*=Lz
    bm.to_mesh(me); bm.free()
    cutter=bpy.data.objects.new("GRIP_CUTTER", me); src.users_collection[0].objects.link(cutter)
    cutter.rotation_euler=Euler((alpha,0,0),'XYZ'); cutter.location=loc
    mod=obj.modifiers.new("grip","BOOLEAN"); mod.operation='DIFFERENCE'; mod.object=cutter; mod.solver=solver
    _activate(obj); bpy.ops.object.modifier_apply(modifier="grip")
    bpy.data.objects.remove(cutter, do_unlink=True)
    if src.get("gun_rear_y") is not None:              # propagate the gun-extent tag through the cut
        obj["gun_front_y"]=src.get("gun_front_y", float(P[:,1].min())); obj["gun_rear_y"]=src["gun_rear_y"]
    nm,bd=_manifold(obj.data)
    return obj, {"A":[round(c,1) for c in A], "B":[round(c,1) for c in B],
                 "alpha_deg":round(math.degrees(alpha),1), "cube":[round(c,1) for c in cube],
                 "verts":len(obj.data.vertices), "nonmanifold":nm, "boundary":bd}

def cut_tail(src, out_name="CGS_MOLD_CUT2", gun_rear=None, margin=6.0, solver='FLOAT'):
    """Cut B — vertical flat cut perpendicular to the draw axis (constant Y) that removes ONLY the
    dip's artificial excess tail past the REAL beavertail (Y = gun_rear + margin). Never shortens the
    real beavertail (owner: 'beavertail must not be cut off'). A full-length dip drags a slide-height
    tail past the grip that a single diagonal (cut A) cannot clear; this flat cut removes it regardless
    of height. SCAN-RELATIVE (2026-07-03): gun_rear from obj['gun_rear_y']; cutter auto-sized from bbox.
    Skips (returns src copy unchanged) if there is no excess tail past gun_rear+margin."""
    from mathutils import Vector
    obj=_dup(src, out_name)
    P=_world_verts(src)
    gr=(src.get("gun_rear_y") if gun_rear is None else gun_rear)
    if gr is None: gr=float(P[:,1].max())
    yc=float(gr)+margin
    if float(P[:,1].max())<=yc:                        # no excess tail -> nothing to trim
        if src.get("gun_rear_y") is not None:
            obj["gun_front_y"]=src.get("gun_front_y",float(P[:,1].min())); obj["gun_rear_y"]=gr
        nm,bd=_manifold(obj.data)
        return obj, {"cut_y":round(yc,1), "trimmed":False, "verts":len(obj.data.vertices),
                     "nonmanifold":nm, "boundary":bd}
    ext=P.max(0)-P.min(0)
    Lx,Lz=float(ext[0]*3+40), float(ext[2]*3+40)
    Ly=float((P[:,1].max()-yc)+80)                     # spans from the cut plane out past the tail end
    me=bpy.data.meshes.new("TAIL_CUTTER"); bm=bmesh.new(); bmesh.ops.create_cube(bm,size=1.0)
    for v in bm.verts: v.co.x*=Lx; v.co.y*=Ly; v.co.z*=Lz
    bm.to_mesh(me); bm.free()
    cutter=bpy.data.objects.new("TAIL_CUTTER", me); src.users_collection[0].objects.link(cutter)
    cutter.location=Vector((float((P[:,0].min()+P[:,0].max())/2), yc+Ly/2.0,
                            float((P[:,2].min()+P[:,2].max())/2)))   # -Y face sits on the cut plane
    mod=obj.modifiers.new("tail","BOOLEAN"); mod.operation='DIFFERENCE'; mod.object=cutter; mod.solver=solver
    _activate(obj); bpy.ops.object.modifier_apply(modifier="tail")
    bpy.data.objects.remove(cutter, do_unlink=True)
    if src.get("gun_rear_y") is not None:
        obj["gun_front_y"]=src.get("gun_front_y",float(P[:,1].min())); obj["gun_rear_y"]=gr
    nm,bd=_manifold(obj.data)
    return obj, {"cut_y":round(yc,1), "trimmed":True, "verts":len(obj.data.vertices),
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
def offset_mold(obj, z_line=None, feather=2.0, offset=0.4, z_frac=0.62):
    """Thicken ONLY the slide+barrel+beavertail (Kydex shrink comp) — owner corrected the
    earlier 'offset everywhere' to this region (2026-06-30). Push verts ABOVE the slide/frame
    parting line outward along their normals by `offset` mm, feathered across `feather` mm at
    the line so there is no hard ridge. The grip/frame/trigger-guard (below z_line) stay put.
    REQUIRES the object in OBJECT mode (edit-mode discards foreach_set). In-place.
    Verify outward: the region bbox max-X and max-Z must GROW by ~offset (else normals inward).
    SCAN-RELATIVE (2026-07-03): z_line=None auto-seeds to zmin + z_frac*(zmax-zmin) of THIS mold's
    height (was the HK45 absolute 14mm). Render-verify the region boundary and nudge z_frac/z_line."""
    me=obj.data; N=len(me.vertices)
    P=_world_verts(obj); P0=P.copy()
    if z_line is None:
        zmn,zmx=float(P[:,2].min()),float(P[:,2].max()); z_line=zmn+z_frac*(zmx-zmn)
    Nrm=np.empty((N,3)); me.vertices.foreach_get("normal", Nrm.ravel())
    w=np.clip((P[:,2]-(z_line-feather/2.0))/feather, 0.0, 1.0)
    P += (w*offset)[:,None]*Nrm
    me.vertices.foreach_set("co", P.ravel()); me.update()
    _shade(obj)
    nm,bd=_manifold(me)
    return {"region_verts":int((w>0.99).sum()), "offset_mm":offset, "z_line":z_line,
            "feather":feather, "max_disp_mm":round(float(np.linalg.norm(P-P0,axis=1).max()),3),
            "nonmanifold":nm, "boundary":bd}

# ---------------------------------------------------------------- stage 8: decimate + re-solidify
def decimate_mold(obj, out_name="CGS_MOLD_FINAL", ratio=0.5, times=2, voxel=0.7):
    """Decimate x`times` (Blender DECIMATE COLLAPSE) as the un-subdivide substitute (true un-subdivide
    fails on this triangulated topology), then re-solidify (voxel-fill, same size) so the decimated
    mesh is a clean filled manifold solid. Owner order 2026-07-01/07-03:
    smooth -> offset -> decimate x2 -> re-solidify -> EXPORT (single piece, NO split)."""
    work=_dup(obj, out_name+"_DEC"); _activate(work)
    for i in range(times):
        m=work.modifiers.new("dec%d"%i,"DECIMATE"); m.decimate_type='COLLAPSE'; m.ratio=ratio
        bpy.ops.object.modifier_apply(modifier=m.name)
    sol,ss=solidify_mold(work, out_name=out_name, voxel=voxel)
    bpy.data.objects.remove(work, do_unlink=True)
    ss["decimated_x"]=times; ss["ratio"]=ratio
    return sol, ss

# ---------------------------------------------------------------- (deprecated) clamshell split
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
    """DEPRECATED — NOT in the pipeline (owner directive 2026-07-03: 'in future DO NOT split the mold
    anymore; after DECIMATE, proceed to EXPORT'). The mold now ships as ONE solid piece via
    `export_mold`. Kept for reference / optional use only; `_bore_center_x` is dead with it.
    Split into two CAPPED, closed, manifold clamshell halves along a VERTICAL plane through
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

# ---------------------------------------------------------------- final stage: export (single solid)
def export_mold(obj, gun_name, out_dir=r"C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS"):
    """Export the finished mold as ONE STL to the fixed handoff folder — owner directive 2026-07-03:
    NO clamshell split; after decimate+re-solidify, export the whole mold as a single piece to
    <out_dir>\\<gun_name>.stl (the fixed cgs-mold handoff location, not the scan's own folder).
    Selects only `obj`. Blender 4.x uses wm.stl_export; falls back to export_mesh.stl on older builds."""
    import os
    os.makedirs(out_dir, exist_ok=True)
    path=os.path.join(out_dir, gun_name+".stl")
    for o in bpy.context.selected_objects: o.select_set(False)
    obj.select_set(True); bpy.context.view_layer.objects.active=obj
    try:
        bpy.ops.wm.stl_export(filepath=path, export_selected_objects=True, apply_modifiers=True)
    except Exception:
        bpy.ops.export_mesh.stl(filepath=path, use_selection=True)
    return {"path":path, "exists":os.path.exists(path),
            "size_kb":round(os.path.getsize(path)/1024,1) if os.path.exists(path) else 0,
            "verts":len(obj.data.vertices)}

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
