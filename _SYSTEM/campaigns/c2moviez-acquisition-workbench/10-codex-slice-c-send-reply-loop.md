## CODEX TASK SPEC — PRISM Slice C: Send/Reply Loop (Phase 6)

**Slice name:** Copy → Send Confirmation → Reply Capture → Opt-Out Suppression
**Branch:** `codex/c2moviez-acquisition-crm`
**Workspace:** `/Users/marcelspatz/YURI-OS-MUSUBI/.codex-worktrees/prism-workbench`

---

**Goal:** Complete the manual outreach loop. When Fanny copies a draft, she must confirm the channel and set a follow-up date. After sending, PRISM asks what to do next. Replies are logged. Opt-out replies trigger suppression.

Fanny remains the manual sender. PRISM never sends anything.

---

**Read before changing code:**

- `_SYSTEM/campaigns/c2moviez-acquisition-workbench/03-execution-plan.md` (Phase 6)
- `_SYSTEM/campaigns/c2moviez-acquisition-workbench/06-outreach-draft-doctrine.md`
- `_SYSTEM/campaigns/c2moviez-acquisition-workbench/02-decisions.md`
- `backend/src/routes/coldAcquisitionCrmRoutes.ts` — existing mark-sent and reply routes
- `acquisition/src/AcquisitionApp.tsx` — existing send modal, reply modal, Copy button flow

---

**Target files — backend:**

**`backend/src/routes/coldAcquisitionCrmRoutes.ts`**

Update `POST /acquisition/api/leads/:id/mark-sent`:
- Require `channel` in request body: `'linkedin' | 'email'`
- Require `follow_up_date` in request body: ISO date string (e.g. `"2026-05-20"`) or null
- If `channel` is missing: return `400 { error: 'channel required' }`
- Store `channel` on the lead record (add to existing update, do not create new table)
- If `follow_up_date` provided: set `next_follow_up_at` to that date
- Existing send gate remains unchanged — CH-review leads cannot be marked sent

Update `POST /acquisition/api/leads/:id/reply`:
- Require `reply_type` in body: `'interested' | 'not_now' | 'opt_out' | 'other'`
- Require `note` in body: string (can be empty string)
- If `reply_type === 'opt_out'`:
  - Set lead `status = 'disqualified'`
  - Insert suppression record for: email (if present), linkedin_url (if present), exact contact name + company name combination
  - Return `200 { suppressed: true, lead_id }`
- All other reply types: log to lead activity, return `200 { suppressed: false, lead_id }`

**`backend/src/services/coldAcquisitionCrmService.ts`**

Add `logReply(leadId, userId, replyType, note)`:
- Appends to lead activity log (use existing activity log pattern if present, otherwise append to `notes` or a structured field)
- Returns updated lead

---

**Target files — frontend:**

**`acquisition/src/AcquisitionApp.tsx`**

Replace the existing send modal with `SendConfirmModal`:

Fields:
- Channel selector: two buttons/radio — "LinkedIn" | "Email" — required, no default
- Follow-up date input: `<input type="date">` — optional but encouraged
- Confirm button: "Mark sent + copy draft" — disabled until channel is selected
- Cancel button

Behavior:
- On confirm: copy draft text to clipboard, then call `POST .../mark-sent` with `{ channel, follow_up_date }`
- On success: close modal, show `PostSendPrompt` inline in the inspector (not another modal)

`PostSendPrompt` (inline, replaces send button area after send):
- "Sent. What's next?"
- Three action chips: "Open next lead →" | "Add a note" | "Done for today"
- "Open next lead →": calls `getNextLead()` then opens lead
- "Add a note": focuses the Notes tab
- "Done for today": dismisses prompt, no navigation

`ReplyModal`:
- Triggered by "Log reply" button in inspector (add this button to Activity tab or inspector header area)
- Fields:
  - Reply type: four options as radio/button group — "Interested", "Not now", "Opted out", "Other"
  - Note: textarea (optional)
- On "Opted out" selected: show amber warning "This will suppress the contact and disqualify the lead."
- Submit button: "Log reply"
- On submit: call `POST .../reply` with `{ reply_type, note }`
- On `suppressed: true` response: show "Contact suppressed. Lead disqualified." confirmation and close modal
- On other response: show "Reply logged." and close

**`acquisition/src/acquisition.css`**

Add styles for:
- `.send-confirm-modal` — channel selector buttons, follow-up date input
- `.post-send-prompt` — inline, compact, action chips
- `.reply-modal` — reply type button group, opt-out warning
- `.channel-selector-btn` (selected state distinct from default)

---

**Target files — tests:**

**`_SYSTEM/Scripts/cold-acquisition-crm-routes.test.mjs`**

- Add: `POST .../mark-sent` without channel returns 400
- Add: `POST .../mark-sent` with `{ channel: 'linkedin', follow_up_date: '2026-05-20' }` succeeds and sets `next_follow_up_at`
- Add: `POST .../reply` with `reply_type: 'opt_out'` returns `suppressed: true` and sets lead to disqualified
- Add: `POST .../reply` with `reply_type: 'interested'` returns `suppressed: false`
- Add: suppressed contact email does not appear in `sendable` pool after opt-out

**`_SYSTEM/Scripts/cold-acquisition-crm-ui.test.mjs`**

- Add: Send modal contains channel selector
- Add: Send modal contains follow-up date input
- Add: Reply modal present in UI code
- Add: Opt-out warning text present in reply modal
- Add: PostSendPrompt renders "What's next?" text

---

**Constraints:**

- Fanny never sends anything — PRISM only copies draft and logs the manual send
- Do NOT weaken the existing compliance send gate
- Do NOT modify `source_pipeline` or `evaluateDraftQuality` logic (Slices A/B)
- Do NOT create a new database table
- Do NOT rename internal `Crm` classes/files
- Do NOT touch `.claude/` files, `AGENTS.md`, `CLAUDE.md`
- Do NOT auto-commit; stage only, then stop
- No `backend/node_modules` symlink left in git status

---

**Acceptance criteria:**

- [ ] `node _SYSTEM/Scripts/cold-acquisition-crm-ui.test.mjs` passes
- [ ] `npx tsc -p acquisition/tsconfig.json --noEmit` exits 0
- [ ] `PATH=... NODE_PATH=... TS_NODE_TRANSPILE_ONLY=1 node _SYSTEM/Scripts/cold-acquisition-crm-routes.test.mjs` passes
- [ ] `npx vite build --config acquisition/vite.config.mts` exits 0
- [ ] mark-sent without channel returns 400
- [ ] opt-out reply suppresses contact and disqualifies lead
- [ ] SendConfirmModal shows channel selector + follow-up date
- [ ] PostSendPrompt shows after send with "What's next?" actions
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
  backend/src/routes/coldAcquisitionCrmRoutes.ts \
  backend/src/services/coldAcquisitionCrmService.ts \
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
- No new dependencies without approval
- No backend/node_modules symlink in final git status

---

**Expected final report:**
- Files changed
- Which tests passed
- Branch clean status (pre-existing unstaged .claude/AGENTS.md/CLAUDE.md are OK to ignore)
- Known limitations
