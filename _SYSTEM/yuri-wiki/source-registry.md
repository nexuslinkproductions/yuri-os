# Yuri LLM Wiki Source Registry Mirror

**advisory_only**: true
**local_truth_claim**: false
**ingestion_status**: `READY_FOR_RAG_AFTER_APPROVAL`
**rag_approved_at**: `2026-05-11T16:51:43+02:00`
**rag_approved_by**: `owner:marcel-spatz`
**mirror_of**: `_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/01_source_registry.md`

## Purpose

This page mirrors the research-archive source registry into the wiki control plane.
The mirrored archive is approved for curated Markdown RAG ingestion. It does not claim raw authority and does not replace the archive record.

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

| URL | Tier | Type | Status | Hash | License Note | Confidence | Note |
|---|---|---|---|---|---|---|---|
| https://www.nist.gov/artificial-intelligence/executive-order | 2 | official | READY_FOR_RAG_AFTER_APPROVAL | 035f5421 | US Gov/public information; attribution retained | medium | local capture |
| https://genai.owasp.org/ | 2 | standard | READY_FOR_RAG_AFTER_APPROVAL | 5ad364bc | CC BY-SA 4.0; attribution required | medium | local capture |
| https://slsa.dev/spec/v1.0/ | 2 | standard | READY_FOR_RAG_AFTER_APPROVAL | 67cd1f21 | Community Specification License 1.0 / Apache 2.0 legacy | medium | local capture |
| https://artificialintelligenceact.eu/the-act/ | 2 | secondary_mirror | READY_FOR_RAG_AFTER_APPROVAL | 8f68fbe0 | secondary mirror only; legal truth stays EUR-Lex | medium | local capture |
| NIST AI RMF PDF (NIST.AI.100-1) | 2 | official | READY_FOR_RAG_AFTER_APPROVAL | (in archive 03) | NIST technical publication reuse; attribution retained | high | pdf_extraction: pdftotext |
| OWASP LLM Top 10 | 2 | standard | READY_FOR_RAG_AFTER_APPROVAL | (HTML capture, 08CU) | CC BY-SA 4.0; attribution required | medium | pdf_NOT_AVAILABLE: 404 from source |
| SLSA v1.0 | 2 | standard | READY_FOR_RAG_AFTER_APPROVAL | (HTML capture, 08CU) | Community Specification License 1.0 / Apache 2.0 legacy | medium | pdf_NOT_AVAILABLE: HTML-only source |
| EU AI Act | 2 | official | READY_FOR_RAG_AFTER_APPROVAL | (HTML capture, 08CU) | EUR-Lex legal-document reuse reviewed 2026-05-11; not legal advice | medium | pdf_NOT_AVAILABLE: HTML-only; official truth: EUR-Lex |

## Notes

- Source registry entries remain advisory, not authority.
- Raw/source truth stays outside the wiki.
- RAG approval is scoped to curated Markdown summaries in the research archive.
