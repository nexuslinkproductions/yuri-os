---
name: cgs-align
description: Align an uploaded STL (usually a gun or a weapon-light) to a canonical world-XYZ pose, mass-centered, fully inside Blender via blender-mcp. ALIGNMENT ONLY — rotate to the canonical pose and move the mass center to the origin; no seal, no union, no voxel, no decimate, no cut, no offset, no export. Use when René says "align this STL", "cgs-align", "align <gun/light> to XYZ", or provides an STL + active Blender MCP and asks only to align it. Blender-only. Sibling of cgs-mold (same axis convention so an aligned object can feed cgs-mold directly).
triggers: ["cgs-align", "/cgs-align", "align this stl", "align stl to xyz", "align the gun to xyz", "align to xyz", "center and align stl", "align this light", "level the gun"]
---

# cgs-align — uploaded STL → canonical world-XYZ pose (Blender-only, alignment ONLY)

Takes an STL already imported into Blender (or imports one), and applies **one rigid transform** to put
it in René's canonical pose and centre it on origin. Nothing else — same detail, same vertex count, only
moved. Owner-validated live on the SIG P226 X-Five (2026-07-03).

> Sibling of **cgs-mold**, sharing its axis convention so an aligned object drops straight into that
> pipeline. This skill deliberately does **NOT** do any of cgs-mold's processing — see SCOPE.

## Canonical pose (owner spec 2026-07-03 — "you must make alignment perfect")

```
Muzzle / light bezel  -> -Y   (points LEFT in the +X-side view)
Grip                  -> -Z   (points DOWN)
Slide                 -> level (the slide TOP is horizontal, along Y)
Width                 -> X     (upright, no roll; sign by right-hand rule, det(R)=+1, never a mirror)
Mass center           -> origin (0,0,0), all 3 axes on the volume centroid
```

## SCOPE — alignment only

