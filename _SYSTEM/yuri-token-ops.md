# Yuri Token Ops — Model Routing Doctrine

**advisory_only**: true
**local_truth_claim**: false
**ingestion_status**: REFERENCE_ONLY

## Model Routing Tiers

### Tier 1 — Broad Retrieval (lowest token cost)

Tools: browser-harness, yuri-research-capture.mjs, yuri-research-capture.py, scrapling (Python API)
Use for: source discovery, URL fetch, evidence pack creation
Token cost: ~0 (T1 static) | medium (T2 browser) | high (T3 stealth)

### Tier 2 — Reasoning and Execution

Tools: Claude (Cline), DeepSeek
Use for: file mutation, lane execution, evidence validation, synthesis
Token cost: medium; escalate to Tier 3 only when Tier 2 stalls

### Tier 3 — Deep Synthesis (highest cost)

Tools: browser-harness research packs, NotebookLM
Use for: cross-document briefing, architecture synthesis, compliance mapping
Token cost: high; output is always advisory_only=true

## Routing Rules

- Tier 1 before Tier 2 for all research tasks.
- Tier 3 only after Tier 1 evidence packs are READY_FOR_REVIEW.
- NotebookLM: synthesis-only, not scraper, not authority.
- Model output never becomes local truth without evidence contract verification.
