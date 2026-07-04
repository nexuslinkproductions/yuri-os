---
name: cgs-decimate
description: Decimate an already-loaded STL mesh in Blender to a 120k–125k face budget via a solved Decimate (collapse) modifier, then apply it. DECIMATION ONLY — add modifier → solve the collapse ratio to the face band → apply; no align, no seal, no union, no voxel, no cut, no offset, no export. Reads only mesh topology (axis-agnostic). Non-destructive by default (works a copy). Use when René says "decimate this STL", "cgs-decimate", "reduce to 120–125k faces", or provides an STL + active Blender MCP and asks only to decimate it. Blender-only. Sibling of cgs-align / cgs-mold.
triggers: ["cgs-decimate", "/cgs-decimate", "decimate this stl", "decimate to 120k", "decimate the mesh", "reduce face count", "reduce faces to 120k", "decimate in blender"]
---

# cgs-decimate — loaded STL → 120k–125k face budget (Blender-only, decimation ONLY)

Takes a mesh already imported into Blender (or imports one) and reduces it to René's **120,000–125,000
face** budget with **one Decimate (collapse) modifier**, whose ratio is **solved** against the live
evaluated face count and then applied. Same shape, coarser mesh. Nothing else moved or processed.
Owner-context-verified live on the PDP steel-frame gun (2026-07-04): 682,479 → 122,499 faces, one shot.

> Sibling of **cgs-align** / **cgs-mold**. This is the standalone realisation of cgs-mold's
> `decimate_mold` collapse-to-budget stage — de-scoped to *only* decimate. It is **axis-agnostic**:
> it reads mesh topology (face / vert / edge counts), never orientation, so an aligned OR raw mesh
> decimates identically. Feed it a cgs-align'd object or a raw scan — same result.

## The manual path this automates

`MODIFIER ▸ ADD MODIFIER ▸ DECIMATE` (Collapse), then drag the ratio until the header face count reads
120–125k, then **Apply**. The engine does exactly that, but **solves** the ratio numerically instead of
dragging the slider, and reads the count from the depsgraph so it never has to guess.

## SCOPE — decimation only

