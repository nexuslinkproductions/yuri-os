## CODEX TASK SPEC — V13

Goal: v12 → v13 iterative upgrade. 7 coordinated changes.

Driver: /design-master + /visual-introspection findings on v12. Build on v12. Keep all working systems.

Deliverables (update in place):
1. `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/yuri-graph-state.json`
2. `/Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html`

Lead designer: codex gpt-5.5 reasoning xhigh.

---

# PART A — VISUAL CALIBRATION

## A.1 LOD threshold raised 350 → 500

```js
if (n.tier === 'sub')  targetOpacity = dist < 800 ? 1.0 : 0.0;   // was 600
if (n.tier === 'leaf') targetOpacity = dist < 500 ? 1.0 : 0.0;   // was 350
```

## A.2 Camera limits expanded

```js
controls.minDistance = 200;     // unchanged
controls.maxDistance = 8000;    // was 4000 — allow much further zoom-out
```

## A.3 Vertical compression — reduce y-spread by ~20%

The current y range is 1300 → -1780 (3080u). Compress to 1100 → -1500 (2600u). Recompute all stage Y positions proportionally. New layout below.

## A.4 Helix symmetry — true top-down spiral

17 section nodes need full 2π revolution. Use twist increment of `2π / 17 ≈ 0.3696 rad` per stage so the viewed-from-top spiral covers a full revolution evenly.

```js
const TWIST_STEP = (2 * Math.PI) / 17;  // 0.3696 rad
// Each stage twist = stageIndex * TWIST_STEP
```

This guarantees nodes are evenly distributed around the y axis — no front-weighted clustering.

Sub-nodes within a stage: keep current orbital pattern (radius 220, arc π*0.85), but ROTATE the entire sub-cluster by the stage's twist. So when viewed from top, sub-nodes also follow the spiral.

---

# PART B — MEMORY RELOCATION (architectural fix)

## B.1 Move MEMORY to early lifecycle

Current: MEMORY at y=-1400 (15th of 17 stages — near end).
Problem: Memory should be read FIRST (palace inject, soul inject, mnemosyne seed are all memory reads at session start), then enriched throughout. Memory is foundational, not terminal.

New stage order (top→bottom):

```js
const STAGES = [
  { id: 'USER',         y:  1100, idx: 0 },
  { id: 'USER_INPUT',   y:   930, idx: 1 },
  { id: 'ENKI',         y:   760, idx: 2 },
  { id: 'MEMORY',       y:   620, idx: 3 },   // NEW POSITION — right after ENKI, before SESSION_INIT
  { id: 'SESSION_INIT', y:   470, idx: 4 },
  { id: 'PROMPT_HOOKS', y:   300, idx: 5 },
  { id: 'NEXUSPULSE',   y:   130, idx: 6 },
  { id: 'CLASSIFIER',   y:   -40, idx: 7 },
  { id: 'ADVISORS',     y:  -210, idx: 8 },
  { id: 'PULSE_BUS',    y:  -380, idx: 9 },
  { id: 'ENKI_DECIDES', y:  -540, idx: 10 },
  { id: 'ROUTING',      y:  -700, idx: 11 },
  { id: 'CODEX_GATE',   y:  -860, idx: 12 },
  { id: 'GITNEXUS',     y: -1020, idx: 13 },
  { id: 'SELF_IMPROVE', y: -1180, idx: 14 },
  { id: 'SERVICES',     y: -1340, idx: 15 },
  { id: 'RESPONSE',     y: -1500, idx: 16 }
];
// twist for each = idx * TWIST_STEP
```

## B.2 Add memory-read edges to ALL major sections

Memory should feed into every operational section. Add these incoming edges to MEMORY's outputs:

```
MEMORY → SESSION_INIT     type=memory   (palace + soul context inject)
MEMORY → PROMPT_HOOKS     type=memory   (protocol rules from prevention-rules.md)
MEMORY → NEXUSPULSE       type=memory   (prior pulse-plans, archive)
MEMORY → CLASSIFIER       type=memory   (classifier-tuning.md, soak calibration)
MEMORY → ADVISORS         type=memory   (each advisor reads prior findings)
MEMORY → ENKI_DECIDES     type=memory   (consensus history)
MEMORY → ROUTING          type=memory   (lane health stats, last route plans)
MEMORY → CODEX_GATE       type=memory   (prior codex diffs, .approved history)
MEMORY → GITNEXUS         type=memory   (last impact analyses, change patterns)
MEMORY → SELF_IMPROVE     type=memory   (EOT outputs, pulse-archive)
```

Per-advisor memory edges (each advisor reads its own historical findings):
```
MEMORY → DEEPSEEK_A    type=memory
MEMORY → OPENCLAW_A    type=memory
MEMORY → HERMES_A      type=memory
MEMORY → CASSANDRA_A   type=memory
MEMORY → SWARM_A       type=memory
MEMORY → OBLITERATUS_A type=memory
```

