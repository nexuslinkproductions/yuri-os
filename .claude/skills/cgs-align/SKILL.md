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

**The definitive gun datums (owner directive 2026-07-10, GLOCK 43) — reference these, not proxies:**
- **PITCH → the SLIDE**, specifically the straight **UPPER/LOWER parting line** (slide-bottom / frame-top,
  dead straight & bore-parallel). NOT the picatinny rail / frame underside — those aren't bore-parallel on
  every gun (a Glock 43 has no rail; the PDP rail sits 3° off the slide).
- **YAW → FRONT SIGHT + REAR SIGHT colinear** down the bore (front post centred in the rear notch, viewed
  from behind). The slide *silhouette* is NOT sensitive enough — a 0.9mm sight offset over a 130mm baseline
  is 0.4° of yaw that reads "square" (0.04°) in the outline but is obvious down the sights.
- **ROLL / final sub-degree → owner's eye** via the offset knobs (a decimated scan won't nail <0.5° from
  geometry alone).

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
5. **Slide level (gross)** — owner's rule: "level to the SLIDE." Take the area-weighted consensus normal
   of the near-HORIZONTAL flats (within ~20° of vertical — a TIGHT cone that excludes the slide's angled
   top bevels) and rotate it to **+Z**, iterated. Primary reference = the DOWN-facing forward flats
   (picatinny rail + slide/dust-cover underside), fallback to slide-TOP up-flats. This gets *close* but its
   reference isn't bore-parallel on every gun — hence step 5b.
5b. **Slide level (refine to the PARTING LINE)** `refine_parting` — re-level to the SLIDE itself via its
   flat **SIDEWALL** (a big clean bore-parallel plane whose bottom edge *is* the upper/lower parting line):
   PCA of the sidewall face-centroids in the (length,height) plane → the slide's true long axis → lay it
   horizontal. **Self-zeroing + guarded** (no-op when step 5 already nailed it, e.g. the SIG; degrades if the
   sidewall can't be isolated). This auto-corrects what step 5 misses: the **Glock 43** (no rail → step 5
   grabbed frame flats, 2.2° off) and the **PDP** (rail 3° off slide) — both now land ~0° with no manual
   pitch. Owner directive 2026-07-10: *"Always align PITCH referencing the SLIDE… the distinct line between
   the UPPER and LOWER parts."*
6. **Yaw to the SIGHTS** `refine_sights` — owner's YAW datum: make the **front sight + rear sight
   colinear** along the bore. Detect the two sight blades as height spikes protruding >1.5mm above the
   slide-top baseline (front third + rear slide), take each blade's width-centroid (rear = the two notch
   posts → notch centre), and rotate about the vertical to zero their width difference. **Guarded** (needs
   two real protruding blades over a real baseline; cap 3°) so it no-ops on a flat-top / optic-cut slide or
   a light. Fixes the yaw the slide *silhouette* averages away (Glock 43: 0.9mm sight offset = 0.39° yaw,
   invisible in the outline). Owner directive 2026-07-10: *"the front SIGHT and REAR sight to adjust YAW."*
7. **Manual eye-tweaks** — `pitch_offset_deg` (about X, **`+` tips muzzle UP** — verified 2026-07-04 PDP),
   `roll_offset_deg` (about the bore), `yaw_offset_deg` (about vertical). Each default 0; the owner dials the
   last sub-degree a coarse scan can't nail from geometry (Glock 43 needed Rx−0.8 pitch / Ry+0.6 roll).
8. **Apply** — `New = (P − center) @ Rᵀ`, `R` rows = `[x̂, ŷ, ẑ]`; `matrix_world = identity`. The applied
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

obj, s = align_object()                     # GUN (default): auto pitch→parting-line + yaw→sights, in place
obj, s = align_object("SIG P226 XFIVE FULL GUN")
obj, s = align_object(name, pitch_offset_deg=-0.8, roll_offset_deg=0.6)   # owner eye-tweaks (Glock 43)
obj, s = align_object("PL2_VALKYRIE - Copy", mode="light")   # LIGHT: clamp up+level, bezel left
obj, s = import_and_align(r"C:\Users\rene\Desktop\CAD\...\scan.stl")

print(s)   # aligned_ok, det_R (==1.0), center_residual_mm (~0), R_offdiag_max (~0), dims (Y>=Z>=X),
           # front_y (muzzle, min), grip_is_down, slide_leveled_deg, parting_refine_deg, sight_yaw_deg
