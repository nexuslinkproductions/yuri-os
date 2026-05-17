# Yuri OS / NUDIMMUD — GPT Session Handoff  
**Session focus:** RAG startup smoke validation, tokenmaxxing/token-budget hardening, Anime-DNA/RAG source registry planning, DeepSeek V4 API lane implementation, PULSE/TokenOps intake preparation  
**Prepared:** 2026-05-02  
**Repo root:** `/Users/marcelspatz/YURI-OS-MUSUBI`  
**Branch:** `main`  
**Latest confirmed HEAD in session:** `ac2c846c1` after DeepSeek V4 lane commit  
**Live DeepSeek smoke status:** Flash and Pro both passed from normal macOS Terminal  

---

## 1. Executive Summary

This session moved Yuri OS / NUDIMMUD through several major infrastructure gates.

The RAG/backend startup safety arc reached a clean state: the backend can start in isolated `:memory:` mode, accept a static HTTP probe, pass authwall and authenticated health probes, and avoid touching the live database during those smokes. The reusable backend smoke runner was created and verified.

The token-cost problem became a first-class workflow issue. A large token overrun exposed that offloading and tokenmaxxing were not being enforced strongly enough. Token budget policies were added to the relevant skills, then the tokenmaxxing `SessionStart` hook was repaired to write a deterministic activation marker. A fresh session verified `TOKENMAXXING::ACTIVE`, proving the hook works at new terminal/session start.

The external source / Anime-DNA / RAG intake pipeline was clarified: raw web/source crawling must be done by cheap evidence-gathering lanes, while GPT-5.5/Sonnet consume compact evidence packs only. Gemini’s audit found an important flaw in the original GPT-5.5 prompt: direct web/source opens by GPT-5.5 violated the architect-only role, clean-room boundary, and token budget. The corrected evidence-pack architecture is now the standard for future senior systems prompts.

DeepSeek V4 became a primary strategic execution lane. The lane implementation was committed in `ac2c846c1`, DNS was confirmed to work from normal Terminal, and both tiny live smokes passed:
- `deepseek-v4-flash` returned `DEEPSEEK_V4_SMOKE_OK`
- `deepseek-v4-pro` returned `DEEPSEEK_V4_PRO_OK`

Codex DNS failure against `api.deepseek.com` was determined to be sandbox/session-specific, not a Yuri router/API/key failure.

The next recommended sprint is `08G_DEEPSEEK_V4_PRO_ROUTING_BENCH_P`, followed by PULSE/Lean Context TokenOps intake and Anime-DNA/RAG integration using DeepSeek V4 Pro as the main high-power executor lane.

---

## 2. Major Completed Work

### 2.1 RAG Startup / DB Isolation Arc

#### 07M — DB/WAL isolation analysis
Result label:
`07M_RAG_DB_WAL_ISOLATION_P_PASS_EXTERNAL_PROCESS_LIKELY`

Key finding:
- A live backend process held the DB files and port `3004`.
- PID `1255` was the live backend.
- WAL writes/checkpoints seen during smoke window were caused by that live process, not the isolated smoke.
- Smoke path itself correctly used `YURI_DB_PATH=:memory:`.

Important evidence:
- `DATABASE :: ATTEMPTING_CONNECTION_AT: :memory:` appeared in smoke logs.
- `server.ts` calls `initDatabase()` at module scope, but DB path was already resolved to `:memory:` before import.
- No hardcoded live DB path found in `server.ts` or `database.ts`.

Consequence:
- Future smokes must hard-stop if any process holds `backend/data/yuri.db`, `.db-shm`, or `.db-wal`.

---

#### 07M — Clean DB-isolated startup smoke rerun
Result label:
`07M_RAG_STARTUP_SMOKE_X2_PASS_CLEAN_DB_ISOLATED`

Result:
- Backend started in test mode against `:memory:`.
- Live DB hash, size, and mtime unchanged.
- No DB holder remained after run.
- `VAULT_WATCHER_STOPPED` appeared as shutdown cleanup only and was classified benign because no watcher start was observed.

Key markers:
- `SMOKE_ONLINE::True`
- `SMOKE_MEMORY_DB::True`
- `SMOKE_EXIT_CODE::0`
- `SMOKE_DB_UNCHANGED::True`
- `SMOKE_FORBIDDEN_FOUND::NONE`
- `SMOKE_WATCHER_STOP_ONLY::True`
- `SMOKE_WATCHER_REAL_LEAK::False`

---

#### 07N — Static HTTP socket probe
Result label:
`07N_RAG_STARTUP_HTTP_PROBE_PASS_SOCKET_ACCEPTED_DB_ISOLATED`

