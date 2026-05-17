## CODEX TASK SPEC — PRISM Slice B: Open Next Lead + Draft Quality Engine

**Slice name:** Open Next Lead + Draft Quality Engine (Phase 4 gap + Phase 5B)
**Branch:** `codex/c2moviez-acquisition-crm`
**Workspace:** `/Users/marcelspatz/YURI-OS-MUSUBI/.codex-worktrees/prism-workbench`

---

**Goal:** Two additions:
1. "Open next lead" CTA in the Today header — selects the compliance-safe highest-score sendable lead and opens it in the inspector.
2. Draft quality evaluator — flags drafts that outrun their evidence. Failing drafts get `draft_review` readiness instead of `ready`.

---

**Read before changing code:**

- `_SYSTEM/campaigns/c2moviez-acquisition-workbench/03-execution-plan.md` (Phase 4 + Phase 5B)
- `_SYSTEM/campaigns/c2moviez-acquisition-workbench/06-outreach-draft-doctrine.md`
- `backend/src/services/coldAcquisitionService.ts` — existing `DraftSpecificity`, `draft_specificity.readiness` logic
- `backend/src/services/coldAcquisitionCrmService.ts` — `getTodayMission()`, `getLead()`, `TodayMissionLead`
- `acquisition/src/AcquisitionApp.tsx` — existing Today header, send-modal flow, inspector open logic

---

**Target files — backend:**

**`backend/src/services/coldAcquisitionCrmService.ts`**

Add `getNextLead(userId: string)`:
- Returns the highest `scoring.total_score` lead from the `sendable` pool (leads that pass the existing send eligibility check)
- Excludes: CH leads with `status = 'review'`, suppressed leads, already-sent leads
- Returns `{ lead_id: string; score: number } | null`
- If no eligible lead: returns `null`

**`backend/src/routes/coldAcquisitionCrmRoutes.ts`**

Add `GET /acquisition/api/next-lead`:
- Auth: operator or admin
- Calls `ColdAcquisitionCrmService.getNextLead(userId)`
- Response `200`: `{ lead_id: string; score: number }` or `{ lead_id: null }` if none

**`backend/src/services/coldAcquisitionService.ts`**

Add `evaluateDraftQuality(draft: string, lead: ColdLeadRecord): DraftEvaluationResult`:

```ts
interface DraftEvaluationResult {
  passed: boolean;
  flags: DraftFlag[];
}

type DraftFlag =
  | 'unrelated_claim'    // references fact not in lead evidence or Dossier fields
  | 'generic_language'   // opening has no company/contact-specific reference
  | 'fake_familiarity'   // phrase like "I've been following" without LinkedIn evidence
  | 'ai_spam_tone'       // detected AI-spam phrase patterns
  | 'inflated_promise'   // claims about guaranteed ROI, transformation, disruption
  | 'diagnosis_heavy';   // assumes pain/problem not grounded in dossier signals
```

Implementation rules:
- `generic_language`: flag if draft does not contain the company name OR contact name from `lead.company.name` / `lead.contact.name`
- `fake_familiarity`: flag if draft contains "I've been following", "I've been watching", "huge fan", "love your work", "I've admired" AND `lead.contact.linkedin_url` is absent
- `ai_spam_tone`: flag if draft contains any of: "game-changer", "revolutionize", "disrupting", "cutting-edge", "seamlessly", "unlock your potential", "take your [X] to the next level", "skyrocket"
- `inflated_promise`: flag if draft contains: "guaranteed", "100%", "proven results", "transform your business", "double your revenue"
- `diagnosis_heavy`: flag if draft contains phrases like "struggling with", "pain point", "I know you're facing", "challenge you're dealing with" AND none of `lead.evidence` items reference those exact topics
- `unrelated_claim`: flag if draft mentions a specific technology, product, or metric that does not appear in any `lead.evidence[*].content` or `lead.company` fields

If `flags.length > 0` AND any flag is `generic_language`, `fake_familiarity`, or `ai_spam_tone`: `passed = false`
All other flags: `passed = false` only if 2 or more non-critical flags are set.

Integrate evaluator into draft generation: after generating a draft, run `evaluateDraftQuality`. If `!passed`:
- Set `draft_specificity.readiness = 'draft_review'` (not `ready`)
- Include `evaluation_flags` in the draft response

Add `evaluation_flags?: DraftFlag[]` to the draft response type.

---

**Target files — frontend:**

**`acquisition/src/AcquisitionApp.tsx`**

"Open next lead" CTA:
- Add an "Open next lead →" button to the Today Mission header area (near the WEEKLY TARGET stat or the queue header)
- On click: call `GET /acquisition/api/next-lead`
- If `lead_id` is returned: set that lead as `activeLead` (same as clicking Inspect/Review in the queue)
- If null: show a brief inline message "No sendable leads available" (do not use a modal for this)
- Button is only visible when `mission.sendable.length > 0`
- Use existing `api<T>()` helper

