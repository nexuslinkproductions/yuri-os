# Yuri OS / NUDIMMUD — GPT Session Handoff After 07K RAG Query Hardening

Date: 2026-05-01  
Prepared for: fresh GPT-5.5 / Claude / Codex / Gemini continuation  
Source: current visible GPT session and user-provided direct terminal outputs  
Status: continuity handoff, not an independently executed repo audit  

---

## 1. Purpose

This handoff captures the current Yuri OS / NUDIMMUD state after the 07K RAG notebook query hardening work, including:

- verification of the newer repo state after Codex/offload commits,
- backend-only citation UX repair,
- static verification of citation emission order,
- local-only provider guard for notebook query embeddings,
- static verification of the provider guard,
- known dirty frontend/runtime state that must remain separate.

Use this file to continue in a fresh GPT chat or with Claude/Codex/Gemini without losing the current trusted state.

Do not assume production readiness, full RAG readiness, enterprise readiness, complete sandboxing, complete provider policy, or full Bash/security enforcement.

---

## 2. Latest Trusted Repo State

Direct shell verification after the final accepted gate shows:

```text
repo root: /Users/marcelspatz/YURI-OS-MUSUBI
branch: main
current accepted HEAD: fe97ec8e chore(rag): prevent cloud embedding fallback in notebook query
staged files: none
backend/data/yuri.db: clean
```

Expected dirty/untracked state:

```text
M backend/data/yuri.db-shm
M backend/data/yuri.db-wal
M src/index.tsx
M src/main.ts
?? src/components/NeuralViz/
?? src/yuri/
```

Interpretation:

- WAL/SHM churn is expected and remains unstaged.
- `backend/data/yuri.db` itself is clean.
- `src/index.tsx`, `src/main.ts`, `src/components/NeuralViz/`, and `src/yuri/` are unrelated frontend/worktree drift and must not be touched by RAG backend hardening unless explicitly scoped.
- No staged files remain.

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
```

---

## 3. Important Workflow Lessons From This Session

### 3.1 Swarm/lower-lane summaries were unreliable for code mutation verification

Several `_SYSTEM/Scripts/ai codex @swarm` runs produced plausible but false or incomplete reports.

Examples:

- Citation UX implementation was reported as committed, but direct shell verification showed:
  - HEAD remained `c96c9e89`
  - `notebookRagService.ts` was unchanged
  - citations still emitted before generation
- Provider-guard planning produced contradictory or fabricated-looking evidence:
  - incorrect file/line claims,
  - incorrect safety confirmations,
  - mixed-up `localOnlyMiddleware` locations.

Accepted rule:

```text
For mutation/commit verification, direct shell evidence beats lower-lane generated summaries.
Use swarm for cheap planning/search where appropriate, but verify commits, file status, and patch contents directly.
```

### 3.2 Prefer direct shell for tiny deterministic patch/verification gates

For small exact-path backend edits, direct guarded shell patches worked better than swarm:

- citation UX backend patch
- provider local-only guard patch
- static verification gates

Use `@swarm` again for broader planning/inventory, but not blindly for narrow mutation when exact deterministic shell is cheaper and safer.

---

## 4. Completed / Accepted Gates In This Segment

### 4.1 Old pending commits / newer HEAD verification

Initial expected handoff HEAD was outdated at `a741664c`, but direct shell showed the repo had moved forward.

Accepted result:

```text
07K_RAG_PENDING_PATCHES_COMMIT_V_PASS_VERIFIED_WITH_NEWER_HEAD_C96C9E89
```

Direct evidence:

```text
cwd: /Users/marcelspatz/YURI-OS-MUSUBI
branch: main
HEAD at that point: c96c9e89 chore(node): add CLI wrapper, evidence validator, and offload lane support
staged files: none
dirty targets: backend/data/yuri.db-shm and backend/data/yuri.db-wal only
```

Patch markers verified:

```text
ready-source filter: present
@swarm Codex route: present
SKIPPED_MISSING_ENDPOINT: present
OFFLOAD_OPTIONAL path: present
```

---

## 5. Citation UX Hardening Lane

### 5.1 Initial planning via swarm

Initial swarm run returned conflicting recommendations:

```text
gpt-oss recommendation: Option A — Backend deferred citation emission
ollama recommendation: Option B — Frontend/API error cleanup
```

They also disagreed on abort behavior.

Accepted interpretation:

```text
07K_RAG_NOTEBOOK_QUERY_CITATION_UX_P_REPAIR_REQUIRED_MORE_EVIDENCE
```

A repair attempt through lower lanes failed to collect exact evidence, even though the files existed.

Accepted failure:

```text
07K_RAG_NOTEBOOK_QUERY_CITATION_UX_P_R_FAIL_LOWER_LANES_NO_EVIDENCE
```

### 5.2 Direct evidence scan

Direct shell found the relevant files:

```text
backend/src/models/notebookSchema.ts
backend/src/routes/notebookRoutes.ts
backend/src/services/notebookRagService.ts
backend/src/services/notebookService.ts
src/components/Oracle/NotebookTab/ChatPane.tsx
src/lib/notebookBridge.ts
```

Key direct line evidence before patch:

#### `backend/src/services/notebookRagService.ts`

```text
lines 7–11: RagCitation interface
lines 33–34: streamAnswer starts and destructures callbacks
line 42: query embedding via neuralForge.getEmbedding(query)
lines 50–57: citations emitted before generation
lines 62–75: generation fetch starts later
line 101: assistant message saved
line 102: onDone fires
lines 103–107: AbortError ignored; non-AbortError calls onError
```

#### `backend/src/routes/notebookRoutes.ts`

```text
line 182: RAG stream route uses localOnlyMiddleware
line 192: user message saved
line 197: citation SSE event sent
lines 202–204: error SSE event sent and response ended
```

#### `src/components/Oracle/NotebookTab/ChatPane.tsx`

```text
lines 47–48: assistant placeholder created with citations: []
lines 57–63: citations appended to assistant message as they arrive
lines 70–75: onError replaces content but does not clear citations
lines 99–107: citations rendered when present
```

#### `src/lib/notebookBridge.ts`

```text
lines 156–160: citation event parsed and sent to callback
lines 162–166: done closes EventSource and calls onDone
lines 168–173: error closes EventSource and calls onError
line 175: EventSource onerror calls onError('CONNECTION_LOST')
```

Accepted direct evidence plan:

```text
07K_RAG_NOTEBOOK_QUERY_CITATION_UX_P_R_PASS_REPAIR_PLAN_READY_WITH_DIRECT_EVIDENCE
```

Decision:

```text
Use backend-only deferred citation emission.
Avoid frontend patch because frontend files are already dirty/untracked and out of scope.
```

### 5.3 Citation UX patch

Direct shell patch was applied and committed.

Accepted result:

```text
07K_RAG_NOTEBOOK_QUERY_CITATION_UX_X_PASS_BACKEND_PATCH_COMMITTED_DIRECT
```

Commit:

```text
96af9e09 chore(rag): defer notebook citations until successful answer
```

Commit scope:

```text
backend/src/services/notebookRagService.ts
```

Patch behavior after commit:

```text
lines 50–54: citations are built as data only
lines 59–72: generation starts before citation emission
line 98: saveMessage happens
lines 99–101: citations emitted only after saveMessage
line 102: onDone after citation emission
lines 103–107: catch/AbortError path has no citation emission
```

### 5.4 Citation UX static verification

Accepted result:

```text
07K_RAG_NOTEBOOK_QUERY_CITATION_UX_V_PASS_STATIC_VERIFIED_ACCEPTED
```

Direct verification asserted:

```text
ORDER_OK
citations_built_before_fetch=true
citations_emitted_after_save=true
onDone_after_citations=true
failure_path_no_citations=true
```

Trusted conclusion:

```text
The citation UX backend patch is statically closed.
Runtime/browser/SSE behavior after the patch remains unvalidated and can be deferred because frontend worktree drift is unrelated and out of scope.
```

Boundary:

```text
This fixes backend emission order only.
It does not validate frontend runtime UX in browser.
It does not change frontend state handling.
```

---

## 6. Provider Local-Only Guard Lane

### 6.1 Lower-lane planning failure

Initial swarm provider-guard planning was rejected.

Rejected/failed label:

```text
07K_RAG_PROVIDER_LOCAL_ONLY_GUARD_P_FAIL_LOWER_LANE_UNRELIABLE_EVIDENCE
```

Reason:

- gpt-oss and ollama gave suspicious or incorrect file/line evidence.
- `localOnlyMiddleware` was falsely attributed to `neuralForgeService.ts`.
- planning-only safety confirmations were contradictory.
- both pushed implementation without reliable exact evidence.

### 6.2 Direct provider evidence scan

Direct shell evidence established:

#### `backend/src/services/neuralForgeService.ts`

```text
line 145: ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434'
line 146: cloudEndpoint = process.env.OLLAMA_CLOUD_ENDPOINT || 'https://ollama.com'
line 147: cloudApiKey = process.env.OLLAMA_CLOUD_API_KEY || ''
lines 210–237: getEmbedding implementation before patch
lines 231–233: if local embedding fails and cloudApiKey exists, retries via cloud
line 275: verifyCloudIntegration explicitly tests cloud embedding
```

#### `backend/src/services/notebookRagService.ts`

```text
line 4: OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
line 42: query embedding uses neuralForge.getEmbedding(query)
lines 60–72: generation uses direct OLLAMA_BASE fetch
```

#### `backend/src/routes/notebookRoutes.ts`

```text
line 182: stream route uses localOnlyMiddleware
```

Interpretation:

```text
NotebookRagService generation path is direct Ollama/OLLAMA_BASE.
NotebookRagService query embedding path could fall back to cloud through NeuralForge if local embedding fails and OLLAMA_CLOUD_API_KEY is set.
localOnlyMiddleware guards route access, not NeuralForge provider fallback.
```

Accepted plan:

```text
07K_RAG_PROVIDER_LOCAL_ONLY_GUARD_P_PASS_DIRECT_EVIDENCE_GUARD_PLAN_READY
```

Selected option:

```text
Option B — add NeuralForge getEmbedding allowCloud option and call it with allowCloud:false from NotebookRagService.
```

Target files:

```text
backend/src/services/neuralForgeService.ts
backend/src/services/notebookRagService.ts
```

### 6.3 Provider guard patch

Direct shell patch was applied and committed.

Accepted result:

```text
07K_RAG_PROVIDER_LOCAL_ONLY_GUARD_X_PASS_PATCH_COMMITTED_DIRECT
```

Commit:

```text
fe97ec8e chore(rag): prevent cloud embedding fallback in notebook query
```

Commit scope:

```text
backend/src/services/neuralForgeService.ts
backend/src/services/notebookRagService.ts
```

Patch details:

#### `backend/src/services/neuralForgeService.ts`

```text
lines 46–48: added NeuralEmbeddingOptions with allowCloud?: boolean
line 214: getEmbedding now accepts options: NeuralEmbeddingOptions = {}
line 217: allowCloud = options.allowCloud !== false
lines 221–224: explicit :cloud embedding returns null when allowCloud:false
lines 241–243: local-to-cloud retry only happens when cloudApiKey exists and allowCloud is true
```

#### `backend/src/services/notebookRagService.ts`

```text
line 42: query embedding now calls:
neuralForge.getEmbedding(query, 'nomic-embed-text', { allowCloud: false })
```

### 6.4 Provider guard static verification

Accepted result:

```text
07K_RAG_PROVIDER_LOCAL_ONLY_GUARD_V_PASS_STATIC_VERIFIED_ACCEPTED
```

Direct verification printed:

```text
PROVIDER_GUARD_OK
embedding_options_interface=true
explicit_cloud_block_when_allowCloud_false=true
cloud_retry_guarded_by_allowCloud=true
notebook_query_embedding_allowCloud_false=true
```

Caller inventory after patch:

```text
backend/src/scripts/verifyCloud.ts:29: neuralForge.getEmbedding("Verify Cloud Connectivity", "nomic-embed-text:cloud")
backend/src/services/neuralForgeService.ts:214: getEmbedding(...)
backend/src/services/neuralForgeService.ts:243: recursive cloud retry with options
backend/src/services/neuralForgeService.ts:285: verifyCloudIntegration cloud pulse
backend/src/services/notebookRagService.ts:42: getEmbedding(..., { allowCloud: false })
backend/src/services/vaultIngestion.ts:220: neuralForge.getEmbedding(embedText)
backend/src/services/vaultIngestion.ts:233: neuralForge.getEmbedding(embedText)
backend/src/services/vectorSearchService.ts:33: neuralForge.getEmbedding(query)
backend/src/services/notebookIngestService.ts:195: neuralForge.getEmbedding(chunk.content)
```

Important boundary:

```text
This only closes notebook query embedding cloud fallback.
Other getEmbedding callers remain policy-open and may still cloud-fallback unless separately scoped:
- vaultIngestion.ts
- vectorSearchService.ts
- notebookIngestService.ts
- verifyCloud.ts
- verifyCloudIntegration in NeuralForge
```

---

## 7. Current Composite RAG Status

Current accepted composite status:

```text
LOCAL_RAG_QUERY_PATH_HARDENED_STATICALLY_NOT_FULL_RAG_READY
```

Safe to assume:

```text
- Notebook query retrieval filters to ready sources.
- Notebook query citation emission is deferred until successful answer save.
- Notebook query embedding passes allowCloud:false.
- NeuralForge embedding supports allowCloud:false.
- Notebook query embedding no longer auto-falls back to cloud when local embedding fails and OLLAMA_CLOUD_API_KEY exists.
- Commit scopes for citation and provider guard patches are clean and exact.
```

Not safe to assume:

```text
- Full RAG readiness.
- Production readiness.
- Enterprise readiness.
- Browser/frontend runtime UX after citation deferral.
- NotebookRagService route end-to-end after latest two patches.
- Ingest path provider safety.
- Vector search provider safety.
- Vault ingestion provider safety.
- Cloud/offload readiness.
- Model-bench safety.
- Full sandboxing/prompt-injection safety.
```

---

## 8. Known Open Risks / Follow-Up Candidates

### 8.1 Runtime validation of latest two RAG patches

Still unvalidated after latest commits:

```text
- NotebookRagService query route/runtime after citation deferral.
- SSE event ordering after citation deferral.
- Frontend rendering after citations arrive after tokens.
- Provider guard runtime behavior with OLLAMA_CLOUD_API_KEY present.
- Provider guard runtime behavior with explicit :cloud + allowCloud:false.
```

Recommended only via sandbox or controlled runner, not live DB.

### 8.2 Other `getEmbedding` callers remain policy-open

Open callers:

```text
backend/src/services/vaultIngestion.ts
backend/src/services/vectorSearchService.ts
backend/src/services/notebookIngestService.ts
backend/src/scripts/verifyCloud.ts
backend/src/services/neuralForgeService.ts verifyCloudIntegration
```

These should not be patched automatically. They need separate policy decisions:

```text
- Should vault ingestion be local-only?
- Should vector search be local-only?
- Should notebook ingest be local-only?
- Should cloud verification remain explicitly cloud-allowed?
```

### 8.3 Frontend dirty/untracked work remains separate

Current unrelated drift:

```text
M src/index.tsx
M src/main.ts
?? src/components/NeuralViz/
?? src/yuri/
```

Do not touch in RAG backend hardening lanes unless a dedicated frontend/viz lane is opened.

### 8.4 WAL/SHM churn remains expected

Current DB sidecar drift:

```text
M backend/data/yuri.db-shm
M backend/data/yuri.db-wal
```

Treat as expected while backend owns SQLite. Do not stage. Do not treat as a blocker unless main DB becomes dirty.

---

## 9. Recommended Next Gates

### Option A — Preferred next if continuing RAG hardening

```text
Sprint 07K-RAG-QUERY-HARDENING-RUNTIME-P — Plan Sandbox Runtime Verification For Citation + Provider Guard
```

Purpose:

- Plan a sandbox-only runtime smoke that validates both latest patches together:
  - citation event ordering after successful generation,
  - no citation event on generation failure,
  - no cloud fallback on query embedding when cloud env exists,
  - local-only query still works.
- No live DB.
- No backend restart.
- No cloud/API calls except controlled stub/negative evidence.
- No frontend mutation.

Use direct shell / Codex planning, but require exact paths and no implementation yet.

### Option B — If avoiding runtime tests for now

```text
Sprint 07K-RAG-LANE-CLOSE-POA-P — Plan RAG Lane Closure / Remaining Gates
```

Purpose:

- Summarize what is now validated vs. not validated.
- Decide whether to close the 07K RAG query hardening lane as static-only.
- Create next-phase POA for:
  - runtime sandbox validation,
  - ingestion provider policy,
  - frontend drift classification,
  - full NotebookRagService route validation,
  - lane close.

### Option C — If focusing provider policy broader than notebook query

```text
Sprint 07K-RAG-EMBEDDING-POLICY-P — Plan Remaining getEmbedding Caller Policies
```

Purpose:

- Classify `vaultIngestion`, `vectorSearchService`, `notebookIngestService`, `verifyCloud`, and `verifyCloudIntegration`.
- Decide which should be local-only, explicitly cloud-allowed, or owner-gated.
- Planning-only, no patch.

---

## 10. Recommended Immediate Next Step

Preferred next prompt:

```text
Sprint 07K-RAG-QUERY-HARDENING-RUNTIME-P — Plan Sandbox Runtime Verification For Citation + Provider Guard
```

Why:

- The last two patches are statically verified but not runtime-validated together.
- A sandbox runner can validate both behavior changes without touching live DB or frontend.
- This is safer than immediately patching more embedding callers.

Model/routing suggestion:

```text
Use Codex 5.4-mini high/xhigh for deterministic planning.
Avoid swarm for mutation verification.
Use direct shell evidence for final validation.
```

If Claude is still on cooldown, Codex can do the planning. Execution should be delayed or done with a carefully guarded direct shell prompt after the plan is accepted.

---

## 11. Safety Rules To Preserve

Do not:

```text
- claim production readiness
- claim enterprise readiness
- claim full RAG readiness
- claim full provider safety
- claim full cloud/offload readiness
- claim full sandboxing
- claim prompt-injection safety
- mutate or query live backend/data/yuri.db
- stage WAL/SHM files
- touch frontend drift without a dedicated lane
- touch src/index.tsx or src/main.ts in backend hardening
- touch src/components/NeuralViz/ or src/yuri/ in backend hardening
- run backend restart unless explicitly scoped
- run live ingestion
- call cloud providers in tests
- trust lower-lane generated summaries over direct git/file evidence
- use broad git add/restore/clean/reset commands
```

Do:

```text
- verify cwd and branch before every sprint
- verify HEAD and staged files before mutation
- keep patches exact-path
- verify commit scope directly
- keep WAL/SHM unstaged
- use direct shell for exact verification
- use sandbox/fixture for runtime tests
- preserve frontend drift as out of scope
```

---

## 12. Fresh Chat Opening Prompt

```text
Continue Yuri OS / NUDIMMUD from the uploaded handoff.

