---
name: cgs-mold
description: Turn a gun scan into a handoff-ready custom-gear.ch (René Spatz) holster split-mold, fully inside Blender via blender-mcp. Use when the owner says "make a mold from this scan", "cgs-mold", "turn <gun> scan into a mold", or provides a gun scan + active Blender MCP and asks for a holster mold. Blender-only — no FreeCAD.
triggers: ["cgs-mold", "/cgs-mold", "holster mold", "gun scan to mold", "make a mold from this scan", "turn this scan into a mold"]
---

# cgs-mold — gun scan → holster split-mold (Blender-only)

Pipeline that reproduces René Spatz's custom-gear.ch holster blocking inside Blender, driven
over **blender-mcp**. Input: a gun-scan mesh already in the Blender file (or an STL to import) +
the MCP server live. Output: a cut, smoothed, offset mold object ready for STL export + handoff.

> ★ **SOURCE OF TRUTH = [`METHOD-NOTES.md`](METHOD-NOTES.md).** It holds the live, owner-validated
> gun-dip method + the root-cause findings. The pipeline below is the current method; the OLD
> heightfield-sweep / hammer-cut pipeline is **superseded** (kept only in git history).

**Failure-anchored rules (verified 2026-06-29/30):**
1. **Never round the SCAN's detail** (no voxel/marching-cubes *to retopo the scan surface* — it
   washes the sharp swept edges; the recurring 2026-06-28 failure).
2. **The mold MUST be a FILLED SOLID before any boolean cut.** A swept mold often comes out as a
   closed shell with *internal walls* (`nonmanifold>0` **with** `boundary==0`). A boolean can't
   read inside-vs-outside through internal walls → it tears / empties / leaves the cut piece.
   Fix = voxel-remesh the **MOLD** (not the scan) into one filled solid (manifold 0/0, single
   island), THEN cut. Detail softened by the fill is recovered by the feature-preserving smooth (step 4).
<!-- @anchor: v2 | failure: blender holster sessions 1–3 + 2026-06-28 retopo breakage + 2026-06-29 boolean-tears-on-hollow-shell | regression: METHOD-NOTES.md ★ROOT CAUSE; solidify-then-cut (voxel-fill → FLOAT cube DIFFERENCE) -->
3. **The dip = full-length log-doubling voxel-UNION (`sweep_dip`) — muzzle ALL THE WAY TO THE END.**
   NEVER an array-of-copies (→ visible steps) and NEVER a front/back-face split + bridge (→ combs
   fine features like slide serrations). Union whole solids and voxel-fill the envelope each pass;
   both operands stay complete so nothing tears, and each shift ≤ current length so nothing steps.
<!-- @anchor: v1 | failure: cgs-mold sweep repeated stepped/combed attempts — G17 2026-07-01 array-steps + SIG1911 2026-07-02 attempt-1 array-steps / attempt-2 classification-comb; owner "sweep is incomplete" ×2 | regression: sweep_dip() in scripts/cgs_mold.py; METHOD-NOTES step 4; owner-confirmed "now it is correct" 2026-07-02 -->
4. **The dip must reach the FURTHEST-FORWARD feature — muzzle OR light bezel — on ANY gun.** Coverage
   is set by what `GUN_SOLID` contains, so build it with `assemble_gun_solid` (UNION every substantial
   island: gun + light + rail; drop only specks). NEVER "keep the largest island" — that HK45-era
   default drops a separate light, so a short gun with a big forward light gets a dip that stops at the
   muzzle. `travel` then defaults to the full assembled Y-span and reaches the furthest feature for free.
<!-- @anchor: v1 | failure: cgs-mold sweep incomplete on short-gun/big-light — light island dropped by 'keep largest island', dip stopped at the muzzle not the light bezel (René 2026-07-03) | regression: assemble_gun_solid() unions all islands + sweep_dip front_feature_z diagnostic; VALIDATED live 2026-07-03 on Glock 43X + TLR-7 (2 islands, both kept, dip front_y=-74.1 full 175.8mm) -->

## Pipeline (owner gun-dip method — validated)

0. **Assemble GUN_SOLID from the FULL scan** — `assemble_gun_solid([gun, light…])` [VALIDATED
   2026-07-03, Glock 43X + TLR-7]. UNION every substantial island (gun + light + rail), drop only specks, seal + center.
   Universal replacement for "keep the largest island" — the reason the dip now reaches the
   furthest-forward feature (muzzle OR light bezel) on any gun. Check `islands_kept` + `front_feature_z`.
   **Centering (owner 2026-07-03):** length (Y) + height (Z) on MASS, but WIDTH (X, the vertical
   clamshell-seam axis) on the **SIGHT CHANNEL** (`_sight_channel_x`) — mass is pulled off the true
   centerline by one-sided controls, so the seam (X=0) must reference the sights. Verify `sight_x_post`≈0.
1. **Swept solid (the dip)** — `sweep_dip()` [VALIDATED 2026-07-02]. FULL-LENGTH translational dip
   of GUN_SOLID along +Y — **furthest-forward feature all the way to the end** (travel = assembled
   Y-span, muzzle OR light bezel — whichever protrudes) so every
   −Y-facing undercut fills; the tail past the grip is cut B's job (don't shorten the travel).
   METHOD = **log-doubling voxel-union**: union with a +Y-shifted copy → voxel-fill the envelope
   each pass, doubling the shift (~8 passes). Output = one manifold-0/0 single-island filled solid
   (replaces the old sweep + the initial solidify). **REJECTED (do not repeat):** array-of-copies →
   steps; front/back-face split + bridge → combs fine features. Envelope-union never tears, never steps.
2. **Solidify / fill** — folded into `sweep_dip` (its last pass is a voxel-fill), so the swept solid is
   already a filled manifold 0/0 single island. Standalone `solidify_mold` remains the precondition
   any time you feed an un-filled shell to a boolean (see failure-rule 2). [VALIDATED]
2b. **Pinhole repair — MANDATORY after every voxel remesh** (`repair_pits`) — the voxel remesh inside
   `sweep_dip` manufactures **compact craters up to 1.4 mm deep** even from a defect-free scan (Glock 45
   2026-08-03b: GUN_SOLID 0 defects → swept solid **324**). They render as black dots, machine as real
   pinholes, and `smooth_mold` does NOT remove them. Run it on the swept solid, again after the booleans,
   and again after `smooth_mold`. Discriminator: a defect is a COMPACT blob (cluster bbox diag ≤ 2.5 mm);
   a real crease/groove/serration is an EXTENDED line and is rejected by the same test, so owner geometry
   is never at risk. `thr=0.25` is the noise-floor/feature boundary — below 0.20 real linear features
   start entering the candidate set. [VALIDATED 2026-08-03b]
   ⚠ **VALID ONLY ON A UNIFORM (voxel-remeshed) MESH — it DAMAGES anything else** (2026-08-04c). The
   2-ring probe `d = (mean₂ᵣᵢₙ𝗀 − v)·n` assumes every vertex's neighbours sit ~one voxel away. On a
   NON-uniform mesh the ring mean is not a local surface estimate, so `d` flags valid geometry and the
   umbrella repair pulls it apart — and the defect count RISES each round instead of converging.
   Measured, same gun, same session: on the raw scan (edges 0.22–10.3 mm) 139 → 257 → 235 defects,
   5,795 verts moved, mean **0.83 mm**; after decimate-collapse (edges 0.23–47.3 mm) 29 → 28 → 25,
   max displacement **25.2 mm**. **NEVER run it on the scan / GUN_SOLID, and NEVER after
   `decimate_mold`.** Legal points: after `sweep_dip`, after the booleans, after `smooth_mold` — all
   still at voxel density. Two tells that it is misapplied: (a) `defect_verts` not falling to 0 across
   rounds, (b) `mean_disp_moved_mm` ≫ the voxel size.
   ★ **PRE-FLIGHT GATE — measure the edge-length ratio p99/p1 before pointing it at ANY mesh** (2026-08-05):
   near-uniform ⇒ **ratio ≲ 3** (post-`sweep_dip`: p1 0.195 / median 0.400 / p99 0.455 = **2.3**) ⇒ probe
   valid, repair safe. Non-uniform ⇒ **ratio ≫ 3** (raw scan: p1 0.089 / p99 3.54 / max 13.5 = **39.7**) ⇒
   the reading is an ARTEFACT (that scan flagged 774 phantom "defects" while being watertight 0/0) and
   repairing it damages the mesh. This is the 08-04c rule made measurable — run it, don't eyeball it.
   Validate the DECIMATED mold instead with a BVH
   nearest-distance against the pre-decimate mesh (Glock 45 2026-08-04c: p99 0.006 mm, **max 0.013 mm**,
   zero verts over 0.1 mm — collapse cannot manufacture a crater, so a clean pre-decimate mold stays clean).
3. **Grip cut — TWO separate cuts, not one** — computed from the **swept MOLD's own geometry**
   (not the pre-sweep scan). ★ **If René drew an ANNOTATION line, use it verbatim for cut A** — read
   `bpy.data.annotations`, LS-fit `z=m·y+b`, shift scan→mold, build the cutter on that plane; see
   Session Notes 2026-07-28c for the full recipe. It beats `_find_cut_points` and is the owner's eye
   directly. Try **solver `EXACT` first** and guard `verts > 0.4×src && nonmanifold == 0`.
   Cut A: diagonal **CUBE cutter**, `BOOLEAN DIFFERENCE`,
   **`solver='FLOAT'`** on the solid (EXACT empties on heavy voxel meshes), through two owner-set
   points: **first = trigger-guard/grip corner, `corner_below_mm` (20) BELOW**; **second = the
   REAL, natural beavertail (never shortened), `beavertail_below_mm` (10) BELOW**. Cube top face on
   that line, body on the grip side; delete cube. Cut B: a second **vertical cube cutter**
   (perpendicular to the draw axis, constant-Y flat plane, full width/height) positioned just past
   the real beavertail's natural Y — trims only the *artificial excess* a generous dip-sweep drags
   past the original grip (can be full slide-height, not grip-height); a single diagonal can't
   clear that without climbing into the slide or leaving a floating remnant. See METHOD-NOTES.md
   → "GRIP/TAIL CUT = TWO CUTS, NOT ONE" for the full failure story. [VALIDATED]
4. **Smooth / retouch** (`smooth_mold`) — feature-preserving denoise of the voxel surface; smooth
   AND sharp (keeps edges, bevels, grooves, corners crisp, no global rounding). **4 sub-passes**:
   flat Taubin denoise (sharp creases frozen) → crease-line de-zigzag (1D midpoint along the
   crease, corners frozen — this is what makes a jagged edge smooth *and* still sharp) → roughness
   deburr (melt voxel stair-steps by Laplacian magnitude, topology-agnostic) → crease re-straighten. [VALIDATED]
   ★ **The DEFAULTS leave a visible orange-peel — raise the flat denoise on any gun with big smooth
   surfaces** (owner reject 2026-08-04c, "mold is not smooth !!!!!"). Both deburr passes are
   THRESHOLD-GATED (`|Laplacian| > thr`, defaults 0.08 then 0.05) and the fine voxel pimple field
   measures **0.014–0.056 mm** — it sits UNDER the gate, so passes 3 and 4 never select it. The gate
   was tuned for voxel stair-STEPS, which are coarser. Fix = `smooth_mold(cut2, flat_pairs=8,
   deburr_thr=0.015, deburr_rings=3, deburr_pairs=12)`: the flat Taubin stage is ungated and runs on
   every non-sharp vert, so it is the lever that actually kills orange peel. Glock 45 + OLIGHT:
   light-body roughness p99 **0.102 → 0.051**, slide flank **0.072 → 0.020**, displacement p99 0.082 /
   max 0.33 mm. `flat_pairs=18` gains almost nothing (0.051 → 0.047) for more displacement — 8 is the knee.
   **Verify features survived by sharp-vert count at TWO angles**: 50° fell 2990 → 1402 but 70° only
   1537 → 1244, i.e. what was lost was noise-induced pseudo-edges in the 50–70° band, not real edges —
   a drop at 70° would mean real geometry going soft. Then confirm on a close-up render, not the number.
4b. **Overhang cleanup** (`remove_overhang`) — strong local collapse of any stray flap/hook "hanging
   over" the cut edge (e.g. the beavertail remnant). Gentle smoothing won't shift a flap; a tight
   high-iteration local Laplacian pulls it flush while the flat cut verts hold. [VALIDATED]
4c. **Regional ripple denoise** (`denoise_region`) — **OPTIONAL, owner's-eye-triggered** — only run
   when a render shows fine "ripple" staircase noise surviving `smooth_mold` on an otherwise-smooth
   curved region (e.g. a frame boss), visible only under raking/matcap light. Box-restrict to
   `y_range`/`z_range` (+optional `x_range`), freeze real creases via face-angle (`feature_angle`,
   default 35°) instead of a magnitude threshold, ring-expand the box so the fix blends without a
   seam, then Taubin-smooth everything else in the box. [VALIDATED 2026-07-03, SIG P226 XFIVE LEGION —
   see METHOD-NOTES.md step 7b]
5. **Offset +0.4 mm — SLIDE REGION ONLY** (`offset_mold`) — owner corrected (2026-06-30): the
   +0.4mm Kydex-shrink comp goes on the **barrel + slide + beavertail only** (the top assembly
   above the slide/frame parting line, `z_line`), NOT everywhere — the grip/frame/trigger
   guard stay put. Push the region verts outward along normals, feathered ~2mm at the line (no
   ridge). Verify the region bbox grew outward (else normals were inward). [VALIDATED]
   **`z_line` is scan-relative (2026-07-03)** — auto-seeded from the mold's own height, not the HK45 14mm.
   ★ **MEASURE it; and when the three-Y-band `max|x|` step recipe disagrees by >1 mm, switch probes
   (2026-08-05).** On the Glock 34 the bands read 28.75 / 29.25 / 31.0 — the front frame is NARROWER than
   the slide (0.7 mm step, nearly invisible) and the rear beavertail tang is wider, so no band is
   authoritative. Decisive probe = a **HORIZONTAL CROSS-SECTION**: `max|x|` vs Y at a fixed z. One plane
   below the line still reads frame along the whole length (z 29.5 → 13.0–13.5); one plane above collapses
   to the uniform slide half-width (z 30.5 → 12.3–12.7, y −88…+112) → `z_line` = between them. ⚠ Do NOT
   substitute a `|x|`-banded "slide flank min-z" probe — the dust cover shares the slide's half-width at
   low z and poisons half the bins.
5b. **Reduce to the FACE BUDGET — decimate-collapse, corners preserved** (`decimate_mold`, default
   `remesh=False`, VALIDATED 2026-07-03) — `DECIMATE COLLAPSE` straight to `target_faces` ≈ 125k, NO
   voxel re-solidify. ★ Two INDEPENDENT levers: **crispness = the sweep voxel (0.4)**; **face count =
   this budget.** Collapse sheds flat faces first so it KEEPS the crisp corners the 0.4 sweep produced —
   a voxel-remesh (`remesh=True`, legacy) would round them back. Ratio is vs TRIS (collapse
   triangulates) with one measure+correct. Glock 43X: 0.4 sweep → collapse → 119,549 faces, manifold 0/0.
6. **Export — TWO files, always, to an ASKED-FOR path** (`export_mold` **+ `export_gun`**) — owner
   directive (2026-07-03): **NO clamshell split anymore.** After decimate, export the whole mold as a
   single STL. `split_mold` (+ `_bore_center_x`) is DEPRECATED — kept for reference, out of the pipeline.
   ★ **ASK RENÉ FOR THE EXPORT FOLDER before writing** (owner directive 2026-07-28) — do NOT silently
   assume the dedicated one. Offer **`C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS`** as the default/first
   option (it stays the standing default), with "somewhere else" available so he can redirect per job.
   Ask ONCE, right before the export stage — not at the start, and not once per file: the same folder
   takes both `<gun-name>.stl` and `<gun-name> GUN.stl`. Pass it as `out_dir=` to both functions.
   ★ **ALSO export the repositioned original** (owner directive 2026-07-28):
   `export_gun(GUN_SOLID, "<gun-name>")` → **`<gun-name> GUN.stl`**. `assemble_gun_solid` TRANSLATES
   the scan into centered coords, so the scan on disk is NOT in the mold's frame. René re-imports BOTH
   into **Shapr3D** and they must land aligned — that only works with the MOVED gun. Export the pair in
   the SAME run so the centering is guaranteed identical; verify both objects have an identity
   `matrix_world` and matching front-Y / min-X. Never ship the mold alone.

