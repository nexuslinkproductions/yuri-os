# Browser Capture Policy

**Date**: 2026-05-04
**Created in lane**: 08CV
**advisory_only**: true
**local_truth_claim**: false
**ingestion_status**: REFERENCE_ONLY

## Tiered Capture Hierarchy

| Tier | Method | When |
|---|---|---|
| 1 | Node fetch (yuri-research-capture.mjs) | Public docs, raw source |
| 2 | curl + jq | Headers, metadata |
| 3 | osascript Safari/Chrome (--allow-browser-capture) | Rendered text, JS-loaded content |
| 4 | Scrapling StealthyFetcher (P1) | Anti-bot gates |
| 5 | Scrapling DynamicFetcher (P1) | Heavy JS apps, SPAs |
| 6 | Playwright/Chromium (fallback) | When all above fail |

## Required Evidence Pack Fields

- capture_method: node_fetch / curl / osascript / scrapling
- source_sanitization: stripped_scripts / raw_text / none
- privacy_classification: public / auth_required / user_generated
- fetched_at: ISO timestamp
- content_hash: sha256 prefix (16 hex)
- advisory_only: true
- local_truth_claim: false

## Security Boundaries

- Auth URLs: never capture. Mark source_private.
- User-generated content: never capture via browser agent.
- osascript/JXA: requires --allow-browser-capture flag.
- NotebookLM: synthesis-only, advisory_only=true, never local truth.
