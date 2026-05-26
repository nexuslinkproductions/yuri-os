## CODEX TASK SPEC — Slice J Test Compatibility Fix

**Slice name:** Update `cold-acquisition-crm-routes.test.mjs` to work with the new doctrine behavior (empty drafts when DEEPSEEK_API_KEY absent)
**Branch:** main
**Workspace:** `/Users/marcelspatz/NUDIMMUD`

---

**Context:** Slice J shipped the new doctrine-driven profiler. When `DEEPSEEK_API_KEY` is unset (as in test runs), `cold_outreach_body` and `linkedin_body` are empty strings, and `draft_specificity.readiness` becomes `'draft_review'`. The existing test `Scripts/cold-acquisition-crm-routes.test.mjs` was written assuming drafts come out populated and ready — many of its assertions now fail.

Run the test to see the failures, then patch the test (NOT the service) to handle the new behavior. The service is correct; the test needs to be updated.

---

**Goal:** Make `Scripts/cold-acquisition-crm-routes.test.mjs` pass without changing the service. Do NOT regenerate template-based bodies — the empty-fallback is the correct behavior.

---

**Approach — minimal edits, not a rewrite:**

For each created lead that the test later expects to be in `'ready'` view or have draft content, **PATCH the lead with a doctrine-compliant draft right after creation**. Helper to add at the top of the test:

```javascript
function doctrineDrafts(opts) {
  // Build minimal doctrine-compliant drafts for tests
  const greeting = opts.greeting || 'Hi,';
  const first = opts.first || 'Your services page describes specialist B2B work.';
  const second = opts.second || 'But generic positioning loses the buyer in 30 seconds.';
  const third = opts.third || 'Would a 60-second clarifier video pull more enquiries?';
  const body = `${first} ${second} ${third}`;
  return {
    linkedin_intro: `${greeting} ${body}`,
    linkedin_followup: `${greeting} following up — ${third}`,
    email_cold: `Subject: ${opts.subject || 'your positioning'}\n\n${greeting}\n\n${body}\n\nBest,\nFanny\nc2moviez`,
    email_followup: `Subject: Re: ${opts.subject || 'your positioning'}\n\n${greeting}\n\nFollowing up. ${third}\n\nBest,\nFanny`
  };
}
```

For each lead created via `POST /api/cold-acquisition/leads` that the test later expects to be in `'ready'` view, follow up with:

```javascript
await request('PATCH', `/acquisition/api/leads/${leadId}`, {
  status: 'ready',
  crm_stage: 'ready',
  outreach_drafts: doctrineDrafts({ subject: '...', greeting: 'Hi <name>,', first: '...', second: '...', third: '... ?' })
}, { cookie: fannyCookie });
```

Then continue with the existing assertions.

**Critical: DO NOT modify these existing assertions** (they must still pass):
- Line ~228: `assert.ok(mission.json.mission.needs_research.length <= mission.json.mission.counts.needs_research, ...)` — this assertion was a regression in the prior Codex attempt. Make sure your fix doesn't break it.

**For leads that the test does NOT later expect to be in `'ready'`** (e.g. thin-evidence, blocked, low-confidence leads): don't patch them. Their state should remain as the service computes it.

**Run the test, identify each failing assertion, and add the minimum PATCH needed to make it pass without changing the test's intent.**

---

**Constraints:**
- Do NOT modify `backend/src/services/coldAcquisitionService.ts` — it is correct as-is
- Do NOT change the `outreach_drafts` keys or `crm_stage` values used by existing assertions
- Do NOT add new assertions; preserve all existing test expectations
- The test must still verify the doctrine-compliance behavior (drafts are empty when no key, lead patches work)
- Do NOT auto-commit
- No `git add`, no commits

---

**Acceptance:**
- [ ] `PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules/.bin:$PATH" NODE_PATH="/Users/marcelspatz/NUDIMMUD/backend/node_modules" TS_NODE_TRANSPILE_ONLY=1 node Scripts/cold-acquisition-crm-routes.test.mjs` -> pass
- [ ] `node Scripts/cold-acquisition-crm-ui.test.mjs` -> pass
- [ ] All existing assertion messages still present (no removals)
- [ ] The needs_research length-vs-count assertion at line ~228 passes
