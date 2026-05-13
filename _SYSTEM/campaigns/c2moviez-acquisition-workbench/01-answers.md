# c2moviez Acquisition Workbench Answers

## Owner Answers

```yaml
campaign_id: c2moviez-acquisition-workbench-v1
answered_at: 2026-05-12
answered_by: Marcel
```

| # | Answer |
|---:|---|
| 1 | D - premium polished internal product |
| 2 | D - visual polish |
| 3 | A - Today view |
| 4 | A - compliance-safe highest score |
| 5 | D - Today mission only |
| 6 | D - success + ask |
| 7 | A - 20 sent |
| 8 | D - choose each time |
| 9 | D - no clearance path in v1 |
| 10 | C - allow draft, block sent |
| 11 | B - allow if public business email |
| 12 | Pending - owner asked for explanation |
| 13 | C - simple for Fanny, full for admin |
| 14 | A - generated upstream, Fanny edits |
| 15 | B - version history v1/v2/v3 |
| 16 | D - English only |
| 17 | A/B/C - gather as much useful context as possible |
| 18 | B - PRISM |
| 19 | A/C/D - Linear, Superhuman, custom internal ops console |
| 20 | B - desktop + tablet |
| 21 | B - keyboard shortcuts in v1.1 |
| 22 | B - command palette in v1.1 |
| 23 | A - sent this week, overdue, blocked |
| 24 | B - Marcel/admin analytics |
| 25 | D - full source pipeline |
| 26 | A - archive blueprint in Yuri |
| 27 | A - reusable Yuri primitive |
| 28 | A - store in `_SYSTEM/campaigns` |
| 29 | C/E - ugly or generic UI; wrong leads |
| 30 | Pending - no answer supplied |
| 31 | C/D/E - beautiful UI, fast workflow, clean data model |
| 32 | E - all of the above |

## Clarification Notes

### Q12: Opt-out suppression scope

This asks what future records should be blocked when someone replies "do not contact me."

Recommended default for v1:

```yaml
opt_out_scope_default: contact_identity
block_keys:
  - email
  - linkedin_url
  - exact_contact_name_plus_company
company_wide_block: only_if_reply_requests_company_wide_suppression
```

Reason: blocking only an email is too weak; blocking an entire company by default can over-suppress valid future contacts. Contact identity is the safer v1 default.

### Q30: Cut-first policy

Recommended default:

```yaml
cut_first_order:
  - command_palette
  - undo_layer
  - advanced_analytics
  - tablet_polish
  - draft_versioning_depth
never_cut:
  - Today mission flow
  - premium visual system
  - clean source pipeline
  - compliance send gates
  - fast manual outreach loop
```
