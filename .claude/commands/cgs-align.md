---
skill: cgs-align
description: Align an uploaded STL (gun or weapon-light) perfectly to world XYZ, mass-centered, inside Blender via blender-mcp. ALIGNMENT ONLY — rotate principal axes onto XYZ + move mass center to origin; no seal/union/voxel/decimate/cut/offset/export. Blender-only sibling of cgs-mold.
---

Argument may name the part, e.g. `Lamp: STREAMLIGHT TLR-7 HL-X`. **"Lamp" always means a weapon-light →
run `mode="light"` (rail seat +Z & level, bezel −Y), never gun mode.** Same for Lampe / torch / flashlight /
WML, or a named light (STREAMLIGHT, TLR-*, SUREFIRE, X300, OLIGHT, PL2, Baldr).

Invoke the `cgs-align` skill — align the provided/loaded STL to world XYZ (rotate principal axes onto the axes, then translate the mass center to the origin) inside Blender via blender-mcp. Alignment ONLY: no other processing. Confirm blender-mcp is live, run the engine, and render-verify the result.
