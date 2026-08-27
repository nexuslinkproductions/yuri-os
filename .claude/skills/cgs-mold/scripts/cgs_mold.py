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
def _sight_channel_x(P, top_frac=0.15):
    """X of the SIGHT-CHANNEL centerline = the bilateral-symmetry center of the slide TOP band.
    The clamshell seam (a vertical X=const plane) must halve the gun through the sights — but the MASS
    centroid is pulled off that true centerline by one-sided controls (slide stop, mag release), so
    mass-centering the width axis misses the sights. Trimmed extremes (2/98 pct) of the top band give
    a robust symmetry center (the slide top / sights / optic all sit on the gun's optical centerline).
    Owner 2026-07-03: width axis centers on THIS, not mass; length (Y) + height (Z) stay mass-centered."""
    Z=P[:,2]; zmax=float(Z.max()); H=zmax-float(Z.min())
    Xt=P[Z>zmax-top_frac*max(H,1e-6), 0]
    if len(Xt)<4: return float(P[:,0].mean())
    lo,hi=np.percentile(Xt,2), np.percentile(Xt,98)
    return float((lo+hi)/2.0)

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
    sx=0.0
    if center:
        Q=_world_verts(obj); c=Q.mean(0)                 # mass center for length (Y) + height (Z)...
        sx=_sight_channel_x(Q); c[0]=sx                  # ...but WIDTH (X, split seam) on the SIGHT CHANNEL, not mass
        Q-=c; me.vertices.foreach_set("co", Q.ravel()); me.update()
    Q=_world_verts(obj); fi=int(np.argmin(Q[:,1])) if len(Q) else 0
    nm,bd=_manifold(me)
    n_islands=len(diag); n_kept=int(sum(1 for r in diag if diag[r]>=speck_frac*dmax and diag[r]>0))
    return obj, {"islands_total":n_islands, "islands_kept":n_kept, "specks_dropped":n_islands-n_kept,
                 "width_center":"sight_channel",
                 "sight_x_post":round(float(_sight_channel_x(Q)),3) if len(Q) else 0.0,   # ~0 => seam hits the sights
                 "mass_x_post":round(float(Q[:,0].mean()),3) if len(Q) else 0.0,           # mass offset from the seam
                 "front_y":round(float(Q[:,1].min()),2) if len(Q) else 0.0,
                 "front_feature_z":round(float(Q[fi,2]),1) if len(Q) else 0.0,   # low z => a light drives the front
                 "rear_y":round(float(Q[:,1].max()),2) if len(Q) else 0.0,
                 "y_length":round(float(Q[:,1].max()-Q[:,1].min()),2) if len(Q) else 0.0,
                 "verts":len(me.vertices), "nonmanifold":nm, "boundary":bd}

# ---------------------------------------------------------------- stage 2: the dip / draw sweep
def sweep_dip(gun_solid, out_name="CGS_MOLD_SOLID", voxel=0.4, boot=0.4, travel=None):
    # ★ boot DEFAULT 0.4 = the voxel. The log-doubling union's offset set is DISCRETE {0, boot, 2*boot,
    #   ...}, so any section that changes along Y gets a visible comb at `boot` pitch; setting boot to
    #   the voxel makes the comb pitch equal the fill resolution and it disappears (2026-08-01, first
    #   seen on a magazine's tapered feed lips). Costs ~2 extra passes. Every gun since has used 0.4.
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
def solidify_mold(src, out_name="CGS_MOLD_SOLID", voxel=0.4):
    """Voxel-fill the mold shell into ONE filled manifold solid (the cut precondition).
    voxel default 0.4 (2026-07-03) — fine enough to keep corners crisp; 0.7 rounds them."""
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

# ---------------------------------------------------------------- stage 4c: voxel pinhole repair (MANDATORY)
def repair_pits(obj, gun_solid=None, thr=0.25, max_diag=2.5, max_n=60, halo=2, iters=25, factor=0.6,
                rounds=3, depth_cap=1.25, cap_floor=0.15, total_cap=1.5, protect_creases=False):
    """Kill the compact craters / needles a VOXEL REMESH leaves behind — René 2026-08-03b:
    "Mold has little holes everywhere, unacceptable!"

    ★ The source scan is NOT the cause. Measured per stage on the Glock 45: GUN_SOLID had **0**
    such defects; `sweep_dip`'s voxel remesh introduced **324**, up to **1.4 mm deep on a 0.4 mm
    voxel**. Each is a single vertex (plus its cone walls) sunk below its own 2-ring neighbourhood.
    They render as black dots and machine as real pinholes, and `smooth_mold` does NOT remove them
    (it only shaves them 1.4 -> 1.28 mm). Run this after EVERY voxel remesh and after the booleans.

    DISCRIMINATOR — a defect is a COMPACT blob (cluster bbox diag <= `max_diag`); a real crease,
    groove, serration or corner is an EXTENDED line and is rejected by the same test, so no owner
    geometry is at risk. Threshold evidence (Glock 45, 0.4 voxel, 750k v): at thr >= 0.25 every
    detected cluster is compact (diag_max 2.07, extended=0); at 0.20 real linear features start
    entering the candidate set (diag_max 23.6). 0.25 is the noise-floor/feature boundary — do not
    drop below it without re-running that sweep on the gun at hand.

    REPAIR = `remove_overhang`'s mechanic applied per blob: umbrella Laplacian over the blob + a
    `halo`-ring skirt, which melts the crater while the untouched skirt boundary holds the surface.
    Cost on the Glock 45: 1,787 of 749,908 verts moved (0.24 %), mean 0.22 mm, manifold 0/0.

    ★★ DISPLACEMENT CAP — MANDATORY, added 2026-08-20 after this function ATE 2.08 mm of the mold at
    the light/dust-cover junction on the G19 + GTL II (owner: "you are cutting stuff away"). 25
    Laplacian iterations at factor 0.6 over a blob sitting in a TIGHT CONCAVE CREASE do not "melt a
    crater", they collapse the crease — and the old code had NO cap at all, so the mean stayed a
    healthy 0.207 mm while a single outlier moved 2.082 mm (5x the voxel) and gouged real geometry.
    The compactness test cannot catch this: a crease CORNER is genuinely a compact cluster.
    Two new guards, both cheap:
      • per-vertex cap = `depth_cap`*|d_i| + `cap_floor` — a vertex may only move about as far as its
        OWN measured pit depth. A real 1.4 mm crater still gets its 1.4 mm; a crease wall whose d is
        0.3 gets 0.53 and cannot be dragged open. Plus a `total_cap` across all rounds.
      • `protect_creases` removes every vertex belonging to an EXTENDED sharp cluster from the repair
        mask (the `despeckle_mold` discriminator, applied here) — real creases are never moved.
    Tells that the cap is doing work: `capped_verts` > 0 in the summary. Tells it is misapplied
    (08-04c): defect_verts not falling to 0, or `mean_disp_moved_mm` >> the voxel size."""
    import collections
    me=obj.data; N=len(me.vertices)
    P=np.empty((N,3)); me.vertices.foreach_get("co",P.ravel()); P=P.reshape(-1,3)
    P0=P.copy(); ei,ej=_edges(me,N)
    def ringmean(Q, rings):
        L=Q.copy()
        for _ in range(rings):
            S=np.zeros((N,3)); C=np.zeros(N)
            np.add.at(S,ei,L[ej]); np.add.at(C,ei,1)
            np.add.at(S,ej,L[ei]); np.add.at(C,ej,1)
            C[C==0]=1; L=S/C[:,None]
        return L
    arb=None
    if gun_solid is not None:
        import bmesh
        from mathutils import Vector
        from mathutils.kdtree import KDTree
        from mathutils.bvhtree import BVHTree
        _bmg=bmesh.new(); _bmg.from_mesh(gun_solid.data); _bvhg=BVHTree.FromBMesh(_bmg)
        _G=_world_verts(gun_solid); _kdg=KDTree(len(_G))
        for _j,_p in enumerate(_G): _kdg.insert(Vector(_p.tolist()), _j)
        _kdg.balance(); arb=(_bvhg,_kdg,_G)
    log=[]; ncap=0
    for r in range(rounds):
        gprot=0
        me.update()
        NR=np.empty((N,3)); me.vertices.foreach_get("normal",NR.ravel()); NR=NR.reshape(-1,3)
        L=ringmean(P,2)
        d=np.einsum('ij,ij->i',L-P,NR)          # >0 = vert sunk below its neighbourhood (crater)
        idx=np.where(np.abs(d)>thr)[0]
        adj=collections.defaultdict(list); s=set(idx.tolist())
        for a,b in zip(ei,ej):
            if a in s and b in s: adj[a].append(b); adj[b].append(a)
        seen=set(); keep=[]; ext=0
        for v in idx.tolist():
            if v in seen: continue
            st=[v]; seen.add(v); g=[]
            while st:
                n=st.pop(); g.append(n)
                for x in adj[n]:
                    if x not in seen: seen.add(x); st.append(x)
            Q=P[g]
            if float(np.linalg.norm(Q.max(0)-Q.min(0)))<=max_diag and len(g)<=max_n:
                if arb is not None and _gun_arbiter(arb[0], arb[1], arb[2], Q.mean(0)):
                    gprot+=1                     # the GUN has real geometry here -> never touched
                else: keep.extend(g)
            else: ext+=1                         # extended = a real crease/groove -> never touched
        log.append({"round":r,"defect_verts":len(keep),"extended_rejected":ext,
                    "gun_protected":gprot,
                    "dmax":round(float(d.max()),2),"dmin":round(float(d.min()),2)})
        if not keep: break
        mask=np.zeros(N,bool); mask[np.array(keep,dtype=np.int64)]=True
        for _ in range(halo):                    # ring-expand so the fix blends without a seam
            nb=np.zeros(N,bool); nb[ei[mask[ej]]]=True; nb[ej[mask[ei]]]=True; mask|=nb
        if protect_creases:                      # never move a vertex on a REAL crease (08-20)
            _s,_c,extd=_sharp_clusters(me,N,P,35.0,max_diag)
            if extd:
                ex=np.zeros(N,bool); ex[np.concatenate([np.array(g,dtype=np.int64) for g in extd])]=True
                mask &= ~ex
                log[-1]["crease_verts_protected"]=int(ex.sum())
        if not mask.any(): break
        Pr=P.copy()
        for _ in range(iters): P[mask]+=factor*_umbrella(P,ei,ej,N)[mask]
        # --- per-vertex cap tied to the vertex's OWN pit depth (08-20 gouge fix)
        cap=np.minimum(depth_cap*np.abs(d)+cap_floor, total_cap)
        dl=P-Pr; mag=np.linalg.norm(dl,axis=1)
        over=mag>cap
        if over.any():
            sc=np.ones(N); sc[over]=cap[over]/mag[over]
            P=Pr+dl*sc[:,None]
            ncap+=int(over.sum())
        # --- global cap across rounds
        tot=P-P0; tmag=np.linalg.norm(tot,axis=1); tover=tmag>total_cap
        if tover.any():
            sc=np.ones(N); sc[tover]=total_cap/tmag[tover]; P=P0+tot*sc[:,None]
        me.vertices.foreach_set("co",P.ravel()); me.update()
    me.vertices.foreach_set("co",P.ravel()); me.update(); _shade(obj)
    nm,bd=_manifold(me); disp=np.linalg.norm(P-P0,axis=1); mv=disp>1e-4
    return {"rounds":log, "moved_verts":int(mv.sum()), "verts":N, "capped_verts":ncap,
            "max_disp_mm":round(float(disp.max()),3),
            "mean_disp_moved_mm":round(float(disp[mv].mean()),4) if mv.any() else 0.0,
            "nonmanifold":nm, "boundary":bd}

