---
name: proj-blender-department-2026-06-23
description: "BLENDER DEPARTMENT — automate René Spatz holster-blocking (HK_45) hours→minutes; Phase-1 prep DONE+verified, blender-mcp set up (needs restart to go live), Phase-2 blocking next"
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
STATE: **Phase-1 DONE + verified LIVE on Blender 5.0** (commit ca926736) — self-tuning voxel remesh overshoots then decimates into the band; verified on the real scan: 119,498→remesh 173,650→decimate **118,495 faces (in band)**, centered, ~45s vs ~30–45min manual. Foreground-watchable: `/Applications/Blender.app/Contents/MacOS/Blender --python _SYSTEM/blender/holster_prep_phase1.py -- --input <scan> --output <out.stl> --faces 117500`. **blender-mcp SET UP** (Marcel-approved): MCP server `blender` (`uvx blender-mcp`) in `~/.claude.json` (project scope) + addon (v0.2) at `~/Library/Application Support/Blender/5.0/scripts/addons/blender_mcp_addon.py` — BOTH validated (addon registers in 5.0; uvx server starts; bridge github.com/ahujasid/blender-mcp, tool `execute_blender_code`).
NEXT: **go LIVE for Phase-2** — Marcel: enable "Blender MCP" addon in Prefs → N-panel → BlenderMCP → "Connect to Claude" → **RESTART the Claude session** so the blender MCP tools load → then drive Blender live to build the BLOCKING with Marcel steering the craft (draw axis = gun long Y; ~2mm Kydex offset +0.5 spring-back; split at Y=0). Open design Q: the right offset primitive = a DIRECTIONAL silhouette-sweep along the draw axis (NOT an omnidirectional convex hull, which over-fills). SEE [[proj-agentic-digital-company-2026-06-22]].
