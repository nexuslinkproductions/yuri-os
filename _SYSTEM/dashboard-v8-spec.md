## CODEX TASK SPEC

Goal: Rebuild /Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html as the definitive Yuri OS process flow instrument.

Design references: Dark operator/HUD aesthetic (NUDIMMUD HUD system). Liquid glass node rendering. Bezier pipeline routing. Fixed symmetrical grid — NO force simulation.

Replace file entirely. Keep inlined d3 script tags (they exist in the file already; don't remove them even if unused).

---

## CORE ARCHITECTURE

### Canvas
- Width: window.innerWidth. Height: 2100 (fixed tall canvas, vertically scrollable).
- Wrapper div: position fixed, inset 0, overflow-y auto.
- Canvas: width 100%, height 2100px.
- Background: #070B18 filled via clearRect on each frame.
- Background ambient: radial gradient at top (rgba(0,212,255,0.06) fading to transparent at 25%) + bottom (rgba(74,158,255,0.04) fading to transparent). Draw once on a background canvas layer, never re-draw.
- Scanline overlay: CSS `repeating-linear-gradient(0deg, rgba(200,216,232,0.018) 0, rgba(200,216,232,0.018) 1px, transparent 1px, transparent 5px)` on body::before.

### Layout Grid
cx = window.innerWidth / 2 (center spine X).
All section nodes centered on cx. Sub-nodes spread symmetrically around cx.

Stage Y positions (pixels from canvas top):
  STAGE 0  Y=90    USER
  STAGE 1  Y=200   USER_INPUT
  STAGE 2  Y=340   ENKI (section)
  STAGE 3  Y=480   SESSION_INIT (section)
  STAGE 4  Y=630   PROMPT_HOOKS (section)
  STAGE 5  Y=780   NEXUSPULSE (section)
  STAGE 6  Y=930   CLASSIFIER (section)
  STAGE 7  Y=1100  ADVISOR_FANOUT (section)
  STAGE 8  Y=1250  PULSE_BUS (section)
  STAGE 9  Y=1380  ENKI_DECIDES (section)
  STAGE 10 Y=1530  ROUTING (section)
  STAGE 11 Y=1670  CODEX_GATE (section)
  STAGE 12 Y=1810  MEMORY (section)
  STAGE 13 Y=1950  SERVICES (section)
  STAGE 14 Y=2060  RESPONSE

Left spine labels: at x=24, vertically centered per stage row, 9px #2A4060 uppercase tracking 0.14em. Text: the stage name.

---

## NODE DEFINITIONS

Three node tiers:
  SECTION: r=52–68, main system orbs. Text: id (bold 13px) + role (10px dim) + detail (9px faint) inside.
  SUB: r=20–26, child nodes branching from section. Text: short label (10px) + type (8px dim) inside.
  MICRO: r=10–13, leaf detail nodes. External label only (8px above node).

### Rendering — LIQUID GLASS ORB (apply to all tiers)

Function drawGlassOrb(ctx, x, y, r, color, label, role, detail):
  1. ctx.save()
  2. Outer glow: ctx.shadowBlur=24, ctx.shadowColor=color (reduce to 10 for sub/micro)
  3. Radial gradient fill (glass body):
     grad = createRadialGradient(x - r*0.32, y - r*0.36, r*0.08, x, y, r)
     stop 0.0: hexToRgba(color, 0.38)   ← highlight top-left
     stop 0.35: hexToRgba(color, 0.10)  ← glass center
     stop 0.80: hexToRgba(color, 0.16)  ← edge fill
     stop 1.00: hexToRgba(color, 0.32)  ← rim
     ctx.fillStyle = grad; arc(x,y,r); ctx.fill()
  4. Rim stroke: ctx.strokeStyle=hexToRgba(color,0.72), lineWidth=1.5; ctx.stroke()
  5. Inner highlight crescent (top-left):
     hl = createRadialGradient(x-r*0.36, y-r*0.38, 0, x-r*0.36, y-r*0.38, r*0.68)
     stop 0: rgba(255,255,255,0.26)
     stop 0.55: rgba(255,255,255,0.05)
     stop 1: rgba(255,255,255,0)
     ctx.fillStyle=hl; arc(x,y,r-1); ctx.fill()
  6. OPENCLAW only: dashed red cage ring at r+10
     ctx.strokeStyle='rgba(255,82,82,0.5)', lineWidth=1, setLineDash([4,4])
     arc(x,y,r+10); stroke(); setLineDash([])
  7. Text inside (SECTION nodes only, r>=40):
     ctx.shadowBlur=0
     line 1 (id): 'bold 13px JetBrains Mono', fillStyle='#C8D8E8', textAlign='center', fillText at y-7
     line 2 (role): '10px JetBrains Mono', fillStyle='#5A7090', fillText at y+7
     line 3 (detail): '8px JetBrains Mono', fillStyle='#2A4060', fillText at y+20
  8. Text inside (SUB nodes, r=20-26):
     line 1 (label): '10px JetBrains Mono', '#C8D8E8', fillText at y-5
     line 2 (type): '8px JetBrains Mono', '#3A5070', fillText at y+7
  9. Text inside (MICRO nodes, r<=13): text above node externally: '8px JetBrains Mono', '#4A6080', fillText at y-(r+10)
  10. ctx.restore()

### Node List

SECTION nodes (stage, x=cx, y=stageY, r, color, id, label, role, detail):

S0  USER         y=90   r=44  #FFFFFF  "USER"          "human operator"        ""
S1  USER_INPUT   y=200  r=38  #00D4FF  "USER INPUT"    "typed prompt"          "→ Claude Code CLI"
S2  ENKI         y=340  r=68  #00D4FF  "ENKI"          "main session"          "Claude Code control plane · final authority"
S3  SESSION_INIT y=480  r=52  #4A9EFF  "SESSION INIT"  "startup hooks"         "boot · seed · context inject"
S4  PROMPT_HOOKS y=630  r=50  #94A3B8  "PROMPT HOOKS"  "submit hooks"          "aeonic · protocol-guard · scout"
S5  NEXUSPULSE   y=780  r=58  #4A9EFF  "NEXUSPULSE"    "pulse-orchestrator"    "detached spawn · parallel advisor fanout"
S6  CLASSIFIER   y=930  r=54  #4A9EFF  "CLASSIFIER"    "offload-contract.mjs"  "tier: TRIVIAL · STD · CPLX · CRIT"
S7  ADVISORS     y=1100 r=52  #9B6EFF  "ADVISOR FANOUT" "parallel ensemble"    "Promise.allSettled · 60–90s timeout"
S8  PULSE_BUS    y=1250 r=50  #4A9EFF  "PULSE BUS"     "ring buffer · 14 slots" "5min TTL · advisor findings"
S9  ENKI_DEC     y=1380 r=60  #00D4FF  "ENKI DECIDES"  "synthesizes findings"  "reads bus → routes → acts · final call"
S10 ROUTING      y=1530 r=52  #00C896  "ROUTING"       "offload lanes"         "12 lanes · priority order"
S11 CODEX_GATE   y=1670 r=50  #FF6835  "CODEX GATE"    "two-phase gate"        "propose → .approved → HEAD SHA → apply"
S12 MEMORY       y=1810 r=52  #4A9EFF  "MEMORY"        "3-tier knowledge"      "HOT · WARM · COLD · kernel · MLM"
S13 SERVICES     y=1950 r=48  #00C896  "SERVICES"      "launchd · 7 managed"   "shellservice · runtime · wiki-rag"
S14 RESPONSE     y=2060 r=44  #00D4FF  "RESPONSE"      "output to user"        "→ USER sees result"

SUB-NODES (id, parentId, x offset from cx, y offset from stage Y, r, color, label, type):

--- SESSION_INIT subs (stageY=480) ---
  SOUL_INJECT     SESSION_INIT  x=cx-200  y=560  r=24  #4A9EFF  "soul-inject"       "SOUL.md"
  PALACE          SESSION_INIT  x=cx-80   y=560  r=24  #4A9EFF  "palace-inject"     "memory palace"
  MNEMOSYNE       SESSION_INIT  x=cx+80   y=560  r=24  #4A9EFF  "mnemosyne-seed"    "global seed"
  TOKEN_INIT      SESSION_INIT  x=cx+200  y=560  r=22  #94A3B8  "token-init"        "session tracking"

--- PROMPT_HOOKS subs (stageY=630) ---
  AEONIC          PROMPT_HOOKS  x=cx-180  y=710  r=22  #94A3B8  "aeonic-enforce"    "protocol"
  PROT_GUARD      PROMPT_HOOKS  x=cx-60   y=710  r=22  #94A3B8  "protocol-guard"    "gate"
  SCOUT_SPAWN     PROMPT_HOOKS  x=cx+60   y=710  r=22  #94A3B8  "scout-spawn"       "HERMES+ARGUS"
  TIRITH          PROMPT_HOOKS  x=cx+180  y=710  r=20  #94A3B8  "tirith-url"        "url guard"

--- NEXUSPULSE subs (stageY=780) ---
  ORCHESTRATOR    NEXUSPULSE    x=cx-160  y=860  r=24  #4A9EFF  "orchestrator.mjs"  "entry point"
  PULSE_PLAN      NEXUSPULSE    x=cx+160  y=860  r=22  #4A9EFF  "pulse-plan.json"   "turn state"

--- CLASSIFIER subs (stageY=930) ---
  TRIVIAL         CLASSIFIER    x=cx-280  y=1010 r=20  #2A4060  "TRIVIAL"           "no advisors"
  STANDARD        CLASSIFIER    x=cx-100  y=1010 r=22  #4A9EFF  "STANDARD"          "[DEEPSEEK]"
  COMPLEX         CLASSIFIER    x=cx+100  y=1010 r=22  #4A9EFF  "COMPLEX"           "+OC+HERMES+CASS"
  CRITICAL        CLASSIFIER    x=cx+280  y=1010 r=24  #FF6835  "CRITICAL"          "+SWARM+OBLIT"

--- ADVISOR FANOUT subs (stageY=1100) ---
  DEEPSEEK_A      ADVISORS      x=cx-320  y=1180 r=26  #9B6EFF  "DEEPSEEK"          "model_advisor"
  OPENCLAW_A      ADVISORS      x=cx-180  y=1180 r=26  #FF5252  "OPENCLAW"          "bridge_advisory"
  HERMES_A        ADVISORS      x=cx-60   y=1180 r=24  #9B6EFF  "HERMES"            "native_fn"
  CASSANDRA_A     ADVISORS      x=cx+60   y=1180 r=24  #9B6EFF  "CASSANDRA"         "foresight"
  SWARM_A         ADVISORS      x=cx+180  y=1180 r=24  #9B6EFF  "SWARM"             "dual fan-out"
  OBLITERATUS_A   ADVISORS      x=cx+320  y=1180 r=24  #FF6835  "OBLITERATUS"       "adv. gate"

--- ROUTING subs (stageY=1530) ---
  LANE_LOCAL      ROUTING       x=cx-320  y=1610 r=20  #00C896  "code-local"        "qwen:7b"
  LANE_DSF        ROUTING       x=cx-200  y=1610 r=20  #00C896  "ds-flash"          "cloud"
  LANE_DSP        ROUTING       x=cx-100  y=1610 r=20  #00C896  "ds-pro"            "cloud"
  LANE_MINI       ROUTING       x=cx+0    y=1610 r=22  #9B6EFF  "codex-mini"        "impl auth"
  LANE_CODEX      ROUTING       x=cx+120  y=1610 r=24  #9B6EFF  "codex"             "full ws"
  LANE_KIMI       ROUTING       x=cx+240  y=1610 r=20  #4A9EFF  "kimi"              "fallback"

--- CODEX_GATE subs (stageY=1670) ---
  PROPOSE         CODEX_GATE    x=cx-180  y=1750 r=22  #FF6835  "propose"           "dry-run diff"
  APPROVED        CODEX_GATE    x=cx-20   y=1750 r=22  #FF6835  ".approved"         "user marker"
  APPLY           CODEX_GATE    x=cx+160  y=1750 r=22  #FF6835  "apply"             "HEAD SHA verify"

--- MEMORY subs (stageY=1810) ---
  MEM_HOT         MEMORY        x=cx-240  y=1890 r=24  #FF6B6B  "MEM HOT"           "in-context"
  MEM_WARM        MEMORY        x=cx-100  y=1890 r=22  #FFB347  "MEM WARM"          "episodic"
  MEM_COLD        MEMORY        x=cx+60   y=1890 r=22  #74B9FF  "MEM COLD"          "semantic"
  MEM_KERNEL      MEMORY        x=cx+200  y=1890 r=20  #94A3B8  "KERNEL DB"         "SQLite"
  MLM_SANDBOX     MEMORY        x=cx+320  y=1860 r=20  #FF5252  "MLM SANDBOX"       "quarantine"

--- SERVICES subs (stageY=1950) ---
  SVC_SHELL       SERVICES      x=cx-240  y=2030 r=20  #00C896  "shellservice"      "PID 816"
  SVC_RUNTIME     SERVICES      x=cx-120  y=2030 r=20  #00C896  "yuri-runtime"      "PID 819"
  SVC_RAG         SERVICES      x=cx+0    y=2030 r=20  #00C896  "wiki-rag"          "PID 821"
  SVC_HEALTH      SERVICES      x=cx+120  y=2030 r=18  #94A3B8  "lane-health"       "scheduled"
  SVC_EOT         SERVICES      x=cx+240  y=2030 r=18  #94A3B8  "eot-refresh"       "scheduled"

---

## EDGE ROUTING

Edges are drawn as smooth bezier curves. For section→section (main spine), use:
  bezierCurveTo(x1, y1 + (y2-y1)*0.45, x2, y2 - (y2-y1)*0.45, x2, y2)

For section→sub-node (branch), use short bezier:
  bezierCurveTo(x1, y1 + (y2-y1)*0.3, x2, y2 - (y2-y1)*0.3, x2, y2)

For sub→sub cross-connections, route via a midpoint waypoint to avoid clutter:
  midY = (y1 + y2) / 2
  bezierCurveTo(x1, midY, x2, midY, x2, y2)

Edge styles by type:
  flow:    stroke=#00D4FF sw=2.5 opacity=0.85 (main spine connections)
  branch:  stroke=#4A9EFF sw=1.2 opacity=0.55 (section to sub-nodes)
  data:    stroke=#4A9EFF sw=1.2 dasharray=[5,4] animated opacity=0.65
  advises: stroke=#9B6EFF sw=1.0 dasharray=[3,4] opacity=0.45
  gates:   stroke=#FF6835 sw=1.5 opacity=0.70
  memory:  stroke=#74B9FF sw=0.8 dasharray=[2,4] opacity=0.40

Edge connections list:
Main spine (flow):
  USER → USER_INPUT
  USER_INPUT → ENKI
  ENKI → SESSION_INIT
  SESSION_INIT → PROMPT_HOOKS
  PROMPT_HOOKS → NEXUSPULSE
  NEXUSPULSE → CLASSIFIER
  CLASSIFIER → ADVISORS
  ADVISORS → PULSE_BUS
  PULSE_BUS → ENKI_DEC
  ENKI_DEC → ROUTING
  ENKI_DEC → CODEX_GATE  (gates type, arc right)
  ROUTING → MEMORY (memory type)
  SERVICES → ENKI  (data type, arc back left)
  RESPONSE ← ROUTING (flow — last lane node to RESPONSE)

Branch edges (branch type) — section to each sub-node:
  SESSION_INIT → SOUL_INJECT, PALACE, MNEMOSYNE, TOKEN_INIT
  PROMPT_HOOKS → AEONIC, PROT_GUARD, SCOUT_SPAWN, TIRITH
  NEXUSPULSE → ORCHESTRATOR, PULSE_PLAN
  CLASSIFIER → TRIVIAL, STANDARD, COMPLEX, CRITICAL
  ADVISORS → DEEPSEEK_A, OPENCLAW_A, HERMES_A, CASSANDRA_A, SWARM_A, OBLITERATUS_A
  ROUTING → LANE_LOCAL, LANE_DSF, LANE_DSP, LANE_MINI, LANE_CODEX, LANE_KIMI
  CODEX_GATE → PROPOSE, APPROVED, APPLY
  MEMORY → MEM_HOT, MEM_WARM, MEM_COLD, MEM_KERNEL, MLM_SANDBOX
  SERVICES → SVC_SHELL, SVC_RUNTIME, SVC_RAG, SVC_HEALTH, SVC_EOT

Data return edges (data type):
  All ADVISOR_A subs → PULSE_BUS (short bezier up)
  PULSE_PLAN → ENKI (short bezier up)
  MEM_HOT → ENKI_DEC (short bezier up)
  PROPOSE → APPROVED → APPLY (gates type, left to right)
  LANE_MINI → CODEX_GATE (gates)
  LANE_CODEX → CODEX_GATE (gates)

Draw all edges BEFORE nodes so nodes sit on top.
Order: memory edges first, then advises, then data, then branch, then gates, then flow.

---

## FLOW PULSE ANIMATION (primary motion system)

A glowing cyan dot travels down the main spine every 5 seconds.
Track a `flowT` variable from 0 to 1 over 5000ms (Date.now() % 5000 / 5000).
Interpolate flowT along the main spine path: USER → USER_INPUT → ENKI → ... → RESPONSE.
At each point, draw: ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI*2); shadowBlur=20 shadowColor='#00D4FF'; fillStyle='#00D4FF'; fill().

