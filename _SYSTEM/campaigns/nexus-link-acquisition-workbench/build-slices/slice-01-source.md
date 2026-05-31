# Slice 01 — Source

## Goal
Pull raw leads from configured channels into `leads/raw/` as validated JSON.

> **Metric this slice computes:** none directly — it sets `n`, the population the whole funnel (`11-math-models.md` §4) runs on. Volume here is the lever that tightens the forecast band: slice 07's revenue band narrows as `n` grows (§4.4), so this slice controls *how many sends are even possible*, while quality gates downstream control which ones survive.

## Inputs
- `config/seeds.json` — tags, locations, sector codes, registry queries, open-need board queries

## Outputs
- `leads/raw/<id>.json` — one file per lead, raw schema

## Spec
1. Read seeds config.
2. For each enabled channel (platform, registry, spend_signal, open_need, adjacency), pull public data.
3. Respect robots.txt, platform ToS, rate limits, and each program's published rules.
4. Dedupe by handle + domain + legal_name.
5. Write validated JSON (raw schema from `03-lead-sourcing-playbook.md`).

## Channels (configurable)
- platform: tag + location discovery on the niche's active platforms
- registry: national business registries / company-data sources (OpenCorporates-style)
- spend_signal: public ad/spend libraries, funding/hiring trackers
- open_need: bug bounty programs, paid OSS/contribution boards, job/contract boards
- adjacency: expansion from won engagements + public ecosystem graphs (empty at cold start)

## Done-test
Pulls N real leads from a seed list, all valid JSON, deduped, lawful-basis flagged.

## THE DECISION IT DRIVES
The size of `n` going into the funnel forecast (§4). More sourced volume = a tighter revenue band downstream, but only if the quality gates (03/05/08) hold. Volume without those gates just widens the survivorship gap (§4.5).

## Compliance
Public data only. No login-walled scraping. Store lawful-basis per lead.
