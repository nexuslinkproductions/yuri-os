---
name: proj-nexus-motion-video-parked-2026-06-13
description: "NEXUS LINK / YURI investor-deck motion video — PARKED 2026-06-13; camera timing/placement wrong, retry later"
metadata: 
  node_type: memory
  tier: standard
  scope: motion-design
  trig: 
    - remotion
    - motion video
    - investor deck
    - nexus link video
    - yuri film
    - resume video
  refs: 
    - feedback-motion-camera-per-scene-and-tighten-loop
    - feedback-motion-no-slide-template-continuous-space
    - proj-nexus-link-investor-deck
  type: project
  originSessionId: babb5258-5ca9-4d80-a4f2-7ac2d6efb965
---

GOAL: ~3-min motion-designed video presenting YURI/NEXUS LINK, all 15 deck sections, Remotion, Apple/AE-grade.
WHO: Marcel (taste owner), Claude (build).
WHEN: PARKED 2026-06-13 — Marcel context-switched to other priorities; explicit "park here, retry another time."
WHERE: 02_RESOURCES/INVESTOR-DECK/motion/. Engine: src/lib/{system.ts, space3d.tsx (Cam2D 6-axis + CamPose keyframes + Travel), vox.tsx (Space/Marker/flightCam + content prims), vfx.tsx (shared particle/bloom field), kinetic.tsx, transitions.tsx, primitives.tsx}. Scenes: src/scenes/Scene*V.tsx (15: OpenVox + 12 content + SolutionV/VisionV VFX heroes). Assembly: src/Film.tsx (YuriFilm, TransitionSeries fade x-dissolves). Last full render: out/yuri-deck-film.mp4 (73MB, ~2:05, renders clean w/ --gl=angle).

STATE: Compiles + renders end-to-end. STATIC composition + design system (palette/type/asymmetric-Ma layout) + VFX heroes LAND. What's WRONG (Marcel verdict): camera movements wrongly TIMED and badly PLACED — the flightCam choreography (uniform enter-right/settle/accent/exit-left rig applied to every scene) does not work. Pacing also runs ~2:05 vs ~3-min target. Some scenes open ~0.3s sparse before content enters.

NEXT (on resume): (1) DO NOT reuse the uniform flightCam rig — design each scene's camera per-scene, motivated by that scene's specific graphics (follow/reveal a specific element), see [[feedback-motion-camera-per-scene-and-tighten-loop]]. (2) Lock the MOTION language (camera + entrances) on ONE reference scene via live VIDEO iteration with Marcel BEFORE propagating to 15 — stills cannot verify motion/timing. (3) Then stretch holds to ~3 min. (4) Prune stale iteration files (old flat v1 scenes, SceneColdOpen3D/V3/V4, SceneIgniteVFX, SceneScale3D — superseded, already out of Root/Film). Skill: .claude/skills/remotion-motion-design/SKILL.md (update with per-scene-camera lesson on resume). Research: 02_RESOURCES/research/ae-grade-motion-design-remotion-2026-06-13.md.

SEE: [[proj-nexus-link-investor-deck]] (deck content source), [[feedback-motion-no-slide-template-continuous-space]], [[feedback-motion-camera-per-scene-and-tighten-loop]].
