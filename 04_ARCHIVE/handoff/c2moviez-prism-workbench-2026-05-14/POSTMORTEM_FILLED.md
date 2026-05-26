# PRISM Workbench v1 Postmortem

## Campaign Metadata

```yaml
campaign_id: c2moviez-acquisition-workbench-v1
completed_at: 2026-05-14T15:53:02+02:00
branch: main
commit: efabba28
latest_prism_commit: 84bd26ed
result: Foundation v1 shipped; operator validation pending
```

Evidence:

- Latest commit touching PRISM service, frontend, or campaign docs:
  `84bd26ed feat(prism): c2moviez workbench slices 08-20 + service + test updates`
  at `2026-05-14T15:53:02+02:00`.
- Current `HEAD` short commit on `main`: `efabba28`.
- Original postmortem template exists at
  `_SYSTEM/campaigns/c2moviez-acquisition-workbench/05-postmortem.md`.
- Acceptance checklist currently has 37 unchecked boxes and 0 checked boxes.
- This means implementation evidence exists, but formal owner/operator acceptance
  has not been marked complete in the canonical checklist.

## What Shipped (commits since 2026-05-01)

Phase grouping follows
`_SYSTEM/campaigns/c2moviez-acquisition-workbench/03-execution-plan.md`.

### Phase 1: Campaign Memory & Branch Hygiene

- Campaign documentation was committed under
  `_SYSTEM/campaigns/c2moviez-acquisition-workbench/`.
- Git history for the campaign directory since 2026-05-01:
  - `bd43d6d9 chore: commit campaigns dir, session handoff, gitignore codex-worktrees`
  - `c039032f Add PRISM Claude next-slice handoff`
  - `84bd26ed feat(prism): c2moviez workbench slices 08-20 + service + test updates`
- The campaign now contains 21 markdown documents:
  - `00-questionnaire.md`
  - `01-answers.md`
  - `02-decisions.md`
  - `03-execution-plan.md`
  - `04-acceptance-checklist.md`
  - `05-postmortem.md`
  - `06-outreach-draft-doctrine.md`
  - `07-claude-next-slice-handoff.md`
  - `08-codex-slice-a-source-pipeline.md`
  - `09-codex-slice-b-next-lead-quality-engine.md`
  - `10-codex-slice-c-send-reply-loop.md`
  - `11-codex-slice-d-evidence-enrichment.md`
  - `12-codex-slice-e-wko-scraper.md`
  - `13-codex-slice-f-url-health-check.md`
  - `14-codex-slice-g-draft-overhaul.md`
  - `15-codex-slice-h-clean-template-leakage.md`
  - `16-codex-slice-i-profiler-draft-rebuild.md`
  - `17-coldreach-body-instruction.md`
  - `18-profiler-prompt-header.md`
  - `19-codex-slice-j-doctrine-rewrite.md`
  - `20-codex-slice-j-test-fix.md`

### Phase 2: State & Safety Spine

- Server actions exist for copy-draft, mark-sent, follow-up scheduling,
  reply logging, and draft regeneration in
  `backend/src/routes/coldAcquisitionCrmRoutes.ts:219`.
- `mark-sent` requires a channel and rejects missing channel with `400`
  in `backend/src/routes/coldAcquisitionCrmRoutes.ts:229`.
- The CRM service enforces send blockers before copy and mark-sent:
  `backend/src/services/coldAcquisitionCrmService.ts:330` and
  `backend/src/services/coldAcquisitionCrmService.ts:342`.
- Opt-out reply handling disqualifies the lead, logs suppression metadata,
  and returns `suppressed: true` in
  `backend/src/services/coldAcquisitionCrmService.ts:373`.
- Suppression keys include email, LinkedIn URL, and exact contact/company
  identity in `backend/src/services/coldAcquisitionCrmService.ts:759`.
