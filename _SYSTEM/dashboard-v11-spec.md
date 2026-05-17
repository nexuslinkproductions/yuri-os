## CODEX TASK SPEC

Goal: v10 → v11 iterative upgrade. Three coordinated deliverables:

1. /Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html — visual upgrades
2. /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/yuri-graph-state.json — machine-readable graph for AI orchestrators to read
3. /Users/marcelspatz/.claude/skills/visual-introspection/SKILL.md — new skill for visual engineering analysis

Model: gpt-5.5 reasoning xhigh (already default).

Build ON v10 — keep all working systems (importmap, scene, controls, raycaster, animation loop, starfield, nebula, CSS2D labels, hover physics, LOD, expand/collapse). Add/change only what's specified.

---

# PART A — VISUAL UPGRADES

## A.1 LOD threshold adjustment
Change leaf-tier label visibility threshold from 250u to 350u.

```js
if (n.tier === 'leaf') targetOpacity = dist < 350 ? 1.0 : 0.0;
```

## A.2 NUCLEUS ORB SHAPE (replace simple sphere)

Each node becomes a "nucleus" group: core sphere + orbital rings + helix filaments.

```js
function makeNucleusOrb(r, hex, tier) {
  const group = new THREE.Group();

  // 1. Core sphere (smaller than before — orbital rings give the "presence")
  const coreR = r * 0.65;
  const coreGeom = new THREE.SphereGeometry(coreR, 48, 48);
  const coreMat = new THREE.MeshPhysicalMaterial({
    color: hex,
    emissive: hex,
    emissiveIntensity: 0.7,
    metalness: 0.30,
    roughness: 0.35,
    clearcoat: 0.55,
    clearcoatRoughness: 0.30
  });
  group.add(new THREE.Mesh(coreGeom, coreMat));

  // 2. Atmosphere
  const atmGeom = new THREE.SphereGeometry(coreR * 1.25, 32, 32);
  const atmMat = new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: 0.10,
    side: THREE.BackSide, depthWrite: false
  });
  group.add(new THREE.Mesh(atmGeom, atmMat));

  // 3. Orbital rings — 2 rings at perpendicular angles for sections, 1 ring for subs, none for leaves
  const ringCount = tier === 'section' ? 2 : (tier === 'sub' ? 1 : 0);
  for (let i = 0; i < ringCount; i++) {
    const ringR = r * (0.95 + i * 0.18);
    const ringGeom = new THREE.TorusGeometry(ringR, r * 0.025, 16, 96);
    const ringMat = new THREE.MeshBasicMaterial({
      color: hex, transparent: true, opacity: 0.35,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    // Random axis tilt for each ring
    ring.rotation.x = (i === 0 ? Math.PI / 2 : 0) + Math.random() * 0.6 - 0.3;
    ring.rotation.y = i * Math.PI / 3 + Math.random() * 0.4 - 0.2;
    ring.rotation.z = Math.random() * 0.5 - 0.25;
    // Tag for rotation animation
    ring.userData.rotSpeed = {
      x: (Math.random() - 0.5) * 0.0035,
      y: (Math.random() - 0.5) * 0.0035,
      z: (Math.random() - 0.5) * 0.0025
    };
    group.add(ring);
  }

  // 4. Helix filaments (sections only) — two intertwined sine-wave loops
  if (tier === 'section') {
    for (let h = 0; h < 2; h++) {
      const helixPoints = [];
      const turns = 1.8;
      const segs = 80;
      const phaseOffset = h * Math.PI;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const angle = t * turns * Math.PI * 2 + phaseOffset;
        const y = (t - 0.5) * r * 1.8;
        const radiusAtY = r * 1.05 * Math.cos(t * Math.PI);
        helixPoints.push(new THREE.Vector3(
          Math.cos(angle) * radiusAtY,
          y,
          Math.sin(angle) * radiusAtY
        ));
      }
      const helixGeom = new THREE.BufferGeometry().setFromPoints(helixPoints);
      const helixMat = new THREE.LineBasicMaterial({
        color: hex, transparent: true, opacity: 0.40
      });
      const helixLine = new THREE.Line(helixGeom, helixMat);
      helixLine.userData.rotSpeed = { y: 0.002 + h * 0.001 };
      group.add(helixLine);
    }
  }

  return group;
}
```

