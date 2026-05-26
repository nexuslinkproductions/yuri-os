## CODEX TASK SPEC — PRISM Slice A: Source Pipeline

**Slice name:** Source Pipeline
**Branch:** `codex/c2moviez-acquisition-crm`
**Workspace:** `/Users/marcelspatz/NUDIMMUD/.codex-worktrees/prism-workbench`

---

**Goal:** Make source quality visible in the Dossier before Fanny decides to draft. Expose source confidence, source batch, public email basis, and wrong-lead risk chip. No new database table.

---

**Read before changing code:**

- `_SYSTEM/campaigns/c2moviez-acquisition-workbench/00-questionnaire.md`
- `_SYSTEM/campaigns/c2moviez-acquisition-workbench/01-answers.md`
- `_SYSTEM/campaigns/c2moviez-acquisition-workbench/02-decisions.md`
- `_SYSTEM/campaigns/c2moviez-acquisition-workbench/03-execution-plan.md` (Phase 3)
- `_SYSTEM/campaigns/c2moviez-acquisition-workbench/06-outreach-draft-doctrine.md`
- `backend/src/services/coldAcquisitionService.ts`
- `backend/src/services/coldAcquisitionCrmService.ts`
- `acquisition/src/AcquisitionApp.tsx`

---

**Target files — backend:**

- `backend/src/services/coldAcquisitionService.ts`
  - Add `computeSourceConfidence(lead)` function → returns `{ score: number (0–1), level: 'high'|'medium'|'low', signals: string[] }`
  - Confidence factors: source type weight (zefix > wko.at > unknown), evidence count (>3 = +0.2), evidence type diversity (+0.1 per unique type beyond 1), LinkedIn URL present (+0.15), public email basis flag (+0.2), website captured (+0.1)
  - Cap at 1.0, floor at 0.0
  - Signal strings: human-readable reasons shown in Dossier (e.g. "LinkedIn URL present", "No public email basis", "3 evidence items")

- `backend/src/services/coldAcquisitionCrmService.ts`
  - Extend `TodayMissionLead` type and `Lead` response type with `source_pipeline: { confidence: SourceConfidence, batch_id: string|null, public_email_basis: boolean, wrong_lead_risk: boolean }`
  - `wrong_lead_risk = confidence.score < 0.4 AND (lead is sendable or near-sendable)`
  - Populate `source_pipeline` in `getLead()`, `getTodayMission()` sendable and needs_research lists
  - `batch_id` = the value of `source_batch` column if present on the raw lead record, or null

**Target files — frontend:**

- `acquisition/src/AcquisitionApp.tsx`
  - In Dossier tab, after the `WHAT WE KNOW` grid, add a `SOURCE PIPELINE` section:
    - Confidence chip: `high` (green), `medium` (amber), `low` (red/orange) — same chip style as existing evidence badges
    - If `public_email_basis` is true: show "Public email basis ✓" label
    - If `public_email_basis` is false: show "No public email basis" label (muted)
    - If `batch_id` is present: show "Batch: {batch_id}" label (muted small)
    - Confidence signal list: render `source_pipeline.confidence.signals` as small chips or a compact list
  - In Dossier tab, if `wrong_lead_risk` is true: show a `WRONG-LEAD RISK` chip (amber/red) above the draft section and in the header area near the status badge — style similar to the existing `low evidence` badge. Do not show this for confirmed research-needed leads (they already have their own state).
  - Update `Lead` TypeScript type and `TodayMissionLead` type to include `source_pipeline` field

- `acquisition/src/acquisition.css`
  - Add `.source-pipeline-section`, `.confidence-chip`, `.wrong-lead-risk-chip` classes consistent with existing chip/badge patterns

**Target files — tests:**

- `Scripts/cold-acquisition-crm-routes.test.mjs`
  - Add: lead response includes `source_pipeline` object with `confidence`, `batch_id`, `public_email_basis`, `wrong_lead_risk`
  - Add: lead with LinkedIn URL + 3+ evidence items produces `confidence.level = 'high'` or `'medium'`
  - Add: lead with no evidence and unknown source produces `confidence.level = 'low'`
  - Add: `wrong_lead_risk` is false for leads already in `needs_research` state

- `Scripts/cold-acquisition-crm-ui.test.mjs`
  - Add: Dossier tab renders `SOURCE PIPELINE` section
  - Add: Confidence chip present in Dossier
  - Add: Wrong-lead risk chip present when `wrong_lead_risk` is true
  - Add: No wrong-lead risk chip for research-needed leads

---

**Constraints:**

- Do NOT add a new database table or migration
- Do NOT modify the compliance send gate logic
- Do NOT change how `scoring.total_score` is computed
- Do NOT change the `draft_specificity` readiness logic (that is Phase 5B)
- Do NOT rename internal `Crm` classes/files
- Do NOT touch `.claude/` files
- Do NOT commit anything outside the listed target files
- Do NOT auto-commit; stage only, then stop

---

**Acceptance criteria:**

- [ ] `node Scripts/cold-acquisition-crm-routes.test.mjs` passes
- [ ] `node Scripts/cold-acquisition-crm-ui.test.mjs` passes
- [ ] `npx tsc -p acquisition/tsconfig.json --noEmit` exits 0
- [ ] `npx vite build --config acquisition/vite.config.mts` exits 0
- [ ] `PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules/.bin:$PATH" NODE_PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules" npm --prefix backend run build` exits 0
- [ ] Dossier tab shows SOURCE PIPELINE section for a seeded lead
- [ ] Confidence chip matches evidence quality of lead
- [ ] Wrong-lead risk chip visible for low-confidence sendable lead
- [ ] No temporary `backend/node_modules` symlink remains in git status

**Test commands:**
```bash
node Scripts/cold-acquisition-crm-ui.test.mjs
npx tsc -p acquisition/tsconfig.json --noEmit
PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules/.bin:$PATH" NODE_PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules" TS_NODE_TRANSPILE_ONLY=1 node Scripts/cold-acquisition-crm-routes.test.mjs
PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules/.bin:$PATH" NODE_PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules" npm --prefix backend run build
npx vite build --config acquisition/vite.config.mts
```

**Runtime review:**
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

Review at: `http://127.0.0.1:3911/acquisition/today`

---

**Staging commands (run after all tests pass):**
```bash
git add \
  backend/src/services/coldAcquisitionService.ts \
  backend/src/services/coldAcquisitionCrmService.ts \
  acquisition/src/AcquisitionApp.tsx \
  acquisition/src/acquisition.css \
  backend/public/acquisition/assets/ \
  backend/public/acquisition/index.html \
  Scripts/cold-acquisition-crm-routes.test.mjs \
  Scripts/cold-acquisition-crm-ui.test.mjs
```

**Rollback boundary:** `git restore --staged .` resets everything.

**Prohibited:**
- No auto-commit
- No git push
- No changes outside listed files
- No new dependencies without approval
- No `git add .` or `git add -A`
- No `backend/node_modules` symlink left in git status

---

**Expected final report:**
- Files changed
- Which tests passed
- Any runtime URL still running
- Whether branch is clean
- Known limitations
