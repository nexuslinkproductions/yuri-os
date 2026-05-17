# Yuri Council Audit - 2026-05-11

## Verdict

Yuri is past the document-only phase. It has working runtime substrate, route planning, local model policy, RAG health, sandbox verification, control-plane tests, token ledger tests, and artifact audit tests. The root test suite passes.

Yuri is not yet clean-operational. The current workspace cannot build, the live memory governor health check fails against the active SQLite schema, GitNexus CLI access is broken, the skill registry has drift, and the Yuri session launchd service is not installed in the user domain.

Readiness rating: 2.5 / 5.

Current standing:

- Runtime substrate: partially operational.
- Workflow hygiene: weak because the worktree has 139 dirty/untracked/deleted entries.
- Jake Van Clief / ICM progression: structurally strong, behavior-change proof weak.
- Business-output readiness: useful planning and draft lanes exist; external/action lanes are correctly gated.

Biggest blocker: the build is broken because `tsconfig.json` and `tsconfig.node.json` are deleted in the current worktree. A system that passes targeted tests but cannot build is not promotion-ready.

Biggest leverage point: collapse every path into one canonical lifecycle:

```text
intent -> route -> artifact -> verification -> memory -> promotion
```

Right now Yuri has several strong pieces, but too many local lifecycles: offload routing, sandbox, learning capture, control-plane planning, design/site-builder packets, trading audit packets, RAG ingest, and memory governance. The optimisation target is not adding more surfaces. It is making one lifecycle unavoidable.

## Evidence Ledger

All commands were rerun from `/Users/marcelspatz/YURI-OS-MUSUBI` on 2026-05-11 local time unless noted.

| Command | Result | Evidence | What it proves |
| --- | --- | --- | --- |
| `npm test` | PASS | Exit 0. Reported passing modules: `offload-contract-regression`, `yuri-control-plane-schema`, `codex-offload-runner`, `yuri-sandbox-loop`, `yuri-artifact-audit`, `yuri-council-claim-evidence`, `yuri-canonical-memory-import`, `memory_governor_test.py`, `token-ledger`, `ollama-adapter`, `ollama-promotion-readiness`, `ollama-kv-config`, `yuri-local-model-policy`, `backend-cors-hardening`, `control-plane-plan-routes`, `yuri-session-launchd`, `yuri-session-runtime`. | The scripted regression suite is coherent and currently passes. |
| `npm run build` | FAIL | `tsc` printed generic help and exited 1. `git status --short` shows deleted `tsconfig.json` and deleted `tsconfig.node.json`. | Root app is not buildable in the current worktree. |
| `python3 _SYSTEM/OS_KERNEL/memory_governor.py health` | FAIL | `sqlite3.OperationalError: foreign key mismatch - "swarm_messages" referencing "agents"`. | The live memory DB/schema path is unhealthy even though memory governor unit tests pass. |
| `node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate --json` | FAIL | Summary: `ok=37`, `drift=2`, `missing=0`, `unregistered=0`. Drift: `local-subagent`, `tokenmaxxing`. | Skill registry integrity is mostly good but not clean. |
| `node _SYSTEM/Scripts/wiki-rag-health.mjs` | PASS | `ok=true`, launchd label `com.nudimmud.wiki-rag`, `pid=54424`, index `sources=16`, `chunks=22`, `embedded=22`. | Yuri Wiki RAG control plane is alive and indexed. |
| `node _SYSTEM/Scripts/offload-contract.mjs route-plan "comprehensive council audit on yuri progression jake van clief goal workflow optimisation"` | PASS | Route: `lane=swarm`, `scenario=high-stakes-review`, `entrypoint=./_SYSTEM/Scripts/ai auto`, quality gate `main-session`. | The routing contract classifies this audit correctly as high-stakes review. |
| `node _SYSTEM/Scripts/yuri-local-model-benchmark.mjs --dry-run` | PASS | Ollama `0.23.2`; policy maps utility to `qwen3.5:4b`, primary to `qwen2.5:7b`, code to `qwen2.5-coder:7b`. | Local model policy exists and dry-run planning is functional. |
| `node _SYSTEM/Scripts/ollama-kv-config.mjs status` | PASS | Server `ok=true`, URL `http://127.0.0.1:11434`, status `200`, latency `133ms`; launchctl profile includes `OLLAMA_NO_CLOUD=1`. | Local Ollama runtime is up and configured for local-first operation. |
| `ollama list` | PASS | Models include `qwen2.5-coder:7b`, `gemma4:latest`, `qwen3.5:4b`, `deepseek-r1:8b`, `starcoder2`, `llama3.2`, `nomic-embed-text`, `deepseek-v2:16b`, `qwen2.5:7b`. | Local model substrate is materially present, not aspirational. |
| `node _SYSTEM/Scripts/yuri-session-launchd.mjs status` | FAIL | `Could not find service "com.nudimmud.yuri-session-runtime" in domain for user gui: 501`. | Session runtime launchd service is not installed/running, despite unit tests passing. |
| `npx gitnexus --help` | FAIL | `Cannot destructure property 'package' of 'node.target' as it is null.` | GitNexus CLI is not currently usable from this workspace. |
| `git status --short` | FAIL hygiene | Current branch `main`; 139 dirty/untracked/deleted entries. | Current state is difficult to promote, audit, or reason about safely. |
| `sqlite3 _SYSTEM/OS_KERNEL/memory.db ... counts` | PASS read | `agents=10`, `tasks=50`, `memories=93`, `memory_items=909`, `promoted_lessons=0`, `session_lesson_candidates=0`, `token_ledger=31089`, `projects=0`, `tickets=0`, `telemetry_sessions=0`. | Memory and token telemetry exist, but lesson promotion and operational project/ticket surfaces are empty. |

