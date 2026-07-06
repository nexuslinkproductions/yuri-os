# Claude ↔ Blender + Holster-Blocking Automation (HK_45) — 2026-06-23

3-lane Sonnet research synthesis (connection · capabilities/limits · holster application) + René Spatz's
ground-truth process (STEPS.docx). For the BLENDER DEPARTMENT build job (custom-gear.ch). [P]=primary-cited.

## 1. How Claude drives Blender — `blender-mcp` (ahujasid) [P]

Dominant bridge: **github.com/ahujasid/blender-mcp** (23k★, MIT, active 2026-06). Three layers:
`Claude (MCP client) → MCP server (uvx blender-mcp, FastMCP) → TCP socket :9876 → Blender addon → bpy`.

- **Claude Code setup:** `claude mcp add blender uvx blender-mcp` (writes mcpServers to .claude/settings.json).
  Prereqs: Blender 3.0+, `uv` (brew/winget/curl — NOT pip), install `addon.py` in Blender prefs, N-panel →
  BlenderMCP → Connect. PATH gotcha: GUI launchers strip PATH → use full `/opt/homebrew/bin/uvx`.
- **22 tools.** The power tool is **`execute_blender_code(code)`** — runs arbitrary bpy inside Blender;
  everything bottoms out here. Plus `get_scene_info`, `get_object_info`, `get_viewport_screenshot` (Claude
  SEES the scene), and asset pipelines (PolyHaven/Sketchfab/Hyper3D Rodin/Hunyuan3D — irrelevant to this job).
- **No-MCP alternative (preferred for production):** Claude generates a bpy script → `blender --background
  in.blend --python script.py`. Reproducible, version-controllable, headless, no addon, no telemetry. **This is
  the right mode for a repeatable holster pipeline** (MCP is for interactive/exploratory; a script is the artifact).
- Alternatives (all far behind): GenesisCore (in-Blender LLM UI), blender-open-mcp (Ollama/local), ai-forge-mcp
  (multi-DCC). None rival ahujasid for this use case.

## 2. Capabilities & limits for CAD/scan work [P]

Strong: procedural geometry, modifiers (Boolean/Solidify/Remesh/Decimate/Shrinkwrap), batch ops, scene query.
Weak/blocked: interactive vertex editing, sculpting (no MCP path), multi-million-tri meshes (socket timeout
~40s → decimate FIRST), LLM bpy non-determinism, `bpy.ops` poll()/context errors, NO undo via MCP.

bpy cheat-sheet (Blender 4.x — pin to 3.6 LTS or 4.2 LTS; API churned 3.x→4.x):
- STL import `bpy.ops.wm.stl_import(filepath, forward_axis, up_axis)` (3.x: `import_mesh.stl`, renamed params).
- Boolean: `obj.modifiers.new('B','BOOLEAN'); mod.operation; mod.solver='EXACT'` (MANIFOLD = 4.1+ only).
- Solidify (shell/offset): `'SOLIDIFY'`, `thickness`, `offset=-1|0|+1`, `use_even_offset=True`, mode `NON_MANIFOLD`.
- Voxel remesh (seal scan): `'REMESH'`, `mode='VOXEL'`, `voxel_size` (≈0.8mm keeps serrations).
- Decimate: `'DECIMATE'`, `decimate_type='COLLAPSE'`, `ratio`.
- Bisect (split): `bpy.ops.mesh.bisect(plane_co, plane_no=(0,1,0), use_fill=True, clear_inner=True)` in EDIT mode.
- Always `mode_set('OBJECT')` before `modifier_apply`; save `.blend` first (no undo).
- **STEP import:** no native op. Options — free official "STEP Importer" (extensions.blender.org, Cascadio→glTF);
  STEPper ($18, OCCT); FreeCAD CLI round-trip (STEP→STL). **But file `03 ...STL.stl` IS the STEP already
  tessellated → STEP import is UNNEEDED here; use file 03 for clean geometry, file 01 for scan reference.**

## 3. René's actual process (STEPS.docx — the spec) [ground truth]

Goal: build a MOLD to thermoform a holster. BLOCKING = a channel along the holster's full length covering every
extruding retention point (sights, slide serrations, buttons, levers) so the gun slides front→back in/out
without catching. The doc gives GOOD vs BAD blocking examples = the acceptance criteria (a missed point = BAD).

