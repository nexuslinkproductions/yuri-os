## CODEX TASK SPEC

Goal: Premium aesthetic upgrade of /Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html.
Do NOT change any content, text, structure, or section order.
Only upgrade visual treatment: depth, motion, glow, hierarchy.

---

CHANGE 1 — BODY + SECTION BACKGROUNDS

Add subtle directional gradient to each section (depth, not flat):
  section { background: linear-gradient(180deg, rgba(212,175,55,0.035) 0%, transparent 60%); }

Add very subtle scanline texture overlay to body::before:
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background: repeating-linear-gradient(
      0deg,
      rgba(255,255,255,0.012) 0px,
      rgba(255,255,255,0.012) 1px,
      transparent 1px,
      transparent 3px
    );
  }
  (All content must be position:relative z-index:1 or higher to sit above the scanline)

---

CHANGE 2 — FLOW BOXES (Section 2 pipeline)

Add glow on hover:
  .flow-box:hover {
    border-color: rgba(212,175,55,0.5);
    box-shadow: 0 0 20px rgba(212,175,55,0.08), inset 0 0 40px rgba(212,175,55,0.04);
  }

Add entry animation — boxes fade-slide in on load:
  @keyframes boxIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  .flow-box { animation: boxIn 400ms cubic-bezier(0.25, 1, 0.5, 1) both; }
  Stagger: flow-box:nth-child(1){animation-delay:100ms} through nth-child(7){animation-delay:700ms}

---

CHANGE 3 — RUNNING STATUS DOTS

Add pulsing glow animation to live/running indicators:
  @keyframes dotPulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(0,229,191,0.6); }
    50%      { box-shadow: 0 0 0 5px rgba(0,229,191,0); }
  }
  .dot.running { animation: dotPulse 2s ease-in-out infinite; }

THROTTLED/BLOCKED dots get a static glow (not animated):
  .dot.throttled, .dot.blocked { box-shadow: 0 0 6px rgba(201,90,59,0.6); }

---

CHANGE 4 — AGENT IDs AND SECTION LABELS

Agent IDs: add subtle gold text glow:
  .agent-id { text-shadow: 0 0 24px rgba(212,175,55,0.35); }

Section labels: add a 1px bottom line under each label using ::after:
  .section-label { position: relative; padding-bottom: 10px; margin-bottom: 24px; }
  .section-label::after {
    content: "";
    position: absolute;
    bottom: 0; left: 0;
    width: 40px; height: 1px;
    background: linear-gradient(90deg, #D4AF37, transparent);
  }

---

CHANGE 5 — HEADER REFINEMENT

The header brand text "YURI OS" gets a very subtle gold glow:
  .brand { text-shadow: 0 0 30px rgba(212,175,55,0.5); }

Add a subtle bottom gradient on the header border:
  .topbar::after {
    content: "";
    position: absolute;
    bottom: -1px; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, #D4AF37 30%, #D4AF37 70%, transparent 100%);
    opacity: 0.3;
  }
  .topbar { position: relative; }

TIER CRITICAL text: add text-shadow:
  .header-critical { text-shadow: 0 0 20px rgba(201,90,59,0.6); }

---

CHANGE 6 — BADGE REFINEMENT

Add subtle inner highlight to badges:
  .badge { box-shadow: inset 0 1px 0 rgba(255,255,255,0.25); }

LOCAL badge: add subtle glow
  .badge-local { box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), 0 0 10px rgba(118,185,0,0.3); }
CODEX badge:
  .badge-codex { box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 0 10px rgba(155,89,255,0.3); }
BRIDGE badge:
  .badge-bridge { box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 0 10px rgba(201,90,59,0.3); }

---

CHANGE 7 — TABLE ROWS

Add hover highlight to routing lanes table rows:
  tr:hover td { background: rgba(212,175,55,0.04); }
  tr { transition: background 120ms linear; }

Add fade-in animation to table rows on page load:
  @keyframes rowIn { from { opacity:0; } to { opacity:1; } }
  tbody tr { animation: rowIn 300ms ease both; }
  Stagger each tr: nth-child(n) { animation-delay: calc(n * 40ms) }
  (Use CSS custom property or JS to set delay per row index)

---

CHANGE 8 — SOAK RING LOAD ANIMATION

The soak ring should animate from 0 to 32% fill on page load (already has JS for this — ensure the transition is on the element):
  #soak-ring-circle, .soak-ring circle:last-child {
    transition: stroke-dasharray 1.2s cubic-bezier(0.25, 1, 0.5, 1) 800ms;
  }
  Start value: stroke-dasharray: 0 75.4 (full circumference for r=12: 2*pi*12=75.4)
  Animated to: stroke-dasharray: 24.1 51.3 (32% of 75.4)
  Trigger via JS setTimeout or requestAnimationFrame after DOM load.

---

CHANGE 9 — PANEL + TIER BORDERS

Panels, tiers, flow boxes, gate cards, phase columns:
  Add top highlight line (premium depth cue):
  .panel, .flow-box, .tier, .gate-card, .phase {
    border: 1px solid rgba(212,175,55,0.16);
    border-top: 1px solid rgba(212,175,55,0.3);
    background: linear-gradient(180deg, rgba(212,175,55,0.04) 0%, #0a0a0a 24px);
  }

---

CHANGE 10 — SECTION ENTRY ANIMATIONS

Each section fades in as it enters the viewport using IntersectionObserver:
  @keyframes sectionIn { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  Sections start opacity:0. IntersectionObserver adds class "visible" when section enters viewport.
  section.visible { animation: sectionIn 500ms cubic-bezier(0.25, 1, 0.5, 1) both; }

JS:
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if(e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
  }, { threshold: 0.05 });
  document.querySelectorAll('section').forEach(s => io.observe(s));

---

CHANGE 11 — PANEL HOVER STATES

All panels, tiers, flow boxes, gate cards, agent rows:
  transition: border-color 180ms, box-shadow 180ms;
  On hover: box-shadow: 0 0 0 1px rgba(212,175,55,0.18), 0 4px 24px rgba(0,0,0,0.4);

Agent rows specifically:
  .agent-row:hover { background: rgba(212,175,55,0.03); border-color: rgba(212,175,55,0.35); }
  .service-row:hover { background: rgba(0,229,191,0.02); border-color: rgba(0,229,191,0.2); }

---

STRICTLY DO NOT CHANGE:
- Any text content
- Any section order or structure
- Any data values (soak 16/50, beacon 5/5, commit ca0df14c, PIDs 816/819/821)
- The font (JetBrains Mono)
- The color palette variables
- The scrollable layout
- External font link (Google Fonts JetBrains Mono only)
