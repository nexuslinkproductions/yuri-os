# HK45 Holster-Blocking — Build Log & Exact Procedure (compounding knowledge)

Living doc. **Take notes / learn / compound every step.** Goal: produce our OWN exact + improved
replica of René's CAD blocking (`HK45_CAD` = the answer-key), **in Blender alone**, from a gun scan
+ online blueprint dimensions, eventually fully automated for ANY gun — so René stops spending dozens
of hours/week. Systematic, step-by-step, quality-first; automation comes after the method is nailed.

---

## WHAT THE CAD BLOCKING IS (decoded 2026-06-24 from front + side study of HK45_CAD)

It is a **key-for-a-keyhole**. René blocks the gun **front-of-barrel → back**, turning **every
sliding feature into a clean front-to-back TUNNEL / extruded channel** so the gun slides in and
**locks** like a key. Neat flat-faceted crisp geometry **imitates the gun's look** while staying
functional. Grip is cut off (holster mouth / belt line).
- FRONT (muzzle) view = a clean **keyhole cross-section**: rounded slide tunnel + sight bore + lateral
  control nub + lower frame.
- SIDE view = clean **longitudinal extruded channels** + trigger-guard cutout + barrel stub + angled
  rear grip-cut.

## ★ CRITICAL LESSON (owner 2026-06-24): DO NOT TREAT IT AS ONE BLOCK ★

The CAD is an **ASSEMBLY of clean per-feature parts**, NOT one monolithic shape. René blocks each
part out separately. Game-dev research (lane 05) says the same: model firearms as **separate clean
pieces**, then combine. My single-block side-profile extrude came out wavy + featureless = rejected.
**NEXT SESSION STARTS BY DECOMPOSING INTO PARTS.**

## PART DECOMPOSITION (build each as its own clean block, then boolean-combine)