Endpoint used:
`GET /api/direct-test`

Reason:
- Pure static JSON.
- No auth.
- No DB/model/cloud/RAG/ingest path.
- Proved the server accepted an HTTP request during the startup smoke window.

Result:
- HTTP `200`
- Body prefix: `{"status":"SERVER_DIRECT_ALIVE"}`
- Live DB unchanged.

---

#### 07O — Authwall probe
Result label:
`07O_RAG_STARTUP_AUTHWALL_PROBE_PASS_AUTH_RESPONSE_DB_ISOLATED`

Endpoint:
`GET /api/notebook/notebooks`

Important nuance:
- Authenticated handler would touch DB/RAG, so only unauthenticated path was probed.
- Missing key produced immediate `401` before handler execution.
- No DB/model/RAG/cloud path reached.

Key markers:
- `UNAUTH_PROBE_STATUS::401`
- `SMOKE_DB_UNCHANGED::True`
- `SMOKE_FORBIDDEN_FOUND::NONE`

---

#### 07P — Authenticated safe route inventory
Result label:
`07P_RAG_AUTHENTICATED_SAFE_ROUTE_P_PASS_NO_SAFE_AUTH_ROUTE_EXISTS`

Finding:
- No existing safe authenticated GET route existed for a clean authenticated success probe.
- Authenticated candidates either touched DB/RAG or external KIE cloud API.
- Recommendation: add a minimal auth-gated static health endpoint.

---

#### 07Q — Auth health endpoint implementation
Result label:
`07Q_RAG_AUTH_HEALTH_ENDPOINT_X_PASS_COMMITTED`

Commit:
`b3144f7d chore(rag): add auth-gated health probe endpoint`

File changed:
- `backend/src/routes/api.ts`

Endpoint:
`GET /api/health/auth`

Behavior:
```json
{ "status": "AUTH_OK" }
```

Constraints:
- Behind `authMiddleware`
- No DB
- No model
- No service/cloud/date access
- No state mutation

---

#### 07R — Auth health probe
Result label:
`07R_RAG_AUTH_HEALTH_PROBE_PASS_VALID_KEY_200_UNAUTH_401_DB_ISOLATED`

Endpoint:
`GET /api/health/auth`

Result:
- Missing key: `401`
- Valid smoke key: `200`
- Body: `{"status":"AUTH_OK"}`
- DB unchanged
- Forbidden background paths absent

---

#### 07S — Reusable smoke runner added
Result label:
`07S_RAG_SMOKE_RUNNER_X_PASS_COMMITTED`

Commit:
`8173d4bc7 chore(test): add reusable backend smoke probe runner`

File created:
- `_SYSTEM/Scripts/backend-smoke-probe.mjs`

Runner capabilities:
- Port busy check
- DB stat/hash before/after
- Forced safe env:
  - `YURI_DB_PATH=:memory:`
  - `YURI_TEST_MODE=1`
  - cloud keys blanked
- Unauthenticated probe first
- Authenticated probe second
- Marker-only result output
- Failure-only log dump
- Forbidden token check
- Watcher leak classification
- `--help` path exits clean without backend start

---

#### 07T — Smoke runner verification
Result label:
`07T_RAG_SMOKE_RUNNER_V_PASS_MARKER_ONLY_DB_ISOLATED`

Runner command:
```bash
node _SYSTEM/Scripts/backend-smoke-probe.mjs --path=/api/health/auth --expect-unauth=401 --expect-auth=200 --expect-body=AUTH_OK
```

Result markers:
- `SMOKE_ONLINE::true`
- `SMOKE_MEMORY_DB::true`
- `UNAUTH_STATUS::401`
- `AUTH_STATUS::200`
- `AUTH_BODY_MATCH::true`
- `DB_UNCHANGED::true`
- `FORBIDDEN_FOUND::NONE`
- `WATCHER_REAL_LEAK::false`
- `RESULT::PASS`

Token impact:
- Result cost around 8.8k tokens, much better than earlier inline harnesses.

---

## 3. Tokenmaxxing / Token Budgeting Work

### 3.1 Problem observed

Several small tasks consumed too many tokens:
- ~46k for an authwall probe result
- ~69.2k for reusable runner creation
- ~48k for token budget guardrail patch
- Gemini produced excessive “thinking” prose and hit repeated tool-policy denials
- Broad commands like `git diff --name-only` in dirty repos caused huge transcript output
- Inline Python/Bash harnesses echoed too much command text into tool transcripts

Core lesson:
Token discipline must govern not only final reports, but also prompt shape, command selection, tool output, and whether heavy reading is delegated.