# ------------------------------------------------- stage 4d: SHARP-SPECK audit + repair (MANDATORY)
def _sharp_clusters(me, N, P, angle_deg=35.0, max_diag=2.5):
    """Split the crease skeleton into COMPACT clusters (voxel facet breaks) and EXTENDED ones
    (real creases: rail grooves, panel borders, the parting line, cut-face borders).
    Returns (sharp_mask, compact:[ [vidx..] ], extended:[ [vidx..] ])."""
    import collections
    sharp,_=_feature(me, N, angle_deg)
    ei,ej=_edges(me, N)
    idx=np.where(sharp)[0]; s=set(idx.tolist())
    adj=collections.defaultdict(list)
    for a,b in zip(ei,ej):
        if a in s and b in s: adj[a].append(b); adj[b].append(a)
    seen=set(); compact=[]; extended=[]
    for v in idx.tolist():
        if v in seen: continue
        st=[v]; seen.add(v); g=[]
        while st:
            n=st.pop(); g.append(n)
            for x in adj[n]:
                if x not in seen: seen.add(x); st.append(x)
        Q=P[g]
        (compact if float(np.linalg.norm(Q.max(0)-Q.min(0)))<=max_diag else extended).append(g)
    return sharp, compact, extended

def speck_report(obj, angle_deg=35.0, max_diag=2.5, cell=(20.0,10.0), dens_min=6):
    """READ-ONLY audit for the SPECK FIELD class of defect — René 2026-08-17b:
    "why the hell are you always making these holes!!!??? The original stl file is a clean file".

    ★ THESE ARE NOT CRATERS AND NO DEPTH PROBE CAN SEE THEM. On the P320 X-Carry the dotted panel
    fitted a plane at rms 0.068 mm and the visually-spotless slide flank fitted at 0.067 mm —
    IDENTICAL depth statistics. The only difference was the crease flag: `sharp_frac` 0.18-0.29 on
    the dotted panel vs 0.000 on the clean flank. They are ~0.1 mm NORMAL DISCONTINUITIES left by the
    voxel remesh; the cavity/matcap shading renders a normal break as a hard black speck, so the eye
    sees a hole where the geometry has almost no depth. `repair_pits` (depth) is blind to them, and
    `smooth_mold` / `denoise_region` actively PROTECT them because both freeze sharp verts as real
    creases (`denoise_region` moved 31,989 verts and changed the panel metric 0.0241 -> 0.0225: a no-op).

    DISCRIMINATOR = the same compactness test `repair_pits` uses, applied to the SHARP mask instead of
    the depth field: a real crease is a LONG connected line, a voxel facet break is a compact blob.

    `hotspots` bins the surviving compact clusters into `cell` (dy,dz) buckets per side and reports any
    bucket holding >= `dens_min` of them — that is a speck FIELD (what the owner sees), as opposed to
    the handful of isolated blobs every voxel mold carries. `ok` is False when any hotspot exists;
    that is the gate. Non-mutating: safe to call anywhere, including as a pre-export assert."""
    me=obj.data; N=len(me.vertices)
    P=np.empty((N,3)); me.vertices.foreach_get("co",P.ravel()); P=P.reshape(-1,3)
    sharp, compact, extended = _sharp_clusters(me, N, P, angle_deg, max_diag)
    cy,cz=cell
    buckets={}
    for g in compact:
        c=P[g].mean(0)
        key=(1 if c[0]>0 else -1, int(math.floor(c[1]/cy)), int(math.floor(c[2]/cz)))
        buckets.setdefault(key,[]).append([float(c[0]),float(c[1]),float(c[2])])
    hot=[]
    for (sd,iy,iz),pts in buckets.items():
        if len(pts)<dens_min: continue
        A=np.array(pts)
        hot.append({"side":int(sd),"n_clusters":len(pts),
                    "y_range":[round(float(A[:,1].min()),1), round(float(A[:,1].max()),1)],
                    "z_range":[round(float(A[:,2].min()),1), round(float(A[:,2].max()),1)],
                    "box_y":[round(iy*cy,1), round((iy+1)*cy,1)],
                    "box_z":[round(iz*cz,1), round((iz+1)*cz,1)]})
    hot.sort(key=lambda h:-h["n_clusters"])
    return {"verts":N, "sharp_verts":int(sharp.sum()),
            "compact_clusters":len(compact), "compact_verts":int(sum(len(g) for g in compact)),
            "extended_clusters":len(extended), "extended_verts":int(sum(len(g) for g in extended)),
            "hotspots":hot, "hotspot_clusters":int(sum(h["n_clusters"] for h in hot)),
            "ok":(len(hot)==0)}

def repair_specks(obj, angle_deg=35.0, max_diag=2.5, halo=1, iters=12,
                  factor=0.65, cap=0.15, rounds=2):
    """Melt the COMPACT sharp clusters found by `speck_report`; EXTENDED (real) creases are frozen and
    are re-asserted in the return value (`extended_still_sharp` must equal `extended_verts`).
    Displacement is hard-capped at `cap` — these are ~0.1 mm normal breaks, so a large move means the
    cluster was not a speck. Cut faces need no special handling: a flat cut face carries sharp verts
    only along its BORDER, which is a long cluster and therefore frozen."""
    me=obj.data; N=len(me.vertices)
    P=np.empty((N,3)); me.vertices.foreach_get("co",P.ravel()); P=P.reshape(-1,3)
    P0=P.copy(); ei,ej=_edges(me,N)
    log=[]
    frozen_total=0
    for r in range(rounds):
        me.update()
        sharp, compact, extended = _sharp_clusters(me, N, P, angle_deg, max_diag)
        frozen=np.zeros(N,bool)
        for g in extended: frozen[np.array(g,dtype=np.int64)]=True
        frozen_total=int(frozen.sum())
        core=np.zeros(N,bool)
        for g in compact: core[np.array(g,dtype=np.int64)]=True
        log.append({"round":r,"compact_clusters":len(compact),
                    "compact_verts":int(core.sum()),"extended_verts":frozen_total})
        if not compact: break
        mask=core.copy()
        for _ in range(halo):
            nb=np.zeros(N,bool); nb[ei[mask[ej]]]=True; nb[ej[mask[ei]]]=True; mask|=nb
        mask &= ~frozen                       # a real crease is never moved, even inside the halo
        Q=P.copy()
        for _ in range(iters): Q[mask]+=factor*_umbrella(Q,ei,ej,N)[mask]
        mv=Q-P; L=np.linalg.norm(mv,axis=1); ov=L>cap
        mv[ov]*=(cap/np.maximum(L[ov],1e-12))[:,None]
        P=P+mv
        me.vertices.foreach_set("co",P.ravel()); me.update()
    me.vertices.foreach_set("co",P.ravel()); me.update(); _shade(obj)
    sharp2,_=_feature(me,N,angle_deg)
    frz=np.zeros(N,bool)
    _,_,ext_final=_sharp_clusters(me,N,P0,angle_deg,max_diag)
    for g in ext_final: frz[np.array(g,dtype=np.int64)]=True
    nm,bd=_manifold(me); d=np.linalg.norm(P-P0,axis=1); m=d>1e-6
    return {"rounds":log, "moved_verts":int(m.sum()),
            "mean_disp_moved_mm":round(float(d[m].mean()),5) if m.any() else 0.0,
            "max_disp_mm":round(float(d.max()),4),
            "extended_verts":int(frz.sum()), "extended_still_sharp":int((sharp2&frz).sum()),
            "sharp_verts_after":int(sharp2.sum()), "nonmanifold":nm, "boundary":bd}

