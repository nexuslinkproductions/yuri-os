---
name: originator-convergence-all-surfaces-as-nodes
description: "Standing convergence directive (Marcel 2026-06-08) — EVERY execution surface (native Claude Workflow/Agent spawns, Codex lanes, DeepSeek, local Gemma) becomes a uniform Originator-governed node plugged into the same id-bridge graph + navigate + telemetry. Lanes/processes are a first-class node type. Plus the SDK-billing constraint."
metadata: 
  node_type: memory
  type: project
  tier: high
  scope: nexus
  trig: "originator, convergence, lane, work-substrate, gemma, telemetry, openprocess, navigate, id-bridge, billing"
  refs: 
    - cross-surface-comparability-cracked
    - claude-remote-control-not-cowork
  originSessionId: 4ed73ec6-6154-40e8-99d5-61bd201923eb
---

GOAL: the NEXUS endpoint — "everything we do can be plugged into yuri." All execution surfaces converge into
ONE uniform Originator-governed substrate: native Claude Workflow/Agent spawns, Codex-spawned lanes, DeepSeek,
and local Gemma 4 12B QAT — all run through `yuri-originator.mjs` (decode/xref/compile_state/energy_gate/
create_work_substrate/candidate_actions/launch_substrate/worker_exoskeleton/telemetry), emit the same
`YURI_LANE_TELEMETRY`, and plug into the same id-bridge graph walked by the same `yuri-navigate`.

WHO: Marcel (directive); lanes = Claude (native), Codex (gpt-5.5), DeepSeek, Gemma (local, via Ollama/llm-compat).

STATE / EVIDENCE: Gemma 4 12B QAT, run THROUGH the Originator tool loop, "does incredible work" (Marcel) — it
requested xref_query/read_file/grep/list_dir in real substrate runs and produced an executable `proposedState`
that compiled + passed the energy gate (Codex commit 79916418, verified: 3 tests green, smuggling guard real).
The gap is no longer "Gemma can't use tools" — it's telemetry UX, budget control, evidence precision, and
turning advisory lane work into deterministic YURI-native contracts.

DESIGN FOLD (binding on the id-bridge + navigate build): the unified node schema is NOT code/doc/memory-only.
Lane / process / work-substrate is a FIRST-CLASS, extensible, LANE-AGNOSTIC node type (UI-agnostic across Codex,
Claude Code, Claude Desktop, OpenClaw, Hermes, Gemma, DeepSeek). navigate's centrality API must serve the
OpenProcess Sum Pool (OpenMass = hazard-decay + dependency-centrality + unfinished-risk + operator-value +
closure-evidence) and discoveryPrecisionGate (graph.impact_centrality) regardless of which lane ran the process.

CONSTRAINT (billing — RESOLVED 2026-06-08, confirmed vs Anthropic docs): native in-session Workflow/Agent
spawns draw from the Pro/Max SUBSCRIPTION pool, NOT the separate Agent SDK credit pool. The June-15-2026 change
is real + active but ONLY meters the surfaces YURI already forbids: `claude -p`/`--print`, Agent SDK headless,
Claude Code GitHub Actions, third-party SDK apps (those get a per-user $20/$100/$200-mo credit pool, then API
rates). So `FB:no-p-claude` is now ALSO the billing-correct rule: keep every Originator spawn native-in-session
and it stays on subscription. Fan-out / ultracode stays on. Source: support.claude.com Pro/Max + Agent-SDK-credit
articles ("all activity in both tools counts against the same usage limits"). Never route Originator work through
headless/SDK — that would both break launch-shape AND hit the separate meter.

NEXT: build yuri-id-bridge + yuri-navigate with lane/process node type baked in (full-prerequisite-closure, no
wire-later); then the OpenProcess pool + discoveryPrecisionGate ride on navigate. SEE [[cross-surface-comparability-cracked]].
