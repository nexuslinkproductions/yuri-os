# SEARCH_COST_PROTOCOL — Low-Cost Research Pipeline

Accepted from audit: 08W_LOW_COST_WEB_AND_AGENT_RESEARCH_PIPELINE_AUDIT_P_PASS

## TOKEN COST HARD RULES

- No subagents for routine package or web research. Direct shell tools only.
- No rendered GitHub WebFetch. Use raw.githubusercontent.com with line cap.
- Evidence pack max: 80 lines.
- Final report max: 120 lines unless explicitly blocked.
- Never full-crawl without explicit owner approval.
- DeepSeek reinforcement: compact evidence only. No raw dumps.
- gh is not installed; do not rely on it as a default path.
- curl exists but is hook-gated; treat as non-default.

## RESEARCH LADDER

| Tier | Source | Method | Approval |
|------|--------|---------|----------|
| 0 | Local cache / git history | Read, grep, git log | None |
| 1 | Package registry metadata | `npm view <pkg> --json \| jq` | None |
| 2 | Raw source files | raw.githubusercontent.com + `head -N` | None |
| 3 | Snippets / highlights | Targeted grep on raw source | None |
| 4 | Targeted extract | Single scoped file read | None |
| 5 | Full crawl / WebFetch | Rendered page or full repo | Explicit owner approval |

Always start at Tier 0. Only escalate when lower tier is provably insufficient.

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
- Tier 5 (full crawl / WebFetch) would be required.
- gh commands would be required (not installed).
- curl is blocked by hook gate.
- Evidence would exceed 80 lines before filtering.

## NON-CLAIMS

- This protocol does not install gh.
- This protocol does not configure MCP.
- This protocol does not authorize broad git status or find dumps.
- This protocol does not bypass hook gates.