## Runtime Audit

### Routing and offload

Status: PARTIAL PASS.

The shared contract in `_SYSTEM/Scripts/offload-contract.mjs` is the strongest operational module in the current evidence set. It gives the audit a deterministic route: `swarm`, `high-stakes-review`, `main-session` quality gate, with local truth required. That matches the stated operator protocol.

Observed strength:

- High-stakes audit classification works.
- Advisory outputs are bounded by local truth and output caps.
- Native gates are named and linked to risk, memory, and adversarial review concepts.

Observed weakness:

- Route planning is strong, but not every lane is equally proven live.
- The working tree contains many lane and rule changes, making it hard to know which runtime behavior is canonical.

Council read: routing is no longer theory. The next improvement is to make route execution and artifact promotion prove themselves through the same lifecycle every time.

### Sandbox loop

Status: PASS, with upgrade path.

`npm test` passes `yuri-sandbox-loop`. Prior evidence from `_SYSTEM/sandbox-improvement-test-run.md` records a live run that wrote artifact-only output, verified repo status, kept raw model output non-canonical, and captured only sanitized learning summaries.

Observed strength:

- The sandbox pattern is aligned with memory-poisoning controls.
- It already distinguishes raw output from canonical state.
- It already writes reports and verification artifacts.

Observed weakness:

- It is not yet the universal execution wrapper.
- Promotion is not producing durable promoted lessons in the live DB.

Next runtime move: make sandbox artifact verification the required path before any autonomous promotion or memory write.

### Memory DB and governor

Status: FAIL for live health, PASS for schema richness.

The live DB is populated and broad: `memory_items=909`, `token_ledger=31089`, `tasks=50`, `agents=10`. That proves Yuri has real state surfaces.

The live governor health command fails on:

```text
sqlite3.OperationalError: foreign key mismatch - "swarm_messages" referencing "agents"
```

This is a serious gap because `_SYSTEM/OS_KERNEL/memory.db` is defined as the source of truth by repo policy. If the health command cannot open and validate that DB cleanly, no memory promotion claim should be treated as operationally clean.

Most important contradiction:

- `python3 _SYSTEM/OS_KERNEL/memory_governor_test.py` passes inside `npm test`.
- `python3 _SYSTEM/OS_KERNEL/memory_governor.py health` fails against live state.

Council read: the test suite proves logic in isolation; it does not prove live DB health. Add a live-schema health test or a safe fixture that reproduces the live foreign-key topology.

### GitNexus

Status: FAIL.

The repo rules require GitNexus impact and detect-change workflows for code edits. The CLI command `npx gitnexus --help` fails before help output. That makes the declared safety layer unreliable in the current environment.

Risk:

- Any future symbol edit has a process requirement that the local tool cannot currently satisfy.
- The index may still exist at `.gitnexus/`, but CLI usability is broken.

Council read: fix GitNexus before using Yuri for broad refactors, architecture changes, or safety-sensitive edits.

### Local models and Ollama

Status: PASS.

