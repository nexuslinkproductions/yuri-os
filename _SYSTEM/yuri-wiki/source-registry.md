# Yuri LLM Wiki Source Registry Mirror

**advisory_only**: true
**local_truth_claim**: false
**ingestion_status**: `REFERENCE_ONLY`
**mirror_of**: `_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/01_source_registry.md`

## Purpose

This page mirrors the research-archive source registry into the wiki control plane.
It is a reference surface only. It does not claim raw authority, does not imply RAG eligibility, and does not replace the archive record.

## Source Status Values

| Status | Meaning |
|---|---|
| PLANNED | Identified but not yet fetched |
| FETCHED | Captured to evidence pack |
| FETCH_FAILED | Source returned error; not captured |
| PDF_REFERENCE | PDF pending text extraction |
| READY_FOR_REVIEW | Reviewed, ready for human review |
| READY_FOR_RAG_AFTER_APPROVAL | Approved for RAG ingestion |
| REFERENCE_ONLY | Archived, not eligible for RAG |
| DO_NOT_INGEST_RAW | Raw source only; no RAG unfiltered |

## Sources

| URL | Tier | Type | Status | Hash | License Note | Confidence |
|---|---|---|---|---|---|---|
| https://www.nist.gov/artificial-intelligence/executive-order | 2 | official | FETCHED | 035f5421 | US Gov, public domain | medium |
| https://genai.owasp.org/ | 2 | standard | FETCHED | 5ad364bc | CC-BY-SA 4.0 | medium |
| https://slsa.dev/spec/v1.0/ | 2 | standard | FETCHED | 67cd1f21 | Apache 2.0 | medium |
| https://artificialintelligenceact.eu/the-act/ | 2 | official | FETCHED | 8f68fbe0 | EU, public (educational) | medium |
| NIST AI RMF PDF (NIST.AI.100-1) | 2 | official | READY_FOR_REVIEW | (in archive 03) | US Gov, public domain | high |
| OWASP LLM Top 10 | 2 | standard | READY_FOR_REVIEW | (HTML capture, 08CU) | CC-BY-SA 4.0 | medium |
| SLSA v1.0 | 2 | standard | READY_FOR_REVIEW | (HTML capture, 08CU) | Apache 2.0 | medium |
| EU AI Act | 2 | official | NEEDS_LICENSE_REVIEW | (HTML capture, 08CU) | EU, public (educational) | medium |

## Notes

- Source registry entries remain advisory, not authority.
- Raw/source truth stays outside the wiki.
- RAG ingestion still requires a future explicit gate.