- Test evidence covers mark-sent channel validation, opt-out suppression,
  disqualification, and suppression removal from the sendable pool in
  `Scripts/cold-acquisition-crm-routes.test.mjs:357`.

### Phase 3: Source Pipeline

- Source metadata is modeled in the service with source, source URL, timestamp,
  legal basis, evidence, and source confidence structures in
  `backend/src/services/coldAcquisitionService.ts:25`.
- Source confidence scoring is implemented by `computeSourceConfidence` in
  `backend/src/services/coldAcquisitionService.ts:366`.
- CRM output exposes `source_pipeline` with confidence, batch id,
  public-email basis, and wrong-lead risk in
  `backend/src/services/coldAcquisitionCrmService.ts:778`.
- The frontend consumes `source_pipeline` as part of the lead model in
  `acquisition/src/AcquisitionApp.tsx:101`.
- Dossier renders a Source Pipeline section in
  `acquisition/src/AcquisitionApp.tsx:1619`.
- Route tests assert confidence score, confidence level, confidence signals,
  batch id, public-email basis, and wrong-lead risk in
  `Scripts/cold-acquisition-crm-routes.test.mjs:1000`.
- Git history:
  - `f59e3d38 feat(prism): source pipeline — confidence scoring, wrong-lead risk, Dossier signals`
  - `b53c8d5f feat(prism): live data & enrichment overhaul — Slices D/E/F/G`

### Phase 4: Today-First PRISM UI

- The visible product name is `PRISM Workbench` in
  `acquisition/src/AcquisitionApp.tsx:746`, `:752`, and `:778`.
- The app loads dashboard, leads, and Today Mission together in
  `acquisition/src/AcquisitionApp.tsx:447`.
- Today Mission view exists at `acquisition/src/AcquisitionApp.tsx:1239`.
- "Open next lead" CTA is rendered at
  `acquisition/src/AcquisitionApp.tsx:1271`.
- UI tests assert "Open next lead", dedicated button styling, next-lead API
  usage, and empty-state behavior in `Scripts/cold-acquisition-crm-ui.test.mjs:53`.
- Git history:
  - `fabc9fda Build PRISM today mission workbench`
  - `2d64aaa5 feat(prism): implement intake panel, research queue, mission empty state`
  - `7970a4e0 feat(prism): open next lead CTA + draft quality evaluator (Phase 4 gap + 5B)`

### Phase 5: Inspector & Draft Workspace

- Inspector tabs include Dossier, Draft, Activity, Compliance, and Notes in
  `acquisition/src/AcquisitionApp.tsx:1048`.
- Draft workspace is rendered in `acquisition/src/AcquisitionApp.tsx:1094`.
- Draft type switching covers LinkedIn intro, LinkedIn follow-up, cold email,
  and email follow-up in `acquisition/src/AcquisitionApp.tsx:243`.
- Draft saving, copying, regeneration, and Fanny notes are wired through
  `acquisition/src/AcquisitionApp.tsx:513`, `:526`, and `:538`.
- Draft versions are surfaced in the Draft tab:
  `acquisition/src/AcquisitionApp.tsx:1054` and `:1149`.
- Backend draft versions are stored and appended in
  `backend/src/services/coldAcquisitionService.ts:571`,
  `:833`, and `:1721`.
- Dossier profile sections include Company Profile, What was observed,
  Why it might matter, Safe opening angle, What not to mention, and Research
  blockers in `acquisition/src/AcquisitionApp.tsx:1637`.

### Phase 5B: Outreach Draft Quality Engine

- Draft evaluator flags generic language, fake familiarity, AI-spam tone,
  inflated promise, diagnosis-heavy language, and unrelated claims in
  `backend/src/services/coldAcquisitionService.ts:426`.
- Critical flags drive readiness away from ready-to-rework in
  `backend/src/services/coldAcquisitionService.ts:483`.
- Thin evidence can produce `needs_research` readiness, covered by
  `backend/src/services/coldAcquisitionService.test.ts:178`.
