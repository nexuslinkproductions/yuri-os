## CODEX TASK SPEC — Slice I: Company Profiler + Doctrine-Compliant Draft Rebuild

**Slice name:** Replace template engine with DeepSeek-powered company profiler + doctrine templates
**Branch:** `codex/c2moviez-acquisition-crm`
**Workspace:** `/Users/marcelspatz/YURI-OS-MUSUBI/.codex-worktrees/prism-workbench`

---

**Goal:** Replace the broken template-based draft generator with a two-step pipeline:
1. `compileCompanyProfile()` — uses DeepSeek to synthesise evidence into a real company profile
2. `generateDrafts()` rewrite — uses that profile with the exact doctrine templates from `06-outreach-draft-doctrine.md`

Current broken output: "Hi, I came across DBConcepts — WKO lists DBConcepts GmbH in 1220 Wien as an Oracle database and solution specialist... One thing that stood out: a new reader is deciding quickly whether that page makes the product easy to understand."

Required output: "Hi, I noticed your services page describes DBConcepts as an Oracle database specialist. Tiny thought: if that page is often a first impression for enterprise clients, a short explainer angle that translates the technical expertise may be worth checking before they enquire. I can send a short example angle if useful."

---

**Read before changing code:**
- `backend/src/services/coldAcquisitionService.ts` — full file (generateDrafts ~1060, buildOutreachProfile ~1138, openingAngle ~1172, whySignalMightMatter ~1189, buildProspectObservation ~1693)
- `_SYSTEM/campaigns/c2moviez-acquisition-workbench/06-outreach-draft-doctrine.md` — doctrine templates, rubric, style guide
- `backend/src/routes/coldAcquisitionCrmRoutes.ts` — existing route patterns for adding the regenerate route

---

**Target files:**

### `backend/src/services/coldAcquisitionService.ts`

**STEP 1: Add DeepSeek client at the top of the file (after existing imports):**

```typescript
import OpenAI from 'openai';

const deepseekClient = process.env.DEEPSEEK_API_KEY || process.env.CODE_DEEPSEEK_API_KEY
    ? new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY || process.env.CODE_DEEPSEEK_API_KEY || '',
        baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    })
    : null;
```

**STEP 2: Add `CompiledCompanyProfile` interface near the other interfaces:**

```typescript
interface CompiledCompanyProfile {
    company_name: string;
    contact_name: string;
    contact_role: string;
    market: string;
    website: string;
    primary_source_url: string;
    best_surface: string;
    what_we_noticed: string;
    why_it_might_matter: string;
    c2moviez_relevance: string;
    safe_opening_angle: string;
    claims_to_avoid: string[];
    evidence_confidence: 'high' | 'medium' | 'low';
}
```

**STEP 3: Add `compileCompanyProfile()` as a new async private method:**

```typescript
private async compileCompanyProfile(
    company: Required<ColdLeadCompany>,
    contact: Required<ColdLeadContact>,
    evidence: ColdLeadEvidence[],
    confidence: 'high' | 'medium' | 'low'
): Promise<CompiledCompanyProfile> {
    // --- Deterministic fields ---
    const bestSurface = (() => {
        if (evidence.some(e => e.kind === 'website_about' || e.kind === 'website_about_page')) return 'your website';
        if (evidence.some(e => e.kind === 'website_tech_signal')) return 'your product page';
        if (evidence.some(e => e.kind === 'website_news')) return 'your recent activity';
        if (evidence.some(e => e.kind === 'zefix_purpose' || e.kind === 'wko_directory')) return 'your public listing';
        return 'your company page';
    })();

    const base: CompiledCompanyProfile = {
        company_name: company.name,
        contact_name: contact.name || '',
        contact_role: contact.title || '',
        market: company.city || (company.country === 'AT' ? 'Austria' : 'Switzerland'),
        website: company.website || '',
        primary_source_url: '',
        best_surface: bestSurface,
        what_we_noticed: '',
        why_it_might_matter: '',
        c2moviez_relevance: '',
        safe_opening_angle: bestSurface,
        claims_to_avoid: [],
        evidence_confidence: confidence,
    };

    // --- LLM synthesis ---
    if (!deepseekClient) {
        // Fallback: use best evidence detail as what_we_noticed
        const bestEvidence = evidence.find(e =>
            ['website_about', 'website_about_page', 'zefix_purpose'].includes(e.kind) && e.detail?.trim()
        ) || evidence.find(e => e.detail?.trim().length > 30);
        base.what_we_noticed = bestEvidence?.detail?.trim().slice(0, 120) || `${company.name} is a ${company.industry || 'business'} company`;
        base.why_it_might_matter = 'Their communication surface may benefit from a concise first-impression angle.';
        base.c2moviez_relevance = 'a short video angle that captures the core offer for a first-time visitor';
        return base;
    }

    // Build evidence context (max 4 items, 120 chars each)
    const evidenceLines = evidence
        .filter(e => e.detail?.trim().length > 10)
        .slice(0, 4)
        .map(e => `- ${e.label}: ${e.detail.trim().slice(0, 120)}`)
        .join('\n');

    const prompt = `You are a B2B outreach profiler for c2moviez, a video production company that creates short first-impression video angles for B2B companies. Given raw evidence about a company, produce a prospect-facing outreach profile in JSON.