In the animate loop, rotate ring + helix children of each node:
```js
nodes.forEach(n => {
  n.group.children.forEach(child => {
    if (child.userData.rotSpeed) {
      if (child.userData.rotSpeed.x) child.rotation.x += child.userData.rotSpeed.x;
      if (child.userData.rotSpeed.y) child.rotation.y += child.userData.rotSpeed.y;
      if (child.userData.rotSpeed.z) child.rotation.z += child.userData.rotSpeed.z;
    }
  });
});
```

Result: each section orb has a core, atmosphere, 2 orbital rings tilted asymmetrically, and 2 intertwined helix filaments. Sub-nodes have 1 ring. Leaves are plain spheres.

## A.3 CHAKRA-ROOT PIPELINE (main spine connections)

Replace the single bezier tube on main flow edges (section→section spine) with a 3-filament chakra root.

```js
function makeChakraRootEdge(startPos, endPos, colorMain, colorAccent) {
  const group = new THREE.Group();

  // Compute control points for the central bezier
  const cp1 = new THREE.Vector3(startPos.x, startPos.y + (endPos.y - startPos.y) * 0.42, startPos.z);
  const cp2 = new THREE.Vector3(endPos.x, endPos.y - (endPos.y - startPos.y) * 0.42, endPos.z);
  const center = new THREE.CubicBezierCurve3(startPos, cp1, cp2, endPos);

  // 1. Main central filament — thicker tube, bright
  const mainGeom = new THREE.TubeGeometry(center, 80, 1.4, 8, false);
  const mainMat = new THREE.MeshBasicMaterial({
    color: colorMain, transparent: true, opacity: 0.75
  });
  group.add(new THREE.Mesh(mainGeom, mainMat));

  // 2. Two satellite filaments offset on perpendicular axis, twisting around the main
  const twistDistance = 6; // offset radius
  const twistTurns = 1.0;
  for (let i = 0; i < 2; i++) {
    const phase = i * Math.PI;
    const points = [];
    for (let s = 0; s <= 80; s++) {
      const t = s / 80;
      const centerPoint = center.getPoint(t);
      const tangent = center.getTangent(t).normalize();
      // Perpendicular vector in xz plane
      const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const angle = t * twistTurns * Math.PI * 2 + phase;
      points.push(new THREE.Vector3(
        centerPoint.x + perp.x * twistDistance * Math.cos(angle),
        centerPoint.y + Math.sin(angle) * twistDistance * 0.3,
        centerPoint.z + perp.z * twistDistance * Math.cos(angle)
      ));
    }
    const tcurve = new THREE.CatmullRomCurve3(points);
    const tgeom = new THREE.TubeGeometry(tcurve, 80, 0.4, 6, false);
    const tmat = new THREE.MeshBasicMaterial({
      color: colorAccent, transparent: true, opacity: 0.55
    });
    group.add(new THREE.Mesh(tgeom, tmat));
  }

  return { group, curve: center };
}
```

Use chakra-root for `type === 'flow'` edges between sections. Other edge types (branch, data, advises, gates, memory) remain simple tubes.

Color pairs:
- USER→USER_INPUT through ENKI_DECIDES: colorMain=#00D4FF, colorAccent=#4A9EFF
- ENKI_DECIDES→ROUTING and onward: colorMain=#00D4FF, colorAccent=#9B6EFF

## A.4 CLOSED-LOOP RETURN EDGES

Add explicit "return" edges that close the cycle from RESPONSE back to USER:

```js
{ source: 'RESPONSE', target: 'USER', type: 'return' }
```

Type "return": stroke #00D4FF, sw=0.6, opacity=0.35, dashed animated, drawn as an ARC on the OUTSIDE of the spiral (curving outward through positive z) so it doesn't overlap the main column.

Implementation: special bezier with control points pushed far in +z:
```js
const cp1 = new THREE.Vector3(start.x + 600, start.y - 200, 0);
const cp2 = new THREE.Vector3(end.x + 600, end.y + 200, 0);
```

This creates a wide arc visible from FRONT view that loops the cycle.

Add similar return edges for closed loops:
- PULSE_BUS → ENKI_DECIDES (already exists as data)
- ENKI_DECIDES → ENKI (return — completes the cortex cycle), type 'return'
- MEMORY → ENKI (return — memory available next turn), type 'return'

## A.5 RICH INFO PANEL ON CLICK (replaces hover-only)

