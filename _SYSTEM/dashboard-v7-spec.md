## CODEX TASK SPEC

Goal: Full rebuild of /Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html.

Replace the yellow/gold explosion graph with a top-down canonical process flow graph — a directed visualization of exactly what happens when a USER sends a single prompt through Yuri OS. The graph flows TOP → BOTTOM like a circuit diagram. All nodes are large orbs with text rendered INSIDE them.

Output: /Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html — replace entirely.

---

COLOR THEME: ABYSSAL CIRCUIT (no yellow, no gold)

--bg: #070B18
--surface: #0D1526
--cyan: #00D4FF        (USER, ENKI nucleus, primary flow)
--blue: #4A9EFF        (cortex, pipeline nodes)
--violet: #9B6EFF      (advisors, model lanes)
--red-hot: #FF5252     (OPENCLAW quarantine, gates)
--emerald: #00C896     (services, running status, routing)
--amber: #FFB347       (warm memory, advisory)
--ice: #74B9FF         (cold memory)
--flame: #FF6835       (CI/CD gates, blockers)
--slate: #94A3B8       (hooks, lifecycle phases)
--text: #C8D8E8        (all labels)
--text-dim: #5A7090    (secondary labels inside nodes)
--edge-flow: #00D4FF   (primary flow edges)
--edge-data: #4A9EFF   (data/findings edges)
--edge-gate: #FF6835   (gate edges)
--edge-mem: #74B9FF    (memory edges)

Background: #070B18. Canvas fills full viewport. No scrolling.

---

LAYOUT: TOP-DOWN CANONICAL (not radial)

Use D3-force with forceY() to anchor nodes to vertical layers (Y positions).
Use forceX() to spread nodes horizontally within each layer.
Keep forceCollide() for separation.
Gravity/center force weak (0.02) — nodes held by layer forces primarily.

Layer Y positions (in pixels, viewport height = window.innerHeight):
  Layer 0  Y = 80     USER
  Layer 1  Y = 170    USER_INPUT
  Layer 2  Y = 290    ENKI (Claude Code main session)
  Layer 3  Y = 390    PULSE_SEED (brain dump / session inject)
  Layer 4  Y = 490    PROMPT_HOOKS (user-prompt-submit hooks)
  Layer 5  Y = 600    PULSE_ORCH (orchestrator)
  Layer 6  Y = 700    CLASSIFIER (offload-contract.mjs)
  Layer 7  Y = 820    ADVISOR_FANOUT (6 advisor nodes, spread horizontally)
  Layer 8  Y = 940    PULSE_BUS (findings collected)
  Layer 9  Y = 1040   ENKI_DECISION (main thread synthesizes + decides)
  Layer 10 Y = 1140   ROUTING (lanes + codex gate, spread horizontally)
  Layer 11 Y = 1240   MEMORY (3-tier + kernel, spread horizontally)
  Layer 12 Y = 1340   SERVICES (launchd, spread horizontally)
  Layer 13 Y = 1460   RESPONSE (output back to user)

The canvas height must accommodate all layers. Set canvas height = 1600px minimum.
Allow vertical scroll if viewport shorter than 1600px (overflow-y: scroll on a wrapper, canvas is tall).

forceY strength: 0.9 for all nodes (strong anchoring to layer)
forceX strength: 0.3 (loose horizontal spreading within layer)
forceManyBody strength: -800 (strong repulsion to spread within layer)
forceCollide: node.r + 20

---

NODE DEFINITIONS

All nodes are circles. Text is rendered INSIDE the circle.
Inside text: line 1 = node ID (bold, 13px), line 2 = short role (11px, --text-dim).
For nodes r >= 40: also render a third line (9px dim) for detail.

Draw text inside circle:
  ctx.textAlign = 'center'
  Line 1 at dy = -8 (id, bold)
  Line 2 at dy = +8 (role, normal)
  Line 3 at dy = +22 (detail, if r >= 40)

NODE LIST (id, label, role, detail, layer, r, color):

