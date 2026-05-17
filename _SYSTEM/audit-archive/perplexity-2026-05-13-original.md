# Perplexity Deep-Research Audit — 2026-05-13 (ARCHIVED)

> **STATUS: DO-NOT-EXECUTE-AS-WRITTEN**
>
> This document is preserved for traceability and audit-calibration purposes only.
> It contains substantive factual errors when checked against the live YURI repo on 2026-05-13.
> The corrected, executable campaign lives at:
> - `/Users/marcelspatz/.claude/plans/be-very-concise-and-encapsulated-sunset.md`
> - `_SYSTEM/campaign-2026-05-13-yuri-optimization.md` (post-campaign summary)

## Why Archived (False / Partial Claims)

Fact-check performed 2026-05-13 against `/Users/marcelspatz/YURI-OS-MUSUBI`:

| # | Claim | Reality |
|---|---|---|
| 1 | Hermes gateway needs `npm install @hermes/gateway` | No such package exists. Only research-corpus references. Drop install path entirely. |
| 2 | 5 security vulns documented 2026-04-22, untouched | Real vulns, but documented **2026-03-05** in `RESEARCH/ruflo/v3/implementation/adrs/ADR-061-deep-audit-findings-2026-03.md`. |
| 3 | `enki_state.md` 32 days stale | Modified 2026-05-05, 8 days old. NOT stale. |
| 4 | Auth middleware has "default API key fallback" vuln | `backend/src/middleware/auth.ts` already enforces 16-char API_KEY + boot-fail + isLocalRequest. Already hardened. |
| 5 | 132 scripts | Actual: 109 (`_SYSTEM/Scripts/*.{mjs,js,sh}`). |
| 6 | 29 hooks | Actual: 23 in `.claude/hooks/`. |
| 7 | 5 lanes defined (@perplexity/@comet/@code-local + 2) | Actual: **15 lanes** in `_SYSTEM/Scripts/offload-contract.mjs`. Severe undercount. |
| 8 | scout-errors.log 179KB and growing | 176KB, last write 2026-05-09 — stale, not actively growing. |
| 10 | Hermes/DeerFlow autonomous loop must be built | 4 launchd plists already active (`com.yuri.{ollama-kv, shellservice, wiki-rag, yuri-session-runtime}`). |

**Aggregate accuracy: ~55%.** Architectural shape is reasonable; specific dates, counts, package names, and vuln content are unreliable.

## Original Audit (verbatim)

# YURI OS / YURI: Comprehensive Architecture Optimization Plan
**Target:** 60-65% → 75%+ Operational
**Scope:** Full system architecture, memory layer, agent orchestration, operational reliability
**Date:** 2026-05-13
**Based on:** Fresh YURI scan + 2026 industry best practices

(Full original text preserved in source conversation; archived header above documents the corrections. The original report's prescriptive content — Hermes install commands, security patches against `authMiddleware.js`, enki regeneration, and the 12-fix sequence — must NOT be applied as written. Use the corrected campaign file as the source of truth.)
