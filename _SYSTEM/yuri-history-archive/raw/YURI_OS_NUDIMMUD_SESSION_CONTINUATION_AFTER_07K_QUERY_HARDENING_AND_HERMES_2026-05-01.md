# Yuri OS / NUDIMMUD — GPT Session Continuation Handoff After 07K RAG Query Hardening + Hermes Sidecar Closure

Date: 2026-05-01  
Prepared for: fresh GPT-5.5 / Claude / Codex / Gemini continuation  
Source: current GPT chat, user-provided terminal outputs, and uploaded handoff `YURI_OS_NUDIMMUD_HANDOFF_AFTER_07K_RAG_QUERY_HARDENING_2026-05-01.md`  
Status: continuity handoff, not an independently executed repo audit  

---

## 1. Purpose

This handoff is meant to continue Yuri OS / NUDIMMUD work in a new GPT chat without losing the current trusted state.

It captures:

- the latest accepted RAG query-hardening state,
- the Hermes sidecar lane outcome,
- the HI-12 Bash hardline safety guard work,
- the package/offload/swam routing updates,
- the backend startup-guard planning state,
- the current dirty worktree boundaries,
- prompt-format rules the user explicitly wants preserved,
- model and `@swarm` routing rules,
- and the next safest continuation behavior.

Important: this document is a continuity file, not a live repo audit. The next chat must verify the repository state before authorizing mutation, staging, commits, backend startup, DB work, or route execution.

---

## 2. Latest Trusted Repo State

Latest accepted state from the uploaded 07K RAG query-hardening handoff:

```text
repo root: /Users/marcelspatz/NUDIMMUD
branch: main
current accepted HEAD: fe97ec8e chore(rag): prevent cloud embedding fallback in notebook query
staged files: none
backend/data/nudimmud.db: clean
```

Expected dirty / untracked state:

```text
M backend/data/nudimmud.db-shm
M backend/data/nudimmud.db-wal
M src/index.tsx
M src/main.ts
?? src/components/NeuralViz/
?? src/yuri/
```

Interpretation:

- WAL/SHM churn is expected and remains unstaged.
- `backend/data/nudimmud.db` itself is clean.
- Frontend/worktree drift is unrelated to backend RAG hardening:
  - `src/index.tsx`
  - `src/main.ts`
  - `src/components/NeuralViz/`
  - `src/yuri/`
- Do not touch the frontend/runtime drift during backend RAG work unless explicitly scoped.
- No staged files should remain.

Recent accepted commit chain:

```text
fe97ec8e chore(rag): prevent cloud embedding fallback in notebook query
96af9e09 chore(rag): defer notebook citations until successful answer
c96c9e89 chore(node): add CLI wrapper, evidence validator, and offload lane support
7cdda6ea fix(offload): harden OpenRouter free lane
16751355 feat(offload): add OpenRouter free lane
9fcc8251 feat(hooks): block download-execute Bash chains
a741664c chore(cli): harden swarm routing for codex offload
9dc0f871 chore(rag): filter notebook query retrieval to ready sources
73ff7ac8 chore(rag): make notebook obsidian ingest idempotent
74fa466b chore(rag): add file-level domain overrides for vault ingestion
```

Do not assume any newer repo state unless the user pastes a fresh terminal result.

---

## 3. Current Composite Verdict

Current safe high-level verdict:

```text
LOCAL_RAG_AND_LOCAL_MODEL_RUNTIME_SUBSTRATES_VALIDATED_NOT_FULL_SYSTEM_READY
```

Safe to assume from accepted reports:

```text
- Local RAG substrate works.
- Local embedding retrieval works.
- Local retrieval + generation works.
- Backend knowledge search route works.
- Local offload routing works.
- Local qwen2.5:7b inference through offload.sh works.
- NeuralForge local-only chat runtime works.
- NotebookRagService has passed sandbox query validation.
- NotebookRagService now filters retrieval to ready sources.
- NotebookRagService backend citations are deferred until successful answer/save.
- Notebook query embeddings are guarded against cloud fallback through allowCloud:false.
- RLM pack exists as standalone scaffold.
- GBrain intake is reference-with-quarantine only.
- Hermes sidecar HI-12 hardline safety slice is closed.
```

Not safe to assume:

```text
- Full RAG readiness.
- Full NotebookRagService route/API readiness.
- Backend startup safety.
- Live ingest readiness.
- Live backend route validation for notebook RAG streaming.
- Full provider/cloud policy.
- Full Bash/security enforcement.
- Production readiness.
- Enterprise readiness.
- Complete sandboxing.
- Prompt-injection safety.
- Frontend citation UX runtime behavior.
```

---

## 4. Important Workflow Rules Preserved

### 4.1 One copy-ready prompt block rule

The user explicitly wants future sprint prompts in one single copy-ready block.

Do:

```text
- Put @swarm at the very beginning of the prompt block by default.
- Include all requirements inside that one block.
- Include stages inside that one block.
- Include hard stops inside that one block.
- Include output format inside that one block.
- Include expected result labels inside that one block.
- Include compact-output rules inside that one block.
- Include swarm-coordination / swarm-council requirements inside that one block.
```

Do not:

```text
- Put the actual prompt in one box and important requirements outside it.
- Split execution requirements across several boxes.
- Make the user manually combine model notes, stages, and hard stops.
```

The user got very frustrated when this was violated. Preserve this rule strictly.

### 4.2 `@swarm` default

For Yuri OS / NUDIMMUD sprint prompts, include:

```text
@swarm
```

at the very beginning of the single copy-ready prompt block by default, unless the user explicitly says not to use swarm or the task is unsafe for swarm/offload.

### 4.3 Swarm-coordination and swarm-council

Future `@swarm` prompts should include an explicit pre-dispatch requirement:

```text
Load/confirm the swarm-coordination skill before any swarm dispatch.
Use/consult swarm-council where relevant.
If swarm-council is unavailable, say so and continue only if direct evidence is sufficient.
```

This belongs inside the single copy-ready prompt block.

### 4.4 Compact-output rule

Future prompts should include:

```text
Use compact structured reports.
No verbose narration.
No repeated evidence blocks.
No full tool-output dumps unless failure occurs.
No huge tables unless necessary.
Final report must be concise but evidence-complete.
```

Reason:

- The user wants token efficiency.
- The user called verbose outputs “caveman speak.”
- Some prior runs were 20k–28k tokens when they could have been smaller.

### 4.5 Direct shell beats lower-lane summaries for mutation verification

Accepted rule:

```text
For mutation/commit verification, direct shell evidence beats swarm/lower-lane generated summaries.
Use swarm for cheap planning/search where appropriate, but verify commits, file status, and patch contents directly.
```

Reason:

Several `Scripts/ai codex @swarm` runs produced plausible but false or incomplete reports, including incorrect commit/state claims.

### 4.6 Prefer direct guarded shell for tiny deterministic backend patches

For small exact-path backend edits, direct guarded shell patches worked better than swarm:

```text
- Citation UX backend patch
- Provider local-only guard patch
- Static verification gates
```

Use `@swarm` again for broader planning/inventory, but do not blindly use it for narrow exact deterministic mutation when direct shell is cheaper and safer.

---

## 5. Model Routing Rules

Current preferred routing:

```text
Haiku:
  narrow verification, status checks, cheap reads, simple exact-path commits, first-pass classification

Sonnet 4.6:
  settings/hook/schema/security work
  larger orchestration
  high-risk patch finalization
  ambiguous gates
  code mutation where safety matters

Codex / GPT-5.4-mini:
  deterministic code/path review
  static checks
  patch review
  shell/CLI diagnosis

Gemini Flash/Pro:
  broad reading
  large-context inventory
  classification
  cross-file scanning
  cost-efficient context collection

GPT-5.5:
  strategic gatekeeper
  continuity brain
  final decision maker for high-risk sequence design
  prompt architect

Opus:
  not default
  only if explicitly justified for high-risk architecture/security contradictions
```

Cost discipline is mandatory:

```text
Do not use expensive models for raw reading/fetching/command running.
Expensive models should receive compact evidence, not full dumps.
Prefer local scripts, Haiku, Gemini, or @swarm for broad evidence collection.
```

---

## 6. Hermes Sidecar Lane Summary

The Hermes Agent sidecar lane was separate from active 07K RAG work.

Purpose:

```text
Observe Hermes patterns → abstract → redesign Yuri-native later.
Clean-room only.
No code copying.
No Hermes installer.
No Hermes code execution.
```

Initial Hermes pattern intake found useful concepts:

```text
- tool registries / toolsets
- trajectory compression
- SQLite FTS5 memory/session search
- terminal backends
- delegation/subagents
- MCP integration
- hardline approval / blocklist patterns
```

