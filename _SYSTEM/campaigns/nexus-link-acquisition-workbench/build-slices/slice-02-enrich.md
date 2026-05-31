# Slice 02 — Enrich

## Goal
Attach company facts + recent activity to each raw lead, **as timestamped scoring features** — so the scorer (slice 03) has real evidence to weigh and the decay clock can run.

> **What this slice feeds:** the feature vector `xᵢ` consumed by `11-math-models.md` §1.3, each stamped with an `as_of` date so confidence decay (§1.8) applies. Enrichment is the `informationGain` move that *lowers* the internal U governor (§6.4) — that is the math reason to enrich **before** sending, not after.

## Inputs
- `leads/raw/<id>.json`

## Outputs
- `leads/enriched/<id>.json` — raw + `company_facts` + `recent_activity` + `features` (each with `value` and `as_of` timestamp)

## Spec
1. For each raw lead, look up website about page, business registry / company-data source, professional network page.
2. Extract: founded year, size, sector, recent activity.
3. **Populate scoring features (§1.3), each with an `as_of` timestamp**, e.g.:
   ```json
   "features": {
     "budget_stated":        { "value": 1, "as_of": "2026-05-30" },
     "decision_maker_reach": { "value": 1, "as_of": "2026-05-30" },
     "pain_matches_proof":   { "value": 1, "as_of": "2026-05-30" }
   }
   ```
   The `as_of` stamp is what lets slice 03 apply `x_eff = x · 0.5^(age/halfLife)` (§1.8) — a budget signal scraped 20 days ago is worth ~⅓ of a fresh one.
4. Validate website resolves (pre-health-check).
5. Write enriched JSON.

## Why enrich before sending (§6.4)
In the internal U governor, enrichment raises verified-evidence and information-gain and lowers the claimed-vs-verified gap → `ΔU < 0` → it is an energetically *favored* state move. Sending on un-enriched leads raises the drift term and can trip the U gate (see `08`). Enrich first; it is not optional polish, it is the move that keeps the batch gate happy.

## Enrichment sources
- Website about page
- National business registry / OpenCorporates-style company-data source (per target geography)
- Professional network company page

## Done-test
- Enriches with verifiable company facts; flags unreachable sites.
- Every extracted feature carries an `as_of` timestamp (so §1.8 decay is computable downstream).

## Compliance
Public data only. Legitimate-interest basis for B2B.