## Pipeline — MAGAZINE CARRIERS (variant, owner-ruled 2026-08-01)

A magazine carrier is NOT a holster. Most of the gun cut logic (`_find_cut_points`, cut A, the
`z_line` region offset) is meaningless here and applying it would amputate the body or offset the
wrong half. The four owner rulings:

1. **Keep the ROUND.** If the magazine scan has a cartridge in the feed lips, it stays — the pouch
   is formed on a loaded magazine. Standing rule for all future magazine jobs. **If the scan has NO
   round, ASK before building** — it changes the formed envelope at the lip end and it is the owner's
   call, not a default (Sphinx 2026-08-03: René chose to proceed empty).
2. **Body only — one flat cut where the basepad starts.** The floorplate stays outside as the
   grab/stop. Find it as the Y where `min z` steps and `max|x|` starts to ramp (Glock 43X: y 104.0,
   `zmin` 4.67 → −1.68 across 0.5 mm). Drive it with `cut_tail(gun_rear=<that Y>, margin=0)`.
   No diagonal cut A, no cut B — a magazine has no grip and no beavertail.
3. **Datum = the long flat REAR SPINE face, down on Z = 0.** ★ **With NO annotation, identify the
   rear spine geometrically — three independent tells, all agreeing (Sphinx 2026-08-03):** (a) the
   REAR face is the one RELIEVED at the feed lips (its surface recedes over the last ~6 mm — the
   rounds' rims need that cut-away; the FRONT face runs full height to the lips to support the bullet
   noses); (b) the floorplate is FLUSH with the rear face and projects only toward the FRONT; (c) the
   rear face is the dead-flat featureless one — the mag-catch notch is on the front. Do NOT use
   witness holes as the tell: on this Sphinx they are on the SIDE (X) faces, not the spine. René annotates it; the annotation
   *selects the face*, an LS plane fit of that face *sets the plane* (his two hand dots landed
   0.03 / 0.33 mm off the fit — right face, hand wobble). Pose = rotate the fitted normal to +Z,
   then 180° about Y so it faces −Z; X = 0 on the magazine's bilateral symmetry plane; draw
   direction stays +Y (toward the basepad — the basepad is larger than the body in every direction,
   so the magazine can only exit that way, which is what makes +Y the correct sweep direction).
4. **+0.2 mm offset on the WHOLE mold** — ★ **NOT the gun's +0.4** (owner correction 2026-08-04:
   "0.4mm is too loose on a magazine"). A magazine is a small constant-section prism the pouch has
   to RETAIN by friction; the gun's +0.4 Kydex-shrink comp doubles into +0.4 of diametral slop on
   a 20 mm-wide part and the magazine falls out. No slide/frame parting line exists, so it goes
   everywhere: call `offset_mold(z_line=zmin-10, offset=0.2)` so the weight is 1 across the whole
   mold, then **re-seat the rear face to Z = 0** and apply the SAME translation to the exported
   magazine (see the trap below). Verify the region bbox grew **+0.2** outward on all six faces.

The dip still earns its keep: it fills the **mag-catch notch** on the front face, which would
otherwise lock the magazine into the pouch, and it fills the rear witness holes flush.

Export pair: `<name>.stl` + **`<name> MAG.stl`** (not ` GUN.stl` — `export_gun` hardcodes the wrong
suffix for magazines; write the sibling inline).

## Invocation (blender-mcp must be live on :9876)

Run the engine inside Blender via `execute_blender_code`; it execs the on-disk module so the
heavy logic stays version-controlled:

```python
# Windows (René's box). Engine path = repo-local; use forward slashes or a raw string in Blender.
exec(open(r"C:\Users\rene\.claude\skills\cgs-mold\scripts\cgs_mold.py").read(), globals())
# 1. ASSEMBLE the FULL scan -> GUN_SOLID: union EVERY island (gun + light + rail), drop only specks,
#    seal + center. Pass the gun AND any separate light objects. This is what makes the dip reach the
#    furthest-forward feature (muzzle OR light bezel) on any gun — NOT 'keep the largest island'.
gun, sa = assemble_gun_solid(["<gun-scan>", "<light-scan-if-separate>"])   # -> GUN_SOLID
#    check sa["islands_kept"] covers every real part, and sa["front_feature_z"] (low => a forward light drives the front)
# 2. THE DIP (full-length, furthest-forward feature -> end): produces a filled manifold 0/0 solid directly
solid, s = sweep_dip(gun)                                     # -> CGS_MOLD_SOLID  (travel = full assembled Y-span)
# 2b. sweep_dip default voxel=0.4 -> CRISP corners (0.7 rounded them). ~17s, base ~666k verts.
# 2c. MANDATORY: kill the craters the voxel remesh just manufactured (René 2026-08-03b, "little holes
#     everywhere"). Re-run after the booleans and after smooth_mold too — each is cheap and idempotent.
repair_pits(solid)                                            # in-place; check rounds[] -> defect_verts 0
# 3. cut A (diagonal grip) + cut B (vertical tail) -> smooth -> remove_overhang? -> offset
# 4. decimate_mold(smo) -> export_mold(final, "<gun-name>")   # remesh=False collapse to ~125k faces,
#    corners preserved; ONE solid piece, NO split (owner 2026-07-03)
# 5. ASK René for the export folder first (default = the dedicated one), then write BOTH files there:
#    export_mold(final, "<gun-name>", out_dir=CHOSEN)
#    export_gun(gun,    "<gun-name>", out_dir=CHOSEN)   # repositioned original, for Shapr3D alignment
```

Every stage is a standalone function — `sweep_dip`, `solidify_mold`, `cut_grip`, `smooth_mold`,
`remove_overhang`, `denoise_region`, `offset_mold`, `split_mold` — each returns `(object, summary_dict)`
except `remove_overhang`/`denoise_region`/`offset_mold`, which are in-place and return just `summary_dict`.
Tune one stage and render between. (`build_mold` is the legacy
single-cut core = solidify → cut → smooth; the current grip stage is TWO cuts, so drive the stages
individually. `build_mold` writes `/tmp/cgs_mold_summary.json` — a Unix path; skip it on Windows.)

**Verify by rendering** the result object after each stage (`bpy.ops.render.opengl(view_context=True)`
to a PNG, then Read it). The owner's eye sets cut placement + smooth strength — don't trust counts alone.

## Parameters (per-gun preset JSON in `params/`)

- `solidify.voxel_size` (0.7) — voxel-fill resolution; finer = less stepping, heavier mesh.
- `grip_cut`: `solver` (`FLOAT`), `corner_below_mm` (20), `beavertail_below_mm` (10) — the two cut points.
- `smooth` (optional overrides) — `feature_angle` (50), pass counts, `deburr_thr`; defaults are baked into `smooth_mold`.
- `out_name`, `render`.

Cut points are **auto-detected then tuned visually per scan** — `_find_cut_points` locates the
trigger-guard/grip corner (knee of the bottom-Z profile) + the beavertail (rearmost mid-height vert),
the owner's eye sets the final `*_below_mm`. New gun → copy `hk45.json`, adjust the two offsets.

## Safety conventions (born from 2026-06-28)

- **Non-destructive**: reads only the scan's verts; the source object is never mutated; every
  run creates a NEW object and hides the scan. No in-place edits, no booleans on the scan.
- **Render-verify every run** before claiming done; tune against the PNG, don't trust counts.
- If a mesh op would mutate existing geometry, snapshot/duplicate first.

## Status / scope

- **VALIDATED (owner-confirmed 2026-06-30, "this is successful"):** solidify (voxel-fill) → grip cut
  (FLOAT cube DIFFERENCE, corner−20/beavertail−10) → 4-stage feature-preserving smooth → overhang cleanup.
  Manifold 0/0 throughout. Deliverable on HK45 = `CGS_MOLD_FINAL`.
- **VALIDATED (owner-confirmed 2026-07-02, "now it is correct"):** the **dip/draw sweep** — `sweep_dip()`
  full-length log-doubling voxel-union, muzzle→end, manifold 0/0. Closes the last upstream gap; the
  pipeline now runs scan → assemble → `sweep_dip` → cut A/B → smooth → offset → decimate → export (ONE piece, no split).
- **TODO:** alignment pins on the split mating faces, STL export gate.
- **Seal** is trivial when the scan is already a watertight solid (René's "SOLID GUN FOR AUTOMATION"
  exports import as manifold 0/0, 1 island — just center on origin; no reseal needed).

## Session Notes

### 2026-08-05 — GLOCK 34 + X300 TURBO (B mount) — **DONE, EXPORTED**; owner ask = "no holes or bubbles"
- Scan `GLOCK_34_X300U-B-X300-TURBO-B-MOUNT` 143,521 v / 287,078 f, **watertight 0/0**, already canonical
  (X 37.85 · Y 223.87 · Z 140.38 = Glock 34 spec, slide 207 mm). Gun + light welded into one island.
  **5 islands: 1 real + 4 floating specks of diag 0.01–0.20 mm sitting INSIDE the gun's own bbox**
  (y −96…−88, z 5–14) — `assemble_gun_solid`'s `speck_frac` dropped all four. Worth naming because these
  are exactly the thing that becomes an interior **bubble** if kept: a stray shell inside the envelope.
  Check `islands_total → islands_kept` on every scan; a dropped island of diag > ~1 mm would be a real part.
- **★★ THE OWNER'S QUESTION ANSWERED WITH PER-STAGE NUMBERS — the pits are made by `sweep_dip`'s voxel
  remesh, never by the STL.** Measured with the 2-ring probe on this gun:

  | stage | verts | `|d|>0.25` | dmax |
  |---|---|---|---|
  | scan (raw, non-uniform) | 143,521 | *774 — INVALID, see below* | 0.893 |
  | `GUN_SOLID` | 143,499 | *773 — INVALID* | 0.894 |
  | after `sweep_dip` (0.4 voxel) | 963,290 | **1,726** | **1.310** |
  | after `repair_pits` ×5 | 963,290 | 1,378 (**all 32 clusters EXTENDED = real creases**) | 0.992 |
  | after cuts + repair ×4 | 333,762 | 773 (extended) | 0.816 |
  | after `smooth_mold` + repair ×3 | 333,762 | **6** | **0.250** |

  Compact-crater count fell **334 → 47 → 21 → 11 → 2** (monotone — the convergence tell), 3,676 of 963k
  verts moved, mean 0.248 mm ≈ 0.6× the voxel. Final mold: **0 boundary edges** (no holes), **1 island**
  (no interior bubble — a trapped void would show as a second component), **0 non-manifold**.
- **★ NEW — the 08-04c "`repair_pits` is voxel-density-only" rule is now a ONE-LINE MEASURABLE GATE:
  the edge-length ratio p99/p1.** Same probe, same session: scan **39.7×** (p1 0.089 / p99 3.54 / max
  13.49 mm) vs post-sweep **2.3×** (p1 0.195 / median 0.400 / p99 0.455). The 2-ring probe assumes every
  neighbour sits ~one voxel away, so it is meaningful only when that ratio is near 1. **Ratio ≲ 3 ⇒ probe
  valid and `repair_pits` is safe; ratio ≫ 3 ⇒ the reading is an artefact and repairing it DAMAGES the
  mesh** (08-04c measured 139 → 257 → 235 divergence + 0.83 mm mean displacement on a raw scan). This
  turns a judgement call into a check — run `edgestats` before ever pointing `repair_pits` at a mesh.
  It is why the 774/773 rows above were correctly IGNORED rather than "fixed".
- **⚠ The three-band `max|x|` parting-line recipe FAILED on this gun — bands disagreed by 2.3 mm.**
  Frame-plateau-end ↔ slide-plateau-start midpoints came out **front 28.75 · mid 29.25 · rear 31.0**,
  because (a) at the FRONT the Glock frame is NARROWER than the slide (12.2 vs 12.9 half-width — a
  0.7 mm step, so the "step" is nearly invisible) and (b) at the REAR the beavertail tang (16–17) rides
  up against the slide. **The decisive probe is a HORIZONTAL CROSS-SECTION at candidate z planes:
  `max|x|` vs Y at a fixed z.** At **z 29.5** it reads 13.0–13.5 (frame) along the whole length; at
  **z 30.5** it collapses to a uniform **12.3–12.7** (slide) from y −88 to +112. One plane, one number,
  no band arbitration → **z_line 30.0**. Use this whenever the three bands disagree by more than ~1 mm.
  ⚠ A `|x|`-banded "slide flank, min z per Y" probe is NOT a substitute — the frame's dust cover is also
  12.55–13.05 half-width at low z, so the mask catches it and returns 18–21 in half the bins.
- **★ The knee is unambiguous on a full-dip mold because the mold's bottom-Z profile is the RUNNING MIN
  → monotone non-increasing.** Plateau **−15.881 held dead flat from y 20.95 to 52.95**, then 53.95
  −16.91 · 54.95 −19.02 · 55.95 −21.39, continuous → **corner (52.95, −15.881)**. The GUN's own profile
  is NOT monotone (it dips to −15.2 at y 34, RISES to −11.42 at y 46.9 under the trigger guard, then
  plunges) — so "last flat bin" is only well-defined on the MOLD. Profile both and use the mold; the gun
  is the cross-check (its plunge crosses −15.881 at y ≈ 53.5 ✓).
- Beavertail on **GUN_SOLID**, banded probe: **(117.61, 24.81)**, identical across all three `bt_band`
  values. Rear silhouette confirms it is a genuine local ridge (z 19.8→108.1, z 23.8→**117.6**,
  z 29.8→115.2) and that the global rearmost point is the **grip heel at (129.3, z −68)** — the 08-04c
  trap, avoided. → **α 38.10°**, owner-confirmed ("keep 38.1°").
- **EXACT@dz=0 first try on both cuts.** Cut A 346,533 v (**0.360×src**) 0/0; cut B at y 135.3
  (`gun_rear + 6`) → 333,762 v 0/0, 1 island. No nudge ladder needed.
- `boot=0.4`: 11 log-doubling passes, travel 223.9, **17.3 s** on 143k v. The X300's cylinder axis is
  parallel to the sweep (the 07-28b shred case) and it came out clean — fourth confirmation that the
  shred was the non-watertight scan, not the sweep.
- **`smooth_mold(flat_pairs=8, deburr_thr=0.015, deburr_rings=3, deburr_pairs=12)` — the 08-04c
  anti-orange-peel params, second gun, works.** Slide-flank roughness p99 **0.1057 → 0.0530**; light-body
  p99 **0.0558 → 0.0202**, max 0.1275 → 0.0224. Before/after raking close-ups at ONE camera
  (`_g34_zs_before/after.png`): a dense raised pimple field → visually gone, every panel edge still crisp.
  25 verts spiked >0.5 mm (max 8.52) with p99 0.100 / p999 0.202 — the usual cut-corner signature;
  clamped → 0.484, 0/0. **Ten-for-ten on the clamp.**