```

- `align_object(obj_name=None, in_place=True, out_name=None, level_slide=True, pitch_offset_deg=0.0, roll_offset_deg=0.0, yaw_offset_deg=0.0, mode="gun", refine_parting=True, refine_sights=True)` — entry point. Gun mode auto-levels PITCH to the slide/parting line and YAW to the sights; the three `*_offset_deg` knobs are the owner's eye-tweaks. `mode="light"` for weapon-lights.
- `import_and_align(path, in_place=True)` — import STL then align (gun mode).
- `unalign_object(name)` — reverse a prior align from the stored transform.

## Verify (do this on every real run)

Confirm the returned evidence (gun): `det_R == 1.0`, `center_residual_mm < 0.05`, `dims_ordered_yzx`,
`grip_is_down == True`, muzzle at `front_y` (min Y). (`aligned_ok` reads **false** whenever a manual
`pitch/roll/yaw_offset` is set — the built-in verifier re-checks against the no-offset auto-level, so a
deliberate eye-tweak trips it; that's benign, same as the PDP at +3°. Trust the datum measurements below.)
For a light: `det_R == 1.0`, `clamp_complexity` clearly the max, `bezel_score_front > bezel_score_rear`.

**Verify the two owner datums against the real mesh, not the eye** (renders/perspective fool the eye — a
recurring trap on this skill):
- **YAW** — measure front-sight X vs rear-sight X centroids; they must be equal (**`sight_dx ≈ 0`**).
  Render the **BACK orthographic** view (from +Y) and confirm the front post sits centred in the rear notch.
- **PITCH** — measure the slide **sidewall PCA** / parting-line slope (**≈ 0°**), NOT the slide-top ridge
  (it's front-sight-biased). Render the **RIGHT orthographic** side view with a horizontal reference bar and
  confirm the upper/lower parting line is parallel to it.
- If the owner's eye wants the last sub-degree, set `pitch_offset_deg` / `roll_offset_deg` / `yaw_offset_deg`.
  On a light, also confirm the **bezel points −Y**.

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
- **OWNER-CONFIRMED "a lot better" 2026-07-10** on the GLOCK 43 GUN DECIMATED (59,950 verts) — and the
  aligner HARDENED with the two definitive gun datums. First auto-align read "square" (0.04° yaw / level)
  but the owner caught the **front sight off-centre** (down-the-sights) and gave the real references:
  **PITCH = the upper/lower parting line, YAW = front+rear sight colinearity.** Added `refine_parting`
  (slide-sidewall PCA → parting line) + `refine_sights` (sight-blade width-centroids → colinear) +
  `roll_offset_deg`/`yaw_offset_deg` knobs. Live from the raw pose the new pipeline auto-lands
  **sight_dx 0.0mm + parting 0.06°** (parting-refine fired +0.89°, sight-yaw +0.39°); owner finished with
  `pitch_offset_deg=-0.8`, `roll_offset_deg=0.6`. det +1, grip −Z, muzzle −Y, baked + owner-confirmed.
- **Offline: 300/300 random gun poses + 240 WML poses** still green after the refinement (det, axis order,
  centering, off-diagonal, grip-down, muzzle-left; WML slide-level reported-not-asserted, **unchanged** by
  the refinement — verified refine-on == refine-off = 13.95° synthetic artifact) + volume-centroid, light,
  ambiguity, reversibility. The refinements **self-zero on the synthetic gun** (flat top → no sights; clean
  sidewall → already level), so they add real-gun capability without touching the synthetic suite.
  Re-run: `"…/Blender 5.1/5.1/python/bin/python.exe" scripts/verify_align_math.py`.
- **Pending live re-validation** of the datum refinements on the SIG / PDP / HK / OLIGHT (not loaded
  2026-07-10). Expected safe: both refinements are self-zeroing + guarded (the SIG rail∥slide → parting
  refine ≈0; the PDP would auto-correct its 3° with no manual pitch; a light has no sights → yaw refine
  no-ops). Re-confirm on next load.
- **LIGHT MODE OWNER-CONFIRMED 2026-07-03** on the OLIGHT PL2 Valkyrie (63,112 verts, `mode="light"`):
  rail clamp up + level, bezel −Y. Mount (clamp OR single screw) found by `flat_area × complexity²`
  (the machined mount, not the smooth body); bezel found by the reflector bowl (`cap_area × bowl_depth`).
  Both robust from a scrambled start. **Single-screw-mount lights: not yet tested** — validate when one is available.
- Depends on **blender-mcp** live on :9876.

## Session Notes

### 2026-07-10 (GLOCK 43 — the definitive gun datums: PITCH=parting line, YAW=sights)
- **Failure:** the first auto-align passed every internal check and I told the owner it was "square"
  (yaw 0.04° via the slide *silhouette*, pitch level via the slide-top flats). He rotated to the **BACK
  ortho** view, looked down the irons, and the **front sight was clearly off-centre in the rear notch.** My
  silhouette yaw metric had *averaged away* a real 0.9mm front-sight offset (0.39° over the 130mm sight
  baseline), and my pitch datum (rail/frame underside flats) was wrong for a rail-less Glock (2.2° off the
  slide). I had confidently declared it correct off metrics that shared the aligner's blind spot — the
  skill's oldest lesson, repeated.
- **Owner's ground-truth references (now the canonical gun datums):** *"Always align PITCH referencing the
  SLIDE — the distinct line between the UPPER and LOWER parts, perfectly straight"* and *"the front SIGHT
  and REAR sight to adjust YAW."* Screenshots: front sight off-centre (bad), a proper centred sight picture
  (goal), and the side view with the parting line green-lined.
- **Fix (code):** two guarded, self-zeroing refinements added to `compute_alignment` — `_refine_pitch_to_slide`
  (slide-sidewall PCA in the length-height plane → lay the slide's own long axis / parting line horizontal)
  and `_refine_yaw_to_sights` (detect the two sight blades as >1.5mm height-spikes, take their width-
  centroids — rear = notch centre — rotate about vertical to colinear them). Plus `roll_offset_deg` /
  `yaw_offset_deg` manual knobs to mirror `pitch_offset_deg`. Both refinements no-op when already correct or
  when the feature is absent, so they **don't regress** the SIG/PDP/HK confirmed poses or the synthetic suite.
- **Verified on the REAL mesh (the only ground truth):** manual measurement first — front-sight X −0.315 vs
  rear +0.584 = 0.9mm/0.39° yaw; slide sidewall PCA −0.95° pitch (vs the sight-biased slide-top ridge which
  read +0.67°). Applied Rz+0.39 / Rx+0.95 → sight_dx 0.001mm, parting 0.06°. Then baked the new code and
  ran it **from the raw scan on a duplicate**: auto-landed sight_dx **0.0mm** + parting **0.06°**
  (parting-refine fired +0.89°, sight-yaw +0.39°) — reproducing the hand result automatically. Owner then
  finished with `pitch_offset_deg=-0.8` / `roll_offset_deg=0.6` (the last sub-degree on a decimated scan)
  and confirmed *"a lot better."* His two viewport rotations were baked into the mesh (matrix_world identity,
  stored R updated, reversible).
- **Regression (offline, `verify_align_math.py`):** 300/300 + 240 WML still green; proved refine-on ==
  refine-off on the synthetic WML (13.95° slide-level artifact **unchanged**) so the refinement adds real-gun
  capability without perturbing the synthetic gun (flat top → no sight spikes; clean box sidewall → already
  level). `verify_alignment` pins the refinements OFF so its R_offdiag check stays a pure axis/sign recheck.
- **Process lesson (reaffirms 2026-07-03/04/07):** don't declare "square/level" off a metric that can share
  the aligner's blind spot — the slide silhouette missed the sight yaw, the slide-top ridge is front-sight
  biased. The owner's chosen physical references (sights, parting line) + measurement on the real mesh are
  ground truth; renders + a perspective viewport fooled the eye BOTH ways this session (I mis-read a
  perspective muzzle view as yawed when it wasn't, then missed the real yaw the sights showed).
- **Pending:** live re-confirm the refinements on the SIG/PDP/HK/OLIGHT next time they're loaded (guarded +
  self-zeroing, so expected no-change; the PDP should now auto-level without its manual +3°).
- Tools: blender-mcp (execute_blender_code on the real mesh, workbench back/side renders vs fiducial bars),
  Read/Edit/Bash (Blender-5.1 python numpy suite), duplicate-from-raw live end-to-end test.
  <!-- @anchor: v1 | failure: GLOCK 43 declared "square" off slide-silhouette yaw + slide-top-flat pitch, but the front sight was off-centre — owner datums are PITCH=parting-line, YAW=front+rear sight colinearity, 2026-07-10 | regression: cgs_align.py _refine_pitch_to_slide + _refine_yaw_to_sights (guarded, self-zeroing) + verify_align_math.py 300/240 green (refine-on==off on synthetic WML) + cgs-align SKILL.md Session Notes 2026-07-10 -->

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
