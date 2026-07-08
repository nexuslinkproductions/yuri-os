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

## Pipeline (owner gun-dip method — validated)

1. **Swept solid (the dip)** — gun-solid drawn continuously along the draw axis (+Y) through a
   block carves a continuous cavity; invert + solidify → the swept-gun positive = **the mold**.
   No stepping (union-of-copies = steps = rejected).
2. **Solidify / fill** — voxel-remesh the mold into ONE filled solid (manifold 0/0, single island,
   bbox preserved). This is the precondition for a clean cut (see failure-rule 2). [VALIDATED]
3. **Grip cut** — separate **CUBE cutter**, `BOOLEAN DIFFERENCE`, **`solver='FLOAT'`** on the solid
   (EXACT empties on heavy voxel meshes). Diagonal plane through two owner-set points:
   **first = trigger-guard/grip corner, `corner_below_mm` (20) BELOW**; **second = beavertail,
   `beavertail_below_mm` (10) BELOW**. Cube top face on that line, body on the grip side; delete cube. [VALIDATED]
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
6. **Split into clamshell halves** (`split_mold`) — owner spec (2026-06-30): a clean SPLIT, NOT a
   material-removing saw cut. `bisect_plane` + `holes_fill` on each side → two **capped, closed,
   manifold** halves that together reconstitute the whole mold (verified **0.006% volume loss** =
   float noise). The seam is a VERTICAL plane through the **barrel BORE axis** — circle-fit the
   muzzle crown (`_bore_center_x`), NOT the mold symmetry plane/centroid (one-sided controls pull
   that off the bore; "center of the barrel, not the centre of the entire mold"). [VALIDATED]
   - alignment pins on the mating faces — [TODO]
7. **Done** — export STL, hand to René. [TODO]

## Invocation (blender-mcp must be live on :9876)

Run the engine inside Blender via `execute_blender_code`; it execs the on-disk module so the
heavy logic stays version-controlled:

```python
import json
exec(open("/Users/marcelspatz/YURI-OS-MUSUBI/.claude/skills/cgs-mold/scripts/cgs_mold.py").read(), globals())
params = json.load(open("/Users/marcelspatz/YURI-OS-MUSUBI/.claude/skills/cgs-mold/params/hk45.json"))
build_mold("<MOLD_SHELL_OBJECT>", params)   # solidify -> cut -> 4-stage smooth; never edits the input
```

`build_mold` runs the validated CORE (solidify → cut → smooth) on a swept-mold shell object. The
stages are also callable individually — `solidify_mold`, `cut_grip`, `smooth_mold`, `remove_overhang`
— so the owner can tune one stage and render between. Each returns `(object, summary_dict)` and is
non-destructive (every stage builds a NEW object). `build_mold` writes `/tmp/cgs_mold_summary.json`.

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
- **TODO:** +0.4mm offset, un-subdivide/decimate, X/Y split into clamshell halves + alignment pins, STL export gate.
- **Upstream not re-validated this session:** the seal→dip/sweep stages that produce the mold shell
  (this run started from a pre-existing swept shell). Those need their own validation pass + functions.

## Session Notes

### 2026-07-06
- session: 54m | peak ctx: 0% | compacts: 0
- tools: Bash×601, Read×198, Edit×56, WebFetch×28, Write×17, Agent×13, WebSearch×9, StructuredOutput×9, ToolSearch×8, mcp×2, ReportFindings×2, TaskList×1, TaskOutput×1, Workflow×1, CronCreate×1
- corrections: none
- errors: none

### 2026-06-30
- session: 1167m | peak ctx: 0% | compacts: 0
- tools: Read×2267, Shell×951, Grep×328, Write×271, mcp×54, Bash×38, Edit×18
- corrections: that was successful, we need to clean the back face up before we continue otherwise we will run into issues again.
- errors: none
