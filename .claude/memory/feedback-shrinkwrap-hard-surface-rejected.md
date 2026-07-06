---
name: feedback-shrinkwrap-hard-surface-rejected
description: Shrinkwrap-on-generated-topology fails for hard-surface; topology + hardening creases must be placed deliberately per part
metadata: 
  node_type: memory
  type: feedback
  tier: standard
  scope: global
  trig: 
    - shrinkwrap
    - holster blocking
    - hard-surface
    - retopology
    - hk45
    - blender
  refs: 
    - proj-blender-department-2026-06-23
  originSessionId: f2e44073-2978-41eb-a43f-a5189117bfdf
---

**RULE:** Shrinkwrap (and voxel/polar-loft/QuadriFlow-auto) on *generated* topology does NOT produce clean hard-surface for the holster blocking. Owner (Marcel, 2026-06-24, HK45 build): "shrinkwrap will not work if the topology and hardening creases and such aren't placed properly. V6 is a mess." v6 = v4 box-skeleton subdivided + shrinkwrap-to-scan → lumpy mush (inherits scan noise, no edge flow, no creases). REJECTED.

**WHY:** Hard-surface crispness comes from **deliberately placed topology that follows the gun's feature lines + hardening creases (edge-weight/bevel-weight/mark-sharp) at every sharp edge.** A uniform subdivided box has neither → shrinkwrap just projects noise. Same failure class as voxel-remesh (rounds), polar-loft (blob), auto-QuadriFlow (regresses). No shortcut around building proper creased topology.

**DO (correct method):** Build each part (slide, frame, trigger guard, barrel, controls) as a **clean cage with edge-weight creases at the sharp lines + Subdivision Surface** (smooth body, crisp creased edges), OR clean explicit faceted geometry (v4 multi-part boxes — clean by construction). The scan = measurement + visual reference ONLY, never the surface source. Add CAD-level detail as **properly-creased feature geometry** (crown bevel, frame step crease, serration grooves, control nubs) built deliberately — never via shrinkwrap/displacement.

**DON'T:** shrinkwrap-generated-topology-to-scan, voxel-the-final-surface, polar-loft, auto-retopo a noisy scan expecting crisp edges.

**HOW TO APPLY:** For any hard-surface blocking/retopo: place topology along feature lines first, set creases, THEN smooth/subdivide. Verify crispness on the real viewport (off-screen renders + numeric profile). v4 (clean boxes) is the valid clean baseline; detail is added part-by-part with creases, not projected. SEE [[proj-blender-department-2026-06-23]] [[feedback-green-red-grey-test-layering]].
