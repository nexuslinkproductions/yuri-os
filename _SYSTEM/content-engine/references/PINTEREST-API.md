# PINTEREST-API.md — references access (manual path chosen)

Status: API SETUP SKIPPED (2026-07-29, Marcel's call). Pinterest app
registration requires a public website + privacy policy URL we don't have.
Not worth inventing assets for. The official API notes stay below for later.

## The manual references workflow (active)

1. Marcel saves reference images however he likes (Pinterest app, screenshots,
   downloads) and either:
   - drops the files into `_SYSTEM/content-engine/references/drop/`, or
   - keeps a public Pinterest board ("NLP Content References") and pastes
     the board URL to the lane — public boards are readable without login,
     so the browser lane can harvest pinimg originals from it on request.
2. The lane curates drops into packs (`references/<pack>/`), applies the
   anti-slop test from `REFERENCE.md`, and hands the pack to Atlas with
   every render task.

No credentials, no OAuth, no registration. The board being public is the
only requirement if the URL route is used.

## Parked: official API path

If a website + privacy policy ever exist, the original notes were:
trial app at developers.pinterest.com/apps, OAuth with redirect
`http://localhost:8472/pinterest/callback`, then
`GET /v5/boards/{id}/pins` for the harvest. Global pin search is
partner-tier regardless; discovery stays on Exa + browser either way.
