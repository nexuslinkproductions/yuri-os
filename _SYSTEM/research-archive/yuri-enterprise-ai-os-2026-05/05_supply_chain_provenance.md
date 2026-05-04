# Supply Chain & Provenance

**Date**: 2026-05-04
**advisory_only**: true
**local_truth_claim**: false
**ingestion_status**: READY_FOR_REVIEW
**pdf_extraction_note**: SLSA v1.0 PDF not available (slsa.dev returns HTML). Using HTML page capture from 08CU.

## Sources

| URL | Type | Status | Hash |
|-----|------|--------|------|
| https://slsa.dev/spec/v1.0/ | standard | FETCHED | 67cd1f21 |

## SLSA / Provenance — Yuri Mapping

| SLSA Concept | Yuri Surface | Status |
|
| Provenance | `_SYSTEM/research-archive/01_source_registry.md` — URL, tier, type, license, hash | CURRENT |
| Build integrity | `git commit` hashes; `sha256` on evidence packs; `content_hash` in manifests | CURRENT |
| Dependency tracking | `.gitignore` for generated/external content; `_SYSTEM/yuri-content-governance.md` | CURRENT |
| Verifiable source | Evidence contract validator checks TERM_COUNT/FILE_COUNT/MATCH before PASS | CURRENT |
| Non-repudiation | `summary.json` with run_id, prompt_sha256, stdout_sha256 | CURRENT |

## Plugin / Marketplace / Corpus Governance

| Issue | Yuri Policy |
|
| External skill marketplaces | `.claude/plugins/marketplaces/` ignored; RESEARCH/ORACLE-CORPUS quarantined |
| CLI adapter provenance | Each adapter (.clinerules, GEMINI.md, CLAUDE.md) inherits origin via INHERIT |
| Research corpus ingestion | Allowlist-only; requires provenance, license/IP review, owner approval |
| Generated/cache content | GITIGNORE_GENERATED_CACHE category; never authority |

## Source Registry Requirements

- Every source tracked in 01_source_registry.md
- Must include: URL, tier, type, status, license note, confidence
- Status values: PLANNED, FETCHED, READY_FOR_REVIEW, READY_FOR_RAG, REFERENCE_ONLY, DO_NOT_INGEST_RAW
- License_unknown is valid but blocks RAG ingestion

## Non-Claims

- SLSA v1.0 PDF download returned HTML page (slsa.dev serves spec as web doc, not PDF). Using HTML page capture from 08CU.
- No third-party software bill of materials (SBOM) generated.
- No dependency audit performed.
- No RAG ingestion without explicit owner approval.