- **Phase 1 — Blender (currently manual):** (1) import scan `01 ...SCAN FULL GUN.stl`; (2) Remesh modifier;
  (3) Decimate ratio 0.50, repeated until **115k–120k faces**; (4) align to X/Y **mass center**, Z-zero at mass
  center; export STL to a CAD/ folder.
- **Phase 2 — CAD/Shapr3D (the hard value):** import STL; **block out** all retention points front→back; boolean-
  merge the blocking into ONE object; **split along Y-axis** into two halves; re-align both halves to X/Y mass
  center. Export (.SHAPR native).

## 4. Feasibility verdict (HK_45) [P + spec]

- **Phase 1 → ~95% automatable in Blender** via a bpy script: `wm.stl_import` → voxel remesh → decimate in a
  **binary-search loop on `len(obj.data.polygons)` to hit 115–120k** (René's "decimate several times" = scriptable
  exactly) → `origin_set(ORIGIN_CENTER_OF_MASS)` + zero location + `transform_apply` → `wm.stl_export`. Replaces a
  ~30–45 min manual session with a ~2–3 min run. Only human touch: confirm scan orientation (one-time per rig).
- **Phase 2 (blocking) → semi-automatable; this is where the real value + the hard problem are.** Candidate: move
  blocking INTO Blender (kill the Shapr3D hop). Naïve `bpy.ops.mesh.convex_hull` + Solidify gets ~70% but
  OVER-fills (fills bore/ejection port/every concavity) — wrong: René's blocking is **DIRECTIONAL** (a sweep of
  the gun silhouette along the draw/insertion axis = the "channel front→back"), NOT an omnidirectional hull.
  **KEY BUILD QUESTION: the right offset primitive** — a linear sweep/extrude of the cross-section along the draw
  axis (a "shadow volume" along ±Y), then Solidify for clearance + Y-bisect for the two halves. Selective coverage
  (cover these points, not those — per the GOOD/BAD examples) keeps a human in the loop.
- **Parametric knobs that pass cleanly into the script:** target_face_count (115–120k), offset_thickness (Kydex
  clearance, +0.5mm spring-back), draw_side (L/R mirror), sweat_shield_height, split_axis=Y.

## 5. Manufacturing-tolerance risks
Convex-hull over-smoothing (0.5–1.5mm — fills ejection port/rail undercuts; acceptable for Kydex) · Solidify
non-uniformity on the curved grip (±0.3–0.8mm, use NON_MANIFOLD) · voxel rounding at the HK45T threaded barrel
(verify muzzle) · **unit scale (mm vs m) is FATAL — verify bbox ≈215mm after import** · Kydex spring-back
0.5–1.5mm (bake +0.5mm) · Y-split asymmetry (script-verify bbox symmetry, warn if Δ>0.5mm).

## 6. Recommended build path (owner-delegated)
1. Stand up `blender-mcp` (or just headless `blender --background --python`) — pin Blender 4.2 LTS.
2. Ship **Phase-1 script** first (highest certainty, immediate hours→minutes win): import→remesh→decimate-to-target
   →center→export, parametrized. Acceptance: 115–120k faces, bbox≈215mm, centered.
3. Prototype **Phase-2 directional-sweep blocking** in Blender (replace Shapr3D): silhouette-sweep along draw axis
   + Solidify + Y-bisect; validate against the doc's GOOD/BAD examples; human reviews retention coverage.
4. Decide: keep blocking in Blender vs Shapr3D (Shapr3D has ~no headless scripting/Claude path → Blender or FreeCAD
   is the automatable route).

## Sources
[P] github.com/ahujasid/blender-mcp (README + server.py tool inventory + issues) · docs.blender.org/api/current
(wm.stl_import, BooleanModifier, SolidifyModifier, RemeshModifier, DecimateModifier, ShrinkwrapModifier,
ops.mesh.bisect/convex_hull) · extensions.blender.org STEP Importer · github.com/postsilver/import_step ·
github.com/PatrykIti/blender-ai-mcp (context-validated wrapper). Ground truth: HK_45_TACTICAL_PACKAGE/STEPS.docx
(01 scan 5.7MB · 02 STEP 348KB · 03 CAD-STL 6.2MB).
