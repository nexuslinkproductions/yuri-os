# Holster-Blocking Pipeline — Master Engineering Spec (Blender-only)

The compounding reference for the custom-gear.ch holster department. Synthesizes the HK45 anatomy research (`02_RESOURCES/RESEARCH/hk45-anatomy/`) + the Blender-engineering research (`02_RESOURCES/RESEARCH/blender-engineering/`) + the live build (`BLOCKING-BUILD-LOG.md`, `RUNBOOK.md`). Goal: **turnkey any-gun-scan → perfectly engineered Kydex split-mold, in Blender alone.**

## 1. Architecture: Blender-only (owner directive 2026-06-24)
René currently uses Blender (prep) + FreeCAD/Shapr3D (blocking). This spec replaces the CAD hop. **STL is sufficient** for 3D-printed PETG/ASA Kydex molds (slicers tessellate anyway; STEP adds nothing for FDM). STEP only if a customer demands CNC-machined molds / GD&T — then FreeCAD headless round-trip (mesh→Part shape→SEW→solid→STEP), which yields a *faceted* B-rep, editable as a solid not as sketches. *(engineering E4)*

Pipeline (all Blender): `scan.stl → holster_prep_phase1.py (voxel-seal + decimate 115–120k + center) → block (multi-part clean boxes + tunnels) → crisp pass → grip cut → split X-normal → mechanical improvements → STL halves → 3D-print`.

## 2. The any-gun pipeline = parameterized bpy/bmesh spine + per-gun JSON (engineering E2 verdict)
**NOT Sverchok** (its own docs disclaim full NURBS; native NURBS API "very poor"; CSG Boolean node flaky). **NOT pure Geometry Nodes** (per-gun dims awkward as node inputs). The validated approach: a **parameterized Python script** reading a `gun_params.json` preset, building the multi-part boolean assembly + crisp pass. Geometry Nodes reserved only for constant-section sub-parts (sight bore, barrel). This is exactly what `HK45_blocking_v4` already does — generalize it with a JSON param table.

