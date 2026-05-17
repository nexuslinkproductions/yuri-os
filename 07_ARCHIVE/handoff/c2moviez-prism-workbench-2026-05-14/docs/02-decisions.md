# c2moviez Acquisition Workbench Decisions

## Locked Product Direction

```yaml
product_name: PRISM
product_expansion: Prospecting Review & Intelligent Sourcing Module
category: Sales Engagement Workbench
primary_operator: Fanny
owner_admin: Marcel
finish_bar: premium_polished_internal_product
primary_risk: ugly_generic_ui_or_wrong_leads
```

PRISM must not feel like a CRM. It must feel like a polished internal operator surface that starts from a mission, selects safe next work, and helps Fanny produce high-quality manual outreach.

## Workflow Decisions

```yaml
primary_screen: Today
daily_mode: mission_first
weekly_target_metric: sent_this_week
weekly_target_value: 20
open_next_lead_policy: compliance_safe_highest_score
after_mark_sent_policy: show_success_and_ask_next_step
follow_up_policy: choose_each_time
```

Implications:

- Today view is the default entry point.
- Queue exists, but the product should not make Fanny hunt through it.
- "Open next lead" selects the highest-scoring lead that is safe for the next action.
- Mark-sent confirmation should not auto-advance silently; it should ask whether to open next lead, stay, or go to follow-ups.

## Compliance Decisions

```yaml
v1_manual_clearance_ui: false
fanny_can_draft_review_needed: true
fanny_can_send_review_needed: false
ch_review_needed_policy: allow_draft_block_send
at_email_policy: allow_if_public_business_email
opt_out_scope_default: contact_identity
compliance_ui: simple_for_fanny_full_for_admin
```

Implementation interpretation:

- No admin clearance workflow is required for v1, but compliance details must exist for Marcel/admin.
- Review-needed CH leads can be drafted to preserve momentum, but cannot be copied/marked sent until the send gate is satisfied.
- AT email can be eligible when the source records a public business email path. If uncertain, fallback is LinkedIn/manual non-email.
- Opt-out suppression blocks the contact identity: email, LinkedIn URL, and exact contact/company pair. Company-wide suppression is only applied when the reply explicitly requests it.

## Drafting Decisions

```yaml
draft_source: generated_upstream_fanny_edits
draft_versioning: explicit_versions
prospect_language: English
personalization_depth: high
draft_quality_bar: ready_to_send_after_fanny_review
outreach_style: concise_compassionate_real_world_knock_on_door
evidence_policy: source_grounded_no_invented_claims
sales_posture: strategic_conversational_pivot_not_pitch
checklist_items:
  - company
  - role
  - trigger
  - CTA
  - pain
  - solution
  - source_proof
```

The old blueprint's German reminder is superseded by the owner decision: prospect-facing drafts are English-only.

Drafts must be real-life based and true to gathered evidence. They should feel like a human noticed a specific business signal and is gently opening a useful conversation, not like automated sales copy. If PRISM cannot support a claim from the Dossier, it must either omit the claim or mark the lead as needing more research before draft readiness.

## Interface Decisions

```yaml
visual_references:
  - Linear
  - Superhuman
  - custom_internal_ops_console
device_target: desktop_and_tablet
keyboard_shortcuts_phase: v1_1
command_palette_phase: v1_1
topbar_metrics:
  - sent_this_week
  - overdue_followups
  - blocked_leads
analytics_audience: Marcel_admin
```

PRISM should feel fast and premium before it feels feature-heavy. Keyboard and command palette are valuable but not v1 blockers.

## Source Pipeline Decisions

```yaml
source_scope: full_source_pipeline
blueprint_archive: yuri_archive_required
campaign_intake: reusable_yuri_primitive
artifact_root: _SYSTEM/campaigns
```

The utility must finish as a full source-to-operator system, not only a UI over static leads.