## B.3 Update MEMORY metadata

```json
{
  "id": "MEMORY",
  "metadata": {
    "purpose": "Foundational tiered knowledge substrate read FIRST in every turn and updated throughout. Hot/warm/cold tiers + SQLite kernel + MLM sandbox. Every operational section reads from memory before acting.",
    "lifecycle_position": "early",
    "access_pattern": "global — read by all sections, written by EOT/services/archive",
    "files": ["_SYSTEM/OS_KERNEL/memory.db", ".claude/state/pulse-plan.json", ".claude/state/pulse-bus.json", "_SYSTEM/SELF-IMPROVEMENT/pulse-archive/", "system-overlays/karpathy-llm-wiki/"]
  }
}
```

---

# PART C — ENKI COMMAND REGISTRY

## C.1 New sub-cluster under ENKI: command registry

Add a new branch group under ENKI representing the slash-command surface.

New nodes:
```
ENKI_COMMANDS (sub, r=20, color=#00D4FF)
  purpose: "Slash command registry — 50 active commands grouped by domain"

Children of ENKI_COMMANDS (leaves, r=8):
  CMD_GITNEXUS_FAMILY  — group label, 8 commands: gitnexus, gitnexus-cli, gitnexus-guide, gitnexus-exploring, gitnexus-debugging, gitnexus-pr-review, gitnexus-impact-analysis, gitnexus-refactoring
  CMD_DEEPSEEK_FAMILY  — group label, 4 commands: deepseek-offload, deepseek-workhorse, ds-flash, ds-pro
  CMD_DESIGN_FAMILY    — group label, 3 commands: design-master, design-source-pack, frontend-design
  CMD_SPEC_FAMILY      — group label, 4 commands: spec-intake, spec-clarify, spec-analyze, spec-promote
  CMD_PROBABILITY      — group label, 3 commands: probabilistic-decision-core, probability, pdc
  CMD_EOT              — group label, 2 commands: eot, end-of-transmission
  CMD_OFFLOAD          — group label, 2 commands: offload, ai-pipeline-offloading
  CMD_SOLO             — 24 standalone commands (bg, codebase-to-course, compact-optimizer, constitution, execution-domain-core, failure-evolution-loop, gpt-oss-local-runtime, graphify, introspect, kimi-k2-6-server-adapter, local-subagent, math-curve-loaders, non-destructive-infinity-guard, openai-codex-workflow, openclaw-offload, parallel-clone-orchestrator, pattern-mirror-core, reflect, research, research-artifact-factory, sharingan, swarm-coordination, tokenmaxxing, anthropic-managed-agents)
```

## C.2 Duplicate flags

Each group node carries metadata:
```json
{
  "command_count": N,
  "duplicates_flagged": ["cmd1", "cmd2"],
  "merge_proposal": "Suggested unified command + flags",
  "current_size": "8 separate /commands files",
  "ideal_size": "1 /gitnexus with subcommands"
}
```

## C.3 Edge

```
ENKI → ENKI_COMMANDS  type=branch
ENKI_COMMANDS → ENKI  type=return
```

Each CMD_*_FAMILY leaf has `branch` from ENKI_COMMANDS and `return` to ENKI_COMMANDS.

---

# PART D — UPGRADES POPUP FEATURE

## D.1 New HUD element: UPGRADES button

Fixed top-right area, below soak ring:
```
[⚡ UPGRADES (3)]
```
The number in parens = count of pending architectural insights.

## D.2 Upgrade insights data structure

