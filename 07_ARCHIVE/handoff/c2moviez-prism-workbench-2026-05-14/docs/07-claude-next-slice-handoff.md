# Claude Task Contract: PRISM Lead Intake + First Mission Data Slice

## Objective

Build the next PRISM Workbench slice so Fanny can get from an empty workbench to real usable mission data without developer intervention.

This is not a CRM. Treat it as an operator workbench for manually manufacturing first-contact opportunities.

Target outcome:

- Admin can import or seed a small batch of real-world prospect records.
- Fanny can see why the workbench is empty and what is missing.
- Leads with thin evidence are routed into a research/review flow, not silently hidden.
- The Today Mission screen becomes useful with first mission data: ready leads, follow-ups, research blockers, review blockers.

Do not implement bulk sending. Do not automate outreach. Fanny remains the manual sender.

## Current Branch And Runtime Context

Workspace:

```text
/Users/marcelspatz/NUDIMMUD/.codex-worktrees/prism-workbench
```

Branch:

```text
codex/c2moviez-acquisition-crm
```

Latest committed implementation at handoff time:

```text
7b05ad9b Build PRISM today mission workbench
```

Running local feature app during handoff:

```text
http://127.0.0.1:3911/acquisition/today
```

Temporary local login used for review:

```text
fanny@example.test
fanny-pass-123456
```

Important naming decision:

```text
Visible product name: c2moviez PRISM Workbench
PRISM = Prospect Research & Intro Sequencing Mission
Forbidden visible name: Acquisition CRM
```

Internal filenames and backend class names still contain `Crm` in places. Do not start a broad rename unless the user explicitly asks. This slice should change visible product behavior, not churn stable internals.

## Source Of Truth Files

Read these before changing code:

```text
_SYSTEM/campaigns/c2moviez-acquisition-workbench/00-questionnaire.md
_SYSTEM/campaigns/c2moviez-acquisition-workbench/01-answers.md
_SYSTEM/campaigns/c2moviez-acquisition-workbench/02-decisions.md
_SYSTEM/campaigns/c2moviez-acquisition-workbench/03-execution-plan.md
_SYSTEM/campaigns/c2moviez-acquisition-workbench/04-acceptance-checklist.md
_SYSTEM/campaigns/c2moviez-acquisition-workbench/06-outreach-draft-doctrine.md
backend/src/services/coldAcquisitionService.ts
backend/src/services/coldAcquisitionCrmService.ts
backend/src/routes/coldAcquisitionRoutes.ts
backend/src/routes/coldAcquisitionCrmRoutes.ts
acquisition/src/AcquisitionApp.tsx
acquisition/src/acquisition.css
Scripts/cold-acquisition-routes.test.mjs
Scripts/cold-acquisition-crm-routes.test.mjs
Scripts/cold-acquisition-crm-ui.test.mjs
backend/src/services/coldAcquisitionService.test.ts
```

## Authority Order

1. User instruction in this thread.
2. Outreach draft doctrine in `06-outreach-draft-doctrine.md`.
3. Existing backend service rules and tests.
4. Existing visual/workbench patterns in `AcquisitionApp.tsx` and `acquisition.css`.
5. Inference from product intent, clearly labeled in code comments or final notes.

If there is conflict, preserve legal/compliance safety and manual-sender behavior over convenience.

## Existing Implemented Capabilities

Backend:

- `GET /acquisition/api/today-mission`
- `ColdAcquisitionCrmService.getTodayMission()`
- Shared send eligibility helper in `ColdAcquisitionService`
- Send gate for `status: sent` / `crm_stage: sent`
- Admin ingest endpoints already exist:
  - `/api/cold-acquisition/ingest/zefix-bulk`
  - `/api/cold-acquisition/ingest/austria-directory`
  - `/acquisition/api/admin/ingest/zefix-bulk`
  - `/acquisition/api/admin/ingest/austria-directory`
- Today mission response includes:
  - weekly quota
  - counts
  - sendable leads
  - follow-ups due
  - send blockers
  - preferred draft type
  - draft excerpt
  - due state