Draft quality flags in Draft tab:
- If `evaluation_flags` is present on the draft response AND array is non-empty:
  - Show a compact `DRAFT FLAGS` section above the draft textarea
  - Each flag rendered as a warning chip (amber): human-readable label map:
    - `generic_language` → "No company/contact reference"
    - `fake_familiarity` → "Familiarity without LinkedIn"
    - `ai_spam_tone` → "AI-spam phrases"
    - `inflated_promise` → "Inflated promise"
    - `diagnosis_heavy` → "Ungrounded diagnosis"
    - `unrelated_claim` → "Unrelated claim"
  - If `draft_specificity.readiness === 'draft_review'`: show "Draft needs review" badge (amber) next to the draft type tabs, NOT "Ready for Review"
  - Copy button remains disabled when `draft_review` — same logic as `needs_research`

**`acquisition/src/acquisition.css`**

Add `.draft-flags-section`, `.draft-flag-chip`, `.open-next-lead-btn` classes consistent with existing patterns.

---

**Target files — tests:**

**`_SYSTEM/Scripts/cold-acquisition-crm-routes.test.mjs`**

- Add: `GET /acquisition/api/next-lead` returns `lead_id` for a user with sendable leads
- Add: `GET /acquisition/api/next-lead` returns `{ lead_id: null }` when no sendable leads
- Add: CH review lead is excluded from next-lead response
- Add: draft with no company name reference is flagged `generic_language`
- Add: draft with "game-changer" is flagged `ai_spam_tone`
- Add: clean draft passes evaluator with no flags

**`_SYSTEM/Scripts/cold-acquisition-crm-ui.test.mjs`**

- Add: "Open next lead" button present in Today header
- Add: Draft tab renders `DRAFT FLAGS` section when flags present
- Add: `draft_review` status shows "Draft needs review" badge

---

**Constraints:**

- Do NOT modify existing send gate or compliance logic
- Do NOT modify `source_pipeline` fields added in Slice A
- Do NOT rename internal `Crm` classes/files
- Do NOT touch `.claude/` files, `AGENTS.md`, `CLAUDE.md`
- Do NOT add a new database table
- Do NOT auto-commit; stage only, then stop
- Do NOT add `git add .` or `git add -A`
- No `backend/node_modules` symlink left in git status

---

**Acceptance criteria:**

- [ ] `node _SYSTEM/Scripts/cold-acquisition-crm-ui.test.mjs` passes
- [ ] `npx tsc -p acquisition/tsconfig.json --noEmit` exits 0
- [ ] `PATH=... NODE_PATH=... TS_NODE_TRANSPILE_ONLY=1 node _SYSTEM/Scripts/cold-acquisition-crm-routes.test.mjs` passes
- [ ] `npx vite build --config acquisition/vite.config.mts` exits 0
- [ ] "Open next lead" button visible in Today header when sendable leads exist
- [ ] Clicking it opens the highest-score sendable lead
- [ ] Draft with "game-changer" gets `ai_spam_tone` flag
- [ ] Draft with no company name gets `generic_language` flag + Copy disabled
- [ ] Clean draft passes with no flags
- [ ] No backend/node_modules symlink in git status

**Test commands:**
```bash
node _SYSTEM/Scripts/cold-acquisition-crm-ui.test.mjs
npx tsc -p acquisition/tsconfig.json --noEmit
PATH="/Users/marcelspatz/YURI-OS-MUSUBI/backend/node_modules/.bin:$PATH" NODE_PATH="/Users/marcelspatz/YURI-OS-MUSUBI/backend/node_modules" TS_NODE_TRANSPILE_ONLY=1 node _SYSTEM/Scripts/cold-acquisition-crm-routes.test.mjs
npx vite build --config acquisition/vite.config.mts
```

**Staging commands (run after all tests pass):**
```bash
git add \
  backend/src/services/coldAcquisitionService.ts \
  backend/src/services/coldAcquisitionCrmService.ts \
  backend/src/routes/coldAcquisitionCrmRoutes.ts \
  acquisition/src/AcquisitionApp.tsx \
  acquisition/src/acquisition.css \
  backend/public/acquisition/assets/ \
  backend/public/acquisition/index.html \
  _SYSTEM/Scripts/cold-acquisition-crm-routes.test.mjs \
  _SYSTEM/Scripts/cold-acquisition-crm-ui.test.mjs
```

**Rollback boundary:** `git restore --staged .`

**Prohibited:**
- No auto-commit
- No git push
- No `git add .` or `git add -A`
- No changes outside listed files
- No new dependencies without approval
- No backend/node_modules symlink in final git status

---

**Expected final report:**
- Files changed
- Which tests passed
- Branch clean status
- Known limitations
