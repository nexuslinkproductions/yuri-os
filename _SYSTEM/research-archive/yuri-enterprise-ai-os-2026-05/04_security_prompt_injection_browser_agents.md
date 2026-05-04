# Security: Prompt Injection & Browser-Agent Capture Risks

**Date**: 2026-05-04
**advisory_only**: true
**local_truth_claim**: false
**ingestion_status**: READY_FOR_REVIEW
**pdf_extraction_note**: OWASP LLM Top 10 PDF not available from source (URL returned 404). Using HTML page capture from 08CU. Marking PDF_REFERENCE as UNAVAILABLE.

## Sources

| URL | Type | Status | Hash |
|-----|------|--------|------|
| https://genai.owasp.org/ | standard | FETCHED | 5ad364bc |
| https://slsa.dev/spec/v1.0/ | standard | FETCHED | 67cd1f21 |

## OWASP LLM Top 10 — Yuri Mapping

| OWASP LLM Risk | Yuri Mitigation | Status |
|
| LLM01: Prompt Injection | Browser capture isolates profile; no raw HTML to RAG; `advisory_only=true` | CURRENT |
| LLM02: Sensitive Disclosure | Protected surfaces; no backend/data; no .claude/state/history/env reads | CURRENT |
| LLM03: Supply Chain | `_SYSTEM/yuri-content-governance.md` — QUARANTINE_EXTERNAL_CORPUS; 07_supply_chain_provenance.md | CURRENT |
| LLM04: Data Leakage | `no_evidence` marker; no invented paths/terms/counts | CURRENT |
| LLM05: Improper Output | Evidence contract PASS gate; `local_truth_claim=false` | CURRENT |
| LLM06: Overreliance | Model output is advisory; local truth outranks all model output | CURRENT |
| LLM07: System Prompt Leak | Origin doc is public; no secrets in prompts | CURRENT |
| LLM08: Vector/Embedding | RAG is allowlist-only; not yet active | PLANNED |
| LLM09: Misinformation | Non-claims required; evidence contract validates claims | CURRENT |
| LLM10: Unbounded Agency | No auto-commit; mutation contract; guarded executor | CURRENT |

## Browser-Agent Capture Risks

| Risk | Mitigation |
|
| Agent access to normal browser profile | Use isolated incognito profile or osascript text-only capture |
| Brute-forcing or web crawling | Per-research-sprint bounded URLs; manifest tracks all sources |
| DOM/JS execution secrets | Browser capture extracts visible text only; no cookie/credential access |
| MCP with broad browser permissions | Not installed; Playwright/chrome-devtools-mcp deferred |
| Browser extension data leakage | No extensions scanned; AppleScript/JXA text capture is read-only |

## Non-Claims

- OWASP LLM Top 10 PDF fetch returned 404 (GitHub raw path not found). Using HTML page capture from 08CU.
- Browser automation (Chrome MCP, Playwright) not installed — lowest-cost capture is osascript-only.
- No penetration testing performed.
- No RAG ingestion without explicit owner approval.
- No paid security audit.
