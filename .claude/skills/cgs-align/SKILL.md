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
4. **Grip down (−Z)** — *"is the grip below the bore?"*: compare the **rear third's AREA-WEIGHTED mean
   height** to the **middle third's** (the frame/slide body = a clean bore-height reference). Grip below
   mid → grip on −Z; above → flip. Rear-vs-**mid** (both exclude the FRONT) survives the two front features
   that broke earlier tries: an **under-barrel weapon-light** (dumps low mass at the front, dragged the
   front MEAN below the rear → flipped René's HK SFP9 upside-down, 2026-07-07) and a **tall front sight /
   optic** (out-reaches the grip upward → broke "farthest reach from mass center" on the SIG). Area-weighted
   so scan vertex-density can't swing it. Verified on the real HK mesh: rear −7.7 vs mid +5.9, a **13.6mm
   margin** (a vertex mean gave the wrong sign). Superseded a rear-vs-front **mean**-height test (the HK
   flip), which had superseded farthest-reach (the SIG flip).
5. **Slide level** — owner's rule: "level to the SLIDE and/or the PICATINNY RAIL — both straight,
   bore-parallel." Take the area-weighted consensus normal of the near-HORIZONTAL flats (within ~20° of
   vertical — a TIGHT cone that excludes the slide's angled top bevels) and rotate it to **+Z**, iterated
   to a fixed point. **Primary reference = the DOWN-facing forward flats** (the picatinny rail + slide /
   dust-cover underside — the cleanest bore-parallel surface, no sights/optic/serrations), with a fallback
   to the slide-TOP up-flats if the underside is too sparse (no-rail gun). Landed the SIG slide ridge at
   **−0.14°** ("perfect", owner-confirmed). Rejected en route: point-cloud slab-PCA (~15° off), up-faces
   with a loose 30° cone (caught the top bevels → left the true slide/rail ~1.7° off).
6. **Manual pitch tweak** — `pitch_offset_deg` adds a pitch about X on top of the auto-level for the
   owner's eye. Default 0. **SIGN (verified 2026-07-04 on the Walther PDP): `+` tips the muzzle UP**, `−`
   tips it down — the reverse of an earlier note. On the PDP the rail-primary auto-level left the slide
   ~3° muzzle-down (the rail underside is NOT parallel to the slide there); `pitch_offset_deg=+3.0` leveled
   it, owner-confirmed. See Session Notes 2026-07-04.
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
3. **Bezel → −Y** — the **REFLECTOR/lens end** (owner cue #2). Do NOT key off the mount's position — it
   varies (clamp vs single screw, centered vs offset). Key off the light-emitting end itself: score each
   end by `cap_area × reflector_bowl_depth` (forward-facing lens cap × how much the centre is recessed
   behind the rim). Higher end → bezel → −Y. Calibrated on the PL2: bezel 2573 vs tail 1428 (1.8× margin);
   robust from a scrambled start. Render-verify the bezel direction on lights.
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
`clamp_complexity` clearly the max (the structured mount was found), `bezel_score_front > bezel_score_rear`
(reflector at −Y). Then **render a side view with a horizontal reference bar** (a thin cuboid along Y at
Z=0) and confirm the slide top / clamp face is parallel to it — do NOT trust the eye alone on the raw
render (an elongated gun with a low-rear grip reads as tilted even when level; this fooled the build
repeatedly until the bar + measurement settled it). On a light, also confirm the **bezel points −Y**.
If the owner's eye wants a touch more/less gun pitch, set `pitch_offset_deg`.

## Safety conventions

- **Rigid transform only** — no geometry change, no vertex-count change, fully reversible (`unalign_object`).
- `in_place=True` mutates the object's transform (safe: lossless + reversible). `in_place=False` writes a copy.
- Never touch protected paths; reads/writes only the Blender object.

## Status / scope

- **OWNER-CONFIRMED "PERFECT" 2026-07-03** on the SIG P226 X-Five FULL GUN (63,464 verts): muzzle −Y,
  grip −Z, slide/rail level (slide-top ridge −0.14°; matches René's hand-posed reference within ~1mm on
  every bbox extent). det +1, centered 0.0mm, upright, straight. Verified in René's own Blender viewport.
- **OWNER-CONFIRMED "PERFECT" 2026-07-04** on the Walther PDP STEEL FRAME SOLID GUN (61,240 verts):
  aligned + slide-leveled with `pitch_offset_deg=+3.0`. Auto-level leveled to the rail underside, which on
  this gun sits ~3° off the slide (the owner's true datum) — the manual pitch corrected it. This run also
  fixed the pitch-sign doc (`+` = muzzle UP). det +1, grip −Z, muzzle −Y, owner-verified in his viewport.
- **HARDENED 2026-07-07 for under-barrel weapon-light guns** on René's HK SFP9 TLR-8A (63,866 verts): the
  raw aligner shipped it upside-down (grip-down heuristic inverted by the TLR-8A's front-low mass); the
  grip-down test was rebuilt (rear-third-vs-mid-third area-weighted height) and verified on the real mesh.
  Live end-to-end re-run from the raw pose is **pending a blender-mcp reconnect** (the socket dropped
  mid-session) — the changed decision is already proven on the real geometry (13.6mm margin).
- **Offline: 300/300 random gun poses** pass (det, axis order, centering, off-diagonal, grip-down,
  muzzle-left, slide-level) **+ 240 under-barrel-light poses** pass grip-down/muzzle/det/order (WML slide-
  level is reported-not-asserted — the leveler keys off the light underside, the pitch_offset concern) +
  volume-centroid, near-cubic light, ambiguity, reversibility.
  Re-run: `"…/Blender 5.1/5.1/python/bin/python.exe" scripts/verify_align_math.py`.
- **LIGHT MODE OWNER-CONFIRMED 2026-07-03** on the OLIGHT PL2 Valkyrie (63,112 verts, `mode="light"`):
  rail clamp up + level, bezel −Y. Mount (clamp OR single screw) found by `flat_area × complexity²`
  (the machined mount, not the smooth body); bezel found by the reflector bowl (`cap_area × bowl_depth`).
  Both robust from a scrambled start. **Single-screw-mount lights: not yet tested** — validate when one is available.
- Depends on **blender-mcp** live on :9876.

## Session Notes

### 2026-07-07 (HK SFP9 TLR-8A — grip-down hardened for under-barrel weapon-lights)
- **Failure:** the raw aligner shipped the HK SFP9 with a mounted TLR-8A light **upside-down** (`grip_is_down:
  false`) — muzzle −Y and centering were right, but slide on the bottom / grip up. Corrected live with a
  rigid **Ry180** (det stayed +1, stored `cgs_align_R` updated) so René's viewport was left correct.
- **Root cause:** step-4 grip-down compared the **rear-third vs front-third vertex MEAN height**. The
  under-barrel light dumps mass below the bore at the FRONT, dragging the front mean *below* the rear mean
  → the test flipped a correctly-posed gun. Confirmed on the real mesh: old test decision = FLIP (wrong);
  front vtx-mean −11.4 < rear +5.0.
- **Fix:** grip-down is now **rear-third area-weighted mean height vs MIDDLE-third** (bore-height ref). Both
  windows exclude the FRONT, so neither a WML (HK) nor a tall front sight/optic (the SIG failure mode) can
  corrupt it; area-weighting kills scan vertex-density bias (a vertex mean gave the wrong sign here). Picked
  by **testing 4 candidate discriminators on the real HK geometry** (the true ground truth — synthetic
  boxes never reproduced the mean-metric misfire): mid-third reference won with a **13.6mm margin** (rear
  −7.7 vs mid +5.9) vs ~3mm against a global reference. `cgs_align.py` step 4 + docstring updated.
- **Regression (offline, `verify_align_math.py`):** added a `sbox` dense-mesh builder (the 8-corner `box`
  clustered all verts at corners → length-percentile windows misbehaved; a real scan is dense) and a
  `wml_gun` (canonical gun + a forward under-barrel light) → **240 WML poses** now pass grip-down/muzzle/
  det/order; the plain suite is 300/300. WML slide-level is reported-not-asserted (with a light the leveler
  keys off the light underside — the same rail≠slide-datum concern as the PDP, mitigated by `pitch_offset_deg`;
  the real HK still leveled to −0.4°). Also fixed two synthetic-only artifacts uncovered along the way: the
  gun builder is now flat-topped (a stepped barrel faked a slide-tilt) and `gun_invariants`' muzzle check
  uses front/rear **thirds** not halves (a grip straddling the median Y put its full height in both halves).
- **Process lesson (reaffirms 2026-07-03):** my first two fixes (rear-vs-front reach-asymmetry, then
  envelope-flatness) *passed my own head-math but FAILED the offline suite* — 180/240 then coin-flips. The
  synthetic box gun also wasn't faithful (never reproduced the real misfire; its sparse verts + a mid-third
  light broke the windows). Ground truth was the **real HK mesh**: computing all candidate metrics on it
  directly is what settled the design. Don't trust a discriminator until it's checked on real geometry.
- **Pending:** live end-to-end `unalign → align_object` from the raw pose (blender-mcp dropped mid-session).
  Re-run when Blender reconnects to confirm `grip_is_down:true` on the first pass.
- Tools: blender-mcp (execute_blender_code on the real mesh, workbench renders), Read/Edit/Write/Bash
  (Blender-5.1 python numpy suite).
  <!-- @anchor: v1 | failure: HK SFP9 TLR-8A shipped upside-down — under-barrel-light front-low mass inverted the rear-vs-front mean-height grip-down test, 2026-07-07 | regression: scripts/verify_align_math.py wml_gun 240-pose grip-down suite + cgs-align SKILL.md Session Notes 2026-07-07 + cgs_align.py step-4 rear-vs-mid area-weighted block -->

### 2026-07-04 (Walther PDP steel frame — pitch-sign fix + rail≠slide datum)
- **Owner-confirmed "perfect"** on the `PDP STEEL FRAME SOLID GUN` (61,240 verts) at `pitch_offset_deg=+3.0`.
- **Auto-level datum miss:** the leveler picks the DOWN-facing forward flats (picatinny rail) as primary.
  On the PDP the rail underside sits ~3° off the SLIDE — the owner's true datum — so the plain align left the
  slide muzzle-down ~3° (owner marked it with a yellow line on the slide). Rail-primary is right for the SIG
  (rail ∥ slide) but not universal; the slide is the datum when the two disagree.
- **Pitch sign was inverted vs the old docstring.** Verified with the ridge metric + owner line, not the eye:
  base ridge +1.39° → `pitch −3` → +4.45° (MORE muzzle-down) → `pitch +3` → −1.62° + owner-level. So
  **`+pitch_offset_deg` tips the muzzle UP** (a rigid, gun-independent rotation; aL always points rear).
  Corrected the docstring/comment in `cgs_align.py` and method step 6 above.
- **Ridge metric is front-sight-biased here:** `_slide_top_tilt_deg` reads ≈ −1.6° at TRUE slide-level (the
  tall front sight lifts the max-Z ridge over the muzzle half) — don't target ridge 0 blindly; verify against
  the owner's slide datum. A custom "up-facing forward flats" fit I tried was worse (caught frame /
  trigger-guard / ejection-port faces → −17° garbage; I applied it once, made it worse, reverted via
  `unalign_object`).
- **Eye-fooled again (reaffirms the 2026-07-03 lesson):** I read the `−3` render as "flatter" — it was WORSE;
  only the ridge number + owner's viewport caught it. Renders fool the eye; trust the number + owner.
- Tools: blender-mcp (execute_blender_code, workbench renders vs a horizontal fiducial bar), Read/Edit/Bash.
  <!-- @anchor: v1 | failure: PDP pitch-sign inversion + rail≠slide datum, owner yellow-line correction 2026-07-04 | regression: cgs-align SKILL.md Session Notes 2026-07-04 + cgs_align.py pitch_offset_deg docstring/comment -->

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
  body. Then level the clamp mounting-flat consensus normal → +Z.
- **Bezel — first tried "far from clamp" (weak: clamp position varies, and single-screw lights have no clamp
  to measure from). Owner: "reference the mount for level; it's always the datum, like a gun's rail." So
  bezel now keys off the REFLECTOR itself (cue #2): `cap_area × bowl_depth`, bezel = higher end → −Y.
  Calibrated (bezel bowl 5.4 vs tail 3.7); robust from a scrambled start (2573 vs 1428).**
- Same lesson as the gun: renders fool the eye; the owner's viewport + a per-side calibration are ground truth.