Company: ${company.name}
Industry: ${company.industry || 'unknown'}
Website: ${company.website || 'unknown'}
Evidence:
${evidenceLines || '- No specific evidence available'}

Return ONLY valid JSON, no explanation, no markdown:
{
  "what_we_noticed": "<One sentence, max 90 chars. What is specifically observable about this company from the outside — their positioning, main service, or visible feature of their communication surface. Second-person framing preferred ('your X describes...'). No geography, no postal codes, no internal notes.>",
  "why_it_might_matter": "<One sentence, max 90 chars. Why the observable thing matters commercially for their potential clients. Prospect-facing only.>",
  "c2moviez_relevance": "<One sentence, max 110 chars. What specific short video angle c2moviez could offer this company. Reference the surface.>",
  "safe_opening_angle": "<The specific surface Fanny is commenting on, max 50 chars. E.g. 'your services page', 'your homepage', 'your LinkedIn intro'.>",
  "claims_to_avoid": ["<thing not in evidence 1>", "<thing not in evidence 2>"]
}`;

    try {
        const response = await deepseekClient.chat.completions.create({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 350,
            temperature: 0.3,
            response_format: { type: 'json_object' },
        });

        const raw = response.choices[0]?.message?.content?.trim();
        if (!raw) throw new Error('empty response');
        const parsed = JSON.parse(raw);

        base.what_we_noticed = (parsed.what_we_noticed || '').slice(0, 120);
        base.why_it_might_matter = (parsed.why_it_might_matter || '').slice(0, 120);
        base.c2moviez_relevance = (parsed.c2moviez_relevance || '').slice(0, 130);
        base.safe_opening_angle = (parsed.safe_opening_angle || bestSurface).slice(0, 60);
        base.claims_to_avoid = Array.isArray(parsed.claims_to_avoid) ? parsed.claims_to_avoid.slice(0, 3) : [];
    } catch {
        // Fallback on any error
        const bestEvidence = evidence.find(e =>
            ['website_about', 'website_about_page', 'zefix_purpose'].includes(e.kind) && e.detail?.trim()
        ) || evidence.find(e => e.detail?.trim().length > 30);
        base.what_we_noticed = bestEvidence?.detail?.trim().slice(0, 100) || `${company.name} has a visible online presence`;
        base.why_it_might_matter = 'Their communication surface may benefit from a short first-impression angle.';
        base.c2moviez_relevance = 'a short video angle that captures the core offer clearly for new visitors';
    }

    return base;
}
```

**STEP 4: Make `generateDrafts()` async and use `compileCompanyProfile()`:**

Change signature to:
```typescript
private async generateDrafts(
    company: Required<ColdLeadCompany>,
    contact: Required<ColdLeadContact>,
    evidence: ColdLeadEvidence[],
    channel: ColdLeadChannel,
    compliance: ColdLeadComplianceRecord,
    confidence: 'high' | 'medium' | 'low'
): Promise<ColdLeadDrafts>
```

Body rewrite — replace the entire current body with:

```typescript
const profile = await this.compileCompanyProfile(company, contact, evidence, confidence);
const companyName = company.name;
const companyNameClean = this.companyNameForSubject(company.name);
const firstName = this.resolveFirstName(contact);
const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

// Subject: "quick thought on {safe_opening_angle}"
const shortSubject = `quick thought on ${profile.safe_opening_angle || companyNameClean}`;

// Intro observation — use what_we_noticed, fallback to company name
const observation = profile.what_we_noticed || `${companyName} has a visible public presence`;

// c2moviez relevance sentence
const relevance = profile.c2moviez_relevance || 'a short first-impression angle may be worth checking';

// Surface reference
const surface = profile.safe_opening_angle || 'that page';

// --- LinkedIn intro (target 250-420 chars) ---
const linkedin_intro = [
    `${greeting} I noticed ${observation}.`,
    `Tiny thought: if ${surface} is part of a first impression for potential clients, ${relevance} may be worth checking.`,
    `I can send the short angle if useful.`
].join(' ');

// --- LinkedIn follow-up ---
const linkedin_followup = [
    `${greeting} quick follow-up on ${companyNameClean}.`,
    `The same detail still stands — I noticed ${observation}.`,
    `If useful, I can send the short angle. If not, I will leave it here.`
].join(' ');

// --- Cold email (target 60-110 words body, not counting subject/signature) ---
const email_cold = compliance.email_allowed && ['email', 'both'].includes(channel)
    ? [
        `Subject: ${shortSubject}`,
        '',
        greeting,
        '',
        `I came across ${companyName}. I noticed ${observation}.`,
        '',
        `Tiny thought: if ${surface} is often someone's first look, ${relevance} may be worth checking before they book or enquire.`,
        '',
        `I can send a short example angle if useful.`,
        '',
        `Best,`,
        `Fanny`,
        `c2moviez`,
        '',
        `If this is not relevant, just reply "no thanks" and I will close the loop.`
    ].join('\n')
    : null;

// --- Email follow-up ---
const email_followup = email_cold
    ? [
        `Subject: Re: ${shortSubject}`,
        '',
        greeting,
        '',
        `Quick follow-up on ${companyNameClean}.`,
        '',
        `The same detail still stands — I noticed ${observation}.`,
        '',
        `If useful, I can send the short angle. If not, I will leave it here.`,
        '',
        `Best,`,
        `Fanny`
    ].join('\n')
    : null;

return { linkedin_intro, linkedin_followup, email_cold, email_followup };
```

**STEP 5: Update all callers of `generateDrafts()` to await it and pass `confidence`:**

Find every call to `generateDrafts(...)` in the file. Each one must:
- Add `await`
- Add `confidence` argument: pass `this.computeSourceConfidence(record).level` or `'medium'` as the 6th argument
- The enclosing function must become `async` if it isn't already

**STEP 6: Update `buildOutreachProfile()` to store the compiled profile:**

After `generateDrafts()` runs (or in `createLead`/`updateLead`), store the compiled profile into `draft_specificity.profile`. The `profile` object returned by `compileCompanyProfile()` should be stored as `draft_specificity.profile`. This may require:
- Making `createLead()` and `updateLead()` async
- Passing the profile through to `validateDraftSpecificity()`

The `draft_specificity.profile.observed_signal` should be set to `profile.what_we_noticed`.
The `draft_specificity.profile.why_it_might_matter` should be set to `profile.why_it_might_matter`.
The `draft_specificity.profile.opening_angle` should be set to `profile.c2moviez_relevance`.

**STEP 7: Delete these methods (they are no longer called):**
- `buildProspectObservation()`
- `buildObservationSentence()`
- `openingAngle()`
- `whySignalMightMatter()`
- `signalSurface()`
- `sentenceStart()` — delete only if not referenced outside the deleted methods
- `lowercaseStart()` — delete only if not referenced outside the deleted methods
- `researchContext()` — already deleted

Do NOT delete:
- `resolveFirstName()` — still used
- `companyNameForSubject()` — still used
- `ensureCompanyMention()` — may be used elsewhere; check before deleting
- `buildOutreachProfile()` — keep but simplify: it should now call `compileCompanyProfile()` and return a profile-shaped object

---

### `backend/src/routes/coldAcquisitionCrmRoutes.ts`

Add new route after the existing `reply` route:

```typescript
api.post('/leads/:id/regenerate-draft', requireAuth, async (req: CrmRequest, res) => {
    const { id } = req.params;
    try {
        const lead = await service.regenerateDraft(id, req.user.id);
        if (!lead) return res.status(404).json({ error: 'LEAD_NOT_FOUND' });
        res.json({ lead });
    } catch (err) {
        res.status(500).json({ error: 'REGENERATE_FAILED' });
    }
});
```

Add `regenerateDraft(leadId: string, userId: string)` to `ColdAcquisitionCrmService` in `coldAcquisitionCrmService.ts`:
- Loads the existing lead record
- Calls `ColdAcquisitionService.regenerateDraftsForLead(lead)`
- Saves updated drafts + profile back to DB
- Returns updated lead

Add `regenerateDraftsForLead(lead: ColdLeadRecord)` to `ColdAcquisitionService`:
- Calls `generateDrafts()` with the lead's existing evidence and company data
- Returns updated `outreach_drafts` and `draft_specificity`

---

### `acquisition/src/AcquisitionApp.tsx`

**1. Update `DossierPanel` to show Company Profile section:**

After the `SOURCE PIPELINE` section, add a `COMPANY PROFILE` section. Only render when `lead.draft_specificity?.profile?.observed_signal` is non-empty:

```tsx
{lead.draft_specificity?.profile?.observed_signal ? (
  <DossierSection title="Company Profile">
    <div className="company-profile-section">
      <p className="profile-observation">{lead.draft_specificity.profile.observed_signal}</p>
      {lead.draft_specificity.profile.why_it_might_matter ? (
        <p className="profile-why">{lead.draft_specificity.profile.why_it_might_matter}</p>
      ) : null}
      {lead.draft_specificity.profile.opening_angle ? (
        <p className="profile-angle"><span className="profile-angle-label">Offer angle:</span> {lead.draft_specificity.profile.opening_angle}</p>
      ) : null}
    </div>
  </DossierSection>
) : null}
```

**2. Add Regenerate button in Draft tab:**

In the Draft tab, after the draft type tabs and before the draft textarea, add:

```tsx
<button
  className="secondary-action regenerate-draft-btn"
  onClick={async () => {
    const result = await api<{ lead: Lead }>(`/acquisition/api/leads/${activeLead.id}/regenerate-draft`, { method: 'POST' });
    if (result) setActiveLead(result.lead);
  }}
  disabled={activeLead.source_pipeline?.confidence?.level === 'low'}