- **⚠ The 08-04c sharp-vert gate OVER-FIRES on a gun with a lot of voxel staircase.** 50° fell
  4437 → 1897 (−57 %) and **70° fell 2674 → 1445 (−46 %)** — far more than the G45's −19 %, which that
  rule calls "real geometry going soft". It was NOT: the pre-smooth mesh simply carried far more
  quantisation corners (2,674 sharp70 vs the G45's 1,537), and the close-up shows every real edge
  intact. **The counts are a screening signal, not a verdict — the render decides**, exactly as the rule
  already says. Do not re-tune the smooth down on the count alone.
- Offset `z_line 30.0`, 118,119 region verts. Verified by REGION bbox: slide max|x| 12.967 → **13.367
  (+0.400)**, max_z **+0.400**, min_y **−0.400**, min/max X ±0.400; frame region **byte-identical
  (all five deltas 0.000)**.
- Decimate-collapse ratio 0.243, 3 iters → **122,044 faces / 81,036 v, 0/0, 1 island**; no sliver repair
  needed. Validated the DECIMATED mold the 08-04c way (BVH nearest-distance vs the pre-decimate mesh,
  40,518 samples): p50 0.0003 · **p99 0.0038 · max 0.0127 mm · zero verts over 0.1 mm** — collapse
  cannot manufacture a crater, so a clean pre-decimate mold stays clean.
- **Mold/gun front-Y gap 0.019 mm ≈ 0 is CORRECT here — third confirmation of the 08-04b rule.** The
  front-most feature is the **light bezel at z −12.6** (1.8 mm ahead of the muzzle; `front_feature_z`
  −12.3), which sits BELOW `z_line` and gets no offset. A +0.4 gap would have been the bug. Same for
  min-X (−0.040, widest point is the light at z ≈ 24). max_z **+0.442** IS the offset — the front sight
  is above the line.
- **Pose: measured, NOT corrected — only ONE axis had agreeing signs and it was inside the scan's own
  noise.** pitch: slide-top plane **−0.0965°** (rms 0.138, n 210) vs sight-line −0.266° — same sign but
  2.75× apart, and −0.0965° = 0.38 mm over 224 mm, below the slide-top fit's own rms band. roll:
  slide-top −0.029° vs symmetry **+0.533°** → OPPOSITE. yaw: symmetry −0.006° vs sight-line **+0.108°**
  → OPPOSITE. Per the 08-04c rule, correct only where independent datums agree in sign — here that is
  one axis at a magnitude not worth a rotation. ⚠ The light-underside datum (+1.34°) was discarded on
  its own evidence: rms **0.697** over 1,616 pts, i.e. that surface is curved, not a plane. **A datum
  with 5× the rms of the others is not a vote.**
- Export (folder confirmed with René = the standing default):
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\GLOCK 34 X300U-B.stl` (7.92 MB, 81,036 v)
  **+ `GLOCK 34 X300U-B GUN.stl`** (14.02 MB, 143,499 v). Both identity `matrix_world`; both
  byte-verified against `84 + 50·TRIS` — ⚠ the mold is **mixed quad/tri** (122,044 faces → **162,140
  tris** → 8,107,084 B exactly), so check against TRIS, never faces.
- ⚠ MCP `execute_blender_code` again returned `"Code executed successfully: "` with **stdout dropped**
  (third session running). Every stage dumped to `_SYSTEM/state/_g34_*.json` and was read back from disk.
- ⚠ **The repo copy of this skill (`yuri-os/.claude/skills/cgs-mold/`) is frozen at 2026-07-03**
  (last commit 08ffc972); the LIVE copy that actually runs is `C:\Users\rene\.claude\skills\cgs-mold\`.
  Everything from 07-09 onward — `repair_pits`, the anti-orange-peel params, all session notes — exists
  only in the live copy. Edit the live one; the repo copy needs an owner-approved sync.
  <!-- @anchor: v1 | failure: (a) the three-band max|x| parting-line recipe returned 28.75 / 29.25 / 31.0 on one gun — a 2.3mm spread — because the Glock frame is NARROWER than the slide at the front (0.7mm step) and the beavertail tang is wider at the rear, so no band arbitration is trustworthy; (b) the raw scan's 2-ring pit probe flagged 774 verts that are NOT defects, and repairing them would have damaged the mesh (08-04c precedent); (c) the 08-04c sharp70 gate flagged a 46% drop as "real geometry going soft" when the close-up render showed every edge intact; (d) a light-underside plane datum reported +1.34deg pitch against two datums reading -0.10/-0.27 because that surface is curved (rms 0.697 vs 0.138); 2026-08-05 | regression: cgs-mold SKILL.md Session Notes 2026-08-05 — read z_line off a HORIZONTAL cross-section (max|x| vs Y at a fixed z) when the three bands disagree by >1mm; gate repair_pits on the edge-length ratio p99/p1 (valid <~3); treat sharp-vert counts as screening only and let the render decide; discard a pose datum whose plane-fit rms is several times the others' -->

### 2026-08-04c — GLOCK 45 (19) + OLIGHT PL-2 (PRO) **RE-RUN** — **DONE, EXPORTED (overwrote 08-04b)**
- René re-imported yesterday's **`… (PRO) GUN.stl`** (85,400 v / 170,804 f, identity matrix, watertight
  1 island 0/0) and asked for two things: **check pitch/yaw/roll**, and **"make sure the mold is smooth,
  no holes or bubbles"**. Re-running from the exported GUN is legitimate and fully deterministic — it is
  the posed scan in the mold frame, un-offset (the offset lives only on the mold).
- **★ PITCH/YAW/ROLL — measure each axis with ≥2 INDEPENDENT datums and only correct where the SIGNS
  agree.** Four tells on the scan: slide-top plane fit (|x|<4, sights excluded, rms 0.014 mm / 155 pts),
  underside flat, bilateral-symmetry plane (mid-X per 2 mm (y,z) cell, width>8 mm, trimmed LS, 1,095 of
  2,670 cells kept), and the front→rear sight line.
  - **pitch −0.128°** (slide top), −0.203° (underside), −0.310° (sight line) — **all three same sign** →
    real nose-up tilt → **CORRECTED**, `Matrix.Rotation(+0.0022340757, 4, 'X')` on the mesh, re-measured
    `dz_dy = −1e−6`. Derivation: for a plane `z = m·y`, rotation about X by θ gives slope ≈ m + θ, so θ = −m.
  - **roll** +0.116° (slide top) vs **−0.088°** (symmetry) — **OPPOSITE SIGNS** → NOT corrected.
  - **yaw** −0.039° (symmetry) vs +0.033° (sight line) — **OPPOSITE SIGNS** → NOT corrected.
  A sign disagreement between two valid datums means the residual is the SCAN's own asymmetry (the slide
  top is not exactly perpendicular to the symmetry plane), not a pose error; "correcting" to one datum
  tilts the mold against the other. ⚠ Do NOT read `roll_deg` off two different parameterisations and
  assume they agree — `dz/dx` on a horizontal plane and `dx/dz` on a vertical plane give roll with
  OPPOSITE sign for the same rotation (ψ = −atan(dz_dx) vs ψ = +atan(dx_dz)); derive each before comparing.
- **★★ OWNER REJECT — "mold is not smooth !!!!!"** → root-caused to the gated deburr; full mechanism +
  the fix parameters are now in pipeline step 4. Diagnostic that separated the two defect classes:
  render the SCAN and the MOLD at the SAME camera. Scan = coarse triangle facets + waves; mold = a dense
  field of fine RAISED pimples at ~voxel pitch. Different textures ⇒ different causes; the pimples are
  voxel quantisation, not scan noise, and `repair_pits` never sees them (they are bumps of 0.02–0.10 mm,
  under its 0.25 threshold — it hunts 1.4 mm craters). Amplitude is only ~40 µm but the NORMALS swing ~5°,
  which is what the eye reads, so "the number is tiny" is not a defence — René is judging normals.
- **★★ `repair_pits` DAMAGED two meshes before I caught it** — it is only valid at voxel density; the
  full rule + measurements now live in pipeline step 2b. I invoked it on GUN_SOLID as a "baseline
  measurement" — it MUTATES, so that alone was the error; for a read-only baseline, copy the probe out
  and skip the repair branch. GUN_SOLID was regenerable (`assemble_gun_solid` from the untouched source),
  and the damaged FINAL was rebuilt from the pre-decimate `MOLD_OFF`, so neither reached the export.
- Cut points: knee re-measured at **1.0 mm** bins (2.5 mm is too coarse here) — plateau −10.819 holds to
  y 3.5, plunges 4.5 → knee **(3.5, −11.012)**; beavertail from the banded probe on GUN_SOLID **(76.32,
  29.36)**, identical across all three `bt_band` values. Rule-derived α = **34.67°** vs yesterday's
  33.48°: yesterday's 2.5 mm bin reported the bin's START (0.79) while the plateau ran to 3.29, so it
  under-read the knee by ~2.7 mm. **Owner chose to keep his confirmed 33.5°** — built by pinning the
  BEAVERTAIL point (identical in both runs) and setting the angle: `A = B + tan(33.5°)·(y_A − y_B)`.
  ⚠ My own rear-silhouette probe (per-z-bin max y, global argmax) returned the grip HEEL (z −62.9), not
  the beavertail — the banded probe is the correct one; a global extremum over the rear silhouette is
  not the beavertail.
- EXACT@dz=0 first try on both cuts (318,772 v ratio 0.353, then cut B at y 85.3 → 296,460 v), 0/0.
- Parting line **z_line 34.0** (three Y bands, 0.25 mm bins): slide plateau a constant 12.78–12.86
  half-width from z 34.6/35.1/35.4; frame plateau ends 33.4/32.1/33.1 → band midpoints 34.0/33.6/34.25.
  Offset verified by REGION bbox: slide max|x| 12.956 → **13.356 (+0.400)**, max_z +0.398, min_y −0.400;
  frame region **byte-identical**. `smooth_mold` clamp reverted 22 verts >0.5 mm (max 7.8 → 0.33).
- **⚠ Mold max_z (61.28) sits 0.02 mm BELOW the gun's (61.297) and that is correct.** The front sight is
  a thin blade, so the 0.4 mm voxel shortens it ~0.42 mm; the +0.4 slide offset then puts it back. Net
  sight-channel depth ≈ nominal. Do not read this as a missing offset — and likewise, mold/gun front-Y
  agreeing to **0.005 mm** is the RIGHT answer here because the front-most feature is the light bezel,
  which sits below `z_line` and gets no offset (the 08-04b rule, confirmed a second time).
- Final: decimate-collapse ratio 0.207 → **123,000 faces / 61,502 v, 0/0, 1 island** (0 boundary edges =
  no holes; 1 island = no internal bubbles — a closed interior void would show as a second component).
  Export overwrote yesterday's pair, both byte-verified against `84 + 50·TRIS`:
  `GLOCK 45(19) OLIGHT PL-2 (PRO).stl` 6,150,084 B (123,000 tris) **+ `… GUN.stl`** 8,540,284 B (170,804 tris).
- ⚠ numpy 2.0 in this Blender: **`arr.ptp()` was removed** — use `np.ptp(arr)`. First call died on it.
  <!-- @anchor: v1 | failure: (a) OWNER REJECT "mold is not smooth !!!!!" — smooth_mold's deburr passes are threshold-gated at |Laplacian|>0.05 but the voxel orange-peel measures 0.014–0.056mm, so both passes skipped it entirely and the shipped-quality surface kept a visible pimple field; (b) repair_pits run on the raw scan diverged 139→257→235 defects moving 5,795 verts by 0.83mm mean, and run after decimate-collapse displaced verts by up to 25.2mm — its 2-ring probe is only valid at uniform voxel density, and I used a MUTATING function as a "baseline measurement"; (c) a per-z-bin global-argmax rear-silhouette probe returned the grip heel instead of the beavertail; (d) roll read from dz/dx and dx/dz appears to disagree in sign for the same rotation unless each is derived; 2026-08-04c | regression: cgs-mold SKILL.md pipeline step 4 (flat_pairs=8 / deburr_thr=0.015, verify sharp-vert count at 50° AND 70°) + step 2b (repair_pits is voxel-density-only; validate the decimated mold by BVH deviation instead) + Session Notes 2026-08-04c (correct a pose axis only where independent datums agree in SIGN) -->

### 2026-08-04b — GLOCK 45 (19) + OLIGHT PL-2 (PRO) — **DONE, EXPORTED**; textbook run, one new rule
- Scan `GLOCK 45(19) OLIGHT PL-2 (PRO) - GUN SCAN` 85,400 v / 170,804 f, **watertight 1 island 0/0**,
  already canonical (X 37.31 · Y 210.84 · Z 133.52), gun + light welded into one island. No annotation.
- **★ The front-feature check is not decorative — on this gun the LIGHT drives the front by 20 mm.**
  The Y-bin profile shows a low narrow band at y −115…−95 (z −19…8, max|x| 13.6) ahead of the slide
  front at y −95: that is the OLIGHT PL-2's bezel. `assemble_gun_solid` reported `front_feature_z`
  **−2.4** (vs the slide top at +45) and `sweep_dip` carried `front_y −131.71` — the dip reaches the
  bezel, not the muzzle, for free. Confirms the 07-03 ruling on a fourth light.
- **⚠ `_find_cut_points` misfired a FOURTH time — and this scan is the cleanest illustration of why.**
  Its knee window is `ys=np.arange(0.0, gr+step, step)`, anchored on Y=0. Here the trigger-guard
  plateau **ends at y 0.79** — so the window opens one bin before the plunge and its "front-third
  plateau" would be computed almost entirely on the grip drop. Computed the knee inline over the FULL
  gun region instead (2.5 mm bins, `Y.min()`→`gun_rear`): plateau −10.78…−10.87 from y −21.7 to
  +0.79, then 3.29→−14.38, 5.79→−21.39, continuous. **Last flat bin = corner (0.79, −10.81)** (the
  08-03b rule; the engine's 15 %-of-plateau-to-grip threshold would again have slid one bin into the
  plunge). Treat the engine's function as dead for the corner on every gun — recompute inline.
- Beavertail measured on **GUN_SOLID** (07-28b rule): rear silhouette peaks at **y 76.39, z 29.19**,
  identical across all three `bt_band` variants. → **α 33.48°**, owner-confirmed ("keep 33.5° —
  finish it"). Consistent with the 08-03b Glock 45 (34.07°) — same frame, same answer.
- **EXACT@dz=0 first try on both cuts**, no nudge ladder. Cut A 318,621 v (**0.365×src**) 0/0; cut B
  at y 85.12 (`gun_rear + 6`) → 296,229 v 0/0. Verified cut A against the mold's own bottom profile:
  tracks `z = 0.6614·y − 31.33` to within the half-bin artefact, and sits below the mold bottom
  forward of the knee (y 0: line −28.03 vs mold −24.87) so nothing forward of the trigger guard is
  touched.
- `boot=0.4` again (10+1 passes, travel 210.8, **9.3 s** on 85k v). The light is a cylinder whose axis
  is parallel to the sweep — the 07-28b TLR-1 shred case — and it came out clean, because this scan is
  watertight. Reconfirms 07-28c: the shred was the scan, not the sweep.
- **Parting line z_line 33.9**, three Y bands, 0.25 mm bins on GUN_SOLID. Slide plateau constant
  **12.81–12.94** from z ≈ 35.0 in ALL bands. Frame: mid/rear plateau 16.5–17.1 ending z 32.75–33.0;
  the front band instead shows the **dust cover at 13.37** (z 29.5–33.5) over a 14.7 shelf — take the
  frame-plateau-end ↔ slide-plateau-start midpoint per band (34.1 / 33.75 / 33.9) → **33.9**.
- Offset verified by REGION bbox: slide max|x| 13.007 → **13.407 (+0.400)**, max_z +0.400, min_y
  −0.400; frame region **byte-identical**. `smooth_mold` spiked 18 verts >0.5 mm (max 7.80) with p99
  0.077 — the usual cut-corner signature; clamped → 0.469, 0/0. **Nine-for-nine on the clamp.**
- `repair_pits` run as mandated: after the sweep **107 → 12 → 2** (all compact, 0 extended rejected,
  1,150 of 873,000 verts moved); after smooth **2 → 0** with **1 extended cluster correctly REJECTED**
  (dmin −4.12 = the sharp cut corner). The compactness guard is now proven live twice.
- Decimate-collapse ratio 0.296, 4 iters → **122,274 faces** / 87,797 v, **0/0**; no sliver repair needed.
- **⚠ `front_y` parity between the pair is NOT always the +0.4 offset.** On every prior gun the mold's
  front-Y ran 0.4 mm ahead of the gun's (the muzzle is above `z_line`, so it gets the slide offset).
  Here mold −131.712 vs gun −131.713 — **identical**, because the front-most feature is the LIGHT
  BEZEL, which sits BELOW `z_line` and correctly receives no offset. A 0.4 gap would have been the
  bug here. Check WHICH feature is front-most before reading the gap as a pass/fail.
- Export (folder confirmed with René = the standing default):
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\GLOCK 45(19) OLIGHT PL-2 (PRO).stl` (8.57 MB, 87,797 v)
  **+ `GLOCK 45(19) OLIGHT PL-2 (PRO) GUN.stl`** (8.34 MB, 85,400 v). Both identity `matrix_world`;
  both byte-verified against `84 + 50·TRIS` (the mold is mixed quad/tri: 122,274 faces → 175,590 tris
  → 8,779,584 B exactly; gun 170,804 tris → 8,540,284 B).
- ⚠ This session's MCP `execute_blender_code` returned `"Code executed successfully: "` with **stdout
  dropped** — same as the 07-28 raw-socket path. Every stage dumped its summary to
  `_SYSTEM/state/_g45o_*.json` and was read back from disk. Assume no stdout; write to a file.
  <!-- @anchor: v1 | failure: (a) _find_cut_points' Y=0-anchored knee window would have computed its plateau on the grip plunge — the trigger-guard plateau ends at y 0.79, one bin after the window opens (4th occurrence); (b) mold-vs-gun front_y parity read as a pass/fail assumes the muzzle is front-most — with a forward light below z_line the correct result is ZERO gap, not +0.4; (c) MCP execute_blender_code dropped stdout entirely; 2026-08-04b | regression: cgs-mold SKILL.md Session Notes 2026-08-04b — recompute the knee inline over the FULL gun region and take the LAST flat bin; check which feature is front-most before reading the export gap; dump every stage summary to _SYSTEM/state/*.json -->

### 2026-08-03b — GLOCK 45 (19) GEN 6 + TLR-7 X — **DONE, EXPORTED**; clean run, 2 notes
- Scan `GLOCK 45 (19) GEN 6_TLR-7 X` 214,525 v / 428,295 f, **1 island** but **761 boundary edges**,
  already canonical (X 34.69 · Y 188.15 · Z 128.63). Light and gun are one welded island.
- **⚠ `boundary > 0` on a scan is NOT automatically the 07-28c "fix the SCAN" case — read the loop
  first.** Here the 761 edges formed **ONE flat rim** at x −17.7…16.8, y 34.0…87.6, **z 0…2.46** =
  the magwell/grip base left uncapped. That is a single benign planar hole, and
  `assemble_gun_solid`'s `fill_holes` sealed it to **0/0** with no artefact (cut A removes that
  region anyway). The 07-28c disaster was a **3-island scan with an open LIGHT** — an open surface
  in the middle of swept geometry. **The discriminator is WHERE the loop is and how many loops
  there are**, not the raw edge count: group the boundary edges into loops and print each loop's
  bbox before deciding to send the scan back.
