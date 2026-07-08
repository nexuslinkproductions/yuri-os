---
name: remotion-motion-design
description: Build AE-grade 3D motion-design videos with Remotion (three.js + 2D overlays, frame-driven camera rigs, real scene transitions, cinematic motion blur, kinetic typography). Use when creating, extending, or rendering motion-graphics / presentation / explainer / promo / investor videos, or when adding 3D, transitions, motion blur, or kinetic type to a Remotion project.
triggers: [motion design, remotion, video, 3d video, motion graphics, mograph, kinetic typography, after effects, AE-grade, scene transition, motion blur, investor video, explainer video, render video]
scope: harness
invocation: ability
---

# Remotion Motion Design — AE-Grade 3D Engine

The operating manual for producing studio-grade motion videos. It compounds: every new
video reuses the engine libs and the technique below, and any new mechanism gets added back here.

Reference implementation (the canonical project): `02_RESOURCES/INVESTOR-DECK/motion/`.

## The bar
Apple-keynote / studio motion design: a **3D realm** (three.js) with **2D overlays** composited on top,
**frame-driven camera choreography** (bezier/physics), **real visual transitions** (never fade-to-black),
**cinematic motion blur** on fast motion, **kinetic typography** with detail (highlighted words, clip
reveals, underline wipes), and **compositional diversity** (no two scenes framed the same).

## Stack (Remotion v4.0.476)
- `@remotion/three` + `@react-three/fiber@9` + `three@0.184` + `@react-three/drei` — the 3D realm.
- `@remotion/transitions` — real scene transitions (TransitionSeries + presentations).
- `@remotion/motion-blur` — `<CameraMotionBlur>` (true shutter) + `<Trail>` (cheap ghost smear).
- **Render 3D with `--gl=angle`** (macOS → Metal, fast). Without it, ThreeCanvas renders black.

## Engine libraries (reuse, don't reinvent)
- `src/lib/system.ts` — palette `C`, type scale `T`, tracking `LS`, weights `W`, **`BEZ` curve table**,
  `BLUR` defaults, `hash`/`smooth`/`fmt`. Single source of truth. Never hardcode color/font/curve.
- `src/lib/three-env.tsx` — `Stage` (ThreeCanvas + fog + lights), `CameraRig` (keyframed camera:
  `{f,pos,look,fov}[]` interpolated with a BEZ ease — **the camera move**), `DepthField` (deterministic
  particle volume), `TechLights`, `Overlay` (2D-over-3D compositor).
- `src/lib/kinetic.tsx` — `ClipReveal`, `WordStagger`, `HighlightWord`, `UnderlineWipe`, `BoxDraw`,
  `ColorPop`, `CountUp`. AE type mechanics, all frame-driven.
- `src/lib/transitions.tsx` — `depthPush` / `glideUp` custom presentations, `T_smooth/T_snap/T_reveal/
  T_spring` timing kit, `Cinematic` (CameraMotionBlur) + `Smear` (Trail) wrappers.