>
  ↻ Regenerate profile
</button>
```

---

### `acquisition/src/acquisition.css`

Add styles for:
- `.company-profile-section` — clean card with soft background, same as existing `.source-pipeline-section`
- `.profile-observation` — slightly larger, darker text
- `.profile-why` — muted secondary text
- `.profile-angle` — accent text with label
- `.profile-angle-label` — uppercase small label
- `.regenerate-draft-btn` — secondary button style, already exists via `.secondary-action`

---

**Constraints:**
- Do NOT modify `evaluateDraftQuality()` or `validateDraftSpecificity()` logic
- Do NOT modify the compliance send gate
- Do NOT add a new DB table
- `generateDrafts()` must gracefully handle DeepSeek API errors — fallback, never crash
- Do NOT touch `.claude/` files, `AGENTS.md`, `CLAUDE.md`
- Do NOT auto-commit; stage only, then stop
- No `backend/node_modules` symlink in git status

---

**Acceptance criteria:**
- [ ] `node _SYSTEM/Scripts/cold-acquisition-crm-ui.test.mjs` passes
- [ ] `npx tsc -p acquisition/tsconfig.json --noEmit` exits 0
- [ ] `PATH=... TS_NODE_TRANSPILE_ONLY=1 node _SYSTEM/Scripts/cold-acquisition-crm-routes.test.mjs` passes
- [ ] `npx vite build --config acquisition/vite.config.mts` exits 0
- [ ] Cold email subject starts with "quick thought on"
- [ ] Cold email body contains "Tiny thought:"
- [ ] Cold email body does NOT contain "One thing that stood out:"
- [ ] Cold email body does NOT contain "the right angle usually comes from here"
- [ ] Cold email body does NOT contain "WKO lists"
- [ ] `POST /acquisition/api/leads/:id/regenerate-draft` returns 200 with updated lead
- [ ] Dossier profile section renders when `observed_signal` is present
- [ ] Regenerate button present in Draft tab

**Test commands:**
```bash
node _SYSTEM/Scripts/cold-acquisition-crm-ui.test.mjs
npx tsc -p acquisition/tsconfig.json --noEmit
PATH="/Users/marcelspatz/YURI-OS-MUSUBI/backend/node_modules/.bin:$PATH" NODE_PATH="/Users/marcelspatz/YURI-OS-MUSUBI/backend/node_modules" TS_NODE_TRANSPILE_ONLY=1 node _SYSTEM/Scripts/cold-acquisition-crm-routes.test.mjs
npx vite build --config acquisition/vite.config.mts
```

**Staging commands (after all tests pass):**
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
- No new npm dependencies (openai is already installed)