---

### 3.2 Token budget rules established

Always-on sprint token budget standard:
- Small tasks target: 5k–15k total transcript
- Hard sprint ceiling: 40k tokens
- Hard stop or split before token overflow
- No command should output more than 60–80 lines
- For stricter verification tasks, cap command output at 40 lines
- Pass reports should be marker-only
- Failure reports should include failure-only verbose logs
- Avoid large inline harnesses
- Prefer committed/reusable runner scripts
- Avoid broad repo commands in dirty repos

Forbidden or discouraged in dirty repos:
- broad `git diff --name-only`
- broad `git status`
- broad `find`
- unbounded `grep -R`
- full file dumps
- full logs on pass

Preferred:
- path-scoped `git status --short -- <exact paths>`
- `git diff --name-only -- <exact paths>`
- `grep -q` marker checks
- `wc -l`
- `test -f`
- marker-only command output
- reusable scripts that emit compact markers

---

### 3.3 07V1 — Token budget guardrail docs patch

Result label:
`07V1_TOKEN_BUDGET_CONTROL_SURFACE_X_PASS_COMMITTED`

Commit:
`3283fce14 chore(workflow): add token budget guardrails to offload skills`

Files changed:
- `.claude/skills/ai-pipeline-offloading/SKILL.md`
- `.claude/skills/swarm-coordination/SKILL.md`
- `.claude/skills/compact-optimizer/SKILL.md`
- `.claude/skills/tokenmaxxing/SKILL.md`

Rules added:
- Heavy reading/search/classification goes to cheap/offloaded lanes only.
- Expensive orchestrators receive compact evidence only.
- Soft 5k–15k / hard 40k transcript budget.
- No command output over 60–80 lines.
- Dirty repos require scoped marker-only commands.
- Reports marker-only on pass, failure-only verbose on fail.

---

### 3.4 Tokenmaxxing SessionStart hook verification

Issue:
Tokenmaxxing existed as a protocol, but activity was unproven in fresh sessions.

#### 07V0B result
`07V0B_TOKENMAXXING_HOOK_STATE_PASS_CONFIGURED_NO_MARKER`

Finding:
- Hook file present.
- Skill present.
- Settings registration present.
- No active marker found.

#### 07V0C patch attempt
Patch added a deterministic marker write to `.claude/hooks/token-session-init.js`, but stopped before commit because unrelated `_SYSTEM/Scripts/swarm-proxy.sh` drift appeared.

#### 07V0C2 commit
Result:
`07V0C2_TOKENMAXXING_HOOK_MARKER_COMMIT_PASS`

Commit:
`ff5e237a9 chore(workflow): add tokenmaxxing activation marker`

Change:
- `.claude/hooks/token-session-init.js` now writes:
  - `.claude/state/tokenmaxxing-state.json`
  - marker: `TOKENMAXXING::ACTIVE`
  - source: `SessionStart`
  - budgetSoft: `5k-15k`
  - budgetHard: `40k`
  - markerOnly: `true`

#### 07V0D fresh session verification
Result:
`07V0D_TOKENMAXXING_FRESH_SESSION_MARKER_PASS_ACTIVE`

Evidence:
- HEAD: `ff5e237a9`
- `.claude/state/tokenmaxxing-state.json` present
- marker found: `TOKENMAXXING::ACTIVE`
- source: `SessionStart`
- budgetHard: `40k`
- markerOnly: `true`

Conclusion:
Tokenmaxxing is now proven active at fresh session start.

---

## 4. Offloading Lessons and Routing Policy

### 4.1 Core routing principle

Heavy lifting must always be offloaded:
- file gathering
- route inventory
- broad grep/search
- classification
- docs review
- source/evidence cleanup
- cheap audits
- repeated verification

Allowed cheap/offloaded lanes:
- Haiku
- DeepSeek V4 Flash
- DeepSeek V4 Pro during discount/credit window
- Codex GPT-5.4-mini
- Gemini Flash/Pro where tool policy is stable
- local shell scripts
- local Ollama/GPT-OSS where appropriate
- `@swarm` when system being inspected is not the swarm/offload system itself

Current orchestrator should receive only compact evidence:
- Sonnet
- GPT-5.5
- future Opus
- Haiku if acting as orchestrator

---

### 4.2 Gemini-specific lesson

Gemini 3.1 Pro had useful audit reasoning, but repeatedly hit:
- `Tool execution denied by policy`
- excessive narrative/thinking text
- repeated retries around denied shell/read operations

