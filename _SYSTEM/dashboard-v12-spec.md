## CODEX TASK SPEC

Goal: v11 → v12. Eliminate ALL true dead-ends in the Yuri OS graph by adding return edges, missing subsystems, and rendering updates.

Source of findings: `/introspect` audit identified 73 true dead-ends (cannot reach USER or RESPONSE), 1 orphan section (SERVICES), and 8+ missing subsystems.

Deliverables (in-repo + global):
1. `/Users/marcelspatz/NUDIMMUD/_SYSTEM/yuri-graph-state.json` — updated with 40+ new edges, 14+ new nodes, populated returns_to metadata
2. `/Users/marcelspatz/NUDIMMUD/yuri-os-dashboard.html` — render updates for new nodes/edges/sectors

Build ON v11. Keep all working systems. Add/change only what's specified.

---

# PART A — GRAPH STATE UPDATES (`_SYSTEM/yuri-graph-state.json`)

## A.1 Populate `metadata.returns_to` for ALL nodes

Every node gets a `returns_to` value derived from outgoing edge graph (if any) OR set to the parent section in this fallback table:

```
USER          → null (terminal — the human, top of stack)
USER_INPUT    → USER (response delivered back)
ENKI          → RESPONSE (all paths funnel here eventually)
SESSION_INIT  → ENKI
PROMPT_HOOKS  → ENKI
NEXUSPULSE    → ENKI_DECIDES (its purpose: feed bus to ENKI_DECIDES)
CLASSIFIER    → ENKI (classification informs ENKI routing)
ADVISORS      → PULSE_BUS (findings flow into bus)
PULSE_BUS     → ENKI_DECIDES (already correct)
ENKI_DECIDES  → ENKI (already correct)
ROUTING       → RESPONSE (lane execution produces response)
CODEX_GATE    → RESPONSE (applied diff lands here)
MEMORY        → ENKI (memory available next turn — already correct)
SERVICES      → ENKI (runtime context)
RESPONSE      → USER (already correct)
```

For sub-nodes: returns_to = parent section's returns_to (or parent itself).
For leaves: returns_to = parent sub-node.

## A.2 Add 40+ new return edges

Append to the edges array. All have `is_return: true` and `type: "return"` unless specified:

### Section → Section returns (closing the main pipeline cycle):
```
SESSION_INIT → ENKI    type=return
PROMPT_HOOKS → ENKI    type=return
NEXUSPULSE   → ENKI_DECIDES  type=return
CLASSIFIER   → ENKI    type=return
ROUTING      → RESPONSE  type=return
CODEX_GATE   → RESPONSE  type=return
SERVICES     → ENKI    type=feedback  (new type)
```

### Advisor → PULSE_BUS edges (each advisor closes to bus):
```
DEEPSEEK_A    → PULSE_BUS  type=data
OPENCLAW_A    → PULSE_BUS  type=advises
HERMES_A      → PULSE_BUS  type=data
CASSANDRA_A   → PULSE_BUS  type=data
SWARM_A       → PULSE_BUS  type=data
OBLITERATUS_A → PULSE_BUS  type=data
```

### CODEX_GATE sub-chain (propose → approved → apply):
```
PROPOSE      → APPROVED   type=gates
APPROVED     → APPLY      type=gates
APPLY        → RESPONSE   type=flow
```

### Routing lanes → RESPONSE (each lane terminates output):
```
LANE_LOCAL    → RESPONSE  type=flow
LANE_DSF      → RESPONSE  type=flow
LANE_DSP      → RESPONSE  type=flow
LANE_MINI     → CODEX_GATE  type=gates  (impl path)
LANE_CODEX    → CODEX_GATE  type=gates  (impl path)
LANE_KIMI     → RESPONSE  type=flow
LANE_TRIAGE   → MEMORY    type=memory  (summarize→cold)
LANE_GPTOSS   → RESPONSE  type=flow
```

