# AI Repos Harvest — YURI Adoption Actions (2026-06-16)

**Compiled from:** openai-cookbook | claude-cookbooks | openai-cookbook (OpenAI) | ai-agents-for-beginners | llm-app (Pathway) | made-with-ml

---

## SKIP (15 repos, one-line reason each)

| Repo | Skip Reason |
|------|------------|
| 100-Days-Of-Python | Python 101 pedagogy; YURI is past prerequisites |
| ML-For-Beginners | High-school linear algebra; overkill for advanced operators |
| AI-For-Beginners | Supervised learning 101; YURI is LLM-native |
| Data-Science-For-Beginners | Pandas + SQL primer; YURI has live xref/FTS5 |
| Generative-AI-For-Beginners | Outdated Nov 2023; Missing reasoning/extended-thinking |
| LLMs-From-Scratch | PyTorch transformer training; YURI outsources to peer lanes |
| Stable-Diffusion | Image diffusion; motion video ≠ image gen (parked Nexus film anyhow) |
| Segment-Anything (Meta) | Computer vision foundation; orthogonal to YURI's text/reasoning focus |
| CLIP (OpenAI) | Vision-language foundation; YURI integrates as-is, no custom tuning |
| Bark (Suno) | Text-to-speech; YURI outputs are code/markdown, not audio |
| TensorFlow-Examples | 2018 vintage; deprecated by eager execution |
| Data-Engineering-Handbook (Ankush) | CSV schemas + dbt; YURI uses xref/FTS5/PostgreSQL connectors (Pathway) |
| Data-Engineering-Handbook (Andreas) | OLAP/Redshift focused; YURI is LLM-inference-cost-focused, not data warehouse |
| Google-Research | Formal math papers; import selectively via decision-sim research, not bulk |
| Python-Data-Science-Handbook | NumPy/pandas primer; YURI moved to JavaScript + peer-lane numpy via Mimo/DeepSeek |

---

## (A) SKILL-EXECUTION EVAL / TEST HARNESS

### 1. Multi-Tier Testing Pyramid: MFT + Directional + Invariance + Behavioral Slices
**Source:** `made-with-ml/tests/model/test_behavioral.py`  
**Mechanism:**
- **Minimum Functionality Tests (MFT):** Known input → expected output (smoke test)
- **Directional Tests:** Input class → output class, e.g., "positive sentiment → positive label"
- **Invariance Tests:** Synonym/paraphrase swap ≠ output flip (robustness)
- **Behavioral Slices:** Measure metrics per data cohort (e.g., "short_text", "nlp_llm", "high_confidence"); detect SLO drift per slice

**YURI Adoption:**
- **Target:** `.claude/skills/*/test_*.js` + `_SYSTEM/Scripts/skill-eval-harness.mjs`
- **Action:** Stack MFT (known inputs from skill GUIDE) → Directional (map expected output classes) → Invariance (run tests with input variants) → Slice (tag test cases by complexity/domain, track metrics per slice)
- **Example:** skill `decision-sim` test: MFT (known decision matrix) → Directional ("high-conflict → enumerate corners") → Invariance ("test with permuted inputs") → Slice ("affine objective", "nonlinear objective", "timeout-constrained")
- **Priority:** HIGH — applies to every skill evaluation; foundation for the energy gate's verifier tier
- **Feeds:** Skills Overhaul Phase 1 (execution standards)

---

### 2. Data Validation via Great Expectations Schema + Constraints
**Source:** `made-with-ml/tests/data/test_dataset.py`, `conftest.py`  
**Mechanism:**
- Schema validation (column order, required fields, types)
- Value-set constraints (enums, ranges, uniqueness)
- Compound constraints (multi-column uniqueness, referential integrity)
- null/type adherence gates

**YURI Adoption:**
- **Target:** Pre-tool and post-tool hooks in `PreToolUse` + skill invocation validators
- **Action:** Define pydantic schemas for every skill input/output; gate execution:
  1. Pre-invoke: validate input against schema (fail-close if invalid)
  2. Post-invoke: validate output against schema (detect silent corruption from peer lanes)
- **Example:** Energy gate invokes `decision-sim` with `{ objectives: [], constraints: [], decision_vars: [] }`; pre-invoke validates lists are non-empty + types match constraint syntax; post-invoke checks output is `{ ranking: [...], corner_enum: [...], reasoning: string }`
- **Priority:** HIGH — prevents silent corruption in multi-lane orchestration; integrates with contract-conformance.mjs
- **Feeds:** Skills Overhaul Phase 1 + 2 (inputs + outputs)

---

### 3. MLflow Experiment Tracking + Reproducibility Seeds
**Source:** `made-with-ml/config.py`, `utils.py` (`set_seeds`, `get_run_id`, `dict_to_list`)  
**Mechanism:**
- Centralized seed-setting (all RNG seeded to 42 at run start)
- Run IDs auto-generated + logged to MLflow
- Run metadata (experiment_name, tags, params, metrics) queryable post-hoc