USER               "USER"              "human operator"         ""                              0   45  #FFFFFF
USER_INPUT         "USER INPUT"        "typed prompt"           "→ Claude Code CLI"             1   40  #00D4FF
ENKI               "ENKI"              "main session"           "Claude Code control plane"     2   55  #00D4FF
PULSE_SEED         "PULSE SEED"        "brain dump inject"      "SOUL+palace+mnemosyne"         3   42  #4A9EFF
PROMPT_HOOKS       "PROMPT HOOKS"      "submit hooks fire"      "aeonic · protocol-guard"       4   38  #94A3B8
PULSE_ORCH         "NEXUSPULSE"        "pulse-orchestrator.mjs" "detached spawn per turn"       5   45  #4A9EFF
CLASSIFIER         "CLASSIFIER"        "offload-contract.mjs"   "tier: TRIVIAL/STD/CPLX/CRIT"  6   42  #4A9EFF
DEEPSEEK           "DEEPSEEK"          "model_advisor"          "v4-flash / v4-pro · 60s"       7   36  #9B6EFF
OPENCLAW           "OPENCLAW"          "bridge_advisory"        "QUARANTINED · HIGH cap"        7   36  #FF5252
HERMES_FC          "HERMES"            "native_function"        "context pressure · always-on"  7   34  #9B6EFF
CASSANDRA          "CASSANDRA"         "native foresight"       "strategic · no model"          7   34  #9B6EFF
SWARM              "SWARM"             "swarm_dispatch"         "flash+pro parallel"            7   34  #9B6EFF
OBLITERATUS        "OBLITERATUS"       "adversarial gate"       "critical turns only"           7   34  #FF6835
PULSE_BUS          "PULSE BUS"         "ring buffer · 14 slots" "5min TTL · findings"           8   42  #4A9EFF
ENKI_DECISION      "ENKI DECIDES"      "synthesizes findings"   "reads bus → routes → acts"     9   48  #00D4FF
LANE_LOCAL         "code-local"        "qwen2.5-coder:7b"       "LOCAL"                         10  28  #00C896
LANE_DSFLASH       "ds-flash"          "deepseek-v4-flash"      "CLOUD"                         10  28  #00C896
LANE_MINI          "codex-mini"        "gpt-5.4-mini"           "CODEX · impl"                  10  30  #9B6EFF
LANE_CODEX         "codex"             "gpt-5.5"                "CODEX · full"                  10  32  #9B6EFF
GATE_CODEX2        "CODEX GATE"        "two-phase · propose"    "→ .approved → apply"           10  36  #FF6835
GATE_NEXUS         "GITNEXUS"          "impact analysis"        "blast radius check"            10  30  #FF6835
MEM_HOT            "MEM HOT"           "TIER 1 · in-context"    "pulse-plan + bus"              11  36  #FF6B6B
MEM_WARM           "MEM WARM"          "TIER 2 · episodic"      "EOT + journal"                 11  34  #FFB347
MEM_COLD           "MEM COLD"          "TIER 3 · semantic"      "wiki atoms"                    11  32  #74B9FF
MEM_KERNEL         "KERNEL DB"         "memory.db · SQLite"     "kernel.py syscalls"            11  30  #94A3B8
SVC_SHELL          "shellservice"      "PID 816 · port 3098"    "RUNNING"                       12  28  #00C896
SVC_RUNTIME        "yuri-runtime"      "PID 819"                "RUNNING"                       12  28  #00C896
SVC_RAG            "wiki-rag"          "PID 821 · RAG"          "RUNNING"                       12  28  #00C896
SVC_EOT            "eot-refresh"       "launchd scheduled"      "eot-archive.mjs"               12  26  #94A3B8
RESPONSE           "RESPONSE"          "output to user"         "→ USER sees result"            13  44  #00D4FF

---

EDGES (source, target, type)

type "flow"    → stroke #00D4FF solid sw=2         (main process flow)
type "data"    → stroke #4A9EFF dashed animated sw=1.5  (findings/data)
type "advises" → stroke #9B6EFF dashed sw=1 opacity=0.6
type "gates"   → stroke #FF6835 solid sw=1.5
type "memory"  → stroke #74B9FF dotted sw=1 opacity=0.6

USER → USER_INPUT           flow
USER_INPUT → ENKI           flow
ENKI → PULSE_SEED           flow
PULSE_SEED → ENKI           data     (seed context injected into ENKI)
ENKI → PROMPT_HOOKS         flow
PROMPT_HOOKS → PULSE_ORCH   flow
PULSE_ORCH → CLASSIFIER     flow
CLASSIFIER → DEEPSEEK       flow
CLASSIFIER → OPENCLAW       flow
CLASSIFIER → HERMES_FC      flow
CLASSIFIER → CASSANDRA      flow
CLASSIFIER → SWARM          flow
CLASSIFIER → OBLITERATUS    flow
DEEPSEEK → PULSE_BUS        data
OPENCLAW → PULSE_BUS        advises
HERMES_FC → PULSE_BUS       data
CASSANDRA → PULSE_BUS       data
SWARM → PULSE_BUS           data
OBLITERATUS → PULSE_BUS     data
PULSE_BUS → ENKI_DECISION   data
ENKI_DECISION → GATE_CODEX2 gates
ENKI_DECISION → GATE_NEXUS  gates
ENKI_DECISION → LANE_LOCAL  flow
ENKI_DECISION → LANE_DSFLASH flow
ENKI_DECISION → LANE_MINI   flow
ENKI_DECISION → LANE_CODEX  flow
GATE_CODEX2 → LANE_MINI     gates
GATE_CODEX2 → LANE_CODEX    gates
ENKI_DECISION → MEM_HOT     memory
MEM_HOT → MEM_WARM          memory
MEM_WARM → MEM_COLD         memory
MEM_COLD → MEM_KERNEL       memory
SVC_SHELL → ENKI            data
SVC_RUNTIME → ENKI          data
SVC_RAG → MEM_COLD          data
SVC_EOT → MEM_WARM          data
LANE_MINI → RESPONSE        flow
LANE_CODEX → RESPONSE       flow
LANE_LOCAL → RESPONSE       flow
RESPONSE → USER             flow