Frontend:

- Visible name is `PRISM Workbench`.
- Authenticated default view is Today Mission.
- Left nav has Today and saved views.
- Center has mission stats and two queues:
  - Ready to Send
  - Follow-ups Due
- Right inspector shows evidence, compliance, score, outreach profile, drafts, notes, reply, activity.
- Send modal copies draft and marks sent.
- Follow-up done clears `next_follow_up_at`.

Current gap:

- Empty state is technically correct but unhelpful.
- Admin has no UI to import or seed records.
- Fanny cannot see what kind of missing data blocks mission readiness.
- Research-needed leads are visible only as counts/saved views, not as actionable mission work.

## Next Slice Name

```text
PRISM Intake + Research Queue
```

## Scope

Implement a backend-first plus thin UI slice:

1. Add a mission-aware empty state.
2. Add an admin lead intake panel.
3. Add a research queue surface.
4. Add enough tests to prevent regressions.
5. Keep the Today Mission API and dashboard behavior compatible.

## Product Requirements

### 1. Mission-Aware Empty State

When Today Mission has no sendable leads and no follow-ups due:

- Do not show only `No sendable leads` and `No due follow-ups`.
- Show a compact operational empty state that answers:
  - Are there zero leads?
  - Are leads present but blocked?
  - Are leads present but thin evidence?
  - Are leads waiting for compliance review?
  - What should admin/Fanny do next?

Suggested copy, keep concise:

```text
No mission items yet.
Import prospects or review research blockers to create today’s queue.
```

If counts show blockers, show blocker chips:

```text
Needs research: N
Review needed: N
Blocked: N
```

Do not use instructional paragraphs. This is an operator surface, not onboarding marketing.

### 2. Admin Lead Intake Panel

Add an admin-only panel in the left sidebar or Today surface.

Minimum viable behavior:

- Admin can paste JSON records into a textarea.
- Admin can choose intake type:
  - `Swiss register records`
  - `Austria directory records`
- Admin can submit to the existing admin endpoints:
  - `/acquisition/api/admin/ingest/zefix-bulk`
  - `/acquisition/api/admin/ingest/austria-directory`
- After successful ingest:
  - refresh dashboard
  - refresh lead list
  - refresh today mission
  - show result counts: created, skipped, errors

Input must be strict JSON.

Expected input shape:

```json
[
  {
    "name": "Example Robotics GmbH",
    "uid": "CHE123456789",
    "canton": "ZH",
    "city": "Zuerich",
    "postal_code": "8001",
    "legal_form": "GmbH",
    "date_of_entry": "2026-04-12",
    "industry": "robotics",
    "website": "https://example.com/en",
    "linkedin_url": "https://linkedin.com/company/example",
    "employee_count": 24,
    "contact_name": "Mira Keller",
    "contact_title": "Founder",
    "contact_email": "hello@example.com",
    "contact_linkedin_url": "https://linkedin.com/in/mira-keller",
    "source_url": "https://www.zefix.ch/en/search/entity/list/firm/123456"
  }
]
```

Do not add file upload in this slice unless it is trivial and well-tested. Paste JSON is enough.

### 3. Research Queue Surface

Add a third Today queue or compact section for `Needs Research`.

Purpose:

- Fanny/admin can identify which leads are not ready because evidence is thin.
- The queue should not imply sendability.

Rules:

- Show leads where `draft_specificity.readiness === 'needs_research'` or `draft_specificity.valid === false`.
- Exclude duplicates and blocked leads unless the blocker itself is useful to show.
- Sort by `scoring.total_score DESC`, then `updated_at DESC`.
- Show:
  - company
  - country/city
  - score
  - missing fields / warnings
  - first evidence item if present
  - action: `Inspect`

Backend can either:

- Extend `GET /acquisition/api/today-mission` with `needs_research: TodayMissionLead[]`, or
- Add `GET /acquisition/api/research-queue`.