- **Used `boot=0.4` on a GUN for the first time** (the 08-01 magazine finding). Cost: 10 log-doubling
  passes instead of 8, **7.0 s** total on a 214k-v scan — effectively free (the extra passes are at
  the small end). Raking-light close-up of the TLR-7 X body + bezel came back clean: no corduroy, no
  craters, crisp panel edges. ⚠ **No boot=2.0 control was run**, so this is "0.4 works and is cheap",
  NOT "2.0 would have failed here". Treat 0.4 as the cheap default; the P226 control (07-28c) still
  says 2.0 is fine on a watertight scan.
- **Knee: took the plateau's own LAST bin, not the 15%-threshold bin.** Profiling the FULL gun region
  (07-30b fix) in 2.5 mm bins gave a dead-flat plateau at **−15.62** out to y +4.27, then 6.77→−20.86,
  9.27→−26.86, … The engine's `thr = plateau − 0.15·(plateau−gripz)` = −24.2 lets the corner slide
  ONE bin into the plunge (it would have returned y 6.77 / z −20.86). Used the G17-era rule instead —
  *the last bin before Z drops continuously* → **corner (4.27, −15.62)**. On a deep-grip gun, 15 % of
  a −15.6 → −72.9 span is 8.6 mm, which is bigger than a whole bin's drop; the fraction is too loose
  here. Cross-checked after the cut: the mold's bottom profile tracks `z = 0.6764·y − 38.51` to within
  the half-bin artefact, and the plane sits below the mold's own plunge until y ≈ 10.7, so nothing
  forward of the knee is touched.
- Beavertail measured on **GUN_SOLID** (07-28b rule — the swept mold's rear is flat at gun_rear for
  every Z): rear silhouette peaks at **y 78.25, z 24.42**; stable across all three `bt_band` variants.
  Grip backstrap reaches y 81.17 lower down, as expected. → **α 34.07°**, owner-confirmed
  ("keep 34.1° — finish it") on the pre-smooth render.
- **EXACT@dz=0 cut first try on BOTH cuts** — no nudge ladder needed. Cut A 273,257 v (0.364×src) 0/0;
  cut B at y 87.17 (`gun_rear + 6`) → 251,405 v 0/0.
- Parting line **z_line 29.0**, three Y bands, 0.25 mm bins. Slide plateau is a constant **12.85**
  half-width from z 29.75–30.5 in ALL bands; below it the front band shows **two** frame steps —
  14.77 (the TLR-7 X body, z 20–23) then **13.54** (the dust cover, z 24.5–28.5) — while mid reads
  15.17 and rear 17.27. Take the frame-plateau-end ↔ slide-plateau-start midpoint per band
  (29.1 / 28.1 / 29.0) → 29.0. ⚠ On a gun with a wide light, the widest thing in the front band is
  the LIGHT, not the frame; don't read the parting line off `max|x|` alone.
- Offset verified by REGION bbox: slide max|x| 13.038 → **13.438 (+0.400)**, max_z +0.398, min_y
  −0.399; frame region **byte-identical**. `smooth_mold` spiked **127 verts >0.5 mm** (max 7.87) with
  p99 0.084 / p999 0.297 — more than the usual 17–36 but the same cut-corner signature; clamped →
  max 0.495, 0/0. Eight-for-eight on the clamp.
- Decimate-collapse ratio 0.369, 4 iters → **122,318 faces** / 92,748 v, **0/0**, no sliver repair needed.

- **★★ OWNER REJECT — "Mold has little holes everywhere, unacceptable!" — and the pipeline was the
  cause, not the scan.** The v1 export shipped with **~90 visible black pinholes** over the flanks.
  Per-stage measurement (2-ring normal-projected displacement `d = (mean₂ᵣᵢₙ𝗀 − v)·n`, `d > 0.3` = the
  vertex is sunk below its own neighbourhood):

  | stage | pit verts | max depth |
  |---|---|---|
  | `GUN_SOLID` (sealed scan) | **0** | 0.28 |
  | `CGS_MOLD_SOLID` (after `sweep_dip`) | **324** | **1.40** |
  | after cuts | 180 | 1.47 |
  | after `smooth_mold` | 101 | 1.28 |
  | after decimate (shipped) | 104 | 1.28 |

  **The voxel remesh manufactures them.** A 0.4 mm voxel fill drops single vertices up to **1.4 mm**
  below the surface — 3.5× the voxel size, so this is not "voxel resolution", it is a marching-cubes
  defect. **`smooth_mold` cannot fix it** (1.40 → 1.28 mm over the whole 4-pass stage): its Taubin
  passes average a vertex with its neighbours, and a needle's neighbours are on the crater wall.
  ⚠ **I shipped this.** The pit signature was visible as dark specks in every render I took and I read
  it as scan detail / engraving. **A speck field on a swept mold is a defect until measured otherwise**
  — the sweep is a MAX envelope, so it can only ever ADD material; any concavity on a flank that
  survives it did not come from the gun.
  **THE FIX — new engine stage `repair_pits`** (`scripts/cgs_mold.py`, pipeline step 2b): detect
  `|d| > thr`, cluster the hits by edge adjacency, repair only **COMPACT** clusters (bbox diag ≤ 2.5 mm)
  with a local umbrella Laplacian + 2-ring halo — `remove_overhang`'s mechanic applied per crater. A
  real crease/groove/serration is an EXTENDED cluster and is rejected by the same test; the post-cut
  run proved the guard live (`extended_rejected: 1, dmin −4.53` = the sharp cut corner, correctly left
  alone). **Threshold evidence** (sweep solid, 750k v): thr ≥ 0.25 → every cluster compact
  (diag_max 2.07, extended 0); thr 0.20 → real linear features enter (diag_max 23.6). **0.25 is the
  noise-floor/feature boundary; do not go below 0.20.** ⚠ An earlier "isolated single vertex" guard
  (repair only if no 1-ring neighbour is also an outlier) **FAILED** — it fixed 140 of 324 and left
  dmax 1.24, because a 1.3 mm crater necessarily has neighbours on its cone walls. **Compactness, not
  isolation, is the right discriminator.**
  Rebuild cost: 324 → 15 → **0** in 3 rounds, **4,473 of 749,908 verts moved (0.6 %)**, mean move
  0.15 mm, manifold 0/0 throughout. Final mold: **1** vert at 0.433 (decimate jitter), down from 104.
  A/B renders at one camera: `_g45_p_before.png` (black squares) vs `_g45_p_after.png` (clean).
- Export **(v2, overwritten — this is the shipped pair)**, folder confirmed with René = the standing default:
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\GLOCK 45 (19) GEN 6_TLR-7 X.stl` (8.84 MB, 92,748 v)
  **+ `GLOCK 45 (19) GEN 6_TLR-7 X GUN.stl`** (20.5 MB, 214,525 v). Both identity `matrix_world`;
  front-Y −107.375 (mold) vs −106.978 (gun) = the +0.4 mm slide offset, as expected. Both byte-verified
  against `84 + 50·tris` — ⚠ the mold is **mixed quad/tri** (122,318 faces → 185,492 tris), so check
  against TRIS, never faces.
  <!-- @anchor: v1 | failure: (a) OWNER REJECT "Mold has little holes everywhere, unacceptable!" — sweep_dip's 0.4mm voxel remesh manufactured 324 craters up to 1.4mm deep from a 0-defect scan; smooth_mold only shaved them to 1.28mm; I read the dark specks in my own renders as scan detail and shipped it; (b) an "isolated single vertex" despike guard fixed only 140/324 because a 1.3mm crater has neighbours on its cone walls — compactness, not isolation, is the discriminator; (c) a scan with boundary>0 was nearly rejected under the 07-28c "fix the SCAN" rule when the 761 edges were ONE benign planar rim at the magwell base; (d) _find_cut_points' 15%-of-plateau-to-grip threshold let the corner slide one bin PAST the true knee on a deep-grip Glock; 2026-08-03b | regression: repair_pits() in scripts/cgs_mold.py + SKILL pipeline step 2b (run after every voxel remesh, after the booleans, after smooth_mold; thr 0.25, compact-cluster-only); a speck field on a swept mold is a DEFECT until measured — the sweep is a MAX envelope and cannot create a concavity; group boundary edges into loops before condemning a scan; take the knee as the LAST flat bin of the bottom-Z plateau -->

### 2026-08-04 — MAGAZINE offset corrected **+0.4 → +0.2 mm** (owner reject)
- René: *"do NOT add +0.4mm. Instead add +0.2mm — 0.4mm is too loose on a magazine."* MAGAZINE
  CARRIERS ruling 4 amended; the gun pipeline's +0.4 slide-region comp is **unchanged**.
- The mechanism the 08-01/08-03 runs missed: a normal offset applies to BOTH flanks, so +0.4 is
  **+0.8 mm across the width** of a ~20 mm prism — 4 % on the retained dimension. A holster grips a
  large irregular body with multiple retention faces and a trigger-guard click; a mag pouch retains
  a smooth constant-section prism by side friction alone, so the same comp that reads as a good
  fit on a gun reads as fall-out slop on a magazine. **+0.2 → +0.4 mm across the width.**
- ⚠ **Both magazine molds already shipped were built at +0.4 and are therefore too loose by this
  ruling** — `Glock 43x Magazine.stl` (08-01) and `SPHINX SDP STANDARD_COMPACT_MAG CARRIER.stl`
  (08-03), both in `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\`. Re-running either is cheap: the
  pose/cut/sweep are deterministic, so it is `offset_mold(..., offset=0.2)` → re-seat → re-export
  the pair. Owner's call whether to re-cut them.
- No code change: `offset_mold`'s `offset` is already a parameter and still defaults to 0.4 for the
  gun path. The magazine value lives in the pipeline block, not in the engine default.
- **BOTH molds re-cut at +0.2 and re-exported the same day**, side-by-side with the +0.4 originals
  (owner chose a ` 0.2` suffix over overwriting, because his renamed working copies feed a live
  Shapr3D/FreeCAD/CAM chain). All four files in `_AUTOMATED MOLDS`, byte-verified vs `84 + 50·TRIS`:
  `Glock 43x Magazine 0.2.stl` 6.84 MB / 71,539 f · `Glock 43x Magazine 0.2 MAG.stl` 3.90 MB
  · `SPHINX SDP STANDARD_COMPACT_MAG CARRIER 0.2.stl` 7.71 MB / 80,730 f · `... 0.2 MAG.stl` 11.84 MB.
- **★ Rebuild recipe — the pipeline is deterministic, so a re-run needs no stored constants.** The
  Glock rebuilt straight from its scan and reproduced 08-01 *exactly* (same pose `t` =
  (−0.2164, −52.5537, +37.4944), same `cut_y` 51.446, same 193,610-vert sweep, same 71,539 faces) —
  only the offset differed. The Sphinx rebuilt from its own **`… MAG.stl`**, which is the posed
  magazine in the mold's frame: re-import (it merges back to the exact 124,131 v / 0-0 source),
  leave X/Y untouched so the new pair stays in the old pair's frame, and let the datum re-seat
  handle Z. Keeping X/Y fixed is what makes the two versions directly comparable in Shapr3D.
- Cross-check that the offset really changed and nothing else did: **every bbox dimension shrank by
  2 × Δoffset.** Glock 21.246→20.849 (−0.397 X), 34.378→33.979 (−0.399 Z); Sphinx 21.73→21.315
  (−0.415 X), 33.04→32.632 (−0.408 Z). The Y axis shrinks less (−0.34) because the flat cut face's
  edge normals are not axis-parallel — same signature on both guns, so it is the method, not a slip.
- Registration mold↔magazine, measured over the **body band only**: Glock front-Y 0.199 / flank
  0.174 / rear 0.299; Sphinx front-Y 0.171 / flank 0.175 / top 0.167 / rear 0.310. The rear runs a
  constant **+0.1 proud of nominal at every offset value** (0.499 and 0.505 at +0.4; 0.299 and 0.310
  at +0.2) — that is the 0.4 voxel quantisation of the mold's back face, not a placement error.
- **⚠ A whole-object bbox comparison is meaningless for a magazine pair.** My first Sphinx register
  check reported `top_gap −7.7` / `flank_gap −4.1` because it compared the mold's body against the
  magazine's **basepad** — which is wider and taller, and which the mold deliberately stops short
  of. **Always restrict mold↔magazine gap checks to the constant-section body band** (Sphinx
  y −55…40). Same family as the 08-01 flank-autocorrelation and 08-03 max-probe misses: the metric
  has to be scoped to the thing it claims to measure.
- Also confirmed on the Sphinx re-run: the basepad flange starts at **y 45.45** (`zmax` 32.42 →
  39.11 across one 0.1 mm bin), so the 08-03 cut at y 45.0 clears it by 0.45 mm. Held unchanged so
  that offset was the only variable between the two versions.
  <!-- @anchor: v1 | failure: a whole-object bbox mold-vs-magazine registration check reported top_gap −7.7 / flank_gap −4.1 because it compared the mold's body against the magazine's basepad, which the mold intentionally stops short of; 2026-08-04 | regression: cgs-mold SKILL.md Session Notes 2026-08-04 — restrict every mold-magazine gap check to the constant-section body band -->
- ⚠ Blender was closed at the start of the re-run (port 9876 shut, no `blender.exe` process). Launched
  `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe` from the shell; the addon's server
  came up on 9876 by itself, no click needed. Worth trying before asking René to start it.
  <!-- @anchor: v1 | failure: OWNER REJECT — the magazine pipeline inherited the gun's +0.4mm Kydex-shrink comp, which doubles to +0.8mm across a 20mm-wide constant-section prism and leaves the magazine loose in the pouch; two molds shipped at the wrong value before it was caught; 2026-08-04 | regression: cgs-mold SKILL.md MAGAZINE CARRIERS ruling 4 (+0.2mm, offset_mold(offset=0.2)) + Track-B memory cgs-mold-magazine-carriers ruling 4 -->

### 2026-08-03 — Sphinx SDP Standard/Compact **MAGAZINE** — **DONE, EXPORTED** (⚠ offset +0.4, superseded 08-04 → +0.2)
- Second magazine job; the 08-01 rulings held end-to-end with **zero corrections**. Scan
  `SPHINX SDP STANDARD_COMPACT_MAG CARRIER` 124,131 v / 248,258 f, watertight **1 island 0/0**,
  already posed rear-spine-down (flat within **0.06 mm over 104 mm** on a 0.1 mm-band LS fit; tilt
  0.037° / 0.005° → **no rotation needed, translation only**). Body Y −63…+45 constant X 20.34 ×
  Z 31.9; basepad from y 45.4; **no round in the feed lips** (owner ruled: proceed empty).
- **★ Rear-spine identification with NO annotation — codified as three tells** (see the MAGAZINE
  CARRIERS pipeline block, ruling 3). The decisive one is the **feed-lip relief**: the −Z face's
  surface receded 9.2 → 25.0 over the last 6 mm while the +Z face ran full to the tip. Confirmed
  independently by the floorplate being flush with −Z and projecting only +Z (forward), and by −Z
  being the featureless face. **The witness-hole heuristic is a TRAP on this gun** — the 5/10/15
  holes are on the SIDE (X) faces, so "holes ⇒ rear" would have picked the wrong axis entirely.
- **⚠ `bpy.ops.render.opengl` defaults to `view_context=True` — it renders the VIEWPORT and ignores
  the camera you just placed.** My first three renders came back as the same viewport shot (camera
  wireframe visible in frame) and I nearly read orientation off them. **Always pass
  `view_context=False`.** Sibling of the 07-28c `hide_render`-alone trap: a render is only evidence
  once you have proven it is showing what you think it is.
- **⚠ A `max`/`min` probe cannot find a RECESS.** I scanned the +Z face's centre-strip `max Z` per
  Y-bin looking for the mag-catch notch and found a dead-flat 41.07–41.15 — the notch is a recess, so
  the extremum probe is structurally blind to it, and the "no notch anywhere" reading was an artefact
  of the metric, not a fact about the part. Same family as the 08-01 flank-autocorrelation miss:
  **a null result only counts if the probe can see the effect.**
- `boot=0.4` (the magazine rule) → **no comb** on the tapered feed-lip faces; renders clean at
  raking light. 10 log-doubling passes, travel 131.1, **2.4 s**, 224,804 v, 0/0.
- Cut at **y 45.0**, 0.4 mm *before* the measured basepad start (45.4) — deliberate: the sweep is +Y,
  so cutting early only exposes a hair of body that the floorplate covers anyway, while cutting late
  would trap the basepad flare in the mold and lock the magazine in. **EXACT solver, first try**,
  80,486 v 0/0 (ratio 0.358 — well under the old 0.4×src guard, which stays relaxed to 0.25).
- `smooth_mold`: 17 verts > 0.5 mm (max 1.41), p99 **0.062** — the usual cut-corner spikes. Clamped
  → max 0.493, 0/0. Seven-for-seven; the clamp is just part of the stage.
- Offset whole-mold +0.4 (`z_line = zmin − 10`) — ⚠ **superseded 2026-08-04: magazines use +0.2**;
  this mold is 0.2 mm proud on every face. Grew outward on all six faces (+0.399/−0.399 X,
  +0.400/−0.399 Z, −0.397 front Y, +0.283 on the flat cut face). Datum re-seat **+0.5466 applied to
  BOTH** the mold and `MAG_SOLID` (the 08-01 de-register lesson — held: final gaps front **0.374**,
  flank **0.383**, top **0.379**, rear **0.505** = the 0.4 voxel floor on the mold's back).
- `decimate_mold` **not run** — the mold is natively **80,354 faces**, far below the 123k budget, so
  the band (a ceiling, not a floor) is already satisfied. Second magazine in a row under budget;
  a magazine mold is ~⅔ the face count of the 43X's gun molds at the same 0.4 voxel density.
- Final: 80,354 f / 80,486 v, **0/0**, bbox 21.73 × 114.68 × 33.04, datum flat within 0.35 mm
  (voxel-quantised) over y −55…+41.8. Witness-hole dimples survive on the flanks at ≤0.15 mm — the
  +Y sweep cannot fill an X-normal recess — measured and judged negligible, not a defect.
- Export (folder confirmed = the standing default):
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\SPHINX SDP STANDARD_COMPACT_MAG CARRIER.stl`
  (7.68 MB, 80,486 v) **+ `SPHINX SDP STANDARD_COMPACT_MAG CARRIER MAG.stl`** (11.8 MB, 124,131 v).
  Both identity `matrix_world`; both byte-verified against `84 + 50·tris` — ⚠ note the mold is
  **quad/ngon** topology, so `tris ≠ faces`: 80,354 faces → 160,968 tris → 8,048,484 B exactly.
  Checking size against `50·faces` would have falsely flagged a 2× discrepancy.
  <!-- @anchor: v1 | failure: (a) bpy.ops.render.opengl defaults to view_context=True and silently rendered the viewport instead of the camera I had just placed — three orientation renders were the same wrong shot; (b) a per-Y max-Z probe found "no mag-catch notch" on a face that has one, because an extremum probe is structurally blind to a recess; (c) the witness-hole "holes ⇒ rear face" heuristic points at the SIDE faces on this magazine and would have chosen the wrong datum axis; 2026-08-03 | regression: cgs-mold SKILL.md Session Notes 2026-08-03 + MAGAZINE CARRIERS ruling 3 — always pass view_context=False; a null result only counts if the probe can see the effect; identify the rear spine by feed-lip relief + floorplate flushness, never by witness holes -->

