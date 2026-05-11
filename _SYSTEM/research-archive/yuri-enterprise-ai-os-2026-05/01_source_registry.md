# Source Registry

**advisory_only**: true
**local_truth_claim**: false
**rag_approval_status**: READY_FOR_RAG_AFTER_APPROVAL
**rag_approved_at**: 2026-05-11T16:51:43+02:00
**rag_approved_by**: owner:marcel-spatz
**rag_scope**: curated archive Markdown only; no raw source dump promotion

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

## RAG Approval Decision

The 2026-05-11 owner request opens the ingestion gate for this archive. Approval is scoped to the curated Markdown summaries and mappings in `_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/`.

License/IP review notes:

- NIST AI RMF: NIST technical-series/public works are reusable with source acknowledgement; U.S. copyright protection does not apply to NIST employee works domestically, foreign rights reserved.
- OWASP LLM Top 10: CC BY-SA 4.0 attribution/share-alike terms apply.
- SLSA: current specification content uses Community Specification License 1.0; legacy portions may remain Apache 2.0.
- EU AI Act: use EUR-Lex as legal truth; EUR-Lex legal documents are reusable for commercial or non-commercial purposes unless otherwise specified. This archive stores advisory mapping, not legal advice.

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
