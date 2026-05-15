## CODEX TASK SPEC

Goal: Iterative upgrade of /Users/marcelspatz/NUDIMMUD/yuri-os-dashboard.html (v9 → v10).

This is NOT a rebuild. Keep the existing Three.js foundation (importmap, scene, camera, OrbitControls, raycaster, animation loop, starfield, nebula shader, CSS2DRenderer labels, preset view buttons, HUD overlays). Add/adjust per the spec below.

Do NOT delete: stage layout, sub-node arrangement, edge routing logic, bloom composer, hover physics.

---

## CHANGE 1 — BACKGROUND / REALM (locked, not expanding)

Problem: nebula skybox currently shows black void at edge when zooming out.

Fix: Make the realm static and camera-locked.

```js
// Solid base color (the "blue realm")
scene.background = new THREE.Color(0x0B1F3E);
scene.fog = null; // remove fog — no depth darkening

// Nebula sphere: increase radius to 30000 so it ALWAYS surrounds camera regardless of zoom
const nebulaGeom = new THREE.SphereGeometry(30000, 64, 64);
// Same shader as before but adjust the gradient stops:
//   deep = vec3(0.043, 0.122, 0.243)   // #0B1F3E base
//   mid  = vec3(0.074, 0.157, 0.310)   // brighter mid
//   high = vec3(0.122, 0.220, 0.412)   // brightest top
// Keep faint noise band

// Lock nebula to camera position so it moves with camera (constant relative size):
function updateNebulaPosition() {
  nebulaMesh.position.copy(camera.position);
}
// Call this in animate loop before composer.render()
```

The starfield: REDUCE star counts and ranges (also lock to camera optionally):
```js
scene.add(makeStarLayer(800,  6000, 0.9, 0.30));  // near
scene.add(makeStarLayer(1200, 9000, 0.6, 0.20));  // mid
scene.add(makeStarLayer(800,  12000, 0.4, 0.12)); // far
```
Lock the starfield to camera position so it never feels "infinite" — keep stars rendering at the camera-relative position each frame.

Result: realm feels contained, no black void appears on zoom.

---

## CHANGE 2 — ORB CLEANUP (lighter, less rings)

Remove the third shell (the `farMat` outer glow at r*2.2). Keep only two shells:

```js
function makeOrb(r, hex) {
  const group = new THREE.Group();

  // Core
  const coreGeom = new THREE.SphereGeometry(r, 48, 48);
  const coreMat = new THREE.MeshPhysicalMaterial({
    color: hex,
    emissive: hex,
    emissiveIntensity: 0.55,    // was 0.85, reduce
    metalness: 0.25,
    roughness: 0.40,
    clearcoat: 0.45,
    clearcoatRoughness: 0.35
  });
  group.add(new THREE.Mesh(coreGeom, coreMat));

  // Atmosphere (lighter, smaller)
  const atmGeom = new THREE.SphereGeometry(r * 1.22, 32, 32);
  const atmMat = new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: 0.10,    // was 0.18
    side: THREE.BackSide, depthWrite: false
  });
  group.add(new THREE.Mesh(atmGeom, atmMat));

  return group;
}
```

Bloom: reduce strength + threshold for subtler glow:
```js
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.42, 0.32);
```

---

## CHANGE 3 — LABEL LOD (distance-based visibility)

Problem: all labels show simultaneously and overlap.

Fix: only main section labels always visible. Sub-node labels visible when camera is within a certain distance. Grandchild labels visible only when very close.

Tag each label DOM element with `data-tier`:
- `data-tier="section"` — section nodes (always visible)
- `data-tier="sub"` — sub-nodes (visible when cameraDist to node < 600)
- `data-tier="leaf"` — grandchildren (visible when cameraDist to node < 250)

In animate() update:
```js
nodes.forEach(n => {
  const dist = camera.position.distanceTo(n.group.position);
  let targetOpacity = 1.0;
  if (n.tier === 'sub')  targetOpacity = dist < 600  ? 1.0 : 0.0;
  if (n.tier === 'leaf') targetOpacity = dist < 250  ? 1.0 : 0.0;
  if (n === hovered)     targetOpacity = 1.0; // override on hover
  // Smooth interp:
  n.labelOpacity += (targetOpacity - n.labelOpacity) * 0.12;
  n.labelDiv.style.opacity = n.labelOpacity;
});
```

---

## CHANGE 4 — HOVER HIGHLIGHTS CONNECTIONS

On hover, dim non-connected edges and brighten connected ones.