def smooth_flank_field(obj, y_range, z_range, side, cell=0.4, sigma=1.0, tol=0.18,
                       angle_deg=35.0, max_diag=2.5, flank_frac=0.93):
    """Grid-resampled FLANK filter — the escalation that actually clears a speck FIELD when
    `repair_specks` alone leaves it visible (P320 X-Carry 2026-08-17b).

    Grid the flank's half-width |x| over (y,z) at `cell`, dilate-fill the empty cells, separable
    gaussian at `sigma`, bilinear-sample back. That removes structure under roughly 1.5*sigma — the
    speck scale — while preserving the panel's own shape and any feature larger than ~2 mm. Long
    (real) creases are frozen. Legitimate because a swept flank is the RUNNING MAX of the gun's
    half-width along the sweep: it is smooth by construction, so any high-frequency content on it was
    manufactured downstream and cannot be scan detail.

    ⚠ `tol` IS LOAD-BEARING, not a formality. The move is applied ONLY where |x_smooth - x| < tol.
    Without it the same filter hit its cap on 100 of 434 verts of the P320's RIGHT flank — a convex,
    already-clean panel — i.e. it was flattening real shape, not noise. A systematic mismatch larger
    than the noise band means the region is not a noise case: SKIP it, do not clamp it."""
    me=obj.data; N=len(me.vertices)
    P=np.empty((N,3)); me.vertices.foreach_get("co",P.ravel()); P=P.reshape(-1,3)
    _,_,extended=_sharp_clusters(me,N,P,angle_deg,max_diag)
    frozen=np.zeros(N,bool)
    for g in extended: frozen[np.array(g,dtype=np.int64)]=True
    y0,y1=y_range; z0,z1=z_range
    m=(P[:,1]>y0)&(P[:,1]<y1)&(P[:,2]>z0)&(P[:,2]<z1)
    m &= (P[:,0]<0) if side<0 else (P[:,0]>0)
    if m.sum()<50: return {"n":0,"applied":0,"skipped":0,"reason":"too few verts in box"}
    hw=float(np.abs(P[m,0]).max())
    m &= np.abs(P[:,0])>flank_frac*hw           # the flank plane only, derived from the SLAB's own extent
    m &= ~frozen
    ids=np.where(m)[0]
    if len(ids)<50: return {"n":int(len(ids)),"applied":0,"skipped":0,"reason":"too few flank verts"}
    y=P[ids,1]; z=P[ids,2]; x=P[ids,0]
    gy0,gz0=y.min()-2.0, z.min()-2.0
    ny=int((y.max()-gy0+2.0)/cell)+1; nz=int((z.max()-gz0+2.0)/cell)+1
    acc=np.zeros((ny,nz)); cw=np.zeros((ny,nz))
    iy=((y-gy0)/cell).astype(int); iz=((z-gz0)/cell).astype(int)
    np.add.at(acc,(iy,iz),x); np.add.at(cw,(iy,iz),1.0)
    grid=np.where(cw>0, acc/np.maximum(cw,1), np.nan)
    for _ in range(14):                          # dilate-fill holes so the blur has no NaN craters
        nan=np.isnan(grid)
        if not nan.any(): break
        pad=np.pad(grid,1,constant_values=np.nan)
        st4=np.stack([pad[0:-2,1:-1],pad[2:,1:-1],pad[1:-1,0:-2],pad[1:-1,2:]])
        with np.errstate(invalid='ignore'): fv=np.nanmean(st4,axis=0)
        grid=np.where(nan,fv,grid)
    grid=np.nan_to_num(grid,nan=float(np.nanmean(grid)))
    r=int(np.ceil(3*sigma/cell)); k=np.exp(-0.5*((np.arange(-r,r+1)*cell)/sigma)**2); k/=k.sum()
    G=np.apply_along_axis(lambda v: np.convolve(np.pad(v,(r,r),mode='edge'),k,mode='valid'),0,grid)
    G=np.apply_along_axis(lambda v: np.convolve(np.pad(v,(r,r),mode='edge'),k,mode='valid'),1,G)
    fy=(y-gy0)/cell; fz=(z-gz0)/cell
    i0=np.clip(fy.astype(int),0,ny-2); j0=np.clip(fz.astype(int),0,nz-2)
    ty=fy-i0; tz=fz-j0
    xs=(G[i0,j0]*(1-ty)*(1-tz)+G[i0+1,j0]*ty*(1-tz)+G[i0,j0+1]*(1-ty)*tz+G[i0+1,j0+1]*ty*tz)
    dlt=xs-x; keep=np.abs(dlt)<tol
    P[ids[keep],0]=x[keep]+dlt[keep]
    me.vertices.foreach_set("co",P.ravel()); me.update(); _shade(obj)
    nm,bd=_manifold(me)
    return {"n":int(len(ids)),"applied":int(keep.sum()),"skipped":int((~keep).sum()),
            "side":int(side),"y_range":[y0,y1],"z_range":[z0,z1],
            "mv_mean":round(float(np.abs(dlt[keep]).mean()),4) if keep.any() else 0.0,
            "mv_max":round(float(np.abs(dlt[keep]).max()),4) if keep.any() else 0.0,
            "nonmanifold":nm,"boundary":bd}

def despeckle_mold(obj, angle_deg=35.0, max_diag=2.5, dens_min=6, cell=(20.0,10.0),
                   escalate=True, pad=(6.0,4.0), sigma=1.0, tol=0.18, max_passes=6,
                   total_cap=0.35):
    """MANDATORY on every mold — the automatic speck-field check + fix (owner directive 2026-08-17b:
    "make sure this is checked automatically with every future mold").

    audit -> `repair_specks` -> re-audit -> if a hotspot survives and `escalate`, run
    `smooth_flank_field` on that hotspot's box (padded by `pad`) -> final audit.

    Returns `{"before":…, "after":…, "ok":bool, …}`. **`ok` False means the mold still carries a speck
    field and MUST NOT be exported** — read `after["hotspots"]` for where, and render that panel under
    cavity/matcap light before deciding anything. Both stages freeze long (real) creases, and every
    stage re-asserts `extended_still_sharp == extended_verts`, so owner geometry cannot be eaten.

    Run it on the PRE-DECIMATE mold: this is a surface fix and the decimate is BVH-faithful to it.
    ⚠ Do NOT re-audit after decimating and expect the same numbers — neighbourhood metrics scale with
    edge length (the P320 read 0.0006 pre-decimate and 0.0571 post-decimate on a surface pair 0.0071 mm
    apart). Verify at ONE density, or with a BVH distance."""
    me=obj.data; N=len(me.vertices)
    P0=np.empty((N,3)); me.vertices.foreach_get("co",P0.ravel()); P0=P0.reshape(-1,3)
    before=speck_report(obj, angle_deg, max_diag, cell, dens_min)
    steps=[]; assert_fail=False
    def _clamp_total():
        """Cumulative-displacement guard: passes compose, and each stage's own cap does NOT bound the
        SUM. Without this a multi-pass run drifted to 0.60 mm on a 0.15/0.18-capped pipeline."""
        P=np.empty((N,3)); me.vertices.foreach_get("co",P.ravel()); P=P.reshape(-1,3)
        d=P-P0; L=np.linalg.norm(d,axis=1); ov=L>total_cap
        if ov.any():
            d[ov]*=(total_cap/L[ov])[:,None]
            me.vertices.foreach_set("co",(P0+d).ravel()); me.update()
        return int(ov.sum())
    rep=repair_specks(obj, angle_deg=angle_deg, max_diag=max_diag)
    steps.append({"stage":"repair_specks", **rep})
    if rep["extended_still_sharp"]!=rep["extended_verts"]: assert_fail=True
    _clamp_total()
    after=speck_report(obj, angle_deg, max_diag, cell, dens_min)
    passes=0
    if escalate:
        prev=after["hotspot_clusters"]
        while after["hotspots"] and passes<max_passes:
            passes+=1; fired=0
            for h in after["hotspots"]:
                y0=min(h["y_range"][0], h["box_y"][0])-pad[0]
                y1=max(h["y_range"][1], h["box_y"][1])+pad[0]
                z0=min(h["z_range"][0], h["box_z"][0])-pad[1]
                z1=max(h["z_range"][1], h["box_z"][1])+pad[1]
                r=smooth_flank_field(obj, (y0,y1), (z0,z1), h["side"],
                                     sigma=sigma, tol=tol, angle_deg=angle_deg, max_diag=max_diag)
                steps.append({"stage":"field","pass":passes, **r})
                fired+=r.get("applied",0)
            if not fired: break
            r2=repair_specks(obj, angle_deg=angle_deg, max_diag=max_diag, rounds=1)
            steps.append({"stage":"repair(post-field)","pass":passes, **r2})
            if r2["extended_still_sharp"]!=r2["extended_verts"]: assert_fail=True
            clamped=_clamp_total()
            after=speck_report(obj, angle_deg, max_diag, cell, dens_min)
            steps.append({"stage":"audit","pass":passes,"hotspot_clusters":after["hotspot_clusters"],
                          "compact_clusters":after["compact_clusters"],"total_clamped":clamped})
            if after["hotspot_clusters"]>=prev: break     # no progress -> stop, don't grind
            prev=after["hotspot_clusters"]
    P=np.empty((N,3)); me.vertices.foreach_get("co",P.ravel()); P=P.reshape(-1,3)
    d=np.linalg.norm(P-P0,axis=1); mv=d>1e-6
    nm,bd=_manifold(me)
    return {"before":before, "after":after, "steps":steps, "passes":passes,
            "hotspots_before":before["hotspot_clusters"], "hotspots_after":after["hotspot_clusters"],
            "moved_verts":int(mv.sum()), "moved_frac":round(float(mv.mean()),5),
            "mean_disp_moved_mm":round(float(d[mv].mean()),5) if mv.any() else 0.0,
            "max_disp_mm":round(float(d.max()),4),
            "crease_assert_failed":assert_fail,
            "ok":(after["ok"] and not assert_fail), "nonmanifold":nm, "boundary":bd}