### Hook validation feedback (each hook validates and feeds back):
```
AEONIC       → ENKI       type=validates  (new type)
PROT_GUARD   → ENKI       type=validates
SCOUT_SPAWN  → PULSE_BUS  type=data
TIRITH       → ENKI       type=validates
BASH_GUARD   → ENKI       type=validates
GITNEX_PRE   → CODEX_GATE type=gates
```

### Classifier outputs to ENKI_DECIDES:
```
TRIVIAL       → ENKI_DECIDES  type=flow
STANDARD      → ENKI_DECIDES  type=flow
COMPLEX       → ENKI_DECIDES  type=flow
CRITICAL      → ENKI_DECIDES  type=flow
CLF_SCENARIO  → ENKI_DECIDES  type=data
CLF_ROUTE_PLAN → ENKI_DECIDES type=data
```

### ENKI sub-nodes → ENKI (they update enki state):
```
ENKI_PLAN    → ENKI  type=data
ENKI_BUS     → ENKI  type=data
ENKI_CTX     → ENKI  type=data
```

### SESSION_INIT children → ENKI (each seeds enki):
```
SOUL_INJECT  → ENKI  type=data
PALACE       → ENKI  type=data
MNEMOSYNE    → ENKI  type=data
TOKEN_INIT   → ENKI  type=data
```

### NEXUSPULSE children → ENKI_DECIDES:
```
ORCHESTRATOR  → CLASSIFIER  type=flow
PULSE_PLAN    → ENKI_DECIDES  type=data
NP_BEACON     → RESPONSE  type=flow
NP_CODEX_RUNNER → CODEX_GATE  type=gates
```

### Pulse-bus internal:
```
PB_RING      → ENKI_DECIDES  type=data
PB_CONSUME   → ENKI_DECIDES  type=data
PB_THROTTLE  → PULSE_BUS  type=feedback
```

### ENKI_DECIDES children:
```
ED_SYNTH     → ROUTING  type=flow
ED_ROUTE     → ROUTING  type=flow
ED_FINAL     → CODEX_GATE  type=gates
```

### Memory sub-children logging back to MEMORY parent (consolidate):
```
MEM_KERNEL   → ENKI  type=memory
MLM_SANDBOX  → MEMORY  type=feedback
```

### Services feeding ENKI runtime context:
```
SVC_SHELL    → ENKI  type=feedback
SVC_RUNTIME  → ENKI  type=feedback
SVC_RAG      → MEM_COLD  type=memory  (RAG feeds cold tier)
SVC_HEALTH   → ENKI  type=feedback
SVC_EOT      → MEM_WARM  type=memory  (EOT writes warm)
SVC_DIGEST   → MEM_WARM  type=memory
SVC_OLLAMA   → ENKI  type=feedback
```

## A.3 ADD NEW SUBSYSTEMS (14 new nodes)

### New sector `code_intelligence` color `#76B900`:
- Section `GITNEXUS` r=50 color=#76B900 `purpose: "Code intelligence graph — 91k symbols, 131k relationships, 300 execution flows. Mandatory blast-radius analysis before symbol edits, change detection before commits."` files=`["package.json (gitnexus dep)", "CLAUDE.md (gitnexus section)"]` capabilities=`["impact analysis","detect changes","query symbols","trace flows"]` returns_to=ENKI
- Sub `GN_IMPACT` parent=GITNEXUS purpose="Blast radius analysis on symbol edits"
- Sub `GN_DETECT` parent=GITNEXUS purpose="Pre-commit change detection"
- Sub `GN_QUERY` parent=GITNEXUS purpose="Symbol + flow query layer"

Edges:
```
ENKI → GITNEXUS         type=flow
GITNEXUS → ENKI         type=return
GN_IMPACT → GITNEXUS    type=data
GN_DETECT → CODEX_GATE  type=gates
GN_QUERY → ENKI         type=data
GITNEX_PRE → GITNEXUS   type=flow  (existing hook now connects)
```