Future Gemini prompts must be more restrictive:
- no narrative
- no progress prose
- no tables unless necessary
- final-only marker report
- simple shell commands only
- avoid JSON/described shell calls when possible
- avoid direct reads of restricted `.claude/hooks` or sensitive skill files unless explicitly allowed via local shell snippets
- switch to Codex or local shell when exact hook evidence is needed

---

### 4.3 Codex-specific lesson

Codex GPT-5.4-mini xhigh performed well on:
- scoped git checks
- hook marker patch/commit
- DeepSeek lane preflight
- evidence cleanup
- compact verification

Codex can still have sandbox/network limitations:
- DNS failed for `api.deepseek.com` inside Codex sandbox
- normal macOS Terminal resolved and reached DeepSeek API

Conclusion:
Use Codex for scoped patch/review/commit discipline, but validate external network from normal Terminal if sandbox DNS fails.

---

## 5. Perplexity MCP Status

Result label:
`07M_MCP_PERPLEXITY_CAPABILITY_P_PASS_ABSENT_NO_ACTION`

Finding:
- No actual Perplexity MCP server registered locally.
- No `.mcp.json` project/global configuration.
- No `mcp__perplexity__*` tool prefix.
- No `PERPLEXITY_API_KEY` env var.
- `@perplexity` in `ai-pipeline-offloading/SKILL.md` was speculative/browser-use via Comet alias, not live.
- Browser-use/Comet MCP also not registered.

Boundary:
Perplexity, if added later, is external read-only research only:
- not authority for local git state
- not authority for DB/WAL/process state
- not mutation authority
- not allowed to see private repo/session/memory/secrets

Worklist:
Future MCP lane for Perplexity should include:
- official MCP registration/provenance/pinning verification
- sanitized test query
- tool surface verification
- update docs to mark `@perplexity` as planned/requires MCP registration unless actually active

---

## 6. Anime-DNA / RAG Source Registry Work

### 6.1 Initial source research and evidence cleanup

Gemini 3.1 Pro generated an initial evidence pack, but it included gaps and some unverified claims.

A later cleanup sprint produced:
`08A_EVIDENCE_PACK_CLEANUP_V_PASS_WITH_GAPS`

Accepted cleaned P0 sources:
- Aider repo map / ctags / tree-sitter repo map
- lean-ctx
- context-mode
- Serena MCP
- Graphiti
- Anthropic context engineering / compaction

Accepted cleaned P1 sources:
- Roo Code Context Condensing
- OpenAI Prompt Caching
- Anthropic Prompt Caching
- OpenCode Magic Context
- Letta Code
- Mem0
- Cognee
- MCP token-bloat / on-demand schema loading discussions

Deferred:
- SLSA / SBOM provenance
- clean-room design
- Reddit/social trend claims

Downgraded/removed:
- token reduction percentages unless separately audited
- Graphiti latency/benchmark claims
- Mem0 benchmark claims
- Roo thresholds/percentages
- OpenCode quantitative claims
- social/trend claims

---

### 6.2 GPT-5.5 source-registry architecture sprint

Result:
`08A_ANIME_DNA_RAG_SOURCE_REGISTRY_P_PASS_WITH_GAPS`

Key output:
- Tier classification of cleaned sources
- Yuri-native abstraction map
- RAG atom schema proposal
- Anime-DNA gate routing
- source registry plan
- next sprint sequence

Proposed source tiers:
- `TIER_0_CANONICAL_PATTERN`
- `TIER_1_CANDIDATE_PATTERN`
- `TIER_2_REFERENCE_ONLY`
- `TIER_3_DEFERRED_OR_QUARANTINED`

Canonical/candidate examples:
- lean-ctx: T0 canonical pattern
- OpenAI Prompt Caching: T0 canonical pattern
- Anthropic Prompt Caching: T0 canonical pattern
- Mem0: T0 canonical pattern
- Cognee: T0 canonical pattern
- context-mode: T1 due restrictive license
- Graphiti: T1 due unresolved license/metric concerns
- Roo Code: T2 due shutdown timeline
- MCP token-bloat discussions: T2 because discussion-level only

Registry recommendation:
- Primary canonical proposal: `_SYSTEM/KNOWLEDGE/source-registry/`
- RAG mirror/export proposal: `_SYSTEM/RAG/source-registry/`
- Docs mirror: `docs/architecture/source-registry/`
- Research staging: `research/source-registry/`

Important boundary:
Public-source evidence must never become local repo truth. Every atom needs evidence origin and authority separation.

---

### 6.3 08B source registry schema design

Result:
`08B_SOURCE_REGISTRY_SCHEMA_DESIGN_PASS_SCHEMA_READY`

Offloaded audit:
- GPT-5.4-mini audited the schema and returned `NEEDS_PATCH`.
- Main synthesis incorporated useful gaps.

