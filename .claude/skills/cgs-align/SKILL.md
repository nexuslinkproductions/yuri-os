---
name: cgs-align
description: Align an uploaded STL (a gun via mode="gun", or a weapon-light via mode="light") to a canonical world-XYZ pose, mass-centered, fully inside Blender via blender-mcp. ALIGNMENT ONLY — rotate to the canonical pose and move the mass center to the origin; no seal, no union, no voxel, no decimate, no cut, no offset, no export. Gun: muzzle −Y, grip −Z, slide/rail level. Light: rail clamp +Z & level, bezel −Y. Use when René says "align this STL", "cgs-align", "align <gun/light> to XYZ", or provides an STL + active Blender MCP and asks only to align it. Blender-only. Sibling of cgs-mold (same axis convention so an aligned object can feed cgs-mold directly).
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
5. **Slide level** — owner's rule: "level to the SLIDE and/or the PICATINNY RAIL — both straight,
   bore-parallel." Take the area-weighted consensus normal of the near-HORIZONTAL flats (within ~20° of
   vertical — a TIGHT cone that excludes the slide's angled top bevels) and rotate it to **+Z**, iterated
   to a fixed point. **Primary reference = the DOWN-facing forward flats** (the picatinny rail + slide /
   dust-cover underside — the cleanest bore-parallel surface, no sights/optic/serrations), with a fallback
   to the slide-TOP up-flats if the underside is too sparse (no-rail gun). Landed the SIG slide ridge at
   **−0.14°** ("perfect", owner-confirmed). Rejected en route: point-cloud slab-PCA (~15° off), up-faces
   with a loose 30° cone (caught the top bevels → left the true slide/rail ~1.7° off).
6. **Manual pitch tweak** — `pitch_offset_deg` adds a pitch about X on top of the auto-level for the
   owner's eye (+ tips the muzzle down). Default 0.
7. **Apply** — `New = (P − center) @ Rᵀ`, `R` rows = `[x̂, ŷ, ẑ]`; `matrix_world = identity`. The applied
   `center` + `R` are stored on the object (`cgs_align_center`, `cgs_align_R`) for audit / `unalign_object`.

## Method — LIGHT mode (`mode="light"`, owner-confirmed on the OLIGHT PL2 Valkyrie 2026-07-03)

A weapon-light is **near-symmetric** (round body, no grip/slide/sight), so the gun heuristics don't apply
— `mode="light"` uses light-specific features. Canonical light pose: **rail clamp → +Z (up) & level,
bezel → −Y (left)**, mass-centered.

1. **Long axis → Y** (PCA extent), same as the gun.
2. **Rail clamp → up (+Z)** — owner's primary cue. The rail-clip mounting face is the **most STRUCTURED
   large flat** (rail slot + cross-bolt + lever); the battery/body flat is smooth. Score each outward
   direction by **`flat_area × structural_complexity²`** and take the max → that face's outward normal is
   UP. ★ Calibrated on the PL2: the body flat had MORE raw area (1158 vs 965) but the clamp face is far
   more complex (1.09 vs 0.88), so `complexity²` tips the score to the clamp — area alone picks the wrong
   (smooth) face. Then **level** it: set the clamp mounting-flat consensus normal exactly to +Z (fixes
   roll + pitch together).
3. **Bezel → −Y** — the clamp sits rear-of-centre and the bezel protrudes forward, so the bezel is the
   length end FARTHEST from the clamp's Y-position. **Caveat:** weak when the clamp is centered
   (`clamp_y_pos ≈ 0`, as on the PL2 — it worked but by a thin margin); the reflector-dish cue is the
   intended tiebreaker (not yet wired). Render-verify the bezel direction on lights.
4. **Apply** — same as gun (bake verts, identity matrix, store transform).

## Invocation (blender-mcp must be live on :9876)

```python
exec(open(r"C:\Users\rene\.claude\skills\cgs-align\scripts\cgs_align.py").read(), globals())

obj, s = align_object()                     # GUN (default), active / sole mesh, in place
obj, s = align_object("SIG P226 XFIVE FULL GUN")
obj, s = align_object(name, pitch_offset_deg=1.5)   # nudge the gun pitch by eye
obj, s = align_object("PL2_VALKYRIE - Copy", mode="light")   # LIGHT: clamp up+level, bezel left
obj, s = import_and_align(r"C:\Users\rene\Desktop\CAD\...\scan.stl")

print(s)   # aligned_ok, det_R (==1.0), center_residual_mm (~0), R_offdiag_max (~0),
           # dims (Y>=Z>=X), front_y (muzzle, min), grip_is_down, slide_leveled_deg, ambiguous_axes
```

- `align_object(obj_name=None, in_place=True, out_name=None, level_slide=True, pitch_offset_deg=0.0, mode="gun")` — entry point. `mode="light"` for weapon-lights.
- `import_and_align(path, in_place=True)` — import STL then align (gun mode).
- `unalign_object(name)` — reverse a prior align from the stored transform.

## Verify (do this on every real run)

