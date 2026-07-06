"""
BLENDER DEPARTMENT — Holster Blocking, Phase 1 (Blender prep).
Automates Rene Spatz's manual Blender session (STEPS.docx steps 1-4):
  import scan STL -> voxel remesh (seal scan) -> decimate to a target face count -> center on X/Y/Z mass -> export STL.

Run (foreground, watchable):
  /Applications/Blender.app/Contents/MacOS/Blender --python holster_prep_phase1.py -- \
      --input "/path/01 ...SCAN FULL GUN.stl" --output "/tmp/hk45_prepped.stl" --faces 117500

Blender 5.0 API. Parametric. Prints a PHASE1_SUMMARY json line for verification.
"""
import bpy, sys, json, time

# ---- args (after the `--` separator) ------------------------------------------------
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(flag, default=None):
    return argv[argv.index(flag) + 1] if flag in argv else default
INPUT  = arg("--input",  "/Users/marcelspatz/Downloads/HK_45_TACTICAL_PACKAGE/01 HK_45_TACTICAL - SCAN FULL GUN.stl")
OUTPUT = arg("--output", "/tmp/hk45_prepped.stl")
TARGET_FACES = int(arg("--faces", "117500"))   # Rene's spec: 115000-120000
TARGET_LO, TARGET_HI = 115000, 120000

log = []
def step(msg):
    print(f"[phase1] {msg}", flush=True); log.append(msg)

def faces(o): return len(o.data.polygons)
def dims(o):  return tuple(round(d, 2) for d in o.dimensions)

# ---- 0. clean default scene (keep it just the gun) ----------------------------------
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
step("cleared default scene")

# ---- 1. import scan STL (Blender 5.0 = wm.stl_import) --------------------------------
if hasattr(bpy.ops.wm, "stl_import"):
    bpy.ops.wm.stl_import(filepath=INPUT)
else:                                              # very old fallback
    bpy.ops.import_mesh.stl(filepath=INPUT)
obj = bpy.context.selected_objects[0]
bpy.context.view_layer.objects.active = obj
obj.name = "HK45_block_prep"
f0, d0 = faces(obj), dims(obj)
step(f"imported: {f0} faces, dims(mm?)={d0}")

# ---- 2. voxel remesh — seal scan artifacts + watertight topology, self-tuned to OVERSHOOT the band ----
# Evaluate the remesh via depsgraph WITHOUT applying, going finer until faces >= TARGET_HI, so decimate (step 3)
# can land cleanly inside Rene's 115-120k band. Tuning on the same modifier avoids compounding remesh artifacts.
max_dim = max(obj.dimensions)
voxel = max_dim / 380.0                      # finer start than v1 (270 undershot at 87k)
rem = obj.modifiers.new("Remesh", 'REMESH'); rem.mode = 'VOXEL'; rem.adaptivity = 0.0
ef = None
for attempt in range(6):
    rem.voxel_size = voxel
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    ef = len(obj.evaluated_get(dg).data.polygons)
    step(f"remesh probe {attempt}: voxel={voxel:.4f} -> ~{ef} faces (eval)")
    if ef >= TARGET_HI:
        break
    voxel *= 0.82                            # go finer (more faces) and retry
bpy.ops.object.modifier_apply(modifier="Remesh")
step(f"voxel remesh applied @ {voxel:.4f} -> {faces(obj)} faces")

# ---- 3. decimate down into Rene's 115k-120k band ------------------------------------
for i in range(4):
    cur = faces(obj)
    if TARGET_LO <= cur <= TARGET_HI:
        step(f"face count {cur} within [{TARGET_LO},{TARGET_HI}] - in band"); break
    if cur < TARGET_LO:
        step(f"WARNING: {cur} < {TARGET_LO} (remesh undershot; rerun with a finer voxel)"); break
    ratio = max(0.02, min(0.98, TARGET_FACES / cur))
    dec = obj.modifiers.new(f"Decimate{i}", 'DECIMATE'); dec.decimate_type = 'COLLAPSE'; dec.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=f"Decimate{i}")
    step(f"decimate pass {i} ratio={ratio:.4f} -> {faces(obj)} faces")

# ---- 4. center: origin to mass center, then move to world origin (X/Y/Z zeroed) ------
bpy.ops.object.origin_set(type='ORIGIN_CENTER_OF_MASS', center='MEDIAN')
obj.location = (0.0, 0.0, 0.0)
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
step(f"centered on mass; final dims={dims(obj)}")

# ---- 5. export prepped STL ----------------------------------------------------------
try:
    if hasattr(bpy.ops.wm, "stl_export"):
        bpy.ops.wm.stl_export(filepath=OUTPUT, export_selected_objects=False)
    else:
        bpy.ops.export_mesh.stl(filepath=OUTPUT)
    step(f"exported -> {OUTPUT}")
    exported = True
except Exception as e:
    step(f"EXPORT FAILED: {e}"); exported = False

# ---- viewport: frame it + nice shading so it's watchable ----------------------------
try:
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            for space in area.spaces:
                if space.type == 'VIEW_3D':
                    space.shading.type = 'SOLID'
            with bpy.context.temp_override(area=area, region=area.regions[-1]):
                bpy.ops.view3d.view_selected()
except Exception as e:
    step(f"viewport frame skipped: {e}")

summary = {
    "input": INPUT, "output": OUTPUT if exported else None,
    "faces_initial": f0, "faces_final": faces(obj),
    "in_target_band": TARGET_LO <= faces(obj) <= TARGET_HI,
    "dims_initial_mm": d0, "dims_final_mm": dims(obj),
    "voxel_size": round(voxel, 5), "centered": True, "exported": exported,
}
print("PHASE1_SUMMARY " + json.dumps(summary), flush=True)
step("Phase 1 complete — Blender stays open for you to inspect.")
