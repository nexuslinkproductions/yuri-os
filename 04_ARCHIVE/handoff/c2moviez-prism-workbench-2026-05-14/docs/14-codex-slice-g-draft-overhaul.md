## CODEX TASK SPEC — Slice G: Evidence-First Draft Overhaul

**Slice name:** Draft generation rewrite — evidence-driven, no blank contact slots
**Branch:** `codex/c2moviez-acquisition-crm`
**Workspace:** `/Users/marcelspatz/NUDIMMUD/.codex-worktrees/prism-workbench`

---

**Goal:** Drafts must use actual evidence text, not 5-template industry hooks. No lead should produce `"Hi ,"` or `"Hi undefined,"`. The draft quality evaluator should pass more often after this slice because the evidence is now real.

---

**Read before changing code:**
- `backend/src/services/coldAcquisitionService.ts` — `generateDrafts()` (~line 1001), `buildOutreachProfile()` (~line 1068), `openingAngle()` (~line 1108), `whySignalMightMatter()` (~line 1125), `buildProspectObservation()` (~line 1092)
- `draft_specificity` type and `evaluateDraftQuality()` (~line 371)

---

**Target files:**

**`backend/src/services/coldAcquisitionService.ts`**

**1. Fix contact name handling everywhere in draft generation:**
- Add a helper `resolveFirstName(contact: ColdLeadContact): string`:
  - If `contact.name` is non-empty: return first word of name
  - Otherwise: return `''` (empty string)
- In ALL draft templates, replace `Hi ${firstName},` with:
  ```ts
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  ```
- Never produce `"Hi ,"` or `"Hi undefined,"` or `"Hi null,"` — this is a hard invariant

**2. Replace `openingAngle()` with evidence-first selection:**

New logic for `buildOutreachProfile()`:

Pick the best evidence item for the opening in this priority order:
1. `website_about` evidence → use `evidence.detail` verbatim (max 160 chars)
2. `website_about_page` evidence → use `evidence.detail` verbatim (max 160 chars)
3. `zefix_purpose` evidence → use `evidence.detail` verbatim (max 160 chars)
4. `website_tech_signal` evidence → use `evidence.detail` (e.g. "Uses Shopify")
5. `website_news` evidence → use `evidence.detail` (e.g. "Recent post: ...")
6. Any other evidence with `detail` longer than 30 chars → use first 160 chars
7. Fallback only if ALL evidence is empty: use the 5-way industry regex hooks (existing `openingAngle()` logic)

Store this as `outreachProfile.observed_signal` (replaces the current `buildProspectObservation()` output).

**3. Replace `whySignalMightMatter()` with evidence-derived relevance:**

New logic: derive the "why it might matter" from the evidence kind:
- `website_about` / `website_about_page` / `zefix_purpose` → `"This is how {companyName} describes itself — the right angle usually comes from here."`
- `website_tech_signal` → `"Their tech stack is visible from the outside — that's a concrete reason to reach out."`
- `website_news` → `"They published recently — active companies respond faster."`
- `website_team` → `"A named contact was found — personalised outreach converts higher than generic."`
- Fallback (no rich evidence) → keep existing 5-way industry regex as-is

**4. Draft lead sentence — use real evidence text:**

In `generateDrafts()`, replace the `introLead` construction:

Current:
```
`I was reviewing ${researchContext} and noticed ${observation}.`
```

New:
```ts
const bestDetail = outreachProfile.observed_signal;
const introLead = bestDetail.length > 0
  ? `I came across ${companyName} while reviewing ${researchContext} — ${bestDetail.slice(0, 120)}.`
  : `I was reviewing ${researchContext} and noticed ${companyName}.`;
```

**5. Subject line — add one concrete detail:**

Current: `"quick note on {CompanyName}"`

New:
```ts
const techSignal = evidence.find(e => e.kind === 'website_tech_signal');
const newsSignal = evidence.find(e => e.kind === 'website_news');
const subjectDetail = techSignal
  ? ` — ${techSignal.detail.toLowerCase()}`
  : newsSignal
  ? ` — active recently`
  : '';
const shortSubject = `quick note on ${companyNameClean}${subjectDetail}`;
```

**6. Do NOT:**
- Remove or break the `evaluateDraftQuality()` function
- Change the `validateDraftSpecificity()` logic
- Change any CRM route or frontend code
- Touch the 6-flag evaluator (Slice B)

---

**Constraints:**
- Do NOT touch `.claude/` files, `AGENTS.md`, `CLAUDE.md`
- Do NOT auto-commit; stage only, then stop
- The fallback to industry hooks must remain for leads with no rich evidence
- No `backend/node_modules` symlink in git status

---

**Acceptance criteria:**
- [ ] `npx tsc -p acquisition/tsconfig.json --noEmit` exits 0
- [ ] `PATH=... TS_NODE_TRANSPILE_ONLY=1 node Scripts/cold-acquisition-crm-routes.test.mjs` passes
- [ ] `node Scripts/cold-acquisition-crm-ui.test.mjs` passes
- [ ] `npx vite build --config acquisition/vite.config.mts` exits 0
- [ ] A lead with `website_about` evidence produces a draft whose linkedin_intro contains the evidence detail text
- [ ] A lead with empty `contact.name` produces a draft starting with `"Hi,"` not `"Hi ,"`
- [ ] A lead with `contact.name = "Markus Huber"` produces a draft starting with `"Hi Markus,"`

**Test commands:**
```bash
node Scripts/cold-acquisition-crm-ui.test.mjs
npx tsc -p acquisition/tsconfig.json --noEmit
PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules/.bin:$PATH" NODE_PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules" TS_NODE_TRANSPILE_ONLY=1 node Scripts/cold-acquisition-crm-routes.test.mjs
npx vite build --config acquisition/vite.config.mts
```

**Staging commands:**
```bash
git add backend/src/services/coldAcquisitionService.ts
```

**Rollback boundary:** `git restore --staged .`

**Prohibited:**
- No auto-commit
- No git push
- No `git add .` or `git add -A`