# ---------------------------------------------------------------- stage 6b: regional ripple denoise (optional)
def denoise_region(obj, y_range, z_range, x_range=None, feature_angle=35.0, pairs=15, rings=2):
    """Kill voxel-remesh 'ripple' staircase noise on an otherwise-smooth curved region (e.g. the
    frame boss between grip checkering and the slide) that survives the default 4-stage `smooth_mold`
    deburr pass. The ripple shows only under raking/matcap light, not flat light, and is distinct from
    real design creases (rail grooves, panel borders, checkering) which carry genuine face-angle breaks
    — freezing those must not swallow the ripple fix.

    Mirrors `remove_overhang`'s box-restriction + ring-expansion pattern, but freezes real creases via
    `_feature`'s sharp-edge test (face-angle > feature_angle) instead of a magnitude threshold —
    magnitude-gating was tried FIRST and was too conservative (see METHOD-NOTES.md "ripple" step):
    a threshold high enough to spare real edges left the ripple untouched, low enough to catch the
    ripple ate real edges. Freeze-then-smooth-everything-else is what actually worked.

    y_range=(y0,y1), z_range=(z0,z1) world-space box (x_range optional, full X if None) selects the
    affected region, ring-expanded `rings` times (topological, like remove_overhang) so the fix blends
    without a seam at the box edge. Inside the (expanded) box, every non-sharp vert gets `pairs` Taubin
    lambda/mu pairs (0.5/-0.53, volume-preserving); sharp verts stay frozen even inside the box, so
    real creases survive.
    ★ FAILURE ANCHOR (René 2026-07-03, SIG P226 XFIVE LEGION): owner circled a rippled area on the
    frame boss between grip checkering and slide in a render — visible only under raking/matcap light.
    Diagnosed via grid-binned Laplacian-magnitude clustering (a vertex-color heatmap render was tried
    FIRST and failed silently in headless blender-mcp — solid red vertex colors never showed up in the
    opengl render; dead end, don't retry it). Fixed with box+sharp-freeze denoise on CGS_MOLD_SMOOTH
    pre-decimate, re-decimated, re-exported. Evidence: target 21728 verts, max_disp 1.43mm (worst
    ripple crest), mean_disp 0.0084mm (confirms fine noise, not a real feature), manifold 0/0 preserved
    throughout. Optional stage — owner's-eye-triggered (run only when a render shows ripple on an
    otherwise-smooth region), not part of the default pipeline."""
    me=obj.data; N=len(me.vertices); P=_world_verts(obj); P0=P.copy()
    ei,ej=_edges(me,N); sharp,_=_feature(me,N,feature_angle)
    y0,y1=y_range; z0,z1=z_range
    mask=(P[:,1]>y0)&(P[:,1]<y1)&(P[:,2]>z0)&(P[:,2]<z1)
    if x_range is not None:
        x0,x1=x_range
        mask&=(P[:,0]>x0)&(P[:,0]<x1)
    for _ in range(rings):
        nb=np.zeros(N,bool); nb[ei[mask[ej]]]=True; nb[ej[mask[ei]]]=True; mask|=nb
    free=mask&~sharp
    L=lambda Pp: _umbrella(Pp,ei,ej,N)
    for s in [0.5,-0.53]*pairs: P[free]+=s*L(P)[free]
    me.vertices.foreach_set("co", P.ravel()); me.update()
    _shade(obj)
    nm,bd=_manifold(me)
    disp=np.linalg.norm(P-P0,axis=1)
    return {"boxed":int(mask.sum()), "frozen_in_box":int((mask&sharp).sum()), "smoothed":int(free.sum()),
            "max_disp_mm":round(float(disp.max()),3),
            "mean_disp_mm":round(float(disp[free].mean()),4) if free.any() else 0.0,
            "nonmanifold":nm, "boundary":bd}

# ---------------------------------------------------------------- stage 7: offset (XZ cross-section)
def offset_mold_xz(obj, offset=0.2, offset_y=0.1, min_l=0.15):
    """★ THE CURRENT OFFSET RULE (owner ruling 2026-08-20, supersedes the 2026-06-30 slide-only one):
    "0.4 should always be everywhere but only along the Z axis and X axis. Never along the Y axis."
    ★ MAGNITUDE, converged over four owner messages the same day: 0.4 -> 0.3 -> **0.2 in XZ**, then
    **"add 0.1 on Y AXIS"**. So Y is no longer zero — it is a SMALLER, separate value. Defaults are
    `offset=0.2` (X and Z) and `offset_y=0.1`.

    MECHANISM (generalised 2026-08-20b): a true anisotropic Minkowski offset by an ELLIPSOID with
    semi-axes (0.2, 0.1, 0.2), not two offsets bolted together. For unit normal n the exact offset
    point is `p + (a^2 nx, b^2 ny, c^2 nz) / sqrt(a^2 nx^2 + b^2 ny^2 + c^2 nz^2)`. That gives exactly
    0.2 on a pure X or Z facing surface, exactly 0.1 on a pure Y facing one (the muzzle face, cut B's
    rear face), and the correct smooth blend on every mixed normal — with no ramp constant to tune and
    no discontinuity, which the earlier zero-Y version needed `min_l` to paper over.
    VERIFY: mold Y extent must grow by exactly `offset_y` at each end, and the XZ flank gaps by `offset`.
    René's axes are this pipeline's axes (he confirmed on a front view: Z up, X across, Y down the
    barrel). So: offset EVERY XZ cross-section of the mold outward by `offset`, and change NOTHING
    along the draw axis.

    WHY the old rule failed: `offset_mold`'s z_line region left the whole lower half — dust cover,
    trigger guard and the ENTIRE WEAPON LIGHT — at exactly 0.000 clearance. Overlaying his gun on the
    G19 + GTL II mold showed the light and frame bleeding straight through the mold surface, while
    only the slide had clearance. Kydex shrinks around the whole cross-section, not just the slide.
    WHY Y is excluded: extra length does nothing for shrink and it moves the muzzle face and the
    trigger-guard detent fore/aft. The draw axis is already handled by `sweep_dip`.

    MECHANISM: displace along the normal's XZ COMPONENT, RE-NORMALISED, so every horizontal
    cross-section grows by exactly `offset` in its own plane regardless of how the surface is
    inclined in Y. Vertices whose normal is (near-)pure ±Y — the muzzle front face, cut B's rear
    face — have no XZ direction and correctly do not move: `min_l` smoothsteps them to zero. The
    RIM of the muzzle face has a mixed normal, so it grows radially while the face plane stays put,
    which is exactly a 2D offset of that cross-section. Cut A's diagonal press-bed face has a mostly
    -Z normal, so it drops `offset` and stays planar.
    VERIFY: mold-vs-gun gap ~= `offset` on flanks AND on the top AND on the light; and the mold's
    Y extent must be UNCHANGED (front_y and rear_y identical to the pre-offset mesh). In-place."""
    me=obj.data; N=len(me.vertices)
    P=_world_verts(obj); P0=P.copy()
    Nrm=np.empty((N,3)); me.vertices.foreach_get("normal", Nrm.ravel()); Nrm=Nrm.reshape(-1,3)
    a=float(offset); bq=max(float(offset_y),1e-6); c=float(offset)
    S=np.array([a*a, bq*bq, c*c])
    num=Nrm*S
    h=np.sqrt((Nrm*Nrm*S).sum(1))                          # ellipsoid support: exact offset distance
    h=np.maximum(h,1e-12)
    P += num/h[:,None]
    me.vertices.foreach_set("co", P.ravel()); me.update(); _shade(obj)
    nm,bd=_manifold(me); disp=np.linalg.norm(P-P0,axis=1)
    return {"mode":"ellipsoid-offset", "offset_xz_mm":offset, "offset_y_mm":offset_y,
            "moved_verts":int((disp>1e-4).sum()),
            "verts":N, "max_disp_mm":round(float(disp.max()),4),
            "y_extent_before":[round(float(P0[:,1].min()),4), round(float(P0[:,1].max()),4)],
            "y_extent_after":[round(float(P[:,1].min()),4), round(float(P[:,1].max()),4)],
            "dy_max":round(float(np.abs(P[:,1]-P0[:,1]).max()),6),
            "nonmanifold":nm, "boundary":bd}

