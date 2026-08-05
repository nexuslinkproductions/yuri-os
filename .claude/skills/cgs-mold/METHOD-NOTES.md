# cgs-mold — Method Notes (live, 2026-06-29 session with Marcel)

Working notes for the gun-scan → holster split-mold pipeline, captured as each step
was validated against Marcel's eye in the live Blender-MCP session. This is the
source of truth for rebuilding `cgs_mold.py`. Owner method = **gun dip**, NOT the
3-view-intersection / primitive-box methods in `_SYSTEM/blender/` (those are older).

## Frame / conventions (verified on the HK45 scan)
- Input: gun scan STL, e.g. `…/HK_45_TACTICAL_PACKAGE/01 …SCAN FULL GUN.stl`.
- The raw scan is **already correctly oriented**: width=X (~37mm), barrel/length=Y (~222mm),
  upright/height=Z (~145mm — the gun's REAL slide-top-to-grip-bottom height; NOT ~80).
  **Do NOT PCA-align** — that broke a correct alignment. Center on origin: mass for length (Y) + height
  (Z), but the WIDTH (X, the clamshell-seam axis) on the SIGHT CHANNEL, not mass (see VALIDATED step 2).
- Draw exit / grip = **+Y**; muzzle = −Y; up = +Z.

## VALIDATED steps
1. **Assemble ALL islands (NOT 'keep the largest')** — `assemble_gun_solid` UNIONS every substantial
   island (gun body + light/laser + rail attachment) into one solid, dropping ONLY true near-zero
   specks (bbox-diagonal < `speck_frac`≈0.02 × the biggest island). The HK45 scan happened to be ONE
   island, which is how the old "keep the largest connected island" rule survived — but it is a
   HK45 accident, not a law.
   ★ FAILURE ANCHOR (René 2026-07-03): "keep largest" DROPS a separate light island, so on a **short
   gun with a big forward light** the light bezel (the furthest-forward feature) never enters
   GUN_SOLID → `sweep_dip`'s `travel` is measured on the gun body alone → **the dip stops at the
   muzzle and "does not go along the entire gun."** Keeping every real island makes the furthest −Y
   feature (muzzle OR light bezel, whichever protrudes) survive, and the sweep's default travel
   (assembled Y-span) reaches it automatically — universal across gun/light proportions. The G17
   session did this by hand ("joined + kept both islands"); `assemble_gun_solid` codifies it.
   <!-- @anchor: v1 | failure: cgs-mold sweep incomplete on short-gun/big-light — light island dropped by 'keep largest island', dip stopped at muzzle not light bezel (René 2026-07-03) | regression: assemble_gun_solid() unions all substantial islands; sweep_dip front_feature_z diagnostic; VALIDATED live 2026-07-03 Glock 43X + TLR-7 (2 islands both kept, dip full 175.8mm from light bezel Y-74.1) -->
2. **Center** — folded into `assemble_gun_solid(center=True)`. ★ SPLIT-AXIS RULE (owner 2026-07-03):
   length (Y) + height (Z) center on MASS (mean-subtract), but the WIDTH (X) — the axis of the vertical
   left/right clamshell seam — centers on the **SIGHT CHANNEL**, not mass. The mass centroid is pulled
   off the true centerline by one-sided controls (slide stop, mag release), so a mass-centered seam
   misses the sights; the owner splits the mold on the world Z-axis line (X=0) and it must run through
   the sights. `_sight_channel_x` = bilateral-symmetry center of the slide-TOP band (trimmed 2/98 pct;
   the slide top / sights / optic all sit on the gun's optical centerline). Glock 43X: after centering,
   sight_x=0.0 (on the seam), mass_x=+0.178 (proof mass≠sight, and we used the sight). Small here but
   guaranteed exact on any frame.
   <!-- @anchor: v1 | failure: cgs-mold clamshell seam missed the sight channel — width mass-centered, but one-sided controls pull mass off the true centerline (René 2026-07-03) | regression: _sight_channel_x width-centering in assemble_gun_solid; sight_x_post/mass_x_post in the return; VALIDATED Glock 43X sight_x=0.0 -->
3. **Seal → GUN_SOLID** — `remove_doubles → fill_holes → recalc normals` → a **watertight
   manifold solid** (0 boundary, 0 non-manifold), also folded into `assemble_gun_solid`. This IS the
   dip's "negative filled + solidified" — the gun as a clean solid. Confirmed solid (front view =
   solid cross-section). Separate un-touching islands (gun + detached light) are fused into one solid
   by `sweep_dip`'s first voxel-remesh; both channels are swept regardless.
4. **The dip / draw sweep — VALIDATED & OWNER-CONFIRMED 2026-07-02 (SIG 1911 + TLR-1 HL-X).**
   `sweep_dip()` in `scripts/cgs_mold.py`. The dip is a **FULL-LENGTH** translational sweep of
   GUN_SOLID along +Y: **furthest-forward feature ALL THE WAY TO THE END** (`travel` defaults to the
   **assembled** solid's own Y-length — muzzle OR light bezel, whichever protrudes, e.g. 197mm), so
   every −Y-facing undercut (trigger guard, light/dust-cover step, slide notches) gets filled. This
   is ONLY complete if GUN_SOLID was built by `assemble_gun_solid` (all islands, step 1) — if a
   forward light island was dropped, `travel` shrinks to the gun body and the dip stops short. The excess tail past the real grip (bbox +Y grows to ~gun-length past the
   grip) is removed later by cut B — do NOT shorten the travel to avoid the tail.
   **THE METHOD = log-doubling voxel-UNION:** union the working solid with a +Y-shifted copy and
   **voxel-fill to the OUTER ENVELOPE each pass**, doubling the shift (2→4→8→…→full length, ~8
   passes). One `sweep_dip` call replaces BOTH the old sweep and the initial `solidify_mold` (its
   last pass is a fill) → output = a clean **manifold 0/0, single-island** filled solid, ready to cut.
   ★ WHY envelope-union and NOT the earlier tries (failure anchor — both REJECTED, do not repeat):
   - **array-of-copies + one final voxel-fill** → visible STEPS whenever copy-step > voxel size, and
     the un-unioned trailing faces read as serration. (G17 2026-07-01; SIG 1911 attempt-1 2026-07-02.)
   - **analytic front/back-face split + silhouette bridge** → continuous but **COMBS fine features**
     (slide serrations, light grooves) because it tears co-located front/back faces apart; it is also
     non-manifold (~2.7k edges), though voxel-fill would heal that. (SIG 1911 attempt-2 2026-07-02.)
   A whole-solid **union never tears** (both operands are complete solids) and the envelope-fill
   every pass **never steps** (each shift ≤ current swept length keeps the cross-section window
   continuous). The old "use the pre-existing `SWEPT_SOLID`" advice is now SUPERSEDED — regenerate
   with `sweep_dip` from GUN_SOLID.
   <!-- @anchor: v1 | failure: cgs-mold sweep — G17 2026-07-01 stepped array + SIG1911 2026-07-02 attempts 1(array-steps)+2(classification-comb), owner-corrected twice "sweep is incomplete"/"must run muzzle all the way to the end" | regression: sweep_dip() log-doubling voxel-union; owner-confirmed "now it is correct" 2026-07-02 -->

4b. **Pinhole repair — MANDATORY after every voxel remesh (`repair_pits`), VALIDATED 2026-08-03b.**
   ★ FAILURE ANCHOR (René 2026-08-03b, Glock 45 + TLR-7 X): "Mold has little holes everywhere,
   unacceptable!" — the v1 export shipped with ~90 visible black pinholes. Measured per stage
   (`d = (mean₂ᵣᵢₙ𝗀 − v)·n`, `d > 0.3`): sealed scan `GUN_SOLID` **0** defects → after `sweep_dip`
   **324**, max **1.40 mm deep on a 0.4 mm voxel**. The VOXEL REMESH manufactures them; the scan is
   innocent. `smooth_mold` cannot fix it (1.40 → 1.28 over the whole 4-pass stage) — Taubin averages a
   vertex with its neighbours, and a needle's neighbours sit on the crater wall.
   **Rule of thumb that would have caught it at v1:** the dip is a MAX envelope, so it can only ADD
   material — **any concavity on a swept flank did not come from the gun.** A speck field in a render
   is a defect until measured otherwise, never "scan detail".
   **THE FIX:** detect `|d| > thr`, cluster by edge adjacency, repair only **COMPACT** clusters
   (bbox diag ≤ 2.5 mm) with a local umbrella Laplacian + 2-ring halo. A real crease/groove/serration
   is an EXTENDED cluster → rejected untouched (proven live: the sharp cut corner registered
   `dmin −4.53` and was correctly skipped). Threshold: `thr ≥ 0.25` → all clusters compact
   (diag_max 2.07, extended 0); `thr 0.20` → real linear features enter (diag_max 23.6). **0.25 is the
   boundary.** ⚠ An "isolated single vertex" guard was tried FIRST and FAILED (140 of 324 fixed,
   dmax still 1.24) — a 1.3 mm crater has neighbours on its cone walls. **Compactness, not isolation.**
   Cost: 324 → 15 → 0 in 3 rounds, 4,473 of 749,908 verts moved (0.6 %), mean 0.15 mm, manifold 0/0.
   Run it on the swept solid, again after the booleans, and again after `smooth_mold`.
   <!-- @anchor: v1 | failure: cgs-mold shipped a mold with ~90 voxel-remesh craters up to 1.4mm deep from a 0-defect scan; smooth_mold does not remove them; the dark specks were misread as scan detail in every render (René 2026-08-03b "little holes everywhere, unacceptable") | regression: repair_pits() in scripts/cgs_mold.py, compact-cluster discriminator, thr 0.25; pipeline step 2b in SKILL.md -->

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
7b. **Regional ripple denoise — VALIDATED 2026-07-03 (`denoise_region`), OPTIONAL** — the default
   `smooth_mold` deburr pass can still leave a fine "ripple" staircase noise on an otherwise-smooth
   curved surface (e.g. the frame boss between grip checkering and the slide) that only shows under
   raking/matcap light, not flat light — and it is NOT a design feature: real creases (rail grooves,
   panel borders, checkering) carry genuine face-angle breaks, the ripple does not.
   ★ FAILURE ANCHOR (René 2026-07-03, SIG P226 XFIVE LEGION): owner circled the rippled boss area in
   a render screenshot after the build. Diagnosed via grid-binned Laplacian-magnitude clustering.
   A vertex-color heatmap render was tried FIRST to visualize it and FAILED SILENTLY in headless
   blender-mcp — solid red vertex colors never appeared in the opengl render output; that path is a
   dead end, don't retry it. **THE FIX** mirrors `remove_overhang`'s box-restriction +
   ring-expansion, but freezes real creases via `_feature`'s sharp-edge test (face-angle > 35°)
   instead of a magnitude threshold — magnitude-gating was tried FIRST and was too conservative: a
   threshold high enough to spare real edges left the ripple untouched, low enough to catch the
   ripple ate real edges. Box-restrict spatially (Y/Z, optional X), freeze verts on a sharp edge,
   ring-expand the box 2x so the fix blends without a seam, then run N Taubin pairs (λ0.5/μ-0.53) on
   everything else in the box. Applied to `CGS_MOLD_SMOOTH` pre-decimate, then re-decimated,
   re-exported. Evidence: target 21728 verts, max_disp 1.43mm (worst ripple crest), mean_disp
   0.0084mm (confirms fine noise, not a real feature), manifold 0/0 preserved throughout.
   **Owner's-eye-triggered, NOT automatic** — run only when a render shows ripple on an
   otherwise-smooth region, between `smooth_mold` and `decimate_mold`.
   <!-- @anchor: v1 | failure: cgs-mold voxel-remesh ripple survived smooth_mold's deburr on the SIG P226 XFIVE LEGION frame boss, visible only under raking/matcap light (René 2026-07-03); vertex-color heatmap diagnostic failed silently in headless blender-mcp | regression: denoise_region() in scripts/cgs_mold.py (box+sharp-freeze Taubin); VALIDATED live 2026-07-03, max_disp 1.43mm / mean_disp 0.0084mm, manifold 0/0 -->
8. **Overhang cleanup — VALIDATED** (`remove_overhang`) — the boolean+voxel can leave a thin
   flap/hook "hanging over" the cut edge (HK45: a lip at the rear-top beavertail remnant,
   ~X14-15/Y87.5/Z7-14). A flap does NOT respond to gentle Laplacian (its verts average with
   each other). Fix = a STRONG local collapse on a tight world-AABB around it (pure umbrella
   Laplacian, factor 0.6 ×25 iters, 3-ring halo): the flat cut verts sit at ~0 Laplacian and
   hold, the protruding flap (high Laplacian) gets pulled flush. Manifold preserved. Detect the
   box from the rear-region protruding verts (max distance-to-1-ring-centroid).
9. **Reduce to a FACE BUDGET, corners preserved — UPDATED 2026-07-03 (`decimate_mold`).** Two owner
   asks resolved into TWO INDEPENDENT LEVERS:
   - **Face count (owner: "~120-130k faces", had 88,140).** Set by the FINAL step, not the decimate.
   - **Crisp corners (owner: "voxel didn't give what I want; use 0.4 at sweep+solidify").** Set by the
     FIRST voxelization: `sweep_dip`/`solidify_mold` at 0.7 round every corner to 0.7mm BEFORE smoothing;
     no finer final voxel recovers it. Proven via a same-face-count A/B (0.7 vs 0.4 sweep) — 0.4 crisp.
   ★ THE FIX: **sweep/solidify voxel 0.7 → 0.4** (crisp base) + **`decimate_mold(remesh=False)`** =
   decimate-COLLAPSE straight to `target_faces` (vs TRIS, one measure+correct), SKIPPING the voxel
   re-solidify. Collapse sheds flat faces first → PRESERVES the crisp corners; a voxel-remesh
   (`remesh=True`, legacy) rounds them back. So crispness and face budget are decoupled. Glock 43X:
   0.4 sweep → collapse ratio 0.289 → 119,549 faces, crisp corners, manifold 0/0. Cost: sweep ~17s
   (was ~2s) + denser cut/smooth. (Per-half re-solidify below is moot — split removed 2026-07-03.)
   Historical notes retained: True un-subdivide still
   fails on this triangulated topology. Substitute: Blender `DECIMATE` modifier, `COLLAPSE` type,
   ratio 0.5, applied TWICE (matches the owner's "un-subdivision x2" framing) — on this gun took
   ~99k verts to ~25k, stayed manifold 0/0, no distortion. Immediately re-`solidify_mold` (voxel
   remesh, same 0.7mm) afterward — REQUIRED, not optional: it regrows vert count back toward the
   pre-decimate range but guarantees the decimated mesh (which CAN pick up small manifold defects)
   is a clean filled solid before the final split. Order: smooth_mold → offset_mold → decimate x2
   → solidify_mold → split_mold → **solidify_mold AGAIN on EACH resulting half individually**
   (`CGS_HALF_L`/`CGS_HALF_R` → `CGS_HALF_L_SOLID`/`CGS_HALF_R_SOLID`) — the split's bisect+holes_fill
   cap is already manifold, but the owner wants each half independently re-solidified as the final
   robustness pass before export, not just the pre-split whole.
10. **Clamshell split — DEPRECATED 2026-07-03 (owner: "in future DO NOT split the mold anymore; after
   DECIMATE, proceed to EXPORT").** The mold now ships as ONE solid piece via `export_mold`; `split_mold`
   (+ `_bore_center_x`) is kept in the engine for reference only, out of the pipeline. History below
   retained for context. ~~VALIDATED 2026-06-30 (`split_mold`)~~ — a clean SPLIT, **not a saw cut**.
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
2. **`sweep_dip()` — draw GUN_SOLID along +Y, muzzle ALL THE WAY TO THE END** (full gun-length travel).
   VALIDATED method = **log-doubling voxel-UNION** (union with a +Y-shifted copy → voxel-fill the
   envelope each pass, doubling the shift). CONTINUOUS, **no stepping, no combing** — array-of-copies
   (steps) AND front/back-classification (combs fine features) are BOTH REJECTED. Owner-confirmed 2026-07-02.
3. `sweep_dip` output is already the filled **THE MOLD** (manifold 0/0, single island) — no separate solidify needed.
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
- NEXT (still TODO): **alignment pins** on the split mating faces.
  **`sweep_dip` (the dip/draw sweep) is now VALIDATED** (2026-07-02, `sweep_dip()` in the engine) —
  the last remaining upstream gap is closed; a run now goes scan → seal → `sweep_dip` → cut A/B →
  smooth → offset → decimate → export (ONE piece, no split — owner 2026-07-03) end-to-end. Seal is trivial when the scan is already a
  watertight solid (e.g. René's "SOLID GUN FOR AUTOMATION" exports).
- Skill files: `.claude/skills/cgs-mold/{SKILL.md, METHOD-NOTES.md, scripts/cgs_mold.py(VALIDATED engine), params/hk45.json}`.

## GRIP/TAIL CUT = TWO CUTS, NOT ONE (owner-corrected, G17 Gen6 + TLR-1 session)

First multi-piece scan (gun + attached light as two separate watertight islands, joined + kept
both — do NOT drop the attachment island as "junk"; only drop true near-zero-vert specks) and
first gun whose frame stays slide-height tall almost to the rear of the grip (unlike HK45). Two
owner corrections reshaped the grip-cut stage:

1. **Cut points come from the SWEPT MOLD, not the pre-sweep scan.** Compute `_find_cut_points` (or
   its manual equivalent) on the object that's actually about to be cut (`CGS_MOLD_SOLID`/the
   swept+solidified mold), not on `GUN_SOLID`. The solidify voxel-remesh and the sweep itself can
   shift local geometry slightly; cutting must be self-consistent with what's being cut.
2. **The auto-knee heuristic (bottom-Z profile, "drop >8mm per 3mm bin") does not generalize.** It
   was tuned on HK45's sharper trigger-guard/grip transition. A smoother frame curve (Glock) makes
   it overshoot the knee, landing near the mag base instead of the guard/grip corner. Always dump
   the raw bottom-Z profile and pick the plateau's own shallowest point (the last bin before Z
   drops continuously) — verify by rendering markers before cutting, don't trust the auto point.
3. **THE GRIP CUT IS TWO SEPARATE BOOLEAN CUTS, NOT ONE DIAGONAL.**
   - **Cut A (diagonal, unchanged in spirit)** — cube FLOAT DIFFERENCE through corner→beavertail,
     using the **REAL, natural anatomical beavertail point** (same Y the un-swept gun's own grip
     actually ends at — for this gun ≈ the original centered gun's max-Y). Do NOT shorten this
     point to "fix" a long tail — that cuts into the real beavertail and is wrong (owner: "Beaver
     tail must not be cut off. This is too short now.").
   - **Cut B (new — vertical, perpendicular to the draw axis)** — a second cube DIFFERENCE, a flat
     plane at constant Y positioned just past the REAL beavertail's natural Y (a few mm margin,
     not less), full width/height. This removes ONLY the **artificial excess** a long dip-sweep
     drags past the real grip end — it does not touch the beavertail itself.
   - **Why two cuts:** a dip/sweep with a generous travel distance (needed to fully bridge Y-axis
     undercuts, e.g. the trigger guard bow, and matching the owner's "in and out" full dip motion)
     unions in cross-sections from the ENTIRE original Y-range at every point past the grip —
     including the tall slide — so the "excess tail" past the original grip can be just as tall as
     the slide (full gun height), not grip-height. A single diagonal plane sloped from corner to
     beavertail cannot clear that without either climbing into the slide (if extended too far) or
     leaving a floating unremoved remnant (if not extended far enough). A flat cut perpendicular to
     Y removes everything past a given Y regardless of height — it doesn't care how tall the excess
     is. **This is what makes a generous/full sweep travel safe to use** — don't shrink the travel
     distance to dodge the tall-tail problem; add the vertical cut instead.
   - A generous sweep travel (e.g. matching the gun's own length) is fine and in fact bridges the
     trigger guard opening closed (union of every original cross-section includes the guard's own
     footprint at other Y positions) — a short travel leaves the guard open. Which is wanted is a
     per-mold call; both are achievable, just tune the sweep travel and let cut B clean up the tail
     either way.
4. Order for this stage: cut A (`cut_grip`, diagonal grip) → cut B (`cut_tail`, vertical tail-shorten,
   preserving the real beavertail length) → smooth_mold → (remove_overhang only if a render shows a
   stray flap) → offset_mold → decimate_mold → **export_mold** (single piece; split removed 2026-07-03).

## SCAN-RELATIVE CUT/OFFSET — HK45 constants retired (2026-07-03, validated on Glock 43X + TLR-7)

Both cuts are now codified (`cut_grip` = cut A, `cut_tail` = cut B) and every per-gun constant is
scan-derived, not an HK45 absolute — the "keep visual tuning" contract (auto-seed in the ballpark,
owner's eye sets the final `corner_below`/`beavertail_below`/`z_frac`):
- **Gun-region tag.** `sweep_dip` records the REAL gun extent on the mold (`obj['gun_rear_y']` /
  `gun_front_y`). Cut-point + beavertail detection restrict to `Y ≤ gun_rear`, so the dip's excess
  TAIL is never mistaken for the grip/beavertail. This was the core mis-target: the old
  `(Z>0)&(Z<35)` + rearmost-vertex grabbed the tail end (Y≈+277 on the Glock), not the beavertail.
- **Knee (corner).** Proportional: the knee is the last bottom-Z bin before the profile drops past
  15% of the plateau→grip depth — works on a sharp (HK45/43X) AND a smooth (G17) transition, unlike
  the old absolute "drop >8mm/bin".
- **Beavertail.** Rearmost vert in the upper-grip Z band (fractions of the gun-region height, below
  the slide top), gun region only.
- **Cube.** Auto-sized from the mold bbox (generous multiples), no fixed `(90,220,220)`.
- **Cut B / tail trim.** Vertical flat cut at `gun_rear + tail_margin` (default 6mm) — removes the
  artificial excess only, never the real beavertail.
- **Offset `z_line`.** Scan-relative seed `zmin + z_frac·(zmax−zmin)` (default z_frac 0.62); Glock
  landed +16.4 at the slide/frame line. Nudge z_frac or pass z_line per scan.
Live Glock result (owner-confirmed cut placement): corner Y+34.5, beavertail Y+101.3 (real rear),
tail Y+107.7, z_line +16.4, all manifold 0/0 → `Glock 43X TLR-7 HL-X Sub.stl` (88k v) exported.
<!-- @anchor: v1 | failure: cgs-mold cut/offset HK45-hardcoded — beavertail band (Z>0)&(Z<35)+rearmost grabbed the dip tail on non-HK45 frames; knee/z_line absolute (René 2026-07-03) | regression: gun_rear tag + proportional knee + scan-relative beavertail/z_line + cut_tail; VALIDATED live Glock 43X + TLR-7 -->