- Tests assert a "game-changer" draft gets `ai_spam_tone`, a missing
  company/contact reference gets `generic_language`, and the draft moves to
  review in `Scripts/cold-acquisition-crm-routes.test.mjs:436`.
- Git history:
  - `7970a4e0 feat(prism): open next lead CTA + draft quality evaluator (Phase 4 gap + 5B)`

### Phase 6: Copy, Send, Reply, Follow-Up Loop

- Copy draft calls `/copy-draft` and mark-sent calls `/mark-sent` from the
  frontend in `acquisition/src/AcquisitionApp.tsx:546` and `:615`.
- Send confirmation modal exists at
  `acquisition/src/AcquisitionApp.tsx:1844`.
- Post-send prompt exists at `acquisition/src/AcquisitionApp.tsx:1932`.
- Reply modal exists at `acquisition/src/AcquisitionApp.tsx:1953`.
- Opt-out warning text is rendered when reply type is `opt_out` in
  `acquisition/src/AcquisitionApp.tsx:2004`.
- Follow-up scheduling is implemented in
  `backend/src/services/coldAcquisitionCrmService.ts:362`.
- Git history:
  - `b1063026 feat(prism): send/reply loop — channel + follow-up + opt-out suppression (Phase 6)`

### Phase 7: Premium Visual Finish

- The frontend is implemented as a dedicated Vite app under `acquisition/`.
- CSS lives in `acquisition/src/acquisition.css`.
- The UI test verifies dedicated PRISM workbench behaviors and source-pipeline
  rendering in `Scripts/cold-acquisition-crm-ui.test.mjs`.
- Owner acceptance still needs subjective validation of "premium, not generic"
  because the checklist remains unchecked.

### Phase 8: v1.1 Speed Layer

- Keyboard shortcuts, command palette, and undo layer were explicitly marked
  as post-core/v1.1 candidates in
  `_SYSTEM/campaigns/c2moviez-acquisition-workbench/03-execution-plan.md:74`.
- No implementation evidence was found for command palette, keyboard shortcut,
  or undo workflow in the PRISM frontend/source search.

### Slice J: Earned-Authority Doctrine

- DeepSeek-backed profile generation is initialized from environment variables
  in `backend/src/services/coldAcquisitionService.ts:7`.
- Doctrine prompt header is loaded from
  `_SYSTEM/campaigns/c2moviez-acquisition-workbench/18-profiler-prompt-header.md`
  in `backend/src/services/coldAcquisitionService.ts:14`.
- Company profile compilation starts in
  `backend/src/services/coldAcquisitionService.ts:1178`.
- Doctrine validation is implemented in
  `backend/src/services/coldAcquisitionService.ts:1304`.
- Draft regeneration route exists at
  `backend/src/routes/coldAcquisitionCrmRoutes.ts:274`.
- Route tests assert draft regeneration returns `200` and includes a compiled
  company profile in `Scripts/cold-acquisition-crm-routes.test.mjs:318`.
- Git history:
  - `4f024af3 feat(prism): DeepSeek profiler + doctrine-compliant draft rebuild (Slice I)`
  - `84bd26ed feat(prism): c2moviez workbench slices 08-20 + service + test updates`

## What Was Cut

- Command palette.
  - Explicitly listed as v1.1 after shortcuts in the execution plan.
  - No PRISM frontend/source implementation evidence found.
- Keyboard shortcuts.
  - Explicitly listed as post-core v1.1.
  - No PRISM frontend/source implementation evidence found.
- Undo layer.
  - Listed in the cut policy.
  - No undo workflow implementation evidence found.
- Advanced analytics.
  - Listed in the cut policy.
  - Admin/source health surfaces exist, but no advanced analytics implementation
    was verified in the PRISM source set.
- Tablet-specific polish.
  - Listed in the cut policy.
  - Desktop/tablet target was stated in the plan, but no separate
    tablet-specific validation artifact was found.
