---
name: cgs-align
description: Align an uploaded STL (a gun via mode="gun", or a weapon-light via mode="light") to a canonical world-XYZ pose, mass-centered, fully inside Blender via blender-mcp. ALIGNMENT ONLY — rotate to the canonical pose and move the mass center to the origin; no seal, no union, no voxel, no decimate, no cut, no offset, no export. Gun: muzzle −Y, grip −Z, slide/rail level. Light: rail seat +Z & level, bezel −Y. Use when René says "align this STL", "cgs-align", "align <gun/light> to XYZ", or provides an STL + active Blender MCP and asks only to align it. **"LAMP" MEANS A WEAPON-LIGHT AND ALWAYS ROUTES HERE** (owner directive 2026-08-04): "align this lamp", "Lampe ausrichten", "align the torch/flashlight/WML", or a named light (STREAMLIGHT / TLR-7 / TLR-1 / SUREFIRE / X300 / OLIGHT / PL2 / Baldr) → run `mode="light"`, never gun mode. Blender-only. Sibling of cgs-mold (same axis convention so an aligned object can feed cgs-mold directly).
triggers: ["cgs-align", "/cgs-align", "align this stl", "align stl to xyz", "align the gun to xyz", "align to xyz", "center and align stl", "align this light", "level the gun", "align this lamp", "align the lamp", "lamp align", "align lamp to xyz", "lampe ausrichten", "align lampe", "align this weapon light", "align the weapon light", "align wml", "align the torch", "align this flashlight", "align streamlight", "align tlr", "align surefire", "align olight", "level the lamp", "level the light"]
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
- **ROLL → the SLIDE-TOP FLAT horizontal in the FRONT (down-the-bore) view** — no cant about the bore.
  Auto-leveled by `refine_roll` (slide-top up-face consensus normal → +Z). The raw pose left the Glock 43
  ~0.8° rolled (invisible in the side/back views — a THIRD view, the front-ortho, is mandatory; owner caught
  it there, 2026-07-10b). Final sub-degree still → owner's eye via `roll_offset_deg` (a decimated scan won't
  nail <0.5° from geometry alone).
- **VERIFY ALL THREE ORTHO VIEWS** — side=pitch/parting, back=yaw/sights, **front=roll/slide-top**. Declaring
  "level" off only the views you checked is the skill's #1 repeat failure (2026-07-03/04/07/10/10b).

## SCOPE — alignment only

Do **only** the alignment. Explicitly out of scope (cgs-mold's job): seal / island-union / voxel-remesh /
solidify / decimate / smooth / grip-cut / offset / split / export. A pure rigid transform: **lossless,
reversible, non-mutating to geometry.**

## Method (what the engine does — each step calibrated against René's hand-posed gun)

1. **Mass center = volume centroid** (divergence-theorem tetrahedra; fallback: area-weighted surface →
   vertex mean). Pure mass on all 3 axes.
2. **Principal axes** from area-weighted surface covariance (density-robust directions); label
   length/height/width by robust 2/98-pct bbox extent → fixes **roll, yaw, width**.
2b. **Bore-lattice bootstrap (gross pitch)** `_bore_lattice_pitch` — ⚠ **PCA's principal axis is NOT the
   bore.** On a real Glock STL the surface covariance is dragged toward the grip (a GEN5 grip's stipple
   texture alone is tens of thousands of faces), so "length" comes out **~33° off the slide on BOTH the
   G17 and the G19**. Everything downstream assumes a roughly bore-true frame and every refinement is
   guarded at 8°/3°, so a gross miss is *out of their reach* and propagates silently (the G19 shipped 31°
   pitched AND back-to-front with `aligned_ok: true`). Fix: a gun is machined — slide top, parting line,
   rail, dust-cover underside, breech and muzzle faces are all ∥ or ⟂ to the bore, so the face normals
   projected into the length-height plane form a **4-fold lattice locked to the bore**. Recover its phase
   with the 4th-harmonic circular mean `¼·atan2(Σw·sin4φ, Σw·cos4φ)` over non-sidewall faces
   (`|n·aW| < 0.4`), weighted `area × |in-plane|²`. Curved/textured surfaces spread uniformly in φ and
   **cancel** — the very mass that corrupts PCA is what this ignores. Real STLs read 0.545 (G19) / 0.582
   (G17) lattice coherence over 66k/33k faces. The phase is known mod 90°, which is exactly right: it fixes
   PITCH and leaves the length/height **label** to a re-run extent test and the muzzle/grip **signs** to
   steps 3-4. Self-zeroing + guarded — A/B-verified byte-identical output on the synthetic suite.
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
5b. **Slide level PITCH (refine to the PARTING LINE)** `refine_parting` — re-level to the SLIDE-TOP
   SILHOUETTE EDGE (bore-parallel to the upper/lower parting line, and exactly what the eye tracks down the
   side): the 97th-pct height per length-slice across the slide span → robust MAD-trim the sight spikes →
   line-fit → lay it horizontal. **Self-zeroing + guarded** (no-op on a level slide, e.g. the SIG / flat-top
   synthetic; degrades on a sparse/wild fit). ⚠ **REPLACED the old sidewall-face-area PCA** (2026-07-10b):
   that PCA's principal axis is skewed by the selection band and converged to a FIXED POINT ~1° rear-up of
   the true parting line on the Glock 43 — and the same-basis verifier rubber-stamped it (declared "square",
   owner caught it against a horizontal ruler). Proven on the real mesh: read +0.99° → corrected 0.00°. Also
   auto-corrects step 5's misses: **Glock 43** (no rail → frame flats, 2.2°) and **PDP** (rail 3° off slide).
   Owner directive 2026-07-10: *"Always align PITCH referencing the SLIDE… the distinct line between the
   UPPER and LOWER parts."*
5c. **Slide level ROLL (front view)** `refine_roll` — owner's ROLL datum (2026-07-10b): the slide-top must be
   horizontal in the FRONT / down-the-bore view (no cant). Take the slide-top up-faces' AREA-weighted
   consensus normal and rotate about the bore (aL) so it points straight up (+Z) — zero its width-component.
   **Self-zeroing + guarded** (min faces, cap 8°). Pitch/yaw refines don't touch roll and a decimated scan's
   principal WIDTH axis alone left the Glock 43 ~0.8° rolled — **invisible in the side/back views**, caught
   only in the front-ortho (owner hand-fixed +0.8° Ry; the refine now auto-lands it, +0.58° → −0.09°).
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
   roll + pitch together). This is a gross leveler only — see 2b.