## Hard rules (non-negotiable — these are what make it render correctly)
1. **Deterministic only.** Every animation is a pure function of `useCurrentFrame()`. NEVER `useFrame`
   (R3F's loop does NOT fire in headless render — animation will freeze). NEVER `Math.random`/`Date.now`
   (motion blur + transitions re-render children N times → non-determinism = visible noise). Use `hash(i)`.
2. **Camera + 3D objects animate via `useCurrentFrame()`** → props/`useLayoutEffect`, inside `<ThreeCanvas>`.
   `CameraRig` already does this; give it keyframes.
3. **2D over 3D:** put DOM/SVG in `<Overlay>` AFTER `<Stage>`. Pointer-events none.
4. **Transitions:** use `<TransitionSeries>` (NOT `<Series>`) with `TransitionSeries.Sequence` +
   `TransitionSeries.Transition`. Transition `durationInFrames` MUST be `<` both adjacent sequences.
   **Total frames = Σ sequences − Σ transitions** (transitions overlap). Compute the composition duration from this.
5. **Motion blur:** the moving element must call `useCurrentFrame()` *inside* the wrapper's children, not the
   parent. `CameraMotionBlur samples={N}` multiplies render cost ×N — wrap ONLY fast subtrees; use `samples:5`
   for 3D, `8` for 2D. Prefer `Smear`/`Trail` for cheap stylised streaks. Slow cinematic camera moves need no blur.
6. **3D text:** drei `<Text>` (troika) needs a local `.woff`/`.ttf` (NOT woff2) in `public/` + `preloadFont`.
   When in doubt, render the wordmark as a 2D `<Overlay>` title over the 3D world (AE-standard, zero font risk).

## AE technique cheat-sheet (from research — bake into scenes)
- **Bezier curves** (`BEZ` in system.ts): `entrance` decisive arrival · `settle` polished · `snap` pop (accents
  only) · `editorial` symmetric camera move · `overshoot` spring-settle · `reveal` clip-reveal standard.
- **Timing grid:** everything on multiples of ~4f @30fps. Stagger siblings 4–6f. Secondary follow-through 2–3f
  AFTER primary (e.g. underline wipes 4–6f after text lands — never simultaneous).
- **Camera:** push-in on emphasis = scale 1.0→1.04–1.06 over 18–24f (never >8% unless hero). Dolly = move z
  AND parallax BG at 0.3× FG. Add 0.5–1px blur at peak velocity, sharp at ends. Pull-back to 0.94 for context.
- **Kinetic type:** highlight swipe (scaleX 0→1 from left, text bleeds through at 60%), underline wipe (width
  0→100%, reveal curve), box draw (stroke-dashoffset), word stagger (translateY+rotateX fold, 4f apart),
  clip reveal (translateY 112%→0 in overflow:hidden), color pop (color shift 3f + 1.06 micro-pulse).
- **Composition diversity:** cycle 6 archetypes across the film — full-bleed center · rule-of-thirds anchor ·
  cornered asymmetry · scale contrast · horizontal band · fragmented grid. Alternate dense ↔ sparse. Use real
  scale contrast (120px hero next to 14px body, not 48 vs 24).
- **Polish:** film grain (feTurbulence, 4–5% opacity, overlay blend — biggest "looks cheap" fix), vignette,
  glow on key type/stats, depth-of-field blur (0.8–1.5px) on background layers only.

## Workflow for a new video (compounding loop)
1. Content + brief → a `SCENE-SPEC.md` (the build contract; facts authoritative, no invention).
2. Lay foundation yourself (system tokens, reference scene) → render a still → lock the look.
3. Fan scene construction to parallel agents against the spec + 2 reference scenes (distinct files, no conflict).
4. **Verify every scene by rendered still** (`remotion still ... --gl=angle`) — catch layout collisions before full render.
5. Assemble with `<TransitionSeries>` (durations via the Σ rule). Render with `--gl=angle --crf=18`.
6. Sample frames from the encoded mp4 to confirm quality. Add any new mechanism back into the engine libs + this skill.

## Render commands
```bash
remotion studio src/index.ts                                              # live scrub
remotion still  src/index.ts <SceneId> out/s.png --frame=N --gl=angle     # verify a scene
remotion render src/index.ts <CompId> out/film.mp4 --codec=h264 --crf=18 --gl=angle
```

## Corrected direction (2026-06-13, after feedback) — READ THIS
Full research synthesis: `02_RESOURCES/research/ae-grade-motion-design-remotion-2026-06-13.md`
(searchable via `ai search "ae-grade motion design"`). Also mirror the OFFICIAL skill
`github.com/remotion-dev/skills` for Remotion conventions.

The "3D realm" is **not a visible 3D environment** (no grid floors, wireframe cores, Tron/neon —
that reads as a 2003 video-game loading screen). It means **operate motion across all 3 spatial +
rotational axes** using **CSS `perspective` + `transform-style: preserve-3d`** on flat text/vector
layers (crisper than three.js for type; reserve three.js for particles/meshes only). Build a CSS
"camera rig" parent (perspective 800–1400 + preserve-3d, animate rotateX/rotateY = camera move);
place layers at depth via `translateZ`; parallax falls out for free.

Non-negotiables for premium (the things we got wrong):
- **Text TRAVELS, never pops.** translateY/translateZ/path motion + mask reveals; tracking-in
  (letterSpacing −0.06→0). No opacity-only fades. Use `@remotion/animation-utils` makeTransform.
- **Elements move each other to form the scene** — lines draw into dividers, blocks slide & lock,
  shapes travel and grow into text containers, one element pushes another out. (8 moves in research §8.)
- **Continuous flow + speed.** Next move starts at 50–70% of the previous (overlap). An anchor element
  is always moving. Exits ~60% of entry length. No dead frame >10f. Faster pacing, less settling.
- **Mask/clip reveals** (`clipPath inset/polygon`, overflow:hidden + translateY) over opacity fades.
- **Kill default eases** — BEZ table / spring configs (snappy `{damping:20,stiffness:200,mass:0.5}`,
  hero `{damping:15,stiffness:50,mass:2}`). Apple land = `cubic-bezier(0,0,0.2,1)`, no overshoot.
- **Grain 2–4%**, optical alignment, one accent color, massive negative space, restraint.
- Render 2× (`--scale 2`) for crisp type; never `filter:` on a preserve-3d ancestor.
- Toolkit: `@remotion/animation-utils` (makeTransform/interpolateStyles), `@remotion/paths`
  (evolvePath/getPointAtLength/interpolatePath), spring+measureSpring for stagger math.

## VFX pipeline (GPU — the "not-flat / not-PS2" lever)
Flat CSS/DOM cannot do VFX. For spectacle (intros, hero moments, energy/data viz) use three.js +
**`@react-three/postprocessing`** inside `<ThreeCanvas>` (render `--gl=angle`):
- **Bloom** is the single biggest cinematic lever — `<Bloom intensity={...} luminanceThreshold={0.18} mipmapBlur radius={0.8}/>`; drive intensity by frame (ambient ~0.7 → spike ~5 at the drop → settle ~1.2). Emissive materials need `toneMapped={false}` to bloom hard.
- **GPU particles**: `<points>` + bufferGeometry positions rebuilt per frame in `useMemo([frame])` (deterministic, no useFrame/random); `AdditiveBlending`, `depthWrite={false}`. **Soft round dots, NOT squares**: build a radial-gradient `CanvasTexture` and set it as `map`+`alphaMap` on `pointsMaterial` (default point sprites are hard squares — always replace them).
- Also: `ChromaticAberration` (subtle, spike on the drop), `Vignette`, `Noise` (overlay ~0.16). Shockwave = expanding `ringGeometry` additive. DepthOfField for focal racks.
- Reference scene: `src/scenes/SceneIgniteVFX.tsx` (particle convergence → bloom charge → shockwave drop → wordmark resolve).

## Music-theory timing (momentum + pacing)
Score motion to an implied track. `system.ts`: `BPM`, `BEAT` (15f@120BPM/30fps), `beat(n)`, `bar(n)`,
`accel(count,startBeat,endBeat)` (accelerando spawn frames). Hits land on beats; build-ups **accelerate
into a downbeat "drop"** (the flash); resolutions land on the next downbeat. Crescendo = ramp bloom +
particle convergence over a bar; the drop is the loudest frame; then resolve + sustain.

## Morphing (controlled transformation)
`kinetic.tsx`: `MorphText` (variable-font wght/wdth morph — needs a variable font; weight snaps on static
fonts but tracking/color still morph), `ColorMorph` (`interpolateColors` across keyframes), `ShapeMorph`
(`@remotion/paths` `interpolatePath` A→B; keep command structure compatible). Use for stat numbers,
thesis words igniting, controlled color/weight shifts on key words, icon/shape transformations.

## Session Notes

### 2026-06-16
- session: 8m | peak ctx: 0% | compacts: 0
- tools: Bash×48, Read×19, Edit×6, Write×3, Agent×3, Skill×1
- corrections: Base directory for this skill: /Users/marcelspatz/.claude/skills/cross-reference-navigation

# Cross-Reference Navigation (XREF)

The GROUND step of the work loop, made reflexive. One question asked a | Base directory for this skill: /Users/marcelspatz/.claude/skills/quantum-hypothesis-simulation

# Quantum Hypothesis Simulation

The quantum-probability layer for YURI's claim/pulse machinery. It mode | Base directory for this skill: /Users/marcelspatz/.claude/skills/cross-reference-navigation

# Cross-Reference Navigation (XREF)

The GROUND step of the work loop, made reflexive. One question asked a
- errors: none
