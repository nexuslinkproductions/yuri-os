---
name: cgs-align
description: Align an uploaded STL (usually a gun or a weapon-light) perfectly to world XYZ, mass-centered, fully inside Blender via blender-mcp. ALIGNMENT ONLY — rotate the object's principal axes onto XYZ and move its mass center to the origin; no seal, no union, no voxel, no decimate, no cut, no offset, no export. Use when René says "align this STL", "cgs-align", "align <gun/light> to XYZ", or provides an STL + active Blender MCP and asks only to align it. Blender-only. Sibling of cgs-mold (shares the same axis convention so an aligned object can feed cgs-mold directly).
triggers: ["cgs-align", "/cgs-align", "align this stl", "align stl to xyz", "align the gun to xyz", "align to xyz", "center and align stl", "align this light"]
---

# cgs-align — uploaded STL → aligned to world XYZ (Blender-only, alignment ONLY)

Takes an STL already imported into Blender (or imports one), and applies **one rigid transform**:
rotate the object so its principal axes land on world **XYZ**, then translate its **mass center** to the
origin. Nothing else. A gun or a weapon-light goes in crooked/off-origin; it comes out square on the axes
and centered. Same detail, same vertex count, same faces — only moved.

> Sibling of **cgs-mold**. It shares cgs-mold's axis convention on purpose: an object aligned here drops
> straight into the cgs-mold pipeline (`assemble_gun_solid` → `sweep_dip` → …) already oriented.
> This skill deliberately does **NOT** do any of cgs-mold's processing — see SCOPE.

## SCOPE — alignment only (owner directive 2026-07-03)

Do **only** the alignment. Explicitly out of scope (that is cgs-mold's job, not this skill's):
seal / island-union / voxel-remesh / solidify / decimate / smooth / grip-cut / offset / split / export.
A pure rigid transform: **lossless, reversible, non-mutating to geometry.**

## Axis convention (inherited from cgs-mold)

```
Y = length / draw axis   — muzzle (front) at -Y,  grip (rear) at +Y
Z = height / up          — slide top / sights at +Z,  grip toe at -Z
X = width                — sign fixed by right-handedness (X = Y × Z), det(R) = +1 (never a mirror)
```

## Method (what the engine does)

