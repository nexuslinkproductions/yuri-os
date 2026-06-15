---
name: feedback-motion-no-slide-template-continuous-space
description: Motion-design video — no slide-template chrome; one continuous 3D space the camera develops through on ALL axes
metadata: 
  node_type: memory
  tier: standard
  scope: motion-design
  trig: 
    - remotion
    - video
    - motion design
    - investor deck
    - scene
    - camera
  refs: 
    - feedback-layout-ma-not-slidedeck
    - feedback-design-iteration-marcel
  type: feedback
  originSessionId: babb5258-5ca9-4d80-a4f2-7ac2d6efb965
---

RULE: A motion-designed video must NOT look like a fancy PowerPoint — no shared per-scene chrome template (fixed header chip + index + eyebrow→title→row-of-cards repeated every section), and the scene must DEVELOP in all axes/directions continuously throughout the whole video.

WHEN: building any Remotion / motion-graphics film for Marcel (e.g. the NEXUS LINK investor deck).

DO: give each section its OWN asymmetric composition (Ma — charged negative space, varied rhythm, elements at different depths/scales/positions); drive a distinct bold multi-axis camera per scene (pan X · boom Y · dolly Z · tilt · arc · roll — engine: `Cam2D` in src/lib/space3d.tsx now supports all six + `Travel` for direction-varied entrances); make content fly in from varied directions (left/right/top/bottom/back/front), not always rise-up; chain camera momentum scene→scene so the film reads as flying through ONE space.

DONT: reuse one VoxScene-style chrome wrapper on every section; centered-title + uniform card-row layout repeated; tiny canned identical dollies per slide; persistent DECK·NN/NAME header band.

WHY: born from a direct correction (2026-06-13) after I built 12 content scenes on a shared `VoxScene` template — Marcel: "looks like a fancy powerpoint presentation using the same layouts for each slide… I want the scene to develop in all axis and directions throughout the video." The approved opener (SceneOpenVox) is fine; the templated content slides were the miss.

SEE: [[feedback-layout-ma-not-slidedeck]] (same taste, layout axis), [[proj-nexus-link-investor-deck]]. Engine fix shipped: Cam2D pan/boom/roll + Travel in 02_RESOURCES/INVESTOR-DECK/motion/src/lib/space3d.tsx; free wrapper `Space` + `Marker` in src/lib/vox.tsx.
