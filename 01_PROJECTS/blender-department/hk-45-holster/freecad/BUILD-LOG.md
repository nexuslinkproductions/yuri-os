# HK45 Holster Mold — FreeCAD pipeline build log

Pivot (2026-06-25): abandoned the Blender-only blocking (stalled in binary `.blend`
trial-and-error) and moved the whole workflow into **FreeCAD 1.1.1**, driven headless via
`freecadcmd` Python — fully scriptable, reproducible, zero MCP layer. No FreeCAD MCP is
connected (community ones only proxy the same Python + need a GUI addon install);
`freecadcmd` is the real control surface.

## Method evolution (adversarial verification mattered)

**v1 — silhouette prism (WRONG, superseded).** First approach: project the gun onto XZ and
extrude the filled silhouette the full length. It passed bbox (37×218×82) and containment
(99.3%) checks — but those are *necessary, not sufficient*: a featureless block also bounds
and contains the gun. A cross-section comparison vs René's oracle exposed it: the prism has
**no interior geometry along Y** (constant section), while René's mold **varies along its
whole length**. A holster formed over the prism would be a smooth block with no retention.

**v4 — directional per-feature channels (CORRECT, current).** Reverse-engineered from
René's `02 STEP` (10 solids = gun body + 9 channel blocks, each running from its feature
toward the rear draw-exit). The principled automation is a **prefix-union sweep toward the
+Y exit**: per X-column, carry each feature's clearance (running max top / min bottom of Z)
forward from the muzzle to the rear. This reproduces his pattern automatically — the front
sight gets a long flat-top channel; rear controls get short feature→rear channels — with the
gun contour preserved on the sides and bottom (retention). Built as a **heightfield**
(per-cell top & bottom Z surface) so the grip cut is a bottom clamp and the X-split is a cell
partition — no slow/fragile OCC booleans for the body. Runs in ~24 s.

## v4 verification vs René oracle (`03 STL`) — cross-sections

| Y (mm) | v4 [zmin, zmax] | oracle [zmin, zmax] | |
|--------|-----------------|---------------------|--|
| −70 muzzle | [−7.0, **40.7**] | [−7.2, **41.1**] | ✓ flat top + high bottom |
| 0 mid      | [−37.2, 40.7]    | [−37.4, 41.1]       | ✓ near-exact |
| +45        | [−41.2, 40.7]    | [−39.0, 41.1]       | ✓ |
| +70 rear   | [−41.2, 40.7]    | [−25.7, 41.1]       | top ✓; bottom flat-floor vs his rear taper |

Flat sight-channel top runs the full length (Z≈40.7 vs 41.1); width tracks the gun
(X 30→38 vs 27.5→37.6); bottom follows the gun contour. bbox X38.0 Y223.5 Z82.3 (oracle
37.6 / 218.2 / 82.3). Valid closed STEP solids; merged vol ~365k.

## Engine: `freecad/holster_pipeline.py`

align (mass-center) → grid → prefix-union sweep → grip cut (clamp) → heightfield mesh →
X-split → STL + STEP export → cross-section verify vs oracle.

Config knobs (top of file): `XBIN/YBIN` grid · `TARGET_H` 82.3 grip height · `CLEARANCE`
0 (matches René; he tunes retention post-form — bump ~1.5–2 mm for a pre-tuned looser fit)
· `SPLIT_X` 0.

## Residual / next

- Rear-bottom: v4 uses a flat grip floor; oracle tapers up at the very rear (holster mouth).
  Could follow contour at the rear instead of a flat clamp.
- Y length +5 mm vs oracle (full-scan length); trim if exact match wanted.
- Side-control channels are captured by the sweep but not individually tuned vs his #7/#8/#9.
- Clearance offset for a real Kydex press (owner/intended-use decision).

## Outputs

- `cad/v4/hk45_mold_merged.{step,stl}` · `cad/v4/hk45_mold_{L,R}.{step,stl}`
- viewing: `hk45_v4_compare.FCStd` (oracle | v4 merged | v4 L | v4 R)
