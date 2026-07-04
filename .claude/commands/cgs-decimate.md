---
skill: cgs-decimate
description: Decimate an already-loaded STL mesh in Blender to a 120k–125k face budget via a solved Decimate (collapse) modifier, then apply. DECIMATION ONLY — add modifier → solve the ratio to the band → apply; no align/seal/union/voxel/cut/offset/export. Axis-agnostic, non-destructive by default (works a copy). Blender-only sibling of cgs-align / cgs-mold.
---

Invoke the `cgs-decimate` skill — reduce the provided/loaded STL mesh to the 120,000–125,000 face band by adding a Decimate (collapse) modifier, solving its ratio against the evaluated face count, and applying it. Decimation ONLY: no other processing; works a copy by default so the source is untouched. Confirm blender-mcp is live, run the engine, and verify the final face count is in-band.