---

## FLOATING INFO CARD (replaces side drawer)

When user clicks a node: show a floating card NEAR the node (anchored to it), NOT a full-side drawer.

Card positioning: appears 20px to the right of the node (or left if near right edge). Y: centered on node Y, clamped to [20, canvasHeight-200].

Card DOM structure (position:fixed, z-index:200):
  - Width: 260px max
  - Background: rgba(13,21,38,0.97) backdrop-filter blur(16px)
  - Border: 1px solid rgba(0,212,255,0.25)
  - Border-left: 3px solid <node.color>
  - No border-radius (operator aesthetic, 2px max)
  - Padding: 14px 16px
  - Shadow: 0 8px 32px rgba(0,0,0,0.5)

Card content:
  Line 1: node.id — 14px #C8D8E8 bold
  Line 2: node.role — 11px #5A7090
  Line 3: node.detail — 10px #3A5070 (if exists)
  Separator: 1px rgba(255,255,255,0.06) at margin 8px 0
  "CONNECTIONS" label: 8px #2A4060 uppercase tracking 0.14em
  Edge list: each edge as one line — direction arrow + target id + type badge (10px #4A6080)
    Example: "↓ PULSE_BUS  [DATA]"
  Close: small × at top-right (12px #2A4060, hover #5A7090)

The card has a small triangle "beak" pointing left toward the node:
  CSS: .card::before { content:''; position:absolute; left:-6px; top:50%; transform:translateY(-50%); border:6px solid transparent; border-right-color:rgba(0,212,255,0.25); }

Clicking elsewhere on canvas closes the card.

---

## HUD OVERLAYS (fixed, z-index 100)

Top-left:
  "YURI OS" — 13px #00D4FF bold tracking 0.08em
  "NUDIMMUD · main · ececcf4a" — 10px #2A4060

Top-right:
  Soak ring SVG (r=13, 32% arc fill, #00D4FF), "16/50 SOAK" 10px #3A5070
  "5/5 ●" pulsing #FF5252

Bottom-center:
  "TIER CRITICAL · PROTOCOL-CHANGE · 44 NODES · 52 EDGES" 10px #2A4060

Left edge stage labels (per stage Y):
  At x=16, textAlign='left', 8px #1E3050, uppercase tracking 0.14em: "SESSION INIT", "PROMPT HOOKS", etc.

Legend (bottom-left):
  flow ── #00D4FF
  data ---- #4A9EFF
  advises ··· #9B6EFF
  gates ── #FF6835
  memory ··· #74B9FF

---

## DESIGN RULES

- JetBrains Mono for ALL text (canvas and DOM).
- Background #070B18. No white backgrounds anywhere.
- All node colors from palette: #00D4FF, #4A9EFF, #9B6EFF, #FF5252, #00C896, #FF6835, #74B9FF, #FFB347, #94A3B8, #2A4060.
- No yellow, no gold, no white fills.
- All canvas text: fillStyle from palette, never hardcoded.
- Border-radius max 2px on all DOM elements.
- Hover on nodes: shadowBlur increases by 15, rim stroke brightens to opacity 1.0.
- Animate data edges with global dashOffset (increment 0.4 per frame).
- Flow pulse animation runs continuously.
- prefers-reduced-motion: stop all RAF animations, use single static frame.

## OUTPUT

Replace /Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html entirely.
Keep the four inlined d3 script tags (d3-dispatch, d3-timer, d3-quadtree, d3-force). They may be unused but keep them.
No new CDN links.
Single HTML file.