- Deep draft-version controls.
  - Basic draft version visibility shipped.
  - Advanced controls beyond listing recent versions were not verified.

## Owner Feedback

Pending. Marcel's foundation set; handoff to Claudio for operator-loop
validation.

Required owner validation still open in the checklist:

- PRISM opens on Today view, not a CRM dashboard.
- UI name is PRISM.
- Interface feels premium, not generic.
- Topbar always shows sent this week, overdue follow-ups, blocked leads.
- Fanny can work from Today mission without manually hunting through views.
- "Open next lead" selects the compliance-safe highest-score lead.

## Fanny Workflow Feedback

Pending operator (Fanny) live use. See
`_SYSTEM/campaigns/c2moviez-acquisition-workbench/04-acceptance-checklist.md`
Operator Loop section for what to validate.

Specific open operator-loop checks:

- Review a Dossier.
- Open Draft tab and edit generated upstream drafts.
- Confirm draft versions are visible and useful.
- Confirm Draft workspace context and personalization checklist are clear.
- Confirm English-only policy is acceptable for daily work.
- Confirm drafts are evidence-grounded and do not sound AI-generated.
- Confirm thin-evidence leads are held for research instead of pushed forward.
- Confirm copy, mark-sent, reply, and follow-up flow matches Fanny's real loop.

## Defects Found

- Internal template/source leakage in generated output.
  - Evidence: commit `baa833a6 feat(prism): strip internal template leakage from all visible output (Slice H)`.
  - Slice H acceptance criteria explicitly target leaked phrases and guardrail
    UI leakage in
    `_SYSTEM/campaigns/c2moviez-acquisition-workbench/15-codex-slice-h-clean-template-leakage.md:129`.
  - Service normalization now checks for stale/leaky draft claims and rebuilds
    drafts from profile in `backend/src/services/coldAcquisitionService.ts:2495`.
- WKO/source-public-record wording leakage in drafts.
  - Evidence: service tests assert regenerated WKO text does not contain WKO,
    public-profile phrases, `office@2bewired.at`, old "quick thought" wording,
    or `Tiny thought:` in `backend/src/services/coldAcquisitionService.test.ts:272`.
- Salutation formatting issue for empty contact names.
  - Evidence: Slice G acceptance criteria require empty contact names to produce
    `"Hi,"` rather than `"Hi ,"` in
    `_SYSTEM/campaigns/c2moviez-acquisition-workbench/14-codex-slice-g-draft-overhaul.md:111`.
- Slice J route-test compatibility issue.
  - Evidence: Slice J test-fix doc names the `needs_research`
    length-vs-count assertion around line 228 and requires the route test to
    pass in
    `_SYSTEM/campaigns/c2moviez-acquisition-workbench/20-codex-slice-j-test-fix.md:72`.
- No TODO/FIXME/XXX comments were found in
  `backend/src/services/coldAcquisitionService.ts` during this postmortem pass.

## Follow-Up Campaigns

### 1. Operator Acceptance Loop With Claudio and Fanny

Objective:

- Convert the 37 unchecked acceptance boxes into real sign-off evidence.

Scope:

- Run PRISM with Claudio/Fanny against real or representative c2moviez leads.
- Validate Today Mission, Open next lead, Dossier, Draft, Activity,
  Compliance, Notes, copy, mark-sent, reply, opt-out, and follow-up flows.
- Record exact acceptance results back into
  `04-acceptance-checklist.md`.

Why this is next:

- Implementation is present, but checklist sign-off is still 0 checked boxes.
- Owner/operator feedback sections remain pending.

### 2. Compliance Gate Validation With Real CH and AT Leads

Objective:

- Prove compliance behavior with real Swiss and Austrian lead examples before
  broader outreach use.

Scope:

- Validate CH review-needed leads can be drafted but cannot be marked sent.
- Validate AT email is allowed only with documented public business email path.
- Confirm Fanny sees simple compliance status and reason.
- Confirm Marcel/admin can inspect full compliance details.
- Confirm opt-out suppression covers email, LinkedIn URL, and exact
  contact/company identity.

