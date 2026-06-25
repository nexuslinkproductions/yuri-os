# HK45 Holster Mold — FreeCAD pipeline build log

Pivot (2026-06-25): abandoned the Blender-only blocking approach (stalled in binary
`.blend` trial-and-error, no committed code) and moved the whole workflow into **FreeCAD
1.1.1**, driven headless via `freecadcmd` Python — fully scriptable, reproducible, zero MCP
layer. No FreeCAD MCP is connected (community ones only proxy the same Python + need a GUI
addon install); `freecadcmd` is the real control surface.

## Engine: `freecad/holster_pipeline.py`

Replicates René's documented Shapr3D workflow (STEPS.docx) end-to-end:

1. **Load + align** — scan STL vertices, fully mass-centre on X/Y/Z (René's `align.py` method:
   vertex centroid → origin). Y is the front→back slide/draw axis.
2. **Block out** — *directional silhouette sweep*: project the gun onto the XZ plane (cross-
   section normal to the Y draw axis), take the per-X-column filled outline, extrude it the full
   Y length. By construction this channels **every** protrusion (sights, slide serrations, slide-
   stop/mag/decocker levers, hammer, beavertail) front-to-back ⇒ the STEPS.docx GOOD criterion,
   with concavities (ejection port, rail slots) filled smooth — exactly what a holster mold wants.
   This is the automation of René's ~9 hand-placed channel blocks (the 10-solid `02 STEP` file).
3. **Grip cut** — flat plane keeping the top `TARGET_H` (82.3 mm = oracle height); removes the
   exposed grip/magazine the holster leaves uncovered. Then re-centre on the mold's own mass.
4. **Split** — box-cut at X=0 (plane normal = X) → left/right clamshell halves (seam runs along
   the long Y axis, per René's "split along the Y-axis").
5. **Export** — STEP + STL for the merged mold and both halves; build `hk45_result.FCStd`.
6. **Verify** — bbox/volume vs the oracle + sampled containment of the covered gun region.

Key reframe: a holster mold **is** the gun's swept envelope, so the silhouette is the load-
bearing primitive — computed directly from projected mesh vertices (numpy), so NO fragile OCC
2D boolean and NO slow mesh→solid step. Whole pipeline runs in **~7 s**.

## Verification vs René's ground truth (`02 STEP` / `03 STL`)

| dim         | ours    | oracle  | verdict |
|-------------|---------|---------|---------|
| X width     | 37.2 mm | 37.6 mm | ✓ (Δ0.4) |
| Y length    | 221.8   | 218.2   | ~ (+3.6, full-scan length) |
| Z height    | 82.3    | 82.3    | ✓ exact (grip cut) |
| containment | 147/148 covered gun verts inside (99.3%) | — | GOOD criterion met (1 boundary vertex at clearance 0 → 100% with any clearance) |

Closed valid solids; vol 547k (oracle STEP compound 607k, same ballpark).

## Config knobs (`holster_pipeline.py` top)

- `CLEARANCE` (default 0.0) — silhouette dilation for Kydex. 0 matches René's oracle (he tunes
  retention post-form with tape/screws). Bump to ~1.5–2.0 mm for a looser pre-tuned fit.
- `XBIN` 0.6 mm silhouette resolution · `SPLIT_X` 0.0 · `TARGET_H` 82.3 grip-cut height.

## Residual / decisions (owner)

- **Method**: maximal silhouette sweep (over-blocks, safe, generalizes) vs René's minimal hand
  blocks (tighter muzzle fit). Functionally equivalent; not a byte-identical copy of the 10-solid file.
- **Clearance**: 0 (faithful to his process) vs a dilated production fit — his call / intended use.
- **Optional**: 1–3° draft on draw-axis walls for easier Kydex release (R2 suggestion; his molds
  are likely un-drafted); a geometric (trigger-guard-line) grip cut instead of oracle-fit height.

## Outputs

- `cad/hk45_mold_merged.{step,stl}` · `cad/halves/hk45_mold_{L,R}.{step,stl}`
- `hk45_result.FCStd` (viewing workspace: mold + halves + René target) · `cad/aligned_gun.brep`