2b. **Rail SEAT level — the light's real PITCH+ROLL datum** `refine_seat` — the owner's mount rule made
   literal: level to the **machined floor of the rail channel**, the surface that actually contacts the
   gun's rail. Step 2 takes an area-weighted CONSENSUS over every up-facing face in a 20° cone; that is a
   BLEND, not a datum. On the TLR-7 HL-X it averaged the seat with the jaw tops, the bezel deck and the rear
   housing deck and left the seat **4.33° nose-down** while every internal check passed (2026-08-04). Isolate
   the seat in three steps, each one necessary:
   (a) **jaw gate** — keep only length-slices whose mid-floor has a jaw standing ≥0.025·H above it on BOTH
   sides. This is the step that removes the rear deck, which is 1.34° off the seat yet only 0.12mm from its
   plane — neither cone- nor offset-separable, separable only by the fact that it lies BEHIND the jaws.
   (b) **area-smoothed normal mode** — the direction carrying the most face area within a ~2° cone. A raw
   histogram peak picks the FLATTEST surface, not the largest: the rear deck's fit rms is 0.016mm against
   the seat's 0.070mm, so a scan-rough seat loses any unsmoothed peak to a small polished deck.
   (c) **sheet isolation** — fit, keep the dominant area-weighted residual peak, refit (×3). One plane
   through two patches at different length AND height is set by the LEVER ARM between them, not by either
   patch's own slope (that mix read 3.13° where the seat is 4.31°).
   Then rotate the frame so that plane's normal is exactly +Z; yaw is preserved. **Self-zeroing + guarded**
   (needs a jawed channel over ≥15% of the length, a dominant sheet ≥10% of the band area, fit rms ≤0.02·H,
   correction ≤8°) — a featureless body is a byte-identical no-op. Real TLR-7: **4.31° → 0.28°**, idempotent,
   identical from 10 random start poses, cross-confirmed by the bezel-axis datum it never sees (4.57°→0.55°).
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
           # front_y (muzzle, min), grip_is_down, lattice_pitch_deg, slide_leveled_deg,
           # parting_refine_deg, roll_refine_deg, sight_yaw_deg