# ---------------------------------------------------------------- stage 7 (LEGACY): regional offset
def offset_mold(obj, z_line=None, feather=2.0, offset=0.4, z_frac=0.62):
    """DEPRECATED 2026-08-20 — use `offset_mold_xz`. Kept only for reproducing older molds.
    This left the light + dust cover + trigger guard at ZERO clearance, which the owner rejected on
    the G19 + GTL II ("you seem to only have made the 0.4 on the top section but not the bottom").

    Thicken ONLY the slide+barrel+beavertail (Kydex shrink comp) — owner corrected the
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

def _flank_hint(bvhg, c, flank_nx=0.70):
    """True when the gun's surface nearest `c` faces mostly +/-X, i.e. `c` is on a side flank."""
    from mathutils import Vector
    hit=bvhg.find_nearest(Vector([float(x) for x in c]))
    return hit[0] is not None and abs(hit[1].x)>flank_nx

def _gun_arbiter(bvhg, kdg, G, c, r_in=1.4, r_out=3.2, snr=2.5, gun_flat=0.16,
                 flank_nx=0.70, detached=1.0):
    """Is there REAL geometry on the owner's clean gun scan at mold-point `c`? Shared by
    `repair_pits` and `fill_dimples` so both use one definition of 'don't touch this'.

    Returns True only when the gun carries a feature that stands OUT of its own local roughness.
    Three ways to answer 'no, repair it':
      • FLANK — the gun's surface normal there is mostly +/-X. The mold's half-width along a flank is
        the RUNNING MAXIMUM of the gun's half-width over the sweep, so it is monotone and a local dip
        is geometrically impossible; even a real recess on the gun's flank is filled by the sweep.
      • DETACHED — the mold point is more than `detached` mm from the gun, i.e. pure swept envelope,
        where the gun's local shape is irrelevant.
      • SIGNAL-TO-NOISE — `dev > max(gun_flat, snr*rms)` of a local quadric fit. An ABSOLUTE threshold
        fails: the grip stipple fits at rms 0.6-0.7, so an absolute test called the whole textured
        region 'real' and let 1.1 mm craters ship (2026-08-20b).
    A +Z feature such as the rear-sight notch is a genuine mold recess (forward of the sights the
    slide top is lower, so the envelope never fills it) and is correctly protected by the SNR test."""
    from mathutils import Vector
    hit=bvhg.find_nearest(Vector([float(x) for x in c]))
    if hit[0] is None: return False
    nor=hit[1]
    if abs(nor.x)>flank_nx: return False
    gcx=np.array(hit[0])
    if float(np.linalg.norm(gcx-np.asarray(c)))>detached: return False
    gin=[j for (co,j,dist) in kdg.find_range(Vector(gcx.tolist()), r_in)]
    gann=[j for (co,j,dist) in kdg.find_range(Vector(gcx.tolist()), r_out) if dist>=r_in]
    if len(gann)<20 or len(gin)<5: return False
    Q=G[gann]; m=Q.mean(0); A=Q-m
    n=np.linalg.svd(A, full_matrices=False)[2][2]
    t=np.array([1.0,0,0]) if abs(n[0])<0.9 else np.array([0,1.0,0])
    u=np.cross(n,t); u/=max(np.linalg.norm(u),1e-12); v=np.cross(n,u)
    def M(X):
        B=X-m; a=B@u; b=B@v
        return np.column_stack([np.ones_like(a),a,b,a*a,a*b,b*b]), B@n
    Ma,wa=M(Q); coef,_,_,_=np.linalg.lstsq(Ma,wa,rcond=None)
    rms=float((wa-Ma@coef).std())
    Mi,wi=M(G[gin]); dev=float(np.abs(wi-Mi@coef).max())
    return dev > max(gun_flat, snr*rms)

