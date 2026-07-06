# SEARCH_COST_PROTOCOL — Low-Cost Research Pipeline

Accepted from audit: 08W_LOW_COST_WEB_AND_AGENT_RESEARCH_PIPELINE_AUDIT_P_PASS

## LOCAL-FIRST MANDATE (canonical research process — non-negotiable)

Every research task — design, technical, copy, physics, prior-art, references — MUST start in OUR OWN database before any online lookup. We are building a compounding local "research center"; the order is law:

1. `ai search "<query>"` — FTS5/BM25 over ~38k indexed docs + code (`_SYSTEM/OS_KERNEL/search-index.db`).
2. `_SYSTEM/` knowledge-base, design packs, Claude/YURI memory, GitNexus.
3. ONLY when the local corpus is provably insufficient → escalate online (Tiers 1–5 below).
4. **MANDATORY — capture, don't lose it:** when an online lookup yields genuinely useful information (deep-research reports, prior-art, technical refs, disclosed reports, competitive intel), write the synthesized **cited** findings to `02_RESOURCES/research/<topic>-<YYYY-MM-DD>.md`, then run `ai reindex`. This is the bridge from one-off lookup to compounding corpus — skip it and the research evaporates at session end. Only genuinely-relevant synthesized findings (a judgment call), never raw page dumps.

Going online before querying the local corpus is a process violation, not a shortcut. This persists across all sessions and lanes.

## ONLINE-VERIFICATION LAYER (standard certainty layer — owner directive 2026-06-16)

Local-first (above) governs DISCOVERY. This governs VERIFICATION. Online verification is now a STANDARD layer of certainty for EXTERNAL / FACTUAL claims — not merely an escalation when the local corpus is insufficient. After local evidence, cross-check external claims against authoritative online sources as one extra layer before trusting them.

- SCOPE: external/factual claims only — library/API behavior, CVE/security facts, prior-art, benchmark numbers, "is this still current upstream," third-party contracts. NOT "does our own code work."
- BOUNDARY (strict): local EXECUTION stays GROUND TRUTH for our own system's correctness. Online NEVER overrides a local run for our code — run the test, the run wins.
- DISCIPLINE: verify against PRIMARY sources (official docs, the source repo via raw.githubusercontent / api.github), not random blogs; ≥2 independent primary sources for a load-bearing external claim; treat a confident source like a confident lane — advisory until corroborated (the web hallucinates, stales, and is gameable). Cite + capture genuinely-useful findings to `02_RESOURCES/research/<topic>-<date>.md` + `ai reindex` (the local-first capture bridge). Route through sanctioned tools; honor the STOP CONDITIONS below.

## TOKEN COST HARD RULES

- No subagents for routine package or web research. Direct shell tools only.
- No rendered GitHub WebFetch. Use raw.githubusercontent.com with line cap.
- Evidence pack max: 80 lines.
- Final report max: 120 lines unless explicitly blocked.
- Never full-crawl without explicit owner approval.
- DeepSeek reinforcement: compact evidence only. No raw dumps.
- gh is not installed; do not rely on it as a default path.
- curl allowed for raw.githubusercontent.com and api.github.com; hook-gated for all other domains.

## RESEARCH LADDER

| Tier | Source | Method | Approval |
|------|--------|---------|----------|
| 0 | **Our local corpus + knowledge base (MANDATORY FIRST)** | `ai search "<q>"` (FTS5/BM25 ~38k docs+code) · `ai reindex` to refresh · read/grep/git log · `_SYSTEM/` knowledge-base | None |
| 1 | Package registry metadata | `npm view <pkg> --json \| jq` | None |
| 2 | Raw source files | `curl -s raw.githubusercontent.com` + `head -N` | None |
| 3 | Snippets / highlights | Targeted grep on raw source | None |
| 4 | Targeted extract | Single scoped file read | None |
| 5 | Full crawl / WebFetch | Rendered page or full repo | None (scoped use) |

Always start at Tier 0 — the local corpus is the mandatory first stop for ANY research (see LOCAL-FIRST MANDATE above). Only escalate online when the local DB is provably insufficient, then feed findings back via `ai reindex`.

## DEFAULT_PACKAGE_AUDIT_TEMPLATE

```bash
npm view <package> --json | jq '{
  name: .name,
  version: .version,
  description: .description,
  dist_tags: .["dist-tags"],
  engines: .engines,
  license: .license
}'
```

## DEFAULT_SOURCE_AUDIT_TEMPLATE

```bash
# Raw source — line capped
curl -s "https://raw.githubusercontent.com/<owner>/<repo>/main/<path>" | head -200

# Targeted grep on raw source
curl -s "https://raw.githubusercontent.com/<owner>/<repo>/main/<path>" | grep -n "<pattern>" | head -40
```

Never use WebFetch on a rendered GitHub URL for source audits.

## DEEPSEEK_REINFORCEMENT_HANDOFF

Send only:
```
TASK: <one sentence>
CONTEXT_PACK:
- fact1
- fact2  (max 5)
EVIDENCE:
- ref/snippet1
- ref/snippet2  (max 3)
BLOCKERS: <none | specific>
QUESTION: <specific or "proceed">
OUTPUT_CAP: 80 lines research / 120 lines final report
```

## STOP CONDITIONS

Stop and request owner approval if:
- gh commands would be required (not installed).
- curl is required for a domain other than raw.githubusercontent.com or api.github.com.
- Evidence would exceed 80 lines before filtering.

## NON-CLAIMS

- This protocol does not install gh.
- This protocol does not configure MCP.
- This protocol does not authorize broad git status or find dumps.
- This protocol does not bypass hook gates.