Do **only** the face-count reduction. Explicitly out of scope (other skills' jobs): align / center /
seal / island-union / voxel-remesh / solidify / smooth / grip-cut / offset / split / export. Decimation
is **lossy and irreversible**, so by default the engine works a **copy** (`<name>_DECIMATED`) and leaves
the source mesh untouched.

## Method (what the engine does)

1. **Resolve the target** — explicit name → active mesh → the sole visible mesh in the scene (raises a
   helpful error if it's ambiguous).
2. **Read the original count** — `len(mesh.polygons)`. An STL is fully triangulated, so polygons ==
   triangles and the collapse ratio is exact against the triangle count.
3. **Short-circuit the no-op cases** — already in `[120k, 125k]` → return untouched; already **below**
   120k → return untouched with a warning (decimate only *removes* faces, it can't reach the band from
   below).
4. **Add ONE Decimate modifier** — `decimate_type='COLLAPSE'`, `use_collapse_triangulate=True` (keep the
   output all-triangles at collapse sites), `use_symmetry=False` (unless asked). Collapse is the only
   mode with a continuous face-count dial (`ratio` ∈ [0,1] = "ratio of triangles to reduce to");
   UNSUBDIV steps in whole subdiv levels, PLANAR/DISSOLVE merges by coplanar angle — neither hits a count.
5. **Solve the ratio** — seed `ratio = target / original` (target = 122,500, the band midpoint), read the
   **evaluated** face count, then proportional-correct `ratio *= target / achieved` and re-read. Stop the
   moment the evaluated count lands anywhere in `[120k, 125k]`; cap at 6 iterations. In practice it
   converges in **1** iteration on a clean scan — the collapse ratio→count curve is near-perfectly linear
   (live: seed 0.1795 landed 122,499, one face off the 122,500 aim).
6. **Apply** — bake the modifier into real mesh data, then read the true final `len(mesh.polygons)` and a
   manifold check (non-manifold + boundary edge counts) as evidence.

**Face-count readback — depsgraph, never `modifier.face_count`.** The ratio solve reads the post-modifier
count by evaluating the depsgraph and counting the evaluated mesh's polygons **without applying**
(`obj.evaluated_get(depsgraph).data.polygons`). `DecimateModifier.face_count` is a UI-display readonly
field with a documented history of desyncing from the evaluated (Copy-on-Write) copy in scripted /
headless contexts with no viewport redraw (Blender T57777 / T58654 / T60722) — the depsgraph path is the
API-documented, bug-free readback, verified live in `_SYSTEM/blender/holster_prep_phase1.py` and confirmed
exact here (predicted 122,499, mesh baked to 122,499).

## Invocation (blender-mcp must be live on :9876)

```python
exec(open(r"C:\Users\rene\.claude\skills\cgs-decimate\scripts\cgs_decimate.py").read(), globals())

obj, s = decimate_object()                       # active / sole mesh -> writes <name>_DECIMATED (source kept)
obj, s = decimate_object("PDP STEEL FRAME SOLID GUN")
obj, s = decimate_object(name, in_place=True)    # decimate the object's OWN mesh (no copy)
obj, s = decimate_object(name, lo=118000, hi=122000, target=120000)   # a different band
obj, s = import_and_decimate(r"C:\Users\rene\Desktop\CAD\...\scan.stl")

print(s)   # status (converged / already_in_band / below_band / gave_up), original_faces, final_faces,
           # in_band (True), final_ratio, iterations, reduction_pct, verts, nonmanifold, boundary, history
```

- `decimate_object(obj_name=None, target=122500, lo=120000, hi=125000, in_place=False, out_name=None, use_symmetry=False, symmetry_axis='X', max_iters=6)` — entry point.
- `import_and_decimate(path, in_place=False, **kw)` — import STL then decimate.
- **Capture the summary from `execute_blender_code`**: blender-mcp does not echo stdout — `json.dump(s, open(r"...\_SYSTEM\state\cgs_decimate_smoke.json","w"))` inside the call, then Read the file (delete it after).

## Verify (do this on every real run)

Confirm the returned evidence: **`status == "converged"`**, **`in_band == True`**, and `120000 <=
final_faces <= 125000`. Check `nonmanifold` / `boundary` didn't explode — collapse preserves the input's
topology quality; a few (like the PDP's 3/3) are inherited from the raw scan, a big jump means a bad input
mesh (seal it with cgs-mold first). Eyeball `reduction_pct` and `iterations` (1 is typical on a clean
scan). If `status == "below_band"` the mesh was already under budget — nothing to do. If `gave_up`, the
closest ratio was still applied; inspect `history` and the input topology (a mesh that can't reach the
band even at ratio ~1.0 is a signal, not a routine miss). Optionally render/inspect the decimated copy to
confirm the silhouette is intact.

## Safety conventions

- **Non-destructive by default** (`in_place=False`) — writes `<name>_DECIMATED`, the source stays. Pass
  `in_place=True` only when you intend to replace the heavy mesh. Decimation is lossy + irreversible.
- **Apply upstream modifiers first.** If the object carries other *un-applied* modifiers, the collapse is
  added at the end of the stack (evaluated count still correct, `existing_modifiers` is reported), but the
  reported `original_faces` reads the base mesh — apply upstream stages first for a clean number.
- OBJECT mode is forced before add/apply; the target is selected + made active (headless-safe).
- Never touch protected paths; reads/writes only the Blender object.

## Status / scope

- **Owner-context-verified live 2026-07-04** on `PDP STEEL FRAME SOLID GUN` (682,479 faces): decimated a
  copy to **122,499 faces**, `status=converged`, `in_band=true`, **1 iteration**, 82.1% reduction, source
  left untouched, scene restored to as-found after the test.
- Factored from cgs-mold's owner-validated `decimate_mold` collapse-to-budget stage
  (`target_faces=123000`, <1.5% band, ≤5 iters — live 119,549 / 121,228 / 121,643, manifold 0/0). Same
  solver, generalised to the **120k–125k** band, de-scoped to decimation only, and improved to a single
  depsgraph-probed modifier (no re-dup + re-apply per iteration).
- Depsgraph-eval readback matches the live-verified pattern in `_SYSTEM/blender/holster_prep_phase1.py`.
- Depends on **blender-mcp** live on :9876.

## Session Notes

### 2026-07-04 (v1.0.0, created + live-verified on the PDP gun)
- Built via the opus-fleet model: 3 parallel Sonnet research lanes (sibling-skill conventions · Blender
  Decimate mechanics + API verification · registration mechanics), Opus synthesised → wrote → registered →
  live-smoke-verified against René's actually-loaded gun.
- **Core engineering decisions (from the research):** (a) COLLAPSE, not UNSUBDIV/PLANAR — the only mode
  with a continuous `ratio` face-count dial; (b) read the achieved count via **depsgraph eval, never
  `modifier.face_count`** — the latter has a documented desync-in-headless history (Blender
  T57777 / T58654 / T60722); confirmed exact here (predicted == baked == 122,499); (c) proportional-correct
  the ratio against the *measured* count (self-corrects any non-linearity near the extremes), stop on the
  first in-band hit, cap 6 iters; (d) non-destructive by default because decimation is lossy/irreversible
  (unlike cgs-align's reversible rigid transform).
- **Improves on** cgs-mold's `decimate_mold` reference: one modifier probed via the depsgraph (no
  re-dup + re-apply each iteration) and a *band* rather than a single centred value.
- **Verify-agent-output caught a real miss:** the registration research lane reported the skill lives in
  ONE repo location; local `ls` showed cgs-align/cgs-mold are mirrored **byte-identical in BOTH** the repo
  `.claude/skills/` and the user-level `~/.claude/skills/` (the harness-loaded root) — cgs-decimate is
  written to both, same as its siblings.
- Tools: Read, Write, Edit, Bash, Agent (3× Sonnet Explore), blender-mcp (execute_blender_code,
  get_scene_info). Errors: none (first live run converged in 1 iteration).
- Registered at `.claude/skills/cgs-decimate/` (repo, git-tracked) + `~/.claude/skills/cgs-decimate/`
  (user-level mirror). Alias: `commands/cgs-decimate.md` (both roots).