Ollama is live, configured, and model inventory is real. The policy has a reasonable split:

- utility: `qwen3.5:4b`
- primary: `qwen2.5:7b`
- code: `qwen2.5-coder:7b`
- deep reasoning substrate available: `deepseek-r1:8b`, `deepseek-v2:16b`
- embeddings available: `nomic-embed-text`

Council read: local-first execution is credible. The bottleneck is no longer model availability; it is disciplined routing, verification, and promotion.

### RAG and wiki control plane

Status: PASS.

`node _SYSTEM/Scripts/wiki-rag-health.mjs` reports launchd alive, index present, and 22 embedded chunks in notebook `Yuri Wiki Control Plane`.

Council read: RAG is not the weak point. It should be treated as a retrieval module behind the canonical lifecycle, not as another special-purpose path.

### Session runtime launchd

Status: MIXED.

Tests pass for session launchd/runtime, but live status fails because `com.nudimmud.yuri-session-runtime` is not installed/running in the GUI domain.

Council read: implementation-level tests exist, but operational installation is incomplete. That should be tracked as an environment readiness gate, not buried inside test success.

## Workflow Audit

### Worktree hygiene

Status: FAIL.

`git status --short` reports 139 entries across modified, deleted, and untracked files. This includes:

- protocol/routing files
- Claude agent and hook files
- skill registry files
- backend services and routes
- trading-bot scripts
- design assistant and design studio services
- self-improvement files
- deleted root TypeScript configs

Risk:

- No single reviewer can infer canonical state from this tree quickly.
- Build failure may be caused by an intentional transition or accidental deletion.
- Promotion risk is high because unrelated changes are interleaved.

Required workflow improvement:

1. Partition the dirty tree by lane: runtime, memory, design, trading, protocol, frontend/build.
2. Create a review ledger for each lane.
3. Restore or intentionally replace deleted root build configs before any release claim.

### Build/test gap

Status: FAIL for build, PASS for tests.

The test suite is meaningful and broad, but it does not catch root build breakage. The build fails immediately because `tsc` has no root project config. This creates a false confidence trap.

Recommendation:

- Add a `test:build-config` or include `npm run build` in the promotion gate once the config is restored.
- Keep targeted tests, but do not treat them as release readiness.

### Skill drift

Status: FAIL hygiene.

The skill loader validated 39 skills:

- 37 OK
- 2 drift
- 0 missing
- 0 unregistered

Drifted skills:

- `.claude/skills/local-subagent/SKILL.md`
- `.claude/skills/tokenmaxxing/SKILL.md`

Recommendation:

- Decide whether disk or manifest is canonical.
- Update `_SYSTEM/skill-hash-registry.json` only after reviewing the drift content.
- Treat skill drift as a release blocker for agent behavior because these skills affect routing and token efficiency.

### Duplicate and scattered rule surfaces

Status: PARTIAL FAIL.

Evidence:

- `OPERATOR_PROTOCOL.md` is canonical by policy.
- `AGENTS.md`, `CLAUDE.md`, `.claude/skills/*`, `.gemini/skills/*`, `.cursorrules`, `.windsurfrules`, and `.cursor/rules/sync.mdc` are sync surfaces by instruction.
- Multiple active changes touch rule, skill, scout, and model files.

Risk:

- Yuri behavior changes can drift by IDE.
- A fix in Codex may not translate to Claude, Cursor, Gemini, or OpenClaw.

Recommendation:

- Keep `OPERATOR_PROTOCOL.md` as the authority.
- Make `_SYSTEM/Scripts/offload-contract.mjs` the executable source for routing.
- Generate or verify adapter rule files from those two sources, instead of hand-maintaining equivalent doctrine in many files.

### Control-plane maturity

Status: PASS for planning, gated for live execution.

`headlessControlPlaneService` and `control-plane-plan-routes` pass through the root test suite. Evidence from source inventory shows active services and routes for:

- `backend/src/services/headlessControlPlaneService.ts`
- `backend/src/services/executiveIntegrationService.ts`
- `backend/src/services/smartRouter.ts`
- `backend/src/routes/designAssistantRoutes.ts`
- `backend/src/routes/designStudioRoutes.ts`
- `backend/src/routes/siteBuilderRoutes.ts`

Council read: the control plane is becoming the right abstraction. Keep it headless, evidence-attached, and action-gated.

## Jake / ICM Audit

### Current structure