Later GPT gate repaired the matrix toward stricter safety:

```text
- Unconditional blocklist: Adopt, but high-risk implementation, requires Anime-DNA / Mangekyo-style safety gate
- FTS5 memory bus: Adopt in principle, but high-risk because memory migration/private data
- Mid-trajectory compression: Adapt, Sharingan / architecture gate
- Parallel clone spawning: Adapt, high-risk autonomous delegation, Sharingan + Mangekyo / Anime-DNA gates
- Cloud sandbox environments: Avoid-by-default
- Dynamic toolsets: Adapt via Yuri skill/agent registry, not Hermes structure
```

Important correction from the user:

```text
Do not reduce gates to only Sharingan and Mangekyo.
Yuri has a full Anime-DNA extension system for architecture, execution safety, memory, skillbase, orchestration, and similar tasks.
Future prompts must identify and apply relevant Anime-DNA extension gates/reviews.
```

---

## 7. HI-12 Bash Hardline Safety Guard Slice

Hermes-inspired hardline safety slice completed and closed.

Accepted commit:

```text
9fcc8251 feat(hooks): block download-execute Bash chains
```

What was implemented:

```text
- Added isDownloadExecuteChain(cmd)
- Blocks curl/wget piped into interpreters:
  bash, sh, zsh, ksh, dash, python, python3, node
- Handles optional sudo/env prefix after pipe
- Handles shell-wrapper inner command path:
  bash -c "curl URL | bash"
  sh -c "wget URL | sh"
  zsh -c 'curl URL | bash'
- Preserves standalone curl/wget advisory behavior
- Preserves safe-negative pipes to grep/jq/head/wc/tee
- Preserves local pipe pass cases:
  cat local-script.sh | bash
  printf "echo ok" | bash
```

Verification accepted:

```text
HERMES_PATTERN_BASH_EXPAND_P1_X_PASS_HI12_IMPLEMENTED
HERMES_PATTERN_BASH_EXPAND_P1_V_PASS_HI12_COMMIT_VERIFIED
HERMES_PATTERN_BASH_EXPAND_P1_LANE_CLOSE_PASS_HI12_CLOSED
```

Tests:

```text
smoke: 40/40
matrix: 130/130
baseline A-H: 96/96 preserved
new HI-12 category: 34/34 pass
```

Non-claims:

```text
- no full Bash protection
- no sandboxing
- no prompt-injection safety
- sudo standalone remains out of scope
- system path writes remain out of scope
- git force push remains out of scope
- cron remains out of scope
- MCP tool safety remains out of scope
- Agent prompt inspection remains out of scope
- T7 enforcement remains out of scope
- process substitution / variable indirection / heredoc / multi-hop chains remain out of scope
```

---

## 8. Package / Offload / Swarm Routing Work

Package infrastructure commit accepted:

```text
c96c9e89 chore(node): add CLI wrapper, evidence validator, and offload lane support
```

Committed:

```text
package.json
package-lock.json
```

Changes included:

```text
scripts.yuri = "claude"
scripts.validate:ledger = "node _SYSTEM/validators/validate-evidence-ledger.mjs"
devDependency @types/node
dependency run-deepseek-cli
```

Settings workflow drift was restored before commit.

OpenRouter / offload commits accepted:

```text
16751355 feat(offload): add OpenRouter free lane
7cdda6ea fix(offload): harden OpenRouter free lane
```

Codex/swarm routing hardening accepted:

```text
a741664c chore(cli): harden swarm routing for codex offload
```

Important rule:

```text
Raw codex exec does not automatically activate repo-level @swarm.
Use:
  Scripts/ai codex @swarm ...
or:
  Scripts/ai swarm ...
```

Current desired Codex MCP surface from prior state:

```text
codex_apps: zero tools
obsidianMcpTools: read/search tools only
obsidianVault: zero tools
openaiDeveloperDocs: zero tools
```

Codex can still have ~12k baseline token input even after connector cleanup, so use Codex strategically, not automatically.

---

## 9. RAG Ingest / Query / Hardening State

### 9.1 RAG ingest idempotency

Commit:

```text
73ff7ac8 chore(rag): make notebook obsidian ingest idempotent
```

Files:

```text
backend/src/services/notebookService.ts
backend/src/services/notebookIngestService.ts
```

Accepted regression evidence:

```text
first ingest: sources=1, chunks=13, embeddings=13
second same-note ingest: sources=1, chunks=13, embeddings=13
duplicate-collapse pre-state: sources=2, chunks=26
after collapse: sources=1, chunks=13, embeddings=13
source status=ready
word_count=4088
chunk_index=0..12
canonical source id=1
```

### 9.2 Ready-source retrieval filter

Commit:

```text
9dc0f871 chore(rag): filter notebook query retrieval to ready sources
```

Patch:

```sql
WHERE ns.notebook_id=? AND ns.status='ready' AND nc.embedding IS NOT NULL
```

Target:

```text
backend/src/services/notebookService.ts
```

### 9.3 NotebookRagService full query sandbox validation

Accepted result:

```text
07K_RAG_NOTEBOOK_QUERY_X_PASS_QUERY_FULL_SERVICE_VALIDATED
```

Evidence:

```text
SANDBOX_NOTEBOOK_QUERY_TEST_RESULT :: outcome=PASS_QUERY_FULL_SERVICE_VALIDATED citations=5 uniqueCitationChunkIds=5 answerChars=1121 sourceIds=1
```

Post-query sandbox DB:

```text
sources=1
chunks=13
embeddings=13
messages=1
```

Cloud keys blanked, local generation via `llama3.2:latest`, local embedding via `nomic-embed-text`.

Boundary:

```text
Sandbox service validation only.
Not full route/API validation.
Not full production readiness.
```

### 9.4 Citation UX backend hardening

Commit:

```text
96af9e09 chore(rag): defer notebook citations until successful answer
```

File:

```text
backend/src/services/notebookRagService.ts
```

Behavior after patch:

```text
- citations are built as data before generation
- generation starts before citation emission
- saveMessage happens before citation emission
- citations emit after saveMessage
- onDone after citation emission
- catch/AbortError path has no citation emission
```

Accepted static verification:

```text
07K_RAG_NOTEBOOK_QUERY_CITATION_UX_V_PASS_STATIC_VERIFIED_ACCEPTED
```

Verification asserted:

```text
ORDER_OK
citations_built_before_fetch=true
citations_emitted_after_save=true
onDone_after_citations=true
failure_path_no_citations=true
```

Boundary:

```text
Backend emission order only.
No browser/frontend runtime UX validation.
No frontend state handling changes.
Frontend drift remains out of scope.
```

### 9.5 Provider local-only guard for notebook query embeddings

Commit:

```text
fe97ec8e chore(rag): prevent cloud embedding fallback in notebook query
```

Files:

```text
backend/src/services/neuralForgeService.ts
backend/src/services/notebookRagService.ts
```

Patch details:

```text
neuralForgeService.ts:
- added NeuralEmbeddingOptions with allowCloud?: boolean
- getEmbedding accepts options: NeuralEmbeddingOptions = {}
- allowCloud = options.allowCloud !== false
- explicit :cloud embedding returns null when allowCloud:false
- local-to-cloud retry only occurs if cloudApiKey exists and allowCloud is true

notebookRagService.ts:
- query embedding now calls:
  neuralForge.getEmbedding(query, 'nomic-embed-text', { allowCloud: false })
```

Accepted static verification:

```text
07K_RAG_PROVIDER_LOCAL_ONLY_GUARD_V_PASS_STATIC_VERIFIED_ACCEPTED
```

Boundary:

```text
Notebook query embedding path now prevents NeuralForge cloud fallback.
Generation path still uses direct OLLAMA_BASE fetch.
This is not a complete provider policy for the whole system.
```

---

## 10. Backend Startup Safety / Startup Guard Planning State

Startup safety was classified before later query-hardening work.

Accepted finding:

```text
UNSAFE_TO_START_BACKEND_UNTIL_STARTUP_GUARD_REPAIR
```

Reasons found:

```text
1. server.ts top-level initDatabase() always runs on import/startup.
2. initDatabase() runs DDL/DML and two unconditional UPDATE statements.
3. initVaultWatcher starts background watcher.
4. setInterval jobs start on every backend startup.
5. SwarmOrchestrator instantiation has uncertain side effects.
6. Route validation writes assistant messages to DB.
7. Provider/cloud fallback risk existed before provider guard patch.
```

Recommended architecture selected:

```text
SANDBOX_DB_PLUS_STARTUP_GUARDS
```

Proposed guard strategy from prior plan:

```text
1. database.ts — NUDIMMUD_DB_PATH env-var replaces hardcoded DB path.
2. server.ts — gate initVaultWatcher behind NUDIMMUD_TEST_MODE or NUDIMMUD_DISABLE_WATCHERS.
3. server.ts — gate SwarmOrchestrator behind NUDIMMUD_TEST_MODE or NUDIMMUD_DISABLE_SWARM.
4. server.ts — gate three setInterval blocks behind NUDIMMUD_DISABLE_INTERVALS.
5. notebookRagService.ts — pass allowCloud:false to embedding/generation calls.
```

Important update:

- The provider guard part for notebook query embeddings has now been implemented in `fe97ec8e`.
- The startup DB path / watcher / interval / swarm guard work has not been implemented yet.
- Do not start backend for notebook route/API validation until startup guard or sandbox boot strategy is resolved.

Potential next RAG work should account for the newer `fe97ec8e` state.

---

## 11. Current Dirty Frontend / Runtime Boundary

Expected dirty/untracked files from latest handoff:

```text
M backend/data/nudimmud.db-shm
M backend/data/nudimmud.db-wal
M src/index.tsx
M src/main.ts
?? src/components/NeuralViz/
?? src/yuri/
```

Interpretation:

- `backend/data/nudimmud.db-shm` and `backend/data/nudimmud.db-wal` are expected WAL/SHM churn.
- `src/index.tsx`, `src/main.ts`, `src/components/NeuralViz/`, `src/yuri/` are sideline frontend/runtime drift.
- Do not mix those with backend RAG hardening.
- Do not clean, stage, commit, restore, or inspect broadly unless explicitly scoped by the user.

---

## 12. Current User Message Context

The user said:

```text
did some sideline work, here is for reference. wait for result
```

Then uploaded:

```text
YURI_OS_NUDIMMUD_HANDOFF_AFTER_07K_RAG_QUERY_HARDENING_2026-05-01.md
```

Then asked GPT to create this detailed session markdown file for continuation in a new GPT chat.

The next GPT chat should not assume there is a pasted result yet. It should use this handoff as trusted continuity and wait for or review the next pasted result.

---

## 13. Recommended New GPT Chat Opening Prompt

Copy this into the next GPT chat:

```text
Continue Yuri OS / NUDIMMUD from the uploaded continuation handoff.

Use the uploaded markdown as current GPT-5.5 trusted continuity state, but do not treat it as an independently executed repo audit.

Current accepted repo state from the handoff:

- repo root: /Users/marcelspatz/NUDIMMUD
- branch: main
- current accepted HEAD: fe97ec8e chore(rag): prevent cloud embedding fallback in notebook query
- staged files expected: none
- backend/data/nudimmud.db expected clean
- expected dirty/untracked:
  - M backend/data/nudimmud.db-shm
  - M backend/data/nudimmud.db-wal
  - M src/index.tsx
  - M src/main.ts
  - ?? src/components/NeuralViz/
  - ?? src/yuri/

Important accepted results:

- Hermes HI-12 lane closed:
  - HERMES_PATTERN_BASH_EXPAND_P1_LANE_CLOSE_PASS_HI12_CLOSED
  - commit: 9fcc8251 feat(hooks): block download-execute Bash chains
- RAG ingest idempotency committed:
  - 73ff7ac8 chore(rag): make notebook obsidian ingest idempotent
- Ready-source retrieval filter committed:
  - 9dc0f871 chore(rag): filter notebook query retrieval to ready sources
- Citation UX backend emission order committed:
  - 96af9e09 chore(rag): defer notebook citations until successful answer
- Provider local-only notebook query embedding guard committed:
  - fe97ec8e chore(rag): prevent cloud embedding fallback in notebook query
- Package/offload infrastructure committed:
  - c96c9e89 chore(node): add CLI wrapper, evidence validator, and offload lane support
  - a741664c chore(cli): harden swarm routing for codex offload

Current important boundaries:

- Do not assume production readiness.
- Do not assume enterprise readiness.
- Do not assume full RAG readiness.
- Do not assume backend startup safety.
- Do not start/restart backend.
- Do not read/mutate live DB.
- Do not touch frontend dirty files unless explicitly scoped.
- Do not mix Hermes sidecar with active RAG lane unless explicitly asked.
- Direct shell evidence beats lower-lane generated summaries for mutation/commit verification.

Prompt-format rule:

- When you generate a future sprint prompt, give me one single copy-ready prompt block.
- Put @swarm at the very beginning of that block by default.
- Include all stages, hard stops, requirements, compact-output rules, output labels, and swarm-coordination/swarm-council requirements inside that same block.
- Do not split important instructions outside the copy block.

Cost/model routing:

- Use @swarm for broad reading/evidence collection where safe.
- Recommend orchestrator model separately if needed, but keep all operational instructions inside the one prompt block.
- Use Haiku for narrow verification/status.
- Use Sonnet 4.6 for security-sensitive mutation, hooks, settings, schema, and ambiguous gates.
- Use Gemini Flash/Pro for broad reading/inventory.
- Use Codex/GPT-5.4-mini for deterministic code/path/static review.
- Use GPT-5.5 as strategic gatekeeper.
- Do not default to Opus.

Please first acknowledge this trusted state in compact form, then wait for my next pasted result or ask for the latest result if I have not pasted it yet.
```