Confirm the returned evidence (gun): `det_R == 1.0`, `center_residual_mm < 0.05`, `R_offdiag_max < 0.01`,
`dims_ordered_yzx`, `grip_is_down == True`, muzzle at `front_y` (min Y). For a light: `det_R == 1.0`,
`clamp_complexity` clearly the max (the structured face was found). Then **render a side view with a
horizontal reference bar** (a thin cuboid along Y at Z=0) and confirm the slide top / clamp face is
parallel to it — do NOT trust the eye alone on the raw render (an elongated gun with a low-rear grip
reads as tilted even when level; this fooled the build repeatedly until the bar + measurement settled it).
On a light, also confirm the **bezel points −Y** (the far-from-clamp cue is weak for a centered clamp).
If the owner's eye wants a touch more/less gun pitch, set `pitch_offset_deg`.

## Safety conventions

- **Rigid transform only** — no geometry change, no vertex-count change, fully reversible (`unalign_object`).
- `in_place=True` mutates the object's transform (safe: lossless + reversible). `in_place=False` writes a copy.
- Never touch protected paths; reads/writes only the Blender object.

## Status / scope

- **OWNER-CONFIRMED "PERFECT" 2026-07-03** on the SIG P226 X-Five FULL GUN (63,464 verts): muzzle −Y,
  grip −Z, slide/rail level (slide-top ridge −0.14°; matches René's hand-posed reference within ~1mm on
  every bbox extent). det +1, centered 0.0mm, upright, straight. Verified in René's own Blender viewport.
- **Offline: 300/300 random gun poses** pass (det, axis order, centering, off-diagonal, grip-down,
  muzzle-left, slide-level) + volume-centroid, near-cubic light, ambiguity, reversibility.
  Re-run: `"…/Blender 5.1/5.1/python/bin/python.exe" scripts/verify_align_math.py`.
- **LIGHT MODE OWNER-CONFIRMED 2026-07-03** on the OLIGHT PL2 Valkyrie (63,112 verts, `mode="light"`):
  rail clamp up + level, bezel −Y. Clamp found by `flat_area × complexity²` (structure, not size).
- Depends on **blender-mcp** live on :9876.

## Session Notes

### 2026-07-03 (v1.0.0, created + owner-validated on the SIG P226)
- Built from cgs-mold's alignment intelligence into a standalone alignment-only skill.
- **Canonical pose is owner-defined** (via his hand-posed correction): muzzle LEFT, grip DOWN, slide LEVEL,
  mass-centered. Early builds got muzzle-left + centering right but shipped the gun **upside-down** (Z-sign)
  and **tilted** (pitch) — both caught by René against his Blender viewport.
- **Two calibrated fixes**, keyed off his hand-posed ground truth: (a) grip-down = rear-vs-front mean
  height (the "farthest reach" test was inverted by the tall front sight + mass-shifted origin);
  (b) slide-level = consensus normal of the near-horizontal flats (tight 20° cone) → +Z, iterated,
  **primary reference the DOWN-facing forward flats (picatinny rail + underside)**. Leveling evolved
  live: point-cloud slab-PCA (~15° off) → up-faces / loose 30° cone (caught the top bevels, left the
  real slide/rail ~1.7° off) → tight both-flats (~1.1°) → rail-primary (**−0.14°, "perfect"**).
- **Process lesson (worth keeping):** my numeric verifier initially *shared the aligner's blind spot* and
  rubber-stamped a wrong pose; the raw side render also fooled the eye (wedge-shaped gun reads as tilted).
  Ground truth came only from (1) the owner's Blender viewport, (2) rendering against a known-horizontal
  bar, (3) measuring against his hand-posed pose. Trust independent references, not a verifier that can
  share the bug.
- Tools: Read, Write, Edit, Bash (Blender-5.1 python numpy test), blender-mcp (execute_blender_code, renders).
- Registered at `.claude/skills/cgs-align/` (git-tracked). Alias: `commands/cgs-align.md`.

### 2026-07-03 (light mode, owner-confirmed on the OLIGHT PL2 Valkyrie)
- Added `mode="light"` (`compute_alignment_light`). Gun heuristics don't transfer — a light is near-symmetric
  (round body, no grip/slide/sight). Owner references: **rail clip = up + level (primary), bezel = left**.
- Failures en route (both left the clamp on the SIDE, not up): (a) gun-mode grip/rail logic; (b) a
  "deepest-concavity channel" detector (locked onto the 11.6mm lever gap, not the shallow rail slot).
- **Calibrated against ground truth** (clamp known at +X): the clamp face has the SAME-or-LESS flat area
  than the smooth body panel (965 vs 1158) but far higher **structural complexity** (1.09 vs 0.88) from the
  rail slot + cross-bolt + lever. Score `flat_area × complexity²` → picks the clamp; area alone picks the
  body. Then level the clamp mounting-flat consensus normal → +Z. Bezel = far-from-clamp (weak when the
  clamp is centered, as here — worked by a thin margin; reflector-dish tiebreaker noted, not yet wired).
- Same lesson as the gun: renders fool the eye; the owner's viewport + a per-side calibration are ground truth.