Why this is next:

- Compliance and suppression are implemented, but acceptance boxes remain
  unchecked.
- This is the highest-risk part of the manual outreach loop.

### 3. Follow-Up Cadence and Suppression UI Hardening

Objective:

- Make the sent/reply/follow-up loop reliable enough for repeated weekly use.

Scope:

- Validate weekly target counts 20 sent, not reviewed or touched.
- Harden follow-up date UX around overdue and cleared follow-ups.
- Add explicit suppression inspection/admin UI if Claudio needs operational
  visibility beyond activity logs.
- Decide whether company-wide suppression is required, and keep it explicit.

Why this is next:

- Phase 6 shipped core mechanics.
- Real operator use will expose whether suppression and follow-up states are
  visible enough without adding automation-looking send controls.

## State Snapshot (2026-05-14)

- Backend PRISM TypeScript lines: 3,976.
  - `backend/src/services/coldAcquisitionService.ts`: 2,559 lines.
  - `backend/src/services/coldAcquisitionCrmService.ts`: 880 lines.
  - `backend/src/routes/coldAcquisitionCrmRoutes.ts`: 383 lines.
  - `backend/src/routes/coldAcquisitionRoutes.ts`: 154 lines.
- Frontend PRISM lines:
  - `acquisition/src/AcquisitionApp.tsx`: 2,196 lines.
  - `acquisition/src/main.tsx`: 14 lines.
- Relevant PRISM tests:
  - `Scripts/cold-acquisition-crm-routes.test.mjs`
  - `Scripts/cold-acquisition-crm-ui.test.mjs`
  - `Scripts/cold-acquisition-routes.test.mjs`
  - `Scripts/cold-acquisition-ui.test.mjs`
  - `backend/src/services/coldAcquisitionService.test.ts`
- Relevant PRISM test count: 4 `.test.mjs` plus 1 `.test.ts`.
- Campaign docs: 21 markdown files.
- Acceptance checklist state:
  - Unchecked: 37.
  - Checked: 0.

## Open Threads for Claudio

- Fill owner feedback after Claudio reviews PRISM as a partner handoff, not as
  an implementation demo.
- Fill Fanny workflow feedback after live operator use.
- Decide whether the checklist should be marked in-place or copied into a
  Claudio-facing acceptance sheet.
- Validate whether "premium, not generic" is sufficient for c2moviez brand
  expectations.
- Validate whether the Today Mission default screen is the right daily entry
  point for Fanny.
- Validate whether "Open next lead" ranking feels correct with real leads,
  especially around CH review-needed leads and low-confidence AT leads.
- Validate whether source confidence and wrong-lead risk are understandable
  without Marcel explaining the implementation.
- Validate whether the Dossier evidence is enough for Fanny to rewrite drafts
  confidently.
- Validate whether draft versions are visible enough or whether deeper controls
  are needed in v1.1.
- Confirm DeepSeek/API-key behavior in Claudio's runtime environment.
- Confirm what should happen when `DEEPSEEK_API_KEY` is unset; Slice J expects
  no crash and no template body.
- Confirm whether regeneration should be available to Fanny directly or only
  to Marcel/admin after the first live week.
- Confirm whether opt-out suppression needs an explicit admin inspection view.
- Confirm whether company-wide suppression is required and, if yes, design it
  as an explicit action rather than automatic behavior.
- Confirm whether admin analytics are sufficient or whether a separate
  advanced analytics slice is needed.
- Confirm whether tablet-specific polish matters for the first Claudio/Fanny
  operating week.
- Confirm whether v1.1 should prioritize keyboard shortcuts, command palette,
  or follow-up cadence automation.
- Keep canonical PRISM source untouched until Claudio/Fanny feedback creates
  concrete follow-up tasks.
