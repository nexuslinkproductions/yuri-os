# YURI Design System v2

> Unified source for YURI surface design. HUD and Kagami share the same governance but never the same namespace.

## 1. Architecture Decision

- Two surface namespaces: `--yuri-hud-*` and `--yuri-kagami-*`
- One surface discriminator: `data-surface="hud"` or `data-surface="kagami"`
- One memory contract: every decision write includes `surface`
- One motion doctrine: HUD is mechanical, Kagami is cinematic
- Cross-surface token reuse is a hard error, not an override

## 2. Surface Contract

Render roots must declare the surface before styling:

```html
<html data-surface="hud">
<html data-surface="kagami">
```

Rules:

- HUD stays operator-grade, dense, and precise.
- Kagami stays editorial, atmospheric, and choreographed.
- Shared values can be duplicated across namespaces, but the namespace itself never collapses.
- `design-master` reads `design-memory.json`, resolves the surface, and then loads only the matching token family.

## 2.1 Design Intelligence Loop

YURI design work is not a one-shot style pass. It is an intake, memory, reference, execution, verification, and promotion loop.

### Intake Gate

Before a new design, major visual revision, presentation, HTML artifact, brand surface, motion system, or reusable component is produced, the active design agent must ask at least 10 design questions or explicitly map the user's existing brief to these categories:

| Category | Required Answer |
|---|---|
| Surface | `hud`, `kagami`, hybrid, or new surface |
| Audience | who sees it and what decision it should influence |
| Output shape | app, tool, continuous HTML, deck, report, video, image, component |
| Density | sparse, balanced, dense, maximal |
| Structure | cards/panels, typography, diagram, cinematic, mixed |
| Motion | none, micro, scroll, camera, WebGL/canvas, video-like |
| Emotional temperature | calm, severe, premium, ritual, aggressive, playful, clinical, experimental |
| Reference direction | existing YURI surface or external reference target |
| Dislikes | explicit visual patterns to avoid |
| Success test | what would make the user accept the design |
| Constraints | deadline, device, browser, assets, accessibility, dependency limits |
| Memory policy | reusable system pattern or one-off artifact |

The answers form a `Design Brief`. If the user gives enough direction up front, the agent can present the inferred brief and ask only for missing categories. If the user explicitly says to proceed without questions, the agent must still write the inferred brief into its working notes and list unknowns.

### Skill Selection

Design Master is the orchestration entry point. It selects from the local YURI skill tree:

- `frontend-design` for interaction quality, visual hierarchy, layout, and anti-generic UI decisions.
- `math-curve-loaders` for kinetic motifs, loaders, and motion curves.
- `pattern-mirror-core` and `sharingan` for reverse-engineering screenshots, references, or existing artifacts.
- `design-source-pack` for turning reference language into reusable packs.
- `prompt-engineering` for dispatch contracts to other lanes.
- `parallel-clone-orchestrator` and `swarm-coordination` for multi-agent visual critique or implementation splits.
- `presentations` only when the user wants an actual deck; Kagami continuous HTML must not collapse into slide-deck grammar.

### Memory Promotion

After meaningful visual work, update `_SYSTEM/design-memory.json` with:

- the intake answers that should persist as user preference
- references selected
- tokens used
- patterns promoted or rejected
- exact user correction that caused the learning

Design memory is not a gallery. It is the operating memory that prevents repeating visual mistakes.

## 3. Token Namespaces

### HUD Tokens

```css
[data-surface="hud"] {
  --yuri-hud-bg-void: hsl(0 0% 0%);
  --yuri-hud-bg-surface: hsla(0 0% 8% / 0.92);
  --yuri-hud-bg-glass: hsla(0 0% 8% / 0.72);
  --yuri-hud-cyan-glow: hsl(96 68% 74%);
  --yuri-hud-cyan-dim: hsl(96 42% 24%);
  --yuri-hud-gold-solar: hsl(90 100% 36%);
  --yuri-hud-red-fusion: hsl(12 84% 58%);
  --yuri-hud-silver-albedo: hsl(0 0% 97%);
  --yuri-hud-text-dim: hsl(0 0% 66%);
  --yuri-hud-font-display: "Bricolage Grotesque", "DM Sans", system-ui, sans-serif;
  --yuri-hud-font-body: "DM Sans", system-ui, sans-serif;
  --yuri-hud-font-mono: "JetBrains Mono", monospace;
  --yuri-hud-grid-unit: 8px;
  --yuri-hud-radius-chip: 2px;
  --yuri-hud-radius-button: 3px;
  --yuri-hud-radius-panel: 4px;
  --yuri-hud-ease-snap: cubic-bezier(0.42, 0, 0.58, 1);
  --yuri-hud-ease-out: cubic-bezier(0, 0, 0.2, 1);
  --yuri-hud-ease-neural: cubic-bezier(0.23, 1, 0.32, 1);
  --yuri-hud-dur-micro: 100ms;
  --yuri-hud-dur-ui: 200ms;
  --yuri-hud-dur-panel: 280ms;
  --yuri-hud-dur-meter: 900ms;
}
```

### Kagami Tokens

