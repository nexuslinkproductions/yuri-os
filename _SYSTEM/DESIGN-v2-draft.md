⬡ MANUAL_OVERRIDE :: model=nvidia-nemotron-120b
⬡ ROUTING_TO_NVIDIA_NIM [nvidia/nemotron-3-super-120b-a12b]...
[2m[lane-session] persisted to /Users/marcelspatz/YURI-OS-MUSUBI/.claude/lane-sessions/nvidia-nim__default.jsonl[0m
# YURI Design System v2

## Architecture Decision
Independent token files for HUD and Kagami surfaces. The adversarial audit proves they are fundamentally different design languages (HUD: operator aesthetic with JetBrains Mono, 2-4px radius; Kagami: PS2-era hologram with Inter Variable, 22px radius). Shared base creates false economy — every token requires override, causing maintenance traps and semantic confusion. Independent files with explicit naming conventions (`--yuri-hud-*`, `--yuri-kagami-*`) eliminate intermingling risks while preserving clear surface boundaries.

## surface:hud Token File
```css
:root {
  --yuri-hud-bg-void: hsl(0, 0%, 0%);
  --yuri-hud-bg-surface: hsla(0, 0%, 8%, 0.92);
  --yuri-hud-cyan-glow: hsl(96, 68%, 74%);
  --yuri-hud-gold-solar: hsl(90, 100%, 36%);
  --yuri-hud-red-fusion: hsl(12, 84%, 58%);
  --yuri-hud-font-mono: "JetBrains Mono", monospace;
  --yuri-hud-font-body: "DM Sans", sans-serif;
  --yuri-hud-radius-sm: 2px;
  --yuri-hud-radius-md: 4px;
  --yuri-hud-radius-lg: 6px;
  --yuri-hud-base-unit: 8px;
  --yuri-hud-ease-neural: cubic-bezier(0.4, 0, 0.2, 1);
  --yuri-hud-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

## surface:kagami Token File
```css
:root {
  --yuri-kagami-bg: #0A0A0A;
  --yuri-kagami-accent: #47C01B;
  --yuri-kagami-font-sans: "Inter Variable", system-ui, sans-serif;
  --yuri-kagami-font-mono: "Geist Mono", "IBM Plex Mono", monospace;
  --yuri-kagami-radius-sm: 10px;
  --yuri-kagami-radius-md: 16px;
  --yuri-kagami-radius-lg: 22px;
  --yuri-kagami-ease-snap: cubic-bezier(0.6, 0.05, 0.4, 0.95);
  --yuri-kagami-ease-glide: cubic-bezier(0.34, 1.56, 0.64, 1);
  --yuri-kagami-ease-pop: cubic-bezier(0.36, 0.07, 0.19, 0.97);
  --yuri-kagami-shadow-idle: 0 2px 4px rgba(0,0,0,0.1);
  --yuri-kagami-shadow-lift: 0 8px 16px rgba(0,0,0,0.2);
}
```

## Component Catalog Integration
- HUD surface: DotMatrix (simple keyframe animations, operator aesthetic), Aceternity (dark backgrounds, glow borders matching --yuri-hud-cyan-glow)
- Kagami surface: Cult UI (glass morphism via SVG feTurbulence for hologram effects), Componentry (WebGL/GLSL shaders for cyberpunk atmosphere, framer-motion scroll physics)

## Load Order
1. design-master skill reads design-memory.json surface discriminator
2. Sets `data-surface="hud"` or `data-surface="kagami"` on root element
3. index.css contains both token files scoped by `[data-surface="hud"]` and `[data-surface="kagami"]` to prevent intermingling
4. Components reference tokens via surface-specific variables (e.g., `var(--yuri-hud-bg-void)` for HUD elements)