Embed in graph state:
```json
{
  "upgrades_pending": [
    {
      "id": "memory-early-lifecycle",
      "title": "Memory now early in lifecycle",
      "status": "applied-v13",
      "description": "Moved MEMORY from y=-1400 to y=620. Added 16 new memory-read edges to all major sections + advisors.",
      "introspected_by": "visual-introspection v1",
      "severity": "high",
      "affected_nodes": ["MEMORY", "SESSION_INIT", "PROMPT_HOOKS", "NEXUSPULSE", "CLASSIFIER", "ADVISORS", "ENKI_DECIDES", "ROUTING", "CODEX_GATE", "GITNEXUS", "SELF_IMPROVE", "DEEPSEEK_A", "OPENCLAW_A", "HERMES_A", "CASSANDRA_A", "SWARM_A", "OBLITERATUS_A"]
    },
    {
      "id": "command-duplicates-gitnexus",
      "title": "Consolidate 8 gitnexus commands → 1",
      "status": "pending",
      "description": "Currently 8 separate /commands files: gitnexus, gitnexus-cli, gitnexus-guide, gitnexus-exploring, gitnexus-debugging, gitnexus-pr-review, gitnexus-impact-analysis, gitnexus-refactoring. Propose: single /gitnexus <subcommand> dispatcher.",
      "severity": "medium",
      "affected_files": [".claude/commands/gitnexus*.md"]
    },
    {
      "id": "command-duplicates-deepseek",
      "title": "Consolidate 4 deepseek commands → 2",
      "status": "pending",
      "description": "/deepseek-offload, /deepseek-workhorse, /ds-flash, /ds-pro overlap. Propose: keep /ds-flash and /ds-pro as direct lane calls; deprecate -offload and -workhorse (route via /offload).",
      "severity": "low"
    },
    {
      "id": "command-duplicates-probability",
      "title": "Consolidate 3 probability commands → 1",
      "status": "pending",
      "description": "/probabilistic-decision-core, /probability, /pdc are aliases. Pick one canonical.",
      "severity": "low"
    },
    {
      "id": "command-duplicates-eot",
      "title": "Merge /eot and /end-of-transmission",
      "status": "pending",
      "description": "Both point to the same skill. /eot is the short alias — make /end-of-transmission a synonym only.",
      "severity": "low"
    },
    {
      "id": "command-duplicates-design",
      "title": "Audit design command overlap",
      "status": "pending",
      "description": "/design-master, /design-source-pack, /frontend-design — different scopes but overlapping. Consider unified /design with --mode flag.",
      "severity": "low"
    },
    {
      "id": "enki-density",
      "title": "ENKI has 30 incoming edges — high choke risk",
      "status": "monitoring",
      "description": "ENKI is the control plane convergence point. Consider whether some incoming returns (e.g. service feedback) could go to a separate state-aggregator node before ENKI.",
      "severity": "medium"
    },
    {
      "id": "command-spec-family",
      "title": "Spec family — consider single /spec dispatcher",
      "status": "pending",
      "description": "/spec-intake, /spec-clarify, /spec-analyze, /spec-promote — 4 sequential pipeline stages. Could be /spec <stage> with --next flag.",
      "severity": "low"
    }
  ]
}
```

## D.3 Popup UI

When UPGRADES button clicked, slide-in panel from top-right (similar to info panel):
- Width: 420px
- Position: top: 80px; right: 24px;
- List each upgrade with severity color dot, title (Space Grotesk 14px), status badge, description
- Click an upgrade item → highlight its `affected_nodes` in the 3D scene (set hovered=node for each, brighten)
- Click "Apply" button → marks status as applied (writes to graph state — future feature stub for now)

Severity colors:
- high: #FF5252
- medium: #FFB347
- low: #74B9FF
- applied: #00C896
- monitoring: #9B6EFF

## D.4 Add to legend at bottom

```
─── MEMORY-READ  (light cyan, MEMORY→target)
─── RETURN       (existing)
```

---

# PART E — EDGE DIRECTION COLOR CODING

User feedback: hard to tell direction. Add tint variation by direction.

When rendering edges, in addition to type-based color:
- All edges fade from source color (60% opacity at source) to target color (100% opacity at target) using GradientMaterial or vertex colors
- This creates a clear visual "flow direction" — the edge brightens toward the target

If gradient is too expensive: use a simpler approach — arrowhead at target end (small triangle cone mesh of edge color, placed at 90% along the curve, oriented along tangent).

For RETURN edges specifically: arrowhead is rendered in a contrasting peach `#FF8855` so returns visually pop.

For MEMORY-READ edges: dashed light cyan `#A8DCFF` with arrowhead at target.

---

# PART F — INFO PANEL: COMMANDS TAB ON ENKI

When ENKI is clicked, the info panel gets an extra section:

```
COMMANDS (50 total)
├ GITNEXUS family (8) — ⚠ merge candidate
├ DEEPSEEK family (4)
├ DESIGN family (3)
├ SPEC family (4)
├ PROBABILITY family (3) — ⚠ alias bloat
├ EOT family (2) — ⚠ direct duplicate
├ OFFLOAD family (2)
└ STANDALONE (24)
```

Each family clickable → expands to list its commands.

---

# PART G — VERIFICATION

After implementation, regenerate `_SYSTEM/yuri-graph-state.json` AND embedded `GRAPH_STATE`. Run:

```bash
node /tmp/yuri-introspect.mjs
```

Expected:
- DEAD_ENDS: 0 (preserved from v12)
- CLOSED_LOOPS: ≥12
- MEMORY incoming edges: ≥10 (was 5)
- MEMORY outgoing edges to operational sections: 16
- Total nodes: ~120 (was 109)
- Total edges: ~240 (was 217)

---

# RULES

- Incremental upgrade — do not rewrite, augment.
- Preserve v12 closed-loop integrity (0 dead-ends).
- Keep Three.js setup, importmap, scene structure, OrbitControls, post-processing.
- Synchronize JSON file + embedded GRAPH_STATE const in HTML.
- Visual changes (LOD, maxDistance, twist, y-compression) are constants — easy to find and update.
- Update legend with MEMORY-READ entry.
- Test reachability still holds: all paths trace to USER/RESPONSE.
