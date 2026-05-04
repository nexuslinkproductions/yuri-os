# Yuri Evidence Pack Schema

**advisory_only**: true
**local_truth_claim**: false
**ingestion_status**: REFERENCE_ONLY

Required fields for every evidence pack produced by yuri-research-capture.mjs or any future capture tool.

## Required (All Packs)

- url: source URL
- content_hash: sha256 prefix (16 hex chars)
- fetched_at: ISO timestamp
- advisory_only: true
- local_truth_claim: false
- ingestion_status: REFERENCE_ONLY / READY_FOR_REVIEW / READY_FOR_RAG
- source_type: official / standard / repo / article / unknown
- capture_method: node_fetch / curl / osascript / scrapling

## Required (Browser-Captured Packs Only)

- source_sanitization: REQUIRED_BEFORE_MODEL_PROCESSING

## Required (PDF Packs)

- pdf_extraction_status: EXTRACTED / UNAVAILABLE / PENDING
- extraction_tool: pdftotext / PyMuPDF / other

## Optional / Recommended

- primary_source_url: canonical doc URL (may differ from capture URL)
- privacy_classification: public_source / excerpt_only / needs_license_review
- token_cost_estimate: rough char count of evidence pack excerpt
- excerpt_lines: actual lines captured
