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
3. **Grip cut — TWO separate cuts, not one** — computed from the **swept MOLD's own geometry**
   (not the pre-sweep scan). Cut A: diagonal **CUBE cutter**, `BOOLEAN DIFFERENCE`,
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
4b. **Overhang cleanup** (`remove_overhang`) — strong local collapse of any stray flap/hook "hanging
   over" the cut edge (e.g. the beavertail remnant). Gentle smoothing won't shift a flap; a tight
   high-iteration local Laplacian pulls it flush while the flat cut verts hold. [VALIDATED]
5. **Offset +0.4 mm — SLIDE REGION ONLY** (`offset_mold`) — owner corrected (2026-06-30): the
   +0.4mm Kydex-shrink comp goes on the **barrel + slide + beavertail only** (the top assembly
   above the slide/frame parting line, `z_line`≈14mm), NOT everywhere — the grip/frame/trigger
   guard stay put. Push the region verts outward along normals, feathered ~2mm at the line (no
   ridge). Verify the region bbox grew outward (else normals were inward). [VALIDATED]
5b. **Decimate ×2 + re-solidify** (VALIDATED 2026-07-01) — Blender `DECIMATE` modifier (`COLLAPSE`,
   ratio 0.5) applied twice as the un-subdivide substitute (true un-subdivide fails on this
   triangulated topology), immediately followed by another `solidify_mold` pass (same voxel size)
   to guarantee the decimated mesh is still a clean filled manifold solid before the split.
6. **Split into clamshell halves** (`split_mold`) — owner spec (2026-06-30): a clean SPLIT, NOT a
   material-removing saw cut. `bisect_plane` + `holes_fill` on each side → two **capped, closed,
   manifold** halves that together reconstitute the whole mold (verified **0.006% volume loss** =
   float noise). The seam is a VERTICAL plane through the **barrel BORE axis** — circle-fit the
   muzzle crown (`_bore_center_x`), NOT the mold symmetry plane/centroid (one-sided controls pull
   that off the bore; "center of the barrel, not the centre of the entire mold"). [VALIDATED]
   - alignment pins on the mating faces — [TODO]
6b. **Solidify EACH half individually** (VALIDATED 2026-07-01) — run `solidify_mold` again on
   `CGS_HALF_L` and `CGS_HALF_R` separately (→ `CGS_HALF_L_SOLID` / `CGS_HALF_R_SOLID`) as the
   final per-half robustness pass before export — owner-required, not just a pre-split solidify.
7. **Done** — export BOTH clamshell halves together as **ONE combined STL** (select both `CGS_HALF_L`
   + `CGS_HALF_R`, `export_selected_objects`/`use_selection=True`) into the dedicated output folder
   **`C:\Users\rene\Desktop\CAD\_AUTOMATED MOLDS\<gun-name>.stl`** — this is the fixed handoff
   location for every cgs-mold run, not the gun's own scan folder. [VALIDATED]

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
# 3. cut A (diagonal grip) + cut B (vertical tail) -> smooth -> remove_overhang? -> offset -> split
```

Every stage is a standalone function — `sweep_dip`, `solidify_mold`, `cut_grip`, `smooth_mold`,
`remove_overhang`, `offset_mold`, `split_mold` — each returns `(object, summary_dict)` and is
non-destructive (builds a NEW object). Tune one stage and render between. (`build_mold` is the legacy
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
  pipeline now runs scan → seal → `sweep_dip` → cut A/B → smooth → offset → decimate → split → export.
- **TODO:** alignment pins on the split mating faces, STL export gate.
- **Seal** is trivial when the scan is already a watertight solid (René's "SOLID GUN FOR AUTOMATION"
  exports import as manifold 0/0, 1 island — just center on origin; no reseal needed).

## Session Notes

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