```

- `align_object(obj_name=None, in_place=True, out_name=None, level_slide=True, pitch_offset_deg=0.0, roll_offset_deg=0.0, yaw_offset_deg=0.0, mode="gun", refine_parting=True, refine_sights=True, refine_roll=True, refine_seat=True)` — entry point. Gun mode auto-levels PITCH to the slide/parting line (`refine_parting`), ROLL to the slide-top flat / front view (`refine_roll`), and YAW to the sights (`refine_sights`); the three `*_offset_deg` knobs are the owner's eye-tweaks. `mode="light"` for weapon-lights, where `refine_seat` levels PITCH+ROLL to the rail seat (light mode has no `*_offset_deg` knobs — apply an eye-tweak as a rigid rotation and compose it into `cgs_align_R`).
- `import_and_align(path, in_place=True)` — import STL then align (gun mode).
- `unalign_object(name)` — reverse a prior align from the stored transform.

## Verify (do this on every real run)

Confirm the returned evidence (gun): `det_R == 1.0`, `center_residual_mm < 0.05`, `dims_ordered_yzx`,
`grip_is_down == True`, muzzle at `front_y` (min Y). (`aligned_ok` reads **false** whenever a manual
`pitch/roll/yaw_offset` is set — the built-in verifier re-checks against the no-offset auto-level, so a
deliberate eye-tweak trips it; that's benign, same as the PDP at +3°. Trust the datum measurements below.)
For a light: `det_R == 1.0`, `clamp_complexity` clearly the max, `bezel_score_front > bezel_score_rear`,
`seat_refine_deg` reported (0.0 means the jaw gate found no channel — then the pose rests on the step-2
consensus and MUST be datum-measured by hand). Then measure the three light datums on the real mesh, in all
three ortho views, exactly as for a gun:
- **PITCH + ROLL (side + front ortho)** — plane-fit the **rail-channel floor** (up-faces inside the jaws)
  and confirm `dz/dy ≈ 0` and `dz/dx ≈ 0`. Do NOT fit "the biggest top flat": on the TLR-7 that is the rear
  housing deck, 1.34° off the seat. Cross-check with the **bezel/reflector cylinder axis** (per-slice circle
  fit over the round head → the centres' trend) — an entirely independent datum the refine never touches;
  the two should agree to a few tenths.
- **YAW (top ortho)** — fit a **transverse machined wall inside the channel** (faces with |n·ŷ|>0.85, e.g.
  the rail-key pocket's front wall); its `dy/dx` is the yaw. The bezel-axis yaw is a weak check only — over
  a ~12mm cylinder its slope standard error is ±0.3°, so it can confirm a gross error and nothing finer.
- Renders: side + front + top against fiducial bars, same discipline as the gun.

⚠ `center_residual_mm` for a light is now the **volume centroid** (what the aligner actually centres on).
It used to be the vertex mean, which a scan's uneven vertex density puts millimetres away: the TLR-7 read
2.07mm and `aligned_ok: false` on a mesh whose volume centroid was exactly (0,0,0). `vertex_mean_offset_mm`
is still reported, as information — it is not an error.

**Run the REAL-GUN suite when you touch the aligner** (added 2026-07-20 — the synthetic suite was 100%
green straight through the G19 failure; a box gun does not reproduce a real scan's failure mode):

```bash
"C:/Program Files/Blender Foundation/Blender 5.1/5.1/python/bin/python.exe" scripts/verify_real_guns.py --poses 40
```

It loads René's own production `*SOLID GUN.stl` files — which ship **already in his canonical pose**, so
they *are* ground truth — applies random rotations, re-aligns, and scores the recovered pose by **Kabsch
rotation back to the owner's pose**. One number that catches pitch, roll, yaw, end-flips and mirrors at
once, and that structurally *cannot* share a blind spot with the aligner (it is the owner's pose, not a
metric I derived). Current: **G19 40/40 @ 0.40°, G17 40/40 @ 0.33°.** The suite gates on the native STL
actually being canonical and skips loudly if it isn't.

**Verify the two owner datums against the real mesh, not the eye** (renders/perspective fool the eye — a
recurring trap on this skill):
**Render and check ALL THREE ortho views — a metric can share the aligner's blind spot; a skipped view hides a real error (front-view roll, 2026-07-10b):**
- **YAW (BACK ortho, from +Y)** — measure front-sight X vs rear-sight X centroids; equal (**`sight_dx ≈ 0`**).
  Confirm the front post sits centred in the rear notch.
- **PITCH (RIGHT/side ortho, +X)** — measure the slide-top **silhouette edge** slope (97th-pct-h per slice,
  sight-trimmed) **≈ 0°**, NOT the sidewall-area PCA (skewed → converged ~1° off on the G43) nor the
  slide-top ridge (front-sight-biased). Render with a horizontal bar; confirm the upper/lower parting line
  is parallel to it.
- **ROLL (FRONT ortho, down the bore)** — measure the slide-top up-face consensus normal's X-component
  (**`nx ≈ 0`**, roll ≈ 0°). Render with a horizontal bar across the slide top; confirm the slide top is
  level, no cant. ⚠ **Never skip this view** — roll is invisible in the side/back views (the G43 was 0.8°
  rolled and read perfect on the other two).
- If the owner's eye wants the last sub-degree, set `pitch_offset_deg` / `roll_offset_deg` / `yaw_offset_deg`.
  On a light, also confirm the **bezel points −Y**.

## Safety conventions

- **Rigid transform only** — no geometry change, no vertex-count change, fully reversible (`unalign_object`).
- `in_place=True` mutates the object's transform (safe: lossless + reversible). `in_place=False` writes a copy.
- Never touch protected paths; reads/writes only the Blender object.

## Status / scope

- **ALIGNED + 3-VIEW VERIFIED 2026-08-04** on the STREAMLIGHT TLR-7 HL-X (`Fused_20260712170856`, 150,135
  verts / 300,418 tris) — the second light ever run, and the one that exposed light mode's missing mount
  datum. The stock light pipeline put bezel −Y and channel +Z correctly but left the **rail seat 4.33°
  nose-down**; `refine_seat` (method step 2b) was built and the pose hand-finished to the measured datum.
  Final: seat plane pitch **−0.088°** / roll **0.040°** (rms 0.070mm over 237mm²), forward pad **−0.052°**
  (independently, and parallel to the pocket to 0.036°), channel transverse-wall yaw **+0.013°**, bezel-axis
  pitch **+0.171°** / yaw **−0.060°** (independent cross-check), volume centroid exactly (0,0,0), det +1,
  `matrix_world` identity. Scale corroborated against a standard interface: the jaw channel is ~17.7mm wide
  with 45° jaw faces — a MIL-STD-1913 seat. **Owner viewport confirm pending.**
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
- **RE-HARDENED 2026-07-10b (GLOCK 43) — two same-session misses fixed:** (1) the morning's `refine_parting`
  levelled to a slide-**sidewall-area PCA** that converged ~1° rear-up of the true parting line (my verifier
  shared the basis and rubber-stamped it; owner caught it on a horizontal ruler) → **rebuilt to level the
  slide-top SILHOUETTE EDGE** (proven +0.99°→0.00° on the real mesh). (2) The gun shipped **~0.8° ROLLED**
  because I verified only side+back views and **never rendered the FRONT/down-the-bore view** where roll
  shows (owner hand-fixed +0.8° Ry) → added **`refine_roll`** (slide-top normal → +Z about the bore).
  Live from the raw scan the hardened pipeline auto-fired parting +1.03° / **roll +0.58°** / yaw +0.33° and
  landed **pitch −0.05° / roll −0.09° / yaw ~0.16°** — all three ortho views level, reproducing the owner's
  hand pose with no manual input. Owner viewport re-confirm of this auto-output pending next load.
- **ALIGNED + 3-VIEW VERIFIED 2026-07-27b** on the SPHINX SDP STANDARD (64,869 verts — fourth platform
  confirming the bore-lattice bootstrap, −26.45° here). This gun's parting line is a **STEP, not a groove**
  (frame 13.55 → slide 13.10 half-width at z≈32), so the Echelon's interior-recess scan found nothing; the
  general datum is the sharpest downward step in `max|x|(z)`. It must be fit over the **slide span only** —
  full-length fits swallow the frame/beavertail shoulder 3.4mm lower and read −1.51° instead of −0.010°.
  Final: parting **+0.018°** (rms 0.014mm / 82mm), roll **−0.030°**, sight-yaw **−0.0007°** (dx −0.002mm
  over a 169.7mm radius, after a probe-verified −0.0769° Rz), centroid (0,0,0), det +1.
  **Owner viewport confirm pending.**
- **ALIGNED + 3-VIEW VERIFIED 2026-07-27** on the SPRINGFIELD ECHELON 4.5 (470,777 verts — largest mesh
  to date; third platform confirming the bore-lattice bootstrap, which fired −32.95° here too). Pitch was
  levelled to the **parting GROOVE measured directly** (per-slice min-`|x|` interior recess, rms 0.063mm
  over 137mm) rather than the slide-top silhouette proxy — the two disagreed by 0.17° on this gun. Final:
  parting **+0.031°**, roll **−0.102°**, sight-yaw **0.014°**, centroid (0,0,0), det +1. Owner's two
  annotation dots corroborate the pitch within their ±0.4° hand-placement precision. **Owner viewport
  confirm pending.**
- **OWNER-CONFIRMED "alignment is good" 2026-07-20** on the GLOCK 19 GEN5 SOLID GUN (99,271 verts) — and
  the aligner hardened with the **bore-lattice bootstrap** (method step 2b) after it shipped this gun 31°
  pitched and back-to-front. Root cause: PCA's principal axis sits ~33° off the bore on real Glock STLs
  (grip texture dominates the surface covariance) — true for the G17 too, which had been silently getting
  away with it. New **real-geometry suite** `verify_real_guns.py` scores the recovered pose by Kabsch
  rotation back to René's own canonical STL: **G19 40/40 @ 0.40°, G17 40/40 @ 0.33°.**
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

### 2026-08-04 (STREAMLIGHT TLR-7 HL-X — light mode had no mount datum; a consensus is not a datum)
- **Run:** `Fused_20260712170856`, 150,135 verts / 300,418 tris, `mode="light"`. Gross pose came out right
  first time — bezel −Y, rail channel +Z, det +1, volume centroid exactly (0,0,0).
- **Failure #1 (the real one):** the **rail seat sat 4.33° nose-down** and nothing in the pipeline noticed.
  Root cause: light mode's only leveler is an area-weighted CONSENSUS over every up-facing face within a 20°
  cone. On this light that cone spans four non-parallel surfaces — the seat, the two clamp-jaw tops, the
  bezel deck and the rear housing deck — and **a consensus over non-parallel decks cannot recover any one of
  them**. Same class as the gun's rail-vs-slide datum miss (PDP 2026-07-04), just never caught on a light
  because the PL2 is the only other one ever run.
- **Fix — `refine_seat`, and it took three attempts, each failing in an instructive way:**
  (1) raw normal-histogram mode → picked the **rear deck**, because a histogram peak rewards the FLATTEST
  surface (deck fit rms 0.016mm) over the LARGEST (seat 0.070mm over 5× the area). Fixed with a box-smoothed
  (integral-image) area sum over a ~2° window — "largest plane wins" restored. Still only 3.14°.
  (2) residual-peak **sheet isolation** → still 3.31°, because the deck is only **0.12mm** from the seat's
  plane; it is not offset-separable at all. What this attempt *did* buy was idempotence and pose-invariance.
  (3) **jaw gate** — keep only length-slices with a jaw standing above the floor on BOTH sides. The deck
  lies BEHIND the jaws, which is the only property that separates it. **4.31° → 0.28°**, idempotent, and
  identical from 10 random start poses.
- **Lever-arm trap (worth its own line):** a single plane fit through two patches at different length AND
  height is governed by the z-offset BETWEEN them, not by either patch's slope. Blending the seat (4.31°,
  240mm²) with the deck (2.97°, 118mm²) did not give the area-weighted 3.9° — it gave 3.13°, *outside* both.
  If a plane fit lands outside the range of its constituent surfaces, it is measuring a lever arm.
- **Failure #2 (verifier):** `aligned_ok: false` with `center_residual_mm: 2.07` on a mesh whose volume
  centroid is exactly (0,0,0) — the light-mode verifier measured the **vertex mean** while the aligner
  centres on the **volume centroid**. A scan's uneven vertex density separates those by millimetres. Fixed
  to re-measure the same quantity the aligner set; the vertex-mean offset is still reported as information.
  A verifier measuring a different quantity than the aligner is worse than no verifier — it burns attention.
- **How the geometry was actually read** (no prior knowledge of TLR-7 mount internals): cross-sections every
  4mm gave the channel as a 16mm floor between two jaws, with a **2.4mm-deep rail-key pocket** (y −12..+11)
  and a **forward pad** — two parallel machined planes (4.310° / 4.409°) 2.38mm apart. The rear "deck" at
  y+12..+22 spans the FULL width with no jaws: not a seat. The **bezel head is a near-perfect cylinder**
  (R 11.81mm, centre-trend rms 0.005mm) → its axis is a free, fully independent pitch/yaw datum. Use it:
  it agreed with the seat to 0.24°, which is what licensed trusting the seat over the consensus.
- **Yaw datums ranked** (they disagreed by up to 1.2° until measured properly): transverse channel wall
  −0.136° ±0.04 (best — a machined face ⟂ to the axis, 28mm², rms 0.09mm) > fixed jaw wall −0.30° > bezel
  axis −0.21° ±0.33 (SE too large over a 12mm cylinder to resolve anything under half a degree) > body
  silhouette −0.46°. The **movable** clamp jaw is not a datum at all (fit rms 0.69mm — it is a loose part).
- **Verified:** all three ortho views rendered against fiducial bars (side @ wall-top z, front @ seat z + an
  x=0 vertical, top @ x=0 along Y); numeric datums above; gun suite still 300/300 + 240 WML; featureless
  cuboid light is a byte-identical no-op with the refine on.
- **Residual risk:** (a) the auto `refine_seat` lands at **0.28°**, not the 0.09° the hand-measured pose in
  the scene holds — a systematic bias worth chasing (likely the jaw gate's floor percentile pulling in the
  channel's end slices). (b) **The PL2 Valkyrie has not been re-run** with the refine; it has a jawed clamp
  so the refine WILL fire there. Re-validate on next load — it should be a small correction toward the same
  datum, not a regression, but that is a prediction, not a measurement. (c) The synthetic light in the
  offline suite is too coarse and too box-like to exercise any of this (its own PCA frame comes out skewed);
  the real-mesh A/B is the only regression that means anything — same lesson as the G19, 2026-07-20.
- Tools: blender-mcp (`execute_blender_code` — stdout is NOT returned, redirect to a file and Read it),
  numpy on the live mesh, workbench ortho renders vs fiducials, Blender-5.1 python for the offline suites.
  <!-- @anchor: v1 | failure: STREAMLIGHT TLR-7 HL-X shipped with the rail seat 4.33deg nose-down — light mode's 20-degree-cone consensus leveler blends the seat with the jaw tops / bezel deck / rear deck and has no mount datum; and its verifier reported center_residual 2.07mm by measuring the vertex mean while the aligner centres on the volume centroid, 2026-08-04 | regression: cgs_align.py _refine_light_seat (jaw gate + area-smoothed normal mode + residual-sheet isolation; real-mesh A/B 4.31deg -> 0.28deg, idempotent, 10 random poses identical, byte-identical no-op on a featureless body) + cgs-align SKILL.md method step 2b + Session Notes 2026-08-04 -->

### 2026-07-27b (SPHINX SDP STANDARD — the parting line can be a STEP, not a groove; and it ENDS at the slide)
- **Run:** `SPHINX SDP STANDARD - GUN - OWB SCAN`, 64,869 verts / 129,738 tris. Owner supplied **two rough
  annotation dots** on the parting line (again X≈0 → drawn in a side ortho, so PITCH only, no yaw info).
  Pre-align they read **−0.616°**; the aligner's own transform landed them at **−0.091°**.
- **Auto-align clean.** Lattice fired **−26.45°** (coherence 0.60, `lattice_ok`) — a **fourth** platform, and
  the first non-Glock/non-Springfield, confirming PCA-vs-bore is a general real-scan defect. Refines:
  slide-level 2.11°, parting +0.75°, roll +0.07°, sight-yaw +0.06°. det +1, grip −Z, muzzle −Y,
  `dims 35.26 × 208.25 × 144.58`. `aligned_ok:false` with no manual offset — the roll refine trips
  `R_offdiag 0.0131`; benign, same class as a manual offset (see 2026-07-27 Echelon).
- **NEW GEOMETRY CLASS — the parting line is a STEP here, not a groove.** The Echelon method (per-slice
  interior **min**-`|x|` recess) returned garbage on this gun: rms **1.74mm**, 17/48 slices, z_mid 34.3 vs the
  owner's dots at 31.9. Dumping the raw half-width profile `max|x|(z)` showed why — the Sphinx has **no
  recess at all**, just a clean shoulder: frame **13.55** → slide **13.10** at z≈32, identical at every
  station. So the general datum is *"the z of the sharpest downward step in `max|x|(z)`"*; a groove is only
  the special case where that step then steps back out. Detector: 0.5mm z-bins, 3-bin smooth, `argmin` of
  `diff(w)`, parabolic sub-bin refine on the gradient, require plateau contrast ≥0.20mm. Result:
  **16 slices, 82mm span, rms 0.010mm** — the tightest parting fit this skill has produced on any gun.
- **⚠ THE TRAP THAT COST THE MOST — the parting line ENDS where the slide ends.** Fit it over the full
  length and you get **−1.51°** of pure fiction. Behind y≈0 the step is the **frame/beavertail** shoulder at
  z≈28.5, a completely different feature ~3.4mm lower; mixing the two tilts the line by 1.5°. Restricting to
  the slide span (y −108…−24) gives **−0.010°**. The 3σ-MAD trim does NOT save you — the contaminating
  points are a coherent second population, not outliers, so the fit happily splits the difference. **Fit the
  parting datum over the SLIDE span only, and sanity-check the fitted `z` against the owner's dots.**
- **Mesh too sparse for 0.25mm z-bins** — at 65k verts a ~3mm y-slice fills only ~62% of 0.25mm bins, and my
  `>0.7 filled` gate silently rejected **every** slice (n=0 across all four variants, no error). Fixed with
  dz=0.5 + a 0.6 gate + gap interpolation. A detector that returns `n:0` for every input is reporting a
  tuning failure, not "no feature" — diagnose the rejection counts before concluding anything about the gun.
- **Applied a −0.0769° yaw.** Three *independent* references agreed on sign and magnitude — rear-notch
  centre vs front-post mid **−0.077°**, rear post-mid **−0.051°**, and the slide **silhouette** centre
  **−0.079°**. The silhouette is independent of sight windage, which is what licensed treating it as a real
  pose yaw rather than a physically-drifted rear sight (Echelon's warning). Probe-point sign check first
  (+0.2268 vs the +0.2277 wanted) — that trap from the Echelon run is real and the probe caught it cheaply.
  Composed into `cgs_align_R` so `unalign_object` stays valid.
- **FINAL, all three ortho views rendered against fiducial bars:** PITCH (side, bar on the parting step at
  z=31.902) **+0.018°**, rms 0.014mm; ROLL (front, bar on the slide top z=46.729) slide-top normal nx
  −0.00052 → **−0.030°**; YAW (back, vertical bar at x=0 through the notch) `sight_dx` **−0.0020mm** over a
  169.7mm sight radius → **−0.0007°**, silhouette yaw −0.003° (sd 0.029mm). Volume centroid
  **(1.2e−8, 1.1e−8, −7.9e−9)**, det +1, `matrix_world` identity. Scene cleaned (fiducials + ortho cam
  removed, `Camera` restored).
- **Residual risk:** the step-detector's z band (28–36) is hand-set to this gun's parting height, same
  as the Echelon's groove band — both need generalising to a fraction of the height extent before either
  folds into `refine_parting`. The slide-span window (y −108…−24) is likewise hand-picked; a generalised
  version needs to *find* where the step's `z` plateau breaks rather than being told. Owner viewport
  confirm pending on this gun.
- Tools: blender-mcp (`execute_blender_code` — stdout is NOT returned, redirect to a file and Read it),
  numpy on the live mesh, workbench ortho renders (side/front/back + slide-top zoom) against fiducial bars.
  <!-- @anchor: v1 | failure: SPHINX SDP — (a) the Echelon interior-groove detector found no groove (this gun's parting line is a plain STEP) and returned rms 1.74mm of noise, (b) fitting the step over the FULL length mixed in the frame/beavertail shoulder 3.4mm lower and read -1.51deg vs the true -0.010deg, (c) 0.25mm z-bins on a 65k-vert mesh silently rejected every slice (n=0, no error), 2026-07-27b | regression: cgs-align SKILL.md Session Notes 2026-07-27b (step-detector = argmin of diff(max|x|(z)) + contrast gate; fit the SLIDE SPAN ONLY; diagnose rejection counts before trusting n=0) -->

### 2026-07-27 (SPRINGFIELD ECHELON 4.5 — measure the parting GROOVE directly, not the slide-top proxy)
- **Run:** `ECHELON 4.5` raw scan, 470,777 verts / 941,558 tris — the largest mesh this skill has handled;
  the full pipeline ran fine over the socket. Owner supplied **two rough annotation dots** on the
  upper/lower parting line (read from `bpy.data.annotations`, world space, X=0 → drawn in a side-ortho
  view, so they carry PITCH only and **no yaw information** — their post-transform X spread is an artifact
  of the rotation, not a measurement. Don't read yaw off a side-view annotation).
- **Auto-align was clean:** lattice fired −32.95° (coherence 0.497, `lattice_ok`) — the same ~33° PCA-vs-bore
  error as both Glocks, so that bootstrap is now confirmed on a third, non-Glock platform. Refines:
  parting +0.32°, roll +0.72°, sight-yaw +0.01°. `dims 33.98 × 201.69 × 134.47` vs the real Echelon 4.5's
  ~30 × 203 × 140 — the sanity check that caught the G19 (inflated length / shrunk height) passes here.
  `aligned_ok: false` with NO manual offset — expected: the verifier re-checks against the no-refine pose
  and the 0.72° roll refine trips `R_offdiag 0.0125`. Benign, same class as a manual offset.
- **New measurement — the parting GROOVE itself.** The skill's `refine_parting` levels the slide-top
  SILHOUETTE EDGE as a *proxy* for the owner's real datum. On this gun the two disagree by **0.17°**
  (silhouette −0.139° vs groove +0.031°) — the slide top is not exactly parallel to the parting line here.
  So I measured the owner's datum **directly**: per-Y-slice, scan a tight Z band (15–27mm) and take the Z
  that MINIMISES `max|x|` — the slide/frame seam is a genuine recess, so it shows as an interior local
  minimum of the side profile's half-width. Parabolic sub-bin refine, MAD-trim, line-fit. Result:
  **40 clean slices, groove depth 1.8mm, fit rms 0.063mm over a 137mm span** — a far tighter datum than
  any proxy. Reject slices whose minimum lands on a band EDGE (no interior groove) — without that guard
  the fit reads 8.1° of garbage. Applied the residual as a rigid Rx: **groove +0.337° → +0.031°.**
- **Sign trap (cost one extra step):** with `Rx = [[1,0,0],[0,c,-s],[0,s,c]]` applied as `P @ Rx.T`, a
  POSITIVE angle tips the muzzle (at −Y) **DOWN**, i.e. opposite the skill's `pitch_offset_deg` convention.
  I applied +0.157° and made it worse. Always test the matrix on a probe point (`(0,-100,20)`) and read the
  muzzle's Z change BEFORE baking — the docstring convention belongs to `align_object`'s knob, not to a
  hand-rolled matrix.
- **Three-view verify, all green:** PITCH (side ortho, red bar at z=20.5 on the seam) parting groove
  **+0.031°**; ROLL (front ortho, bar on the slide top) slide-top normal nx −0.0018 → **−0.102°**;
  YAW (top ortho + numeric) front-post centroid x **+0.06**, rear-sight centroid **+0.10** → dx 0.04mm over
  a 164mm sight radius = **0.014°**. Volume centroid **(0,0,0)** exactly, det +1, `matrix_world` identity.
- **Independent cross-checks that agree** (none shares the aligner's basis): owner's annotation line
  −0.418° (two hand dots over 176mm — a 1mm placement error IS 0.33°, so this is a ±0.4° instrument, good
  for catching a gross miss, useless for the last half-degree); slide SILHOUETTE centre in top view
  **mean +0.007mm, sd 0.016mm, yaw −0.012°**. ⚠ A sidewall FACE-CENTROID mean is NOT a centering metric —
  it read the slide 0.27mm off-centre where the silhouette says 0.007mm (asymmetric features: ejection
  port, serrations, controls skew the face distribution). Use the per-slice `(xmin+xmax)/2` silhouette.
- **SIGHT CHANNEL (owner asked to review it) — mold-relevant geometry.** Slide-top plane sits at
  **z = 41.2** (dominant up-face area 3,636mm²; the optic/VIS cut dips to 40.76 around y −30..−10).
  FRONT post: y −116..−100 (16mm), **4.6mm wide**, top z 47.82 = **6.6mm proud**, centre **x +0.06**.
  REAR sight: y +48..+68 (20mm), **17.3mm wide**, top z 47.74 = **6.5mm proud**, centre **x +0.10**;
  U-notch gap 3.09mm. Channel centreline **x ≈ +0.08mm** — dead on the world centreline.
  ⚠ Don't derive the slide-top baseline from a percentile of a "top-14mm" band (it read 41.0 and swallowed
  the whole upper slide, making the front sight look like a 74mm rib). Use the **area-weighted histogram of
  up-facing (nz>0.97) face centroids** — the real flat shows as a single dominant bin.
- **Residual risk:** roll left at −0.102° and pitch at +0.031° (both well under the ~0.5° a decimated/scanned
  surface can resolve); owner's eye is the final arbiter. Rear-sight windage is a PHYSICAL zero, not a pose
  error — never chase a drifted rear sight with yaw; the slide silhouette (sd 0.016mm here) is the check.
  The groove-scan Z band (15–27mm) is currently hand-set to this gun's parting height; generalise it to a
  fraction of the height extent before folding it into `refine_parting`.
- Tools: blender-mcp (`execute_blender_code` — note stdout is NOT returned, redirect to a file and Read it),
  numpy on the live mesh, workbench ortho renders (side/front/back/top + zooms) against fiducial bars.
  <!-- @anchor: v1 | failure: refine_parting's slide-top-silhouette proxy disagreed with the true upper/lower parting groove by 0.17deg on the Echelon 4.5 (slide top not parallel to the parting line); and a hand-rolled Rx matrix applied pitch in the OPPOSITE sense to align_object's pitch_offset_deg convention, 2026-07-27 | regression: cgs-align SKILL.md Session Notes 2026-07-27 (min-|x| interior-groove scan + probe-point sign test) -->

### 2026-07-20 (GLOCK 19 GEN5 — PCA is not the bore; bore-lattice bootstrap + a REAL-GUN suite)
- **Failure:** `align_object` shipped the G19 GEN5 (99,271 verts) **~31° pitched with the muzzle on the
  wrong end** — and self-reported `aligned_ok: true`. Diag showed the tell in plain sight and I nearly
  missed it: `extent_length 197.89 / extent_height 107.58` against a real G19's 185.6 × 128.7 — the frame
  was rotated ~31° in the length-height plane, inflating length and shrinking height. Both datum refines
  read **0.00°**: their guards cap at 8° (parting) and 3° (sights), so a 31° gross miss is *below their
  floor* and they silently no-op. `grip_is_down` read false. Every anatomy test had keyed off a garbage frame.
- **Root cause:** **PCA's principal axis is not the bore.** The area-weighted surface covariance is dragged
  toward the grip — a GEN5 grip's stipple texture alone contributes tens of thousands of faces. Measured:
  the PCA length axis sits **32.9° off the slide on the G19 and 35.7° off on the G17**. The G17 only ever
  *looked* fine because its flats leveler happened to find the rail and converge; the G19's didn't (it moved
  −1.41°). The bug was always there in both — one gun just hid it.
- **Fix:** `_bore_lattice_pitch` — snap the frame onto the gun's **machined-flat 4-fold lattice** before any
  anatomy test runs (4th-harmonic circular mean of non-sidewall face normals in the length-height plane).
  Textured/curved surfaces cancel in the harmonic sum, so the exact mass that poisons PCA is the mass this
  ignores. Phase mod 90° = pitch only; label and signs stay with the existing (now-reliable) tests.
- **Live recovery:** rebuilt René's pose by hand off his **two annotation markers** (read out of
  `bpy.data.annotations` — a genuinely useful owner-supplied datum, worth checking for every time), then
  refined to parting −0.28° / roll +0.05° / yaw −0.08° and confirmed in all three ortho views against
  fiducial bars. Owner: "alignment is good."
- **Verification — and the real lesson.** The synthetic suite was **100% green through the entire failure**,
  before and after. So I built `verify_real_guns.py` on René's own STLs and found the ground truth I'd been
  missing all along: **his production `*SOLID GUN.stl` files are already in his canonical pose.** Score by
  Kabsch rotation back to that pose and you get one number that cannot share the aligner's blind spot.
  Result: **G19 40/40 @ 0.40°, G17 40/40 @ 0.33°** from arbitrary random start poses, deterministic.
  A/B: with the bootstrap neutered the synthetic suite output is **byte-identical** — the fix is a proven
  no-op there (self-zeroing), which is also why that suite could never have caught this.
- **Process lesson (new, and the sharpest one this skill has):** two of my own datums *disagreed* on the
  G17 (parting-edge −2.18° vs slide-top normal +0.16°) and I could not adjudicate them — Blender's socket
  had dropped, so no render, no owner eye. Guessing which metric to trust was the trap; going and *finding*
  an external reference was the move. The owner's own shipped assets were sitting on disk the whole time.
  When two derived metrics disagree, don't pick — go find something outside the system.
- **Adversarial pass** (idempotence, vertex noise, non-uniform scale, decimation, the 45° label boundary):
  robust everywhere except one real defect it exposed — **when the lattice guard trips, the fallback is raw
  PCA, i.e. straight back into this bug, silently.** At ≥0.4mm per-vertex jitter on a ~0.5mm-triangle mesh
  the normals randomize, coherence collapses, and the gun comes out **upside-down (178°)** while
  `aligned_ok` still reads true. Fixed by *reporting*, not by pretending: `lattice_coherence` +
  **`lattice_ok`** are now in the diag. **A `lattice_ok: false` pose must be eyeballed in all three ortho
  views before use — never ship it on `aligned_ok` alone.** Otherwise: idempotent, stable down to **1% of
  the faces** (2,001 tris → 0.51°), and unaffected by the start frame anywhere in 0–80° including the 45°
  label-swap boundary.
- **Residual risk:** the lattice bootstrap is validated on two Glocks. A gun whose slide/frame flats are not
  a clean 90° family (heavy custom cuts, a ported comp, a scan too coarse to hold flats) trips the 0.15
  guard → `lattice_ok: false` → the fallback above. Re-run the real-gun suite on the SIG / PDP / HK /
  OLIGHT next time they're loaded; add each confirmed STL to `GUNS`.
- Tools: blender-mcp (live G19 surgery, ortho renders vs fiducials, annotation readout), Read/Edit/Write,
  Blender-5.1 python numpy (offline STL harness, Kabsch, A/B regression).
  <!-- @anchor: v1 | failure: GLOCK 19 GEN5 shipped 31deg pitched + muzzle on the wrong end with aligned_ok=true — PCA's principal axis sits ~33deg off the bore on real Glock STLs (grip texture dominates the covariance) and both datum refines no-opped under their 8deg/3deg guards, 2026-07-20 | regression: scripts/verify_real_guns.py (Kabsch-vs-owner-canonical-STL, G19+G17 40/40) + cgs_align.py _bore_lattice_pitch + cgs-align SKILL.md method step 2b -->

### 2026-07-10b (GLOCK 43 — ROLL datum added + parting-refine rebuilt from sidewall-PCA to silhouette-edge)
- **Failure #1 (pitch, same-day regression of the 2026-07-10 fix):** the `refine_parting` I shipped that
  morning levelled to a **PCA of the slide-sidewall face-area blob**. That 2D blob's principal axis is skewed
  by the selection band — it has a FIXED POINT ~1° rear-up of the true parting line. The aligner "corrected"
  0.85° yet the slide stayed +0.75-1.0° tilted, and my verifier measured the SAME sidewall-PCA so it
  rubber-stamped it ("all three references agree at level"). Owner caught it against a horizontal ruler in
  his viewport. The skill's oldest lesson, AGAIN: never verify with a metric that can share the aligner's
  blind spot. **Fix:** re-level to the **slide-top SILHOUETTE EDGE** (97th-pct height per length-slice,
  MAD-trim the sight spikes, line-fit). Measured the real mesh three ways — top edge +0.99°, sidewall-PCA
  +0.75°, sidewall-bottom-seam −0.26° — the ortho-ruler render settled it: the top edge (+0.99°) matched the
  eye. Applied −0.99° → top 0.00°, parting seam 0.04°. Owner: "all good."
- **Failure #2 (ROLL — the real miss):** after the pitch fix I declared it level off the SIDE (pitch) and
  BACK (yaw) views — and **never rendered the FRONT view.** Owner rotated to Front-Ortho, drew a horizontal
  line across the slide top, and it was **canted ~0.8°** (he hand-fixed it: `Rotation Y = +0.8°`, which drove
  the slide-top normal nx to ~0). Roll is INVISIBLE in the side/back views; a third view is mandatory. The
  pitch/yaw refines never touch roll, and a decimated scan's principal WIDTH axis alone isn't better than
  ~0.5-1°. **Fix:** new `refine_roll` — slide-top up-face AREA-weighted consensus normal, rotate about the
  bore so it points +Z (zero its width-component). Guarded + self-zeroing.
- **Validated:** offline `verify_align_math.py` 300/300 guns (all asserted checks 0 failures) + 240 WML
  (slide-level artifact unchanged, overall PASS) — both new refines self-zero on the flat-top synthetic gun.
  **Live from the TRUE RAW scan** (recovered on a duplicate via the stored transform + owner's Ry): the
  hardened pipeline auto-fired parting +1.03°, **roll +0.58°**, yaw +0.33° and landed **pitch −0.05° / roll
  −0.09° / yaw 0.37mm(~0.16°)** — reproducing the owner's hand pose with zero manual input. Rendered all
  three ortho views (front/side/back) with horizontal/vertical fiducials to confirm.
- **Process lesson:** "level" is a THREE-view claim (pitch=side, yaw=back, roll=front). Declaring it off the
  views you happened to check — while the one you skipped hides the error — is the same failure as trusting a
  verifier that shares the aligner's basis. Both bit in the same session. Render every ortho view; measure
  against an independent reference; the owner's eye is ground truth.
- **Pending:** live re-confirm on the SIG/PDP/HK/OLIGHT next load (both refines self-zeroing + guarded, so
  expected no-change; the PDP should now auto-level roll+pitch without its manual +3°). Owner viewport
  confirmation of THIS hardened auto-output (front/side/back renders shown) still to bank on next load.
- Tools: blender-mcp (execute_blender_code on the real mesh + duplicate raw-recovery, workbench ortho renders
  vs fiducial bars), Read/Edit/Bash (Blender-5.1 numpy offline suite), duplicate-from-raw live E2E test.
  <!-- @anchor: v2 | failure: GLOCK 43 (a) parting-refine sidewall-PCA converged ~1° off + same-basis verifier rubber-stamped it, (b) roll ~0.8° shipped because the FRONT ortho view was never rendered, 2026-07-10b | regression: cgs_align.py _refine_pitch_to_slide (silhouette-edge) + _refine_roll_to_slide_top (new) + verify_align_math.py 300/240 green + cgs-align SKILL.md Session Notes 2026-07-10b + 3-view verify block -->

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
