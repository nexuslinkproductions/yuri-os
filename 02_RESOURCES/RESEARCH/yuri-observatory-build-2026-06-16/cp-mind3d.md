# CONTROL PACKET — Mind 3D scenes (W3 viz-lab port)

GOAL: Port the viz-lab energy-surface + qsphere demos into two reusable R3F scene components, matching the EXACT import contract the dashboard lane expects. Grounded in REAL data (not synthetic lookalikes).

GROUND FIRST:
1. LOAD .claude/skills/viz-lab/SKILL.md — the standalone-three.js → R3F/Vite port path (generators switch from window-global to module import; renderers → src/scenes/<Name>.tsx with useFrame).
2. Read the source visuals: demos/energy-surface.html (3D ΔU heightfield + bloom), demos/qsphere.html (quantum constellation), demos/build/gen-energy-grid.mjs + demos/data/energy-grid.js (the REAL computeU 64×44 grid).
3. _SYSTEM/src/scenes/HeroScene.tsx — the established R3F pattern in this app.
4. 00-MASTER-BRIEF.md §4 — NO HUD/Kagami tokens. three@0.173 + @react-three/fiber@9 + @react-three/drei@10 are installed.

IMPORT CONTRACT (match EXACTLY — the dashboard MindTab auto-resolves these):
```ts
// _SYSTEM/src/scenes/EnergySurfaceScene.tsx
export default function EnergySurfaceScene(props: { deltaU?: number; animated?: boolean }): JSX.Element
// _SYSTEM/src/scenes/QSphereScene.tsx
export default function QSphereScene(props: { factors?: Array<{ side:'long'|'short'|'neutral'; confidence:number }>; animated?: boolean }): JSX.Element
```
Both: default export, render a SELF-CONTAINED `<Canvas>` (MindTab renders them directly), handle undefined props gracefully, useFrame for animation gated by `animated` (default true), clean up on unmount.

TARGET FILES: _SYSTEM/src/scenes/EnergySurfaceScene.tsx + _SYSTEM/src/scenes/QSphereScene.tsx.

REQUIREMENTS:
- EnergySurfaceScene: render the ΔU heightfield from the REAL computeU grid (import the grid as an ESM module — copy demos/data/energy-grid.js into an ESM-exporting module under src/, OR compute it from the real energy module; do NOT fabricate a fake surface). Highlight/mark the current `deltaU` prop on the surface.
- QSphereScene: the quantum constellation; map `factors` (side+confidence) onto the sphere (e.g. longs/shorts as poles, confidence as radius/intensity).
- TypeScript clean. Self-contained CSS for any overlay (no HUD tokens). No relative fetch (data via import or props).

ACCEPTANCE: `npm run build` (tsc && vite build) GREEN with both scenes present (MindTab will auto-resolve them); both mount in a Canvas without errors; energy surface uses the real grid (state the grid source you used).

AFTER WRITING: run `npm run build`; report PASS/FAIL + the exact result + a ≤6-line summary + which real-data source the energy surface uses. Do NOT git commit.
