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
7. **Clean up the debris** (`cleanup=True`, on by default) — Degenerate Dissolve + Delete Loose
   (faces **and** edges **and** verts) via bmesh, then re-count islands. See below; this is not optional.

## Post-collapse cleanup — MANDATORY, not cosmetic

**A collapse decimate leaves zero-area faces and detached slivers. They are not harmless.**

Measured 2026-07-29 on `SIG_P226_TLR-1-1S-1-HL_OWB_RH_MOLD.stl` (FreeCADCmd 1.1, i7-14700K). The decimate
left a **2-facet zero-area sliver, 0.01 × 0.00 × 0.02 mm**, detached from the body. FreeCAD read the export
as **2 components**, and `Part.Shell(shape.Faces)` — the exact call behind the Part workbench's
*Convert to Solid* — behaved like this:

| mesh | facets | components | `Part.Shell(faces)` |
|---|---|---|---|
| dirty (sliver present) | 128,982 | 2 | **>600s, killed**, ~900k `<ElementMap> unresolved duplicate element mapping` lines |
| cleaned | 103,184 | 1 | **118.3s**, valid closed solid |

FreeCAD 1.x topological naming thrashes on degenerate faces. **One zero-area triangle cost a ten-minute
hang** in the downstream CAM pipeline, and it looked like a face-count problem — it was not. Volume across
the two decimations moved by 0.0007% (916,436.44 → 916,429.69 mm³), so the face count was never the issue.

The engine now does this automatically after Apply. The manual equivalent, for a mesh decimated outside
this skill:

```
Edit Mode -> A (select all)
Mesh > Clean Up > Degenerate Dissolve   (F9 -> Merge Distance 0.02, units = mm)
Mesh > Clean Up > Delete Loose          (F9 -> Vertices + Edges + Faces, ALL THREE)
```

**Faces must be ticked** — an isolated triangle is loose *geometry* but not a loose vert or edge, so the
default two-box Delete Loose misses it entirely.

`cleanup_debris(obj, merge_distance=None)` is also exported standalone for a mesh that was decimated
elsewhere. `merge_distance=None` derives `1e-4 × bbox diagonal`, so it is scale-relative and behaves the
same in a mm or m scene. Implemented in bmesh (no edit-mode ops) so it is headless-safe.

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
stats  = cleanup_debris(obj)                     # standalone: clean a mesh decimated elsewhere

print(s)   # status (converged / already_in_band / below_band / gave_up), original_faces, final_faces,
           # in_band (True), final_ratio, iterations, reduction_pct, verts, nonmanifold, boundary, history,
           # cleanup {faces_removed, loose_faces/edges_deleted, islands_before/after, single_island}
```

- `decimate_object(obj_name=None, target=122500, lo=120000, hi=125000, in_place=False, out_name=None, use_symmetry=False, symmetry_axis='X', max_iters=6, cleanup=True, merge_distance=None)` — entry point.
- `cleanup_debris(obj, merge_distance=None)` — Degenerate Dissolve + Delete Loose (faces/edges/verts) on a
  mesh datablock, in place. Called automatically after Apply; exported for standalone use.
- `import_and_decimate(path, in_place=False, **kw)` — import STL then decimate.
- **Capture the summary from `execute_blender_code`**: blender-mcp does not echo stdout — `json.dump(s, open(r"...\_SYSTEM\state\cgs_decimate_smoke.json","w"))` inside the call, then Read the file (delete it after).

## Verify (do this on every real run)

Confirm the returned evidence: **`status == "converged"`**, **`in_band == True`**, `120000 <=
final_faces <= 125000`, and **`cleanup.single_island == True`** (more than one island means detached
debris survived — do not export that mesh, it is the FreeCAD-hang shape). Check `nonmanifold` / `boundary` didn't explode — collapse preserves the input's
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

### 2026-07-29 (v1.1.0, mandatory post-collapse cleanup added)
- **Trigger:** FreeCAD hung importing a decimated P226 OWB mold. Diagnosed headless with `FreeCADCmd`:
  the cost was NOT the 129k facets (geometry work totalled ~9s) — it was `Part.Shell(shape.Faces)` at
  >600s emitting ~900k `<ElementMap> unresolved duplicate element mapping` lines. Root cause: a 2-facet
  zero-area sliver left by this skill's collapse, which FreeCAD read as a second component. After
  cleanup the identical call ran in 118s.
- **Wrong turn worth recording:** the first diagnosis blamed `Part.Shell(faces)` itself and produced a
  macro built on `makeShapeFromMesh(sew=True)` (383s, valid solid, 3× slower). That probe ran on the
  DIRTY mesh, so it measured the debris, not the algorithm. René's own manual GUI run — and his macro
  recording, which shows the Part workbench doing exactly `Part.Solid(Part.Shell(__s__))` — refuted it.
  **Measure the clean case before blaming the algorithm.**
- Added `cleanup_debris()` (bmesh: `dissolve_degenerate` + delete loose faces→edges→verts, island
  recount) and wired it into `decimate_object` after Apply (`cleanup=True` default). `merge_distance`
  defaults to `1e-4 × bbox diagonal` so it is scale-relative.
- **Delete Loose needs the FACES box.** An isolated triangle is neither a loose vert nor a loose edge —
  the default two-box Delete Loose misses it. That box is what actually fixed the mold.
- Verified headless in Blender 5.1.2 (`--background --factory-startup`), two smokes, both branches:
  (1) degenerate sliver + loose edge + loose vert on a 3,072-face body → 1 face removed, 6 verts removed,
  islands 2→1, body 0 non-manifold / 0 boundary, and a re-run changed nothing (idempotent);
  (2) a healthy DETACHED 20mm triangle that Degenerate Dissolve cannot touch → caught by the loose-faces
  branch, islands 2→1, count restored exactly. All 11 assertions passed.
- Face count is NOT the quality lever people assume: 128,980 → 103,184 facets moved the mold's volume by
  0.0007% (916,436.44 → 916,429.69 mm³) and its area by 0.005%.
- Tools: Bash (FreeCADCmd + Blender headless), Read/Write/Edit. blender-mcp was NOT available this
  session (server never exposed tools) — verification went through `blender.exe --background` instead,
  which is the better test anyway: it never touches René's live scene.

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
