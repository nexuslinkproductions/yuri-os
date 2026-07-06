---
name: proj-agentic-digital-company-2026-06-22
description: "NEXT MAJOR BUILD (Marcel 2026-06-22): a Sakana.ai-modeled ~20-role self-governable agentic 'digital company' on the live opus-fleet/runSwarm foundation — research-first, then blueprint, then end-to-end arming build"
metadata: 
  node_type: memory
  type: project
  tier: binding
  scope: global
  trig: 
    - agentic company
    - digital company
    - sakana
    - role roster
    - fleet-roles
    - specialized roles
    - agent org
    - runSwarm roles
  refs: 
    - proj-glm-fleet-substrate-2026-06-22
    - feedback-fleet-parallelism-breadth-depth
    - feedback-glm-lanes-full-peers
    - feedback-opus-orchestrates-sonnet-haiku-agents
    - proj-language-consolidation-priorities
  originSessionId: 204ff7df-f0b6-49d3-9d27-c26c2bacfbf1
---

GOAL: build a fully-operational AI agentic "digital company" — a LARGE role roster (target ~20, matching a high-capacity small AI lab, NOT just a few) of **self-governable, self-goal-setting, capability-based** agent roles, on the live opus-fleet/runSwarm foundation. Roles = functional ARCHETYPES derived from a real lab's PUBLIC org/methods/people-roles (NOT impersonating individuals — extract the role/capability structure, the ethical + reusable framing). Model on **Sakana.ai** (small Tokyo lab operating at high capacity). Cross-reference YURI's MATH LAYER (formulas, quantum-sim/order-effects, energy/computeU, trading/decision-sim/edge-audit) INTO the agents' self-governance + decision-making. Build as a large codebase/program with full **red/grey/green tests**, concise language choice (per [[proj-language-consolidation-priorities]]). Improve the opus-fleet skill + agentic system ALONG THE WAY (stay vigilant for process improvements). "Step it up a notch" → state-of-the-art agentic/automated framework that turns Marcel's inputs into high-class output.

WHO: Marcel (owner). Built via opus-fleet — authorized fan-out: up to a dozen Sonnet + a dozen Haiku + close GLM-lane (glm-5.2 peer) cooperation. The largest fan-out sanctioned yet.

WHEN: 2026-06-22. This is "the next major self-building end-to-end ARMING build" (arming stays owner-gated per [[feedback-self-governance-charter]]).

APPROACH (RESEARCH-FIRST → blueprint → present → build+arm):
- ONLINE Sakana deep-dive (a LARGE research team — "dissect everything publicly documented, go really deep"): methods/papers (AI Scientist v1/v2, evolutionary model merging, Transformer²/self-adaptive, AB-MCTS inference-time, AI CUDA Engineer, nature/collective-intelligence); company (founding, funding/valuation, NVIDIA + govt partnerships, strategy, products); PEOPLE (founders David Ha / Llion Jones / Ren Ito + research team + engineers — public roles, backgrounds, specialties, LinkedIns); org structure / culture / operating model (how a ~20-head lab runs at high capacity).
- ONLINE AI-org prior art: ChatDev, MetaGPT (software-company-as-agents), generative agents, agent-org frameworks — org-as-agents patterns to adopt.
- LOCAL cross-ref: the math layer (formulas/quantum/energy/trading), existing `.claude/agents` legacy roster (~12 NISABA-House defs, deepseek-pinned, dormant), `runSwarm` + the `fleet-roles.json` seam (the unbuilt unified cross-substrate role registry).
- Findings → `02_RESOURCES/RESEARCH/sakana-blueprint-2026-06-22/` (cited) + `ai reindex` (research-capture mandate).