```css
[data-surface="kagami"] {
  --yuri-kagami-bg-void: #0A0A0A;
  --yuri-kagami-bg-surface: hsla(0 0% 8% / 0.92);
  --yuri-kagami-bg-glass: hsla(0 0% 8% / 0.72);
  --yuri-kagami-accent-hot: #47C01B;
  --yuri-kagami-accent-cold: #00D4FF;
  --yuri-kagami-accent-amber: #FF8800;
  --yuri-kagami-font-sans: "Inter Variable", system-ui, sans-serif;
  --yuri-kagami-font-mono: "Geist Mono", "IBM Plex Mono", monospace;
  --yuri-kagami-grid-unit: 8px;
  --yuri-kagami-radius-sm: 10px;
  --yuri-kagami-radius-md: 16px;
  --yuri-kagami-radius-lg: 22px;
  --yuri-kagami-shadow-idle: 0 2px 4px rgba(0, 0, 0, 0.1);
  --yuri-kagami-shadow-lift: 0 8px 16px rgba(0, 0, 0, 0.2);
  --yuri-kagami-ease-snap: cubic-bezier(0.42, 0, 0.58, 1);
  --yuri-kagami-ease-glide: cubic-bezier(0.25, 0.8, 0.5, 1);
  --yuri-kagami-ease-pop: cubic-bezier(0.68, -0.4, 0.265, 1.4);
  --yuri-kagami-dur-micro: 150ms;
  --yuri-kagami-dur-ui: 300ms;
  --yuri-kagami-dur-scene: 600ms;
  --yuri-kagami-dur-pin: auto; /* scroll-distance driven */
}
```

## 4. Motion Doctrine

### HUD Grammar

- Mechanical, immediate, operator-grade
- No overshoot on controls
- No ambient motion while the user is interacting
- DotMatrix is the loader grammar
- Aceternity handles dark panels, glow borders, and sharp interactive surfaces

Canonical HUD patterns:

| Trigger | Behavior | Easing | Duration |
|---------|----------|--------|----------|
| Screen transition | `AnimatePresence mode="wait"`, `x: +/-24px`, `opacity: 0 -> 1` | `--yuri-hud-ease-out` | 280ms |
| Panel entry | `y: 8 -> 0`, `opacity: 0 -> 1` | `--yuri-hud-ease-neural` | 250-320ms |
| Hover | `scale: 1.02` | `--yuri-hud-ease-neural` | 150-200ms |
| Tap | `scale: 0.97` | `--yuri-hud-ease-snap` | 100ms |
| Score fill | `scaleX: 0 -> target` | `--yuri-hud-ease-neural` | 900ms |

HUD bans:

- Bounce or elastic buttons
- GSAP scroll choreography
- Continuous background animation during focus-heavy tasks
- Unscoped motion that cannot be tied to a state change

### Kagami Grammar

- Cinematic, editorial, choreographed
- Cult UI handles glass, distortion, and hologram depth
- Componentry handles scroll choreography, 3D, and layered motion
- Motion is composition, not feedback

Canonical Kagami patterns:

| Trigger | Behavior | Easing | Duration |
|---------|----------|--------|----------|
| Scroll pin | GSAP ScrollTrigger pin + scrub | scroll-driven | varies |
| Scene entry | `staggerChildren`, layered reveal | `--yuri-kagami-ease-glide` | 300-600ms |
| Button / badge pop | slight overshoot only on accents | `--yuri-kagami-ease-pop` | 150-300ms |
| Card hover | soft lift + glow + depth shift | `--yuri-kagami-ease-glide` | 300ms |
| Text choreography | `useScroll`, `useTransform`, or velocity scroll | `--yuri-kagami-ease-snap` | 300-600ms |

Kagami bans:

- Bloom pass on Three.js
- Uniform pin distances across scenes
- Portal rotation that moves the parent container instead of the portal object
- CSS-only scroll effects where pinned choreography is required

## 5. Component Catalog Integration

The component catalog is the reference index, not a paste bin.

- HUD loaders and status indicators: DotMatrix
- HUD cards, nav, terminal surfaces, and dark operator components: Aceternity UI
- Kagami glass, distortion, and cinematic surface treatments: Cult UI
- Kagami scroll choreography, 3D scenes, and layered motion: Componentry
- Visual direction research only: Refero
- Layout / static template tone only: StyleUI
- JS-rendered sources that need browser extraction: Skiper UI and Ali Imam

Pick 3-7 references before implementing a new surface. If a reference is not pasteable or does not change a decision, it is not a reference.

## 6. Load Order

1. Read `design-memory.json`.
2. Determine `surface`.
3. Read `03_RESOURCES/References/design-packs/component-catalog-2026/00-index.md`.
4. Read `03_RESOURCES/References/design-packs/frontier-design-intelligence/00-start-here.md`.
5. Read `03_RESOURCES/References/design-packs/framer-university-resource-atlas/00-start-here.md` when motion, gallery, cursor, 3D, or experiential work is relevant.
6. Set `data-surface="hud"` or `data-surface="kagami"` on the root element.
7. Scope every token lookup to the selected namespace only.

## 7. Memory Contract

- Every memory entry includes `surface`.
- `hud` memory does not override `kagami` memory.
- `kagami` memory does not override `hud` memory.
- Preserve template entries, but keep them inside their own surface bucket.
- The latest decision wins only within the same surface.

## 8. Verification

- All colors use tokens, not ad hoc literals.
- All interactive elements expose hover and focus states.
- Reduced motion collapses ambient animation first.
- Text remains readable on dark backgrounds.
- Namespace collisions fail the design review.