| Part | Primitive | Notes |
|---|---|---|
| Slide block | beveled box, profile-followed | dominant form; top flat, sides flat, front taper |
| Sight channel | raised tunnel on slide top, full length | bridges front+rear sights so they slide |
| Barrel/muzzle | cylinder (24-side), protrudes front | the threaded-barrel stub |
| Dust-cover / rail | beveled box under slide front | rail edges flat-blocked |
| Trigger-guard | block + enclosed loop **cutout** | trigger guard must be covered (safety) |
| Controls (slide-stop, mag-release, safety, takedown) | small lateral nubs/tunnels | each extruded front→back so it slides |
| Ejection-port | filled flat (it's the #1 snag) | lateral, right side |
Each part: clean primitive → measured to scan + blueprint dims → FLAT planes → crisp bevel → union.
Grip excluded. Final: lateral split (X-normal) into 2 mold halves + Kydex fillets + draft.

## METHODS THAT FAILED — DO NOT REPEAT

- **Voxel remesh** → rounds every sharp edge (Marching-Cubes lattice-locks vertices).
- **Polar loft / convex-hull loft** → round/convex blob, loses the gun's flat planes.
- **Shrinkwrap-conform a box to the scan** → verts snap to nearest surface = lumpy blob.
- **Auto-QuadriFlow on scan/voxel** → chaotic flow, REGRESSES scan detail.
- **Single monolithic side-profile extrude** → right gross silhouette but wavy + no features (one-block).

## METHOD THAT WORKS (direction confirmed)

Clean primitive **PER PART**, **measured** to the scan (NEVER conformed — conforming inherits noise),
**flat planes**, **crisp bevels**, **boolean-combine**, verify on the **REAL viewport** every step.
Scan = reference/measurement only. Build like René: part by part, front → back.

## HARD-SURFACE BOOLEAN MODELLING — EXACT PROCEDURE (research lanes 03/05 + RUNBOOK)

1. **Apply scale** (Ctrl+A → All Transforms) before any bevel/boolean — non-negotiable.
2. **Boolean solver = EXACT** during modeling; **MANIFOLD** (Blender 4.5+) for the final watertight pass.
   Both operands must be manifold.
3. **Post-boolean cleanup (mandatory):** Merge by Distance → dissolve coplanar n-gons → re-loop the
   seam into quads → Recalculate Normals Outside. Never stack uncleaned booleans.
4. **Bevel AFTER boolean** (Limit: Weight, Segments 2, Harden Normals ON, Clamp Overlap ON, per-edge
   `bevel_weight_edge`).
5. **Crisp reading without extra geo:** Shade Smooth + Smooth-by-Angle (~35–40°) + Weighted Normal
   (Face Area) → flats read dead-flat, marked edges read sharp.
6. **Support/holding loops** only where Subdivision is used; crease for temporary sharpness.
7. **Kydex manufacturing:** inner fillet ≥ 1.6 mm, draft 1–2° (male) / 2–4° (female), watertight,
   mold shrink 0.4–0.7%. Sharp inner corners → stress-whitening + part-lock.
8. **Topology QC (gate):** quad-ratio, non-manifold edges = 0, even face density, consistent normals.

## STEP-BY-STEP PLAN (next session, compound notes each step)

1. DECOMPOSE: list the parts (table above), confirm against HK45_CAD by isolating its sub-features.
2. Per part: measure scan region → build clean measured primitive → crisp edges → verify on screen → NOTE.
3. Add per-feature front→back TUNNELS (sight channel, control nubs) so each slides.
4. Trigger-guard enclosed cutout.
5. Boolean-UNION parts → blocking; run the cleanup procedure; QC topology.
6. Crisp pass (weighted normals, bevels, creases) → match CAD crispness.
7. Lateral split (cut-plane normal = X) into 2 mold halves; re-align; Kydex fillets + draft.
8. Compare against HK45_CAD (overlay); iterate to EXACT + improved.
9. Parametrize → turnkey any-gun pipeline.

## TOOLING

- **Live blender-mcp** (`execute_blender_code`, port 9876) — ONLY a live Claude session like this can
  drive it. **GLM-5.2 / peer lanes CANNOT** (no live MCP, no viewport) — they're code/research authors
  I execute + verify, not autonomous modelers of the live scene.
- **computer-use** (Blender tier full) → screenshot the REAL viewport to verify. DON'T trust off-screen
  workbench renders (they flattered junk).
- Exploratory helpers at `/tmp/hk45_{render,block,loft}.py` (VOLATILE — rebuild from this doc if gone).
- Scene: `REF_CAD/HK45_CAD` (answer-key blocking), `WORK/HK45_scan_ref` (accurate scan), `HK45_block_prep`
  (Phase-1 voxel prep), `RenderCam`. Phase-1 prep script: `_SYSTEM/blender/holster_prep_phase1.py`.

## RESEARCH CORPUS (committed 8587a119)

`_SYSTEM/blender/RUNBOOK.md` (1319-line operating manual) · `02_RESOURCES/RESEARCH/3d-modelling/`
{01-topology-fundamentals, 02-retopology-and-scan-reverse-engineering, 03-hardsurface-subdivision-sharp-edges,
04-cad-loft-sweep-surfacing, 05-gamedev-hardsurface-firearm-topology} · `blender-pro-topology-mold-surfacing`
· `hk45-gun-anatomy-and-blocking-theory`. For next session read 03 + 05 (hard-surface boolean) first.

## SESSION LOG

- **2026-06-24 (s1):** Decoded CAD = the blocking (key-for-keyhole, per-feature tunnels). Ran 6-lane
  research fleet (committed). Tried + rejected blob methods (voxel/polar/hull/shrinkwrap/QuadriFlow).
  Built single-block side-profile extrude — right gross silhouette, but wavy + featureless + one-block →
  rejected. **Correction received: build as MULTIPLE parts (boolean assembly), not one block.** Method +
  CAD decode locked. Continue fresh with the decomposition plan above.