Current trusted state:
- repo root: /Users/marcelspatz/YURI-OS-MUSUBI
- branch: main
- current accepted HEAD: fe97ec8e chore(rag): prevent cloud embedding fallback in notebook query
- staged files: none
- backend/data/yuri.db clean
- expected dirty/untracked:
  - backend/data/yuri.db-shm
  - backend/data/yuri.db-wal
  - src/index.tsx
  - src/main.ts
  - src/components/NeuralViz/
  - src/yuri/

Latest accepted gates:
- 07K_RAG_NOTEBOOK_QUERY_CITATION_UX_X_PASS_BACKEND_PATCH_COMMITTED_DIRECT
- 07K_RAG_NOTEBOOK_QUERY_CITATION_UX_V_PASS_STATIC_VERIFIED_ACCEPTED
- 07K_RAG_PROVIDER_LOCAL_ONLY_GUARD_X_PASS_PATCH_COMMITTED_DIRECT
- 07K_RAG_PROVIDER_LOCAL_ONLY_GUARD_V_PASS_STATIC_VERIFIED_ACCEPTED

Important:
- Lower-lane swarm summaries were unreliable for mutation verification in this segment.
- Direct shell evidence is source of truth for commit and patch verification.
- The latest two RAG patches are statically verified, not runtime-validated together.
- Do not touch frontend drift or WAL/SHM.
- Do not claim full RAG, production, or enterprise readiness.

Recommended next gate:
Sprint 07K-RAG-QUERY-HARDENING-RUNTIME-P — Plan Sandbox Runtime Verification For Citation + Provider Guard

Please first acknowledge the trusted state, then give me the next safest planning prompt. Keep it compact and evidence-based.
```
