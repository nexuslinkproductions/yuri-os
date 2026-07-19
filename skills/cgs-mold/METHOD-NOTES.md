# cgs-mold — Method Notes (live, 2026-06-29 session with Marcel)

Working notes for the gun-scan → holster split-mold pipeline, captured as each step
was validated against Marcel's eye in the live Blender-MCP session. This is the
source of truth for rebuilding `cgs_mold.py`. Owner method = **gun dip**, NOT the
3-view-intersection / primitive-box methods in `_SYSTEM/blender/` (those are older).

## Frame / conventions (verified on the HK45 scan)
- Input: gun scan STL, e.g. `…/HK_45_TACTICAL_PACKAGE/01 …SCAN FULL GUN.stl`.
- The raw scan is **already correctly oriented**: width=X (~37mm), barrel/length=Y (~222mm),
  upright/height=Z (~145mm — the gun's REAL slide-top-to-grip-bottom height; NOT ~80).
  **Do NOT PCA-align** — that broke a correct alignment. Just center on origin.
- Draw exit / grip = **+Y**; muzzle = −Y; up = +Z.

## VALIDATED steps
1. **Artifact strip** — keep the largest connected island (drops disconnected scan junk).
   The HK45 scan is ONE island; the Z=144 was the real gun height, not an artifact.
2. **Center** on origin (mean-subtract).
3. **Seal → GUN_SOLID** — `remove_doubles → fill_holes → recalc normals` → a **watertight
   manifold solid** (0 boundary, 0 non-manifold). This IS the dip's "negative filled +
   solidified" — the gun as a clean solid. Confirmed solid (front view = solid cross-section).
4. **The dip / draw sweep** — gun-solid drawn continuously along +Y (in and out) carves a
   continuous cavity; invert + solidify = the swept-gun positive. **MUST be MANIFOLD.**
   ★ CRITICAL (2026-06-29): the working swept solid already exists in the scene as
   `SWEPT_SOLID` / `SWEPT_SOLID.001` (watertight, 0 non-manifold) from a prior session — USE IT.
   My analytic translational sweep (front/back/silhouette-bridge) LOOKS right and is continuous
   + step-free, but is **non-manifold** (334–4104 edges) → EXACT booleans on it produce
   cube-sized garbage. The boolean-UNION-of-copies sweep is manifold but **stepped** (rejected).
   Do NOT rebuild the sweep non-manifold; start from the manifold `SWEPT_SOLID`.
5. **Grip cut — VALIDATED & RE-VERIFIED 2026-06-29 (clean diagonal, manifold 0/0)** — diagonal cut,
   done as a **BOOLEAN DIFFERENCE with a separate CUBE cutter** (NOT bisect — bisect+holes_fill tore it).
   ★ PRECONDITION (the real one): the mold must be a **FILLED SOLID** (see ROOT CAUSE below), NOT a
   shell-with-internal-walls. Once filled, the cube DIFFERENCE cuts clean.
   - **Cut endpoints (owner spec 2026-06-29):** find the **underside of the trigger guard ∩ the grip**
     (the corner / knee). **First cut point = that corner, 20mm BELOW.** **Second cut point =
     the beavertail, 10mm BELOW** it. Cut plane = the line through those two points, extruded across X.
   - On the HK45 solid: corner ≈ (Y=+12, Z=−20) → A=(Y12, Z−40); beavertail=(Y=87.6, Z=17.6) → B=(Y87.6, Z+7.6).
   - Detect: corner = the **knee** of the bottom-Z profile where the trigger-guard underside plateau
     (z≈−18/−20 over Y≈[−45,+12]) ends and the grip plunges (Y≥+14 drops to −80/−86).
     beavertail = rearmost vertex (max Y) with 0<z<35.
   - cube cutter: top face on the A–B line, tilted about X by α=atan2(Bz−Az, By−Ay) (≈32° here),
     body on the −u (grip) side, big enough to engulf the grip (Lx90 Ly220 Lz220 here); then delete it.
   - **Solver: `FLOAT` on the filled solid** = clean manifold 0/0 cut (Z min −86 → −36.5, ~grip gone).
     `EXACT` returned an EMPTY mesh on the 124k-vert voxel solid (chokes on heavy meshes) — use FLOAT.
   - **Must be a BOOLEAN cut** (cube cutter) — bisect+holes_fill tore the topology (owner-flagged).
6. **+0.4mm offset — SLIDE REGION ONLY (VALIDATED 2026-06-30, owner-corrected)** — push verts
   outward along normals by 0.4mm, but **only the barrel+slide+beavertail** (Z > `z_line`≈14mm,
   the top assembly above the slide/frame parting line). Owner explicitly corrected the earlier
   "0.4mm everywhere": the grip/frame/trigger-guard get NOTHING. Feather ~2mm across the line so
   there's no hard ridge. Verify OUTWARD: the region bbox max-X and max-Z must GROW by ~0.4 (else
   normals were inward → reverse). `offset_mold` in `cgs_mold.py`. Confirmed on HK45: region
   maxX 20.63→21.03, maxZ 58.24→58.64, manifold 0/0. REQUIRES object mode (edit-mode discards the write).