Proposed record types:
- `SourceRecord`
- `EvidencePackRecord`
- `PatternFamilyRecord`
- `RAGAtomCandidate`
- `ReviewGateRecord`
- `VerificationGapRecord`
- `SupersessionRecord`
- `SprintLinkRecord`

Key lifecycle:
`new_candidate → evidence_cleaned → tiered → review_required → reviewed_pattern → yuri_native_backlog → implementation_ready_later`

Hard blockers:
- unknown license blocks implementation-ready
- restrictive license requires clean-room/IP gate
- discussion-level evidence cannot become canonical without primary-source verification
- vendor metrics default excluded
- social/trend evidence rejected or quarantined
- public evidence and local repo truth stay separate

---

## 7. DeepSeek V4 Strategic Decision

### 7.1 Routing stance adopted

DeepSeek V4 Pro should not be treated with the same scarcity/avoidance posture as Opus/Sonnet.

New operational stance:
- DeepSeek V4 Flash = cheap workhorse
- DeepSeek V4 Pro = main serious executor / architect / audit / Sonnet-Opus replacement lane
- GPT-5.5 = final strategic gate / contradiction resolver / prompt and systems architect
- Sonnet = local Claude Code executor when Claude-side context/tools require it
- Opus = avoid unless uniquely necessary

Precision:
DeepSeek V4 Pro is treated as a PRC/Chinese frontier-equivalent class model for operational routing. This means same strategic capability tier / viable Sonnet-Opus replacement lane for many architecture, audit, code-review, implementation-planning, and high-reasoning executor tasks. It does not claim it wins every benchmark.

User topped up 5 USD on DeepSeek platform and wants aggressive use of DeepSeek V4 Pro during the discount window.

Discount note:
Official DeepSeek docs indicate V4 Pro 75% discount extended until 2026-05-31 15:59 UTC.

---

### 7.2 DeepSeek V4 lane plan

Result:
`08C_DEEPSEEK_V4_API_LANE_PLAN_P2_PASS_READY`

Findings:
- Existing support had local DeepSeek lane and some cloud aliases.
- Missing first-class:
  - `deepseek-v4-flash`
  - `deepseek-v4-pro`
  - `deepseek-v4-pro-lite-budget`
- Needed:
  - DeepSeek thinking body
  - max token/timeout caps
  - compatibility aliases
  - marker-only reasoning_content handling
  - docs/env/model registry updates

Proposed lanes:
- `deepseek-v4-flash`
  - non-thinking default
  - max tokens 4096
  - timeout 60s
- `deepseek-v4-pro`
  - thinking enabled
  - max tokens 8192
  - timeout 120s
- `deepseek-v4-pro-lite-budget`
  - pro model, non-thinking
  - max tokens 1024
  - timeout 45s

Aliases:
- `deepseek-chat → deepseek-v4-flash`
- `deepseek-reasoner → deepseek-v4-flash`
- `deepseek-cloud → deepseek-v4-pro`
- `code-deepseek → deepseek-v4-pro`

---

### 7.3 08E DeepSeek V4 implementation commit

Result:
`08E_DEEPSEEK_V4_DNS_COMMIT_REPAIR_PASS_COMMITTED_DNS_BLOCKED`

Commit:
`ac2c846c1 chore(offload): add DeepSeek V4 API lanes`

Files committed:
- `_SYSTEM/Scripts/offload-runner.mjs`
- `_SYSTEM/Scripts/ai`
- `_SYSTEM/Scripts/offload.sh`
- `_SYSTEM/model-registry.md`
- `backend/.env.example`
- `.claude/config/models.json`

Validation passed:
- `node --check _SYSTEM/Scripts/offload-runner.mjs`
- `bash -n _SYSTEM/Scripts/ai`
- `bash -n _SYSTEM/Scripts/offload.sh`
- JSON parse for `.claude/config/models.json`
- `git diff --check`
- inventory/list/help surfaced lanes
- dry-runs all routed cloud

Committed lane behavior:
- `deepseek-v4-flash`
- `deepseek-v4-pro`
- `deepseek-v4-pro-lite-budget`
- `deepseek-chat -> deepseek-v4-flash`
- `deepseek-reasoner -> deepseek-v4-flash`
- `deepseek-cloud/code-deepseek -> deepseek-v4-pro`
- `@deepseek` remains local

Live smoke skipped inside Codex:
- `curl: (6) Could not resolve host: api.deepseek.com`
- Classified as DNS blocked.

---

### 7.4 Network recheck from normal Terminal

