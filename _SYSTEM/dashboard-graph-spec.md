## CODEX TASK SPEC

Goal: Replace /Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html with a full-viewport force-directed node graph of Yuri OS. Every system, agent, memory tier, routing lane, hook phase, and service is a node. Edges show how they connect. Boot animation explodes nodes outward from center. Interactive: hover = tooltip, click = detail panel.

Technology: Canvas2D (getContext('2d')) + D3-force v3 via CDN (jsDelivr). No WebGL. No build step. Single HTML file.

---

NODES — define as JS array, each with: id, label, group, r (radius), color, x_hint, y_hint (loose starting position hint for radial force)

GROUP: nucleus (1 node)
  ENKI  r=28  #D4AF37  center  label="ENKI · main session"

GROUP: cortex (3 nodes) — the NexusPulse pipeline core
  PULSE_ORCH    r=16  #A8BCC6  label="pulse-orchestrator.mjs"
  CLASSIFIER    r=14  #A8BCC6  label="offload-contract.mjs"
  PULSE_BUS     r=14  #A8BCC6  label="pulse-bus.json · ring buffer"

GROUP: advisors (6 nodes) — the advisor ensemble
  DEEPSEEK      r=13  #1E3A8A  label="DEEPSEEK · model_advisor"
  OPENCLAW      r=13  #C95A3B  label="OPENCLAW · bridge_advisory · QUARANTINED"
  HERMES_FC     r=12  #1E3A8A  label="HERMES_FC · native_function"
  CASSANDRA     r=12  #1E3A8A  label="CASSANDRA · foresight · no model"
  SWARM         r=12  #64d8e6  label="SWARM · dual fan-out"
  OBLITERATUS   r=12  #C95A3B  label="OBLITERATUS · adversarial gate"

GROUP: memory (5 nodes) — 3-tier memory + kernel + MLM
  MEM_HOT       r=14  #D4AF37  label="MEMORY TIER 1 · HOT · pulse-plan + bus"
  MEM_WARM      r=13  #c8a45c  label="MEMORY TIER 2 · WARM · EOT + journal"
  MEM_COLD      r=12  #4A3B32  label="MEMORY TIER 3 · COLD · wiki atoms"
  MEM_KERNEL    r=11  #A8BCC6  label="memory.db · SQLite · kernel.py"
  MEM_MLM       r=10  #C95A3B  label="MLM SANDBOX · quarantined zone"

GROUP: routing (12 nodes) — routing lanes
  LANE_LOCAL    r=9   #76b900  label="code-local · qwen2.5-coder:7b"
  LANE_DSFLASH  r=9   #00e5bf  label="deepseek-v4-flash"
  LANE_DSPRO    r=9   #00e5bf  label="deepseek-v4-pro"
  LANE_TRIAGE   r=8   #76b900  label="triage-local · qwen2.5:7b"
  LANE_SUMM     r=8   #76b900  label="summarize-local"
  LANE_GPTOSS   r=8   #76b900  label="gpt-oss · 20b/120b"
  LANE_SPARK    r=9   #9B59FF  label="codex-spark · gpt-5.3"
  LANE_MINI     r=10  #9B59FF  label="codex-mini · gpt-5.4-mini · impl authority"
  LANE_CODEX    r=11  #9B59FF  label="codex · gpt-5.5 · full workspace"
  LANE_OC       r=9   #C95A3B  label="openclaw lane · bridge-only"
  LANE_SWARM    r=9   #64d8e6  label="swarm lane · dual fan-out"
  LANE_KIMI     r=8   #00e5bf  label="kimi · moonshot · fallback"

GROUP: hooks (5 nodes) — session lifecycle phases
  HOOK_STARTUP  r=10  #A8BCC6  label="STARTUP · yuri-boot + soul-inject"
  HOOK_PROMPT   r=10  #A8BCC6  label="PROMPT-SUBMIT · orchestrator trigger"
  HOOK_PRE      r=10  #A8BCC6  label="PRE-TOOL · security + impact gates"
  HOOK_POST     r=10  #A8BCC6  label="POST-TOOL · logger + checkpoint"
  HOOK_STOP     r=10  #A8BCC6  label="STOP · EOT + session-end"

GROUP: gates (4 nodes) — CI/CD gates
  GATE_PRECOMMIT r=9  #D4AF37  label="pre-commit · contract regression"
  GATE_NEXUS    r=9   #D4AF37  label="GitNexus · impact + detect_changes"
  GATE_CODEX2   r=9   #9B59FF  label="Codex two-phase gate · propose→apply"
  GATE_OBLIT    r=9   #C95A3B  label="Obliteratus gate · adversarial audit"

