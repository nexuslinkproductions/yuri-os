# ALBEDO-LAYER DESIGN SPECIFICATION

## 1. CORE PALETTE (CURATED HSL)
| Layer | HSL | Hex | Use Case |
|---|---|---|---|
| **Deep Void** | `240, 15%, 7%` | `#0f0f14` | Main Background |
| **Glass Surface** | `240, 15%, 15%, 0.7` | `#1e1e26b3` | Card Backgrounds |
| **Neon Cyan** | `183, 100%, 50%` | `#00f3ff` | Primary Accent / Telemetry |
| **Cyber Pink** | `306, 100%, 50%` | `#ff00e5` | Critical Alerts / Action |
| **Ghost White** | `0, 0%, 95%` | `#f2f2f2` | Primary Text |
| **Muted Slate** | `240, 10%, 60%` | `#8c8c99` | Secondary Text / Metadata |

---

## 2. GLASSMORPHISM IMPLEMENTATION (VANILLA CSS)
Apply this class to any container to achieve the "Albedo-layer" depth.

```css
.albedo-glass {
  background: rgba(30, 30, 38, 0.7);
  backdrop-filter: blur(25px) saturate(200%);
  -webkit-backdrop-filter: blur(25px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.125);
  border-radius: 12px;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
}
```

---

## 3. LAYOUT GRID (GEOMETRIC UNITY)
The Hub follows an **8-column fluid grid** with a fixed sidebar.

### A. Spatial Map
*   **Sidebar (250px):** Navigation, System Status, Agent Routine Monitor.
*   **Main Stage (Flex 1):** Physis Vault Navigator / Indra's Net Visualization.
*   **Right Deck (320px):** Real-time Telemetry, Alert Feed, Metadata Inspector.

---

## 4. MICRO-INTERACTION LOGIC
1.  **Panel Entry:** `opacity: 0; transform: translateY(10px);` transitioning to `opacity: 1; transform: translateY(0);` over `0.4s` with `cubic-bezier(0.23, 1, 0.32, 1)`.
2.  **Telemetry Pulse:** Primary accents should have a subtle "breathing" animation (opacity `0.8` to `1.0`) every `2s` to indicate live data flow.
3.  **Active State:** Glass panels increase `border-color` opacity to `0.4` when focused or hovered.

---

## 5. TYPOGRAPHY HIERARCHY
*   **Heading (H1-H3):** `Inter`, Semi-bold, Letter-spacing `-0.02em`.
*   **Data Labels:** `JetBrains Mono`, All-caps, font-size `0.75rem`.
*   **Body:** `Inter`, Regular, font-size `0.95rem`, Line-height `1.5`.

---

## 6. ASSET GENERATION PROMPT (AI-INTEGRATION)
When generating background textures or icons, use this prompt signature:
> *"High-fidelity technological blueprint, minimalist cyberpunk aesthetic, glassmorphism layers, neon cyan accents on deep void background, 8k resolution, ultra-thin line work, geometric patterns."*

---
*End of Specification*
