## CODEX TASK SPEC — Slice J: Earned-Authority Cold Outreach Doctrine

**Slice name:** Replace "Tiny thought" templates with 3-sentence direct-question bodies (new doctrine)
**Branch:** `codex/c2moviez-acquisition-crm`
**Workspace:** `/Users/marcelspatz/NUDIMMUD/.codex-worktrees/prism-workbench`

---

**Goal:** Slice I shipped doctrine-violating drafts ("I came across X. Tiny thought: ..."). The new doctrine in `17-coldreach-body-instruction.md` and `18-profiler-prompt-header.md` forbids that style. Rewrite the profiler to generate complete 3-sentence bodies per the new doctrine, and have `generateDrafts()` use them directly.

Current ❌ WRONG output (Slice I):
> "Hi, I came across DBConcepts. I noticed your services page describes Oracle database management for enterprise clients. Tiny thought: if that page is often a first impression for potential clients, a short explainer angle that translates the technical expertise may be worth checking before they enquire."

Target ✅ CORRECT output (new doctrine):
> "Your Oracle services page speaks DBA-to-DBA. But if half your inbound is CFOs looking for 'someone who can handle our legacy mess' — they hit jargon and bounce. One question: would a 90-second explainer video that translates '24/7 Oracle RAC management' into 'your warehouse doesn't go dark at 3am' move more enquiries?"

---

**Read before changing code:**
- `_SYSTEM/campaigns/c2moviez-acquisition-workbench/17-coldreach-body-instruction.md` — full doctrine (CORE DIRECTIVE, STRICT STRUCTURE, PATTERN LIBRARY, FORBIDDEN PATTERNS, COGNITIVE TRIGGERS)
- `_SYSTEM/campaigns/c2moviez-acquisition-workbench/18-profiler-prompt-header.md` — the prompt header to embed in the LLM call
- `backend/src/services/coldAcquisitionService.ts` — `compileCompanyProfile()` (~line 1184), `generateDrafts()` (~line 1095), the existing prompt being replaced

---

**Target files:**

### `backend/src/services/coldAcquisitionService.ts`

**STEP 1 — Extend `CompiledCompanyProfile` interface:**

Add three new fields to the existing interface (currently has `what_we_noticed`, `why_it_might_matter`, `c2moviez_relevance`, `safe_opening_angle`, `claims_to_avoid`):

```typescript
interface CompiledCompanyProfile {
    // ...existing fields...
    subject_line: string;              // NEW — short, specific, no "quick thought on"
    cold_outreach_body: string;        // NEW — full 3-sentence body per new doctrine
    linkedin_body: string;             // NEW — 2-3 sentence variant for LinkedIn
}
```

**STEP 2 — Rewrite the profiler prompt:**

Replace the existing prompt string in `compileCompanyProfile()` with a system+user message pair. The **system message must be the entire contents of `18-profiler-prompt-header.md`** loaded at module-load time via `fs.readFileSync` (path: `_SYSTEM/campaigns/c2moviez-acquisition-workbench/18-profiler-prompt-header.md`).

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOCTRINE_HEADER = (() => {
    try {
        return readFileSync(
            join(process.cwd(), '_SYSTEM/campaigns/c2moviez-acquisition-workbench/18-profiler-prompt-header.md'),
            'utf-8'
        );
    } catch {
        return 'You are a B2B outreach profiler. Generate 3-sentence bodies, end with a direct question, max 60 words, no hedging.';
    }
})();
```

User message structure:

```
Company: ${company.name}
Industry: ${company.industry || 'unknown'}
Website: ${company.website || 'unknown'}
Market: ${company.country === 'AT' ? 'Austria' : 'Switzerland'} (${company.city || 'unknown city'})
Evidence (most important first):
${evidenceLines}

c2moviez offers: short first-impression video angles for B2B companies — explainer videos, testimonial vignettes, behind-the-scenes, case-study reels. The goal is to help the target company convert more inbound by improving their visible communication surface.

Generate the outreach profile. Return ONLY valid JSON, no markdown fences, no commentary:

{
  "what_we_noticed": "<analytical, 3rd person, max 100 chars — what you observed about the company for Dossier display>",
  "why_it_might_matter": "<analytical, max 100 chars — the hidden cost or gap, for Dossier display>",
  "c2moviez_relevance": "<analytical, max 120 chars — what specific c2moviez angle could help, for Dossier display>",
  "safe_opening_angle": "<the specific surface, max 50 chars, e.g. 'your services page'>",
  "subject_line": "<4-7 words, specific to the observation, NO 'quick thought on', NO 'about' — e.g. 'your DBA-to-DBA copy' or '847 words, zero visuals'>",
  "cold_outreach_body": "<EXACTLY 3 sentences. ≤60 words total. S1: specificity anchor (concrete observation from evidence). S2: gap reframe with consequence. S3: direct question ending with '?'. Second-person POV. Earned-authority voice. NO 'I came across', 'Tiny thought', 'may be worth', 'perhaps', 'hope this', 'I'd love to chat'. Follow the doctrine PATTERN LIBRARY examples in the system message.>",
  "linkedin_body": "<2-3 sentences, ≤55 words. Same doctrine. Slightly more conversational. End with direct question.>",
  "claims_to_avoid": ["<phrase 1 not in evidence>", "<phrase 2>"]
}
```

Set the chat completion options:
- `model: 'deepseek-chat'`
- `messages: [{ role: 'system', content: DOCTRINE_HEADER }, { role: 'user', content: userMessage }]`
- `max_tokens: 700` (increased from 350 for the body output)
- `temperature: 0.4` (slight bump for voice variety)
- `response_format: { type: 'json_object' }`

**STEP 3 — Doctrine validator:**

Add a private method `validateDoctrineCompliance(body: string): { passed: boolean; reason: string }`:

```typescript
private validateDoctrineCompliance(body: string): { passed: boolean; reason: string } {
    if (!body || body.trim().length === 0) return { passed: false, reason: 'empty body' };

    const forbidden = [
        /I came across/i,
        /I was looking at/i,
        /Tiny thought/i,
        /Quick idea/i,
        /Just wondering/i,
        /may be worth/i,
        /might help/i,
        /\bperhaps\b/i,
        /I'd love to chat/i,
        /let me know if interested/i,
        /hope this/i,
        /no pressure/i,
    ];

    for (const pattern of forbidden) {
        if (pattern.test(body)) {
            return { passed: false, reason: `forbidden phrase: ${pattern.source}` };
        }
    }

    const wordCount = body.trim().split(/\s+/).length;
    if (wordCount > 70) return { passed: false, reason: `too long: ${wordCount} words` };
    if (wordCount < 20) return { passed: false, reason: `too short: ${wordCount} words` };

    if (!/\?\s*$/.test(body.trim())) return { passed: false, reason: 'must end with a question mark' };

    return { passed: true, reason: '' };
}
```

**STEP 4 — Update fallback when DeepSeek unavailable:**

In `compileCompanyProfile()`, when `deepseekClient` is null or the call fails:
- `cold_outreach_body = ''` (empty — NO template-generated body)
- `linkedin_body = ''`
- `subject_line = ''` (will fall back to `companyNameClean` in generateDrafts)
- Other analytical fields stay populated as before (deterministic from evidence)

**STEP 5 — Validate generated body, retry once if non-compliant:**

After parsing the JSON response in `compileCompanyProfile()`, run `validateDoctrineCompliance(parsed.cold_outreach_body)`. If `passed === false`:
- Log the reason to console.error
- Make ONE retry call with the same prompt plus an appended note: `"\n\nYour previous attempt FAILED: ${reason}. Regenerate strictly following the doctrine."`
- If retry also fails, set `cold_outreach_body = ''` and leave it empty (UI will show "needs review" state)

Same for `linkedin_body` validation.

**STEP 6 — Rewrite `generateDrafts()` to use the new body fields:**

Replace the existing template-interpolation body. New structure:

```typescript
private async generateDrafts(
    company: Required<ColdLeadCompany>,
    contact: Required<ColdLeadContact>,
    evidence: ColdLeadEvidence[],
    channel: ColdLeadChannel,
    compliance: ColdLeadComplianceRecord,
    confidence: 'high' | 'medium' | 'low'
): Promise<ColdLeadDrafts> {
    const profile = await this.compileCompanyProfile(company, contact, evidence, confidence);
    const companyName = company.name;
    const companyNameClean = this.companyNameForSubject(company.name);
    const firstName = this.resolveFirstName(contact);
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

    const subjectLine = profile.subject_line || companyNameClean;
    const coldBody = profile.cold_outreach_body || '';
    const liBody = profile.linkedin_body || '';

    // --- LinkedIn intro ---
    const linkedin_intro = liBody
        ? `${greeting} ${liBody}`
        : '';

    // --- LinkedIn follow-up — keep the question from the original body ---
    const liQuestion = (liBody.match(/[^.!?]*\?$/) || [''])[0].trim();
    const linkedin_followup = liBody
        ? `${greeting} following up on ${companyNameClean} — ${liQuestion || 'still curious if this is worth a quick look.'}`
        : '';

    // --- Cold email ---
    const email_cold = (compliance.email_allowed && ['email', 'both'].includes(channel) && coldBody)
        ? [
            `Subject: ${subjectLine}`,
            '',
            greeting,
            '',
            coldBody,
            '',
            `Best,`,
            `Fanny`,
            `c2moviez`,
        ].join('\n')
        : null;

    // --- Email follow-up — re-pose the question from the original body ---
    const emailQuestion = (coldBody.match(/[^.!?]*\?$/) || [''])[0].trim();
    const email_followup = email_cold
        ? [
            `Subject: Re: ${subjectLine}`,
            '',
            greeting,
            '',
            `Following up on ${companyName}. ${emailQuestion || 'Still worth a look — happy to ship the example if so.'}`,
            '',
            `Best,`,
            `Fanny`,
        ].join('\n')
        : null;

    return { linkedin_intro, linkedin_followup, email_cold, email_followup };
}
```

**STEP 7 — Wire validation reason into draft_specificity:**

After `generateDrafts()` returns, if `email_cold === null` or empty due to validation failure, set `draft_specificity.readiness = 'draft_review'` and add to `draft_specificity.warnings`: `'doctrine_compliance_failed'`. Do NOT block the user from copying — show an amber chip.

---

**Constraints:**
- Do NOT modify `evaluateDraftQuality()` (Slice B's flag system)
- Do NOT modify `validateDraftSpecificity()` core logic — just add the new warning
- Do NOT break the deterministic fallback (no key → empty body, not crash)
- Do NOT add new npm dependencies
- Do NOT touch `.claude/`, `AGENTS.md`, `CLAUDE.md`
- Do NOT auto-commit; stage only, then stop
- No `backend/node_modules` symlink in git status

---

**Acceptance criteria:**
- [ ] `node Scripts/cold-acquisition-crm-ui.test.mjs` passes
- [ ] `npx tsc -p acquisition/tsconfig.json --noEmit` exits 0
- [ ] `PATH=... TS_NODE_TRANSPILE_ONLY=1 node Scripts/cold-acquisition-crm-routes.test.mjs` passes
- [ ] `npx vite build --config acquisition/vite.config.mts` exits 0
- [ ] `validateDoctrineCompliance("Your X does Y. But Z. Would you A?")` returns `{ passed: true }`
- [ ] `validateDoctrineCompliance("Hi, I came across X. Tiny thought: ...")` returns `{ passed: false, reason: ... }`
- [ ] When `DEEPSEEK_API_KEY` is unset, `cold_outreach_body` is empty string (no crash, no template body)
- [ ] No source code in `coldAcquisitionService.ts` contains the literal strings "Tiny thought" or "I came across" except inside `validateDoctrineCompliance()`

**Test commands:**
```bash
node Scripts/cold-acquisition-crm-ui.test.mjs
npx tsc -p acquisition/tsconfig.json --noEmit
PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules/.bin:$PATH" NODE_PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules" TS_NODE_TRANSPILE_ONLY=1 node Scripts/cold-acquisition-crm-routes.test.mjs
npx vite build --config acquisition/vite.config.mts
```

**Staging commands:**
```bash
git add \
  backend/src/services/coldAcquisitionService.ts \
  backend/public/acquisition/assets/ \
  backend/public/acquisition/index.html \
  Scripts/cold-acquisition-crm-routes.test.mjs \
  Scripts/cold-acquisition-crm-ui.test.mjs
```

**Rollback boundary:** `git restore --staged .`

**Prohibited:**
- No auto-commit
- No git push
- No `git add .` or `git add -A`
- No new npm dependencies