GROUP: services (7 nodes) — launchd
  SVC_SHELL     r=9   #00e5bf  label="shellservice · PID 816 · port 3098"
  SVC_RUNTIME   r=9   #00e5bf  label="yuri-session-runtime · PID 819"
  SVC_RAG       r=9   #00e5bf  label="wiki-rag · PID 821 · karpathy atoms"
  SVC_HEALTH    r=7   #A8BCC6  label="lane-health · scheduled"
  SVC_DIGEST    r=7   #A8BCC6  label="token-digest · scheduled"
  SVC_EOT       r=7   #A8BCC6  label="eot-refresh · scheduled"
  SVC_OLLAMA    r=7   #A8BCC6  label="ollama-kv · idle"

GROUP: selfimprove (3 nodes) — self-improvement engine
  SOAK          r=11  #D4AF37  label="SOAK · 16/50 · classifier gate at 50"
  EOT_PIPE      r=10  #A8BCC6  label="EOT PIPELINE · 10 phases"
  PULSE_ARCHIVE r=9   #A8BCC6  label="pulse-archive · daily findings"

---

EDGES — define as JS array: { source, target, type }

type "invokes" — solid gold #D4AF37 sw=1.5 (authority/control flow)
type "data" — dashed animated #1E3A8A sw=1.2 stroke-dasharray 5 4 (data/findings flow)
type "advises" — dashed #A8BCC6 sw=0.8 opacity=0.5 (advisory only)
type "gates" — solid #C95A3B sw=1.2 (gate/block relationship)
type "stores" — dotted #4A3B32 sw=0.8 (memory read/write)
type "runs" — solid #00e5bf sw=0.8 opacity=0.6 (service execution)

EDGES:
ENKI → PULSE_ORCH       invokes
ENKI → CLASSIFIER       invokes
ENKI → MEM_HOT          stores
ENKI → GATE_OBLIT       gates
PULSE_ORCH → CLASSIFIER invokes
PULSE_ORCH → PULSE_BUS  data
PULSE_ORCH → DEEPSEEK   invokes
PULSE_ORCH → OPENCLAW   invokes
PULSE_ORCH → HERMES_FC  invokes
PULSE_ORCH → CASSANDRA  invokes
PULSE_ORCH → SWARM      invokes
PULSE_ORCH → OBLITERATUS invokes
DEEPSEEK → PULSE_BUS    data
OPENCLAW → PULSE_BUS    advises
HERMES_FC → PULSE_BUS   data
CASSANDRA → PULSE_BUS   data
SWARM → PULSE_BUS       data
OBLITERATUS → PULSE_BUS advises
PULSE_BUS → ENKI        data
CLASSIFIER → LANE_LOCAL   invokes
CLASSIFIER → LANE_DSFLASH invokes
CLASSIFIER → LANE_DSPRO   invokes
CLASSIFIER → LANE_MINI    invokes
CLASSIFIER → LANE_CODEX   invokes
CLASSIFIER → LANE_SWARM   invokes
LANE_MINI → ENKI        data
LANE_CODEX → GATE_CODEX2 gates
GATE_CODEX2 → ENKI      data
MEM_HOT → MEM_WARM      stores
MEM_WARM → MEM_COLD     stores
MEM_COLD → MEM_KERNEL   stores
MEM_MLM → MEM_COLD      stores
HOOK_STARTUP → ENKI     invokes
HOOK_PROMPT → PULSE_ORCH invokes
HOOK_PRE → GATE_NEXUS   gates
HOOK_POST → MEM_HOT     stores
HOOK_STOP → EOT_PIPE    invokes
GATE_PRECOMMIT → GATE_NEXUS gates
GATE_NEXUS → GATE_CODEX2 gates
SVC_SHELL → ENKI        runs
SVC_RUNTIME → ENKI      runs
SVC_RAG → MEM_COLD      data
SVC_EOT → EOT_PIPE      invokes
EOT_PIPE → PULSE_ARCHIVE stores
PULSE_ARCHIVE → SOAK    data
SOAK → CLASSIFIER       data

---

D3-FORCE SETUP

Use d3-force v3 from CDN: https://cdn.jsdelivr.net/npm/d3-force@3/dist/d3-force.umd.min.js

simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(edges).id(d=>d.id).distance(d => {
    // short distances for tightly coupled pairs, longer for loose
    if(d.type==='invokes') return 80;
    if(d.type==='data') return 100;
    if(d.type==='advises') return 120;
    if(d.type==='gates') return 90;
    if(d.type==='stores') return 110;
    if(d.type==='runs') return 130;
    return 100;
  }).strength(0.4))
  .force('charge', d3.forceManyBody().strength(d => -Math.pow(d.r, 2) * 8))
  .force('center', d3.forceCenter(cx, cy).strength(0.05))
  .force('collision', d3.forceCollide(d => d.r + 12))
  .force('radial_nucleus', d3.forceRadial(0, cx, cy).filter(d=>d.group==='nucleus').strength(1))
  .force('radial_cortex', d3.forceRadial(140, cx, cy).filter(d=>d.group==='cortex').strength(0.6))
  .force('radial_advisors', d3.forceRadial(240, cx, cy).filter(d=>d.group==='advisors').strength(0.5))
  .force('radial_memory', d3.forceRadial(280, cx, cy).filter(d=>d.group==='memory').strength(0.4))
  .force('radial_routing', d3.forceRadial(380, cx, cy).filter(d=>d.group==='routing').strength(0.4))
  .force('radial_hooks', d3.forceRadial(320, cx, cy).filter(d=>d.group==='hooks').strength(0.4))
  .force('radial_gates', d3.forceRadial(300, cx, cy).filter(d=>d.group==='gates').strength(0.4))
  .force('radial_services', d3.forceRadial(440, cx, cy).filter(d=>d.group==='services').strength(0.4))
  .force('radial_selfimprove', d3.forceRadial(360, cx, cy).filter(d=>d.group==='selfimprove').strength(0.4))
  .alpha(1).alphaDecay(0.02)

---

CANVAS RENDERING

requestAnimationFrame loop. On each tick:
1. Clear canvas
2. Draw edges first (below nodes):
   - For "data" type: use animated stroke offset — track a global dashOffset var, increment by 0.3 per frame
   - Draw line from source.x,source.y to target.x,target.y with appropriate stroke style
   - Add arrowhead at target end (small triangle, pointing toward target, filled with edge color)
3. Draw nodes:
   - Circle with fill=node.color, strokeStyle='rgba(255,255,255,0.15)', lineWidth=1
   - ENKI: also draw outer glow ring (shadowBlur=30 shadowColor='#D4AF37')
   - OPENCLAW: draw red dashed cage ring at r+8 (drawDashedCircle helper)
   - nucleus/cortex nodes: shadowBlur=20
   - Running services (SVC_SHELL/SVC_RUNTIME/SVC_RAG): shadowBlur=12 shadowColor='#00e5bf'
4. Draw labels:
   - Only draw if node.r >= 9 (skip tiny nodes on default zoom)
   - Text: 11px JetBrains Mono, fillStyle='#F2E9D2', textAlign='center', dy = node.r + 14
   - For nodes r >= 12: also draw role line at dy = node.r + 26, 9px #A8BCC6

---

BOOT ANIMATION

At t=0: all nodes initialized at center (cx, cy) with random tiny jitter ±5px
Simulation runs with alpha=1 — nodes explode outward via charge repulsion + radial forces
Over ~2000ms they settle into stable positions
Edge opacity: starts 0, fades to 1 at t=800ms
Label opacity: starts 0, fades to 1 at t=1200ms

---

INTERACTIONS

Mouse move: check distance to each node. If within node.r + 4, show tooltip.
Tooltip: position:fixed DOM element, no background, border-left 2px solid #D4AF37, JetBrains Mono 11px, content = node.label + newline + node.group.toUpperCase()

Click on node: open right drawer (320px wide, slides from right), shows:
  - Node ID large #D4AF37
  - Group badge
  - Full label
  - Edge list: "→ TARGET_ID (type)" for all outgoing edges from this node

Click backdrop / ESC: close drawer

Hover node: brighten node fill (ctx.globalAlpha=1.2 clamped), dim all other nodes (ctx.globalAlpha=0.3)

---

FIXED DOM OVERLAYS (not on canvas)

Top-left (position:fixed top:12px left:16px):
  "YURI OS" — JetBrains Mono 13px #D4AF37 bold tracking 0.1em
  "NUDIMMUD · main · 77cba552" — 10px #4A3B32

Top-right:
  Soak ring SVG: r=14, 32% filled, #A8BCC6
  "16/50 SOAK" — 10px #A8BCC6
  "5/5 ●" — 10px #C95A3B pulsing

Bottom center strip:
  "TIER CRITICAL · PROTOCOL-CHANGE · 51 NODES · 33 EDGES" — 10px #A8BCC6

Legend (bottom-left, small):
  colored line swatches + labels: INVOKES · DATA · ADVISES · GATES · STORES · RUNS

---

VISUAL RULES

Background: #080808. Full viewport canvas (width=window.innerWidth, height=window.innerHeight). Resize on window resize.
All node text: JetBrains Mono. No other font.
No panels, no cards, no scroll. Pure graph.
Single external dep: d3-force v3 CDN + JetBrains Mono Google Fonts.
Output: /Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html — replace entirely.