### New sector `self_improvement` color `#FF8855`:
- Section `SELF_IMPROVE` r=52 color=#FF8855 purpose="Continuous self-improvement engine: EOT pipeline, soak calibration, pulse-archive, visual introspection. Feeds learnings back to ENKI." returns_to=ENKI
- Sub `EOT_PIPELINE` parent=SELF_IMPROVE purpose="9-phase end-of-session reflection: evidence inventory → timeline → claim audit → ledger → MANGEKYO hardening → skill patches → boot packet → synthesis → pulse-archive"
- Sub `SOAK_LOOP` parent=SELF_IMPROVE purpose="Calibration: 16/50 turns toward classifier tuning gate. 200+ turns toward full calibration loop"
- Sub `PULSE_ARCHIVE` parent=SELF_IMPROVE purpose="Daily WARN+ promotable findings; canonical learning corpus"
- Sub `INTROSPECT` parent=SELF_IMPROVE purpose="Visual introspection skill — engineering analysis from graph state"
- Sub `SKILL_REGISTRY` parent=SELF_IMPROVE purpose="35+ active skills"
- Leaf `PRECOMMIT_REGRESS` parent=PULSE_ARCHIVE purpose="offload-contract-regression.sh"
- Leaf `BEACON_OBSIDIAN` parent=NP_BEACON purpose="Obsidian vault writes for beacon=notify+obsidian"

Edges:
```
ENKI         → SELF_IMPROVE    type=flow
SELF_IMPROVE → ENKI            type=return
EOT_PIPELINE → MEM_WARM        type=memory
SOAK_LOOP    → CLASSIFIER      type=feedback
PULSE_ARCHIVE → MEM_COLD       type=memory
INTROSPECT   → ENKI            type=data
SKILL_REGISTRY → ENKI          type=data
PRECOMMIT_REGRESS → CODEX_GATE type=gates
BEACON_OBSIDIAN → MEM_WARM     type=memory
```

## A.4 SECTOR COLOR DIFFERENTIATION

Update sector colors to reduce blue overlap:
- `classification` → `#48C3D8` (teal) — was #4A9EFF
- `prompt_hooks` → `#A398B8` (gray-violet) — was #94A3B8
- `code_intelligence` → `#76B900` (lime, NEW)
- `self_improvement` → `#FF8855` (peach, NEW)

Update all node colors in those sectors to match.

Update sector entries in graph state `sectors` array. Add 2 new sectors.

## A.5 NEW EDGE TYPES

Add to dashboard edge type rendering:
- `feedback` — dashed cyan `#74B9FF` sw=0.8 opacity=0.45 (advisory return, runtime signal)
- `validates` — solid amber `#FFB347` sw=1.0 opacity=0.6 (gate→source validation)
- `logs` — dotted slate `#94A3B8` sw=0.6 opacity=0.35 (anything→MEMORY for logging)

Update edge legend at bottom of dashboard. Add the 3 new types.

## A.6 Telemetry update

```json
"telemetry": {
  "total_nodes": 109,
  "total_edges": 155,
  "section_count": 17,
  "sub_count": ...,
  "leaf_count": ...,
  "closed_loops": [
    "RESPONSE→USER","ENKI_DECIDES→ENKI","MEMORY→ENKI",
    "SESSION_INIT→ENKI","PROMPT_HOOKS→ENKI","NEXUSPULSE→ENKI_DECIDES",
    "CLASSIFIER→ENKI","ROUTING→RESPONSE","CODEX_GATE→RESPONSE",
    "SERVICES→ENKI","GITNEXUS→ENKI","SELF_IMPROVE→ENKI"
  ],
  "dead_ends_eliminated": "v11→v12 reduced from 73 to 0"
}
```

---

# PART B — DASHBOARD RENDERING UPDATES (`yuri-os-dashboard.html`)

## B.1 Add new sectors to STAGES
Insert two new stages in the y-axis sequence after MEMORY:

```js
{ id: 'GITNEXUS',     y:  -1260, twist: 7*Math.PI/12 }, // between MEMORY and SERVICES, twisted
{ id: 'SELF_IMPROVE', y:  -1340, twist: 3*Math.PI/4 },
```

