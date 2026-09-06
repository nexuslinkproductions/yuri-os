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

**Failure-anchored rules (2026-06-29 → 2026-08-20). Rule 6 outranks the rest — read it first.**
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

6. ★★★ **NEVER GUESS. MEASURE, OR DON'T SAY IT.** Owner directive 2026-08-20d, given as a standing rule
   after four rejects in one day: *"STOP wasting my time and STOP guessing and START to check your work
   BEFORE you submit files!!! ... NEVER GUESS."* This outranks every convenience in this file.
   **THE THREE HARD OBLIGATIONS:**
   a. **No claim without a number.** Any statement about the mold — "clean", "correct", "real geometry",
      "that's scan detail", "negligible" — requires a measurement printed in the same breath. If you did
      not measure it, say "not measured" and measure it.
   b. **`assert preflight_mold(...)["ok"]` before EVERY export** (pipeline step 5f). No exceptions, no
      "it looked fine in the render". The gate runs in ~5 s; four rejected molds cost hours.
   c. **A render is a HYPOTHESIS, not evidence.** Looking at a picture and concluding is guessing. Use
      the render to LOCATE, then measure that coordinate. The reverse — measuring, then confirming with
      a render — is the correct order and both are required before shipping.
   **ANTI-RATIONALIZATION TABLE** — every excuse below was used on a real defect that then shipped:

   | Excuse | Reality | Failure anchor |
   |---|---|---|
   | "Those dots are the frame's stippling — real scan detail." | The sweep is a running MAX; a swept flank cannot hold a concavity. It was a manufactured speck field. | 08-17b OWNER REJECT |
   | "The mean is 0.207 mm, well under the voxel — this stage is healthy." | The MEAN hid a 2.082 mm outlier that gouged the light. Report max, not mean. | 08-20b OWNER REJECT |
   | "The gate passed on the pre-decimate mesh, so the export is fine." | Decimate re-created 4 hotspot regions and visible faceting. Gate the mesh you actually WRITE. | 08-20b OWNER REJECT |
   | "Big cluster ⇒ real crease, leave it." | A 4.08 mm slot on a flank is a defect; the size limit was arbitrary. Flanks get `max_diag_flank`. | 08-20d OWNER REJECT |
   | "Depth is under threshold now, it's done." | A residual seam still rendered as a black line. Check depth AND normals AND a cavity render. | 08-20d |
   | "It's only 0.055 mm, that's below the noise floor." | Possibly true — but SAY the number and let René rule. Don't decide silently. | 08-20d |
   | "The nearest-point normal says it's 10.7 mm out." | A normal-sign probe LIES in concave pockets. Ray-parity said 1.63 mm. Confirm with parity. | 08-20b |
   | "The gun has a feature there, so leave the mold alone." | The arbiter read grip STIPPLE as a feature. Use signal-to-noise, and check the gun with a probe, not an assumption. | 08-20c |

   **RED FLAGS — stop and measure the moment you catch yourself writing any of these:** "should be",
   "probably", "looks like", "I'd expect", "presumably", "that's just", "essentially", "basically fine".
<!-- @anchor: v1 | failure: four owner rejects on one gun in one day (2026-08-20 / 08-20b / 08-20c / 08-20d) — the light-region gouge, the offset that left the light at zero clearance, the 1.37mm flank craters, and the 4.08mm slot were all shipped after I judged renders by eye and reported means instead of maxima; owner: "STOP wasting my time and STOP guessing and START to check your work BEFORE you submit files!!!" and "NEVER GUESS" | regression: cgs-mold SKILL.md failure-rule 6 + anti-rationalization table + pipeline step 5f assert preflight_mold(...)["ok"] before every export -->

## Pipeline (owner gun-dip method — validated)