Do **only** the alignment. Explicitly out of scope (cgs-mold's job): seal / island-union / voxel-remesh /
solidify / decimate / smooth / grip-cut / offset / split / export. A pure rigid transform: **lossless,
reversible, non-mutating to geometry.**

## Method (what the engine does — each step calibrated against René's hand-posed gun)

1. **Mass center = volume centroid** (divergence-theorem tetrahedra; fallback: area-weighted surface →
   vertex mean). Pure mass on all 3 axes.
2. **Principal axes** from area-weighted surface covariance (density-robust directions); label
   length/height/width by robust 2/98-pct bbox extent → fixes **roll, yaw, width**.
3. **Muzzle left (−Y)** — the length third with the larger height extent is the grip/rear (+Y); the thin
   end is the muzzle (−Y). Sign-independent, so done first.
4. **Grip down (−Z)** — the heavy grip pulls the **rear third's mean height BELOW the front third's**
   (calibrated 43mm margin on the SIG). Robust where "farthest reach from the mass center" failed: the
   tall **front sight** competes with the grip and the grip-shifted origin inverted it → flipped the gun
   upside-down (owner had to apply a manual Ry+180).
5. **Slide level** — level the **slide-TOP flat** (the surface the owner's red line follows): take the
   area-weighted consensus normal of the UP-facing faces in the upper-forward region and rotate it to
   **+Z**, iterated to a fixed point. UP-faces only + iterate = stable, idempotent, and immune to
   sight/optic bumps and slab taper (point-cloud PCA landed ~15° off; both-flats flipped ~37% of poses).
6. **Manual pitch tweak** — `pitch_offset_deg` adds a pitch about X on top of the auto-level for the
   owner's eye (+ tips the muzzle down). Default 0.
7. **Apply** — `New = (P − center) @ Rᵀ`, `R` rows = `[x̂, ŷ, ẑ]`; `matrix_world = identity`. The applied
   `center` + `R` are stored on the object (`cgs_align_center`, `cgs_align_R`) for audit / `unalign_object`.

> **Lights** (step 2): the light is elongated too, so bezel → −Y / long axis → Y falls out of the same
> PCA + muzzle-left logic. The gun-specific grip-down / slide-level steps degrade gracefully (no grip, no
> slide) — `ambiguous_axes`/render-verify flags when the sign is a guess. Bezel-left is the light's spec.

## Invocation (blender-mcp must be live on :9876)

```python
exec(open(r"C:\Users\rene\.claude\skills\cgs-align\scripts\cgs_align.py").read(), globals())

obj, s = align_object()                     # active / sole mesh, in place
obj, s = align_object("SIG P226 XFIVE FULL GUN")
obj, s = align_object(name, pitch_offset_deg=1.5)   # nudge the pitch by eye
obj, s = import_and_align(r"C:\Users\rene\Desktop\CAD\...\scan.stl")

print(s)   # aligned_ok, det_R (==1.0), center_residual_mm (~0), R_offdiag_max (~0),
           # dims (Y>=Z>=X), front_y (muzzle, min), grip_is_down, slide_leveled_deg, ambiguous_axes
```

- `align_object(obj_name=None, in_place=True, out_name=None, level_slide=True, pitch_offset_deg=0.0)` — entry point.
- `import_and_align(path, in_place=True)` — import STL then align.
- `unalign_object(name)` — reverse a prior align from the stored transform.

## Verify (do this on every real run)

Confirm the returned evidence: `det_R == 1.0`, `center_residual_mm < 0.05`, `R_offdiag_max < 0.01`,
`dims_ordered_yzx`, `grip_is_down == True`, muzzle at `front_y` (min Y). Then **render a side view with a
horizontal reference bar** (a thin cuboid along Y at Z=0) and confirm the slide top is parallel to it —
do NOT trust the eye alone on the raw render (an elongated gun with a low-rear grip reads as tilted even
when level; this fooled the build repeatedly until the bar + measurement settled it). If the owner's eye
wants a touch more/less pitch, set `pitch_offset_deg`.

## Safety conventions

- **Rigid transform only** — no geometry change, no vertex-count change, fully reversible (`unalign_object`).
- `in_place=True` mutates the object's transform (safe: lossless + reversible). `in_place=False` writes a copy.
- Never touch protected paths; reads/writes only the Blender object.

## Status / scope

- **OWNER-VALIDATED LIVE 2026-07-03** on the SIG P226 X-Five FULL GUN (63,464 verts): muzzle −Y, grip −Z,
  slide level (matches René's hand-posed reference within ~1mm on every bbox extent; slide top parallel to
  a rendered horizontal bar). det +1, centered 0.0mm, upright, straight.
- **Offline: 300/300 random gun poses** pass (det, axis order, centering, off-diagonal, grip-down,
  muzzle-left, slide-level) + volume-centroid, near-cubic light, ambiguity, reversibility.
  Re-run: `"…/Blender 5.1/5.1/python/bin/python.exe" scripts/verify_align_math.py`.
- **Lights: PENDING** first live run (bezel-left; gun heuristics degrade gracefully).
- Depends on **blender-mcp** live on :9876.

## Session Notes

### 2026-07-03 (v1.0.0, created + owner-validated on the SIG P226)
- Built from cgs-mold's alignment intelligence into a standalone alignment-only skill.
- **Canonical pose is owner-defined** (via his hand-posed correction): muzzle LEFT, grip DOWN, slide LEVEL,
  mass-centered. Early builds got muzzle-left + centering right but shipped the gun **upside-down** (Z-sign)
  and **tilted** (pitch) — both caught by René against his Blender viewport.
- **Two calibrated fixes**, keyed off his hand-posed ground truth: (a) grip-down = rear-vs-front mean
  height (the "farthest reach" test was inverted by the tall front sight + mass-shifted origin);
  (b) slide-level = slide-top up-face consensus normal → +Z, iterated (point-cloud slab PCA landed ~15°
  off; a both-flats variant flipped ~37% of poses in offline testing before being replaced).
- **Process lesson (worth keeping):** my numeric verifier initially *shared the aligner's blind spot* and
  rubber-stamped a wrong pose; the raw side render also fooled the eye (wedge-shaped gun reads as tilted).
  Ground truth came only from (1) the owner's Blender viewport, (2) rendering against a known-horizontal
  bar, (3) measuring against his hand-posed pose. Trust independent references, not a verifier that can
  share the bug.
- Tools: Read, Write, Edit, Bash (Blender-5.1 python numpy test), blender-mcp (execute_blender_code, renders).
- Registered at `.claude/skills/cgs-align/` (git-tracked). Alias: `commands/cgs-align.md`.