Adjust SERVICES, RESPONSE y values to push down for spacing:
- SERVICES from -1560 to -1620
- RESPONSE from -1720 to -1780

## B.2 Sub-node positioning for new sections

GITNEXUS sub-nodes (3): same orbital pattern as other sections, radius 220, arc π*0.85.
SELF_IMPROVE sub-nodes (5): same pattern.

## B.3 Edge rendering for new types

In the edge-by-type switch:
```js
const EDGE_STYLE = {
  flow:      { color: 0x00D4FF, opacity: 0.85, width: 2.5, dashed: false },
  branch:    { color: 0x4A9EFF, opacity: 0.55, width: 1.2, dashed: false },
  data:      { color: 0x4A9EFF, opacity: 0.65, width: 1.2, dashed: true,  anim: true },
  advises:   { color: 0x9B6EFF, opacity: 0.45, width: 1.0, dashed: true },
  gates:     { color: 0xFF6835, opacity: 0.70, width: 1.5, dashed: false },
  memory:    { color: 0x74B9FF, opacity: 0.40, width: 0.8, dashed: true },
  return:    { color: 0x00D4FF, opacity: 0.50, width: 0.8, dashed: true,  anim: true, arc_outside: true },
  feedback:  { color: 0x74B9FF, opacity: 0.45, width: 0.8, dashed: true },
  validates: { color: 0xFFB347, opacity: 0.60, width: 1.0, dashed: false },
  logs:      { color: 0x94A3B8, opacity: 0.35, width: 0.6, dashed: true,  dotPattern: true }
};
```

`return` edges use the outside-arc routing (cp pushed to +z) so they don't overlap the main column.

## B.4 Closed-loop indicator in info panel

In the info panel `RETURNS TO ↑` section: if the node has a valid returns_to that traces back to USER/RESPONSE, show a `✓ CLOSED` badge after the target id. If no path, show `⚠ DEAD END` in fire color.

Determined at runtime by computing reachability through the edge graph.

## B.5 HUD update

Add to bottom-center status strip:
```
TIER CRITICAL · PROTOCOL-CHANGE · 109 NODES · 155 EDGES · 12 CLOSED LOOPS · DEAD ENDS: 0 · v12
```

The "DEAD ENDS: 0" reads as green when zero, red when nonzero. Computed at runtime from edge graph.

## B.6 Legend update

Add 3 new entries to the bottom-left legend (after MEMORY):
```
─── FEEDBACK    (cyan dashed)
─── VALIDATES   (amber solid)
─── LOGS        (slate dotted)
```

## B.7 Sector color updates in renderer

The color mapping should be data-driven from `GRAPH_STATE.sectors[].color`. Just update the JSON; renderer reads sector colors from state.

---

# PART C — UPDATE GRAPH-STATE.JSON CANONICAL SOURCE

The dashboard already embeds GRAPH_STATE as a const at the top of the script. Update BOTH:
1. The standalone `_SYSTEM/yuri-graph-state.json` file
2. The embedded copy inside `yuri-os-dashboard.html`

Both must remain in sync after this change.

---

# PART D — VERIFICATION

After implementation, run the v12 introspection check:
```bash
node /tmp/yuri-introspect.mjs
```

Expected output:
- DEAD_ENDS: 0
- NO_OUTGOING_EDGES: < 5 (only USER and pure-leaf nodes acceptable)
- CLOSED_LOOPS: 12+
- All sections have returns_to populated

If DEAD_ENDS != 0, identify which nodes still terminate without a path and add missing return edges.

---

# RULES

- Build incrementally on v11. Do not rewrite from scratch.
- Keep all existing v11 visual systems (nucleus orbs, chakra-root pipeline, LOD, hover physics, expand/collapse, info panel).
- Update node colors in graph state — renderer reads from state.
- Test reachability: every non-USER node MUST have a directed path to either USER or RESPONSE.
- Maintain the importmap and Three.js setup unchanged.
- After implementation, also regenerate the embedded GRAPH_STATE constant in the HTML so the JSON file and the HTML stay in sync.
