# Nexus Link — Database Migrations
#
# These migrations are stubs pointing to the UNIFIED-SCHEMA-DRAFT-2026-07-01.md
# Full migration files will be created in Phase 0.1 as vertical slices are built.
#
# Current state:
#   - 00001_nexus_core_stub.sql (in ../supabase/migrations/) contains Phase 0 core tables
#   - Remaining stubs below reference sections of UNIFIED-SCHEMA-DRAFT
#
# Schema source: ../business/research/phase0-docker-supabase/UNIFIED-SCHEMA-DRAFT-2026-07-01.md
#
# Migration order:
#   1. Identity & tenant (workspaces, profiles, workspace_members, team_invites)
#   2. CRM core (leads, contacts, tags, contact_tags, lead_tags, contact_notes, contact_activities)
#   3. Pipeline & deals (pipeline_stages, deals, deal_stage_history, deal_custom_fields)
#   4. Forms & funnels (forms, form_fields, form_submissions, funnel_pages, funnels)
#   5. Communication (conversations, conversation_messages, message_templates)
#   6. Calendar & booking (booking_types, bookings, calendar_sync_state)
#   7. Packages & commerce (packages, package_addons, subscriptions, payment_receipts)
#   8. Commission (commission_rules, commission_ledger)
#   9. Automation & events (automations, automation_runs, domain_events, event_outbox)
#   10. Connectors (connector_accounts, connector_tokens)
#   11. Content & academy (files, courses, course_modules, course_lessons, course_enrollments)
#   12. Playbook/tracking/social (playbook_snippets, tracking_pixels, tracking_events, social_posts)
#   13. Contracts & compliance (contracts, contract_signatures, audit_log)
#   14. AI & metering (ai_workspace_config, ai_provider_keys, ai_usage_events, ai_workflow_templates)

## Phase 0.1 stubs (to be implemented)

### 001_workspaces_profiles.sql
**Status:** ✅ DONE (in ../supabase/migrations/00001_nexus_core_stub.sql)  
**Tables:** workspaces, profiles, workspace_members  
**RLS:** Tenant isolation via app_current_workspace_id()  
**Reference:** UNIFIED-SCHEMA-DRAFT §3.1
**Implemented:**
- ✅ workspaces table with UUID v7, plan_tier, branding JSONB
- ✅ profiles table linked to auth.users (via trigger on_auth_user_created)
- ✅ workspace_members table with role enum (owner/admin/member/viewer)
- ✅ RLS policies with service_role bypass
- ✅ Dev workspace seed (id: 00000000-0000-4000-8000-000000000001)
**Pending:**
- ⏳ workspace_settings table
- ⏳ team_invites table

### 002_leads_contacts_rls.sql
**Status:** PENDING  
**Tables:** leads, contacts, contact_lead_links, tags, contact_tags, lead_tags  
**RLS:** Multi-tenant with workspace_id check  
**Reference:** UNIFIED-SCHEMA-DRAFT §3.2

### 003_forms_public.sql
**Status:** PENDING  
**Tables:** forms, form_fields, form_submissions, funnel_pages, funnels  
**Public routes:** SECURITY DEFINER functions for form submissions  
**Reference:** UNIFIED-SCHEMA-DRAFT §3.4

### 004_events_outbox.sql
**Status:** PENDING  
**Tables:** domain_events, event_outbox, automations, automation_runs  
**Pattern:** At-least-once delivery, pg-boss integration  
**Reference:** UNIFIED-SCHEMA-DRAFT §3.9

### 005_ai_stubs.sql
**Status:** ✅ DONE (in ../supabase/migrations/00001_nexus_core_stub.sql)  
**Tables:** ai_workspace_config, ai_usage_events  
**Pattern:** Token ledger, per-tenant key mode, BYOK ciphertext  
**Reference:** UNIFIED-SCHEMA-DRAFT §4, YURI-CLOUD-HARNESS
**Implemented:**
- ✅ ai_workspace_config table (key_mode, monthly_credit_usd, soft/hard caps, retention_days)
- ✅ ai_usage_events table (request_id, model, tokens, cost_usd, metadata)
- ✅ Indexes for workspace_id + created_at DESC
- ✅ Unique constraint on (workspace_id, request_id)
- ✅ Dev workspace config seed (15 USD monthly credit, 30-day retention)
**Pending:**
- ⏳ ai_provider_keys table (BYOK ciphertext storage)
- ⏳ ai_workflow_templates table

## Applying migrations

### Via Docker Compose (dev):
```bash
cd 03_NEXUS-LINK/infra
./scripts/bootstrap.sh
# Or manually:
docker compose exec -T db psql -U postgres -d postgres -f supabase/migrations/00001_nexus_core_stub.sql
```

### Via Supabase CLI (recommended):
```bash
cd 03_NEXUS-LINK/nexus-app
supabase init
supabase start
supabase db push
```

### Verification:
```bash
# Connect to local Postgres
psql postgresql://postgres:PASSWORD@127.0.0.1:54322/postgres

# Check tables
\dt public.*

# Check RLS policies
SELECT * FROM pg_policies WHERE schemaname = 'public';

# Test tenant isolation (negative test)
SELECT * FROM leads;  # Should return 0 rows (RLS blocks)
```

## Schema table count

| Phase | Tables | Cumulative |
|-------|--------|------------|
| Phase 0 (identity + AI stubs) | 5 | 5 |
| Phase 0.1 (CRM core) | 8 | 13 |
| Phase 0.2 (Pipeline) | 4 | 17 |
| Phase 0.3 (Forms) | 5 | 22 |
| Phase 0.4 (Communication) | 3 | 25 |
| Phase 0.5 (Calendar) | 3 | 28 |
| Phase 0.6 (Commerce) | 4 | 32 |
| Phase 0.7 (Commission) | 2 | 34 |
| Phase 0.8 (Events) | 4 | 38 |
| Phase 0.9 (Connectors) | 2 | 40 |
| Phase 1.0 (Academy) | 5 | 45 |
| Phase 1.1 (Playbook) | 4 | 49 |
| Phase 1.2 (Contracts) | 3 | 52 |
| **AI extension** | 4 | **46** core + **4** AI |

**Total: 46 tables** (42 core + 4 AI extension)

---

See also:
- UNIFIED-SCHEMA-DRAFT-2026-07-01.md (schema definitions)
- MODULE-DEPENDENCY-MAP-2026-07-01.md (build order)
- YURI-CLOUD-HARNESS-2026-07-01.md (AI harness)
- README-SETUP.md (local dev setup)