---

## 14. Likely Next Safe Move

If the user pastes a fresh result:

```text
Review it strictly against this handoff.
Classify it as:
1. PASS / ACCEPT with notes
2. REPAIR REQUIRED
3. BLOCKED
```

If the user asks “what next?” without a result, likely next safe choices are:

### Option A — Verify current post-query-hardening state

Recommended if repo state has changed or enough time has passed:

```text
07K-RAG-POST-QUERY-HARDENING-V — Verify Current Backend RAG Hardening State
```

Goal:

```text
Verify HEAD, staged files, dirty boundaries, committed patch scopes, and static markers for citation UX and provider guard.
```

No mutation.

### Option B — Resume startup guard spec

Recommended if the user wants to continue RAG route/API readiness:

```text
07K-RAG-STARTUP-GUARD-X-P — Plan Exact Startup Guard Implementation Spec
```

Goal:

```text
Plan exact implementation of sandbox DB path and startup suppressors before route/API validation.
```

But adjust for current state:

```text
Provider local-only query embedding guard is already implemented in fe97ec8e.
Do not duplicate that patch.
Focus on DB path override, watcher/interval/swarm suppressors, and safe route-test boot.
```

### Option C — Verify citation/provider patches statically again

Recommended if the uploaded sideline work may have touched backend RAG files:

```text
07K-RAG-QUERY-HARDENING-STATIC-RV — Reverify Citation and Provider Guard Markers
```

No mutation.

---

## 15. Non-Claims to Preserve

Do not claim:

```text
- repo is clean
- production readiness
- enterprise readiness
- full RAG readiness
- full provider policy
- live ingest readiness
- backend startup safety
- full Bash protection
- full sandboxing
- prompt-injection safety
- frontend citation UX runtime correctness
- browser/SSE route behavior after citation patch
- cloud/offload readiness
- RLM pack integration readiness
```

---

## 16. Direct “Do Not Touch” List Unless Explicitly Scoped

```text
backend/data/nudimmud.db
backend/data/nudimmud.db-shm
backend/data/nudimmud.db-wal
src/index.tsx
src/main.ts
src/components/NeuralViz/
src/yuri/
.claude/settings.json
.claude/history.jsonl
.claude/memory-bus.json
.claude/projects/**
.claude/state/**
GEMINI.md
graphify-out
package.json
package-lock.json
Scripts/offload-runner.mjs
Scripts/offload.sh
Scripts/ai
```

Exception:

- Some of these may be intentionally scoped in future sprints, but never touch them implicitly.

---

## 17. Best Next Prompt Pattern

Future sprint prompts should look like this structurally:

```text
@swarm
Sprint: <NAME>

Use <model/lane>.

Pre-dispatch:
- Load/confirm swarm-coordination.
- Consult/use swarm-council where relevant.
- If unavailable, say so and continue only with direct evidence if sufficient.

Goal:
...

Scope:
Allowed:
...
Forbidden:
...

Trusted state:
...

Hard stops:
...

Stages:
Stage 0 ...
Stage 1 ...
Stage 2 ...

Verification:
...

Output format:
- Result label
- Evidence
- PASS / REPAIR REQUIRED / BLOCKED
- Scope confirmation
- Non-claims
- Recommended next step

Compact output:
- No verbose narration.
- No repeated evidence blocks.
- No full tool-output dumps unless failure occurs.
- Keep final report under <N> lines when possible.
```

All of that belongs in one copy-ready block.

---

## 18. Final Status

Current continuity status:

```text
READY_FOR_NEW_GPT_CONTINUATION
```

But not ready for mutation until:

```text
- latest pasted result is reviewed, or
- a fresh verification sprint confirms the current repo state.
```