Status: STRONG STRUCTURAL ALIGNMENT.

The self-improvement layer explicitly encodes the Jake Van Clief / ICM principle that file structure is cognitive architecture. Evidence:

- `_SYSTEM/SELF-IMPROVEMENT/00_VESSEL/icm-methodology.md` defines file structure as memory and architecture.
- `_SYSTEM/SELF-IMPROVEMENT/README.md` defines the loop: `VESSEL -> RHYTHM -> EXTRACT -> GAZE -> VESSEL`.
- `_SYSTEM/SELF-IMPROVEMENT/START_HERE.md` defines the read order and the rule that every lesson must become a prevention rule, routing rule, or experiment.

The current folder map is coherent:

- `00_VESSEL`: identity, principles, decision posture
- `01_RHYTHM`: rituals, weekly comp, sprint flow
- `02_EXTRACT`: failures, lessons, experiments, prevention rules, cross-reference taxonomy
- `03_GAZE`: metrics, goals, capability roadmaps, this audit

Council read: the architecture is good enough to shape behavior if enforced.

### RAW -> PROCESSED -> SYNTHESIZED mapping

Current mapping:

- RAW: `02_EXTRACT/failure-log.md`, experiments, raw lessons archive
- PROCESSED: `00_VESSEL`, `01_RHYTHM`, `02_EXTRACT/cross-reference-taxonomy.md`, `02_EXTRACT/prevention-rules.md`
- SYNTHESIZED: `_SYSTEM/OS_KERNEL/memory.db`, `03_GAZE`, weekly comp outputs

Observed gap:

- `memory_items=909` proves memory capture exists.
- `promoted_lessons=0` and `session_lesson_candidates=0` prove the live promotion loop is not currently generating durable lesson promotion records.

This is the central Jake/ICM gap. The file architecture is strong, but behavior-change proof is weak. ICM only compounds when lessons become changed behavior. Right now, the DB evidence says the promotion channel is empty.

Recommendation:

- Treat every repeated failure as one of: prevention rule, routing rule, or experiment.
- Use `_SYSTEM/Scripts/self-improvement/weekly-comp.mjs` as the ritualized promotion path.
- Make `promoted_lessons > 0` and non-empty reviewed lesson candidates a concrete metric in `03_GAZE`.

### Jake progression standing

Standing: structurally ahead, execution proof behind.

What is working:

- The conceptual model is explicit.
- Folder architecture is intentionally ordered.
- Cross-domain taxonomy and prevention-rule surfaces exist.
- The operator protocol already values evidence, local truth, and rule promotion.

What needs work:

- Live promotion counters are empty.
- The dirty worktree prevents clean version-history learning.
- Many lessons appear as simultaneous file changes, not reviewed transformations.

Next progression move:

Run a weekly comp that turns this audit into exactly three durable outputs:

1. One prevention rule for build/test promotion.
2. One routing rule for live DB health checks.
3. One experiment for unified lifecycle enforcement.

## Business Output Audit

Classification key:

- LIVE: command/service is currently usable by evidence.
- GATED: module exists but deliberately blocks external/live action.
- DRAFT-ONLY: produces plans, packets, or drafts only.
- DOCS-ONLY: concept exists mainly as documentation or route metadata.
- BROKEN: command/path fails in current environment.

