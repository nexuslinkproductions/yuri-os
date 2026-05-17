# Claudio NEX Phase Pattern — Design Reference
**Source:** NEX-Phase-Status-June2026.html · **Extracted:** 2026-05-16
**Status:** Internal reference only — not part of primary Yuri OS design system
**Use:** Apply structural DNA to future status pages, project briefs, audit artifacts

---

## What Makes It Excellent

Claudio's design isn't a style guide — it's a discipline. Every element earns its place through function. The craft is in what's NOT there: no decorative flourishes, no padding sections, no placeholder text. Every section has hard data.

---

## Structural DNA (copy this, not the aesthetic)

### 1. Data-First Hero
```
[pulsing indicator dot] · [system identifier] · [date]
[large H1 with gradient text]
[single-sentence sub]
[one key metric widget — countdown OR readiness meter]
```
The hero widget must contain a REAL number that changes. Countdown to date, score out of 100, progress %. Never decorative.

### 2. KPI Strip — 4 cards, scroll-triggered counters
```javascript
// data-count attribute drives GSAP count-up on scroll entry
<div class="stat-num" data-count="6078">6,078</div>
```
Always 4 KPIs. Always the most important system numbers. Always animated count-up via:
```javascript
ScrollTrigger.create({ trigger: el, start: "top 90%", once: true,
  onEnter: () => gsap.to(obj, { v: target, duration: 1.6, ease: "power2.out",
    onUpdate: () => { el.textContent = Math.floor(obj.v).toLocaleString(); }
  })
});
```

### 3. Timeline Track
```
[progress-track bar] ← animates width on scroll
[marker nodes: done / now / future states]
[up/down alternating labels to prevent collision]
[legend at bottom]
```
Progress bar fills with GSAP `width: "X%"` on ScrollTrigger. Current position gets pulse animation. Future markers get a distinct color (purple = not-yet).

### 4. Status Grid — JS-injected cards
Never hardcode status cards in HTML. Always a data array:
```javascript
const workstreams = [
  { tag:"PHASE A", title:"...", desc:"...", progress:100, status:"done", label:"Done" },
];
workstreams.forEach(w => {
  const card = document.createElement("div");
  card.innerHTML = `...template...`;
  grid.appendChild(card);
});
```
This keeps data separated from markup. Adding a new workstream = one array entry.

### 5. Canvas Node Graph — centerpiece visualization
```javascript
// Structure: core node + cluster nodes + satellite nodes
// Cross-cluster animated dashed edges = "learning loops"
// Traveling pulse dot along each loop edge
nodes.push({ x: W/2, y: H/2, r: 18, color: "#fff", isCore: true });
// Each cluster: r = scaled to data count
// Satellites: random position within cluster radius, floating motion
// Loop edges: animated lineDashOffset + sin-wave pulse dot
```
The canvas makes abstract system state feel alive. Without it the page is just a table.

### 6. Checklist — real gate items with checkbox state
```html
<!-- done: filled checkbox with checkmark SVG -->
<div class="check-item done">
  <div class="check-box">
    <svg><!-- checkmark --></svg>
  </div>
```
Critical/blocking items: amber border + glow, empty box. Done items: filled + colored box.

### 7. GSAP Animation System
```javascript
// Everything enters via ScrollTrigger — nothing animates on load except hero
gsap.from(".card", {
  scrollTrigger: { trigger: card, start: "top 88%" },
  y: 36, opacity: 0, duration: 0.65, ease: "power2.out"
});
// Cards stagger by column position (i % 3) * 0.05
// Progress bars fill via ScrollTrigger.batch()
// Reduced-motion fallback: set all values instantly
```

### 8. Reduced-Motion Fallback (non-negotiable)
```javascript
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.querySelectorAll(".progress-fill").forEach(el => {
    el.style.width = el.dataset.target + "%";
  });
  document.querySelector(".timeline-progress").style.width = "78%";
}
```

---

## Typography Stack (Claudio's)
| Role | Font | Weight |
|------|------|--------|
| Display/headings | Space Grotesk | 600–700 |
| Data/tags/mono | JetBrains Mono | 400–500 |
| Body | Inter | 300–500 |

## Color Palette
```css
--a:     #56bcec;  /* primary cyan — data, active, progress */
--a2:    #7c3aed;  /* purple — future, next, advisory */
--amber: #f59e0b;  /* in-flight, warning, critical */
--green: #10b981;  /* done, success */
--red:   #ef4444;  /* blocked, fail */
--bg:    #0a0a1a;  /* near-black navy */
--tx2:   #8b949e;  /* secondary text */
```

## Badge System
```css
.badge.done   { background: rgba(16,185,129,0.12); color: #10b981; }
.badge.live   { background: rgba(86,188,236,0.12); color: #56bcec; }
.badge.wip    { background: rgba(245,158,11,0.12); color: #f59e0b; }
.badge.next   { background: rgba(124,58,237,0.12); color: #7c3aed; }
```

---

## Yuri OS Divergence Points (our intentional differences)

| Element | Claudio | Yuri OS |
|---------|---------|---------|
| Primary accent | Cyan `#56bcec` | Ember `hsl(34,78%,66%)` |
| Background | Navy `#0a0a1a` | Void `hsl(228,30%,4.5%)` |
| Display font | Space Grotesk | Bricolage Grotesque |
| Section ornaments | None | Ghost kanji at 2.6% opacity |
| Hero widget | Countdown to date | Readiness meter (score/100) |
| Canvas content | Brain chunk types | AI routing lane architecture |
| Learning loops | White pulse dots | Ember/amber pulse dots |

---

## Anti-Patterns (what Claudio avoids, so should we)

- No generic placeholder content ("Lorem ipsum", "Coming soon")
- No decorative gradients without semantic purpose
- No section that exists purely for visual balance
- No animation that runs before the user scrolls to it
- No font mixing beyond the 3-role stack
- No more than 4 badge states (done/live/wip/next)
