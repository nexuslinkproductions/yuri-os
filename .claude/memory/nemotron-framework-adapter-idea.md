---
name: nemotron-framework-adapter-idea
description: "Marcel's idea (2026-06-05): a NEMOTRON.md adapter mirroring the YURI spine (persona+cognitive+memories+brain-inject) to fight Nemotron hallucination/false-claims. Decoded take: build the thin adapter, but the VERIFIER is what kills false claims, not the brain transplant."
metadata: 
  node_type: memory
  type: project
  tier: working
  scope: main
  trig: 
    - nemotron
    - adapter
    - hallucination
    - false claims
    - external lane
    - brain inject
    - reasoning lane
  refs: 
    - "[[nemotron-3-ultra-lane-live]]"
    - "[[feedback-two-track-rule]]"
    - "[[feedback-prose-not-outrun-wiring]]"
    - "[[bash-guard-role-matcher-lexical-bypass]]"
    - "[[completeness-cert-needs-total-counts]]"
  originSessionId: 2448e5f4-5e5f-4625-bfa9-db81dc67ab4c
---

GOAL: a `NEMOTRON.md` (AGENTS.md-style) adapter giving the live Nemotron-3-Ultra NIM lane the YURI spine so it operates BY the framework — Marcel's hypothesis: reduces hallucination + false claims. WHEN: idea 2026-06-05. WHERE: would slot into the yuri-origin authority-hierarchy adapter row (CLAUDE.md/AGENTS.md/GEMINI.md/.codex/*); partly scaffolded by the Nemotron-3-Ultra eval + external reasoning-lane dispatch guide (commit dd0b8afa).

DECODED TAKE (mechanism-first, not validation):
- The instinct is right but the named mechanism is wrong. What actually kills false claims is the VERIFICATION HARNESS (evidence-contract grammar TERM_COUNT/MATCH, energy gate, advisory_only-until-local-evidence) — and it is already MODEL-AGNOSTIC (treats Claude/Codex/Nemotron output as advisory until verified). The brain transplant does NOT make output true; the gate that checks it does.
- The adapter's REAL value = makes Nemotron output CHECKABLE: forces the evidence grammar + authority hierarchy + protected paths so its claims arrive in a shape the verifier can parse and gate. Win is "hallucinations that can't hide from the gate," not "fewer hallucinations."
- MEMORIES: give Track A (canonical, designed to be shared across all lanes), NOT Track B (Claude behavioral self-development — sharing it violates the two-track contract [[feedback-two-track-rule]] + dilutes).
- BRAIN-INJECT is for live continuous lanes (volatile session state: gate/lane-health/cortex-tier). A Nemotron dispatch is usually a bounded packet, not a PTY session → static adapter + Track-A handle access is the right loadout, not full brain-inject, unless Nemotron runs as a standing lane.

THE TRAP (same severity-laundering pattern caught all session): dressing a model in full persona + YURI grammar makes its hallucinations MORE confident/on-voice/fluent → HARDER to catch. A hallucination wearing the evidence-contract format games the parser. So the adapter must NEVER couple voice/format to trust — Nemotron stays advisory_only regardless of fluency (yuri-origin already mandates this).

PREPARED (2026-06-05): full actionable spec at `02_RESOURCES/RESEARCH/nemotron-framework-adapter-spec-2026-06-05.md` — 3-layer adapter (discipline preamble / Track-A grounding / advisory+live-code backstop), a ready-to-paste dispatch preamble, the cross-model-triangulation moat, and a 3-step build roadmap. KEY FINDING from grounding: half already exists (the dispatch guide's 5 scaffolds = YURI evidence-grammar exported; the NIM output-rail already tags responses ADVISORY_HYPOTHESIS_ONLY), and the A/B PROVED it kills symbol-hallucination. The real unfinished lever = TOOL-GROUNDING (give Nemotron grep/read) — prompting cannot fix its fabricated file:line; only tool access can.

BUILT + TESTED LIVE (2026-06-05): `_SYSTEM/Scripts/nemotron-dispatch.mjs` + test + `ai nemotron` facade — built by Codex, verified + finalized by Claude (single-sourced via lane-kernel = PC-1 dogfood). Live dispatch to nvidia/nemotron-3-ultra-550b-a55b WORKED end-to-end (advisory framing + falsifier-extract + sidecar). **CORRECTION to the earlier "tool-grounding is the unfinished lever" claim:** it is MOSTLY ALREADY PRESENT — `offload-runner.mjs` exposes `--tools` and in the live test Nemotron autonomously read the actual files (named `roleSignal`, a same-session function never in its prompt). So the upgrade is just: wire `--tools` through the wrapper + BOUND the tool-loop (the open-ended run collapsed / hit the tool-repetition limit once — retry fresh, tighter task). Output stays advisory regardless. Wired into the circuitry as LANE_NEMOTRON (routing_lanes). Could promote to a Track-A canonical decision once shaped.

SEE: [[nemotron-3-ultra-lane-live]] · external reasoning-lane dispatch guide (commit dd0b8afa)