| Surface | Status | Evidence | Council read |
| --- | --- | --- | --- |
| Operator routing / Oracle core | GATED/LIVE planning | `offload-contract` route-plan passes; headless control-plane tests pass. | Strongest control surface. Keep as top-level interface. |
| Local model lane | LIVE | Ollama server ok; model inventory present; local model dry-run policy passes. | Ready for bounded utility, code, summarization, and route planning. |
| Wiki/RAG | LIVE | `wiki-rag-health` ok with launchd pid, 16 sources, 22 chunks. | Usable retrieval substrate. Needs lifecycle integration, not more standalone logic. |
| Growth audit | DRAFT-ONLY | `smartRouter` maps growth to `draft_only`; source inventory includes site builder and design assistant services/routes/tests. | Good for SEO/ad/design audit drafts. Do not auto-mutate sites or ad budgets. |
| Site builder | DRAFT-ONLY/GATED | `siteBuilderService.ts`, `siteBuilderRoutes.ts`, and tests exist. DB tables include site builder sessions/intents/packets. | Useful packet generator. Needs promotion gate before writes. |
| Design assistant/studio | DRAFT-ONLY/GATED | Design assistant/studio services/routes/tests exist; DB tables include design studio projects/artifacts/selections/intents/packets/runs. | Strong candidate for business-facing workflow, but currently artifact/intent oriented. |
| Browser research | GATED | `browserAutomation.ts` exists; executive integration lane is `capture_only`; browser plugin exists. | Correctly evidence-first. Avoid credential or policy-bypass automation. |
| Inbox/comms | DOCS-ONLY/GATED | Executive integration lane exists with `confirm_before_send`; no dedicated inbox route surfaced in current service inventory. | Keep as planned lane until connector and confirmation flow are proven. |
| Trading | GATED | Trading scripts and tests exist; router maps market risk to `simulation_only`; live execution and custodial key management are blocked. | Good discipline. Keep paper/simulation gates until kill switch, audit export, and risk logs are proven live end-to-end. |
| Media/render | GATED | Executive lane maps media to `render_only`; headless guardrails say hyperframes renderer disabled/deferred. | Useful plan lane, not yet live render pipeline. |
| Session runtime | BROKEN operational install | Tests pass, but launchd status cannot find `com.nudimmud.yuri-session-runtime`. | Implementation exists; operator daemon is absent. |
| GitNexus safety layer | BROKEN CLI | `npx gitnexus --help` fails. | Do not rely on GitNexus workflow until CLI/MCP health is restored. |

## Optimisation Backlog

### P0 - Promotion blockers

1. Restore build readiness.
   - Fix or intentionally replace deleted `tsconfig.json` and `tsconfig.node.json`.
   - Acceptance: `npm run build` exits 0.
   - Workflow gain: converts the repo from test-pass-only to buildable.

2. Fix live memory governor health.
   - Resolve `swarm_messages` foreign-key mismatch against `agents`.
   - Acceptance: `python3 _SYSTEM/OS_KERNEL/memory_governor.py health` exits 0 against live `_SYSTEM/OS_KERNEL/memory.db`.
   - Workflow gain: makes canonical memory trustworthy again.

3. Restore GitNexus usability.
   - Fix local CLI failure or document an alternative MCP path that passes health.
   - Acceptance: `npx gitnexus status` or equivalent context/impact tool returns usable repo state.
   - Workflow gain: restores required impact-analysis guardrail before edits.

4. Partition the dirty worktree.
   - Produce lane-specific review sets: build, memory, routing, skills, design, trading, backend, research.
   - Acceptance: each set has owner, status, validation command, and promote/drop decision.
   - Workflow gain: prevents unrelated changes from blocking each other.

### P1 - Lifecycle consolidation

1. Define the canonical lifecycle module.
   - Interface: given an intent, produce route, artifact packet, verification result, memory summary, and promotion decision.
   - Existing modules to align: offload contract, sandbox loop, session improvement, artifact audit, control-plane planning.
   - Workflow gain: one mental model for all Yuri work.

2. Add a live-readiness gate.
   - Include build, memory health, skill validation, RAG health, Ollama status, GitNexus status, and session launchd status.
   - Workflow gain: one command answers "is Yuri operational today?"

3. Close the ICM promotion loop.
   - Ensure weekly comp creates reviewed lesson candidates and promoted lessons.
   - Acceptance: live DB no longer reports `promoted_lessons=0` after reviewed promotion.
   - Workflow gain: Jake progression becomes measurable behavior change.

4. Reconcile skill drift.
   - Review `local-subagent` and `tokenmaxxing`.
   - Update manifest only if disk changes are intended.
   - Workflow gain: removes hidden agent behavior drift.

### P2 - Business workflow deepening

1. Promote growth/design/site-builder into one business artifact lane.
   - Keep drafts and packets as outputs.
   - Require evidence attachments before recommendations.
   - Workflow gain: turns scattered design/growth tools into one client-output workflow.

2. Promote trading into a separate simulation-only control lane.
   - Keep live execution impossible until explicit owner gate, kill switch, and audit export all pass.
   - Workflow gain: preserves high-value research without capital-risk creep.

3. Make browser research a capture adapter, not a reasoning lane.
   - Browser captures evidence; Oracle/control plane reasons over captured artifacts.
   - Workflow gain: cleaner separation of capture and decision.

4. Add status dashboards from real DB counts.
   - Use `projects`, `tickets`, `telemetry_sessions`, `promoted_lessons`, and `session_lesson_candidates`.
   - Workflow gain: exposes when surfaces are empty or decorative.