On SINGLE-CLICK (not double-click which is expand/collapse): show a rich info panel anchored to clicked node.

Panel structure (DOM element appended to body):
```html
<div class="info-panel">
  <button class="info-panel__close">×</button>
  <div class="info-panel__header">
    <div class="info-panel__id" style="color: {nodeColor}">{nodeId}</div>
    <div class="info-panel__role">{nodeRole}</div>
  </div>
  <div class="info-panel__purpose">{nodePurpose}</div>

  <div class="info-panel__section">
    <div class="info-panel__heading">FILES</div>
    <div class="info-panel__list">
      {file paths, code-styled}
    </div>
  </div>

  <div class="info-panel__section">
    <div class="info-panel__heading">CAPABILITIES</div>
    <div class="info-panel__list">
      {bullet list}
    </div>
  </div>

  <div class="info-panel__section">
    <div class="info-panel__heading">DEPENDENCIES</div>
    <div class="info-panel__list">
      {bullet list}
    </div>
  </div>

  <div class="info-panel__section">
    <div class="info-panel__heading">OUTPUTS → </div>
    {list of target node IDs with type badges}
  </div>

  <div class="info-panel__section">
    <div class="info-panel__heading">RECEIVES FROM ← </div>
    {list of source node IDs with type badges}
  </div>

  <div class="info-panel__section">
    <div class="info-panel__heading">RETURNS TO ↑ </div>
    {target node id (closed loop)}
  </div>

  <div class="info-panel__section">
    <div class="info-panel__heading">NOTES</div>
    <div class="info-panel__notes">{free-text engineering notes}</div>
  </div>
</div>
```

Styling:
- position: fixed; right: 24px; top: 80px; bottom: 80px;
- width: 380px;
- background: linear-gradient(180deg, rgba(11,31,62,0.96), rgba(7,15,38,0.96));
- backdrop-filter: blur(20px);
- border: 1px solid rgba(0,212,255,0.25);
- border-left: 3px solid {nodeColor};
- clip-path: polygon(0 0, 100% 0, 100% calc(100% - 24px), calc(100% - 16px) 100%, 0 100%);
- padding: 24px 20px;
- overflow-y: auto;
- font-family: Inter for body, Space Grotesk for headings, Space Mono for files

Click outside panel or × button closes it.

## A.6 PERFORMANCE NOTE

With nucleus orbs adding ~5 child meshes per section node and chakra-root edges adding 3 tubes per main edge, the scene has ~300+ meshes. Use frustum culling (default on) and consider InstancedMesh for stars (already Points).

---

# PART B — RICH NODE METADATA

Every node in the dashboard must have full metadata structured uniformly. Add a metadata object alongside or merged into each node definition:

```js
const NODE_META = {
  ENKI: {
    purpose: "Main session control plane — final authority over all actions. Synthesizes advisor findings, dispatches Codex, vetoes unsafe operations.",
    files: ["_SYSTEM/Scripts/pulse-orchestrator.mjs", "CLAUDE.md", "SOUL.md"],
    capabilities: [
      "Read advisor findings from pulse-bus",
      "Dispatch Codex via pulse-codex-runner",
      "Synthesize multi-advisor consensus",
      "Veto any advisor output (advisor authority cap)"
    ],
    dependencies: ["pulse-plan.json", "pulse-bus.json", "SOUL.md", "claude-protocol-guard.js"],
    state_files: [".claude/state/pulse-plan.json", ".claude/state/pulse-bus.json"],
    notes: "Authority is unrestricted but bounded by hard guardrails: bash-security-guard.js, claude-protocol-gate, native function gates (HERMES/ARGUS always-on, OBLITERATUS conditional)."
  },
  // ... for every node
};
```

Define metadata for ALL nodes (sections, subs, leaves). For nodes lacking specific data, infer from name and role.

Specific high-value nodes that need accurate metadata:

- ENKI, ENKI_DECIDES, NEXUSPULSE, CLASSIFIER, PULSE_BUS, ADVISORS, MEMORY, ROUTING, CODEX_GATE, RESPONSE — all sections
- DEEPSEEK_A, OPENCLAW_A, HERMES_A, CASSANDRA_A, SWARM_A, OBLITERATUS_A — 6 advisors with files, runtime kind, authority bounds
- MEM_HOT, MEM_WARM, MEM_COLD, MEM_KERNEL, MLM_SANDBOX — memory tier purposes
- All routing lanes with model names and capabilities