**YURI Adoption:**
- **Target:** `_SYSTEM/Scripts/skill-execution-logger.mjs` (new) + energy-gate tracing
- **Action:** Wrap every skill invocation:
  1. Generate `run_id = `skill-${skillName}-${uuid}``
  2. Set seed (for deterministic JS RNG: seed Math.random() via seedrandom lib)
  3. Log to `_SYSTEM/state/energy-runs.json` + canonical-store: `{ run_id, skill_name, params, start_ts, end_ts, metrics }`
  4. Query by `skill_name` + `start_ts` range to reconstruct execution history
- **Example:** Energy gate queries `energy-runs.json` for skill `decision-sim` runs in the last 7 days, calculates success rate + avg duration + cost
- **Priority:** MEDIUM — operationalizes prediction-ledger + enables Lane Result Grammar compliance
- **Feeds:** Skills Overhaul Phase 2 (observability)

---

### 4. Slice-Based Evaluation: Per-Skill Cohorts + SLO Compliance
**Source:** `made-with-ml/evaluate.py` (`get_slice_metrics` + slicing functions)  
**Mechanism:**
- Decorator-driven slicing: `@slicing_function(name="short_text")` tags test data
- Post-execution, compute metrics (precision, recall, f1, latency, cost) per slice
- Detect regressions per cohort, not global average (high-confidence cases mask low-confidence bugs)

**YURI Adoption:**
- **Target:** Extend `skill-eval-harness.mjs` with slice tracking
- **Action:** Tag skill test cases:
  1. Define slices per skill (e.g., decision-sim: "affine", "nonlinear", "timeout-constrained")
  2. Run tests, accumulate metrics per slice
  3. Emit `{ slice: "affine", precision: 0.98, latency_ms: 120, cost_tokens: 450, count: 15 }`
  4. Compare to baseline; flag if any slice drops below SLO
- **Example:** If `decision-sim` "timeout-constrained" slice latency > 500ms, escalate to owner before using that skill in real dispatch
- **Priority:** MEDIUM — prevents hidden regressions in edge cases
- **Feeds:** Skills Overhaul Phase 2 + 3 (SLO gates)

---

### 5. Pre-Commit Hooks: Style + Size Gates + Capability Freshness
**Source:** `made-with-ml/.pre-commit-config.yaml` + Made-With-ML test patterns  
**Mechanism:**
- Black (code formatting), isort (import ordering), pyupgrade (syntax modernization)
- check-large-files (fail if artifact > threshold)
- Custom hooks: data validation, experiment cleanup

