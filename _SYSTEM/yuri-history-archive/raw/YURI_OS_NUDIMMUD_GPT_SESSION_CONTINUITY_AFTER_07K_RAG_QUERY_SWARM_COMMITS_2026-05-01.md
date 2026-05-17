# Yuri OS / NUDIMMUD — GPT Session Continuity After 07K RAG Idempotency, Query Validation, and Swarm/Codex Routing Fixes

Date: 2026-05-01  
Prepared for: fresh GPT-5.5 continuation chat + Claude/Codex/Gemini continuation  
Source: visible GPT session transcript and user-provided Claude/Codex/Gemini outputs  
Status: continuity handoff, not an independently executed repo audit

---

## 1. Purpose

This handoff captures the current Yuri OS / NUDIMMUD state after the 07K RAG ingest/query/idempotency work, the NotebookRagService sandbox validation/hardening lane, and the Codex `@swarm` launcher/offload routing repair.

The immediate next fresh GPT chat should start by reading this handoff, then verify the two latest commits and decide the next safe RAG gate.

Do not assume production readiness, full RAG readiness, enterprise readiness, complete sandboxing, or full Bash/security enforcement.

---

## 2. Latest Trusted Repo State

Based on the user's direct terminal output after the final two commits:

```text
repo root: /Users/marcelspatz/YURI-OS-MUSUBI
branch: main
current accepted HEAD: a741664c chore(cli): harden swarm routing for codex offload
previous commit: 9dc0f871 chore(rag): filter notebook query retrieval to ready sources
staged files: none
target dirty status: only backend/data/yuri.db-shm and backend/data/yuri.db-wal
```

Latest real post-commit evidence pasted by user:

```text
---POST_COMMIT_HEAD---
a741664c (HEAD -> main) chore(cli): harden swarm routing for codex offload
9dc0f871 chore(rag): filter notebook query retrieval to ready sources
73ff7ac8 chore(rag): make notebook obsidian ingest idempotent
74fa466b chore(rag): add file-level domain overrides for vault ingestion
f2bd4496 docs(research): capture GBrain pattern intake

---POST_STAGED---
# empty

---POST_STATUS_TARGETS---
 M backend/data/yuri.db-shm
 M backend/data/yuri.db-wal
```

Interpretation:

- The backend service patches and CLI/offload routing patches have now been committed.
- `backend/data/yuri.db` itself was not listed as dirty.
- WAL/SHM churn remains expected because the active backend may own the SQLite DB.
- No staged files remain.
- A fresh verification sprint should still confirm this state before more work.

---

## 3. Current Commit Chain To Preserve

Relevant recent accepted commits:

```text
a741664c chore(cli): harden swarm routing for codex offload
9dc0f871 chore(rag): filter notebook query retrieval to ready sources
73ff7ac8 chore(rag): make notebook obsidian ingest idempotent
74fa466b chore(rag): add file-level domain overrides for vault ingestion
f2bd4496 docs(research): capture GBrain pattern intake
```

Earlier accepted 07J/07K context remains valid unless contradicted by the current repo:

```text
e83a6d9d fix(hooks): add PreToolUse event name to Bash guard output
e9daf01f feat(hooks): register Bash security guard
61fdeeb3 chore(policy): add exact protected deny rules
```

---

## 4. Cost Discipline and Swarm Routing Rules

The user clarified and GPT-5.5 should preserve these workflow rules:

### 4.1 `@swarm` is now a core cost-control lane

Accepted:

```text
@swarm offloading works extremely well and should be used aggressively where appropriate.
```

Meaning:

- The orchestrator plans, coordinates, reviews, and finalizes.
- The swarm handles heavy reading, fetching, command execution, local checks, evidence collection, and repetitive work.
- The main model should not burn large context on raw reading/fetching when `@swarm` + local scripts can collect compact evidence.
- This enables larger sprints with much lower cost, even when Sonnet orchestrates.

### 4.2 Orchestrator model recommendation must be separate from the copy prompt

Future GPT responses for Yuri/NUDIMMUD sprint prompts should include:

```text
Recommended orchestrator model: <model>
```

outside the copy-ready prompt block.

Do not bury the orchestrator recommendation inside the sprint prompt unless explicitly requested.

Routing guidance:

```text
Haiku:
  narrow verification, status checks, simple exact-path commits, cheap reads

Sonnet 4.6:
  larger orchestration, settings/hook/schema/security work, high-risk patch finalization, ambiguous gates

Codex/GPT-5.4-mini:
  deterministic code/path review, static checks, patch review, CLI/shell diagnosis

Gemini Flash/Pro:
  broad reading, large-context inventory, classification, cross-file scanning

GPT-5.5:
  strategic gatekeeper, continuity brain, final decision maker for high-risk sequence design

Opus:
  only for explicitly chosen high-risk architecture/security contradiction work
```

### 4.3 Compact output / “caveman speak” rule

User explicitly requested this to be baked into future prompts:

```text
Use compact structured reports.
No verbose narration.
No repeated evidence blocks.
No tool-output dumps unless failure occurs.
No huge tables unless necessary.
Keep final reports concise but evidence-complete.
```

Reason:

- Saves large token volume, possibly up to 75% in some runs.
- Does not reduce evidence quality if outputs are structured.

### 4.4 Single prompt block rule

For future sprints:

```text
Provide one single copy-ready prompt block.
Do not split the sprint prompt into many separate copy boxes.
Include all stages, constraints, hard stops, output format, and compact-output rule in that one block.
```

### 4.5 Default `@swarm` prompt prefix

For Yuri/NUDIMMUD sprint prompts, include `@swarm` at the very start by default unless:

```text
- the user explicitly says not to use swarm
- the task is unsafe for offload
- the task involves sensitive live DB/.claude memory/security material where offload must be narrowed or disabled
```

---

## 5. Codex CLI / MCP / `@swarm` Findings

### 5.1 Codex fresh-chat MCP overhead

Observed:

- Codex fresh chat loaded several tools/MCP/plugin contexts and used ~44k tokens in one run.
- With top-level MCP disabled via `-c mcp_servers.<server>.enabled=false`, initial usage dropped but still reported ~18k tokens.
- Codex reported active tools/plugins even after MCP disable:
  - web, image_gen, functions, tool_search, multi_tool_use
  - Browser Use, Build macOS Apps, Build Web Apps, ChatGPT Apps, CodeRabbit, Documents, Figma, GitHub, Presentations, Spreadsheets
- It also said GitNexus rules were present but not queried.

Accepted interpretation:

```text
Codex CLI can still have high baseline overhead.
Use Codex strategically, not automatically, especially when raw Codex startup loads tool/MCP context.
Prefer local scripts, Haiku, Gemini, or Scripts/ai @swarm routing for cheap evidence collection.
```

### 5.2 Raw `codex exec` does not activate repo `@swarm`

Accepted:

```text
Raw Codex does not automatically activate repo-level @swarm behavior.
Use the repo launcher:
  Scripts/ai codex @swarm ...
or:
  Scripts/ai swarm ...
```

### 5.3 `Scripts/ai codex @swarm` routing fix

Initial diagnosis:

- `Scripts/ai` recognized `swarm|triage`, but not `@swarm` in the Codex route.
- Patch changed the route case from:

```text
swarm|triage)
```

to:

```text
@swarm|swarm|triage)
```

This was later expanded into a fuller robustness patch.

### 5.4 Swarm lane robustness fix

Final committed patch in `a741664c` included:

```text
Scripts/ai
Scripts/offload-runner.mjs
Scripts/offload.sh
```

Purpose:

- Make `Scripts/ai codex @swarm ...` route into swarm fan-out.
- Avoid `tmpdir: unbound variable` cleanup bug.
- Make missing optional cloud lanes such as `kimi` skip cleanly instead of throwing.
- Pass `OFFLOAD_OPTIONAL=1` through swarm/offload paths.

Observed validation before commit:

```text
AI_DRY_RUN=1 Scripts/ai codex @swarm ... -> kimi, gpt-oss, ollama
node Scripts/offload-runner.mjs kimi --dry-run ... -> JSON with status SKIPPED_MISSING_ENDPOINT
OFFLOAD_OPTIONAL=1 node Scripts/offload-runner.mjs kimi ... -> [kimi] SKIPPED_MISSING_ENDPOINT: Missing endpoint for lane: kimi
```

Committed as:

```text
a741664c chore(cli): harden swarm routing for codex offload
```

Important:

- This does not mean raw `codex exec` now routes through swarm.
- Use `Scripts/ai codex @swarm ...` or `Scripts/ai swarm ...`.

### 5.5 Unreliable generated reports from lower lanes

At least one `Scripts/ai codex @swarm` run produced unreliable/fabricated-looking results from `gpt-oss` / `ollama`, including fake recent commit hashes and incorrect staging claims.

User then manually verified the real state with direct shell commands.

Trusted rule:

```text
For swarm/lower-lane outputs, trust direct shell evidence over generated summaries.
If a lower model reports commit hashes/status that do not match real git output, treat it as untrusted.
Always verify with direct git status/log/diff before commits.
```

---

## 6. Sprint Timeline and Accepted Results

### 6.1 RAG ingest idempotency plan and live patch

#### Plan sprint

Result:

```text
07K_RAG_INGEST_IDEMPOTENCY_LIVE_P_PASS_PATCH_PLAN_READY
```

Key accepted plan:

- Patch only:
  - `backend/src/services/notebookService.ts`
  - `backend/src/services/notebookIngestService.ts`
- Add idempotency helpers:
  - `findSourcesByObsidianPath`
  - `deleteChunksForSource`
  - `replaceChunksForSource`
  - `collapseAndReplaceObsidianSource`