## Integration Plan

### Target module shape

The desired deep module is a Yuri lifecycle controller. Its interface should be smaller than the current spread of scripts:

```text
plan(intent) -> route packet
execute(route packet) -> artifact bundle
verify(artifact bundle) -> verification result
summarize(verification result) -> memory candidate
promote(memory candidate) -> durable rule, routing rule, experiment, or rejection
```

This gives callers leverage: they do not need to know whether the work came from sandbox, design assistant, trading, browser, or RAG. They need one artifact and one verification result.

### Existing modules to preserve

- `_SYSTEM/Scripts/offload-contract.mjs`: routing source of truth.
- `_SYSTEM/Scripts/yuri-sandbox-loop.mjs`: isolation and artifact-first execution.
- `_SYSTEM/Scripts/yuri-artifact-audit.mjs`: artifact verification.
- `_SYSTEM/Scripts/yuri-learning-capture.mjs`: learning capture.
- `backend/src/services/headlessControlPlaneService.ts`: headless planning surface.
- `backend/src/services/smartRouter.ts`: runtime/model/action-gate routing.
- `_SYSTEM/OS_KERNEL/memory.db`: canonical durable state.

### Seams to clean

1. Intent seam:
   - Current: prompts classified in offload contract, smart router, and executive integration.
   - Target: one normalized intent packet reused by all.

2. Artifact seam:
   - Current: sandbox artifacts, design packets, site-builder packets, trading JSONL, and RAG reports differ.
   - Target: common artifact metadata: source, intent, route, evidence, verification, decision.

3. Memory seam:
   - Current: memory items exist, but promotions are empty.
   - Target: every verified learning has a review state and final disposition.

4. Action seam:
   - Current: action gates exist in smart router and executive integration.
   - Target: every lane exposes `allowed_actions`, `blocked_actions`, and `required_confirmation` in the artifact packet.

### Deletion test

If `headlessControlPlaneService`, `offload-contract`, `smartRouter`, and executive integration stay separate without a shared lifecycle, deleting any one of them moves complexity into callers. They are not shallow by themselves, but the system around them is shallow because callers must remember how to combine them.

The deepening opportunity is not to delete these modules. It is to place a deeper lifecycle interface above them.

## Acceptance Criteria

Yuri is cleaner and more operational when all P0 gates pass:

```bash
npm test
npm run build
python3 _SYSTEM/OS_KERNEL/memory_governor.py health
node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate --json
node _SYSTEM/Scripts/wiki-rag-health.mjs
node _SYSTEM/Scripts/ollama-kv-config.mjs status
node _SYSTEM/Scripts/yuri-local-model-benchmark.mjs --dry-run
node _SYSTEM/Scripts/yuri-session-launchd.mjs status
npx gitnexus status
```

Expected target state:

- Build exits 0.
- Live memory governor health exits 0.
- Skill validation has `drift=0`.
- GitNexus CLI or MCP health is usable.
- Session runtime launchd status finds the service or is explicitly marked disabled with an alternative runtime.
- Dirty worktree is partitioned into reviewed lanes.
- `promoted_lessons` and/or reviewed `session_lesson_candidates` are non-empty after weekly comp.
- Business lanes are explicitly classified as live, gated, draft-only, or disabled in a machine-readable readiness report.

## Final Council Read

Yuri has crossed the threshold from imagined system into working substrate. The strongest evidence is the passing root test suite, live Ollama, live RAG health, route-plan correctness, sandbox tests, token ledger tests, and concrete backend/control-plane services.

The current failure mode is fragmentation. There are too many surfaces that partially know how to route, verify, capture, or promote. The build and live memory health failures make this visible: tests can pass while the operator system is not clean enough to ship.

For the Jake Van Clief goal, the file architecture is pointed in the right direction. The missing piece is behavior-change accounting. The system must prove that experience becomes rules, routing changes, experiments, or rejected noise. Until live promoted lessons exist, the ICM loop is structurally present but not fully compounding.

Priority is therefore clear:

1. Restore build and live memory health.
2. Restore GitNexus and skill registry integrity.
3. Partition the dirty tree.
4. Build the single lifecycle controller.
5. Make weekly lesson promotion measurable.

Do those, and Yuri moves from powerful but messy substrate to a clean operator system that can compound.