7. **Smooth / retouch — VALIDATED 2026-06-30 (owner: "very clean now… this is successful")** —
   feature-preserving denoise of the voxel surface that keeps edges/bevels/grooves/corners
   crisp ("smooth AND sharp"). The voxel fill (step 6/solidify) leaves orange-peel noise on
   flats + saw-tooth stair-stepping on diagonal/curved creases — that is what this removes.
   **4 sub-passes** (`smooth_mold` in `scripts/cgs_mold.py`), all numpy/bmesh, manifold-safe:
   1. **flat Taubin denoise** — λ0.5/μ-0.53 ×2 pairs over non-sharp verts; sharp creases
      (edge angle >50°) FROZEN. Kills the orange-peel on flats; volume-preserving (no shrink).
   2. **crease-line de-zigzag** — the KEY move for jagged edges. 1D Taubin along the crease
      polyline (each 2-neighbor crease vert → midpoint of its 2 crease-neighbors), corners
      (≠2 feature neighbors) frozen. Straightens the zigzag → the crease is smooth AND still
      sharp (it stays a crease, the path just stops wandering). Tangent-only projection is too
      timid (leaves the perpendicular zigzag) — use full midpoint.
   3. **roughness deburr** — topology-AGNOSTIC: select verts whose Laplacian magnitude > thr
      (+N-ring halo), Taubin only those. Melts voxel stair-steps that pass as "corners" to the
      angle detector (each 90° tooth) regardless of feature classification. Clean edges sit at
      ~0.03mm Laplacian → below thr → untouched → stay sharp. Two rounds: thr=0.08 then thr=0.05.
   4. **crease re-straighten** — repeat (2) lightly after the deburr nudges.
   Result on HK45: max vert move ~1.4mm (worst tooth only), mean ~0.02mm, manifold 0/0.
   Auto-smooth-by-angle 30° for shading crispness (geometry already carries the edges).
8. **Overhang cleanup — VALIDATED** (`remove_overhang`) — the boolean+voxel can leave a thin
   flap/hook "hanging over" the cut edge (HK45: a lip at the rear-top beavertail remnant,
   ~X14-15/Y87.5/Z7-14). A flap does NOT respond to gentle Laplacian (its verts average with
   each other). Fix = a STRONG local collapse on a tight world-AABB around it (pure umbrella
   Laplacian, factor 0.6 ×25 iters, 3-ring halo): the flat cut verts sit at ~0 Laplacian and
   hold, the protruding flap (high Laplacian) gets pulled flush. Manifold preserved. Detect the
   box from the rear-region protruding verts (max distance-to-1-ring-centroid).