```js
function applyHoverHighlight(hovered) {
  edges.forEach(edge => {
    const connected = !hovered || edge.source === hovered.id || edge.target === hovered.id;
    const target = hovered ? (connected ? 0.95 : 0.06) : edge.baseOpacity;
    edge.mesh.material.opacity += (target - edge.mesh.material.opacity) * 0.15;
  });
  nodes.forEach(node => {
    if (!hovered) return;
    const linked = node === hovered || edges.some(e =>
      (e.source === hovered.id && e.target === node.id) ||
      (e.target === hovered.id && e.source === node.id)
    );
    const baseEmiss = node.baseEmissive;
    const targetEmiss = linked ? baseEmiss * 2.0 : baseEmiss * 0.5;
    const core = node.group.children[0]; // core mesh
    core.material.emissiveIntensity += (targetEmiss - core.material.emissiveIntensity) * 0.12;
  });
}
```

Call in animate loop with current hovered node (null when nothing hovered).

---

## CHANGE 5 — EXPANDED SUB-NODE STRUCTURE (more moons)

Add additional sub-nodes ("moons") to existing sections. Each new node positioned on a smaller orbital ring around its parent section.

New nodes to add (parent → list of new children with id, label, type, color):

### ENKI new children:
- ENKI_PLAN: "pulse-plan.json", "turn state", #00D4FF, r=14
- ENKI_BUS: "pulse-bus.json", "findings ring", #4A9EFF, r=14
- ENKI_CTX: "session context", "active window", #00D4FF, r=12

### SESSION_INIT additional grandchildren (under existing soul-inject):
- SI_SOUL: existing
  - GC: SOUL_FILE: "SOUL.md", "behavioral rules", #4A9EFF, r=8
  - GC: NUDIMMUD_COG: "NUDIMMUD-COGNITION.md", "paradigm rules", #4A9EFF, r=8
- SI_PALACE: existing
  - GC: PALACE_IDX: "palace-index.md", "vault navigator", #4A9EFF, r=8

### PROMPT_HOOKS new children:
- PH_AEONIC: existing
- PH_PROTGUARD: existing
- PH_SCOUT: existing
  - GC: SCOUT_HERMES: "HERMES_FC", "context check", #9B6EFF, r=8
  - GC: SCOUT_ARGUS: "ARGUS", "tool sequencing", #9B6EFF, r=8
- PH_TIRITH: existing
- PH_NEW: BASH_GUARD: "bash-security-guard.js", "destructive ops gate", #FF5252, r=14
- PH_NEW: GITNEX_PRE: "gitnexus-impact-check", "blast radius", #FFB347, r=14

### NEXUSPULSE new children:
- NP_ORCH: existing (ORCHESTRATOR)
- NP_PLAN: existing (PULSE_PLAN)
- NP_BEACON: "beacon-emit", "notify+obsidian", #00D4FF, r=14
- NP_CODEX_RUNNER: "pulse-codex-runner.mjs", "two-phase impl", #9B6EFF, r=14

### CLASSIFIER additional context:
- existing TRIVIAL/STANDARD/COMPLEX/CRITICAL
- CLF_SCENARIO: "scenario detector", "ui-change · code-change · ...", #4A9EFF, r=12
- CLF_ROUTE_PLAN: "route-plan output", "lane mapping", #4A9EFF, r=12

### ADVISORS expansion (grandchildren under each advisor):
- DEEPSEEK_A: existing
  - GC: DS_FLASH: "deepseek-v4-flash", "60s preflight", #9B6EFF, r=8
  - GC: DS_PRO: "deepseek-v4-pro", "complex reasoning", #9B6EFF, r=8
- OPENCLAW_A: existing (keep red quarantine ring)
  - GC: OC_BRIDGE: "openclaw-bridge.sh", "127.0.0.1:18789", #FF5252, r=8
- SWARM_A: existing
  - GC: SWARM_FLASH: "swarm flash lane", "flash fan-out", #64D8E6, r=8
  - GC: SWARM_PRO: "swarm pro lane", "pro fan-out", #64D8E6, r=8

### PULSE_BUS new children:
- PB_RING: "ring buffer · 14 slots", "5min TTL", #4A9EFF, r=14
- PB_CONSUME: "consumed marker", "main thread reads", #4A9EFF, r=12
- PB_THROTTLE: "advisor throttle", "rate-limited", #94A3B8, r=12

### ENKI_DECIDES new children:
- ED_SYNTH: "synthesis", "merge findings", #00D4FF, r=14
- ED_ROUTE: "route decision", "lane select", #00D4FF, r=14
- ED_FINAL: "final authority", "act or defer", #00D4FF, r=12

### ROUTING expansion:
- LANE_LOCAL: existing
- LANE_DSF: existing
- LANE_DSP: existing
- LANE_MINI: existing
  - GC: MINI_WRITE: "workspace-write", "sandbox impl auth", #9B6EFF, r=8