def fill_dimples(mold, gun_solid, thr=0.12, max_diag=3.0, max_diag_flank=9.0, max_n=400,
                 r_in=1.4, r_out=3.2,
                 rms_max=0.13, gun_flat=0.16, snr=2.5, needle_n=3, flank_nx=0.70, detached=1.0,
                 cap=1.5, rounds=4):
    """Fill the CRATERS that survive `repair_pits` — and use RENÉ'S OWN CLEAN GUN STL as the arbiter
    for what is a defect and what is real geometry.

    ★ 2026-08-20b: after `repair_pits` was given a displacement cap + crease protection (so it would
    stop gouging the light), it STALLED at ~48 unrepaired defects, and those were exactly the craters
    René circled — up to **1.37 mm deep** on both rear frame flanks (x +/-14..16, y 31..67, z 12..32).
    A capped Laplacian cannot fix them and an uncapped one eats creases. Neither is the right tool.

    MECHANISM — annulus plane fill (the 08-17b wide-crater fix, automated): for each compact depth
    blob, fit a plane to the ANNULUS `r_in..r_out` around it and pull the inner vertices onto that
    plane with a smoothstep falloff. This is bounded by construction — it restores the local surface
    and cannot displace beyond it, so there is no gouge failure mode.

    ★★ THE DISCRIMINATOR IS THE GUN, NOT A HEURISTIC. Two gates, both must pass:
      • the mold's own annulus must fit a plane at rms <= `rms_max` (a crease/curved region will not),
      • and the SAME neighbourhood ON THE GUN must be flat to `gun_flat` mm.
    So a real feature — a pin hole, an engraved slot, a stamped marking — is present on the gun, fails
    the second gate, and is left completely alone; a crater the voxel remesh manufactured has no
    counterpart on a clean scan and gets filled. This is the owner's own argument ("the original stl
    file is a clean file") turned into the actual test instead of a guess about what a dot might be."""
    from mathutils.kdtree import KDTree
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    import bmesh, collections
    me=mold.data; N=len(me.vertices)
    P=_world_verts(mold); P0=P.copy(); ei,ej=_edges(me,N)
    G=_world_verts(gun_solid)
    kdg=KDTree(len(G))
    for j,p in enumerate(G): kdg.insert(Vector(p.tolist()), j)
    kdg.balance()
    bmg=bmesh.new(); bmg.from_mesh(gun_solid.data); bvhg=BVHTree.FromBMesh(bmg)
    def frame(Q, nrm):
        m=Q.mean(0); n=nrm/max(np.linalg.norm(nrm),1e-12)
        t=np.array([1.0,0,0]) if abs(n[0])<0.9 else np.array([0,1.0,0])
        u=np.cross(n,t); u/=max(np.linalg.norm(u),1e-12); v=np.cross(n,u)
        return m,u,v,n
    def quad_fit(Q, m,u,v,n):
        """Local QUADRIC (paraboloid) fit — absorbs the surface's own curvature so the residual is
        the DEFECT alone. A plane fit cannot do this: on the G19 frame flank it read the flank's
        curvature as roughness and rejected all 151 candidate craters as 'not flat' (2026-08-20b)."""
        A=Q-m; a=A@u; b=A@v; w=A@n
        M=np.column_stack([np.ones_like(a),a,b,a*a,a*b,b*b])
        coef,_,_,_=np.linalg.lstsq(M,w,rcond=None)
        res=w-M@coef
        return coef, float(res.std()), float(np.abs(res).max())
    def quad_eval(coef, Q, m,u,v,n):
        A=Q-m; a=A@u; b=A@v; w=A@n
        M=np.column_stack([np.ones_like(a),a,b,a*a,a*b,b*b])
        return w-M@coef                                    # signed deviation from the fitted surface
    log=[]
    for r in range(rounds):
        me.update()
        NR=np.empty((N,3)); me.vertices.foreach_get("normal",NR.ravel()); NR=NR.reshape(-1,3)
        L=P.copy()
        for _ in range(2):
            S=np.zeros((N,3)); C=np.zeros(N)
            np.add.at(S,ei,L[ej]); np.add.at(C,ei,1)
            np.add.at(S,ej,L[ei]); np.add.at(C,ej,1)
            C[C==0]=1; L=S/C[:,None]
        d=np.einsum('ij,ij->i',L-P,NR)
        idx=np.where(np.abs(d)>thr)[0]
        s=set(idx.tolist()); adj=collections.defaultdict(list)
        for a,b in zip(ei,ej):
            if a in s and b in s: adj[a].append(b); adj[b].append(a)
        seen=set(); blobs=[]
        for v in idx.tolist():
            if v in seen: continue
            st=[v]; seen.add(v); g=[]
            while st:
                n_=st.pop(); g.append(n_)
                for x in adj[n_]:
                    if x not in seen: seen.add(x); st.append(x)
            Q=P[g]; diag=float(np.linalg.norm(Q.max(0)-Q.min(0)))
            # ★ On a FLANK the size limit must be relaxed: the running-max argument says NO depression
            # of ANY size can survive the sweep there, so a big one is still a defect. A 4.08 mm slot
            # on the G19's light flank shipped twice because max_diag 2.5/3.0 filed it as a "real
            # crease" (owner: "there is still one hole!", 2026-08-20d). Measured proof it was fake:
            # mold xmin 12.93 in one 0.5 mm bin against 13.87-14.05 either side, while the gun ran a
            # smooth 13.52 -> 13.07 ramp through the same band with no dip at all.
            lim = max_diag_flank if _flank_hint(bvhg, Q.mean(0), flank_nx) else max_diag
            if diag<=lim and len(g)<=max_n: blobs.append((g,diag))
        if not blobs:
            log.append({"round":r,"blobs":0,"filled":0}); break
        kd=KDTree(N)
        for j,p in enumerate(P): kd.insert(Vector(p.tolist()), j)
        kd.balance()
        nfill=0; nskip_mold=0; nskip_gun=0; worst=0.0
        for g,diag in blobs:
            c=P[g].mean(0)
            ri=max(r_in, 0.62*diag)                 # scale the fill radius to the blob
            ro=ri+(r_out-r_in)
            nb=kd.find_range(Vector(c.tolist()), ro)
            ann=[j for (co,j,dist) in nb if dist>=ri]
            inner=[(j,dist) for (co,j,dist) in nb if dist<ri]
            if len(ann)<20 or not inner: continue
            nrm=NR[g].mean(0)
            # ⚠ The blob's MEAN VERTEX NORMAL is a bad orientation estimate: inside a crater the wall
            # normals point every way and cancel, so a flank crater can read |nx| ~ 0.3 and dodge the
            # flank override (2026-08-20b — 5 marks survived three passes because of this). Take the
            # orientation from the ANNULUS's own best-fit plane, which is undisturbed by the defect.
            _A=P[ann]-P[ann].mean(0)
            _ns=np.linalg.svd(_A, full_matrices=False)[2][2]
            if float(_ns@nrm)<0: _ns=-_ns
            nrm=_ns
            m,u,v,n=frame(P[ann], nrm)
            coef,rms,_=quad_fit(P[ann], m,u,v,n)
            # --- the GUN is the arbiter: does a REAL feature live here?
            # SIGNAL-TO-NOISE, not an absolute threshold. An absolute `gun_dev > 0.16` rejected the
            # grip-stipple region wholesale (gun_rms 0.6-0.7 there is TEXTURE, not a hole) and let
            # 1.1 mm craters ship. A real pin hole / notch stands OUT of the local roughness.
            # ★ FLANK OVERRIDE — on a side flank the gun gate does not apply AT ALL. The mold's
            # half-width along a flank is the RUNNING MAXIMUM of the gun's half-width over the sweep,
            # so it is monotone and a local dip is geometrically impossible; even a real recess on the
            # gun's flank is FILLED by the sweep (full-width material exists forward of it). Any
            # depression there was manufactured downstream. Restricted to |nx| > `flank_nx` so it can
            # never touch a +Z feature such as the rear-sight notch, which is a genuine mold recess
            # (forward of the sights the slide top is lower, so the envelope does not fill it).
            nx=abs(float(nrm[0])/max(float(np.linalg.norm(nrm)),1e-12))
            hit=bvhg.find_nearest(Vector(c.tolist()))
            real=False
            # A mold vertex far from the gun sits on pure swept envelope; the gun's local shape there
            # is irrelevant, so the arbiter must not veto.
            far = hit[0] is not None and (np.linalg.norm(np.array(hit[0])-c) > detached)
            if nx>flank_nx or far:
                pass
            elif hit[0] is not None:
                gc_=np.array(hit[0])
                gin=[j for (co,j,dist) in kdg.find_range(Vector(gc_.tolist()), r_in)]
                gann=[j for (co,j,dist) in kdg.find_range(Vector(gc_.tolist()), r_out) if dist>=r_in]
                if len(gann)>=20 and len(gin)>=5:
                    gm,gu,gv,gn=frame(G[gann], nrm)
                    gcoef,grms,_=quad_fit(G[gann], gm,gu,gv,gn)
                    gdev=float(np.abs(quad_eval(gcoef, G[gin], gm,gu,gv,gn)).max())
                    real = gdev > max(gun_flat, snr*grms)
            if real: nskip_gun+=1; continue                  # real hole / notch / slot -> leave it
            if len(g)<=needle_n or rms>rms_max:
                # NEEDLE MODE — a 1-3 vertex spike, or a blob whose annulus is not cleanly fittable.
                # Pull each vertex onto its own 2-ring mean along the normal, capped at its own depth.
                # Bounded by construction; cannot round a corner further than the corner's neighbours.
                gi_=np.array(g)
                mv=np.clip(d[gi_]*0.9, -cap, cap)
                P[gi_]=P[gi_]+NR[gi_]*mv[:,None]
                worst=max(worst, float(np.abs(mv).max())); nfill+=1
                if rms>rms_max and len(g)>needle_n: nskip_mold+=1
                continue
            idxs=np.array([j for j,_ in inner]); dists=np.array([dd_ for _,dd_ in inner])
            dev=quad_eval(coef, P[idxs], m,u,v,n)
            t=dists/ri; wgt=1.0-(3*t*t-2*t*t*t)
            mv=np.clip(-dev*wgt, -cap, cap)
            P[idxs]=P[idxs]+n[None,:]*mv[:,None]
            worst=max(worst, float(np.abs(mv).max()))
            nfill+=1
        log.append({"round":r,"blobs":len(blobs),"filled":nfill,"skipped_not_flat":nskip_mold,
                    "skipped_real_on_gun":nskip_gun,"max_move_mm":round(float(worst),3)})
        me.vertices.foreach_set("co",P.ravel()); me.update()
        if nfill==0: break
    bmg.free(); _shade(mold)
    nm,bd=_manifold(me); disp=np.linalg.norm(P-P0,axis=1)
    return {"rounds":log,"moved_verts":int((disp>1e-4).sum()),
            "max_disp_mm":round(float(disp.max()),3),
            "nonmanifold":nm,"boundary":bd}

def enforce_clearance(mold, gun_solid, clearance=0.25, radius=2.5, rounds=3, cap=2.0,
                      screen=0.05, keep_mask=None):
    # ★ DEFAULT 0.25 = the owner's 0.2 target PLUS a margin, because this runs BEFORE the decimate and
    #   collapse must not be able to eat into the 0.2. Repairing the decimated mesh instead perturbs
    #   the surface ~6x more than the error it fixes (2026-08-20d).
    """HARD GUARANTEE that the gun cannot poke through the mold — run LAST, after every smoothing
    stage, immediately before the decimate.

    WHY it is needed even with `offset_mold_xz`: the offset is applied along vertex normals, and in a
    TIGHT CONCAVE POCKET (the trigger-guard interior, the light/rail slot) a normal offset cannot
    recover what `smooth_mold` + `despeckle_mold` shrank — Laplacian smoothing pulls a concave region
    inward, and no amount of outward normal displacement on a pocket wall reaches the deficit.
    Measured on the G19 + GTL II (2026-08-20): after a clean 0.2 XZ offset, 117 of 54,173 retained gun
    vertices still sat OUTSIDE the mold, up to 1.63 mm, all inside the trigger-guard bow.

    MECHANISM — SURGICAL, driven by the MEASURED failures, not by a blanket distance rule. Iterate:
    (1) screen every gun vertex in the retained region with a nearest-point normal-sign test;
    (2) CONFIRM each candidate with a 5-ray parity test (the screen alone reports phantom 10 mm
        intrusions inside concave pockets — see the VERIFY note);
    (3) for each confirmed offender, push the mold vertices within `radius` outward along the gun
        normal's XZ component, by (intrusion + clearance) with a smoothstep falloff, capped at `cap`.
    ⚠ A BLANKET version of this — "push every mold vertex closer than `clearance` to the gun" — was
    tried first and FAILED: it selected 42,305 vertices (17 % of the mesh, because the whole
    gun-hugging face sits at exactly the clearance), did not converge over three rounds, and inflated
    the mold by up to 4.4 mm. Enforce against the failures you can prove, never against a predicate
    that the correct surface also satisfies.
    Y is never touched — `dy_max` in the summary must read 0.0.
    VERIFY with the gun-vertex parity test, not with a nearest-point normal sign: on a concave pocket
    the nearest-point normal lies and reports phantom 10 mm intrusions."""
    import bmesh
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from mathutils.kdtree import KDTree
    me=mold.data; N=len(me.vertices)
    P=_world_verts(mold); P0=P.copy()
    G=_world_verts(gun_solid); GN=np.empty((len(G),3))
    gun_solid.data.vertices.foreach_get("normal",GN.ravel()); GN=GN.reshape(-1,3)
    if keep_mask is None: keep_mask=np.ones(len(G),bool)
    gi=np.where(keep_mask)[0]
    log=[]
    for r in range(rounds):
        bmm=bmesh.new(); bmm.from_mesh(me); bvh=BVHTree.FromBMesh(bmm)
        def outside(p):
            v=Vector(p.tolist()); votes=0
            for d in ((1,0,0),(-1,0,0),(0,0,1),(0,0,-1),(0,1,0)):
                D=Vector(d); n=0; org=v.copy()
                for _ in range(64):
                    h=bvh.ray_cast(org+D*1e-4, D)
                    if h[0] is None: break
                    n+=1; org=h[0]
                votes += (n%2)
            return votes<3
        bad=[]
        for i in gi:
            v=Vector(G[i].tolist())
            loc,nor,idx,dd=bvh.find_nearest(v)
            if loc is None: continue
            s=(v-loc).dot(nor)
            if s<=screen: continue
            if outside(G[i]): bad.append((i, float(s)))
        bmm.free()
        log.append({"round":r,"screened":int(sum(1 for i in gi)),"confirmed_outside":len(bad),
                    "worst_mm":round(max([b[1] for b in bad]),3) if bad else 0.0})
        if not bad: break
        kd=KDTree(N)
        for j,p in enumerate(P): kd.insert(Vector(p.tolist()), j)
        kd.balance()
        add=np.zeros((N,3))
        for i,s in bad:
            n=GN[i].copy(); n[1]=0.0
            L=float(np.linalg.norm(n))
            if L<1e-6: continue
            n/=L
            need=min(s+clearance, cap)
            for (co,j,dist) in kd.find_range(Vector(G[i].tolist()), radius):
                t=dist/radius; w=1.0-(3*t*t-2*t*t*t)          # smoothstep falloff
                cand=n*(need*w)
                if np.linalg.norm(cand)>np.linalg.norm(add[j]): add[j]=cand
        P+=add
        me.vertices.foreach_set("co",P.ravel()); me.update()
    _shade(mold)
    nm,bd=_manifold(me); disp=np.linalg.norm(P-P0,axis=1)
    return {"rounds":log,"clearance":clearance,"moved_verts":int((disp>1e-4).sum()),
            "max_disp_mm":round(float(disp.max()),3),
            "dy_max":round(float(np.abs(P[:,1]-P0[:,1]).max()),6),
            "nonmanifold":nm,"boundary":bd}