9. (un-subdivide ×2 — owner step; does NOT work on triangulated scan topology, distorts +
   doesn't reduce. Needs grid/quad topology or a planar-decimate substitute. OPEN.)
10. **Clamshell split — VALIDATED 2026-06-30 (`split_mold`)** — a clean SPLIT, **not a saw cut**.
   `bisect_plane` + `holes_fill` per side → two **capped, closed, manifold** halves; together they
   reconstitute the whole mold (verified **0.006% vol loss** = float noise). Owner corrections that
   shaped this:
   - "split, NOT cut in half with a saw that took away material" → the earlier delete-verts preview
     looked lossy/jagged; the real op (bisect+fill) removes ZERO material and caps each half flat on
     the seam so they mate perfectly.
   - "center of the BARREL, not the exact center point of the entire mold" → the seam is a VERTICAL
     plane through the **bore axis**, found by a Kasa **circle-fit of the muzzle crown**
     (`_bore_center_x`: Y<ymin+3 & Z>32, fit a circle in X-Z, take center-X). HK45 bore axis X=**−0.777**.
   - WHY not the symmetry plane: the gun's one-sided controls (slide stop, ejection port) pull the
     reflection-symmetry plane (and the centroid) OFF the bore by ~0.3mm. The mirror-match said yaw≈0
     but the owner's eye caught the seam was off the bore — the BORE-fit is the correct reference, not
     the mold's mass center. (Yaw is negligible here, ~0.08°, so a straight vertical plane is the "pure cut".)
   Halves: `CGS_HALF_L` / `CGS_HALF_R`, both manifold 0/0. Alignment pins on the mating faces = TODO.

## ★ ROOT CAUSE — why the boolean grip cut kept failing (VERIFIED 2026-06-29, owner-diagnosed)
The whole "need a manifold sweep / booleans fail" saga was a **MISDIAGNOSIS**. The real cause
(owner's hypothesis, then confirmed empirically): **the mold was never a FILLED SOLID — it is a
closed shell with INTERNAL WALLS** from the analytic sweep's overlapping front/back/silhouette layers.
Signature: `nonmanifold>0` **with `boundary==0`** (CGS_MOLD = 334 non-manifold edges, 0 boundary).
0 boundary = no holes; non-manifold = >2 faces share an edge = interior partitions. A boolean can't
decide inside-vs-outside *through* internal walls → it tears / returns garbage / removes nothing.
**It was NEVER about manifold-vs-not per se; it was about solid-vs-hollow.** (Owner: "ignore the
notes that say a clean cut only works on a manifold mold — that is not verified.")

**THE FIX (verified clean, 0/0 result):**
1. **Solidify the mold = fill it into ONE body.** `voxel_remesh` (size 0.7mm here) on the shell →
   absorbs all internal walls, reconstructs inside/outside → manifold **0/0, single island**, bbox
   preserved (124k verts for HK45). This is step-3 "solidify" done *properly* — the prior solidify
   never filled it. (Detail softens at voxel size; the +0.4mm/smooth steps come after.)
2. **FLOAT boolean cube cut** on the filled solid → clean manifold 0/0, grip excised (Z −86 → −36.5).
   `EXACT` returns EMPTY on the heavy voxel mesh (don't use it here); `EXACT+use_self+use_hole_tolerant`
   on the *un-filled* shell DOES remove the grip but leaves a 99k-edge non-manifold soup (internal
   walls survive) — proof that the cut mechanics were fine, the *fill* was missing.

Result object: **`CGS_MOLD_CUT3`** (manifold 0/0, 92k polys). `CGS_MOLD_SOLID` = the filled solid pre-cut.

History of failed sweep-rebuild methods (do not repeat — all were chasing the wrong blocker):
- Analytic translational sweep: continuous but non-manifold w/ internal walls → the very mesh that
  needed FILLING, not a different sweep.
- Boolean UNION of translated copies: manifold but stepped (owner rejected stair-stepping).
- block ∩ arrayed-gun (INTERSECT): empty (self-overlapping operand).
⇒ Lesson: when a closed mesh won't boolean, check `boundary==0 & nonmanifold>0` FIRST → it's hollow/
walled → **voxel-fill into a solid, then cut**. Don't rebuild the sweep.

## SAFETY (born from this session)
- Reads scan verts only; never mutate the source scan. Every run builds a NEW object.
- Render-verify EVERY stage (front view to confirm SOLID, side/persp for shape) before next.
- The 255s self-union froze Blender + dropped the MCP call — avoid large EXACT self-unions.

## ★ ORDER OF OPERATIONS (owner's plan — DO NOT DEVIATE, repeatedly corrected 2026-06-29)
1. Gun scan → **GUN_SOLID** (sealed watertight manifold) = the solid gun used as the boolean cutter.
2. **Draw GUN_SOLID along +Y (in and out, ONE continuous motion) through a solid block** → carves a hollow gun-shaped cavity. CONTINUOUS — **no stepping** (union-of-copies = steps = REJECTED).
3. **Invert that hollow cavity + solidify** → **THE MOLD** (swept-gun positive). Must be **manifold**.
4. **CUT THE MOLD** (NOT GUN_SOLID — owner corrected this 2x): separate **cube cutter** (sized for the ENTIRE grip cut, not a tiny notch, not 400), top face on the **trigger-guard-corner − 30mm → beavertail** diagonal, body on the grip side → **boolean DIFFERENCE** → delete cube. "It worked before" = the boolean DOES work when the mold is manifold.
5. **+0.4mm** outward. 6. smooth / un-subdivide (TBD).

## SESSION STATE (2026-06-30 — solidify+cut+smooth all VALIDATED, owner: "this is successful")
- Blender MCP live on :9876. **`scripts/cgs_mold.py` REWRITTEN** to the validated engine (solidify_mold,
  cut_grip, smooth_mold 4-stage, remove_overhang, build_mold orchestrator). Stale heightfield method gone.
- **What's locked (owner-validated, manifold 0/0 throughout):**
  - SOLIDIFY: voxel-fill the mold shell → filled solid (0.7mm). Root-cause fix for the boolean (see ★ROOT CAUSE).
  - GRIP CUT: cube FLOAT DIFFERENCE, **first point = trigger-guard/grip corner −20mm, second = beavertail −10mm** (owner-locked).
  - SMOOTH: 4-stage feature-preserving (flat denoise → crease de-zigzag → roughness deburr → re-straighten); smooth AND sharp.
  - OVERHANG CLEANUP: strong local collapse of the beavertail flap.
- **Cut spec (owner-locked):** corner **−20mm**, beavertail **−10mm**. Cube top-face on the A–B diagonal, FLOAT solver.
  - OFFSET: +0.4mm outward on the **slide region only** (Z>14, barrel+slide+beavertail), feathered 2mm. (`offset_mold`)
  - SPLIT: clean clamshell `bisect`+`holes_fill` (ZERO material loss) on the **bore axis** (circle-fit, X=−0.777). (`split_mold`)
- **Deliverable objects in scene:** `CGS_MOLD_FINAL` (cut+smooth+overhang+offset, manifold 0/0) → split into `CGS_HALF_L` / `CGS_HALF_R` (both manifold 0/0, capped). The full engine is locked in `cgs_mold.py` (solidify_mold · cut_grip · smooth_mold · remove_overhang · offset_mold · split_mold · build_mold).
- NEXT (still TODO): **alignment pins** on the split mating faces, **un-subdivide/decimate**, **STL export**.
  Upstream **seal+dip/sweep** stages still need their own validation pass (this session started from the pre-existing swept shell).
- Skill files: `skills/cgs-mold/{SKILL.md, METHOD-NOTES.md, scripts/cgs_mold.py(VALIDATED engine), params/hk45.json}`.