## 3. Per-gun anatomy-research procedure (anatomy 04) — run BEFORE blocking any new scan
1. Local-first: `ai search "<gun> specs controls"`. 2. Online-verify ≥2 primary sources (manufacturer manual/spec page, Wikipedia). 3. Extract the per-gun parameter set (OAL, slide width, sight height, barrel protrusion, **control protrusions L/R + Y**, trigger-guard drop, grip length, variants). 4. Map researched features onto the scan frame (muzzle=−Y, draw-axis=Y; align by OAL + trigger-guard/muzzle landmarks). 5. Apply the **part→tunnel decision table** (§4). Research gives the rule + sanity envelope; **the scan gives the exact geometry** (measure live, don't trust published mm for fine features).

## 4. Part → tunnel decision table (THE reusable artifact — anatomy 04)
| Feature category | Direction | Blocking operation |
|---|---|---|
| Sights / RDS / beavertail / hammer | TOP +Z / rear | sight-bore roof tunnel — clear TALLEST, full draw-axis |
| Slide-stop / safety / mag-release / serrations | SIDE ±X | side clearance tunnel to ±X max (BOTH halves if ambi) |
| Ejection port / extractor / rail slots | UNDERcut (inward) | FILL smooth — never hull into hollows |
| Trigger guard loop | DOWN −Z | ENCLOSE fully (retention detent + trigger safety) |
| Threaded barrel / comp / muzzle | AXIAL forward | open muzzle + radial ramp |
| Weapon light (mounted) | DOWN/side | enclose light body (primary retention) |
| Grip + backstrap + magazine | GRIP (rear) | CUT at holster mouth |

## 5. The build method (validated on v4: silhouette Δ≤2mm vs father CAD)
Multi-part **clean measured primitives** boolean-UNION'd → grip cut → crisp pass. **NEVER voxel-remesh the final surface** (Marching-Cubes rounds sharp edges — the recurring failure across sessions 1–3). Boxes are clean flat facets by construction. Scan = measurement/shrinkwrap reference only.

## 6. Definitive crisp-edge stack (engineering E3, validated Blender 5.0)
1. Heal: `remove_doubles → recalc_face_normals → holes_fill → dissolve_degenerate`; gate `non_manifold_edges==0`.
2. Decimate **DISSOLVE ~1°** (planar) to merge coplanar slivers; **Delimit:Sharp/Normals** preserves feature edges.
3. **Bevel**(`limit_method='ANGLE'` (30°) or `'WEIGHT'`, `segments=2`, `profile=0.5`, `clamp_overlap=True`, `harden_normals=True`, `face_strength_mode='FSTR_AFFECTED'`, `mark_sharp=True`); per-edge via `bm.edges.layers.float "bevel_weight_edge"` (NOT `edge.bevel_weight`).
4. **Weighted Normal**(`weight_mode='FACE_AREA'`, `weight=75`, `keep_sharp=True`, `use_face_influence=True`).
5. `bpy.ops.object.shade_auto_smooth(angle=40°)`.
Solver: **MANIFOLD** (4.5+) default for watertight; **EXACT** for non-manifold/coplanar (`use_hole_tolerant` only when EXACT errors). Avoid FAST (T-junctions).

## 7. Scan reverse-engineering (engineering E4)
Best noisy-scan→clean-flats: **Decimate PLANAR (DISSOLVE) + Delimit:Sharp/Normals** (#1 — HK45 scan is flat-panel-heavy). Re-seal non-manifold with **Remesh SHARP** (octree_depth 7, sharpness 1.0 — edge-preserving; "dual contouring" is inference, not docs-named). **QuadriFlow `use_preserve_sharp` only works AFTER sharp edges exist** — useless on a voxel blob. Finish: Shrinkwrap cage (OUTSIDE_SURFACE) onto raw scan + Data-Transfer normals.

## 8. Precision (engineering E1)
- Float32 at mm scale is a **non-issue** (ULP ≈30nm at gun scale, 6700× finer than ±0.2mm print tol). Real risk = distance-from-origin (keep within ±10m).
- Unit settings are **display-only** (verts always float32 meters). Set `METRIC / scale_length=0.001 / MILLIMETERS` once.
- **Apply All Transforms before every boolean/bevel/export** — non-applied scale distorts operator math. Non-negotiable.
- STL export gate: `use_scene_unit=True`; verify 215mm reads as 215mm in slicer (STL has no unit metadata). 3D Print Toolbox = pre-export QC.

## 9. HK45 Tactical — locked tunnel spec (anatomy 01–04 + 00-MASTER)
- Envelope 37.6 × 218 × 82mm (grip cut at z≈−29). Slide crown 47.8; **sight-bore roof = scan-max 53.25** (research rule "clear tallest sight" → scan gives exact value).
- **Barrel M16×1 LH** (NOT RH — Mark 23 confusion), protrudes ~18.8mm → front-bore tunnel. Threaded, suppressor-height sights.
- **Ambi slide-stop** both sides (width driver, ±~18 per scan); **paddle mag-release** ambi (rear of trigger guard); **safety = variant** (V1/V3/V9 LEFT, **V7 LEM = NONE**, V10 R, V12 ambi). Scanned gun ⇒ V1. **No separate takedown lever** (slide-stop doubles). **Hammer** = rear roof tunnel. **Ejection-port lip (right)** = #1 snag → fill/extend right wall.
- **Trigger guard = enclosed cutout** (#1 safety; HK45T LEM V7 DAO, no manual safety, ~4.5lb — trigger MUST be covered). **Rail = MIL-STD-1913, 4 slots** → fill smooth. Grip: ~71mm removed; S/M/L backstraps (conservative L).

## 10. Split + mechanical improvements (owner: "test improvements out")
Split at X=0 (normal X) per René's image9/10 — his "split along Y" names the lengthwise seam, not the plane normal. `bisect + use_fill`, re-center each half. Improvements to prototype/test:
1. ✅ **Alignment pins + bores** (2–4 asymmetric 3mm; R=stubs, L=sockets, 0.98× slip-fit) — DONE on v4 split.
2. **Draft 1–3°** on draw-axis (Y) walls (build into cross-sections, not Simple-Deform-TAPER approximation).
3. **Bell-mouth flared muzzle entry** (self-guiding holster mouth).
4. **Sight channel extended past muzzle** (clean exit).
5. **Adjustable-retention detent** (tunable bump/screw boss).
6. **Inner fillets ≥1.6mm** (Bevel; 0.5× Kydex sheet thickness); parting-line optimization.
7. Lightweight/lattice + support-free channel design (overhangs ≤45°).

## 11. Manufacturing (RUNBOOK §9 + E4)
PETG (80–100% infill, 4+ walls, 0.15–0.2mm) or ASA; **never PLA** (melts at Kydex ~120–165°C). Aluminum tape on mold face. Mold shrink +0.4–0.7%. Watertight QC gate (`non_manifold==0`, normals, self-intersection=0) before every export.

## STATUS
- ✅ Phase-1 prep (`holster_prep_phase1.py`), ✅ v4 blocking (Δ≤2mm vs CAD, parametric, crisp), ✅ split into 2 manifold halves + alignment pins + STL (Blender-only end-to-end demonstrated).
- ⏳ v5: crown slide top + validated crisp stack (§6) + draft (improvement #2) → re-split. ⏳ bell-mouth + retention detent. ⏳ `gun_params.json` parametrization → any-gun turnkey. ⏳ commit scripts to `_SYSTEM/blender/` + `ai reindex` research.