Normal macOS Terminal results:
- `api.deepseek.com` resolved to `3.173.21.63`
- `api-docs.deepseek.com` resolved
- `platform.deepseek.com` resolved
- `google.com` resolved
- `curl -I https://api-docs.deepseek.com` returned HTTP/2 `200`
- `curl -I https://platform.deepseek.com` returned HTTP/2 `405` to HEAD, expected reachability
- `curl -I https://api.deepseek.com` returned HTTP/2 `401`, expected unauthenticated reachability
- Cloudflare DoH resolved `api.deepseek.com` through CloudFront
- dry-runs:
  - `deepseek-v4-flash lane=cloud`
  - `deepseek-v4-pro lane=cloud`
- `DEEPSEEK_API_KEY_PRESENT::true`

Conclusion:
Codex DNS failure was sandbox/session-specific. Normal Terminal network and API host are fine.

---

### 7.5 Live smoke validation

User reported both passed from normal Terminal:
- Flash smoke returned expected marker: `DEEPSEEK_V4_SMOKE_OK`
- Pro smoke returned expected marker: `DEEPSEEK_V4_PRO_OK`

Current DeepSeek status:
- committed
- dry-run verified
- normal terminal DNS verified
- live Flash verified
- live Pro verified

Next:
`08G_DEEPSEEK_V4_PRO_ROUTING_BENCH_P`

---

## 8. PULSE / Lean Context / TokenOps Intake

User found an interesting `.md` file: `PULSE-TOKEN-EFFICIENCY-COMPACTOR.md`.

Assessment:
It is useful as an inspiration source for Yuri-native TokenOps, but should not be copied blindly.

Useful patterns:
- dense but readable code
- scoped file reads
- no rereads
- prompt/output compression
- compact agent report format
- lazy loading
- config-driven agent definitions
- weekly compaction sweeps
- token efficiency metrics
- strict quality gates

Yuri adaptation:
- Integrate with `tokenmaxxing`
- Integrate with DeepSeek V4 Flash/Pro routing
- Integrate with RAG source registry
- Integrate with Anime-DNA gates
- Integrate with future TokenOps dashboards

Safety constraints:
- No compaction that reduces clarity
- No compaction that breaks tests
- No broad repo rewrites
- Docs/skills first
- Runtime enforcement later in separate audited sprints
- RAG-aware compaction only; unresolved decisions and safety gates must not disappear
- Treat PULSE as pattern evidence, not code to copy

Potential Yuri-native layer name:
`LEAN_CONTEXT / TOKENOPS`

Proposed integration stack:
`tokenmaxxing → ai-pipeline-offloading → DeepSeek V4 Flash/Pro lanes → RAG source registry / memory atoms → Anime-DNA gates`

---

## 9. Current Worklist / Priority Order

### Immediate

1. `08G_DEEPSEEK_V4_PRO_ROUTING_BENCH_P`
   - Use DeepSeek V4 Pro as high-power executor.
   - Run tiny but meaningful routing/quality bench.
   - Compare Flash vs Pro roles.
   - Keep GPT-5.5/Sonnet as final safety gate only.

2. `08H_PULSE_LEAN_CONTEXT_TOKENOPS_INTAKE_P`
   - Use DeepSeek V4 Pro as main executor.
   - Analyze PULSE into Yuri-native TokenOps patterns.
   - Produce RAG atom proposals.
   - Do not mutate runtime.

3. `08I_TOKENOPS_RAG_ATOM_SCHEMA_PILOT_NO_INGEST`
   - Create sample planning atoms only.
   - No vector DB/RAG ingestion yet.

4. `08J_ANIME_DNA_CLEAN_ROOM_GATE_FOR_TOKENOPS_P`
   - Apply relevant Anime-DNA gates.
   - Define what can become policy, runtime, skill, or reference-only.

### Still open / later

- Perplexity MCP registration/provenance/pinning lane.
- Browser-use / Comet MCP capability verification.
- DeepSeek V4 Pro routing bench and cost telemetry.
- Lean Context runtime guardrails for `_SYSTEM/Scripts/ai`, `offload.sh`, `offload-runner.mjs`.
- Source registry schema implementation.
- License/provenance verification pack for unresolved sources.
- Clean-room intake governance sprint.
- RAG atom registry pilot.
- Local verification boundary check for registry paths.
- Skillbase Completion Audit as major Yuri strategic priority.
- Graphify-OUT integration review.
- Minimal RAG readiness.
- RLM/MLM functionality/integration.
- MLX implementation later after prep.

---

## 10. Current Repo / Dirty State Snapshot

Latest known HEAD:
`ac2c846c1 chore(offload): add DeepSeek V4 API lanes`