def patch_region(mold, center, r_in=3.5, r_out=5.5, cap=1.5, iters=1):
    """FORCED local surface restoration at one coordinate — the manual escalation for when
    `preflight_mold` reports a defect that `fill_dimples`' thresholds do not reach (e.g. a residual
    seam left after a big slot is filled: the depth falls under `min_depth` but the normal break is
    still visible under cavity light).

    Fits a quadric to the annulus `r_in..r_out` around `center` and pulls everything inside `r_in`
    onto it with a smoothstep falloff. Use ONLY where the defect has been PROVEN manufactured — on a
    flank (running-max argument) or by measuring the gun and finding it smooth there. It has no
    arbiter of its own; that is the caller's job."""
    from mathutils.kdtree import KDTree
    from mathutils import Vector
    me=mold.data; N=len(me.vertices); P=_world_verts(mold); P0=P.copy()
    NR=np.empty((N,3)); me.vertices.foreach_get("normal",NR.ravel()); NR=NR.reshape(-1,3)
    c=np.asarray(center,dtype=float)
    for _ in range(iters):
        kd=KDTree(N)
        for j,p in enumerate(P): kd.insert(Vector(p.tolist()), j)
        kd.balance()
        nb=kd.find_range(Vector(c.tolist()), r_out)
        ann=[j for (co,j,dist) in nb if dist>=r_in]
        inner=[(j,dist) for (co,j,dist) in nb if dist<r_in]
        if len(ann)<20 or not inner: return {"applied":0,"reason":"too few neighbours"}
        Q=P[ann]; m=Q.mean(0); A=Q-m
        n=np.linalg.svd(A, full_matrices=False)[2][2]
        if float(n@NR[ann].mean(0))<0: n=-n
        t=np.array([1.0,0,0]) if abs(n[0])<0.9 else np.array([0,1.0,0])
        u=np.cross(n,t); u/=max(np.linalg.norm(u),1e-12); v=np.cross(n,u)
        def M(X):
            B=X-m; a=B@u; b=B@v
            return np.column_stack([np.ones_like(a),a,b,a*a,a*b,b*b]), B@n
        Ma,wa=M(Q); coef,_,_,_=np.linalg.lstsq(Ma,wa,rcond=None)
        idxs=np.array([j for j,_ in inner]); dists=np.array([dd for _,dd in inner])
        Mi,wi=M(P[idxs]); dev=wi-Mi@coef
        tt=dists/r_in; wgt=1.0-(3*tt*tt-2*tt*tt*tt)
        mv=np.clip(-dev*wgt, -cap, cap)
        P[idxs]=P[idxs]+n[None,:]*mv[:,None]
        me.vertices.foreach_set("co",P.ravel()); me.update()
    _shade(mold)
    nm,bd=_manifold(me); disp=np.linalg.norm(P-P0,axis=1)
    return {"applied":int((disp>1e-4).sum()),"max_move_mm":round(float(disp.max()),3),
            "annulus_rms":round(float((wa-Ma@coef).std()),4),"nonmanifold":nm,"boundary":bd}

def preflight_mold(mold, gun_solid, min_depth=0.25, max_diag=10.0, max_n=600, thr=0.10,
                   clearance=0.2, keep_mask=None, snr=2.5, gun_flat=0.16, flank_nx=0.70):
    """★★ THE PRE-EXPORT GATE. `assert preflight_mold(...)["ok"]` BEFORE writing any STL.

    Owner directive 2026-08-20d, after a fourth reject: *"STOP wasting my time and STOP guessing and
    START to check your work BEFORE you submit files!!!"* Three molds shipped with visible defects I
    could have found in seconds with a measurement instead of a render I glanced at. This function is
    that measurement, and it is not optional.

    Checks, all on the mesh that is about to be written:
      1. manifold 0 non-manifold / 0 boundary,
      2. every depression clustered and put to `_gun_arbiter` — anything deeper than `min_depth` that
         the owner's clean gun scan does NOT justify is a DEFECT, reported with its coordinates,
      3. no gun vertex outside the mold (ray-parity confirmed, not a normal-sign guess),
      4. `speck_report`.
    Returns `{"ok":bool, "defects":[...], "intrusions":n, ...}`. A False names WHERE to look; go render
    that coordinate under cavity light and fix it — do not export past it.

    ⚠ `speck_ok` is REPORTED BUT DELIBERATELY NOT PART OF `ok`. `speck_report`'s thresholds are
    calibrated at 0.4 mm voxel edge length, so on a DECIMATED mesh (edges ~2x longer) it reads False
    on geometry that a BVH proves is 0.003 mm from the gated surface — the documented density trap
    (08-17c). Gate the speck field on the PRE-DECIMATE mesh with `despeckle_mold` (step 3c); here it is
    advisory only. If it reads False post-decimate, verify with a BVH distance before believing it."""
    import bmesh, collections
    from mathutils import Vector
    from mathutils.kdtree import KDTree
    from mathutils.bvhtree import BVHTree
    me=mold.data; N=len(me.vertices); P=_world_verts(mold); ei,ej=_edges(me,N); me.update()
    NR=np.empty((N,3)); me.vertices.foreach_get("normal",NR.ravel()); NR=NR.reshape(-1,3)
    L=P.copy()
    for _ in range(2):
        S=np.zeros((N,3)); C=np.zeros(N)
        np.add.at(S,ei,L[ej]); np.add.at(C,ei,1); np.add.at(S,ej,L[ei]); np.add.at(C,ej,1)
        C[C==0]=1; L=S/C[:,None]
    d=np.einsum('ij,ij->i',L-P,NR)
    idx=np.where(np.abs(d)>thr)[0]; s=set(idx.tolist()); adj=collections.defaultdict(list)
    for a,b in zip(ei,ej):
        if a in s and b in s: adj[a].append(b); adj[b].append(a)
    G=_world_verts(gun_solid); kdg=KDTree(len(G))
    for j,p in enumerate(G): kdg.insert(Vector(p.tolist()), j)
    kdg.balance()
    bmg=bmesh.new(); bmg.from_mesh(gun_solid.data); bvhg=BVHTree.FromBMesh(bmg)
    seen=set(); defects=[]
    for v in idx.tolist():
        if v in seen: continue
        st=[v]; seen.add(v); g=[]
        while st:
            n_=st.pop(); g.append(n_)
            for x in adj[n_]:
                if x not in seen: seen.add(x); st.append(x)
        Q=P[g]; diag=float(np.linalg.norm(Q.max(0)-Q.min(0)))
        dep=float(np.abs(d[g]).max())
        if dep<min_depth or diag>max_diag or len(g)>max_n: continue
        c=Q.mean(0)
        if _gun_arbiter(bvhg,kdg,G,c,snr=snr,gun_flat=gun_flat,flank_nx=flank_nx): continue
        defects.append({"depth":round(dep,3),"diag":round(diag,2),"n":len(g),
                        "ctr":[round(float(x),1) for x in c]})
    bmg.free()
    defects.sort(key=lambda r:-r["depth"])
    # gun must be fully enclosed (parity-confirmed)
    bmf=bmesh.new(); bmf.from_mesh(me); bvhf=BVHTree.FromBMesh(bmf)
    km=np.ones(len(G),bool) if keep_mask is None else keep_mask
    pts=G[km]; nout=0; worst=0.0
    for p in pts:
        v=Vector(p.tolist()); loc,nor,i_,dd=bvhf.find_nearest(v)
        if loc is None or (v-loc).dot(nor)<=0.05: continue
        votes=0
        for D_ in ((1,0,0),(-1,0,0),(0,0,1),(0,0,-1),(0,1,0)):
            D=Vector(D_); n2=0; org=v.copy()
            for _ in range(64):
                h=bvhf.ray_cast(org+D*1e-4, D)
                if h[0] is None: break
                n2+=1; org=h[0]
            votes+=(n2%2)
        if votes<3: nout+=1; worst=max(worst,float((v-loc).dot(nor)))
    bmf.free()
    nm,bd=_manifold(me)
    sp=speck_report(mold)
    ok = (nm==0 and bd==0 and not defects and nout==0)
    return {"ok":bool(ok),"nonmanifold":nm,"boundary":bd,"defects":defects[:25],
            "n_defects":len(defects),"intrusions":nout,"intrusion_worst_mm":round(worst,3),
            "speck_ok":sp.get("ok"),"speck_hotspots":len(sp.get("hotspots",[])),
            "faces":len(me.polygons),"verts":N}

