# PRISM Workbench v1 — Architecture

One-page system map for Claudio. Read this after `HANDOFF_README.md` and before opening any source file.

---

## System Overview

**PRISM** is a Today-first sales engagement workbench built around a **single operator (Fanny)** doing daily outreach to **CH/AT companies** (c2moviez's geographic scope). Core loop:

1. **Source pipeline** ingests cold leads from WKO / zefix / firmenabc / linkedin / manual
2. **Quality engine** scores leads on source confidence, evidence completeness, and fit
3. **Compliance gate** blocks send for review-needed CH leads + enforces public-email-only for AT
4. **Today view** surfaces highest-scoring compliance-safe lead via "Open Next Lead"
5. **Draft workspace** generates evidence-grounded outreach (LinkedIn intro or cold email)
6. **Send/Reply loop** mark-sent (channel + follow-up date) → reply triage → opt-out suppression
7. **CRM layer** tracks stages: new → needs_review → ready → sent → replied → qualified → blocked

**Tech stack:** Express + better-sqlite3 backend, React + Vite frontend (standalone Vite app at `acquisition/`), Node.mjs scripts for source feeds + scrapers, integration tests via mjs.

---

## Data Flow

```
┌───────────────────────────────────────────────────────────────────┐
│ SOURCE PIPELINE                                                   │
│ scripts/cold-acquisition-real-feed.mjs                            │
│ scripts/cold-acquisition-wko-scraper.mjs                          │
│ scripts/prism-source-api-check.mjs                                │
│   ColdLeadSource: zefix | wko | firmenabc | linkedin | manual     │
└───────────────────────────┬───────────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────────┐
│ QUALITY ENGINE (backend/services/coldAcquisitionService.ts:2559L) │
│ - Normalization (ColdLeadInput)                                   │
│ - Scoring (ColdLeadScoring + ColdLeadScoringSignals)              │
│ - Source confidence (SourceConfidenceLevel: high|medium|low)      │
│ - Evidence completeness (ColdLeadEvidence)                        │
│ - Draft readiness (ColdLeadDraftReadiness)                        │
└───────────────────────────┬───────────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────────┐
│ COMPLIANCE GATE                                                   │
│ - ColdLeadLegalBasis: public_register | website_published_email   │
│                       | linkedin_platform                         │
│ - Opt-out suppression: email + LinkedIn URL + identity            │
│ - ColdLeadCountry-aware: CH review-needed; AT email gated         │
│ - ColdLeadComplianceRecord persists per-decision audit            │
└───────────────────────────┬───────────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────────┐
│ TODAY VIEW UI (frontend/AcquisitionApp.tsx:2196L)                 │
│ - Topbar: sent_this_week, overdue_follow_ups, blocked_leads       │
│ - "Open Next Lead" → highest compliance-safe score                │
│ - Tabs: Dossier | Draft | Activity | Compliance | Notes           │
└───────────────────────────┬───────────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────────┐
│ DRAFT WORKSPACE                                                   │
│ - Draft types: linkedin_intro | email_cold                        │
│ - Personalization checklist + Dossier evidence binding            │
│ - Anti-AI-spam discipline (English-only, no fake familiarity)     │
│ - DraftFlag flags + thin-evidence hold                            │
└───────────────────────────┬───────────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────────┐
│ SEND / REPLY LOOP                                                 │
│ - Mark-sent: confirm channel + follow-up date                     │
│ - ReplyType: interested | not_now | opt_out | other               │
│ - Opt-out → suppression record (email + LinkedIn + identity)      │
└───────────────────────────┬───────────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────────┐
│ CRM LAYER (backend/services/coldAcquisitionCrmService.ts:880L)    │
│ - ColdLeadCrmStage: new | needs_review | ready | sent | replied   │
│                     | qualified | blocked                         │
│ - TodayMission + TodayMissionLead aggregates                      │
│ - Session auth: CRM_SESSION_COOKIE = 'c2moviez_acquisition_session'│
│ - Roles: ColdAcquisitionCrmRole = 'admin' | 'operator'            │
│ - Activity stream: ColdAcquisitionActivity                        │
└───────────────────────────────────────────────────────────────────┘
```

---

## File Map

| Layer | File path | Purpose | Key Exports |
|---|---|---|---|
| Source pipeline | `scripts/cold-acquisition-real-feed.mjs` | Production lead feed | (CLI) |
| Source pipeline | `scripts/cold-acquisition-wko-scraper.mjs` | WKO source scraper | (CLI) |
| Source pipeline | `scripts/prism-source-api-check.mjs` | Source API health probe | (CLI) |
| Quality engine | `backend/services/coldAcquisitionService.ts` | Core engine — 2559 lines | `ColdLeadInput`, `ColdLeadScoring`, `ColdLeadComplianceRecord`, `CompiledCompanyProfile`, `ColdLeadDrafts`, `ColdLeadDedupe`, `SourceConfidenceLevel`, `DraftFlag`, `ColdLeadDraftReadiness` |
| Public routes | `backend/routes/coldAcquisitionRoutes.ts` | API surface — 154 lines | `initColdAcquisitionRoutes(router, db)` |
| CRM routes | `backend/routes/coldAcquisitionCrmRoutes.ts` | CRM + static UI — 383 lines | `initColdAcquisitionCrmRoutes(app, db)` (mounts `/acquisition/api`, `/acquisition/assets`, `/acquisition/login`, `/acquisition`) |
| CRM service | `backend/services/coldAcquisitionCrmService.ts` | CRM layer — 880 lines | `ColdAcquisitionCrmService` (class), `CrmLead`, `TodayMission`, `TodayMissionLead`, `AcquisitionSourceConfig`, `SourcePipeline`, `CRM_SESSION_COOKIE`, `CRM_VIEW_KEYS` |
| Frontend | `frontend/AcquisitionApp.tsx` | React UI — 2196 lines | Default export: `AcquisitionApp` (tabs: Dossier/Draft/Activity/Compliance/Notes; Today view + topbar metrics) |
| Frontend | `frontend/main.tsx` | Vite entry | (bootstrap) |
| Frontend | `frontend/acquisition.css` | Premium styling per Phase 4 of execution-plan | (styles) |
| Tests | `scripts/tests/cold-acquisition-routes.test.mjs` | Public route integration tests | (CLI) |
| Tests | `scripts/tests/cold-acquisition-crm-routes.test.mjs` | CRM route integration tests | (CLI) |
| Tests | `scripts/tests/cold-acquisition-ui.test.mjs` | UI integration tests | (CLI) |
| Tests | `scripts/tests/cold-acquisition-crm-ui.test.mjs` | CRM UI integration tests | (CLI) |
| Tests | `backend/services/coldAcquisitionService.test.ts` | Service unit tests | (vitest) |

---

## Domain Types (from `coldAcquisitionService.ts` exports)

**Core entities:**
- `ColdLeadCompany` — company shape (name, domain, country, register info)
- `ColdLeadContact` — contact shape (name, role, email, linkedin URL)
- `ColdLeadEvidence` — what we've gathered to justify outreach
- `ColdLeadInput` — full lead intake shape
- `ColdLeadScoring` — final score + signals
- `ColdLeadScoringSignals` — granular score inputs
- `ColdLeadComplianceRecord` — compliance decision audit
- `CompiledCompanyProfile` — denormalized profile for Dossier
- `ColdLeadDrafts` — generated draft set per lead

**Enums (string unions):**
- `ColdLeadCountry`: `'CH' | 'AT'`
- `ColdLeadChannel`: `'linkedin' | 'email' | 'both' | 'blocked'`
- `ColdLeadStatus`: `'intake' | 'enriched' | 'scored' | 'needs_review' | 'ready' | 'pushed' | 'sent' | 'replied'`
- `ColdLeadCrmStage`: `'new' | 'needs_review' | 'ready' | 'sent' | 'replied' | 'qualified' | 'blocked'`
- `ColdLeadSource`: `'zefix' | 'wko' | 'firmenabc' | 'linkedin' | 'manual'`
- `ColdLeadLegalBasis`: `'public_register' | 'website_published_email' | 'linkedin_platform'`
- `SourceConfidenceLevel`: `'high' | 'medium' | 'low'`
- `ColdLeadDraftReadiness`: `'ready_to_rework' | 'draft_review' | 'needs_research' | 'needs_rework' | 'blocked'`

---

## Domain Types (from `coldAcquisitionCrmService.ts` exports)

- `ColdAcquisitionCrmService` — main service class
- `ColdAcquisitionCrmUser` — auth principal
- `ColdAcquisitionCrmRole`: `'admin' | 'operator'`
- `ColdAcquisitionActivity` — activity stream entry
- `CrmLead extends ColdLeadRecord` — CRM-decorated lead
- `CrmLeadPatch` — partial update shape
- `TodayMission` — daily mission envelope
- `TodayMissionLead extends CrmLead` — mission-decorated lead
- `TodayMissionDraftType`: `'linkedin_intro' | 'email_cold'`
- `TodayMissionDueState`: `'none' | 'due_today' | 'overdue'`
- `ReplyType`: `'interested' | 'not_now' | 'opt_out' | 'other'`
- `SourcePipeline` — pipeline metadata
- `AcquisitionSourceConfig` + `AcquisitionSourceStatus`: `'configured' | 'missing_credentials' | 'available_discovery_only' | 'requires_provider_access'`
- `CRM_SESSION_COOKIE = 'c2moviez_acquisition_session'` — auth cookie name
- `CRM_VIEW_KEYS` — saved CRM view shortcuts: `['ready', 'needs_review', 'email_eligible', 'linkedin_first', 'sent', 'replied', 'qualified', 'blocked']`
- `SESSION_TTL_MS = 7 days` — operator session lifetime

---

## HTTP Mounting

The CRM routes are mounted to the Express app via `initColdAcquisitionCrmRoutes(app, db)` (see `backend/routes/coldAcquisitionCrmRoutes.ts`):
- `/acquisition/api` — JSON API router (mounted before static)
- `/acquisition/assets` — static assets (no index)
- `/acquisition/login` — login shell (static)
- `/acquisition` — main UI (static, falls back to `index.html`)
- Plus a catch-all middleware after for any unmatched `/acquisition` routes

The public (non-CRM) routes use `initColdAcquisitionRoutes(router, db)` which attaches to a passed-in router. Marcel mounts these in:
- `backend/src/server.ts:36` — `import { initColdAcquisitionCrmRoutes } from './routes/coldAcquisitionCrmRoutes';`
- `backend/src/routes/api.ts:936` — dynamic `require('./coldAcquisitionRoutes')` for `initColdAcquisitionRoutes`

Claudio: mirror these mount points in your own `server.ts` and pass your `Database.Database` instance.

---

## Data Store

- **Engine:** `better-sqlite3`
- **Connection:** passed in as `Database.Database` to both `init*Routes(...)` functions
- **Path:** `DATABASE_URL` env var (see `ENV_CHECKLIST.md`)
- **Schema:** inferred from service code — entities for leads, drafts, evidence, compliance records, opt-out suppression, sessions, activities, source configs. No formal migration files bundled — schema is bootstrapped by service `init` paths in `coldAcquisitionService.ts` and `coldAcquisitionCrmService.ts`. **Recommend Claudio**: dump current schema via `sqlite3 <db-path> .schema` from Marcel's instance before he starts a fresh DB.

---

## Compliance Notes (per `04-acceptance-checklist.md`)

- **Suppression** by email + LinkedIn URL + contact identity (NOT company-wide unless explicitly requested)
- **CH lead review-needed**: can be drafted but **cannot be marked sent** until reviewed
- **AT email**: allowed only when **public business email path** is documented (`ColdLeadLegalBasis: 'website_published_email'` or `'public_register'`)
- **Server-side send gates**: enforced in route handlers (not just UI)
- Opt-out creates a `ColdLeadComplianceRecord` with denial reason and is honored across all future runs

---

## Tests

| Test | Coverage |
|---|---|
| `backend/services/coldAcquisitionService.test.ts` | Service unit tests (scoring, compliance, draft generation) — runs via vitest |
| `scripts/tests/cold-acquisition-routes.test.mjs` | Public route integration |
| `scripts/tests/cold-acquisition-crm-routes.test.mjs` | CRM route integration (session/auth, today mission, mark-sent, opt-out) |
| `scripts/tests/cold-acquisition-ui.test.mjs` | Public UI integration |
| `scripts/tests/cold-acquisition-crm-ui.test.mjs` | CRM UI integration |

Run all integration tests: `node scripts/tests/<file>.test.mjs` (each test file is self-contained against a fresh sqlite db).

---

## Where to start (Claudio)

1. Open `docs/03-execution-plan.md` — read the 5 campaign phases
2. Open `POSTMORTEM_FILLED.md` — current state, what shipped, what's open
3. Open `docs/04-acceptance-checklist.md` — what's still unchecked
4. Open `backend/services/coldAcquisitionService.ts` — the engine; start with exported types (lines 1-200) to grasp the domain
5. Open `frontend/AcquisitionApp.tsx` — the UI; start with the Today view component
6. Run the test files locally to verify your DB connection + env setup before any feature work

---

*Generated by Marcel's NUDIMMUD handoff workflow (main thread fallback after DeepSeek CREDIT_EXHAUSTED). All citations verified against canonical source at `/Users/marcelspatz/NUDIMMUD/` as of 2026-05-14.*
