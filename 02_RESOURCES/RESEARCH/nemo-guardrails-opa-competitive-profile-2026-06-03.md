# NeMo Guardrails + OPA/Rego — Competitive Profile vs YURI (2026-06-03)

Primary-source recon for head-to-head. Two bundled targets: NVIDIA NeMo Guardrails (LLM rail engine) + Open Policy Agent / Rego (CNCF policy engine used as agent guardrail).

## NeMo Guardrails — mechanism

- Apache-2.0, Python. Repo: github.com/NVIDIA-NeMo/Guardrails. Latest stable v0.17.0 (Oct 2025) / v0.20.0 (Jan 2026); develop at 0.21.x. NVIDIA states it is **beta, not recommended for production as-is**.
- Five rail categories: input, dialog, retrieval, execution (tool), output. Configured in `config.yml` as lists of Colang flow names.
- Colang 1.0 + 2.0 (2.0 = rewritten flows engine, parallel flows, event-stream pattern matching).
- **Dialog rail runtime = 3 LLM calls/turn** (src: docs/architecture README): (1) `generate_user_intent` — KNN vector search over canonical-form examples, top-5 into prompt, LLM produces canonical form; (2) `generate_next_step` — vector search top-5 flows, LLM predicts next step (unless a hardcoded flow matches); (3) `generate_bot_message` — vector search example messages, LLM writes utterance. CoT-chained, **cannot be batched** (arXiv 2310.10501).
- self-check input/output rails = LLM grades the text → non-deterministic + expensive; jailbreak heuristics added as low-latency alternative; LFU caches added for safety models.
- Parallel rails: `parallel: true` boolean per rail type (input/output/ToolInput/ToolOutput) in config.py (RailsConfig). `speculative_generation`, output streaming `chunk_size`/`context_size`/`stream_first`.
- LangChain/LangGraph: `RunnableRails` (nemoguardrails/integrations/langchain/runnable_rails.py) wraps any Runnable. `_transform_input_to_rails_format`, `_full_rails_invoke` → `rails.generate()`, `_format_output`. Tools via `register_action`; `tool_calls_to_langchain_format`. passthrough=True required for tool calling. Full Runnable protocol (invoke/stream/batch/async). OpenTelemetry tracing.
- **Vulnerabilities (cited):** inserting benign docs into guardrail context flips input/output judgments ~11%/~8% (context manipulation). One controlled benchmark (480 queries) → 46.34% bypass rate. Accuracy is model+prompt dependent.

## OPA / Rego — mechanism

- Apache-2.0, Go. github.com/open-policy-agent/opa. ~11.8k stars. v1.17.0 (May 28 2026). **CNCF Graduated** (since Jan 29 2021).
- Rego declarative policy: input(JSON) + data + rules → decision. `default allow := false` = fail-closed default-deny. Deterministic given input+data.
- Deploy modes: REST API server, Go SDK/library, sidecar (esp. with K8s admission + MCP servers), WASM-compiled bundles, OPA bundle distribution.
- Agent guardrail pattern (codilime, Apr 2026): OPA sidecar beside MCP server as central decision point; 3-layer single-query authz (tool access / device access ABAC / command authz); "all layers must pass" or structured-reason denial.
- yaml-opa-llm-guardrails (MIT, ~5 stars, early-stage): compiles YAML guardrail defs (length/regex/topic/PII) → Rego bundles via Jinja2; FastAPI middleware. Demonstrates OPA for LLM output filtering but immature.
- OPAL (permitio, MIT): real-time policy+data push over websocket pubsub to OPA agents. Used at Tesla/Walmart/NBA/Intel/Cisco. Not CNCF.

## Head-to-head vs YURI

YURI ahead:
- Deterministic fail-closed PreToolUse hooks vs NeMo's non-deterministic LLM rails (11%/8% flip, 46% bypass benchmark). OPA matches determinism but is generic, not LLM-aware and ships no rails.
- Lyapunov energy function (computeU, 9 epistemic terms, ΔU descent, 5k+ transitions/day) — NO equivalent in either. Neither models work-dynamics or epistemic state; both are point-in-time gates.
- Subconscious FSRS forgetting, two-track memory, cognitive protocols (Haki/Izanagi/etc), SHA-256 skill integrity — out of scope for both competitors.
- Runs fully local, no LLM-call latency tax per decision.

Where they beat YURI / YURI missing:
- OPA: battle-tested deterministic policy engine, CNCF-graduated, decouple decision-from-enforcement, Rego is a real expressive policy DSL with partial eval + WASM + bundle distribution + OPAL live updates. YURI's governance = hardcoded JS hooks + a deny-list, NOT a policy-as-data language. No hot policy reload, no external policy authoring, no bundle distribution.
- NeMo: content-aware semantic rails (topic/jailbreak/PII/factcheck/hallucination), multi-turn dialog-state injection tracking, retrieval rails for RAG, OpenTelemetry tracing, LangChain/LangGraph native middleware, streaming output rails with token-chunk re-check. YURI has none of the semantic/content moderation layer — its gates are structural/operational (paths, ops, creds), not "is this text toxic/jailbroken."
- Both have a real ecosystem + adoption; YURI is single-operator.

## Ideas YURI should adopt
1. Policy-as-data layer (Rego-style / embed OPA or a Rego-subset) so governance rules are authored/hot-reloaded as data, not hardcoded JS. Effort: high. Keeps fail-closed determinism but adds expressiveness + external authoring + auditability.
2. Output/content semantic rail tier as an OPTIONAL pluggable layer above the deterministic hooks (topic/PII/jailbreak) for when YURI guards generated text, not just tool ops. Effort: medium.
3. OpenTelemetry trace export for the energy/ΔU stream (NeMo exports rail traces via OTel) → standard observability tooling instead of bespoke JSONL. Effort: low-medium.
4. Parallel rail execution pattern for independent PreToolUse checks (NeMo's `parallel: true`). Effort: low.
5. Reframe the energy instrument as the differentiator NEITHER competitor has — work-dynamics governance, not point-gate governance.

## Sources
- github.com/NVIDIA-NeMo/Guardrails (README, config.py, runnable_rails.py, docs/architecture/README.md)
- docs.nvidia.com/nemo/guardrails (overview, runnable-rails, langgraph-integration, jailbreak heuristics)
- arXiv 2310.10501 (NeMo EMNLP 2023 paper)
- github.com/open-policy-agent/opa ; openpolicyagent.org/docs/policy-language
- codilime.com/blog/why-use-open-policy-agent-for-your-ai-agents (Apr 2026)
- github.com/aatakansalar/yaml-opa-llm-guardrails ; github.com/permitio/opal
- cncf.io/projects/open-policy-agent-opa ; digitalapplied.com LLM Guardrails 2026 (bypass/flip benchmarks)