Known tolerated/pre-existing dirty:
- `.claude/settings.json` model/effort drift
- `_SYSTEM/Scripts/swarm-proxy.sh`
- `backend/data/yuri.db-shm`
- `backend/data/yuri.db-wal`
- `src/index.tsx`
- `src/main.ts`
- `src/components/NeuralViz/`
- `src/yuri/`

Important:
- Do not stage unrelated drift.
- DeepSeek lane commit touched only intended six files.
- Tokenmaxxing marker hook commit already landed earlier at `ff5e237a9`.
- `.claude/settings.json` model/effort drift is allowed workflow drift, but other settings drift should hard-stop.

---

## 11. Prompting Standards Established This Session

All serious Yuri prompts must include:

- explicit role
- model-routing authority
- local-vs-external authority split
- tokenmaxxing marker check
- budget tier and per-stage token caps
- source count caps
- privacy/sanitization boundaries
- source trust hierarchy
- clean-room boundaries
- RAG coupling
- mutation/no-mutation scope
- exact hard stops
- compact output rules
- split triggers
- non-claims

Senior systems prompt standard:
- Cheap lanes gather evidence.
- Expensive/high-power lanes synthesize from compact evidence.
- GPT-5.5/Sonnet/Opus should not crawl raw sources.
- If evidence packs are missing, stop with `NEEDS_EXTERNAL_VERIFICATION`.
- No simulated shell output.
- No raw source/code in RAG atom samples.
- RAG atom samples must use abstract behavioral descriptions only.
- Use `SPLIT_REQUIRED` before exceeding token budget.

---

## 12. Recommended Fresh Chat Model Choice

For the next fresh GPT chat:
- Use GPT-5.5 as strategic coordinator/prompt architect if staying in ChatGPT.
- Use DeepSeek V4 Pro through Yuri/terminal for high-power execution once the next sprint starts.
- Use Codex GPT-5.4-mini xhigh for scoped repo mutation/commit discipline.
- Use Haiku for tiny fresh-session marker checks and cheap verification.
- Avoid Gemini for restricted `.claude/hooks` evidence unless prompt is extremely constrained and final-only.

---

## 13. Copy-Ready Fresh Chat Continuation Prompt

Copy from below into the new GPT chat.

