# Source Registry

**advisory_only**: true
**local_truth_claim**: false

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
| NIST AI RMF PDF (NIST.AI.600-1) | 2 | official | PDF_REFERENCE | -- | US Gov, public domain | pending |
| OWASP LLM Top 10 full PDF | 2 | standard | PDF_REFERENCE | -- | CC-BY-SA 4.0 | pending |
| SLSA v1.0 full spec | 2 | standard | PDF_REFERENCE | -- | Apache 2.0 | pending |
| EU AI Act full text PDF | 2 | official | PDF_REFERENCE | -- | EU, public (educational) | pending |
