# Spatial UI — Implementation Plan

> Turning the flat page into a room where content floats at different depths.
> All CSS 3D — no WebGL required. Based on researched techniques.

---

## The Core Shift

Current: `[flat dark background] → [text/cards on top]`

Target: `[receding floor grid] → [midground elements at Z:0] → [floating card layers at Z:50+] → [foreground UI at Z:100+] → [cursor at Z:9999]`

The user perceives **depth** through three mechanisms working together:

```
1. PERSPECTIVE FLOOR     → a grid that recedes toward a vanishing point
2. LAYERED TRANSFORMS    → cards at different translateZ values float forward/back
3. MOUSE-REACTIVE TILT   → everything angles slightly toward the cursor (magnetic field)
```

---

## Technique 1: Perspective Floor Grid

**What it does:** A fixed grid that looks like an architectural blueprint floor extending into the distance. Vanishing point at center-top of viewport.

**How it works (pure CSS):**

```css
.perspective-floor {
  position: fixed; inset: 0;
  perspective: 600px;
  perspective-origin: 50% 30%;  /* vanishing point */
  pointer-events: none; z-index: 0;
}
.perspective-floor-inner {
  width: 200%; height: 200%;
  transform: rotateX(70deg);  /* flattens into floor */
  transform-origin: top center;
  background-image: 
    linear-gradient(rgba(220,38,38,0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(220,38,38,0.08) 1px, transparent 1px);
  background-size: 80px 80px;
}
```

**Result:** A grid that starts small (farther away) and grows larger (closer to viewer). Creates instant spatial depth.

**Reference:** activetheory.net uses this. So does the "Warp Speed Tunnel" CSS example.

---

## Technique 2: Floating Cards with Z-Space

**What it does:** Cards don't sit flat on the page — they hover at different Z-depths with shadow layers that create physical separation.

```css
.floating-card {
  /* Push forward in 3D space */
  transform: perspective(800px) translateZ(40px);
  
  /* Multiple shadows = physical depth illusion */
  box-shadow: 
    0 2px 4px rgba(0,0,0,0.1),      /* contact shadow */
    0 8px 24px rgba(0,0,0,0.15),     /* mid shadow */
    0 24px 60px rgba(0,0,0,0.1);     /* far shadow */
  
  /* Subtle floating hover */
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.floating-card:hover {
  transform: perspective(800px) translateZ(60px) translateY(-8px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.1), 0 16px 48px rgba(0,0,0,0.2), 0 40px 100px rgba(0,0,0,0.15);
}
```

**Layered depth model:**
```
Z: -50    → Background grid (receding)
Z: 0      → Page content baseline (text, normal sections)
Z: 20-40  → Cards, images, UI elements (floating forward)
Z: 60-80  → Navigation, modals, overlays (hovering)
Z: 100+   → Cursor (above everything)
```

---

## Technique 3: Magnetic Tilt Field (Cuberto-style)

**What it does:** Every card and element subtly angles toward the cursor as if pulled by a magnetic field. The page feels alive.

```javascript
// On mousemove:
const rect = card.getBoundingClientRect();
const centerX = rect.left + rect.width / 2;
const centerY = rect.top + rect.height / 2;
const deltaX = (mouseX - centerX) / rect.width * 2;  // -1 to 1
const deltaY = (mouseY - centerY) / rect.height * 2;  // -1 to 1

card.style.transform = `perspective(800px) rotateY(${deltaX * 3}deg) rotateX(${-deltaY * 3}deg) translateZ(20px)`;
```

Applied to ALL interactive elements with a global mousemove listener. Each element gets its own 3D angle based on cursor proximity.

---

## Technique 4: Floating Parallax (Gentle Float)

**What it does:** Elements slowly bob up and down at different speeds and heights, like they're suspended in liquid. Creates a "living room" feel.

```css
@keyframes float1 { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
@keyframes float2 { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
@keyframes float3 { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-4px); } }

.card-layer-1 { animation: float1 6s ease-in-out infinite; }
.card-layer-2 { animation: float2 8s ease-in-out infinite; }
.card-layer-3 { animation: float3 5s ease-in-out infinite; }
```

Each element gets a different speed and amplitude. The eye perceives them as being at different depths.

---

## Technique 5: Diagonal Section Lines

**What it does:** Diagonal lines that cross sections diagonally — like architectural section drawings.

```css
.section-diagonal {
  position: relative;
}
.section-diagonal::before {
  content: '';
  position: absolute;
  inset: 0;
  background: 
    repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 40px,
      rgba(220,38,38,0.03) 40px,
      rgba(220,38,38,0.03) 41px
    );
  pointer-events: none;
}
```

---

## Implementation Order

### Day 1: Foundation (4 hours)

| Step | What | Files |
|------|------|-------|
| 1 | **Perspective floor grid** — replace current ArchitecturalGrid with the 3D receding floor | `ArchitecturalGrid.tsx` |
| 2 | **TranslateZ on all cards** — add to bento cards, process cards, network cards, service stations | `WorkPage.tsx`, `HomePage.tsx`, `AboutPage.tsx`, `ServicesPage.tsx` |
| 3 | **Global magnetic tilt** — single mousemove handler that tilts all `.floating` elements toward cursor | New hook: `useMagneticTilt.ts` |

### Day 2: Polish (4 hours)

| Step | What | Files |
|------|------|-------|
| 4 | **Floating animations** — add slow bob to hero elements, cards, CTAs | All pages |
| 5 | **Diagonal section markers** — add to section boundaries | All pages |
| 6 | **Multi-layer shadows** — upgrade all card shadows to 3-layer system | Global CSS |

### Day 3: Tuning (2 hours)

| Step | What |
|------|------|
| 7 | Tune float speeds, tilt intensities, Z-depths |
| 8 | Test on mobile (disable perspective on small screens) |
| 9 | Performance check (reduce animated elements if needed) |

---

## The Result

After implementation, a user visiting any page would see:

1. A **grid floor** receding from them — vanishing point at top-center
2. **Cards floating at different heights** — some closer, some further
3. **Elements tilting toward the cursor** as they move their mouse
4. **Slow bobbing motion** — the page breathes
5. **Diagonal section lines** cutting across sections
6. **The triquetra** pulsating behind everything at the vanishing point

**Reference: activetheory.net** does exactly this — their spatial UI uses a perspective grid floor with floating interaction zones. No WebGL, pure CSS 3D transforms.

---

## What I Need From You

1. **Priority** — should I start building Day 1 now, or wait for a fresh session?
2. **Depth intensity** — subtle (barely noticeable) or dramatic (obvious 3D space)?
3. **Magnetic strength** — mild tilt (1-2 degrees) or strong (5-8 degrees)?