Prefer extending `today-mission` because the Today screen already consumes mission state. Keep backward compatibility by adding the field without removing existing fields.

### 4. Research Blocker Detail

In the inspector’s Outreach Profile:

- If readiness is `needs_research`, show the missing/warnings more explicitly.
- Use concise chip/list language.
- Do not invent research instructions beyond the known missing fields.

Good:

```text
Missing: specific company evidence
Warning: thin evidence
```

Bad:

```text
Find more data online and create a better pitch.
```

### 5. Seed Fixtures For Fast Review

Add a small deterministic local fixture helper if useful:

Option A:

- Add an admin-only `Seed demo` button that posts known fixture records to existing ingest endpoints.

Option B:

- Add a script under `Scripts/` that posts fixture records to the local backend.

Prefer Option B unless the UI implementation remains small. Demo seed data must be clearly test/dev oriented and not shown as production source.

Possible script:

```text
Scripts/prism-seed-demo-leads.mjs
```

Requirements:

- Accept `--origin http://127.0.0.1:3911`.
- Accept `--api-key <key>` if using public API endpoint.
- Or log in as admin and use admin acquisition endpoints if simpler.
- Seed 5-8 varied leads:
  - 2 ready/sendable
  - 2 needs research
  - 1 compliance review
  - 1 blocked/duplicate
  - 1 due follow-up if possible

Use grounded fictional companies, not real claims, for demo mode.

## Data And Compliance Rules

Do not weaken these:

- `sendable` requires shared backend send eligibility.
- `status: sent` cannot bypass send eligibility.
- CH compliance `review` does not become sendable.
- AT email sendability requires published B2B inquiry evidence.
- Thin evidence must not produce ready-to-send drafts.
- Drafts must stay concise, specific, and grounded in available evidence.
- No bulk send.
- No automated sending.
- No generated claims unrelated to the dossier.

## Frontend Design Constraints

Stay consistent with current PRISM visual language:

- Dense operator interface.
- Montserrat.
- c2moviez blue `#56BCEC`.
- No marketing hero.
- No large decorative cards.
- No gradient/orb/bokeh decoration.
- Cards only for repeated mission/lead items.
- No nested card styling.
- Keep right inspector.
- Avoid text overlap at browser widths similar to the user screenshot.
- Use existing button and badge patterns.
- Use lucide icons if adding new buttons.

Avoid visible explanatory text that describes features. Use operator labels and concise empty states.

## Backend Implementation Guidance

Likely service additions:

```text
ColdAcquisitionCrmService.getTodayMission()
ColdAcquisitionCrmService.getResearchQueue() // optional if not extending mission
ColdAcquisitionService.getSendBlockers()
```

If extending mission:

```ts
{
  mission: {
    ...
    counts: {
      ...
      needs_research: number
    },
    sendable: TodayMissionLead[],
    follow_ups_due: TodayMissionLead[],
    needs_research: TodayMissionLead[]
  }
}
```

For `TodayMissionLead`, reuse existing fields and add no new DB table.

Do not create a new database table in this slice.

## UI Implementation Guidance

Likely React changes in `acquisition/src/AcquisitionApp.tsx`:

- Extend `TodayMission` type with `needs_research?: TodayMissionLead[]`.
- Add `MissionEmptyState`.
- Add `AdminIntakePanel`.
- Add third queue or section:
  - `Needs Research`
- Add handler:
  - `submitIntake(type, rawJson)`
- Reuse `api<T>()`.
- On successful ingest call:
  - `loadDashboard()`
  - `loadLeads()`
  - `loadTodayMission()`
- Keep admin panel hidden for `operator`.

Likely CSS additions:

```text
.mission-empty-state
.admin-intake-panel
.intake-result
.research-blockers
```

## Required Tests

Add or update tests before or with implementation.

### Route Tests

In `Scripts/cold-acquisition-crm-routes.test.mjs`:

- authenticated mission includes `needs_research` array if extending mission
- thin evidence lead appears in `needs_research`
- thin evidence lead does not appear in `sendable`
- blocked/duplicate lead does not pollute research queue unless intentionally included with blocker
- admin ingest endpoint requires admin
- admin ingest endpoint returns result counts
- operator cannot use admin ingest
- direct `/acquisition/today` still serves shell

### Service Tests

In `backend/src/services/coldAcquisitionService.test.ts` or CRM service tests:

- `needs_research` readiness is produced from thin evidence
- draft generator does not create ready send copy for thin evidence
- ready/sendable logic unchanged

### UI Static Tests

In `Scripts/cold-acquisition-crm-ui.test.mjs`:

- visible app name remains `PRISM Workbench`
- visible app copy does not include `Acquisition CRM`
- Today UI renders research queue or research empty state
- UI includes admin intake panel code
- UI posts to admin ingest endpoint
- UI handles ingest result counts

### Build/Verification Commands

Run at minimum:

```bash
node Scripts/cold-acquisition-crm-ui.test.mjs
npx tsc -p acquisition/tsconfig.json --noEmit
npx vite build --config acquisition/vite.config.mts
PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules/.bin:$PATH" NODE_PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules" TS_NODE_TRANSPILE_ONLY=1 node Scripts/cold-acquisition-crm-routes.test.mjs
PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules/.bin:$PATH" NODE_PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules" npm --prefix backend run build
```

If the isolated worktree lacks `backend/node_modules`, use the existing main repo dependency path as shown above. Do not vendor dependencies into the worktree.

If a temporary symlink is created for build/runtime, remove it before final status.

## Runtime Review

After build, run or reuse feature backend:

```bash
API_KEY='local-dev-api-key-1234567890' \
PORT=3911 \
NUDIMMUD_TEST_MODE=1 \
NUDIMMUD_DISABLE_WATCHERS=1 \
NUDIMMUD_DISABLE_INTERVALS=1 \
NUDIMMUD_DISABLE_SWARM_ORCHESTRATOR=1 \
COLD_ACQ_ADMIN_EMAIL='marcel.crm@example.test' \
COLD_ACQ_ADMIN_PASSWORD='admin-pass-123456' \
COLD_ACQ_FANNY_EMAIL='fanny@example.test' \
COLD_ACQ_FANNY_PASSWORD='fanny-pass-123456' \
TS_NODE_TRANSPILE_ONLY=1 \
PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules/.bin:$PATH" \
npm --prefix backend run dev
```

Review URLs:

```text
http://127.0.0.1:3911/acquisition/today
http://127.0.0.1:3911/acquisition/login
```

Admin login for intake panel:

```text
marcel.crm@example.test
admin-pass-123456
```

Operator login:

```text
fanny@example.test
fanny-pass-123456
```

## Explicit Non-Goals

Do not:

- Build bulk send.
- Build automated sending.
- Rename internal `Crm` classes/files across the codebase.
- Add a new database table.
- Add external scraping/browser research automation.
- Add a full CSV parser unless needed for a small script.
- Change `/acquisition/api/dashboard` behavior unless tests require a harmless additive field.
- Change the outreach doctrine unless the user asks.
- Add flashy copy, sales pitch text, or onboarding walls.

## Expected Final Response

When done, report:

- What changed.
- Which files matter.
- What tests passed.
- Any runtime URL still running.
- Whether branch is clean.
- Any known limitations.

Keep final response concise. The implementation should carry the detail, not the final chat.

## Pass Criteria

The slice is done when all are true:

- Visible product remains PRISM Workbench, not CRM.
- Empty Today screen gives Fanny/admin an actionable operational next step.
- Admin can ingest pasted records without leaving the workbench.
- Thin evidence leads appear as research work, not sendable work.
- Sendability and compliance gates remain unchanged.
- Route/static/build tests pass.
- Bundle is rebuilt under `backend/public/acquisition`.
- No temporary `backend/node_modules` symlink remains in git status.
- No unrelated main-workspace dirty files are touched.

