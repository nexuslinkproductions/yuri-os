## CODEX TASK SPEC — Slice H: Remove Internal Template Leakage

**Slice name:** Strip internal search methodology, geography, and placeholder text from all visible output
**Branch:** `codex/c2moviez-acquisition-crm`
**Workspace:** `/Users/marcelspatz/YURI-OS-MUSUBI/.codex-worktrees/prism-workbench`

---

**Goal:** No internal search parameters (postal codes, country names, "Vienna", "Swiss", "company records") should appear in any card, draft, evidence chip, compliance note, or Dossier section that Fanny sees. These were operational notes for how we source leads — they must never reach the UI or a draft.

---

**Read before changing code:**
- `backend/src/services/coldAcquisitionService.ts`:
  - `researchContext()` (~line 1251)
  - `generateDrafts()` intro lead construction (~lines 1082–1084)
  - Evidence fallback strings in `ingestZefixBulk()` (~line 613) and `ingestAustriaDirectory()` (~line 703)
  - Guardrail note: `"AT lead is outside Vienna 1220/1160 target scope."` (~line 1018)
  - `openingAngle()` and `whySignalMightMatter()` (~lines 1172–1230)
- `acquisition/src/AcquisitionApp.tsx`:
  - Dossier `observed_signal` / `why_it_might_matter` / `opening_angle` fallback strings (~lines 1564–1566)
  - `guardrail_notes` render (~line 1172)

---

**Target files:**

**`backend/src/services/coldAcquisitionService.ts`**

**1. Delete `researchContext()` and remove it from draft intro:**
- Delete the `private researchContext(company)` method entirely (lines ~1251–1255)
- In `generateDrafts()`, remove all references to `researchContext`
- Replace both intro lead constructions with:
  ```ts
  const introLead = bestDetail.length > 0
      ? `I came across ${companyName} — ${bestDetail.slice(0, 120)}.`
      : `I noticed ${companyName} and wanted to reach out.`;
  ```
- No geography, no "while reviewing", no "Swiss records", no "Vienna firms"

**2. Fix evidence fallback detail strings:**

In `ingestZefixBulk()` (~line 613), replace:
```ts
detail: record.purpose || `${record.name} is an active ${record.legal_form || 'Swiss company'} in ${record.canton || 'Switzerland'}.`
```
With:
```ts
detail: record.purpose || `${record.name} — registered ${record.legal_form || 'company'}${record.date_of_entry ? ', since ' + record.date_of_entry.slice(0, 4) : ''}.`
```

In `ingestAustriaDirectory()` (~line 703), replace:
```ts
detail: record.evidence_detail || `${record.name} is listed in Vienna ${entry.district}.`
```
With:
```ts
detail: record.evidence_detail || `${record.name} — WKO directory listing.`
```

**3. Clean guardrail notes:**

Find all guardrail_notes.push() calls that contain postal codes or internal geography. Replace:
- `'AT lead is outside Vienna 1220/1160 target scope.'` → `'Outside primary target area.'`
- Any other note containing "1220", "1160", "Swiss", "Vienna", "Wien" as targeting criteria → strip the geography, keep only the functional reason

**4. Clean `openingAngle()` and `whySignalMightMatter()`:**

These produce strings that go into `draft_specificity.profile.opening_angle` and `profile.why_it_might_matter`. They are shown in the Dossier "Safe opening angle" and "Why it might matter" sections.

When these functions fall through to the DEFAULT case (no industry match), they currently return:
- `openingAngle` default: `"${surface} is shaping the first impression already."` — this is a generic placeholder masquerading as insight. Replace with `''` (empty string) for the default case.
- `whySignalMightMatter` default: whatever the current fallback is — replace with `''` for the default case.

Named-industry matches (biotech, SaaS, hospitality, fintech) may keep their values IF they're backed by evidence (the caller already checks `richEvidence` — keep that logic).

**`acquisition/src/AcquisitionApp.tsx`**

**5. Dossier profile fallbacks (lines ~1564–1566):**

Replace:
```ts
const observed = profile?.observed_signal || lead.evidence[0]?.detail || 'Specific observation pending';
const why = profile?.why_it_might_matter || 'Relevance depends on stronger evidence before outreach.';
const opening = profile?.opening_angle || 'Use a narrow, source-backed observation only.';
```
With:
```ts
const observed = profile?.observed_signal || lead.evidence[0]?.detail || '';
const why = profile?.why_it_might_matter || '';
const opening = profile?.opening_angle || '';
```

**6. Dossier section rendering — hide empty profile fields:**

In the `DossierPanel` component, wrap each of "What was observed", "Why it might matter", "Safe opening angle" sections so they only render when their value is non-empty:
```tsx
{observed ? <DossierSection title="What was observed"><p>{observed}</p></DossierSection> : null}
{why ? <DossierSection title="Why it might matter"><p>{why}</p></DossierSection> : null}
{opening ? <DossierSection title="Safe opening angle"><p>{opening}</p></DossierSection> : null}
```

**7. Guardrail notes render — filter internal notes:**

At line ~1172 where `guardrail_notes` are rendered, add a filter to suppress notes that contain internal targeting strings before rendering:
```tsx
{activeLead.compliance.guardrail_notes
  .filter(note => !/1220|1160|target scope|Vienna|Swiss company records/i.test(note))
  .map(note => <p className="guardrail compact" key={note}>{note}</p>)
}
```

---

**Constraints:**
- Do NOT remove the guardrail notes from the database/compliance record — only suppress them in the UI render
- Do NOT remove the postal code filter logic from ingest — it is a valid business rule, just must not be visible to Fanny
- Do NOT touch `.claude/` files, `AGENTS.md`, `CLAUDE.md`
- Do NOT auto-commit; stage only, then stop
- No `backend/node_modules` symlink in git status

---

**Acceptance criteria:**
- [ ] `node Scripts/cold-acquisition-crm-ui.test.mjs` passes
- [ ] `npx tsc -p acquisition/tsconfig.json --noEmit` exits 0
- [ ] `PATH=... TS_NODE_TRANSPILE_ONLY=1 node Scripts/cold-acquisition-crm-routes.test.mjs` passes
- [ ] `npx vite build --config acquisition/vite.config.mts` exits 0
- [ ] No draft contains "Swiss company records", "Vienna software", "while reviewing", or "a few"
- [ ] No evidence detail contains "is listed in Vienna 1220" or "is an active Swiss company"
- [ ] Dossier "What was observed" section does not render when `observed_signal` is empty
- [ ] Guardrail note "1220/1160 target scope" does not appear in the compliance tab UI

**Test commands:**
```bash
node Scripts/cold-acquisition-crm-ui.test.mjs
npx tsc -p acquisition/tsconfig.json --noEmit
PATH="/Users/marcelspatz/YURI-OS-MUSUBI/backend/node_modules/.bin:$PATH" NODE_PATH="/Users/marcelspatz/YURI-OS-MUSUBI/backend/node_modules" TS_NODE_TRANSPILE_ONLY=1 node Scripts/cold-acquisition-crm-routes.test.mjs
npx vite build --config acquisition/vite.config.mts
```

**Staging commands:**
```bash
git add \
  backend/src/services/coldAcquisitionService.ts \
  acquisition/src/AcquisitionApp.tsx \
  backend/public/acquisition/assets/ \
  backend/public/acquisition/index.html
```

**Rollback boundary:** `git restore --staged .`

**Prohibited:**
- No auto-commit
- No git push
- No `git add .` or `git add -A`