Sources for accurate metadata:
- CLAUDE.md
- _SYSTEM/yuri-origin.md
- _SYSTEM/Scripts/offload-contract.mjs (lane definitions)
- _SYSTEM/Scripts/pulse-orchestrator.mjs (advisor definitions)
- _SYSTEM/SELF-IMPROVEMENT/* (taxonomy)

## B.1 METADATA EXPORT — `_SYSTEM/yuri-graph-state.json`

Generate a machine-readable graph state file alongside the dashboard. This is the canonical source the AI orchestrators read.

Structure:
```json
{
  "version": "v11",
  "generated_at": "ISO-8601 timestamp",
  "commit": "381f9876",
  "sectors": [
    {
      "name": "control_plane",
      "color": "#00D4FF",
      "nodes": ["ENKI", "ENKI_DECIDES"]
    },
    {
      "name": "initialization",
      "color": "#4A9EFF",
      "nodes": ["SESSION_INIT", "SOUL_INJECT", "PALACE", "MNEMOSYNE", "TOKEN_INIT", "SOUL_FILE", "YURI_COG", "PALACE_IDX"]
    },
    // ... all sectors
  ],
  "nodes": [
    {
      "id": "ENKI",
      "tier": "section",
      "label": "ENKI",
      "role": "main session",
      "color": "#00D4FF",
      "position": { "x": 0, "y": 880, "z": 0 },
      "sector": "control_plane",
      "metadata": { ...full NODE_META entry... },
      "parent": null,
      "children": ["ENKI_PLAN", "ENKI_BUS", "ENKI_CTX"]
    },
    // ... every node
  ],
  "edges": [
    {
      "source": "ENKI",
      "target": "SESSION_INIT",
      "type": "flow",
      "is_return": false
    },
    // ... every edge including closed-loop returns
  ],
  "telemetry": {
    "total_nodes": N,
    "total_edges": M,
    "section_count": 14,
    "sub_count": ...,
    "leaf_count": ...,
    "closed_loops": ["RESPONSE→USER", "ENKI_DECIDES→ENKI", "MEMORY→ENKI"]
  }
}
```

This file MUST be written every time the dashboard is regenerated. Single source of truth for both visual rendering AND machine analysis.

In the dashboard HTML, load this JSON at top of script:
```js
const GRAPH_STATE = /* embedded JSON or fetched via fetch('./_SYSTEM/yuri-graph-state.json') */;
```

The dashboard renders from GRAPH_STATE so changes to the JSON automatically update the visualization.

---

# PART C — VISUAL INTROSPECTION SKILL

Create new skill: `/Users/marcelspatz/.claude/skills/visual-introspection/SKILL.md`

This skill enables AI orchestrators (ENKI, Codex, advisors) to read the graph state and perform engineering analysis.

SKILL.md content:

```markdown
---
name: visual-introspection
description: Engineering visual analysis of the Yuri OS architecture graph. Reads _SYSTEM/yuri-graph-state.json and reports structural insights, optimization opportunities, dead-ends, missing returns, duplicate functionality, and merge candidates. Use when reviewing system architecture, planning refactors, or assessing graph health.
triggers:
  - "/introspect"
  - "visual introspection"
  - "graph analysis"
  - "review yuri architecture"
---

# Visual Introspection — Yuri OS Engineering Analysis

You are operating in visual-introspection mode. Read the Yuri OS architecture graph state and perform structured engineering analysis the same way a senior architect would by looking at a system diagram.

## Inputs

Always start by reading:
1. `_SYSTEM/yuri-graph-state.json` — canonical graph state (nodes, edges, sectors, metadata)
2. `yuri-os-dashboard.html` (optional — visual reference)

## Analysis Pipeline

### Phase 1 — Structural Audit

For each node in the graph, check:
- **Closed loops**: does the node have a path that eventually returns its output to ENKI / RESPONSE / USER?
- **Dead ends**: nodes with no `outputs_to` and no `returns_to` → flag as potential gaps
- **Orphans**: nodes with no incoming edges → flag as unused
- **Cycles**: detect cycles that aren't intentional (the prompt-response cycle is intentional; others may not be)

Report:
```
DEAD_ENDS: [list of node IDs with no return path]
ORPHANS: [list of node IDs with no incoming edges]
INTENTIONAL_CYCLES: [list of expected cycles]
UNEXPECTED_CYCLES: [list of cycles that may indicate bugs]
```

