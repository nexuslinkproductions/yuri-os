---
name: feedback-motion-camera-per-scene-and-tighten-loop
description: Motion video camera must be designed per-scene (not a uniform rig); lock motion language via live video iteration before propagating
metadata: 
  node_type: memory
  tier: standard
  scope: motion-design
  trig: 
    - remotion
    - camera
    - motion design
    - video
    - choreography
    - flightcam
  refs: 
    - feedback-motion-no-slide-template-continuous-space
    - feedback-deliver-dont-defer-and-checkpoint
    - proj-nexus-motion-video-parked-2026-06-13
  type: feedback
  originSessionId: babb5258-5ca9-4d80-a4f2-7ac2d6efb965
---

RULE: (1) Camera motion in a film must be designed PER-SCENE, motivated by that scene's specific graphics — a single reusable camera rig applied to every scene is templating at the motion layer and reads as "wrongly timed / badly placed," the same error class as a slide-template at the layout layer. (2) You cannot verify motion or timing from stills — lock the MOTION language (camera + entrances) on ONE reference scene through live VIDEO iteration with Marcel BEFORE propagating to many scenes.

WHEN: building any Remotion / motion-graphics film, especially camera work.

DO: hand-author each scene's camera to follow/reveal/punctuate the actual elements in THAT composition (a move should be caused by what the graphics are doing); render short VIDEO clips (not stills) and get Marcel's eye on the motion early; build 1 reference scene's full motion → confirm → only then scale to the rest; keep the static design system reusable (palette/type/Ma layout DID land) but treat camera as bespoke per scene.

DONT: build a generic enter/settle/accent/exit "flightCam" rig and stamp it on 15 scenes; keyframe camera poses to beat-numbers blind and assume they read well; verify camera/timing from stills; build the whole deck before the motion language is confirmed on video.

WHY: NEXUS LINK investor video (2026-06-13) — after fixing the slide-template miss, I applied a UNIFORM choreographed-camera rig across all scenes. Marcel: "the camera movements are wrongly timed and placed bad… park this." Two full build passes (12 scenes built, rejected, rebuilt, camera still wrong) = high token/time cost on a taste-driven, hard-to-self-verify medium. The static comp + design system were fine; the motion was the unverified, templated part. Tighter loop on ONE scene's motion would have caught it before 15× the work.

SEE: [[feedback-motion-no-slide-template-continuous-space]] (layout-layer version of the same anti-template rule), [[proj-nexus-motion-video-parked-2026-06-13]] (where to resume), [[feedback-deliver-dont-defer-and-checkpoint]] (tight increments).