- LANE_CODEX: existing
  - GC: CDX_FULL: "full workspace", "max reasoning", #9B6EFF, r=8
- LANE_KIMI: existing
- ROUTING_NEW: LANE_TRIAGE: "triage-local", "qwen:7b summarize", #00C896, r=14
- ROUTING_NEW: LANE_GPTOSS: "gpt-oss 120b", "local GPU", #00C896, r=14

### CODEX_GATE expansion:
- PROPOSE: existing
  - GC: PROP_DRYRUN: "dry-run diff", "no writes", #FF6835, r=8
- APPROVED: existing
- APPLY: existing
  - GC: APPLY_HEAD: "HEAD SHA verify", "stale-protection", #FF6835, r=8

### MEMORY expansion:
- MEM_HOT: existing
  - GC: HOT_PLAN: "pulse-plan.json", "turn state", #FF6B6B, r=8
  - GC: HOT_BUS: "pulse-bus.json", "findings ring", #FF6B6B, r=8
- MEM_WARM: existing
  - GC: WARM_EOT: ".claude/eot/", "boot packets", #FFB347, r=8
  - GC: WARM_JOURNAL: "session-journal.md", "dated entries", #FFB347, r=8
  - GC: WARM_ARCHIVE: "pulse-archive/", "daily findings", #FFB347, r=8
- MEM_COLD: existing
  - GC: COLD_WIKI: "karpathy wiki atoms", "semantic", #74B9FF, r=8
  - GC: COLD_TAXONOMY: "cross-reference-taxonomy.md", "graph", #74B9FF, r=8
  - GC: COLD_RULES: "prevention-rules.md", "lessons", #74B9FF, r=8
- MEM_KERNEL: existing
- MLM_SANDBOX: existing

### SERVICES expansion:
- SVC_SHELL: existing
- SVC_RUNTIME: existing
- SVC_RAG: existing
- SVC_HEALTH: existing
- SVC_EOT: existing
- SVC_NEW: SVC_DIGEST: "token-digest", "scheduled", #94A3B8, r=12
- SVC_NEW: SVC_OLLAMA: "ollama-kv", "cache idle", #94A3B8, r=12

### Grandchild positioning:
Each grandchild orbits its parent sub-node at radius 70 in xz plane (smaller orbit than section-to-sub).
Spread the N grandchildren on an arc of π*0.6 (108°), centered along the parent sub-node's outward direction from the spine.

```js
function placeGrandchild(parentSub, idx, total) {
  const baseAngle = Math.atan2(parentSub.position.z, parentSub.position.x);
  const arc = Math.PI * 0.6;
  const t = total === 1 ? 0 : (idx / (total-1)) - 0.5;
  const angle = baseAngle + t * arc;
  return {
    x: parentSub.position.x + 70 * Math.cos(angle),
    y: parentSub.position.y - 35,
    z: parentSub.position.z + 70 * Math.sin(angle)
  };
}
```

---

## CHANGE 6 — COLLAPSE / EXPAND SYSTEM

State: each parent node has `expanded: boolean` (default: section parents expanded, sub-parents collapsed).

On DOUBLE-CLICK of a node with children: toggle `expanded`.
- When collapsing: tween each child's position → parent.position, scale → 0, label opacity → 0 over 450ms.
- When expanding: reverse — restore to orig position + scale 1.
- Edges connecting to collapsed children fade opacity to 0; visible when expanded.

Visual cue: parent node gets a small CSS2D badge "{N}" showing collapsed child count (positioned at top-right of orb).
- When expanded: badge hidden.
- When collapsed: badge visible, color matches parent.

Click handler distinguishes single vs double click (use 250ms timeout):
```js
let clickTimer = null;
function handleNodeClick(node, isDouble) {
  if (isDouble) {
    if (node.children && node.children.length > 0) toggleExpansion(node);
  } else {
    // single click = nothing for now (hover handles info)
  }
}
canvas.addEventListener('click', e => {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; handleNodeClick(picked, true); }
  else { clickTimer = setTimeout(() => { handleNodeClick(picked, false); clickTimer = null; }, 250); }
});
```

Tween:
```js
function toggleExpansion(node) {
  node.expanded = !node.expanded;
  const startTime = performance.now();
  function tick() {
    const t = Math.min(1, (performance.now() - startTime) / 450);
    const e = 0.5 - 0.5 * Math.cos(Math.PI * t);
    node.children.forEach(child => {
      const tx = node.expanded ? child.origPos.x : node.position.x;
      const ty = node.expanded ? child.origPos.y : node.position.y;
      const tz = node.expanded ? child.origPos.z : node.position.z;
      const ts = node.expanded ? 1 : 0.05;
      child.group.position.lerpVectors(
        node.expanded ? new THREE.Vector3(node.position.x, node.position.y, node.position.z) : child.origPos,
        node.expanded ? child.origPos : new THREE.Vector3(node.position.x, node.position.y, node.position.z),
        e
      );
      child.group.scale.setScalar(node.expanded ? e : 1 - e);
    });
    if (t < 1) requestAnimationFrame(tick);
  }
  tick();
}
```

