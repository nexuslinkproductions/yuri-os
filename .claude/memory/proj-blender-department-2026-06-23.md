---
name: proj-blender-department-2026-06-23
description: "BLENDER DEPARTMENT — turnkey ANY-gun holster-blocking pipeline (scan→retopo→clean→blocking) at VETERAN 3D-modeller quality; scan-truth, NO CAD; live blender-mcp; 6-lane research fleet DONE; veteran retopo of scan is the active thread"
metadata:
  node_type: memory
  type: project
  tier: standard
  scope: global
  trig:
    - blender
    - holster
    - hk45
    - rené spatz
    - custom-gear
    - blocking
    - blender-mcp
  refs:
    - proj-agentic-digital-company-2026-06-22
  originSessionId: 204ff7df-f0b6-49d3-9d27-c26c2bacfbf1
---

GOAL: automate René Spatz's manual holster "blocking" (hours→minutes) — a Blender department of the MURE company. Input = a pistol 3D scan; output = a split mold form for thermoforming a Kydex holster.
WHO: René Spatz (holster maker, custom-gear.ch); Marcel directs; this Claude lane builds + verifies.
WHERE: package `~/Downloads/HK_45_TACTICAL_PACKAGE` (`01 ...SCAN FULL GUN.stl` 5.7MB · `02 ...STEP.step` · `03 ...STL.stl` = STEP already tessellated · `STEPS.docx` = the spec). Build: `_SYSTEM/blender/holster_prep_phase1.py`. Research: `02_RESOURCES/RESEARCH/claude-blender-holster-blocking-2026-06-23.md`.
PROCESS (from STEPS.docx): **Phase 1 Blender prep** (import scan → Remesh → Decimate to **115–120k faces** → center on X/Y mass + Z-zero → export) — automatable. **Phase 2 blocking** (cover every retention point so the gun slides front→back along the draw axis; boolean-merge; **split along Y into two mold halves**; re-align) — the hard CRAFT value, was Shapr3D, moving into Blender; semi-manual (human-in-loop for retention coverage per the GOOD/BAD examples in STEPS.docx).
STATE: **Phase-1 (René's voxel-remesh prep) DONE** (commit ca926736) BUT its voxel remesh ROUNDS sharp edges → not veteran-grade (Marching-Cubes lattice-locks vertices). Phase-2 v1 blocking proved the **prefix-union directional swept-silhouette** algorithm CORRECT (coverage check: every retention point above the belt line covered, sights not eroded, grip exposed) — but voxel→QuadriFlow topology was GARBAGE (chaotic flow; 100% quads ≠ good topology). Owner raised the bar to **veteran 3D-modeller quality**: marvellous topology, crisp clean edges, professional.
DECISIONS (owner 2026-06-23): **scan-truth, SKIP CAD ENTIRELY** (no CAD in production — file 03 CAD confirmed clean-but-grip-less via STL stats [155mm² flats] + render, kept ONLY as a private crispness reference this session, hidden in REF_CAD). Source = file 01 (real scan, 119,498 tris, noisy photogrammetry, top6-normal-share 9%). Improve on René's method where possible.
NORTH-STAR (the product): a **turnkey ANY-gun pipeline** — René launches Claude + Blender, drops in any pistol scan, and it auto-**retopologises + cleans + polishes** the scan, then **produces the holster blocking**, detailed and polished. René adopts it once it works.
RESEARCH FLEET DONE (6 cited lanes, 2026-06-23): `_SYSTEM/blender/RUNBOOK.md` (1319-line operating manual) + `02_RESOURCES/RESEARCH/{hk45-gun-anatomy-and-blocking-theory, blender-pro-topology-mold-surfacing}-2026-06-23.md` + `02_RESOURCES/RESEARCH/3d-modelling/{01-topology-fundamentals-and-glossary,02-retopology-and-scan-reverse-engineering,03-hardsurface-subdivision-sharp-edges,04-cad-loft-sweep-surfacing-recommendation}.md`. KEY VETERAN PIPELINE: voxel-remesh rounds edges → fix is feature-aware **Remesh SHARP (dual-contouring) / Decimate PLANAR + Delimit:Sharp** → **QuadriFlow use_preserve_sharp=True** → **Shrinkwrap cage** onto original → Data-Transfer normals → Weighted-Normal + Auto-Smooth. Blocking surface = lofted/bridged equal-N (32) cross-section rings via `bmesh.ops.bridge_loops` NOT voxel. Kydex: inner fillet ≥1.6–2mm, draft 1–4°, mold shrink 0.4–0.7%. QC gates: quad_ratio>0.95, non_manifold=0, face_area_CoV<0.30.
TOOLING: live blender-mcp (`execute_blender_code`, port 9876). MCP addon LACKS get_viewport_screenshot → I render to /tmp via a WORKBENCH camera + Read (helpers: `/tmp/hk45_render.py` render_view w/ wire/obj_color/frame_all; `/tmp/hk45_block.py` build_block prefix-union). Marcel watches his live viewport; I render off-screen as the shared reference; can drive his VIEW_3D via temp_override (view_selected).
NEXT: **veteran retopo of the scan** (file 01, raw) — import → cleanup (Merge-by-Distance, Recalc-Normals-Outside, Fill-Holes, Limited-Dissolve 2–5°) → Mark-Sharp (Select Sharp ~30°) → feature-preserving reduce (Decimate PLANAR 2° + Delimit:Sharp, and/or Remesh SHARP depth-7) → QuadriFlow preserve_sharp → Shrinkwrap onto raw scan → Data-Transfer normals → Weighted-Normal — VERIFY crisp edges in wireframe vs the rounded Phase-1 (local execution is ground truth; research is advisory). THEN rebuild the blocking from the clean base (prefix-union OR lofted rings), split LATERALLY (cut-plane normal = X = my lateral axis, per René's image9/10 — his "split along Y" names the lengthwise seam, NOT plane_no=(0,1,0)), add Kydex fillets + draft. Commit the Phase-2 scripts to `_SYSTEM/blender/` when they work (pathspec only; a parallel session has uncommitted dashboard/ledger files — never sweep them). SEE [[proj-agentic-digital-company-2026-06-22]].