- Change only `ingestObsidianNote`.
- Choose canonical source as lowest ID.
- Collapse duplicates in one DB transaction.
- Add try/catch so failed replacement marks canonical source `error`.
- No DB schema migration.
- No unique index yet.

#### Patch sprint

Result:

```text
07K_RAG_INGEST_IDEMPOTENCY_LIVE_X_PASS_PATCH_APPLIED_STATIC_VERIFIED
```

Files modified:

```text
backend/src/services/notebookService.ts
backend/src/services/notebookIngestService.ts
```

Important behavior:

- Existing source path:
  - finds existing Obsidian source(s)
  - canonical = lowest ID
  - duplicates = rest
  - replaces chunks under canonical
  - deletes duplicates
  - status processing -> ready
  - error path sets status error

#### Static verification

Result:

```text
07K_RAG_INGEST_IDEMPOTENCY_LIVE_X_V_PASS_STATIC_VERIFIED_PLAN_READY
```

Accepted evidence:

- `git diff --check` clean.
- `tsc --noEmit --project backend/tsconfig.json` passed.
- Diff scope only the two service files.
- No schema/database/settings/gitignore drift.

#### Sandbox regression

Result:

```text
07K_RAG_INGEST_IDEMPOTENCY_LIVE_XR_PASS_SANDBOX_REGRESSION_VALIDATED
```

Sandbox:

```text
/tmp/nudimmud-live-patch-regression-sandbox
```

Evidence:

```text
first ingest: sources=1, chunks=13, embeddings=13
second same-note ingest: sources=1, chunks=13, embeddings=13
duplicate-collapse pre-state: sources=2, chunks=26
after collapse: sources=1, chunks=13, embeddings=13
source status=ready
error_msg=NULL
word_count=4088
chunk_index=0..12
canonical source id=1
```

No live DB mutation.

#### Regression verification / commit plan

Result:

```text
07K_RAG_INGEST_IDEMPOTENCY_LIVE_XR_V_PASS_COMMIT_PLAN_READY
```

Commit plan:

```text
stage:
  backend/src/services/notebookService.ts
  backend/src/services/notebookIngestService.ts

commit:
  chore(rag): make notebook obsidian ingest idempotent
```

#### Staged commit prep

Result:

```text
07K_RAG_INGEST_IDEMPOTENCY_COMMIT_P_PASS_STAGED_SCOPE_VERIFIED
```

Staged exactly two service files.

#### Commit

Result:

```text
07K_RAG_INGEST_IDEMPOTENCY_COMMIT_X_PASS_COMMIT_CREATED
```

Commit:

```text
73ff7ac8 chore(rag): make notebook obsidian ingest idempotent
```

Pre-commit hook:

```text
29/29 ledger lines PASS
```

#### Post-commit verification

Result:

```text
07K_RAG_INGEST_IDEMPOTENCY_POSTCOMMIT_V_PASS_NEXT_GATE_READY
```

Accepted next gate:

```text
Sprint 07K-RAG-NOTEBOOK-QUERY-P — Plan NotebookRagService Query Path Validation
```

---

### 6.2 NotebookRagService query validation

#### Planning via Gemini/swarm

Result:

```text
07K_RAG_NOTEBOOK_QUERY_P_PASS_VALIDATION_PLAN_READY
```

Key findings:

- `NotebookRagService.streamAnswer`:
  - gets embedded chunks via `notebookService.getEmbeddedChunks`
  - uses `neuralForge.getEmbedding(query)`
  - computes cosine similarity locally
  - retrieves top 5 chunks
  - emits citations via `onCitation`
  - calls local Ollama API for generation
  - saves assistant message after full generation
- Provider dependency:
  - local Ollama + neuralForge
  - no inherent external cloud provider required
- Regression DB suitable:
  - 1 notebook
  - 1 ready NISABA source
  - 13 chunks
  - 13 embeddings

#### Full query validation

Result:

```text
07K_RAG_NOTEBOOK_QUERY_X_PASS_QUERY_FULL_SERVICE_VALIDATED
```

Sandbox:

```text
/tmp/nudimmud-query-validation-sandbox
```

Runner result:

```text
SANDBOX_NOTEBOOK_QUERY_TEST_RESULT :: outcome=PASS_QUERY_FULL_SERVICE_VALIDATED citations=5 uniqueCitationChunkIds=5 answerChars=1121 sourceIds=1
```

Evidence:

- 5 citations returned.
- 5 unique citation chunk IDs.
- all chunks source_id=1.
- answer length 1121 chars.
- post-query DB:
  - sources=1
  - chunks=13
  - embeddings=13
  - messages=1
- cloud keys blanked.
- local generation via `llama3.2:latest`.
- local embedding via `nomic-embed-text`.
- no cloud routing detected.

#### Query verification / hardening decision

Result:

```text
07K_RAG_NOTEBOOK_QUERY_X_V_PASS_NEXT_GATE_READY
```

Key observations:

- `streamAnswer` saves only assistant message, not user query.
- citations are emitted before generation.
- `RagCitation` fields:
  - `chunk_id`
  - `source_title`
  - `excerpt`
- Live DB path in runner was only an exit guard, not a connection.
- Next gate:
  - `Sprint 07K-RAG-NOTEBOOK-QUERY-HARDEN-P`

---

### 6.3 NotebookRagService hardening characterization

#### Hardening plan

Result:

```text
07K_RAG_NOTEBOOK_QUERY_HARDEN_P_PASS_TEST_MATRIX_READY
```

Important code behavior found:

- Empty chunks:
  - `onError('No embedded sources...')` and return
- Null embedding:
  - `onError('Failed to generate query embedding...')` and return
- Ollama/generation error:
  - catch -> `onError(...)`
- AbortError:
  - silent, no onError, no onDone, no saveMessage
- Citations:
  - emitted before generation fetch
- saveMessage:
  - only after full generation and before onDone
- `getEmbeddedChunks` did not filter `ns.status='ready'`
- `neuralForge.getEmbedding` has Ollama cloud fallback if `OLLAMA_CLOUD_API_KEY` exists

Accepted risks to characterize:

```text
T1a generation unavailable only
T1b embedding + generation unavailable
T2 model missing
T3 null embeddings
T4 empty notebook
T5 duplicate chunk rows
T6 message write contract
T7 citation fields
T8 abort signal
```

#### Hardening execution

Result:

```text
07K_RAG_NOTEBOOK_QUERY_HARDEN_X_PASS_FAILURE_TESTS_CHARACTERIZED
```

Runner result:

```text
SANDBOX_NOTEBOOK_QUERY_HARDEN_RESULT :: outcome=PASS tests=9 passed=9 failed=0 repairs=0
```

Key findings:

- T1a:
  - generation unavailable -> 5 citations emitted, 0 messages, onError yes
- T1b:
  - embedding unavailable -> 0 citations, 0 messages, onError yes
- T2:
  - nonexistent model -> 5 citations emitted, 0 messages, onError yes
- T3:
  - all embeddings NULL -> 0 citations, 0 messages, onError yes
- T4:
  - empty notebook -> 0 citations, 0 messages, onError yes
- T5:
  - duplicate semantic chunk inserted -> no duplicate chunk IDs, but semantic duplicate can appear as distinct citation
- T6:
  - exactly 1 assistant message, `sources_used` valid JSON, all chunk IDs exist
- T7:
  - all citation fields valid, excerpt <= 200 chars
- T8:
  - pre-aborted signal -> 5 citations emitted, 0 messages, no onError/onDone, silent abort

Confirmed risks:

```text
- citations emitted before generation failure/abort
- listEmbeddedChunks missing ns.status='ready'
- semantic duplicate citations possible if duplicate rows exist
```

No immediate repairs required by test runner itself.

#### Hardening verification / repair scope

Result:

```text
07K_RAG_NOTEBOOK_QUERY_HARDEN_X_V_PASS_REPAIR_SCOPE_READY
```

Repair-scope classification:

```text
A. Citations before generation:
  PLAN REPAIR — medium priority; needs frontend UX coordination

B. Semantic duplicate citations:
  DEFER — ingest idempotency protects normal duplication

C. getEmbeddedChunks missing status='ready':
  REPAIR CANDIDATE — high priority; one WHERE clause

D. neuralForge/Ollama-cloud fallback:
  REPAIR CANDIDATE — medium priority; provider guard separate

E. Citation contract no source_id:
  DEFER — no confirmed frontend need

F. Message write contract:
  DOCUMENT AS EXPECTED
```

Next accepted patch plan:

```text
07K-RAG-NOTEBOOK-QUERY-HARDEN-R1 — Patch Ready-Source Retrieval Filter
```

#### Repair plan

Result:

```text
07K_RAG_NOTEBOOK_QUERY_HARDEN_R_P_PASS_PATCH_PLAN_READY
```

Patch target:

```text
backend/src/services/notebookService.ts
```

Change:

```sql
WHERE ns.notebook_id=? AND ns.status='ready' AND nc.embedding IS NOT NULL
```

No schema changes.

#### Patch applied and sandbox verified

Result:

```text
07K_RAG_NOTEBOOK_QUERY_HARDEN_R1_PASS_PATCH_APPLIED_SANDBOX_VERIFIED
```

Patch:

```text
backend/src/services/notebookService.ts
```

Validation:

```text
baseline_embedded=13
nonready_embedded=1
filtered_ready_rows=13
unfiltered_rows=14
tsc passed
diff scope: notebookService.ts only
```

Later committed as:

```text
9dc0f871 chore(rag): filter notebook query retrieval to ready sources
```

---

## 7. Swarm/Codex Launcher Fix Timeline

### 7.1 Trigger diagnosis

The user asked whether Codex `@swarm` actually worked.

Diagnosis:

- `.codex/config.toml` was only skills scoping.
- `@swarm` was a Claude skill trigger.
- `Scripts/swarm` forwards to `Scripts/ai swarm`.
- Missing route was in `Scripts/ai` Codex branch.
- Patch added `@swarm` to the route match.

Initial result:

```text
CODEX_SWARM_TRIGGER_FIX_PASS_PATCHED_AND_SMOKE_VERIFIED
```

### 7.2 Follow-up actual error from running `Scripts/ai codex @swarm`

User ran:

```bash
Scripts/ai codex @swarm "$(cat /tmp/07k_pending_patches_commit_p.txt)"
```

Observed failures:

```text
[kimi]
Error: Missing endpoint for lane: kimi

[gpt-oss]
YURI_ENKI_PROTOCOL_ACTIVE
BEGIN_EXECUTION
Prompt: PASTE THE PROMPT TEXT HERE...

[ollama]
YURI_ENKI_PROTOCOL_ACTIVE
BEGIN_EXECUTION
Prompt: PASTE THE PROMPT TEXT HERE...
END_EXECUTION

Scripts/ai: line 579: tmpdir: unbound variable
```

Interpretation:

- `@swarm` route itself worked.
- Kimi lane lacked endpoint and crashed.
- `Scripts/ai` cleanup trap referenced unbound `tmpdir` under `set -u`.
- Some lower lanes executed placeholder prompt text because the prompt file still contained placeholder text.
- Need robust optional lane skip and tmpdir cleanup fix.

### 7.3 Robustness patch

Result:

```text
CODEX_SWARM_LANE_ROBUSTNESS_PASS_PATCHED_AND_SMOKE_VERIFIED
```

Files changed:

```text
Scripts/ai
Scripts/offload-runner.mjs
Scripts/offload.sh
```

Core changes:

- Added `cleanup_tmpdir` helper.
- Initialized `tmpdir=""` before traps.
- Replaced direct `rm -rf "$tmpdir"` trap with guarded cleanup.
- Set `OFFLOAD_OPTIONAL=1` for optional swarm/offload lane dispatch.
- `offload-runner.mjs` now returns `SKIPPED_MISSING_ENDPOINT` instead of throwing for optional/dry-run missing endpoint.
- Inventory includes `status` field.

Validation:

```text
AI_DRY_RUN=1 Scripts/ai codex @swarm ... -> kimi, gpt-oss, ollama
node Scripts/offload-runner.mjs kimi --dry-run ... -> status SKIPPED_MISSING_ENDPOINT
OFFLOAD_OPTIONAL=1 node Scripts/offload-runner.mjs kimi ... -> [kimi] SKIPPED_MISSING_ENDPOINT
```

Committed as:

```text
a741664c chore(cli): harden swarm routing for codex offload
```

---

## 8. Manual Commit Execution

The user manually ran the two separated commits:

```bash
cd /Users/marcelspatz/YURI-OS-MUSUBI
set -e

git diff --cached --name-only
git diff --check -- backend/src/services/notebookService.ts Scripts/ai Scripts/offload-runner.mjs Scripts/offload.sh

git add backend/src/services/notebookService.ts
git diff --cached --name-only
git commit -m "chore(rag): filter notebook query retrieval to ready sources"

git add Scripts/ai Scripts/offload-runner.mjs Scripts/offload.sh
git diff --cached --name-only
git commit -m "chore(cli): harden swarm routing for codex offload"
```

Commit A:

```text
9dc0f871 chore(rag): filter notebook query retrieval to ready sources
1 file changed, 1 insertion(+), 1 deletion(-)
pre-commit ledger: 29/29 valid, 0 failed
```

Commit B:

```text
a741664c chore(cli): harden swarm routing for codex offload
3 files changed, 34 insertions(+), 8 deletions(-)
pre-commit ledger: 29/29 valid, 0 failed
```

Post state:

```text
HEAD: a741664c
staged: none
target dirty: backend/data/yuri.db-shm, backend/data/yuri.db-wal
```

---

## 9. Trusted Sandboxes Left In Place

Cleanup has not been authorized. These sandboxes may exist and can be used as evidence, but do not modify/delete unless a cleanup sprint explicitly allows it.

```text
/tmp/nudimmud-sandbox
/tmp/nudimmud-idempotency-sandbox
/tmp/nudimmud-live-patch-regression-sandbox
/tmp/nudimmud-query-validation-sandbox
/tmp/nudimmud-query-harden-sandbox
/tmp/nudimmud-ready-source-filter-sandbox
```

Important:

- Do not assume all are pristine.
- Use exact sandbox names in verification prompts.
- Do not use them as production state.
- Do not clean them in a normal verification sprint.

---

## 10. Current Open Risks / Deferred Repairs

### 10.1 RAG / NotebookRagService

Open but characterized:

```text
Citations emitted before generation:
  client can receive citations even if generation fails or aborts
  medium priority
  needs backend/frontend UX decision

Semantic duplicate citations:
  possible if duplicate content rows exist with different chunk IDs
  low priority
  idempotency patch reduces normal risk

Citation contract lacks source_id:
  deferred
  no confirmed frontend need

Provider/local-only guard:
  generation path local-only direct Ollama fetch
  embeddings via neuralForge may cloud-fallback if OLLAMA_CLOUD_API_KEY exists
  needs separate provider guard sprint
```

### 10.2 Query retrieval

Recently fixed:

```text
getEmbeddedChunks now filters source status ready
```

Needs post-commit verification.

### 10.3 Swarm/offload routing

Recently fixed:

```text
Scripts/ai codex @swarm routes into swarm
optional missing Kimi endpoint skips
tmpdir cleanup fixed
```

Needs post-commit verification.

### 10.4 Codex/lower-lane trust

Lower-lane model outputs may hallucinate commit hashes/status.

Rule:

```text
Direct shell evidence wins.
Always verify git state directly before accepting swarm-generated commit/status claims.
```

### 10.5 Settings model drift

From previous session:

```text
Switching Claude model can modify .claude/settings.json "model".
Exact model-only drift should be treated as allowed workflow drift, never staged/committed.
Use:
git diff -I '^[[:space:]]*"model":' -- .claude/settings.json
for protected settings drift checks.
```

Current latest manual status did not show `.claude/settings.json` dirty.

Still preserve the rule.

---

## 11. What Must Not Happen Next

Do not:

```text
- claim full RAG readiness
- claim production readiness
- claim enterprise readiness
- claim repository clean beyond target status
- run live ingestion
- restart backend for ingestion
- query or mutate live backend/data/yuri.db
- stage WAL/SHM files
- clean /tmp sandboxes
- touch .claude/projects/**
- touch archive/transcript policy
- commit .claude/settings.json model drift
- trust lower-lane generated git status without direct shell verification
- run broad git add .
- run broad git add -A
- run git add .claude
- run git clean
- run git reset --hard
```

Do:

```text
- verify commits before moving on
- use @swarm for offloaded work where safe
- include compact output rule
- include one single copyable prompt block
- provide orchestrator model recommendation separately
- use direct shell evidence for git state
- keep WAL/SHM out of commits
- keep post-commit verification read-only
```

---

## 12. Immediate Next Recommended Sprint

```text
Sprint 07K-RAG-PENDING-PATCHES-COMMIT-V — Verify Two Commits and Decide Next RAG Gate
```

Purpose:

- Verify both latest commits:
  - `9dc0f871 chore(rag): filter notebook query retrieval to ready sources`
  - `a741664c chore(cli): harden swarm routing for codex offload`
- Verify no staged files.
- Verify target status only shows WAL/SHM churn.
- Verify `.claude/settings.json` protected diff clean.
- Verify `notebookService.ts` at HEAD contains `ns.status='ready'`.
- Verify `Scripts/ai` route includes `@swarm|swarm|triage`.
- Verify `Scripts/offload-runner.mjs` includes optional `SKIPPED_MISSING_ENDPOINT`.
- Verify `Scripts/offload.sh` passes `OFFLOAD_OPTIONAL=1` in swarm dispatch.
- Optionally run dry-run smoke:
  - `AI_DRY_RUN=1 Scripts/ai codex @swarm "Report route only. Do not inspect files. Do not run repo commands."`
  - `OFFLOAD_OPTIONAL=1 node Scripts/offload-runner.mjs kimi "probe optional skip"`

No mutation. No cleanup. No commit.

If verification passes, likely next gate options:

```text
A. Close current RAG query hardening patch lane and plan citation UX separately.
B. Plan provider/local-only guard for NotebookRagService/neuralForge embedding fallback.
C. Return to minimal RAG readiness / MLM-RLM lane depending on current project priority.
```

GPT-5.5 likely recommendation:

```text
First run 07K-RAG-PENDING-PATCHES-COMMIT-V.
After that, choose between:
- 07K-RAG-NOTEBOOK-QUERY-CITATION-UX-P
- 07K-RAG-PROVIDER-LOCAL-ONLY-GUARD-P
- broader 07K lane close / next POA update
```

---

## 13. Fresh GPT Chat Opening Prompt

Use this to open the next GPT chat.