def beautify_decimated(obj, angle_deg=25.0):
    """Kill the speck field that DECIMATE-COLLAPSE re-creates, WITHOUT moving a single vertex.

    ★ 2026-08-20, G19 + GTL II: the pre-decimate mold audited **0 hotspots, ok:True**, and the
    decimated export audited **4 hotspot regions** that the owner could see as dots in his CAD —
    while the BVH said the two surfaces are 0.003 mm apart (p99). The geometry did not change; the
    TRIANGULATION did. Collapse leaves sliver triangles whose face normals scatter, and a normal
    break shades as a black speck exactly like a real pit (the 08-17b "the eye reads normals" rule,
    now with a topological cause instead of a geometric one).

    Because the defect is topology, the fix must be topology: `beautify_fill` flips edges to improve
    triangle aspect ratio and CANNOT move a vertex, so the surface stays bit-for-bit where the gated
    pre-decimate mesh put it. Restricted to edges whose dihedral angle is under `angle_deg` so no
    real crease, groove or cut-face border can be flipped across. In-place; returns the audit delta."""
    import bmesh
    _activate(obj)
    me=obj.data; N=len(me.vertices)
    P=_world_verts(obj)
    before=speck_report(obj)
    bm=bmesh.new(); bm.from_mesh(me)
    bm.faces.ensure_lookup_table(); bm.edges.ensure_lookup_table()
    lim=math.radians(angle_deg)
    flat=[e for e in bm.edges if len(e.link_faces)==2 and e.calc_face_angle(0.0)<lim]
    tris=[f for f in bm.faces if len(f.verts)==3]
    bmesh.ops.beautify_fill(bm, faces=tris, edges=flat, method='AREA')
    bm.to_mesh(me); bm.free(); me.update(); _shade(obj)
    P2=_world_verts(obj)
    after=speck_report(obj)
    nm,bd=_manifold(me)
    return {"flat_edges":len(flat), "hotspots_before":len(before.get("hotspots",[])),
            "hotspots_after":len(after.get("hotspots",[])), "ok":after.get("ok"),
            "vert_move_max_mm":round(float(np.abs(P2-P).max()),9),
            "faces":len(me.polygons), "verts":N, "nonmanifold":nm, "boundary":bd}

# ---------------------------------------------------------------- stage 8: decimate + re-solidify
def decimate_mold(obj, out_name="CGS_MOLD_FINAL", ratio=0.5, times=1, voxel=0.7, target_faces=250000,
                  remesh=False):
    # ★ BUDGET 250,000 — owner ruling 2026-08-20b. 123,000 visibly facets the curved surfaces (light
    #   body, lower rail, trigger-guard fill) and he reads the facets as "pimples", even though the
    #   geometry is only 0.024 mm from the smooth mesh. Do not lower it without a new ruling.
    """Reduce to a clean manifold solid at a controllable FACE BUDGET. Two modes:
    • remesh=True (default): decimate then voxel-remesh to the budget. Uniform quads, but the remesh
      ROUNDS corners to the voxel — fine when the sweep was coarse anyway.
    • remesh=False: decimate-COLLAPSE straight to target_faces and SKIP the voxel re-solidify. Collapse
      sheds flat faces first, so it PRESERVES the crisp corners a FINE sweep (e.g. 0.4) produced. This
      is the 'crisp corners + face budget' path (owner 2026-07-03): sweep+solidify at 0.4 for crisp
      corners, then decimate (not remesh) down to ~125k faces.
    ★ In remesh=True the RE-SOLIDIFY voxel — NOT the decimate — sets final density (the remesh
    regenerates), auto-solved from target_faces (faces ~ 1/voxel^2). In remesh=False the decimate ratio
    is solved from the current face count. Owner order: smooth -> offset -> decimate_mold -> EXPORT."""
    if not remesh and target_faces:
        src_tris=sum(len(p.vertices)-2 for p in obj.data.polygons)   # COLLAPSE triangulates -> budget is vs TRIS, not quads
        def _collapse(rr):
            w=_dup(obj, out_name); _activate(w)
            if rr<1.0:
                m=w.modifiers.new("dec","DECIMATE"); m.decimate_type='COLLAPSE'; m.ratio=rr
                bpy.ops.object.modifier_apply(modifier="dec")
            return w
        r=max(0.02, min(1.0, target_faces/float(max(src_tris,1))))
        work=_collapse(r); fa=len(work.data.polygons); tries=1
        while fa>0 and abs(fa-target_faces)/float(target_faces)>0.015 and tries<5:  # converge to <1.5% (owner band 120-125k)
            r=max(0.02, min(1.0, r*target_faces/float(fa)))
            bpy.data.objects.remove(work, do_unlink=True); work=_collapse(r); fa=len(work.data.polygons); tries+=1
        nm,bd=_manifold(work.data)
        return work, {"mode":"decimate-collapse","ratio":round(r,3),"target_faces":target_faces,
                      "faces":fa,"iters":tries,"verts":len(work.data.vertices),"nonmanifold":nm,"boundary":bd}
    work=_dup(obj, out_name+"_DEC"); _activate(work)
    for i in range(times):
        m=work.modifiers.new("dec%d"%i,"DECIMATE"); m.decimate_type='COLLAPSE'; m.ratio=ratio
        bpy.ops.object.modifier_apply(modifier=m.name)
    sol,ss=solidify_mold(work, out_name=out_name, voxel=voxel)
    if target_faces:
        f0=len(sol.data.polygons)
        if f0>0 and abs(f0-target_faces)/float(target_faces)>0.05:   # solve voxel to hit the face budget
            v2=round(max(0.2, voxel*(f0/float(target_faces))**0.5), 3)
            bpy.data.objects.remove(sol, do_unlink=True)
            sol,ss=solidify_mold(work, out_name=out_name, voxel=v2)
            ss["voxel_solved"]=v2
        ss["target_faces"]=target_faces
    bpy.data.objects.remove(work, do_unlink=True)
    ss["faces"]=len(sol.data.polygons); ss["decimated_x"]=times; ss["ratio"]=ratio
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

def export_gun(gun_solid, gun_name, out_dir=r"C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS"):
    """Export the REPOSITIONED original (GUN_SOLID) next to the mold — owner directive 2026-07-28.

    ★ WHY: `assemble_gun_solid` TRANSLATES the scan (mass on Y/Z, sight channel on X) so the mold is
    built in centered coords. The scan on disk is NOT in that frame. René re-imports BOTH the mold and
    the gun into Shapr3D and they must land aligned — which only works if the gun he imports is the
    MOVED one. Exporting only the mold forces him to re-align by hand every time.

    Writes `<out_dir>\\<gun_name> GUN.stl` alongside `<gun_name>.stl`. Always call it in the same run
    as `export_mold`, so the pair is guaranteed to come from the same centering."""
    import os
    os.makedirs(out_dir, exist_ok=True)
    path=os.path.join(out_dir, gun_name+" GUN.stl")
    for o in bpy.context.selected_objects: o.select_set(False)
    gun_solid.select_set(True); bpy.context.view_layer.objects.active=gun_solid
    try:
        bpy.ops.wm.stl_export(filepath=path, export_selected_objects=True, apply_modifiers=True)
    except Exception:
        bpy.ops.export_mesh.stl(filepath=path, use_selection=True)
    return {"path":path, "exists":os.path.exists(path),
            "size_kb":round(os.path.getsize(path)/1024,1) if os.path.exists(path) else 0,
            "verts":len(gun_solid.data.vertices)}

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