---

CANVAS + SIMULATION SETUP

Canvas: position fixed, top 0, left 0, width = window.innerWidth, height = max(1600, window.innerHeight).
Make canvas scrollable: wrap in a div with overflow-y:auto, height:100vh. Canvas inside is tall.

D3-force setup (all 4 deps must be INLINED from the existing bundles already in the file — do not add CDN links):

simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(edges).id(d=>d.id).distance(60).strength(0.05))
  .force('charge', d3.forceManyBody().strength(-800))
  .force('collide', d3.forceCollide(d => d.r + 20))
  .force('y', d3.forceY(d => LAYER_Y[d.layer]).strength(0.9))
  .force('x', d3.forceX(d => {
    // Spread nodes within their layer
    const nodesInLayer = nodes.filter(n => n.layer === d.layer);
    const idx = nodesInLayer.indexOf(d);
    const total = nodesInLayer.length;
    const spread = Math.min(total * 120, window.innerWidth * 0.8);
    const startX = (window.innerWidth - spread) / 2;
    return startX + (idx / Math.max(total-1, 1)) * spread;
  }).strength(0.3))
  .alphaDecay(0.015)

RAF render loop on every simulation tick.

---

RENDERING

Per frame:
1. ctx.clearRect
2. Draw edges: for each edge, draw line from source to target with edge style. For 'data' type, animate stroke dashoffset (global counter, +0.5 per frame). Add small arrowhead (triangle) at target end.
3. Draw nodes:
   a. ctx.save()
   b. shadowBlur=25 shadowColor=node.color for nucleus/primary nodes (ENKI, ENKI_DECISION, USER, RESPONSE, NEXUSPULSE)
   c. shadowBlur=12 shadowColor=node.color for others
   d. ctx.beginPath(); ctx.arc(x, y, r, 0, 2*Math.PI)
   e. Fill with node.color at 20% opacity: ctx.fillStyle = hexToRgba(node.color, 0.18)
   f. Stroke with node.color full: ctx.strokeStyle = node.color; ctx.lineWidth = 2
   g. ctx.fill(); ctx.stroke()
   h. ctx.restore()
   i. Render text inside:
      ctx.fillStyle = '#C8D8E8'
      ctx.font = 'bold 13px JetBrains Mono, monospace'
      ctx.fillText(node.label, x, y - 8)
      ctx.font = '11px JetBrains Mono, monospace'
      ctx.fillStyle = '#5A7090'
      ctx.fillText(node.role, x, y + 8)
      if node.r >= 36:
        ctx.font = '9px JetBrains Mono, monospace'
        ctx.fillStyle = '#3A5070'
        ctx.fillText(node.detail, x, y + 22)
   j. OPENCLAW: draw extra dashed red cage ring at r+10

4. Draw node IDs as external label ABOVE node for nodes r < 30 (routing lanes, small services):
   ctx.fillStyle = '#5A7090'; ctx.font = '10px JetBrains Mono'; text above node at dy = -(r+12)

---

BOOT ANIMATION

All nodes start at (cx, cy_layer) — horizontal center, at their target Y layer.
They spread horizontally from center via x-force over 1500ms.
Edge opacity: 0 until t=800ms, then fades to 1 by t=1200ms.
Labels in nodes: visible from start (no fade needed since they're always inside nodes).

---

INTERACTIONS

Hover: hit-test all nodes (distance <= r). Highlight hovered node (shadowBlur=40, strokeStyle full opacity). Show tooltip: DOM div, position:fixed, JetBrains Mono 11px, background=#0D1526, border-left 2px solid node.color, no border-radius. Content: node.id bold + newline + node.role + newline + node.detail.

Click: right drawer (320px, slides from right, clip-path notch). Shows: node.id large in node.color, role, detail, plus list of edges (incoming + outgoing) with type badges.

ESC / backdrop click: close drawer.

---

FIXED DOM OVERLAYS (not on canvas)

Top-left (z-index 100):
  "YURI OS" 13px #00D4FF bold tracking 0.08em
  "YURI · main · f770a64b" 10px #2A4060

Top-right:
  Soak ring SVG (r=12, 32% of circumference filled, stroke #00D4FF)
  "16/50 SOAK" 10px #5A7090
  "5/5 ●" 10px #FF5252 — pulsing animation

Bottom-center:
  "TIER CRITICAL · PROTOCOL-CHANGE · 29 NODES · 42 EDGES" 10px #2A4060

Legend bottom-left:
  "── FLOW" #00D4FF
  "-- DATA" #4A9EFF
  "·· ADVISES" #9B6EFF
  "── GATES" #FF6835
  "·· MEMORY" #74B9FF

---

FONT

JetBrains Mono from Google Fonts — link tag in head only. All canvas text uses: 'JetBrains Mono, monospace'.

---

DO NOT USE CDN FOR D3. The existing file already has d3-dispatch, d3-timer, d3-quadtree, d3-force inlined as script tags. Keep them. Do not add any new CDN script tags.

STRICTLY: replace the entire file content. Output: /Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html