**★★ GLOBAL CONSTANT — SWEEP VOXEL IS 0.15 (owner ruling 2026-09-06).** `sweep_dip`/`solidify_mold` default to it; do NOT
   pass 0.4. The manufactured dimple field scales LINEARLY with the grid (max depth / voxel = 3.55 · 3.41 ·
   3.51 at 0.4 · 0.25 · 0.15), so at 0.15 the raw sweep has **zero** pits over 0.8 mm where 0.4 had 121, and
   a finer voxel SHARPENS corners rather than softening them. Cost on a 160k-vert scan: 3.86 M verts, ~41 s.
   ⚠ Verts go as 1/voxel², so a big gun + light can exceed ~6 M — the cut-A EXACT boolean then runs long
   enough to **time out the MCP socket while succeeding** (re-query the scene, don't assume failure), and
   cut B may need `solver='FLOAT'`. Drop to 0.25 only if memory or wall-clock actually bites, and say the number.
0a. **OPTIONAL — clean the SCAN** (`clean_scan(obj)`), before assemble. **NOT the dimple fix**: measured A/B, cleaning 92 % of
   the scan's own defects moved the mold by **10 % in count and 0 % in depth**. What it IS worth: the scan's
   own defects >0.05 mm **810 → 63**, a nicer `export_gun` file for Shapr3D, and (plausible, UNMEASURED) a
   more trustworthy `_gun_arbiter`. ~30 s, outward-only, creases + textured regions frozen. Run it before
   `assemble_gun_solid`; skip it without ceremony if the scan is already clean.
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
2a. ★★ **PASS `GUN_SOLID` INTO `repair_pits` AND `fill_dimples` — the owner's clean scan is the
   ARBITER for what is a defect.** `repair_pits(obj, GUN_SOLID)` / `fill_dimples(mold, GUN_SOLID)`.
   Shared helper `_gun_arbiter` answers "is there real geometry here?" three ways, and only a YES
   protects the blob:
   · **FLANK** (gun normal mostly ±X) → never protected. The mold's half-width along a flank is the
     RUNNING MAXIMUM of the gun's half-width over the sweep, so it is monotone and a local dip is
     geometrically impossible — even a real recess on the gun's flank gets filled by the sweep.
   · **DETACHED** (>1 mm from the gun) → pure swept envelope, the gun's shape is irrelevant.
   · **SIGNAL-TO-NOISE** `dev > max(0.16, 2.5·rms)` of a local QUADRIC fit. Both parts are load-bearing:
     an ABSOLUTE threshold called the grip stipple (rms 0.6–0.7) "real" and let 1.1 mm craters ship;
     a PLANE fit read the flank's own curvature as roughness and rejected all 151 candidates.
   This replaced `protect_creases` (now default **False**), which was too blunt: on a stippled region
   every sharp vert connects into one giant "extended" cluster, so it protected the whole area and
   `repair_pits` stalled at ~48 unrepaired craters — exactly the ones René circled. With the arbiter
   it converges **57 → 2 → 0 while protecting exactly 1 blob**: the light/dust-cover crease, the very
   thing whose 2.08 mm gouge started all this.
   ⚠ Derive a blob's orientation from its ANNULUS's best-fit plane, never from the mean of its own
   vertex normals — inside a crater the wall normals cancel and a flank crater reads |nx| ≈ 0.3,
   dodging the flank rule (five marks survived three passes because of this).
   ⚠ Things that do NOT fix these and were tried: `beautify_fill` (3→4 hotspots), `repair_specks`
   (freezes branched scratches as extended creases), `smooth_flank_field` (cleared two marks and
   introduced a new stepped seam at the region boundary).
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
3c. ★★★ **NO LONGER UNCONDITIONALLY MANDATORY — AT VOXEL ≤ 0.25 THIS STAGE SMEARS REAL GEOMETRY. ARBITRATE
   ITS HOTSPOTS FIRST, AND EXPECT TO SKIP IT** (owner reject 2026-09-06: *"with both 0.15 and 0.25 it creates
   impurities … 0.15 also has impurities on the other side"*). Its compactness window (2.5 mm) and hotspot
   density buckets are calibrated for a **0.4 mm** voxel. A fine mesh resolves real feature lines sharply and
   carries almost no speck field, so the detector fires on ordinary geometry corners — **53 hotspots at 0.15
   vs 7 at 0.25 vs 39 at 0.4** — and `smooth_flank_field` (which selects `|x| > 0.93·half-width`, i.e. the
   flanks) then flattens them. It moved **41,422 verts (3.05 %)** at 0.15 and produced the smeared dust-cover
   flanks René circled.
   **THE GATE ON THE GATE — run the 08-20g arbitration over EVERY hotspot before letting the stage run:**
   compare `_feature(35°)` sharp fraction of the GUN vs the PRE-DECIMATE MOLD in each `box_y`/`box_z`/`side`.
   On the HK CC9 at 0.15, **30 of 53 had the gun 1.95×–181× sharper** (false positives), **23 more had gun
   sharp_frac 0.0000** — no gun surface in the box at all, i.e. pure swept envelope, unarbitrable, NOT "real".
   Only 3–4 boxes had the mold genuinely sharper. Absolute scale check: the mold read **0.002–0.075** against
   the P320's real speck field at **0.18–0.29** — two orders of magnitude apart.
   **Skipping it is now the DEFAULT at 0.15.** Verify the decision the same way every time: the pre-decimate
   `preflight_mold` must still return `ok:True` on defects + intrusions, and a cavity close-up must show no
   dotted field. Tell that the features survived: a following `fill_dimples` protects **>0 blobs as
   real-on-gun** (3 at 0.15, 1 at 0.25 after the rebuild; **0** in the despeckled run — nothing left to
   recognise). At 0.4 the stage stays live and its history below stands.
3c-legacy. **SPECK-FIELD GATE — `despeckle_mold`** (owner
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
5. **Offset — 0.2 mm in X and Z, 0.1 mm in Y, WHOLE MOLD** (`offset_mold_xz(mold, 0.2, 0.1)`) —
   ★ OWNER RULING 2026-08-20, SUPERSEDES the slide-only rule below. Converged over four messages:
   *"0.4 should always be everywhere but only along the Z axis and X axis. Never along the Y axis"* →
   *"change from 0.4 to 0.3"* → *"change further to 0.2"* → **"add 0.1 on Y AXIS"**. His axes are this
   pipeline's axes (confirmed on a front view: Z up, X across, Y down the barrel).
   Mechanism: a true anisotropic **ellipsoid** Minkowski offset with semi-axes (0.2, 0.1, 0.2) —
   `p + (a²nx, b²ny, c²nz)/sqrt(a²nx²+b²ny²+c²nz²)`. Exactly 0.2 on a pure X/Z face, exactly 0.1 on a
   pure Y face (muzzle face, cut B's rear face), correct blend on every mixed normal, and no ramp
   constant to tune. **VERIFY the Y extent grew by exactly `offset_y` at each end** and the XZ flank
   gaps by `offset`; that is the whole ruling in two numbers.
   ⚠ THE OLD RULE SHIPPED A BROKEN MOLD. `offset_mold`'s `z_line` region left the dust cover, trigger
   guard and **the entire weapon light** at exactly 0.000 clearance. René overlaid his gun on the
   G19 + GTL II mold and the light and frame bled straight through — only the slide had clearance.
   The 08-04b note that called a 0.019 mm front-Y gap "correct because the light is below z_line" was
   documenting the bug, not a feature.
5b. **CLEARANCE ENFORCEMENT — `enforce_clearance(mold, GUN_SOLID, clearance=0.25, keep_mask=…)`, run
   LAST, after every smoothing stage, right before the decimate.** (0.25 = the 0.2 target plus a
   margin, so decimate-collapse cannot eat into it — see 5f.) A normal offset cannot recover what
   `smooth_mold` + `despeckle_mold` shrink out of a TIGHT CONCAVE POCKET: after a clean 0.2 XZ offset,
   117 of 54,173 retained gun verts still sat OUTSIDE the mold, up to **1.63 mm**, all inside the
   trigger-guard bow. It screens with a nearest-normal test, CONFIRMS with a 5-ray parity test, and
   pushes only the mold verts near a confirmed offender. Converged 214 → 67 → 52 → 29, worst 1.63 → 0.15.
   ⚠ **The blanket version FAILED and must not be reintroduced**: "push every mold vertex closer than
   `clearance` to the gun" selected **42,305 verts (17 % of the mesh)** — because the whole gun-hugging
   face legitimately sits at exactly the clearance — did not converge over 3 rounds, and inflated the
   mold by 4.4 mm. Enforce against failures you can PROVE, never against a predicate the correct
   surface also satisfies.
   ★ **Measure intrusion with a RAY-PARITY test, never a nearest-point normal sign.** Inside a concave
   pocket the nearest-point normal lies: the sign probe reported 298 verts out and a **10.7 mm**
   worst case; parity confirmed **117** and 1.63 mm. Screen cheap with the sign, confirm with parity.
   Residual intrusions on **Y-facing front surfaces are correct by the ruling** (no Y offset), so the
   accept test must exclude gun verts with `|n_y| > 0.5`.
5c. *(LEGACY)* **Offset +0.4 mm — SLIDE REGION ONLY** (`offset_mold`) — owner corrected (2026-06-30): the
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
5d. **Reduce to the FACE BUDGET — now 250,000 faces, NOT 123,000** (owner ruling 2026-08-20).
   ★ 123k FACETS THE CURVED SURFACES AND HE READS THE FACETS AS "PIMPLES". Measured on the
   G19 + GTL II: the pre-decimate mold audits **0 speck hotspots, ok:True** and renders smooth; the
   123k export audits **4 hotspot regions** and renders visibly triangulated across the light body,
   the lower rail and the trigger-guard fill — while the BVH says the two surfaces are **0.003 mm**
   apart (p99). The geometry was fine and the SHADING was not, which is the 08-17b "the eye reads
   normals" rule with a topological cause. At 250k the facets are gone and BVH p99 falls to 0.00046 mm.
   ⚠ `beautify_decimated` (edge-flip, provably zero vertex movement) does NOT fix it — tried first,
   3 → 4 hotspots. Sliver aspect ratio is not the cause; too few triangles for the curvature is.
   Always render a raking/cavity close-up of the DECIMATED mesh, not just the gated one.
5e. **How the reduction is done — decimate-collapse, corners preserved** (`decimate_mold`, default
   `remesh=False`, VALIDATED 2026-07-03) — `DECIMATE COLLAPSE` straight to `target_faces` ≈ 125k, NO
   voxel re-solidify. ★ Two INDEPENDENT levers: **crispness = the sweep voxel (now 0.15)**; **face count =
   this budget.** Collapse sheds flat faces first so it KEEPS the crisp corners the sweep produced —
   a voxel-remesh (`remesh=True`, legacy) would round them back. Ratio is vs TRIS (collapse
   triangulates) with one measure+correct. Glock 43X: 0.4 sweep → collapse → 119,549 faces, manifold 0/0.
   ⚠ **At 0.15 the collapse ratio is ~0.09** (vs 0.26 at 0.25), so the decimated mesh's depth + speck
   probes are proportionally MORE artefact-prone — read those pre-decimate and clear the shipped ones
   with the 5f falsification arithmetic. The must-pass trio (nonmanifold / boundary / intrusions) is
   unaffected and still decides. Expect the pinch sliver more often at 0.15; repair it and BVH both ways.
5f. ★★★ **PREFLIGHT GATE — `assert preflight_mold(fin, GUN_SOLID, keep_mask=…)["ok"]` IMMEDIATELY
   BEFORE `export_mold`. NON-NEGOTIABLE** (owner directive 2026-08-20d, after a fourth reject:
   *"STOP wasting my time and STOP guessing and START to check your work BEFORE you submit files!!!"*).
   Run it on the **DECIMATED** mesh — the one that actually ships — and on the pre-decimate mesh too.
   It checks manifold 0/0, clusters every depression and puts each through `_gun_arbiter`, ray-parity
   confirms no gun vertex escapes the mold, and runs `speck_report`. A False NAMES the coordinate;
   render that spot under cavity light and fix it with `fill_dimples` or, if its thresholds don't
   reach, `patch_region(mold, ctr)` — never export past a False.
   ⚠⚠ **THE GATE SPLITS IN TWO AND ONLY HALF OF IT IS VALID ON THE DECIMATED MESH** (SIG ATC, 2026-08-20f).
   The 08-04c edge-length rule applies to `preflight_mold` exactly as it does to `repair_pits`: its
   depression probe is a 2-ring neighbourhood test, so it is only meaningful at near-uniform density.
   Decimate-COLLAPSE sheds flat faces and leaves long ones — measured here **p1 0.213 / p50 0.466 /
   p99 5.10 mm, ratio 23.9** against the pre-decimate **0.22 / 0.40 / 0.43, ratio 1.9** — so on collapsed
   flats the probe's support balloons and reads plain CURVATURE as depth.
   · **Density-INDEPENDENT, must pass on the shipped mesh: `nonmanifold`, `boundary`, `intrusions`**
     (ray parity). Never wave these away.
   · **Density-DEPENDENT, read them on the PRE-DECIMATE mesh: `n_defects`, `speck_*`.** Validate the
     shipped mesh against the gated one with a BVH instead.
   ★ **THE FALSIFICATION TEST — run it before you dismiss ANY decimated flag** (three numbers, ~20 s):
   (1) re-gate the PRE-DECIMATE mesh with a descending `min_depth` to find its true worst depression;
   (2) BVH the decimated verts onto the pre-decimate surface; (3) the shipped mesh's deepest possible
   depression is `worst_pre + 2·bvh_max`. Here: worst_pre **0.196 mm** (0 defects at min_depth 0.20,
   26 only at 0.15), bvh_max **0.0285 mm** → ceiling **0.253 mm**, against decimated claims of
   0.255–0.396 mm ⇒ artifact, proven rather than asserted. If the arithmetic does NOT clear the claim,
   it is a real defect — go fix it. Then render the coordinates anyway; both were clean here.
   ⚠ **`patch_region` HAS A BUILT-IN VALIDITY NUMBER AND IT IS `annulus_rms` — READ IT BEFORE ACCEPTING
   THE PATCH.** It restores the interior to a quadric fitted on the annulus, so if the annulus is not
   locally smooth the fit is meaningless. On the ATC's grip-flare junction it returned
   **annulus_rms 0.719 mm** (the 08-20d success was **0.0095 mm**) and pushed 350 verts by up to
   **2.899 mm**, opening **174 intrusions at 2.001 mm** that `enforce_clearance` then stalled on
   (232 → 179 → 179). **Reject the patch unless `annulus_rms` is well under the defect depth**; a rough
   annulus means the region is curved geometry, not a flat panel with a hole in it.
   ★ **Give the pre-decimate mesh a clearance MARGIN**: `enforce_clearance(..., clearance=0.25)` before
   decimating, so collapse cannot eat into the 0.2 target. Running `enforce_clearance` AFTER the
   decimate instead was measurably worse — it moved 1,268 verts and pushed BVH deviation from the
   gated surface to max 0.313 mm with 96 verts over 0.1, versus max 0.013 mm doing it before.
   Three molds shipped with defects that this function finds in about five seconds. Run it.
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
4. **+0.1 mm offset on the WHOLE mold** — ★ **CURRENT VALUE, owner ruling 2026-08-20e:
   *"Magazines: Change from 0.2 to 0.1"*.** Superseded chain: +0.4 (inherited from the gun, 08-01/08-03)
   → +0.2 (08-04, *"0.4mm is too loose on a magazine"*) → **+0.1**.
   A magazine is a small constant-section prism the pouch has to RETAIN by friction, and a normal
   offset applies to BOTH flanks — so the number DOUBLES across the retained dimension: +0.1 here is
   +0.2 mm across a ~20 mm-wide body (1 %), where the gun's old +0.4 was +0.8 mm (4 %) and the
   magazine fell out. No slide/frame parting line exists, so it goes everywhere:
   `offset_mold(z_line=zmin-10, offset=0.1)` so the weight is 1 across the whole mold, then
   **re-seat the rear face to Z = 0** and apply the SAME translation to the exported magazine (see the
   trap below). Verify the region bbox grew **+0.1** outward on all six faces.
   ⚠ **Magazines keep the ISOTROPIC offset — they do NOT take the gun's 0.2 XZ / 0.1 Y split.** On a
   magazine mold only one Y-facing surface exists (the feed-lip end); the other Y face is the open cut
   at the basepad, so an anisotropic split would change nothing that matters. Owner ruled the magnitude
   only; do not "inherit" the gun's axis rule here without a new ruling.
   ⚠ **Both shipped magazine molds are now superseded** — `Glock 43x Magazine 0.2.stl` (08-01) and
   `SPHINX SDP STANDARD_COMPACT_MAG CARRIER 0.2.stl` (08-04), both in `_AUTOMATED MOLDS`. Re-cutting is
   cheap and deterministic: the pose/cut/sweep are reproducible, so it is `offset=0.1` → re-seat →
   re-export the pair. Owner's call whether to re-run them.

The dip still earns its keep: it fills the **mag-catch notch** on the front face, which would
otherwise lock the magazine into the pouch, and it fills the rear witness holes flush.

⚠ **Magazines INHERIT the 0.15 sweep voxel** (owner ruling 2026-09-06 was for the skill, not for guns
only). `boot` still tracks the voxel — that is the 08-01 anti-comb rule and it is what made a magazine's
tapered feed lips come out clean; it is satisfied automatically by the new default. A magazine is small,
so 0.15 costs little. The offset magnitude (+0.1 isotropic) is a SEPARATE ruling and is unchanged.

Export pair: `<name>.stl` + **`<name> MAG.stl`** (not ` GUN.stl` — `export_gun` hardcodes the wrong
suffix for magazines; write the sibling inline).

## Invocation (blender-mcp must be live on :9876)

Run the engine inside Blender via `execute_blender_code`; it execs the on-disk module so the
heavy logic stays version-controlled:

★ **THE CANONICAL ORDER, validated end-to-end on the G19 + GTL II 2026-08-20d.** Deviating from it is
how the four rejects happened. Every defect function takes `GUN_SOLID` — the owner's clean scan is the
arbiter (step 2a) — and the run ENDS on a gate, not on a render.

```python
# Windows (René's box). Re-exec the engine at the top of EVERY execute_blender_code call — globals
# do NOT persist between MCP calls (07-30).
exec(open(r"C:\Users\rene\.claude\skills\cgs-mold\scripts\cgs_mold.py").read(), globals())

# 0b. OPTIONAL scan clean — NOT the dimple fix (10% on count, 0% on depth). Skip if the scan is clean.
# clean_scan(bpy.data.objects["<gun-scan>"])                   # in place; check ["max_disp_mm"] <= total
# 0. ASSEMBLE — union EVERY island (gun + light + rail), drop only specks, seal, center on the SIGHTS.
gun, sa = assemble_gun_solid(["<gun-scan>", "<light-scan-if-separate>"])   # -> GUN_SOLID
#    check sa["islands_kept"] covers every real part; sa["front_feature_z"] low => a forward light leads.
# 1. THE DIP — full length, filled manifold-0/0 solid directly. VOXEL 0.15 (owner 2026-09-06) is the default;
#    do not pass 0.4. Expect ~3.9M verts / ~40s on a 160k-vert scan; >6M on a big gun+light.
solid, s = sweep_dip(gun)                                      # -> CGS_MOLD_SOLID, voxel=boot=0.15
repair_pits(solid, gun)                                        # re-invoke until the last round reads 0
# 2. CUTS — annotation-driven if René drew lines (preferred); EXACT solver first, guard the vert ratio.
#    cut A = diagonal grip plane; cut B = cut_tail(gun_rear=<beavertail>, margin=...)
# 3. SMOOTH + the >0.5mm clamp, then the defect stack. KEEP CGS_MOLD_CUT2 in the scene as the rollback.
smo, ss = smooth_mold(cut2, flat_pairs=8, deburr_thr=0.015, deburr_rings=3, deburr_pairs=12)
#    ... clamp verts displaced >0.5mm back to their pre-smooth position ...
repair_pits(smo, gun); fill_dimples(smo, gun, rounds=6)
# 4. OFFSET — 0.2 in X and Z, 0.1 in Y. Ellipsoid; assert the Y extent grew by exactly offset_y.
offset_mold_xz(smo, offset=0.2, offset_y=0.1)
repair_pits(smo, gun)
# ★ SPECK STAGE — at voxel 0.15 the DEFAULT is to SKIP it (step 3c). Arbitrate before you ever run it:
#   for each speck_report(smo)["hotspots"] box, compare _feature(35°) sharp fraction GUN vs MOLD;
#   gun sharper => false positive; gun sharp_frac 0.0 => no gun surface => unarbitrable, not "real".
#   sp = despeckle_mold(smo); assert sp["ok"] and not sp["crease_assert_failed"]   # 0.4 voxel only
fill_dimples(smo, gun, rounds=4)   # >0 "skipped_real_on_gun" = the features are intact
# 5. CLEARANCE with a MARGIN above target, so the decimate cannot eat into the 0.2.
enforce_clearance(smo, gun, clearance=0.25, keep_mask=keep)     # keep_mask = the RETAINED gun region
assert preflight_mold(smo, gun, keep_mask=keep)["ok"]           # gate the pre-decimate mesh too
# 6. PRE-CLEAN + DECIMATE to the 250k budget (triangulate -> remove_doubles -> dissolve_degenerate
#    -> delete pinch faces -> holes_fill), keeping a PRE_DEC copy for the BVH check.
fin, ds = decimate_mold(smo, target_faces=250000, remesh=False)
# 7. ★★★ THE GATE — on the mesh that actually ships. NEVER export past a False.
gate = preflight_mold(fin, gun, keep_mask=keep)
assert gate["ok"], gate["defects"]          # a False NAMES the coordinate -> render it, fix, re-gate
# 8. EXPORT both files to the folder René confirmed.
export_mold(fin, "<gun-name>", out_dir=CHOSEN)
export_gun(gun, "<gun-name>", out_dir=CHOSEN)      # repositioned original, for Shapr3D alignment
```

`keep_mask` = the gun vertices the mold is supposed to enclose, i.e. everything above cut A's plane and
forward of cut B: `(gz > m*gy + b + 2) & (gy < cutB_y - 2)`. Without it the cut-away grip contributes
~33,000 "outside" verts at up to 62 mm and buries the real signal.

Stage functions returning `(object, summary)`: `sweep_dip`, `solidify_mold`, `cut_grip`, `cut_tail`,
`smooth_mold`, `decimate_mold`. In-place, returning a summary only: `clean_scan` (OPTIONAL, step 0b),
`repair_pits`, `fill_dimples`, `patch_region`, `offset_mold_xz`, `enforce_clearance`, `despeckle_mold`,
`repair_specks`, `smooth_flank_field`, `remove_overhang`, `denoise_region`.
Read-only: `speck_report`, `preflight_mold`.
DEPRECATED: `offset_mold` (region/z_line — see 5c), `split_mold`, `build_mold`.
CONDITIONAL: `despeckle_mold` / `repair_specks` / `smooth_flank_field` — 0.4-voxel stages; at ≤0.25 they
smear real geometry unless every hotspot arbitrates as real (step 3c).

★ **THE DAMAGE MAP — the diagnostic for "the pipeline changed something it shouldn't have".** Signed BVH
distance from the shipped mesh to the PRE-SMOOTH cut mesh (`CGS_MOLD_CUT2` / `C*_B`), minus the nominal
offset; cluster `|residual| > 0.12`. Non-zero residual is exactly what the stack did, and it localises to a
coordinate in one call. It is what found the despeckle smearing (6 clusters at x ±11 → 1 after the fix).
This is the reason the pre-smooth cut mesh is kept in the scene for the whole run.

**Render to LOCATE, measure to CONCLUDE** — never the reverse (failure-rule 6). `bpy.ops.render.opengl`
needs `view_context=False` AND `hide_viewport`/`hide_set`, not just `hide_render`; Workbench FLAT +
`show_cavity` is the shading that exposes normal-break defects.

## Parameters — the OWNER-RULED CONSTANTS (do not change without a ruling)

| Constant | Value | Ruled |
|---|---|---|
| **sweep voxel / `boot`** | **0.15** | **2026-09-06 — OWNER RULING, supersedes 0.4** |
| ~~sweep voxel~~ (superseded) | ~~0.4~~ | 2026-07-03 (crisp corners), 08-01 (boot=voxel kills the comb) |
| `despeckle_mold` | **OFF at voxel ≤ 0.25** unless its hotspots arbitrate as real | 2026-09-06 owner reject |
| offset X and Z | **0.2 mm** | 2026-08-20 (0.4 → 0.3 → 0.2) |
| offset Y | **0.1 mm** | 2026-08-20d ("add 0.1 on Y AXIS") |
| clearance enforced pre-decimate | **0.25 mm** (0.2 + margin) | 2026-08-20d |
| face budget | **250,000** | 2026-08-20b (123k faceted → read as "pimples") |
| smooth params | `flat_pairs=8, deburr_thr=0.015, deburr_rings=3, deburr_pairs=12` | 2026-08-04c |
| smooth clamp | revert any vert displaced **>0.5 mm** | 2026-07-27 |
| MAGAZINE offset | **+0.1 everywhere incl. Y** — isotropic, `offset_mold(z_line=zmin-10, offset=0.1)` | 2026-08-20e |
| export folder default | `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS` | 2026-07-28 |

★ **Guns and magazines use DIFFERENT offset rules — do not cross them.** Gun: 0.2 XZ / 0.1 Y,
anisotropic ellipsoid (`offset_mold_xz`). Magazine: **0.1 isotropic** (`offset_mold`). Both are owner
rulings, both from 2026-08-20; the magazine's isotropy was ruled explicitly, not by omission.

Per-gun JSON in `params/` still carries `grip_cut` (`solver`, `corner_below_mm` 20,
`beavertail_below_mm` 10) and `out_name`. Cut points are **annotation-driven when René drew lines**
(preferred — see step 3); otherwise auto-detected and confirmed on a cut-confirm render.
⚠ `_find_cut_points` is unreliable for the CORNER on every gun (four documented misfires: its knee
window is anchored on Y=0) — recompute the knee inline over the full gun region and take the LAST
flat bin of the bottom-Z plateau.

## Safety conventions (born from 2026-06-28)

- **Non-destructive**: reads only the scan's verts; the source object is never mutated; every
  run creates a NEW object and hides the scan. No in-place edits, no booleans on the scan.
- **Gate-verify AND render-verify** before claiming done — `preflight_mold` decides, the render
  locates. Counts alone are never enough, and a render alone is never enough (failure-rule 6).
- If a mesh op would mutate existing geometry, snapshot/duplicate first.
- ★ **KEEP `CGS_MOLD_CUT2` (the pre-smooth cut mesh) IN THE SCENE FOR THE WHOLE RUN.** It is the
  deterministic rollback point: re-running smooth → clamp → defect stack → offset from it reproduces
  prior numbers exactly. It has paid for itself four times (08-17b ×2, 08-20b, 08-20c) — every damaging
  experiment was undone for free.
- ★ **Dump every stage summary to `C:\Users\rene\cgs_tmp\*.json` and read it back.** The MCP
  `execute_blender_code` regularly returns `"Code executed successfully: "` with **stdout dropped**
  (six sessions running). `_SYSTEM/state/` is denied to this path by the permission classifier.

## Status / scope

- **VALIDATED (owner-confirmed 2026-06-30, "this is successful"):** solidify (voxel-fill) → grip cut
  (FLOAT cube DIFFERENCE, corner−20/beavertail−10) → 4-stage feature-preserving smooth → overhang cleanup.
  Manifold 0/0 throughout. Deliverable on HK45 = `CGS_MOLD_FINAL`.
- **VALIDATED (owner-confirmed 2026-07-02, "now it is correct"):** the **dip/draw sweep** — `sweep_dip()`
  full-length log-doubling voxel-union, muzzle→end, manifold 0/0. Closes the last upstream gap; the
  pipeline now runs scan → assemble → `sweep_dip` → cut A/B → smooth → offset → decimate → export (ONE piece, no split).
- **VALIDATED (owner-confirmed 2026-08-20d, "now the mold is good"):** the DEFECT + GATE stack —
  `_gun_arbiter` (the owner's clean scan decides what is real) driving `repair_pits` and `fill_dimples`,
  `patch_region` for residual seams, `enforce_clearance` at a 0.25 margin, the 0.2/0.1/0.2 ellipsoid
  `offset_mold_xz`, the 250k budget, and **`preflight_mold` as a mandatory pre-export assert**.
  Shipped result: 250,000 faces, 0/0, 0 defects, 0 intrusions, BVH p99 0.00045 mm.
- **TODO:** alignment pins on the split mating faces. *(The "STL export gate" TODO is CLOSED —
  that is `preflight_mold`, pipeline step 5f.)*
- **Seal** is trivial when the scan is already a watertight solid (René's "SOLID GUN FOR AUTOMATION"
  exports import as manifold 0/0, 1 island — just center on origin; no reseal needed).

## Session Notes

### 2026-09-06b — **GLOCK 34 (bare gun)** — **DONE, EXPORTED**; the first EXACT-boolean CRASH at 0.15, and how to decide the speck stage with a DEPTH number instead of a render
- Scan `GLOCK 34.stl` 66,916 v / 133,832 f, **watertight 0/0**, identity matrix, canonical pose, no annotations,
  3 islands (main 56,484 v + barrel 5,731 v + recoil assembly 4,701 v — **all three kept**, 0 specks dropped).
  Scan edge ratio **109.5** (p1 0.049 / p50 0.70 / p99 5.37) ⇒ `repair_pits` correctly skipped on the scan.
  ⚠ **A clean STL does NOT mean `clean_scan` is warranted** — the 09-06 A/B already proved cleaning moves the
  mold 10 % in count and 0 % in depth. Skipped it and said so; the sweep voxel is the lever, not the scan.
- **★ POSE: the CONVERGENCE TEST fired on pitch and nothing else.** Global least-squares axis fit (cos_tol
  0.9999, 17,749 mm² = 36 % of surface): `r` correction **(+0.0742, −0.1341, +0.0367)°**, rms **0.004620 →
  0.004287** (−7.2 %). Independent pitch datums all agreed in sign: slide-top +Z face clusters
  **+0.067 … +0.244°** (area-weighted, 3,171 mm²), so **+0.0706° applied about X**, max vertex move 0.105 mm;
  slide top after **+0.0296°**. Roll/yaw left alone — flank normals read roll **−0.15…−0.23 (+X side)** vs
  **+0.11…+0.27 (−X side)**, i.e. the two flanks tilt at OPPOSITE angles (the 08-04c wedge), and symmetry
  yaw **+0.027°** vs slide-symmetry **−0.014°** straddle zero.
- **★ `_sight_channel_x` was off by 0.109 mm again — measure the sights (09-05 rule, second gun).** The engine
  put `sight_x_post` at 0.0, but the front blade centred at **−0.103** (edges −2.167 / +1.961) and the rear
  notch at **−0.115** (edges −1.979 / +1.750, shoulders 57.71, floor 54.84) ⇒ residual **+0.1088 mm** applied
  to GUN_SOLID before the sweep. Both sights then straddle X = 0.
- **★★★ THE EXACT BOOLEAN DID NOT TIME OUT — IT CRASHED BLENDER, AND THE PROCESS RESTARTED CLEAN.** At voxel
  0.15 the sweep is **6,346,164 v / 91.6 s**; the first cut-A attempt (EXACT, dz 0) took the process from
  25.6 GB working set to a hard exit — the MCP socket returned "No data received", `blender.exe` reappeared
  under a NEW PID with an EMPTY scene, and my JSON log stopped at the pre-cut line. **Distinguish the two
  failure modes before waiting**: a socket TIMEOUT leaves the PID and the memory footprint intact and the
  object appears on re-query (09-06 HK CC9); a CRASH changes the PID and empties the scene. The tells I used:
  `tasklist` PID 15588 → 24944, working set 25.6 GB → 0.5 GB, `Get-Process blender` CPU delta **0.08 s over
  30 s** (idle, not computing), and `get_scene_info` returning 2 objects. Do not sit through a 10-minute poll
  loop — poll the PID.
  **THE FIX AND THE STANDING RULE: at ≥ ~6 M verts, run cut A with `solver='FLOAT'` from the start.** FLOAT
  cut this mold in **84.9 s**, ratio **0.300** (1,902,389 v), manifold **0/0**, bbox max_y 137.97 well past
  cut B's plane — the healthy signature. Rebuild from the STL to that point cost ~3.5 min and reproduced every
  number exactly (same 6,346,164 v, same 0/0), which is the second confirmation this year that the pipeline
  is deterministic and a crash costs only wall-clock.
- Cut points auto (no annotation), both off the right mesh. **Knee from the MOLD's running-min bottom**, which
  is dead flat at **−14.090 from y +1.0 to +20.5** and then plunges continuously (21.0 → −15.21, 21.5 → −16.41)
  ⇒ corner **(20.5, −14.090)**, the LAST flat bin. **Beavertail from GUN_SOLID's banded rear silhouette** — a
  clean local ridge at **(84.58, z 26.0)** (z 23 → 81.92, z 30 → 83.70), while the global rearmost point is the
  **grip heel at y 95.51, z −60**, i.e. the 08-04c heel trap present and avoided. With the owner-locked
  −20 / −10 ⇒ **α 38.01°**. ★ Cross-check that costs one lookup: the 08-05 Glock 34 + X300 run gave **38.10°**
  on the same frame — **0.09° apart**. Same-model agreement across two independent runs is the cheapest cut-A
  sanity check there is; use it whenever the gun has been run before.
- Cut B keyed off the BEAVERTAIL (84.58 + 6 = **y 90.58**), NOT `gun_rear_y` 96.4 — the heel is 12 mm behind
  the tang, so `gun_rear + 6` would have left ~12 mm of dead tail. Verified first: **0 gun verts behind cut B
  above the cut-A plane**, max y above the plane = 84.58. FLOAT, 4.6 s, 1,754,548 v, 0/0.
- Sweep `boot=0.15`, travel 222.2, 12 passes, edge ratio **2.32**. Pits post-sweep **1272 → 1 → 0**; after the
  cuts **464 → 1 → 0**; after smooth **2 → 0**; after offset **0**. smooth(8/0.015/3/12): **21 verts >0.5 mm**
  clamped, max 7.358 → **0.488**, p99 0.030. Offset exact to the ruling: **max_disp 0.200 · dy_max 0.100**.
- **★★★ THE SPECK DECISION, MADE ON A DEPTH NUMBER RATHER THAN A PICTURE — and it went BOTH ways in one run.**
  `speck_report` on the offset mold: **34 hotspots, ok False**. Arbitrated per 08-20g before touching anything:
  **13 false positives** (gun 1.3×–5.5× sharper in the box), **17 unarbitrable** (gun sharp_frac 0.0000 — no gun
  surface, pure swept envelope), **4 marginal** with the mold sharper but on tiny gun samples (n 138–452).
  Mold absolute sharp_frac **0.0011–0.0486** against the P320's real field at **0.18–0.29**. By the 09-06 ruling
  that is a SKIP — and I skipped `despeckle_mold`.
  **Then a routine 3/4 cavity render showed a dot field on the frame flanks that the GUN does not have at the
  same camera.** Measured rather than argued: dotted box (y 40–80, z −10…25) mold sharp_frac **0.0239 (R) /
  0.0176 (L)** vs gun **0.0120 / 0.0098**, i.e. mold ~2× the gun; the visually clean slide flank read mold
  **0.0000** vs gun 0.0755. Mold-sharper on a FLANK, where the running-max law forbids a concavity ⇒
  manufactured ⇒ escalation legitimate.
  **THE ESCALATION THAT IS SAFE AT 0.15 IS `repair_specks` ALONE — NOT `despeckle_mold`.** The 09-06 smearing
  came from `smooth_flank_field`, which `despeckle_mold` calls automatically; `repair_specks` only melts
  COMPACT sharp clusters under a 0.15 cap and re-asserts the crease freeze. Two invocations, 2 rounds each:
  clusters **445 → 127 → 59 → 24**, 8,320 verts moved at mean 0.048 / max 0.277, and
  **`extended_still_sharp == extended_verts` on both** (6,581 and 6,587) — owner geometry provably untouched.
  Speck hotspots **34 → 1**. **DAMAGE MAP vs `CGS_MOLD_CUT2`** (signed BVH minus the nominal ellipsoid offset,
  250,650 samples): residual p99 **0.0257**, **11 samples over 0.12**, forming **ONE** cluster at
  (2.3, 73.4, 55.5) — the rear-sight blob, the same benign survivor as the 09-06 rebuild. No flank smearing.
  ★★ **AND THEN I STOPPED, because the next number said to.** The render still showed faint wisps, so I
  measured the 2-ring depth in the dotted box instead of escalating again: **max 0.047 mm, p99 0.0128, ZERO
  verts over 0.05 mm** — against the visually SPOTLESS slide flank at **max 0.046, p99 0.0119**. The two
  regions are depth-identical; what differs is only sharp_frac 0.0031 vs 0.00016. Pre-smooth (`CGS_MOLD_CUT2`)
  the same box read max **0.249** with 506 verts over 0.10, so the stack removed 5× of it.
  **RULE: escalate on a flank when mold sharp_frac > gun sharp_frac, and STOP when the box's depth statistics
  match a clean reference flank on the same mesh. A residual you cannot separate from an accepted surface by
  depth is not a defect — and `smooth_flank_field` is exactly what turns it into one.** The 08-17b field was
  real because it had 0.18–0.29 sharp_frac; this one is 0.0031.
- `fill_dimples` protected **0** blobs as real-on-gun — ⚠ the 09-06 "features survived" tell does NOT apply
  here and must not be read as failure: it found **0 blobs at all** (the mold was already clean), so there was
  nothing to arbitrate. The damage map is the load-bearing evidence in that case, not the protect count.
- `enforce_clearance(0.25)`: **41,837 keep-masked gun verts screened, 0 confirmed outside, 0 moved** — first
  gun in this log where the parity push was a total no-op. Pre-decimate gate **ok:True** (0/0, 0 defects,
  0 intrusions) and **0 defects down to min_depth 0.15**, the cleanest pre-decimate mesh recorded here.
- Decimate ratio **0.076** (the 0.15-voxel penalty), 2 iters → **248,732 faces / 265,600 tris / 132,802 v,
  0/0 first try**, no pinch sliver. BVH vs PRE_DEC **fwd max 0.0168 / rev max 0.0426, zero over 0.1** both ways.
- **Shipped-mesh gate: must-pass ALL GREEN — nonmanifold 0 · boundary 0 · intrusions 0.** 30 depth flags
  (0.43–1.49 mm) and 17 speck hotspots, every one falsified with the 08-20f arithmetic computed on the
  **flagged region's own** BVH (the 09-05 correction): local bvh_max **0.005–0.015** ⇒ ceilings **0.160–0.180**
  against claims **3.5×–9× higher** ⇒ geometrically impossible ⇒ probe artifacts. Local edge ratio on the
  shipped mesh **22–76** vs **2.1–6.6** pre-decimate. **8 of the top 10 sit exactly on the cut-B flat rear face
  (y 90.6)**, the rest on the grip-cut corner strip — non-forming press-bed faces either way.
- Gaps: slide flank **+0.212** · frame flank **+0.236** · front-Y **+0.128** · top-Z **+0.220**.
  Dims **35.867 × 216.611 × 87.697**.
- Export (standing default folder), both byte-exact vs `84 + 50·TRIS`, both identity `matrix_world`:
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\GLOCK 34.stl` (13,280,084 B, 265,600 tris) **+
  `GLOCK 34 GUN.stl`** (6,691,684 B, 133,832 tris — the pitch-corrected, sight-centred gun for Shapr3D).
  <!-- @anchor: v1 | failure: (a) the cut-A EXACT boolean on a 6.35M-vert 0.15-voxel sweep CRASHED Blender outright (25.6GB working set, process exited and restarted with a new PID and an empty scene) and I initially read it as the documented 09-06 socket TIMEOUT, polling a dead process for ~10 minutes before checking the PID and CPU delta; (b) I skipped despeckle_mold on the 09-06 ruling after arbitration showed 30 of 34 hotspots were false positives or unarbitrable, and a routine cavity render then showed a real manufactured dot field on the frame FLANKS where the mold measured ~2x the gun's sharp fraction -- the arbitration's box-level averages had diluted it; (c) after repair_specks cleared it the render still showed faint wisps and I was one step from running smooth_flank_field, which is exactly the stage that caused the 09-06 owner reject; 2026-09-06b | regression: cgs-mold SKILL.md Session Notes 2026-09-06b -- use solver='FLOAT' for cut A at >=6M verts; distinguish a Blender CRASH from an MCP timeout by PID + working set + CPU delta, not by waiting; escalate a flank speck field with repair_specks ALONE (never despeckle_mold's smooth_flank_field) at voxel <= 0.25, verify with the damage map against CGS_MOLD_CUT2, and STOP when the flagged box's 2-ring depth statistics match a clean reference flank on the same mesh -->

### 2026-09-06 — **HK CC9, CONTROLLED A/B: cleaning the SCAN does NOT reduce the mold's dimples. The VOXEL does.** ★★★ closes the 08-27h "honest limit"
- René asked the right question — *"test your GUN_CLEAN stl and see if YOU still create those dimples"* — after I had
  cleaned `HK CC9 - GUN.stl` (annulus-quadric fill: scan defects >0.05 mm **810 → 63**, >0.10 **214 → 32**) and told
  him to re-derive the mold from it. **That recommendation was wrong and one A/B refuted it.**
- **THE A/B** — identical `assemble_gun_solid` → `sweep_dip(voxel 0.4, boot 0.4)`, only the input scan differs:

  | metric (2-ring probe, thr 0.25, diag ≤ 2.5) | original scan | cleaned scan |
  |---|---|---|
  | pit clusters | 362 | **326** |
  | max depth | 1.397 | **1.421** |
  | mean depth | 0.629 | 0.681 |
  | pits > 0.5 / 0.8 / 1.0 mm | 215 / 94 / 44 | 209 / 121 / **44** |
  | on a FLANK (\|nx\| > 0.70) | 314 (87 %) | 294 (90 %) |

  Removing 92 % of the scan's own defects moved the mold **10 % in count and nothing in depth**.
- **FOUR PROOFS the sweep manufactures them** (any one suffices; together conclusive):
  1. **87–90 % sit on a FLANK**, where the running-max law forbids a concavity — so they cannot be scan geometry.
  2. The deepest are **single vertices, cluster diag 0.00 mm** — marching-cubes needles. Under Workbench FLAT +
     `show_cavity` they render as grid-aligned **`+` shapes**; a scan dimple is a multi-vertex depression with no
     axis alignment. **The `+` signature is the fastest visual tell in this skill — learn it.**
  3. **Depth scales linearly with the voxel**: max/voxel = **1.421/0.4 = 3.55** and **0.868/0.25 = 3.47**.
  4. A **plain single** `solidify_mold` of the clean gun maxes at **0.508** at voxel 0.4, so the 10-pass sweep
     **amplifies one remesh ~2.8×**. It is the STACKED remeshes, not one — 08-27h said "the grid"; this splits
     the grid from the pass count.
- **★★ THE LEVER — voxel 0.4 → 0.25, same gun, same sweep:**

  | | 0.40 | 0.25 |
  |---|---|---|
  | verts / sweep time | 541,986 / 5.5 s | 1,396,834 / **15.3 s** |
  | pits > 1.0 mm | 44 | **0** |
  | pits > 0.8 mm | 121 | **14** |
  | pits > 0.5 mm | 209 | **73** |
  | max depth | 1.421 | **0.868** |
  | `repair_pits` calls to converge | 3 (429→38→7→5→0) | **1** (274→4→0) |
  | residual `dmax` after repair | **1.15** | **0.49** |

  It does not merely start cleaner — it **ends 2.3× cleaner**, and a finer voxel also *sharpens* corners (07-03),
  so there is no crispness trade-off. Owner declined 0.25 on 08-27h on cost grounds **without these numbers**;
  the cost is ~10 s of sweep plus a denser cut/smooth. Re-ask him.
- Chain confirmed to the CNC plate: `HK VP9 CC\HK CC9 - MOLD.stl` is **12,499,784 B = 249,994 tris**, the exact size
  of the 09-05b pipeline export — so the dimples René circled on `HK_SFP9-CC_IWB_RH_MOLD.stl` came through Shapr3D
  from `sweep_dip`, not from his scan and not from Shapr3D.
- ⚠ **A defect-DENSITY argument is not a CAUSAL argument.** The scan genuinely carries **25×** the mold plate's
  density per 1000 mm² (27.2 vs 1.1 at >0.05 mm); I read that as "the mold inherits them" and recommended a full
  Shapr3D rebuild from a cleaned scan. Comparing two surfaces' densities says nothing about which produced the other.
  **Run the A/B — it costs one sweep.**
- **★★ PRODUCTION RUN, same day, both voxels end-to-end on the cleaned + yaw-corrected HK CC9** (owner asked for
  0.25 and 0.15 shipped side by side). Full canonical order, no step skipped:

  | stage | **0.25** | **0.15** |
  |---|---|---|
  | sweep verts / secs | 1,397,222 / 14.4 | 3,859,734 / 40.8 |
  | raw sweep max pit · >0.8 · >0.5 | 0.852 · 7 · 59 | **0.527 · 0 · 28** |
  | `repair_pits` post-sweep | 233→2→0, 1 call | 1029→7→0, 1 call |
  | cut A ratio / α | 0.390 / 38.93° | 0.391 / 38.93° |
  | cut B | EXACT 0/0 | ⚠ EXACT **3nm/3bd** → **FLOAT 0/0** |
  | smooth clamped / disp p99 | 17 / 0.0533 | 19 / **0.0343** |
  | `despeckle_mold` | 7 regions → 0, ok | 53 regions → 0, ok |
  | offset | 0.200 · dy 0.100 | 0.200 · dy 0.100 |
  | `enforce_clearance` | 0 confirmed | 0 confirmed |
  | **pre-decimate gate** | **ok:True** 0/0/0 | **ok:True** 0/0/0 |
  | pre-decimate true worst depression | 0.12 | 0.154 |
  | decimate | 250,000 f, 0/0 first try | 249,997 f **3nm/2bd** → repaired 249,992 f 0/0 |
  | **shipped must-pass nm / bd / intrusions** | 0 / 0 / **2 @ 0.058 mm** | 0 / 0 / **0** |
  | BVH vs pre-dec (fwd / rev max) | 0.034 / 0.014 | **0.017 / 0.020** |
  | gaps slide · frame · front-Y · top-Z | 0.248/0.200 · 0.199/0.202 · 0.082 · 0.199 | 0.237/0.199 · 0.198/0.212 · 0.090 · 0.202 |
  | dims | 27.286 × 159.660 × 90.649 | 27.309 × 159.669 × 90.636 |

  **0.15 wins on every must-pass metric** (0 intrusions vs 2, tighter BVH, visibly cleaner cavity render) for 2.8×
  the sweep and one extra sliver repair. **Both ship at the same 250k budget**, so the CNC file is identical in size.
  ⚠ At 0.15 the collapse ratio is **0.092** (vs 0.255), so the decimated speck/depth probe is proportionally MORE
  artefact-prone — 32 hotspots and 8 depth flags on the shipped mesh, **0 and 0 on the pre-decimate**. Falsification
  cleared every flag: claims 0.42–0.53 against a ceiling of **0.16–0.19** (worst_pre 0.154 + 2·local-BVH 0.003–0.012),
  local edge ratio **42–60** vs 2.3 pre-decimate. Arbitrate at pre-decimate density, always.
  ⚠ The 0.15 pinch sliver sat at **(12.1, 51.3, −6.4)**, within **0.06 mm of the cut-A plane** — on the flat
  press-bed face, not a forming surface (same pattern as 09-05b).
  ⚠ The cut-A EXACT boolean on the 3.86 M-vert sweep runs long enough to **time out the MCP socket while succeeding** —
  re-query the scene before assuming failure; the object was there and manifold 0/0.
  Exported: `_AUTOMATED MOLDS\HK CC9 0.25 voxel.stl` (250,000 tris) · `HK CC9 0.15 voxel.stl` (249,994 tris) ·
  `HK CC9 CLEAN GUN.stl` (319,666 tris) — all byte-exact vs `84 + 50·TRIS`, all identity `matrix_world`.
- **★★★ OWNER REJECT, same day — "with both 0.15 and 0.25 it creates impurities … 0.15 also has impurities on the
  other side, whereas 0.25 does not". CAUSE: I ran `despeckle_mold` WITHOUT ARBITRATING ITS HOTSPOTS, and at a fine
  voxel that stage SMEARS REAL GEOMETRY.** He circled smeared/gouged patches on the front lower flank (dust cover).
  **THE DIAGNOSTIC THAT LOCALISED IT IN ONE CALL — the DAMAGE MAP: signed BVH distance from the shipped mesh to the
  PRE-SMOOTH cut mesh (`CGS_MOLD_CUT2` equivalent), minus the nominal offset.** Residual ≠ 0 is exactly what the
  pipeline changed, and it clusters:

  | | with despeckle | rebuilt WITHOUT |
  |---|---|---|
  | 0.15 damage clusters | **6** — x ±11.2, y −80…−65, z 13–22, res ±0.16–0.19 (**both flanks** = his "other side") | **1** |
  | 0.25 damage clusters | **3** — x −11.6, y −70, z 21 (one flank only) | **1** |
  | 0.25 shipped gate | 3 defects, **2 intrusions @ 0.058** | **0 defects, 0 intrusions** |
  | 0.15 shipped gate | 8 defects, 0 intrusions | 5 defects (artifacts), **0 intrusions** |

  Both survivors are on non-forming faces (rear sight blob 0.9 mm; the cut-B flat rear face).
- **★★ THE ARBITRATION, which I should have run BEFORE the stage (08-20g exists for exactly this):** of the 0.15's
  **53 hotspots, 30 are provable FALSE POSITIVES** — gun sharp_frac vs mold sharp_frac in the same box runs
  **1.95× to 181×** in the gun's favour (e.g. 0.2907 vs 0.0016). The other 23 read **gun 0.0000** = no gun surface
  in the box, i.e. pure swept envelope where the comparison is meaningless — unarbitrable, not "real". Only 3–4 boxes,
  all on the lower frame (z −20…0), have the mold genuinely sharper. The mold's absolute sharp fractions are
  **0.002–0.075**, against the P320's real speck field at **0.18–0.29** — two orders of magnitude apart.
- **★★★ ROOT CAUSE — `despeckle_mold`'s thresholds are VOXEL-CALIBRATED (0.4) and it inverts below ~0.25.** Its
  compactness window (2.5 mm bbox diag) and hotspot-density buckets assume 0.4 mm edges. At 0.15 the mold resolves
  real feature lines sharply and carries almost no voxel speck field, so the sharp-cluster test fires on ordinary
  geometry corners — **53 hotspots at 0.15 vs 7 at 0.25 vs 39 at 0.4** — and `smooth_flank_field` (which selects
  `|x| > 0.93·half-width`, i.e. the flanks) then flattens it. It moved **41,422 verts (3.05 %)** at 0.15.
  **RULE: arbitrate EVERY hotspot against the gun before running the stage; at voxel ≤ 0.25 expect it to be a net
  negative and skip it.** The stage exists for a defect class that a fine voxel does not produce.
  ⚠ Corroborating tell: after the rebuild `fill_dimples` protected **3 blobs as real-on-gun (0.15) / 1 (0.25)**;
  in the despeckled run it protected **0** — the arbiter had nothing left to recognise because the feature was gone.
  <!-- @anchor: v1 | failure: OWNER REJECT "with both 0.15 and 0.25 it creates impurities ... 0.15 also has impurities on the other side, whereas 0.25 does not" — I ran despeckle_mold as a mandatory stage without arbitrating its hotspots, and at 0.15/0.25 voxel its smooth_flank_field flattened real geometry on the front lower flank (6 damage clusters at x +/-11, y -80..-65 on BOTH flanks at 0.15; 3 on one flank at 0.25), because the stage's compactness and density thresholds are calibrated for a 0.4mm voxel and a fine mesh carries no speck field for it to remove — 30 of the 53 hotspots it acted on had the GUN 1.95x to 181x sharper than the mold, and 23 more had no gun surface at all; 2026-09-06 | regression: cgs-mold SKILL.md Session Notes 2026-09-06 — localise pipeline damage with the DAMAGE MAP (signed BVH from the shipped mesh to the pre-smooth cut mesh, minus the offset); arbitrate every speck hotspot against the gun BEFORE running despeckle_mold, and skip the stage entirely at voxel <= 0.25; a post-rebuild fill_dimples that protects >0 blobs as real-on-gun is the tell that the features survived -->
  <!-- @anchor: v1 | failure: I measured 25x the defect density on the gun scan vs the mold plate and concluded the mold's dimples were inherited from the scan, recommending René clean the scan and re-derive the whole mold in Shapr3D — a large piece of wrong work. His own test request produced the controlled A/B that refuted it: cleaning 92% of the scan's defects changed the swept mold by 10% in count and 0% in depth, while 87-90% of the mold's pits sit on flanks where the running-max law forbids a concavity, the deepest are single-vertex needles rendering as grid-aligned '+' shapes, and depth scales linearly with the voxel (3.55 at 0.4, 3.47 at 0.25); 2026-09-06 | regression: cgs-mold SKILL.md Session Notes 2026-09-06 + Track-B memory cgs-scan-dimple-cleanup — attribute a dimple field with the A/B (same pipeline, two inputs) plus the flank split, the single-vertex/'+'-shape check and the voxel-scaling ratio, never by comparing defect densities between two surfaces -->

### 2026-09-05b — **HK CC9 (no red dot)** — **DONE, EXPORTED**; ★ the first gun this pipeline has ever ROTATED, and the test that justified it
- Scan `HK CC9 - NO RED DOT` 159,837 v / 319,674 f, identity matrix, canonical pose, **no annotations**, edge
  ratio 8.68 (pits off the scan). ⚠ **4 non-manifold edges with 0 boundary** — the METHOD-NOTES ★ROOT CAUSE
  signature — but 4 edges is a pinch, not internal walls, and `sweep_dip`'s first voxel-fill absorbed them
  (post-sweep 0/0). Don't reach for a rebuild on a single-digit count; check it survived the sweep instead.
- **★★★ THE CONVERGENCE TEST — sweep an applied rotation and see whether the independent datums share a
  COMMON ZERO. This is a strictly better rule than "the signs agree" and it is what finally separated a real
  pose error from the gun's own non-parallelism.** Rotate the point cloud + face normals through a range of
  angles and re-measure every datum at each step:

  | applied yaw | flankR | flankL | sym_slide | sym_all | sight_line | mean |
  |---|---|---|---|---|---|---|
  | +0.000 | −0.0838 | −0.0603 | −0.0698 | −0.0956 | −0.0462 | **−0.0711** |
  | +0.040 | −0.0508 | −0.0271 | −0.0305 | −0.0573 | −0.0067 | −0.0345 |
  | **+0.078** | **−0.0149** | **−0.0070** | **+0.0071** | **−0.0200** | **+0.0307** | **−0.0008** |
  | +0.120 | +0.0261 | +0.0160 | +0.0483 | +0.0205 | +0.0725 | +0.0367 |

  **All five cross zero together at +0.078° and the spread collapses from [−0.096, −0.046] (all one sign) to
  [−0.020, +0.031] (straddling).** Noise does not co-converge. Run the same sweep on pitch and roll and they
  do NOT: pitch's four datums sit at fixed offsets (slide top 0.000 · grip base +0.227 · sight line +0.192 ·
  fwd down-flats +0.547) that never meet — those surfaces genuinely are not parallel to each other on a
  pistol; roll's two flanks cross at **opposite** angles (−0.19 and +0.07), the classic 08-04c wedge.
  **⇒ applied yaw +0.078° about Z (max vertex move 0.105 mm), no pitch, no roll.** First rotation this skill
  has ever applied — every prior gun failed this test and was correctly left alone.
- **⚠ SIGN TRAP: the global least-squares axis fit returns the CORRECTION, not the error.** It solves for `r`
  in `(n + r×n) ∥ e`, so the object's error is **−r**. Reading it as the error flips the sign and makes it
  disagree with every datum-derived number. Here the fit gave `r_z = +0.0257°` ⇒ error −0.0257°, which then
  agreed with all five datums instead of contradicting them. (Re-checked the 09-05 SFP9 note against this —
  its conclusion is unaffected, every axis there was under 0.03° with mixed signs either way.)
- Sight channel: notch centre **−0.071** (crossings −2.053/+1.910), blade **−0.004** ⇒ **−0.037**; the engine's
  band read 0.0, so the residual correction was only **+0.037 mm** (vs 0.117 on the SFP9). Still worth doing.
- Cut points, auto (no annotation), both from the right mesh: **knee off the MOLD's running-min bottom** —
  trigger-guard plateau dead flat at −25.07 from y −35.5 to **+3.5**, then 4.5 → −25.49, 5.5 → −26.97
  continuous ⇒ corner **(3.5, −25.072)**, the LAST flat bin. **Beavertail off GUN_SOLID's banded rear
  silhouette** — broad tang z 12.5–27.5 at 64.4–64.76, peak **(64.76, z 14.5)**; the grip heel reaches only
  63.98, so no 08-04c heel trap and `gun_rear_y` IS the beavertail. With the owner-locked −20/−10 →
  **α 38.98°**. **EXACT@dz=0 first try on both cuts** (A 211,600 v = 0.392×src; B at y 70.76 → 189,986 v), 0/0.
- Sweep `boot=0.4`, travel 153.5, 10 passes, **539,966 v, 8.7 s**, 0/0, edge ratio **2.33**. Pits **47 → 2 → 0**.
  smooth(8/0.015/3/12): 52 clamped, max 6.023 → **0.4957**, p99 0.090. Offset exact: **`disp_max` 0.200 ·
  `dy_max` 0.100**.
- **★ The 08-20f clearance↔despeckle fight, and it converged in ONE iteration.** First pass: despeckle 39 → 0
  ok:True, then `enforce_clearance(0.25)` pushed 224 verts (worst 0.243) → 0, and the gate came back
  **0 defects / 0 intrusions but speck_ok False with 3 hotspots** — the push re-seeded them. One round of
  (despeckle → repair_pits → clearance → gate) cleared it: hotspots 22 → 0, pits 0, clearance 10 → 0
  (worst 0.086), gate **ok:True + speck_ok:True + 0 intrusions**. Loop it; don't argue with the first result.
- **⚠ Decimate re-created the pinch sliver even though the pre-clean had already repaired it — 6th occurrence.**
  Pre-clean found 3 nm / 2 bd and fixed them to 0/0; the collapse then produced **3 nm / 2 bd again**. Manifold
  and boundary are density-INDEPENDENT must-pass checks, so this cannot ship. Repair on the decimated mesh
  (delete the 14 faces linked to the bad edges' verts → `select_non_manifold` → `fill_holes(64)` → recalc) →
  **0/0**, 249,985 faces / 124,999 v. **Then verify the recovery BOTH directions (08-20g), don't assume:**
  forward BVH max **0.0043 mm**, reverse **max 0.195 mm with 3 verts over 0.1** — and all three sit within
  **0.16 mm of the cut-A plane** (cut line z −39.93/−40.05/−39.96 at their y), i.e. the repair strip lives
  entirely on the flat cut face that presses against the bed, not on a forming surface.
- **★★ ARBITRATE SPECK HOTSPOTS AT MATCHED DENSITY — the decimate inflates the mold's sharp fraction ~1.85×
  and can flip the 08-20g verdict.** The shipped mesh reported 7 hotspots; six are clear false positives
  (gun/mold sharp ratio **1.99 / 3.46 / 2.41 / 5.52 / 3.05 / 3.59**). The seventh read **0.74** — mold
  *sharper* than the gun, which by 08-20g reads "manufactured". At PRE-DECIMATE density the same box reads
  mold **0.0267** vs gun 0.0368 ⇒ ratio **1.38**, gun sharper ⇒ false positive. Confirmed by `speck_report`
  on PRE_DEC (**0 hotspots, ok True**) and a cavity close-up showing a clean feature line, no dotted field.
  **Compare the gun against the PRE-DECIMATE mold, never against the collapsed one.**
- Shipped-mesh gate, must-pass all green: **nonmanifold 0 · boundary 0 · 0 defects · 0 intrusions.**
  Pre-decimate 0 defects down to min_depth 0.17 (6 at 0.15); falsification ceiling 0.17 + 2(0.0043) = 0.179.
- Gaps: slide flank **+0.262** · frame flank **+0.215** · top-Z **+0.248** · front-Y **+0.076**; mold clears
  the RETAINED gun on both flanks (**+0.428 / +0.218**). Dims 27.54 × 159.67 × 90.76.
- Export (folder + name confirmed), both byte-exact vs `84 + 50·TRIS`, both identity `matrix_world`:
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\HK CC9.stl` (12,499,784 B, 249,994 tris) **+
  `HK CC9 GUN.stl`** (15,983,484 B, 319,668 tris — the yaw-corrected, re-centred gun for Shapr3D).
  <!-- @anchor: v1 | failure: (a) I read the global least-squares axis fit's output as the object's pose ERROR when it is the CORRECTION (it solves for r in (n + r x n) parallel to e), which flipped the yaw sign and made the fit appear to contradict all five independent datums; (b) the decimate re-created a 3 non-manifold / 2 boundary pinch sliver even though the pre-clean had already repaired the same defect to 0/0 before decimating, and manifold/boundary are must-pass on the shipped mesh (6th occurrence of this class); (c) the 08-20g speck arbitration gave an inverted verdict on the decimated mesh (gun/mold sharp ratio 0.74 = "manufactured") for a box that reads 1.38 = false positive at pre-decimate density, because decimate-collapse inflates the mold's sharp fraction ~1.85x; 2026-09-05b | regression: cgs-mold SKILL.md Session Notes 2026-09-05b — negate the global fit's r before comparing it to datum-derived errors; decide a pose correction with the CONVERGENCE TEST (sweep the applied rotation and require the independent datums to share a common zero) rather than sign agreement alone; repair the decimated mesh's slivers and verify recovery with a BVH in BOTH directions; arbitrate speck hotspots against the PRE-DECIMATE mold, never the collapsed one -->

### 2026-09-05 — **HK SFP9-L OR** — **DONE, EXPORTED**; first CAD/Shapr3D input, and `_sight_channel_x` is wrong on it
- **★★ A NEW INPUT CLASS: a CAD model, not a scan — and VERTEX-BASED PROFILING LIES ON IT.** `HK_SFP9_L_OR`
  49,806 v / 99,628 f, watertight **0/0, 1 island**, identity matrix. Edge **p1 0.233 / p50 0.877 /
  p99 4.096 / max 12.36** — big flat faces with vertices only at their corners. My first `max Z` centre-strip
  profile alternated between 37.776 and −31 in adjacent Y bins purely because the strip caught a corner in one
  bin and nothing in the next. **Two tools replace vertex sampling on a CAD mesh:** (a) **face-normal/area
  clustering** — bin faces by their offset along an axis, area-weight their normals; (b) a **dense surface
  point cloud** (sample each triangle at ~1 pt / 0.06 mm², here 745k pts). Both are density-independent.
  Everything downstream in this session was measured on one of those two.
- **★★★ THE POSE TEST THAT SETTLES IT WITHOUT DATUM-PICKING — a GLOBAL LEAST-SQUARES AXIS FIT.** For a small
  rotation `r`, a normal maps to `n + r×n`; for every face whose nearest cardinal axis is `e`, require the two
  components perpendicular to `e` to vanish. That is **linear in r** (rows `n×u`, `n×v`; rhs `−n·u`, `−n·v`),
  area-weighted, solved by `lstsq` — one number per axis over the whole model instead of arguing between
  datums. Result at cos_tol 0.9999 (4,470 mm², 10 % of surface): **pitch +0.0079° · roll +0.0263° · yaw
  +0.0219°**, and **rms 0.0087017 → 0.0086759**, i.e. the correction removes **0.3 %** of the residual.
  **A rotation that does not move the rms is not a pose error.** Report `rms_pre`/`rms_post` every time; it is
  the guard against "fitting" a number that is really the model's own non-cardinal geometry.
- **Verdict: NO ROTATION APPLIED**, and every independent datum agreed it would be noise —
  pitch: slide-top plane (1276 mm², n=(−4.7e−4, +5.8e−5, 1.0)) **−0.003°** · slide-top-rear **+0.015°** ·
  picatinny slot floors **+0.034°** · sight line **+0.041°** · global fit **+0.008°**;
  roll: slide top **−0.027°** · rear-sight shoulders **−0.135°** · slide symmetry **−0.075°** · global
  **+0.026°** · rail floors +0.214° · frame symmetry +0.295°;
  yaw: global **+0.022°** · slide symmetry **−0.018°** · sight line **+0.036°** · flank average **+0.019°** ·
  rail mid-X −0.263°. No axis has sign consensus, and the **worst-case physical consequence is roll 0.135°
  × 35.8 mm = 0.084 mm** — 1/5 of the sweep voxel and below the 0.2 offset. ⚠ René's own picatinny annotation
  reads **+0.382°**; he labelled it "indicative only", and the rail's actual machined flats read +0.034°, so
  the annotation is a *pointer to the reference surface*, not the datum. **Measure the surface he points at.**
- **★★ `_sight_channel_x` IS WRONG ON THIS GUN BY 0.117 mm — MEASURE THE SIGHTS THEMSELVES.** The engine takes
  the 2/98 bilateral centre of `z > zmax − 0.15·H`; here H = 133.9, so that band is **z > 21.9** — the entire
  slide *and* the frame top, whose one-sided features (ejection port, controls) are exactly what the 07-03
  ruling says pull the centre off the sights. It returned **+0.047** while the sights read **−0.107**:
  front-blade bilateral centre **−0.046** and rear-notch centre **−0.168** (half-depth crossings at
  −2.076 / +1.741, notch width 3.82). Fix = run `assemble_gun_solid`, then measure the two sights on
  GUN_SOLID and apply the residual X translation (**+0.1069** here). After: blade **+0.061**, notch
  **−0.053** — they straddle X=0 and the ±0.06 residual is the two sights' own disagreement, irreducible.
  **The engine's band is a proxy; on any gun where the slide is shallow relative to grip depth, measure the
  sights.** Total scan→GUN_SOLID Δ = (+0.060008, −1.954590, +11.219530), pure translation (verified).
- **⚠ The rear-sight shoulders are CROWNED, so their face normals cannot give roll.** Left and right shoulder
  top faces read nx **+0.0285** and **−0.0410** — opposite signs, tilting away from each other, because each
  shoulder peaks ~0.15 mm at |x| ≈ 3.1 and falls off outboard. The owner's datum has to be read as the
  **height difference between MATCHED |x| positions**: mean R−L = **+0.0193 mm** over a ~8.2 mm span →
  dz/dx +0.00235 → roll **−0.135°**. Pair the shoulders; never average their normals.
- Annotations, all three at x=0, used verbatim: cut A (18.301, −41.641)→(87.913, −5.486) ⇒ m **0.519379**,
  **α 27.4464°**, b_mold **−38.91145**; cut B two points at y 87.734/87.644 → mean 87.689 → **y_mold 85.7344**
  = gun_rear + **3.90 mm**; picatinny (−98.708, 5.757)→(−44.835, 6.116). 08-27b check: **0 gun verts behind
  cut B above the cut-A plane**. **EXACT@dz=0 first try on both cuts** (A 313,712 v = 0.374×src; B 260,989 v),
  0/0. Bottom-profile cross-check: forward of the knee the mold bottom (−22.4) sits 7–26 mm **above** the cut
  line, so nothing forward of the trigger guard is touched.
- **The optic pocket is a non-issue and the reason is worth keeping.** René removed the optic in Shapr3D;
  Shapr3D healed it (0 boundary edges), leaving a floored recess at **y −32…0, 0.5–0.95 mm below** the
  forward slide top, with a dead-flat plate at **z 37.7759** from y +5…+55 behind it. `mold_top(y) =
  max over y' ≤ y` is **monotone non-decreasing**, so the recess fills from the crown forward of it and the
  plate behind it only ever steps UP. **A +Z-facing recess is filled by whatever lies FORWARD of it; only a
  feature that is higher BEHIND and lower in front could trap, and the running max forbids that.** Verified
  after the fact by the 08-27c envelope scan: **8 bad cells of 12,913**, and all 8 lie within ~1.1 mm of the
  cut-A plane (grid boundary cells) — **0 outside the cut band ⇒ no pocket, ship the plain envelope** (08-27g).
- Sweep `boot=0.4`, travel 210.0, 11 passes, **839,682 v, 8.5 s**, 0/0, edge ratio **2.33**. Pits **75 → 11 →
  0** (776 moved, mean 0.225 mm) — an order of magnitude fewer than a scan, because the source is CAD.
  smooth(8/0.015/3/12): **26 verts >0.5 mm clamped**, max 7.094 → **0.4867**, p99 0.088. `fill_dimples`
  43→9 blobs with **6 protected as real-on-gun**. Offset verified to the ruling exactly: **`disp_max` 0.200 ·
  `dy_max` 0.100** (front-Y grew 0.0999). Despeckle **ok:True, 0 hotspots before AND after**, crease assert
  green (1680/1680). `enforce_clearance(0.25)` **14 → 0** (worst 0.286), idempotent. Pre-decimate gate
  **ok:True** — 0/0, 0 defects, 0 intrusions, 0 speck hotspots.
- **★★ THE FALSIFICATION CEILING MUST USE THE FLAGGED REGION'S BVH MAX, NOT THE GLOBAL ONE — I nearly
  condemned a clean mold with my own arithmetic.** The 250k gate returned `ok:False`: 1 depth flag
  **0.289 mm at (−2.5, 57.7, 49.2)** and 2 speck hotspots. Global BVH max was 0.0229, giving a ceiling of
  0.20 + 2(0.0229) = **0.246 < 0.289** — the 08-20f test says that is a REAL defect. It is not: the global
  max comes from a different part of the mesh entirely. **In the flagged region the two surfaces are
  0.001227 mm apart** (187 verts within 4 mm), so the correct ceiling is 0.17 + 2(0.001227) = **0.1725**,
  which clears 0.289 decisively. Confirmed independently: local edge stats at the flag are **p99 3.54 /
  max 10.02 / ratio 21.4** on the shipped mesh vs **p99 0.445 / ratio 2.53** pre-decimate ⇒ the 2-ring probe's
  support balloons over ~10 mm there and reads curvature as depth (08-04c/08-20f); the pre-decimate mesh has
  **0 defects at min_depth 0.17/0.18/0.19/0.20** and its three 0.15-flags are at unrelated coordinates; and
  the cavity close-up shows crisp step edges, no crater. **Compute the ceiling from the BVH of the region you
  are arguing about.**
- The 2 speck hotspots (both left flank, y 0–20, z −20…0) arbitrated FALSE POSITIVE per 08-20g: **gun
  sharp_frac 0.0569 / 0.0309 vs mold 0.0121 / 0.0135** — the owner's clean source is **4.7× and 2.3×
  sharper** than the mold there, so the mold cannot be manufacturing specks; **0 depth flags in either box**
  on either mesh; and `speck_report(PRE_DEC)` = **0 hotspots, ok True**. Note the decimate roughly
  **quadrupled** the apparent sharp fraction (0.0033 → 0.0121) purely by lengthening edges.
- Density-INDEPENDENT must-pass on the shipped mesh, all green: **nonmanifold 0 · boundary 0 · intrusions 0**.
  Pre-clean exposed **0** non-manifold; decimate ratio 0.479, 1 iter → **250,000 faces / 250,000 tris /
  125,002 v, 0/0**; BVH vs PRE_DEC p50 0.0 · p99 0.00138 · **max 0.0229 · zero over 0.1**.
- Gaps (flat-slab, 08-08b): slide flank **+0.240** · frame flank **+0.242** · top-Z **+0.221** · front-Y
  **+0.093**. Dims 35.06 × 214.03 × 82.66. ⚠ The mold's bbox min-X sits **0.44 mm inside** the gun's — not a
  defect: both gun X-extremes (−17.856 at y 54.3 z −33.9; +17.903 at y 51.4 z −28.8) are **below the cut-A
  plane**, i.e. on the grip cut A removes (`in_keep: false`). Against the RETAINED region the mold clears by
  **+0.166 / +0.315**. **Attribute a bbox extremum to the kept region before reading it as a gap.**
- Export (folder + name confirmed with René), both byte-exact vs `84 + 50·TRIS`, both identity `matrix_world`:
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\HK SFP9-L OR.stl` (12,500,084 B, 250,000 tris) **+
  `HK SFP9-L OR GUN.stl`** (4,981,384 B, 99,626 tris).
  <!-- @anchor: v1 | failure: (a) the engine's _sight_channel_x band (z > zmax - 0.15*H) spans the whole slide AND frame top on a gun with a deep grip, so it returned +0.047 where the actual sights sit at -0.107 — a 0.117mm seam error against the 2026-07-03 ruling that the clamshell seam must run through the sights; (b) I computed the 08-20f falsification ceiling from the GLOBAL BVH max (0.0229) instead of the flagged region's own (0.001227), producing 0.246 < 0.289 and nearly condemning a clean mold as having a real defect; (c) vertex-based max/min profiling on a CAD mesh with 12.4mm flat-face edges returned alternating garbage that looked like real geometry; (d) the rear-sight shoulders are crowned so their face normals point outward in opposite directions (+0.0285 / -0.0410) and cancel, making the owner's ruled roll datum unreadable from normals; 2026-09-05 | regression: cgs-mold SKILL.md Session Notes 2026-09-05 — measure the front-blade and rear-notch centres on GUN_SOLID and apply the residual X shift after assemble_gun_solid; compute the falsification ceiling from the flagged REGION's BVH max; profile a CAD mesh with face-normal/area clustering or a dense surface cloud, never raw vertices; read the rear-sight roll datum as the height difference between matched |x| positions; run the global least-squares axis fit and report rms_pre -> rms_post before applying any rotation -->

### 2026-08-27h — **THE PUTTY EQUIVALENCE, and where the dimples actually come from (voxel-scaling table)**
- René asked how molds are "really" made and proposed the physical picture: push the gun horizontally into
  a block of putty until submerged, then cast the channel in resin. **That is exactly `sweep_dip`.** Built it
  literally to check — a 50.17 × 418.30 × 153.44 mm block, boolean-differenced by the swept solid (channel),
  then intersected (resin cast). Both 0/0. **`RESIN_CAST` ≡ `CGS_MOLD_SOLID`**: identical vertex count
  (815,008), and BVH **max 0.000009 mm in both directions**; of the channel's 815,016 verts only the cube's
  **8 corners** belong to the block's outside — the cavity wall IS the swept envelope. Production never
  builds the block: the union of the gun over the push travel is the resin positive, computed directly.
  Teaching corollary worth keeping: **the long tail cut B removes is the ENTRY CORRIDOR** the gun tunnelled through.
- ⚠ **DO NOT SHIP `sweep_dip` OUTPUT AS A "MOLD" FILE, AND DO NOT NAME IT LIKE ONE.** I exported the raw
  swept solid as `… PUTTY RESIN CAST.stl`; René opened it, saw the dimple field, and reasonably concluded the
  pipeline was broken. It is the pre-repair, pre-smooth, pre-offset, pre-cut intermediate. Any demo export
  gets an unambiguous `_RAW_INTERMEDIATE` name or does not get written at all.
- ⚠ **An offset cannot create or close a dimple** — it translates each surface along its own normal. When a
  hole report arrives blaming a missing offset, measure before agreeing.
- ★★ **THE DIMPLE MECHANISM, measured four ways — it is the 0.4 mm grid, not the scan.**
  (a) **Not in the scan:** the scan is watertight 0/0, and where the grid can resolve the surface the voxel
      remesh lands ON it — random remeshed verts to scan surface **p50 0.0 / p99 0.00001 mm**. Where it
      cannot resolve it (anything finer than the voxel — serrations, stipple, clamp detail) the remesh
      departs from the scan by **p90 1.51 / max 10.83 mm**. That gap is where dimples are born.
  (b) **Depth scales with the grid** — the decisive artefact signature, since real geometry cannot:

      | remesh voxel | pit verts (>0.25) | worst depth | depth ÷ voxel |
      |---|---|---|---|
      | 0.8 | 2,249 | 3.255 | 4.07 |
      | 0.4 | 1,187 | 1.423 | 3.56 |
      | 0.2 |   846 | 0.788 | 3.94 |

  (c) **Why the voxel is unavoidable:** the dip unions ~10 progressively shifted copies of a 144k-triangle
      shell; an EXACT boolean union of overlapping shells collapses (08-27f: 249k verts → **56**).
  (d) **What the stack removes** (this gun, raw sweep → shipped): `>0.25 mm` **277 → 0**; `0.10–0.25 mm`
      **9,735 → 327**; flank `0.10–0.25 mm` **3,510 → 6**; flank worst **0.2496 → 0.1071 mm**.
- ⚠ **HONEST LIMIT — I could not separate "manufactured crater" from "real narrow feature read through a
  voxel-sized probe", and both predict the depth-scaling above.** Evidence for the second: the 25 deepest
  flags on a remeshed scan measure **0.000 mm from the scan surface** (they sit IN real recesses — the frame
  rail slots at y≈−14 / z≈15, and the grip), and every one is **off-flank**. The running-max argument only
  forbids a concavity on a FLANK — so treat off-flank deep flags as candidate real geometry and arbitrate,
  and treat the shallow FLANK field as manufactured. Do not repeat my earlier flat claim that all are craters.
- ⚠ **A finer voxel makes corners CRISPER, not softer** — the 07-03 ruling moved 0.7 → 0.4 *because* 0.7
  rounded corners. If a future session proposes 0.25 to kill dimples, the cost is mesh size and time
  (0.2 alone gave **1.62 M verts** on the bare gun), never corner quality. Owner declined 0.25 on 08-27h.
- Rebuild of the G17 + TLR-7 from `CGS_MOLD_CUT2` (**ninth** payoff for that rollback point) with the
  canonical order: cut planes recovered from the mesh (cut A fit slope **0.26021** vs the owner's 0.26008,
  rms 0.0279 over 56 bins, b −27.83; cut B y 112.855); smooth 23 clamped max 0.431; pits 3 → 0; offset
  **dx ±0.1998/0.1999 · dz 0.1951/0.1999 · dy_front 0.0997 · dy_max 0.100**; despeckle 1 surviving hotspot
  ARBITRATED FALSE POSITIVE per 08-20g (gun sharp_frac **0.1408** vs mold **0.0314** in the box, mold depth
  flags **0**, cavity render shows feature lines not a dotted field); clearance 29 → 1 → 0; gate **ok:True**
  pre-decimate AND on the shipped mesh (0/0, 0 defects, 0 intrusions); BVH vs pre-decimate **max 1e-06 mm**.
  **248,162 faces / 496,080 tris / 248,042 v**, dims 34.073 × 193.283 × 74.245 — reproducing 08-27g exactly,
  which is itself the confirmation that the pipeline is deterministic.
  <!-- @anchor: v1 | failure: I exported the RAW sweep_dip output to the molds folder named "... PUTTY RESIN CAST.stl", and René opened it, saw the un-repaired dimple field (277 verts >0.25mm, worst 1.001mm) and concluded the skill was making holes; he then attributed the dimples to a missing 0.2mm offset, which cannot create or close a depression since an offset translates a surface along its own normal; separately I first asserted all such dimples are manufactured craters, and measurement showed the 25 deepest sit 0.000mm from the scan surface in real off-flank recesses, 2026-08-27h | regression: cgs-mold SKILL.md Session Notes 2026-08-27h — never write sweep_dip output to the molds folder without an _RAW_INTERMEDIATE name; diagnose a dimple report with the voxel-scaling table (depth proportional to voxel = artefact) plus a flank/off-flank split, never by assertion; a finer voxel sharpens corners, it does not soften them -->

### 2026-08-27g — **GLOCK 17 + TLR-7 HL-X, SECOND REJECT** — ★★★ **THE FILL WAS NEVER NEEDED. DO NOT FILL A GUN THAT DOES NOT HAVE THE 08-27c POCKET — THE DEFAULT IS THE PLAIN ENVELOPE**
- *"you are doing a bad job. You must have broken something with the skill!!!"*, three arrows on shelves
  at the light/frame junction. **First: nothing in the skill was broken** — `cgs_mold.py` was untouched
  (mtime 2026-08-20); only SKILL.md docs changed. The fault was entirely my per-run decisions.
- **★★ THE LESSON, and it is the biggest one in this file: I INVENTED A DEFECT AND THEN FIXED IT TWICE.**
  08-27c/d were written for a G34 + TLR-1 where the light HEAD is wider than the clamp behind it, so a
  +Y sweep genuinely reproduces a trapped pocket. **This gun has no such pocket** — the TLR-7's
  half-width grows monotonically rearward (11.97 → 14.8), which I measured, reported as "no pocket
  risk", and then filled anyway. Both fills produced exactly what René arrowed:
  · chord fill (08-27e) → a 6.4 mm prism over the tapering light top;
  · bounded-void column fill (08-27f) → a flat shelf at z 15.3–18.3 whose ends are lips.
  Located by rendering the mold at a known camera and converting pixels back to world (ppm =
  res_x/ortho_scale): the arrowed ledges sat at **z ≈ 18.5 and 24, y −75…−57**, i.e. ON the fill band.
  The A/B that settled it: render `CGS_MOLD_CUT2` (pre-fill) at the SAME camera — the light→frame
  transition is a clean sloped face matching the gun, no ledge, nothing to fix.
  **RULE: a fill is a REPAIR, not a pipeline stage. Run the 08-27c envelope comparison; if it shows no
  pocket, SHIP THE PLAIN ENVELOPE. Never apply a fill because the previous gun needed one.**
- **⚠ Two measurement tools that produced FALSE POSITIVES here — do not trust either alone:**
  (a) **A thin-material-span scan flags the tangential edge of every curved surface.** Rays along ±X
  near the top of a round body always return a short span; my scan reported 32 "fins" that are just the
  bezel's and dust cover's silhouette edges. It also proved the counts were **identical in
  `CGS_MOLD_SOLID`** (21 X / 40 Z) — i.e. inherent to the sweep on every gun this skill has ever
  shipped, not a regression. Use the thickness test only ACROSS a known gap (08-27d), never as a sweep.
  (b) **"mold exceeds the gun's running-max envelope" flags the trigger-guard fill and the muzzle cap**
  — 2,060 cells here, worst 9.45 mm, all legitimate sweep behaviour. It only means something inside a
  suspected pocket.
- **⚠ A morphological closing (dilate → voxel remesh → erode → voxel remesh) is NOT reversible on this
  geometry** — r = 0.9 mm grew the bbox **+0.24 X, +1.53 Y at the cut-B face, +0.49 Z**, because
  normal-displacement erosion under-recovers after the remesh changes the normals. Rejected.
- Final, rebuilt from `CGS_MOLD_CUT2` (**eighth** payoff for that rollback point) with the canonical
  order and NO fill: gate **ok:True** on the shipped mesh — 0/0, **0 defects, 0 intrusions**, enforce
  29 → 1 → 0, BVH vs gated **max 9.5e−7 mm**, offset dy 0.100 / max 0.200, **248,162 faces / 496,080
  tris / 248,042 v**, dims 34.07 × 193.28 × 74.25, slide-flank gap 0.250 · light-flank 0.086 ·
  front-Y 0.078. Both STLs byte-exact vs `84 + 50·TRIS`, identity matrices.
  <!-- @anchor: v1 | failure: OWNER REJECT #2 "you are doing a bad job. You must have broken something with the skill!!!" — I applied the 08-27c/d pocket fill to a gun that has no pocket (the TLR-7's half-width grows monotonically rearward 11.97->14.8, which I measured and reported as "no pocket risk" before filling anyway), and both fills created the ledges he arrowed: the chord version a 6.4mm prism over the tapering light top, the bounded-void version a flat shelf at z 15.3-18.3 with lipped ends; separately my thin-material-span scan produced 32 false "fins" that are the tangential silhouette edges of curved surfaces and were present identically in the raw sweep output, and a morphological closing at r=0.9mm grew the bbox +1.53mm at the cut-B face; 2026-08-27g | regression: cgs-mold SKILL.md Session Notes 2026-08-27g — a fill is a REPAIR, not a pipeline stage: run the 08-27c envelope comparison and ship the PLAIN ENVELOPE when it shows no pocket; A/B any fill against the pre-fill mesh at the SAME camera before shipping; never use a thin-span sweep or a raw envelope-excess count as a defect detector -->

### 2026-08-27f — **GLOCK 17 + TLR-7 HL-X, OWNER REJECT** — ★★★ **A CHORD FILL ACROSS A TAPERING LIGHT TOP IS THE 08-27d PRISM. THE ONLY SAFE FILL IS A BOUNDED-VOID COLUMN FILL** *(⚠ superseded by 08-27g — that fill was itself unnecessary on this gun and was rejected)*
- *"you are breaking the cgs-mold skill. What the hell are you doing!!!???"* — arrow on the light/frame
  junction. I had applied the 08-27d chord fill and buried the TLR-7's form, **the exact failure 08-27d
  exists to prevent**, one session after writing it.
- **★★ MEASURED, and it is unambiguous:** gun half-width at y −70 is **4.34** at z 16 and **6.43** at
  z 15 (the light's top TAPERS); my mold read **10.72** at z 16 — a 6.4 mm slab over 30 mm of length.
- **★★ WHY THE CHORD RULE MISFIRED — I applied it to geometry it does not describe.** 08-27d's chord
  interpolates `hw(z_lo) → hw(z_hi)` and "cannot bulge" *outside the anchors* — true, and irrelevant:
  it says nothing about what happens BETWEEN them. On the Glock 34 the anchors bracketed a narrow rail
  GROOVE whose neighbours are near-equal width, so the chord ≈ the real surface. Here the anchors were
  the light's widest lower body (11.4 at z 9.5) and the frame flank (10.3 at z 21.5) with the real
  surface tapering to **4.3** in between — so the chord filled the taper solid. **A chord is only valid
  when the surface between the anchors is MONOTONE between them. Measure the profile between the
  anchors before fitting a chord; if it dips more than ~1 mm below the chord, the chord is a prism.**
- **★★ THE FILL THAT IS ALWAYS SAFE — BOUNDED-VOID COLUMN FILL.** For each (x,y) column, ray-cast +Z
  through the mold and fill only spans of AIR that have mold material both BELOW and ABOVE. Such a span
  is interior by definition, so **the silhouette provably cannot change** — verified: bbox after the
  fill matched `CGS_MOLD_CUT2` to 4e−2 mm on every axis, and the light's flank profile now tracks the
  gun (y −70: 10.88/10.83 · 6.39/6.47). Real defect here was a **1.5–3 mm slot at z 15.3–18.3, x −4…+3,
  y −75…−40** (light top to frame underside), closed at x ±6.25 rather than the chord's 10.7.
  This is 08-27d's BORE recipe generalised, and it should be the DEFAULT fill; reach for a chord only
  after proving monotonicity.
- **⚠ An EXACT boolean union of ~1,600 small overlapping boxes DESTROYS the mesh** — it returned a
  **56-vertex** result from a 249k-vertex mold. Append the boxes into the target's bmesh with
  `bmesh.ops.create_cube` and let **`voxel_remesh` do the union**: 270,706 v, 0/0, first try.
- **⚠ Exclude the filled band from `keep_mask`** or the gate reads the intended fill as intrusions.
- Rebuild from the kept `CGS_MOLD_CUT2` (**seventh** time that rollback point has paid for itself) and
  gate-verified on the shipped mesh: **248,411 faces / 487,870 tris / 243,937 v, 0/0, 0 defects,
  0 intrusions, ok:True**, BVH vs gated **max 1.3e−5 mm**, enforce converged 5 → 0, offset dy 0.100 /
  dx 0.198 / dz 0.200, dims 34.08 × 193.35 × 74.19. Both STLs re-exported byte-exact vs `84 + 50·TRIS`,
  identity matrices.
  <!-- @anchor: v1 | failure: OWNER REJECT "you are breaking the cgs-mold skill. What the hell are you doing!!!???" — I applied 08-27d's chord fill to the TLR-7 HL-X's TAPERING light top, anchoring on the light's widest lower body (hw 11.4 at z 9.5) and the frame flank (10.3 at z 21.5) while the real surface tapers to 4.34 between them, so the chord filled the taper solid and the mold read 10.72 where the gun is 4.34 — a 6.4mm slab over 30mm, the same prism failure 08-27d was written one session earlier to prevent; I had also declared the region safe from a fin-thickness scan that structurally cannot see a fully open slot; separately an EXACT boolean union of ~1600 small boxes reduced a 249k-vertex mold to 56 vertices; 2026-08-27f | regression: cgs-mold SKILL.md Session Notes 2026-08-27f — default to a BOUNDED-VOID COLUMN FILL (fill only air spans with mold material both below and above, which provably cannot alter the silhouette; verify bbox against the pre-fill stage); use a chord ONLY after measuring that the profile between the anchors is monotone; union many small boxes by appending them into the target bmesh and letting voxel_remesh union them, never an EXACT boolean; exclude the filled band from keep_mask -->

### 2026-08-27e — **GLOCK 17 GEN5 + TLR-7 HL-X** — ⚠ **SUPERSEDED BY 2026-08-27f — the chord fill described below shipped a prism and was REJECTED. Kept for the ray_cast-staleness finding only.**
- Scan `GLOCK 17 GEN5 TLR-7 HL-X` 144,170 v / 288,664 f, watertight **0/0**, identity, canonical pose,
  edge ratio 42.9 (pits off the scan). Assemble: 4 islands → 1 kept (3 specks, bbox unchanged — checked
  after 08-20g), sight_x −0.0, y_length 201.16 preserved. `sweep_dip(boot=0.4)` travel 201.2, 10 passes,
  815,008 v, 0/0. Pits 830 → 41 → 5 → 2 → 0.
- René annotated BOTH cuts, sharing a corner point: cut A (57.77, 14.92)→(−19.32, −5.13) ⇒ m 0.26008,
  **α 14.58°** — the SHALLOWEST cut A yet (below the 43X's 15.4°); cut B mean y_scan 56.99 → y_mold
  112.855 = gun_rear − 8.0. Verified per 08-27b: 0 gun verts behind cutB above the cutA plane (rear
  extremum = grip heel at z −65.5; tang y 109.25, cleared 3.6 mm). EXACT@0 first try both cuts (0.622×src).
- **★ THE 08-27c/d POCKET CLASS CAUGHT PROACTIVELY, pre-cut scan clean but post-render not.** The
  fin-thickness scan read 0 and the light's half-width grows monotonically rearward (11.97 → 14.8), so I
  declared no pocket — then a routine hotspot cavity render showed a hard dark SLOT at (y ~−70, z ~15).
  Envelope scan confirmed: mold up to **5.2 mm inside** the gun's running-max envelope over y −78…−46,
  z 13–20, open (nulls) at z 17 — the gap between the TLR-7 body top and the frame dust cover.
  **The thickness scan alone does not cover this class** (no thin fin exists when the slot is fully open);
  the envelope comparison (08-27c) is the detector that fired. Run BOTH, always, even when the width
  profile says "monotone, safe".
- **★ Chord fill (08-27d recipe) worked, with two implementation lessons:**
  (a) **`scene.ray_cast` RETURNS STALE RESULTS after `voxel_remesh` in a prior MCP call** — it returned
  nulls at cells where the mesh provably has surface (verts at hw 11.1). The first fill only got 14/35
  rings because its ANCHORS were ray-sampled. Rebuilt sampling half-widths from **vertex cells**
  (max |x| in 0.8×0.6 mm bins) — 32/35 rings, and verification by vertex cross-sections instead of rays.
  Measure from the mesh data, not the ray API, anywhere near a remesh.
  (b) Loft rings R-side-up/L-side-down, `recalc_face_normals` before the union — first attempt without
  it left the slot untouched. After fill + voxel remesh 0.4: **0 bad cells** over the whole band.
- Despeckle first stalled ok:False at 10 clusters on the TLR-7 clamp/rail junction — arbitrated per
  08-20g: gun sharp density **0.044 vs mold 0.009** (mold 4.8× LESS sharp), quadric rms 0.628 = curved
  junction, depth 0 ⇒ false positive. After the fill's remesh the re-run read **ok:True, 0 hotspots**.
  Post-push gate flagged 6 speck hotspots — all tracing the cut-A boolean edge exactly (z = 0.26·y −
  27.7 through every box), crisp in the cavity render ⇒ edge-corner clusters, false positive.
- Push-LAST held: enforce_clearance(0.25) converged 17 → 1 → 0. Offset verified dy_front 0.0997 /
  dx 0.1999 / dz 0.1999. Decimate 284k→**248,618 faces / 471,472 tris / 235,738 v, 0/0**, BVH p99
  1e-5 / max 0.0247. Shipped-mesh gate: 0/0, **0 intrusions** (must-pass green); 5 depth flags
  0.286–0.402 all above the falsification ceiling (worst_pre 0.206 + 2·0.0247 = **0.255**) ⇒ artifacts,
  proven; both worst coordinates rendered clean.
- Export: `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\GLOCK 17 TLR-7 HL-X.stl` (23,573,684 B) +
  `GLOCK 17 TLR-7 HL-X GUN.stl` (14,426,484 B), both byte-exact vs `84 + 50·TRIS`, identity matrices.
  <!-- @anchor: v1 | failure: (a) I declared "no pocket risk" from the fin-thickness scan + a monotone width profile, and the 08-27c open slot between the TLR-7 body top and the frame dust cover (mold 5.2mm inside the gun's running-max envelope, open at z 17) was sitting there anyway — the thickness scan cannot see a fully OPEN slot, only the envelope comparison can; (b) scene.ray_cast returned stale nulls after a voxel_remesh in a prior MCP call, which broke the chord fill's anchors (14/35 rings) and faked a worse defect on re-scan; 2026-08-27e | regression: cgs-mold SKILL.md Session Notes 2026-08-27e — ALWAYS run the envelope comparison on a light gun regardless of what the width profile says; sample half-widths from vertex cells, never scene.ray_cast, after any remesh -->

### 2026-08-27d — **GLOCK 34 + TLR-1 HL, THIRD REJECT** — ★★★ **THE RAIL GROOVE MUST BE FILLED, AND A "FIX" THAT REPLACES REAL GEOMETRY WITH A PRISM IS WORSE THAN THE DEFECT**
- *"are you stupid... look at this. It resembles nothing like the actual light!!"* — the 08-27c plug was a
  **lofted silhouette PRISM**: it took each y-station's WIDEST (x_left, x_right) over ALL z and extruded it
  to a flat z-21 top. That buries the light's real form under a box. **DELETED. Never take a
  cross-section's global max width as a fill profile — that is a box by construction.**
- **★★ THE ACTUAL DEFECT, measured three ways.** Between the light's top (z 12.7) and the frame's
  underside (z 17.5), running y −86…−57, the swept mold is a **0.5–1.1 mm THIN FIN** (ray-through-the-mold
  thickness scan at z 17.5, 38 consecutive stations) with the Glock rail's cross-slots bridged into a row
  of **arch webs** — the little nubs and knife lip René arrowed. Separately the light HEAD is a **hollow
  shell**: at y −80, x 0 the column reads material −17.6…−14.5, **air −14.5…9.4 (24 mm)**, material
  9.4…12.5 — the reflector bore stayed open because it vents through the lens face, so the voxel fill
  never closed it.
- **★★ THE FIX — CHORD FILL, not a prism. Two operations, both strictly inside the silhouette.**
  1. **Groove/neck**: per y (0.4) and per SIDE, sample the half-width `hw(z)` by ray at 0.25 mm steps over
     `z ∈ [10, 20]`, then set `target(z) = max(hw(z), chord)` where chord linearly interpolates
     `hw(10) → hw(20)` — the light's flank up to the frame's flank. Box-fill `x ∈ [−targetL, +targetR]`.
     Because the chord never exceeds either anchor, **it cannot bulge**: measured growth outside the band
     was **1 cell at 0.13 mm** over the whole gun.
  2. **Bore**: column-scan `y ∈ [−90, −78]`, fill every void bounded above and below whose span lies inside
     `z ∈ [−20, 14]` (the light's own z range — the clamp is what keeps it off the rail slot).
  Then **join + voxel-remesh at 0.4** (re-uniform, or `repair_pits`' 2-ring probe is invalid — 08-04c).
  Result: thin cells at z 17.5 **gone**, at x=6 the column is now solid −16.2 → past 17, and the mold sits
  3.4–5.0 mm proud of the gun inside the groove (intended) with **±0.2 mm** residual ripple.
- **⚠ THE BAND WIDTH IS THE WHOLE FIX — a too-narrow chord leaves the nubs.** First attempt used
  `z ∈ [12, 19]`, anchored on the light's TOP LIP where `hw` is only ~3.9. That filled a **4.6 mm-wide
  neck** and the nubs at |x| 5–9 survived untouched (measured: mold top at x=6 still 11.7 with bumps to
  14.4). Anchoring at `z = 10`, where the light is still 8.1–8.7 wide, buries them. **Anchor a chord fill
  on the LAST WIDE section below the groove, not on the lip of the groove itself.**
- **⚠ `keep_mask` must exclude the filled band** or the gate reports the intended fill as intrusions:
  `keep &= ~((gy>-88)&(gy<-55)&(gz>9)&(gz<21))`.
- **⚠ The gun-envelope pocket test from 08-27c gave a FALSE POSITIVE and is what produced the prism.**
  A ±X ray that returns null is not evidence of an unfilled pocket — it is also what a real air gap
  between two parts reads like. The valid discriminators are **material THICKNESS along the ray**
  (a fin is < 1.6 mm) and **column voids bounded above and below**. Rewrite of the 08-27c rule.
- Rebuild gate-verified: **248,738 faces / 445,030 tris / 222,505 v, 0/0**, 0 defects, 0 intrusions,
  BVH vs gated **max 0.0018 mm**. Gaps: slide flank **+0.261** · light flank **+0.222** · front-Y +0.110.
  Dims 37.35 × 216.01 × 77.16. Both STLs byte-exact vs `84 + 50·TRIS`, identity matrices.
  <!-- @anchor: v1 | failure: OWNER REJECT #3 "are you stupid... It resembles nothing like the actual light!!" — the 08-27c "fix" built its fill profile from each y-station's WIDEST half-width over ALL z and extruded it flat to z=21, which is a rectangular prism by construction and buried the TLR-1's real form; the underlying real defects were a 0.5-1.1mm thin fin at z 17.5 spanning y -86..-62 with the rail cross-slots bridged as arch webs, plus a hollow light head (3mm walls, 24mm cavity) whose bore vents through the lens face so the voxel fill never closed it; and the 08-27c ray-null "pocket" test was a false positive because a null ray also reads a legitimate air gap between two parts; a first corrective attempt anchored the chord fill at z=12 (the groove lip, hw 3.9) and left every nub at |x| 5-9 untouched; 2026-08-27d | regression: cgs-mold SKILL.md Session Notes 2026-08-27d — fill a groove with a per-side CHORD between hw(z_lo) and hw(z_hi) anchored on the last WIDE section below the groove (z=10 here, not the lip), which provably cannot bulge; fill the bore as column voids bounded above and below within the light's own z range; detect these defects by ray THICKNESS (<1.6mm = fin) and bounded column voids, never by a null ray; exclude the filled band from keep_mask -->

### 2026-08-27c — **GLOCK 34 + TLR-1 HL, OWNER REJECT** — ★★★ **THE SWEEP LEAVES A CLOSED POCKET UNDER ANY OVERHANGING LIGHT, AND EVERY EXISTING GATE IS BLIND TO IT**
- *"i reimported your created mold and the gun. this is no good!!!"* — René boxed the region between the
  TLR-1's rear clamp and the light head: the mold has a **deep open slot** where the light body's
  overhang sits, i.e. a Kydex-trapping undercut. The mold I shipped that morning gated **ok on
  manifold, defects, intrusions AND specks** and still had this. That is the important part.
- **★★ ROOT CAUSE — a translational +Y sweep does NOT fill a pocket that is closed in the SWEEP
  DIRECTION.** The TLR-1's head (half-width 15.6 at z 12–18) is FORWARD of the clamp/body (half-width
  ~5–7 at the same z). Sweeping +Y drags the head's silhouette rearward, so a *rear*-facing recess
  fills — but the region between head and clamp is bounded in front by the head and behind by the
  clamp, so the running-max envelope reproduces the actual gap. **The mold is geometrically CORRECT
  as an envelope and unusable as a mold.** Measured: at z 11.5–19, y −79…−57, the mold's flanks sit
  at |x| **5.0–9.5** where the light head is **15.4**; a −X ray at (y −70, z 15) passed clean through
  **790 sample points** of open air.
- **★★ WHY NOTHING CAUGHT IT — the whole gate stack measures LOCAL surface quality, not FILL.**
  `repair_pits`/`preflight_mold` look for a vertex sunk below its own 2-ring; the pocket's walls are
  smooth and locally perfect. `despeckle_mold` looks at normal discontinuities. `enforce_clearance`
  and the parity push only check that **gun verts are INSIDE the mold** — they are; the pocket is
  *empty space between mold and gun*, which is exactly what clearance is supposed to be. **A test for
  "is the gun inside the mold" cannot detect "the mold has a hole the gun does not fill."**
  **THE TEST THAT DOES: cast a ray straight through the mold along ±X on a (y,z) grid and compare the
  first-hit |x| against the GUN's own running-max envelope over all y ahead of that point.** A null
  hit, or a mold surface materially inside that envelope, is an unfilled pocket. Ran on the shipped
  file: left flank **3 bad cells**, right flank **1221** — unambiguous.
- **★★ THE FIX — a lofted silhouette PLUG unioned into the swept solid BEFORE the cuts.** For each
  y from the light head back to where the frame takes over, take the mold cross-section's **widest
  (x_left, x_right) pair over all z** and build a 6-vertex ring (flanks vertical to z 19, then a
  1.5 mm chamfer to a flat z 21 top). Loft the rings, union EXACT, then **voxel-remesh at 0.4 to
  re-uniform the mesh** (mandatory — a boolean union leaves long faces that make `repair_pits`'
  2-ring probe invalid, the 08-04c rule). Result: pits **0/0/0 first try**, cuts EXACT first try,
  `despeckle_mold` **ok:True on the FIRST pass** (vs stalling at 9 clusters before), parity push
  **7 → 0**, pre-decimate gate fully green.
- **⚠ THE PLUG'S REAR END MUST REACH THE FRAME, NOT STOP AT THE CLAMP.** First attempt ended the loft
  at y −56 (where the light body ends). That left a 1.2 mm strip at the plug/clamp seam that
  `despeckle_mold` flagged and could not clear — a manufactured seam, not noise. Extending the ring
  range to y −46 (where the frame's own half-width exceeds the plug's) made the hotspot vanish
  entirely. **End a plug where the geometry it blends into is already WIDER than the plug, never at
  the feature boundary.**
- **⚠ Patching the EXPORTED mesh instead of rebuilding was the wrong first move and I did it anyway.**
  I unioned a plug into the decimated shipped file, which then needed a pinch repair (2nm/4bd), left
  12 depression flags at the cut plane and 7 speck hotspots, and required two boolean trims to
  reclaim the mag-release pad. **Rebuilding from `GUN_SOLID` took the same wall-clock and produced a
  clean gate.** The 08-20d rule ("don't repair the shipped mesh, repair its source") generalises: if
  the defect is upstream of the decimate, rebuild — do not patch downstream.
- ⚠ Also: `bpy.data.objects.remove()` invalidates every Python reference held across that call
  (`StructRNA of type Object has been removed`) — re-fetch objects **by name** after any removal, and
  do not hold a variable across a `sweep_dip` that deletes intermediates.
- Rebuild, gate-verified: **247,124 faces / 452,044 tris / 226,020 v, 0/0**, 0 defects, 0 intrusions,
  0 speck hotspots pre-decimate; BVH vs gated **max 0.0006 mm**; the 2 post-decimate flags at
  y 123.9 are on the **cut-B face** and clear the falsification arithmetic (pre-decimate 0 defects
  at min_depth 0.15). Gaps: slide flank **+0.261** · light flank **+0.202** · front-Y +0.119.
  Dims 37.32 × 216.02 × 77.15. Both STLs re-exported byte-exact, identity matrices.
  <!-- @anchor: v1 | failure: OWNER REJECT "this is no good!!!" — the shipped Glock 34 + TLR-1 HL mold had a deep open slot between the light head and the rear clamp, because a translational +Y sweep cannot fill a pocket bounded in FRONT by a wider feature (the light head, half-width 15.6) and BEHIND by the clamp: the running-max envelope faithfully reproduces the real gap, so the mold was a correct envelope and an unusable mold; and EVERY gate passed it — repair_pits/preflight_mold probe a vertex against its own 2-ring (the pocket walls are locally smooth), despeckle_mold probes normals, and enforce_clearance/the parity push only verify the GUN IS INSIDE THE MOLD, which is true (the pocket is empty space between them, indistinguishable from intended clearance); I then compounded it by patching the exported decimated mesh instead of rebuilding, which needed a pinch repair and two trims and still gated false; 2026-08-27c | regression: cgs-mold SKILL.md Session Notes 2026-08-27c — DETECT with a ±X ray-through-the-mold scan on a (y,z) grid compared against the gun's own running-max envelope (null hits or mold-inside-envelope = unfilled pocket); FIX with a lofted widest-cross-section silhouette plug unioned into the swept solid BEFORE the cuts, then voxel-remesh at 0.4 to re-uniform; end the plug where the adjoining geometry is already wider than the plug, never at the feature boundary; rebuild from GUN_SOLID rather than patching a shipped mesh -->

### 2026-08-27b — **GLOCK 34 + TLR-1 HL** — **DONE, EXPORTED**; the sharp-density arbitration has an inverse false-positive case
- Scan `GLOCK 34 - TLR-1 HL - GUN` 126,566 v / 253,148 f, watertight **0/0**, identity, near-canonical,
  edge ratio 84 (pits off the scan). Assemble: **4 islands, all kept**, sight_x −0.0, y_length 222.1
  (G34 long slide ✓). `sweep_dip(boot=0.4)` 11 passes, 954,906 v, **10.2 s**, 0/0. Pits 86 → 2 → 1 stall
  (16 extended + 28 gun-protected — guard working).
- René annotated both cuts: cut A (5.71, −25.99)→(77.30, −1.44) ⇒ m 0.342966, **α 18.93°**,
  b_mold −40.365; cut B mean y_scan 77.39 → **y_mold 123.82**. ⚠ Cut B sits 6.3 mm BEFORE `gun_rear_y`
  130.1 — measured before cutting: the 130.1 is the GRIP HEEL at z −60 (cut A's territory), the
  beavertail tang is y 118.4 at z 20–24, so his plane clears it by 5.4 mm and **0 gun verts sit behind
  cut B above the cut-A plane**. `cut_tail` keyed off the annotation y, not gun_rear. EXACT@0 first try
  both cuts (0.426×src, 0/0). Owner confirmed α 18.9° on the first render.
- **★ THE LESSON — the 08-20g gun-vs-mold sharp-density arbitration has an INVERSE false-positive
  case: MOLD-sharper-than-gun does NOT prove a defect either.** `despeckle_mold` stalled ok:False at
  9 compact clusters (left flank, y −38.6…−21.2, z 13–20) with mold sharp_frac **0.144 vs gun 0.071**
  — by the 08-20g rule that reads "manufactured". Three measurements said otherwise: (a) the clusters
  form **two straight rows at regular ~4.5 mm pitch** (x −11.5/z 19.5 and x −5.4/z 13.2) = rail
  cross-slot corners + TLR-1 clamp details, periodic real geometry; (b) every annulus quadric-fit came
  back **rms 1.0–1.5 mm** = heavily curved corner geometry, not a flat panel with specks (the
  patch_region validity number used as a diagnostic); (c) the cavity render shows structured feature
  lines, no dotted field, and `repair_pits`/`preflight` read **0 depth defects** there. Verdict: corner
  geometry of periodic features reads as compact sharp clusters; **periodicity + curved annulus + no
  depth signature overrides the sharp-density ratio in BOTH directions.** Shipped with speck_hotspots 2
  documented as false positive; gate ok:True on defects/intrusions/manifold.
- Push-LAST ordering (08-27 rule) held: surgical push **121 → 0 in one pass** (worst 0.165), no
  despeckle after it, gate green. Offset verified dy 0.100 / dxz 0.200 exactly.
- Decimate 317k → **247,120 faces / 438,120 tris / 219,000 v, 0/0**, BVH p99 0.00016 / max 0.0032.
  Gaps: slide flank **+0.261** · light flank **+0.219** · front-Y +0.110. Dims 37.35 × 216.00 × 77.16.
- Export: `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\GLOCK 34 TLR-1 HL.stl` (21,906,084 B) +
  `GLOCK 34 TLR-1 HL GUN.stl` (12,657,484 B), both byte-exact vs `84 + 50·TRIS`, identity matrices.
  <!-- @anchor: v1 | failure: none shipped — records that the 08-20g sharp-density arbitration is not symmetric: a mold sharper than the gun (0.144 vs 0.071) in a hotspot box was STILL a false positive, because the compact clusters were the corners of periodic real features (two straight rows at rail-slot pitch, annulus quadric rms 1.0-1.5mm = curved geometry, zero depth signature, clean cavity render); also that an annotation cut B BEFORE gun_rear_y is legitimate when the rear extremum is the grip heel below the cut-A plane — verify with the behind-and-above-plane vert count before flagging it; 2026-08-27b | regression: cgs-mold SKILL.md Session Notes 2026-08-27b — arbitrate a stalled speck hotspot by periodicity + annulus rms + depth probes, not the sharp-density ratio alone; count gun verts behind cutB above the cutA plane before questioning an owner-drawn cut B -->

### 2026-08-27 — **WALTHER PDP 4" COMPACT** (gun only) — **DONE, EXPORTED**; push-LAST ordering, and the mesh came in under budget
- Scan `PDP 4 Compact_FULL GUN` 51,558 v / 103,124 f, watertight **0/0, 1 island**, identity matrix,
  canonical pose, edge ratio 23.5 (pits off the scan). ⚠ The scene held an EXACT DUPLICATE
  (`…FULL GUN.001`, same verts/bbox) — hide it immediately or it rides into renders/exports.
- **René annotated BOTH cuts.** Cut A 2-point stroke (109.39, 58.41)→(186.82, 84.60) at x=0 ⇒
  m 0.338150, **α 18.68°** (2nd-shallowest after the 43X's 15.4°); cut B two points → mean y 189.28.
  Δ scan→mold = (+0.466, −120.309, −79.373), pure translation ⇒ b_mold **−17.270**, cut B y_mold
  **68.975** (= gun_rear 64.0 + 5.0). Owner confirmed on the first EEVEE translucent overlay.
- `sweep_dip(boot=0.4)` travel 184.2, 10 passes, 803,532 v, **7.0 s**, 0/0, post-sweep ratio in band.
  Pits 550 → 47 → 13 → stall at 8 (3 extended + 3 gun-protected — the guard working, not divergence).
  **EXACT@dz=0 first try on both cuts** (A 360,531 v = 0.449×src; B → 248,685 v, both 0/0).
- Smooth: 20 clamped → max 0.348. Offset ellipsoid verified exactly: `dy_max` **0.100**, `max_disp`
  **0.200**, front-Y +0.0999, X ±0.1998, Z +0.194/0.199.
- **★ THE ORDERING LESSON — despeckle-THEN-push, never push-then-despeckle.** The surgical
  radius-bounded push (08-20g recipe) converged **147 → 2 (0.018 mm)**; running `despeckle_mold`
  AFTER it pulled the surface back and the gate re-read 16 intrusions worst 0.216 (the 08-20f fight,
  reproduced). Correct sequence that gated green: despeckle/pits to ok → push LAST (R=1.0,
  cap depth+0.18) → `fill_dimples` for the one push-adjacent 0.27 mm depression at the muzzle corner
  → gate. **ok:True pre-decimate** (0/0, 0 defects, 0 intrusions, 0 hotspots).
- Also: built-in `enforce_clearance(0.25)` stalled at 2 confirmed with 1,182 verts moved max 0.937 —
  the surgical push again beat it (147 cleared in ONE pass at ≤0.35 mm displacement).
- **⚠ The pre-decimate mesh was ALREADY under the 250k budget** (248,045 f) — `decimate_mold` was a
  0.992-ratio near-no-op (BVH max 4e-6). A 51k-vert scan at 0.4 voxel lands under budget; don't
  expect the decimate to matter on small scans.
- Final: **247,475 faces / 493,330 tris / 246,667 v, 0/0**, gate ok on the shipped mesh. Gaps: slide
  flank **+0.281** · frame flank **+0.223** · front-Y **+0.109**. Dims 35.71 × 189.42 × 85.20.
- Export (folder confirmed = standing default), both byte-exact vs `84 + 50·TRIS`, both identity
  `matrix_world`, one frame: `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\PDP 4 Compact.stl`
  (24,666,584 B) **+ `PDP 4 Compact GUN.stl`** (5,156,284 B).
  <!-- @anchor: v1 | failure: (a) running despeckle_mold AFTER the surgical clearance push undid it — parity 2@0.018mm became 16 intrusions worst 0.216mm at the gate (08-20f clearance<->despeckle fight reproduced in the other order); (b) the push itself manufactured one 0.27mm compact depression adjacent to the pushed muzzle-corner verts; (c) an exact duplicate scan object sat in the scene and would have ridden into renders/exports; 2026-08-27 | regression: cgs-mold SKILL.md Session Notes 2026-08-27 — order the endgame despeckle->pits->PUSH-LAST->fill_dimples->gate; check the scene for duplicate objects before starting; expect decimate to be a no-op under ~55k scan verts -->

### 2026-08-20g — **GLOCK 17 GEN5 + TLR-1 HL-X** — **DONE, EXPORTED**; `enforce_clearance` DIVERGES near a step corner — replace it with the surgical radius-bounded push
- Scan `G17 GEN5 TLR-1 HL-X - SOLID GUN` 116,648 v / 233,446 f, identity matrix, canonical pose, edge
  ratio 31.2 (pits off the scan). **4 islands: main + 3 floating SPECK TRIANGLES (3–4 v), and two of
  them sat at y 81.7–81.9 INFLATING THE SCAN BBOX BY 16.9 mm** — the scan's Y-span read 229.4 but the
  real gun is 212.5. A 3-vert island IS its own 3-edge "boundary loop"; I first read those loops as
  benign holes on the main island. `assemble_gun_solid` dropped them and the true span appeared.
  **Check whether a bbox extremum belongs to a kept island before quoting any span.**
- Assemble 0/0, sight_x −0.0, `front_feature_z 7.9` (TLR-1 bezel leads). `sweep_dip(boot=0.4)` travel
  212.5, 11 passes, 896k v, **9.5 s**, 0/0, post-sweep ratio 2.34. Pits 291 → 31 → 6 → 3 → 0.
- Knee textbook: plateau −11.06 dead flat y −98…+37.97, corner **(37.97, −11.06)**. Beavertail banded:
  tang ridge **(102.87, z 30.0)**; grip heel is the global rearmost at y 114.5 below z −20 — excluded.
  → **α 38.19°**, owner-confirmed first render. **EXACT@dz=0 first try on both cuts** (A 313,991 v =
  0.350×src; B at y 108.9 → 293,819 v, both 0/0).
- Smooth: 21 clamped → max 0.455. Offset ellipsoid verified: `dy_max` exactly **0.100**, `max_disp`
  exactly **0.200**, front-Y +0.0995, X/Z +0.200.
- **★★ THE LESSON: `enforce_clearance` DIVERGED on this gun — twice, two ways — and a surgical push
  fixed in 10 iterations what it made worse in 7.** (a) At clearance 0.25 it pushed 4,225 verts (max
  1.34 mm) and manufactured a **+0.75 mm BLISTER** at the TLR-1 clamp's step corner (mold xmax 18.56 vs
  gun 17.61+0.2 plateau) that then gated as a 0.45 "depression" — the flagged depression was the correct
  surface NEXT TO the blister. (b) Re-run at clearance 0.12 it went 58 → 63 → 71 → 77 intrusions with
  worst RISING 0.188 → 0.295 and defects reappearing (2, 6, 3, 4). Rolled back to `CGS_MOLD_CUT2`
  (SIXTH payoff) — the rebuild reproduced every number exactly and showed **0 defects without enforce**,
  proving the blister was enforce's own product. **THE FIX: parity-scan the keep-masked gun verts, then
  push ONLY mold verts within R=1.0 mm of a confirmed intruder along the GUN's local normal by
  smoothstep-weighted (depth+0.08..0.10), hard-capped at depth+0.15..0.18** — converged monotonically
  **269 → 34 → 11 → 7 → 4 → 3 → 1 → 0**, gate `ok:True` (0 defects / 0 intrusions) pre-decimate.
  The cap tied to each intruder's own depth is what makes blistering impossible.
- **★★ `despeckle_mold` ok:False can be a FALSE POSITIVE on a feature-dense light body — arbitrate with
  the GUN'S OWN SHARP DENSITY.** Two hotspot panels survived (y −76…−53, z 11–20, both flanks) exactly
  where the TLR-1's battery door / side plate / clamp screws live. The decisive numbers: gun sharp_frac
  in those boxes **0.30 / 0.41** vs mold **0.035 / 0.109** — the mold carries 3–9× LESS sharp content
  than the owner's clean scan there, so it cannot be manufacturing specks; and `fill_dimples`' arbiter
  independently protected 22 blobs as real-on-gun. Cavity renders confirmed the clusters ride the real
  panel lines. **A hotspot verdict on a panel where the GUN is sharper than the MOLD is the test
  misreading features, not a defect — measure both sides before "fixing" anything.**
- **⚠ MY OWN WORST MOVE: a two-stage bmesh repair where stage 1 writes and stage 2 can fail leaves a
  half-repaired mesh.** The pinch-sliver repair (decimate left 3 nm / 2 bd, 5th occurrence) deleted the
  bad faces, wrote back with `bm.to_mesh`, THEN died on `mode_set` ("Cannot edit hidden object" — PRE_DEC
  dup + render hides). The re-run then saw **871 "bad" edges** (the open boundary of my own deletion) and
  deleted 753 more faces before filling. Recovery was verified, not assumed: forward BVH final→PRE_DEC
  max **0.0003 mm**; reverse showed 217 verts >0.1 (max 0.73) and EVERY one sits within ±0.32 mm of the
  cut-A/B planes — the repair strip lives entirely on the flat press-bed waste faces. **Unhide everything
  BEFORE a multi-stage repair, and BVH both directions after any non-trivial refill.**
- Shipped-mesh gate, density-split per 08-20f: **nm 0 / bd 0 / intrusions 0** (must-pass, passed). 5
  flagged "defects" 0.255–0.298 all within ±0.3 mm of the cut planes (edge ratio 9.7 → probe invalid
  there; falsification worst_pre 0.225 + 2·bvh 0.0003 clears nothing ON the strip, but the strip is the
  measured repair sag on non-forming faces; cavity renders clean). Gaps: slide flank **0.275** · light
  flank **0.228** · top-Z 0.246 · front-Y **0.077** (bezel extreme vertex nibbled by collapse; forming
  surface holds per BVH). Dims 37.45 × 207.04 × 86.96. **246,459 faces / 224,970 v** — ⚠ mixed quad/tri:
  449,940 TRIS, so the STL is 22.5 MB (check bytes vs TRIS, never faces).
- Export (folder confirmed = standing default), both byte-exact vs `84 + 50·TRIS`, both identity
  `matrix_world`, one frame (mold front-Y 0.077 ahead, min-X 0.208 outside):
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\GLOCK 17 TLR-1 HL-X.stl` (22,497,084 B, 449,940 tris)
  **+ `GLOCK 17 TLR-1 HL-X GUN.stl`** (11,672,084 B, 233,440 tris).
  <!-- @anchor: v1 | failure: (a) enforce_clearance diverged BOTH ways on the G17+TLR-1 — at 0.25 it manufactured a +0.75mm blister at the light clamp's step corner (4,225 verts moved, max 1.34mm) whose neighbouring correct surface then gated as a 0.45mm "depression", and at 0.12 it drove intrusions 58->77 with worst rising 0.188->0.295 while re-creating defects each pass; (b) despeckle_mold's ok:False flagged two feature-dense TLR-1 panels where the gun's own sharp_frac (0.30/0.41) is 3-9x the mold's (0.035/0.109) — a false positive that "fixing" would have flattened real geometry; (c) a two-stage bmesh repair wrote its face-deletion then died on a hidden-object mode_set, leaving 871 open edges the re-run treated as new damage; (d) two 3-vert speck-triangle islands inflated the scan bbox 16.9mm and read as benign boundary loops; 2026-08-20g | regression: cgs-mold SKILL.md Session Notes 2026-08-20g — replace a diverging enforce_clearance with the surgical parity->radius-bounded->depth-capped push (cap = depth+0.15 makes blistering impossible); arbitrate speck hotspots by comparing gun vs mold sharp density in the same box; unhide all meshes before multi-stage repairs and BVH both directions after; attribute bbox extrema to their island before quoting a span -->

### 2026-08-20f — **SIG SAUER ATC "ROCK 5"** — **DONE, EXPORTED**; the gate itself is density-dependent
- New gun family (SIG ATC, P226-pattern hammer-fired competition pistol), fed straight from a `cgs-align`
  run in the same session. ⚠ René **decimated and renamed** the object between the two skills
  (1,464,754 v → `ATC ROCK 5 GUN - OWN SCAN`, 146,448 v / 292,956 f) — the hardcoded name from the align
  run threw `KeyError`. **List the scene, don't assume the object survived under its old name.** Dims
  42.923 × 220.96 × 149.69 matched the aligned pose to 0.007 mm, watertight **0/0, 1 island**, identity
  matrix, no annotations. Scan edge ratio p99/p1 = **10.0** ⇒ `repair_pits` correctly skipped on the scan.
- Assemble 1/1 island, `sight_x_post 0.0` / `mass_x_post −0.002`, `front_feature_z 35.8` (muzzle drives
  the front, no light). `sweep_dip(boot=0.4)` travel 221.0, 11 passes, 991,396 v, **10.6 s**, 0/0,
  post-sweep edge ratio **2.35**. Pits **223 → 39 → 6 → … → 0**, 2,591 verts moved (0.26 %), mean 0.21 mm.
- Knee off the MOLD's running-min bottom, taking the LAST flat bin: plateau −22.36…−22.47 from y −18 to
  **+12**, then 13 → −22.86, 14 → −24.00, continuous ⇒ corner **(12.0, −22.357)**. Beavertail from the
  GUN's banded rear silhouette: a clean local ridge at **(90.42, z 18.0)**, receding to 89.50 below and
  87.46 above; the grip heel only reaches 86.03, so no 08-04c heel trap and `gun_rear_y` IS the beavertail.
  → **α 32.71°**, owner-confirmed on the first cut-confirm render. **EXACT@dz=0 first try on both cuts**
  (A 329,464 v = 0.332×src; B at y 96.419 → 290,264 v, both 0/0). Post-cut-A `max_y` 168.4 sat well past
  cut B's plane — the healthy signature, and the direct inverse of the 08-20 over-cut tell.
- **★★ THE LESSON: `preflight_mold`'s OWN depression probe is density-dependent, and the 08-04c
  edge-ratio rule governs the GATE, not just `repair_pits`.** The pre-decimate mesh gated **ok: True**
  (0 defects, 0 intrusions, 0 speck hotspots); the 250k decimate then reported **7 defects at
  0.255–0.396 mm and 13 speck hotspots** — while the BVH between the two surfaces was **p99 0.0015 /
  max 0.0285 mm, zero verts over 0.1**. Both are readings of the same geometry, so one of them is a
  ruler problem. Edge stats named it: decimated **p99 5.10 mm, ratio 23.9** vs pre-decimate **0.43,
  ratio 1.9** — collapse leaves long edges on flats, the 2-ring support balloons, and curvature reads
  as depth. **The falsification test that settles it in 20 s** (now pipeline step 5f): re-gate the
  pre-decimate mesh at descending `min_depth` (worst real depression **0.196 mm**; 0 defects at 0.20,
  26 at 0.15), then `worst_pre + 2·bvh_max` = **0.253 mm** is the ceiling for the shipped mesh — below
  every claimed 0.255–0.396. Artifact, proven. Cavity renders at the two worst coordinates were clean,
  confirming it a second way. **Split the gate: manifold + intrusions must pass on the mesh you ship
  (they did, 0/0 and 0); defects + specks are read pre-decimate and validated by BVH.**
- **⚠ MY OWN WORST MOVE: I ran `patch_region` on a 4.09 mm flank flag without reading its
  `annulus_rms`.** It came back **0.719 mm** (the 08-20d success was 0.0095) — i.e. the annulus was a
  curved junction, not a flat panel — and the "restoration" pushed 350 verts up to **2.899 mm**, opening
  **174 intrusions at 2.001 mm**; `enforce_clearance` then stalled at 232 → 179 → 179 trying to undo it.
  Rolled back from `CGS_MOLD_CUT2` (kept all session) and the rebuild reproduced every prior number
  exactly — **fifth time that rollback point has paid for itself**. `annulus_rms` is now a documented
  accept/reject gate on that function.
- **⚠ And the flag I patched was REAL GEOMETRY, which one probe would have told me.** Gun probe at
  (16.5, 8.8, −12.5): nearest gun vertex **0.209 mm**, local normal **(−0.38, 0.83, −0.41)** ⇒
  **|n_y| 0.83, not a flank** (`flank_nx` 0.70). The running-max argument that forbids a flank
  depression does NOT extend to a Y-facing surface: on a +Y sweep, recesses facing +Y are the trailing
  side and are correctly left open. **Read the gun's local NORMAL before invoking the flank rule** —
  "it's on the side of the gun" is not the same as "|n_x| > 0.7". After the clean rebuild the gate
  found 0 defects there anyway.
- **⚠ `enforce_clearance` and `despeckle_mold` fight each other — loop them, don't run them once.**
  Clearance pushes the surface out (5,626 verts) and re-seeds specks; despeckle pulls it back and
  re-opens intrusions. Sequence measured: clearance-then-despeckle left **228 intrusions**; two
  iterations of (clearance → despeckle → repair_pits → gate) converged **228 → 40 → 0** with specks
  11 → 2 → 0. Run clearance LAST as the canonical order says, but iterate until the gate is green.
- Offset verified by the ruling's own two numbers: `dy_max` exactly **0.100**, `max_disp` exactly
  **0.200**; front-Y grew **0.0998**, top-Z **0.200**, max-X **0.1976**. ⚠ Do NOT read the rear cut
  face's Y growth off the bbox — its extreme vertex is a mixed-normal corner (read 0.044), and
  measuring the face against the NOMINAL cut plane conflates smooth drift with the offset. The rear
  face is an open boundary with no gun behind it (6 mm of cut-B margin), so it carries no clearance
  requirement; the muzzle end is the Y number that matters.
- `smooth_mold(flat_pairs=8, deburr_thr=0.015, deburr_rings=3, deburr_pairs=12)`; **20 verts >0.5 mm**
  clamped → max 0.4966, p99 0.086. **Twenty-two-for-twenty-two on the clamp.** Pre-clean exposed **0**
  non-manifold; decimate ratio 0.431, 1 iter → **250,000 faces / 125,002 v, 0/0**.
- Final gaps: slide flank **0.272** · frame flank **0.239** · front-Y **0.113** · top-Z 0.352 (thin
  front-sight blade, the 08-04c signature). Dims 43.30 × 227.15 × 96.81.
- Export (folder + name confirmed with René), both byte-exact vs `84 + 50·TRIS`, both identity
  `matrix_world`, both in one frame (mold front-Y 0.113 ahead of the gun's, min-X 0.184 outside):
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\ATC ROCK 5.stl` (12,500,084 B, 250,000 tris)
  **+ `ATC ROCK 5 GUN.stl`** (14,647,884 B, 292,956 tris).
- **Owner viewport confirm pending.**
  <!-- @anchor: v1 | failure: (a) I ran patch_region on a 4.09mm flag without reading its annulus_rms, which came back 0.719mm (vs 0.0095mm on the 08-20d success) meaning the annulus was curved geometry and the quadric had no valid reference — it pushed 350 verts up to 2.899mm and opened 174 intrusions at 2.001mm that enforce_clearance stalled on at 232->179->179; (b) the flag was real Y-facing geometry (nearest gun vert 0.209mm, |n_y| 0.83) and I applied the flank running-max argument to a surface that is not a flank; (c) preflight_mold's own depression and speck checks are density-dependent like repair_pits — on the 250k decimated mesh (edge p99 5.10mm, ratio 23.9 vs 1.9 pre-decimate) it reported 7 defects at 0.255-0.396mm and 13 speck hotspots on a surface whose BVH deviation from the gated mesh is max 0.0285mm, i.e. pure probe artifact; (d) enforce_clearance and despeckle_mold undo each other and a single pass left 228 intrusions; 2026-08-20f | regression: cgs-mold SKILL.md pipeline step 5f — split the gate into density-independent (manifold/intrusions, must pass on the shipped mesh) and density-dependent (defects/specks, read pre-decimate + BVH) checks, with the worst_pre + 2*bvh_max falsification test; reject any patch_region whose annulus_rms is not well under the defect depth; read the gun's local normal before invoking the flank rule; loop clearance<->despeckle until the gate is green -->

### 2026-08-20e — **MAGAZINE offset corrected +0.2 → +0.1 mm** (owner ruling)
- René: *"Magazines: Change from 0.2 to 0.1"*. Third value in this chain: 0.4 (08-01/08-03, inherited
  from the gun) → 0.2 (08-04, "too loose") → **0.1**. MAGAZINE CARRIERS ruling 4 amended; the GUN
  pipeline's 0.2 XZ / 0.1 Y ellipsoid is untouched.
- **The doubling is why the numbers keep coming down.** A normal offset moves BOTH flanks, so the
  quoted figure doubles across the retained dimension of a ~20 mm-wide prism: 0.4 → 0.8 mm (4 %, fell
  out), 0.2 → 0.4 mm, now 0.1 → **0.2 mm (1 %)**. A mag pouch retains a smooth constant-section body by
  side friction alone, with no trigger-guard detent to hold it — so it wants far less comp than a
  holster does.
- **Magazines stay ISOTROPIC — ruled, not assumed.** The gun's anisotropic split exists because a
  holster's draw axis carries the muzzle face and the trigger-guard detent. A magazine mold has exactly
  one Y-facing surface (the feed-lip end); the other Y face is the open cut at the basepad. So the
  split would change nothing measurable, and the isotropic `offset_mold(z_line=zmin-10, offset=0.1)`
  stays. Recorded explicitly so a future session does not "harmonise" the two rules.
- ⚠ **Both shipped magazine molds are superseded**: `Glock 43x Magazine 0.2.stl` and
  `SPHINX SDP STANDARD_COMPACT_MAG CARRIER 0.2.stl`. Re-cut is deterministic (offset is the only
  variable; the 08-04 run reproduced the pose/cut/sweep exactly) — flagged, owner's call.
- ⚠ **The magazine path has NOT yet been run through `preflight_mold`.** Its gate is written for a gun
  (`keep_mask` derives from cut A's plane and cut B). Before the next magazine job, set `keep_mask` to
  the retained BODY band and re-verify the arbiter's flank rule holds on a constant-section prism.
  Not assumed to work — untested.
  <!-- @anchor: v1 | failure: none shipped — records the third magazine offset value in three weeks (0.4 -> 0.2 -> 0.1) and the mechanism behind the ratchet (a normal offset doubles across the retained dimension of a ~20mm prism, and a mag pouch retains by side friction alone with no detent), plus the explicit ruling that magazines stay ISOTROPIC while guns are anisotropic so the two rules are not later harmonised by assumption; 2026-08-20e | regression: cgs-mold SKILL.md MAGAZINE CARRIERS ruling 4 + the Parameters constants table + Track-B memory cgs-mold-magazine-carriers -->

### 2026-08-20d — **G19 + GTL II, FOURTH REJECT** — the pre-export gate, and why it exists
- *"look better, but there is still one hole! You need to STOP wasting my time and STOP guessing and
  START to check your work BEFORE you submit files!!!"* The process criticism is the correct one: three
  molds shipped with defects that a measurement would have caught in seconds. I had been looking at
  renders and reasoning about mechanisms instead of running a pass/fail check on the file being written.
- **★★★ `preflight_mold` — the mandatory gate, pipeline step 5f.** On the very first run it flagged
  exactly the hole he circled — **(13.7, −50.6, 8.4), depth 0.699, diag 3.73** — and after the fix it
  returns `ok: True` on the decimated mesh. It is not a heuristic: manifold + gun-arbitrated depression
  clustering + ray-parity enclosure + speck audit, returning the COORDINATE of anything that fails.
- **★★ WHY THE HOLE SURVIVED THREE PASSES: a size limit, not a logic error.** The slot is **4.08 mm**
  across; `repair_pits` (max_diag 2.5) and `fill_dimples` (3.0) both classify anything bigger as an
  EXTENDED real crease and never touch it. But on a FLANK the running-max argument forbids a depression
  of ANY size, so the size limit must be relaxed there — `max_diag_flank=9.0`, gated by `_flank_hint`.
  Proof it was manufactured, measured before touching it: mold `xmin` **12.93** in one 0.5 mm bin
  against 13.87–14.05 either side, while the gun ran a smooth 13.52 → 13.07 ramp through the same band
  with **no dip at all**. Same probe also confirmed the sweep correctly FILLED the gun's genuine recess
  at y −47 (gun xmin 8.05, mold flat) — the running-max rule verified in both directions on one gun.
  ⚠ `max|x|` per Y-bin is blind to this (08-03 rule) — it read smooth on both meshes. Sample the
  surface's MINIMUM inside the suspect band instead.
- **★ A big fill leaves a residual seam that the depth gate passes but the eye still sees.** After
  `fill_dimples` closed the slot, depth fell under `min_depth` yet a thin dark line remained under
  cavity light. `patch_region(mold, ctr, r_in=3.6, r_out=5.6, iters=2)` — a forced annulus-quadric
  restoration with no arbiter of its own — cleared it (231 verts, max 0.145 mm, annulus rms 0.0095).
  Use it only where the defect is PROVEN manufactured; the arbiter is the caller's job.
- **★ Enforce the clearance margin BEFORE the decimate, not after.** `clearance=0.25` pre-decimate then
  collapse → gate clean, BVH max **0.013 mm**. Doing it post-decimate instead moved 1,268 verts and blew
  BVH deviation to max **0.313 mm** with 96 verts over 0.1 — fixing a 0.055 mm intrusion by perturbing
  the surface 6× more than the intrusion. Don't repair the shipped mesh; repair its source.
- Final, gate-verified: **250,000 faces / 125,002 v, 0/0, 0 defects, 0 intrusions.** BVH vs gated
  p99 0.00045 / max 0.0129 / zero over 0.1. Gaps slide flank 0.287 · frame 0.198 · light 0.274 ·
  top 0.240 · front-Y **0.113**. Dims 34.32 × 183.25 × 80.18. Both STLs byte-exact, identity matrix.
  <!-- @anchor: v1 | failure: OWNER REJECT #4 "there is still one hole! ... STOP wasting my time and STOP guessing and START to check your work BEFORE you submit files!!!" — a 4.08mm x 0.70mm-deep slot on the light flank shipped in three consecutive exports because repair_pits (max_diag 2.5) and fill_dimples (3.0) both classify anything larger as an extended real crease, and because I was judging finished molds by eye from renders instead of running a pass/fail measurement on the file being written; also (a) max|x| per Y-bin reads smooth over a recess so it could not find it, (b) after the fill a residual seam remained that the depth gate passed but was plainly visible under cavity light, (c) fixing the last 0.055mm intrusion AFTER decimating perturbed the surface 6x more than the intrusion itself; 2026-08-20d | regression: cgs-mold SKILL.md pipeline step 5f — assert preflight_mold(...)["ok"] on the DECIMATED mesh immediately before export; max_diag_flank=9.0 via _flank_hint; patch_region for residual seams; enforce_clearance(clearance=0.25) BEFORE the decimate -->

### 2026-08-20c — **G19 + GTL II, SECOND REJECT** — the gun becomes the arbiter; Y offset 0.1
- *"Still problems with pimples/holes. And add 0.1 on Y AXIS."* He circled ~8 marks on both rear frame
  flanks. Measured: **real craters up to 1.37 mm** (x ±14–16, y 31–67, z 12–32) — not shading.
- **★★ RULING — the offset is no longer Y-free: 0.2 in XZ, 0.1 in Y.** `offset_mold_xz` is now a true
  anisotropic **ellipsoid** Minkowski offset with semi-axes (0.2, 0.1, 0.2):
  `p + (a²nx, b²ny, c²nz)/sqrt(a²nx²+b²ny²+c²nz²)`. Exactly 0.2 on a pure X/Z face, exactly 0.1 on a
  pure Y face, correct blend everywhere between — and it deletes the `min_l` ramp constant the
  zero-Y version needed. Verified: front-Y gap **0.113**, XZ flank gaps 0.198–0.287.
- **★★ ROOT CAUSE OF THE REMAINING CRATERS — my own 08-20b fix caused them.** Giving `repair_pits`
  `protect_creases=True` stopped the light gouge but made it STALL at ~48 unrepaired craters, because
  on a stippled/engraved region every sharp vert connects into ONE giant "extended" cluster and the
  whole area gets protected. The morning's UNCAPPED run had produced a visibly clean flank; its only
  sin was one 2.08 mm gouge. **So the guard was aimed at the wrong thing: not "creases", but "real
  geometry on the gun".** Fix = `_gun_arbiter`, see pipeline step 2a. Result: `repair_pits` converges
  **57 → 2 → 0** while protecting **exactly 1** blob — the light/dust-cover crease.
- **★ Three plausible tools that did NOT work, each for an instructive reason** — recorded so they are
  not retried: `beautify_fill` (topology-only, 3→4 hotspots: the faceting was too-few-triangles, not
  slivers) · `repair_specks` (these marks are BRANCHED, so its compactness test files them as real
  creases and freezes them) · `smooth_flank_field` (cleared two marks and left a new stepped seam at
  the box boundary — a grid resample fights the region edge).
- **★ A blob's mean vertex normal is a bad orientation estimate.** Inside a crater the wall normals
  cancel, so a flank crater reads |nx| ≈ 0.3 and dodges a flank rule. Use the ANNULUS's best-fit plane.
  Five marks survived three passes before this was found.
- `fill_dimples` (new): annulus-QUADRIC fill for blobs, needle mode for 1–3 vertex spikes, both gated
  by `_gun_arbiter`. A quadric is required — a PLANE fit reads the flank's curvature as roughness and
  rejected 151/151 candidates on the first attempt.
- Final chain: smooth+clamp(84) → `repair_pits(gun)`×3 → `fill_dimples(gun)` → `offset_mold_xz(0.2,0.1)`
  → `repair_pits(gun)` → `despeckle` (70→0, ok) → `fill_dimples` → `enforce_clearance` (91→3→**0**)
  → pre-clean (0 nm) → decimate **250,000 faces / 125,002 v, 0/0**.
  BVH vs gated p99 **0.00044** / max 0.0129 / zero over 0.1. Intrusions **1** of 54,173 at 0.055 mm.
  Gaps: slide flank 0.287 · frame flank 0.198 · light 0.448 · top 0.240 · front-Y **0.113**.
  Dims 34.32 × 183.25 × 80.18. Both STLs byte-exact, identity `matrix_world`.
  <!-- @anchor: v1 | failure: OWNER REJECT #2 "Still problems with pimples/holes" — the 08-20b protect_creases guard I had just added to stop the light gouge caused a NEW defect class: on a stippled/engraved region every sharp vertex connects into one giant "extended" cluster, so repair_pits protected the whole area and stalled at ~48 unrepaired craters up to 1.37mm on both rear frame flanks, which then shipped; the guard was aimed at "creases" when the real invariant is "geometry that exists on the owner's clean gun scan"; also (a) a PLANE fit arbiter rejected 151/151 craters because it read flank curvature as roughness, (b) an ABSOLUTE gun-flatness threshold called the grip stipple real (rms 0.6-0.7) and protected craters sitting on it, (c) a blob's mean vertex normal reads |nx|~0.3 inside a crater so the flank override missed five marks for three passes, (d) beautify_fill, repair_specks and smooth_flank_field were each tried and each failed, the last one introducing a new stepped seam; 2026-08-20c | regression: cgs-mold SKILL.md pipeline step 2a + Session Notes 2026-08-20c — pass GUN_SOLID into repair_pits and fill_dimples; _gun_arbiter = flank-override OR detached OR signal-to-noise on a local QUADRIC fit; protect_creases defaults False; derive blob orientation from the annulus plane -->

### 2026-08-20b — **GLOCK 19 GEN5 + GTL II, OWNER REJECT + RE-CUT** — four rulings, three real defects
- *"The mold you made is unacceptable. The gun and light are clean stl, yet you make holes, pimples
  etc. And you are cutting stuff away it seems. What the hell is going on!!!???"* He then overlaid his
  gun (blue) on the mold and diagnosed it himself: **"You seem to only have made the 0.4 on the top
  section but not the bottom section."** He was right, and it was the inherited rule, not a slip.
- **★★ RULING 1 — the offset is XZ-only, whole mold, and the value is 0.2.** See pipeline step 5.
  Three messages, converging: XZ-only-never-Y → 0.3 → **0.2**. `offset_mold_xz` reports
  `dy_max 0.000000` and a byte-identical Y extent; achieved clearance measured on the export is
  **slide flank 0.303 · slide top 0.265 · light 0.553 · outer-surface slab gaps 0.198–0.287**.
- **★★ RULING 2 — the face budget goes 123,000 → 250,000.** See pipeline step 5d.
- **★★ DEFECT 1, "cutting stuff away" = `repair_pits` with NO displacement cap.** On the swept solid
  it reported a healthy `mean_disp_moved_mm` 0.207 while a single outlier moved **2.082 mm** — 5× the
  voxel — and gouged the mold at the light/dust-cover junction (x ≈ 8–9, y ≈ −47, z ≈ 7–10). 25
  Laplacian iterations at factor 0.6 do not "melt a crater" when the blob sits in a tight concave
  crease; they collapse the crease. **The compactness discriminator cannot catch this — a crease
  CORNER is genuinely a compact cluster.** Fix (now in the engine): a per-vertex cap of
  `1.25·|d_i| + 0.15` (a vertex may only move about as far as its own measured pit depth), a
  `total_cap`, and `protect_creases` which removes every vertex of an EXTENDED sharp cluster from the
  mask. Post-fix: 17,985 crease verts protected, max displacement 1.2, and the light-flank gouge gone.
  ⚠ Side effect to expect and ACCEPT: with creases protected the pit count no longer converges to 0
  — it stalls (948 → 539 → 520, then 199 after the cuts). Those residuals are the voxel **crease
  zigzag**, which is `smooth_mold`'s pass-2 job, not a crater. **A non-zero `defect_verts` is only
  alarming when it is RISING (08-04c); a stall on protected creases is the guard working.**
- **★★ DEFECT 2, "pimples" = the decimate, and my gate was on the wrong mesh.** Pre-decimate
  `despeckle_mold` → **0 hotspots, ok:True**; the 123k export → 4 hotspot regions and visible facets.
  Full mechanism in pipeline step 5d. **Gate pre-decimate AND render the decimated mesh.**
- **★★ DEFECT 3, concave-pocket shrink = `enforce_clearance`.** New stage, see pipeline step 5b,
  including the blanket-version failure (42,305 verts, non-convergent, +4.4 mm) that must not return.
- **★ THE MEASUREMENT LESSON: a nearest-point normal-sign probe LIES inside concave pockets.** It
  reported 298 gun verts outside the mold with a **10.7 mm** worst case; a 5-ray parity test confirmed
  **117** and 1.63 mm. Screen with the sign (cheap), confirm with parity (truth). And exclude the
  region cut A/B legitimately removes before reading any enclosure number — unfiltered, the grip
  alone contributes 33,000 "outside" verts at up to 62 mm and buries the real signal.
- ⚠ **I destroyed the gated mesh with the blanket clearance experiment and had to rebuild.**
  `CGS_MOLD_CUT2` was still in the scene, so smooth → clamp → pits → offset → pits → despeckle
  reproduced the prior numbers EXACTLY (84 clamped, 58/48/48 pits, 42 → 0 hotspots). **Keeping the
  pre-smooth cut mesh for the whole run is the rollback point — third time it has paid for itself
  (08-17b, 08-17b again, here).**
- Final: **250,000 faces / 125,002 verts, 0/0**, BVH vs the gated mesh p99 **0.00046** / max 0.0154 /
  zero over 0.1. Intrusions 31 of 54,173, worst 0.47 mm, **all on Y-facing front surfaces where the
  ruling says there is no clearance** — correct, not residual damage. Dims 34.46 × 183.09 × 80.32.
- Export overwrote the morning's pair, both byte-exact vs `84 + 50·TRIS`, both identity `matrix_world`:
  `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\GLOCK 19 GEN5 GTL II.stl` (12,500,084 B, 250,000 tris)
  **+ `GLOCK 19 GEN5 GTL II GUN.stl`** (9,152,084 B, 183,040 tris).
  <!-- @anchor: v1 | failure: OWNER REJECT "The mold you made is unacceptable ... you make holes, pimples etc. And you are cutting stuff away" — (a) offset_mold's z_line region left the dust cover, trigger guard and the ENTIRE WEAPON LIGHT at 0.000 clearance, which his own gun-vs-mold overlay exposed before I did; (b) repair_pits had NO displacement cap and a single outlier moved 2.082mm (5x the voxel), gouging the light/dust-cover junction, while its mean stayed a healthy 0.207 and the compactness test passed the blob because a crease CORNER is genuinely compact; (c) despeckle_mold gated the PRE-DECIMATE mesh at 0 hotspots / ok:True and the 123k decimate then re-created 4 hotspot regions plus visible faceting that shipped; (d) my first fix attempt — a blanket "push every mold vertex closer than clearance to the gun" — selected 42,305 verts (17% of the mesh), failed to converge over 3 rounds, inflated the mold 4.4mm and destroyed the gated mesh; (e) a nearest-point normal-sign intrusion probe reported 298 verts out with a 10.7mm worst case when ray-parity showed 117 and 1.63mm; 2026-08-20b | regression: cgs-mold SKILL.md pipeline steps 5 / 5b / 5d + Session Notes 2026-08-20b — offset_mold_xz (assert dy_max==0.0), repair_pits depth-tied cap + protect_creases, enforce_clearance driven by parity-confirmed failures only, 250k face budget, render the DECIMATED mesh not just the gated one, keep CGS_MOLD_CUT2 as the rollback point -->

### 2026-08-20 — **GLOCK 19 GEN5 + GTL II** — **DONE, EXPORTED**; the cutter's rotation sign
- Scan `G19_GEN5_GTLII_SOLID GUN` 91,510 v / 183,040 f, watertight **0/0, 1 island**, identity matrix,
  canonical pose. Dims 34.19 × 185.14 × 128.58 — **identical to the bare G19 Gen5 (07-30b) and to the
  G19 + TLR-7 X (08-08c)**; third confirmation that a matching bbox says nothing about whether a light is
  present. The GTL II is welded into the one island and the cut-confirm render shows it plainly.
  Scan edge ratio p99/p1 = **35.6** ⇒ `repair_pits` correctly skipped on the scan; post-sweep **2.46**.
- **★★ THE TRAP: building the cut-A cutter by hand, `rotation_euler=(-α,0,0)` is the WRONG SIGN and it
  fails SILENTLY as a plausible-looking cut.** For a plane `z = m·y + b` the upward normal is
  `u = (0, −sin α, cos α)`; `Rx(θ)` maps local +Z to `(0, −sin θ, cos θ)`, so the cube must be rotated by
  **+α**, not −α. With −α the cutter's top face tilts the other way and the boolean ate everything rearward
  of y = −22.6 — the whole grip AND beavertail — while still returning a clean manifold-0/0 mesh.
  **The tells were numeric: a vert ratio of 0.141 of source** (the relaxed guard is 0.25) **and a post-cut
  bbox `max_y` far forward of cut B's plane**, which then made `cut_tail` report `trimmed: false` because
  there was nothing left to trim. Corrected: ratio **0.430**, bbox max_y 211.1 (the un-trimmed tail), then
  cut B at y 74.32 → 241,749 v, 0/0. **Check the ratio AND the post-cut bbox against the cut-B plane before
  moving on; `cut_tail` returning `trimmed: false` means cut A over-cut, not that cut B was unnecessary.**
- **★ René annotated BOTH cuts this time** — two 2-point strokes at x = 0, so cut B needed no beavertail
  probe at all. Cut A (−1.165, −33.7924) → (71.5684, −5.1466): m **0.393850**, b_scan −33.3336. Cut B: two
  points at y 71.5684 / 71.1208 → mean **71.3446**. Δ from `assemble_gun_solid` = (+0.108, **+2.972**,
  **+13.559**), pure translation (all three bbox ends matched to 1e−5) ⇒ `b_mold` **−20.9447**,
  **α 21.49°**, cut B `y_mold` **74.3163**. Owner confirmed 21.5° on the first render.
  α 21.5° is the third-shallowest cut A this pipeline has run (43X 15.4°, X-Carry 25.1°).
- `boot=0.4`, travel 185.1, 10 passes, **7.4 s**, 743,304 v 0/0. Pits **948 → 64 → 11**, then two more
  `repair_pits` invocations to reach **0** (the 08-18 rule: its internal loop caps at 3 rounds).
- **z_line 35.3** off the band table, and all four bands agree in the same 2 mm window: frame plateau
  (fwd 14.7 / mid 14.9 / ctr 17.0 / rear 15.2) ends z 34, slide plateau **12.85–12.93** from z 36.5.
  Offset verified by REGION bbox: slide −0.400 X / +0.400 X / −0.400 Y / +0.400 Z; frame region
  **byte-identical (all 0.000)**.
- `smooth_mold(flat_pairs=8, deburr_thr=0.015, deburr_rings=3, deburr_pairs=12)`; 30 verts >0.5 mm
  clamped → max 0.471, p99 0.092, 0/0. **Twenty-for-twenty on the clamp.**
- Speck gate: **53 hotspot clusters → 0, ok:True** over 6 passes (10,984 verts moved = 4.5 %, mean
  0.083 mm, max exactly the 0.35 cap, crease assert green). Third live run of the gate.
- Pre-clean exposed **0** non-manifold; decimate ratio 0.254, 1 iter → **123,000 faces / 61,502 v, 0/0**.
  BVH vs pre-decimate: p50 0.0002 · p99 0.0033 · **max 0.0240 mm** · zero over 0.1. Dims 33.83 × 183.76 × 80.17.
- Export (folder pre-specified in the packet = the standing default), both byte-exact vs `84 + 50·TRIS`,
  both identity `matrix_world`: `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\GLOCK 19 GEN5 GTL II.stl`
  (6,150,084 B, 61,502 v) **+ `GLOCK 19 GEN5 GTL II GUN.stl`** (9,152,084 B, 91,510 v).
  <!-- @anchor: v1 | failure: a hand-built cut-A cutter used rotation_euler=(-alpha,0,0) when Rx maps local +Z to (0,-sin θ,cos θ), so +alpha is required — the sign flip tilted the plane the wrong way and the boolean removed the entire grip and beavertail while still returning a clean manifold-0/0 mesh, and cut_tail then reported trimmed:false because nothing remained past its plane; the only numeric tells were a 0.141 vert ratio and a post-cut bbox max_y forward of cut B; 2026-08-20 | regression: cgs-mold SKILL.md Session Notes 2026-08-20 — rotate the diagonal cutter by +alpha; check the post-cut vert ratio AND bbox against the cut-B plane, and treat cut_tail's trimmed:false as evidence cut A over-cut -->

### 2026-08-18 — **CZ SHADOW 2 COMPACT** (gun only) — **DONE, EXPORTED**; clean run, one new gun family
- Scan `CZ SHADOW 2 - COMPACT` 91,792 v / 182,875 f, identity matrix, canonical pose (pitch −0.06° ·
  yaw +0.01° · roll −0.05° — no correction), **1 island but 727 boundary edges in 6 SMALL loops**
  (magwell base 407e · rear-sight 121e · front-sight 76e · muzzle bore 56e · beavertail tip 34e ·
  trigger 33e) — all benign per the 08-03b loop rule. `assemble_gun_solid`'s fill left 164; the 08-17
  edge-mode seal recipe (select_non_manifold → fill_holes(0) → edge_face_add, stop at n-gons) → **0/0**.
  Scan edge ratio p99/p1 = 11.0 ⇒ repair_pits skipped on the scan; post-sweep 2.5.
- `boot=0.4`, travel 191.9, 10 passes, 750,080 v 0/0. Pits **526 → 14 → 7 → 3 → 1 → 0** (one extra
  repair_pits call needed — its internal loop stops at 3 rounds; re-invoke until the last round reads 0).
- Knee textbook: plateau **−22.535 dead flat y −16.7…+6.3**, plunge from 7.3 → corner **(6.3, −22.535)**.
  Beavertail a clean tang ridge **(76.7, z 14.5)** (z 10.5 → 61.5, z 17.5 → 64.4 — recedes both sides);
  the hammer region (z 40–45, y ≤ 60) never competes. → **α 33.75°**, owner-confirmed first render
  (EEVEE_NEXT translucent overlay worked unchanged). **EXACT@dz=0 first try on both cuts**
  (A 299,857 v = 0.40×src; B at y 82.7 → 261,379 v, both 0/0).
- **★ z_line 33.5 — a CZ is a NEW parting-line family: the slide rides INSIDE the frame,** so the "step"
  is the frame-rail TOP edge, only **0.45 mm** (14.0 → 13.5), but all four Y bands agree on the same
  z 33–34 slab. Visible slide height 48.8 − 33.5 = **15.3 mm** — correct for a Shadow 2's low-slung
  slide; don't expect a Glock-like 22 mm here. The mid band's 17.1 plateau (z 21–29) is the frame body
  and the ctr band's 19.0 (z 21–23) is the safety/controls — both below the line, correctly ignored.
- `smooth_mold(flat_pairs=8, deburr_thr=0.015, deburr_rings=3, deburr_pairs=12)`; 21 verts >0.5 mm
  clamped → max 0.468, 0/0. **Nineteen-for-nineteen on the clamp.** Offset verified by REGION bbox:
  slide ±0.400 X / −0.400 front-Y / +0.400 max_z; frame **byte-identical (all 0.000)**.
- Speck gate (step 3c): **60 hotspot clusters → 0, ok:True in ONE pass** (repair_specks 154→109 compact,
  4 flank-field applications, crease assert green on every stage, moved 3.5 % of verts at mean 0.065 mm).
  Second live run of the gate, first single-pass convergence.
- Pre-clean exposed **3 nm / 2 bd** (the 07-30b pinch sliver, 4th occurrence) → delete-pinch + refill →
  0/0. Decimate ratio 0.235, 1 iter → **122,999 faces / 61,502 v, 0/0**; BVH p99 0.0037 / max 0.0087 mm,
  zero over 0.1. Dims 35.52 × 198.62 × 95.40.
- Export (folder confirmed = the standing default), both byte-exact vs `84 + 50·TRIS`, identity
  `matrix_world`: `C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\CZ SHADOW 2 COMPACT.stl` (6,150,084 B,
  61,502 v) **+ `CZ SHADOW 2 COMPACT GUN.stl`** (9,179,384 B, 91,792 v).
  <!-- @anchor: v1 | failure: none shipped — records the CZ parting-line family (slide INSIDE the frame: a 0.45mm frame-rail-top step at z 33.5 and a 15.3mm visible slide height that would fail a Glock-style sanity check), and that repair_pits' internal loop caps at 3 rounds so a >500-defect sweep needs re-invocation until the final round reads 0; 2026-08-18 | regression: cgs-mold SKILL.md Session Notes 2026-08-18 — on a CZ-pattern gun read the parting line as the frame-rail top edge and sanity-check slide height against the model's real low-slide profile; re-run repair_pits until defect_verts 0 -->

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
