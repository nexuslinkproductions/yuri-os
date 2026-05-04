# Enterprise Governance Frameworks

Enterprise governance mapping for Yuri OS — a multi-CLI, multi-agent, locally governed AI operating system.

**Date**: 2026-05-04
**advisory_only**: true
**local_truth_claim**: false
**ingestion_status**: REFERENCE_ONLY

## Sources

| URL | Type | Status | Hash |
|-----|------|--------|------|
| https://www.nist.gov/artificial-intelligence/executive-order | official | FETCHED | 035f5421 |
| https://artificialintelligenceact.eu/the-act/ | official | FETCHED | 8f68fbe0 |

Note: NIST AI RMF full PDF (NIST.AI.600-1) is PDF_REFERENCE_PENDING_TEXT_EXTRACTION.

## NIST AI RMF — Yuri Mapping

The NIST AI RMF (govern, map, measure, manage) maps to Yuri OS as:

| NIST Function | Yuri OS Surface |
|
| GOVERN | `_SYSTEM/yuri-origin.md` — canonical origin, authority hierarchy |
| GOVERN | `_SYSTEM/yuri-content-governance.md` — content classification, provenance |
| MAP | `Scripts/yuri-evidence-contract.mjs` — evidence grammar, PASS gate |
| MAP | `_SYSTEM/research-archive/01_source_registry.md` — source tracking |
| MEASURE | `TERM_COUNT` / `FILE_COUNT` / `MATCH` evidence lines — deterministic metrics |
| MANAGE | Fused swarm timeout doctrine (120s, no GNU timeout) |
| MANAGE | Protected surfaces, no auto-commit, mutation contract |

## EU AI Act — Yuri Mapping

Relevant provisions for Yuri OS enterprise readiness:

| EU AI Act Article | Yuri Surface | Status |
|
| Art 10: Data governance | `_SYSTEM/yuri-content-governance.md` — provenance, classification | PLANNED |
| Art 11: Technical documentation | `_SYSTEM/yuri-origin.md`, research archive | CURRENT |
| Art 12: Record-keeping | Evidence contract, summary.json, artifact logs | CURRENT |
| Art 14: Human oversight | advisory_only=true, local_truth_claim=false, no auto-commit | CURRENT |
| Art 15: Accuracy/robustness | Evidence contract PASS gate, TERM_COUNT/FILE_COUNT/MATCH | CURRENT |
| Art 49: Transparency | All model output marked advisory; non-claims required | CURRENT |

## Implications

- Yuri OS already satisfies several EU AI Act governance requirements through origin doc, content governance, and evidence contract.
- Full NIST AI RMF mapping requires the full PDF (pending text extraction).
- Supply-chain / plugin governance (Art 10, SLSA) is documented in 05_supply_chain_provenance.md.
- Prompt injection / security (Art 15, OWASP) is documented in 04_security_prompt_injection_browser_agents.md.

## Non-Claims

- PDF sources are REFERENCE_ONLY until text-extracted and reviewed.
- This is not legal advice. EU AI Act compliance requires certified legal review.
- NIST AI RMF full PDF not yet captured (text extraction pending).
- No RAG ingestion without explicit owner approval.