NAMING: do NOT ship "AI YURI AGENTIC DIGITAL COMPANY" — find a cooler name. Candidates (Sakana = 魚 fish / school-of-fish = David Ha's collective-intelligence ethos): **MURE** (群れ = swarm/school, Japanese, resonates), SHOAL, MURMURATION. Owner to pick.

STATE: **SHIPPED + pushed 2026-06-22 (commit 99278964), DISARMED.** Built end-to-end via opus-fleet (6 parallel research lanes → synthesis → spine → red/grey/green → dual red-team). Name = **MURE** (群れ, working default; swap to SHOAL/MURMURATION via the `name` field in fleet-roles.json — owner pick still open).
- ROSTER: `_SYSTEM/config/fleet-roles.json` — 20 roles, 6 groups (orchestration 3 / research 5 / engineering 5 / verification 3 / knowledge 2 / operations 2). Each = {archetype, capabilities, substrate+lane, autonomyClass, mathHooks, goalScope, independentOf}. Legacy 12 `.claude/agents` mapped (kept on disk; fleet-roles.json now canonical).
- PROGRAM: `_SYSTEM/mure/{role-registry,governance,goal-engine,math-bridge,company,mure}.mjs` (JS, ESM — concise: must import the all-JS fleet substrate + math layer directly). governance = the 6-gate charter (deterministic, fail-safe to owner-gated, self-protecting); goal-engine = PROPOSE→SCORE(5-dim,≥0.75)→GATE→hard-caps; math-bridge = REAL cross-ref (decision-sim robustScore/minimaxRegret, quantum orderEffect non-commutativity, energy isProtectedPath/salience/isCatastrophic veto, prediction Brier) — GLM-5.2-verified NOT decorative; company = casts task→roles→runSwarm leaves (GLM) + native Agent specs (Opus); mure.mjs = CLI (`--roster|--validate|--demo|--status`).
- TESTS: 5 suites, 72/72 (exhaustive 2^6 governance mutation-survivor sweep, quantum order-effect hand-calc oracle, order-invariance, monotonicity, substrate/conservation invariants). 6 caps registered (capability-scan now scans `_SYSTEM/mure`). README + standalone mure-blueprint.html + cited research corpus 00-06 in `02_RESOURCES/RESEARCH/sakana-blueprint-2026-06-22/`.
- RED-TEAM: dual (GLM-5.2 final gate FIX-FIRST→fixed→re-verify SHIP + native Sonnet). 8 findings → regression tests: gate-self-protection, opts.armed self-arm bypass, finalize teeth, malformed-blast, case-insensitive+backslash path, truthy-coercion, arm-coupling, empty-subtask.

ARM GATE (owner-gated, NOT armed): MURE is DISARMED by default — it PLANS + governs + (when armed) dispatches the GLM substrate. Self-goal-setting + autonomous dispatch are BUILT but dormant. Arm via env `YURI_MURE_ARMED=1` OR `touch _SYSTEM/state/mure.enabled` (gitignored; `rm` to disarm). Arming requires the owner flag — a caller's `opts.armed:true` alone CANNOT self-arm (verified). Finalize (commit/push) stays Opus/owner.

DECISIONS (Marcel, 2026-06-22/23): name = **MURE** (kept, no rename). **ARMED** (`_SYSTEM/state/mure.enabled` touched) + dogfooding one live self-assessment task (synthesist+adjudicator→glm-max, runSwarm swarm-mqprct16, in flight). opus-fleet SKILL.md updated: roles-seam section → MURE (built), published mirror.

**ACTIVE NEXT BUILD — WORK-LEDGER + REALTIME COMPANY DASHBOARD (owner-directed 2026-06-23):** Marcel wants a real SQLite relational store + a realtime "company overview" dashboard funneling ALL agentic work product (the auto-funnel he asked for — "organise all created work"; binding constraint = AUTO, no manual filing). CAPABILITY-FIRST grounding done: YURI already has filing-system (filing-assessor/mutator/autonomy/canonical-bridge), artifact-registry (config/artifact-registry.json + .mjs, typed catalog), canonical store, search corpus (FTS5) — the GAP is a unified run+output FUNNEL/ledger (capability-recall returned noise = confirmed missing). BUILD PLAN: (a) **DB** `better-sqlite3 ^12.10.0` (ALREADY a dep, no install) at `_SYSTEM/OS_KERNEL/work-ledger.db` (gitignore it like the other OS_KERNEL .db's); relational schema runs × artifacts × role_outputs × links. (b) **work-ledger.mjs** store + ingest (auto-capture from `.claude/jobs/*/manifest.json` + filing-assessor + output-dir sweep) + query API. (c) **realtime dashboard** — mirror `_SYSTEM/Scripts/alpha-factor-library/observatory/observatory-server.mjs` (HTTP server serving DB→JSON + HTML company-overview, polling for realtime). It is MURE's `archivist` role's backing organ.

**WORK-LEDGER + DASHBOARD SHIPPED + RECONCILED (2026-06-23):** `_SYSTEM/Scripts/work-ledger.mjs` (better-sqlite3, `_SYSTEM/OS_KERNEL/work-ledger.db` gitignored, runs×artifacts×role_outputs×activity×links, auto-ingest from .claude/jobs manifests + output sweep, `overview()` = dashboard contract) + `work-dashboard.mjs` (zero-dep HTTP server :4270, serves HTML + `/api/overview` w/ throttled re-ingest = realtime; launch.json `mure-dashboard`). **Dashboard UI designed by GLM-5.2** (`_SYSTEM/mure/dashboard.html`, 54KB, owner directive "let glm design the interface" — KPIs + roster board + runs timeline + work-products funnel + insights, dark/light, zero ext deps, no hud/kagami tokens) — rendered live + screenshot-verified on :4270 (preview tool). **RECONCILED with a parallel glm-4.7 session** that built overlapping MURE work (owner chose "wait then reconcile"): KEPT their `dispatchNative` (company.mjs native-substrate seam — the gap the dogfood found) + `blast-analyzer.mjs` (Steward blast-radius tool — was 8/23 red, I salvaged to 23/23 green via reason-based tier floors) + `capability-scanner.mjs` (additive); DEDUP'd their duplicate `_SYSTEM/mure/work-ledger.mjs`+`work-ledger-server.mjs` (mine canonical, dashboard-contract-locked) + removed 19 scratch probes (owner-authorized). MURE suite now **95/95 green**. Residual risk: `dispatchNative` routes native lanes via lane-dispatch (sonnet/haiku may not be llm-lanes → native = Agent-tool only; errors-graceful, DISARMED-safe, UNVERIFIED live). SEE [[proj-glm-fleet-substrate-2026-06-22]] (the foundation).