```text
Continue Yuri OS / NUDIMMUD from this uploaded continuity handoff.

Current accepted repo state from the last GPT session:

- repo root: /Users/marcelspatz/YURI-OS-MUSUBI
- branch: main
- current accepted HEAD: a741664c chore(cli): harden swarm routing for codex offload
- previous commit: 9dc0f871 chore(rag): filter notebook query retrieval to ready sources
- staged files expected: none
- expected target dirty state: backend/data/yuri.db-shm and backend/data/yuri.db-wal only
- .claude/settings.json expected clean unless model drift was introduced after handoff

Latest accepted committed work:

1. 73ff7ac8 chore(rag): make notebook obsidian ingest idempotent
   - Obsidian notebook ingest now checks existing sources by obsidian_path.
   - It collapses duplicate sources into canonical lowest source ID.
   - It replaces chunks transactionally.
   - Sandbox regression validated first ingest, second ingest, duplicate collapse, 13 chunks, 13 embeddings.

2. 9dc0f871 chore(rag): filter notebook query retrieval to ready sources
   - getEmbeddedChunks/listEmbeddedChunks now filters ns.status='ready'.
   - Sandbox proof showed filtered_ready_rows=13 while unfiltered_rows=14 after synthetic non-ready embedded source.

3. a741664c chore(cli): harden swarm routing for codex offload
   - Scripts/ai now routes codex @swarm into swarm launcher.
   - Scripts/offload-runner.mjs skips optional missing endpoints with SKIPPED_MISSING_ENDPOINT.
   - Scripts/offload.sh passes OFFLOAD_OPTIONAL=1 for swarm/offload dispatch.
   - tmpdir cleanup under set -u was hardened.

Important workflow rules to preserve:

- Use @swarm by default for Yuri/NUDIMMUD sprint prompts unless unsafe.
- Always provide the orchestrator model recommendation separately from the copy-ready prompt.
- Use one single copy-ready prompt block.
- Include compact-output rule: no verbose narration, no repeated evidence blocks, no tool-output dumps unless failure occurs.
- Direct shell evidence beats swarm/lower-lane generated summaries.
- Do not trust lower-lane generated commit hashes/status without direct git verification.
- Model-only .claude/settings.json drift is allowed workflow drift but must not be staged or committed.
- WAL/SHM churn is expected but must never be staged.

Immediate next recommended sprint:

Sprint 07K-RAG-PENDING-PATCHES-COMMIT-V — Verify Two Commits and Decide Next RAG Gate

Your first task:
1. Acknowledge the trusted current state.
2. Give me the orchestrator model recommendation.
3. Provide one single @swarm copy-ready prompt for the post-commit verification sprint.
4. Keep the prompt compact, strict, read-only, and evidence-based.
5. Do not authorize cleanup, live ingestion, backend restart, live DB query/mutation, settings patching, or new commits.

Do not claim:
- full RAG readiness
- production readiness
- enterprise readiness
- repo cleanliness beyond the verified target status
- full sandboxing or complete enforcement
```

---

## 14. Suggested Next Sprint Prompt

Recommended orchestrator model:

```text
Claude Haiku 4.5 or Codex 5.4-mini is enough for this verification.
Use Sonnet 4.6 only if you want stronger orchestration, but it is not necessary for a read-only post-commit verification.
```

Copy-ready prompt:

```text
@swarm Sprint 07K-RAG-PENDING-PATCHES-COMMIT-V — Verify Two Commits and Decide Next RAG Gate

Use compact output. No verbose narration. No repeated evidence blocks. No tool-output dumps unless failure occurs. One structured report only.

This is a read-only post-commit verification sprint.

Do not modify files.
Do not generate files.
Do not stage files.
Do not commit files.
Do not amend commits.
Do not clean sandboxes.
Do not run backend.
Do not run ingestion.
Do not query, open, copy, dump, migrate, or mutate live backend/data/yuri.db.
Do not touch .claude/projects/**.
Do not touch archive/transcript policy.
Do not touch .claude/settings.json except read-only diff checks.
Do not stage backend/data/yuri.db-shm or backend/data/yuri.db-wal.
Do not run broad git commands such as git add ., git add -A, git add .claude, git clean, git reset --hard.

Goal:
Verify the latest two commits after manual commit execution:
- 9dc0f871 chore(rag): filter notebook query retrieval to ready sources
- a741664c chore(cli): harden swarm routing for codex offload

Expected repo:
- cwd /Users/marcelspatz/YURI-OS-MUSUBI
- branch main
- HEAD a741664c chore(cli): harden swarm routing for codex offload
- previous commit 9dc0f871 chore(rag): filter notebook query retrieval to ready sources
- staged files none
- target dirty status only backend/data/yuri.db-shm and backend/data/yuri.db-wal

Stage 0 — Preflight

Run:
pwd
git branch --show-current
git log --oneline --decorate -n 7
git diff --cached --name-only
git diff -I '^[[:space:]]*"model":' -- .claude/settings.json
git diff -- .claude/settings.json | grep -E '^[+-][[:space:]]*"model":' || true
git status --short -- .gitignore .claude/settings.json Scripts/ai Scripts/offload-runner.mjs Scripts/offload.sh backend/src/services/notebookService.ts backend/src/services/notebookIngestService.ts backend/src/services/notebookRagService.ts backend/src/services/neuralForgeService.ts backend/src/models/notebookSchema.ts backend/src/models/database.ts backend/data/yuri.db backend/data/yuri.db-shm backend/data/yuri.db-wal

Hard stop if:
- cwd is not /Users/marcelspatz/YURI-OS-MUSUBI
- branch is not main
- HEAD is not a741664c
- any files are staged
- .claude/settings.json has non-model diff
- backend/data/yuri.db is dirty
- any target dirty file other than backend/data/yuri.db-shm and backend/data/yuri.db-wal appears unexpectedly

Stage 1 — Commit scope verification

Run:
git show --stat --oneline --name-only a741664c
git show --stat --oneline --name-only 9dc0f871
git show --stat --oneline --name-only 73ff7ac8

Verify:
- a741664c touches only Scripts/ai, Scripts/offload-runner.mjs, Scripts/offload.sh
- 9dc0f871 touches only backend/src/services/notebookService.ts
- 73ff7ac8 touches only backend/src/services/notebookService.ts and backend/src/services/notebookIngestService.ts

Stage 2 — Backend patch marker verification

Run:
rg -n "ns.status='ready' AND nc.embedding IS NOT NULL|listEmbeddedChunks|getEmbeddedChunks" backend/src/services/notebookService.ts
rg -n "findSourcesByObsidianPath|deleteChunksForSource|replaceChunksForSource|collapseAndReplaceObsidianSource" backend/src/services/notebookService.ts
rg -n "existing.length|canonical|duplicates|collapseAndReplaceObsidianSource|updateSourceStatus\\(canonical.id, 'processing'|updateSourceStatus\\(canonical.id, 'ready'|updateSourceStatus\\(canonical.id, 'error'|embedAllChunks\\(canonical.id" backend/src/services/notebookIngestService.ts
git diff --check -- backend/src/services/notebookService.ts backend/src/services/notebookIngestService.ts

Verify:
- ready-source filter exists exactly in listEmbeddedChunks path
- idempotency markers still exist
- diff check clean

Stage 3 — Swarm/offload patch marker verification

Run:
rg -n "@swarm\\|swarm\\|triage|cleanup_tmpdir|OFFLOAD_OPTIONAL|run_codex_swarm" Scripts/ai
rg -n "SKIPPED_MISSING_ENDPOINT|OFFLOAD_OPTIONAL|dryRun|Missing endpoint for lane|status" Scripts/offload-runner.mjs
rg -n "OFFLOAD_OPTIONAL=1|dispatch_model|classify_lane|swarm" Scripts/offload.sh

Verify:
- Scripts/ai routes @swarm into swarm/triage path
- tmpdir cleanup is guarded
- offload-runner skips optional missing endpoint
- offload.sh propagates OFFLOAD_OPTIONAL=1

Stage 4 — Dry-run smoke only

Run:
AI_DRY_RUN=1 Scripts/ai codex @swarm "Report route only. Do not inspect files. Do not run repo commands."
OFFLOAD_OPTIONAL=1 node Scripts/offload-runner.mjs kimi "probe optional skip"

Expected:
- first command returns route/lane evidence without real model call
- second command returns SKIPPED_MISSING_ENDPOINT and exits cleanly

Stage 5 — Final safety check

Run:
git diff --cached --name-only
git diff -I '^[[:space:]]*"model":' -- .claude/settings.json
git status --short -- .gitignore .claude/settings.json Scripts/ai Scripts/offload-runner.mjs Scripts/offload.sh backend/src/services/notebookService.ts backend/src/services/notebookIngestService.ts backend/src/services/notebookRagService.ts backend/src/services/neuralForgeService.ts backend/src/models/notebookSchema.ts backend/src/models/database.ts backend/data/yuri.db backend/data/yuri.db-shm backend/data/yuri.db-wal

Final report format:
Result
<one label>

Evidence
preflight: <compact facts>
commit scope: <compact facts>
backend patch markers: <compact facts>
swarm/offload patch markers: <compact facts>
dry-run smoke: <compact facts>
staged files after: <none/list>
settings protected diff after: <clean/dirty>
live DB status after: <clean/dirty with WAL note>
unexpected drift: <none/list>

Safety Confirmation
- bullets only

Recommended Next Sprint
<exact sprint name and one-line reason>

Allowed labels:
- 07K_RAG_PENDING_PATCHES_COMMIT_V_PASS_VERIFIED_NEXT_GATE_READY
- 07K_RAG_PENDING_PATCHES_COMMIT_V_BLOCKED_PREFLIGHT
- 07K_RAG_PENDING_PATCHES_COMMIT_V_REPAIR_REQUIRED
- 07K_RAG_PENDING_PATCHES_COMMIT_V_FAIL_SCOPE_DRIFT

If pass, recommend one of:
- 07K-RAG-NOTEBOOK-QUERY-CITATION-UX-P if focusing on citation-before-generation UX
- 07K-RAG-PROVIDER-LOCAL-ONLY-GUARD-P if focusing on embedding/provider fallback safety
- 07K-RAG-LANE-CLOSE-P if summarizing and closing the current RAG gate before next POA step
```
