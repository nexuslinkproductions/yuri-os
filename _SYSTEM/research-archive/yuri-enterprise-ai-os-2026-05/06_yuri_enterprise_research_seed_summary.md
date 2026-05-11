# Yuri Enterprise Research Seed Summary

**Date**: 2026-05-04
**advisory_only**: true
**local_truth_claim**: false
**ingestion_status**: READY_FOR_RAG_AFTER_APPROVAL
**rag_approved_at**: 2026-05-11T16:51:43+02:00
**rag_approved_by**: owner:marcel-spatz

## Sources Attempted

| URL | Result |
|-----|--------|
| https://www.nist.gov/artificial-intelligence/executive-order | FETCHED (HTTP 200) |
| https://genai.owasp.org/ | FETCHED (HTTP 200) |
| https://slsa.dev/spec/v1.0/ | FETCHED (HTTP 200) |
| https://artificialintelligenceact.eu/the-act/ | FETCHED (HTTP 200) |

## PDF Sources Pending Text Extraction

| Expected Source | Status |
|
| NIST AI RMF (NIST.AI.100-1) | EXTRACTED (300 lines, pdftotext) |
| OWASP LLM Top 10 | UNAVAILABLE (404 from source); using HTML capture |
| SLSA v1.0 | UNAVAILABLE (HTML-only source); using web page capture |
| EU AI Act | UNAVAILABLE (HTML-only); EUR-Lex reuse reviewed for curated mapping RAG |

## Yuri Adaptation Backlog

| Item | Priority | Archive File |
|
| NIST AI RMF full mapping | HIGH | 03_enterprise_governance_frameworks.md |
| OWASP LLM full mitigation mapping | HIGH | 04_security_prompt_injection_browser_agents.md |
| SLSA provenance automation | MEDIUM | 05_supply_chain_provenance.md |
| EU AI Act record-keeping automation | MEDIUM | 03_enterprise_governance_frameworks.md |
| Browser capture verification on | MEDIUM | capture-pipeline.md |
| NotebookLM optional synthesis | LOW | (separate lane) |
| RAG ingestion allowlist | DONE | 11_rag_ingestion_approval.md |

## Ready for NotebookLM Synthesis

- All 4 captured source evidence packs
- Archive files 03, 04, 05 (governance, security, supply chain)
- Manifest, source registry, capture pipeline

## RAG Ingestion Status

- Curated archive Markdown is READY_FOR_RAG_AFTER_APPROVAL
- Owner approval for this archive's curated RAG ingestion was granted on 2026-05-11
- Dedicated notebook ingestion is verified in 12_rag_ingested.md
- Raw external sources still require separate approval before direct ingestion