```text
You are GPT-5.5 Thinking acting as senior AI systems architect, LLMOps engineer, systems engineer, prompt architect, RAG architect, clean-room/IP gatekeeper, and Yuri OS/Nudimmud strategic coordinator.

Project: Yuri OS / NUDIMMUD
Repo root: /Users/marcelspatz/YURI-OS-MUSUBI
Branch: main
Latest confirmed HEAD: ac2c846c1
Timezone: Europe/Vienna
Current date context: 2026-05-02

Important standing rules:
- Tokenmaxxing is active as a SessionStart hook.
- Fresh session marker previously passed:
  TOKENMAXXING::ACTIVE
  source: SessionStart
  budgetHard: 40k
  markerOnly: true
- For all serious sprint prompts:
  - target 5k–15k transcript for small tasks
  - hard sprint ceiling 40k
  - hard stop/split before overflow
  - no command output over 60–80 lines
  - use marker-only pass reports
  - use failure-only verbose logs
  - avoid broad repo commands in dirty repos
  - use path-scoped checks only
- Heavy reading/search/classification must go to cheap/offloaded lanes first.
- Expensive orchestrators receive compact evidence only.
- DeepSeek V4 Flash = cheap routine workhorse.
- DeepSeek V4 Pro = main high-power executor / architect / audit / Sonnet-Opus replacement lane during current credit/discount window.
- Do not avoid DeepSeek V4 Pro like Opus. Use it aggressively for serious architecture, audit, code review, implementation planning, TokenOps, RAG, and Anime-DNA reasoning.
- GPT-5.5/Sonnet remain final gates for local-truth, security-sensitive, contradiction-sensitive, or protected-control decisions.

Recent completed work:
1. RAG/backend startup smoke arc passed:
   - 07M_RAG_STARTUP_SMOKE_X2_PASS_CLEAN_DB_ISOLATED
   - 07N_RAG_STARTUP_HTTP_PROBE_PASS_SOCKET_ACCEPTED_DB_ISOLATED
   - 07O_RAG_STARTUP_AUTHWALL_PROBE_PASS_AUTH_RESPONSE_DB_ISOLATED
   - 07Q_RAG_AUTH_HEALTH_ENDPOINT_X_PASS_COMMITTED
   - 07R_RAG_AUTH_HEALTH_PROBE_PASS_VALID_KEY_200_UNAUTH_401_DB_ISOLATED
   - 07S_RAG_SMOKE_RUNNER_X_PASS_COMMITTED
   - 07T_RAG_SMOKE_RUNNER_V_PASS_MARKER_ONLY_DB_ISOLATED

2. Relevant commits:
   - b3144f7d chore(rag): add auth-gated health probe endpoint
   - 8173d4bc7 chore(test): add reusable backend smoke probe runner
   - 3283fce14 chore(workflow): add token budget guardrails to offload skills
   - ff5e237a9 chore(workflow): add tokenmaxxing activation marker
   - ac2c846c1 chore(offload): add DeepSeek V4 API lanes

3. DeepSeek V4 API lanes are implemented, committed, dry-run verified, and live-smoke verified from normal macOS Terminal:
   - Commit: ac2c846c1
   - Files committed:
     _SYSTEM/Scripts/offload-runner.mjs
     _SYSTEM/Scripts/ai
     _SYSTEM/Scripts/offload.sh
     _SYSTEM/model-registry.md
     backend/.env.example
     .claude/config/models.json
   - Lanes:
     deepseek-v4-flash
     deepseek-v4-pro
     deepseek-v4-pro-lite-budget
   - Aliases:
     deepseek-chat -> deepseek-v4-flash non-thinking
     deepseek-reasoner -> deepseek-v4-flash thinking
     deepseek-cloud/code-deepseek -> deepseek-v4-pro
     @deepseek remains local
   - Normal terminal DNS/API reachability passed:
     api.deepseek.com resolved to 3.173.21.63
     curl -I https://api.deepseek.com returned HTTP/2 401, expected unauth reachability
     DEEPSEEK_API_KEY_PRESENT::true
   - Codex sandbox DNS failed earlier, but that was environmental.
   - Tiny live smokes passed:
     deepseek-v4-flash returned DEEPSEEK_V4_SMOKE_OK
     deepseek-v4-pro returned DEEPSEEK_V4_PRO_OK

4. Anime-DNA/RAG source registry planning:
   - 08A_EVIDENCE_PACK_CLEANUP_V_PASS_WITH_GAPS
   - 08A_ANIME_DNA_RAG_SOURCE_REGISTRY_P_PASS_WITH_GAPS
   - 08B_SOURCE_REGISTRY_SCHEMA_DESIGN_PASS_SCHEMA_READY
   - Source tiers and RAG atom schema were designed but not implemented.
   - Raw source dumps/code must never enter RAG.
   - Public-source evidence must not become local repo truth.
   - RAG atom samples must be abstract behavioral descriptions only.

5. PULSE / Lean Context / TokenOps:
   - User has `PULSE-TOKEN-EFFICIENCY-COMPACTOR.md`.
   - Treat it as an inspiration source for Yuri-native TokenOps/Lean Context, not something to copy.
   - Useful patterns: scoped file reads, no rereads, prompt/output compression, compact agent reports, lazy loading, config-driven agents, weekly compaction sweeps, token metrics, strict quality gates.
   - Must integrate with tokenmaxxing, DeepSeek V4 Flash/Pro routing, RAG source registry, Anime-DNA gates, and future TokenOps dashboards.
   - Must not reduce clarity, break tests, or broadly rewrite runtime.

Known current dirty state:
- .claude/settings.json model/effort drift
- _SYSTEM/Scripts/swarm-proxy.sh
- backend/data/yuri.db-shm
- backend/data/yuri.db-wal
- src/index.tsx
- src/main.ts
- src/components/NeuralViz/
- src/yuri/
Do not stage unrelated drift.

Next priority:
Run 08G_DEEPSEEK_V4_PRO_ROUTING_BENCH_P, then use DeepSeek V4 Pro as the main executor for PULSE/Lean Context TokenOps intake and Anime-DNA/RAG integration.

Before giving me any sprint prompt:
- recommend the execution lane/model
- include whether to run in Codex, Claude Code, normal Terminal, or ChatGPT
- keep the final prompt as one clean copy-ready block
- include offloading steps inside the prompt
- include exact hard stops and output caps
- make it senior AI systems architect quality
- preserve tokenmaxxing and marker-only discipline
```

---

## 14. Recommended Immediate Next Sprint Prompt

If continuing directly, ask for:

```text
Create the full prompt for 08G_DEEPSEEK_V4_PRO_ROUTING_BENCH_P. It should use DeepSeek V4 Pro as the main high-power executor, keep GPT-5.5/Sonnet as final gate only, stay under strict tokenmaxxing limits, avoid broad repo reads, and produce a compact benchmark/routing decision for PULSE/TokenOps and Anime-DNA work.
```