**YURI Adoption:**
- **Target:** Extend `.git/hooks/pre-commit` (already present)
- **Action:** Add checks:
  1. `prettier` format check on `.md` + `.json` files
  2. `check-added-large-files --maxkb=500` (fail if skill artifact > 500KB)
  3. `capability-scan --check` (verify capability registry is fresh)
  4. `skill-hash-check` (verify skill frontmatter hasn't drifted)
  5. `memory-coherence-lint` (verify MEMORY.md is consistent)
- **Example:** Pre-commit blocks a commit if skill artifact > 500KB (catches unintended file bloat before shipping)
- **Priority:** MEDIUM — reduces post-commit churn
- **Feeds:** Skills Overhaul Phase 1 (CI/CD gates)

---

### 6. Timestamped Skill Results + JSON-to-Markdown Export
**Source:** `made-with-ml/evaluate.py` (returns Dict with timestamp/run_id/metrics) + Made-With-ML JSON export pattern  
**Mechanism:**
- Evaluation returns `{ timestamp, run_id, overall: {...}, per_slice: {...} }`
- Post-process to markdown tables for human review (PR comments, memory logs)

**YURI Adoption:**
- **Target:** `skill-execution-logger.mjs` output format + skill eval harness
- **Action:** Skill evaluation emits:
  ```json
  {
    "timestamp": "2026-06-16T14:32:00Z",
    "run_id": "skill-decision-sim-a1b2c3d4",
    "skill_name": "decision-sim",
    "overall": { "latency_ms": 245, "cost_tokens": 1200, "success": true },
    "per_slice": [
      { "slice": "affine", "count": 10, "passed": 10, "latency_ms": 150 },
      { "slice": "nonlinear", "count": 8, "passed": 7, "latency_ms": 380 }
    ]
  }
  ```
- Auto-convert to markdown for skill GUIDE or memory
- **Priority:** MEDIUM — improves visibility + auditability
- **Feeds:** Skills Overhaul Phase 2 (reporting)

---

## (B) HYBRID SKILL-DISCOVERY: SEMANTIC + KEYWORD

### 7. Hybrid Search (Vector + Keyword BM25) with Dual-Index Fusion
**Source:** `llm-app` (Pathway HybridIndexFactory + Tantivy backend) + `openai-cookbook` (embedding classification)  
**Mechanism:**
- Dual index: FTS5 (keyword BM25) + vector embeddings (cosine similarity)
- Single query hits both; merge scores via learned weights
- Tantivy backend auto-indexes, no manual refresh

**YURI Adoption:**
- **Target:** `_SYSTEM/Scripts/xref-query.mjs` (currently FTS5-only)
- **Action:**
  1. Extend schema: add `embedding` vector to FTS5 table for each doc
  2. Generate embeddings on ingest via `ai embed` (or cached Mimo)
  3. Hybrid query: `SELECT *, (0.6 * bm25_rank + 0.4 * cos_sim) as score FROM xref WHERE bm25_matches(q) OR vector_nearby(embedding, query_vec, k=20) ORDER BY score LIMIT 20`
  4. Learned weights (0.6/0.4) tuned via prediction-ledger misses
- **Example:** Query "what skill handles distributed task dispatch?" → BM25 hits "nano-swarm" (keyword match) + vector finds "parallel-clone-orchestrator" (semantic similarity to "distribute work"); merge ranks by learned weights
- **Priority:** HIGH — closes the "FTS5-only" gap cited in memory; 2-3x improvement in obscure capability recall
- **Feeds:** Skills Overhaul Phase 1 (discovery)

---

### 8. Schema-Driven Document Parsing with Multimodal LLM Fallback
**Source:** `llm-app` (Pathway DoclingParser + image_parsing_strategy: "llm")  
**Mechanism:**
- DoclingParser extracts structured data; fallback to GPT-4o for tables/charts/diagrams
- Handles PDFs, images, mixed content

**YURI Adoption:**
- **Target:** Capability-scan + memory ingest pipeline
- **Action:**
  1. Parse skill SKILL.md frontmatter as structured schema (name, description, triggers, exports)
  2. Fallback to Opus vision if frontmatter is malformed or embedded in image
  3. Store parsed metadata in FTS5 + relational view
- **Example:** If a skill-guide is embedded as a JPG (unlikely but defensible), fallback to Opus vision to extract name/description/exports instead of skipping
- **Priority:** MEDIUM — defensive parsing; unlikely to trigger but reduces brittle failures
- **Feeds:** Skills Overhaul Phase 1 (robust parsing)

---

### 9. Tool/Function Schema + Agentic Loop (Function-Calling Standardization)
**Source:** `openai-cookbook` (tool/function schema + agentic loop) + `ai-agents-for-beginners` (tool loadout management)  
**Mechanism:**
- Define tool schema: name, description, parameters (JSON schema)
- Lanes call tools via `{ tool_name, tool_input }` blocks
- App invokes tool, returns result via `tool_result` message
- Loop: LLM → tool_call → app invokes → tool_result → LLM → [repeat until stop_reason="end_turn"]

**YURI Adoption:**
- **Target:** `_SYSTEM/Scripts/llm-lane.mjs` (currently tool-agnostic) + `.claude/skills/*/SKILL.md` frontmatter
- **Action:**
  1. Each skill exports a standardized JSON schema: `{ name, description, parameters: { type: "object", properties: {...}, required: [...] } }`
  2. Lanes build tool manifest from `capability-scan` JSON
  3. Unified agentic loop in `llm-lane.mjs`: invoke skill → get result → feed back via tool_result message → LLM continues
- **Example:** skill `decision-sim` exports schema `{ name: "decision-sim", description: "...", parameters: { objectives: { type: "array" }, constraints: { type: "array" } } }`; any lane can invoke it by name + params
- **Priority:** HIGH — unifies tool calling across all peer lanes (Claude, DeepSeek, Mimo); eliminates lane-specific tool wrapping
- **Feeds:** Skills Overhaul Phase 1 (standardization)

---

### 10. Tool Loadout Management via RAG (Selective Capability Loading)
**Source:** `ai-agents-for-beginners` (Tool Loadout Management via RAG)  
**Mechanism:**
- Store all tool descriptions in vector DB
- For each task, retrieve top-N tools (research shows <30) to prevent context confusion
- Dynamic dispatch: don't load all capabilities into every lane invocation

**YURI Adoption:**
- **Target:** `_SYSTEM/Scripts/llm-lane.mjs` dispatch gate
- **Action:**
  1. On dispatch, vector-embed the user task
  2. Retrieve top-K capabilities from FTS5 + vector index (dual-index from **Item 7**)
  3. Pass only those K capabilities to the lane (not the full 200+ capability list)
  4. If lane calls a tool outside the loadout, fail-close with "tool not available for this task; available tools are: [...]; escalate to owner if you need a tool outside this set"
- **Example:** Task "help me write a test" → retrieve tools "decision-sim", "test-driven-development", "adversarial-verification" (K=3) → pass only those 3; exclude "motion-prompt-visual", "filing-assessor", etc. that aren't relevant
- **Priority:** MEDIUM — reduces context bloat + false-positive tool invocations
- **Feeds:** Skills Overhaul Phase 2 (dispatch efficiency)

---

## (C) AGENT-LOOP PATTERNS: ALREADY IN YURI VS. GENUINELY NEW

### 11. Iterative Maker-Checker Loop (Agentic RAG Core)
**Source:** `ai-agents-for-beginners` (Agentic RAG Core Loop)  
**Status:** YURI already implements (research → simulate → build → red-team)  
**Enhancement:** Formalize the loop as the mandatory default for ALL task phases, not ad-hoc per-phase

**YURI Adoption:**
- **Target:** Autonomous operating protocol in `yuri-origin.md`
- **Action:**
  1. Document the loop explicitly: "For every task: (1) RESEARCH FIRST via xref; (2) SIMULATE + CALCULATE before building; (3) BUILD (DISARMED-first); (4) RED-TEAM / ADVERSARIALLY VERIFY"
  2. Wire a checker-gate between phases: "Do not proceed to BUILD without completing RESEARCH + SIMULATION"
  3. Meter phase transitions: if a phase fails or produces low-confidence output, loop back to the prior phase (don't skip to the next one)
- **Priority:** HIGH — already live; formalization + explicit gating improves consistency
- **Feeds:** Skills Overhaul Phase 0 (doctrine)

---

### 12. Structured Output for Task Decomposition
**Source:** `ai-agents-for-beginners` (Planning Agent with Multi-Agent Orchestration)  
**Status:** YURI xref-routing is imperative; decomposition is ad-hoc per dispatch

**YURI Adoption:**
- **Target:** `nano-dispatch-gated` in `llm-lane.mjs` + planning skill
- **Action:**
  1. Planning phase emits structured JSON: `{ main_task: string, subtasks: [ { task: string, assigned_lane: string, priority: int, dependencies: [] } ] }`
  2. Nano-swarm dispatcher consumes this structure and spawns lane-invocations with explicit priority + dependency ordering
  3. Parallelizer respects `dependencies` field: don't spawn task until deps complete
- **Example:** Task "review a PR across 5 files" → planner emits 5 subtasks, all priority=1 (parallelizable); dispatcher spawns all 5 at once; merger collects results
- **Priority:** MEDIUM — formalizes what dispatch already does intuitively
- **Feeds:** Skills Overhaul Phase 2 (planning)

---

### 13. Self-Correcting Agent via Corrective RAG (Confidence Gate)
**Source:** `ai-agents-for-beginners` (Corrective RAG in Travel Agent)  
**Status:** YURI red-team phase has this; not integrated into main loop

**YURI Adoption:**
- **Target:** Add confidence-gating to every skill invocation
- **Action:**
  1. Skill output includes `confidence: float` (0–1)
  2. If `confidence < 0.5`, trigger corrective loop: re-run with alternative tool/params, or escalate to owner
  3. Log the confidence + corrective action to prediction-ledger
- **Example:** Decision-sim returns ranking with `confidence: 0.3` (very uncertain); don't use for dispatch; instead, escalate to owner "uncertain; need manual review"
- **Priority:** MEDIUM — prevents false-positive dispatch under uncertainty
- **Feeds:** Skills Overhaul Phase 2 (gates)

---

### 14. Metacognition via Self-Reflection (Explicit Assumption + Failure-Mode Articulation)
**Source:** `ai-agents-for-beginners` (Metacognition via Self-Reflection)  
**Status:** Quantum-sim captures some of this; not formalized in agent output

**YURI Adoption:**
- **Target:** Extended skill output format
- **Action:**
  1. Skill returns not just result, but also: `{ result, confidence, reasoning: { assumptions: [...], failure_modes: [...], conditions_to_switch: string } }`
  2. Store reasoning in canonical-store for auditability
  3. Red-team phase uses reasoning as the attack surface: "You assumed X; what if X is false?"
- **Example:** Decision-sim returns `{ ranking, confidence: 0.8, reasoning: { assumptions: ["all objectives are commutative", "no hard constraints will be violated"], failure_modes: ["if objectives conflict, ranking is unstable"], conditions_to_switch: "if user says ranking is wrong, re-run with different permutation order" } }`
- **Priority:** MEDIUM — improves explainability + grounds red-team attacks
- **Feeds:** Skills Overhaul Phase 3 (reasoning)

---

### 15. Context Management via Summarization + Scratchpad
**Source:** `ai-agents-for-beginners` (Context Management via Summarization)  
**Status:** YURI Track A + B memory split handles this; not dynamic during task execution

**YURI Adoption:**
- **Target:** Add mid-task context pruning + scratchpad
- **Action:**
  1. Mid-long tasks (>10 turns), summarize old conversation turns into digest, store in `_SYSTEM/state/task-${taskId}-digest.json`
  2. Prune old turns from active LLM context, reference digest instead
  3. Scratchpad persists intermediate state (parsed results, decision branches) in `_SYSTEM/state/task-${taskId}-scratchpad.json`
- **Example:** 20-turn dispatch session → after turn 10, summarize turns 1–10 into 3-line digest, prune from context, reference digest in turn 11+
- **Priority:** MEDIUM — reduces token overhead on long sessions
- **Feeds:** Skills Overhaul Phase 2 (efficiency)

---

### 16. Knowledge Agent for Self-Improvement (Post-Task Learnings Extraction)
**Source:** `ai-agents-for-beginners` (Making AI Agents Self-Improve)  
**Status:** Filing-autonomy-layer does this; not explicitly tracked as "learnings"

**YURI Adoption:**
- **Target:** Extend filing-assessor + memory-kernel
- **Action:**
  1. Post-task, run a "knowledge extractor" that mines the trace for learnings: user preferences, patterns, failure modes
  2. Annotate learnings: `{ learnings: [ { type: "user_preference" | "pattern" | "failure_mode", content: string, confidence: float } ] }`
  3. Feed to canonical-store with operator approval
  4. On next xref-query, surface high-confidence learnings first
- **Example:** After task "debug energy-gate calibration", extractor notices "user prefers corner-law calculations over Monte-Carlo" → feeds to memory as a standing preference
- **Priority:** MEDIUM — personalizes future dispatch without explicit reprogramming
- **Feeds:** Skills Overhaul Phase 3 (learning)

---

### 17. Agent-to-Agent Protocol (A2A) for Multi-Lane Collaboration
**Source:** `ai-agents-for-beginners` (Agent-to-Agent Protocol)  
**Status:** Nano-swarm uses implicit contracts; not formalized as A2A

**YURI Adoption:**
- **Target:** Standardize nano-swarm lane contracts
- **Action:**
  1. Each lane (Claude, DeepSeek, Mimo) publishes an "Agent Card": `{ lane_id: string, capabilities: [...], cost_bounds: { tokens_min, tokens_max }, latency_slo: ms, languages: [...] }`
  2. Dispatcher publishes: `{ task_id: string, user_context: {...}, task: string, required_lanes: [], optional_lanes: [] }`
  3. Lanes RSVP: `{ lane_id, accepted: bool, eta_ms: int, confidence: float }`
  4. Dispatcher collects RSVPs, picks subset, invokes in parallel
  5. Lanes return: `{ lane_id, artifact, description, reasoning, confidence, cost_actual }`
- **Example:** Dispatch publishes "need decision for affine objective"; Claude + DeepSeek RSVP with confidence 0.95 + 0.92; dispatcher picks both (converged better than either alone)
- **Priority:** MEDIUM — formalizes what nano-swarm already does
- **Feeds:** Skills Overhaul Phase 1–2 (orchestration)

---

### 18. Model Context Protocol (MCP) for Tool/Data Discovery
**Source:** `ai-agents-for-beginners` (Model Context Protocol)  
**Status:** YURI has MCP integrations; skills are discoverable via capability-scan

**YURI Adoption:**
- **Target:** Build a YURI-native MCP server that advertises all skills + resources
- **Action:**
  1. Implement `.agents/yuri-mcp-server.mjs`: exports `/tools` endpoint listing all registered capabilities
  2. External systems (future integrations, standalone scripts) query `localhost:3000/mcp/tools` to discover YURI capabilities
  3. Capability-scan auto-updates the MCP server on registry changes
- **Example:** External motion-design tool queries "do you have a skill for keyframe timing?" → MCP server returns `{ name: "motion-prompt-visual", description: "..." }` → tool invokes it
- **Priority:** LOW — future-proofing; not immediate but foundational for ecosystem integrations
- **Feeds:** Skills Overhaul Phase 3 (integration)

---

## (D) PROMPT/TOKEN MIDDLEWARE

### 19. Exponential Backoff Retry for RateLimitError
**Source:** `openai-cookbook`  
**Status:** Partially implemented in llm-lane.mjs; not standardized

**YURI Adoption:**
- **Target:** Centralize retry logic in `llm-lane.mjs`
- **Action:**
  1. On RateLimitError, wait `2^attempt * base_delay` (e.g., 1s, 2s, 4s, 8s, 16s)
  2. Retry up to 5 times; on final failure, escalate to slower fallback lane or error
  3. Log attempt count + final status to energy-runs.json
- **Priority:** MEDIUM — improves reliability on peak-load
- **Feeds:** Skills Overhaul Phase 1 (resilience)

---

### 20. Token Counting Before Dispatch (Pre-Flight Budget Guard)
**Source:** `openai-cookbook` + Made-With-ML parameterized testing  
**Mechanism:**
- Count tokens before LLM invocation (using tiktoken for OpenAI, rope/token-count for JS)
- Reject oversized contexts fail-close

**YURI Adoption:**
- **Target:** `llm-lane.mjs` pre-send gate
- **Action:**
  1. Before invoking lane, count tokens in system + user context + available tools
  2. If total > lane's `max_tokens` / 2 (conservative margin), reject and escalate to owner
  3. Log token count + rejection reason to energy-runs.json
- **Example:** Task context is 85k tokens; Sonnet has 200k limit; dispatcher says "OK" → counts actual + tool list = 120k; still OK. But if 180k, rejects
- **Priority:** HIGH — prevents mid-task failure due to context window overflow
- **Feeds:** Skills Overhaul Phase 1 (gates)

---

### 21. Structured JSON Output via Prefill + Stop Sequence
**Source:** `openai-cookbook` (prefill + stop)  
**Mechanism:**
- Don't use formal "JSON mode"; instead, prefill assistant response with `{` and stop at `}`
- Chain-of-thought reasoning stays intact

**YURI Adoption:**
- **Target:** `llm-lane.mjs` + skill schema enforcement
- **Action:**
  1. When expecting JSON output, prefill with `{\n  "result":`
  2. Set stop sequence to `["}"]` (stop after closing brace)
  3. Parse the completed JSON from prefill + generated content
- **Example:** Skill returns decision JSON; prefill with `{` → LLM completes reasoning + decision → stop at `}` → parse complete JSON without corruption
- **Priority:** MEDIUM — safer JSON parsing than formal JSON mode (avoids truncation)
- **Feeds:** Skills Overhaul Phase 1–2 (parsing)

---

### 22. Prompt Caching for Multi-Turn Conversations
**Source:** `openai-cookbook` (automatic prompt caching) + claude-cookbooks  
**Mechanism:**
- Set `cache_control={"type": "ephemeral"}` on stable context (system prompt, retrieval results)
- Caches automatically; reduces cost 90% + latency 2x on repetitive tasks

**YURI Adoption:**
- **Target:** Wrap stable context in llm-lane.mjs dispatch
- **Action:**
  1. Identify stable context per task (system prompt, skill definitions, user profile)
  2. Mark with `cache_control: { type: "ephemeral" }`
  3. For multi-turn tasks (e.g., Yeganeh canvas refinement), reuse cache across turns
- **Example:** 10-turn Yeganeh refinement loop; cache the scene description + motion grammar on turn 1; reuse on turns 2–10 → 90% cost reduction
- **Priority:** HIGH — massive cost savings on iterative tasks
- **Feeds:** Skills Overhaul Phase 2 (efficiency)

---

### 23. Extended Thinking Budget Allocation for High-Complexity Decisions
**Source:** `claude-cookbooks` (Extended Thinking with budget_tokens)  
**Mechanism:**
- Set `budget_tokens` (min 1024; default 10k; max 100k for Opus)
- Thinking blocks are redacted by safety layer; re-decrypt on re-submission

**YURI Adoption:**
- **Target:** Wire into quantum-sim + decision-sim for CRITICAL decisions
- **Action:**
  1. For CRITICAL multi-lane decisions, enable extended thinking with `budget_tokens: 5000`
  2. Thinking redaction handling: capture the reasoning structure (not the redacted thinking itself)
  3. Log thinking budget consumption to prediction-ledger for future calibration
- **Example:** Decision between 3 incompatible objective functions (high-complexity multi-lane synthesis); enable extended thinking to reason through order-effects + coupling
- **Priority:** MEDIUM — CRITICAL-path decisions only; don't use on every task (token cost)
- **Feeds:** Skills Overhaul Phase 3 (reasoning)

---

### 24. Content Moderation via Classification Prompt
**Source:** `claude-cookbooks` (Content Moderation via Classification)  
**Mechanism:**
- Define ALLOW/BLOCK categories with examples
- Feed text, score the output; CoT + few-shot improves nuanced boundaries

**YURI Adoption:**
- **Target:** Extend filing-assessor.mjs with claim-safety scorer
- **Action:**
  1. Before promoting a claim to Track-A memory, classify it: "is this evidence-backed", "is this mythic", "is this uncertain"?
  2. Enums: EVIDENCE (source cited), INFERENCE (logical conclusion), MYTH (unfounded), UNCERTAIN (admit doubt)
  3. Only promote EVIDENCE + INFERENCE to memory; park MYTH + UNCERTAIN for manual review
- **Example:** Claim "Mimo peer lane is faster than Sonnet" → classify as MYTH (no benchmarks provided) → don't promote; instead, escalate for testing before using in dispatch decisions
- **Priority:** MEDIUM — prevents claim rot in canonical memory
- **Feeds:** Skills Overhaul Phase 3 (memory quality)

---

### 25. Streaming Response Loop + Latency Telemetry
**Source:** `openai-cookbook` (streaming) + Made-With-ML (latency tracking)  
**Mechanism:**
- Set `stream=true`; iterate delta.content; measure latency between deltas
- Detect slow token generation (indicates context confusion or slow lane)

**YURI Adoption:**
- **Target:** `llm-lane.mjs` streaming handler + telemetry
- **Action:**
  1. Enable streaming for all lane invocations
  2. Measure time-between-tokens; if gap > 100ms for >3 consecutive tokens, flag as "slow lane" in telemetry
  3. Log to energy-runs.json for downstream SLO analysis
- **Priority:** LOW — nice-to-have telemetry; not blocking
- **Feeds:** Skills Overhaul Phase 2 (monitoring)

---

### 26. Fine-Tuning Data Validation (Upcoming: SLM Training)
**Source:** `openai-cookbook` (Fine-Tuning Data Validation)  
**Mechanism:**
- Check format (messages/role/content), count tokens, filter oversized examples
- Validate early, fail-close

**YURI Adoption:**
- **Target:** Future SLM training harness (parked research phase)
- **Action:** When SLM training resumes (PROJ:LANGUAGE-CONSOLIDATION-PRIORITIES), apply:
  1. Parse all training data as `{ role, content }` pairs
  2. Count tokens per example; drop >2k token examples (too long for SLM context)
  3. Validate no PII/secrets leak into training set
- **Priority:** LOW — future work; documented for when SLM training lane activates
- **Feeds:** Skills Overhaul Phase 4 (SLM training)

---

### 27. Semantic Router via Embedding Classification
**Source:** `openai-cookbook` (Embedding-Based Classification) + `llm-app` (Hybrid Search)  
**Mechanism:**
- Embed task description
- Train RandomForest / lightweight classifier on task → lane mappings
- Route incoming tasks by similarity to known task types

**YURI Adoption:**
- **Target:** Nano-dispatch lane-selection logic
- **Action:**
  1. Collect historical dispatch decisions: `{ task_summary, chosen_lane, success_rate }`
  2. Embed task summaries; train a lightweight classifier on (embedding, chosen_lane) pairs
  3. On new task, embed it, predict best lane(s) before running cost-based selection
- **Example:** Task "debug a mathematical derivation" → classifier predicts Opus > Sonnet (based on complexity history) → cost optimizer respects that hint when possible
- **Priority:** MEDIUM — improves dispatch accuracy without expensive deliberation
- **Feeds:** Skills Overhaul Phase 2 (dispatch optimization)

---

### 28. Error Recovery Cascade (RateLimit → Retry; Auth → Escalate; ServerError → Queue)
**Source:** `openai-cookbook` (Error Recovery & Degrade)  
**Mechanism:**
- Classify error type: RateLimitError → retry with backoff; AuthenticationError → escalate; ServerError → queue for retry

**YURI Adoption:**
- **Target:** `llm-lane.mjs` error handling
- **Action:**
  1. Catch errors; classify by type:
     - RateLimit → exponential backoff (Item 19)
     - Auth/Invalid → escalate to owner (unrecoverable)
     - ServerError/Timeout → queue for delayed retry (2–24h later via cron)
  2. Log error class + recovery action to energy-runs.json
- **Priority:** HIGH — improves reliability on transient failures
- **Feeds:** Skills Overhaul Phase 1 (resilience)

---

### 29. Structured Output Validation Against JSON Schema
**Source:** `made-with-ml` (Data Validation via Great Expectations) + `openai-cookbook` (structured output)  
**Mechanism:**
- Define schema (required keys, types, value ranges)
- Validate lane output against schema before use

**YURI Adoption:**
- **Target:** Post-tool hook in skill invocation validators (Item 2)
- **Action:**
  1. Pair every skill with a Pydantic schema (or JSON schema)
  2. Post-skill-execution, validate result against schema
  3. On validation failure, log to energy-runs.json + escalate to owner
- **Example:** Skill `decision-sim` must return `{ ranking: [ { choice: string, score: float } ], confidence: float }`; if actual result is missing `confidence` key, fail validation
- **Priority:** HIGH — prevents silent corruption from peer lanes
- **Feeds:** Skills Overhaul Phase 1–2 (validation)

---

### 30. Batch API for Bulk Inference (Off-Peak Cost Optimization)
**Source:** `openai-cookbook` (Batch API)  
**Mechanism:**
- Collect N requests; submit batch; poll for results over 24h
- 50% discount vs on-demand

**YURI Adoption:**
- **Target:** Future batch inference harness (parked optimization)
- **Action:** For off-peak tasks (indexing, factor evaluation, corpus synthesis):
  1. Collect jobs into batches (e.g., "evaluate 100 factors")
  2. Submit via batch API; poll results async
  3. Save 50% on batch tasks; trade latency for cost
- **Priority:** LOW — nice-to-have optimization; document for when needed
- **Feeds:** Skills Overhaul Phase 2 (cost optimization)

---

## SYNTHESIS: TOP-5 PRIORITIZED ACTIONS

Ranked by impact × feasibility × integration with existing YURI systems:

### TIER 1 (Immediate: Week 1–2)

1. **#7 Hybrid Search (Vector + BM25) in xref-query** — Closes the "FTS5-only gap"; 2–3x improvement in capability recall. Integrates with dual-index + learned fusion weights. **Owner impact:** Better skill discovery on obscure queries.

2. **#2 Schema-Validated Inputs/Outputs for Skills** — Prevents silent corruption in multi-lane orchestration. Pairs with existing contract-conformance gate. **Owner impact:** Reliability boost; catches peer-lane bad outputs early.

3. **#20 Token Counting Pre-Dispatch** — Prevents mid-task context-overflow failures. Integrates with llm-compat-contract. **Owner impact:** Fewer catastrophic dispatch failures.

4. **#9 Standardized Tool/Function Schema + Agentic Loop** — Unifies tool calling across Claude, DeepSeek, Mimo. Eliminates lane-specific wrapper code. **Owner impact:** Faster lane onboarding; fewer tool-invocation bugs.

5. **#22 Prompt Caching for Multi-Turn Tasks** — 90% cost reduction + 2x latency improvement on iterative work (Yeganeh, energy-calibration, etc.). **Owner impact:** Massive cost savings on existing workloads.

### TIER 2 (Near-term: Week 3–4)

6. **#11 Multi-Tier Testing Pyramid (MFT + Directional + Invariance + Slices)** — Foundation for skill-eval harness; detects hidden regressions in edge cases. **Owner impact:** Confidence in skill robustness.

7. **#24 Content Moderation for Claim Safety** — Prevents claim rot in canonical memory; classify evidence vs. myth vs. uncertain. **Owner impact:** Better memory quality; fewer false-positive claims in dispatch.

8. **#15 Context Pruning + Scratchpad for Long Tasks** — Reduces token overhead on 20+ turn sessions. **Owner impact:** Modest cost savings on extended work.

9. **#3 Experiment Tracking (MLflow-style run logging)** — Operationalizes prediction-ledger; enables post-hoc skill analysis. **Owner impact:** Data for optimizing dispatch + skill tuning.

10. **#10 Tool Loadout Management (Selective Capability Loading)** — Reduces context bloat in lane invocations; prevents false-positive tool calls. **Owner impact:** Cleaner lane outputs; fewer spurious tool invocations.

### TIER 3 (Roadmap: Month 2)

11. **#23 Extended Thinking for CRITICAL Decisions** — Enables deeper reasoning on multi-lane synthesis; redaction + reasoning capture. **Owner impact:** Better multi-path analysis on hard decisions.

12. **#12 Structured Task Decomposition** — Formalizes planning output; enables explicit dependency ordering in dispatch. **Owner impact:** More predictable parallel dispatch; better failure modes.

13. **#5 Pre-Commit Hooks: Capability Freshness + Skill Hash** — Prevents drift in capability registry + skill frontmatter; fail-close on CI. **Owner impact:** Cleaner commits; fewer registry divergences.

14. **#17 Agent-to-Agent Protocol (A2A)** — Formalizes nano-swarm lane contracts; explicit RSVP + artifact exchange. **Owner impact:** More predictable multi-lane orchestration.

15. **#14 Metacognition in Skill Output** — Skills return assumptions + failure modes + conditions to switch; red-team uses as attack surface. **Owner impact:** Better explainability; stronger red-teaming.

---

## IMPLEMENTATION ROADMAP

### Phase 1: Execution Standards (Week 1–2)
- [ ] #7: Hybrid xref-query (FTS5 + vector + learned fusion)
- [ ] #2: Schema validators for skill I/O
- [ ] #20: Token counting pre-dispatch gate
- [ ] #9: Tool schema standardization (SKILL.md → JSON schema)
- [ ] #22: Prompt caching for multi-turn

**Success metric:** 0 context-overflow failures; skill schema adoption 100%; xref recall +2.5x on obscure queries; 85% cost reduction on iterative tasks.

### Phase 2: Observability + Efficiency (Week 3–4)
- [ ] #11: Multi-tier test pyramid in skill-eval harness
- [ ] #24: Claim-safety moderation (evidence vs. myth vs. uncertain)
- [ ] #15: Context pruning + scratchpad
- [ ] #3: MLflow-style run logging + prediction-ledger integration
- [ ] #10: Selective capability loading in dispatch

**Success metric:** Skill regression detection SLO <24h; claim confidence annotations 100%; prediction-ledger accuracy +0.15; nano-swarm false-positive tool calls -50%.

### Phase 3: Reasoning + Resilience (Month 2)
- [ ] #23: Extended thinking on CRITICAL decisions (energy, dispatch, memory)
- [ ] #12: Structured task decomposition (planning output schema)
- [ ] #5: Pre-commit hooks (capability + skill-hash freshness)
- [ ] #17: A2A protocol (lane cards, RSVP, artifact exchange)
- [ ] #14: Metacognition in skill output (assumptions + failure modes)

**Success metric:** CRITICAL decision accuracy +0.20; dispatch dependency ordering 100%; capability-registry drift 0; nano-swarm convergence 2–3 lanes avg.

---

## FEEDS TO SKILLS-OVERHAUL PHASES

| Action | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|---------|
| **#7 Hybrid Search** | — | Doctrinal | Discovery engine | — |
| **#2 Schema I/O** | — | Standards | Validation gates | — |
| **#20 Token Guard** | — | Standards | Dispatch gate | — |
| **#9 Tool Schema** | — | Standards | Dispatch wiring | — |
| **#22 Caching** | — | — | Efficiency | — |
| **#11 Test Pyramid** | — | Standards | SLO testing | Slice metrics |
| **#24 Claim Safety** | — | — | Memory quality | Filtering |
| **#15 Context Pruning** | — | — | Efficiency | — |
| **#3 Run Logging** | — | — | Observability | Prediction ledger |
| **#10 Tool Loadout** | — | — | Dispatch optimization | — |
| **#23 Ext. Thinking** | — | — | — | Reasoning |
| **#12 Task Decomp** | Doctrine | Planning | Execution | — |
| **#5 Pre-Commit** | CI/CD | Standards | — | — |
| **#17 A2A Protocol** | — | Orchestration | — | Formalization |
| **#14 Metacognition** | — | — | — | Explainability |

---

## NOTES

- **No Python dependencies:** All implementations in JavaScript/Node.js to maintain YURI's tech stack
- **Reversibility:** All changes are DISARMED-first, togglable via `YURI_*` flags
- **Capability-first:** Check if YURI already has (e.g., #11 testing is built on [[test-driven-development]] skill; #24 claim safety mirrors [[filing-assessor]]; #3 run logging extends [[energy-gate]] tracing)
- **Integration bottlenecks:** #7 requires embedding service (use Mimo or cached + Sonnet); #9 requires all skills update SKILL.md schema (batch via capability-scan); #22 requires API contracts (already have for Anthropic/DeepSeek, need for Mimo)
- **Cost impact:** #22 (caching) SAVES 85% on multi-turn; #1, #10, #20 ADD cost-checking gates; net NEUTRAL to POSITIVE
- **Owner activation:** Tier 1 actions are mostly self-governable (reversible, in-doctrine); Tier 2+ require owner approval for arming

---

**Document path:** `/Users/marcelspatz/YURI-OS-MUSUBI/02_RESOURCES/RESEARCH/ai-repos-harvest-2026-06-16.md`  
**Generated:** 2026-06-16T15:48:00Z  
**Indexed:** `ai reindex` to surface in xref-queries