### Phase 2 — Functional Similarity / Merge Candidates

Identify nodes with overlapping purposes:
- Compare node `metadata.purpose` strings for semantic similarity
- Compare `metadata.capabilities` lists for overlap
- Compare `metadata.files` for shared sources
- Flag nodes that share >40% capability overlap as potential merges

Report:
```
MERGE_CANDIDATES: [
  { nodes: ["A", "B"], reason: "Both handle X. Capabilities overlap on Y, Z." }
]
```

### Phase 3 — Sector Coherence

For each sector:
- Are all member nodes thematically consistent?
- Are there nodes that semantically belong to another sector?
- Are there missing nodes (functionality referenced in metadata but no node)?

Report:
```
SECTOR_CONCERNS: [
  { sector: "advisors", concern: "OBLITERATUS_A serves a gate role, may belong to gates sector" }
]
```

### Phase 4 — Connection Quality

For each edge:
- Is the `type` accurate (flow vs data vs advises vs gates vs memory)?
- Are there missing edges (nodes that semantically should connect but don't)?
- Are there redundant edges (same source/target same type)?

Report:
```
MISSING_EDGES: [{ source: X, target: Y, expected_type: Z, rationale: "..." }]
REDUNDANT_EDGES: [...]
TYPE_MISMATCHES: [...]
```

### Phase 5 — Optimization Recommendations

Synthesize all findings into a ranked list of architectural improvements:
- High: dead-ends without return paths (incomplete cycles)
- High: orphan nodes (dead code)
- Medium: merge candidates (consolidate similar nodes)
- Medium: sector miscategorization
- Low: type mismatches on edges
- Low: missing optional edges

For each recommendation, include:
- Concrete action ("Add edge X→Y of type data")
- Estimated impact (low/medium/high)
- Risk (low/medium/high)
- Affected files

### Phase 6 — Final Report

Output a structured markdown report:

```markdown
# Yuri OS Graph Introspection — {timestamp}

## Summary
- Total nodes: N
- Total edges: M
- Dead-ends found: K
- Merge candidates: J
- Optimization recommendations: L

## Critical Findings
{ordered list of high-impact issues}

## Recommendations
{ordered action list}

## Sector Health
{per-sector summary}
```

## Rules

- Read ONLY from graph state and metadata. Do not invent connections.
- All claims must reference specific node IDs from the graph.
- Use the metadata in graph state, not external knowledge about Yuri.
- If metadata is missing for a node, report it as `INCOMPLETE_METADATA` rather than guessing.
- Output must be evidence-backed and actionable.

## Output

Default: terminal-printable markdown report.
Optional: write to `_SYSTEM/SELF-IMPROVEMENT/graph-introspection-{date}.md` for archival.

## When to Use

- Architecture review sessions
- Pre-refactor planning
- Detecting code drift between graph state and reality
- Engineering retros (what merged? what split? what disappeared?)
- After major commits that change system topology
```

Also create a commands alias: `/Users/marcelspatz/.claude/commands/introspect.md` invoking this skill.

---

# PART D — UPDATE LEGEND + HUD

- Add legend entry for "return" edge type (dashed cyan thin)
- Update bottom counts: "TIER CRITICAL · PROTOCOL-CHANGE · {N} NODES · {M} EDGES · {K} CLOSED LOOPS · v11"
- Add small indicator near top-right: "GRAPH STATE: yuri-graph-state.json" with a small icon

---

# PART E — OUTPUTS

3 files modified or created:

1. `/Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html` — v11 visual updates
2. `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/yuri-graph-state.json` — NEW machine-readable graph
3. `/Users/marcelspatz/.claude/skills/visual-introspection/SKILL.md` — NEW skill
4. `/Users/marcelspatz/.claude/commands/introspect.md` — NEW slash command alias

The dashboard MUST source its nodes/edges/metadata from a single source of truth. Recommended: embed the JSON inline in the dashboard as a `const GRAPH_STATE = {...}` AND write it to the standalone JSON file. Or load the JSON file via fetch() at runtime (works since we serve over HTTP).

---

# RULES

- Build on v10. Keep working systems.
- Make changes minimal and additive where possible.
- All metadata must be evidence-backed (cite files).
- The graph-state JSON is the canonical source.
- Skill file enables future AI introspection — make it executable in the agent context.
