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
5. **Two DIFFERENT voxel defect classes, two different detectors, both MANDATORY — and one of them has no
   depth at all.** `repair_pits` (pipeline step 2b) catches CRATERS: a vertex sunk below its own 2-ring
   neighbourhood, up to 1.4 mm on a 0.4 mm voxel. `despeckle_mold` (step 3c) catches the SPECK FIELD: ~0.1 mm
   NORMAL discontinuities whose depth statistics are indistinguishable from a clean panel (P320 X-Carry:
   dotted panel rms 0.068 mm vs clean slide flank 0.067 mm) and which `smooth_mold` and `denoise_region`
   both actively PROTECT as "real creases". **Neither detector sees the other's defect. Run BOTH on every
   mold, and never judge a speck field by a depth number or by `repair_pits` reporting zero.** Corollary
   (08-03b, restated): a speck field on a swept mold is a DEFECT until measured — the sweep is a running-max
   envelope, so it cannot create a concavity, and a swept flank is smooth by construction.
<!-- @anchor: v1 | failure: OWNER REJECT "why the hell are you always making these holes!!!???" — a dense speck field shipped on the swept left frame flank of the P320 X-Carry mold after repair_pits reported 0 defects for three consecutive stages, because the specks are ~0.1mm NORMAL discontinuities with no depth signature (panel plane-fit rms 0.068mm vs clean flank 0.067mm; the discriminator was sharp_frac 0.18-0.29 vs 0.000), and smooth_mold/denoise_region both froze them as real creases (denoise_region moved 31,989 verts for a measured no-op 0.0241 -> 0.0225); I had also seen the field in my own render and dismissed it as scan stippling without measuring, 2026-08-17b | regression: cgs_mold.py speck_report / repair_specks / smooth_flank_field / despeckle_mold (sharp-mask compactness discriminator + grid flank filter with a 0.18 tolerance gate + 0.35 cumulative cap + per-pass extended_still_sharp assert) + SKILL pipeline step 3c gate on ok==True before export; validated 245 -> 6 hotspot clusters over 6 passes, 0/0, idempotent re-run -->

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
   ★★ **THE CUT-CONFIRM RENDER — ONE image, mold TRANSLUCENT over the SOLID gun. Five layouts were
   rejected by the owner on 2026-08-08; exactly one works.** Switch `render.engine` to
   `BLENDER_EEVEE_NEXT`; give the MOLD a Principled material, blue base colour, **Alpha 0.28**,
   `surface_render_method='BLENDED'` (plus `blend_method='BLEND'` in a try/except) and
   `use_backface_culling=False`; give the GUN an opaque warm-orange material; SUN lamp ~4.0, dark world,
   ortho side camera framed on the UNION of both bboxes; render with `bpy.ops.render.render(write_still=True)`
   — **NOT** `render.opengl`; then composite the cut lines from `ppm = res_x/ortho_scale` (screen-right +Y,
   screen-up +Z at rx=90/rz=90; `cy/cz` = the camera's own y/z). Switch back to `BLENDER_WORKBENCH` after.
   ⚠ **REJECTED — do not repeat:** mold alone ("I cannot see the gun") · gun alone with a removed-region
   tint ("I cannot see the mold") · gun + mold *outline* ("there is no overlay, I cannot see where you
   intend to cut") · mold **half-sectioned** at X=0 rendered beside the gun (readable ONLY when the swept
   tail protrudes past the gun; when cut B lands near the beavertail the mold hides entirely inside the gun
   silhouette) · two stacked panels at the same scale ("AGAIN... I must see both!" — he means superimposed,
   not side by side). The mold IS the gun's swept envelope, so it CONTAINS the gun; only real alpha shows
   both surfaces at the same pixel. Full failure log: Session Notes 2026-08-08.
3c. **SPECK-FIELD GATE — `despeckle_mold`, MANDATORY, and `ok` must be True before export** (owner
   directive 2026-08-17b: *"make sure this is checked automatically with every future mold"*, after
   *"why the hell are you always making these holes!!!??? The original stl file is a clean file"*).
   Run it on the **PRE-DECIMATE** mold, after `smooth_mold` + `offset_mold`. One call: audit →
   `repair_specks` → re-audit → auto `smooth_flank_field` on any surviving hotspot → converge (monotone,
   stops on no-progress) → final audit. Then **`assert r["ok"] and not r["crease_assert_failed"]`** — a
   False `ok` names the panels in `r["after"]["hotspots"]`; go render that panel under cavity/matcap light
   and deal with it. Do NOT export past a False.
   ★ **THIS DEFECT CLASS HAS NO DEPTH AND EVERY DEPTH PROBE IS BLIND TO IT.** On the P320 X-Carry the
   dotted panel plane-fitted at **rms 0.068 mm** and the visually-spotless slide flank at **0.067 mm** —
   identical. The discriminator was the crease flag: **`sharp_frac` 0.18–0.29 vs 0.000**. They are ~0.1 mm
   NORMAL discontinuities from the voxel remesh; cavity/matcap shading renders a normal break as a hard
   black speck, so the eye sees a hole where there is almost no depth. `repair_pits` cannot see them, and
   `smooth_mold` / `denoise_region` actively PROTECT them (both freeze sharp verts as real creases —
   `denoise_region` moved 31,989 verts and changed the panel metric 0.0241 → 0.0225, a measured no-op).
   ★ **Discriminator = `repair_pits`' compactness test applied to the SHARP mask**: a real crease is a LONG
   connected cluster (rail grooves, panel borders, the parting line, cut-face borders — a flat cut face is
   safe for free, its only sharp verts are its long border), a voxel facet break is a compact blob. Every
   repair pass re-asserts `extended_still_sharp == extended_verts`, so owner geometry provably cannot be
   eaten. Escalation is legitimate because a swept flank is the **running max** of the gun's half-width
   along the sweep — smooth by construction, so high-frequency content on it was manufactured downstream
   and cannot be scan detail.
   ⚠ `smooth_flank_field`'s `tol` (0.18) is load-bearing: un-gated, it hit its cap on 100/434 verts of the
   P320's clean CONVEX right flank, i.e. it was flattening real shape. **A systematic mismatch bigger than
   the noise band means the region is not a noise case — skip it, don't clamp it.**
   ⚠ `total_cap` (0.35) exists because passes COMPOSE and the per-stage caps do not bound the sum (an
   uncapped multi-pass run drifted to 0.60 mm on a 0.15/0.18-capped pipeline).
   ⚠ **Never re-audit after decimating and expect the same numbers** — neighbourhood metrics scale with
   edge length: the P320 read f010 **0.0006 pre-decimate and 0.0571 post-decimate** on two surfaces
   **0.0071 mm** apart. Verify at ONE density, or with a BVH distance.
   Validated 2026-08-17b on a 0.4-voxel remesh of the X-Carry scan (the hardest case — a gun carries far
   more real detail than a swept mold): hotspot clusters **245 → 68 → 54 → 18 → 10 → 8 → 6** over 6 passes,
   8.0 % of verts moved at mean 0.106 mm / max exactly the 0.35 cap, manifold 0/0 and the crease assert
   green on all 7 repair passes, and a re-run is a 5.6 s **ok:True / 0 hotspots** no-op (idempotent).
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
# 2d. MANDATORY GATE: the SPECK FIELD — ~0.1mm NORMAL breaks that repair_pits is blind to and that
#     smooth_mold/denoise_region PROTECT as creases (René 2026-08-17b: "always making these holes").
#     Run on the PRE-DECIMATE mold, AFTER smooth_mold + offset_mold; do NOT export past ok:False.
sp = despeckle_mold(smo)                                      # audit -> repair -> auto flank filter -> converge
assert sp["ok"] and not sp["crease_assert_failed"], sp["after"]["hotspots"]
#     read-only audit anywhere (e.g. a pre-export assert):  speck_report(obj)["ok"]
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
The two MANDATORY defect gates are also in-place and return just a summary: `repair_pits` (craters) and
`despeckle_mold` (speck field); `speck_report` is read-only and safe to call anywhere.
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

### 2026-08-17c — **SIG P320 X-Carry, bare gun** — **DONE, EXPORTED**; the speck gate's first live catch
- First run with `despeckle_mold` (step 3c) wired in as a mandatory gate. Scan `P320 XCARRY - GUN`
  112,885 v / 225,790 f, watertight **0/0, 1 island**, identity matrix, canonical pose. Edge ratio
  p99/p1 = **23.0** ⇒ `repair_pits` correctly skipped on the scan; post-sweep **2.40**.
  Annotation present: 2-point stroke (2.4406, −32.3253) → (96.1547, 11.6567) at x=0 ⇒ m 0.469322,
  b_scan −33.4708. Δ from assemble = (−0.063, **−6.844**, **+10.954**), pure translation ⇒
  `b_mold` **−19.30457**, **α 25.14°** — the second-shallowest cut A this pipeline has run (only the
  43X's 15.4° is shallower). Sanity: passes 10.9 mm under the knee and 12.0 mm under the beavertail,
  crossing the mold bottom at y ≈ 0. Owner confirmed 25.1° on the first cut-confirm render.
- **★★ THE GATE EARNED ITS KEEP ON ITS FIRST RUN — it returned `ok: False` and named the region.**
  27 hotspot clusters at **y −118.5…−108.3, z 53.4…59.1, both flanks** = the mold's **front nose cap**,
  where the swept envelope curves from the muzzle face up to the slide crown. Its escalation could not
  clear it (27 → 17 → 19, then it stopped on no-progress, as designed) **because the clusters sit at
  |x| ≈ 0–3.4, not on a flank** — `smooth_flank_field` selects `|x| > 0.93·hw` and so cannot reach a
  cap. That is the correct behaviour: it refused to mangle a doubly-curved cap with a flank tool and
  handed me a location instead. Without the gate this would have shipped — the jagged staircase on the
  nose arc is plainly visible in a cavity render, and I had not thought to look there.
  **The fix: `denoise_region` on the nose box with `feature_angle=179` so NOTHING is frozen.** On a
  voxel staircase the "creases" ARE the defect, so the usual crease-freeze is exactly backwards there.
  y −122…−104, z 48…64, 10 pairs: nose-cap Laplacian p99 **0.0604 → 0.0414**, max 0.1453 → **0.0650**,
  for a mean displacement of **0.0085 mm** and 0 verts hitting the 0.25 cap. Re-audit: **0 hotspots,
  ok: True.** The cap is now smoother than the untouched slide-top reference (p99 0.0704).
  ⚠ Note the direction of the pre-fix numbers: the nose cap's p99 (0.060) was ALREADY below the
  slide top's (0.070), so this was not gross roughness — it was a local CONCENTRATION of compact sharp
  clusters. That is precisely what the hotspot-density test is for and what a global roughness p99
  cannot see.
- **⚠ The gate re-reads `ok: False` on the DECIMATED mold and that is the documented density trap, not
  a regression.** Pre-decimate: 0 hotspots. Post-decimate: 20 hotspot clusters — because the compactness
  threshold (2.5 mm bbox diag) and the bucket counts are calibrated at 0.4 mm voxel edges, and collapse
  roughly doubles the edge length, so the same "compact" window now spans twice the surface. The BVH says
  the decimated surface is **p99 0.0032 / max 0.0677 mm** from the gated one, i.e. the geometry IS the
  gated geometry. **Gate on the PRE-DECIMATE mesh; validate the decimated one by BVH.** (Same lesson as
  08-17b's f010 0.0006 → 0.0571, now hit from the other direction.)
- Knee textbook on the mold's running-min bottom, and it has **TWO plateaus** — 17.79 from y −115 to −66
  (the dust cover / rail underside), then a step to **−10.987 dead flat from y −27.5 to −5.5** (the
  trigger-guard bottom), then −4.5 → −11.213 continuously. Corner = the LAST flat bin = **(−5.5, −10.987)**.
  Beavertail on GUN_SOLID, banded: a clean tang at **y 67.83, z 23.5–28.5**, receding to 43–55 below and
  58 → 42 above; the grip heel is 20 mm FORWARD (y 47.4 at z −9.5), so no 08-04c heel trap.
  **EXACT@dz=0 first try on both cuts**: A 316,905 v (0.40×src), B at `beavertail + 6` = y 73.8 →
  254,276 v, both 0/0.
- **★ z_line 39.5, and it cross-validated against the previous run on the SAME gun.** Band table: mid
  frame **16.28** to z 38 → 15.22 → **13.40** at z 40; rear 15.98 to z 37 → 14.99 → 13.95 → **13.47** at
  40. The ctr band's 17.5 at z 34–37 is the beavertail tang, above the line, correctly ignored (08-07).
  ⚠ The **fwd band is structurally uninformative on this gun for the third time** — the dust cover is
  flush with the slide (13.42 from z 31 up). Slide height 62.65 − 39.5 = **23.2 mm** ✓. Converted to scan
  frame (Δz +10.954) this is **28.55**, against **28.63** from the 08-17b TLR-7 X run (Δz +8.366) —
  the same gun measured in two independent runs agreeing to **0.08 mm**. That is the cheapest possible
  confirmation of a parting line and it costs one subtraction; do it whenever the gun has been run before.
- `boot=0.4`, travel 187.7, 10 passes, **7.1 s** on 113k v. Pits post-sweep **746 → 185 → 51 → 14 → 3 →
  2 → 1**, then oscillating 1↔2 rather than reaching 0 — a single vert adjacent to an extended cluster
  flipping in and out. Not divergence (never rises), mean move 0.23 mm ≈ 0.6× voxel; it cleared to 0 after
  the cuts and stayed 0 through smooth and offset.
- `smooth_mold(flat_pairs=8, deburr_thr=0.015, deburr_rings=3, deburr_pairs=12)` — tenth gun on the
  anti-orange-peel params. Slide flank p99 **0.0485 → 0.0221** (max 0.124 → 0.024), slide top p99
  0.0586 → **0.0229**. 24 verts >0.5 mm clamped → max 0.447, 0/0. **Eighteen-for-eighteen on the clamp.**
- Offset verified by REGION bbox: slide ±0.400 X / min_y −0.399 / max_z +0.393; frame region
  **byte-identical (all 0.000)**. Gaps: slide flank **+0.411**, frame flank **+0.035 ≈ 0** (below the
  line, correctly untouched), front-Y +0.413, max_z +0.417.
- Pre-clean exposed **0** non-manifold; decimate ratio 0.242, 1 iter → **123,000 faces / 61,502 v, 0/0,
  1 island**. Dims 35.09 × 194.48 × 86.48.
- Export (folder + name confirmed with René — a THIRD P320 file, so it needed a distinct name):
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\P320 XCARRY.stl` (6,150,084 B, 61,502 v) **+
  `P320 XCARRY GUN.stl`** (11,289,584 B, 112,885 v). Both byte-exact vs `84 + 50·TRIS`, both identity
  `matrix_world`.
  <!-- @anchor: v1 | failure: none shipped — this is the entry recording that the new despeckle_mold gate CAUGHT a real defect on its first live run (27 hotspot clusters of voxel staircase on the mold's front nose cap, y -118.5..-108.3 / z 53.4..59.1) that would otherwise have exported, and that its flank-based escalation correctly REFUSED to touch a cap (clusters at |x| 0-3.4, outside the |x|>0.93*hw flank mask) and stopped on no-progress instead of mangling it; also records that the gate re-reads ok:False on the DECIMATED mesh purely because its thresholds are calibrated at voxel edge length, 2026-08-17c | regression: cgs-mold SKILL.md Session Notes 2026-08-17c — clear a voxel staircase on a curved CAP with denoise_region(feature_angle=179) so nothing is frozen (on a staircase the "creases" ARE the defect); gate on the PRE-DECIMATE mesh and validate the decimated one by BVH; cross-check z_line against a previous run of the same gun by converting through the assemble translation -->

### 2026-08-17b — **SIG P320 X-Carry + TLR-7 X** — **DONE, EXPORTED**; `repair_pits` is BLIND to a wide crater
- Input = the gun I had aligned earlier the same session with `cgs-align`, now with the light merged:
  `P320 XCARRY TLR-7 X`, 166,469 v / 332,986 f, **watertight 0/0, 1 island**, identity matrix, canonical pose
  inherited (pitch −0.017/+0.004° · roll −0.007/+0.010° · yaw +0.009°) — **no pose work needed**. Scan edge
  ratio p99/p1 = **31.5** ⇒ `repair_pits` correctly skipped on the scan; post-sweep it is **2.45**.
  Gun and light are one welded island and the light does not extend the envelope (identical bbox to the bare
  gun) — as on the 08-08c G19, **a matching bbox is not evidence the light is absent**; the cut-confirm
  render showed it plainly.
- **★★ THE LESSON: `repair_pits`' 2-ring probe cannot see a crater WIDER THAN ITS OWN SUPPORT.** A dimple on
  the right slide flank at (13.28, −61.22, 42.39), **~2.5 mm across and 0.35 mm deep**, survived every
  sanctioned pass — post-sweep, post-cut and post-smooth all reported `defect_verts 0` — because the whole
  2-ring neighbourhood sits INSIDE the crater, so `d = (mean₂ᵣᵢₙ𝗀 − v)·n` read only **0.16**, under the 0.25
  threshold. Decimate-collapse then amplified it to 0.238 and it rendered as an obvious black mark.
  **THE PROBE THAT FINDS IT: fit a plane to an ANNULUS (2.6–4.2 mm) around the suspect spot and measure the
  INNER deviation against the surrounding surface's own flatness.** Here: annulus rms **0.0129 mm**, inner
  dev **−0.349 mm**, against reference flank patches elsewhere at rms 0.005–0.012 / ptp 0.022–0.043. That
  contrast is unambiguous where a normal-projected ring probe is silent.
  **THE FIX:** pull the inner verts onto the annulus plane with a **smoothstep falloff** (w = 1−(3t²−2t³),
  t = r/2.6), capped at 0.45 mm. 135 verts moved, max 0.349 → patch rms **0.0095**, ptp **0.0611** — i.e.
  restored to the flank's native flatness. Applied pre-decimate, then re-decimated; BVH p99 0.0035, max
  **0.0071 mm**, zero verts over 0.1.
- **⚠ Lowering `repair_pits`' threshold to chase it DIVERGES — the 08-04c rule, re-measured.** At thr 0.15
  on the post-offset mesh the flagged set was 224 clusters; the repair moved **1,846 verts** (mean 0.136,
  capped 0.25 mm) and the post-count came back **1,108 pits, worst 0.395** — WORSE than it started. At
  0.4 mm voxel density the whole surface carries |d| ≈ 0.10–0.15, so a sub-0.20 threshold is repairing the
  noise floor, and smoothing a patch manufactures fresh rim mismatch. An earlier variant at 0.15 with a
  2-ring free set moved 784 verts and left 185 positives. **The compact/extended discriminator does NOT
  rescue a threshold set under the noise floor.** Both attempts also grabbed verts on the **cut-B flat face**
  (y 101.45) and the cut-A plane band — always exclude the cut planes from any pit probe.
- **⚠ Two experiments damaged the pre-decimate mesh, and recovery was free because `CGS_MOLD_CUT2` was
  never touched.** smooth → clamp → `repair_pits` → offset re-ran from CUT2 and reproduced the previous
  numbers **exactly** (disp max 7.8507 → clamp 0.462; pits 3→1→1→0; offset region 106,278 verts). **Keep the
  pre-smooth cut mesh in the scene for the whole run** — it is the cheap rollback point for every
  experiment downstream of it.
- Annotation-driven cut A, first try: René's 2-point stroke (−0.2014, −37.1431) → (88.5395, 14.1433) at x=0,
  scan frame. Δ from `assemble_gun_solid` = (−0.063, **+20.511**, **+8.366**), pure translation (shift_min ==
  shift_max), so `b_mold = b − m·Δy + Δz` = **−40.5154**, m 0.577931, **α 30.02°**. Sanity: the line passes
  13.9 mm under the trigger-guard knee (mold bottom plateau **−13.576** flat y −0.5…22.5, plunging from 23.5)
  and 7.0 mm under the beavertail — both close to the −20/−10 defaults, i.e. his line is geometrically sane.
  **EXACT@dz=0 first try**, 323,824 v (0.393×src), 0/0.
- Beavertail on GUN_SOLID, banded: the rear silhouette spikes to **y 95.18 at z 20.5–26.5** (the tang) and
  recedes both above (z 27.5 → 83.96) and below (z −9.5 → 73.72) — the grip heel is 21 mm FORWARD here, so no
  08-04c heel trap. cut B at `beavertail + 6` = **y 101.2** → 281,125 v, 0/0.
- `boot=0.4`, travel 187.7, 10 passes, **7.8 s** on 166k v. Pits post-sweep **970 → 43 → 4 → 0**, mean move
  0.172 mm ≈ 0.43× voxel, 18 extended clusters rejected.
- `smooth_mold(flat_pairs=8, deburr_thr=0.015, deburr_rings=3, deburr_pairs=12)` — ninth gun on the
  anti-orange-peel params. Slide flank p99 **0.0884 → 0.0254**, slide top p99 0.0577 → **0.0235** (max 0.129
  → 0.024). 25 verts >0.5 mm clamped → max 0.462, 0/0. **Seventeen-for-seventeen on the clamp.**
  ⚠ My first flank probe returned **n=0**: I derived the half-width from the WHOLE mesh (17.55, the frame)
  instead of from the slab (13.6, the slide) — the 08-17 lesson repeated within one day. **Derive every
  probe band from its own slab's extent.**
- **Parting line `z_line` 37.0** off the band table (1 mm slabs): mid **16.27–16.29** and ctr 16.1 to z 36,
  both collapsing to **13.46/13.59** at z 37; rear 17.4 tang → 13.45. ⚠ The **fwd band is structurally
  uninformative on this gun** — the dust cover is flush with the slide (13.41 vs 13.46) — exactly as on the
  08-17 bare P320. Slide height 60.07 − 37.0 = 23.1 mm ✓. Cross-checks with the parting seam I measured in
  the align run (scan z 29.36 + Δz 8.366 = **37.7**) to 0.7 mm. Offset verified by REGION bbox: slide ±0.400 X,
  min_y −0.400, max_z +0.396; frame region **byte-identical (all 0.000)**.
- Pre-clean exposed **0** non-manifold; decimate ratio 0.219, 1 iter → **123,000 faces / 61,502 v, 0/0,
  1 island**. Gaps: slide flank **+0.467**, frame flank **+0.013 ≈ 0** (below the line, correctly untouched),
  front-Y +0.391, max_z +0.415.
- Cut-confirm render: EEVEE translucent overlay per pipeline step 3, **first render accepted**. ⚠ This build
  still has no `BLENDER_EEVEE_NEXT` (08-08d) — fall back to `'BLENDER_EEVEE'`. Line composite from
  ppm = 1800/220.18 = 8.175, `cy/cz` = the camera's own y/z; note the image array from `img.pixels` is
  **bottom-row-first**, so screen-up = +row for +z.
- Export (folder confirmed = the standing default), both byte-exact vs `84 + 50·TRIS`, both identity
  `matrix_world`: `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\P320 XCARRY TLR-7 X.stl` (6,150,084 B,
  61,502 v) **+ `P320 XCARRY TLR-7 X GUN.stl`** (16,649,384 B, 166,469 v). Under the ~500k-vert threshold,
  so no LIGHT companion needed.
- **★★ OWNER REJECT — "why the hell are you always making these holes!!!??? The original stl file is a
  clean file" — and the dots are NOT DEPTH, they are ISOLATED SHARP VERTS.** He arrowed a dense speck field
  on the LEFT frame flank (y −50…+29, z −4…+9). **I had seen it in my own render and dismissed it as "the
  frame's stippling — real geometry" WITHOUT MEASURING**, which is the 08-03b rule broken verbatim: a speck
  field on a swept mold is a DEFECT until measured. Worse, it cannot be scan detail — the flank is the
  running-max of the gun's half-width along +Y, so the sweep can only ever make it FLATTER.
  **The measurement that finally identified them:** a 5 mm patch on the dot panel fits a plane at
  rms **0.068 mm**, and the visually-clean slide flank on the same mesh fits at rms **0.067 mm** — identical
  depth statistics. The only difference is `_feature(35°)`: **`sharp_frac` 0.18–0.29 on the dot panel vs
  0.000 on the clean flank.** They are ~0.1 mm normal DISCONTINUITIES, not craters — amplitude below every
  depth threshold, but the cavity/matcap shading renders a normal break as a hard black speck (the 08-04c
  "the eye reads normals" note, in its sharpest form).
  **Consequence: every depth probe is structurally blind to them, AND `smooth_mold`/`denoise_region`
  actively PROTECT them**, because both freeze sharp verts as real creases. Measured: `denoise_region`
  (y −56…34, z −9…14, 15 Taubin pairs) moved **31,989 verts** and changed the panel's f010 from 0.0241 to
  **0.0225** — a no-op. So did a normal-projected dish-fill: it froze `~sharp` by design.
  **DISCRIMINATOR — apply the compactness test to the SHARP mask, not the depth mask.** Cluster sharp verts
  by edge adjacency: a real crease is a LONG connected line (bbox diag > 2.5 mm — rail grooves, panel
  borders, the parting line), a voxel facet break is a COMPACT cluster. Here: 225 clusters → 186 compact
  (1,127 verts) vs 42 long (4,605 verts). Smoothing only the compact ones dropped sharp35 5,607 → 5,021
  while **all 4,605 long-crease verts stayed sharp** — features provably intact.
  **THE FIX THAT ACTUALLY CLEARED IT — a grid-resampled flank filter.** Grid `|x|` over (y,z) at 0.4 mm,
  dilate-fill the empty cells, separable gaussian σ = 1.0 mm, bilinear-sample back, freeze long-crease
  verts. That removes structure under ~1.5 mm — exactly the speck scale — and preserves the panel's shape
  and anything larger than ~2 mm. Left flank: 9,551 verts, mean move **0.022 mm**, max 0.174. Render: the
  field is **gone**.
  ⚠ **The tolerance gate on that filter is load-bearing, not a formality.** First run had no gate and on the
  RIGHT flank — which is CONVEX and was already clean (f010 0.000) — it hit the 0.30 mm cap on 100 of 434
  verts, i.e. it was flattening real shape, not noise. Fix: apply the move ONLY where `|x_smooth − x| < 0.18`.
  R then skips those 100 and its mean move falls **0.105 → 0.061 mm**. **A systematic mismatch bigger than
  the noise band means the region is not a noise case — skip it, don't clamp it.**
- **⚠ THE WIDE-SUPPORT PROBE IS NOT COMPARABLE ACROSS MESH DENSITIES — I nearly declared the fix failed.**
  The k-iteration Laplacian probe's support scales with EDGE LENGTH, so the same surface read f010
  **0.0006 pre-decimate (281k v)** and **0.0571 post-decimate (61.5k v)** — while the BVH said the two
  surfaces are within **0.0071 mm** of each other. The geometry did not change; the ruler did. **Verify a
  surface fix at ONE density, or with a BVH distance, never by re-running a neighbourhood probe after
  decimating.**
- Recovery discipline paid off twice: `CGS_MOLD_CUT2` was kept untouched all session, so both damaging
  experiments (the sub-threshold pit chase and the un-gated flank filter) were undone by re-running
  smooth → clamp → repair_pits → offset from it, reproducing prior numbers exactly. Final chain that shipped:
  smooth(8/0.015/3/12) + clamp → repair_pits ×2 → offset(z_line 37, 0.4) → repair_pits ×2 → annulus
  plane-fill of the one wide flank crater (135 v) → compact-sharp decluster (186 clusters, 2,450 v, cap
  0.15) → grid flank filter both sides with the 0.18 tolerance gate → pre-clean → decimate.
  Re-verified: **123,000 faces / 61,502 v, 0/0, 1 island**, BVH p99 0.0036 / max 0.0494 / zero over 0.1,
  gaps slide flank +0.467 · frame flank +0.012 ≈ 0 · front-Y +0.391 · max_z +0.415, dims 35.10 × 194.42 ×
  89.12. Both STLs re-exported byte-exact.
- ⚠ Scratch dumps to `C:\Users\rene\cgs_tmp\` (`_SYSTEM/state/` stays denied, 08-17). `scipy` is **not**
  available in this Blender — build adjacency with `np.add.at` / `searchsorted` instead.
  <!-- @anchor: v1 | failure: OWNER REJECT "why the hell are you always making these holes!!!???" — a dense speck field on the swept left frame flank shipped in the export, and I had already seen it in my own render and dismissed it as "the frame's stippling, real geometry" without measuring (08-03b rule broken verbatim); the specks are NOT craters — the panel's plane-fit rms 0.068mm equals the visually-clean slide flank's 0.067mm, and the only difference is sharp_frac 0.18-0.29 vs 0.000, i.e. ~0.1mm NORMAL discontinuities that every depth probe is blind to and that smooth_mold and denoise_region both actively PROTECT as "real creases" (denoise_region moved 31,989 verts and changed f010 from 0.0241 to 0.0225); and the un-gated grid filter then hit its 0.30mm cap on 100/434 verts of the clean CONVEX right flank, flattening real shape; 2026-08-17b | regression: cgs-mold SKILL.md Session Notes 2026-08-17b — cluster the SHARP mask by adjacency and smooth only clusters with bbox diag <= 2.5mm (long clusters are real creases, verify all of them stay sharp); clear a speck field with a grid-resampled flank filter (0.4mm grid, gaussian sigma 1.0mm) applied ONLY where |x_smooth - x| < 0.18mm; never compare a neighbourhood probe's numbers across mesh densities -->
  <!-- @anchor: v1 | failure: a 2.5mm-wide 0.35mm-deep crater on the slide flank survived every sanctioned repair_pits pass (post-sweep, post-cut, post-smooth all reported defect_verts 0) because the 2-ring probe's entire support sits INSIDE a crater that wide, so d read only 0.16 against a 0.25 threshold — decimate then amplified it to 0.238 and it shipped visible in the render; and chasing it by lowering the threshold to 0.15 DIVERGED, moving 1,846 verts and raising the post-count to 1,108 pits worst 0.395; 2026-08-17b | regression: cgs-mold SKILL.md Session Notes 2026-08-17b — detect a wide crater by fitting a plane to a 2.6-4.2mm ANNULUS and comparing the inner deviation against the surrounding surface's own flatness, repair by pulling the inner verts onto that plane with a smoothstep falloff; never set repair_pits below 0.20; exclude the cut planes from every pit probe; keep CGS_MOLD_CUT2 in the scene as the deterministic rollback point -->

### 2026-08-17 — **SIG P320 X-Carry, an OBJ and a RAW PHOTOGRAMMETRY SHELL** — **DONE, EXPORTED**; a new input class
- First **OBJ** input and first **unaligned, non-watertight** scan this pipeline has run. `Sig_P320_X-Carry`
  479,434 v / 948,543 f, **24 islands, 10,383 boundary edges / 71 open loops**, textured photogrammetry.
  ⚠ `matrix_world` carried the **OBJ importer's +Y-up→+Z-up X-rotation**, not identity — apply it
  (`transform_apply`) before measuring anything (same class as 08-08b's 90° Z rotation).
- **★★ ALIGNING A RAW SCAN FROM NOTHING — PCA for the frame, then datums for the polish.** No annotation,
  no canonical pose. Recipe that worked: (1) SVD of the main island → 3 axes; (2) resolve SIGNS by shape,
  not by guessing — the grip end is the half with the larger spread along the height axis, and "down" is
  where the rear 25 % of mass sits; (3) render and **read the ACCESSORY RAIL**: it is on the frame's
  underside near the muzzle, so if the rail is on the +Z side the gun is upside down (it was → 180° about Y).
  ⚠ **Do NOT sanity-check a pose with `bbox = L·cosφ + H·sinφ`** — that identity holds for a RECTANGLE, and
  a pistol is an L-shape whose bbox can SHRINK under rotation. I used it to "prove" the pitch could not be
  20°, and it was 20.75°. The bbox told me nothing; the top-envelope slope told me everything.
- Pitch from the |x|<4 top envelope: slope 0.3788 → **−20.75° applied**, residual 0.08 % — the slide top then
  read **61.94–62.14 flat over 121 mm**, with the front sight (65.5–65.8) and rear sight (66.6–67.2) standing
  proud of it, exactly as they should. Final pitch **+0.18°** (inside the fit's own rms 0.50) → not corrected.
  Yaw **+0.02°** → zero. **Roll: four independent datums ALL negative** — rear-sight shoulder plane −0.938°
  (rms **0.124**, n 4667), whole-body symmetry −1.158°, slide-flank mid-X vs z −1.650°, front-sight top
  −0.642° — against the slide-top plane's +0.62° (rms 0.437), which doctrine forbids anyway. Corrected on
  the rear-sight plane in **two iterations (−0.938 then −0.336)**; afterwards all three converge
  (rear sight −0.074°, symmetry −0.054°, slide top −0.274°) and the symmetry fit's rms improves
  **0.134 → 0.087**. **A falling symmetry rms is the tell that a roll correction was real**, and the X bbox
  shrank 35.99 → 34.63 confirming it.
- **★★ SEALING A 71-LOOP SHELL: `fill_holes` cannot do it, `edge_face_add` can, and TRIANGULATING UNDOES IT.**
  `assemble_gun_solid` got 10,383 → 1,445 boundary edges. Then: select boundary → `fill_holes(sides=0)` →
  select boundary again → **`edge_face_add`** (one n-gon per remaining loop, 9 of them) → **0/0**. Running
  `quads_convert_to_tris` on those n-gons immediately re-broke it to 247 nm / 156 bd — the big lids are
  non-planar and BEAUTY triangulation fails on them. **Stop at the n-gon state; voxel remesh eats n-gons fine.**
  ⚠ And the trap that cost two rounds: **`bpy.ops.mesh.select_non_manifold` selects NOTHING unless
  `bpy.ops.mesh.select_mode(type='EDGE')` was called first** — it fails silently, so `fill_holes` looks
  like a no-op when it never had a selection.
- **★★ THE RULE FOR "DOES A SCAN HOLE MATTER": it is the hole's FACING relative to the sweep, not its size.**
  The worst loop (790 v, 29×30 mm) was the **backstrap/beavertail**, and I flagged it to René as a blocker
  because it sits above the cut line. It is in fact **harmless**: its n-gon lid faces **+Y**, the dip sweeps
  +Y, so the lid is swallowed into the tail block and cut B trims it. A mold only records surfaces that do
  NOT face the sweep direction. Judge every hole by which way its lid points before condemning a scan.
- **⚠ Two mirrored SLIVERS extended `gun_rear_y` by 14.65 mm and blinded the beavertail probe.** The banded
  rear-silhouette probe returned `peak_y 81.97` at z 8 in ALL THREE bands — degenerate, the 07-28b flat-rear
  signature now happening on the GUN because the rear is a flat cap. Reading the ROWS instead exposed it:
  a 4 mm-tall spike (z 8–11) reaching y 82 while its neighbours sit at 65–67, then **z 12–17 with NO rear
  geometry at all** (the hole), then real geometry declining from z 18. The spike was two symmetric flaps
  (x 4.5…14.0 and −13.8…−6.1, z 8.6–12.7). Deleted `y>67 & 6<z<15` (1,547 v) → re-seal → **gun rear
  81.97 → 67.32**. Left in, they would have put cut B 15 mm too far back and shipped in the GUN.stl.
  **A degenerate max() across every band means read the rows, not the extremum.**
- Knee textbook on the mold's running-min bottom: **−27.204 dead flat from y −13 to +10**, then 11 → −27.688,
  12 → −28.732, continuous → corner **(10.0, −27.204)**. Beavertail = the rearmost SURVIVING local ridge
  **(67.32, z 5.0)** (z 4 → 65.61, z 6 → 65.20) — the real one is inside the torn region, so this cut lands
  slightly lower/more forward than an intact scan would give; owner accepted. → **α 36.36°**, confirmed first
  render. **EXACT@dz=0 first try on both cuts**: A 277,591 v (0.392×src), B at beavertail+6 = y 73.32 →
  236,718 v, both 0/0.
- `boot=0.4`, travel 172.2, 10 passes, **12.0 s** on 477k v — again volume-bound, not vert-bound. Edge ratio
  **2.52** → `repair_pits` valid; pits **518 → 50 → 13**, mean 0.203 mm ≈ 0.5× voxel, 14 extended rejected.
- `smooth_mold(flat_pairs=8, deburr_thr=0.015, deburr_rings=3, deburr_pairs=12)` — eighth gun on the
  anti-orange-peel params. Slide flank p99 **0.0648 → 0.0275**, slide top p99 0.0712 → 0.0400 (max 0.2522 →
  0.0434). 26 verts >0.5 mm clamped → max 0.485, 0/0. **Sixteen-for-sixteen on the clamp.**
  ⚠ My flank probe mask (`|x|>14`) was **EMPTY** and threw an unhelpful `index -1 out of bounds` — the slide
  half-width here is 13.7. **Derive a flank band from the slab's own `max|x|` (`>0.90·hw`), never a constant.**
- Parting line **z_line 23.5** off the band table: mid frame plateau **16.32–16.34** to z 22 → z 23 13.841 →
  z 24 **13.52** slide plateau; rear band identical (17.0–17.4 tang → 13.454). ⚠ The **fwd band is
  structurally uninformative on this gun** — the dust cover shares the slide's half-width (13.47 vs 13.57),
  so there is no step to find there. Slide height 46 − 23.5 = 22.5 mm ✓. Offset verified by REGION bbox:
  slide ±0.400 X / min_y −0.400 / max_z +0.396; frame region **byte-identical (all 0.000)**.
- **⚠ The decimate pre-clean is NOT free — `dissolve_degenerate` opened the SAME 6 nm / 4 bd on a 0/0 source
  that the decimate would have.** So the pinch sliver is latent in the smoothed mold either way. Run the
  pre-clean, but **always follow it with the repair**: bmesh-collect `not e.is_manifold`, delete every face
  linked to those edges' verts (6 edges → 18 faces), `fill_holes(sides=64)` + `edge_face_add` + recalc →
  0/0 → then decimate. Ratio 0.260, 1 iter → **122,995 faces / 123,000 tris / 61,502 v, 0/0, 1 island**.
  BVH vs pre-decimate: p50 0.0003 · **p99 0.0034 · max 0.0072 mm · zero over 0.1**.
- Gaps read correctly per feature: slide flank **+0.467**, frame flank **+0.018 ≈ 0** (below the line,
  correctly untouched), front-Y +0.335, max_z +0.301 (thin sight blade, the 08-04c signature).
- ⚠ **`_SYSTEM/state/` is now DENIED to the scratch-dump habit** — the permission classifier reads it as
  `.claude/state` and blocks `open().write()` through the Blender MCP. Dump stage summaries to
  **`C:\Users\rene\cgs_tmp\`** instead; the read-back-from-disk pattern is unchanged.
- Export (folder confirmed = the standing default), both byte-exact vs `84 + 50·TRIS`, both identity
  `matrix_world`: `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\SIG P320 X-Carry.stl` (6,150,084 B, 61,502 v)
  **+ `SIG P320 X-Carry GUN.stl`** (47,734,884 B, 477,356 v — 46.6 MB, flagged to René for a possible
  LIGHT companion per the 08-08b size rule).
- ⚠ Scan measures **186.86 × 134.20 × 34.63** vs X-Carry's ~203 mm OAL; René ruled it a **truncated X-Carry**
  (the rear/backstrap tear also removes length), not an X-Compact. Named accordingly.
  <!-- @anchor: v1 | failure: (a) I "disproved" a real 20.75deg pitch with bbox = L*cos + H*sin, an identity that only holds for a RECTANGLE — a pistol is an L-shape whose bbox can shrink under rotation, so the check was meaningless and nearly sent me hunting for a non-existent measurement bug; (b) bpy.ops.mesh.select_non_manifold selected nothing for two full rounds because select_mode was not EDGE, making fill_holes look like a no-op; (c) triangulating the n-gon hole-lids that had just achieved 0/0 re-broke the mesh to 247 nm / 156 bd; (d) the banded beavertail probe returned an identical degenerate peak in all three bands because the rear was a flat cap plus two mirrored 14mm slivers, which would have put cut B 15mm too far back; (e) I flagged a 29x30mm beavertail hole as a blocker when its lid faces +Y and the dip swallows it; (f) a constant |x|>14 flank probe mask was empty on a gun with a 13.7mm slide half-width and threw an opaque numpy error; (g) the decimate pre-clean's dissolve_degenerate itself opened 6 nm / 4 bd on a 0/0 source; 2026-08-17 | regression: cgs-mold SKILL.md Session Notes 2026-08-17 — never sanity-check a pose with the rectangle bbox identity; call select_mode(type='EDGE') before select_non_manifold and stop sealing at the n-gon state; judge a scan hole by its lid's FACING relative to the sweep, not its size; read the ROWS when a banded max() is degenerate across every band; derive probe bands from the mesh's own extent; always follow the pre-clean with the delete-pinch + refill repair -->

### 2026-08-08d — **HK P30** (gun only) — **DONE, EXPORTED**; 15-min run, one coordinate-frame trap
- Scan `HK P30_ORIGINAL` 119,460 v / 238,920 f, watertight **0/0**, 1 island, identity matrix, no annotation.
  X 34.41 · Y 179.84 · Z 136.53 = P30 factory spec. Owner said "seems aligned, cross-check yourself" —
  it was: pitch slide-top **−0.055°** (rms 0.144, 0.17 mm over 180 mm, inside its own noise), yaw symmetry
  **−0.008°**, roll +0.181° (slide top) vs +0.059° (symmetry) = 0.05 mm across a 34 mm width. **No correction.**
  Scan edge ratio p99/p1 = **11.7** → `repair_pits` correctly skipped on the scan.
- **★★ THE TRAP: `assemble_gun_solid` TRANSLATES, so any profile measured on the SCAN is in a different
  frame than every later probe.** I profiled the scan first (min z 22.4 in the front band) and then read the
  parting-line width table off `GUN_SOLID` (step at z 22–23) — the two numbers matched, which made `z_line`
  22.5 look like it implied a **41.8 mm slide height**, physically wrong for a P30. Reconciling the frames
  (Δz = −13.65, from the mold's own bottom-profile min −81.54 vs the scan's −67.89) puts the step at scan
  z 36.2 → slide height **28.0 mm** ✓. **Rule: convert or re-measure — never compare a scan-frame number
  against a GUN_SOLID/mold-frame number, even when they agree.** Coincidental agreement is the dangerous case.
- Parting line by the band table (the frame IS wider than the slide here, so no groove probe needed): mid
  frame **16.6–16.7** to z 22 → **14.11** at z 23; rear frame 17.37 (z 15) → 14.41 (z 22) → 13.73 (z 23);
  slide plateau **14.25–14.37** in both, matching the fwd band's slide-only 14.19. Step in the same 1 mm slab
  in both bands → **`z_line` 22.5**. Offset verified by REGION bbox: slide **±0.400** X / min_y −0.399 /
  max_z +0.399; frame region **byte-identical (all 0.000)**.
- Knee off the mold's running-min bottom profile: plateau **−21.423 dead flat from y −23.3 to +6.7**, then
  7.7 → −22.70, 8.7 → −24.39, continuous → corner **(6.7, −21.423)**, the LAST flat bin.
  Beavertail, banded on GUN_SOLID: two local maxima — **z 23 → y 71.34** (frame tang = the beavertail) and
  z 44–45 → 69.29 (the **slide rear face**, 2 mm shy). Took the lower, correct one. → **α 40.10°**,
  owner-confirmed on the first render.
- **EXACT@dz=0 first try on both cuts**: cut A 251,778 v (0.345×src), cut B at `beavertail + 6` = y 77.3 →
  232,860 v, both 0/0. Pits after the sweep **674 → 11 → 3**, mean 0.119 mm.
- `smooth_mold(flat_pairs=8, deburr_thr=0.015, deburr_rings=3, deburr_pairs=12)` — seventh gun on the
  anti-orange-peel params. 29 verts >0.5 mm clamped → max 0.489, 0/0. **Fifteen-for-fifteen on the clamp.**
- Pre-clean exposed **0** non-manifold; decimate ratio 0.264, 1 iter → **123,000 faces / 123,000 tris /
  61,502 v, 0/0**. Mold X 34.428 vs gun 34.408 ≈ 0 — correct, the widest point is the **frame**, below the line.
- ⚠ This Blender build has **no `BLENDER_EEVEE_NEXT`** enum (only `BLENDER_EEVEE` / `BLENDER_WORKBENCH` /
  `CYCLES`) — the 08-08 cut-confirm recipe dies on that assignment. Use `'BLENDER_EEVEE'`; everything else
  (Alpha 0.28, BLENDED, backface culling off, `render.render(write_still=True)`) works unchanged, and the
  translucent overlay read correctly on the FIRST render, no owner reject.
- ⚠ `me.edges[::7]` throws `slice indices must be integers` on a bpy collection — pull indices with
  `foreach_get("vertices", …)` into numpy and slice that instead.
- Export to the standing default (owner pre-specified the folder in the packet, so no ask):
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\HK P30.stl` (6,150,084 B, 61,502 v) **+ `HK P30 GUN.stl`**
  (11,946,084 B, 119,460 v). Both byte-exact vs `84 + 50·TRIS`, both identity `matrix_world`.
  Wall clock end-to-end ≈ 11 min, inside the owner's 15-min cap.
  <!-- @anchor: v1 | failure: a bottom-profile min-z measured on the raw SCAN and a parting-line width table measured on GUN_SOLID returned the SAME number (22.4 / 22.5) in two frames 13.65mm apart, and the coincidence made a correct z_line look like a physically impossible 41.8mm slide height — I nearly moved it; 2026-08-08d | regression: cgs-mold SKILL.md Session Notes 2026-08-08d — never compare a scan-frame measurement against a GUN_SOLID/mold-frame one; re-measure in the target frame, and sanity-check z_line against the gun's real slide height -->

### 2026-08-08c — **GLOCK 19 GEN5 + TLR-7 X** — **DONE, EXPORTED**; a plane fit across a STEP fakes a pose error
- Scan `GLOCK 19 TLR-7 X - GUN` 151,620 v / 304,922 f, watertight **0/0**, identity matrix, canonical pose,
  no annotation. 3 islands → 1 kept (7 v + 4 v specks). Gun and light welded into one island. Dims X 34.19 ·
  Y 185.13 · Z 128.58 — **identical to the bare G19 Gen5 of 07-30b**, because a TLR-7 X neither reaches past
  the muzzle nor below the grip. **Matching bbox is NOT evidence the light is absent** — render before
  concluding; `front_feature_z 39.2` and the side view both confirmed the light is there.
  ⚠ Scan edge ratio p99/p1 = **84.7** (p1 0.027 / p50 0.546 / p99 2.28) → `repair_pits` correctly SKIPPED
  on the scan; it only ran post-sweep where the ratio is 2.52.
- **★★ THE LESSON: a least-squares plane fit over a band that CONTAINS A STEP reports the step as SLOPE.**
  I nearly applied a −0.207° pitch correction that did not exist. The Glock slide top has a **0.25 mm milled
  recess from y −46 to −21** (median z 56.29 vs 56.55 either side). My `slide_top_fwd` band (y −105…−15)
  straddled that recess, so the fit read the drop as a tilt — and `light_under` (−0.191°, only a 30 mm
  baseline on a curved part) appeared to corroborate it. **Fix = PROFILE the surface before FITTING it:**
  median z vs y in 5 mm bins. That showed the recess, and the two flats either side read **−0.072°** and
  **+0.080°** — opposite signs, total variation 0.075 mm, i.e. the slide top is slightly dished and no
  sub-band is authoritative. Full-length fit: **pitch −0.032°** (0.10 mm over 185 mm) = nothing to correct.
  Sight line +0.026°, symmetry yaw +0.038°, roll ≈0 on all datums. **No pose correction.**
  Two more datums discarded on their own evidence, per the 08-05 rms rule: `frame_dustcover_under` −1.295°
  (rms 0.327) and `light_bezel_under` −3.266° (rms 0.397) — both curved surfaces, not planes.
- **⚠ The beavertail probe's `max()` returned the GRIP HEEL again** (y 92.47 at z −40) — third occurrence of
  the 08-04c trap, and here the heel is the global rearmost by 4.6 mm. The rows show the real shape: y falls
  monotonically from 92.47 (z −40) to a **minimum 70.59 at z 8**, rises to the beavertail ridge, then settles
  onto the 84.4–84.6 slide rear. Re-run banded to **z 14…40** at 1 mm → **(87.85, z 26.0)**, identical at
  bands 6/10/14. **Always bound the z window to the tang band; a global max over the rear silhouette is the
  heel on any gun with a grip.**
- Knee from the mold's running-min bottom profile — note it has **TWO plateaus**, which is the light's
  signature: −10.37 from y −40 to −35 (the **TLR-7 X underside**), a 1.9 mm step at y −34 to −12.2 (the
  **frame/trigger-guard bottom** taking over), a slow decline to −13.9, flat y 6…23, then 24 → −15.21,
  25 → −17.41, continuous. Corner = the last flat bin = **(23.0, −13.916)**. → **α 37.59°**, owner-confirmed.
  (For reference the bare G19 of 07-30b confirmed 39.87°; the light does not change the knee, the different
  Z-centering does.) **EXACT@dz=0 first try on both cuts**: cut A 263,023 v (0.352×src), cut B at
  `beavertail + 6` = y 93.8 → 242,119 v, both 0/0.
- **⚠ The 08-08b 0.1 mm groove probe is USELESS on a coarse scan — know which parting-line tool to reach for.**
  This mesh has p50 0.55 mm edges, so 0.1 mm z-bins are undersampled and returned ~35 spurious "dips" per
  band with no common z. **The two tools are complementary, chosen by whether a width STEP exists:**
  · frame measurably wider than slide → the **band table** (1 mm slabs, `max|x|` per Y band) — used here:
    frame **14.7–15.2** to z 29, slide **12.85–12.96** from z 32, transition identical in fwd/mid/rear →
    **`z_line` 30.5**; slide height 53.4 − 30.5 = 22.9 mm ✓ for a G19. The ctr band's 16.3–17.0 is the
    beavertail tang, above the line, correctly ignored (08-07 rule).
  · frame flush with slide AND a dense uniform mesh → the **0.1 mm groove probe** (08-08b, Strike One).
  Offset verified by REGION bbox: slide ±0.400 X, min_y −0.400; frame region **byte-identical (all 0.000)**.
- `smooth_mold(flat_pairs=8, deburr_thr=0.015, deburr_rings=3, deburr_pairs=12)` — sixth gun on the
  anti-orange-peel params. Slide-flank p99 **0.0782 → 0.0201**, light body **0.0604 → 0.0254**. 21 verts
  >0.5 mm clamped → max 0.498, 0/0. **Fourteen-for-fourteen on the clamp.** Pits: 1→0 after cuts, 3→0 after
  smooth, 0 after offset.
- Pre-clean exposed **0** non-manifold; decimate ratio 0.254, 1 iter → **123,000 faces / 123,000 tris /
  61,496 v, 0/0, 1 island**. BVH vs pre-decimate: p50 0.0003 · **p99 0.0038 · max 0.0067 mm · zero over 0.1**.
  Gaps: slide flank mold 13.411 vs gun 12.917 = **+0.495**; frame flank 15.035 vs 15.011 = **+0.024 ≈ 0**
  (below the line, correctly untouched); front-Y **+0.419**; max_z **+0.443**. ⚠ Do NOT compare the mold's
  z-min against the gun's — the gun's is the grip heel, which cut A removes.
- Export (folder confirmed = the standing default), both byte-exact vs `84 + 50·TRIS`:
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\GLOCK 19 TLR-7 X.stl` (6,150,084 B, 61,496 v) **+
  `GLOCK 19 TLR-7 X GUN.stl`** (15,245,184 B, 151,606 v). Both identity `matrix_world`. 14.9 MB is well
  under the ~500k-vert threshold, so no LIGHT companion was needed (contrast 08-08b).
- Cut-confirm render: the EEVEE translucent overlay (pipeline step 3) worked first time, no rejection.
  <!-- @anchor: v1 | failure: (a) a least-squares slide-top plane fit reported a −0.207° pitch error that does not exist, because the band straddled a 0.25mm milled recess and the fit read the STEP as SLOPE — a 30mm-baseline light-underside datum appeared to corroborate it, and I was one step from rotating the gun on an artefact; (b) the banded beavertail probe's max() returned the grip heel for the third time (08-04c, 08-08b, here), the heel being the global rearmost by 4.6mm; (c) the 08-08b 0.1mm groove probe returned ~35 spurious dips per band on a coarse scan (p50 edge 0.55mm) and would have produced a garbage z_line if trusted; 2026-08-08c | regression: cgs-mold SKILL.md Session Notes 2026-08-08c — PROFILE a surface (median z vs y in 5mm bins) before FITTING a plane to it, and discard any datum whose baseline is short or whose rms is several times the others'; bound the beavertail z-window to the tang band, never take a global max over the rear silhouette; choose the parting-line probe by whether a width STEP exists (band table) or not (groove probe, dense meshes only) -->

### 2026-08-08b — **ARSENAL STRIKE ONE** (Revint, gun only) — **DONE, EXPORTED**; a parting line max|x| cannot find
- Scan `ARSENAL STRIKE ONE - ORIGINAL` **1,342,862 v / 2,685,736 f** — by far the heaviest this pipeline has
  run (previous max 470k) — watertight **0/0, 1 island**, no annotation. ⚠ `matrix_world` was a **90° Z
  rotation**, not identity: apply it (`transform_apply`) BEFORE anything else, or every coordinate you
  measure is in a different frame than the one the engine works in. After applying: X 34.12 · Y 214.62 ·
  Z 146.73, canonical (muzzle −Y, grip −Z), = Strike One factory spec.
- **★ Vert count is NOT the cost driver — the voxel stages are volume-bound.** `assemble_gun_solid` 8.8 s,
  `sweep_dip(boot=0.4)` **10.0 s** producing 944,356 v at 0/0, travel 214.6 full span, 11 passes. That is
  FASTER than the 192k-vert FN earlier the same day (13.4 s) because the swept envelope is smaller. Do not
  pre-decimate a heavy scan out of fear; measure first. Edge gate p99/p1 **2.60** → `repair_pits` valid;
  pits converged **339 → 44 → 10**, mean 0.232 mm ≈ 0.6× voxel.
- **★★ The parting line is NOT findable with `max|x|` on this gun — frame and slide are the SAME width.**
  The three-Y-band recipe gave transitions at z 32.5 / 35.5 / 36.5 (4 mm spread), so per 08-05 I went to
  the horizontal cross-section — and that showed WHY the bands disagree: at EVERY z from 31 to 48 the
  half-width is a flat **14.05–14.35** along the whole length. The only bulges are LOCAL: the takedown
  lever (y −50…−30, z≈31) and the thumb ledge / frame tang (y 5…25, up to z 36). There is no width step to
  find, because the Strike One's slide is flush with its frame.
  **THE PROBE THAT WORKS: a fine groove scan.** `max|x|` vs z in **0.1 mm** bins, run in three separate Y
  bands, then take the local minima. The slide/frame seam is a real recess of only **0.05–0.06 mm** — far
  too small for 0.25 or 1 mm bins. It appeared at **z 32.5 in ALL THREE bands** (fwd y −105…−75, mid
  −70…−55, rear +30…+60); the mid band's other dips (z 21.6–25.8) appear in one band only and are frame
  features. **A seam is the dip common to every band; a feature is a dip in one.** Cross-check: slide top
  50.19 − 32.5 = 17.7 mm slide height, right for this low-bore gun; and the frame tang bulge (z ≤ 36) sits
  ABOVE the line, which is where a tang belongs (08-07 rule), so it does not contradict the answer.
- **★ The "damaged" front sight is a FIBER-OPTIC sight — measure before reporting a defect.** The side
  render shows a lumpy saddle-topped blade with ragged edges; it looks broken. `zmax vs y` in 1 mm bins:
  two retaining peaks at **54.03** (y −126) and **54.25** (y −117) with a **52.70** trough between them,
  and the blade is only 3 mm wide (`zmax vs x`: 53.85–54.25 at x −2…+1, dropping to 48.5 outside). That is
  a fiber rod channel with the rod absent/transparent to the scanner — real geometry. The ragged outline is
  ordinary scan noise on a thin feature. The +Y sweep fills the channel anyway (the front peak sweeps
  rearward over the trough), so the mold gets a clean sight channel. Rear sight measured clean: proper
  3 mm notch, shoulders 55.67, floor 52.5. **Nothing to fix — do not send the scan back over this.**
- Pose measured, **not corrected**: pitch slide-top-fwd −0.181° (rms 0.045) vs slide-top-rear −0.059°
  (rms 0.064) — same sign but 3× apart, i.e. the slide's own step is not parallel to itself; rail underside
  +0.117° discarded on rms 0.154. roll +0.019 / −0.208 / symmetry −0.090 → no consensus. yaw symmetry
  −0.087° vs sight-blade/notch centres +0.041° → opposite.
- Knee on the mold's running-min bottom profile: plateau ≈−10.2 flat from y −36 to **+9**, then 10 →
  −11.41, 11 → −13.26, continuous → corner **(9.0, −10.192)**. Beavertail on GUN_SOLID, banded probe:
  **(82.32, z 28.0)**, identical at bands 6/10/14, receding to 75.7 above and 65.6 below. → **α 33.32°**,
  owner-confirmed. **EXACT@dz=0 first try on both cuts**: cut A 289,465 v (0.307×src), cut B at
  `beavertail + 6` = y 88.3 → 263,020 v, both 0/0.
- `smooth_mold(flat_pairs=8, deburr_thr=0.015, deburr_rings=3, deburr_pairs=12)` — fifth gun on the
  anti-orange-peel params. Slide-flank p99 **0.0670 → 0.0229**, frame p99 0.0858 → 0.0411. 21 verts >0.5 mm
  clamped → max 0.478, 0/0. **Thirteen-for-thirteen on the clamp.**
- Offset `z_line 32.5`, 118,611 region verts; frame region **byte-identical (all 0.000)**. ⚠ The slide
  region's `maxx` delta read only **+0.316** while `minx` read −0.400 — NOT a bug: the region's extreme
  +X vertex is on the rounded frame-tang corner (y 5…25), whose normal is not axis-aligned, so a 0.4 mm
  normal offset projects to less in X. **Verify with a flat-flank SLAB against the gun, not the region
  bbox extremes**: slide flank (y −90…−70, z 38…46) mold 14.733 vs gun 14.232 = **+0.501** (0.4 + voxel);
  frame flank (same y, z 16…26) 14.200 vs 14.116 = **+0.084 ≈ 0**, correctly untouched; front-Y +0.384;
  max_z +0.404.
- Pre-clean exposed **0** non-manifold this time; decimate ratio 0.234, 1 iter → **123,000 faces /
  123,000 tris / 61,502 v, 0/0, 1 island**. BVH vs pre-decimate: p50 0.0005 · **p99 0.0047 · max
  0.0079 mm · zero over 0.1**. Raking close-up clean.
- **⚠ A 1.34 M-vert scan makes a 134 MB `GUN.stl`** (84 + 50·2,685,716). That is legitimate but Shapr3D
  may choke on it. Flagged to René, who asked for **both**: the full-res pair plus a decimated companion
  `<name> GUN LIGHT.stl` (125,000 tris, 6.25 MB, collapse — max deviation from full-res **0.056 mm**,
  bbox within 0.013 mm, identity matrix). **New habit: when the scan is over ~500k verts, report the
  GUN.stl size and offer the LIGHT companion rather than shipping a 100 MB+ file silently.**
- Export (folder confirmed = the standing default), all three byte-exact vs `84 + 50·TRIS`:
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\ARSENAL STRIKE ONE.stl` (6,150,084 B, 61,502 v) ·
  `ARSENAL STRIKE ONE GUN.stl` (134,285,884 B, 1,342,852 v) · `ARSENAL STRIKE ONE GUN LIGHT.stl`
  (6,250,084 B, 62,494 v). All identity `matrix_world`.
- ⚠ Render framing: `ortho_scale` maps to the **LONGER resolution axis**, not to width. A portrait
  1200×1400 top view with `ortho = max(ext_x, ext_y·w/h)` silently cropped the gun. Either always render
  landscape, or compute against the long axis explicitly.
  <!-- @anchor: v1 | failure: (a) the max|x| parting-line recipe (both the three-band and horizontal-cross-section forms) CANNOT find the slide/frame seam on a gun whose slide is flush with its frame — the half-width is a flat 14.05-14.35 at every z from 31 to 48, and the three bands disagreed by 4mm on pure noise; (b) the front sight looks broken in every render (saddle top, ragged edges) and is actually an intact fiber-optic sight — reporting it as scan damage would have sent a good scan back; (c) a 1.34M-vert scan silently produced a 134MB GUN.stl that Shapr3D may not import; (d) ortho_scale maps to the longer resolution axis, so a portrait top view cropped the subject; 2026-08-08b | regression: cgs-mold SKILL.md Session Notes 2026-08-08b — find the parting line with a 0.1mm-bin groove scan and take the dip COMMON TO ALL Y BANDS; measure a suspicious sight (zmax vs y and vs x) before calling it damage; report GUN.stl size and offer a LIGHT companion above ~500k verts; verify the offset with a flat-flank slab against the gun, not region-bbox extremes -->

### 2026-08-08 — FN 510/545 + COMP + **TLR-1 HL-X** — **DONE, EXPORTED**; the cut-confirm render rule
- Scan `FN 510 + 545 - TLR-1 HL-X` 192,607 v / 385,540 f, **0 boundary**, 1 non-manifold edge, 3 islands
  (main + 57 v + 4 v specks), canonical pose. Same FN frame as 08-07 (Y-span **229.745**, identical) but a
  different scan: light fitted, **optic cut absent** — the slide top runs dead-flat 67.9–68.2 from y −144 to
  −18 with no recess. The two blocks at z 78.2/78.6 (half-width ≤8.5) are suppressor-height **irons**, and
  the z 44.3 gap at y −154…−148 is the **comp port**, not a hole. Nothing to cap; contrast 08-07.
- **★★ OWNER REJECT ×3 on the cut-confirm render — now a standing rule (pipeline step 3).** I asked the
  α question with (1) a mold-only render, (2) the gun with a red removed-region tint, (3) the gun with a
  cyan mold **outline**. All three rejected: *"I cannot see the gun"* → *"now I cannot see the mold
  anymore"* → *"Are you stupid!? I need to see the gun AND the mold"*. Root cause: the mold is the gun's
  swept envelope, so it **contains** the gun — from a side ortho either one hides the other, and an
  outline over the gun reads as no mold at all. **THE FIX = half-section + one solid pass:**
  boolean-difference a big cube covering x > 0 off a *copy* of the cut mold (`MOLD_HALF`, section on the
  X=0 seam plane), then render `MOLD_HALF` + `GUN_SOLID` in ONE Workbench pass with
  `scene.display.shading.color_type='OBJECT'` and contrasting `ob.color` (gun warm tan, mold pale blue) so
  occlusion is real depth-sorting, not compositing. Frame on the **union** of both bboxes (else the grip
  and magazine crop out — that happened too). Then composite the cut lines on top from the camera mapping:
  `ppm = res_x/ortho_scale`, screen-right = +Y, screen-up = +Z at rx=90/rz=90, `cy/cz` = the camera's own
  y/z since `cam.location = c + (dist,0,0)`. Owner confirmed 38.5° on the first render that did this.
  ⚠ Two sub-traps hit on the way: a silhouette mask from **colour difference** catches the render's
  background **dithering** (speckle everywhere) — set `render.film_transparent=True` and mask on
  **alpha > 0.5** instead; and `_dup` + boolean leaves the display copy in the scene, so delete
  `MOLD_HALF` before the pipeline continues or it rides into the export selection.
- **⚠ I called a framing miss "the wrong object" and was wrong.** A first render overflowed the frame and
  I invoked the 08-07 rule (extent < frame ⇒ wrong object) — but the visibility dump showed only the
  target visible, and the real cause was that `ortho_scale` needs the **aspect-corrected** requirement,
  `max(ext_y, ext_z·res_x/res_y)·margin`. Keep the 08-07 rule, but **run the visibility dump before
  invoking it** (`hide_viewport / hide_render / hide_get / visible_get` per mesh) — it settles it in one call.
- Pose: **measured, NOT corrected.** pitch slide-top-mid **−0.133°** (rms 0.146) vs slide-top-fwd **+0.119°**
  (rms 0.053) vs sight-line +0.112° → 2-vs-1 and the magnitude (0.47 mm over 230 mm) sits inside the mid
  fit's own noise. roll +0.598 vs −0.588 vs symmetry −0.123 → opposite. yaw symmetry −0.102° vs
  sight-**notch** centres +0.035° → opposite. Per the 08-04c rule, no axis had agreeing signs worth acting on.
- `assemble_gun_solid`: 3 → 1 island, 2 specks dropped, `sight_x_post −0.0` / `mass_x_post 0.341`,
  **`front_feature_z 41.0`** — the **comp** drives the front, not the light (the TLR-1 bezel stops short).
- `sweep_dip(boot=0.4)`: travel 229.7 full span, 11 passes, 1,233,280 v, **13.4 s**, 0/0. Edge gate
  **p99/p1 = 2.64** (p1 0.176 / med 0.400 / p99 0.464) → well inside the ≲3 band, `repair_pits` valid.
  Pits converged **726 → 86 → 7**, mean move 0.230 mm ≈ 0.6× voxel, 33 extended clusters rejected.
- **Knee is textbook on the mold's running-min bottom profile:** −10.888 dead flat from y −30 to **+22**,
  then 23 → −11.8, 24 → −14.3, continuous. Corner = **(22.0, −10.888)**, the LAST flat bin.
  Beavertail on GUN_SOLID, banded probe: **(88.59, 32.0)**, identical at bands 6/10/14; it recedes both
  above (z 34 → 87.6) and below (z 28 → 87.4), and the low-z climb back to y 100.4 is the **extended-mag
  basepad** — the 08-07 trap, correctly excluded. → **α 38.46°**, owner-confirmed.
- **EXACT@dz=0 first try on both cuts**, no nudge ladder. Cut A 400,597 v (**0.325×src**) 0/0; cut B keyed
  off the **beavertail** (`cut_tail(gun_rear=88.59, margin=6)` → y 94.6), not `gun_rear` — 369,864 v 0/0.
- `smooth_mold(flat_pairs=8, deburr_thr=0.015, deburr_rings=3, deburr_pairs=12)` — fourth gun on the
  anti-orange-peel params. Slide-flank Laplacian p99 **0.0946 → 0.0501**, light body **0.0869 → 0.0255**
  (max 0.258 → 0.158). 67 verts >0.5 mm clamped → max 0.499, 0/0. **Twelve-for-twelve on the clamp.**
  sharp50 7880 → 2391 and sharp70 3175 → 1434 (−55 %) — a big drop that the raking close-up shows is
  quantisation corners, not geometry: panel edges, the rail groove and the takedown lever all crisp.
- **Parting line `z_line` 40.0, off the horizontal cross-section (1 mm slabs, ±0.25).** mid/ctr/rear read
  16.7/16.65/18.75 at z 39 and collapse to a uniform **14.6** at z 41 → midpoint 40.0. ⚠ The **fwd** band
  reads 15.0–15.4 *above* the line because the **comp is wider than the slide** — same signature as 08-07;
  the front band is structurally unusable on a comped gun. Offset verified by REGION bbox: slide ±0.400 X,
  max_z +0.400, min_y −0.400; frame region **byte-identical (all 0.000)**.
- **Decimate needed the pre-clean and it earned its keep:** triangulate → `remove_doubles(1e-4)` →
  `dissolve_degenerate(2e-4)` exposed **1** non-manifold edge (the one the scan carried in all along,
  invisible at 0 boundary) → delete linked faces+verts → `holes_fill` on 5 boundary edges → recalc →
  decimate ratio 0.166, 1 iter → **122,998 faces / 123,000 tris / 61,498 v, 0/0, 1 island**, no post-hoc
  repair. Running the pre-clean *preemptively* is cheaper than diagnosing a 6/4 result afterwards.
  BVH deviation vs the pre-decimate mesh (61,498 samples): p50 0.0007 · **p99 0.0062 · max 0.0169 mm ·
  zero over 0.1 mm**.
- **mold/gun gaps, three different right answers again:** front-Y **+0.378** (the comp is front-most at
  z 45.4, above `z_line` → offset applies), max_z **+0.428** (front sight), max|x| **−0.041 ≈ 0** (the
  widest point is the **frame** at 18.9 half-width, z ≈ 38, BELOW the line → correctly not offset).
- Export (folder confirmed with René = the standing default):
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\FN 510 & 545 COMP TLR-1 HL-X.stl` (6,150,084 B, 61,498 v)
  **+ `FN 510 & 545 COMP TLR-1 HL-X GUN.stl`** (19,271,284 B, 192,545 v). Both identity `matrix_world`;
  both byte-verified against `84 + 50·TRIS` (mold mixed quad/tri: 122,998 faces → 123,000 tris).
- ⚠ MCP `execute_blender_code` again returned `"Code executed successfully: "` with **stdout dropped**
  (fifth session running) — every stage dumped to `_SYSTEM/state/_fn2_*.json` and read back from disk.
  Also: numpy `lstsq` residual arrays are empty for full-rank fits, so compute rms as `A@c − z` yourself;
  and `BVHTree.FromObject` needs a depsgraph — `FromBMesh` is the reliable path.
  <!-- @anchor: v1 | failure: (a) OWNER REJECT x3 on the cut-confirm render — mold-only, then gun-with-tint, then gun-with-mold-outline were all unreadable because the mold ENVELOPES the gun, so either body hides the other and an outline reads as no mold at all ("Are you stupid!? I need to see the gun AND the mold"); (b) an alpha-free silhouette mask built from colour difference caught the render background's dithering and produced a speckled composite; (c) I invoked the 08-07 "framing contradiction = wrong object" rule on what was actually an aspect-uncorrected ortho_scale; (d) decimate-collapse would have inherited the scan's 1 carried-in non-manifold edge had the pre-clean not run; 2026-08-08 | regression: cgs-mold SKILL.md Session Notes 2026-08-08 — half-section the mold at X=0 and render it WITH GUN_SOLID in one Workbench OBJECT-colour pass, framed on the union bbox, cut lines composited from ppm = res_x/ortho_scale; mask silhouettes on alpha with film_transparent=True; dump per-mesh visibility before invoking the wrong-object rule; run the sliver pre-clean preemptively before every decimate; Track-B memory feedback-cut-confirm-render-gun-and-mold -->

### 2026-08-07 — FN 510/545 + COMP, **NO OPTIC (hand-EDITED scan)** — **DONE, EXPORTED**; new rule on capping a deleted optic
- Scan `FN510 & 545_WITH COMP NO OPTIC - EDITED` 132,458 v / 264,538 f, canonical pose, **but 590 boundary
  edges** — René had deleted the optic by hand. Grouped into loops (08-03b rule): **one 568-edge loop**
  at x −12.4…12.1, y −8.6…42.4 = the **slide top is gone over the optic cut**; the top-down render looks
  straight into the barrel. Plus 3 trivial loops (3–5 edges) and a 12-vert speck island (auto-dropped).
- **★ A "fix the SCAN vs cap it here" call is the owner's, but MEASURE THE RIM FIRST — the rim height is
  NOT automatically a recess.** I first offered "cap at the forward slide crown z 54.05" vs "cap at the
  rim z 53.01, keeping the ~1 mm milled recess" and René picked 54.05. That framing was **wrong**: the
  rim runs a dead-flat **53.01 from y −8 to +40** and the optic-region `max|x|` at z 53 is **12.39** —
  i.e. the rim IS the milled shoulder at **FULL slide width**, while the rounded slide forward of the cut
  is only **10.88 half-width at the same z** and crowns to 54.05 only within |x| ≤ 6.5. So 53.01 = FLUSH
  (where the cover plate sits) and 54.05 would have parked a **1.04 mm proud pad, 48 × 25 mm**, on the
  slide top with its edges standing above the surrounding rails. Re-asked with the measurement; René
  switched to 53.01. **The probe that decides it: `max|x|` vs z inside the opening's Y band vs the same
  z forward of it — if the rim is as wide as the slide, the rim is the shoulder, not a pocket floor.**
- The cap itself was free: `assemble_gun_solid`'s `holes_fill` on a rim that is planar over 48 of its
  51 mm produced a clean flat lid, rear sight untouched, **0/0, 1 island** — no plug solid needed. Only
  87 of 568 rim verts sit above 54.05 and they are all the rear-sight block wall at y ≈ 40.
- **⚠ Walked straight into the 07-28c render trap again: `render.opengl` ignored `hide_render`.** I set
  `hide_render=True` on everything but the target and left `hide_viewport=False`; three renders came back
  showing the **uncut 460 mm sweep** and read as "camera framing is broken". The tell was arithmetic: the
  object's projected extent (173 mm) could not exceed the frame (257 mm), yet it ran off the edge — *a
  framing contradiction means you are rendering the wrong object*, not a wrong camera. Fix = set
  `hide_viewport` AND `hide_set` too. Also worth having: a `frame()` helper that computes `ortho_scale`
  from the projected extent (`|R|·ext`, `|U|·ext` with R/U the screen axes) instead of eyeballing.
- Pose: pitch corrected, roll/yaw not. slide-top-fwd plane **+0.230°** (rms 0.055, n 233), sight line
  **+0.144°**, rail underside +1.89° (rms 0.277 — weak but same sign) → all three positive → rotate
  `θ = −m = +0.004021 rad` about X; residual `dz_dy` 0.00054. roll: symmetry −0.088° vs **rear-sight
  shoulders −0.059°** vs slide top +0.328° → signs disagree → left alone. yaw: symmetry −0.095° vs sight
  line ≈0 → left alone. ⚠ The naive sight-line yaw read **+2.00°** because `argmax(z)` in the rear band
  lands on ONE shoulder (x 5.73), not the notch centre — use the notch, per the rear-sight roll datum.
- **⚠ An extended magazine makes the global rearmost vert the BASEPAD, not the beavertail.** `gun_rear_y`
  = 69.76 = the mag floorplate at z −105. The beavertail is the local ridge in the rear silhouette:
  **y 57.966 at z 36.0** (1 mm bins; recedes above and below). Cut B must key off THAT, not `gun_rear`:
  `cut_tail(gun_rear=57.966, margin=6)` → y 64.0. Using `gun_rear+6` would have left ~12 mm of dead tail.
- Knee from the MOLD's own bottom profile (1 mm bins, full gun region): plateau **−3.532 dead flat from
  y −53.98 to −8.98**, then −7.98 → −5.036 and continuously down. Corner = **(−8.98, −3.532)**, the LAST
  flat bin. → with −20/−10 → **α 36.5°**, owner-confirmed ("passt — fertig machen").
- **EXACT@dz=0 first try on BOTH cuts.** Cut A 331,224 v (**0.282×src** — under the old 0.4 guard, over
  the relaxed 0.25), cut B 298,238 v, both 0/0. No nudge ladder needed.
- `boot=0.4`, 11 log-doubling passes, travel 229.7, **11.0 s** on 132k v. Edge-length gate after the
  sweep **p99/p1 = 3.39** (p1 0.137 / med 0.400 / p99 0.465) — slightly over the ≲3 guideline, but the
  convergence signature was healthy (**601 → 77 → 16 → 6 → 4 → 3 → 0**, mean move 0.235 mm ≈ 0.6× voxel,
  `extended_rejected` steady at 27), so `repair_pits` was valid. Treat 3.39 with a monotone fall as
  in-band; it is divergence, not the ratio alone, that condemns a run.
- `smooth_mold(flat_pairs=8, deburr_thr=0.015, deburr_rings=3, deburr_pairs=12)` — third gun on the
  anti-orange-peel params. Slide-flank Laplacian p99 **0.0864 → 0.0232**, slide-top p99 0.1078 → 0.0595.
  70 verts >0.5 mm clamped → max 0.490, 0/0. **Eleven-for-eleven on the clamp.** sharp50 5644 → 2240 and
  sharp70 3046 → 1531 (−50 %) — again a big drop that the raking close-up shows is NOT lost geometry.
- **Parting line `z_line` 43.6, read off the fine horizontal cross-section, NOT the three bands.** The
  front band is unusable here (the comp is wider than the slide, so `max|x|` RISES above the frame:
  14.1 → 15.5 between z 43.5 and 45.8). 0.2 mm cross-sections: fwd/mid/tang all collapse to 14.0–14.2 at
  **z 43.6**, while the rear band (y −20…20) holds **18.1 until z 44.0** — that is the beavertail tang,
  which belongs ABOVE the line, so it does not move the answer. Offset verified by REGION bbox: slide
  min_x −0.400 / max|x| +0.384 / min_y −0.400 / max_z +0.400; frame region **byte-identical (all 0.000)**.
- **Decimate produced 6 non-manifold / 4 boundary from a 0/0 source — the 07-30b pinch sliver, second
  occurrence.** The documented pre-clean fixed it first try: triangulate → `remove_doubles(1e-4)` →
  `dissolve_degenerate(2e-4)` (exposed **2** non-manifold edges) → delete the 23 faces linked to those
  edges *and their verts* → `holes_fill(sides=64)` on the 15 resulting boundary edges → recalc normals →
  decimate. Final **122,992 faces / 123,000 tris / 61,502 v, 0/0, 1 island**. BVH deviation vs the
  pre-decimate mesh (61,502 samples): p50 0.0006 · **p99 0.0058 · max 0.0125 mm · zero over 0.1 mm**.
- **mold/gun gaps read correctly per feature:** front-Y **+0.378** (the COMP is front-most and sits at
  z 45.4, above `z_line` → it gets the offset), max_z **+0.406** (front sight), min-X **−0.033 ≈ 0** (the
  widest point is the FRAME at 18.7 half-width, z ≈ 43, BELOW the line → correctly not offset). Three
  different right answers on one gun — always ask which feature owns the extremum before reading a gap.
- Export (folder confirmed with René = the standing default):
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\FN510 & 545 WITH COMP NO OPTIC.stl` (6,150,084 B, 61,502 v)
  **+ `FN510 & 545 WITH COMP NO OPTIC GUN.stl`** (13,254,984 B, 132,446 v). Both identity `matrix_world`;
  both byte-verified against `84 + 50·TRIS` (the mold is mixed quad/tri: 122,992 faces → 123,000 tris).
- ⚠ MCP `execute_blender_code` again returned `"Code executed successfully: "` with **stdout dropped**
  (fourth session running). Every stage dumped to `_SYSTEM/state/_fn_*.json` and was read back from disk.
  Also: a stray `</code>` fence pasted into the first call died on `invalid syntax` — send bare Python.
  <!-- @anchor: v1 | failure: (a) I offered the owner a cap-height choice built on an unmeasured assumption — "rim z 53.01 = a 1mm recess" — when the rim is actually the milled optic-cut shoulder at FULL slide width, so the option he picked (54.05) would have shipped a 1.04mm proud 48x25mm pad on the slide top; (b) render.opengl ignored hide_render for the third time in this skill's history, silently rendering the uncut 460mm sweep and reading as a camera-framing bug; (c) a sight-line yaw datum returned +2.00deg because argmax(z) in the rear band lands on one rear-sight shoulder instead of the notch centre; (d) with an extended magazine, gun_rear_y is the basepad, so cut_tail(gun_rear+6) would have left ~12mm of dead tail behind the beavertail; (e) decimate-collapse produced 6 non-manifold / 4 boundary from a 0/0 source (2nd occurrence of the 07-30b pinch sliver); 2026-08-07 | regression: cgs-mold SKILL.md Session Notes 2026-08-07 — measure max|x| inside vs forward of an opening before choosing a cap height; set hide_viewport AND hide_set before every render and treat a framing contradiction as the wrong object; take yaw from the rear-sight NOTCH centre; key cut B off the measured beavertail ridge, never gun_rear, when a magazine is in the scan; run the triangulate/remove_doubles/dissolve_degenerate/delete-pinch/holes_fill pre-clean BEFORE decimating -->

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