### 2026-08-01 — Glock 43X **MAGAZINE** (first magazine carrier) — **DONE, EXPORTED** (⚠ offset +0.4, superseded 08-04 → +0.2)
- New product class. Owner rulings captured in "Pipeline — MAGAZINE CARRIERS" above and in the
  Track-B memory `cgs-mold-magazine-carriers`. Scan `G43x Mag_DECIMATED` 40,942 v / 81,884 f,
  watertight **1 island 0/0**, already Y-long with the rear spine +Z. Body Y 8.6–101 constant
  (X 20.3 × Z 33.3), basepad from y 104.0, feed-lip taper + a **dummy round** at the −Y tip.
- **★ `boot=2.0` COMBS any surface whose cross-section changes along the sweep axis — the magazine's
  front face came out visibly corrugated.** The log-doubling union's offset SET is
  `{0, boot, 2·boot, …}`, not a continuous sweep: the first pass unions the raw solid with a copy
  `boot` away, and that discreteness survives every later pass. Where the section is constant
  (the flanks) the union is exact and nothing shows; where it changes (the front face, which
  tapers along Y) you get ridges at `boot` pitch. **Fix: `sweep_dip(..., boot=0.4)` = the voxel**,
  so the comb pitch equals the fill resolution and disappears. Cost: 10 passes instead of 7, +0.4 s.
  Side-by-side renders at one camera: scan smooth · 2.0 heavy ridges · 1.0 faint · 0.4 clean.
  ⚠ Worth re-checking on GUN molds — the "swept grip stipple streaks" seen on the Echelon/Sphinx/
  P226 press-bed faces may be the same artefact. Not measured there yet; do not assume.
- **⚠ I refuted my own correct hypothesis with a control aimed at the wrong surface.** First pass I
  measured an autocorrelation of `max|x|` on the FLANK, saw boot 0.4 and 2.0 agree, and declared
  the boot theory dead — but the flank is exactly the surface where the comb *cannot* appear.
  A null control only counts if it can see the effect. Second trap: `max Z` sampled in 0.05 mm bins
  on a 41k-vert mesh is mostly NaN, and dropping the NaNs splices distant regions together →
  std of 14 mm reported as "roughness". Third: reading a 0.4 mm structure through 0.5 mm bins
  beats to a phantom 2.0 mm period. **When a metric and a render disagree, believe the render.**
- **⚠ The datum re-seat silently de-registered the exported pair.** `offset_mold` pushes the rear
  face to −0.4, so the mold gets translated +0.63 in Z to put the datum back on 0 — but `MAG_SOLID`
  was posed BEFORE that, so the first `MAG.stl` was 0.63 mm out of register in Shapr3D. **Any
  post-offset translation of the mold must be applied to the exported original too.** After the
  fix: front-Y gap 0.399, flank 0.374, rear 0.499 (the rear reads 0.1 loose because the mold's back
  is voxel-quantised at 0.4 — that is the floor on the measurement, not a placement error).
- **⚠ `voxel_remesh.poll()` fails on a hidden object** — the render step's `hide_viewport` sweep
  broke the next `sweep_dip`. Same family as the 07-30b empty-STL export. **Unhide every mesh at
  the top of any call that runs an operator**, not just before export.
- `decimate_mold(target_faces=123000)` was a **no-op**: the mold is natively 71,539 faces, below the
  budget, so the solver sat at ratio 1.0 for 5 iterations. Correct behaviour — the band is a
  ceiling, not a floor — and René confirmed "ship 71.5k as-is" (a magazine has ~⅓ the surface of a
  gun mold at the same 0.4-voxel density).
