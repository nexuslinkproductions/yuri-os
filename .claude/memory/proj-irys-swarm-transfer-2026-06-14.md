---
name: proj-irys-swarm-transfer-2026-06-14
description: "irys-stateful-swarms → YURI nano-swarm transfer RAID (mine THEIR code for OUR orchestration mechanisms) — 4-lane convergence, transfer spec written, Move 1 build pending owner go"
metadata: 
  node_type: memory
  type: project
  tier: normal
  scope: nano-swarm-orchestration
  trig: "irys, stateful swarms, nano swarm orchestration, convergence gate, debt sensors, custody taxonomy, swarm upgrade, blackboard"
  refs: 
    - proj-irys-prs-2026-06-13
    - feedback-multilane-peer-swarms
    - proj-canonical-memory-store-2026-06-14
    - feedback-all-dispatch-through-llm-compat
  originSessionId: af089d53-fa43-4be8-9bbd-b4497e1013e9
---

GOAL: mine dl1683/irys-stateful-swarms (their Python blackboard control-system doc-analysis swarm — 17.75% Harvey LAB @ $1.30/task on Gemini Flash that scores 0% elsewhere; "performance from architecture not model") for mechanisms to upgrade YURI nano-swarm orchestration/direction/convergence/verification. Distinct from [[proj-irys-prs-2026-06-13]] (that = OUR PRs INTO their repo; this = mining THEIR code for US).

WHO: Marcel-requested deep synthesis 2026-06-14; 4 co-equal cross-family peer lanes via llm-compat — Claude/Opus (read source) + Mimo + DeepSeek + Nemotron-3-Ultra. ALL FOUR independently ranked the same #1.

WHERE: clone /tmp/irys-ss (shallow, ephemeral). Spec docs: 02_RESOURCES/RESEARCH/irys-swarm-transfer-2026-06-14/ (00-MASTER-BRIEF, 01-CLAUDE-SYNTHESIS, 02-CROSS-LANE-SYNTHESIS).

STATE: transfer SPEC complete, NOTHING built/mutated in YURI (owner-gated). Top transfers (4-lane convergent): (1) 3-layer convergence gate [convergence.py:check_convergence = deterministic structural floor + critical-signal block + adversarial "find why it's NOT done" w/ gap-reinjection] — our single biggest orchestration gap (loop-until-dry is a bare K-empty counter); (2) damping (cooldowns/rejected-memory/marginal-value/signal-expiry); (3) deterministic quality gate on lane OUTPUT [worker_dispatch.py:passes_quality_gate] — contract-conformance checks label format not content. KEY REFRAME (DeepSeek): take the GATE not the CONTROLLER — their orchestrator-as-LLM-prompt is a DOWNGRADE vs Claude native Workflow/Agent agency; wrap our fan-out in gate+damping+quality-filter, don't rebuild orchestrator. Tier2: operational-vs-advisory gap blocking, task-local EPHEMERAL typed blackboard (distinct from durable canonical store, avoid dual-truth), debt-sensor organ (deterministic-first DISARMED), custody-break 12-type taxonomy→zenkai (+ Nemotron's YURI-native types: build-process-failure/integration-contract-violation/lane-divergence/semantic-drift/verification-gap). BREAKS: no coverage denominator in open-ended work (reify obligation-ledger as hypothesis); don't import their uncalibrated confidence numbers (their own §11b); inverted tier-economics (our peers co-equal, no cheap→expensive gradient); object-permanence/entity-resolution unsolved-even-for-them (park Phase2). Verified YURI wiring targets exist: yuri-workcell.mjs, lane-kernel.mjs, lane-arbitration.mjs, kagami-swarm-supervisor.mjs, contract-conformance.mjs, memory-canonical-store.mjs (Mimo's "autonomy-runner.mjs" does NOT exist).

NEXT (owner-gated): MOVE 1 = build `swarm-convergence.mjs` + damping (3-layer gate + cooldowns/rejected-memory/marginal-value), wire into yuri-workcell.mjs loop OR lane-kernel.mjs per-round termination; feature-flagged, additive, HIGH-reversible. MOVE 2 = deterministic quality gate extending contract-conformance.mjs (content floor per lane-type). MOVE 3 (zero-risk parallel) = custody taxonomy into zenkai. FAILURE_ANALYSIS.md (2.4MB, 38 sections, "synthesis is the bottleneck" H1) = standalone zenkai mine, not yet harvested.

SEE: [[proj-irys-prs-2026-06-13]] · [[feedback-multilane-peer-swarms]] · [[proj-canonical-memory-store-2026-06-14]] (the canonical store is the durable-memory half; this is the orchestration-loop half)