---

## CHANGE 7 — CLEARER COLOR CODING BY SECTOR

Define explicit color per sector. All children inherit parent color UNLESS overridden by a special type (OPENCLAW = red quarantine, OBLITERATUS = orange gate, CRITICAL tier = orange, MLM_SANDBOX = red).

Final sector colors:
```
USER, USER_INPUT, RESPONSE          #FFFFFF / #E8F4FD  (input/output: white)
ENKI, ENKI_DECIDES                  #00D4FF              (control plane: cyan)
SESSION_INIT + children             #4A9EFF              (init: blue)
PROMPT_HOOKS + children             #94A3B8              (hooks: slate)
NEXUSPULSE + children               #4A9EFF              (cortex: blue)
CLASSIFIER + children               #4A9EFF              (classify: blue)
ADVISORS + children (default)       #9B6EFF              (advisors: violet)
  OPENCLAW exception                #FF5252              (quarantine: red)
  OBLITERATUS exception             #FF6835              (gate: orange)
  CRITICAL tier child               #FF6835              (highest tier: orange)
PULSE_BUS + children                #4A9EFF              (bus: blue)
ROUTING + lane children             #00C896              (routing: emerald)
  Codex lanes (mini/codex/spark)    #9B6EFF              (codex: violet)
  Cloud lanes (kimi)                #4A9EFF              (cloud: blue)
CODEX_GATE + children               #FF6835              (gate: orange)
MEMORY children                     varies per tier      (HOT=#FF6B6B, WARM=#FFB347, COLD=#74B9FF, KERNEL=#94A3B8, MLM=#FF5252)
SERVICES + children (running)       #00C896              (services: emerald)
  Scheduled/idle services           #94A3B8              (slate)
```

Apply consistently to every node. Update fillstyle in legend.

---

## CHANGE 8 — TYPOGRAPHY

Same fonts (Space Grotesk + Inter + Space Mono). But:
- Section labels: 14px Space Grotesk 500 (was 13px), tracking 0.10em
- Sub labels: 11px Space Grotesk 400 (was 10px Inter)
- Leaf labels: 9px Space Mono, tracking 0.05em
- Text shadow on ALL labels: `0 0 8px rgba(0,212,255,0.35)` for legibility on glow

Section label CSS:
```css
.node-label[data-tier="section"] .lbl-id {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 500; font-size: 14px;
  color: #E8F4FD; letter-spacing: 0.10em;
  text-shadow: 0 0 10px rgba(0,212,255,0.4);
}
.node-label[data-tier="section"] .lbl-role {
  font-family: 'Inter', sans-serif;
  font-weight: 400; font-size: 11px;
  color: rgba(168,188,198,0.85);
}
.node-label[data-tier="sub"] .lbl-id {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 400; font-size: 11px;
  color: #C8D8E8; letter-spacing: 0.08em;
}
.node-label[data-tier="sub"] .lbl-role {
  font-family: 'Inter', sans-serif;
  font-weight: 300; font-size: 9px;
  color: rgba(168,188,198,0.6);
}
.node-label[data-tier="leaf"] {
  font-family: 'Space Mono', monospace;
  font-size: 9px;
  color: rgba(200,216,232,0.7);
  letter-spacing: 0.04em;
}
```

---

## CHANGE 9 — HUD / LEGEND UPDATE

Add a small instructional strip top-center:
```
DRAG: rotate  ·  SCROLL: zoom  ·  DOUBLE-CLICK: expand/collapse  ·  HOVER: highlight links
```
10px Inter, color rgba(200,216,232,0.5).

Add legend entry for COLLAPSED parents (small badge).

Update bottom-center counts: "TIER CRITICAL · PROTOCOL-CHANGE · {N} NODES · {M} EDGES · v10"

---

## CHANGE 10 — REDUCED MOTION

prefers-reduced-motion: disable breathing, disable pulse traversal, disable expand/collapse tweens (snap to state instantly).

---

## RULES

- Build ON the existing v9 code. Do not rewrite the file from scratch.
- Keep importmap, scene, controls, raycaster, all working systems.
- Add new nodes/edges; do not remove existing ones.
- Maintain compatibility with HTTP serving (./node_modules/three/...).
- Output: replace yuri-os-dashboard.html. Verify with: `node --check` on inline module body if extractable.