1. **Mass center = volume centroid** of the closed solid (divergence-theorem tetrahedra). Fallbacks:
   area-weighted surface centroid → vertex mean. **PURE MASS CENTER on ALL 3 AXES** (owner 2026-07-03 —
   NOT cgs-mold's sight-channel X; that trick is mold-seam-specific and is intentionally not used here).
2. **Principal-axis DIRECTIONS** = eigenvectors of the **area-weighted surface covariance** about the mass
   center (area-weighting removes scan vertex-density bias). **Axis LABELS** (length/height/width) assigned
   by the **robust bbox extent** (2/98 percentile) along each direction, so "longest edge → Y" holds
   literally even on a near-cubic object.
3. **Sign fix** (gun heuristics, degrade gracefully on a featureless light):
   - **Y:** the grip end has the larger **height** extent (it hangs down) → grip → **+Y**.
   - **Z:** the slide top spans the full **length** → the taller-in-length half → **+Z**.
   - **X:** `x̂ = ŷ × ẑ` → forces a right-handed **proper** rotation (no mirror).
4. **Apply:** `New = (P − center) @ Rᵀ`, `R` rows = `[x̂, ŷ, ẑ]`; then `matrix_world = identity`. The applied
   `center` + `R` are stored on the object (`cgs_align_center`, `cgs_align_R`) for audit / `unalign_object`.

## Invocation (blender-mcp must be live on :9876)

Run the engine inside Blender via `execute_blender_code`; it execs the on-disk module so the logic stays
version-controlled.

```python
# Windows (René's box). Forward slashes or a raw string in Blender.
exec(open(r"C:\Users\rene\.claude\skills\cgs-align\scripts\cgs_align.py").read(), globals())

# A) object already imported in the scene (align the active/selected mesh, or name it):
obj, s = align_object()                 # active or the sole mesh
obj, s = align_object("01_Glock 43X")   # by name
# B) or import an STL from disk and align in one shot:
obj, s = import_and_align(r"C:\Users\rene\Desktop\CAD\...\scan.stl")

print(s)   # -> aligned_ok, det_R (must be 1.0), center_residual_mm (~0), R_offdiag_max (~0),
           #    dims (dim_y>=dim_z>=dim_x), front_y (muzzle, min), rear_y (grip), top_z, ambiguous_axes
```

- `align_object(obj_name=None, in_place=True, out_name=None)` — the entry point. `in_place=True` transforms
  the object itself (lossless); `in_place=False` writes an aligned copy `<name>_ALIGNED` and leaves the source.
- `import_and_align(path, in_place=True)` — import STL then align.
- `unalign_object(name)` — reverse a prior align from the stored transform (undo / audit).

## Verify (do this on every real run)

The engine self-checks and returns evidence — confirm all of:
- `det_R == 1.0` (proper rotation, no mirror) · `center_residual_mm < 0.05` (mass center on origin)
- `R_offdiag_max < 0.01` (principal axes on world axes) · `dims_ordered_yzx == True` (Y≥Z≥X)
- `front_y` (min Y) is the muzzle, `rear_y` (max Y) the grip, `top_z` the slide top.
- If `ambiguous_axes == True` (near-cubic / symmetric input, e.g. a bare light), the forward/up **sign**
  is best-effort — **render-verify** and, if flipped, rotate 180° about the needed axis by hand.

Then **render** the aligned object (`bpy.ops.render.opengl(view_context=True)` → PNG → Read it) to confirm
the gun sits muzzle-forward (−Y), grip-down/rear (+Y, −Z), slide-up (+Z). The owner's eye is the final gate.

## Safety conventions

- **Rigid transform only** — no geometry change, no vertex-count change, no detail loss; fully reversible
  (`unalign_object`, or the stored `cgs_align_R`/`cgs_align_center`).
- `in_place=True` mutates the object's transform (safe: lossless + reversible). Use `in_place=False` for a
  non-destructive copy if the source must stay put.
- Never touch protected paths; this skill reads/writes only the Blender object.

## Status / scope

- **MATH VERIFIED (offline, 2026-07-03):** `scripts/verify_align_math.py` on Blender-5.1 python (numpy 2.3.4)
  — 300 random rigid poses of a synthetic gun: **0 failures** on det=+1, axis ordering, centering (<0.05mm),
  off-diagonal (<0.01), grip→+Y, slide→+Z. Volume-centroid, near-cubic light, ambiguity flag, and
  reversibility all pass. Re-run: `"…/Blender 5.1/5.1/python/bin/python.exe" scripts/verify_align_math.py`.
- **PENDING:** first live run inside Blender on a real scan (the bpy wrapper — `_world_arrays`,
  `foreach_set`, `matrix_world.identity()` — is unverified against a live scene; render-verify the first one).
- Depends on **blender-mcp** live on :9876 (the addon was not running at build time).

## Session Notes

### 2026-07-03 (v1.0.0, created)
- Built from cgs-mold's alignment intelligence, extracted into a standalone alignment-only skill (owner
  request: "align an uploaded STL to XYZ, based on cgs-mold; only alignment, no other processing").
- **Two owner decisions** (via AskUserQuestion): (1) **rotate + center** (full align, PCA→axes + sign
  disambiguation + center), not center-only; (2) **PURE MASS CENTER on all 3 axes** — NOT cgs-mold's
  sight-channel X (that is mold-seam-specific). Both baked into the engine + documented above.
- **Adversarial verification, offline** (Blender addon was down): wrote a pure-numpy harness testing the
  REAL engine functions. Caught + fixed two real issues during the loop — (a) covariance *eigenvalue*
  order can disagree with the bbox longest-edge on near-cubic shapes → switched axis LABELING to robust
  2/98-percentile projected **extent** (directions still from covariance); (b) ambiguity flag now reads
  extent ratios, not eigenvalues. Final: 300/300 gun poses + all edge cases pass.
- Tools: Read (cgs-mold SKILL + engine), Write, Edit, Bash (Blender-python numpy test). Errors during
  build: numpy-2.0 `ndarray.ptp` removal (fixed → `np.ptp`), test-mesh box winding not uniformly outward
  (fixed → correct outward triangles) — both in the TEST harness, not the engine.
- Registered at `.claude/skills/cgs-align/` (git-tracked, same as cgs-mold). Alias: `commands/cgs-align.md`.
