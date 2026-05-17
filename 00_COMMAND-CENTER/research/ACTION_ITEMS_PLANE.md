# ACTION ITEMS FOR PLANE.SO

Copy and paste these tasks into your **EXEO Dashboard** project on Plane.

## 🛠️ Phase 1: Structural Alignment
1. **TASK:** Implement Albedo-layer Design Tokens in Frontend.
   - **Description:** Apply the HSL variables from `CSS_THEME_VARIABLES.css` to the root of the project.
2. **TASK:** Hardened Telemetry Core Implementation.
   - **Description:** Refactor `backend/src/services/metrics.ts` to poll OS-level data (CPU, Memory) in addition to token tracking.
3. **TASK:** Physis Vault Navigator Skeleton.
   - **Description:** Create the React container for the Physis Vault explorer with glassmorphic styling.

## 📡 Phase 2: Integration & Enrichment
4. **TASK:** Outlook 365 / Indra's Net Architecture Bridge.
   - **Description:** Implement the agent-routine logic for calendar ingestion as defined in the Technical Architecture artifact.
5. **TASK:** Unified Telemetry Visualization.
   - **Description:** Create the "Right Deck" telemetry feed with animated "breathing" cyan accents.
6. **TASK:** Agent Routine Monitor.
   - **Description:** Build the sidebar module that displays active Nudimmud autonomous routines.

## 🛡️ Phase 3: Security & Performance
7. **TASK:** seL4-inspired Safety Layer Audit.
   - **Description:** Audit backend service executors for potential memory leaks or unhandled exceptions.
8. **TASK:** Geometric Unity Grid Overlay.
   - **Description:** Implement the 8px grid system across all dashboard components.
9. **TASK:** Z-Index Layering Stabilization.
   - **Description:** Ensure all glassmorphic overlays and modals follow the Albedo-layer Z-index hierarchy.

---

# CSS_THEME_VARIABLES.css

```css
:root {
  /* Core Palette */
  --color-void: hsl(240, 15%, 7%);
  --color-surface: hsla(240, 15%, 15%, 0.7);
  --color-neon-cyan: hsl(183, 100%, 50%);
  --color-cyber-pink: hsl(306, 100%, 50%);
  --color-ghost-white: hsl(0, 0%, 95%);
  --color-muted-slate: hsl(240, 10%, 60%);

  /* Accents & Borders */
  --border-glass: 1px solid hsla(0, 0%, 100%, 0.125);
  --shadow-albedo: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  
  /* Layout */
  --grid-unit: 8px;
  --sidebar-width: 250px;
  --deck-width: 320px;

  /* Animation */
  --transition-smooth: 0.4s cubic-bezier(0.23, 1, 0.32, 1);
}

.albedo-glass {
  background: var(--color-surface);
  backdrop-filter: blur(25px) saturate(200%);
  -webkit-backdrop-filter: blur(25px) saturate(200%);
  border: var(--border-glass);
  border-radius: 12px;
  box-shadow: var(--shadow-albedo);
}

.telemetry-pulse {
  animation: pulse 2s infinite ease-in-out;
}

@keyframes pulse {
  0% { opacity: 0.8; filter: drop-shadow(0 0 2px var(--color-neon-cyan)); }
  50% { opacity: 1; filter: drop-shadow(0 0 8px var(--color-neon-cyan)); }
  100% { opacity: 0.8; filter: drop-shadow(0 0 2px var(--color-neon-cyan)); }
}
```
