# Scrapling Capture Integration

**Date**: 2026-05-04
**Created in lane**: 08CV
**advisory_only**: true
**local_truth_claim**: false
**ingestion_status**: READY_FOR_RAG_AFTER_APPROVAL
**rag_approved_at**: 2026-05-11T16:51:43+02:00
**rag_approved_by**: owner:marcel-spatz

## Source

| Field | Value |
|---|---|
| URL | https://github.com/D4Vinci/Scrapling |
| License | BSD-3-Clause (clean, permissive) |
| Type | repo (Python library) |
| Status | FETCHED (via research pack) |
| Confidence | high |

## Capability Tiers

Scrapling provides three fetcher tiers:

| Fetcher | JS Execution | Stealth | Use Case |
|---|---|---|---|
| Fetcher | No | No | Static HTML fetch |
| StealthyFetcher | No | Yes (TLS fingerprint, headers) | Anti-bot gates |
| DynamicFetcher | Yes (CDP) | Yes | JS-rendered pages |

## CLI Usage

```
scrapling extract get <URL> content.md
scrapling extract get <URL> --dynamic content.md
scrapling extract get <URL> --stealth content.md
```

## MCP Server Mode

`pip install scrapling[ai]` — reference recommendation only until owner approves MCP registration.

## Yuri Integration Path

1. P1: _SYSTEM/Scripts/yuri-research-capture.py wrapping Scrapling CLI
2. P2: Evaluate MCP server mode (requires owner approval)
3. StealthyFetcher as upgrade to static-fetch when anti-bot gates block curl

## Scrapling CLI Test

- **Test date**: 2026-05-04
- **Command**: `scrapling extract get` not available in v0.2.99 (CLI API changed)
- **Python API**: Fetcher.get() works (200 on https://slsa.dev)
- **Verdict**: CLI_OUTPUT_VERIFIED (Python API) — CLI `extract` subcommand unavailable in installed version
- **Status**: Scrapling v0.2.99 installed via pip. Playwright/Camoufox browsers also installed as dependencies.
- **Next**: Evaluate _SYSTEM/Scripts/yuri-research-capture.py integration in a separate lane.

## Non-Claims

- Scrapling not installed. MCP server not registered.
- _SYSTEM/Scripts/yuri-research-capture.py does not exist yet (P1 backlog).