- Evidence chain: pose (rear-plane fit tilt 0.033°/0.042°, sym-X −0.229, Δ = (−0.216, −52.554,
  +37.494)) → 0/0 → sweep boot **0.4**, travel 117.8, 10 passes, 193,610 v, 2.0 s, 0/0 → cut
  y 51.446 (mold coords), EXACT, 71,678 v, 0/0 → smooth, 5 verts >0.5 mm clamped → max 0.485, 0/0 →
  offset whole-mold +0.4, grew outward on all six faces (+0.400/−0.400 Z, +0.400/−0.363 X,
  −0.400/+0.284 Y), 0/0 → datum re-seat +0.6285 → **71,539 faces / 71,678 v, 0/0**.
  Final bbox X 21.25 × Y 103.6 × Z 34.27; rear face flat within **0.11 mm over 84 of 104 mm**
  (the front 14 mm lifts — the magazine's own taper toward the feed lips, not a defect).
- Export (folder confirmed = the standing default):
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\Glock 43x Magazine.stl` (6.84 MB, 71,678 v)
  **+ `Glock 43x Magazine MAG.stl`** (3.91 MB, 40,942 v). Both identity `matrix_world`, both
  byte-verified against `84 + 50·tris`.
  <!-- @anchor: v1 | failure: (a) sweep_dip's default boot=2.0 left a visible 2mm comb on the magazine's front face — the log-doubling union offset set is discrete {0,boot,2boot,...}, so any section that changes along Y gets ridges at boot pitch; (b) I refuted the correct boot hypothesis with an autocorrelation control measured on the FLANK, a surface where the comb cannot appear, then compounded it with a NaN-spliced 0.05mm-bin metric and a 0.5mm-bin beat that faked a 2.0mm period; (c) the post-offset datum re-seat translated the mold +0.63mm but not MAG_SOLID, shipping an out-of-register export pair; (d) voxel_remesh.poll() failed on an object left hidden by the render step; 2026-08-01 | regression: cgs-mold SKILL.md Session Notes 2026-08-01 + "Pipeline — MAGAZINE CARRIERS" — boot=0.4 on magazines; a null control must be able to see the effect, and when metric and render disagree believe the render; apply every post-offset translation to the exported original too; unhide all meshes before any operator call -->

### 2026-07-30b — Glock 19 Gen5 (gun only) — **DONE, EXPORTED**; three new failure modes
- Scan `G19_GEN5_SOLID GUN` 99,263 v / 200,184 f, watertight **1 island 0/0**, already canonical
  (X 34.2 · Y 185.1 · Z 128.6 = factory G19 spec). **No annotation drawn** → auto cut points.
- **⚠ `_find_cut_points` misfired a THIRD time, and this time the plane landed BELOW the mold.** Its
  knee window is `ys=np.arange(0.0, gr+step, step)` — anchored on Y=0 (the mass centre). On this gun
  Y=0 is already inside the grip plunge, so the "front-third plateau" was computed on the plunge:
  it returned corner z −53.0 → cut plane z **−73.0**, below the mold bottom (−67.8), i.e. a cut that
  removes nothing. **Fix that worked: profile the WHOLE gun region** (`Y.min()`→`gun_rear`, 2.5mm bins),
  take the plateau as the **median of the middle third** of that profile (the real trigger-guard flat,
  −10.69 here), threshold `plateau − 0.15·(plateau−gripz)`. Knee → y −3.79 / z −13.79, **α 39.87°**.
  The engine's own function is still Y=0-anchored — do NOT trust it; recompute the knee inline.
- **⚠ EXACT@dz=0 AND ±0.05 all returned 0 verts; FLOAT returned a 4-vert corpse. Only ±0.15 cut.**
  The 07-30 ladder stopped at ±0.05 — extend it to **±0.15 (and ±0.4)**. Both ±0.15 nudges produced
  ~240k v at 0/0 and **agreed with each other** — two independent nudges landing on the same vert
  count is the real evidence a cut is genuine; a corpse gives single-digit verts. Also **relax the
  survival guard**: `verts > 0.4×src` FALSELY rejected this valid cut (240,822 / 729,322 = 0.33) —
  a deep grip + full-length dip legitimately sheds >60%. Use `> 0.25×src` **and** `nonmanifold==0`
  **and** cross-check the bottom-Z profile against the cut line before accepting.
- **⚠ NEW: decimate-collapse produced 6 non-manifold / 4 boundary from a 0/0 source — at EVERY ratio.**
  Five targets (121k–125k) all gave exactly 6/4, so it was not collapse jitter: a **4-face pinch
  sliver** on the cut-B rear face at (x 16.5, y 73.1–73.6, z 30.3–31.4), invisible in the 0/0 edge
  count of the source because the pinch was still 2-manifold pre-collapse. `holes_fill` could NOT fix
  it post-decimate (the boundary edges form two open 3-vert chains, not a closed loop).
  **Fix = clean BEFORE decimating:** triangulate → `remove_doubles(1e-4)` → `dissolve_degenerate(2e-4)`
  (this exposes the pinch as 2 non-manifold edges) → delete the faces linked to those edges *and* to
  their verts → `holes_fill(sides=64)` → recalc normals → **then** decimate. Result: 123,000 faces,
  61,502 v, **0/0**, first try.
- **⚠ `export_gun` silently wrote an EMPTY 0.1 KB STL** because `GUN_SOLID` was still `hide_viewport`
  from an earlier render — `export_selected_objects=True` cannot select a hidden object, and
  `select_set()` fails silently on one. **Unhide every mesh before exporting**, and sanity-check the
  size: binary STL = `84 + 50·tris` bytes exactly (mold 123,000 tris → 6,150,084 B = 6005.9 KB ✓).
- **Parting line z_line 33.5, read off the full `width_vs_z` curve, three Y bands.** Slide plateau is a
  constant **12.87–12.94** from z≈35.0 up in all three bands; frame reads 15.1 (rear) / 17.0 (mid) /
  14.7 (front) and ends ≈32.0. The transition is a ~3mm **taper**, not a sharp step, so `argmin(diff)`
  would pick an arbitrary point inside it — take the **midpoint of frame-plateau-end → slide-plateau-
  start** (32.0 ↔ 35.0 → 33.5). Verified after the fact: slide max|x| 12.94 → **13.368 (+0.43)**,
  max_z +0.40, min_y −0.40; frame max|x| 16.99 (untouched, gun 17.08).
- `smooth_mold`: max_disp 8.04mm but p99 **0.088** / p999 0.176 — **17 verts >0.5mm**, the usual
  cut-corner spikes. Clamped → max 0.473, 0/0. Six-for-six; the clamp is simply part of the stage.
- Evidence chain: assemble 1/1 island, `sight_x_post 0.0` / `mass_x_post 0.501`, `front_feature_z 42.3`
  (muzzle drives the front), 0/0 → sweep travel **185.1** full span, 8 log-doubling passes, 729,322 v,
  0/0 → cut A (EXACT@−0.15) 240,822 v 0/0, α 39.87° → cut B y **73.6**, 227,007 v 0/0 → smooth+clamp
  0/0 → offset z_line 33.5, 103,898 region verts, 0/0 → sliver repair → decimate ratio 0.271 →
  **123,000 faces** / 61,502 v, 0/0.
- Export (folder confirmed with René = the standing default):
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\Glock 19 Gen5.stl` (6.01 MB, 61,502 v)
  **+ `Glock 19 Gen5 GUN.stl`** (9.77 MB, 99,263 v). Both identity `matrix_world`; front-Y −117.951
  (mold) vs −117.549 (gun) = the +0.4mm slide offset, as expected.
- Owner confirmed cut A ("keep 39.9° — finish it") on the pre-smooth render.
  <!-- @anchor: v1 | failure: (a) _find_cut_points' Y=0-anchored knee window returned a cut plane at z −73.0, BELOW the mold bottom −67.8 — a cut that removes nothing (3rd occurrence of this window bug); (b) EXACT@0 and ±0.05 both returned 0 verts and FLOAT a 4-vert corpse — only ±0.15 cut, and the verts>0.4×src guard falsely rejected the valid 0.33×src result; (c) decimate-collapse produced 6 non-manifold / 4 boundary at EVERY ratio from a 0/0 source, caused by a 4-face pinch sliver that holes_fill could not repair post-hoc; (d) export_gun wrote an empty 0.1 KB STL because the object was still hide_viewport from a render; 2026-07-30b | regression: cgs-mold SKILL.md Session Notes 2026-07-30b — recompute the knee over the FULL gun region with a middle-third-median plateau; extend the nudge ladder to ±0.15/±0.4 and relax the guard to 0.25×src + profile cross-check; clean slivers (triangulate → remove_doubles → dissolve_degenerate → delete pinch faces → holes_fill) BEFORE decimating; unhide all meshes before export and verify size = 84+50·tris -->

### 2026-07-30 — Glock 43X (gun only) — **DONE, EXPORTED**, fully annotation-driven
- **★ NEW: the owner can also set the PARTING LINE with an annotation — two dots along the slide.**
  René drew 4 strokes: two single-point strokes (n=1) at `(0, 7.034, 94.106)` and `(0, 150.126, 93.656)`
  — front and rear of the slide's lower edge — plus the two cut lines. Mean Z = **93.881 (scan)** →
  `z_line = 22.075` in mold coords. Independently measured `width_vs_z` agreed: frame plateau 13.4–13.7
  ends at z 93.62, slide plateau **11.2** starts at z 94.88 → crossing ≈ 94.25, i.e. his two dots land
  **0.4mm** off the measured crossing. **A single-point stroke IS the annotation** — don't discard `n==1`
  strokes as noise; two of them define a line. All three geometric inputs came from `bpy.data.annotations`
  this run: `z_line`, cut A, cut B — zero heuristics, no `_find_cut_points`.
- Annotation → mold transform, same recipe as 07-28c (assemble only TRANSLATES; `shift_min == shift_max`
  on all 3 axes, verified): Δ = **(+0.235, −93.449, −71.806)**. Cut A LS fit `z = 0.275056·y + 16.499`
  (scan, 90 pts, maxres 1.43mm) → `b_mold = b − m·Δy + Δz = −29.601`, **α 15.38°**. Cut B (56 pts,
  y 169.83–172.20) → mean y 171.27 → **y_mold 77.822** = `gun_rear + 5.17`; drove it via
  `cut_tail(gun_rear=y_mold, margin=0)`.
- **⚠ α 15.4° is by far the shallowest cut A this pipeline has run** (HK45 32 · Echelon 32 · P226 34 ·
  Sphinx 43 · X5 56). It is René's own line and geometrically consistent — at the trigger guard it passes
  ~1.6mm under the frame bottom and rises rearward, so the retained grip is a wedge: full depth at the
  front strap, tapering out toward the rear. Render-confirmed (pixel slope 13° ≈ 15.4° in an rz=90 ortho).
  Not a defect, but worth a glance before machining.
- **⚠ EXACT@dz=0 returned 0 verts; FLOAT returned 1,669 non-manifold. The retry ladder earned its keep:**
  EXACT@+0.05 also 0 verts, **EXACT@−0.05 → 301,000 v, 0/0**. A ±0.05mm plane nudge is not a formality —
  it flipped a total boolean failure into a clean cut, and the guard (`verts > 0.4×src &&
  nonmanifold == 0`) is what caught it. Third gun running where the diagonal cut needed a nudge / solver switch.
- `smooth_mold` outliers: **17 verts >0.5mm** (max 6.27) with p99 **0.074** / p999 0.142 — the usual
  cut-corner spikes. Clamped → max 0.469, 0/0. Five-for-five; the clamp is just part of the stage.
- Evidence chain: scan `43x decimated` 47,221 v / 94,454 f, watertight **1 island 0/0**, already in
  canonical pose (muzzle −Y at y 0.88, slide top z 116.3, sights 120.4) → assemble 1/1 island,
  `sight_x_post −0.0` / `mass_x_post −0.112`, `front_feature_z 30.9` (muzzle drives the front, no light),
  0/0 → sweep travel **165.2** full span, 8 log-doubling passes, 588,130 v, **4.6s**, 0/0 → cut A
  (annotation, EXACT@−0.05) 301,000 v 0/0 → cut B y 77.8, 199,653 v 0/0 → smooth+clamp 0/0 → offset
  `z_line 22.075`, 84,064 region verts, slide max|x| 11.108 → 11.507 (+0.399), max_z +0.399, min_y −0.400,
  frame **byte-identical**, 0/0 → decimate-collapse ratio 0.426, 4 iters → **122,333 faces** / 85,005 v, 0/0.
- Export (folder confirmed with René = the standing default):
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\Glock 43X.stl` (8.30 MB, 85,005 v)
  **+ `Glock 43X GUN.stl`** (4.61 MB, 47,221 v). Both identity `matrix_world`; front-Y −92.946 (mold) vs
  −92.566 (gun) = the +0.4mm slide offset, as expected.
- **⚠ Engine globals do NOT persist between `execute_blender_code` calls** — `exec(open(...).read(),
  globals())` must be re-run at the top of EVERY call (the second call died on `name 'sweep_dip' is not
  defined`). Cheap; do it unconditionally.
- Also: numpy float32 is not JSON-serializable — cast with `float(...)` (not `default=float` alone on
  nested lists) when dumping stage summaries; and `bpy.ops.render.opengl` draws the ANNOTATION strokes
  too (a blue line in the 3/4 frame) — cosmetic, but don't mistake a stroke for geometry in a render.
  <!-- @anchor: v1 | failure: (a) EXACT@dz=0 emptied the mold and FLOAT returned 1,669 non-manifold on René's annotation cut plane — only EXACT@−0.05mm survived, so the nudge ladder + survival guard are load-bearing; (b) engine globals do not persist across execute_blender_code calls (second call: name 'sweep_dip' is not defined); 2026-07-30 | regression: cgs-mold SKILL.md Session Notes 2026-07-30 — two-dot slide annotation -> z_line; re-exec the engine every MCP call; EXACT-first + ±0.05 nudge ladder + verts>0.4x src guard -->

### 2026-07-28c — SIG P226 MK25 + TLR-1 HL — **DONE, EXPORTED** (both 07-28b blockers closed)
- **★ NEW CAPABILITY — the owner can draw the cut with a Blender ANNOTATION and the pipeline consumes
  it verbatim.** This is now the preferred way to set cut A: no `corner_below`/`bt_below` guessing, no
  `_find_cut_points` window fragility (the whole 07-28b BLOCKER 2). Recipe:
  1. Read it — Blender 5.1: `bpy.data.annotations[0].layers[N].frames[0].strokes[M].points[K].co`
     (NOT `bpy.data.grease_pencils`, and there is no `grease_pencils_v3`). Points are **world space**,
     stored in the **SCAN's** frame — the scan is never moved, `assemble_gun_solid` copies + centers.
  2. Fit — least-squares `z = m·y + b` over the stroke. Hand wobble ≈ 3mm maxres; LS is the right
     reading of intent. René drew 129 pts at x≈0 → **m 0.67943, b −57.034 (scan), α 34.19°**.
  3. Transform to mold space — `shift = GUN_SOLID.bbox − scan.bbox` (assemble only TRANSLATES; verify
     min-shift == max-shift on all 3 axes). Here `(+0.005, +42.534, +3.379)`. Then
     `b_mold = b − m·Δy + Δz` → **−82.555**, same slope.
  4. Cut — build the cutter exactly as `cut_grip` does but with your own plane: `α = atan(m)`,
     top-face normal `u = (0, −sin α, cos α)`, `M = (xc, ȳ, m·ȳ+b)`, `cutter.location = M − (Lz/2)·u`.
  Verified: the mold's post-cut bottom profile tracks `m·y+b` exactly (the ~2.3mm apparent gap is the
  bin-centre artefact — the line drops 0.679×half-bin; bin at the SAME y and it's zero).
- **⚠ `cut_grip`'s FLOAT solver produced a 6-vert corpse AGAIN — and EXACT fixed it on the first try.**
  Same failure class as 07-28b (which needed a 0.05mm nudge). New standing rule: **try EXACT FIRST on
  the diagonal cut**, and always guard `verts > 0.4×src && nonmanifold == 0` before continuing, with a
  retry ladder over (solver, ±0.05/0.15/0.4mm plane nudge, cutter scale). EXACT@1.0 won here: 379,587 v.
- **⚠ 07-28b BLOCKER 1 (shredded light) was the SCAN, not the sweep — and my log-doubling-aliasing
  hypothesis was REFUTED by a control.** I predicted `boot=2.0` was resonating with the TLR-1's rib
  pitch (the union samples at exactly `boot` increments, which would explain why voxel 0.4 AND 0.25
  both failed). Ran `boot=0.4` → clean. Ran the **control `boot=2.0` on the same new scan** → equally
  clean, in fact marginally smoother in the light box (p99 **0.068** vs 0.096, max 0.13 vs 0.55 on the
  Laplacian magnitude over y −83…−25, z < −8). The real cause: René's OLD export was **3 islands with
  119 boundary edges** (light not watertight) — `holes_fill` on the open light produced the garbage the
  sweep then propagated. His re-export is **watertight, 1 island, 0/0**, and the light comes out clean.
  Lesson: when a scan has `boundary > 0`, fix the SCAN; do not go hunting in the sweep. `boot` stays 2.0.
- **⚠ `bpy.ops.render.opengl(view_context=False)` does NOT respect `hide_render` alone.** I hid every
  mesh but one via `hide_render` and it silently kept rendering the others — two renders that "proved"
  a conclusion were showing the wrong object, and the pixel↔mm mapping refused to reconcile (that
  mismatch is the tell). **Set `hide_viewport` (and `hide_set`) too**, and sanity-check one known
  landmark's pixel position against `ortho_scale/resolution` before reading anything off a render.
- **⚠ Camera `clip_end` defaults to 100** — at the 400–700 unit camera distance this pipeline uses,
  the first render came back **completely empty**. Set `clip_start=0.1, clip_end=5000` once up front.
- **Parting line z_line 26.0 — read the whole `width_vs_z` curve, three Y bands.** Slide is a constant
  **13.0mm** plateau from z 26.75 up in ALL bands; frame is 20.0 (rear, y 20–60) and 11.6 (front,
  y −45…−10). Both converge onto 13.0 between z 25.75 and 26.75 → `z_line = 26.0`. Offset verified by
  REGION bbox: slide max|x| 13.137 → 13.539 (+0.402), max_z +0.399, min_y −0.400; frame byte-identical.
- **`smooth_mold` outliers: 36 verts >0.5mm (max 8.70) but p99 0.075 / p999 0.202** — the usual sharp
  cut-corner spikes. Clamped (revert >0.5mm to pre-smooth) → max 0.496, 0/0. Four-for-four now; the
  clamp is simply part of the stage.
- Evidence chain: scan `P226 MK25 TLR-1 HL SOLID GUN` 125,962 v → assemble 5 islands → **1 kept**
  (4 specks), `sight_x_post 0.0` / `mass_x_post 0.793`, `front_feature_z −10.8` (light bezel drives the
  front), 125,851 v, 0/0 → sweep travel **200.7** full span, 8 passes, 873,438 v, 11s, 0/0 → cut A
  (René's line, EXACT) 379,587 v 0/0 → cut B vertical trim y **123.8**, 333,012 v 0/0 → smooth+clamp
  0/0 → offset z_line 26.0, 112,475 region verts, 0/0 → decimate-collapse ratio 0.222 → **122,501
  faces** / 73,965 v, 0/0.
- Export: `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\SIG P226 MK25 TLR-1 HL.stl` (7.22 MB, 73,965 v)
  **+ `SIG P226 MK25 TLR-1 HL GUN.stl`** (12.0 MB, 125,851 v) — see the new two-file rule below.
- **★ NEW STANDING RULE (owner directive 2026-07-28): export the REPOSITIONED ORIGINAL too.** René
  re-imports the mold AND the gun+light into **Shapr3D** and needs them to land aligned. The mold is
  built in `assemble_gun_solid`'s centered frame; the scan on disk is not, so shipping only the mold
  makes him re-align by hand every time. New `export_gun(GUN_SOLID, "<gun-name>")` writes
  `<gun-name> GUN.stl` next to the mold — call it in the SAME run as `export_mold` so the centering is
  provably identical. Verified here: both identity `matrix_world`, gun/mold front-Y both −82.91, min-X
  both −18.45.
- **★ NEW STANDING RULE (owner directive 2026-07-28): ASK for the export folder each run.** The
  dedicated `_AUTOMATED MOLDS` folder stays the DEFAULT, but René wants the option to redirect per job
  — so offer it as a choice right before the export stage rather than hardcoding it. One question, one
  folder, both files (`<gun-name>.stl` + `<gun-name> GUN.stl`) go there via `out_dir=`.
- **⚠ An owner UNDO in Blender wiped every object downstream of the dip** (`CGS_MOLD_CUT/CUT2/SMOOTH/
  FINAL` gone, and the `CTL_B2`→`CGS_MOLD_SOLID` rename reverted). Non-event: the STL was already on
  disk, and every stage is deterministic from the scan + the annotation, so the full rebuild took ~1
  min and reproduced the result to within one face of collapse jitter (122,502 vs 122,501). Rebuild by
  re-running from `sweep_dip`'s output — do NOT re-derive cut points by hand. Also: re-read the
  annotation after an undo (stroke count briefly reported 3 then 1; the fit was unchanged).
- **⚠ Open item for René:** the annotation confirms **34.19°**, which matches the 07-28b *with-light*
  reading (34.1°) and NOT the gun-only reading (49.5°). So **`SIG P226 MK25.stl` exported 2026-07-28a
  is cut ~22mm too low** and should be re-run (or deleted) — his call.
  <!-- @anchor: v1 | failure: (a) FLOAT solver again returned a 6-vert corpse on the diagonal cut where EXACT worked first try; (b) bpy.ops.render.opengl ignored hide_render, silently rendering the wrong objects and nearly validating a refuted hypothesis; (c) camera clip_end=100 default produced an empty first render at 400-unit distance; (d) I attributed the 07-28b light shred to boot/rib aliasing — a same-scan control at boot=2.0 refuted it, the cause was the non-watertight 3-island scan export; 2026-07-28c | regression: cgs-mold SKILL.md Session Notes 2026-07-28c — annotation-driven cut A recipe; EXACT-first + survival guard + retry ladder; set hide_viewport not just hide_render; set clip_end once; boundary>0 on a scan means fix the SCAN -->

### 2026-07-28b — SIG P226 MK25 + TLR-1 HL — **UNFINISHED, NOT EXPORTED** (2 owner calls open)
- scan `P226 MK25 TLR-1 HL SOLID GUN`, 127,162 v, **3 islands** (gun body 61,116 / light 59,644 /
  light side-switch 6,402), **119 boundary edges** (light not watertight). All 3 kept ✓,
  `front_feature_z −10.8` (light bezel drives the front, 3.7mm past the muzzle) ✓, sweep travel
  200.7 full span, 0/0. Offset verified z_line 25.8, decimate 122,336 faces 0/0. **Held at export.**
- **⚠ BLOCKER 1 — the dip SHREDS a barrel-axis-parallel light.** The sweep runs +Y, which is the
  TLR-1's own cylinder axis, so every log-doubling pass unions the ribbed tube with a copy offset
  ALONG that axis: the circumferential ribs interleave instead of merging into a smooth peak-radius
  envelope. Result = corduroy + craters (~1mm) over the whole light body and a torn bezel rim.
  **Voxel 0.4 AND 0.25 both do it** (0.25 = finer shred, 3.8M v, 52s) → NOT voxel aliasing, and NOT
  the 119 open edges (the one hole loop is at y −23, nowhere near the bezel; `GUN_SOLID` renders
  clean). `smooth_mold` converts the shred into pitting, it does not remove it.
  Candidate fixes put to René (undecided): `denoise_region` over the light box / sweep the light
  island separately and union the two envelopes / ship as-is (mesh is 0/0 and dimensionally right,
  only the finish is chewed).
- **⚠ BLOCKER 2 — `_find_cut_points`' knee window is anchored on Y=0, which is the MASS CENTRE.**
  `ys=np.arange(0.0, gr+step, step)` starts the bottom-profile scan at the frame origin, so adding a
  light (which moves the mass centre ~42.7mm) silently moves the search window. On the gun-only P226
  (2026-07-28a) that window started MID-GUN, past the trigger guard, so the "front-third plateau" was
  computed on the grip plunge → corner detected 22.5mm too low → **α 49.5°**. With the light the
  window starts far enough forward to catch the real plateau → corner at the measured trigger-guard
  underside (z −24.7, verified on the gun BODY island alone), cut 21.3mm below it → **α 34.1°**
  (~25mm less grip retained). Same gun, two different molds. Owner's call pending; if 34.1° is right,
  **yesterday's `SIG P226 MK25.stl` was cut ~22mm too low and needs a re-run.**
- **⚠ `cut_grip` has NO survival guard and Blender's boolean has a knife-edge failure.** At B.z =
  0.40000000000000036 (= 10.4 − 10.0 in float) the cutter deleted the entire mold — 1,640 verts,
  1,468 non-manifold — **reproducibly, on both FLOAT and EXACT**, while B.z = 0.4 as a literal, and
  ±0.05mm either side, all work fine. A ~4e-16 difference flips it. The pipeline accepted the corpse
  silently and ran cut B on it. **Always guard: `verts > 0.4×src` and `nonmanifold == 0`, and retry
  with a 0.05mm nudge on the beavertail Z.** `round()` alone does NOT save it — the nudge does.
- **Beavertail must be measured on `GUN_SOLID`, not the swept mold.** After the dip, the mold's rear
  face is flat at ~gun_rear for EVERY Z (`rear_y_vs_z` = 117.8–118.0 across z −78→+57), so
  "rearmost vert in the upper-grip band" is decided by an arbitrary `argmax` tie-break — bt_z is
  effectively random, and it sets α. On the GUN the rear silhouette is a real curve: tip at
  **z 8.8–13.8, y 118.0**. This contradicts METHOD-NOTES §GRIP/TAIL point 1 ("cut points come from
  the SWEPT MOLD") — that rule holds for the CORNER, not for the beavertail.
- `smooth_mold` outliers exploded on this scan: **2,757 verts >0.5mm** (vs 25 on the gun-only run),
  p99 0.334 / p999 1.011 / max 8.66, spread over the WHOLE mold, because the light pushes
  `sharp_verts` 2,588 → 121,143 and `crease_verts` 1,927 → 56,571. Clamp still held 0/0.
- Live objects in the .blend: `CGS_MOLD_FINAL` (34.1° cut, 122,336 f), `ALT_CUT2` (49.5° variant),
  `SWEEP_V25` (0.25 voxel test). Renders: `_SYSTEM/state/_m2_*.png`, `_bez_*.png`.
  <!-- @anchor: v1 | failure: (a) the log-doubling dip shreds a light whose cylinder axis is PARALLEL to the sweep direction — ribs interleave, voxel 0.4 and 0.25 both fail; (b) _find_cut_points' Y>=0 knee window is anchored on the mass centre, so adding a light moved it 42.7mm and changed alpha 49.5->34.1 on the SAME gun; (c) cut_grip silently returned a 1,640-vert corpse at B.z=0.4+4e-16 on both solvers, with no survival guard; 2026-07-28b | regression: cgs-mold SKILL.md Session Notes 2026-07-28b — guard cut_grip on verts>0.4x src + 0.05mm nudge retry; measure the beavertail on GUN_SOLID; owner decision pending on the light sweep + cut-A plane -->

### 2026-07-28 — SIG P226 MK25 (gun only)
- gun: **SIG P226 MK25** (`P226 MK25 SOLID GUN`, 130,037 v / 260,076 tris, watertight manifold 0/0,
  1 island, gun-only, already in canonical pose). Clean end-to-end.
- **⚠ The `blender` MCP server did not connect this session — `execute_blender_code` was never
  available.** Fallback that worked: the Blender addon's own TCP socket on **127.0.0.1:9876** is live
  independently of the MCP wrapper. Wrote `_SYSTEM/state/bmcp.py` (json `{"type":"execute_code",
  "params":{"code":…}}` over a raw socket) and drove the whole pipeline through it.
  **`execute_code` returns only `{"executed": true}` — stdout is NOT captured.** Every stage must
  `json.dump` its summary to a file and be read back from disk. Check the port before declaring
  Blender unavailable: `(Test-NetConnection 127.0.0.1 -Port 9876).TcpTestSucceeded`.
- **Parting line measured, third gun in a row (`z_frac=0.62` stays retired).** This gun is a
  **STEP** like the Sphinx: frame 14.6mm wide → slide 13.0mm. Per-Y-band `argmin(diff(max|x|(z)))`
  over 0.25mm bins, **z 18–27 seeded band**: rear half (y −15…+15) reads **22.4–22.6** consistently;
  used **z_line 22.4**. ⚠ The band y −45…−20 reports 19.6–21.6 with *bigger* contrast (up to 2.17) —
  that is the **slide catch / takedown lever**, not the parting line. Confirms the Sphinx lesson in a
  new form: not just a broad z-band but a **badly chosen Y band** hands the detector a bigger step.
  Read the whole `width_vs_z` curve and take the flat-slide↔flat-frame crossing, don't trust one argmin.
- **Offset verified by REGION bbox** (not object): slide (z > z_line+3) max|x| **13.134 → 13.535
  (+0.401)**, max_z **+0.400**, min_y **−0.400** — outward on all three; frame (z < z_line−3) byte-identical.
- **Smoother outliers again — same clamp, now 3-for-3.** max 4.564mm but p99 **0.064** / p99.9 **0.162**;
  25 verts over 0.5mm out of 274k, in the cut-A/cut-B corner region (y 40.5–81.2, z 8.2–49.9). Clamped
  (revert >0.5mm to pre-smooth) → max disp 0.484, 0/0. No `remove_overhang` needed.
- **⚠ Render camera formula — use the documented one verbatim:** `d = (−sin rz·sin rx, cos rz·sin rx,
  −cos rx)`, camera at `center − d·R`. I flipped the Z sign and the 3/4 + bottom frames rendered
  **completely empty**; the side view (rx=90, cos rx=0) silently masked the bug.
- Evidence chain: assemble 1/1 island, `sight_x_post 0.0` / `mass_x_post 0.193` (seam on the sights),
  `front_feature_z 40.9` (muzzle drives the front, no light), 0/0 → sweep travel **196.9** full span,
  8 log-doubling passes, 795,716 v, 0/0 → cut A corner Y+13.5/Z−70.6, beavertail Y+75.2/Z+1.6
  (= `gun_rear_y`, real rear preserved), **α 49.5°**, 0/0 → cut B vertical trim Y+81.2, 0/0 →
  smooth+clamp 0/0 → offset z_line **22.4**, 113,898 region verts, 0/0 → decimate-collapse ratio 0.272
  → **122,160 faces** / 74,608 v, 0/0.
- Rendered side / 3-4 / bottom. Bottom shows the swept grip-stipple streaks on the cut-A press-bed
  face — real geometry, same as the Echelon/Sphinx.
- Export: `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\SIG P226 MK25.stl` (7.29 MB, 74,608 v).
- **Owner eye still to confirm** the cut-A placement (`corner_below` 20 / `bt_below` 10, α 49.5°) —
  quick re-run from `cut_grip` if he wants it moved.
  <!-- @anchor: v3 | failure: (a) blender MCP server failed to connect while the addon socket on :9876 was live — nearly reported Blender unavailable; (b) a badly chosen Y band (y −45…−20, the slide catch) gave the parting-line step detector a BIGGER wrong step (contrast 2.17 @ z 19.6) than the real line at 22.4; (c) sign-flipped render camera vector produced empty 3/4 + bottom frames that the rx=90 side view masked; 2026-07-28 | regression: cgs-mold SKILL.md Session Notes 2026-07-28 — _SYSTEM/state/bmcp.py socket fallback + dump-summaries-to-file; read the whole width_vs_z curve and take the slide↔frame crossing; use d = (−sin rz·sin rx, cos rz·sin rx, −cos rx) verbatim -->

### 2026-07-27b
- gun: **Sphinx SDP Standard** (`SPHINX SDP STANDARD - GUN - OWB SCAN`, 64,869 v / 129,738 tris,
  watertight manifold 0/0, 1 island, gun-only). Fed straight from a `cgs-align` run in the same session.
  Clean end-to-end, no corrections needed to the cuts.
- **`offset_mold`'s auto `z_line` would have been 32mm off — the second gun in a row, so the `z_frac=0.62`
  default should now be treated as broken, not merely imprecise.** Auto: `zmin + 0.62·H = −96.285 +
  89.64 = **−6.64**`; the real slide/frame parting line is at **z 25.36**. (Echelon was 9.6mm off; this gun
  is 32mm off because its grip is long relative to its slide, so the same fraction lands far lower.)
  **Always measure and pass `offset_mold(smo, z_line=…)`.**
- **This gun's parting line is a STEP, not a groove** — the Echelon's interior-recess (`min|x|`) scan finds
  nothing. General detector = **the sharpest downward step in `max|x|(z)`** per Y-slice (0.5mm z-bins,
  3-bin smooth, `argmin(diff(w))`, parabolic sub-bin refine, plateau contrast ≥0.20mm). Full write-up in
  the cgs-align 2026-07-27b note.
- **⚠ A BROAD search band makes the step detector find the WRONG step.** Scanning z 20–44 on `GUN_SOLID`
  it locked onto a much bigger step — contrast **4.17**, rms **1.27mm**, z **37.0** — because `argmin` takes
  the *largest* gradient in whatever band you give it, and the slide has bigger steps than the parting line.
  Seeded from the aligned measurement instead (`GUN_SOLID` is a pure translation — Δz **−6.4802** matched at
  both bbox ends to 2e−4) and re-scanned a ±4mm band: **z 25.36, slope 0.007°, rms 0.006mm, contrast 0.78**.
  **Seed the band from a known z; never hand the detector the whole gun.**
- **`smooth_mold` outliers again, same signature, same fix.** max 3.59mm but p99 **0.065** / p99.9 **0.150**
  — 21 verts over 0.5mm out of 283k, in exactly two clusters: 14 on the **cut-A ∩ cut-B corner**
  (y 103.4, z 9.2–10.2, x ±11–16 — the cut-A line evaluates to z +9.25 at y 103.5 ✓) and 7 on the
  **rear-sight notch** (y 58–62, z 43–44, x ±2). Both are genuine sharp corners. Clamped (revert >0.5mm to
  pre-smooth) → max disp 0.477mm, 0/0. **Now a repeatable pattern, not a one-off: audit the displacement
  *distribution and locations*, clamp the corner verts, don't reach for `remove_overhang`.**
- **Offset-direction check, done properly.** The overall bbox X barely moved (+0.002 / −0.014), which
  *looks* like inward normals — it isn't: the mold's widest point sits at **z 14.6, below the line**, so it
  is correctly not offset. Band-compare instead: slide region (z > z_line+3) max|x| **13.177 → 13.564
  (+0.387)**, max_z **+0.416**, min_y **−0.399** — outward on all three; frame region (z < z_line−3)
  unchanged (max_z identical, max|x| +0.014 = decimate noise). **Compare the REGION's bbox, not the
  object's.**
- Evidence chain: assemble 1/1 island, `sight_x_post −0.0` / `mass_x_post −0.098` (seam on the sights),
  `front_feature_z 33.9` (muzzle drives the front, no light), 0/0 → sweep travel **208.3** full span,
  8 log-doubling passes, 862,594 v, 6.2s, 0/0 → cut A corner Y+28.5/Z−61.4, beavertail Y+97.5/Z+3.6
  (= `gun_rear_y`, real rear preserved), **α 43.3°**, 0/0 → cut B vertical trim Y+103.5, 0/0 → smooth+clamp
  0/0 → offset z_line **25.36**, 97,062 region verts, 0/0 → decimate-collapse ratio 0.292 →
  **123,578 faces** / 82,848 v, 0/0.
- Verified against the bottom-Z profile, not just the render: bottom −55.5 @ y38 → +4.2 @ y102
  (0.933 slope = 43.0°, matching α 43.3°); ahead of the corner (y 22) the mold bottom is −35.2, well above
  the cut line's −67.5 there, so cut A correctly removes nothing forward of the knee. Rendered
  side / 3-4 / rear-low-3-4 / bottom. The serrated edge along the cut-A face is the swept grip stipple
  clipped by the cut plane — real geometry on the press-bed face, as on the Echelon. No `remove_overhang`
  or `denoise_region` needed.
- ⚠ Render framing bit twice: `ortho_scale` applies to the **longer** resolution axis, so a landscape frame
  on a 215mm-tall bottom view silently crops it. Use a portrait resolution for bottom/top views, and for a
  3/4 place the camera at `center − d·R` with `d = (−sin rz·sin rx, cos rz·sin rx, −cos rx)` rather than
  eyeballing an offset.
- Export: `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\Sphinx SDP Standard.stl` (8.09 MB, 82,848 v).
- **Owner eye still to confirm** the cut-A placement (`corner_below` 20 / `bt_below` 10, α 43.3°) — quick
  re-run from `cut_grip` if he wants it moved.
  <!-- @anchor: v2 | failure: offset_mold's z_frac=0.62 auto z_line landed 32mm below the Sphinx SDP's real parting line (second gun in a row after the Echelon's 9.6mm — the fraction is broken, not imprecise); a broad-band step scan locked onto the wrong (bigger) step at z 37.0 instead of the parting line at 25.36; smooth_mold again spiked corner verts (21 over 0.5mm at the cut-A/cut-B corner + rear-sight notch), 2026-07-27b | regression: cgs-mold SKILL.md Session Notes 2026-07-27b — measure the parting STEP on GUN_SOLID with a SEEDED band -> offset_mold(z_line=...); clamp smoother disp >0.5mm; verify offset by REGION bbox not object bbox -->

### 2026-07-27
- gun: **Springfield Echelon 4.5** (`ECHELON 4.5`, **470,777 v / 941,558 tris** — by far the heaviest scan
  this pipeline has run; watertight manifold 0/0, 1 island, gun-only). Fed straight from a `cgs-align` run
  in the same session, so it arrived in canonical pose. Clean end-to-end, **nothing timed out** — the
  voxel stages are volume-bound, not vert-bound (sweep 10.9s at 470k v vs ~17s at 54k on the 43X).
- **`offset_mold`'s auto `z_line` was 9.6mm too low — measure the parting line, don't trust `z_frac`.**
  Auto seeded `z_line = zmin + 0.62·height = 17.83`; this gun's real slide/frame parting line is at
  **z 27.47** in mold coords. At 17.83 the +0.4mm Kydex-shrink comp would have run 9.6mm down into the
  dust-cover/frame — the exact thing the owner's 2026-06-30 correction forbids (slide + barrel +
  beavertail ONLY). The 0.62 fraction is an HK45-era heuristic; on a gun with different frame proportions
  it lands wherever it lands. **Fix: measure it.** Same interior-groove scan `cgs-align` uses — per-Y-slice,
  the Z in a tight band that minimises `max|x|` (the slide/frame seam is a real recess). Read **27.47,
  slope 0.06°** over 43 slices on `GUN_SOLID` — which also re-confirms `assemble_gun_solid` only
  TRANSLATES (the aligned pose's 0.031° survived). Re-ran smooth→offset→decimate with the measured value;
  region bbox then grew +0.4 outward on every face (X ±, Y front, Z top) = normals correct.
  **Do this on every gun**: measure the groove on `GUN_SOLID`, pass `offset_mold(smo, z_line=…)`.
- **`smooth_mold` spiked 2 verts by 7.15mm at the cut-A ∩ cut-B corner.** The two cut planes meet in a
  sharp corner at (±15, 89.6, 1.4) and the Taubin pass yanked those corner verts. The distribution was the
  tell: `max 7.15 / p99.9 0.19 / p99 0.08` — 6 verts over 1mm out of 276k. **Fix: clamp, don't re-smooth**
  — revert any vert displaced >0.5mm to its pre-smooth position (20 verts here), keeping the crisp boolean
  corner the sweep produced. Post-clamp max disp 0.486mm, manifold 0/0. A bare `max_disp_mm` is not a
  verdict — look at WHERE the outliers are (all 20 on one edge) before reaching for `remove_overhang`;
  a genuine flap is a broad cluster, not 2 corner verts.
- Evidence chain: assemble 1/1 island, `sight_x_post −0.0` / `mass_x_post −0.312` (seam on the sights),
  `front_feature_z 35.0` (muzzle drives the front, no light), 0/0 → sweep travel **201.7** full span,
  8 log-doubling passes, 804,934 v, 0/0 → cut A corner Y+13.5/Z−46.6, beavertail Y+83.6/Z−2.4, **α 32.2°**
  (HK45-like), 0/0 → cut B vertical trim Y+89.6, 0/0 → smooth+clamp 0/0 → offset z_line **27.47**, 109,856
  region verts, 0/0 → decimate-collapse ratio 0.279 → **121,934 faces** / 76,995 v, 0/0.
- Verified against the bottom-Z profile, not just the render: bottom rises **−42.5 @ y20 → −4.6 @ y84**
  (0.592 slope = the 32.2° cut). ⚠ I first mis-read the side render as a wrong-way cut — in a
  `rot (90°,0,90°)` ortho from +X, **screen-right = +Y, screen-up = +Z**; work the pixel↔mm mapping before
  declaring a render wrong. Rendered side/side_L/front/back/top/bottom + 3/4 + cut-A zooms. The serrated
  edge along the cut-A face is the swept GRIP STIPPLE clipped by the cut plane (serration pitch matches
  the stipple, ~0.4mm) — real geometry, not voxel noise, and it lands on the press-bed face. No
  `remove_overhang` / `denoise_region` needed.
- Export: `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\Springfield Echelon 4.5.stl` (7.52 MB, 76,995 v).
- **Owner eye still to confirm** the cut-A placement (`corner_below` 20 / `bt_below` 10, α 32.2°) — quick
  re-run from `cut_grip` if he wants it moved.
  <!-- @anchor: v1 | failure: offset_mold's z_frac=0.62 auto z_line landed 9.6mm below the Echelon 4.5's real parting line, which would have put the +0.4mm Kydex comp on the frame/dust-cover (owner 2026-06-30: slide+barrel+beavertail ONLY); and smooth_mold spiked 2 verts 7.15mm at the cut-A/cut-B corner, 2026-07-27 | regression: cgs-mold SKILL.md Session Notes 2026-07-27 — measure the groove on GUN_SOLID -> offset_mold(z_line=...); clamp smoother disp >0.5mm -->

### 2026-07-09
- gun: **SIG P226 X5 Legion Reserve** (scan `Sig P226 X5 Legion Reserve`, 60,438 v, already watertight
  manifold 0/0, **1 island**, gun-only — no separate light). Correctly pre-oriented: width X (~43.8mm),
  length Y (~220mm, muzzle −Y / grip +Y), height Z (~152mm, slide +Z / grip bottom −Z).
- **Clean end-to-end run, zero corrections** — first single-island gun-only scan since the
  `assemble_gun_solid` universality fix (2026-07-03); confirms the fix is a no-op when there's nothing
  to union (islands_total 1 → kept 1). Evidence:
  - assemble: 1 island kept, sight_x_post −0.0 (seam on the sights), mass_x_post +0.702 (mass≠sight,
    proof width centered on the sight channel), front_feature_z 41.3 (muzzle drives front, no light), 0/0.
  - sweep_dip: travel 220.4 (full span), 8 log-doubling passes, 1.01M v, front_feature_z 41.4, 0/0.
  - cut A: corner Y+13.5/Z−76.2, beavertail Y+79.7/Z+22.6 (= gun_rear, real rear preserved), α **56.2°**
    (steep — tall grip + short beavertail run), 0/0. cut B: vertical trim at Y+85.7, 0/0.
  - smooth: max_disp 5.1mm (single internal spike, no visible flap on render → no remove_overhang), 0/0.
  - offset: z_line +14.4 (auto z_frac 0.62), +0.4mm slide region, 0/0. decimate: collapse ratio 0.219 →
    **122,361 faces** (in band), corners preserved (remesh=False), 0/0.
  - export: `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\Sig P226 X5 Legion Reserve.stl` (7.18 MB, 73,567 v).
- Cut placement auto-seeded (validated `_find_cut_points`); α 56.2° is steeper than HK45's 32° — owner's
  eye to confirm/re-tune `corner_below`/`beavertail_below` if desired (quick re-run from cut A onward).

### 2026-07-03
- **Universality fix — the dip must cover ANY gun, not just the HK45.** René: the sweep was stopping at
  the muzzle instead of the furthest-forward feature; on a **short gun with a big forward light** the
  light bezel extrudes past the muzzle and was not being swept.
- **Root cause:** coverage is set by `GUN_SOLID`, which was built by the HK45-era **"keep the largest
  connected island"** rule. A separate light island gets dropped → `sweep_dip` measures `travel` on the
  gun body alone → dip stops at the muzzle. (The G17 session had already worked around the twin bug by
  hand — "joined + kept both islands".)
- **Fix (scan-seeded, visual tuning kept):** new `assemble_gun_solid([gun, light…])` UNIONS every
  substantial island (drops only specks < `speck_frac`×biggest), seals + centers → GUN_SOLID always
  contains the furthest-forward feature, so `sweep_dip`'s default `travel` (assembled Y-span) reaches
  it automatically. Added `front_feature_z` to `sweep_dip`'s return (low Z ⇒ a forward light is
  correctly driving the front). Exposed `assemble.speck_frac` + a `sweep` block in `params/hk45.json`.
  Updated METHOD-NOTES step 1/4 + failure anchor, SKILL pipeline step 0 + failure-rule 4 + invocation.
- **VALIDATED live 2026-07-03** on **Glock 43X + TLR-7 HL-X SUB** (the exact short-gun/big-light case,
  light protrudes past the muzzle). Scan = 1 object, **2 watertight islands**: gun (30.8k v, diag 206)
  + light (23.2k v, diag 78.5). Evidence:
  - `assemble_gun_solid`: islands_total 2 → **islands_kept 2**, specks_dropped 0, verts 53985 preserved,
    manifold 0/0, front_feature_z **−4.7** (the low light bezel drives the front, not the slide muzzle).
  - `sweep_dip`: travel **175.8** (full assembled span), 8 log-doubling passes, front_y **−74.1**,
    front_feature_z −4.5, manifold 0/0, 1.7s.
  - mold bbox Y[−74.1, +277.5]: front reaches the light (−74.1), front-30mm band reaches Z −15.6 (light's
    low channel swept), tail 175.8mm past the grip (cut B territory). Rendered side-on — dip runs from
    the light lobe through the whole gun. The old "keep largest island" would have dropped the 23k-v light.
  - The validated `sweep_dip` union math was untouched; the fix is the upstream island assembly.
  - Tune `assemble.speck_frac` only if a real small light gets dropped or scan junk survives.
- **Same session — 2 more owner directives, both DONE + validated live on the Glock 43X + TLR-7:**
  1. **NO split anymore** (owner: "after DECIMATE, proceed to EXPORT"). Added `export_mold` (single-piece
     STL to the fixed handoff folder); `split_mold` + `_bore_center_x` DEPRECATED (kept, out of pipeline).
     Pipeline: assemble → sweep → cut A/B → smooth → offset → decimate×2+re-solidify → **export (one piece)**.
  2. **Fixed the HK45 mis-targets** (scan-relative, "keep visual tuning"): `sweep_dip` tags the mold with
     the REAL gun extent (`obj['gun_rear_y']`) so cut/offset restrict to the gun and never mistake the dip
     TAIL for the grip/beavertail (the old `(Z>0)&(Z<35)`+rearmost grabbed the +277 tail). `_find_cut_points`
     → proportional knee (15% of plateau→grip depth) + scan-relative beavertail band; `cut_grip` auto cube;
     new `cut_tail` codifies cut B (vertical tail trim at `gun_rear+margin`, never shortens the beavertail);
     `offset_mold` `z_line` scan-relative (zmin + `z_frac`·height). Live Glock result: corner Y+34.5 (the
     knee), beavertail Y+101.3 (real rear, NOT the +277 tail), tail trim Y+107.7, z_line +16.4, all manifold
     0/0, owner-confirmed cut placement ("good, finish it"). Exported `Glock 43X TLR-7 HL-X Sub.stl` (88k v).
  - Remaining HK45 absolute now retired from the live path; `_bore_center_x` z_min=32 is moot (split gone).
- **Density fix (owner: "too much decimation, want ~120-130k faces; had 88,140").** Root cause: the final
  count is set by the re-solidify VOXEL, not the decimate (the voxel remesh regenerates density — the
  decimate before it barely matters). Fixed with a FACE BUDGET: `decimate_mold(target_faces=125000)`.
- **Crisp corners (owner: "voxel didn't give what I want — I want crisp corners; use 0.4 at sweep+solidify").**
  Root cause: corner sharpness is locked at the FIRST voxelization — `sweep_dip`/`solidify_mold` at 0.7
  rounded every corner to 0.7mm BEFORE smoothing ran, and no finer FINAL voxel recovers it. Proven with a
  same-face-count A/B (0.7 vs 0.4 sweep): 0.4 corners visibly crisp. Two independent levers established —
  **crispness = sweep voxel, face count = final decimate**. Defaults changed: `sweep_dip`/`solidify_mold`
  voxel **0.7 → 0.4**; `decimate_mold` default **`remesh=False`** (decimate-COLLAPSE to the budget, which
  PRESERVES corners — a voxel-remesh rounds them). Glock 43X (0.4 throughout → collapse to budget):
  **119,549 faces, crisp corners, manifold 0/0**, re-exported `Glock 43X TLR-7 HL-X Sub.stl` (7.5 MB).
  Cost: sweep ~17s (was ~2s) + denser cut/smooth — worth it for the corners.
- **Split-seam alignment (owner: "the vertical left/right seam must pass through the SIGHT CHANNEL, not
  the mass").** The clamshell seam is the X=0 vertical plane (owner splits it there); mass-centering the
  width put it off the sights because one-sided controls pull the centroid off the true centerline.
  Fix: `assemble_gun_solid` now centers WIDTH (X) on `_sight_channel_x` (slide-top bilateral-symmetry,
  trimmed 2/98 pct), length+height still mass. Glock 43X: sight_x_post **0.0** (on the seam), mass_x_post
  **+0.178** (mass≠sight, proof we used the sight). Full re-run + re-export, 121,228 faces, manifold 0/0.
  Owner-confirmed intent (front-view AskUserQuestion): vertical seam, make it exact + guaranteed.

### 2026-07-02
- gun: SIG 1911 + TLR-1 HL-X (scan `01_SIG 1911_TLR-1 HL-X_SOLID GUN FOR AUTOMATION.stl`, 93.5k v,
  already watertight manifold 0/0, 1 island; dims X38 Y197 Z79; slide flat along Y, light hangs low
  at front-middle, grip short/rises to rear — unlike HK45's tall grip).
- **THE FIX — the dip/draw sweep is now validated (`sweep_dip`), closing the last upstream gap.**
  Owner corrected the sweep TWICE ("sweep is incomplete", "must run muzzle all the way to the end"):
  - attempt-1 = array-of-copies (step 1.0 > voxel 0.7) → visible steps + serration = the SAME mistake
    as the G17 a few hours earlier. REJECTED.
  - attempt-2 = analytic front/back-face split + silhouette bridge → continuous but COMBS fine
    features (slide serrations/light grooves) by tearing co-located faces. REJECTED.
  - VALIDATED = **log-doubling voxel-UNION** to FULL gun length (muzzle→end): union with a +Y-shifted
    copy, voxel-fill the envelope each pass, double the shift (2→4→…→197mm, 8 passes). manifold 0/0,
    1 island, no combing, no steps. Owner: "now it is correct. Make sure to remember this for future jobs."
- codified: `sweep_dip()` added to `scripts/cgs_mold.py`; METHOD-NOTES step 4 + ORDER-OF-OPS rewritten;
  SKILL failure-rule 3 + pipeline step 1 + status updated; invocation paths ported Mac→Windows.
- lesson for future jobs: the dip is NEVER array-of-copies and NEVER a face-classification sweep —
  always `sweep_dip` (envelope-union, full length). Check METHOD-NOTES step 4 before touching the sweep.

### 2026-07-01
- gun: Glock 17 Gen 6 + TLR-1 HL-X (scan = gun + light as 2 separate watertight islands + 1
  junk speck; kept both real islands, dropped only the speck).
- corrections (owner): (1) cut points must be computed from the swept MOLD, not the pre-sweep
  scan; (2) the auto-knee corner heuristic overshot on this gun's smoother frame curve — picked
  manually from the raw bottom-Z profile instead; (3) grip/tail removal is TWO cuts (diagonal +
  vertical), not one — see METHOD-NOTES.md "GRIP/TAIL CUT = TWO CUTS, NOT ONE"; (4) don't shorten
  the real beavertail to fix a long excess tail — trim the tail with the vertical cut instead.
- errors: none (several iterations to converge on the two-cut approach, all manifold 0/0)
- output: both halves exported together as ONE STL into the dedicated handoff folder
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\<gun-name>.stl` (not the gun's own scan folder —
  first attempt used a per-gun output subfolder next to the scan and the owner couldn't find it).
- missed-then-added step: decimate x2 (DECIMATE COLLAPSE 0.5 twice, un-subdivide substitute) +
  re-solidify BEFORE split, then solidify EACH half individually AFTER split — this closes the
  "un-subdivide OPEN" item from 2026-06-30 and adds the per-half solidify the owner wants as the
  final robustness pass. Re-exported after adding it.

### 2026-06-30
- session: 1167m | peak ctx: 0% | compacts: 0
- tools: Read×2267, Shell×951, Grep×328, Write×271, mcp×54, Bash×38, Edit×18
- corrections: that was successful, we need to clean the back face up before we continue otherwise we will run into issues again.
- errors: none
